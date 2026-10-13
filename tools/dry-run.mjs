// Patch a *copy* of the installed Antigravity's app.asar to see whether everything still
// applies (e.g. after an Antigravity update). The real installation is never touched.
//
//   node tools/dry-run.mjs ["C:\path\to\Antigravity"]
//
// Output lists shell.js replacements that no longer match; the patched copy is left in
// .work/dry-run/resources/app.asar for inspection (npx @electron/asar extract ...).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, WORK } from './lib.mjs';

const appDir = process.argv[2] || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity');
const exe = path.join(appDir, 'Antigravity.exe');
let asar = path.join(appDir, 'resources', 'app.asar');
if (!fs.existsSync(exe) || !fs.existsSync(asar)) {
  console.error('Antigravity not found in ' + appDir);
  process.exit(1);
}
// If the installation is already patched, start from its pristine backup.
if (fs.existsSync(asar + '.zh-cn-backup')) asar += '.zh-cn-backup';

const dst = path.join(WORK, 'dry-run');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(path.join(dst, 'resources'), { recursive: true });
fs.copyFileSync(asar, path.join(dst, 'resources', 'app.asar'));
const unpacked = path.join(appDir, 'resources', 'app.asar.unpacked');
if (fs.existsSync(unpacked)) fs.cpSync(unpacked, path.join(dst, 'resources', 'app.asar.unpacked'), { recursive: true });

const r = spawnSync(exe, [path.join(ROOT, 'patcher.js'), '--dir', dst, '--force'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
});
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
