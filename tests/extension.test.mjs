import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const repository = 'https://github.com/octocat/Hello-World';
const repositoryFixture = await readFile(new URL('./fixtures/repository.html', import.meta.url), 'utf8');
const prFixture = await readFile(new URL('./fixtures/pr-list.html', import.meta.url), 'utf8');
const milestoneFixture = await readFile(new URL('./fixtures/milestones.html', import.meta.url), 'utf8');
const fixtures = new Map([
  [`${repository}/pulls`, prFixture],
  [`${repository}/milestones`, milestoneFixture],
]);
const candidate = resolve('dist', 'chrome');

async function launchProfile(directory) {
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  context.setDefaultTimeout(3_000);
  await context.route(/^https:\/\/(?:github\.com|example\.org)\//, (route) => (
    route.fulfill({ contentType: 'text/html',
      body: fixtures.get(route.request().url().split('?')[0]) ?? repositoryFixture })
  ));
  return context;
}

async function openBrowser(t) {
  const directory = await mkdtemp(join(tmpdir(), 'github-localizer-'));
  let context;
  t.after(async () => {
    await context?.close();
    await rm(directory, { recursive: true, force: true });
  });
  context = await launchProfile(directory);
  return {
    context,
    directory,
    async restart() {
      await context.close();
      context = await launchProfile(directory);
      return context;
    },
  };
}

async function loadCandidate(context, path) {
  const session = await context.browser().newBrowserCDPSession();
  try {
    const { id } = await session.send('Extensions.loadUnpacked', { path });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    return popup;
  } finally {
    await session.detach();
  }
}

async function createGrantedCandidate(directory, extraPermissions = []) {
  const extension = join(directory, 'extension');
  await cp(candidate, extension, { recursive: true });
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_host_permissions;
  manifest.permissions.push(...extraPermissions);
  await writeFile(manifestPath, JSON.stringify(manifest));
  return extension;
}

async function showPopupFor(popup, page) {
  await page.bringToFront();
  await popup.reload();
}

test('the installed Chrome candidate leaves an unauthorized GitHub page in English', { timeout: 10_000 }, async (t) => {
  const { context } = await openBrowser(t);
  const popup = await loadCandidate(context, candidate);
  const page = await context.newPage();
  await page.goto(repository);

  await popup.getByText('不支持', { exact: true }).waitFor();
  assert.equal(await page.locator('nav [data-content="Code"]').innerText(), 'Code');
});

test('an authorized candidate localizes an already loaded repository offline and preserves content and links', { timeout: 15_000 }, async (t) => {
  const { context, directory } = await openBrowser(t);
  const page = await context.newPage();
  await page.goto(repository);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  assert.equal(await page.locator('nav [data-content="Code"]').innerText(), 'Code');
  await context.setOffline(true);

  // Chromium controls the confirmation dialog outside the page. Load a fixture
  // copy with the equivalent browser-side host grant after disconnecting.
  const extension = await createGrantedCandidate(directory);
  const popup = await loadCandidate(context, extension);
  await showPopupFor(popup, page);
  await popup.getByText('已启用', { exact: true }).waitFor();

  assert.equal(await page.evaluate(() => navigator.onLine), false);
  await page.getByRole('link', { name: '代码' }).waitFor();
  await page.getByRole('link', { name: '拉取请求（PR）' }).waitFor();
  assert.equal(await page.locator('nav a[href$="/issues"] span').last().textContent(), '3');
  assert.equal(await page.locator('nav a[href$="/pulls"]').getAttribute('href'), '/octocat/Hello-World/pulls');
  assert.equal(await page.locator('#repository-container-header a').innerText(), 'Hello-World');
  assert.equal(await page.locator('article').innerText(), 'Code Pull requests');
  assert.deepEqual(requests, []);

  await page.goto(repository);
  await page.getByRole('link', { name: '代码' }).waitFor();
  await page.goto('https://example.org/octocat/Hello-World');
  assert.equal(await page.locator('nav [data-content="Code"]').innerText(), 'Code');
  await page.goto(`${repository}/issues`);
  assert.equal(await page.locator('nav [data-content="Code"]').innerText(), 'Code');
});

