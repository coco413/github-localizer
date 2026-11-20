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
  const { url, controls, action } = sample;
  const expectedUrl = new URL(url);
  if (expectedUrl.origin !== 'https://github.com' || expectedUrl.username || expectedUrl.password) {
    throw new Error('Inspection accepts only GitHub HTTPS pages.');
  }
  const unavailable = (reason) => ({
    url, incomplete: true, findings: [{ kind: 'unavailable', control: 'page', original: null, reason }],
  });
  const findings = [];
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!response?.ok()) return unavailable(`HTTP ${response?.status() ?? 'unknown'}`);
    const actualUrl = new URL(page.url());
    if (actualUrl.origin !== expectedUrl.origin || actualUrl.pathname !== expectedUrl.pathname) {
      return unavailable('Unexpected redirect');
    }
    if (action) await page.locator(action).first().click({ timeout: 5_000 });
    await Promise.all(controls.map(({ selector }) => page.locator(selector).filter({ visible: true }).first()
      .waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})));

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

      const read = (selector, attribute, excluded) =>
        Array.from(document.querySelectorAll(selector)).flatMap(element => {
          if (element.closest(excluded) || !element.getClientRects().length) return [];
          const value = attribute ? element.getAttribute(attribute) :
            Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.data).join('');
          const text = value?.trim();
          return text ? [text] : [];
        });
      const snapshot = () => evaluate(`[${controls.map(({ selector, attribute = null }) =>
        `(${read})(${JSON.stringify(selector)}, ${JSON.stringify(attribute)}, ${JSON.stringify(protectedContent)})`
      ).join(',')}]`);
      const originals = await snapshot();
      for (const file of files) await evaluate(await readFile(resolve('extension', file), 'utf8'));
      await evaluate('globalThis.githubLocalizerRuntime?.configure({ enabled: true, original: false, mode: "beginner" })');
      const beginner = await snapshot();
      await evaluate('globalThis.githubLocalizerRuntime?.configure({ enabled: true, original: false, mode: "professional" })');
      const professional = await snapshot();

      for (const [index, { id: control, selector, attribute, expected = {}, retained = [] }] of controls.entries()) {
        if (!originals[index].length && Object.keys(expected).length) {
          findings.push({ kind: 'rule-failed', control, selector, attribute, original: Object.keys(expected).join(' / '),
            expected, reason: 'Control or text unavailable at its expected location' });
          continue;
        }
        for (const [slot, original] of originals[index].entries()) {
          const location = { control, selector, attribute, original };
          const translated = [beginner[index][slot], professional[index][slot]];
          if (retained.includes(original) && translated.every(value => value === original)) {
            findings.push({ kind: 'retained', ...location });
          } else if (Object.hasOwn(expected, original)) {
            const target = expected[original];
            const targets = typeof target === 'string' ? [target, target] : [target.beginner, target.professional];
            if (translated.some((value, mode) => value !== targets[mode])) {
              findings.push({ kind: 'rule-failed', ...location, expected: target,
                reason: 'Translation differs from the expected locale' });
            }
          } else if (translated.every(value => value === original) && /^[\p{L}][\p{L} .’'?!-]{1,79}$/u.test(original) && /[A-Za-z]/.test(original)) {
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
  return { url, incomplete: false, findings };
}

export function buildReport(pages, { dictionaryVersion, observedAt, lifecycle = {} }) {
  const findings = new Map();
  for (const { url, findings: details } of pages) {
    for (const { kind, control, original, selector, attribute, reason, expected } of details) {
      const key = createHash('sha256').update(JSON.stringify([kind, control, original])).digest('hex');
      if (!findings.has(key)) {
        const dates = Object.hasOwn(lifecycle, key) ? lifecycle[key] : {};
        findings.set(key, { key, kind, control, original, samples: [], firstDetectedAt: dates.firstDetectedAt ?? observedAt,
          fixPublishableAt: dates.fixPublishableAt ?? null, userInstallableAt: dates.userInstallableAt ?? null,
          storeReviewAt: dates.storeReviewAt ?? null });
      }
      const finding = findings.get(key);
      if (!finding.samples.some(sample => sample.url === url && sample.selector === selector && sample.attribute === attribute)) {
        finding.samples.push({ url, selector, attribute, reason, expected });
      }
    }
  }
  const sorted = Array.from(findings.values(), finding => ({
    ...finding, pageCount: new Set(finding.samples.map(sample => sample.url)).size,
  })).sort((left, right) => right.pageCount - left.pageCount || left.key.localeCompare(right.key));
  return {
    dictionaryVersion, observedAt,
    status: pages.some(page => page.incomplete) ? 'incomplete' : 'complete',
    pages: pages.map(({ url, incomplete }) => ({ url, status: incomplete ? 'incomplete' : 'complete' })),
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
    for (const sample of samples) results.push(sample.url ? await inspectPage(page, sample) : sample);
  } finally {
    await browser.close();
  }
  const { version } = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
  const hash = createHash('sha256');
  for (const file of runtimeFiles) hash.update(await readFile(resolve('extension', file)));
  const lifecycle = process.env.INSPECTION_LIFECYCLE_FILE
    ? JSON.parse(await readFile(process.env.INSPECTION_LIFECYCLE_FILE, 'utf8')) : {};
  const report = buildReport(results, {
    lifecycle,
    dictionaryVersion: `${version}+${hash.digest('hex').slice(0, 12)}`,
    observedAt: new Date().toISOString(),
  });
  const output = resolve('artifacts/github-inspection.json');
  await mkdir(dirname(output), { recursive: true });
  try {
    if (process.argv.includes('--publish')) await publishFindings(report);
  } finally {
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.status}: ${report.findings.length} findings in ${output}`);
  if (process.argv.includes('--release') && (report.status === 'incomplete' ||
      report.findings.some(({ kind }) => kind === 'rule-failed' || kind === 'unlisted'))) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await run();
