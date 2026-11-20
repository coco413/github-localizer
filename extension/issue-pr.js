globalThis.githubLocalizerRuntime?.register('issue-pr', () => {
  const runtime = globalThis.githubLocalizerRuntime;
  if (location.origin !== 'https://github.com') return;
  const path = location.pathname;
  const route = path.match(/^\/[^/]+\/[^/]+\/(issues(?:\/\d+)?|pulls|pull\/\d+(?:\/(?:files|commits|checks))?)\/?$/);
  if (!route) return;
  const [section, number] = route[1].split('/');
  const page = number ? section + 'Detail' : section;
  const rules = globalThis.githubLocalizerIssuePrWords[page];
  if (!rules) return;

  const container = '#repo-content-pjax-container';
  const portal = globalThis.githubLocalizerIssuePrPortals[page];
  const scope = portal ? `${container}, ${portal}` : container;
  const protectedContent = [
    '.markdown-body', '.comment-body', '[contenteditable]', 'pre', 'code', '.diff-view',
    '[data-testid="issue-title"]', '[data-testid="pull-request-title"]',
  ].join(', ');

  for (const time of runtime.matches(`${container} relative-time[datetime]`)) {
    if (!time.closest(protectedContent)) runtime.replace(time, 'lang', 'zh-CN');
  }

  for (const [selector, words, { icon = false } = {}] of rules) {
    const elements = runtime.matches(selector);
    for (const element of elements) {
      if (!element.closest(scope) || element.closest(protectedContent)) continue;
      const labels = icon ? Array.from(element.childNodes).filter((node) => {
        if (node instanceof Element && node.matches('svg[aria-hidden="true"]')) return false;
        return node.nodeType !== Node.TEXT_NODE || node.data.trim() !== '';
      }) : element.childNodes;
      const [text] = labels;
      if (labels.length === 1 && text.nodeType === Node.TEXT_NODE) {
        const original = runtime.source(text, null);
        const source = original.trim();
        if (Object.hasOwn(words, source)) {
          runtime.replace(text, null, original.replace(source, () => runtime.word(words[source])));
        }
      }

      for (const attribute of ['aria-label', 'placeholder', 'title']) {
        const label = runtime.source(element, attribute);
        if (Object.hasOwn(words, label)) runtime.replace(element, attribute, runtime.word(words[label]));
      }
    }
  }
});
