(() => {
  const runtime = globalThis.githubLocalizerRuntime;
  if (!runtime || globalThis.githubLocalizerPageSettings) return;
  globalThis.githubLocalizerPageSettings = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const defaults = globalThis.githubLocalizerPreferences;
  let preferences = { ...defaults };
  let authorized = false;
  let authorizationRevision = 0;
  const changedKeys = new Set();

  runtime.configure({ enabled: false });

  function apply(settings) {
    const reenabled = !preferences.enabled && settings.enabled;
    preferences = { ...preferences, ...settings };
    runtime.configure({
      enabled: authorized && preferences.enabled,
      mode: preferences.mode,
      ...(reenabled && { original: false }),
    });
  }

  function editable() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return document.designMode === 'on' || element?.isContentEditable
      || element?.closest('input, textarea, select, [role="textbox"]');
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const updated = {};
    for (const key of Object.keys(defaults)) {
      if (!changes[key]) continue;
      changedKeys.add(key);
      updated[key] = changes[key].newValue ?? defaults[key];
    }
    if (changes.githubSiteGranted) {
      authorizationRevision++;
      authorized = changes.githubSiteGranted.newValue === true;
    } else if (!Object.keys(updated).length) return;
    apply(updated);
  });

  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'page-state' || message.type === 'toggle-original') {
      const state = runtime.getState();
      if (message.type === 'toggle-original' && state.enabled && (!message.shortcut || !editable())) {
        runtime.configure({ original: !state.original });
      }
      respond({ original: runtime.getState().original });
    }
  });

  async function initialize() {
    const authorization = authorizationRevision;
    const [current, granted] = await Promise.all([
      api.storage.local.get(defaults),
      api.runtime.sendMessage({ type: 'authorization' }),
    ]);
    if (authorization === authorizationRevision) authorized = granted === true;
    for (const key of changedKeys) delete current[key];
    apply(current);
  }

  void initialize().catch(() => runtime.configure({ enabled: false }));
})();
