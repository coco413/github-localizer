import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repository = 'https://github.com/octocat/Hello-World';

async function openFixture(t, path, fixture, viewport = { width: 1280, height: 800 }) {
  const directory = await mkdtemp(join(tmpdir(), 'github-localizer-pages-'));
  let context;
  t.after(async () => {
    await context?.close();
    await rm(directory, { recursive: true, force: true });
  });
  const extension = join(directory, 'extension');
  await cp(resolve('dist', 'chrome'), extension, { recursive: true });
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_host_permissions;
  await writeFile(manifestPath, JSON.stringify(manifest));

  context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    viewport,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const session = await context.browser().newBrowserCDPSession();
  try {
    await session.send('Extensions.loadUnpacked', { path: extension });
  } finally {
    await session.detach();
  }
  const body = await readFile(new URL(`./fixtures/${fixture}.html`, import.meta.url), 'utf8');
  await context.route(`${repository}**`, (route) => route.fulfill({ contentType: 'text/html', body }));
  const page = await context.newPage();
  await page.goto(repository + path);
  return page;
}

test('milestone tabs localize the state without changing the count, link, or matching milestone title', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/milestones', 'milestones');
  const open = page.getByRole('link', { name: '进行中 2', exact: true });
  await open.waitFor({ timeout: 3_000 });
  await page.getByRole('heading', { name: '里程碑', level: 1 }).waitFor({ timeout: 1_000 });
  await page.getByRole('button', { name: '排序', exact: true }).waitFor({ timeout: 1_000 });
  assert.equal(await open.getAttribute('href'), '/octocat/Hello-World/milestones');
  assert.equal(await page.getByRole('heading', { name: 'Open', exact: true }).count(), 1);
  await page.getByRole('heading', { name: '你还没有创建任何里程碑。' }).waitFor({ timeout: 3_000 });
});

test('workflow filters and an empty result localize at narrow width while run names and logs stay intact', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions', 'actions', { width: 390, height: 800 });
  await page.getByRole('link', { name: '所有工作流', exact: true }).waitFor({ timeout: 3_000 });
  await page.getByRole('button', { name: '工作流', exact: true }).waitFor({ timeout: 3_000 });
  await page.locator('[role="menu"]').evaluate((menu) => menu.replaceChildren());
  await page.getByRole('button', { name: '状态', exact: true }).click();
  await page.locator('[role="menu"]').evaluate((menu) => {
    menu.insertAdjacentHTML('beforeend', '<button role="menuitem">Failure</button>');
  });
  await page.getByRole('menuitem', { name: '失败', exact: true }).waitFor({ timeout: 3_000 });
  await page.getByRole('link', { name: 'All workflows', exact: true }).waitFor();
  assert.equal(await page.locator('pre').textContent(), 'Failure');
  await page.getByRole('heading', { name: '没有工作流运行记录' }).waitFor();
});

test('release controls localize while notes, tag names, and download destinations stay intact', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/releases', 'releases');
  await page.getByRole('link', { name: '发布版本', exact: true }).waitFor({ timeout: 3_000 });
  await page.getByRole('button', { name: '比较', exact: true }).click();
  await page.getByRole('heading', { name: '没有找到结果' }).waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: '发布附件 2' }).click();
  assert.equal(await page.getByRole('link', { name: 'Assets' }).getAttribute('href'),
    '/octocat/Hello-World/releases/download/v1/Assets');
  assert.equal(await page.locator('.markdown-body').innerText(), 'Compare Assets Latest');
});

for (const width of [390, 1280]) {
  test(`signed-out repository controls work at ${width}px`, { timeout: 12_000 }, async (t) => {
    const page = await openFixture(t, '', 'repository-controls', { width, height: 800 });
    const fork = page.getByRole('link', { name: '登录后才能复刻仓库' });
    await fork.waitFor({ timeout: 3_000 });
    assert.equal(await fork.getAttribute('href'), '/login?return_to=%2Foctocat%2FHello-World');
    assert.equal(await fork.locator('strong').innerText(), '7');
    await page.getByRole('link', { name: '登录后才能更改通知设置' }).waitFor({ timeout: 1_000 });
    const layout = width < 768 ? 'SplitPageLayout.Header' : 'SplitPageLayout.Pane';
    const about = page.locator(`[data-component="${layout}"]`).getByRole('heading', { name: '关于', exact: true });
    await about.waitFor({ timeout: 1_000 });
    assert.equal(await page.getByRole('heading', { name: '关于', exact: true }).count(), 1);
    assert.equal(await page.locator('article').innerText(), 'About');
  });
}

