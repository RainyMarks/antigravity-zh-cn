// 外观设置界面：同一组控件出现在两处——
//   1. Antigravity「设置 → 外观」页里，紧跟在原生的「浅色主题 / 深色主题」分区后面；
//   2. Ctrl+Alt+T 打开的浮动面板（设置页结构将来变化、找不到插入位置时依然可用）。
// 另有第一次启用时的提示卡片（intro）。
// 控件放在 Shadow DOM 里，宿主的样式规则不会影响它；颜色、圆角全部取自宿主的设计变量和 --agzh-* 质感变量，
// 所以面板本身也会随配色变化（自定义属性会穿过 Shadow DOM 边界继承下来）。
'use strict';

const ANCHOR = 'span[id^="theme-preset-label-"]'; // 原生主题分区里「预设」一行的标签
const RADIUS_OPTIONS = [
  ['compact', '紧凑'],
  ['default', '标准'],
  ['round', '圆润'],
];
const MODE_LABEL = { dark: '深色模式', light: '浅色模式' };

const STYLE = `
:host { display: block; color: var(--foreground); font-size: var(--text-base, 14px); line-height: 1.45; }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; margin: 0; }
button:focus { outline: none; }
button:focus-visible { outline: 2px solid var(--nux-focus-ring, var(--primary)); outline-offset: 2px; }
.card { border: 1px solid var(--border); border-radius: var(--nux-radius-lg, 16px); overflow: hidden; }
.row { padding: 10px 12px; }
.row + .row { border-top: 1px solid var(--border); }
.row-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.label { display: flex; align-items: center; gap: 6px; }
.desc { font-size: var(--text-sm, 12px); color: var(--muted-foreground); margin-top: 2px; }
.badge { font-size: 10px; font-weight: 600; line-height: 1; padding: 3px 6px; border-radius: 999px;
  color: var(--secondary-foreground); background: var(--secondary); border: 1px solid var(--border); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px -6px -4px; }
.chip { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 6px; border: 0; border-radius: 12px;
  background: transparent; color: var(--secondary-foreground); font-size: var(--text-sm, 12px); cursor: pointer;
  transition: background-color .15s ease, color .15s ease; }
.chip:hover { background: var(--secondary); color: var(--foreground); }
.chip[aria-checked="true"] { color: var(--foreground); }
.swatch { position: relative; width: 72px; height: 46px; border-radius: 8px; overflow: hidden;
  background: radial-gradient(90% 85% at 70% -10%, var(--sw-glow, transparent), transparent 72%),
    radial-gradient(70% 70% at 100% 110%, var(--sw-glow2, transparent), transparent 70%), var(--sw-bg);
  box-shadow: 0 0 0 1px var(--card-border); transition: box-shadow .15s ease; }
.chip[aria-checked="true"] .swatch { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--primary); }
.swatch i { position: absolute; display: block; }
.swatch .side { inset: 0 auto 0 0; width: 20px; background: var(--sw-side); }
.swatch .l1, .swatch .l2 { left: 28px; height: 4px; border-radius: 2px; background: var(--sw-fg); }
.swatch .l1 { top: 12px; width: 32px; opacity: .85; }
.swatch .l2 { top: 21px; width: 22px; opacity: .45; }
.swatch .accent { right: 8px; bottom: 7px; width: 18px; height: 8px; border-radius: 4px; background: var(--sw-primary); }
.swatch.native { background: linear-gradient(135deg, #1c1c1f 0 50%, #f4f4f5 50% 100%); }
.swatch.native .glyph { inset: 0; display: grid; place-items: center; font-size: 11px; font-weight: 600; letter-spacing: .08em;
  color: #fff; mix-blend-mode: difference; }
.seg { display: inline-flex; padding: 2px; border-radius: 999px; background: var(--secondary); }
.seg button { border: 0; padding: 3px 12px; border-radius: 999px; background: transparent; color: var(--secondary-foreground);
  font-size: var(--text-sm, 12px); cursor: pointer; transition: background-color .15s ease, color .15s ease; }
.seg button[aria-checked="true"] { background: var(--card); color: var(--foreground);
  box-shadow: 0 0 0 1px var(--card-border), 0 1px 2px rgb(0 0 0 / .12); }
.switch { position: relative; flex: none; width: 34px; height: 20px; border: 0; border-radius: 999px; background: var(--secondary);
  box-shadow: inset 0 0 0 1px var(--border); cursor: pointer; transition: background-color .15s ease; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: var(--secondary-foreground); transition: transform .15s ease, background-color .15s ease; }
.switch[aria-checked="true"] { background: var(--primary); box-shadow: none; }
.switch[aria-checked="true"]::after { transform: translateX(14px); background: var(--primary-foreground); }
.foot { margin-top: 10px; font-size: var(--text-xs, 11px); color: var(--muted-foreground); }
kbd { font: inherit; padding: 1px 5px; border-radius: 4px; background: var(--secondary); border: 1px solid var(--border); }
/* 浮动面板 */
.scrim { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; background: var(--scrim, rgb(0 0 0 / .5)); }
.dialog { width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; padding: 18px 18px 14px;
  border-radius: var(--nux-radius-2xl, 24px); background: var(--glass, var(--card));
  box-shadow: inset 0 1px 0 var(--glass-highlight, transparent), 0 0 0 1px var(--agzh-edge, var(--glass-border, var(--border))),
    var(--glass-shadow, 0 20px 44px -12px rgb(0 0 0 / .4)), 0 18px 50px -24px var(--agzh-glow-shadow, transparent); }
/* 第一次启用时的提示卡片 */
.toast { position: fixed; right: 20px; bottom: 56px; z-index: 2147483000; width: min(360px, calc(100vw - 40px));
  padding: 14px 16px 12px; border-radius: var(--nux-radius-xl, 20px); background: var(--glass, var(--card));
  box-shadow: inset 0 1px 0 var(--glass-highlight, transparent), 0 0 0 1px var(--agzh-edge, var(--glass-border, var(--border))),
    0 24px 60px -24px var(--agzh-shadow, rgb(0 0 0 / .45)), 0 14px 40px -22px var(--agzh-glow-shadow, transparent); }
.toast-title { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-size: var(--text-base, 14px); font-weight: 600; }
.toast-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--primary);
  box-shadow: 0 0 10px var(--agzh-glow-shadow, var(--primary)); }
.toast-body { margin: 0; font-size: var(--text-sm, 12px); color: var(--secondary-foreground); }
.toast-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.btn { border: 0; border-radius: 999px; padding: 5px 12px; font-size: var(--text-sm, 12px); cursor: pointer;
  transition: filter .15s ease, background-color .15s ease; }
.btn.ghost { background: var(--secondary); color: var(--foreground); }
.btn.ghost:hover { background: var(--sidebar-secondary, var(--secondary)); }
.btn.primary { background: var(--primary); color: var(--primary-foreground); }
.btn.primary:hover { filter: brightness(1.08); }
.dialog-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
.title { margin: 0; font-size: var(--text-lg, 16px); font-weight: 600; }
.close { width: 28px; height: 28px; border: 0; border-radius: 999px; background: transparent; color: var(--muted-foreground);
  font-size: 18px; line-height: 1; cursor: pointer; }
.close:hover { background: var(--secondary); color: var(--foreground); }
@media (prefers-reduced-motion: no-preference) {
  .scrim { animation: fade .16s ease-out; }
  .dialog, .toast { animation: rise .2s cubic-bezier(.22, 1, .36, 1); }
}
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(6px) scale(.98); } }
`;

