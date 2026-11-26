// 外观主题运行时（由汉化补丁注入 preload.js，运行在 preload 的隔离环境 isolated world 中）。
//
// 配色变量在打补丁时就已全部算好、写进样式表，由 <html> 上的几个属性选中：
//   data-agzh-theme     当前生效的配色 id；未设置时就是 Antigravity 原生配色
//   data-agzh-contrast  strong：Antigravity「设置 → 外观 → 对比度」为高对比度
//   data-agzh-fx        存在时启用质感效果（theme/skin.css）；只在使用补丁配色时设置
//   data-agzh-daypart   morning / noon / afternoon / evening / night：按本地时间选首页问候语，随质感效果一起设置
//   data-agzh-radius    compact / round：圆角风格；未设置时沿用原生
//   data-agzh-cjk       存在时启用中文字体优化
// 运行时只负责：读写设置；跟随 Antigravity 的深浅色和对比度切换这些属性；同步窗口标题栏和底色；
// 第一次启用时提示用户界面变了、去哪里修改。
//
// 依赖全部由调用方传入（见 theme/build.js），便于在 Node 里用假的 DOM 测试。
'use strict';

const STORAGE_KEY = 'agzh.theme';
const CONTRAST_KEY = 'jetski.contrast'; // Antigravity 的对比度设置，'2' 为高对比度
const PRESET_KEYS = { dark: 'theme-preset-dark', light: 'theme-preset-light' }; // Antigravity 原生预设
const RADII = ['compact', 'default', 'round'];
const MODES = ['dark', 'light'];
const SETTING_KEYS = ['dark', 'light', 'radius', 'cjk', 'fx'];
const INTRO_DELAY = 1200; // 首次提示等界面稳定后再出现（毫秒）
const DAYPART_REFRESH = 5 * 60 * 1000; // 问候语时段的刷新间隔（毫秒）

/** 本地时间所处的时段，用来选首页问候语。 */
function daypart(hour) {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 13) return 'noon';
  if (hour >= 13 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

/**
 * 把存储里的设置（JSON 字符串或对象）整理成合法的设置对象。
 * 配色：null 表示用户选了原生；从未设置过、或 id 已经不存在时，用 defaults 里该模式的默认配色。
 */
function normalize(raw, themes, defaults = {}) {
  let o = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch (e) {
      o = null;
    }
  }
  if (!o || typeof o !== 'object') o = {};
  const known = (mode, id) => themes.some((t) => t.id === id && t.mode === mode);
  const palette = (mode) => {
    if (o[mode] === null) return null;
    if (known(mode, o[mode])) return o[mode];
    return known(mode, defaults[mode]) ? defaults[mode] : null;
  };
  return {
    dark: palette('dark'),
    light: palette('light'),
    radius: RADII.includes(o.radius) ? o.radius : 'default',
    cjk: o.cjk !== false,
    fx: o.fx !== false,
  };
}

const sameSettings = (a, b) => SETTING_KEYS.every((k) => a[k] === b[k]);

