import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const protectedContent = [
  '.markdown-body', '.comment-body', 'pre', 'code', '[contenteditable]', '.diff-view', '.js-job-log',
  '[data-testid="issue-title"]', '[data-testid="pull-request-title"]', '.js-issue-title', '.react-issue-title',
].join(', ');
const runtimeFiles = [
  'runtime.js', 'repository-words.js', 'issue-pr-words.js', 'extended-pages.js', 'content.js', 'issue-pr.js',
];

export async function inspectPage(page, sample, files = runtimeFiles) {
  const { url, controls, action, state, ready, timeout = 5_000 } = sample;
  const expectedUrl = new URL(url);
  if (expectedUrl.origin !== 'https://github.com' || expectedUrl.username || expectedUrl.password) {
    throw new Error('Inspection accepts only GitHub HTTPS pages.');
  }
  const unavailable = (reason) => ({
    url, state, incomplete: true, findings: [{ kind: 'unavailable', control: state ?? 'page', original: null, reason }],
  });
  const findings = [];
  try {
    await page.setViewportSize(sample.viewport ?? { width: 1280, height: 720 });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!response?.ok()) return unavailable(`HTTP ${response?.status() ?? 'unknown'}`);
    const actualUrl = new URL(page.url());
    if (actualUrl.origin !== expectedUrl.origin || actualUrl.pathname !== expectedUrl.pathname) {
      return unavailable('Unexpected redirect');
    }
    const readyControl = ready ? page.locator(ready).filter({ visible: true }).first() : null;
    if (action) {
      let targets = page.locator(action.selector).filter({ visible: true });
      if (action.text) targets = targets.filter({ hasText: action.text });
      const trigger = targets.first();
      const activate = () => action.key ? trigger.press(action.key, { timeout }) : trigger.click({ timeout });
      await activate();
      if (readyControl) {
        const opened = await readyControl.waitFor({ state: 'visible', timeout: 1_500 })
          .then(() => true, () => false);
        if (!opened && await trigger.getAttribute('aria-expanded', { timeout }) === 'false') await activate();
      }
    }
    if (readyControl) await readyControl.waitFor({ state: 'visible', timeout });
    await Promise.all(controls.map(({ selector, timeout: controlTimeout = timeout }) => page.locator(selector).filter({ visible: true }).first()
      .waitFor({ state: 'visible', timeout: controlTimeout }).catch(() => {})));

    // Chromium's isolated world matches content-script isolation on real pages.
    const cdp = await page.context().newCDPSession(page);
    try {
      const { frameTree } = await cdp.send('Page.getFrameTree');
      const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id });
      async function evaluate(expression) {
        const result = await cdp.send('Runtime.evaluate', {
          expression, contextId: executionContextId, returnByValue: true,
        });
        if (result.exceptionDetails) throw new Error('Could not execute the inspection probe');
        return result.result.value;
      }

      const capture = (definitions, excluded) => {
        const slots = definitions.map(({ selector, attribute }) =>
          Array.from(document.querySelectorAll(selector))
            .filter(element => !element.closest(excluded) && element.getClientRects().length)
            .map(element => ({ element, attribute })));
        globalThis.inspectionSnapshot = () => slots.map(entries => entries.map(({ element, attribute }) => {
          if (!element.isConnected || element.closest(excluded) || !element.getClientRects().length) return null;
          const value = attribute ? element.getAttribute(attribute) :
            Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.data).join('');
          return value?.trim() || null;
        }));
      };
      await evaluate(`(${capture})(${JSON.stringify(controls)}, ${JSON.stringify(protectedContent)})`);
      const snapshot = () => evaluate('globalThis.inspectionSnapshot()');
      const originals = await snapshot();
      for (const file of files) await evaluate(await readFile(resolve('extension', file), 'utf8'));
      await evaluate('globalThis.githubLocalizerRuntime?.configure({ enabled: true, original: false, mode: "beginner" })');
      const beginner = await snapshot();
      await evaluate('globalThis.githubLocalizerRuntime?.configure({ enabled: true, original: false, mode: "professional" })');
      const professional = await snapshot();

      for (const [index, { id: control, selector, attribute, expected = {}, retained = [], min = 1 }] of controls.entries()) {
        const labels = [...Object.keys(expected), ...retained];
        if (originals[index].filter(Boolean).length < min && labels.length) {
          findings.push({ kind: 'rule-failed', control, selector, attribute, original: labels.join(' / '),
            expected, reason: 'Fewer controls or labels than expected at this location' });
        }
        for (const [slot, original] of originals[index].entries()) {
          if (!original) continue;
          const location = { control, selector, attribute, original };
          const translated = [beginner[index][slot], professional[index][slot]];
          if (translated.includes(null)) {
            findings.push({ kind: 'rule-failed', ...location, reason: 'A control disappeared during translation' });
          } else if (retained.includes(original)) {
            if (translated.every(value => value === original)) findings.push({ kind: 'retained', ...location });
            else findings.push({ kind: 'rule-failed', ...location, expected: original, reason: 'Retained English changed' });
          } else if (Object.hasOwn(expected, original)) {
            const target = expected[original];
            const targets = typeof target === 'string' ? [target, target] : [target.beginner, target.professional];
            if (translated.some((value, mode) => value !== targets[mode])) {
              findings.push({ kind: 'rule-failed', ...location, expected: target,
                reason: 'Translation differs from the expected locale' });
            }
          } else if (translated.every(value => value === original) && /^[A-Za-z][A-Za-z0-9 .,’'?!:;()&/+–—…-]{1,119}$/u.test(original)) {
            findings.push({ kind: 'unlisted', ...location });
          }
        }
      }
    } finally {
      await cdp.detach();
    }
  } catch (error) {
    return unavailable(error.name === 'TimeoutError' ? 'Timed out waiting for the page or state' : 'Navigation or probe failed');
  }
  return { url, state, incomplete: false, findings };
}

