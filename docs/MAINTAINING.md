# 维护指南

本文说明 Antigravity 更新后如何补充译文，以及如何发布新版本。用户端会自动拉取新版本，不需要用户做任何操作。

## 目录结构

```
agzh.ps1                 用户端管理脚本：安装 / 卸载 / 自动更新 / 状态（UTF-8 BOM + CRLF）
install.ps1              引导安装脚本（irm | iex 用，保持纯 ASCII）
patcher.js               读写 app.asar、打补丁 / 还原（用 Antigravity.exe 的 Node 模式运行）
安装汉化.cmd / 卸载汉化.cmd
manifest.json            版本号 + 安装所需文件的 SHA-256（由 tools/build-manifest.mjs 生成）
zh-cn/dict.json          词典：exact（精确匹配）、templates（带 {0} 参数）、context（按位置区分的译法）
zh-cn/translator.js      注入 preload.js 的运行时翻译器
zh-cn/shell.js           Electron 外壳（主进程）字符串替换表
zh-cn/hook.js            注入主进程：Antigravity 退出时触发自动更新
i18n/ignore.json         有意不翻译的字符串（产品名、代码等），避免重复出现在待译列表中
tools/                   维护工具（见下）
docs/TRANSLATION_GUIDE.md  译文规范与术语表
```

## 准备

```bash
git clone https://github.com/RainyMarks/antigravity-zh-cn
cd antigravity-zh-cn
npm install          # 仅 tools/extract.mjs 需要 acorn
```

## Antigravity 更新后的流程

1. **更新并启动 Antigravity**（汉化与否都可以）。

2. **提取新增字符串**

   ```bash
   npm run fetch-bundle     # 通过 DevTools 端口找到本地服务，下载界面代码到 .work/main.js
   npm run extract          # 解析代码，未翻译的新字符串写入 .work/todo.json
   ```

   `.work/` 已被 git 忽略。`main.js` 是 Google 的代码，**不要提交**。

3. **收集服务器下发的文字（可选，推荐）**：用已汉化的 Antigravity 把各个界面点一遍（设置、模型菜单、用量、市场……），然后

   ```bash
   npm run collect-missing  # 读取翻译器记录的「看到但没翻译」的英文，合并进 .work/todo.json
   ```

   这份列表可能包含你自己的对话标题、文件名等，翻译前请先删掉。

4. **翻译**：把 `.work/todo.json`（字符串数组）翻译成 `{ "英文": "中文" }` 对象，保存为例如 `.work/translated.json`。
   可以直接交给 Claude 等 AI 处理，附上 `docs/TRANSLATION_GUIDE.md` 作为规范。约定如下：
   - 值为 `null` 或与原文相同：记为「有意不翻译」，写入 `i18n/ignore.json`
   - 值为 `"-"`：从词典中删除这条
   - 含 `{0}` 等占位符的条目会自动进入 templates，占位符必须保持一致

   ```bash
   npm run apply -- .work/translated.json
   ```

5. **检查外壳替换是否仍然有效**

   ```bash
   node tools/dry-run.mjs   # 对安装目录中 app.asar 的副本打补丁，不会动真正的安装
   ```

   输出中「未找到」的条目，说明 `zh-cn/shell.js` 里对应的原文在新版本中变了：解包 `.work/dry-run/resources/app.asar.zh-cn-backup`
   （`npx @electron/asar extract <asar> <目录>`）对照新代码修改即可。`preload.js` 中的 `showContextMenu` 和 `notification:send`
   两条替换尤其重要，它们负责原生右键菜单和系统通知的翻译。

6. **本地验证**：双击 `安装汉化.cmd`（会把当前工作区的文件安装到 `%LOCALAPPDATA%\antigravity-zh-cn`），启动 Antigravity 查看效果。

7. **测试并发布**

   ```bash
   npm run check                                          # 词典校验 + 翻译器单元测试
   node tools/build-manifest.mjs --bump patch --app 2.24.0   # 升版本号、记录测试过的 Antigravity 版本、刷新哈希
   git commit -am "Update translations for Antigravity 2.24.0"
   git tag v1.0.1
   git push --follow-tags
   ```

   推送 `v*` 标签后，GitHub Actions（`.github/workflows/release.yml`）会校验 manifest 并创建 Release，附带 `manifest.json` 和 zip。
   用户端会在一小时内，或下次退出 Antigravity 时，自动下载新版本并重新汉化。

> 只要改了 `manifest.json` 中列出的任何文件，都必须重新运行 `node tools/build-manifest.mjs`，否则 CI 会失败，用户端也会因为哈希不匹配而拒绝更新。
> 这个命令同时会修正 `.ps1`/`.cmd` 的换行符和 BOM。

## 调试

- 已汉化的 Antigravity 中，`window.__agZhCn` 提供 `version`、`stats()`、`missing()`、`clearMissing()`。
  Antigravity 启动时自带 `--remote-debugging-port=0`，端口写在 `%APPDATA%\Antigravity\DevToolsActivePort`；`tools/cdp.mjs` 演示了如何连接。
- 用户端日志：`%LOCALAPPDATA%\antigravity-zh-cn\logs\agzh.log`、`patcher.log`。
- 计划任务：`Get-ScheduledTask AntigravityZhCN`。

## 自动更新的工作方式

- 安装源：`https://github.com/RainyMarks/antigravity-zh-cn/releases/latest/download/manifest.json`，备用 `https://cdn.jsdelivr.net/gh/RainyMarks/antigravity-zh-cn@latest/manifest.json`。
  文件从对应标签的 `raw.githubusercontent.com` 或 jsDelivr 下载，并按 manifest 中的 SHA-256 校验。
- 触发：计划任务（登录后 1 分钟、之后每小时，通过 `conhost --headless` 静默运行），以及 Antigravity 退出时由 `zh-cn/hook.js` 启动的后台 PowerShell。
- 需要重新汉化但 Antigravity 正在运行时（patcher.js `--auto` 返回退出码 2，典型情况是「重启以更新」后应用被立即重新打开），
  `agzh.ps1` 会在后台等待应用退出后立即打补丁：退出钩子启动的进程最多等 12 小时，计划任务每轮最多等 25 分钟（任务执行上限为 30 分钟）。
  等待期间释放主锁 `Local\AntigravityZhCN-Patch`（不妨碍手动安装），并持有 `Local\AntigravityZhCN-Wait`，避免多个实例同时等待。
- 安装时会立即运行一次计划任务，确认它能访问补丁文件；在 MSIX 打包应用的终端中安装时，文件会被重定向而导致检查失败，并给出提示。
  后者会先等待 Antigravity 和它的更新安装程序（`%LOCALAPPDATA%\antigravity-updater\` 下的程序）全部退出，避免占用文件、妨碍更新安装。
- 打补丁前会检查 `app.asar` 内的 `dist/zh-cn-patch.json` 标记：未汉化（Antigravity 刚更新）或补丁版本、配置变化时才重新打补丁。