/** 创建元素：h('div', { class: 'x', onclick: fn }, child, …) */
function h(doc, tag, attrs, ...children) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) el.append(c);
  return el;
}

/**
 * 一组单选按钮（role="radio"），方向键在组内移动并立即选中，符合 WAI-ARIA 单选组的交互。
 * options: [[value, element]]；返回 { el, set(value) }。
 */
function radioGroup(doc, className, label, options, onPick) {
  const buttons = options.map(([value, content, title]) =>
    h(doc, 'button', { type: 'button', role: 'radio', class: className, title, 'data-value': value, onclick: () => onPick(value) }, content),
  );
  const el = h(doc, 'div', { role: 'radiogroup', 'aria-label': label }, buttons);
  el.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const i = buttons.indexOf(e.target);
    if (!step || i < 0) return;
    e.preventDefault();
    const next = buttons[(i + step + buttons.length) % buttons.length];
    next.focus();
    onPick(next.getAttribute('data-value'));
  });
  return {
    el,
    set(value) {
      for (const b of buttons) {
        const on = b.getAttribute('data-value') === String(value);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      }
    },
  };
}

function swatch(doc, theme) {
  if (!theme) return h(doc, 'span', { class: 'swatch native', 'aria-hidden': 'true' }, h(doc, 'i', { class: 'glyph' }, 'Aa'));
  const s = h(doc, 'span', { class: 'swatch', 'aria-hidden': 'true' },
    h(doc, 'i', { class: 'side' }), h(doc, 'i', { class: 'l1' }), h(doc, 'i', { class: 'l2' }), h(doc, 'i', { class: 'accent' }));
  const c = theme.swatch;
  const vars = [['bg', c.background], ['side', c.sidebar], ['fg', c.foreground], ['primary', c.primary], ['glow', c.glow], ['glow2', c.glow2]];
  for (const [k, v] of vars) if (v) s.style.setProperty('--sw-' + k, v);
  return s;
}

