// 由一套配色推导 Antigravity 界面使用的全部设计变量，以及质感效果（theme/skin.css）用的 --agzh-* 变量。
//
// 配色沿用 Antigravity 插件主题的数据格式（plugin.json 里 themes[] 的一项）：
//   { id, label, mode: 'dark' | 'light', seeds: { background, foreground, primary, … }, syntax: { comment, … } }
// 另有补丁自己的扩展字段 fx: { glow }（质感效果的第二种光晕色），不影响与原生格式的兼容。
// Antigravity 2.35 已经实现了插件主题，但只对 Google 内部用户开放（customizations.enablePluginThemes），
// 所以这里按它内置 onyx 主题的同一套规则推导变量，由汉化补丁自己注入；
// 将来该功能对外开放后，同一份数据可以直接做成原生插件主题。
//
// 每个变量分两档 [默认, 高对比度]，对应 Antigravity「设置 → 外观 → 对比度」。
'use strict';

const C = require('./color');

const SEED_KEYS = [
  'background', 'foreground', 'primary', 'primaryForeground', 'codeForeground',
  'link', 'success', 'warning', 'error', 'homeGlow',
  'sidebar', 'card', 'border', 'cardBorder', 'sidebarStrong', 'cardStrong', 'borderStrong', 'cardBorderStrong',
];
const SYNTAX_KEYS = [
  'comment', 'punctuation', 'property', 'deleted', 'inserted', 'tag', 'constant', 'number', 'string',
  'attrName', 'builtin', 'operator', 'variable', 'attrValue', 'keyword', 'function', 'className', 'regex',
];
const MODES = ['dark', 'light'];
const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;

// Antigravity 2.35 onyx 主题的参数，均为 [默认, 高对比度]。
// 「墨色」ink 指配色的前景色：深色模式下用它提亮表面、浅色模式下用它压暗表面，
// onyx 原版分别用的是 #FFFFFF 和 #0A0A0C；改用前景色可以让悬停、边框等半透明层带上配色的色调。
const ONYX = {
  dark: {
    shell: [0.04, 0.046], // 墨色混入背景的比例 → 外壳 / 侧栏
    card: [0.048, 0.066], // → 卡片 / 玻璃面板
    onyx: { frame: [0.024, 0.03], well: [0.04, 0.046], raised: [0.056, 0.07], selected: [0.096, 0.11], key: [0.114, 0.13] },
    text: { secondary: [0.73, 0.91], muted: [0.51, 0.65], placeholder: [0.37, 0.52] }, // 前景混入背景的比例
    overlay: {
      '--sidebar-secondary': [0.09, 0.135],
      '--sidebar-muted': [0.048, 0.08],
      '--secondary': [0.075, 0.115],
      '--muted': [0.042, 0.068],
      '--card-border': [0.08, 0.13],
      '--border': [0.06, 0.11],
      '--glass-border': [0.085, 0.14],
      '--glass-highlight': [0.085, 0.12],
    },
    scrim: ['#000000', [0.64, 0.76]],
    homeGlow: 0.11,
    selection: 0.4,
    commentAnchor: 0.24,
    status: { error: '#DE5555', warning: '#F3C949', link: '#6A9FCB', success: '#7AAE66' },
  },
  light: {
    shell: [0.02, 0.048],
    cardWhite: 0.7, // 卡片 = 背景 30% + 白色 70%
    onyx: { frame: [0.024, 0.048] },
    well: 0.055,
    selected: [0.065, 0.1], // 选中行 = 前景混入侧栏
    text: { secondary: [0.78, 0.88], muted: [0.57, 0.7], placeholder: [0.45, 0.57] },
    overlay: {
      '--sidebar-secondary': [0.075, 0.115],
      '--sidebar-muted': [0.042, 0.07],
      '--secondary': [0.06, 0.095],
      '--muted': [0.038, 0.06],
      '--card-border': [0.07, 0.12],
      '--border': [0.06, 0.11],
      '--glass-border': [0.065, 0.115],
    },
    scrim: [null, [0.28, 0.38]], // null：用墨色
    homeGlow: 0.1,
    selection: 0.34,
    commentAnchor: 0.2,
    status: { error: '#F05151', warning: '#AC830B', link: '#1D588E', success: '#58983F' },
  },
};

