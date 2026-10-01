// GitHub Multi-Repo Batch Cloner Frontend

let ws = null;
let currentRepos = [];
let presets = {};
let batchRunning = false;
let failedReposList = [];
let modalBrowsingPath = '';
let modalSelectedPath = '';

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const queryLang = urlParams.get('lang');
  const savedLang = queryLang || localStorage.getItem('multi_clone_lang');
  const modal = document.getElementById('langModal');

  if (!savedLang) {
    if (modal) modal.classList.add('active');
  } else {
    if (modal) modal.classList.remove('active');
    updatePageLanguage(savedLang);
  }

  if (urlParams.get('sample') === 'true') {
    setTimeout(() => {
      loadSampleRepos();
    }, 300);
  }

  initConnection();
  fetchPresets();

  // Real-time input watcher for repo links (debounced)
  const repoTextarea = document.getElementById('repoInputTextarea');
  let parseDebounce;
  repoTextarea.addEventListener('input', () => {
    clearTimeout(parseDebounce);
    parseDebounce = setTimeout(parseAndPreview, 400);
  });

  // Folder input change watcher (debounced)
  const folderInput = document.getElementById('targetFolderInput');
  let folderDebounce;
  folderInput.addEventListener('input', () => {
    clearTimeout(folderDebounce);
    folderDebounce = setTimeout(() => {
      validateCurrentFolder();
      if (repoTextarea.value.trim()) {
        parseAndPreview();
      }
    }, 400);
  });
});

// Initial Language Selection Modal
function selectInitialLanguage(lang) {
  updatePageLanguage(lang);
  const modal = document.getElementById('langModal');
  if (modal) {
    modal.classList.remove('active');
  }
  showToast(lang === 'vi' ? 'Đã kích hoạt Tiếng Việt' : 'Language set to English', 'info');
}

// Top Bar Language Switcher
function setAppLanguage(lang) {
  updatePageLanguage(lang);
  if (currentRepos.length > 0) {
    renderPreviewTable(currentRepos);
  }
}

window.onLanguageChanged = function () {
  validateCurrentFolder();
  updateInputStats();
};

// Toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// Tab navigation
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  const targetBtn = document.getElementById(`tabBtn${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
  const targetContent = document.getElementById(`tabContent${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);

  if (targetBtn) targetBtn.classList.add('active');
  if (targetContent) targetContent.classList.add('active');
}

// Network Connection: WebSocket with SSE fallback
function initConnection() {
  const statusEl = document.getElementById('wsStatus');
  let isWsConnected = false;

  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isWsConnected = true;
      if (statusEl) {
        statusEl.className = 'status-indicator online';
        statusEl.querySelector('.status-text').textContent = t('statusConnected');
      }
    };

    ws.onclose = () => {
      if (!isWsConnected) {
        initEventSource();
      } else {
        if (statusEl) {
          statusEl.className = 'status-indicator offline';
          statusEl.querySelector('.status-text').textContent = t('statusDisconnected');
        }
        setTimeout(initConnection, 3000);
      }
    };

    ws.onerror = () => {
      if (!isWsConnected) initEventSource();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleStreamEvent(data);
      } catch (e) {}
    };
  } catch (e) {
    initEventSource();
  }
}

function initEventSource() {
  const statusEl = document.getElementById('wsStatus');
  try {
    const sse = new EventSource('/api/events');
    sse.onopen = () => {
      if (statusEl) {
        statusEl.className = 'status-indicator online';
        statusEl.querySelector('.status-text').textContent = t('statusConnected');
      }
    };
    sse.onmessage = (e) => {
      try {
        handleStreamEvent(JSON.parse(e.data));
      } catch (err) {}
    };
    sse.onerror = () => {
      if (statusEl) {
        statusEl.className = 'status-indicator offline';
        statusEl.querySelector('.status-text').textContent = t('statusDisconnected');
      }
    };
  } catch (e) {}
}

