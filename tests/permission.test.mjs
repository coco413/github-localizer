import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';

function extensionEvent() {
  const callbacks = [];
  return {
    addListener(callback) {
      callbacks.push(callback);
    },
    async dispatch(...args) {
      await Promise.all(callbacks.map((callback) => callback(...args)));
    },
  };
}

test('approving the popup request enables translation on already open GitHub tabs', async () => {
  const [manifest, defaults, popupScript, backgroundScript] = await Promise.all(
    ['manifest.json', 'preferences.js', 'popup.js', 'background.js'].map(
      (name) => readFile(new URL(`../dist/chrome/${name}`, import.meta.url), 'utf8'),
    ),
  );
  const [site] = JSON.parse(manifest).optional_host_permissions;
  const onAdded = extensionEvent();
  const onClick = extensionEvent();
  const onMessage = extensionEvent();
  const control = { addEventListener() {} };
  const status = {};
  const button = { addEventListener: (_, callback) => onClick.addListener(callback) };
  const calls = [];
  let authorized = false;

  // The browser owns the native prompt. This boundary supplies the user's
  // approval and delivers the corresponding WebExtensions event.
  const chrome = {
    runtime: {
      onInstalled: extensionEvent(),
      onStartup: extensionEvent(),
      onMessage,
      sendMessage(message) {
        return new Promise((resolve) => void onMessage.dispatch(message, {}, resolve));
      },
    },
    commands: { onCommand: extensionEvent() },
    storage: { onChanged: extensionEvent(), local: { get: async (values) => values, set: async () => {} } },
    permissions: {
      async contains() {
        return authorized;
      },
      async request(permission) {
        assert.equal(JSON.stringify(permission), JSON.stringify({ origins: [site] }));
        authorized = true;
        await onAdded.dispatch(permission);
        return true;
      },
      onAdded,
      onRemoved: extensionEvent(),
    },
    scripting: {
      async getRegisteredContentScripts() {
        return [];
      },
      async registerContentScripts([registration]) {
        calls.push(['register', registration.matches[0], ...registration.js]);
      },
      async executeScript(script) {
        if (script.func) return [{ result: true }];
        calls.push(['execute', script.target.tabId, ...script.files]);
      },
    },
    tabs: {
      async sendMessage() {
        return { original: false };
      },
      async query({ url, active }) {
        assert.ok(active || url === site);
        return [{ id: 42, url: 'https://github.com/octocat/Hello-World' }];
      },
    },
  };

  runInNewContext(backgroundScript, { chrome });
  const popupContext = {
    URL,
    setTimeout,
    chrome,
    document: { querySelector: (selector) => ({ '#status': status, '#authorize': button })[selector] ?? control },
  };
  runInNewContext(defaults, popupContext);
  runInNewContext(popupScript, popupContext);
  await setImmediate();
  assert.equal(status.textContent, '未授权');
  assert.deepEqual(calls, []);

  await onClick.dispatch();
  await setImmediate();
  assert.equal(status.textContent, '已启用');
  assert.equal(calls.length, 2);
  const [[register, match, ...registeredFiles], [execute, tab, ...executedFiles]] = calls;
  assert.deepEqual([register, match, execute, tab], ['register', 'https://github.com/*', 'execute', 42]);
  assert.ok(registeredFiles.includes('content.js'));
  assert.deepEqual(executedFiles, registeredFiles);
});
