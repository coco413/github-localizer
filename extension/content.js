(() => {
  if (location.origin !== 'https://github.com' || !/^\/[^/]+\/[^/]+\/?$/.test(location.pathname)) return;

  const codeLink = document.querySelector('a#code-tab');
  const navigation = codeLink?.closest('nav[aria-label="Repository"], nav[aria-label="Repository navigation"], nav[aria-labelledby="repository-navigation"]');
  const homePath = location.pathname.replace(/\/$/, '');
  if (!navigation || codeLink.origin !== location.origin || codeLink.pathname.replace(/\/$/, '') !== homePath) return;

  for (const [id, [source, translation]] of Object.entries(globalThis.githubLocalizerRepositoryWords)) {
    const link = navigation.querySelector(`a#${id}`);
    const label = link?.querySelector(`span[data-content="${source}"]`);
    const text = label?.firstChild;
    if (label?.childNodes.length === 1 && text.nodeType === Node.TEXT_NODE && text.data === source) {
      text.data = translation;
      if (link.getAttribute('aria-label') === source) link.setAttribute('aria-label', translation);
    }
  }
})();
