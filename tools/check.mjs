// Validate the dictionary and run translator unit tests. Used by CI.
//
//   node tools/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ROOT, loadDict, loadIgnore, placeholders } from './lib.mjs';

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error('FAIL', msg);
};

// ---- dictionary ----------------------------------------------------------
const dict = loadDict();
for (const [en, zh] of Object.entries(dict.exact)) {
  if (typeof zh !== 'string' || !zh.trim()) fail(`exact: empty translation for ${JSON.stringify(en)}`);
  if (/\{\d+\}/.test(en)) fail(`exact: key with placeholder belongs in templates: ${JSON.stringify(en)}`);
}
for (const [en, zh] of Object.entries(dict.templates)) {
  if (!/\{\d+\}/.test(en)) fail(`templates: key without placeholder: ${JSON.stringify(en)}`);
  if (placeholders(en) !== placeholders(zh)) fail(`templates: placeholder mismatch: ${JSON.stringify(en)} -> ${JSON.stringify(zh)}`);
}
for (const c of dict.context) {
  if (!Array.isArray(c) || c.length !== 3 || c.some((x) => typeof x !== 'string' || !x)) fail(`context: bad entry ${JSON.stringify(c)}`);
}
const ignore = loadIgnore();
for (const k of ignore) if (k in dict.exact || k in dict.templates) fail(`ignore.json and dict both contain ${JSON.stringify(k)}`);

// ---- shell replacements --------------------------------------------------
const require = createRequire(import.meta.url);
const shell = require(path.join(ROOT, 'zh-cn', 'shell.js'));
for (const e of shell) if (!Array.isArray(e) || e.length !== 3 || e.some((x) => typeof x !== 'string')) fail(`shell.js: bad entry ${JSON.stringify(e)}`);

// ---- build translator exactly like patcher.js and test it -----------------
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const lit = (o) => JSON.stringify(o).split(LS).join('\\u' + '2028').split(PS).join('\\u' + '2029');
let src = fs.readFileSync(path.join(ROOT, 'zh-cn', 'translator.js'), 'utf8');
for (const [ph, val] of [
  ["/*__VERSION__*/ ''", lit('test')],
  ['/*__DICT__*/ {}', lit(dict.exact)],
  ['/*__TEMPLATES__*/ []', lit(Object.entries(dict.templates))],
  ['/*__CONTEXT__*/ []', lit(dict.context)],
]) {
  if (!src.includes(ph)) fail(`translator.js: missing placeholder ${ph}`);
  src = src.replace(ph, () => val);
}
const sandbox = { __AGZH_TEST__: {}, console };
sandbox.globalThis = sandbox;
try {
  vm.runInNewContext(src, sandbox, { filename: 'translator.js' });
} catch (e) {
  fail('translator.js failed to evaluate: ' + e.stack);
}
const translate = sandbox.__AGZH_TEST__.translate;
const el = (matches) => ({ matches: (sel) => matches.some((m) => sel.includes(m)) });
const cases = [
  ['Settings', null, '设置'],
  ['  Settings ', null, '  设置 '],
  ['2mo', null, '2 个月'],
  ['3d ago', null, '3 天前'],
  ['about 2 hours ago', null, '大约 2 小时前'],
  ['Resets in 3 hours', null, '3 小时后重置'],
  ['New', el(['rounded']), '新'],
  ['Weekly Limit Remaining', null, '本周剩余额度'],
  ['Hello there, this is user content', null, null],
  ['', null, null],
];
if (typeof translate === 'function') {
  for (const [input, e, want] of cases) {
    const got = translate(input, e);
    if (got !== want) fail(`translate(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  // every template must match its own English text (with sample values)
  let bad = 0;
  for (const en of Object.keys(dict.templates)) {
    const sample = en.replace(/\{(\d+)\}/g, (m, i, off) => (/[A-Za-z]$/.test(en.slice(0, off)) ? 's' : 'X' + i));
    if (translate(sample) === null) bad++;
  }
  if (bad > 40) fail(`${bad} templates do not match their own sample text`);
} else fail('translator.js did not expose translate() in test mode');

// ---- other scripts parse --------------------------------------------------
for (const f of ['patcher.js', 'zh-cn/hook.js', 'zh-cn/shell.js']) {
  try {
    new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  } catch (e) {
    fail(`${f}: ${e.message}`);
  }
}

console.log(
  failures ? `${failures} problem(s)` : 'OK',
  `- exact ${Object.keys(dict.exact).length}, templates ${Object.keys(dict.templates).length}, context ${dict.context.length}, ignored ${ignore.size}, shell ${shell.length}`,
);
process.exit(failures ? 1 : 0);