// Handle real-time stream events
function handleStreamEvent(evt) {
  switch (evt.type) {
    case 'batch_start':
      batchRunning = true;
      failedReposList = [];
      document.getElementById('btnStartBatch').style.display = 'none';
      document.getElementById('btnCancelBatch').style.display = 'flex';
      switchTab('live');
      document.getElementById('liveEmptyPlaceholder').style.display = 'none';
      document.getElementById('statSuccessCount').textContent = '0';
      document.getElementById('statFailedCount').textContent = '0';
      document.getElementById('statActiveCount').textContent = '0';
      document.getElementById('statQueuedCount').textContent = evt.total;
      break;

    case 'repo_start':
      updateRepoCardStatus(evt.index, 'cloning', {
        stage: 'Đang khởi chạy git clone...',
        percent: 5
      });
      break;

    case 'repo_progress':
      updateRepoCardStatus(evt.index, 'cloning', {
        stage: evt.stage,
        percent: evt.percent,
        speed: evt.speed,
        rawLine: evt.rawLine
      });
      break;

    case 'repo_success':
      updateRepoCardStatus(evt.index, 'success', {
        stage: 'Clone thành công!',
        percent: 100,
        durationMs: evt.durationMs,
        rawLogs: evt.rawLogs
      });
      break;

    case 'repo_failed':
      failedReposList.push(evt);
      updateRepoCardStatus(evt.index, 'failed', {
        stage: evt.error ? (currentLang === 'vi' ? evt.error.vi : evt.error.en) : 'Lỗi clone',
        percent: 100,
        durationMs: evt.durationMs,
        error: evt.error,
        rawLogs: evt.rawLogs
      });
      break;

    case 'overall_progress':
      updateOverallProgress(evt);
      break;

    case 'batch_complete':
      batchRunning = false;
      document.getElementById('btnStartBatch').style.display = 'flex';
      document.getElementById('btnCancelBatch').style.display = 'none';
      renderSummaryReport(evt);
      break;

    case 'batch_cancelled':
      batchRunning = false;
      document.getElementById('btnStartBatch').style.display = 'flex';
      document.getElementById('btnCancelBatch').style.display = 'none';
      showToast(t('toastCancelled'), 'warning');
      break;
  }
}

// Fetch system preset directories
async function fetchPresets() {
  try {
    const res = await fetch('/api/presets');
    presets = await res.json();
    const folderInput = document.getElementById('targetFolderInput');
    if (!folderInput.value && presets.defaultPath) {
      folderInput.value = presets.defaultPath;
      validateCurrentFolder();
    }
  } catch (err) {}
}

function applyPreset(name) {
  const folderInput = document.getElementById('targetFolderInput');
  if (name === 'default' && presets.defaultPath) folderInput.value = presets.defaultPath;
  else if (name === 'desktop' && presets.desktop) folderInput.value = presets.desktop;
  else if (name === 'downloads' && presets.downloads) folderInput.value = presets.downloads;
  else if (name === 'workspace' && presets.workspace) folderInput.value = presets.workspace;
  validateCurrentFolder();
  parseAndPreview();
}

async function validateCurrentFolder() {
  const folderInput = document.getElementById('targetFolderInput');
  const pathVal = folderInput.value;
  const badge = document.getElementById('folderStatusBadge');
  const text = document.getElementById('folderStatusText');

  try {
    const res = await fetch('/api/validate-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: pathVal })
    });
    const data = await res.json();

    if (data.valid) {
      if (data.exists) {
        badge.className = 'folder-status-pill ready';
        text.textContent = `${t('badgeFolderReady')} (${data.existingCount || 0} thư mục con)`;
      } else {
        badge.className = 'folder-status-pill warning';
        text.textContent = t('badgeFolderWillCreate');
      }
    } else {
      badge.className = 'folder-status-pill warning';
      text.textContent = 'Đường dẫn không hợp lệ';
    }
  } catch (e) {
    badge.className = 'folder-status-pill warning';
    text.textContent = 'Không kiểm tra được thư mục';
  }
}

// BUILT-IN WEB FOLDER EXPLORER MODAL
async function openFolderModal(targetPath) {
  const modal = document.getElementById('folderModal');
  modal.classList.add('active');

  const startPath = targetPath || document.getElementById('targetFolderInput').value || (presets.defaultPath || 'D:\\');
  await loadFolderModalPath(startPath);
}