/** 检查一套配色的数据格式，返回问题列表（空数组表示没有问题）。 */
function validateTheme(t) {
  const errs = [];
  if (!t || typeof t !== 'object') return ['配色必须是对象'];
  const where = typeof t.id === 'string' ? t.id : '?';
  const err = (msg) => errs.push(`${where}: ${msg}`);
  if (typeof t.id !== 'string' || !ID_RE.test(t.id)) err('id 只能包含小写字母、数字和 -，以字母开头，2–32 个字符');
  if (typeof t.label !== 'string' || !t.label.trim()) err('缺少 label');
  if (!MODES.includes(t.mode)) err('mode 必须是 dark 或 light');
  const seeds = t.seeds || {};
  for (const k of ['background', 'foreground', 'primary']) if (!seeds[k]) err(`缺少 seeds.${k}`);
  for (const [k, v] of Object.entries(seeds)) {
    if (!SEED_KEYS.includes(k)) err(`未知的 seeds.${k}`);
    else if (!C.isColor(v)) err(`seeds.${k} 不是合法颜色：${v}`);
  }
  for (const k of ['background', 'foreground', 'primary', 'sidebar', 'card']) {
    if (seeds[k] && C.isColor(seeds[k]) && C.parse(seeds[k]).a < 1) err(`seeds.${k} 必须是不透明颜色`);
  }
  const syntax = t.syntax || {};
  for (const k of SYNTAX_KEYS) if (!syntax[k]) err(`缺少 syntax.${k}`);
  for (const [k, v] of Object.entries(syntax)) {
    if (!SYNTAX_KEYS.includes(k)) err(`未知的 syntax.${k}`);
    else if (!C.isColor(v)) err(`syntax.${k} 不是合法颜色：${v}`);
  }
  for (const [k, v] of Object.entries(t.fx || {})) {
    if (k !== 'glow') err(`未知的 fx.${k}`);
    else if (!C.isColor(v) || C.parse(v).a < 1) err(`fx.glow 必须是不透明颜色：${v}`);
  }
  return errs;
}

// 各层文字的最低对比度 [默认, 高对比度]，在背景、侧栏、卡片上都要满足（WCAG AA 正文为 4.5）。
// onyx 的固定混合比例是为纯黑/纯白底设计的；配色的底色和前景色更柔和时，按目标对比度加深。
const TEXT_TARGETS = { secondary: [7, 10], muted: [4.6, 6.5], placeholder: [3.1, 4.6] };

/** 在两个候选色中选出与 bg 对比度更高的一个。 */
const pickReadable = (bg, candidates) =>
  candidates.reduce((best, c) => (C.contrast(c, bg) > C.contrast(best, bg) ? c : best));

/**
 * 求前景混入背景的比例 p：不低于 floor，且 mix(fg, bg, p) 在每个 surfaces 上的对比度都不低于 target。
 * p 越大越接近前景色，对比度单调上升，因此二分即可。按取整成 #RRGGBB 之后的颜色判断，保证写出的色值本身达标。
 */
