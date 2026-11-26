// Tests for the theme (theme/*). Called by tools/check.mjs; reports problems through fail().
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ROOT } from './lib.mjs';
import { createFakeDom, createFakeIpc } from './fake-dom.mjs';

const require = createRequire(import.meta.url);
const C = require(path.join(ROOT, 'theme', 'color.js'));
const { deriveTokens, validateTheme, SYNTAX_KEYS } = require(path.join(ROOT, 'theme', 'tokens.js'));
const build = require(path.join(ROOT, 'theme', 'build.js'));
const runtime = require(path.join(ROOT, 'theme', 'runtime.js'));
const panelModule = require(path.join(ROOT, 'theme', 'panel.js'));

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Style rules of a stylesheet: [{ selector, body, at }] where `at` lists the enclosing at-rules. */
function cssRules(text) {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      stack.push({ head: css.slice(start, i).trim(), from: i + 1 });
      start = i + 1;
    } else if (css[i] === '}') {
      const top = stack.pop();
      if (top && !top.head.startsWith('@')) {
        rules.push({ selector: top.head, body: css.slice(top.from, i), at: stack.map((s) => s.head) });
      }
      start = i + 1;
    } else if (css[i] === ';' && (!stack.length || stack[stack.length - 1].head.startsWith('@'))) {
      start = i + 1;
    }
  }
  return rules;
}
const propertiesOf = (body) =>
  body
    .split(';')
    .map((d) => d.split(':')[0].trim())
    .filter(Boolean);

/** Find the first element below `root` (shadow roots included) whose class list contains every class in `cls`. */
const findByClass = (root, cls) => root.descendants().find((el) => cls.split(' ').every((c) => el.classList.contains(c)));

