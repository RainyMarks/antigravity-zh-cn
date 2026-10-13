// Extract user-visible UI strings from Antigravity's web UI bundle and list the ones
// that are not yet in the dictionary.
//
//   node tools/extract.mjs [bundle.js]        (default: .work/main.js, see fetch-bundle.mjs)
//
// Writes:
//   .work/strings.json  every candidate string with the AST context it was found in
//   .work/todo.json     candidates not yet translated or ignored -> translate these
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { WORK, knownKeys, writeJson, norm } from './lib.mjs';

const src = process.argv[2] || path.join(WORK, 'main.js');
const code = fs.readFileSync(src, 'utf8');
const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });

// Props whose string values are typically rendered.
const UI_KEYS = new Set([
  'label', 'title', 'aria-label', 'ariaLabel', 'placeholder', 'description', 'tooltip', 'tooltipText',
  'displayName', 'shortDisplayName', 'message', 'text', 'accessibilityLabel', 'subLabel', 'header',
  'linkLabel', 'shortLabel', 'emptyText', 'errorMessage', 'submitLabel', 'cancelLabel', 'confirmLabel',
  'confirmText', 'cancelText', 'buttonText', 'buttonLabel', 'subtitle', 'heading', 'helperText', 'hint',
  'emptyMessage', 'emptyStateText', 'actionLabel', 'primaryLabel', 'secondaryLabel', 'caption', 'content',
  'detail', 'body', 'name', 'alt', 'sublabel', 'subtext', 'subTitle', 'tooltipContent', 'emptyTitle',
  'emptyDescription', 'loadingText', 'successMessage', 'warning', 'info', 'error', 'summary', 'details',
  'ctaLabel', 'ctaText', 'okLabel', 'okText', 'saveLabel', 'deleteLabel', 'confirmButtonText',
  'cancelButtonText', 'dialogTitle', 'menuLabel', 'groupLabel', 'sectionTitle', 'tabLabel', 'badge',
  'status', 'statusText', 'prefix', 'suffix', 'value', 'defaultValue', 'reason', 'explanation', 'note',
]);

const out = new Map();
const add = (s, cat) => {
  if (typeof s !== 'string') return;
  if (!out.has(s)) out.set(s, new Set());
  out.get(s).add(cat);
};

function collect(node, cat, depth = 0) {
  if (!node || depth > 6) return;
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string') add(node.value, cat);
      break;
    case 'TemplateLiteral': {
      let i = 0;
      const parts = [];
      node.quasis.forEach((q, idx) => {
        parts.push(q.value.cooked ?? q.value.raw);
        if (idx < node.expressions.length) parts.push(`{${i++}}`);
      });
      add(parts.join(''), cat + ':tpl');
      for (const e of node.expressions) collect(e, cat, depth + 1);
      break;
    }
    case 'ConditionalExpression':
      collect(node.consequent, cat, depth + 1);
      collect(node.alternate, cat, depth + 1);
      break;
    case 'LogicalExpression':
      collect(node.left, cat, depth + 1);
      collect(node.right, cat, depth + 1);
      break;
    case 'SequenceExpression':
      collect(node.expressions.at(-1), cat, depth + 1);
      break;
    case 'ArrayExpression':
      for (const e of node.elements) collect(e, cat, depth + 1);
      break;
  }
}

const keyName = (p) => (p.key && (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null));

walk.full(ast, (node) => {
  if (node.type === 'CallExpression') {
    const c = node.callee;
    const pname = c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
    if (pname === 'createElement' || pname === 'jsx' || pname === 'jsxs') {
      for (const arg of node.arguments.slice(2)) collect(arg, 'child');
      const props = node.arguments[1];
      if (props && props.type === 'ObjectExpression') {
        for (const p of props.properties) if (p.type === 'Property' && keyName(p) === 'children') collect(p.value, 'child');
      }
    }
  } else if (node.type === 'Property') {
    const k = keyName(node);
    if (k && UI_KEYS.has(k)) collect(node.value.type === 'AssignmentPattern' ? node.value.right : node.value, 'prop:' + k);
  } else if (node.type === 'Literal' && typeof node.value === 'string') {
    if (/^[A-Z][a-z']+( [A-Za-z0-9'(),.:;!?&/-]+){1,30}[.!?…]?$/.test(node.value)) add(node.value, 'sentence');
  }
});

