import os
import sys

# Configure UTF-8 for Windows console output to support emojis
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import json
import re
import time
import queue
import threading
import subprocess
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT = 3456

# Determine root directory (handles PyInstaller bundle)
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    APP_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    APP_DIR = BUNDLE_DIR

PUBLIC_DIR = os.path.join(BUNDLE_DIR, 'public')
DEFAULT_TARGET_DIR = os.path.join(APP_DIR, 'downloaded_repos')
if not os.path.exists(DEFAULT_TARGET_DIR):
    try:
        os.makedirs(DEFAULT_TARGET_DIR, exist_ok=True)
    except Exception:
        pass

# SSE Event Queues
CLIENT_QUEUES = []
CLIENT_LOCK = threading.Lock()

def broadcast_event(event_dict):
    msg = f"data: {json.dumps(event_dict, ensure_ascii=False)}\n\n"
    with CLIENT_LOCK:
        for q in list(CLIENT_QUEUES):
            try:
                q.put_nowait(msg)
            except Exception:
                pass

def extract_github_urls(raw_text):
    if not raw_text:
        return []
    regex = re.compile(r'https?://github\.com/([a-zA-Z0-9_\.\-]+)/([^\s"\'<>,;()[\]]+)', re.IGNORECASE)
    results = []
    seen = set()
    reserved = {'features', 'topics', 'trending', 'collections', 'events', 'explore', 'orgs', 'users'}

    for match in regex.finditer(raw_text):
        owner = match.group(1).strip().rstrip('.,/?:;!>]\'"')
        repo_path = match.group(2).strip()
        repo_path = re.split(r'[#\?]', repo_path)[0]
        repo_name = repo_path.split('/')[0].rstrip('.,/?:;!>]\'"')

        if repo_name.lower().endswith('.git'):
            repo_name = repo_name[:-4]

        if not owner or not repo_name or owner.lower() in reserved:
            continue

        clean_git_url = f"https://github.com/{owner}/{repo_name}.git"
        clean_web_url = f"https://github.com/{owner}/{repo_name}"
        key = clean_git_url.lower()
        is_dup = key in seen
        seen.add(key)

        results.append({
            "originalMatch": match.group(0),
            "owner": owner,
            "repoName": repo_name,
            "cloneUrl": clean_git_url,
            "webUrl": clean_web_url,
            "isDuplicateInInput": is_dup
        })
    return results

def resolve_folder_names(repos, target_base_path):
    claimed = set()
    def exists_on_disk(name):
        if not target_base_path:
            return False
        return os.path.exists(os.path.join(target_base_path, name))

    resolved = []
    for idx, item in enumerate(repos, 1):
        base_name = item['repoName']
        target_name = base_name
        collision_reason = None

        name_lower = target_name.lower()
        in_batch = name_lower in claimed
        on_disk = exists_on_disk(target_name)

        if in_batch or on_disk:
            target_name = f"{base_name}-{item['owner']}"
            collision_reason = 'Duplicate repo name in input batch' if in_batch else 'Folder already exists in target path'
            counter = 2
            while target_name.lower() in claimed or exists_on_disk(target_name):
                target_name = f"{base_name}-{item['owner']}-{counter}"
                counter += 1

        claimed.add(target_name.lower())
        resolved.append({
            "index": idx,
            "owner": item['owner'],
            "repoName": item['repoName'],
            "cloneUrl": item['cloneUrl'],
            "webUrl": item['webUrl'],
            "targetFolder": target_name,
            "originalName": base_name,
            "hasCollision": target_name != base_name,
            "collisionReason": collision_reason
        })
    return resolved

