// Antigravity 简体中文界面翻译器（由汉化补丁注入到 preload.js 末尾）。
//
// 运行在 preload 的隔离环境（isolated world）里，通过 MutationObserver 监听 DOM：
//   * 文本节点：去掉首尾空白后与词典「整段精确匹配」才替换，避免误翻用户内容；
//   * 属性：title / placeholder / aria-label / data-tooltip-content；
//   * 跳过代码块、编辑器、终端、Markdown 渲染区（智能体回复正文）等区域。
// 此外还翻译原生右键菜单、系统通知，以及页面里的 confirm/alert 对话框。
/* eslint-disable */
(function () {
  'use strict';
  if (globalThis.__agZhCnLoaded) return;
  globalThis.__agZhCnLoaded = true;

  const PATCH_VERSION = /*__VERSION__*/ '';
  const DICT = /*__DICT__*/ {};
  const TEMPLATES = /*__TEMPLATES__*/ [];
  // 同一英文在不同位置含义不同时使用：[英文, 父元素 CSS 选择器, 译文]，优先于 DICT。
  const CONTEXT = /*__CONTEXT__*/ [];

  const UNIT = { s: '秒', m: '分钟', h: '小时', d: '天', w: '周', mo: '个月', y: '年' };
  const DF_UNIT = { second: '秒', minute: '分钟', hour: '小时', day: '天', week: '周', month: '个月', year: '年' };
  const dfPhrase = (q, n, u) => {
    const num = n === 'a' || n === 'an' ? '1' : n;
    const unit = DF_UNIT[u.replace(/s$/, '')] || u;
    const pre = { about: '大约 ', over: '超过 ', almost: '将近 ', 'less than': '不到 ' }[q || ''] || '';
    return pre + num + ' ' + unit;
  };
  const DF = '(?:(about|over|almost|less than) )?(\\d+|an?) (seconds?|minutes?|hours?|days?|weeks?|months?|years?)';

  // 动态文本的手写规则（优先于模板）。
  const PATTERNS = [
    [/^(\d+)(s|m|h|d|w|mo|y)$/, (_, n, u) => n + ' ' + UNIT[u]],
    [/^(\d+)(s|m|h|d|w|mo|y) ago$/, (_, n, u) => n + ' ' + UNIT[u] + '前'],
    [/^(\d+)(s|m|h|d|w|mo|y) left$/, (_, n, u) => '剩余 ' + n + ' ' + UNIT[u]],
    [new RegExp('^' + DF + ' ago$'), (_, q, n, u) => dfPhrase(q, n, u) + '前'],
    [new RegExp('^in ' + DF + '$'), (_, q, n, u) => dfPhrase(q, n, u) + '后'],
    [new RegExp('^' + DF + '$'), (_, q, n, u) => dfPhrase(q, n, u)],
    [/^less than a minute( ago)?$/, (_, a) => '不到 1 分钟' + (a ? '前' : '')],
    [/^(\d+) (second|minute|hour|day|week|month|year)s? ago$/i, (_, n, u) => n + ' ' + DF_UNIT[u.toLowerCase()] + '前'],
    [/^(\d+(?:\.\d+)?)\s?(sec|secs|min|mins|hr|hrs)$/, (_, n, u) => n + ' ' + ({ sec: '秒', secs: '秒', min: '分钟', mins: '分钟', hr: '小时', hrs: '小时' })[u]],
    [/^(\d+) files?$/, (_, n) => n + ' 个文件'],
    [/^(\d+) (?:more|others?)$/, (_, n) => '另外 ' + n + ' 个'],
    [/^\+(\d+) more$/, (_, n) => '+' + n + ' 个'],
    [/^Step (\d+)$/, (_, n) => '第 ' + n + ' 步'],
    [/^(\d+) steps?$/, (_, n) => n + ' 个步骤'],
    [/^(\d+) agents? running$/, (_, n) => n + ' 个智能体正在运行'],
    [/^(\d+) conversations?$/, (_, n) => n + ' 个对话'],
    [/^(\d+) results?$/, (_, n) => n + ' 个结果'],
    [/^(\d+) comments?$/, (_, n) => n + ' 条评论'],
    [/^(\d+) tools?$/, (_, n) => n + ' 个工具'],
    [/^(\d+) items?$/, (_, n) => n + ' 项'],
    [/^(\d+) selected$/, (_, n) => '已选择 ' + n + ' 项'],
    [/^(\d+) lines?$/, (_, n) => n + ' 行'],
    [/^(\d+) changes?$/, (_, n) => n + ' 处更改'],
  ];

  // ---------------------------------------------------------------------------
  // 词典与模板
  // ---------------------------------------------------------------------------
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const dict = new Map();
  for (const k in DICT) {
    const v = DICT[k];
    if (typeof v === 'string' && v && v !== k) dict.set(norm(k), v);
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tpls = [];
  for (const [en, zh] of TEMPLATES) {
    if (!zh || zh === en) continue;
    const parts = norm(en).split(/(\{\d+\})/);
    let re = '^';
    let lit = '';
    const order = [];
    parts.forEach((p, i) => {
      const m = /^\{(\d+)\}$/.exec(p);
      if (m) {
        // 紧跟在字母后的占位符一般是英文复数后缀 "s"，允许为空。
        const glued = i > 0 && /[A-Za-z]$/.test(parts[i - 1]);
        re += glued ? '(.*?)' : '(.+?)';
        order.push(+m[1]);
      } else {
        re += escapeRe(p);
        if (p.length > lit.length) lit = p;
      }
    });
    if (lit.replace(/[^A-Za-z]/g, '').length < 3) continue;
    try {
      tpls.push({ re: new RegExp(re + '$', 's'), lit, order, zh });
    } catch (e) {}
  }
  // 字面量更长（更具体）的模板优先。
  tpls.sort((a, b) => b.lit.length - a.lit.length);

  const miss = new Set();
  function translateCore(t) {
    const hit = dict.get(t);
    if (hit !== undefined) return hit;
    if (miss.has(t)) return null;
    let out = null;
    if (t.length <= 400 && /[A-Za-z]/.test(t)) {
      for (const [re, rep] of PATTERNS) {
        if (re.test(t)) {
          out = t.replace(re, rep);
          break;
        }
      }
      if (out === null) {
        for (const tp of tpls) {
          if (!t.includes(tp.lit)) continue;
          const m = tp.re.exec(t);
          if (!m) continue;
          out = tp.zh.replace(/\{(\d+)\}/g, (all, i) => {
            const k = tp.order.indexOf(+i);
            if (k < 0) return all;
            const v = m[k + 1];
            if (v === 's' || v === 'es') return ''; // 英文复数后缀
            const nv = norm(v);
            return nv.length < t.length ? translateCore(nv) ?? v : v;
          });
          break;
        }
      }
    }
    if (out === null) {
      if (miss.size > 20000) miss.clear();
      miss.add(t);
    }
    return out;
  }

  const ctx = new Map();
  for (const [en, sel, zh] of CONTEXT) {
    if (!ctx.has(en)) ctx.set(en, []);
    ctx.get(en).push([sel, zh]);
  }

  // 未翻译文本收集器（仅保存在内存中，供维护者通过 DevTools 协议读取，不会上传）。
  const missing = new Set();
  const looksEnglish = (t) => t.length <= 300 && /[A-Za-z]{2}/.test(t) && !/[㐀-鿿]/.test(t);
  function noteMissing(t) {
    if (missing.size < 5000 && looksEnglish(t)) missing.add(t);
  }

  // 保留原文首尾空白。返回 null 表示无需修改。el 为文本所在元素（用于上下文规则）。
  function translate(s, el) {
    if (!s || s.length > 2000) return null;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    let core = m[2];
    if (!core || !/[A-Za-z]/.test(core)) return null;
    if (core.includes('  ') || /[\n\t]/.test(core)) core = norm(core);
    let zh = null;
    const rules = el && ctx.get(core);
    if (rules) {
      for (const [sel, v] of rules) {
        try {
          if (el.matches(sel)) {
            zh = v;
            break;
          }
        } catch (e) {}
      }
    }
    if (zh === null) zh = translateCore(core);
    if (zh === null) {
      noteMissing(core);
      return null;
    }
    return m[1] + zh + m[3];
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  const SKIP_TEXT = [
    'pre', 'code', 'kbd', 'samp', 'textarea', 'script', 'style', 'noscript', 'svg', 'math', 'webview', 'iframe',
    '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]', '[data-lexical-editor]',
    '.md-divider-spacing', '.markdown-body', '.monaco-editor', '.xterm', '.cm-editor', '.katex', '.font-mono',
    '.notranslate', '[translate="no"]',
  ].join(',');
  const SKIP_ATTR = '.md-divider-spacing,.monaco-editor,.xterm,.cm-editor,.notranslate,[translate="no"]';
  const ATTRS = ['title', 'placeholder', 'aria-label', 'data-tooltip-content'];
  const ATTR_SEL = ATTRS.map((a) => '[' + a + ']').join(',');

  const done = new WeakMap(); // 节点 -> 我们最后写入的值，避免重复处理

  function doText(node) {
    const v = node.nodeValue;
    if (done.get(node) === v) return;
    const p = node.parentElement;
    if (!p || p.closest(SKIP_TEXT)) return;
    const zh = translate(v, p);
    if (zh !== null && zh !== v) {
      done.set(node, zh);
      node.nodeValue = zh;
    }
  }

  function doAttrs(el) {
    let skip;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      if (skip === undefined) skip = !!el.closest(SKIP_ATTR);
      if (skip) return;
      const zh = translate(v, el);
      if (zh !== null && zh !== v) el.setAttribute(a, zh);
    }
  }

  const textFilter = {
    acceptNode(n) {
      if (n.nodeType === 1) {
        return n.matches(SKIP_TEXT) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  };

  function doTree(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (root.hasAttributes()) doAttrs(root);
      if (root.closest(SKIP_TEXT)) {
        // 仍然翻译跳过区域内控件的属性（如输入框占位符），但不碰文本。
        if (root.querySelectorAll) for (const el of root.querySelectorAll(ATTR_SEL)) doAttrs(el);
        return;
      }
    }
    if (root.querySelectorAll) for (const el of root.querySelectorAll(ATTR_SEL)) doAttrs(el);
    const doc = root.ownerDocument || root;
    const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, textFilter);
    let n;
    while ((n = w.nextNode())) doText(n);
    // 开放的 shadow root
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) observeRoot(el.shadowRoot);
    }
  }

  function onMutations(records) {
    for (const r of records) {
      if (r.type === 'characterData') {
        doText(r.target);
      } else if (r.type === 'attributes') {
        if (r.target.nodeType === 1) doAttrs(r.target);
      } else {
        for (const n of r.addedNodes) doTree(n);
      }
    }
  }

  const observed = new WeakSet();
  function observeRoot(root) {
    if (observed.has(root)) return;
    observed.add(root);
    const mo = new MutationObserver(onMutations);
    mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    doTree(root);
  }

  function start() {
    try {
      observeRoot(document);
    } catch (e) {
      console.error('[zh-CN] translator failed to start', e);
    }
  }
  // 供 tools/check.mjs 单元测试使用
  if (globalThis.__AGZH_TEST__) {
    globalThis.__AGZH_TEST__.translate = translate;
    return;
  }

  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });

  // ---------------------------------------------------------------------------
  // 供 preload 其他部分使用：原生右键菜单、系统通知
  // ---------------------------------------------------------------------------
  const tr = (s) => (typeof s === 'string' ? translate(s) ?? s : s);
  globalThis.__agZhMenu = function zhMenu(items) {
    if (!Array.isArray(items)) return items;
    return items.map((it) => {
      if (!it || typeof it !== 'object') return it;
      const o = { ...it };
      if (typeof o.label === 'string') o.label = tr(o.label);
      if (Array.isArray(o.submenu)) o.submenu = zhMenu(o.submenu);
      return o;
    });
  };
  globalThis.__agZhNotification = function (opts) {
    if (!opts || typeof opts !== 'object') return opts;
    return { ...opts, title: tr(opts.title), body: tr(opts.body) };
  };

  // 页面主环境里的 window.confirm / alert / prompt；以及给维护者用的 window.__agZhCn
  try {
    const dialogDict = {};
    for (const [k, v] of dict) if (k.length > 12 && /[?!.]$/.test(k)) dialogDict[k] = v;
    const cb = require('electron').contextBridge;
    cb.exposeInMainWorld('__agZhCn', {
      version: PATCH_VERSION,
      missing: () => [...missing],
      clearMissing: () => missing.clear(),
      stats: () => ({ exact: dict.size, templates: tpls.length, context: CONTEXT.length, missing: missing.size }),
    });
    if (cb && typeof cb.executeInMainWorld === 'function') {
      cb.executeInMainWorld({
        func: (d) => {
          const t = (s) => (typeof s === 'string' && Object.prototype.hasOwnProperty.call(d, s.trim()) ? d[s.trim()] : s);
          for (const name of ['confirm', 'alert', 'prompt']) {
            const orig = window[name];
            if (typeof orig !== 'function') continue;
            window[name] = function (msg, ...rest) {
              return orig.call(this, t(msg), ...rest);
            };
          }
        },
        args: [dialogDict],
      });
    }
  } catch (e) {}
})();