test('signed-in repository preserves notification-menu and star controls', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '', 'repository-signed-in', { width: 390, height: 800 });
  const menu = page.locator('[role="menu"]');
  await menu.evaluate((element) => element.replaceChildren());
  await page.getByRole('button', { name: '关注', exact: true }).click({ timeout: 3_000 });
  await menu.evaluate((element) => {
    element.insertAdjacentHTML('beforeend',
      '<button role="menuitem"><span data-component="text">Participating and @mentions</span></button>');
  });
  await page.getByRole('menuitem', { name: '参与和提及', exact: true }).waitFor({ timeout: 1_000 });
  const star = page.getByRole('button', { name: '移除此仓库的星标', exact: true });
  await star.waitFor({ timeout: 1_000 });
  assert.equal(await star.locator('strong').innerText(), '9');
});

test('a workflow run translates result and sign-in controls while retaining raw logs', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions/runs/42', 'action-run');
  await page.getByRole('link', { name: '登录后查看日志' }).waitFor({ timeout: 3_000 });
  const summary = page.getByRole('link', { name: '摘要', exact: true });
  await summary.waitFor({ timeout: 3_000 });
  assert.equal(await summary.getAttribute('href'), '/octocat/Hello-World/actions/runs/42');
  assert.equal(await page.getByRole('link', { name: 'Summary', exact: true }).getAttribute('href'),
    '/octocat/Hello-World/actions/runs/42/job/1');
  assert.equal(await page.locator('[aria-label="Workflow run summary"] .h4').innerText(), '失败');
  assert.equal(await page.locator('pre').innerText(), 'Failure');
});

test('site navigation restores old controls, then translates newly mounted controls on return', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/milestones', 'milestones');
  const open = page.locator('a[data-testid$="-milestone-tab"]').first();
  await page.getByRole('link', { name: '进行中 2', exact: true }).waitFor({ timeout: 3_000 });
  await page.evaluate(() => history.pushState({}, '', '/octocat/Hello-World/tree/main'));
  await page.getByRole('link', { name: 'Open 2', exact: true }).waitFor({ timeout: 3_000 });
  await page.evaluate(() => {
    const count = document.querySelector('a[data-testid$="-milestone-tab"] span:last-child');
    count.textContent = '3';
    history.back();
  });
  await page.getByRole('link', { name: '进行中 3', exact: true }).waitFor({ timeout: 3_000 });
  assert.equal(await open.getAttribute('href'), '/octocat/Hello-World/milestones');
});

test('GitHub timestamps refresh in Chinese and restore the inherited locale on navigation', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions', 'actions');
  await page.clock.install({ time: new Date('2025-01-01T00:01:00Z') });
  const bundle = new URL('bundle.js', import.meta.resolve('@github/relative-time-element'));
  await page.addScriptTag({ path: fileURLToPath(bundle), type: 'module' });
  await page.evaluate(() => {
    const markup = '<relative-time datetime="2025-01-01T00:00:00Z" format="relative" format-style="long" no-title></relative-time>';
    document.querySelector('main').insertAdjacentHTML('beforeend', markup);
    document.querySelector('pre').insertAdjacentHTML('beforeend', markup);
  });
  await page.locator('main > relative-time').getByText('1分钟前', { exact: true }).waitFor({ timeout: 3_000 });
  await page.clock.runFor(120_000);
  const time = page.locator('main > relative-time');
  await time.getByText('3分钟前', { exact: true }).waitFor({ timeout: 3_000 });
  assert.equal(await time.getAttribute('datetime'), '2025-01-01T00:00:00Z');
  await page.locator('pre relative-time').getByText('3 minutes ago', { exact: true }).waitFor({ timeout: 3_000 });
  await page.evaluate(() => history.pushState({}, '', '/octocat/Hello-World/tree/main'));
  await time.getByText('3 minutes ago', { exact: true }).waitFor({ timeout: 3_000 });
  assert.equal(await time.getAttribute('lang'), null);
});

