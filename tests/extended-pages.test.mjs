import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
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
  await page.getByRole('button', { name: '状态', exact: true }).click();
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
  await page.getByRole('button', { name: '关注', exact: true }).click({ timeout: 3_000 });
  await page.getByRole('menuitem', { name: '参与和提及', exact: true }).waitFor({ timeout: 1_000 });
  const star = page.getByRole('button', { name: '移除此仓库的星标', exact: true });
  await star.waitFor({ timeout: 1_000 });
  assert.equal(await star.locator('strong').innerText(), '9');
});

test('a workflow run translates result and sign-in controls while retaining raw logs', { timeout: 12_000 }, async (t) => {
  const page = await openFixture(t, '/actions/runs/42', 'action-run');
  await page.getByRole('link', { name: '登录后查看日志' }).waitFor({ timeout: 3_000 });
  assert.equal(await page.locator('[aria-label="Workflow run summary"] .h4').innerText(), '失败');
  assert.equal(await page.locator('pre').innerText(), 'Failure');
});