export async function runThemeTests(fail) {
  let checks = 0;
  const expect = (cond, msg) => {
    checks++;
    if (!cond) fail('theme: ' + msg);
  };
  const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

  // ---- color.js ----------------------------------------------------------
  expect(C.format(C.mix('#FFFFFF', '#000000', 0.5)) === '#808080', 'mix() should match color-mix(in srgb)');
  expect(C.format(C.mix('#FF0000', 'transparent', 0.11)) === 'rgb(255 0 0 / 0.11)', 'mix() with transparent keeps the hue');
  expect(C.format(C.over('rgb(255 255 255 / 0.5)', '#000000')) === '#808080', 'over() composites alpha');
  expect(near(C.contrast('#000000', '#FFFFFF'), 21), 'contrast(black, white) = 21');
  expect(near(C.contrast('#777777', '#FFFFFF'), 4.48), 'contrast(#777, white) ~ 4.48');
  expect(C.format(C.parse('#abc')) === '#AABBCC' && C.parse('rgb(1 2 3 / 50%)').a === 0.5, 'parse() short hex and rgb()');
  expect(!C.isColor('#12345') && !C.isColor('rgb(300 0 0)') && C.isColor('transparent'), 'isColor() rejects invalid colors');
  expect(C.format(C.mixOklab('#FF0000', '#0000FF', 1)) === '#FF0000', 'mixOklab() endpoints');
  const lab = C.toOklab('#336699');
  expect(C.format(C.fromOklab(lab)) === '#336699', 'OKLab round trip');

  // ---- palettes ------------------------------------------------------------
  let themes = [];
  let defaults = {};
  try {
    ({ themes, defaults } = build.loadPalettes());
  } catch (e) {
    fail('theme: ' + e.message);
  }
  expect(validateTheme({ id: 'X', mode: 'dim', seeds: {} }).length >= 4, 'validateTheme() reports bad data');
  expect(validateTheme({ ...themes[0], fx: { glow: 'nope', sparkle: '#fff' } }).length === 2, 'validateTheme() checks the fx extension');
  for (const mode of ['dark', 'light']) {
    expect(themes.some((t) => t.id === defaults[mode] && t.mode === mode), `defaults.${mode} names a ${mode} palette`);
  }
  const tokenNames = themes.length ? Object.keys(deriveTokens(themes[0]).tokens[0]).sort().join() : '';
  const fxNames = themes.length ? Object.keys(deriveTokens(themes[0]).fx[0]).sort().join() : '';
  for (const t of themes) {
    const { tokens, fx, syntax } = deriveTokens(t);
    for (const [level, tok] of tokens.entries()) {
      const name = `${t.id}${level ? ' (strong)' : ''}`;
      const f = fx[level];
      expect(Object.keys(tok).sort().join() === tokenNames, `${name}: token set differs from the other palettes`);
      expect(Object.keys(f).sort().join() === fxNames, `${name}: fx token set differs from the other palettes`);
      for (const [k, v] of Object.entries({ ...tok, ...f })) expect(C.isColor(v), `${name}: ${k} is not a color: ${v}`);
      const bg = tok['--background'];
      const surfaces = { background: bg, sidebar: tok['--sidebar'], card: tok['--card'] };
      const min = (fg, target, on = surfaces) => {
        for (const [where, s] of Object.entries(on)) {
          const c = C.contrast(fg, s);
          expect(c >= target, `${name}: ${fg === tok['--foreground'] ? 'foreground' : fg} on ${where} ${c.toFixed(2)} < ${target}`);
        }
      };
      // WCAG AA (4.5:1) for body text everywhere; stricter tiers for the strong level.
      min(tok['--foreground'], 7);
      min(tok['--secondary-foreground'], level ? 10 : 7);
      min(tok['--muted-foreground'], level ? 6.5 : 4.5);
      min(tok['--placeholder'], level ? 4.5 : 3);
      min(tok['--primary-foreground'], 4.5, { primary: tok['--primary'] });
      min(tok['--primary'], 3, { background: bg });
      for (const k of ['--link', '--success', '--warning', '--error']) min(tok[k], 4.5, { background: bg });

      // ---- the skin's overlays keep text readable (thresholds as documented in docs/THEME.md) ----
      const under = (overlay, surface) => C.format(C.over(f[overlay], surface));
      const text = { fg: tok['--foreground'], secondary: tok['--secondary-foreground'], muted: tok['--muted-foreground'], placeholder: tok['--placeholder'] };
      const zone = (label, overlays, surfaces, targets) => {
        for (const o of overlays) {
          for (const [where, s] of Object.entries(surfaces)) {
            for (const [tier, target] of Object.entries(targets)) {
              const c = C.contrast(text[tier], under(o, s));
              expect(c >= target, `${name}: ${tier} text under ${o} on ${where} (${label}) ${c.toFixed(2)} < ${target}`);
            }
          }
        }
      };
      // Conversation area: the same standard as the plain background.
      zone('ambient', ['--agzh-ambient-1', '--agzh-ambient-2'], { background: bg }, { fg: 7, secondary: level ? 10 : 7, muted: level ? 6.5 : 4.5 });
      // Home "stage" (almost no running text): body text 7 (10), secondary 4.5, muted 3.
      zone('stage', ['--agzh-stage-1', '--agzh-stage-2'], { background: bg }, { fg: level ? 10 : 7, secondary: 4.5, muted: 3 });
      // Tinted selected rows and user bubbles: titles and the user's own message.
      zone('tint', ['--agzh-tint'], { card: tok['--card'], 'selected row': tok['--onyx-selected'] }, { fg: level ? 10 : 7, secondary: 4.5 });
      // Sheen on cards: anything can sit on a card.
      zone('sheen', ['--agzh-sheen'], { card: tok['--card'] }, { fg: 7, secondary: level ? 10 : 7, muted: level ? 6.5 : 4.5, placeholder: level ? 4.5 : 3 });
      // Send button: its icon stays readable along the whole gradient (sRGB interpolation, sampled).
      for (let i = 0; i <= 10; i++) {
        const stop = C.format(C.mix(f['--agzh-accent-2'], tok['--primary'], i / 10));
        const c = C.contrast(tok['--primary-foreground'], stop);
        expect(c >= 4.5, `${name}: send button icon on its gradient at ${i * 10}% ${c.toFixed(2)} < 4.5`);
      }
      // Home greeting: gradient text (foreground → primary → accent-2), large text needs 3:1 under the brightest glow.
      for (const g of ['--agzh-stage-1', '--agzh-stage-2']) {
        for (const color of [tok['--foreground'], tok['--primary'], f['--agzh-accent-2']]) {
          const c = C.contrast(color, under(g, bg));
          expect(c >= 3, `${name}: greeting colour ${color} under ${g} ${c.toFixed(2)} < 3`);
        }
      }
    }
    // Code blocks sit on --secondary over the background.
    const codeBg = C.format(C.over(tokens[0]['--secondary'], tokens[0]['--background']));
    for (const k of SYNTAX_KEYS) {
      const name = '--syntax-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
      const c = C.contrast(syntax[name], codeBg);
      const target = k === 'comment' ? 3.5 : 4.5;
      expect(c >= target, `${t.id}: syntax.${k} on code blocks ${c.toFixed(2)} < ${target}`);
    }
  }

  // ---- stylesheet -------------------------------------------------------------
  const css = themes.length ? build.buildStylesheet() : '';
  const depth = [...css.replace(/\/\*[\s\S]*?\*\//g, '')].reduce((d, ch) => (d < 0 ? d : d + (ch === '{') - (ch === '}')), 0);
  expect(depth === 0, 'stylesheet has unbalanced braces');
  expect(!/undefined|NaN|\[object/.test(css), 'stylesheet contains undefined / NaN');
  for (const t of themes) expect(css.includes(`[data-agzh-theme="${t.id}"]`), `stylesheet lacks rules for ${t.id}`);
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const file of build.STYLESHEETS) {
    const text = fs.readFileSync(path.join(ROOT, 'theme', file), 'utf8');
    expect(!stripComments(text).includes('!important'), `${file} should not need !important`);
  }
  // Every --agzh-* variable the stylesheet uses is defined somewhere in it.
  const defined = new Set([...stripComments(css).matchAll(/(--agzh-[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const used of new Set([...stripComments(css).matchAll(/var\((--agzh-[\w-]+)/g)].map((m) => m[1]))) {
    expect(defined.has(used), `stylesheet uses ${used} but never defines it`);
  }

  // ---- skin.css follows its own rules (see the header of theme/skin.css) -------------
  {
    const skin = fs.readFileSync(path.join(ROOT, 'theme', 'skin.css'), 'utf8');
    // Properties that change layout are allowed only on the decorative pseudo-elements.
    const LAYOUT = /^(margin|padding|width|height|min-|max-|display|flex|grid|gap|position|top|right|bottom|left|inset|float|order|align-|justify-|font-size|line-height|letter-spacing|transform|overflow|white-space|text-overflow|z-index)/;
    for (const { selector, body } of cssRules(skin)) {
      const selectors = selector.split(/,(?![^(]*\))/).map((s) => s.trim());
      const props = propertiesOf(body);
      const onlyVariables = props.every((p) => p.startsWith('--'));
      expect(
        selectors.every((s) => s.startsWith(':root[data-agzh-fx]')) || (selector === ':root' && onlyVariables),
        `skin.css: "${selector.slice(0, 80)}" is not scoped to :root[data-agzh-fx]`,
      );
      const pseudo = selectors.every((s) => /::(before|after)$/.test(s));
      for (const p of props) expect(pseudo || !LAYOUT.test(p), `skin.css: "${p}" changes layout on a real element (${selector.slice(0, 60)})`);
      expect(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(body.replace(/url\([^)]*\)/g, '').replace(/(mask-image\s*:[^;]*)/g, '')), `skin.css: hard-coded colour in "${selector.slice(0, 60)}"`);
    }
  }

  // ---- everything the patcher reads ships with the patch -------------------------------
  {
    const shipped = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).files);
    const needed = ['build.js', 'color.js', 'tokens.js', 'palettes.json', 'runtime.js', 'panel.js', ...build.STYLESHEETS];
    for (const f of needed) expect(shipped.includes('theme/' + f), `manifest.json lacks theme/${f} (add it to tools/build-manifest.mjs)`);
  }

  // ---- runtime.js: settings -----------------------------------------------------
  const list = themes.map(({ id, label, mode }) => ({ id, label, mode }));
  const n = (raw) => runtime.normalize(raw, list, defaults);
  expect(
    JSON.stringify(n('{bad json')) === JSON.stringify({ dark: defaults.dark, light: defaults.light, radius: 'default', cjk: true, fx: true }),
    'normalize() falls back to the default palettes',
  );
  expect(n({ dark: null }).dark === null && n({ dark: null }).light === defaults.light, 'normalize() keeps an explicit "native" choice');
  expect(n({ dark: 'xuanzhi' }).dark === defaults.dark, 'normalize() rejects a light palette for dark mode');
  expect(runtime.normalize({}, list).dark === null, 'normalize() without defaults means native');
  expect(n({ dark: 'moyu', radius: 'huge', cjk: false }).radius === 'default' && n({ cjk: false }).cjk === false, 'normalize() radius / cjk');
  expect(n({ fx: false }).fx === false && n({ fx: 'yes' }).fx === true, 'normalize() fx');
  expect(runtime.toHex('rgb(13, 18, 16)') === '#0D1210' && runtime.toHex('rgba(0, 0, 0, 0.5)') === null, 'toHex()');
  expect(
    [5, 11, 13, 18, 23, 4].map(runtime.daypart).join() === 'morning,noon,afternoon,evening,night,night',
    'daypart() splits the day',
  );

  // ---- runtime.js: behaviour in a fake page -------------------------------------
  {
    const dom = createFakeDom({ withRoot: false });
    const ipc = createFakeIpc({ 'agzh.theme': JSON.stringify({ dark: 'moyu', light: 'xuanzhi' }), 'jetski.contrast': '2' });
    let toggled = 0;
    const api = runtime.start({
      document: dom.document,
      window: dom.window,
      ipc,
      data: { version: 't', defaults, themes: list },
      css: '/* css */',
      createPanel: () => ({ toggle: () => toggled++ }),
      now: () => new Date(2026, 10, 26, 21, 30),
    });
    // preload runs before <html> exists
    dom.buildTree({ dark: true });
    dom.flush();
    const html = () => dom.document.documentElement;
    expect(dom.document.head.querySelector('style#agzh-theme')?.textContent === '/* css */', 'runtime inserts the stylesheet');
    expect(html().getAttribute('data-agzh-theme') === 'moyu', 'runtime applies the dark palette');
    expect(html().getAttribute('data-agzh-contrast') === 'strong' && html().hasAttribute('data-agzh-cjk'), 'runtime applies contrast / cjk');
    expect(html().hasAttribute('data-agzh-fx') && html().getAttribute('data-agzh-daypart') === 'evening', 'runtime turns on the skin and picks the greeting');
    expect(api.isStored(), 'stored settings are recognised');

    dom.document.body.classList.toggle('dark', false); // Antigravity switched to light mode
    dom.flush();
    expect(html().getAttribute('data-agzh-theme') === 'xuanzhi', 'runtime follows the light/dark mode');
    await tick(100);
    expect(ipc.calls.some(([ch, o]) => ch === 'window:set-title-bar-overlay' && o.color === '#161B19'), 'runtime syncs the title bar');
    expect(ipc.calls.some(([ch, c]) => ch === 'wcv:set-theme-color' && c === '#0D1210'), 'runtime syncs the window surface');

    api.update({ light: null, radius: 'round' });
    expect(!html().hasAttribute('data-agzh-theme') && html().getAttribute('data-agzh-radius') === 'round', 'update() applies at once');
    expect(JSON.parse(ipc.items['agzh.theme']).light === null, 'update() saves the settings');
    expect(!html().hasAttribute('data-agzh-fx') && !html().hasAttribute('data-agzh-daypart'), 'the skin needs a patch palette');

    ipc.emit({ 'agzh.theme': JSON.stringify({ dark: 'hupo', light: 'yuebai' }) }); // another window
    expect(html().getAttribute('data-agzh-theme') === 'yuebai' && api.getSettings().dark === 'hupo', 'runtime syncs settings across windows');

    ipc.emit({ 'theme-preset-light': 'One Light' }); // the user picked a native preset
    expect(!html().hasAttribute('data-agzh-theme') && api.getSettings().light === null, 'a native preset hands the mode back');
    expect(JSON.parse(ipc.items['agzh.theme']).dark === 'hupo', 'a native preset keeps the other mode');

    const key = (o) => ({ code: 'KeyT', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, repeat: false, preventDefault() {}, stopPropagation() {}, ...o });
    dom.window.dispatch('keydown', key());
    dom.window.dispatch('keydown', key({ shiftKey: true }));
    expect(toggled === 1, 'Ctrl+Alt+T toggles the panel (and only that combination)');

    api.update({ dark: 'moyu' });
    dom.document.body.classList.toggle('dark', true);
    dom.flush();
    api.update({ fx: false });
    expect(html().getAttribute('data-agzh-theme') === 'moyu' && !html().hasAttribute('data-agzh-fx'), 'the skin can be turned off');
  }

  // ---- first run: default palettes, then a one-time introduction (real panel) ----------
  {
    const dom = createFakeDom({ withRoot: false });
    const ipc = createFakeIpc({}); // nothing stored yet
    const env = (d, i) => ({
      document: d.document,
      window: d.window,
      ipc: i,
      data: { version: 't', defaults, themes: list },
      css: '',
      createPanel: (a) => panelModule.createPanel(a, { document: d.document, window: d.window }),
    });
    const api = runtime.start(env(dom, ipc));
    dom.buildTree({ dark: true });
    dom.flush();
    const html = dom.document.documentElement;
    expect(html.getAttribute('data-agzh-theme') === defaults.dark && html.hasAttribute('data-agzh-fx'), 'first run uses the default dark palette with the skin');
    expect(!api.isStored() && !('agzh.theme' in ipc.items), 'first run does not write settings by itself');
    const intro = () => dom.document.body.children.find((c) => c.getAttribute && c.getAttribute('data-agzh-panel') === 'intro');
    expect(!intro(), 'the introduction waits until the window has settled');
    await tick(1300);
    const card = intro();
    const label = list.find((t) => t.id === defaults.dark)?.label;
    expect(card && card.descendants().some((el) => el.text.includes(`「${label}」`)), 'the introduction names the palette in use');
    findByClass(card || dom.document.body, 'btn ghost')?.dispatch('click');
    expect(!intro() && api.isStored() && JSON.parse(ipc.items['agzh.theme']).dark === defaults.dark, 'dismissing the introduction stores the settings');

    // A second window started afterwards does not introduce again.
    const dom2 = createFakeDom();
    runtime.start(env(dom2, ipc));
    await tick(1300);
    expect(!dom2.document.body.children.some((c) => c.getAttribute && c.getAttribute('data-agzh-panel') === 'intro'), 'the introduction is shown once');

    // Two windows on first run: confirming in one closes the other's introduction.
    const shared = createFakeIpc({});
    const domA = createFakeDom();
    runtime.start(env(domA, shared));
    await tick(1300);
    const introA = () => domA.document.body.children.find((c) => c.getAttribute && c.getAttribute('data-agzh-panel') === 'intro');
    expect(!!introA(), 'each first-run window introduces the theme');
    shared.emit({ 'agzh.theme': JSON.stringify({ dark: defaults.dark, light: defaults.light }) }); // the other window confirmed
    expect(!introA(), 'confirming in another window closes the introduction');
  }

  // ---- the injected addon runs as a whole ----------------------------------------
  {
    const addon = build.buildThemeAddon({ version: 'test' });
    const dom = createFakeDom();
    const ipc = createFakeIpc({ 'agzh.theme': '{"dark":"dailan"}' });
    const sandbox = {
      document: dom.document,
      window: dom.window,
      console: { error: (...a) => fail('theme: addon error ' + a.join(' ')), warn() {} },
      require: (name) => (name === 'electron' ? { ipcRenderer: ipc } : null),
      Promise,
      setTimeout,
    };
    sandbox.globalThis = sandbox;
    try {
      vm.runInNewContext(addon.code, sandbox, { filename: 'theme-addon.js' });
    } catch (e) {
      fail('theme: addon failed to evaluate: ' + e.stack);
    }
    expect(dom.document.documentElement.getAttribute('data-agzh-theme') === 'dailan', 'the built addon applies the stored palette');
    expect(typeof sandbox.__agzhTheme?.update === 'function', 'the built addon exposes its api');
  }

  return { checks, palettes: themes.length };
}
