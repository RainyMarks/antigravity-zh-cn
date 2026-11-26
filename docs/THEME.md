# 外观主题

汉化补丁附带一组配色方案、一层「质感效果」皮肤和中文字体优化。装好后默认启用（深色用「黛蓝」、浅色用「月白」），
在 Antigravity「设置 → 外观」里修改或换回原生，也可以随时按 `Ctrl+Alt+T` 打开面板。
本文说明它的工作方式、如何新增配色，以及 Antigravity 更新后如何检查兼容性。

## 设计原则

Antigravity 的界面本身就是一套设计变量驱动的系统：背景、侧栏、卡片、边框、文字层级、强调色、圆角、代码高亮
全部来自 `--background`、`--sidebar`、`--card`、`--muted-foreground`、`--primary`、`--nux-radius-*`、`--syntax-*`
等 CSS 变量；它的 onyx 主题还在一组语义类（`.surface-composer`、`.agy-user-bubble`、`.agy-sidebar-row` 等）上定义了
输入框、气泡、选中行的质感。外观主题只做四件事：

1. **换设计变量**：配色 = 一组变量取值。Antigravity 自己的效果（首页光晕、选中色、聚焦环、玻璃面板）会自动用上新配色。
2. **质感皮肤**（`skin.css`）：只挂在上面那组语义类和数据属性上，只改绘制（背景、阴影、描边颜色、装饰伪元素），
   不改尺寸、间距和定位，因此不会改变布局；不依赖 Tailwind 工具类和 DOM 层级，Antigravity 改版时不容易失效。
3. **改字体**：中文字体优化（见下文）。
4. **改圆角**：只改 Antigravity 的圆角变量。

运行方式与翻译器相同：打补丁时注入 `preload.js` 末尾，每个窗口启动时必定执行。
不需要远程调试端口、后台进程或修改快捷方式，卸载汉化即完全还原。

## 文件

| 文件 | 作用 | 运行时机 |
|---|---|---|
| `theme/palettes.json` | 配色数据和默认配色 | — |
| `theme/color.js` | 颜色解析、`color-mix` 等价混合、WCAG 对比度 | 打补丁时 |
| `theme/tokens.js` | 由配色推导全部设计变量和质感变量 | 打补丁时 |
| `theme/build.js` | 生成样式表并打包运行时代码 | 打补丁时 |
| `theme/base.css` | 圆角、中文字体、切换动画 | 页面中 |
| `theme/skin.css` | 质感效果 | 页面中 |
| `theme/runtime.js` | 读写设置、跟随深浅色和对比度、同步标题栏、首次提示 | 页面中 |
| `theme/panel.js` | 设置页卡片、`Ctrl+Alt+T` 面板、首次提示卡片 | 页面中 |

颜色计算全部在打补丁时完成。页面里的运行时只在 `<html>` 上设置几个属性：

| 属性 | 含义 |
|---|---|
| `data-agzh-theme` | 当前生效的配色 id；没有该属性时就是 Antigravity 原生配色 |
| `data-agzh-contrast="strong"` | Antigravity 的「对比度」设为高 |
| `data-agzh-fx` | 存在时启用质感效果；只在使用补丁配色时设置 |
| `data-agzh-daypart` | `morning` / `noon` / `afternoon` / `evening` / `night`，按本地时间选首页问候语 |
| `data-agzh-radius` | `compact` / `round`；没有该属性时为原生圆角 |
| `data-agzh-cjk` | 存在时启用中文字体优化 |

设置保存在 Antigravity 的 `app_storage.json`（键名 `agzh.theme`），所有窗口共享、实时同步。
存储里还没有设置时（刚装好），使用 `palettes.json` 里 `defaults` 指定的配色，并在界面稳定后弹出一次提示卡片，
说明界面为什么变了、去哪里改；点任意按钮后把当前设置存下来，此后不再提示，将来调整默认配色也不影响这位用户。
在面板里选「原生」会存为 `null`，与「没有设置过」区分开。

## 配色数据格式

`theme/palettes.json` 中每一项的 `id`、`label`、`mode`、`seeds`、`syntax` 沿用 Antigravity 插件主题的格式
（`plugin.json` 里 `themes[]` 的一项），`fx` 是补丁自己的扩展：