/** rgb()/rgba() 计算值 → #RRGGBB；半透明或无法识别时返回 null。 */
function toHex(value) {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(String(value).trim());
  if (!m || (m[4] !== undefined && +m[4] < 1)) return null;
  return '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * 启动运行时。env：
 *   document, window   页面对象
 *   ipc                electron.ipcRenderer（可缺省：此时只在内存中保存设置）
 *   data               { version, defaults: { dark, light }, themes: [{ id, label, mode, description, swatch }] }
 *   css                样式表文本
 *   createPanel        (api) => { toggle(), refresh(), intro() }，见 theme/panel.js
 *   now                () => Date（可缺省；测试用来固定时间）
 * 返回供面板和测试使用的 api。
 */
function start(env) {
  const doc = env.document;
  const win = env.window;
  const ipc = env.ipc || null;
  const now = env.now || (() => new Date());
  const themes = env.data.themes;
  const defaults = env.data.defaults || {};
  const listeners = new Set();
  let settings = normalize(null, themes, defaults);
  let stored = false; // 存储里是否已有设置；没有时用的是默认配色，第一次启用要提示用户
  let contrastStrong = false;
  let chromeTimer = null;

  const log = (...a) => win.console && win.console.warn('[zh-CN 外观]', ...a);
  const invoke = (channel, ...args) => {
    if (!ipc) return;
    try {
      Promise.resolve(ipc.invoke(channel, ...args)).catch(() => {});
    } catch (e) {}
  };

  // ---- 设置的读取与保存（存放在 Antigravity 的 app_storage.json，所有窗口共享）----
  function loadFrom(items) {
    if (!items || typeof items !== 'object') return false;
    stored = typeof items[STORAGE_KEY] === 'string';
    settings = normalize(items[STORAGE_KEY], themes, defaults);
    contrastStrong = items[CONTRAST_KEY] === '2';
    return true;
  }
  function save() {
    stored = true;
    invoke('storage:update-items', { [STORAGE_KEY]: JSON.stringify(settings) });
  }

  // ---- 当前状态 ----
  function currentMode() {
    const body = doc.body;
    if (body && body.hasAttribute('data-agy-theme')) return body.classList.contains('dark') ? 'dark' : 'light';
    const scheme = doc.documentElement && doc.documentElement.style.colorScheme;
    if (scheme === 'dark' || scheme === 'light') return scheme;
    return win.matchMedia && win.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  const activeId = () => settings[currentMode()];

  // ---- 把设置映射为 <html> 上的属性 ----
  function setAttr(el, name, value) {
    if (value === null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  function apply() {
    const root = doc.documentElement;
    if (!root) return;
    setAttr(root, 'data-agzh-theme', activeId());
    setAttr(root, 'data-agzh-contrast', contrastStrong ? 'strong' : null);
    const fx = Boolean(settings.fx && activeId());
    setAttr(root, 'data-agzh-fx', fx ? '' : null);
    setAttr(root, 'data-agzh-daypart', fx ? daypart(now().getHours()) : null);
    setAttr(root, 'data-agzh-radius', settings.radius === 'default' ? null : settings.radius);
    setAttr(root, 'data-agzh-cjk', settings.cjk ? '' : null);
  }

  // 平滑切换：用 View Transitions 做一次整页淡入淡出（只截图一次，与页面复杂度无关）。
  function applyAnimated() {
    const root = doc.documentElement;
    const reduce = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!root || reduce || typeof doc.startViewTransition !== 'function') return apply();
    try {
      root.setAttribute('data-agzh-switching', '');
      const vt = doc.startViewTransition(apply);
      const done = () => root.removeAttribute('data-agzh-switching');
      Promise.resolve(vt && vt.finished).then(done, done);
    } catch (e) {
      root.removeAttribute('data-agzh-switching');
      apply();
    }
  }

  // 窗口标题栏按钮区与窗口底色由主进程绘制，需要显式同步。
  // 读取的是页面当前实际生效的颜色，所以切回原生配色时同样适用。
  function syncChrome() {
    const body = doc.body;
    if (!body || !ipc) return;
    const probe = doc.createElement('div');
    probe.style.cssText =
      'position:fixed;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'color:var(--sidebar);background-color:var(--background);border:0 solid var(--secondary-foreground)';
    body.appendChild(probe);
    const cs = win.getComputedStyle(probe);
    const titleBar = toHex(cs.color);
    const symbol = toHex(cs.borderTopColor);
    const surface = toHex(cs.backgroundColor);
    probe.remove();
    if (titleBar && symbol) invoke('window:set-title-bar-overlay', { color: titleBar, symbolColor: symbol });
    if (surface) invoke('wcv:set-theme-color', surface);
  }
  // Antigravity 自己也会在切换主题时同步标题栏，延后执行以保证我们最后写入。
  function syncChromeSoon() {
    if (chromeTimer !== null) win.clearTimeout(chromeTimer);
    chromeTimer = win.setTimeout(() => {
      chromeTimer = null;
      syncChrome();
    }, 60);
  }

  function emit() {
    for (const fn of listeners) {
      try {
        fn(settings);
      } catch (e) {
        log(e);
      }
    }
  }

  // ---- 对外接口（面板使用）----
  const api = {
    version: env.data.version,
    themes,
    getSettings: () => settings,
    isStored: () => stored,
    currentMode,
    activeId,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** 用户看过首次提示：把当前（默认）设置存下来，此后不再提示，默认配色将来调整也不影响这位用户。 */
    acknowledge() {
      if (stored) return;
      save();
      emit();
    },
    update(patch) {
      const next = normalize({ ...settings, ...patch }, themes, defaults);
      if (sameSettings(next, settings)) return;
      const before = activeId();
      settings = next;
      if (activeId() !== before) {
        applyAnimated();
        syncChromeSoon();
      } else apply();
      save();
      emit();
    },
  };

  // ---- 跟随 Antigravity 的变化 ----
  function onStorageChanged(changes) {
    if (!changes || typeof changes !== 'object') return;
    const before = activeId();
    const prev = settings;
    const wasStored = stored;
    if (STORAGE_KEY in changes) {
      settings = normalize(changes[STORAGE_KEY], themes, defaults);
      stored = typeof changes[STORAGE_KEY] === 'string';
    }
    if (CONTRAST_KEY in changes) contrastStrong = changes[CONTRAST_KEY] === '2';
    // 用户在 Antigravity 里选了原生预设：这一模式交还给原生配色，否则选了也看不到效果。
    for (const mode of MODES) {
      if (PRESET_KEYS[mode] in changes && settings[mode]) {
        settings = { ...settings, [mode]: null };
        save();
      }
    }
    apply();
    if (activeId() !== before || CONTRAST_KEY in changes) syncChromeSoon();
    if (!sameSettings(prev, settings) || stored !== wasStored) emit();
  }

  function onModeMaybeChanged() {
    const before = doc.documentElement && doc.documentElement.getAttribute('data-agzh-theme');
    apply();
    if ((before || null) !== activeId()) {
      syncChromeSoon();
      emit();
    }
  }

  // 等 <html> 出现（preload 执行时文档可能还是空的）。
  function whenRoot(cb) {
    if (doc.documentElement) return cb(doc.documentElement);
    const mo = new win.MutationObserver(() => {
      if (!doc.documentElement) return;
      mo.disconnect();
      cb(doc.documentElement);
    });
    mo.observe(doc, { childList: true });
  }

  function observeMode(root) {
    const watch = new win.MutationObserver(onModeMaybeChanged);
    watch.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
    const attachBody = () => {
      if (!doc.body) return false;
      watch.observe(doc.body, { attributes: true, attributeFilter: ['class', 'data-agy-theme'] });
      onModeMaybeChanged();
      maybeIntro();
      return true;
    };
    if (!attachBody()) {
      const waitBody = new win.MutationObserver(() => {
        if (attachBody()) waitBody.disconnect();
      });
      waitBody.observe(root, { childList: true });
    }
  }

  // 第一次启用（存储里还没有设置，正在用默认配色）：界面稳定后提示一次，说明界面为什么变了、在哪里改。
  // 只在能同步读到存储的本地窗口里提示；SSH 等远程窗口读得晚，不打扰。
  let panel = null;
  let loadedSync = false;
  let introScheduled = false;
  function maybeIntro() {
    if (introScheduled || !loadedSync || stored) return;
    introScheduled = true;
    win.setTimeout(() => {
      if (!stored && activeId() && panel && typeof panel.intro === 'function') panel.intro();
    }, INTRO_DELAY);
  }

  // ---- 启动 ----
  if (ipc) {
    let items = null;
    try {
      items = ipc.sendSync('storage:get-items-sync');
    } catch (e) {}
    loadedSync = loadFrom(items);
    if (!loadedSync) {
      // SSH 等远程窗口拿不到同步存储，改为异步读取。
      Promise.resolve(ipc.invoke('storage:get-items'))
        .then((all) => {
          if (loadFrom(all)) {
            apply();
            syncChromeSoon();
            emit();
          }
        })
        .catch(() => {});
    }
    ipc.on('storage:changed', (_event, changes) => {
      try {
        onStorageChanged(changes);
      } catch (e) {
        log(e);
      }
    });
  }

  whenRoot((root) => {
    const style = doc.createElement('style');
    style.id = 'agzh-theme';
    style.textContent = env.css;
    (doc.head || root).appendChild(style);
    apply();
    observeMode(root);
    // 问候语按时段变化：定期重新应用一次（apply 只在属性值变化时才写 DOM）。
    const refresh = () => {
      apply();
      win.setTimeout(refresh, DAYPART_REFRESH);
    };
    win.setTimeout(refresh, DAYPART_REFRESH);
  });

  try {
    panel = env.createPanel ? env.createPanel(api) : null;
  } catch (e) {
    log('面板初始化失败', e);
  }
  // Ctrl+Alt+T：随时打开 / 关闭配色面板。
  win.addEventListener(
    'keydown',
    (e) => {
      if (!panel || e.repeat || !e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey || e.code !== 'KeyT') return;
      e.preventDefault();
      e.stopPropagation();
      panel.toggle();
    },
    true,
  );

  return api;
}

module.exports = { start, normalize, toHex, daypart, STORAGE_KEY };