export function buildReport(pages, { dictionaryVersion, observedAt, history = {}, lifecycle = {} }) {
  const datesByKey = { ...history };
  for (const [key, dates] of Object.entries(lifecycle)) {
    datesByKey[key] = { ...datesByKey[key], ...dates };
  }
  const findings = new Map();
  for (const { url, state, findings: details } of pages) {
    for (const { kind, control, original, selector, attribute, reason, expected } of details) {
      const key = createHash('sha256').update(JSON.stringify([kind, control, original])).digest('hex');
      if (!findings.has(key)) {
        const dates = Object.hasOwn(datesByKey, key) ? datesByKey[key] : {};
        findings.set(key, { key, kind, control, original, samples: [], firstDetectedAt: dates.firstDetectedAt ?? observedAt,
          fixPublishableAt: dates.fixPublishableAt ?? null, userInstallableAt: dates.userInstallableAt ?? null,
          storeReviewAt: dates.storeReviewAt ?? null });
      }
      const finding = findings.get(key);
      const { firstDetectedAt, fixPublishableAt, userInstallableAt, storeReviewAt } = finding;
      datesByKey[key] = { firstDetectedAt, fixPublishableAt, userInstallableAt, storeReviewAt };
      if (!finding.samples.some(sample => sample.url === url && sample.state === state && sample.selector === selector && sample.attribute === attribute)) {
        finding.samples.push({ url, state, selector, attribute, reason, expected });
      }
    }
  }
  const sorted = Array.from(findings.values(), finding => ({
    ...finding, pageCount: new Set(finding.samples.map(sample => sample.url)).size,
  })).sort((left, right) => right.pageCount - left.pageCount || left.key.localeCompare(right.key));
  return {
    dictionaryVersion, observedAt, lifecycle: datesByKey,
    status: pages.some(page => page.incomplete) ? 'incomplete' : 'complete',
    pages: pages.map(({ url, state, incomplete }) => ({ url, state, status: incomplete ? 'incomplete' : 'complete' })),
    findings: sorted,
    candidates: sorted.filter(({ kind }) => kind === 'unlisted').map(({ control, original, samples }) => ({
      control, original, samples, beginner: '', professional: '',
    })),
  };
}

async function run() {
  const { chromium } = await import('playwright');
  const { inspectionSamples } = await import('./inspection-samples.mjs');
  const { publishFindings } = await import('./inspection-triage.mjs');
  const samples = inspectionSamples(process.env);
  const browser = await chromium.launch();
  const results = [];
  try {
    const page = await browser.newPage({ locale: 'en-US' });
    let signedInPage;
    if (samples.some(sample => sample.authenticated)) {
      try {
        const storageState = process.env.INSPECTION_AUTH_STATE
          ? JSON.parse(process.env.INSPECTION_AUTH_STATE) : process.env.INSPECTION_AUTH_STATE_FILE;
        signedInPage = await browser.newPage({ locale: 'en-US', storageState });
      } catch {
        // Storage state can contain session cookies. Keep diagnostics limited to its availability.
      }
    }
    for (const sample of samples) {
      if (!sample.url) results.push(sample);
      else if (sample.authenticated && !signedInPage) {
        results.push({ url: sample.url, state: sample.state, incomplete: true, findings: [{
          kind: 'unavailable', control: sample.state, original: null, reason: 'Inspection storage state could not be loaded',
        }] });
      } else results.push(await inspectPage(sample.authenticated ? signedInPage : page, sample));
    }
  } finally {
    await browser.close();
  }
  const { version } = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
  const hash = createHash('sha256');
  for (const file of runtimeFiles) hash.update(await readFile(resolve('extension', file)));
  const lifecycle = process.env.INSPECTION_LIFECYCLE_FILE
    ? JSON.parse(await readFile(process.env.INSPECTION_LIFECYCLE_FILE, 'utf8')) : {};
  const output = resolve('artifacts/github-inspection.json');
  const previous = await readFile(output, 'utf8').then(JSON.parse, error => {
    if (error.code !== 'ENOENT') throw error;
    return {};
  });
  const history = previous.lifecycle ?? Object.fromEntries((previous.findings ?? []).map(finding => [finding.key, {
    firstDetectedAt: finding.firstDetectedAt, fixPublishableAt: finding.fixPublishableAt,
    userInstallableAt: finding.userInstallableAt, storeReviewAt: finding.storeReviewAt,
  }]));
  const report = buildReport(results, {
    history, lifecycle,
    dictionaryVersion: `${version}+${hash.digest('hex').slice(0, 12)}`,
    observedAt: new Date().toISOString(),
  });
  await mkdir(dirname(output), { recursive: true });
  try {
    if (process.argv.includes('--publish')) await publishFindings(report);
  } finally {
    for (const finding of report.findings) report.lifecycle[finding.key].firstDetectedAt = finding.firstDetectedAt;
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.status}: ${report.findings.length} findings in ${output}`);
  if (process.argv.includes('--release') && (report.status === 'incomplete' ||
      report.findings.some(({ kind }) => kind === 'rule-failed' || kind === 'unlisted'))) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await run();
