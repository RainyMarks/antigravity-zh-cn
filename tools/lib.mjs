// Shared helpers for maintainer tools.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DICT_FILE = path.join(ROOT, 'zh-cn', 'dict.json');
export const IGNORE_FILE = path.join(ROOT, 'i18n', 'ignore.json');
export const WORK = path.join(ROOT, '.work');

export const readJson = (f, dflt) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : dflt);
export const writeJson = (f, o) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');
};

export const norm = (s) => s.replace(/\s+/g, ' ').trim();
export const placeholders = (s) => (s.match(/\{\d+\}/g) || []).sort().join(',');
export const isTemplate = (s) => /\{\d+\}/.test(s);

const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

export function loadDict() {
  const d = readJson(DICT_FILE, {});
  return { exact: d.exact || {}, templates: d.templates || {}, context: d.context || [] };
}

export function saveDict(d) {
  writeJson(DICT_FILE, { exact: sortObj(d.exact), templates: sortObj(d.templates), context: d.context });
}

export function loadIgnore() {
  return new Set(readJson(IGNORE_FILE, []));
}

export function saveIgnore(set) {
  writeJson(IGNORE_FILE, [...set].sort((a, b) => a.localeCompare(b)));
}

/** Every English key already handled (translated or intentionally ignored). */
export function knownKeys() {
  const d = loadDict();
  const set = new Set([...Object.keys(d.exact), ...Object.keys(d.templates), ...loadIgnore()]);
  for (const [en] of d.context) set.add(en);
  return set;
}

/** Problems with a translation pair, or [] when fine. */
export function validatePair(en, zh) {
  const errs = [];
  if (typeof zh !== 'string' || !zh.trim()) errs.push('empty translation');
  else if (placeholders(en) !== placeholders(zh)) errs.push(`placeholder mismatch: ${placeholders(en)} vs ${placeholders(zh)}`);
  return errs;
}
