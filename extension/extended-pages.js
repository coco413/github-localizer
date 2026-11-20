globalThis.githubLocalizerRuntime?.register('extended-pages', () => {
  const runtime = globalThis.githubLocalizerRuntime;
  if (location.origin !== 'https://github.com') return;
  const route = /^(\/[^/]+\/[^/]+)(?:\/(actions|releases|milestones)(?:\/.*)?)?\/?$/.exec(location.pathname);
  if (!route) return;
  const [, repository, page] = route;
  const path = location.pathname.replace(/\/$/, '');

  function translateText(element, words) {
    if (element.closest('.markdown-body, pre, code, [contenteditable], .js-job-log')) return;
    for (const text of element.childNodes) {
      if (text.nodeType !== Node.TEXT_NODE) continue;
      const original = runtime.source(text, null);
      const source = original.trim();
      if (Object.hasOwn(words, source)) {
        runtime.replace(text, null, original.replace(source, () => runtime.word(words[source])));
      }
    }
  }

  function translate(root, selector, words) {
    for (const element of runtime.matches(selector, root)) translateText(element, words);
  }

  if (page) {
    for (const time of runtime.matches('main relative-time[datetime]')) {
      if (!time.closest('.markdown-body, pre, code, [contenteditable], .js-job-log')) {
        runtime.replace(time, 'lang', 'zh-CN');
      }
    }
  }

  if (!page) {
    const home = document.querySelector('react-app[app-name="code-view"]');
    if (!home) return;
    translate(home, '[data-testid="repo-header-actions"] [data-component="text"]', {
      Notifications: '通知', Watch: '关注', Unwatch: '取消关注', Fork: { beginner: '复刻', professional: 'Fork' }, Star: '加星标', Starred: '已加星标',
    });
    translate(home, '[data-testid="repo-header-actions"] :is([role="menuitem"], [role="menuitemradio"]) [data-component="text"]', {
      'Participating and @mentions': '参与和提及',
    });
    const labels = {
      'You must be signed in to fork a repository': { beginner: '登录后才能复刻仓库', professional: '登录后才能 Fork 仓库' },
      'You must be signed in to change notification settings': '登录后才能更改通知设置',
      'Star this repository': '为此仓库加星标',
      'Unstar this repository': '移除此仓库的星标',
    };
    for (const button of runtime.matches('[data-testid="repo-header-actions"] [aria-label]', home)) {
      const source = runtime.source(button, 'aria-label');
      if (Object.hasOwn(labels, source)) runtime.replace(button, 'aria-label', runtime.word(labels[source]));
    }
    translate(home, '[class*="sidebarSection__"] > h2 > span', {
      About: '关于', Releases: '发布版本', Packages: '软件包', Contributors: '贡献者', Languages: '语言',
    });
    return;
  }

  if (page === 'actions') {
    const states = {
      Success: '成功', Failure: '失败', Cancelled: '已取消', Queued: '排队中', 'In progress': '进行中',
    };
    const run = /^\/actions\/runs\/\d+(?=\/|$)/.exec(path.slice(repository.length));
    if (run) {
      translate(document, 'main .PageHeader a[href^="/login?"]', { 'Sign in to view logs': '登录后查看日志' });
      const summary = { Summary: '摘要' };
      translate(document, 'main .PageHeader-navigation h2 > .Truncate-text', summary);
      for (const label of runtime.matches('main a[data-component="NavList.Item"][aria-current="page"] [data-component="ActionList.Item.Label"]')) {
        const link = label.closest('a');
        if (link.origin === location.origin && link.pathname.replace(/\/$/, '') === repository + run[0]) {
          translateText(label, summary);
        }
      }
      translate(document, 'main [aria-label="Workflow run summary"] span.text-small', {
        Status: '状态', 'Total duration': '总耗时', Artifacts: '构建产物',
      });
      translate(document, 'main [aria-label="Workflow run summary"] span.h4', states);
      if (/^\/job\/\d+$/.test(path.slice(repository.length + run[0].length))) {
        translate(document, 'main [role="region"][aria-label="Annotations"] job-annotations h2', {
          Annotations: '注解',
        });
        translate(document, 'main job-annotations annotation-message button[data-target^="annotation-message.show"]', {
          'Show more': '展开', 'Show less': '收起',
        });
        translate(document, 'main [aria-label="Check run summary"] .js-check-run-blankslate h4, main [aria-label="Check run summary"].js-zen-blankslate h4', {
          'The logs for this run have expired and are no longer available.': '此次运行的日志已过期，无法查看。',
          'Re-running jobs...': '正在重新运行作业…',
        });
        translate(document, 'main #logs .js-checks-log-toolbar .CheckRun-log-title > .js-updatable-content', {
          failed: '失败', succeeded: '成功', cancelled: '已取消', skipped: '已跳过',
        });
        const stepTitles = {
          'This step failed': '此步骤失败',
          'This step passed': '此步骤通过',
          'This step timed out': '此步骤超时',
          'This step was cancelled': '此步骤已取消',
          'This step was skipped': '此步骤已跳过',
          'This step was neutral': '此步骤状态为中性',
          'This step requires action with the application': '此步骤需要在应用程序中执行操作',
        };
        for (const icon of runtime.matches('main #logs check-steps check-step svg[data-component="Octicon"][title]')) {
          if (icon.closest('.js-job-log, .markdown-body, pre, code, [contenteditable]')) continue;
          const title = runtime.source(icon, 'title');
          if (Object.hasOwn(stepTitles, title)) runtime.replace(icon, 'title', runtime.word(stepTitles[title]));
        }
      }
      return;
    }
    for (const link of runtime.matches('main nav[aria-label="Workflows"] a[href]')) {
      if (link.origin === location.origin && link.pathname === repository + '/actions') {
        const words = { 'All workflows': '所有工作流' };
        translateText(link, words);
        for (const child of link.children) if (child.matches('span')) translateText(child, words);
      }
    }
    translate(document, 'main nav[aria-label="Workflows"] h2 > span', { Workflows: '工作流' });
    if (path === repository + '/actions') {
      translate(document, 'main h1[data-component="PH_Title"]', { 'All workflows': '所有工作流' });
    }
    translate(document, 'main [aria-label="Workflow run filters"] :is(button, summary) [data-component="text"]', {
      Workflow: '工作流', Event: '事件', Status: '状态', Branch: '分支', Actor: '触发者',
    });
    translate(document, 'main [aria-label="Workflow run filters"] [role="menuitem"]', states);
    const statusOptions = {
      ...states, 'Action required': '需要操作', Completed: '已完成', Neutral: '中性',
      Skipped: '已跳过', Stale: '已过期', 'Timed out': '已超时', Waiting: '等待中',
    };
    for (const dialog of runtime.matches('#__primerPortalRoot__ [role="dialog"][data-component="AnchoredOverlay"]')) {
      if (!runtime.recheckScope(dialog)) continue;
      const filter = dialog.querySelector('input[role="combobox"][data-component="input"][aria-label]');
      if (!filter || runtime.source(filter, 'aria-label') !== 'Filter status options') continue;
      runtime.replace(filter, 'aria-label', runtime.word('筛选状态选项'));
      translate(dialog, '[role="option"][data-component="ActionList.Item"] [data-component="ActionList.Item.Label"]', statusOptions);
    }
    translate(document, 'main .blankslate h2, main [aria-label="Workflow runs results"] h2', {
      'No workflow runs': '没有工作流运行记录',
    });
    return;
  }

  if (page === 'releases') {
    const navigation = { Releases: '发布版本', Tags: '标签' };
    for (const link of runtime.matches('main nav[aria-label="Releases and tags"] a[href]')) {
      if (link.origin !== location.origin || link.hash) continue;
      if (link.pathname === repository + '/releases' || link.pathname === repository + '/tags') {
        translateText(link, navigation);
        for (const child of link.children) if (child.matches('span')) translateText(child, navigation);
      }
    }
    if (path === repository + '/releases') {
      translate(document, 'main h1[data-component="PH_Title"]', navigation);
    }
    translate(document, 'main nav[aria-label="Releases and tags"] h2 > span', { 'On this page': '本页内容' });
    translate(document, 'main a[href$="/releases/latest"] > .Label', { Latest: '最新' });
    translate(document, 'main select-panel > dialog-helper > button .Button-label', { Compare: '比较' });
    translate(document, 'main select-panel .SelectPanel-emptyPanel > h2', { 'No results found': '没有找到结果' });
    translate(document, 'main .Box-footer details-toggle summary > span > span', { Assets: '发布附件' });
    translate(document, 'main .pagination :is(.previous_page, .next_page)', { Previous: '上一页', Next: '下一页' });
    translate(document, 'main [data-component="Blankslate.Heading"], main .blankslate h2', {
      'There aren’t any releases here': '这里还没有发布版本',
    });
    return;
  }

  if (path !== repository + '/milestones') return;
  const states = { Open: '进行中', Closed: '已关闭' };
  for (const link of runtime.matches('main a[data-testid$="-milestone-tab"]')) {
    if (link.origin !== location.origin || link.pathname !== repository + '/milestones') continue;
    translateText(link, states);
    for (const child of link.children) if (child.matches('span, div')) translateText(child, states);
  }
  translate(document, 'main h1[data-component="PH_Title"]', { Milestones: '里程碑' });
  translate(document, 'main [aria-label="Milestones"] [role="toolbar"] button [data-component="text"]', {
    Sort: '排序', 'New milestone': '新建里程碑',
  });
  translate(document, 'main [aria-label="Milestones"] [data-component="Blankslate.Heading"]', {
    'You haven’t created any Milestones.': '你还没有创建任何里程碑。',
  });
});
