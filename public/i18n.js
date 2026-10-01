const translations = {
  en: {
    // Modal Language Selection
    langModalTitle: 'Welcome to GitMultiClone',
    langModalSubtitle: 'Please select your preferred language to get started',
    langModalDesc: 'You can switch between English and Vietnamese at any time from the top bar.',
    langSelectEnTitle: 'English',
    langSelectEnSub: 'Continue in English',
    langSelectViTitle: 'Tiếng Việt',
    langSelectViSub: 'Tiếp tục bằng Tiếng Việt',
    btnConfirmLang: 'Start Using Tool',

    // Header & Brand
    appTitle: 'GitMultiClone',
    appSubtitle: 'High-speed concurrent cloning • Collision auto-rename • Resilient error diagnosis',
    statusConnected: 'Online',
    statusDisconnected: 'Disconnected',
    btnChangeLang: 'Change Language',

    // Left Column: Controls
    panelSetupTitle: 'Configuration & Input',
    step1Title: 'Destination Storage Folder',
    step1Desc: 'Choose where cloned repositories will be saved on your computer',
    folderPlaceholder: 'D:\\Projects\\Repos or paste any path...',
    btnBrowseWeb: 'Browse Folders',
    btnBrowseWin: 'Windows Dialog',
    btnOpenExplorer: 'Open in Explorer',
    badgeFolderReady: 'Folder Ready',
    badgeFolderWillCreate: 'Folder will be created automatically',
    quickPresets: 'Quick Paths:',
    presetDefault: 'Default Project',
    presetDesktop: 'Desktop',
    presetDownloads: 'Downloads',
    presetWorkspace: 'Workspace',

    step2Title: 'GitHub Repositories',
    step2Desc: 'Paste URLs (one per line or any messy mixed text)',
    inputPlaceholder: `Paste your repository links here:
https://github.com/facebook/react.git
https://github.com/vuejs/core.git
https://github.com/DietrichGebert/ponytail.git

Or messy mixed text with arbitrary characters:
Look at "https://github.com/authorA/repoX.git", and https://github.com/authorB/repoX.git!`,
    btnParse: 'Analyze & Preview',
    btnPaste: 'Paste Clipboard',
    btnSample: 'Load Sample Repos',
    btnClear: 'Clear',
    inputStats: '{count} repos detected • {collisions} name collisions',

    optionTitle: 'Cloning Settings',
    optionConcurrency: 'Parallel Clones (Threads):',
    optionShallow: 'Fast Shallow Clone (--depth 1)',
    optionShallowDesc: 'Saves disk space and speeds up clone drastically',

    btnStartClone: 'START BATCH CLONE',
    btnCancelClone: 'STOP / CANCEL',

    // Right Column: Tabs
    tabPreview: 'Detected Repos & Collision Resolver',
    tabLive: 'Live Progress Monitor',
    tabReport: 'Summary & Error Logs',

    // Tab 1: Preview Table
    previewNotice: 'Smart Collision Protection: If two repos share the same name (or already exist on disk), the author name is automatically appended (-author) to prevent overwriting.',
    colIndex: '#',
    colRepo: 'Repository',
    colAuthor: 'Author',
    colTargetFolder: 'Saved Folder',
    colOriginalUrl: 'Clone URL',
    colStatus: 'Status',
    badgeCollision: 'Auto-Renamed to Avoid Overwrite',
    badgeReady: 'Ready',
    noReposYet: 'No repositories entered yet. Paste links on the left or click "Load Sample Repos".',

    // Tab 2: Live Monitor
    overallProgressTitle: 'Overall Batch Progress',
    overallProgressSummary: '{completed} of {total} completed ({percent}%)',
    statSuccess: 'Success',
    statFailed: 'Failed',
    statActive: 'Cloning',
    statRemaining: 'Queued',
    statusQueued: 'Queued',
    statusCloning: 'Cloning...',
    statusSuccess: 'Success',
    statusFailed: 'Failed',
    btnViewLogs: 'View Log',
    btnHideLogs: 'Hide Log',
    liveWaiting: 'Click "START BATCH CLONE" to begin cloning repositories simultaneously.',

    // Tab 3: Error Report
    step5Title: 'Execution Summary & Error Diagnostics',
    summaryAllSuccess: 'All {count} repositories were cloned successfully!',
    summaryPartial: 'Completed: {success} succeeded, {failed} failed.',
    resilienceNotice: 'Fault-Tolerant Engine: Even if some repositories failed (e.g. invalid URL or private repo), all other repositories continued cloning without interruption.',
    failedTitle: 'Failed Repositories Diagnostics',
    btnRetryFailed: 'Retry Failed Repos Only',
    btnOpenClonedFolder: 'Open Destination Folder in Explorer',
    errorCause: 'Diagnosed Reason:',
    errorRawOutput: 'Raw Git Output:',

    // Built-in Folder Picker Modal
    folderModalTitle: 'Choose Destination Folder',
    folderModalSubtitle: 'Navigate your drives and select a folder to save repositories',
    btnSelectThisFolder: 'Select This Folder',
    btnUpLevel: 'Up One Level',
    btnNewFolder: 'New Folder',
    promptNewFolderName: 'Enter new folder name:',
    folderModalDrives: 'Drives:',
    folderModalCurrent: 'Current Folder:',
    folderEmpty: 'This folder is empty or contains no subdirectories',

    // Toasts
    alertNoRepos: 'Please enter at least one valid GitHub repository link.',
    alertNoFolder: 'Please enter a destination folder path.',
    alertBatchRunning: 'A batch cloning operation is currently running.',
    toastCopied: 'Pasted from clipboard!',
    toastCancelled: 'Batch clone operation was stopped.',
    toastFolderSelected: 'Folder selected: {path}'
  },

  vi: {
    // Modal Language Selection
    langModalTitle: 'Chào Mừng Đến Với GitMultiClone',
    langModalSubtitle: 'Vui lòng chọn ngôn ngữ để bắt đầu sử dụng công cụ',
    langModalDesc: 'Bạn có thể thay đổi giữa Tiếng Việt và Tiếng Anh bất cứ lúc nào ở thanh trên cùng.',
    langSelectEnTitle: 'English',
    langSelectEnSub: 'Continue in English',
    langSelectViTitle: 'Tiếng Việt',
    langSelectViSub: 'Tiếp tục bằng Tiếng Việt',
    btnConfirmLang: 'Bắt Đầu Sử Dụng',

    // Header & Brand
    appTitle: 'GitMultiClone',
    appSubtitle: 'Clone hàng loạt tốc độ cao • Tự động đổi tên chống trùng lặp • Bền bỉ không dừng khi lỗi',
    statusConnected: 'Trực tuyến',
    statusDisconnected: 'Mất kết nối',
    btnChangeLang: 'Đổi Ngôn Ngữ',

    // Left Column: Controls
    panelSetupTitle: 'Cấu Hình & Danh Sách Clone',
    step1Title: 'Thư Mục Lưu Trữ',
    step1Desc: 'Chọn nơi lưu các repository được clone về máy tính của bạn',
    folderPlaceholder: 'D:\\Projects\\Repos hoặc dán đường dẫn...',
    btnBrowseWeb: 'Duyệt Thư Mục',
    btnBrowseWin: 'Hộp Thoại Windows',
    btnOpenExplorer: 'Mở Explorer',
    badgeFolderReady: 'Thư mục hợp lệ',
    badgeFolderWillCreate: 'Sẽ tự động tạo thư mục này',
    quickPresets: 'Lối tắt nhanh:',
    presetDefault: 'Dự án mặc định',
    presetDesktop: 'Desktop',
    presetDownloads: 'Downloads',
    presetWorkspace: 'Thư mục hiện tại',

    step2Title: 'Danh Sách GitHub Repo',
    step2Desc: 'Dán mỗi dòng 1 link hoặc dán nguyên đoạn văn bản bất kỳ',
    inputPlaceholder: `Dán danh sách link repo vào đây:
https://github.com/facebook/react.git
https://github.com/vuejs/core.git
https://github.com/DietrichGebert/ponytail.git

Hoặc dán cả đoạn văn bản lộn xộn chứa ký tự lạ:
Xem thử "https://github.com/tacgiaA/repoX.git", và https://github.com/tacgiaB/repoX.git!`,
    btnParse: 'Phân Tích & Xem Trước',
    btnPaste: 'Dán Từ Clipboard',
    btnSample: 'Nạp Link Mẫu Test',
    btnClear: 'Xóa Hết',
    inputStats: 'Đã nhận diện: {count} repo • {collisions} trùng tên',

    optionTitle: 'Tùy Chọn Clone',
    optionConcurrency: 'Số luồng clone song song:',
    optionShallow: 'Clone nhanh (--depth 1)',
    optionShallowDesc: 'Tiết kiệm dung lượng ổ cứng và tăng tốc độ tối đa',

    btnStartClone: 'BẮT ĐẦU CLONE TẤT CẢ',
    btnCancelClone: 'DỪNG QUÁ TRÌNH CLONE',

    // Right Column: Tabs
    tabPreview: 'Danh Sách & Chống Trùng Tên',
    tabLive: 'Tiến Độ Clone Trực Tiếp',
    tabReport: 'Báo Cáo Tổng Kết & Lỗi',

    // Tab 1: Preview Table
    previewNotice: 'Cơ Chế Chống Trùng Tên: Khi có 2 repo cùng tên (hoặc thư mục đã tồn tại sẵn), hệ thống tự động thêm tên tác giả phía sau (-tác-giả) để không bao giờ bị ghi đè dữ liệu.',
    colIndex: 'STT',
    colRepo: 'Tên Repo',
    colAuthor: 'Tác Giả',
    colTargetFolder: 'Thư Mục Lưu',
    colOriginalUrl: 'Link Clone',
    colStatus: 'Trạng Thái',
    badgeCollision: 'Tự thêm tác giả tránh trùng',
    badgeReady: 'Sẵn sàng',
    noReposYet: 'Chưa có repository nào. Hãy dán link ở cột bên trái hoặc bấm "Nạp Link Mẫu Test".',

    // Tab 2: Live Monitor
    overallProgressTitle: 'Tiến Độ Tổng Thể',
    overallProgressSummary: 'Đã hoàn thành {completed}/{total} repo ({percent}%)',
    statSuccess: 'Thành công',
    statFailed: 'Thất bại',
    statActive: 'Đang clone',
    statRemaining: 'Đang chờ',
    statusQueued: 'Đang chờ',
    statusCloning: 'Đang clone...',
    statusSuccess: 'Thành công',
    statusFailed: 'Thất bại',
    btnViewLogs: 'Xem Log',
    btnHideLogs: 'Thu Gọn Log',
    liveWaiting: 'Bấm nút "BẮT ĐẦU CLONE TẤT CẢ" để bắt đầu tiến trình clone đồng thời.',

    // Tab 3: Error Report
    step5Title: 'Tổng Kết & Báo Cáo Lỗi Chi Tiết',
    summaryAllSuccess: 'Tuyệt vời! Toàn bộ {count} repository đã được clone thành công!',
    summaryPartial: 'Hoàn tất: {success} thành công, {failed} thất bại.',
    resilienceNotice: 'Cơ Chế Bền Bỉ Không Dừng: Dù một số repo gặp lỗi (ví dụ link hỏng hoặc private), toàn bộ các repo hợp lệ khác vẫn được clone thành công mà không bị dừng lại.',
    failedTitle: 'Chi Tiết & Nguyên Nhân Các Repo Bị Lỗi',
    btnRetryFailed: 'Chỉ Thử Lại Các Repo Lỗi',
    btnOpenClonedFolder: 'Mở Thư Mục Lưu Trữ Trong Explorer',
    errorCause: 'Nguyên nhân chuẩn đoán:',
    errorRawOutput: 'Chi tiết log từ Git:',

    // Built-in Folder Picker Modal
    folderModalTitle: 'Duyệt & Chọn Thư Mục Lưu Trữ',
    folderModalSubtitle: 'Chọn ổ đĩa và thư mục bạn muốn lưu các repo clone về',
    btnSelectThisFolder: 'CHỌN THƯ MỤC NÀY',
    btnUpLevel: 'Lên 1 Cấp',
    btnNewFolder: 'Tạo Thư Mục Mới',
    promptNewFolderName: 'Nhập tên thư mục mới cần tạo:',
    folderModalDrives: 'Ổ đĩa:',
    folderModalCurrent: 'Đang duyệt:',
    folderEmpty: 'Thư mục này trống hoặc không có thư mục con',

    // Toasts
    alertNoRepos: 'Vui lòng dán ít nhất 1 link GitHub repo hợp lệ.',
    alertNoFolder: 'Vui lòng chọn hoặc nhập đường dẫn thư mục lưu trữ.',
    alertBatchRunning: 'Hiện tại đang có tiến trình clone đang chạy, vui lòng chờ hoặc bấm Dừng.',
    toastCopied: 'Đã dán từ clipboard!',
    toastCancelled: 'Đã dừng quá trình clone.',
    toastFolderSelected: 'Đã chọn thư mục: {path}'
  }
};

let currentLang = localStorage.getItem('multi_clone_lang') || null;

function t(key, params = {}) {
  const lang = currentLang || 'vi';
  const dict = translations[lang] || translations.vi;
  let text = dict[key] || (translations.en ? translations.en[key] : key) || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return text;
}

function updatePageLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('multi_clone_lang', lang);

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key));
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    el.setAttribute('title', t(key));
  });

  const btnEn = document.getElementById('btnSwitchEn');
  const btnVi = document.getElementById('btnSwitchVi');
  if (btnEn && btnVi) {
    btnEn.classList.toggle('active', lang === 'en');
    btnVi.classList.toggle('active', lang === 'vi');
  }

  if (window.onLanguageChanged) {
    window.onLanguageChanged(lang);
  }
}