test('popup settings update two tabs and preserve the current page when viewing the source', { timeout: 15_000 }, async (t) => {
  const { context, directory } = await openBrowser(t);
  const popup = await loadCandidate(context, await createGrantedCandidate(directory));
  const page = await context.newPage();
  await page.goto(repository);
  await page.getByRole('link', { name: '拉取请求（PR）' }).waitFor();
  const second = await context.newPage();
  await second.goto(repository + '/pulls');
  const beginner = second.getByRole('heading', { name: '所有拉取请求（PR）' });
  const professional = second.getByRole('heading', { name: '所有 PR' });
  const english = second.getByRole('heading', { name: 'All pull requests' });
  await beginner.waitFor();
  await second.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend',
      '<details open><summary>Draft</summary><textarea></textarea></details><div style="height:2000px"></div>');
    document.querySelector('textarea').value = 'Unsent GitHub draft';
    window.scrollTo(0, 100);
  });

  await showPopupFor(popup, second);
  const mode = popup.getByRole('combobox', { name: '译法档位' });
  await mode.selectOption('professional');
  await page.getByRole('link', { name: 'PR', exact: true }).waitFor();
  await professional.waitFor();

  await popup.getByRole('button', { name: '查看原文' }).click();
  await english.waitFor();
  await page.getByRole('link', { name: 'PR', exact: true }).waitFor();
  await showPopupFor(popup, page);
  await mode.selectOption('beginner');
  await page.getByRole('link', { name: '拉取请求（PR）' }).waitFor();
  await english.waitFor();
  assert.deepEqual(await second.evaluate(() => ({
    draft: document.querySelector('textarea').value,
    open: document.querySelector('details').open,
    scroll: window.scrollY,
  })), { draft: 'Unsent GitHub draft', open: true, scroll: 100 });

  const toggle = popup.getByRole('checkbox', { name: '界面汉化' });
  await toggle.uncheck();
  await popup.getByText('暂停', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Pull requests' }).waitFor();
  await toggle.check();
  await beginner.waitFor();

  await showPopupFor(popup, second);
  await popup.getByRole('button', { name: '查看原文' }).click();
  await english.waitFor();
  await popup.getByRole('button', { name: '恢复译文' }).click();
  await beginner.waitFor();

  await popup.getByRole('button', { name: '查看原文' }).click();
  await english.waitFor();
  await second.evaluate(() => history.pushState({}, '', '?q=is%3Apr'));
  await beginner.waitFor();
  await popup.reload();
  await popup.getByRole('button', { name: '查看原文' }).click();
  await english.waitFor();
  await second.reload();
  await beginner.waitFor();
});

test('revocation restores the page immediately and renewed authorization applies saved settings', { timeout: 15_000 }, async (t) => {
  const { context, directory } = await openBrowser(t);
  // A popup opened as a tab cannot receive activeTab. Expose the active URL to
  // this fixture through tabs so it can report the state after revocation.
  const popup = await loadCandidate(context, await createGrantedCandidate(directory, ['tabs']));
  const page = await context.newPage();
  await page.goto(repository);
  await page.getByRole('link', { name: '拉取请求（PR）' }).waitFor();
  await showPopupFor(popup, page);
  await popup.getByRole('combobox', { name: '译法档位' }).selectOption('professional');
  await page.getByRole('link', { name: 'PR', exact: true }).waitFor();

  const id = new URL(popup.url()).hostname;
  const settings = await context.newPage();
  await settings.goto('chrome://extensions');
  const setSiteAccess = (hostAccess) => settings.evaluate(({ extensionId, hostAccess }) => (
    chrome.developerPrivate.updateExtensionConfiguration({ extensionId, hostAccess })
  ), { extensionId: id, hostAccess });
  await setSiteAccess('ON_CLICK');
  await popup.getByText('未授权', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Pull requests' }).waitFor();
  await page.evaluate(() => {
    const link = document.querySelector('nav a[href$="/pulls"]');
    link.replaceWith(link.cloneNode(true));
  });
  assert.equal(await page.locator('[data-content="Pull requests"]').innerText(), 'Pull requests');
  await setSiteAccess('ON_ALL_SITES');
  await popup.getByText('已启用', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'PR', exact: true }).waitFor();
});

