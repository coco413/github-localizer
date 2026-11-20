(() => {
  const search = 'input[type="search"], input[role="combobox"], button';
  const states = { Open: '未关闭', Closed: '已关闭' };
  const filters = ':is(header, [role="toolbar"], .table-list-header) :is(button, button > span)';
  const stateLink = 'a[href*="state%3A"], a[href*="state:"]';
  const stateLinkLabel = 'a[href*="state%3A"] > span, a[href*="state:"] > span';
  const listControls = {
    'Clear filter': '清除筛选条件',
    Search: '搜索',
    Author: '作者',
    Labels: '标签',
    Label: '标签',
    Projects: '项目',
    Milestones: '里程碑',
    Assignees: '受理人',
    Assignee: '受理人',
    Reviews: '审核',
    Newest: '最新',
    'Sort by Newest descending': '按最新时间降序排列',
    'Comfortable display density': '宽松显示',
    'Compact display density': '紧凑显示',
  };
  const empty = { 'No results': '没有结果', 'No results found': '未找到结果' };
  const newIssue = ['a[href*="/issues/new"]', { 'New issue': '新建议题' }];

  globalThis.githubLocalizerIssuePrWords = {
    issues: [
      ['h1, h2', { Issues: '议题' }],
      newIssue,
      [search, { 'Search issues': '搜索议题' }],
      [filters, { ...listControls, Filters: '筛选' }],
      ['dialog', { 'Filter issues': '筛选议题' }],
      ['dialog button', states],
      [stateLink, states],
      [stateLinkLabel, states],
      ['h2, h3', empty],
    ],
    issuesDetail: [
      newIssue,
      ['[data-testid="issue-state"], [data-testid="issue-state"] > span, .State, .State > span', states],
      ['h2', { Description: '描述', Activity: '活动' }],
      ['button', {
        'Close issue': '关闭议题', 'Reopen issue': '重新打开议题', 'Delete issue': '删除议题',
        'Copy link': '复制链接', 'Issue body actions': '议题正文操作', 'More actions': '更多操作',
      }],
      ['dialog[aria-label="Delete issue"] h2', { 'Delete issue': '删除议题' }],
      ['dialog[aria-label="Delete issue"] p', { 'Deleting this issue is permanent.': '删除此议题后将无法恢复。' }],
      ['dialog[aria-label="Delete issue"] button', { Cancel: '取消', 'Delete this issue': '删除此议题' }],
      ['dialog', { 'Delete issue': '删除议题' }],
    ],
    pulls: [
      ['h1, h2', { 'All pull requests': '所有拉取请求（PR）', 'Pull requests': '拉取请求（PR）' }],
      [search, { 'Search pull requests': '搜索拉取请求（PR）' }],
      ['a[href*="/compare"]', { 'New pull request': '新建拉取请求（PR）' }],
      [filters, listControls],
      [stateLink, states],
      [stateLinkLabel, states],
      ['h2, h3', empty],
    ],
    pullDetail: [
      ['[data-testid="pull-request-state"], .State, .State > span', {
        ...states, Merged: '已合并', Draft: '草稿',
      }],
      ['nav.tabnav-tabs a, nav.tabnav-tabs a > span, nav[aria-label="Pull request tabs"] a', {
        Conversation: '讨论', Commits: '提交', Checks: '检查', 'Files changed': '变更文件',
      }],
      ['nav.tabnav-tabs, nav[aria-label="Pull request tabs"]', { 'Pull request tabs': '拉取请求（PR）标签页' }],
      ['dialog[aria-label="Review changes"] button, dialog[aria-label="Review changes"] label', {
        Comment: '评论', Approve: '批准', 'Request changes': '要求修改', 'Submit review': '提交审核',
      }],
      ['button, dialog', { 'Review changes': '审核更改' }],
      ['.merge-pr button, #partial-pull-merging button', {
        'Merge pull request': '合并拉取请求（PR）',
        'Squash and merge': '压缩提交后合并',
        'Rebase and merge': '变基后合并',
        'Confirm merge': '确认合并',
        'Confirm squash and merge': '确认压缩提交后合并',
        'Confirm rebase and merge': '确认变基后合并',
        Cancel: '取消',
      }],
    ],
  };
})();
