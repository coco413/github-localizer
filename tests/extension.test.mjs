import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const repository = 'https://github.com/octocat/Hello-World';
const fixture = await readFile(new URL('./fixtures/repository.html', import.meta.url), 'utf8');

async function openCandidate(t, candidate, hostAlreadyGranted = false) {
  const directory = await mkdtemp(join(tmpdir(), 'github-localizer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let extension = resolve('dist', candidate);
  if (hostAlreadyGranted) {
    // Chromium controls the native optional-permission prompt outside the page.
    // Install a fixture copy with the same host grant to exercise real injection.
    extension = join(directory, 'extension');
    await cp(resolve('dist', candidate), extension, { recursive: true });
    const path = join(extension, 'manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.host_permissions = manifest.optional_host_permissions;
    delete manifest.optional_host_permissions;
    await writeFile(path, JSON.stringify(manifest));
  }

  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  t.after(() => context.close());
  await context.route(/^https:\/\/(?:github\.com|example\.org)\//, (route) => route.fulfill({ contentType: 'text/html', body: fixture }));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  return { context, origin: worker.url().replace(/\/[^/]+$/, '') };
}

test('the installed Chrome candidate reports GitHub as unauthorized and leaves the fixture in English', async (t) => {
  const { context, origin } = await openCandidate(t, 'chrome');
  const page = await context.newPage();
  await page.goto(repository);
  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  await popup.getByText('未授权', { exact: true }).waitFor();
  await popup.getByRole('button', { name: '授权 GitHub' }).waitFor();
  assert.equal(await page.locator('#code-tab').innerText(), 'Code');
});

test('an authorized candidate localizes the repository fixture while offline and preserves content and links', { timeout: 10_000 }, async (t) => {
  const { context, origin } = await openCandidate(t, 'chrome', true);
  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  await popup.getByText('已启用', { exact: true }).waitFor();

  const page = await context.newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await context.setOffline(true);
  await page.goto(repository);
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  await page.getByRole('link', { name: '代码' }).waitFor({ timeout: 3_000 });
  await page.getByRole('link', { name: '拉取请求（PR）' }).waitFor();
  assert.equal(await page.locator('#issues-tab span').last().textContent(), '3');
  assert.equal(await page.locator('#pull-requests-tab').getAttribute('href'), '/octocat/Hello-World/pulls');
  assert.equal(await page.locator('#repository-container-header a').innerText(), 'Hello-World');
  assert.equal(await page.locator('article').innerText(), 'Code Pull requests');
  assert.deepEqual(requests, [repository]);

  await page.goto('https://example.org/octocat/Hello-World');
  assert.equal(await page.locator('#code-tab').innerText(), 'Code');
  await page.goto(`${repository}/issues`);
  assert.equal(await page.locator('#code-tab').innerText(), 'Code');
});
