// Collect English text that the installed translator saw on screen but could not translate
// (strings sent by the server, dynamic text, etc.).
//
//   node tools/collect-missing.mjs           -> merges into .work/todo.json
//   node tools/collect-missing.mjs --clear   -> also reset the in-app list afterwards
//
// Requires a patched Antigravity (the translator exposes window.__agZhCn). Browse the
// screens you want to cover first. NOTE: the list can contain your own content
// (conversation titles, file names...) - review .work/todo.json before translating.
import path from 'node:path';
import { connect } from './cdp.mjs';
import { WORK, knownKeys, readJson, writeJson } from './lib.mjs';

const cdp = await connect();
const info = await cdp.evaluate('window.__agZhCn ? { v: window.__agZhCn.version, m: window.__agZhCn.missing() } : null');
if (!info) {
  cdp.close();
  console.error('window.__agZhCn not found - is the zh-CN patch installed and Antigravity restarted?');
  process.exit(1);
}
if (process.argv.includes('--clear')) await cdp.evaluate('window.__agZhCn.clearMissing()');
cdp.close();

const known = knownKeys();
const todoFile = path.join(WORK, 'todo.json');
const todo = new Set(readJson(todoFile, []));
let added = 0;
for (const s of info.m) {
  if (known.has(s) || todo.has(s)) continue;
  todo.add(s);
  added++;
}
writeJson(todoFile, [...todo].sort((a, b) => a.localeCompare(b)));
console.log(`patch v${info.v}: ${info.m.length} untranslated strings seen, ${added} new -> ${todoFile}`);
