const dual = (beginner, professional) => ({ beginner, professional });
const control = (id, selector, expected) => ({ id, selector, expected });
const headings = 'main h1[data-component="PH_Title"]';
const visibleIssueState = 'main [data-testid="header-state"][data-component="StateLabel"], main [data-testid="issue-state"] > span, main .State > span';
const issueList = [
  control('issue-new', 'main a[href$="/issues/new"] [data-component="text"], main a[href^="/login?return_to="][data-variant="primary"] [data-component="text"]', { 'New issue': '新建议题' }),
];
const protectedLabels = { id: 'pr-term', selector: 'nav[aria-label="Repository"] span[data-content="Pull requests"]',
  expected: { 'Pull requests': dual('拉取请求（PR）', 'PR') }, retained: ['PR'] };

function sampleSet(repository, { issue, pull, run }) {
  const base = `https://github.com/${repository}`;
  const shared = [
    { url: base, controls: [
      control('repo-code', 'nav[aria-label="Repository"] span[data-content="Code"], nav[aria-label="Repository navigation"] span[data-content="Code"]', { Code: '代码' }),
      protectedLabels,
    ] },
    { url: `${base}/issues`, controls: issueList },
    { url: `${base}/issues?q=is%3Aissue+%22github-localizer-inspection-empty-67adb%22`, controls: [
      control('issues-empty', 'main [data-component="Blankslate.Heading"], main .blankslate h2',
        { 'No results': '没有结果', 'No results found': '未找到结果' }),
    ] },
    { url: `${base}/pulls`, controls: [
      { ...control('pulls-search', '#repo-pulls-dashboard-filter-input', {
        'Search pull requests': dual('搜索拉取请求（PR）', '搜索 PR'),
      }), attribute: 'placeholder' },
    ] },
    { url: `${base}/actions`, controls: [
      control('actions-heading', headings, { 'All workflows': '所有工作流' }),
    ] },
    { url: `${base}/releases`, controls: [
      control('releases-heading', headings, { Releases: '发布版本' }),
    ] },
    { url: `${base}/milestones`, controls: [
      control('milestones-heading', headings, { Milestones: '里程碑' }),
    ] },
  ];
  const details = [
    ['issue-detail', issue, 'issues', control('issue-state', visibleIssueState, { Open: '未关闭', Closed: '已关闭' })],
    ['pull-detail', pull, 'pull', control('pr-state', 'main [data-component="StateLabel"][data-status^="pull"], main [data-testid="pull-request-state"], main .State',
      { Open: '未关闭', Closed: '已关闭', Merged: '已合并', Draft: '草稿' })],
    ['workflow-run', run, 'actions/runs', control('workflow-summary', 'main .PageHeader-navigation h2 > .Truncate-text, main [data-component="NavList.Item"][aria-current="page"] [data-component="ActionList.Item.Label"]', { Summary: '摘要' })],
  ].map(([name, number, path, probe]) => /^[1-9]\d*$/.test(number ?? '')
    ? { url: `${base}/${path}/${number}`, controls: [probe] }
    : missing(`Configure the dedicated ${name} sample number for ${base}`, name));
  return [...shared, ...details];
}

function missing(reason, name = 'repository') {
  return { url: null, incomplete: true, findings: [
    { kind: 'unavailable', control: `dedicated-sample-${name}`, original: null, reason },
  ] };
}

export function inspectionSamples(env) {
  const publicSamples = sampleSet('microsoft/playwright', { issue: 44255, pull: 44256, run: 44775528835 });
  if (!/^[a-z0-9-]+\/[a-z0-9_.-]+$/i.test(env.INSPECTION_SAMPLE_REPO ?? '')) {
    return [...publicSamples, missing('Configure INSPECTION_SAMPLE_REPO with a public, dedicated synthetic sample repository')];
  }
  const dedicated = sampleSet(env.INSPECTION_SAMPLE_REPO, {
    issue: env.INSPECTION_SAMPLE_ISSUE, pull: env.INSPECTION_SAMPLE_PULL, run: env.INSPECTION_SAMPLE_RUN,
  });
  return [...publicSamples, ...dedicated];
}
