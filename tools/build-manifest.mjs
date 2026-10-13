// Build manifest.json: patch version + SHA-256 of every file that installed copies download.
//
//   node tools/build-manifest.mjs                     refresh hashes
//   node tools/build-manifest.mjs --bump patch        bump version (patch|minor|major) and refresh
//   node tools/build-manifest.mjs --set 1.2.0         set version
//   node tools/build-manifest.mjs --app 2.24.0        record the Antigravity version it was tested with
//   node tools/build-manifest.mjs --check [--tag v1.2.0]   CI: fail if manifest.json is stale
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, readJson } from './lib.mjs';

// Files an installation needs (downloaded by install.ps1 / agzh.ps1 self-update).
export const FILES = [
  'agzh.ps1',
  'install.ps1',
  'patcher.js',
  '安装汉化.cmd',
  '卸载汉化.cmd',
  'zh-cn/dict.json',
  'zh-cn/hook.js',
  'zh-cn/shell.js',
  'zh-cn/translator.js',
];

const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const file = path.join(ROOT, 'manifest.json');
const old = readJson(file, { version: '0.0.0' });

let version = old.version;
if (opt('--set')) version = opt('--set');
if (opt('--bump')) {
  const p = version.split('.').map(Number);
  const k = { major: 0, minor: 1, patch: 2 }[opt('--bump')];
  if (k === undefined) throw new Error('--bump expects major|minor|patch');
  p[k]++;
  for (let i = k + 1; i < 3; i++) p[i] = 0;
  version = p.join('.');
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('bad version ' + version);

// Windows-side files need specific encodings: agzh.ps1 contains Chinese, so Windows
// PowerShell 5.1 requires a UTF-8 BOM; batch/PowerShell files use CRLF.
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
function normalized(f) {
  let buf = fs.readFileSync(path.join(ROOT, f));
  if (!/\.(ps1|cmd)$/.test(f)) return buf;
  const hadBom = buf.subarray(0, 3).equals(BOM);
  let text = (hadBom ? buf.subarray(3) : buf).toString('utf8').replace(/\r?\n/g, '\r\n');
  const needBom = f.endsWith('.ps1') && /[^\x00-\x7f]/.test(text);
  return Buffer.concat([needBom ? BOM : Buffer.alloc(0), Buffer.from(text, 'utf8')]);
}
const encodingProblems = [];
for (const f of FILES) {
  const want = normalized(f);
  if (!want.equals(fs.readFileSync(path.join(ROOT, f)))) {
    if (args.includes('--check')) encodingProblems.push(`${f}: wrong line endings / BOM - run: node tools/build-manifest.mjs`);
    else fs.writeFileSync(path.join(ROOT, f), want);
  }
}

const files = {};
for (const f of FILES) {
  const buf = fs.readFileSync(path.join(ROOT, f));
  files[f] = crypto.createHash('sha256').update(buf).digest('hex');
}
const manifest = {
  name: 'antigravity-zh-cn',
  version,
  tag: 'v' + version,
  testedAppVersion: opt('--app') || old.testedAppVersion || '',
  files,
};

if (args.includes('--check')) {
  const problems = [...encodingProblems];
  if (JSON.stringify(old.files) !== JSON.stringify(files)) problems.push('file hashes are stale - run: node tools/build-manifest.mjs');
  if (old.tag !== 'v' + old.version) problems.push('tag/version mismatch in manifest.json');
  if (opt('--tag') && opt('--tag') !== old.tag) problems.push(`release tag ${opt('--tag')} != manifest tag ${old.tag}`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('manifest.json OK', old.tag);
} else {
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log('manifest.json', manifest.tag, `(${FILES.length} files)`);
}