def diagnose_git_error(raw_log, exit_code):
    log = raw_log or ""
    if re.search(r'repository\s+.*not found', log, re.I) or re.search(r'remote:\s*Repository not found', log, re.I):
        return {
            "en": "Repository not found or private (404). Please verify repository URL or access rights.",
            "vi": "Không tìm thấy repository hoặc là repo riêng tư (404). Vui lòng kiểm tra lại URL hoặc quyền truy cập."
        }
    if re.search(r'Authentication failed', log, re.I) or re.search(r'Permission to .* denied', log, re.I) or re.search(r'Permission denied', log, re.I):
        return {
            "en": "Authentication failed. Please check your GitHub credentials or SSH keys.",
            "vi": "Xác thực thất bại. Vui lòng kiểm tra tài khoản GitHub hoặc khóa SSH."
        }
    if re.search(r'Could not resolve host', log, re.I) or re.search(r'Failed to connect', log, re.I) or re.search(r'Connection timed out', log, re.I):
        return {
            "en": "Network connection failed or timed out. Please check your internet connection.",
            "vi": "Lỗi kết nối mạng hoặc hết thời gian chờ. Vui lòng kiểm tra kết nối Internet."
        }
    if re.search(r'already exists and is not an empty directory', log, re.I):
        return {
            "en": "Destination folder already exists and is not empty.",
            "vi": "Thư mục đích đã tồn tại và không rỗng."
        }
    return {
        "en": f"Git clone failed with code {exit_code}. Check detailed logs below.",
        "vi": f"Git clone thất bại với mã lỗi {exit_code}. Xem chi tiết log bên dưới."
    }

def parse_git_progress(line):
    percent_match = re.search(r'(\d+)%', line)
    percent = int(percent_match.group(1)) if percent_match else None

    stage = 'Cloning...'
    if 'Counting objects' in line: stage = 'Counting objects'
    elif 'Compressing objects' in line: stage = 'Compressing objects'
    elif 'Receiving objects' in line: stage = 'Receiving objects'
    elif 'Resolving deltas' in line: stage = 'Resolving deltas'
    elif 'Updating files' in line: stage = 'Updating files'
    elif 'Cloning into' in line: stage = 'Initializing...'
    elif 'done.' in line: stage = 'Finalizing...'

    speed_match = re.search(r'([\d\.]+\s*[KMGT]?iB/s)', line)
    speed = speed_match.group(1) if speed_match else None

    return stage, percent, speed

