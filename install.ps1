# Antigravity zh-CN (Simplified Chinese) patch - bootstrap installer.
#
#   irm https://raw.githubusercontent.com/RainyMarks/antigravity-zh-cn/main/install.ps1 | iex
#
# Or double-click the .cmd installer inside a downloaded release zip.
# Copies the patch to %LOCALAPPDATA%\antigravity-zh-cn (downloading the latest release
# when run remotely, every file verified by SHA-256), then runs agzh.ps1 -Action Install.
# This file is intentionally ASCII-only so it works with `irm | iex` on any code page.
& {
  param([string[]]$PassArgs)
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch {}

  $Repo = 'RainyMarks/antigravity-zh-cn'
  $Target = Join-Path $env:LOCALAPPDATA 'antigravity-zh-cn'

  function Read-Manifest([string]$Path) {
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
  }
  function Get-Sha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLower()
  }
  function ConvertTo-UrlPath([string]$Rel) {
    return (($Rel -split '/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
  }

  $local = $null
  if ($PSScriptRoot -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'manifest.json')) -and
      (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'patcher.js'))) {
    $local = $PSScriptRoot
  }

  $stage = Join-Path $env:TEMP ('agzh-install-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage | Out-Null
  try {
    if ($local) {
      Write-Host "Installing Antigravity zh-CN patch from $local"
      Copy-Item -LiteralPath (Join-Path $local 'manifest.json') -Destination (Join-Path $stage 'manifest.json')
      $manifest = Read-Manifest (Join-Path $stage 'manifest.json')
      foreach ($f in @($manifest.files.PSObject.Properties)) {
        $src = Join-Path $local ($f.Name -replace '/', '\')
        $dst = Join-Path $stage ($f.Name -replace '/', '\')
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
        Copy-Item -LiteralPath $src -Destination $dst
        if ((Get-Sha256 $dst) -ne $f.Value) { throw "Checksum mismatch: $($f.Name) (is the download complete?)" }
      }
    } else {
      Write-Host 'Downloading the latest Antigravity zh-CN patch...'
      $mf = Join-Path $stage 'manifest.json'
      $manifest = $null
      foreach ($u in @("https://github.com/$Repo/releases/latest/download/manifest.json",
          "https://cdn.jsdelivr.net/gh/$Repo@latest/manifest.json",
          "https://cdn.jsdelivr.net/gh/$Repo/manifest.json",
          "https://cdn.jsdelivr.net/gh/$Repo@main/manifest.json")) {
        try {
          Invoke-WebRequest -Uri $u -OutFile $mf -UseBasicParsing -TimeoutSec 30
          $manifest = Read-Manifest $mf
          if ($manifest.version -and $manifest.files) { break }
          $manifest = $null
        } catch {
          Write-Host "  cannot reach $u"
        }
      }
      if (-not $manifest) { throw 'Cannot download the patch manifest. Check your network / proxy and try again.' }
      Write-Host "  version v$($manifest.version)"
      foreach ($f in @($manifest.files.PSObject.Properties)) {
        $dst = Join-Path $stage ($f.Name -replace '/', '\')
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
        $ok = $false
        foreach ($base in @("https://raw.githubusercontent.com/$Repo/$($manifest.tag)/",
            "https://cdn.jsdelivr.net/gh/$Repo@$($manifest.tag)/")) {
          try {
            Invoke-WebRequest -Uri ($base + (ConvertTo-UrlPath $f.Name)) -OutFile $dst -UseBasicParsing -TimeoutSec 60
            if ((Get-Sha256 $dst) -eq $f.Value) { $ok = $true; break }
          } catch {}
        }
        if (-not $ok) { throw "Download or checksum failed: $($f.Name)" }
      }
    }

    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    foreach ($f in @($manifest.files.PSObject.Properties)) {
      $rel = $f.Name -replace '/', '\'
      $dst = Join-Path $Target $rel
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
      Copy-Item -LiteralPath (Join-Path $stage $rel) -Destination $dst -Force
    }
    Copy-Item -LiteralPath (Join-Path $stage 'manifest.json') -Destination (Join-Path $Target 'manifest.json') -Force
  } finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  }

  $agzh = Join-Path $Target 'agzh.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agzh -Action Install @PassArgs
} $args
