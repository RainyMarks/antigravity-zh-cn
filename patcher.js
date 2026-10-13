// Antigravity 简体中文汉化补丁 —— 打补丁 / 还原
//
// 一般不需要直接运行本文件，请使用 安装汉化.cmd / agzh.ps1。直接运行方式：
//   set ELECTRON_RUN_AS_NODE=1
//   "<Antigravity 安装目录>\Antigravity.exe" patcher.js [选项]
//
// 选项：
//   --dir <目录>        Antigravity 安装目录（默认自动查找）
//   --uninstall         还原为英文原版
//   --auto              后台模式：仅在需要时（未打补丁 / 补丁有新版本）才打补丁，不交互
//   --lang / --no-lang  是否把 Chromium 界面语言设为 zh-CN（会记住选择）
//   --force             即使 Antigravity 正在运行也继续（不推荐）
//
// 原理：修改 resources\app.asar（Electron 外壳），不改动 language_server.exe。
//   1. 直接替换外壳中的菜单、托盘、对话框、首次启动向导文字；
//   2. 在 preload.js 末尾注入翻译器，运行时把主界面（Web UI）的英文替换为中文；
//   3. 注入 dist/zh-cn-hook.js：退出时触发自动更新检查。
// 首次打补丁会把原始 app.asar 备份为 app.asar.zh-cn-backup，还原时使用。
'use strict';

process.noAsar = true;
let fs;
try {
  fs = require('original-fs');
} catch (e) {
  fs = require('fs');
}
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const HERE = __dirname;
const MARKER = 'dist/zh-cn-patch.json';
const HOOK = 'dist/zh-cn-hook.js';
const EXIT_RUNNING = 2;

// ---------------------------------------------------------------------------
// 参数 / 配置
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const optValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--dir');
const AUTO = flags.has('--auto');
const mode = flags.has('--uninstall') ? 'uninstall' : 'install';

const readJson = (p, dflt) => {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt);
  } catch (e) {
    return dflt;
  }
};
const manifest = readJson(path.join(HERE, 'manifest.json'), {});
const PATCH_VERSION = manifest.version || '0.0.0-dev';
const configPath = path.join(HERE, 'config.json');
const config = Object.assign({ lang: false, autoUpdate: false }, readJson(configPath, {}));
if (flags.has('--lang')) config.lang = true;
if (flags.has('--no-lang')) config.lang = false;

// ---------------------------------------------------------------------------
// 日志
// ---------------------------------------------------------------------------
const logLines = [];
function log(...a) {
  const line = a.join(' ');
  logLines.push(line);
  console.log(line);
}
function flushLog() {
  if (!AUTO) return;
  try {
    const dir = path.join(HERE, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'patcher.log');
    let old = '';
    try {
      old = fs.readFileSync(file, 'utf8');
    } catch (e) {}
    const add = logLines.map((l) => new Date().toISOString() + ' ' + l).join('\n') + '\n';
    fs.writeFileSync(file, (old + add).split('\n').slice(-500).join('\n'));
  } catch (e) {}
}
function fail(msg, code = 1) {
  logLines.push('[错误] ' + msg);
  console.error('[错误] ' + msg);
  flushLog();
  process.exit(code);
}

// ---------------------------------------------------------------------------
// 安装目录
// ---------------------------------------------------------------------------
function findInstallDir() {
  // 显式传入的目录优先，且传入后不再猜测其他位置。
  const explicit = optValue('--dir') || positional[0];
  if (explicit) {
    const dir = path.resolve(explicit);
    return fs.existsSync(path.join(dir, 'resources', 'app.asar')) ? dir : null;
  }
  const candidates = [];
  // 通过 Antigravity.exe 的 Node 模式运行时，execPath 就在安装目录里。
  if (/antigravity\.exe$/i.test(process.execPath)) candidates.push(path.dirname(process.execPath));
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity'));
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'Antigravity'));
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'resources', 'app.asar'))) return dir;
  }
  return null;
}

