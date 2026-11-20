# Issues 与 PR 页面必译控件和状态样例

| 页面 | 必译控件与状态 | 固定样例 |
| --- | --- | --- |
| Issues 列表 | 标题、新建议题、搜索和清空筛选、作者等筛选项、状态筛选、空结果 | [issues-list](../tests/fixtures/issues-list.html) |
| Issue 详情页 | 开启或关闭状态、描述与活动、关闭和重新打开、复制链接、正文操作、删除确认与取消 | [issue-detail](../tests/fixtures/issue-detail.html) |
| PR 列表 | 标题、新建拉取请求、搜索、筛选、状态和空结果 | [pr-list](../tests/fixtures/pr-list.html) |
| PR 详情页 | 状态、详情页签、审核弹层、提交审核、合并方式与确认 | [pr-detail](../tests/fixtures/pr-detail.html)、[pr-review-lazy](../tests/fixtures/pr-review-lazy.html) |

固定样例通过构建后的 Chrome 扩展运行，覆盖键盘打开并关闭筛选弹层、关闭后焦点返回触发按钮、延迟挂载审核弹层、无障碍名称、严格匹配、混合文案回退，以及查询、计数、链接、标题、正文、评论、草稿和 Diff 保留。

删除确认使用「删除此议题后将无法恢复。」明确说明不可逆后果。PR 普通合并、压缩提交后合并和变基后合并各自使用对应的确认文案。人工核查时应在专用样例仓库打开每种确认界面，核对按钮、后果提示和取消，随后取消操作。

公开页面文案对照可使用 [Issues 列表](https://github.com/octocat/Hello-World/issues)、[Issue 详情页](https://github.com/octocat/Hello-World/issues/10)、[PR 列表](https://github.com/octocat/Hello-World/pulls)与 [PR 详情页](https://github.com/octocat/Hello-World/pull/2)。登录后权限对应的删除和合并弹层仍待真实页面验收。

操作文案参考 [GitHub 删除议题文档](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/deleting-an-issue)及 [GitHub 合并 PR 文档](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request)。
