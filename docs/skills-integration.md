# VeryMath Skill 接入

工作台直接读取标准 `SKILL.md`，支持 VeryMath 的分组目录以及项目自己的 `.agents/skills/`。库文件仍留在原目录，不复制一套 Skill 到程序中。

## 在界面中使用

1. 在对话输入框下方点击 **Skill**。
2. 搜索并选择研究方法，查看用途和参考资料。
3. 点击“使用这个 Skill”，再输入问题。

选择后输入框上方显示 Skill 名称，可随时取消。每次回答保存当时实际使用的 Skill 路径及已加载的参考文件。切换项目或刷新页面后需要重新选择；过去的对话记录不会偷偷重新激活 Skill。

首次接入可展开“接入 VeryMath Skill 库”，填写本机库目录。可以选择 AI4Math-Skill-Library 仓库顶层、它的 skills 目录，或某个标准 Skill 包。库位置保存到应用配置目录的 `verymath-skills.json`；项目内的 Skill 无需另行连接。

## 当前支持范围

当前是**流程指导**：完整加载 Skill 主说明，并读取其中明确引用的包内 Markdown、文本或 LaTeX 参考说明，让模型按这些步骤分析问题。

这不等于已经安装或运行 Skill 依赖。工作台没有新增 shell、Lean、求解器、文件写入或独立审稿执行器。要求这些工具的步骤应显示为待执行，而不是声称完成。更完整的执行能力可在这一读取接口之上接入相应执行器。

主说明最多 32 KB；包内最多加载八份参考说明，每份最多 32 KB，参考文字合计最多 12,000 字符。缺失、越界、过长或格式未支持的引用会列出原因，不把不完整的资料说成完整加载。例如大型论文阅读包目前可能只能载入路由说明，详细模块会提示超过本轮容量。

选择 Skill 时项目材料文字预算为 14,000 字符，历史预算为 6,000 字符，为 Skill 说明留出空间。材料节选仍在回答来源中说明。

## 程序接口

| 接口 | 用途 |
|---|---|
| `POST /api/skills/library` | 设置或断开本机 Skill 库，正文为 `directory` |
| `GET /api/projects/:projectId/skills` | 读取 VeryMath 库和项目内 Skill 的列表 |
| `GET /api/projects/:projectId/skill?source=verymath&path=...` | 读取某个 Skill 主说明、参考文字和未加载原因 |
| `POST /api/projects/:projectId/runs` | 在原研究请求中加入可选的 `skill`，按该方法处理本轮问题 |

研究请求中的 `skill` 包含 `source`、`path` 和 `directory`。`source` 为 `verymath` 或 `project`；`path` 是相应目录中的相对 SKILL.md 路径；VeryMath 来源的 `directory` 使用详情接口返回的位置。位置改变时旧选择会被拒绝，用户需重新选择，以免同名路径来自另一套库。

Python Core 对应 `skill.connect`、`skill.list`、`skill.read`。Node 只把实际读取的说明交给模型，不重复维护另一套 Skill 定义。接口没有新增文件哈希、批准凭证、接口描述注册系统或隐藏执行关卡。

## 实际验证

本机连接的是 VeryMath/AI4Math-Skill-Library 的现有 checkout，发现 50 个 Skill，另有一个项目内 Skill。通过界面选择 `proof-blueprint-review`，实际载入完整主说明和五份协议参考，使用 ecnu-max 生成了文字审查草稿并继续修订。

数学论文阅读包的同目录模块和有限元包的 SKILL1/2/3 引用也已检查；超过文字容量的内容有明确说明。没有声称全部 50 个 Skill 已可完整执行，亦未调用 Lean、求解器或独立数学审稿系统。
