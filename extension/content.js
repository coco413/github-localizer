globalThis.githubLocalizerRuntime?.register('repository-navigation', () => {
  const runtime = globalThis.githubLocalizerRuntime;
  if (location.origin !== 'https://github.com' || !/^\/[^/]+\/[^/]+\/?$/.test(location.pathname)) return;

  const homePath = location.pathname.replace(/\/$/, '');
  const navigation = document.querySelector(
    'nav[aria-label="Repository"], nav[aria-label="Repository navigation"]',
  );
  if (!navigation || !runtime.recheckScope(navigation)) return;
  const protectedContent = '.markdown-body, [contenteditable], pre, code';
  if (navigation.closest(protectedContent)) return;
  const links = Array.from(navigation.querySelectorAll('a[href]')).filter(
    (link) => link.origin === location.origin,
  );
  const codeTab = links.find(
    (link) => link.pathname.replace(/\/$/, '') === homePath && link.querySelector('span[data-content="Code"]'),
  );
  if (!codeTab) return;

  for (const [suffix, entries] of Object.entries(globalThis.githubLocalizerRepositoryWords)) {
    for (const link of links) {
      if (link.pathname.replace(/\/$/, '') !== homePath + suffix) continue;
      for (const [source, translation] of Object.entries(entries)) {
        const label = link.querySelector(`span[data-content="${source}"]`);
        if (label?.closest(protectedContent)) continue;
        const text = label?.firstChild;
        if (label?.childNodes.length === 1 && text.nodeType === Node.TEXT_NODE && runtime.source(text, null) === source) {
          runtime.replace(text, null, runtime.word(translation));
          if (runtime.source(link, 'aria-label') === source) runtime.replace(link, 'aria-label', runtime.word(translation));
        }
      }
    }
  }
});
