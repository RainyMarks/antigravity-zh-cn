// Preview the theme on a mock of the Antigravity UI, running exactly the code the patch injects
// into preload.js (built by theme/build.js).
//
//   node tools/theme-preview.mjs            -> .work/theme-preview/index.html
//   node tools/theme-preview.mjs --serve    -> also serve it at http://127.0.0.1:4791/
//
// The mock is built on the same hooks the theme targets (.agy-shell, .agy-inset-shell,
// [data-main-content-body], .agy-home, .surface-composer, .agy-send-button, .agy-sidebar-row,
// .agy-user-bubble, .surface-glass, ...), with the class names Antigravity itself uses on them.
// If .work/compiled_tailwind.css exists (downloaded by `npm run fetch-bundle`), it is inlined so
// the host's own rules style the mock; otherwise a low-priority approximation is used. The page
// also simulates what Antigravity does at runtime: it writes the default "onyx" design tokens into
// <html>'s inline style, toggles body.dark, and provides a fake electron.ipcRenderer whose storage
// lives in localStorage. Nothing from Antigravity is committed: the generated page stays in .work/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, WORK } from './lib.mjs';

const require = createRequire(import.meta.url);
const { buildThemeAddon } = require(path.join(ROOT, 'theme', 'build.js'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const addon = buildThemeAddon({ version: manifest.version });

const hostCssFile = path.join(WORK, 'compiled_tailwind.css');
const hostCss = fs.existsSync(hostCssFile) ? fs.readFileSync(hostCssFile, 'utf8').replace(/<\/style/gi, '<\\/style') : '';

// Antigravity 2.35 "onyx" defaults (dark / light, normal contrast), as written by its theme code.
const HOST_TOKENS = {
  dark: {
    '--background': '#070708', '--content': '#070708', '--foreground': '#FFFFFF', '--primary': '#2F71E3', '--primary-foreground': '#FFFFFF',
    '--shell': '#111114', '--sidebar': '#111114', '--sidebar-secondary': 'rgb(255 255 255 / 0.09)', '--sidebar-muted': 'rgb(255 255 255 / 0.048)',
    '--secondary': 'rgb(255 255 255 / 0.075)', '--secondary-foreground': '#BCBDC6', '--muted': 'rgb(255 255 255 / 0.042)',
    '--muted-foreground': '#87888F', '--placeholder': '#636470', '--card': '#131317', '--card-border': 'rgb(255 255 255 / 0.08)',
    '--border': 'rgb(255 255 255 / 0.06)', '--glass': '#131317', '--glass-border': 'rgb(255 255 255 / 0.085)',
    '--glass-highlight': 'rgb(255 255 255 / 0.085)', '--scrim': 'rgb(0 0 0 / 0.64)',
    '--onyx-frame': '#0D0D11', '--onyx-well': '#111114', '--onyx-raised': '#15151A', '--onyx-selected': '#1F1F24', '--onyx-key': '#232328',
    '--home-glow': 'rgb(47 113 227 / 0.11)', '--code-foreground': '#9DB3E0',
    '--link': '#6A9FCB', '--success': '#7AAE66', '--warning': '#F3C949', '--error': '#DE5555',
  },
  light: {
    '--background': '#FFFFFF', '--content': '#FFFFFF', '--foreground': '#0A0A0C', '--primary': '#2F75C3', '--primary-foreground': '#FFFFFF',
    '--shell': '#FAFAFA', '--sidebar': '#FAFAFA', '--sidebar-secondary': 'rgb(10 10 12 / 0.075)', '--sidebar-muted': 'rgb(10 10 12 / 0.042)',
    '--secondary': 'rgb(10 10 12 / 0.06)', '--secondary-foreground': '#3F3F46', '--muted': 'rgb(10 10 12 / 0.038)',
    '--muted-foreground': '#71717A', '--placeholder': '#8E8E95', '--card': '#FFFFFF', '--card-border': 'rgb(10 10 12 / 0.07)',
    '--border': 'rgb(10 10 12 / 0.06)', '--glass': '#FFFFFF', '--glass-border': 'rgb(10 10 12 / 0.065)',
    '--glass-highlight': 'rgb(255 255 255 / 1)', '--scrim': 'rgb(10 10 12 / 0.28)',
    '--onyx-frame': '#F9F9F9', '--onyx-well': 'rgb(10 10 12 / 0.055)', '--onyx-raised': '#FFFFFF', '--onyx-key': '#FFFFFF',
    '--onyx-selected': 'color-mix(in srgb, #0A0A0C 6.5%, #FAFAFA)',
    '--home-glow': 'rgb(47 117 195 / 0.1)', '--code-foreground': '#4D6A8C',
    '--link': '#1D588E', '--success': '#58983F', '--warning': '#AC830B', '--error': '#F05151',
  },
};

// Approximates the host rules for the hooks when the real stylesheet is not available. It sits in a
// cascade layer declared first, so the real stylesheet (and the theme) always win over it.
const FALLBACK_CSS = `
@layer pv-fallback {
  .relative { position: relative; } .isolate { isolation: isolate; } .flex { display: flex; } .flex-col { flex-direction: column; }
  .flex-1 { flex: 1 1 0%; } .items-center { align-items: center; } .items-end { align-items: flex-end; } .justify-center { justify-content: center; }
  .justify-between { justify-content: space-between; } .w-full { width: 100%; } .h-full { height: 100%; } .max-w-full { max-width: 100%; }
  .min-w-0 { min-width: 0; } .min-h-0 { min-height: 0; } .gap-1 { gap: 4px; } .gap-2 { gap: 8px; } .gap-px { gap: 1px; } .m-0 { margin: 0; }
  .p-px { padding: 1px; } .p-1 { padding: 4px; } .p-2 { padding: 8px; } .w-7 { width: 28px; } .h-7 { height: 28px; } .w-72 { width: 18rem; }
  .rounded-full { border-radius: 999px; } .rounded-lg { border-radius: 8px; } .rounded-xl { border-radius: 12px; } .rounded-2xl { border-radius: 16px; }
  .overflow-hidden { overflow: hidden; } .font-medium { font-weight: 450; } .space-y-2 > * + * { margin-top: 8px; }
  .bg-card { background-color: var(--card); } .bg-card-border { background-color: var(--card-border); } .bg-primary { background-color: var(--primary); }
  .text-primary-foreground { color: var(--primary-foreground); } .border { border: 1px solid var(--border); } .border-card-border { border-color: var(--card-border); }
  body[data-agy-theme] .agy-shell { background-color: var(--shell); }
  .agy-inset-shell { --card-edge: rgb(0 0 0 / 0.12); --card-gap: 0.5rem; --card-radius: 0.75rem; }
  .dark .agy-inset-shell { --card-edge: rgb(255 255 255 / 0.1); }
  .agy-sheet[data-sheet-inset] [data-main-content-body] { position: relative; overflow: hidden; margin: 0 var(--card-gap) var(--card-gap) 0;
    border-radius: var(--card-radius); background-color: var(--background); }
  .agy-sheet[data-sheet-inset] [data-main-content-body]::after { content: ''; position: absolute; z-index: 45; inset: 0; border-radius: inherit;
    box-shadow: inset 0 0 0 0.5px var(--card-edge); pointer-events: none; }
  body[data-agy-home-glow] .agy-sheet:has(.agy-home) { background-image: radial-gradient(62% 38% at 50% 0%, var(--home-glow), transparent 100%); }
  body[data-agy-theme] .surface-composer { border-radius: 20px; background-color: var(--onyx-frame);
    box-shadow: inset 0 1px 2px rgb(10 10 12 / 0.015), 0 0 0 4px var(--onyx-frame), 0 0 0 5px rgb(10 10 12 / 0.065), 0 12px 28px -10px rgb(10 10 12 / 0.04); }
  body[data-agy-theme].dark .surface-composer { box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.275), 0 0 0 4px var(--onyx-frame),
    0 0 0 5px rgb(255 255 255 / 0.065), 0 18px 40px -12px rgb(0 0 0 / 0.36); }
  body[data-agy-theme] .surface-composer > .surface-composer-card { border-radius: 19px; background-color: var(--onyx-raised);
    box-shadow: inset 0 1px 0 #fff, 0 0 0 1px rgb(10 10 12 / 0.06); }
  body[data-agy-theme].dark .surface-composer > .surface-composer-card { box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 0 0 1px rgb(255 255 255 / 0.075); }
  body[data-agy-theme] .agy-sidebar-row[data-selected="true"] { background-color: var(--onyx-selected); }
  body[data-agy-theme] .agy-user-bubble-frame { border-radius: 20px; background-color: transparent; }
  body[data-agy-theme] .agy-user-bubble { border-radius: 19px; background-color: var(--glass); padding: 10px 14px;
    box-shadow: inset 0 1px 0 var(--glass-highlight), 0 0 0 1px var(--glass-border), var(--glass-shadow); }
  body[data-agy-theme] .surface-glass { background-color: var(--glass); border: 1px solid var(--glass-border);
    backdrop-filter: blur(20px) saturate(1.6); box-shadow: inset 0 1px 0 var(--glass-highlight), var(--glass-shadow); }
  body[data-agy-theme] :is(.agy-card, .artifact-card, .agy-tip-card) { border: 1px solid var(--card-border); border-radius: 16px; background-color: var(--card); }
}
`;

// Layout of the mock itself (only .pv-* classes, so it never fights the host rules on the hooks).
const MOCK_CSS = `
  html, body { margin: 0; height: 100%; }
  :root { --pv-font: "Google Sans Flex", "Google Sans", system-ui, "Segoe UI", sans-serif; }
  body { font: 350 14px/1.45 var(--pv-font); color: var(--foreground); overflow: hidden;
    --nux-radius-md: 12px; --nux-radius-lg: 16px; --nux-radius-xl: 20px; --nux-radius-2xl: 24px; --nux-composer-radius: var(--nux-radius-xl);
    --glass-shadow: 0 20px 44px -12px rgb(0 0 0 / .375), 0 3px 10px -2px rgb(0 0 0 / .275); }
  body:not(.dark) { --glass-shadow: 0 14px 34px -10px rgb(10 10 12 / .06), 0 2px 6px -1px rgb(10 10 12 / .025); }
  body[data-agy-font] { --font-sans: var(--pv-font); font-family: var(--font-sans); }
  .pv-shell { display: grid; grid-template-columns: 252px minmax(0, 1fr); height: 100vh; }
  .pv-sidebar { display: flex; flex-direction: column; gap: 2px; padding: 10px 8px; color: var(--secondary-foreground); min-width: 0; }
  .pv-brand { display: flex; align-items: center; gap: 10px; padding: 6px 8px 12px; color: var(--foreground); font-weight: 550; }
  .pv-logo { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 40%, var(--foreground))); }
  .pv-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 10px; cursor: default; }
  .pv-row:hover { background-color: var(--sidebar-muted); color: var(--foreground); }
  .pv-row[data-selected="true"] { color: var(--foreground); }
  .pv-new { margin: 4px 0 8px; background-color: var(--sidebar-secondary); color: var(--foreground); font-weight: 450; }
  .pv-ic { width: 14px; height: 14px; flex: none; border-radius: 4px; border: 1.5px solid currentColor; opacity: .75; }
  .pv-group { margin: 14px 10px 4px; font-size: 12px; color: var(--muted-foreground); }
  .pv-time { margin-left: auto; font-size: 11px; color: var(--muted-foreground); }
  .pv-spacer { flex: 1; }
  .pv-inset { display: flex; min-width: 0; min-height: 0; }
  .pv-sheet { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
  .pv-header { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 16px 0 8px; flex: none; }
  .pv-header b { font-weight: 450; }
  .pv-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background-color: var(--secondary);
    color: var(--secondary-foreground); font-size: 12px; }
  .pv-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  body[data-pv-view="home"] .pv-conv, body:not([data-pv-view="home"]) .pv-home { display: none; }
  .pv-home-scroll { padding: 24px 16px 16px; gap: 24px; overflow-y: auto; }
  .pv-home-spacer { flex: 0 1 clamp(72px, calc(32vh - 66px), 264px); min-height: 0; }
  .pv-home-bottom-group, .pv-home-width { max-width: 680px; }
  .pv-home-bottom-group { margin-top: auto; gap: 12px; }
  .pv-home-bottom { flex: none; padding: 0 16px 24px; position: relative; z-index: 1; }
  .pv-suggest { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .pv-tips { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .pv-tip { padding: 12px 14px; }
  .pv-tip b { display: block; font-weight: 500; margin-bottom: 2px; } .pv-tip span { color: var(--muted-foreground); font-size: 12.5px; }
  .pv-conv { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .pv-scroll { flex: 1; overflow: auto; padding: 24px max(24px, calc(50% - 360px)); }
  .pv-msg { margin: 22px 0; }
  .pv-think { color: var(--muted-foreground); font-size: 13px; }
  .pv-msg h3 { font-weight: 550; font-size: 15px; margin: 14px 0 6px; }
  .pv-msg p { margin: 8px 0; }
  .pv-msg code { font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; color: var(--code-foreground);
    background-color: var(--secondary); padding: 1px 5px; border-radius: 6px; }
  .pv-msg a { color: var(--link); text-decoration: none; }
  .pv-code { font: 12.5px/1.6 ui-monospace, "Cascadia Code", Consolas, monospace; background-color: var(--secondary); border-radius: 12px;
    padding: 12px 14px; overflow: auto; box-shadow: 0 0 0 1px var(--border); color: var(--syntax-default-fg, var(--foreground)); white-space: pre; margin: 10px 0; }
  .t-comment { color: var(--syntax-comment); font-style: italic; } .t-keyword { color: var(--syntax-keyword); } .t-string { color: var(--syntax-string); }
  .t-number { color: var(--syntax-number); } .t-function { color: var(--syntax-function); } .t-class { color: var(--syntax-class-name); }
  .t-property { color: var(--syntax-property); } .t-operator { color: var(--syntax-operator); } .t-punct { color: var(--syntax-punctuation); }
  .t-tag { color: var(--syntax-tag); } .t-attr { color: var(--syntax-attr-name); } .t-variable { color: var(--syntax-variable); }
  .pv-tool { display: flex; align-items: center; gap: 10px; padding: 10px 12px; font-size: 13px; color: var(--secondary-foreground); }
  .pv-tool + .pv-tool { border-top: 1px solid var(--border); }
  .pv-dot { width: 8px; height: 8px; border-radius: 50%; } .pv-ok { background: var(--success); } .pv-warn { background: var(--warning); } .pv-err { background: var(--error); }
  .pv-artifact { padding: 12px 14px; margin-top: 10px; } .pv-artifact b { font-weight: 500; } .pv-artifact span { display: block; color: var(--muted-foreground); font-size: 12.5px; }
  .pv-bubble-wrap { margin-left: auto; width: fit-content; max-width: 80%; }
  .pv-composer-wrap { padding: 0 max(24px, calc(50% - 360px)) 22px; flex: none; }
  .pv-placeholder { color: var(--placeholder); padding: 8px 10px 14px; }
  .pv-bar { display: flex; align-items: center; gap: 8px; color: var(--secondary-foreground); font-size: 13px; padding: 0 4px 2px 8px; }
  .pv-bar .agy-send-button { margin-left: auto; border: 0; font-weight: 700; }
  .pv-menu { position: fixed; z-index: 20; right: max(32px, calc(50% - 470px)); bottom: 110px; }
  .pv-menu .agy-overlay-item { padding: 6px 10px; border-radius: 6px; } .pv-menu .agy-overlay-item:hover { background-color: var(--secondary); }
  .pv-menu .agy-overlay-item span { color: var(--muted-foreground); font-size: 12px; margin-left: 6px; }
  body:not(.pv-show-menu) .pv-menu { display: none; }
  .pv-settings { position: fixed; inset: 0 0 0 auto; width: 520px; overflow: auto; padding: 24px 28px; background-color: var(--background);
    box-shadow: -1px 0 0 var(--border); display: none; z-index: 30; }
  body.pv-show-settings .pv-settings { display: block; }
  .pv-settings h2 { font-size: 18px; font-weight: 550; margin: 0 0 18px; }
  .pv-settings > .space-y-2 { margin-bottom: 22px; }
  .pv-srow { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; }
  .pv-srow + .pv-srow { border-top: 1px solid var(--border); }
  .pv-dev { position: fixed; left: 12px; bottom: 12px; z-index: 40; display: flex; flex-wrap: wrap; gap: 6px; padding: 6px; border-radius: 16px;
    max-width: 236px; background-color: var(--card); box-shadow: 0 0 0 1px var(--card-border), var(--glass-shadow); font-size: 12px; }
  .pv-dev button { border: 0; border-radius: 999px; padding: 5px 10px; background-color: var(--secondary); color: var(--foreground); font: inherit; cursor: pointer; }
`;

const COMPOSER = `
<div class="surface-composer relative flex flex-col p-px rounded-2xl bg-card-border">
  <div class="surface-composer-card relative z-[1] flex flex-col gap-0 p-1 rounded-[calc(theme(borderRadius.2xl)-1px)]">
    <div class="pv-placeholder">提出任何问题，输入 @ 提及，输入 / 执行操作</div>
    <div class="pv-bar"><span>＋</span><span class="pv-pill" data-pv-act="menu">✦ Claude Opus 5.5 · 高</span><span class="pv-pill">规划</span>
      <button type="button" class="agy-send-button flex items-center justify-center w-7 h-7 p-1.5 rounded-full transition-all duration-150 bg-primary text-primary-foreground">↑</button>
    </div>
  </div>
</div>`;

const MOCK_HTML = `
<div class="agy-shell pv-shell">
  <aside class="pv-sidebar">
    <div class="pv-brand"><span class="pv-logo"></span>Antigravity</div>
    <div class="agy-sidebar-row group relative flex w-full items-center pv-row pv-new" data-pv-act="home"><span class="pv-ic"></span>新建对话</div>
    <div class="agy-sidebar-row group relative flex w-full items-center pv-row"><span class="pv-ic"></span>对话历史</div>
    <div class="agy-sidebar-row group relative flex w-full items-center pv-row"><span class="pv-ic"></span>自动化</div>
    <div class="agy-sidebar-row group relative flex w-full items-center pv-row"><span class="pv-ic"></span>自定义</div>
    <div class="pv-group">项目 · lumen-api</div>
    <div class="agy-sidebar-row group relative flex w-full items-center pv-row" data-selected="true" data-pv-act="conv"><span class="pv-ic"></span>重构登录流程<span class="pv-time">2 分钟</span></div>
    <div class="agy-sidebar-row group relative flex w-full items-center pv-row" data-pv-act="conv"><span class="pv-ic"></span>修复 CI 中的单元测试<span class="pv-time">1 小时</span></div>
    <div class="agy-sidebar-row group relative flex w-full items-center pv-row" data-pv-act="conv"><span class="pv-ic"></span>为 API 增加分页<span class="pv-time">3 天</span></div>
    <div class="agy-sidebar-row group relative flex w-full items-center pv-row" data-pv-act="conv"><span class="pv-ic"></span>Dockerfile 体积优化<span class="pv-time">2 周</span></div>
    <div class="pv-spacer"></div>
    <div class="agy-sidebar-row group relative flex w-full items-center pv-row" data-pv-act="settings"><span class="pv-ic"></span>设置</div>
  </aside>
  <div class="agy-inset-shell pv-inset">
    <div class="agy-sheet browser-hole-ancestor relative z-0 flex-1 flex min-w-0 min-h-0 overflow-x-clip pv-sheet" data-sheet-inset>
      <div class="pv-header" data-main-content-header><b>重构登录流程</b><span class="pv-pill">lumen-api</span></div>
      <div class="pv-body" data-main-content-body>
        <div class="agy-home relative isolate w-full h-full flex animate-fade-in pv-home">
          <!-- Same structure as Antigravity's home view: top spacer, suggestions and tips pushed down, composer at the bottom. -->
          <div class="w-full h-full flex flex-col items-center overflow-hidden">
            <div class="w-full flex-1 min-h-0 flex flex-col items-center pv-home-scroll">
              <div aria-hidden="true" class="pv-home-spacer"></div>
              <div class="flex flex-col w-full pv-home-bottom-group">
                <div class="pv-suggest"><span class="pv-pill">解释这个仓库</span><span class="pv-pill">修复失败的测试</span><span class="pv-pill">补全 README</span></div>
                <div class="pv-tips">
                  <div class="agy-tip-card flex flex-col rounded-xl overflow-hidden border border-card-border bg-card pv-tip"><b>试试规划模式</b><span>先出方案，确认后再动手改代码</span></div>
                  <div class="agy-tip-card flex flex-col rounded-xl overflow-hidden border border-card-border bg-card pv-tip"><b>连接 MCP 服务器</b><span>让智能体读取你的工单和文档</span></div>
                </div>
              </div>
            </div>
            <div class="w-full flex flex-col items-center pv-home-bottom">
              <div class="flex flex-col w-full pv-home-width">${COMPOSER}</div>
            </div>
          </div>
        </div>
        <div class="pv-conv">
          <div class="pv-scroll">
            <div class="relative flex flex-col items-end gap-1 max-w-full pv-bubble-wrap">
              <div class="agy-user-bubble-frame relative p-px rounded-xl bg-card-border min-w-0 max-w-full">
                <div class="agy-user-bubble relative flex flex-col gap-2 p-2 rounded-[calc(theme(borderRadius.xl)-1px)] bg-card overflow-hidden">把 auth.ts 里的 token 刷新逻辑抽成一个独立的 hook，并补上单元测试。</div>
              </div>
            </div>
            <div class="pv-msg">
              <div class="pv-think">◌ 已思考 12 秒 · 读取了 4 个文件</div>
              <h3>方案</h3>
              <p>我会新建 <code>useTokenRefresh</code>，在过期前 60 秒自动刷新，失败时回退到重新登录。参考 <a href="#">React 文档</a> 中关于自定义 Hook 的约定。</p>
              <div class="pv-code"><span class="t-comment">// 过期前 60 秒刷新 token</span>
<span class="t-keyword">export function</span> <span class="t-function">useTokenRefresh</span><span class="t-punct">(</span><span class="t-variable">session</span><span class="t-punct">:</span> <span class="t-class">Session</span><span class="t-punct">) {</span>
  <span class="t-keyword">const</span> <span class="t-variable">lead</span> <span class="t-operator">=</span> <span class="t-number">60_000</span><span class="t-punct">;</span>
  <span class="t-keyword">return</span> <span class="t-tag">&lt;Refresh</span> <span class="t-attr">lead</span><span class="t-operator">=</span><span class="t-punct">{</span><span class="t-variable">lead</span><span class="t-punct">}</span> <span class="t-tag">/&gt;</span><span class="t-punct">;</span>
<span class="t-punct">}</span></div>
              <div class="agy-card">
                <div class="pv-tool"><span class="pv-dot pv-ok"></span>编辑 src/hooks/useTokenRefresh.ts<span class="pv-time">+48 −0</span></div>
                <div class="pv-tool"><span class="pv-dot pv-warn"></span>运行 npm test -- auth<span class="pv-time">2 个警告</span></div>
                <div class="pv-tool"><span class="pv-dot pv-err"></span>tsc --noEmit<span class="pv-time">1 个错误</span></div>
              </div>
              <div class="artifact-card group flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card text-left pv-artifact"><b>实施计划.md</b><span>3 个阶段 · 预计改动 6 个文件</span></div>
            </div>
          </div>
          <div class="pv-composer-wrap">${COMPOSER}</div>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="agy-overlay surface-glass bg-card text-foreground outline-none rounded-lg border border-border shadow-md no-focus-ring p-1 flex flex-col gap-px pv-menu">
  <div class="agy-overlay-item">Claude Opus 5.5<span>高</span></div>
  <div class="agy-overlay-item">Gemini 3.5 Pro<span>默认</span></div>
  <div class="agy-overlay-item">Gemini 3.5 Flash<span>快速</span></div>
</div>
<div class="pv-settings">
  <h2>设置</h2>
  <div class="space-y-2">
    <div class="flex flex-col gap-1"><div class="flex items-center justify-between"><h3 class="m-0 font-medium">外观</h3></div></div>
    <div class="agy-card"><div class="pv-srow"><span>主题</span><span class="pv-pill">深色</span></div><div class="pv-srow"><span>对比度</span><span class="pv-pill">默认</span></div></div>
  </div>
  <div class="space-y-2">
    <div class="flex flex-col gap-1"><div class="flex items-center justify-between"><h3 class="m-0 font-medium">深色主题</h3></div></div>
    <div class="agy-card"><div class="pv-srow"><span id="theme-preset-label-r1">预设</span><span class="pv-pill">Default Dark</span></div></div>
  </div>
</div>
<div class="pv-dev">
  <button data-pv-act="mode">深 / 浅色</button><button data-pv-act="contrast">对比度</button>
  <button data-pv-act="home">首页</button><button data-pv-act="conv">对话</button><button data-pv-act="menu">菜单</button>
  <button data-pv-act="settings">设置页</button><button data-pv-act="panel">面板</button><button data-pv-act="reset">重置首次提示</button>
</div>`;

// Simulates the parts of Antigravity the theme runtime talks to.
const HOST_SIM = `
(function () {
  const HOST = ${JSON.stringify(HOST_TOKENS)};
  const KEY = 'agzh-preview-storage';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const handlers = [];
  window.__previewLog = [];
  const ipcRenderer = {
    sendSync: (ch) => (ch === 'storage:get-items-sync' ? load() : null),
    invoke: async (ch, arg) => {
      window.__previewLog.push([ch, arg]);
      if (ch === 'storage:update-items') {
        const items = { ...load(), ...arg };
        localStorage.setItem(KEY, JSON.stringify(items));
        setTimeout(() => handlers.forEach((h) => h({}, arg)));
      }
      if (ch === 'storage:get-items') return load();
    },
    on: (ch, fn) => { if (ch === 'storage:changed') handlers.push(fn); },
  };
  window.require = (name) => (name === 'electron' ? { ipcRenderer } : null);
  window.__previewHost = {
    applyHost(mode) {
      const html = document.documentElement;
      for (const [k, v] of Object.entries(HOST[mode])) html.style.setProperty(k, v);
      html.style.colorScheme = mode;
      document.body.classList.toggle('dark', mode === 'dark');
    },
    setStorage(changes) { ipcRenderer.invoke('storage:update-items', changes); },
    reset() { const items = load(); delete items['agzh.theme']; localStorage.setItem(KEY, JSON.stringify(items)); location.reload(); },
    get: load,
  };
})();
`;

const DEV_JS = `
  const host = window.__previewHost;
  let mode = localStorage.getItem('agzh-preview-mode') || 'dark';
  host.applyHost(mode);
  document.body.dataset.pvView = localStorage.getItem('agzh-preview-view') || 'home';
  const setView = (v) => { document.body.dataset.pvView = v; localStorage.setItem('agzh-preview-view', v); };
  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-pv-act]')?.dataset.pvAct;
    if (act === 'settings') document.body.classList.toggle('pv-show-settings');
    if (act === 'menu') document.body.classList.toggle('pv-show-menu');
    if (act === 'home' || act === 'conv') setView(act);
    if (act === 'mode') { mode = mode === 'dark' ? 'light' : 'dark'; localStorage.setItem('agzh-preview-mode', mode); host.applyHost(mode); }
    if (act === 'contrast') host.setStorage({ 'jetski.contrast': host.get()['jetski.contrast'] === '2' ? '1' : '2' });
    if (act === 'panel') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', key: 't', ctrlKey: true, altKey: true }));
    if (act === 'reset') host.reset();
  });
`;

// Order mirrors the app: the theme's <style> is inserted at document start, before the host stylesheet.
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Antigravity 汉化补丁 · 外观主题预览</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:ROND,opsz,slnt,wdth,wght@0..100,6..144,-10..0,92..100,100..1000&display=swap">
<style>${FALLBACK_CSS}</style>
<script>${HOST_SIM}</script>
<script>${addon.code}</script>
<style>${hostCss}</style>
<style>${MOCK_CSS}</style>
</head>
<body data-agy-theme data-agy-font="google-sans" data-agy-home-glow class="dark">
${MOCK_HTML}
<script>${DEV_JS}</script>
</body>
</html>
`;

const outDir = path.join(WORK, 'theme-preview');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'index.html');
fs.writeFileSync(out, html);
console.log(`${path.relative(ROOT, out)} (${addon.count} palettes; host stylesheet: ${hostCss ? 'included from .work/compiled_tailwind.css' : 'not found, using an approximation - run npm run fetch-bundle'})`);

if (process.argv.includes('--serve')) {
  const port = Number(process.env.PORT) || 4791;
  http
    .createServer((req, res) => {
      if (req.url !== '/' && req.url !== '/index.html') {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(fs.readFileSync(out));
    })
    .listen(port, '127.0.0.1', () => console.log(`serving at http://127.0.0.1:${port}/`));
}
