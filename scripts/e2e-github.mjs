import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const repository = 'https://github.com/microsoft/playwright';
const query = 'repo:microsoft/playwright is:issue';
const timeout = 15_000;
const target = process.argv[2] ?? 'chromium';
assert.ok(['chromium', 'chrome', 'edge'].includes(target), 'Use chromium, chrome or edge');
const workspace = await mkdtemp(join(tmpdir(), 'github-localizer-e2e-'));
const extension = join(workspace, 'extension');

function launch(args = []) {
  return chromium.launchPersistentContext(join(workspace, 'profile'), {
    ...(process.env.E2E_BROWSER_EXECUTABLE
      ? { executablePath: process.env.E2E_BROWSER_EXECUTABLE }
      : { channel: target === 'edge' ? 'msedge' : target }),
    ignoreDefaultArgs: ['--disable-extensions'],
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
    headless: process.env.E2E_HEADED !== '1',
    args,
  });
}

async function scenario(name, action) {
  try {
    await action();
    console.log(`PASS ${name}`);
  } catch (error) {
    process.exitCode = 1;
    console.error(`FAIL ${name}\n${error.message}`);
  }
}

try {
  await cp(resolve('dist', target === 'edge' ? 'edge' : 'chrome'), extension, { recursive: true });
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  // Browser automation cannot approve the native permissions prompt.
  // Preauthorize GitHub in this disposable copy and keep the packaged scripts intact.
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_host_permissions;
  await writeFile(manifestPath, JSON.stringify(manifest));
  const flags = ['--enable-unsafe-extension-debugging'];

  async function install(browser) {
    const session = await browser.browser().newBrowserCDPSession();
    try {
      const { product } = await session.send('Browser.getVersion');
      if (target !== 'chromium') assert.match(product, target === 'edge' ? /^Edg\// : /^Chrome\//);
      assert.ok((await session.send('Extensions.loadUnpacked', { path: extension })).id);
      return product;
    } finally {
      await session.detach();
    }
  }

  const setup = await launch(flags);
  try {
    const product = await install(setup);
    const worker = setup.serviceWorkers()[0] ?? await setup.waitForEvent('serviceworker', { timeout });
    assert.equal(await worker.evaluate(() => chrome.permissions.contains({ origins: ['https://github.com/*'] })), true);
    console.log(`${product}, extension ${manifest.version} (preauthorized development build)`);
  } finally {
    await setup.close();
  }

  const browser = await launch(flags);
  try {
    await install(browser);
    const page = browser.pages()[0];
    page.setDefaultTimeout(timeout);
    const openRepository = async () => {
      const response = await page.goto(repository);
      assert.equal(response?.status(), 200);
      await page.getByRole('link', { name: /^代码$/ }).waitFor();
    };

    await scenario('cold search opens, accepts keyboard input and submits', async () => {
      await openRepository();
      const trigger = page.locator('header button[aria-haspopup="dialog"]').filter({ visible: true })
        .and(page.getByRole('button', { name: /Search|搜索/i }));
      await trigger.first().click();
      const input = page.getByRole('dialog').locator('input:visible').first();
      await input.waitFor();
      await input.fill('');
      await input.pressSequentially(query);
      assert.equal(await input.inputValue(), query);
      await Promise.all([
        page.waitForURL(url => url.origin === 'https://github.com' &&
          url.pathname === '/search' && url.searchParams.get('q') === query),
        input.press('Enter'),
      ]);
    });

    await scenario('repository navigation and Issue author filter respond to keyboard', async () => {
      await openRepository();
      const nav = page.locator('nav[aria-label^="Repository"]');
      await Promise.all([
        page.waitForURL(`${repository}/issues`),
        nav.locator('a[href$="/issues"]').click(),
      ]);
      const authors = page.locator('main button[data-testid="authors-anchor-button"]');
      const filter = page.locator('[role="dialog"][data-component="AnchoredOverlay"] input');
      await authors.press('Enter');
      const opened = await filter.waitFor({ timeout: 1500 }).then(() => true, () => false);
      if (!opened && await authors.getAttribute('aria-expanded') === 'false') {
        await authors.press('Enter');
      }
      await filter.waitFor();
      await page.keyboard.press('Escape');
      await filter.waitFor({ state: 'hidden' });
    });
  } finally {
    await browser.close();
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}
