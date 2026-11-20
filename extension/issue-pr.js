(() => {
  if (location.origin !== 'https://github.com') return;
  const route = location.pathname.match(/^\/[^/]+\/[^/]+\/(issues(?:\/\d+)?|pulls|pull\/\d+(?:\/(?:files|commits|checks))?)\/?$/);
  if (!route) return;
  const [section, number] = route[1].split('/');
  const rules = globalThis.githubLocalizerIssuePrWords[number ? section + 'Detail' : section];
  const main = document.querySelector('main #repo-content-pjax-container, main#repo-content-pjax-container');
  if (!main || !rules) return;

  const protectedContent = [
    '.markdown-body', '.comment-body', '[contenteditable]', 'pre', 'code', '.diff-view',
    '[data-testid="issue-title"]', '[data-testid="pull-request-title"]',
  ].join(', ');
  for (const [selector, words] of rules) {
    for (const element of main.querySelectorAll(selector)) {
      if (element.closest(protectedContent)) continue;
      const text = element.firstChild;
      if (element.childNodes.length === 1 && text.nodeType === Node.TEXT_NODE) {
        const source = text.data.trim();
        if (Object.hasOwn(words, source)) text.data = text.data.replace(source, words[source]);
      }

      for (const attribute of ['aria-label', 'placeholder', 'title']) {
        const label = element.getAttribute(attribute);
        if (Object.hasOwn(words, label)) element.setAttribute(attribute, words[label]);
      }
    }
  }
})();