// Short capitalized values (enum display maps, return values, arrays, conditionals).
const valueLike = (s) => /^[A-Z][a-z]+(?:[ -][A-Za-z][a-z]*){0,3}[.…]*$/.test(s);
walk.full(ast, (node) => {
  const take = (n, cat) => {
    if (n && n.type === 'Literal' && typeof n.value === 'string' && valueLike(n.value)) add(n.value, cat);
  };
  if (node.type === 'Property') take(node.value, 'value:prop');
  else if (node.type === 'ReturnStatement') take(node.argument, 'value:return');
  else if (node.type === 'ArrayExpression') node.elements.forEach((e) => take(e, 'value:array'));
  else if (node.type === 'ConditionalExpression') {
    take(node.consequent, 'value:cond');
    take(node.alternate, 'value:cond');
  } else if (node.type === 'LogicalExpression' && node.operator !== '&&') take(node.right, 'value:or');
});

// String concatenation: "a"+(x?"b":"c") -> every literal combination; "a"+expr+"b" -> "a{0}b".
function concatForms(node, depth = 0) {
  if (depth > 8) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return [node.value];
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return [node.quasis[0].value.cooked ?? ''];
  if (node.type === 'ConditionalExpression') {
    const a = concatForms(node.consequent, depth + 1);
    const b = concatForms(node.alternate, depth + 1);
    return a && b ? [...a, ...b] : null;
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const l = concatForms(node.left, depth + 1) ?? [null];
    const r = concatForms(node.right, depth + 1) ?? [null];
    const res = [];
    for (const x of l) for (const y of r) {
      if (res.length > 16) break;
      res.push(x === null && y === null ? null : (x ?? '\u0000') + (y ?? '\u0000'));
    }
    return res;
  }
  return null;
}
const innerPlus = new Set();
walk.full(ast, (node) => {
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    for (const c of [node.left, node.right]) if (c.type === 'BinaryExpression' && c.operator === '+') innerPlus.add(c);
  }
});
walk.full(ast, (node) => {
  if (node.type !== 'BinaryExpression' || node.operator !== '+' || innerPlus.has(node)) return;
  for (const f of concatForms(node) || []) {
    if (!f) continue;
    let i = 0;
    const s = f.replace(/\u0000+/g, () => `{${i++}}`);
    if (/[A-Za-z]{3}/.test(s.replace(/\{\d+\}/g, ''))) add(s, i ? 'concat:tpl' : 'concat');
  }
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------
const NOISE = [
  /\bcolou?rs?\b/i,
  /\b(nodes?|edges?|ports?|graphs?|spacing|crossing|layers?|layering|compaction|spanning|hierarch\w*|placement|hypernodes?|leafs|wrapping|aspect ratio|polyomino|straightness|bendpoints?|splines?|orthogonal|cuts?)\b/i,
  /\b(may not|must not|must be|cannot be|not supported|expected|unexpected|undefined|null|proto|protobuf|macro|reducers?|dispatch|router|addon|bitmaps?|prewarm\w*|canvas|disposable|disposing|quantifier|UTF-?8|bit address|circularly|constructor|callback|listener|promise|polyfill|instanceof|typeof|serializ\w*|deserializ\w*|mendel|codeSearch|trajectory not found|pan controller|ecore|elicitation)\b/i,
  /^Style (for|to use)/,
  /\b(Symbols|Diacritical|Syllabics|Supplement|Extended-[A-Z]|Ideographs|Punctuation|Pictographs|Hieroglyphs|Cuneiform)\b/,
  /^(Old|Ancient|Inscriptional) [A-Z]/,
  /\b(LS|RPC|gRPC|IPC|stdin|stdout)\b/,
];
const JS_WORDS = new Set(('Node Object Array Symbol Function Promise Math JSON Infinity NaN Boolean Number String Proxy Reflect Intl Buffer ' +
  'Date Map Set WeakMap WeakSet Element Document Event Range Selection Uint Int Float Big Atomics Module Arguments Generator Iterator ' +
  'Mod Meta Alt Ctrl Control Shift Cmd Command Option Enter Escape Esc Tab Space Backspace Delete Home End Insert PageUp PageDown ' +
  'Up Down Left Right Win Super Hyper Fn CapsLock NumLock ScrollLock Pause Break PrintScreen ' +
  'Mac Linux Windows Darwin Android Ios Chrome Safari Firefox Edge Opera Webkit Blink Gecko Trident Electron Vite Webpack React ' +
  'Mermaid Katex Prism Lexical Monaco Xterm Elk Graph Tree Layer Port Label Spacing').split(/\s+/));
const BRANDS = /^(GitHub|GitLab|YouTube|JavaScript|TypeScript|PowerShell|OpenAI|DeepSeek|LinkedIn|PayPal|WordPress|BigQuery|CodeMirror|WebSocket|MacOS|JetBrains|IntelliJ|PyCharm|WebStorm|GoLand|DataGrip|VSCode|NotebookLM|AppSheet|AlloyDB)$/;

function looksLikeUi(t) {
  if (t.length < 2 || t.length > 400 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^[a-z0-9_-]+$/.test(t) && !/^(on|off|or|and|ago|now|copy|edit|new|delete|undo|redo|open|close|done|save|yes|no)$/.test(t)) return false;
  if (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(t)) return false; // camelCase
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 4) return false; // CONSTANTS
  if (/^(https?:|file:|data:|mailto:|\/|\.\/|#)/.test(t)) return false;
  if (/^[\w.-]+\.(js|ts|tsx|css|json|png|svg|md|html|py|go|proto)$/i.test(t)) return false;
  if (/^[a-z-]+:[a-z0-9-]+/.test(t)) return false; // tailwind variants
  if (/^([a-z0-9!:[\]/.%#@()_-]+\s+){2,}[a-z0-9!:[\]/.%#@()_-]+$/.test(t) && /-/.test(t)) return false; // class lists
  if (/[{};=<>]/.test(t.replace(/\{\d+\}/g, ''))) return false;
  if (/\{\d+\}[A-Za-z0-9./_-]|[A-Za-z0-9./_-]\{\d+\}/.test(t) && !/[a-z]\{\d+\}( |$)/.test(t)) return false; // glued ids
  if (t.replace(/\{\d+\}/g, '').replace(/[^A-Za-z]/g, '').length < 2) return false;
  if (/^[A-Z][a-z]+([A-Z][a-z0-9]*)+$/.test(t) && !BRANDS.test(t)) return false; // PascalCase identifiers
  if (/^[a-z]+(\.[a-z0-9_]+)+$/i.test(t) || /^[A-Za-z0-9_]+\/[A-Za-z0-9_/]+$/.test(t)) return false; // ids / paths
  if (/^--?[a-z]/.test(t) || /^[a-z]+(_[a-z0-9]+)+$/i.test(t)) return false; // flags / snake_case
  return true;
}

const weak = (c) => c === 'sentence' || c.startsWith('value:') || c.startsWith('concat') ||
  ['prop:name', 'prop:value', 'prop:defaultValue', 'prop:status', 'prop:error', 'prop:message'].includes(c);

const rows = [];
for (const [raw, cats] of out) {
  const t = norm(raw);
  if (!looksLikeUi(t)) continue;
  const c = [...cats];
  if (c.every(weak)) {
    if (JS_WORDS.has(t) || /[:'"(\[,]$/.test(t) || NOISE.some((r) => r.test(t))) continue;
    if (c.every((x) => x.startsWith('concat')) && !/^[A-Z{]/.test(t)) continue;
  }
  rows.push({ s: t, c: c.sort() });
}
const merged = new Map();
for (const r of rows) {
  if (merged.has(r.s)) merged.get(r.s).c = [...new Set([...merged.get(r.s).c, ...r.c])].sort();
  else merged.set(r.s, r);
}
const all = [...merged.values()].sort((a, b) => a.s.localeCompare(b.s));
writeJson(path.join(WORK, 'strings.json'), all);

const known = knownKeys();
const todo = all.map((r) => r.s).filter((s) => !known.has(s));
writeJson(path.join(WORK, 'todo.json'), todo);
console.log(`candidates: ${all.length}, already handled: ${all.length - todo.length}, new: ${todo.length}`);
console.log(`-> ${path.join(WORK, 'todo.json')}`);