test('pausing before and after a count update preserves the latest source and clickable link', { timeout: 15_000 }, async (t) => {
  const page = await openFixture(t, '/milestones', 'milestones');
  const translated = page.getByRole('link', { name: '进行中 2', exact: true });
  await translated.waitFor({ timeout: 3_000 });
  await translated.evaluate((link) => { link.querySelector('span').firstChild.data = '1'; });
  await page.getByRole('link', { name: '进行中 1', exact: true }).waitFor({ timeout: 3_000 });
  const worker = page.context().serviceWorkers()[0];
  async function configure(enabled, count = null) {
    const configured = await worker.evaluate(async ({ enabled, count }) => {
      const [tab] = await chrome.tabs.query({ url: 'https://github.com/octocat/Hello-World/milestones' });
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [enabled, count],
        func: (enabled, count) => {
          if (count) {
            const open = document.querySelector('[data-testid="open-milestone-tab"]');
            open.querySelector('div').firstChild.data = 'Open';
            open.querySelector('span').firstChild.data = count;
          }
          globalThis.githubLocalizerRuntime.configure({ enabled });
          return true;
        },
      });
      return injection.result;
    }, { enabled, count });
    assert.equal(configured, true);
  }

  await configure(false, '3');
  const restored = page.getByRole('link', { name: 'Open 3', exact: true });
  await restored.waitFor({ timeout: 3_000 });
  await restored.evaluate((link) => { link.querySelector('span').firstChild.data = '1'; });
  await configure(true);
  const updated = page.getByRole('link', { name: '进行中 1', exact: true });
  await updated.waitFor({ timeout: 3_000 });
  await updated.evaluate((link) => {
    link.querySelector('div').firstChild.data = 'Open';
    link.querySelector('span').firstChild.data = '3';
  });
  await page.getByRole('link', { name: '进行中 3', exact: true }).waitFor({ timeout: 3_000 });
  await configure(false);
  const restoredLatest = page.getByRole('link', { name: 'Open 3', exact: true });
  await restoredLatest.waitFor({ timeout: 3_000 });
  assert.equal(await restoredLatest.getAttribute('href'), '/octocat/Hello-World/milestones');
  assert.equal(await page.getByRole('heading', { name: 'Open', exact: true }).count(), 1);
  await restoredLatest.click({ trial: true });
});

test('unrecognized label updates stay in English and an idle page gets no extra writes', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions', 'actions');
  const label = page.getByRole('button', { name: '工作流', exact: true });
  await label.waitFor({ timeout: 3_000 });
  const writes = await label.evaluate(async (control) => {
    control.querySelector('[data-component="text"]').firstChild.data = 'Workflow filter';
    let count = 0;
    const observer = new MutationObserver((records) => { count += records.length; });
    observer.observe(document.querySelector('main'), { subtree: true, childList: true, characterData: true, attributes: true });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    observer.disconnect();
    return count;
  });
  await page.getByRole('button', { name: 'Workflow filter', exact: true }).waitFor({ timeout: 3_000 });
  assert.equal(writes, 0);
});

test('changing a translated workflow navigation link to a custom workflow restores its name', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions', 'actions');
  const builtIn = page.getByRole('link', { name: '所有工作流', exact: true });
  await builtIn.waitFor({ timeout: 3_000 });
  await builtIn.evaluate((link) => { link.href = '/octocat/Hello-World/actions/workflows/custom.yml'; });
  const custom = page.locator('a[href$="/custom.yml"]');
  await custom.getByText('All workflows', { exact: true }).waitFor({ timeout: 3_000 });
});

test('moving a translated control into workflow logs restores the protected text', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions', 'actions');
  const filter = page.getByRole('button', { name: '工作流', exact: true });
  await filter.waitFor({ timeout: 3_000 });
  await filter.evaluate((button) => document.querySelector('pre').append(button));
  await page.locator('pre').getByRole('button', { name: 'Workflow', exact: true }).waitFor({ timeout: 3_000 });
});

test('repository navigation is restored when its Code tab no longer identifies the repository', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '', 'repository');
  const code = page.getByRole('link', { name: '代码', exact: true });
  await code.waitFor({ timeout: 3_000 });
  const issues = page.locator('nav a[href$="/issues"]');
  await issues.getByText('议题', { exact: true }).waitFor({ timeout: 3_000 });
  await code.evaluate((link) => { link.href = '/octocat/Hello-World/tree/main'; });
  await issues.getByText('Issues', { exact: true }).waitFor({ timeout: 3_000 });
});

