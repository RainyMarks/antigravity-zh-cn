# Antigravity 界面汉化翻译指南

你在为 Google Antigravity（一个 AI 编程智能体桌面应用）翻译界面字符串到简体中文。
输入是一个 JSON 字符串数组（英文原文，已去除首尾空白）。输出是一个 JSON 对象：`{ "英文原文": "中文译文", ... }`，**键必须与输入完全一致（逐字符相同），每一条输入都必须出现在输出中**。

## 规则

1. 译文风格：简洁、自然，参照 VS Code / JetBrains 简体中文界面的用语习惯。按钮/菜单用短语（"新建对话"、"取消"），说明文字用完整句子并使用中文标点（，。：？！“”）。
2. 占位符 `{0}`、`{1}` 等必须原样保留，可按中文语序调整位置。例："Question {0} of {1}" → "第 {0} 个问题，共 {1} 个"。
3. 中英混排时，英文/数字与中文之间加一个半角空格（如 "MCP 服务器"、"{0} 个工具"）。
4. **保持原文不变（输出与键完全相同）** 的情况：
   - 产品名、品牌名、模型名、技术名词：Antigravity、Gemini、Claude、GitHub、Google Drive、Chrome、MCP、Git、JJ、CitC、Piper、Jetski、Cog、Mermaid、PDF、URL、API、JSON、WSL、UAC、Turbo、Best-of-N、Cascade、Sidecar 等。
   - 代码、正则、路径、快捷键（Shift、Ctrl、Esc、⏎）、`go/xxx` 内部链接、命令名。
   - 单独的介词/冠词片段，脱离上下文很可能译错的（如单独的 "for"、"to"、"of"、"in"、"the"、"with"、"at"）。但单独的 "or" → "或"、"and" → "和"、"ago" → "前" 可以翻译。
5. 片段：有些字符串是句子片段，运行时会和动态值按英文语序拼接（例如 "Canceled deletion of" + 名称，"does not exist." 跟在路径后）。请译成拼接后仍能读通的中文（"已取消删除" / "不存在。"），以开头/结尾的标点、括号原样保留（"Show more (" → "显示更多 ("）。
6. 以冒号结尾的标签保留冒号，改用中文全角冒号："Working directory:" → "工作目录："。
7. 全大写英文（"OPEN"）正常翻译为中文（"打开"）。
8. 开发者日志/报错类字符串也照常翻译（简洁直译即可），不要遗漏。
9. 关于标题大小写：英文 Title Case 无需在中文体现。

## 术语表（必须统一）

| English | 中文 |
|---|---|
| Agent | 智能体 |
| Agent Manager | 智能体管理器 |
| Subagent | 子智能体 |
| Conversation | 对话 |
| New Conversation | 新建对话 |
| Conversation History | 对话历史 |
| Workspace | 工作区 |
| Project | 项目 |
| Artifact | 产物 |
| Task / Task List | 任务 / 任务列表 |
| Implementation Plan | 实施计划 |
| Walkthrough | 演练 |
| Planning (mode) | 规划 |
| Fast (mode) | 快速 |
| Plugin | 插件 |
| Skill | 技能 |
| Marketplace | 市场 |
| Customizations | 自定义 |
| Automation(s) | 自动化 |
| Hook | 钩子 |
| Rule | 规则 |
| Workflow | 工作流 |
| Memory / Memories | 记忆 |
| Knowledge | 知识库 |
| MCP server | MCP 服务器 |
| Tool | 工具 |
| Model | 模型 |
| Settings | 设置 |
| Preferences | 偏好设置 |
| Sign in / Sign out | 登录 / 退出登录 |
| Account | 账户 |
| Credits / AI Credits | 积分 / AI 积分 |
| Quota | 配额 |
| Usage | 用量 |
| Billing | 计费 |
| License | 许可 |
| Sandbox | 沙盒 |
| Terminal | 终端 |
| Browser | 浏览器 |
| Editor | 编辑器 |
| Review | 审查 |
| Accept / Reject | 接受 / 拒绝 |
| Approve / Deny / Allow | 批准 / 拒绝 / 允许 |
| Allow list / Deny list | 允许列表 / 拒绝列表 |
| Auto-execute / Auto-run | 自动执行 / 自动运行 |
| Commit / Stage / Unstage | 提交 / 暂存 / 取消暂存 |
| Diff | 差异 |
| Branch | 分支 |
| Worktree | 工作树 |
| Pull request | 拉取请求 |
| Repository | 仓库 |
| Inbox | 收件箱 |
| Feedback | 反馈 |
| Side question | 旁支提问 |
| Trajectory | 轨迹 |
| Step | 步骤 |
| Checkpoint | 检查点 |
| Revert | 回退 |
| Undo / Redo | 撤销 / 重做 |
| Queue / Queued | 队列 / 已排队 |
| Mention | 提及 |
| Attachment | 附件 |
| Context | 上下文 |
| Pane / Panel | 窗格 / 面板 |
| Tab (UI tab) | 标签页 |
| Tab (the autocomplete product feature, e.g. "Allow Tab to …") | Tab |
| Window / File / View / Edit / Help | 窗口 / 文件 / 视图 / 编辑 / 帮助 |
| Remote Control | 远程控制 |
| Local / Remote / Cloud | 本地 / 远程 / 云端 |
| Instance | 实例 |
| Hub | 中心 |
| Labs | 实验室 |
| Preview | 预览 |
| Experimental | 实验性 |
| Enterprise / Business / Personal | 企业版 / 企业 / 个人 |
| Prompt | 提示词 |
| Command | 命令 |
| Permission | 权限 |
| Annotation | 批注 |
| Comment | 评论 |
| Group | 分组 |
| Archive | 归档 |
| Pin / Unpin | 置顶 / 取消置顶 |
| Copied | 已复制 |
| Loading... | 正在加载... |
| Retry / Try again | 重试 |
| Dismiss | 关闭 |
| Learn more | 了解详情 |
| Upgrade | 升级 |
| Update | 更新 |
| Reload | 重新加载 |
| Diagnostics | 诊断信息 |

## 输出

输出 **合法 JSON**（UTF-8，`JSON.parse` 能解析），对象形式，键为原文：

- 正常译文：`"Settings": "设置"`
- 有意不翻译（产品名、代码、内部 ID、开发者调试信息等）：值写 `null`（或与原文相同）
- 含 `{n}` 占位符的条目，译文中的占位符集合必须与原文一致

保存为 `.work/translated.json` 后运行 `npm run apply -- .work/translated.json` 合并进词典，工具会校验占位符并统一“你/您”。
