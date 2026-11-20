# 词库校验与 GitHub 巡检

`npm run check:locales` 检查随扩展打包的词库及规则，诊断包含文件、行号和列号。打包开始前运行同一检查。词条使用字符串表示两档共用译法，或用 `beginner` 和 `professional` 分别提供译法。两档均须保留原文的变量和内联标签。PR 的 CI 运行固定样例，包括巡检分类和重复建单回归。

安装 Chromium 后，运行 `npm run inspect:github` 检查公开页和配置好的样例仓库。巡检通过浏览器检查实际渲染的控件，在隔离环境中对照原文和两档译文，报告写入 `artifacts/github-inspection.json`。报告记录词库内容哈希、时间、样例 URL、选择器和属性。它分别列出未收录、规则失效、保留英文和不可访问，按受影响页数排序，并为未收录的文案生成候选词条。

在 Actions 仓库变量中填写下列配置。样例仓库应由专用账号维护，公开可读，使用合成的标题、评论和日志。

| 变量 | 内容 |
| --- | --- |
| `INSPECTION_SAMPLE_REPO` | `owner/repository` |
| `INSPECTION_SAMPLE_ISSUE` | 样例 Issue 编号 |
| `INSPECTION_SAMPLE_PULL` | 样例 PR 编号 |
| `INSPECTION_SAMPLE_RUN` | 失败的样例 Actions 运行 ID |

默认分支每周一次生成 Actions 构建产物。它将未收录和规则失效作为 `needs-triage` 创建到本仓库。同一控件和原文的同类发现会合并样例链接。建单时同时检查打开及已关闭的问题，并保留首次发现时间。手动运行默认只生成报告。

发版前在 Actions 手动运行 **GitHub interface inspection** 并勾选 `release`，或运行 `npm run inspect:github -- --release`。样例缺失、页面不可访问、规则失效或未收录均阻止该检查通过。报告包含登录后、窄屏、键盘打开过滤器、延迟加载菜单及空状态。各浏览器实装和更广的键盘操作另记在发布验收记录中。修复后重新运行，并记录修复可发布和用户可安装的时间，商店审核时间单列。报告中缺少实测依据的时间字段留空。

需要合并已有发布证据时，用 `INSPECTION_LIFECYCLE_FILE` 指向本地 JSON 文件，以报告中每条发现的 `key` 为键。值可填写 `firstDetectedAt`、`fixPublishableAt`、`userInstallableAt` 和 `storeReviewAt`，时间统一用 ISO 8601。

登录后样例使用专用测试账号。将 Playwright storage state JSON 保存为仓库 secret `INSPECTION_AUTH_STATE`，本地可用 `INSPECTION_AUTH_STATE_FILE` 指向私密文件。过期会话及无法打开的必测菜单均标记「未完成」。

本地复跑沿用前一个报告的时间记录，Actions 从上一份可用报告恢复记录，已消失的发现也保留在 `lifecycle`。已建单发现还可从 Issue 中恢复首次发现时间。长期保存的发布证据可通过上述 lifecycle 文件合并。
