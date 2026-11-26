// Check that everything the theme relies on still exists in the current Antigravity build:
// design tokens, DOM hooks and IPC channels. Run after an Antigravity update.
//
//   npm run fetch-bundle      (downloads .work/main.js, .work/compiled_tailwind.css, ...)
//   node tools/theme-audit.mjs [path\to\Antigravity]
//
// Exits with 1 when something is missing; see docs/THEME.md for what to do then.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, WORK } from './lib.mjs';

const require = createRequire(import.meta.url);
const { deriveTokens } = require(path.join(ROOT, 'theme', 'tokens.js'));
const { loadThemes } = require(path.join(ROOT, 'theme', 'build.js'));

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
const web = ['main.js', 'compiled_tailwind.css', 'jetbox.css'].map((f) => read(path.join(WORK, f)));
if (!web[0] || !web[1]) {
  console.error('Missing .work/main.js or .work/compiled_tailwind.css - run: npm run fetch-bundle');
  process.exit(1);
}
const ui = web.join('\n');

// The Electron shell: prefer the pristine backup when the installation is patched.
const appDir = process.argv[2] || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity');
let asar = path.join(appDir, 'resources', 'app.asar');
if (fs.existsSync(asar + '.zh-cn-backup')) asar += '.zh-cn-backup';
const shell = fs.existsSync(asar) ? fs.readFileSync(asar).toString('latin1') : null;

const theme = loadThemes()[0];
const { tokens, syntax } = deriveTokens(theme);
const base = fs.readFileSync(path.join(ROOT, 'theme', 'base.css'), 'utf8');
const baseVars = [...new Set([...base.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))];

// Everything theme/skin.css hangs on, read from its selectors, so new hooks are audited automatically:
// class names, data attributes (data-testid by value) and the host variables it reads or overrides.
const skin = fs
  .readFileSync(path.join(ROOT, 'theme', 'skin.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/url\([^)]*\)/g, '');
const selectors = [...skin.matchAll(/([^{};]+)\{/g)].map((m) => m[1].trim()).filter((s) => !s.startsWith('@'));
const uniq = (list) => [...new Set(list)];
const skinClasses = uniq(selectors.flatMap((s) => [...s.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])));
const skinAttrs = uniq(
  selectors.flatMap((s) =>
    [...s.matchAll(/\[(data-[\w-]+)(?:="([^"]*)")?\]/g)]
      .filter((m) => !m[1].startsWith('data-agzh-'))
      .map((m) => (m[1] === 'data-testid' ? m[2] : m[1])),
  ),
);
const skinHostVars = uniq([...skin.matchAll(/(--(?!agzh-)[\w-]+)/g)].map((m) => m[1]));

const checks = [
  ...Object.keys(tokens[0]).map((t) => ['design token', t, ui]),
  ...Object.keys(syntax).map((t) => ['syntax token', t, ui]),
  ...baseVars.map((t) => ['token (base.css)', t, ui]),
  ...skinClasses.map((c) => ['class (skin)', c, ui]),
  ...skinAttrs.map((a) => ['attribute (skin)', a, ui]),
  ...skinHostVars.map((v) => ['token (skin)', v, ui]),
  ['font', 'var(--font-sans)', ui],
  ['DOM hook', 'data-agy-theme', ui],
  ['DOM hook', 'data-agy-font', ui],
  ['DOM hook', 'theme-preset-label-', ui],
  ['DOM hook', '.font-sans', ui],
  ['DOM hook', '"dark"', ui],
  ['storage key', 'jetski.contrast', ui],
  ['storage key', 'theme-preset-', ui],
  ...['storage:get-items-sync', 'storage:get-items', 'storage:update-items', 'storage:changed', 'window:set-title-bar-overlay', 'wcv:set-theme-color'].map(
    (c) => ['IPC channel', c, shell],
  ),
];

let missing = 0;
for (const [kind, needle, haystack] of checks) {
  if (haystack === null) {
    console.log(`?  ${kind.padEnd(16)} ${needle}  (app.asar not found in ${appDir})`);
    continue;
  }
  if (!haystack.includes(needle)) {
    missing++;
    console.log(`✗  ${kind.padEnd(16)} ${needle}`);
  }
}
const version = read(path.join(WORK, 'app-version.txt'));
console.log(missing ? `${missing} missing (Antigravity ${version || '?'})` : `OK - ${checks.length} checks (Antigravity ${version || '?'})`);
process.exit(missing ? 1 : 0);