class BatchCloneWorker:
    def __init__(self, repos, base_dir, concurrency=3, shallow=False):
        self.repos = repos
        self.base_dir = base_dir
        self.concurrency = max(1, min(10, concurrency))
        self.shallow = shallow
        self.is_cancelled = False
        self.active_procs = {}
        self.lock = threading.Lock()

        self.total = len(repos)
        self.completed_count = 0
        self.success_count = 0
        self.fail_count = 0
        self.results = []
        self.start_time = None

    def start(self):
        os.makedirs(self.base_dir, exist_ok=True)
        self.start_time = time.time()

        broadcast_event({
            "type": "batch_start",
            "total": self.total,
            "concurrency": self.concurrency,
            "shallow": self.shallow,
            "baseDir": self.base_dir
        })

        if self.total == 0:
            self.finish()
            return

        q = queue.Queue()
        for item in self.repos:
            q.put(item)

        def worker():
            while not self.is_cancelled:
                try:
                    item = q.get_nowait()
                except queue.Empty:
                    break

                self.clone_repo(item)
                q.task_done()

                with self.lock:
                    self.completed_count += 1
                    completed = self.completed_count
                    succ = self.success_count
                    fail = self.fail_count

                percent = int((completed / self.total) * 100)
                broadcast_event({
                    "type": "overall_progress",
                    "completed": completed,
                    "total": self.total,
                    "percent": percent,
                    "activeCount": len(self.active_procs),
                    "succeeded": succ,
                    "failed": fail
                })

            if q.empty() and not self.is_cancelled:
                with self.lock:
                    if self.completed_count == self.total:
                        self.finish()

        threads = []
        for _ in range(min(self.concurrency, self.total)):
            t = threading.Thread(target=worker, daemon=True)
            t.start()
            threads.append(t)

    def clone_repo(self, item):
        repo_start_time = time.time()
        idx = item['index']
        target_path = os.path.join(self.base_dir, item['targetFolder'])

        broadcast_event({
            "type": "repo_start",
            "index": idx,
            "owner": item['owner'],
            "repoName": item['repoName'],
            "targetFolder": item['targetFolder'],
            "cloneUrl": item['cloneUrl'],
            "hasCollision": item['hasCollision']
        })

        cmd = ['git', 'clone', '--progress']
        if self.shallow:
            cmd.extend(['--depth', '1'])
        cmd.extend([item['cloneUrl'], item['targetFolder']])

        raw_logs = []
        last_percent = 0
        last_stage = 'Starting...'

        env = os.environ.copy()
        env['GIT_TERMINAL_PROMPT'] = '0'
        env['GIT_ASKPASS'] = ''
        env['GCM_INTERACTIVE'] = 'never'

        try:
            proc = subprocess.Popen(
                cmd,
                cwd=self.base_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=env,
                bufsize=1
            )
            with self.lock:
                self.active_procs[idx] = proc

            # Read stderr line-by-line (git uses \r for progress)
            while True:
                line = proc.stderr.readline()
                if not line and proc.poll() is not None:
                    break
                if line:
                    raw_logs.append(line)
                    sublines = re.split(r'[\r\n]+', line)
                    for sub in sublines:
                        if not sub.strip():
                            continue
                        stage, percent, speed = parse_git_progress(sub)
                        if percent is not None:
                            last_percent = percent
                        if stage:
                            last_stage = stage
                        broadcast_event({
                            "type": "repo_progress",
                            "index": idx,
                            "stage": last_stage,
                            "percent": last_percent,
                            "speed": speed,
                            "rawLine": sub.strip()
                        })

            proc.wait()
            code = proc.returncode
        except Exception as e:
            code = 1
            raw_logs.append(str(e))

        with self.lock:
            self.active_procs.pop(idx, None)

        duration_ms = int((time.time() - repo_start_time) * 1000)
        all_logs = "".join(raw_logs)

        if code == 0:
            with self.lock:
                self.success_count += 1
            result = {
                "index": idx,
                "item": item,
                "status": "success",
                "durationMs": duration_ms,
                "targetPath": target_path,
                "rawLogs": all_logs
            }
            with self.lock:
                self.results.append(result)
            broadcast_event({"type": "repo_success", **result})
        else:
            with self.lock:
                self.fail_count += 1
            diag = diagnose_git_error(all_logs, code)

            # Cleanup empty directory if left behind on failure
            try:
                if os.path.exists(target_path) and len(os.listdir(target_path)) == 0:
                    os.rmdir(target_path)
            except Exception:
                pass

            result = {
                "index": idx,
                "item": item,
                "status": "failed",
                "exitCode": code,
                "durationMs": duration_ms,
                "error": diag,
                "rawLogs": all_logs
            }
            with self.lock:
                self.results.append(result)
            broadcast_event({"type": "repo_failed", **result})

    def cancel(self):
        self.is_cancelled = True
        with self.lock:
            for proc in self.active_procs.values():
                try:
                    proc.terminate()
                except Exception:
                    pass
            self.active_procs.clear()

        broadcast_event({
            "type": "batch_cancelled",
            "completedCount": self.completed_count,
            "succeeded": self.success_count,
            "failed": self.fail_count,
            "total": self.total
        })

    def finish(self):
        duration_ms = int((time.time() - self.start_time) * 1000) if self.start_time else 0
        broadcast_event({
            "type": "batch_complete",
            "total": self.total,
            "succeeded": self.success_count,
            "failed": self.fail_count,
            "durationMs": duration_ms,
            "results": self.results
        })

CURRENT_WORKER = None

