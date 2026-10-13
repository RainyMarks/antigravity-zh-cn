// Merge translated strings into zh-cn/dict.json.
//
//   node tools/apply.mjs <translated.json> [more.json ...]
//
// Input: { "English": "中文" }. Special values:
//   null or identical to the key  -> recorded in i18n/ignore.json (intentionally untranslated)
//   "-"                           -> remove the key from the dictionary
// Keys containing {0}, {1}... go to "templates", others to "exact".
import fs from 'node:fs';
import { loadDict, saveDict, loadIgnore, saveIgnore, validatePair, isTemplate, norm } from './lib.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/apply.mjs <translated.json> [...]');
  process.exit(1);
}

const dict = loadDict();
const ignore = loadIgnore();
const stats = { added: 0, updated: 0, ignored: 0, removed: 0, errors: 0 };

for (const f of files) {
  const obj = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (let [en, zh] of Object.entries(obj)) {
    en = norm(en);
    const bucket = isTemplate(en) ? dict.templates : dict.exact;
    if (zh === '-') {
      if (en in bucket) {
        delete bucket[en];
        stats.removed++;
      }
      ignore.delete(en);
      continue;
    }
    if (zh === null || zh === en) {
      delete bucket[en];
      ignore.add(en);
      stats.ignored++;
      continue;
    }
    zh = zh.replace(/您/g, '你');
    const errs = validatePair(en, zh);
    if (errs.length) {
      console.error(`skip ${JSON.stringify(en)}: ${errs.join('; ')}`);
      stats.errors++;
      continue;
    }
    if (en in bucket) {
      if (bucket[en] !== zh) stats.updated++;
    } else stats.added++;
    bucket[en] = zh;
    ignore.delete(en);
  }
}

saveDict(dict);
saveIgnore(ignore);
console.log(stats, {
  exact: Object.keys(dict.exact).length,
  templates: Object.keys(dict.templates).length,
  context: dict.context.length,
});
if (stats.errors) process.exitCode = 1;
