import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const repository = 'https://github.com/octocat/Hello-World';
const fixture = await readFile(new URL('./fixtures/repository.html', import.meta.url), 'utf8');
const candidate = resolve('dist', 'chrome');

async function openBrowser(t) {
  const directory = await mkdtemp(join(tmpdir(), 'github-localizer-'));
  let context;
  t.after(async () => {
    await context?.close();
    await rm(directory, { recursive: true, force: true });
  });
  context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  await context.route(/^https:\/\/(?:github\.com|example\.org)\//, (route) => (
    route.fulfill({ contentType: 'text/html', body: fixture })
  ));
  return { context, directory };
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

test('the installed Chrome candidate reports GitHub as unauthorized and leaves the fixture in English', { timeout: 10_000 }, async (t) => {
  const { context } = await openBrowser(t);
  const popup = await loadCandidate(context, candidate);
  const page = await context.newPage();
  await page.goto(repository);

  await popup.getByText('未授权', { exact: true }).waitFor();
  await popup.getByRole('button', { name: '授权 GitHub' }).waitFor();
  assert.equal(await page.locator('nav [data-content="Code"]').innerText(), 'Code');
});

test('an authorized candidate localizes an already loaded repository offline and preserves content and links', { timeout: 7_000 }, async (t) => {
  const { context, directory } = await openBrowser(t);
  const page = await context.newPage();
  await page.goto(repository);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  assert.equal(await page.locator('nav [data-content="Code"]').innerText(), 'Code');
  await context.setOffline(true);

  // Chromium controls the confirmation dialog outside the page. Load a fixture
  // copy with the equivalent browser-side host grant after disconnecting.
  const extension = join(directory, 'extension');
  await cp(candidate, extension, { recursive: true });
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_host_permissions;
  await writeFile(manifestPath, JSON.stringify(manifest));
  const popup = await loadCandidate(context, extension);
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
