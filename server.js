const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { extractGithubUrls, resolveFolderNames } = require('./urlParser');
const { BatchCloneManager } = require('./cloneManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3456;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Default clone directory in workspace or user's Desktop
const defaultTargetDir = path.join(process.cwd(), 'downloaded_repos');
if (!fs.existsSync(defaultTargetDir)) {
  try {
    fs.mkdirSync(defaultTargetDir, { recursive: true });
  } catch (e) {}
}

let activeBatchManager = null;

// Helper to detect available Windows drives
function getWindowsDrives() {
  const drives = [];
  for (let i = 65; i <= 90; i++) {
    const drive = String.fromCharCode(i) + ':\\';
    try {
      if (fs.existsSync(drive)) {
        drives.push(drive);
      }
    } catch (e) {}
  }
  return drives.length > 0 ? drives : ['C:\\'];
}

// Broadcast helper to all connected WebSocket clients
function broadcast(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {}
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected', time: Date.now() }));
});

// API: List directories for built-in web folder explorer
app.get('/api/list-directory', (req, res) => {
  try {
    let reqPath = req.query.path ? req.query.path.trim() : defaultTargetDir;

    // If empty or root request, provide drives
    const drives = getWindowsDrives();
    if (!reqPath) {
      reqPath = drives[0] || 'C:\\';
    }

    const resolved = path.resolve(reqPath);
    if (!fs.existsSync(resolved)) {
      return res.json({
        success: false,
        error: 'Path does not exist',
        currentPath: resolved,
        drives
      });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return res.json({
        success: false,
        error: 'Path is not a directory',
        currentPath: resolved,
        drives
      });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const directories = [];

    for (const entry of entries) {
      // Filter out system hidden/junction folders that cause permission denied
      if (entry.name.startsWith('$') || entry.name.toLowerCase() === 'system volume information') {
        continue;
      }
      try {
        if (entry.isDirectory()) {
          directories.push(entry.name);
        }
      } catch (e) {}
    }

    // Sort alphabetically
    directories.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const parsedPath = path.parse(resolved);
    const isRoot = resolved === parsedPath.root;
    const parentPath = isRoot ? null : path.dirname(resolved);

    res.json({
      success: true,
      currentPath: resolved,
      parentPath,
      isRoot,
      drives,
      directories
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Create new folder in directory
app.post('/api/create-directory', (req, res) => {
  try {
    const { parentPath, folderName } = req.body;
    if (!parentPath || !folderName || !folderName.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid folder name' });
    }

    const sanitized = folderName.trim().replace(/[<>:"/\\|?*]/g, '_');
    const newPath = path.join(path.resolve(parentPath), sanitized);

    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
    }

    res.json({ success: true, path: newPath });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Parse URLs & Resolve folder names
app.post('/api/parse-urls', (req, res) => {
  try {
    const { text, targetFolder } = req.body;
    const effectiveFolder = targetFolder && targetFolder.trim() ? path.resolve(targetFolder.trim()) : defaultTargetDir;

    const extracted = extractGithubUrls(text || '');
    const resolved = resolveFolderNames(extracted, effectiveFolder);
    const collisionCount = resolved.filter(r => r.hasCollision).length;

    res.json({
      success: true,
      totalCount: resolved.length,
      collisionCount,
      targetFolder: effectiveFolder,
      repos: resolved
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Validate target folder path
app.post('/api/validate-folder', (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath || !folderPath.trim()) {
      return res.json({
        valid: true,
        path: defaultTargetDir,
        exists: true,
        isDefault: true,
        existingCount: 0
      });
    }

    const resolved = path.resolve(folderPath.trim());
    const exists = fs.existsSync(resolved);
    let isDirectory = false;
    let existingCount = 0;

    if (exists) {
      const stat = fs.statSync(resolved);
      isDirectory = stat.isDirectory();
      if (isDirectory) {
        try {
          existingCount = fs.readdirSync(resolved).length;
        } catch (e) {}
      }
    }

    res.json({
      valid: true,
      path: resolved,
      exists,
      isDirectory,
      existingCount
    });
  } catch (err) {
    res.status(400).json({ valid: false, error: err.message });
  }
});

// API: Browse folder using native Windows FolderBrowserDialog (with STA mode)
app.get('/api/browse-folder', (req, res) => {
  const os = require('os');
  const tempScriptPath = path.join(os.tmpdir(), 'browse_folder_sta.ps1');
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Chọn thư mục lưu trữ các Repository"
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}
$dialog.Dispose()
`;

  try {
    fs.writeFileSync(tempScriptPath, psScript, 'utf8');
    execFile(
      'powershell.exe',
      ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tempScriptPath],
      { timeout: 120000 },
      (err, stdout) => {
        const selected = (stdout || '').trim();
        if (selected) {
          res.json({ success: true, path: selected });
        } else {
          res.json({ success: false, cancelled: true });
        }
      }
    );
  } catch (err) {
    res.json({ success: false, cancelled: true, error: err.message });
  }
});

// API: Open folder in Windows Explorer
app.post('/api/open-folder', (req, res) => {
  try {
    const { folderPath } = req.body;
    const target = folderPath && folderPath.trim() ? path.resolve(folderPath.trim()) : defaultTargetDir;

    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    // Spawn detached explorer.exe so it opens independently without blocking
    const child = spawn('explorer.exe', [target], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    res.json({ success: true, path: target });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Start batch clone
app.post('/api/start-batch', (req, res) => {
  try {
    const { repos, targetFolder, concurrency, shallow } = req.body;

    if (!repos || !Array.isArray(repos) || repos.length === 0) {
      return res.status(400).json({ success: false, error: 'No repositories provided' });
    }

    const effectiveBaseDir = targetFolder && targetFolder.trim() ? path.resolve(targetFolder.trim()) : defaultTargetDir;

    if (activeBatchManager && !activeBatchManager.isCompleted && !activeBatchManager.isCancelled) {
      return res.status(409).json({ success: false, error: 'A batch clone is already in progress' });
    }

    const verifiedRepos = resolveFolderNames(repos, effectiveBaseDir);

    activeBatchManager = new BatchCloneManager({
      baseDir: effectiveBaseDir,
      concurrency: Math.max(1, Math.min(10, parseInt(concurrency, 10) || 3)),
      shallow: Boolean(shallow),
      onEvent: (event) => {
        broadcast(event);
      }
    });

    activeBatchManager.start(verifiedRepos);

    res.json({
      success: true,
      message: 'Batch clone started',
      total: verifiedRepos.length,
      targetFolder: effectiveBaseDir,
      concurrency: activeBatchManager.concurrency,
      shallow: activeBatchManager.shallow
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Cancel batch clone
app.post('/api/cancel-batch', (req, res) => {
  try {
    if (activeBatchManager) {
      activeBatchManager.cancelAll();
      res.json({ success: true, message: 'Batch clone cancelled' });
    } else {
      res.json({ success: true, message: 'No active batch to cancel' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get system preset folders
app.get('/api/presets', (req, res) => {
  const userProfile = process.env.USERPROFILE || '';
  const desktopPath = userProfile ? path.join(userProfile, 'Desktop') : '';
  const downloadsPath = userProfile ? path.join(userProfile, 'Downloads') : '';

  res.json({
    defaultPath: defaultTargetDir,
    desktop: desktopPath,
    downloads: downloadsPath,
    workspace: process.cwd(),
    drives: getWindowsDrives()
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 GitHub Multi-Repo Batch Cloner Server`);
  console.log(`📡 Local Web UI: http://localhost:${PORT}`);
  console.log(`📁 Default Target Folder: ${defaultTargetDir}`);
  console.log(`=======================================================`);
});