function closeFolderModal() {
  const modal = document.getElementById('folderModal');
  modal.classList.remove('active');
}

async function loadFolderModalPath(reqPath) {
  const treeView = document.getElementById('folderTreeView');
  const pathDisplay = document.getElementById('modalCurrentPath');
  const drivesContainer = document.getElementById('drivePillsContainer');

  treeView.innerHTML = '<div class="folder-loading">Đang tải danh sách thư mục...</div>';

  try {
    const res = await fetch(`/api/list-directory?path=${encodeURIComponent(reqPath)}`);
    const data = await res.json();

    if (!data.success) {
      treeView.innerHTML = `<div class="folder-loading" style="color: var(--accent-danger)">${data.error || 'Không đọc được thư mục'}</div>`;
      return;
    }

    modalBrowsingPath = data.currentPath;
    modalSelectedPath = data.currentPath;
    pathDisplay.textContent = data.currentPath;

    // Render drive pills
    if (data.drives && data.drives.length > 0) {
      drivesContainer.innerHTML = '';
      data.drives.forEach((d) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `drive-pill ${modalBrowsingPath.toUpperCase().startsWith(d.toUpperCase()) ? 'active' : ''}`;
        pill.textContent = `💽 ${d}`;
        pill.onclick = () => loadFolderModalPath(d);
        drivesContainer.appendChild(pill);
      });
    }

    // Render directories
    if (!data.directories || data.directories.length === 0) {
      treeView.innerHTML = `<div class="folder-loading">${t('folderEmpty')}</div>`;
      return;
    }

    treeView.innerHTML = '';
    data.directories.forEach((dirName) => {
      const item = document.createElement('div');
      item.className = 'folder-item';
      item.innerHTML = `<span>📁</span> <strong>${dirName}</strong>`;

      item.onclick = () => {
        document.querySelectorAll('.folder-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        modalSelectedPath = modalBrowsingPath.endsWith('\\') || modalBrowsingPath.endsWith('/')
          ? `${modalBrowsingPath}${dirName}`
          : `${modalBrowsingPath}\\${dirName}`;
        pathDisplay.textContent = modalSelectedPath;
      };

      item.ondblclick = () => {
        const nextPath = modalBrowsingPath.endsWith('\\') || modalBrowsingPath.endsWith('/')
          ? `${modalBrowsingPath}${dirName}`
          : `${modalBrowsingPath}\\${dirName}`;
        loadFolderModalPath(nextPath);
      };

      treeView.appendChild(item);
    });

  } catch (err) {
    treeView.innerHTML = '<div class="folder-loading" style="color: var(--accent-danger)">Lỗi kết nối máy chủ</div>';
  }
}

function navigateFolderUp() {
  if (!modalBrowsingPath) return;
  // Get parent path
  const parts = modalBrowsingPath.replace(/[\\/]+$/, '').split(/[\\/]/);
  if (parts.length > 1) {
    const parent = parts.slice(0, -1).join('\\') || (parts[0] + '\\');
    loadFolderModalPath(parent);
  }
}

async function promptCreateNewFolder() {
  const folderName = prompt(t('promptNewFolderName'));
  if (!folderName || !folderName.trim()) return;

  try {
    const res = await fetch('/api/create-directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath: modalBrowsingPath, folderName: folderName.trim() })
    });
    const data = await res.json();
    if (data.success) {
      loadFolderModalPath(modalBrowsingPath);
      showToast('Đã tạo thư mục mới!', 'info');
    } else {
      showToast(data.error || 'Không tạo được thư mục', 'warning');
    }
  } catch (err) {
    showToast('Lỗi tạo thư mục', 'warning');
  }
}

function confirmModalFolderSelection() {
  const chosen = modalSelectedPath || modalBrowsingPath;
  if (chosen) {
    document.getElementById('targetFolderInput').value = chosen;
    validateCurrentFolder();
    parseAndPreview();
    closeFolderModal();
    showToast(t('toastFolderSelected', { path: chosen }), 'info');
  }
}

