import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readConfig(file, label) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error(`Could not read ${label} JSON`);
  }
}

export async function dedicatedConfig(env) {
  const { E2E_FIXTURE_FILE: configFile, E2E_SESSION_FILE: sessionFile } = env;
  assert.ok(configFile && sessionFile, 'E2E_FIXTURE_FILE and E2E_SESSION_FILE are required');
  const fixture = await readConfig(configFile, 'fixture');
  assert.ok(fixture?.dedicated === true, 'Mark the fixture repository as dedicated');
  assert.match(fixture.repository ?? '', /^[a-z0-9-]+\/[a-z0-9_.-]+$/i, 'Use owner/repository');
  assert.ok(!/\/\.{1,2}$/.test(fixture.repository), 'Use a named repository');
  assert.notEqual(fixture.repository.toLowerCase(), 'coco413/github-localizer', 'Use a dedicated repository');
  assert.match(fixture.actor ?? '', /^[a-z0-9-]+$/i, 'Set the dedicated account login');
  for (const key of ['baseBranch', 'fixtureBranch']) {
    assert.match(fixture[key] ?? '', /^[a-z0-9][a-z0-9._\/-]*$/i, `Set ${key}`);
    assert.ok(!fixture[key].includes('..'), `Invalid ${key}`);
  }
  assert.notEqual(fixture.baseBranch, fixture.fixtureBranch, 'Use a separate fixture branch');
  for (const key of ['pull', 'run', 'job']) {
    assert.ok(Number.isSafeInteger(fixture[key]) && fixture[key] > 0, `Set positive integer ${key}`);
  }
  for (const key of ['pullTitle', 'reviewText', 'logText']) {
    assert.ok(typeof fixture[key] === 'string' && fixture[key].trim(), `Set ${key}`);
  }

  const session = await readConfig(sessionFile, 'session');
  assert.ok(session?.cookies?.some(cookie => cookie.name === 'user_session' &&
    ['.github.com', 'github.com'].includes(cookie.domain)), 'Session requires a github.com login cookie');
  return { fixture, cookies: session.cookies.filter(cookie => ['.github.com', 'github.com'].includes(cookie.domain)) };
}

export async function verifyPullCreation(page) {
  await page.locator('main #new_pull_request')
    .getByRole('button', { name: '创建拉取请求（PR）', exact: true }).waitFor();
}

export async function verifyFailedJob(page, logText) {
  await page.locator('main #logs .js-checks-log-toolbar .CheckRun-log-title > .js-updatable-content')
    .filter({ hasText: /^失败(?:\s|$)/ }).waitFor();
  await page.locator('main #logs .js-job-log').getByText(logText, { exact: true }).first().waitFor();
}

export async function verifyDedicated(browser, page, { fixture, cookies }, scenario) {
  const repository = new URL(`https://github.com/${fixture.repository}`);
  const basePath = repository.pathname.toLowerCase();
  const isFixturePage = url => url.origin === repository.origin && (
    url.pathname.toLowerCase() === basePath || url.pathname.toLowerCase().startsWith(basePath + '/')
  );
  try {
    await browser.addCookies(cookies);
  } catch {
    throw new Error('Could not load the dedicated GitHub session');
  }
  await browser.route('**/*', route => {
    const request = route.request();
    const document = request.resourceType() === 'document';
    const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(request.method());
    return readOnly && (!document || isFixturePage(new URL(request.url()))) ? route.continue() : route.abort();
  });

  async function open(path) {
    const url = new URL(repository.href + path);
    assert.ok(isFixturePage(url), 'Fixture page must stay in the dedicated repository');
    const response = await page.goto(url.href);
    assert.equal(response?.status(), 200);
    assert.equal(new URL(page.url()).pathname.toLowerCase(), url.pathname.toLowerCase(), 'Unexpected fixture redirect');
    assert.ok(isFixturePage(new URL(page.url())), 'Unexpected fixture origin');
    const actor = await page.locator('meta[name="user-login"]').getAttribute('content');
    assert.equal(actor?.toLowerCase(), fixture.actor.toLowerCase(), 'Wrong dedicated login');
  }

  await scenario('dedicated branch presents a new pull request form', async () => {
    const base = encodeURIComponent(fixture.baseBranch);
    const head = encodeURIComponent(fixture.fixtureBranch);
    await open(`/compare/${base}...${head}?expand=1`);
    await verifyPullCreation(page);
  });

  await scenario('dedicated PR preserves its title and review comment', async () => {
    await open(`/pull/${fixture.pull}`);
    await page.getByRole('navigation', { name: '拉取请求（PR）标签页' })
      .getByRole('link', { name: /^讨论(?:\s|$)/ }).waitFor();
    await page.locator('main').getByText(fixture.pullTitle, { exact: true }).first().waitFor();
    await page.locator('main').getByText(fixture.reviewText, { exact: true }).first().waitFor();
  });

  await scenario('dedicated failed run links to the job and preserves its failure log', async () => {
    const runPath = `/actions/runs/${fixture.run}`;
    const jobPath = `${runPath}/job/${fixture.job}`;
    await open(runPath);
    await page.locator('main [aria-label="Workflow run summary"] span.h4')
      .filter({ hasText: /^失败$/ }).waitFor();
    await Promise.all([
      page.waitForURL(url => isFixturePage(url) && url.pathname.endsWith(jobPath)),
      page.locator(`main a[href$="${jobPath}"]`).filter({ visible: true }).first().click(),
    ]);
    await verifyFailedJob(page, fixture.logText);
  });
}
