// Electron 外壳（主进程）字符串替换表：[文件, 原文片段, 替换片段]
// 找不到的条目会被跳过并给出提示（适配新版本时可能发生），不影响其他条目。
module.exports = [
  // ---- main.js：托盘、对话框 ----
  ['dist/main.js', "showErrorBox('Binary not found', msg)", "showErrorBox('找不到程序文件', msg)"],
  ['dist/main.js', "title: 'WSL distro not found',", "title: '找不到 WSL 发行版',"],
  ['dist/main.js', 'message: `The WSL distro "${WSL_DISTRO}" is no longer installed.`,', 'message: `WSL 发行版“${WSL_DISTRO}”已不再安装。`,'],
  ['dist/main.js', "detail: 'Antigravity opened on Windows instead.',", "detail: '已改为在 Windows 上打开 Antigravity。',"],
  ['dist/main.js', 'const msg = `Failed to install the server into WSL distro "${WSL_DISTRO}":\\n${err.message}`;', 'const msg = `无法将服务端安装到 WSL 发行版“${WSL_DISTRO}”：\\n${err.message}`;'],
  ['dist/main.js', "showErrorBox('WSL setup failed', msg)", "showErrorBox('WSL 配置失败', msg)"],
  ['dist/main.js', "showErrorBox('Startup failed', msg)", "showErrorBox('启动失败', msg)"],
  ['dist/main.js', "label: 'New Window',", "label: '新建窗口',"],
  ['dist/main.js', "label: 'No agents running',", "label: '没有正在运行的智能体',"],
  ['dist/main.js', 'label: `Open ${electron_1.app.getName()}`,', 'label: `打开 ${electron_1.app.getName()}`,'],
  ['dist/main.js', "label: 'Quit',", "label: '退出',"],
  ['dist/main.js', "buttons: ['Cancel', 'Quit'],", "buttons: ['取消', '退出'],"],
  ['dist/main.js', "title: 'Confirm Quit',", "title: '确认退出',"],
  ['dist/main.js', "message: 'Are you sure you want to quit?',", "message: '确定要退出吗？',"],
  ['dist/main.js', "detail: 'There may be agents or background tasks running.',", "detail: '可能还有智能体或后台任务正在运行。',"],

  // ---- tray.js：运行中的智能体数量 ----
  [
    'dist/tray.js',
    "(count > 0 ? `${count}` : 'No') +\n                    ' agent' +\n                    (count === 1 ? '' : 's') +\n                    ' running';",
    "(count > 0 ? `${count} 个智能体正在运行` : '没有正在运行的智能体');",
  ],

  // ---- menu.js：应用菜单 / WSL ----
  ['dist/menu.js', "label: 'New Window',", "label: '新建窗口',"],
  ['dist/menu.js', "label: 'Docs',", "label: '文档',"],
  ['dist/menu.js', "return { label: 'Connect to WSL', submenu };", "return { label: '连接到 WSL', submenu };"],
  ['dist/menu.js', "return { label: 'Reopen Locally', click:", "return { label: '在本地重新打开', click:"],

  // ---- updater.js：检查更新 ----
  ['dist/updater.js', 'MenuUpdateStep["CheckForUpdates"] = "Check for Updates";', 'MenuUpdateStep["CheckForUpdates"] = "检查更新";'],
  ['dist/updater.js', 'MenuUpdateStep["CheckingForUpdates"] = "Checking for Updates...";', 'MenuUpdateStep["CheckingForUpdates"] = "正在检查更新...";'],
  ['dist/updater.js', 'MenuUpdateStep["DownloadingUpdate"] = "Downloading Update...";', 'MenuUpdateStep["DownloadingUpdate"] = "正在下载更新...";'],
  ['dist/updater.js', 'MenuUpdateStep["RestartToUpdate"] = "Restart to Update";', 'MenuUpdateStep["RestartToUpdate"] = "重启以更新";'],
  ['dist/updater.js', "title: 'Check for Updates',", "title: '检查更新',"],
  ['dist/updater.js', "message: 'No updates available',", "message: '当前已是最新版本',"],
  ['dist/updater.js', "buttons: ['OK'],", "buttons: ['确定'],"],

  // ---- ipcHandlers.js：打开文件夹对话框 ----
  ['dist/ipcHandlers.js', "showErrorBox('Cannot open folder', t.error)", "showErrorBox('无法打开文件夹', t.error)"],
  ['dist/ipcHandlers.js', "message: 'Folder is on the Windows filesystem',", "message: '该文件夹位于 Windows 文件系统中',"],
  ['dist/ipcHandlers.js', "title: 'Open workspace',", "title: '打开工作区',"],
  ['dist/ipcHandlers.js', "title: 'Open workspaces',", "title: '打开多个工作区',"],

  // ---- wsl.js ----
  ['dist/wsl.js', 'error: `This folder belongs to the WSL distro "${unc[1]}", but this window is connected to "${distro}".`,', 'error: `该文件夹属于 WSL 发行版“${unc[1]}”，但当前窗口连接的是“${distro}”。`,'],
  ['dist/wsl.js', "warning: 'This folder is on the Windows filesystem. Accessing it from WSL (via /mnt) can be slow — for best performance keep projects inside the WSL filesystem.',", "warning: '该文件夹位于 Windows 文件系统中。从 WSL（通过 /mnt）访问可能较慢，为获得最佳性能，请将项目放在 WSL 文件系统内。',"],
  ['dist/wsl.js', 'return { error: `This location cannot be opened in WSL: ${winPath}` };', 'return { error: `无法在 WSL 中打开此位置：${winPath}` };'],
  ['dist/wsl.js', "onStatus?.('Downloading the Antigravity binary\\u2026');", "onStatus?.('正在下载 Antigravity 程序\\u2026');"],
  ['dist/wsl.js', 'onStatus?.(`Installing into ${distro}\\u2026`);', 'onStatus?.(`正在安装到 ${distro}\\u2026`);'],

  // ---- provisionSplash.js ----
  ['dist/provisionSplash.js', '<div>Setting up WSL: ${escapeHtml(distro)}</div>', '<div>正在配置 WSL：${escapeHtml(distro)}</div>'],

  // ---- languageServer.js：崩溃提示 ----
  ['dist/languageServer.js', 'const msg = `Language server crashed ${MAX_RESTARTS} times in a row. Giving up.`;', 'const msg = `语言服务器已连续崩溃 ${MAX_RESTARTS} 次，已放弃重启。`;'],

  // ---- ideInstall/wizardHtml.js：首次启动向导 ----
  ['dist/ideInstall/wizardHtml.js', '<html lang="en">', '<html lang="zh-CN">'],
  ['dist/ideInstall/wizardHtml.js', 'letter-spacing: 0.03em;">Setting up…</div>', 'letter-spacing: 0.03em;">正在准备…</div>'],
  ['dist/ideInstall/wizardHtml.js', '<h1>Welcome to the new Antigravity!</h1>', '<h1>欢迎使用全新的 Antigravity！</h1>'],
  [
    'dist/ideInstall/wizardHtml.js',
    "<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>",
    '<p>Antigravity 已全面重新设计，以智能体为核心并带来了全新功能。如果你仍需要代码编辑器，可以单独下载名为 <b>Antigravity IDE</b> 的应用。</p>',
  ],
  ['dist/ideInstall/wizardHtml.js', '<span>Download the Antigravity IDE</span>', '<span>下载 Antigravity IDE</span>'],
  ['dist/ideInstall/wizardHtml.js', '<button class="btn-primary" id="btn-skip">Explore the new Antigravity</button>', '<button class="btn-primary" id="btn-skip">探索全新的 Antigravity</button>'],

  // ---- preload.js：右键菜单与系统通知走翻译 ----
  [
    'dist/preload.js',
    "showContextMenu: (items) => electron_1.ipcRenderer.invoke('window:show-context-menu', items),",
    "showContextMenu: (items) => electron_1.ipcRenderer.invoke('window:show-context-menu', globalThis.__agZhMenu ? globalThis.__agZhMenu(items) : items),",
  ],
  [
    'dist/preload.js',
    "send: (options) => electron_1.ipcRenderer.invoke('notification:send', options),",
    "send: (options) => electron_1.ipcRenderer.invoke('notification:send', globalThis.__agZhNotification ? globalThis.__agZhNotification(options) : options),",
  ],
];
