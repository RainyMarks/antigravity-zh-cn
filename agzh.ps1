<#
.SYNOPSIS
  Antigravity 简体中文汉化补丁 —— 管理脚本

.DESCRIPTION
  agzh.ps1 -Action Install      安装 / 重新安装汉化（交互式）
  agzh.ps1 -Action Uninstall    还原英文原版并移除自动更新
  agzh.ps1 -Action Update       立即检查补丁更新并应用
  agzh.ps1 -Action Status       查看当前状态
  agzh.ps1 -Action Auto         后台自动模式（由计划任务和 Antigravity 退出钩子调用）

  可选参数：-AppDir <Antigravity 安装目录>  -Lang / -NoLang  -NoAutoUpdate  -Yes
#>
[CmdletBinding()]
param(
  [ValidateSet('Install', 'Uninstall', 'Update', 'Status', 'Auto')]
  [string]$Action = 'Install',
  [switch]$AfterQuit,
  [string]$AppDir,
  [switch]$Lang,
  [switch]$NoLang,
  [switch]$NoAutoUpdate,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {}

$Repo = 'RainyMarks/antigravity-zh-cn'
$PatchDir = $PSScriptRoot
$TaskName = 'AntigravityZhCN'
$LogDir = Join-Path $PatchDir 'logs'
$ConfigFile = Join-Path $PatchDir 'config.json'
$StateFile = Join-Path $PatchDir 'state.json'
$Interactive = $Action -ne 'Auto'
$script:App = $null

# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------
function Write-Log([string]$Message, [string]$Color = '') {
  if ($Interactive) {
    if ($Color) { Write-Host $Message -ForegroundColor $Color } else { Write-Host $Message }
  }
  try {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $f = Join-Path $LogDir 'agzh.log'
    Add-Content -LiteralPath $f -Value ('{0} [{1}] {2}' -f (Get-Date -Format s), $Action, $Message) -Encoding UTF8
    if ((Get-Item -LiteralPath $f).Length -gt 512KB) {
      $keep = Get-Content -LiteralPath $f -Encoding UTF8 | Select-Object -Last 2000
      Set-Content -LiteralPath $f -Value $keep -Encoding UTF8
    }
  } catch {}
}

function Read-Json([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) } catch {}
  }
  return $null
}

function Write-Json([string]$Path, $Object) {
  $json = $Object | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText($Path, $json, (New-Object Text.UTF8Encoding $false))
}

function Get-Config {
  $c = Read-Json $ConfigFile
  $cfg = [ordered]@{ lang = $false; autoUpdate = $true; appDir = '' }
  if ($c) {
    if ($null -ne $c.lang) { $cfg.lang = [bool]$c.lang }
    if ($null -ne $c.autoUpdate) { $cfg.autoUpdate = [bool]$c.autoUpdate }
    if ($c.appDir) { $cfg.appDir = [string]$c.appDir }
  }
  return $cfg
}

function Find-AppDir {
  $cands = @()
  if ($AppDir) { $cands += $AppDir }
  $cfg = Get-Config
  if ($cfg.appDir) { $cands += $cfg.appDir }
  $p = Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1
  if ($p) { $cands += (Split-Path -Parent $p.Path) }
  $cands += (Join-Path $env:LOCALAPPDATA 'Programs\antigravity')
  if ($env:ProgramFiles) { $cands += (Join-Path $env:ProgramFiles 'Antigravity') }
  foreach ($d in $cands) {
    if ($d -and (Test-Path -LiteralPath (Join-Path $d 'resources\app.asar')) -and (Test-Path -LiteralPath (Join-Path $d 'Antigravity.exe'))) {
      return (Resolve-Path -LiteralPath $d).Path
    }
  }
  return $null
}

function Get-AppProcesses {
  return @(Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue)
}