test('a protection class added to an existing container restores its controls', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions', 'actions');
  const toolbar = page.getByRole('toolbar', { name: 'Workflow run filters' });
  const translated = toolbar.getByRole('button', { name: '工作流', exact: true });
  await translated.waitFor({ timeout: 3_000 });
  await toolbar.evaluate((element) => element.classList.add('js-job-log'));
  await toolbar.getByRole('button', { name: 'Workflow', exact: true }).waitFor({ timeout: 3_000 });
  await toolbar.evaluate((element) => element.classList.remove('js-job-log'));
  await translated.waitFor({ timeout: 3_000 });
});

test('portaled Actions status options localize without translating labels in other pickers', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions', 'actions');
  await page.getByRole('heading', { name: '所有工作流' }).waitFor({ timeout: 3_000 });
  await page.evaluate(() => {
    const picker = (label, options) => `<div role="dialog" data-component="AnchoredOverlay">
      <input role="combobox" aria-label="${label}" placeholder="Filter items" data-component="input">
      <ul role="listbox">${options.map(([id, text]) => `<li role="option" data-id="${id}" data-component="ActionList.Item">
        <span data-component="ActionList.Item.Label">${text}</span></li>`).join('')}</ul></div>`;
    document.body.insertAdjacentHTML('beforeend', '<div id="__primerPortalRoot__">' +
      picker('Filter workflow options', [['workflow', 'Failure']]) +
      picker('Filter status options', [['failure', 'Failure'], ['action_required', 'Action required']]) + '</div>');
  });
  await page.getByRole('option', { name: '失败', exact: true }).waitFor({ timeout: 3_000 });
  await page.getByRole('option', { name: '需要操作', exact: true }).waitFor({ timeout: 3_000 });
  await page.getByRole('option', { name: 'Failure', exact: true }).waitFor({ timeout: 3_000 });
  const combobox = page.getByRole('combobox', { name: '筛选状态选项', exact: true });
  await combobox.waitFor({ timeout: 3_000 });
  await combobox.fill('failure');
  await combobox.evaluate((input) => input.setAttribute('aria-label', 'Filter event options'));
  assert.equal(await page.getByRole('combobox', { name: 'Filter event options' }).inputValue(), 'failure');
  await page.getByRole('option', { name: 'Action required', exact: true }).waitFor({ timeout: 3_000 });
});

test('workflow summary follows a same-node aria-current update', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions/runs/42', 'action-run');
  const summary = page.locator('a[href$="/runs/42"]').filter({ has: page.locator('[data-component="ActionList.Item.Label"]') });
  await summary.getByText('摘要', { exact: true }).waitFor({ timeout: 3_000 });
  await summary.evaluate((link) => link.removeAttribute('aria-current'));
  await summary.getByText('Summary', { exact: true }).waitFor({ timeout: 3_000 });
  await summary.evaluate((link) => link.setAttribute('aria-current', 'page'));
  await summary.getByText('摘要', { exact: true }).waitFor({ timeout: 3_000 });
});


test('failed job localizes fixed status and step controls while preserving names and log contents', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions/runs/42/job/88', 'action-job');
  await page.getByRole('heading', { name: '注解', exact: true }).waitFor({ timeout: 3_000 });
  await page.getByRole('button', { name: '展开', exact: true }).waitFor({ timeout: 3_000 });
  assert.match(await page.locator('.CheckRun-log-title > .js-updatable-content').textContent(), /失败\s+Nov 20, 2026 in 38m 37s/);
  assert.equal(await page.locator('check-step button svg').getAttribute('title'), '此步骤失败');
  assert.equal(await page.getByRole('button', { name: 'This step failed', exact: true }).count(), 1);
  assert.equal(await page.getByRole('link', { name: 'failed', exact: true }).getAttribute('href'), '#logs');
  assert.equal(await page.locator('pre').innerText(), 'failed\nShow more\nThis step failed');
  assert.equal(await page.locator('[data-target="annotation-message.annotationContainer"]').innerText(), 'This step failed');
});
