(() => {
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

  function translate(root) {
    for (const [selector, words] of rules) {
      const elements = [...root.querySelectorAll(selector)];
      if (root.matches(selector)) elements.unshift(root);
      for (const element of elements) {
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
  }

  document.querySelectorAll(scope).forEach(translate);
  globalThis.githubLocalizerIssuePrObserver?.disconnect();
  const observer = new MutationObserver((records) => {
    if (location.pathname !== path) {
      observer.disconnect();
      return;
    }
    const affected = new Set();
    for (const { target, addedNodes } of records) {
      if (target instanceof Element && target.closest(scope)) {
        affected.add(target);
        continue;
      }
      for (const node of addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(scope)) affected.add(node);
        node.querySelectorAll(scope).forEach((element) => affected.add(element));
      }
    }
    affected.forEach((element) => {
      if (element.isConnected) translate(element);
    });
  });
  // Mounting and replacing controls changes child lists. Our text and label
  // writes do not, so they do not queue another translation pass.
  observer.observe(document.body, { childList: true, subtree: true });
  globalThis.githubLocalizerIssuePrObserver = observer;
})();