function solveMix(fg, bg, surfaces, target, floor) {
  const rounded = (p) => C.parse(C.format(C.mix(fg, bg, p)));
  const ok = (p) => surfaces.every((s) => C.contrast(rounded(p), C.parse(C.format(s))) >= target);
  if (ok(floor)) return floor;
  if (!ok(1)) return 1;
  let lo = floor;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * 推导一档（level 0 = 默认，1 = 高对比度）的界面变量。
 * 返回 { '--background': '#…', … }，值均为 CSS 颜色字符串。
 */
function deriveLevel(theme, level) {
  const dark = theme.mode === 'dark';
  const P = dark ? ONYX.dark : ONYX.light;
  const s = theme.seeds;
  const pick = (pair) => pair[level];
  const strong = (key) => (level === 1 && s[key + 'Strong']) || s[key];

  const bg = C.parse(s.background);
  const fg = C.parse(s.foreground);
  const primary = C.parse(s.primary);
  const ink = fg;
  const t = {};
  const set = (name, value) => (t[name] = C.format(value));

  set('--background', bg);
  set('--content', bg);
  set('--foreground', fg);
  set('--primary', primary);

  // 外壳、侧栏、卡片
  const shell = strong('sidebar') ? C.parse(strong('sidebar')) : C.mix(ink, bg, pick(P.shell));
  const card = strong('card')
    ? C.parse(strong('card'))
    : dark
      ? C.mix(ink, bg, pick(P.card))
      : C.mix('#FFFFFF', bg, P.cardWhite);
  set('--shell', shell);
  set('--sidebar', shell);
  set('--card', card);
  set('--glass', card);

  // onyx 表面层级（框架、凹槽、凸起、选中、键帽）
  if (dark) {
    // 指定了卡片色时，Antigravity 以卡片为基准重新计算各层（低于卡片亮度的层直接等于卡片）。
    const base = strong('card') ? card : bg;
    const offset = strong('card') ? pick(P.card) : 0;
    for (const [name, pair] of Object.entries(P.onyx)) {
      const pct = Math.max(0, pick(pair) - offset);
      set('--onyx-' + name, pct === 0 ? base : C.mix(ink, base, pct));
    }
  } else {
    set('--onyx-frame', strong('card') ? card : C.mix(ink, bg, pick(P.onyx.frame)));
    set('--onyx-well', C.withAlpha(ink, P.well));
    set('--onyx-raised', card);
    set('--onyx-selected', C.mix(fg, shell, pick(P.selected)));
    set('--onyx-key', card);
  }

  // 文字层级：次要、弱化、占位
  const surfaces = [bg, shell, card];
  const tier = (name) => C.mix(fg, bg, solveMix(fg, bg, surfaces, pick(TEXT_TARGETS[name]), pick(P.text[name])));
  const secondaryFg = tier('secondary');
  set('--secondary-foreground', secondaryFg);
  set('--muted-foreground', tier('muted'));
  set('--placeholder', tier('placeholder'));

  // 半透明层：悬停、选中、边框
  for (const [name, pair] of Object.entries(P.overlay)) set(name, C.withAlpha(ink, pick(pair)));
  if (!dark) set('--glass-highlight', '#FFFFFF');
  if (strong('border')) set('--border', strong('border'));
  if (strong('cardBorder')) {
    set('--card-border', strong('cardBorder'));
    set('--glass-border', strong('cardBorder'));
  }
  set('--scrim', C.withAlpha(P.scrim[0] || ink, pick(P.scrim[1])));

  // 强调色相关
  const primaryFg = s.primaryForeground ? C.parse(s.primaryForeground) : pickReadable(primary, ['#FFFFFF', dark ? bg : fg]);
  set('--primary-foreground', primaryFg);
  set('--code-foreground', s.codeForeground ? C.parse(s.codeForeground) : C.mixOklab(secondaryFg, primary, 0.65));
  set('--home-glow', s.homeGlow ? C.parse(s.homeGlow) : C.withAlpha(primary, P.homeGlow));
  set('--editor-selection-background', C.withAlpha(primary, P.selection));
  set('--editor-comment-selection-background', C.withAlpha(primary, P.commentAnchor));

  for (const k of ['link', 'success', 'warning', 'error']) set('--' + k, s[k] ? C.parse(s[k]) : P.status[k]);
  return t;
}

// ---- 质感效果 ------------------------------------------------------------------------------
// 设计值，均为不透明度（0–1）；成对的是 [默认, 高对比度]。
const FX = {
  dark: {
    stage: [0.32, 0.28], // 舞台区（首页）两团光晕：[主色, 第二色]；实际浓度通常由对比度封顶决定
    ambient: [0.1, 0.1], // 对话区、侧栏背后的两团光晕：[主色, 第二色]
    glowShadow: 0.42, // 输入框、发送按钮、选中指示条下方的同色投影
    edge: [0.22, 0.32], // 亮边：主色与前景色各半
    edgeStrong: [0.6, 0.75], // 聚焦时的亮边、流光描边最亮的一端
    halo: 0.16, // 聚焦光环
    tint: [0.15, 0.04], // 选中行、用户气泡的强调色调：渐变的起点和终点
    sheen: 0.045, // 卡片和输入框顶部的微光（前景色）
    highlight: 0.28, // 发送按钮顶部的高光（白色）
    grid: 0.07, // 首页点阵（前景色）
    shadow: 0.55, // 浮层投影（黑色）
    shadowSoft: 0.28,
    inner: 0.3, // 输入框内凹阴影
  },
  light: {
    stage: [0.18, 0.16],
    ambient: [0.05, 0.05],
    glowShadow: 0.32,
    edge: [0.2, 0.3],
    edgeStrong: [0.55, 0.7],
    halo: 0.14,
    tint: [0.1, 0.03],
    sheen: 0.7, // 白色微光
    highlight: 0.32,
    grid: 0.09,
    shadow: 0.16, // 浅色界面的投影用压暗的主色，带一点配色的色调
    shadowSoft: 0.07,
    inner: 0.02,
  },
};

// 光晕会改变它下面的底色。浓度先取上面的设计值，再按「光晕最亮处」的文字对比度封顶（capAlpha）：
//   ambient 对话区：正文可能正好落在光晕上，与普通底色同一标准（弱化文字仍满足 WCAG AA）；
//   stage   首页顶部这类几乎没有正文的区域：正文 ≥ 7（高对比度 10）、次要文字 ≥ 4.5、弱化文字 ≥ 3；
//   tint    选中行、用户气泡的强调色调：上面是标题和用户的消息，正文 ≥ 7（高对比度 10）、次要文字 ≥ 4.5；
//   surface 卡片顶部的微光：卡片上什么文字都可能有，各级文字的标准与普通底色相同。
// 侧栏的弱化文字在外壳底色上本来就没有余量，所以侧栏背后只加细颗粒、不加光晕。值为 [默认, 高对比度]。
const GLOW_ZONES = {
  ambient: { foreground: [7, 7], secondary: [7, 10], muted: [4.5, 6.5] },
  stage: { foreground: [7, 10], secondary: [4.5, 4.5], muted: [3, 3] },
  tint: { foreground: [7, 10], secondary: [4.5, 4.5] },
  surface: { foreground: [7, 7], secondary: [7, 10], muted: [4.5, 6.5], placeholder: [3, 4.5] },
};
const ZONE_TEXT = {
  foreground: '--foreground',
  secondary: '--secondary-foreground',
  muted: '--muted-foreground',
  placeholder: '--placeholder',
};

/**
 * 一层 color 光晕叠在 surfaces 上时，允许的最大不透明度：不超过 design，且叠加后
 * reqs 中每个 [文字颜色, 最低对比度] 在每个 surface 上都满足。按写出的三位小数向下取整。
 */
function capAlpha(color, surfaces, design, reqs) {
  const ok = (a) =>
    surfaces.every((s) => {
      const under = C.parse(C.format(C.over(C.withAlpha(color, a), s)));
      return reqs.every(([fg, min]) => C.contrast(fg, under) >= min);
    });
  if (ok(design)) return design;
  let lo = 0;
  let hi = design;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 1000) / 1000;
}