// Native Windows Folder Browser Dialog (fallback)
async function browseFolderWindowsDialog() {
  const btn = document.getElementById('btnBrowseWin');
  btn.disabled = true;
  showToast('Đang mở hộp thoại Windows...', 'info');

  try {
    const res = await fetch('/api/browse-folder');
    const data = await res.json();
    if (data.success && data.path) {
      document.getElementById('targetFolderInput').value = data.path;
      validateCurrentFolder();
      parseAndPreview();
      showToast(t('toastFolderSelected', { path: data.path }), 'info');
    }
  } catch (e) {
  } finally {
    btn.disabled = false;
  }
}

// Open in Explorer
async function openTargetFolder() {
  const folderPath = document.getElementById('targetFolderInput').value;
  try {
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath })
    });
    showToast('Đã mở Windows Explorer!', 'info');
  } catch (e) {}
}

// Paste from Clipboard
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      const textarea = document.getElementById('repoInputTextarea');
      textarea.value = (textarea.value ? textarea.value.trim() + '\n' : '') + text;
      showToast(t('toastCopied'), 'info');
      parseAndPreview();
    }
  } catch (err) {
    showToast('Vui lòng cấp quyền clipboard hoặc dùng phím Ctrl+V.', 'warning');
  }
}

function clearInput() {
  document.getElementById('repoInputTextarea').value = '';
  currentRepos = [];
  updateInputStats();
  renderPreviewTable([]);
}

function updateConcurrencyLabel(val) {
  document.getElementById('concurrencyValue').textContent = val;
}

// Load rich sample repos
function loadSampleRepos() {
  const sample = `# Danh sách test đa dạng link và trường hợp trùng tên:
https://github.com/octocat/Hello-World.git
https://github.com/octocat/Spoon-Knife.git

# Test repo trùng tên từ tác giả khác (sẽ tự đổi thành ponytail-userB):
https://github.com/DietrichGebert/ponytail.git
Check inline messy link: "https://github.com/userB/ponytail.git", and https://github.com/vuejs/core.git!

# Test repo giả lập bị lỗi 404 (chứng minh hệ thống không bị dừng giữa chừng):
https://github.com/fake-non-existent-user-12345/fakerepo-will-fail-demo.git
`;
  const textarea = document.getElementById('repoInputTextarea');
  textarea.value = sample;
  parseAndPreview();
}

// Parse URLs and resolve collisions
async function parseAndPreview() {
  const rawText = document.getElementById('repoInputTextarea').value;
  const targetFolder = document.getElementById('targetFolderInput').value;

  if (!rawText.trim()) {
    currentRepos = [];
    updateInputStats();
    renderPreviewTable([]);
    return;
  }

  try {
    const res = await fetch('/api/parse-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText, targetFolder })
    });
    const data = await res.json();

    if (!data.success) return;

    currentRepos = data.repos || [];
    updateInputStats(data.totalCount, data.collisionCount);
    renderPreviewTable(currentRepos);

  } catch (err) {}
}

function updateInputStats(total = 0, collisions = 0) {
  const badge = document.getElementById('liveInputStatsText');
  const tabBadge = document.getElementById('tabBadgePreview');

  badge.textContent = t('inputStats', { count: total, collisions });
  tabBadge.textContent = total;
}