/** 构建控件，返回 { el, refresh() }。 */
function buildControls(doc, api) {
  const refreshers = [];
  const modeRows = {};

  const row = (label, desc, right, below) => {
    const tag = h(doc, 'span', { class: 'badge', hidden: true }, '当前');
    const r = h(doc, 'div', { class: 'row' },
      h(doc, 'div', { class: 'row-head' },
        h(doc, 'div', null, h(doc, 'div', { class: 'label' }, h(doc, 'span', null, label), tag), desc && h(doc, 'div', { class: 'desc' }, desc)),
        right),
      below);
    return { el: r, tag };
  };

  const rows = [];
  for (const mode of ['dark', 'light']) {
    const options = [[ '', [swatch(doc, null), h(doc, 'span', null, '原生')], 'Antigravity 原生配色（沿用上方的预设）']];
    for (const t of api.themes) if (t.mode === mode) options.push([t.id, [swatch(doc, t), h(doc, 'span', null, t.label)], `${t.label} · ${t.description || ''}`]);
    const group = radioGroup(doc, 'chip', MODE_LABEL[mode] + '配色', options, (v) => api.update({ [mode]: v || null }));
    group.el.classList.add('chips');
    const r = row(MODE_LABEL[mode], null, null, group.el);
    modeRows[mode] = r;
    rows.push(r.el);
    refreshers.push((s) => group.set(s[mode] || ''));
  }

  const fx = h(doc, 'button', { type: 'button', role: 'switch', class: 'switch', 'aria-label': '质感效果',
    onclick: () => api.update({ fx: !api.getSettings().fx }) });
  rows.push(row('质感效果', '背景光晕、流光描边的输入框、发光的选中条和更有层次的卡片；只对本补丁的配色生效', fx).el);
  refreshers.push((s) => fx.setAttribute('aria-checked', String(s.fx)));

  const radius = radioGroup(doc, '', '圆角', RADIUS_OPTIONS.map(([v, l]) => [v, l]), (v) => api.update({ radius: v }));
  radius.el.classList.add('seg');
  rows.push(row('圆角', '对话气泡、输入框、卡片等的圆角大小', radius.el).el);
  refreshers.push((s) => radius.set(s.radius));

  const cjk = h(doc, 'button', { type: 'button', role: 'switch', class: 'switch', 'aria-label': '中文字体优化',
    onclick: () => api.update({ cjk: !api.getSettings().cjk }) });
  rows.push(row('中文字体优化', '中文改用常规字重的微软雅黑等字体，避免笔画发细发虚', cjk).el);
  refreshers.push((s) => cjk.setAttribute('aria-checked', String(s.cjk)));

  const el = h(doc, 'div', { class: 'card' }, rows);
  const refresh = () => {
    const s = api.getSettings();
    for (const fn of refreshers) fn(s);
    const mode = api.currentMode();
    for (const m of Object.keys(modeRows)) modeRows[m].tag.hidden = m !== mode;
  };
  refresh();
  return { el, refresh };
}

function footer(doc, api) {
  return h(doc, 'div', { class: 'foot' }, '由汉化补丁 v' + api.version + ' 提供 · 随时按 ', h(doc, 'kbd', null, 'Ctrl'), ' + ', h(doc, 'kbd', null, 'Alt'), ' + ',
    h(doc, 'kbd', null, 'T'), ' 打开此面板');
}

/**
 * 创建带 Shadow DOM 的宿主元素。返回 { host, root, body }：控件放进 body。
 * body 带 translate="no"：面板文字本来就是中文，避免汉化翻译器把 Ctrl、Aa 之类记成「未翻译」
 * （翻译器用 closest() 判断跳过区域，它不会穿过 Shadow DOM 边界，所以属性要加在内部）。
 */
function shadowHost(doc, tag, attrs) {
  const host = h(doc, tag, attrs);
  const root = host.attachShadow({ mode: 'open' }); // 开放模式：便于测试和用开发者工具排查
  const body = h(doc, 'div', { translate: 'no' });
  root.append(h(doc, 'style', null, STYLE), body);
  return { host, root, body };
}