/**
 * 发送按钮渐变的另一端：取 glow，必要时向远离 text 的方向（黑或白）加深或提亮，
 * 直到从 start 到它的整条渐变上 text 的对比度都 ≥ min（渐变按 sRGB 插值，中段可能比两端都暗，所以逐点检查）。
 */
function gradientPartner(glow, start, text, min) {
  const away = C.luminance(text) > 0.18 ? '#000000' : '#FFFFFF';
  const candidate = (p) => C.parse(C.format(C.mix(away, glow, p)));
  const ok = (p) => {
    const end = candidate(p);
    for (let i = 0; i <= 10; i++) if (C.contrast(text, C.parse(C.format(C.mix(end, start, i / 10)))) < min) return false;
    return true;
  };
  if (ok(0)) return candidate(0);
  if (!ok(1)) return C.parse(start); // 怎样都达不到：不做渐变
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return candidate(hi);
}

/** 推导一档的质感变量（--agzh-*）。tokens 为同一档的界面变量（deriveLevel 的结果）。 */
function deriveFx(theme, level, tokens) {
  const dark = theme.mode === 'dark';
  const F = dark ? FX.dark : FX.light;
  const pick = (pair) => pair[level];
  const tok = (name) => C.parse(tokens[name]);
  const primary = tok('--primary');
  const fg = tok('--foreground');
  const glow = C.parse((theme.fx && theme.fx.glow) || tokens['--link']);
  const bg = tok('--background');
  const req = (zone) => Object.entries(GLOW_ZONES[zone]).map(([text, pair]) => [tok(ZONE_TEXT[text]), pick(pair)]);
  const t = {};
  const set = (name, value) => (t[name] = C.format(value));
  const alpha = (color, a) => C.withAlpha(color, a);

  // 光晕：都画在主内容区的底色上
  set('--agzh-stage-1', alpha(primary, capAlpha(primary, [bg], F.stage[0], req('stage'))));
  set('--agzh-stage-2', alpha(glow, capAlpha(glow, [bg], F.stage[1], req('stage'))));
  set('--agzh-ambient-1', alpha(primary, capAlpha(primary, [bg], F.ambient[0], req('ambient'))));
  set('--agzh-ambient-2', alpha(glow, capAlpha(glow, [bg], F.ambient[1], req('ambient'))));
  set('--agzh-glow-shadow', alpha(primary, F.glowShadow));

  // 亮边与光环
  const edgeBase = C.mix(primary, fg, 0.5);
  set('--agzh-edge', alpha(edgeBase, pick(F.edge)));
  set('--agzh-edge-strong', alpha(primary, pick(F.edgeStrong)));
  set('--agzh-edge-alt', alpha(glow, pick(F.edgeStrong)));
  set('--agzh-halo', alpha(primary, F.halo));

  // 强调色调：叠在卡片（用户气泡）和选中行上
  const tintSurfaces = [tok('--card'), tok('--onyx-selected')];
  const tintCap = capAlpha(primary, tintSurfaces, F.tint[0], req('tint'));
  set('--agzh-tint', alpha(primary, tintCap));
  set('--agzh-tint-end', alpha(primary, Math.min(F.tint[1], tintCap)));

  // 表面细节
  const sheenColor = dark ? fg : C.parse('#FFFFFF');
  set('--agzh-sheen', alpha(sheenColor, capAlpha(sheenColor, [tok('--card')], F.sheen, req('surface'))));
  set('--agzh-highlight', alpha('#FFFFFF', F.highlight));
  set('--agzh-grid', alpha(fg, F.grid));
  const shadowBase = dark ? C.parse('#000000') : C.mixOklab(primary, '#0A0A0C', 0.35);
  set('--agzh-shadow', alpha(shadowBase, F.shadow));
  set('--agzh-shadow-soft', alpha(shadowBase, F.shadowSoft));
  set('--agzh-inner', alpha(dark ? '#000000' : '#0A0A0C', F.inner));

  // 发送按钮：主色 → 第二色的渐变，按钮上的图标在整条渐变上都清晰
  set('--agzh-accent-2', gradientPartner(glow, primary, tok('--primary-foreground'), 4.5));
  return t;
}

const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/**
 * 推导一套配色的全部变量：
 *   tokens: [默认档, 高对比度档]，Antigravity 的界面变量，写在 <html> 上；
 *   fx:     [默认档, 高对比度档]，质感效果的 --agzh-* 变量，同样写在 <html> 上；
 *   syntax: 代码高亮变量，写在 <body> 上（Antigravity 把它们设在 body 的内联样式里）。
 */
function deriveTokens(theme) {
  const problems = validateTheme(theme);
  if (problems.length) throw new Error('配色数据有误：\n  ' + problems.join('\n  '));
  const syntax = {};
  for (const k of SYNTAX_KEYS) syntax['--syntax-' + kebab(k)] = C.format(theme.syntax[k]);
  syntax['--syntax-default-fg'] = 'var(--foreground)';
  const tokens = [deriveLevel(theme, 0), deriveLevel(theme, 1)];
  const fx = tokens.map((tok, level) => deriveFx(theme, level, tok));
  return { tokens, fx, syntax };
}

module.exports = { SEED_KEYS, SYNTAX_KEYS, MODES, GLOW_ZONES, validateTheme, deriveTokens };
