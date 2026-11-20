import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const repository = 'https://github.com/octocat/Hello-World';

async function openFixture(t, path, fixture) {
  const directory = await mkdtemp(join(tmpdir(), 'github-localizer-'));
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
  await context.route(`${repository}/**`, (route) => route.fulfill({ contentType: 'text/html', body }));
  const page = await context.newPage();
  await page.goto(repository + path);
  page.setDefaultTimeout(2_000);
  return page;
}

test('Issues list localizes the issue filter and preserves its query', async (t) => {
  const page = await openFixture(t, '/issues', 'issues-list');
  const issue = page.getByRole('link', { name: '新建议题', exact: true });
  assert.equal(await issue.getAttribute('href'), '/login?return_to=https://github.com/octocat/Hello-World/issues');
  await page.getByRole('link', { name: 'New issue', exact: true }).waitFor();
  const search = page.getByRole('searchbox', { name: '搜索议题', exact: true });
  await search.waitFor();
  assert.equal(await search.inputValue(), 'is:issue state:open');
});

test('the Issues filter opens by keyboard and localizes its menu while preserving other content', async (t) => {
  const page = await openFixture(t, '/issues', 'issues-list');
  const filters = page.getByRole('button', { name: '筛选', exact: true });
  await filters.press('Enter');
  const dialog = page.getByRole('dialog', { name: '筛选议题', exact: true });
  const open = dialog.getByRole('button', { name: '未关闭', exact: true });
  await open.waitFor();
  assert.equal(await open.evaluate((element) => element === document.activeElement), true);
  await open.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await filters.evaluate((element) => element === document.activeElement), true);
  await page.getByRole('link', { name: '未关闭 3', exact: true }).waitFor();
  await page.getByRole('heading', { name: '没有符合搜索条件的结果', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Open', exact: true }).waitFor();
  await page.getByRole('button', { name: 'OPEN', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open 3', exact: true }).waitFor();
});

test('Issue detail localizes state and deletion controls while preserving user content', async (t) => {
  const page = await openFixture(t, '/issues/10', 'issue-detail');
  const state = page.getByTestId('header-state');
  await page.getByText('未关闭', { exact: true }).waitFor();
  assert.equal(await state.locator('svg circle').getAttribute('r'), '5');
  assert.equal(await state.locator('svg').getAttribute('aria-label'), 'Issue');
  const dialog = page.getByRole('dialog', { name: '删除议题', exact: true });
  await dialog.getByText('删除此议题后将无法恢复。', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '删除此议题', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭议题', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Open', exact: true }).waitFor();
  assert.equal(await page.locator('.markdown-body p').textContent(), 'Open');
  assert.equal(await page.locator('.markdown-body button').textContent(), 'Close issue');
  assert.equal(await page.locator('.comment-body').textContent(), 'Delete issue');
  assert.equal(await page.locator('textarea').inputValue(), 'Close issue');
});

test('PR list localizes only the compare link and preserves a PR title with identical text', async (t) => {
  const page = await openFixture(t, '/pulls', 'pr-list');
  const compare = page.getByRole('link', { name: '新建拉取请求（PR）', exact: true });
  await compare.waitFor();
  assert.equal(await compare.getAttribute('href'), '/octocat/Hello-World/compare');
  await page.getByRole('link', { name: 'New pull request', exact: true }).waitFor();
  await page.getByRole('heading', { name: '所有拉取请求（PR）', exact: true }).waitFor();
  await page.getByRole('heading', { name: '没有结果', exact: true }).waitFor();
  const search = page.getByRole('combobox', { name: '搜索拉取请求（PR）', exact: true });
  assert.equal(await search.inputValue(), 'is:pr state:open');
  assert.equal(await search.getAttribute('placeholder'), '搜索拉取请求（PR）');
  await page.getByRole('button', { name: '清除筛选条件', exact: true }).waitFor();
  await page.getByRole('button', { name: '按作者筛选', exact: true }).waitFor();
  await page.getByRole('link', { name: /未关闭/ }).waitFor();
  assert.equal(await page.locator('[data-component="CounterLabel"]').textContent(), '3');
});

test('PR detail localizes review and merge controls while preserving the title, draft and Diff', async (t) => {
  const page = await openFixture(t, '/pull/10', 'pr-detail');
  const state = page.getByText('已合并', { exact: true });
  await state.waitFor();
  assert.equal(await state.locator('svg path').getAttribute('d'), 'M1 1h4');
  assert.equal(await state.locator('svg').getAttribute('aria-label'), 'Pull request');
  const tabs = page.getByRole('navigation', { name: '拉取请求（PR）标签页', exact: true });
  await tabs.getByRole('link', { name: '变更文件', exact: true }).waitFor();
  const review = page.getByRole('dialog', { name: '审核更改', exact: true });
  await review.getByRole('button', { name: '要求修改', exact: true }).waitFor();
  await review.getByRole('button', { name: '提交审核', exact: true }).waitFor();
  await page.getByRole('button', { name: '合并拉取请求（PR）', exact: true }).waitFor();
  await page.getByRole('button', { name: '确认合并', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Merge pull request', exact: true }).waitFor();
  assert.equal(await page.locator('.markdown-body').textContent(), 'Merge pull request');
  assert.equal(await page.locator('textarea').inputValue(), 'Merge pull request');
  assert.equal(await page.locator('.diff-view button').textContent(), 'Review changes');
  assert.equal(await page.locator('.diff-view pre').textContent(), 'Confirm merge');
});

test('a lazily opened review dialog localizes controls added after its accessible name changes', async (t) => {
  const page = await openFixture(t, '/pull/10', 'pr-review-lazy');
  const trigger = page.getByRole('button', { name: '审核更改', exact: true });
  await trigger.press('Enter');
  const review = page.getByRole('dialog', { name: '审核更改', exact: true });
  await review.waitFor();
  await review.getByRole('button', { name: '添加审核选项', exact: true }).press('Enter');
  const submit = review.getByRole('button', { name: '提交审核', exact: true });
  await submit.waitFor();
  await submit.press('Escape');
  await review.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
});

test('the portaled Issues author filter localizes its placeholder and accessible name', async (t) => {
  const page = await openFixture(t, '/issues', 'issues-list');
  await page.getByRole('searchbox', { name: '搜索议题' }).waitFor();
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', `
    <div id="__primerPortalRoot__"><div role="dialog" data-component="AnchoredOverlay">
      <input type="text" role="combobox" aria-label="Filter authors" placeholder="Filter authors" data-component="input" value="author:">
      <ul role="listbox"><li role="option">Filter authors</li></ul>
    </div></div><input role="combobox" aria-label="Filter authors" placeholder="Filter authors" data-component="input">`));
  const picker = page.getByRole('dialog').getByRole('combobox', { name: '筛选作者' });
  await picker.waitFor();
  assert.equal(await picker.getAttribute('placeholder'), '筛选作者');
  assert.equal(await picker.inputValue(), 'author:');
  await page.getByRole('option', { name: 'Filter authors', exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Filter authors', exact: true }).waitFor();
});