class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/events':
            # Server-Sent Events (SSE) stream
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            q = queue.Queue()
            with CLIENT_LOCK:
                CLIENT_QUEUES.append(q)

            try:
                # Send initial connection event
                init_msg = f"data: {json.dumps({'type': 'connected'})}\n\n"
                self.wfile.write(init_msg.encode('utf-8'))
                self.wfile.flush()

                while True:
                    msg = q.get()
                    self.wfile.write(msg.encode('utf-8'))
                    self.wfile.flush()
            except (ConnectionResetError, BrokenPipeError):
                pass
            finally:
                with CLIENT_LOCK:
                    if q in CLIENT_QUEUES:
                        CLIENT_QUEUES.remove(q)
            return

        elif path == '/api/presets':
            user_profile = os.environ.get('USERPROFILE', '')
            data = {
                "defaultPath": DEFAULT_TARGET_DIR,
                "desktop": os.path.join(user_profile, 'Desktop') if user_profile else '',
                "downloads": os.path.join(user_profile, 'Downloads') if user_profile else '',
                "workspace": APP_DIR
            }
            self.send_json(data)
            return

        elif path == '/api/browse-folder':
            selected_path = self.browse_folder_windows()
            self.send_json({"success": bool(selected_path), "path": selected_path})
            return

        # Fallback to static files
        super().do_GET()

    def do_POST(self):
        global CURRENT_WORKER
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()

        if path == '/api/parse-urls':
            text = body.get('text', '')
            target_folder = body.get('targetFolder', '')
            eff_folder = os.path.abspath(target_folder) if target_folder.strip() else DEFAULT_TARGET_DIR
            extracted = extract_github_urls(text)
            resolved = resolve_folder_names(extracted, eff_folder)
            collisions = sum(1 for r in resolved if r['hasCollision'])

            self.send_json({
                "success": True,
                "totalCount": len(resolved),
                "collisionCount": collisions,
                "targetFolder": eff_folder,
                "repos": resolved
            })
            return

        elif path == '/api/validate-folder':
            folder_path = body.get('folderPath', '')
            if not folder_path or not folder_path.strip():
                self.send_json({
                    "valid": True,
                    "path": DEFAULT_TARGET_DIR,
                    "exists": True,
                    "isDefault": True
                })
                return

            res_path = os.path.abspath(folder_path.strip())
            exists = os.path.exists(res_path)
            is_dir = os.path.isdir(res_path) if exists else False
            existing_count = len(os.listdir(res_path)) if is_dir else 0

            self.send_json({
                "valid": True,
                "path": res_path,
                "exists": exists,
                "isDirectory": is_dir,
                "existingCount": existing_count
            })
            return

        elif path == '/api/open-folder':
            folder_path = body.get('folderPath', '')
            target = os.path.abspath(folder_path) if folder_path.strip() else DEFAULT_TARGET_DIR
            os.makedirs(target, exist_ok=True)
            subprocess.Popen(f'explorer.exe "{target}"', shell=True)
            self.send_json({"success": True, "path": target})
            return

        elif path == '/api/start-batch':
            repos = body.get('repos', [])
            target_folder = body.get('targetFolder', '')
            eff_base = os.path.abspath(target_folder) if target_folder.strip() else DEFAULT_TARGET_DIR
            concurrency = int(body.get('concurrency', 3))
            shallow = bool(body.get('shallow', False))

            verified_repos = resolve_folder_names(repos, eff_base)
            CURRENT_WORKER = BatchCloneWorker(verified_repos, eff_base, concurrency=concurrency, shallow=shallow)
            threading.Thread(target=CURRENT_WORKER.start, daemon=True).start()

            self.send_json({
                "success": True,
                "message": "Batch clone started",
                "total": len(verified_repos),
                "targetFolder": eff_base,
                "concurrency": concurrency,
                "shallow": shallow
            })
            return

        elif path == '/api/cancel-batch':
            if CURRENT_WORKER:
                CURRENT_WORKER.cancel()
            self.send_json({"success": True, "message": "Batch clone cancelled"})
            return

        self.send_error(404, "Endpoint not found")

    def read_json_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length > 0:
            raw = self.rfile.read(length).decode('utf-8')
            try:
                return json.loads(raw)
            except Exception:
                return {}
        return {}

    def send_json(self, data, status=200):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)

    def browse_folder_windows(self):
        ps_code = """
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Destination Folder"
$dialog.ShowNewFolderButton = $true
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$topForm.MinimizeBox = $false
$topForm.MaximizeBox = $false
$topForm.ShowInTaskbar = $false
$topForm.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$topForm.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
$result = $dialog.ShowDialog($topForm)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}
$topForm.Dispose()
$dialog.Dispose()
"""
        try:
            proc = subprocess.run(
                ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps_code],
                capture_output=True,
                text=True,
                timeout=120
            )
            return proc.stdout.strip()
        except Exception:
            return ""

def run_server():
    server = ThreadingHTTPServer(('127.0.0.1', PORT), AppRequestHandler)
    print("=" * 60)
    print("🚀 GitHub Multi-Repo Batch Cloner (Standalone .EXE)")
    print(f"📡 Web Interface: http://localhost:{PORT}")
    print(f"📁 Default Folder: {DEFAULT_TARGET_DIR}")
    print("=" * 60)

    # Automatically launch browser
    def open_browser():
        time.sleep(1.0)
        webbrowser.open(f"http://localhost:{PORT}")

    threading.Thread(target=open_browser, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()

if __name__ == '__main__':
    run_server()
