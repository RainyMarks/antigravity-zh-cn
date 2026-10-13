// Antigravity 汉化补丁 —— 主进程钩子（打补丁时复制为 app.asar 内的 dist/zh-cn-hook.js）。
//
// Antigravity 退出时，启动一个隐藏的 PowerShell 后台脚本（agzh.ps1 -Action Auto -AfterQuit）：
// 它会等待 Antigravity 及其更新安装程序全部结束，然后检查汉化补丁更新，
// 并在 Antigravity 自身更新导致汉化失效时自动重新打补丁。
// 后台脚本不在 Antigravity.exe 进程内运行，因此不会妨碍 Antigravity 的更新安装。
'use strict';
const CFG = /*__CFG__*/ {};

try {
  const electron = require('electron');
  const path = require('path');
  const fs = require('fs');
  const cp = require('child_process');
  if (process.platform === 'win32' && CFG.autoUpdate && CFG.patchDir) {
    let spawned = false;
    electron.app.on('quit', () => {
      if (spawned) return;
      spawned = true;
      try {
        const script = path.join(CFG.patchDir, 'agzh.ps1');
        if (!fs.existsSync(script)) return;
        const child = cp.spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
            '-File', script, '-Action', 'Auto', '-AfterQuit'],
          { detached: true, stdio: 'ignore', windowsHide: true },
        );
        child.unref();
      } catch (e) {
        console.error('[zh-CN] failed to start auto-update', e);
      }
    });
  }
} catch (e) {
  console.error('[zh-CN] hook failed', e);
}
