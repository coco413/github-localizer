import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('dedicated E2E requires explicit fixture and session files before browser startup', () => {
  const result = spawnSync(process.execPath, ['scripts/e2e-github.mjs', 'chromium', '--dedicated'], {
    encoding: 'utf8',
    env: { ...process.env, E2E_FIXTURE_FILE: '', E2E_SESSION_FILE: '' },
    timeout: 2000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /E2E_FIXTURE_FILE and E2E_SESSION_FILE are required/);
});

test('dedicated checks require localized controls and preserve matching fixture text', async () => {
  const { chromium } = await import('playwright');
  const { verifyPullCreation, verifyFailedJob } = await import('../scripts/e2e-dedicated.mjs');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(200);
    await page.setContent('<main><form id="new_pull_request"><button>Create pull request</button></form></main>');
    await assert.rejects(() => verifyPullCreation(page), { name: 'TimeoutError' });
    await page.locator('button').evaluate(button => { button.textContent = '创建拉取请求（PR）'; });
    await verifyPullCreation(page);

    await page.setContent(`<main><div id="logs">
      <div class="js-checks-log-toolbar"><div class="CheckRun-log-title">
        <span class="js-updatable-content">failed</span></div></div>
      <div class="js-job-log"><pre>failed</pre></div></div></main>`);
    await assert.rejects(() => verifyFailedJob(page, 'failed'), { name: 'TimeoutError' });
    await page.locator('.js-updatable-content').evaluate(status => { status.textContent = '失败'; });
    await verifyFailedJob(page, 'failed');
    await assert.rejects(() => verifyFailedJob(page, '失败'), { name: 'TimeoutError' });
  } finally {
    await browser.close();
  }
});