test('a new browser session restores the saved mode and global switch and clears the page override', { timeout: 15_000 }, async (t) => {
  const profile = await openBrowser(t);
  const extension = await createGrantedCandidate(profile.directory);
  let popup = await loadCandidate(profile.context, extension);
  let page = await profile.context.newPage();
  await page.goto(repository);
  await page.getByRole('link', { name: '拉取请求（PR）', exact: true }).waitFor();
  await showPopupFor(popup, page);
  await popup.getByRole('combobox', { name: '译法档位' }).selectOption('professional');
  await page.getByRole('link', { name: 'PR', exact: true }).waitFor();
  await popup.getByRole('button', { name: '查看原文' }).click();
  await page.getByRole('link', { name: 'Pull requests', exact: true }).waitFor();

  let context = await profile.restart();
  popup = await loadCandidate(context, extension);
  page = await context.newPage();
  await page.goto(repository);
  await page.getByRole('link', { name: 'PR', exact: true }).waitFor();
  await showPopupFor(popup, page);
  await popup.getByRole('checkbox', { name: '界面汉化' }).uncheck();
  await popup.getByText('暂停', { exact: true }).waitFor();

  context = await profile.restart();
  popup = await loadCandidate(context, extension);
  page = await context.newPage();
  await page.goto(repository);
  await showPopupFor(popup, page);
  await popup.getByText('暂停', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Pull requests', exact: true }).waitFor();
  assert.equal(await popup.getByRole('combobox', { name: '译法档位' }).inputValue(), 'professional');
});

test('the shortcut respects focused editors and the popup works after the shortcut is unbound', { timeout: 15_000 }, async (t) => {
  const { context, directory } = await openBrowser(t);
  const popup = await loadCandidate(context, await createGrantedCandidate(directory));
  const page = await context.newPage();
  await page.goto(repository);
  const original = page.getByRole('link', { name: 'Pull requests', exact: true });
  const translated = page.getByRole('link', { name: '拉取请求（PR）', exact: true });
  await translated.waitFor();
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<textarea>Unsent draft</textarea>');
  });
  const worker = context.serviceWorkers()[0];
  const toggle = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://github.com/octocat/Hello-World' });
    // Deliver the browser shortcut to the page boundary. Headless Chromium
    // keeps browser-level shortcuts outside Playwright's keyboard events.
    return chrome.tabs.sendMessage(tab.id, { type: 'toggle-original', shortcut: true });
  });
  const shortcut = () => worker.evaluate(async () => (
    (await chrome.commands.getAll()).find(({ name }) => name === 'toggle-original')?.shortcut
  ));
  assert.ok(await shortcut());
  await toggle();
  await original.waitFor();
  await toggle();
  await translated.waitFor();
  await page.locator('textarea').focus();
  await toggle();
  await translated.waitFor();
  assert.equal(await page.locator('textarea').inputValue(), 'Unsent draft');

  const settings = await context.newPage();
  await settings.goto('chrome://extensions/shortcuts');
  await settings.evaluate((extensionId) => chrome.developerPrivate.updateExtensionCommand({
    extensionId, commandName: 'toggle-original', keybinding: '',
  }), new URL(popup.url()).hostname);
  assert.equal(await shortcut(), '');
  await showPopupFor(popup, page);
  await popup.getByRole('button', { name: '查看原文' }).click();
  await original.waitFor();
});

test('the global switch keeps the latest clickable English count before and after a dynamic update', { timeout: 15_000 }, async (t) => {
  const { context, directory } = await openBrowser(t);
  const popup = await loadCandidate(context, await createGrantedCandidate(directory));
  const page = await context.newPage();
  const milestones = repository + '/milestones';
  await page.goto(milestones);
  await page.getByRole('link', { name: '进行中 2', exact: true }).waitFor();
  await showPopupFor(popup, page);

  const count = page.getByTestId('open-milestone-tab').locator('span');
  const updateCount = (value) => count.evaluate((target, value) => { target.textContent = value; }, value);
  await updateCount('1');
  await page.getByRole('link', { name: '进行中 1', exact: true }).waitFor();

  const toggle = popup.getByRole('checkbox', { name: '界面汉化' });
  const latest = page.getByRole('link', { name: 'Open 3', exact: true });
  await toggle.uncheck();
  await page.getByRole('link', { name: 'Open 1', exact: true }).waitFor();
  await updateCount('3');
  await latest.waitFor();
  await latest.click({ trial: true });
  assert.equal(await latest.getAttribute('href'), '/octocat/Hello-World/milestones');

  await updateCount('1');
  await toggle.check();
  await page.getByRole('link', { name: '进行中 1', exact: true }).waitFor();
  await updateCount('3');
  await page.getByRole('link', { name: '进行中 3', exact: true }).waitFor();
  await toggle.uncheck();
  await latest.waitFor();
  await latest.click({ trial: true });
  assert.equal(await latest.getAttribute('href'), '/octocat/Hello-World/milestones');
});

test('a shortcut conflict leaves the popup source controls available', { timeout: 15_000 }, async (t) => {
  const { context, directory } = await openBrowser(t);
  // Chromium assigns the default binding to the first extension requesting it.
  await loadCandidate(context, candidate);
  const popup = await loadCandidate(context, await createGrantedCandidate(directory));
  const page = await context.newPage();
  await page.goto(repository);
  await page.getByRole('link', { name: '拉取请求（PR）', exact: true }).waitFor();
  assert.equal(await popup.evaluate(async () => (
    (await chrome.commands.getAll()).find(({ name }) => name === 'toggle-original')?.shortcut
  )), '');

  await showPopupFor(popup, page);
  await popup.getByRole('button', { name: '查看原文' }).click();
  await page.getByRole('link', { name: 'Pull requests', exact: true }).waitFor();
  await popup.getByRole('button', { name: '恢复译文' }).click();
  await page.getByRole('link', { name: '拉取请求（PR）', exact: true }).waitFor();
});
