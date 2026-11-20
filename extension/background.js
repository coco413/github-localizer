const api = globalThis.browser ?? globalThis.chrome;
const site = 'https://github.com/*';
const repositoryScript = {
  id: 'github-localizer',
  matches: [site],
  js: ['runtime.js', 'preferences.js', 'page-settings.js', 'repository-words.js', 'issue-pr-words.js', 'extended-pages.js', 'content.js', 'issue-pr.js'],
  runAt: 'document_end',
};

let pending = Promise.resolve();

function reconcileAuthorization(translateOpenTabs = false) {
  pending = pending.then(async () => {
    const granted = await api.permissions.contains({ origins: [site] });
    if (!granted || translateOpenTabs) {
      const tabs = await api.tabs.query(granted ? { url: site } : {});
      // A revoked host grant can prevent delivery. Reloading then restores the page.
      await Promise.allSettled(tabs.map(({ id }) =>
        api.tabs.sendMessage(id, { type: 'authorization-changed', granted })));
    }
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

api.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === 'activate') {
    pending.then(() => respond(true));
    return true;
  }
  if (message.type !== 'authorization') return;
  api.permissions.contains({ origins: [site] }).then(respond, () => respond(false));
  return true;
});

api.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-original' || !(await api.permissions.contains({ origins: [site] }))) return;
  const active = tab ?? (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (active?.id == null) return;
  await api.tabs.sendMessage(active.id, { type: 'toggle-original', shortcut: true }).catch(() => {});
});