// ---------------------------------------------------------------------------
// asar 读写
// ---------------------------------------------------------------------------
function readAsar(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, 0);
    const headerPickleSize = sizeBuf.readUInt32LE(4);
    const headerBuf = Buffer.alloc(headerPickleSize);
    fs.readSync(fd, headerBuf, 0, headerPickleSize, 8);
    const strLen = headerBuf.readInt32LE(4);
    const header = JSON.parse(headerBuf.toString('utf8', 8, 8 + strLen));
    const base = 8 + headerPickleSize;
    const files = new Map();
    (function walk(node, prefix) {
      for (const [name, entry] of Object.entries(node.files)) {
        const p = prefix ? prefix + '/' + name : name;
        if (entry.files) walk(entry, p);
        else if (!entry.unpacked && !entry.link) {
          const buf = Buffer.alloc(entry.size);
          if (entry.size) fs.readSync(fd, buf, 0, entry.size, base + Number(entry.offset));
          files.set(p, buf);
        }
      }
    })(header, '');
    return { header, files };
  } finally {
    fs.closeSync(fd);
  }
}

function integrity(buf) {
  const blockSize = 4 * 1024 * 1024;
  const blocks = [];
  for (let i = 0; i < Math.max(buf.length, 1); i += blockSize) {
    blocks.push(crypto.createHash('sha256').update(buf.subarray(i, i + blockSize)).digest('hex'));
  }
  return { algorithm: 'SHA256', hash: crypto.createHash('sha256').update(buf).digest('hex'), blockSize, blocks };
}

function getEntry(header, p, create) {
  const parts = p.split('/');
  let node = header;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node.files[parts[i]]) {
      if (!create) return null;
      node.files[parts[i]] = { files: {} };
    }
    node = node.files[parts[i]];
  }
  const name = parts[parts.length - 1];
  if (!node.files[name] && create) node.files[name] = {};
  return node.files[name] || null;
}