```json
{
  "id": "moyu",
  "label": "墨玉",
  "mode": "dark",
  "description": "墨色底配玉石青，冷静耐看",
  "seeds": { "background": "#0D1210", "foreground": "#E6EDEA", "primary": "#6FD5B0", "link": "…", "success": "…", "warning": "…", "error": "…" },
  "fx": { "glow": "#5BB8E8" },
  "syntax": { "comment": "…", "keyword": "…", "string": "…", "…": "18 个键，见 tokens.js 的 SYNTAX_KEYS" }
}
```

`seeds` 必填 `background`、`foreground`、`primary`，可选 `primaryForeground`、`codeForeground`、`link`、`success`、`warning`、
`error`、`homeGlow`、`sidebar`、`card`、`border`、`cardBorder` 及后四项的 `…Strong`（高对比度）版本。
`fx.glow` 是质感效果的第二种光晕色（首页底部的光、流光描边和发送按钮渐变的另一端），不填时用 `link`。
文件顶层的 `defaults: { "dark": "…", "light": "…" }` 指定没有设置过时各模式默认使用的配色（`null` 表示原生）。

Antigravity 2.35 已经实现插件主题，但只对 Google 内部用户开放（`customizations.enablePluginThemes`）；
该功能对外开放后，`seeds` 和 `syntax` 可以直接做成原生插件主题。

## 变量推导

`theme/tokens.js` 按 Antigravity 内置 onyx 主题的规则推导约 30 个界面变量，各分默认、高对比度两档：

- 侧栏、卡片、各层表面：前景色按固定比例混入背景（与 onyx 相同的比例）；
- 悬停、选中、边框：前景色加透明度（onyx 用纯白/近黑，这里用配色的前景色，半透明层会带上配色的色调）；
- 文字层级（次要、弱化、占位）：onyx 用固定比例混合前景和背景，配色的底色和前景色更柔和时会偏浅，
  所以按目标对比度求解比例：取「onyx 比例」和「达到目标所需比例」中较大的一个，并且在背景、侧栏、卡片上同时满足。

| 文字层级 | 默认档 | 高对比度档 |
|---|---|---|
| 正文 | ≥ 7 | ≥ 7 |
| 次要文字 | ≥ 7 | ≥ 10 |
| 弱化文字 | ≥ 4.5（WCAG AA） | ≥ 6.5 |
| 占位文字 | ≥ 3 | ≥ 4.5 |

另外，链接与成功/警告/错误色在背景上 ≥ 4.5，强调色上的文字 ≥ 4.5，代码高亮在代码块底色上 ≥ 4.5（注释 ≥ 3.5）。
这些都由 `npm run check` 逐项检查，不达标时 CI 失败。

界面变量写在 `<html>` 上并带 `!important`：Antigravity 把同名变量写在 html 的内联样式里，只有这样才能覆盖；
这些声明全部由 `build.js` 生成。质感变量（`--agzh-*`）是补丁自己的，不需要 `!important`；
手写的 `base.css`、`skin.css` 也都不使用 `!important`。

## 质感效果

`skin.css` 在补丁配色之上加了这些效果，只在 `<html data-agzh-fx>` 时生效：

- 首页：顶部一团主色光、底部正中一团第二色光（像光从输入框背后透出来）、向四周淡出的点阵，以及按时段变化的问候语
  （Antigravity 只给 Google 内部用户显示问候语，外部用户首页上半部分是空的；内部版本自带问候语时这里自动让位）；
- 对话区四角很淡的光晕和一层细颗粒（避免大面积渐变出现色带）；主内容卡片的描边带上配色色调；
- 输入框：外框原本留着 1px 内边距、露出外框自己的背景当描边，这里给外框铺一层渐变，得到不改尺寸的流光描边，
  四周一圈同色柔光，聚焦时描边提亮并出现光环；
- 发送按钮：主色到第二色的渐变；侧栏选中的对话：左侧一道发光竖条、底色带一点强调色；
- 用户消息气泡：渐变描边（做法同输入框）和淡淡的强调色调；浮层、菜单、对话框、卡片：带色调的描边和更深的投影。

规则写法的约定由测试强制检查：每条规则都以 `:root[data-agzh-fx]` 开头；作用在真实元素上的规则只能改绘制属性，
改布局的属性只允许出现在 `::before` / `::after` 装饰伪元素上（它们绝对定位、不占位置）；颜色只能取自变量；
用到的每个 `--agzh-*` 变量都必须有定义。打开内置浏览器时，页面中有一块透明「窗洞」露出原生浏览器视图
（`body[data-has-browser-hole]`），大面积背景图会把它盖住，所以背景类效果在这时关闭。

