// 打补丁时（在 Node 中）运行：把外观主题打包成一段追加到 preload.js 末尾的脚本。
//   1. 读取 palettes.json，用 tokens.js 推导每套配色的全部设计变量和质感变量，连同 base.css、skin.css 生成样式表；
//   2. 把 runtime.js、panel.js（CommonJS 写法，不使用 require）包进同一个函数作用域；
//   3. 页面运行时只切换 <html> 上的几个属性，不做任何颜色计算。
// patcher.js 和 tools/check.mjs 都调用这里的函数，保证测试的就是实际注入的代码。
'use strict';

const fs = require('fs');
const path = require('path');
const { deriveTokens, validateTheme, MODES } = require('./tokens');

const DIR = __dirname;
const STYLESHEETS = ['base.css', 'skin.css']; // 手写的样式，按顺序接在生成的配色变量后面

// JSON 字面量；转义 U+2028/U+2029，避免在旧版 JS 引擎里被当成换行。
const literal = (value) =>
  JSON.stringify(value).split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');

/** 读取并校验配色数据，返回 { themes, defaults }。defaults 是从未设置过时各模式默认使用的配色 id。 */
function loadPalettes(dir = DIR) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'palettes.json'), 'utf8'));
  const themes = Array.isArray(data.themes) ? data.themes : [];
  const defaults = data.defaults && typeof data.defaults === 'object' ? data.defaults : {};
  const problems = [];
  const ids = new Set();
  for (const t of themes) {
    problems.push(...validateTheme(t));
    if (ids.has(t.id)) problems.push(`${t.id}: id 重复`);
    ids.add(t.id);
  }
  for (const mode of MODES) {
    if (!themes.some((t) => t.mode === mode)) problems.push(`缺少 ${mode} 配色`);
    const id = defaults[mode];
    if (id !== undefined && id !== null && !themes.some((t) => t.id === id && t.mode === mode)) {
      problems.push(`defaults.${mode} 必须是一套 ${mode} 配色的 id，或 null（默认用原生配色）`);
    }
  }
  if (problems.length) throw new Error('theme/palettes.json 有误：\n  ' + problems.join('\n  '));
  return { themes, defaults: { dark: defaults.dark || null, light: defaults.light || null } };
}

/** 只读取配色列表。 */
const loadThemes = (dir = DIR) => loadPalettes(dir).themes;

const declarations = (obj, important) =>
  Object.entries(obj)
    .map(([k, v]) => `${k}:${v}${important ? ' !important' : ''}`)
    .join(';');

/** 高对比度档相对默认档变化了的变量。 */
const changed = (base, next) => Object.fromEntries(Object.entries(next).filter(([k, v]) => base[k] !== v));

/**
 * 生成配色部分的样式表。
 * 界面变量写在 <html> 上：Antigravity 把同名变量写在 html 的内联样式里，只有 !important 才能盖过；
 * 代码高亮变量写在 <body> 上，原因相同（Antigravity 设在 body 的内联样式里）。
 * 质感变量（--agzh-*）是补丁自己的，没有人和它争，不需要 !important。
 * 高对比度档只输出与默认档不同的变量。
 */
function buildPaletteCss(themes) {
  const out = [];
  for (const t of themes) {
    const { tokens, fx, syntax } = deriveTokens(t);
    const sel = `:root[data-agzh-theme="${t.id}"]`;
    const own = { ...fx[0], '--agzh-grain': `var(--agzh-grain-${t.mode})` };
    out.push(`/* ${t.label}（${t.mode === 'dark' ? '深色' : '浅色'}） */`);
    out.push(`${sel}{${declarations(tokens[0], true)};${declarations(own, false)}}`);
    const strongHost = changed(tokens[0], tokens[1]);
    const strongOwn = changed(fx[0], fx[1]);
    const parts = [];
    if (Object.keys(strongHost).length) parts.push(declarations(strongHost, true));
    if (Object.keys(strongOwn).length) parts.push(declarations(strongOwn, false));
    if (parts.length) out.push(`${sel}[data-agzh-contrast="strong"]{${parts.join(';')}}`);
    out.push(`${sel}>body{${declarations(syntax, true)}}`);
  }
  return out.join('\n');
}

/** 完整样式表：配色变量 + base.css + skin.css。 */
function buildStylesheet(dir = DIR, themes = loadThemes(dir)) {
  const handWritten = STYLESHEETS.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  return [buildPaletteCss(themes), ...handWritten].join('\n');
}

/** 面板需要的配色摘要：名称、说明和预览色块用的几种颜色。 */
function summarize(theme) {
  const { tokens, fx } = deriveTokens(theme);
  const t = tokens[0];
  return {
    id: theme.id,
    label: theme.label,
    mode: theme.mode,
    description: theme.description || '',
    swatch: {
      background: t['--background'],
      sidebar: t['--sidebar'],
      foreground: t['--foreground'],
      primary: t['--primary'],
      glow: fx[0]['--agzh-stage-1'],
      glow2: fx[0]['--agzh-stage-2'],
    },
  };
}

/**
 * 生成注入 preload.js 的脚本。
 * 返回 { code, count, css }：code 为脚本文本，count 为配色数量。
 */
function buildThemeAddon({ version = '', dir = DIR } = {}) {
  const { themes, defaults } = loadPalettes(dir);
  const css = buildStylesheet(dir, themes);
  const data = { version, defaults, themes: themes.map(summarize) };
  const source = (file) => fs.readFileSync(path.join(dir, file), 'utf8');
  const code = `// ==== Antigravity zh-CN patch: theme ====
(function () {
  'use strict';
  if (globalThis.__agzhThemeLoaded) return;
  globalThis.__agzhThemeLoaded = true;
  const modules = {};
  const define = (name, factory) => {
    const module = { exports: {} };
    factory(module);
    modules[name] = module.exports;
  };
  define('panel', function (module) {
${source('panel.js')}
  });
  define('runtime', function (module) {
${source('runtime.js')}
  });
  try {
    const electron = typeof require === 'function' ? require('electron') : null;
    globalThis.__agzhTheme = modules.runtime.start({
      document,
      window,
      ipc: electron && electron.ipcRenderer,
      data: ${literal(data)},
      css: ${literal(css)},
      createPanel: (api) => modules.panel.createPanel(api, { document, window }),
    });
  } catch (e) {
    console.error('[zh-CN 外观] 启动失败', e);
  }
})();
`;
  return { code, count: themes.length, css };
}

module.exports = { STYLESHEETS, loadPalettes, loadThemes, buildPaletteCss, buildStylesheet, summarize, buildThemeAddon };