function writeAsar(file, { header, files }) {
  const chunks = [];
  let offset = 0;
  (function walk(node, prefix) {
    for (const [name, entry] of Object.entries(node.files)) {
      const p = prefix ? prefix + '/' + name : name;
      if (entry.files) walk(entry, p);
      else if (!entry.unpacked && !entry.link) {
        const buf = files.get(p);
        entry.size = buf.length;
        entry.offset = String(offset);
        if (entry._changed) entry.integrity = integrity(buf);
        delete entry._changed;
        chunks.push(buf);
        offset += buf.length;
      }
    }
  })(header, '');

  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const padded = (json.length + 3) & ~3;
  const headerPickle = Buffer.alloc(8 + padded);
  headerPickle.writeUInt32LE(4 + padded, 0);
  headerPickle.writeInt32LE(json.length, 4);
  json.copy(headerPickle, 8);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);

  const tmp = file + '.zh-cn-tmp';
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, sizePickle);
      fs.writeSync(fd, headerPickle);
      for (const c of chunks) fs.writeSync(fd, c);
    } finally {
      fs.closeSync(fd);
    }
    const check = readAsar(tmp);
    if (check.files.size !== files.size) throw new Error('写入校验失败');
    for (const [p, buf] of files) if (!check.files.get(p).equals(buf)) throw new Error('写入校验失败：' + p);
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (e2) {}
    if (e && (e.code === 'EPERM' || e.code === 'EBUSY')) {
      throw new Error('app.asar 被占用，无法写入。请确认 Antigravity 已完全退出（包括托盘图标）后重试。');
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 进程检测
// ---------------------------------------------------------------------------
function runningAntigravityPids() {
  try {
    const out = cp.execSync('tasklist /FI "IMAGENAME eq Antigravity.exe" /FO CSV /NH', { encoding: 'utf8', windowsHide: true });
    return out
      .split(/\r?\n/)
      .map((l) => l.split('","'))
      .filter((c) => c.length > 1 && /antigravity\.exe/i.test(c[0]))
      .map((c) => Number(c[1].replace(/"/g, '')))
      .filter((pid) => pid && pid !== process.pid);
  } catch (e) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 补丁
// ---------------------------------------------------------------------------
const jsLiteral = (o) => JSON.stringify(o).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function fillTemplate(src, name, placeholder, value) {
  if (!src.includes(placeholder)) throw new Error(name + ' 模板损坏：缺少 ' + placeholder);
  return src.replace(placeholder, () => value);
}

function buildPreloadAddon() {
  const dict = JSON.parse(fs.readFileSync(path.join(HERE, 'zh-cn', 'dict.json'), 'utf8'));
  let src = fs.readFileSync(path.join(HERE, 'zh-cn', 'translator.js'), 'utf8');
  src = fillTemplate(src, 'translator.js', "/*__VERSION__*/ ''", jsLiteral(PATCH_VERSION));
  src = fillTemplate(src, 'translator.js', '/*__DICT__*/ {}', jsLiteral(dict.exact || {}));
  src = fillTemplate(src, 'translator.js', '/*__TEMPLATES__*/ []', jsLiteral(Object.entries(dict.templates || {})));
  src = fillTemplate(src, 'translator.js', '/*__CONTEXT__*/ []', jsLiteral(dict.context || []));
  const count = Object.keys(dict.exact || {}).length + Object.keys(dict.templates || {}).length + (dict.context || []).length;
  return { code: src, count };
}

function buildHook() {
  const src = fs.readFileSync(path.join(HERE, 'zh-cn', 'hook.js'), 'utf8');
  return fillTemplate(src, 'hook.js', '/*__CFG__*/ {}', jsLiteral({ patchDir: HERE, autoUpdate: !!config.autoUpdate }));
}

function applyPatch(asar) {
  const shell = require(path.join(HERE, 'zh-cn', 'shell.js'));
  const text = new Map();
  const getText = (p) => {
    if (!text.has(p)) {
      const buf = asar.files.get(p);
      text.set(p, buf ? buf.toString('utf8') : null);
    }
    return text.get(p);
  };
  let ok = 0;
  const missed = [];
  for (const [file, find, repl] of shell) {
    const src = getText(file);
    if (src === null || !src.includes(find)) {
      missed.push(file + ': ' + find.slice(0, 60).replace(/\n/g, ' '));
      continue;
    }
    text.set(file, src.split(find).join(repl));
    ok++;
  }

  const mainJs = getText('dist/main.js');
  if (mainJs === null) throw new Error('app.asar 中没有 dist/main.js，此版本不受支持');
  let newMain = mainJs;
  if (config.lang) {
    const anchor = "electron_1.app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');";
    if (newMain.includes(anchor)) newMain = newMain.replace(anchor, anchor + "\nelectron_1.app.commandLine.appendSwitch('lang', 'zh-CN');");
    else missed.push('dist/main.js: --lang 注入点');
  }
  newMain += "\n\n// ==== Antigravity zh-CN patch ====\ntry {\n    require('./zh-cn-hook');\n}\ncatch (e) {\n    console.error('[zh-CN] hook load failed', e);\n}\n";
  text.set('dist/main.js', newMain);

  const preload = getText('dist/preload.js');
  if (preload === null) throw new Error('app.asar 中没有 dist/preload.js，此版本不受支持');
  const addon = buildPreloadAddon();
  text.set('dist/preload.js', preload + '\n\n// ==== Antigravity zh-CN patch ====\n' + addon.code + '\n');

  for (const [p, s] of text) {
    if (s === null) continue;
    const buf = Buffer.from(s, 'utf8');
    if (!buf.equals(asar.files.get(p))) {
      asar.files.set(p, buf);
      getEntry(asar.header, p, false)._changed = true;
    }
  }

  const addFile = (p, buf) => {
    getEntry(asar.header, p, true)._changed = true;
    asar.files.set(p, buf);
  };
  addFile(HOOK, Buffer.from(buildHook(), 'utf8'));
  const pkg = JSON.parse(asar.files.get('package.json').toString('utf8'));
  const markerData = {
    patch: PATCH_VERSION,
    appVersion: pkg.version,
    lang: !!config.lang,
    autoUpdate: !!config.autoUpdate,
    patchDir: HERE,
    date: new Date().toISOString(),
  };
  addFile(MARKER, Buffer.from(JSON.stringify(markerData, null, 2)));
  return { ok, missed, total: shell.length, dictCount: addon.count, appVersion: pkg.version };
}

function readMarker(asar) {
  const buf = asar.files.get(MARKER);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    return {};
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  log('Antigravity 简体中文汉化补丁 v' + PATCH_VERSION + (AUTO ? '（自动模式）' : ''));
  const dir = findInstallDir();
  if (!dir) fail('找不到 Antigravity 安装目录。请用 --dir 指定，例如：--dir "D:\\Apps\\Antigravity"');
  const asarPath = path.join(dir, 'resources', 'app.asar');
  const bakPath = asarPath + '.zh-cn-backup';
  log('安装目录：' + dir);

  const current = readAsar(asarPath);
  const marker = readMarker(current);

  if (flags.has('--status')) {
    if (marker) log('汉化状态：已汉化（补丁 v' + marker.patch + '，Antigravity ' + marker.appVersion + '）');
    else log('汉化状态：未汉化');
    if (marker && marker.patch !== PATCH_VERSION) log('  本地补丁为 v' + PATCH_VERSION + '，将在 Antigravity 退出后自动应用。');
    return;
  }

  if (AUTO && mode === 'install') {
    const upToDate =
      marker && marker.patch === PATCH_VERSION && !!marker.lang === !!config.lang &&
      !!marker.autoUpdate === !!config.autoUpdate && marker.patchDir === HERE;
    if (upToDate) {
      log('汉化已是最新（v' + PATCH_VERSION + '），无需处理。');
      return;
    }
    log(marker ? '检测到补丁版本变化：' + marker.patch + ' → ' + PATCH_VERSION : '检测到未汉化（可能是 Antigravity 刚更新过）。');
  }

  const pids = runningAntigravityPids();
  if (pids.length && !flags.has('--force')) {
    fail('Antigravity 正在运行（PID ' + pids.join(', ') + '）。请先完全退出 Antigravity（包括托盘图标），再重新运行。', EXIT_RUNNING);
  }

  if (mode === 'uninstall') {
    if (!marker) {
      log('当前未安装汉化补丁，无需还原。');
      if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
      return;
    }
    if (!fs.existsSync(bakPath)) fail('找不到备份文件 ' + bakPath + '，无法还原。可重新安装 Antigravity 来恢复英文原版。');
    fs.copyFileSync(bakPath, asarPath);
    fs.unlinkSync(bakPath);
    log('已还原为英文原版。');
    return;
  }

  let source;
  let createdBackup = false;
  if (marker) {
    if (!fs.existsSync(bakPath)) fail('已安装过汉化但备份丢失，无法重新打补丁。请重新安装 Antigravity 后再运行。');
    log('基于备份重新打补丁…');
    source = readAsar(bakPath);
    if (readMarker(source)) fail('备份文件也是已汉化版本，无法继续。请重新安装 Antigravity。');
  } else {
    source = current;
    fs.copyFileSync(asarPath, bakPath);
    createdBackup = true;
    log('已备份原始文件：' + bakPath);
  }

  let r;
  try {
    r = applyPatch(source);
    writeAsar(asarPath, source);
  } catch (e) {
    if (createdBackup) {
      try {
        fs.unlinkSync(bakPath);
      } catch (e2) {}
    }
    throw e;
  }

  log('完成！Antigravity ' + r.appVersion + '，汉化补丁 v' + PATCH_VERSION);
  log('  外壳文字替换：' + r.ok + '/' + r.total);
  log('  界面词典条目：' + r.dictCount);
  if (config.lang) log('  Chromium 界面语言：zh-CN');
  if (r.missed.length) {
    log('  以下条目在当前版本中未找到（已跳过，不影响使用）：');
    for (const m of r.missed) log('    - ' + m);
  }
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {}
}

try {
  main();
  flushLog();
} catch (e) {
  fail(e && e.stack ? e.stack : String(e));
}
