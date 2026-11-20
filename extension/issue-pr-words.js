(() => {
  const deleteDialog = ':is(dialog, [role="dialog"]):is([aria-label="Delete issue"], [aria-label="删除议题"])';
  const reviewDialog = ':is(dialog, [role="dialog"]):is([aria-label="Review changes"], [aria-label="审核更改"])';
  const filterDialog = ':is(dialog, [role="dialog"]):is([aria-label="Filter issues"], [aria-label="筛选议题"])';
  const prTabs = 'nav:is(.tabnav-tabs, [aria-label="Pull request tabs"], [aria-label="拉取请求（PR）标签页"], [aria-label="PR 标签页"])';
  const search = 'input[type="search"], input[role="combobox"], button';
  const states = { Open: '未关闭', Closed: '已关闭' };
  const pullStates = { ...states, Merged: '已合并', Draft: '草稿' };
  const filters = ':is(header, [role="toolbar"], .table-list-header) :is(button, button > span, button [data-component="text"])';
  const stateLink = 'a[href*="state%3A"], a[href*="state:"]';
  const stateLinkLabel = ':is(a[href*="state%3A"], a[href*="state:"]) > :is(div, span):not([data-component="CounterLabel"])';
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
    'Filter by author': '按作者筛选',
    'Filter by label': '按标签筛选',
    'Filter by projects': '按项目筛选',
    'Filter by milestones': '按里程碑筛选',
    'Filter by assignee': '按受理人筛选',
    'Filter by reviews': '按审核状态筛选',
    Newest: '最新',
    'Sort by Newest descending': '按最新时间降序排列',
    'Comfortable display density': '宽松显示',
    'Compact display density': '紧凑显示',
  };
  const empty = { 'No results': '没有结果', 'No results found': '未找到结果' };
  const newIssueLink = ':is(a[href*="/issues/new"], a[data-variant="primary"][href^="/login?return_to="][href*="%2fissues%2fnew" i])';
  const newIssue = [`${newIssueLink}, ${newIssueLink} [data-component="text"]`, { 'New issue': '新建议题' }];

  globalThis.githubLocalizerIssuePrPortals = { issues: filterDialog, issuesDetail: deleteDialog, pullDetail: reviewDialog };
  globalThis.githubLocalizerIssuePrWords = {
    issues: [
      ['h1, h2', { Issues: '议题' }],
      newIssue,
      [search, { 'Search issues': '搜索议题' }],
      [filters, { ...listControls, Filters: '筛选' }],
      [filterDialog, { 'Filter issues': '筛选议题' }],
      [`${filterDialog} button`, states],
      [stateLink, states],
      [stateLinkLabel, states],
      ['h2, h3, [data-component="Blankslate.Heading"]', {
        ...empty, 'No results matched your search': '没有符合搜索条件的结果',
      }],
    ],
    issuesDetail: [
      newIssue,
      ['[data-testid="header-state"][data-component="StateLabel"]', states, { icon: true }],
      ['[data-testid="issue-state"], [data-testid="issue-state"] > span, .State, .State > span', states],
      ['h2', { Description: '描述', Activity: '活动' }],
      ['button', {
        'Close issue': '关闭议题', 'Reopen issue': '重新打开议题', 'Delete issue': '删除议题',
        'Copy link': '复制链接', 'Issue body actions': '议题正文操作', 'More actions': '更多操作',
      }],
      [`${deleteDialog} h2`, { 'Delete issue': '删除议题' }],
      [`${deleteDialog} p`, { 'Deleting this issue is permanent.': '删除此议题后将无法恢复。' }],
      [`${deleteDialog} button`, { Cancel: '取消', 'Delete this issue': '删除此议题' }],
      [deleteDialog, { 'Delete issue': '删除议题' }],
    ],
    pulls: [
      ['h1, h2', { 'All pull requests': { beginner: '所有拉取请求（PR）', professional: '所有 PR' }, 'Pull requests': { beginner: '拉取请求（PR）', professional: 'PR' } }],
      [`${search}, #repo-pulls-dashboard-filter, label[for="repo-pulls-dashboard-filter-input"]`, {
        'Search pull requests': { beginner: '搜索拉取请求（PR）', professional: '搜索 PR' },
      }],
      ['a[href*="/compare"], a[href*="/compare"] [data-component="text"]', {
        'New pull request': { beginner: '新建拉取请求（PR）', professional: '新建 PR' },
      }],
      [`${filters}, #repo-pulls-dashboard-filter button`, listControls],
      [stateLink, states],
      [stateLinkLabel, states],
      ['h2, h3', empty],
    ],
    pullDetail: [
      ['[data-component="StateLabel"][data-status^="pull"]', pullStates, { icon: true }],
      ['[data-testid="pull-request-state"], .State, .State > span', pullStates],
      [`${prTabs} :is(a, a > span)`, {
        Conversation: '讨论', Commits: '提交', Checks: '检查', 'Files changed': '变更文件',
      }],
      [prTabs, { 'Pull request tabs': { beginner: '拉取请求（PR）标签页', professional: 'PR 标签页' } }],
      [`${reviewDialog} :is(button, label)`, {
        Comment: '评论', Approve: '批准', 'Request changes': '要求修改', 'Submit review': '提交审核',
      }],
      [`button, ${reviewDialog}`, { 'Review changes': '审核更改' }],
      ['.merge-pr button, #partial-pull-merging button', {
        'Merge pull request': { beginner: '合并拉取请求（PR）', professional: '合并 PR' },
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