# Antigravity 自动更新时运行的安装程序（electron-updater / NSIS）。
function Test-InstallerRunning {
  $updater = Join-Path $env:LOCALAPPDATA 'antigravity-updater'
  foreach ($p in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
    if ($p.ExecutablePath -and $p.ExecutablePath.StartsWith($updater, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    if ($p.Name -match '^(Un_[A-Z]|Au_)\.exe$') { return $true }
    if ($p.Name -match '^Antigravity.*Setup.*\.exe$') { return $true }
  }
  return $false
}

function Stop-App {
  foreach ($p in Get-AppProcesses) { try { $null = $p.CloseMainWindow() } catch {} }
  Start-Sleep -Seconds 3
  Get-AppProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
  if ($script:App) {
    Get-Process -Name 'language_server' -ErrorAction SilentlyContinue |
      Where-Object { $_.Path -and $_.Path.StartsWith($script:App, [StringComparison]::OrdinalIgnoreCase) } |
      Stop-Process -Force -ErrorAction SilentlyContinue
  }
  for ($i = 0; $i -lt 20 -and (Get-AppProcesses).Count -gt 0; $i++) { Start-Sleep -Milliseconds 500 }
  return (Get-AppProcesses).Count -eq 0
}

function Confirm-AppClosed {
  if ((Get-AppProcesses).Count -eq 0) { return $true }
  Write-Log 'Antigravity 正在运行，需要完全退出后才能继续（正在运行的智能体任务会被中断）。' 'Yellow'
  if (-not $Yes) {
    $ans = Read-Host '输入 Y 自动关闭 Antigravity；直接回车取消（可自行退出后再运行）'
    if ($ans -notmatch '^\s*[Yy]') { return $false }
  }
  if (Stop-App) { return $true }
  Write-Log '无法关闭 Antigravity，请手动退出（包括托盘图标）后重试。' 'Red'
  return $false
}

function Invoke-Patcher([string[]]$PatcherArgs) {
  $exe = Join-Path $script:App 'Antigravity.exe'
  $quote = { param($s) if ($s -match '[\s"]') { '"' + $s + '"' } else { $s } }
  $argList = @(& $quote (Join-Path $PatchDir 'patcher.js')) + @($PatcherArgs | ForEach-Object { & $quote $_ })
  $out = [IO.Path]::GetTempFileName()
  $err = [IO.Path]::GetTempFileName()
  $old = $env:ELECTRON_RUN_AS_NODE
  $env:ELECTRON_RUN_AS_NODE = '1'
  try {
    $p = Start-Process -FilePath $exe -ArgumentList $argList -NoNewWindow -Wait -PassThru `
      -RedirectStandardOutput $out -RedirectStandardError $err
    $code = $p.ExitCode
  } finally {
    $env:ELECTRON_RUN_AS_NODE = $old
  }
  $text = ([IO.File]::ReadAllText($out, [Text.Encoding]::UTF8) + [IO.File]::ReadAllText($err, [Text.Encoding]::UTF8))
  Remove-Item -LiteralPath $out, $err -Force -ErrorAction SilentlyContinue
  foreach ($l in ($text -split "`r?`n")) { if ($l.Trim()) { Write-Log $l } }
  return $code
}

# ---------------------------------------------------------------------------
# 补丁自更新（从 GitHub Releases 拉取，jsDelivr 作为备用镜像；逐文件 SHA-256 校验）
# ---------------------------------------------------------------------------
function Get-Remote([string]$Url, [string]$Dest) {
  Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing -TimeoutSec 30
}

function ConvertTo-UrlPath([string]$Rel) {
  return (($Rel -split '/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
}

function Update-PatchFiles([switch]$Force) {
  $state = Read-Json $StateFile
  $now = [DateTime]::UtcNow.Ticks
  if (-not $Force -and $state -and $state.lastCheck) {
    if (($now - [long]$state.lastCheck) -lt [TimeSpan]::FromMinutes(30).Ticks) { return $false }
  }
  $local = Read-Json (Join-Path $PatchDir 'manifest.json')
  $tmp = Join-Path $env:TEMP ('agzh-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $remote = $null
    $mf = Join-Path $tmp 'manifest.json'
    foreach ($u in @("https://github.com/$Repo/releases/latest/download/manifest.json",
        "https://cdn.jsdelivr.net/gh/$Repo@latest/manifest.json",
        "https://cdn.jsdelivr.net/gh/$Repo/manifest.json",
        "https://cdn.jsdelivr.net/gh/$Repo@main/manifest.json")) {
      try {
        Get-Remote $u $mf
        $remote = Read-Json $mf
        if ($remote -and $remote.version -and $remote.files) { break }
        $remote = $null
      } catch {
        Write-Log "无法访问 $u ：$($_.Exception.Message)"
      }
    }
    if (-not $remote) { return $false }
    Write-Json $StateFile ([ordered]@{ lastCheck = $now; latest = $remote.version })

    if ($local -and $local.version -and ([version]$remote.version -le [version]$local.version)) {
      if ($Interactive) { Write-Log "补丁已是最新版本 v$($local.version)。" }
      return $false
    }
    Write-Log "发现汉化补丁新版本 v$($remote.version)（当前 v$($local.version)），正在下载…"
    $files = @($remote.files.PSObject.Properties)
    foreach ($f in $files) {
      $dest = Join-Path $tmp ($f.Name -replace '/', '\')
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
      $ok = $false
      foreach ($base in @("https://raw.githubusercontent.com/$Repo/$($remote.tag)/",
          "https://cdn.jsdelivr.net/gh/$Repo@$($remote.tag)/")) {
        try {
          Get-Remote ($base + (ConvertTo-UrlPath $f.Name)) $dest
          if ((Get-FileHash -Algorithm SHA256 -LiteralPath $dest).Hash.ToLower() -eq $f.Value) { $ok = $true; break }
        } catch {}
      }
      if (-not $ok) { throw "下载或校验失败：$($f.Name)" }
    }
    foreach ($f in $files) {
      $src = Join-Path $tmp ($f.Name -replace '/', '\')
      $dst = Join-Path $PatchDir ($f.Name -replace '/', '\')
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
      Copy-Item -LiteralPath $src -Destination $dst -Force
    }
    Copy-Item -LiteralPath $mf -Destination (Join-Path $PatchDir 'manifest.json') -Force
    Write-Log "汉化补丁已更新到 v$($remote.version)。" 'Green'
    return $true
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# ---------------------------------------------------------------------------
# 计划任务（登录时 + 每小时；用 conhost --headless 运行，不弹窗）
# ---------------------------------------------------------------------------
function Register-AutoTask {
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
  $psArgs = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Action Auto' -f (Join-Path $PatchDir 'agzh.ps1')
  if (Test-Path -LiteralPath $conhost) {
    $action = New-ScheduledTaskAction -Execute $conhost -Argument ('--headless "{0}" {1}' -f $ps, $psArgs)
  } else {
    $action = New-ScheduledTaskAction -Execute $ps -Argument $psArgs
  }
  $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $atLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
  $atLogon.Delay = 'PT1M'
  $hourly = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($atLogon, $hourly) -Settings $settings `
    -Principal $principal -Force `
    -Description 'Antigravity 简体中文汉化补丁：自动拉取补丁更新，并在 Antigravity 更新后重新应用汉化。' | Out-Null
}

function Unregister-AutoTask {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
}

# ---------------------------------------------------------------------------
# 各操作
# ---------------------------------------------------------------------------
function Get-LocalVersion {
  $m = Read-Json (Join-Path $PatchDir 'manifest.json')
  if ($m -and $m.version) { return $m.version }
  return '?'
}

function Do-Install {
  Write-Log "Antigravity 简体中文汉化补丁 v$(Get-LocalVersion)" 'Cyan'
  $script:App = Find-AppDir
  if (-not $script:App) {
    Write-Log '找不到 Antigravity 安装目录。请用 -AppDir 指定，例如：-AppDir "D:\Apps\Antigravity"' 'Red'
    return 1
  }
  Write-Log "Antigravity 安装目录：$script:App"
  $cfg = Get-Config
  $cfg.appDir = $script:App
  if ($Lang) { $cfg.lang = $true }
  if ($NoLang) { $cfg.lang = $false }
  if ($NoAutoUpdate) { $cfg.autoUpdate = $false }
  Write-Json $ConfigFile $cfg

  if (-not (Confirm-AppClosed)) { Write-Log '已取消。'; return 1 }
  $code = Invoke-Patcher @('--dir', $script:App)
  if ($code -ne 0) { Write-Log "打补丁失败（退出码 $code）。" 'Red'; return $code }

  if ($cfg.autoUpdate) {
    try {
      Register-AutoTask
      Write-Log '已开启自动更新：补丁有新版本或 Antigravity 更新后，会在 Antigravity 退出时自动重新汉化。' 'Green'
      # 自检：让计划任务运行一次，确认它能访问补丁文件。
      # 在打包应用（如 Claude 等 MSIX 桌面应用）的终端里安装时，%LOCALAPPDATA% 下的新文件会被重定向到该应用的私有目录，
      # 计划任务和 Antigravity 都看不到，自动更新会静默失效。
      $log = Join-Path $LogDir 'agzh.log'
      $before = if (Test-Path -LiteralPath $log) { (Get-Item -LiteralPath $log).Length } else { 0 }
      Start-ScheduledTask -TaskName $TaskName
      $visible = $false
      for ($i = 0; $i -lt 30 -and -not $visible; $i++) {
        Start-Sleep -Seconds 1
        $visible = (Test-Path -LiteralPath $log) -and ((Get-Item -LiteralPath $log).Length -gt $before)
      }
      if (-not $visible) {
        Write-Log '警告：自动更新任务无法访问补丁文件。如果你是在某个应用（例如 AI 助手的桌面版）内置的终端中运行的安装命令，请改为在自己打开的 PowerShell 窗口中重新运行一次。' 'Yellow'
      }
    } catch {
      Write-Log "注册自动更新计划任务失败：$($_.Exception.Message)" 'Yellow'
    }
  } else {
    Unregister-AutoTask
    Write-Log '未开启自动更新（-NoAutoUpdate）。'
  }
  # 安装目录中放一个卸载入口（自动更新不会下载 .cmd 文件）
  $uninstallCmd = Join-Path $PatchDir '卸载汉化.cmd'
  if (-not (Test-Path -LiteralPath $uninstallCmd)) {
    $cmd = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0agzh.ps1`" -Action Uninstall %*`r`necho.`r`npause`r`n"
    [IO.File]::WriteAllText($uninstallCmd, $cmd, [Text.Encoding]::ASCII)
  }
  Write-Log "补丁文件位置：$PatchDir（卸载：双击其中的 卸载汉化.cmd）"

  if ($Yes) { return 0 }
  $ans = Read-Host '是否现在启动 Antigravity？[Y/n]'
  if ($ans -notmatch '^\s*[Nn]') { Start-Process -FilePath (Join-Path $script:App 'Antigravity.exe') }
  return 0
}

function Do-Uninstall {
  $script:App = Find-AppDir
  if ($script:App) {
    if (-not (Confirm-AppClosed)) { Write-Log '已取消。'; return 1 }
    $code = Invoke-Patcher @('--uninstall', '--dir', $script:App)
    if ($code -ne 0) { Write-Log "还原失败（退出码 $code）。" 'Red'; return $code }
  } else {
    Write-Log '找不到 Antigravity 安装目录，跳过还原。' 'Yellow'
  }
  Unregister-AutoTask
  Write-Log '已移除自动更新计划任务。'
  $installed = Join-Path $env:LOCALAPPDATA 'antigravity-zh-cn'
  if ($PatchDir -ieq $installed) {
    $ans = if ($Yes) { 'y' } else { Read-Host '是否同时删除补丁文件？[Y/n]' }
    if ($ans -notmatch '^\s*[Nn]') {
      Remove-Item -LiteralPath $PatchDir -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host '补丁文件已删除。'
    }
  }
  return 0
}

function Do-Update {
  $script:App = Find-AppDir
  if (-not $script:App) { Write-Log '找不到 Antigravity 安装目录。' 'Red'; return 1 }
  try { $null = Update-PatchFiles -Force } catch { Write-Log "检查更新失败：$($_.Exception.Message)" 'Red' }
  if ((Get-AppProcesses).Count -gt 0) {
    Write-Log 'Antigravity 正在运行：新的汉化会在你退出 Antigravity 后自动应用；也可以退出后再运行一次本命令。' 'Yellow'
    return 0
  }
  return (Invoke-Patcher @('--auto', '--dir', $script:App))
}

function Do-Status {
  $script:App = Find-AppDir
  $cfg = Get-Config
  Write-Log "补丁版本：v$(Get-LocalVersion)    位置：$PatchDir"
  Write-Log "Antigravity：$(if ($script:App) { $script:App } else { '未找到' })"
  if ($script:App) { $null = Invoke-Patcher @('--status', '--dir', $script:App) }
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Write-Log "自动更新：$(if ($task) { '已开启（计划任务 ' + $TaskName + '）' } else { '未开启' })"
  Write-Log "Chromium 界面语言 zh-CN：$(if ($cfg.lang) { '是' } else { '否' })"
  $state = Read-Json $StateFile
  if ($state -and $state.latest) { Write-Log "上次检查到的最新版本：v$($state.latest)" }
  return 0
}

# 等待 Antigravity 及其更新安装程序全部退出（连续两次检测为空闲）。超时返回 $false。
function Wait-AppIdle([datetime]$Deadline, [int]$PollSeconds) {
  $idle = 0
  while ((Get-Date) -lt $Deadline) {
    if ((Get-AppProcesses).Count -eq 0 -and -not (Test-InstallerRunning)) { $idle++ } else { $idle = 0 }
    if ($idle -ge 2) { return $true }
    Start-Sleep -Seconds $PollSeconds
  }
  return $false
}

function Do-Auto {
  $script:App = Find-AppDir
  if (-not $script:App) { Write-Log '未找到 Antigravity，跳过。'; return 0 }
  if ($AfterQuit) {
    # 刚退出：先给 Antigravity 和它的更新安装程序一点时间结束。
    Start-Sleep -Seconds 3
    $null = Wait-AppIdle (Get-Date).AddMinutes(20) 3
  }
  $cfg = Get-Config
  if ($cfg.autoUpdate) {
    try { $null = Update-PatchFiles } catch { Write-Log "检查更新失败：$($_.Exception.Message)" }
  }

  # 由退出钩子启动的进程没有时间限制，可以等很久；计划任务有 30 分钟执行上限，下一轮会接着等。
  $deadline = if ($AfterQuit) { (Get-Date).AddHours(12) } else { (Get-Date).AddMinutes(25) }
  $announced = $false
  while ($true) {
    # 安装程序运行期间不能启动 Antigravity.exe（Node 模式），否则会妨碍更新安装。
    if (Test-InstallerRunning) {
      if (-not (Wait-AppIdle $deadline 10)) { return 0 }
    }
    $code = Invoke-Patcher @('--auto', '--dir', $script:App)
    if ($code -ne 2) { return $code }

    # 退出码 2：需要重新汉化（例如 Antigravity 刚通过「重启以更新」升级），但 Antigravity 正在运行。
    # 在后台等它退出后立即打补丁。等待期间释放主锁（不妨碍手动安装），并持有等待锁（避免多个实例同时等待）。
    if (-not $script:waitLockHeld) {
      $script:waitLock = New-Object System.Threading.Mutex($false, 'Local\AntigravityZhCN-Wait')
      try { $script:waitLockHeld = $script:waitLock.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $script:waitLockHeld = $true }
      if (-not $script:waitLockHeld) { Write-Log '已有后台任务在等待 Antigravity 退出。'; return 0 }
    }
    if (-not $announced) {
      Write-Log 'Antigravity 正在运行，汉化需要更新：将在 Antigravity 退出后自动应用。'
      $announced = $true
    }
    Release-PatchLock
    $idle = Wait-AppIdle $deadline 10
    if (-not (Request-PatchLock)) { Write-Log '另一个汉化任务正在处理，本次退出。'; return 0 }
    if (-not $idle) { Write-Log '等待超时，稍后由计划任务继续处理。'; return 0 }
  }
}

# ---------------------------------------------------------------------------
# 入口（同一时间只允许一个实例操作 app.asar）
# ---------------------------------------------------------------------------
if ($Interactive) {
  try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
}
$script:mutex = New-Object System.Threading.Mutex($false, 'Local\AntigravityZhCN-Patch')
$script:mutexHeld = $false
$script:waitLock = $null
$script:waitLockHeld = $false

function Request-PatchLock([int]$TimeoutMs = 0) {
  if ($script:mutexHeld) { return $true }
  try { $script:mutexHeld = $script:mutex.WaitOne($TimeoutMs) } catch [System.Threading.AbandonedMutexException] { $script:mutexHeld = $true }
  return $script:mutexHeld
}

function Release-PatchLock {
  if ($script:mutexHeld) { $script:mutex.ReleaseMutex(); $script:mutexHeld = $false }
}

if (-not (Request-PatchLock $(if ($Interactive) { 120000 } else { 0 }))) {
  Write-Log '另一个汉化任务正在运行，请稍后再试。'
  exit 0
}
$exitCode = 1
try {
  switch ($Action) {
    'Install' { $exitCode = Do-Install }
    'Uninstall' { $exitCode = Do-Uninstall }
    'Update' { $exitCode = Do-Update }
    'Status' { $exitCode = Do-Status }
    'Auto' { $exitCode = Do-Auto }
  }
} catch {
  Write-Log "出错：$($_.Exception.Message)" 'Red'
  $exitCode = 1
} finally {
  Release-PatchLock
  if ($script:waitLockHeld) { $script:waitLock.ReleaseMutex() }
}
exit $exitCode