光晕和色调会改变它下面的底色。`tokens.js` 先取设计浓度，再按「光晕最亮处」的文字对比度自动封顶（`capAlpha`）：

| 区域 | 用在 | 默认档要求 | 高对比度档要求 |
|---|---|---|---|
| 对话区 | 主内容区四角的光晕 | 正文 ≥ 7、次要 ≥ 7、弱化 ≥ 4.5 | 正文 ≥ 7、次要 ≥ 10、弱化 ≥ 6.5 |
| 舞台区 | 首页顶部和底部的光晕 | 正文 ≥ 7、次要 ≥ 4.5、弱化 ≥ 3 | 正文 ≥ 10、次要 ≥ 4.5、弱化 ≥ 3 |
| 色调 | 选中行、用户气泡 | 正文 ≥ 7、次要 ≥ 4.5 | 正文 ≥ 10、次要 ≥ 4.5 |
| 卡片微光 | 卡片顶部 | 与普通底色相同（含占位文字 ≥ 3） | 与普通底色相同（含占位文字 ≥ 4.5） |

此外，发送按钮渐变上（逐点取样）的图标 ≥ 4.5，首页问候语渐变文字的每一段颜色在光晕最亮处 ≥ 3（大字号标准）。
侧栏的弱化文字在外壳底色上没有余量，所以侧栏背后只加细颗粒、不加光晕；深色配色的卡片微光也因此几乎为零——
这是规则如实算出的结果，不是遗漏。

## 中文字体优化

Antigravity 的字体栈（Google Sans Flex 等）不含中文字体，正文字重又是 350，中文回退到系统字体时会落到
微软雅黑 Light，笔画偏细。`base.css` 声明了一个只覆盖中文字符（`unicode-range`）的字体 `AGZH CJK`：
字重 549 及以下用微软雅黑常规体，550 及以上用粗体，放在字体栈最前面；拉丁字母仍由原来的字体负责。
只在 Antigravity 使用内置字体时生效，选择「系统字体」时不改动。默认开启，可在面板里关闭。

## 新增或修改配色

1. 编辑 `theme/palettes.json`（`id` 只能用小写字母、数字和 `-`），给 `fx.glow` 挑一个与主色搭配的第二光晕色；
2. `npm run theme:preview`，打开 <http://127.0.0.1:4791/> 预览：页面按 Antigravity 的真实挂点搭建，
   运行的就是补丁注入的同一段代码；先运行过 `npm run fetch-bundle` 时还会加载 Antigravity 自己的样式表。
   左下角可以切换深浅色、对比度、首页和对话视图，打开菜单、设置页和面板，或重置首次提示；
3. `npm run check`：数据格式、对比度、样式表约定和运行时测试；
4. `node tools/build-manifest.mjs` 刷新文件哈希。

## Antigravity 更新后

```bash
npm run fetch-bundle   # 下载当前版本的界面代码到 .work/（不需要调试端口）
npm run theme:audit    # 检查主题依赖的设计变量、DOM 挂点和 IPC 通道是否都还在
```

`theme:audit` 会自动从 `skin.css` 的选择器里提取用到的类名、数据属性和宿主变量，往皮肤里加挂点不需要改审计脚本。
列出缺失项时，按下面的约定对照新代码修改：

- 设计变量的名字（`--background`、`--sidebar`、`--card`、`--onyx-*`、`--syntax-*`、`--nux-radius-*` 等），见 `tokens.js`、`base.css`；
- 质感皮肤的挂点（`.agy-home`、`.surface-composer`、`.agy-sidebar-row[data-selected]`、`[data-main-content-body]` 等），见 `skin.css`；
- 深浅色标记：`body.dark`、`body[data-agy-theme]`、`html.style.colorScheme`；
- 字体：`body[data-agy-font]` 与 `.font-sans` 上的 `font-family: var(--font-sans)`；
- 设置页「预设」行的标签 `span[id^="theme-preset-label-"]`（找不到时设置页里不显示卡片，`Ctrl+Alt+T` 仍可用）；
- IPC 通道：`storage:get-items-sync`、`storage:get-items`、`storage:update-items`、`storage:changed`、
  `window:set-title-bar-overlay`、`wcv:set-theme-color`（在 `app.asar` 的 `dist/preload.js`、`dist/ipcHandlers.js` 中）。
