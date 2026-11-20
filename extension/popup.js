const api = globalThis.browser ?? globalThis.chrome;
const sitePermission = { origins: ['https://github.com/*'] };
const defaults = globalThis.githubLocalizerPreferences;
const status = document.querySelector('#status');
const authorize = document.querySelector('#authorize');
const settings = document.querySelector('#settings');
const enabled = document.querySelector('#enabled');
const mode = document.querySelector('#mode');
const original = document.querySelector('#original');
const activeTab = api.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab);
let refreshRevision = 0;
let repositoryCheck;

async function supportedPage(tab) {
  if (!tab?.url) return false;
  const { origin, pathname, searchParams } = new URL(tab.url);
  if (origin !== 'https://github.com') return false;
  const route = /^\/([^/]+)\/[^/]+(?:\/(?:issues(?:\/\d+)?|pulls|compare(?:\/.+)?|pull\/\d+(?:\/(?:files|commits|checks))?|actions(?:\/.*)?|releases(?:\/.*)?|milestones(?:\/.*)?))?\/?$/.exec(pathname);
  if (!route || ['login', 'settings', 'orgs', 'users', 'marketplace', 'topics', 'collections', 'sponsors',
    'features', 'notifications', 'account', 'search', 'explore', 'apps'].includes(route[1].toLowerCase())) return false;
  if (pathname.split('/')[3] === 'compare' &&
      searchParams.get('expand') !== '1' && searchParams.get('quick_pull') !== '1') return false;
  if (!repositoryCheck) {
    // Chromium can queue an injection while site access is withheld.
    const probe = api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => Boolean(document.querySelector('meta[name="octolytics-dimension-repository_id"][content]')?.content),
    }).then(([check]) => check?.result === true, () => true);
    repositoryCheck = Promise.race([probe, new Promise((resolve) => setTimeout(resolve, 300, true))]);
  }
  return repositoryCheck;
}

async function refresh() {
  const revision = ++refreshRevision;
  const [tab, granted, preferences] = await Promise.all([
    activeTab,
    api.permissions.contains(sitePermission),
    api.storage.local.get(defaults),
  ]);
  const supported = await supportedPage(tab);
  const page = supported && granted && preferences.enabled
    ? await api.tabs.sendMessage(tab.id, { type: 'page-state' }).catch(() => null)
    : null;
  if (revision !== refreshRevision) return;
  authorize.hidden = !supported || granted;
  settings.hidden = !supported || !granted;
  enabled.checked = preferences.enabled;
  mode.value = preferences.mode;
  original.disabled = !page;
  original.textContent = page?.original ? '恢复译文' : '查看原文';
  status.textContent = !supported ? '不支持' : !granted ? '未授权' :
    preferences.enabled && !page?.original ? '已启用' : '暂停';
}

authorize.addEventListener('click', async () => {
  authorize.disabled = true;
  try {
    const granted = await api.permissions.request(sitePermission);
    // The background injects existing tabs asynchronously after the grant.
    if (granted) await api.runtime.sendMessage({ type: 'activate' });
    await refresh();
  } catch {
    status.textContent = '无法申请 GitHub 权限，请重试。';
  } finally {
    authorize.disabled = false;
  }
});

enabled.addEventListener('change', () => api.storage.local.set({ enabled: enabled.checked }));
mode.addEventListener('change', () => api.storage.local.set({ mode: mode.value }));
original.addEventListener('click', async () => {
  const tab = await activeTab;
  await api.tabs.sendMessage(tab.id, { type: 'toggle-original' }).catch(() => {});
  await refresh();
});
api.storage.onChanged.addListener(refresh);
api.permissions.onAdded.addListener(refresh);
api.permissions.onRemoved.addListener(refresh);
void refresh();
