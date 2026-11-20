const api = globalThis.browser ?? globalThis.chrome;
const site = 'https://github.com/*';
const repositoryScript = {
  id: 'github-localizer',
  matches: [site],
  js: ['repository-words.js', 'content.js'],
  runAt: 'document_end',
};

let pending = Promise.resolve();

function reconcileAuthorization(translateOpenTabs = false) {
  pending = pending.then(async () => {
    const granted = await api.permissions.contains({ origins: [site] });
    const filters = { ids: [repositoryScript.id] };
    const [registered] = await api.scripting.getRegisteredContentScripts(filters);
    if (!granted) {
      if (registered) await api.scripting.unregisterContentScripts(filters);
      return;
    }

    if (!registered) await api.scripting.registerContentScripts([repositoryScript]);
    if (translateOpenTabs) {
      const tabs = await api.tabs.query({ url: site });
      // A tab can close or navigate away between the query and injection.
      await Promise.allSettled(tabs.map(({ id }) => api.scripting.executeScript({
        target: { tabId: id },
        files: repositoryScript.js,
      })));
    }
  }).catch((error) => console.error('GitHub 译伴无法更新站点授权', error));
}

api.runtime.onInstalled.addListener(() => reconcileAuthorization(true));
api.runtime.onStartup.addListener(() => reconcileAuthorization());
api.permissions.onAdded.addListener(() => reconcileAuthorization(true));
api.permissions.onRemoved.addListener(() => reconcileAuthorization());
