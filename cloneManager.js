const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Parses git clone progress lines from stderr
 */
function parseGitProgress(line) {
  // Common git progress patterns:
  // "Receiving objects:  45% (120/266), 48.00 KiB | 96.00 KiB/s"
  // "Resolving deltas:  80% (80/100)"
  // "Compressing objects: 100% (25/25), done."
  // "Counting objects: 100% (25/25), done."
  // "Updating files:  90% (90/100)"

  const percentMatch = line.match(/(\d+)%/);
  const percent = percentMatch ? parseInt(percentMatch[1], 10) : null;

  let stage = 'Cloning...';
  if (line.includes('Counting objects')) stage = 'Counting objects';
  else if (line.includes('Compressing objects')) stage = 'Compressing objects';
  else if (line.includes('Receiving objects')) stage = 'Receiving objects';
  else if (line.includes('Resolving deltas')) stage = 'Resolving deltas';
  else if (line.includes('Updating files')) stage = 'Updating files';
  else if (line.includes('Cloning into')) stage = 'Initializing...';
  else if (line.includes('done.')) stage = 'Finalizing...';

  // Extract speed if present (e.g. 1.25 MiB/s)
  const speedMatch = line.match(/([\d\.]+\s*[KMGT]?iB\/s)/);
  const speed = speedMatch ? speedMatch[1] : null;

  return {
    stage,
    percent,
    speed,
    raw: line.trim()
  };
}

/**
 * Diagnoses git error messages into user-friendly Vietnamese and English explanations
 */
function diagnoseGitError(rawLog, exitCode) {
  const log = rawLog || '';
  if (/repository\s+.*not found/i.test(log) || /remote:\s*Repository not found/i.test(log)) {
    return {
      en: 'Repository not found or private (404). Please verify repository URL or access rights.',
      vi: 'Không tìm thấy repository hoặc là repo riêng tư (404). Vui lòng kiểm tra lại URL hoặc quyền truy cập.'
    };
  }
  if (/Authentication failed/i.test(log) || /Permission to .* denied/i.test(log) || /Permission denied/i.test(log)) {
    return {
      en: 'Authentication failed. Please check your GitHub credentials or SSH keys.',
      vi: 'Xác thực thất bại. Vui lòng kiểm tra tài khoản GitHub hoặc khóa SSH.'
    };
  }
  if (/Could not resolve host/i.test(log) || /Failed to connect/i.test(log) || /Connection timed out/i.test(log)) {
    return {
      en: 'Network connection failed or timed out. Please check your internet connection.',
      vi: 'Lỗi kết nối mạng hoặc hết thời gian chờ. Vui lòng kiểm tra kết nối Internet.'
    };
  }
  if (/already exists and is not an empty directory/i.test(log)) {
    return {
      en: 'Destination folder already exists and is not empty.',
      vi: 'Thư mục đích đã tồn tại và không rỗng.'
    };
  }
  if (/Filename too long/i.test(log)) {
    return {
      en: 'Path name too long. Consider cloning into a shorter path or enable git longpaths.',
      vi: 'Đường dẫn quá dài. Hãy thử clone vào thư mục ngắn hơn hoặc bật git longpaths.'
    };
  }

  return {
    en: `Git clone failed with code ${exitCode}. Check detailed logs below.`,
    vi: `Git clone thất bại với mã lỗi ${exitCode}. Xem chi tiết log bên dưới.`
  };
}

class BatchCloneManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.concurrency = options.concurrency || 3;
    this.shallow = options.shallow || false; // --depth 1
    this.onEvent = options.onEvent || (() => {});

    this.queue = [];
    this.activeWorkers = 0;
    this.activeProcesses = new Map(); // index -> childProcess
    this.isCancelled = false;
    this.isCompleted = false;

    this.total = 0;
    this.completedCount = 0;
    this.successCount = 0;
    this.failCount = 0;
    this.startTime = null;
    this.results = [];
  }

  start(repos) {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }

    this.queue = [...repos];
    this.total = repos.length;
    this.completedCount = 0;
    this.successCount = 0;
    this.failCount = 0;
    this.results = [];
    this.startTime = Date.now();
    this.isCancelled = false;
    this.isCompleted = false;

    this.emitEvent('batch_start', {
      total: this.total,
      concurrency: this.concurrency,
      shallow: this.shallow,
      baseDir: this.baseDir
    });

    if (this.total === 0) {
      this.finishBatch();
      return;
    }

    // Launch initial workers up to concurrency limit
    const initialWorkers = Math.min(this.concurrency, this.queue.length);
    for (let i = 0; i < initialWorkers; i++) {
      this.processNext();
    }
  }

  processNext() {
    if (this.isCancelled) return;

    if (this.queue.length === 0) {
      if (this.activeWorkers === 0 && !this.isCompleted) {
        this.finishBatch();
      }
      return;
    }

    if (this.activeWorkers >= this.concurrency) {
      return;
    }

    const item = this.queue.shift();
    this.activeWorkers++;

    this.cloneSingleRepo(item).finally(() => {
      this.activeWorkers--;
      this.completedCount++;

      this.emitEvent('overall_progress', {
        completed: this.completedCount,
        total: this.total,
        percent: Math.round((this.completedCount / this.total) * 100),
        activeCount: this.activeWorkers,
        succeeded: this.successCount,
        failed: this.failCount
      });

      this.processNext();
    });
  }

  cloneSingleRepo(item) {
    return new Promise((resolve) => {
      const repoStartTime = Date.now();
      const targetFolderPath = path.join(this.baseDir, item.targetFolder);

      this.emitEvent('repo_start', {
        index: item.index,
        owner: item.owner,
        repoName: item.repoName,
        targetFolder: item.targetFolder,
        cloneUrl: item.cloneUrl,
        hasCollision: item.hasCollision
      });

      const gitArgs = ['clone', '--progress'];
      if (this.shallow) {
        gitArgs.push('--depth', '1');
      }
      gitArgs.push(item.cloneUrl, item.targetFolder);

      let rawLogs = '';
      let lastPercent = 0;
      let lastStage = 'Starting...';

      const child = spawn('git', gitArgs, {
        cwd: this.baseDir,
        shell: false,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: '',
          GCM_INTERACTIVE: 'never'
        }
      });

      this.activeProcesses.set(item.index, child);

      const handleChunk = (chunk) => {
        const text = chunk.toString();
        rawLogs += text;

        // Split by carriage return or newline as git updates progress with \r
        const lines = text.split(/[\r\n]+/);
        for (const line of lines) {
          if (!line.trim()) continue;
          const prog = parseGitProgress(line);
          if (prog.percent !== null) {
            lastPercent = prog.percent;
          }
          if (prog.stage) {
            lastStage = prog.stage;
          }

          this.emitEvent('repo_progress', {
            index: item.index,
            stage: lastStage,
            percent: lastPercent,
            speed: prog.speed,
            rawLine: line.trim()
          });
        }
      };

      if (child.stderr) child.stderr.on('data', handleChunk);
      if (child.stdout) child.stdout.on('data', handleChunk);

      child.on('error', (err) => {
        const durationMs = Date.now() - repoStartTime;
        this.activeProcesses.delete(item.index);
        this.failCount++;

        const result = {
          index: item.index,
          item,
          status: 'failed',
          durationMs,
          error: {
            en: `Failed to spawn git process: ${err.message}`,
            vi: `Không thể khởi chạy tiến trình git: ${err.message}`
          },
          rawLogs
        };
        this.results.push(result);

        this.emitEvent('repo_failed', result);
        resolve(result);
      });

      child.on('close', (code) => {
        this.activeProcesses.delete(item.index);
        const durationMs = Date.now() - repoStartTime;

        if (code === 0) {
          this.successCount++;
          const result = {
            index: item.index,
            item,
            status: 'success',
            durationMs,
            targetPath: targetFolderPath,
            rawLogs
          };
          this.results.push(result);

          this.emitEvent('repo_success', result);
          resolve(result);
        } else {
          this.failCount++;
          const diagnosed = diagnoseGitError(rawLogs, code);

          // Clean up empty leftover directory on failure so no orphan empty folder remains
          try {
            if (fs.existsSync(targetFolderPath)) {
              const files = fs.readdirSync(targetFolderPath);
              if (files.length === 0) {
                fs.rmSync(targetFolderPath, { recursive: true, force: true });
              }
            }
          } catch (cleanErr) {}

          const result = {
            index: item.index,
            item,
            status: 'failed',
            exitCode: code,
            durationMs,
            error: diagnosed,
            rawLogs
          };
          this.results.push(result);

          this.emitEvent('repo_failed', result);
          // Note: Does NOT throw or halt. Just resolves so the queue continues!
          resolve(result);
        }
      });
    });
  }

  cancelAll() {
    this.isCancelled = true;
    this.queue = [];

    // Kill all running child processes
    for (const [index, child] of this.activeProcesses.entries()) {
      try {
        child.kill('SIGTERM');
      } catch (e) {}
    }
    this.activeProcesses.clear();

    this.emitEvent('batch_cancelled', {
      completedCount: this.completedCount,
      succeeded: this.successCount,
      failed: this.failCount,
      total: this.total
    });
  }

  finishBatch() {
    this.isCompleted = true;
    const durationMs = Date.now() - this.startTime;

    this.emitEvent('batch_complete', {
      total: this.total,
      succeeded: this.successCount,
      failed: this.failCount,
      durationMs,
      results: this.results
    });
  }

  emitEvent(type, payload) {
    if (typeof this.onEvent === 'function') {
      this.onEvent({ type, timestamp: Date.now(), ...payload });
    }
  }
}

module.exports = {
  BatchCloneManager,
  parseGitProgress,
  diagnoseGitError
};