/** 创建面板。env: { document, window }。返回 { toggle, open, close, refresh, isOpen, placeSection, intro }。 */
function createPanel(api, env) {
  const doc = env.document;
  const win = env.window;
  const views = new Set();
  api.onChange(() => {
    for (const v of views) v.refresh();
    if (api.isStored()) hideIntro(); // 在别的窗口里已经确认过
  });

  // ---- 第一次启用时的提示：说明界面为什么变了、在哪里改 ----
  let toast = null;
  function hideIntro() {
    if (!toast) return;
    toast.remove();
    toast = null;
  }
  function intro() {
    const theme = api.themes.find((t) => t.id === api.activeId());
    if (toast || api.isStored() || !theme || !doc.body) return;
    const { host, body } = shadowHost(doc, 'div', { 'data-agzh-panel': 'intro' });
    const done = (openPanel) => {
      api.acknowledge();
      hideIntro();
      if (openPanel) open();
    };
    body.append(
      h(doc, 'div', { class: 'toast', role: 'status' },
        h(doc, 'p', { class: 'toast-title' }, h(doc, 'span', { class: 'toast-dot', 'aria-hidden': 'true' }), `界面换上了「${theme.label}」配色`),
        h(doc, 'p', { class: 'toast-body' },
          '这是汉化补丁新增的外观主题。可以在「设置 → 外观」里更换配色、关闭质感效果或换回原生，也可以随时按 Ctrl + Alt + T。'),
        h(doc, 'div', { class: 'toast-actions' },
          h(doc, 'button', { type: 'button', class: 'btn ghost', onclick: () => done(false) }, '知道了'),
          h(doc, 'button', { type: 'button', class: 'btn primary', onclick: () => done(true) }, '更换配色'))),
    );
    toast = host;
    doc.body.append(host);
  }

  // ---- 设置页中的分区 ----
  let section = null;
  function buildSection() {
    // 外层沿用原生分区的类名（space-y-2 / h3.m-0.font-medium），与上方分区的间距和标题样式一致。
    const { host, body } = shadowHost(doc, 'div', { 'data-agzh-panel': 'settings' });
    const controls = buildControls(doc, api);
    body.append(controls.el, footer(doc, api));
    views.add(controls);
    return h(doc, 'div', { class: 'space-y-2', 'data-agzh-section': '' },
      h(doc, 'div', { class: 'flex flex-col gap-1' },
        h(doc, 'div', { class: 'flex items-center justify-between' }, h(doc, 'h3', { class: 'm-0 font-medium' }, '配色方案'))),
      host);
  }
  function placeSection() {
    const anchors = doc.querySelectorAll(ANCHOR);
    const last = anchors[anchors.length - 1];
    const card = last && last.closest('.agy-card');
    const target = card && card.parentElement;
    if (!target || !target.parentElement) return;
    if (!section) section = buildSection();
    if (target.nextElementSibling !== section) target.after(section);
    for (const v of views) v.refresh();
  }
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    win.requestAnimationFrame(() => {
      pending = false;
      placeSection();
    });
  };
  // 只检查新增的子树，开销与新增节点数量成正比（对话流式输出时几乎为零）。
  const watcher = new win.MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 && n !== section && (n.matches(ANCHOR) || n.querySelector(ANCHOR))) return schedule();
      }
    }
  });
  const startWatching = () => {
    watcher.observe(doc.body, { childList: true, subtree: true });
    if (doc.querySelector(ANCHOR)) schedule();
  };
  if (doc.body) startWatching();
  else doc.addEventListener('DOMContentLoaded', startWatching, { once: true });

  // ---- 浮动面板 ----
  let dialog = null;
  let lastFocus = null;
  function open() {
    if (dialog) return;
    lastFocus = doc.activeElement;
    const { host, root, body } = shadowHost(doc, 'div', { 'data-agzh-panel': 'dialog' });
    const controls = buildControls(doc, api);
    const closeBtn = h(doc, 'button', { type: 'button', class: 'close', 'aria-label': '关闭', onclick: close }, '×');
    const box = h(doc, 'div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'agzh-title' },
      h(doc, 'div', { class: 'dialog-head' }, h(doc, 'div', null, h(doc, 'h2', { class: 'title', id: 'agzh-title' }, '配色方案'),
        h(doc, 'div', { class: 'desc' }, '选择后立即生效，所有窗口同步')), closeBtn),
      controls.el, footer(doc, api));
    const scrim = h(doc, 'div', { class: 'scrim', onclick: (e) => e.target === scrim && close() }, box);
    body.append(scrim);
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        // 焦点留在面板内
        const items = [...root.querySelectorAll('button')].filter((b) => b.tabIndex >= 0);
        const first = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && root.activeElement === first) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && root.activeElement === lastItem) {
          e.preventDefault();
          first.focus();
        }
      }
      e.stopPropagation(); // 不让宿主的快捷键响应面板内的按键
    });
    views.add(controls);
    dialog = { host, controls };
    doc.body.append(host);
    const checked = root.querySelector('[aria-checked="true"]');
    (checked || closeBtn).focus();
  }
  function close() {
    if (!dialog) return;
    views.delete(dialog.controls);
    dialog.host.remove();
    dialog = null;
    if (lastFocus && typeof lastFocus.focus === 'function' && lastFocus.isConnected) lastFocus.focus();
  }

  return {
    open,
    close,
    toggle: () => (dialog ? close() : open()),
    refresh: () => views.forEach((v) => v.refresh()),
    isOpen: () => !!dialog,
    placeSection,
    intro,
  };
}

module.exports = { createPanel, ANCHOR };