// Render Preview Table in Tab 1
function renderPreviewTable(repos) {
  const emptyBox = document.getElementById('previewEmptyPlaceholder');
  const tableCard = document.getElementById('previewTableCard');
  const tbody = document.getElementById('previewTableBody');

  if (!repos || repos.length === 0) {
    emptyBox.style.display = 'flex';
    tableCard.style.display = 'none';
    tbody.innerHTML = '';
    return;
  }

  emptyBox.style.display = 'none';
  tableCard.style.display = 'block';
  tbody.innerHTML = '';

  repos.forEach((repo) => {
    const tr = document.createElement('tr');

    const folderDisplay = repo.hasCollision
      ? `<span class="folder-badge-collision" title="${repo.collisionReason || 'Duplicate name'}">
           ⚠️ ${repo.targetFolder}
           <span style="font-size: 0.7rem; opacity: 0.85;">(${t('badgeCollision')})</span>
         </span>`
      : `<span class="folder-badge-normal">📁 ${repo.targetFolder}</span>`;

    tr.innerHTML = `
      <td><strong>${repo.index}</strong></td>
      <td><strong>${repo.repoName}</strong></td>
      <td>${repo.owner}</td>
      <td>${folderDisplay}</td>
      <td><span class="url-code">${repo.cloneUrl}</span></td>
      <td><span class="badge-ready">${t('badgeReady')}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Start Batch Clone
async function startBatchClone() {
  if (batchRunning) {
    showToast(t('alertBatchRunning'), 'warning');
    return;
  }

  if (!currentRepos || currentRepos.length === 0) {
    showToast(t('alertNoRepos'), 'warning');
    return;
  }

  const targetFolder = document.getElementById('targetFolderInput').value;
  const concurrency = document.getElementById('concurrencySlider').value;
  const shallow = document.getElementById('shallowCloneCheckbox').checked;

  initLiveGrid(currentRepos);
  switchTab('live');

  try {
    const res = await fetch('/api/start-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repos: currentRepos,
        targetFolder,
        concurrency,
        shallow
      })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Lỗi khởi chạy batch clone', 'warning');
    }
  } catch (err) {
    showToast('Không kết nối được tới máy chủ', 'warning');
  }
}

// Cancel Batch Clone
async function cancelBatchClone() {
  try {
    await fetch('/api/cancel-batch', { method: 'POST' });
    showToast(t('toastCancelled'), 'info');
  } catch (err) {}
}

// Initialize Live Grid in Tab 2
function initLiveGrid(repos) {
  const grid = document.getElementById('repoLiveGrid');
  grid.innerHTML = '';

  repos.forEach((repo) => {
    const card = document.createElement('div');
    card.id = `repoCard-${repo.index}`;
    card.className = 'repo-card';

    card.innerHTML = `
      <div class="repo-card-head">
        <div class="repo-title-box">
          <span class="repo-title-name">#${repo.index} ${repo.repoName}</span>
          <span class="repo-title-meta">${repo.owner} • 📂 ${repo.targetFolder}</span>
        </div>
        <span class="status-badge queued" id="badge-${repo.index}">${t('statusQueued')}</span>
      </div>

      <div class="card-progress-track">
        <div class="card-progress-fill" id="fill-${repo.index}" style="width: 0%;"></div>
      </div>

      <div class="card-progress-info">
        <span class="stage-text" id="stage-${repo.index}">${t('statusQueued')}</span>
        <span class="percent-text" id="percent-${repo.index}">0%</span>
      </div>

      <button type="button" class="btn-log-toggle" onclick="toggleRepoLog(${repo.index})">
        <span id="logToggleText-${repo.index}">▶ ${t('btnViewLogs')}</span>
      </button>
      <div class="log-drawer" id="logBox-${repo.index}"></div>
    `;
    grid.appendChild(card);
  });
}

function toggleRepoLog(index) {
  const box = document.getElementById(`logBox-${index}`);
  const toggleText = document.getElementById(`logToggleText-${index}`);
  if (box.classList.contains('open')) {
    box.classList.remove('open');
    toggleText.textContent = `▶ ${t('btnViewLogs')}`;
  } else {
    box.classList.add('open');
    toggleText.textContent = `▼ ${t('btnHideLogs')}`;
  }
}

// Update single repo card status
function updateRepoCardStatus(index, status, data = {}) {
  const card = document.getElementById(`repoCard-${index}`);
  if (!card) return;

  const badge = document.getElementById(`badge-${index}`);
  const stage = document.getElementById(`stage-${index}`);
  const percent = document.getElementById(`percent-${index}`);
  const fill = document.getElementById(`fill-${index}`);
  const logBox = document.getElementById(`logBox-${index}`);

  card.className = `repo-card status-${status}`;

  if (status === 'cloning') {
    badge.className = 'status-badge cloning';
    badge.textContent = t('statusCloning');
    if (data.stage) stage.textContent = data.stage;
    if (data.percent !== undefined && data.percent !== null) {
      percent.textContent = `${data.percent}%`;
      fill.style.width = `${data.percent}%`;
    }
    if (data.rawLine && logBox) {
      logBox.textContent += data.rawLine + '\n';
      logBox.scrollTop = logBox.scrollHeight;
    }
  } else if (status === 'success') {
    badge.className = 'status-badge success';
    badge.textContent = t('statusSuccess');
    stage.textContent = `✓ ${t('statusSuccess')} (${(data.durationMs / 1000).toFixed(1)}s)`;
    percent.textContent = '100%';
    fill.style.width = '100%';
    if (data.rawLogs && logBox) logBox.textContent = data.rawLogs;
  } else if (status === 'failed') {
    badge.className = 'status-badge failed';
    badge.textContent = t('statusFailed');
    stage.textContent = `✕ ${t('statusFailed')}`;
    percent.textContent = 'Error';
    fill.style.width = '100%';
    if (data.rawLogs && logBox) {
      logBox.textContent = data.rawLogs;
      logBox.classList.add('open');
    }
  }
}

// Overall progress update
function updateOverallProgress(evt) {
  const bar = document.getElementById('overallProgressBar');
  const percentLabel = document.getElementById('overallPercentLabel');
  const summaryText = document.getElementById('overallSummaryText');
  const tabBadgeLive = document.getElementById('tabBadgeLive');

  bar.style.width = `${evt.percent}%`;
  percentLabel.textContent = `${evt.percent}%`;
  tabBadgeLive.style.display = 'inline-block';
  tabBadgeLive.textContent = `${evt.percent}%`;

  summaryText.textContent = t('overallProgressSummary', {
    completed: evt.completed,
    total: evt.total,
    percent: evt.percent
  });

  document.getElementById('statSuccessCount').textContent = evt.succeeded || 0;
  document.getElementById('statFailedCount').textContent = evt.failed || 0;
  document.getElementById('statActiveCount').textContent = evt.activeCount || 0;
  document.getElementById('statQueuedCount').textContent = Math.max(0, evt.total - evt.completed);

  const errorBadge = document.getElementById('tabBadgeErrors');
  if (evt.failed > 0) {
    errorBadge.style.display = 'inline-block';
    errorBadge.textContent = evt.failed;
  } else {
    errorBadge.style.display = 'none';
  }
}

// Render Summary Report in Tab 3
function renderSummaryReport(evt) {
  switchTab('report');

  const emptyPlaceholder = document.getElementById('reportEmptyPlaceholder');
  const failedContainer = document.getElementById('failedDiagnosticsContainer');
  const successContainer = document.getElementById('allSuccessContainer');
  const failedCardsList = document.getElementById('failedCardsList');

  emptyPlaceholder.style.display = 'none';

  if (evt.failed > 0) {
    successContainer.style.display = 'none';
    failedContainer.style.display = 'block';
    failedCardsList.innerHTML = '';

    const failedItems = evt.results ? evt.results.filter(r => r.status === 'failed') : failedReposList;

    failedItems.forEach((fail) => {
      const card = document.createElement('div');
      card.className = 'failed-report-card';

      const repoInfo = fail.item || {};
      const diagReason = fail.error
        ? (currentLang === 'vi' ? fail.error.vi : fail.error.en)
        : 'Lỗi git không xác định';

      card.innerHTML = `
        <div class="failed-report-head">
          <span class="failed-repo-name">#${fail.index} ${repoInfo.owner}/${repoInfo.repoName}</span>
          <span class="status-badge failed">${t('statusFailed')} (Code: ${fail.exitCode !== undefined ? fail.exitCode : '1'})</span>
        </div>
        <div class="failed-reason-text"><strong>${t('errorCause')}</strong> ${diagReason}</div>
        <pre class="raw-log-pre">${fail.rawLogs || 'Không có log stderr'}</pre>
      `;
      failedCardsList.appendChild(card);
    });
  } else {
    failedContainer.style.display = 'none';
    successContainer.style.display = 'block';
    document.getElementById('allSuccessMsg').textContent = t('summaryAllSuccess', { count: evt.succeeded });
  }
}

// Retry only failed repositories
function retryFailedRepos() {
  if (failedReposList.length === 0) return;

  const retryUrls = failedReposList.map(f => f.item.cloneUrl).join('\n');
  document.getElementById('repoInputTextarea').value = retryUrls;
  switchTab('preview');
  parseAndPreview();
}
