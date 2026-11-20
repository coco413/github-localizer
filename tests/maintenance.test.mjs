import { equal, match } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('locale check locates invalid stock entries and conflicting rules', () => {
  const directory = mkdtempSync(join(tmpdir(), 'github-localizer-check-'));
  try {
    cpSync('extension', directory, { recursive: true });
    writeFileSync(join(directory, 'issue-pr-words.js'), `
      globalThis.githubLocalizerIssuePrWords = {
        issues: [
          ['button', { Open: '打开', Open: '', 'Show <b>{count}</b>': { beginner: '显示' } }],
          ['a, button', { Open: '进行中' }],
        ],
      };
    `);
    const result = spawnSync(process.execPath, ['scripts/check-locales.mjs', directory], { encoding: 'utf8' });
    equal(result.status, 1);
    match(result.stderr, /issue-pr-words\.js:4:.*duplicate.*Open/i);
    match(result.stderr, /empty.*Open/i);
    match(result.stderr, /placeholder.*count/i);
    match(result.stderr, /inline tag.*b/i);
    match(result.stderr, /missing.*professional/i);
    match(result.stderr, /conflict.*Open/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('inspection classifies fixed controls, protects content, and groups duplicate findings', async () => {
  const { buildReport, inspectPage } = await import('../scripts/inspect-github.mjs');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://github.com/**', route => route.fulfill({
      contentType: 'text/html',
      status: route.request().url().endsWith('/missing') ? 404 : 200,
      body: '<main><button id="new">New interface label (beta): try it!</button><button id="old">Open</button>' +
        '<button id="kept">PR</button><div class="markdown-body"><button id="new">Private comment</button></div></main>',
    }));
    const controls = [
      { id: 'new', selector: '#new' },
      { id: 'state', selector: '#old', expected: { Open: '未关闭' } },
      { id: 'kept', selector: '#kept', retained: ['PR'] },
    ];
    const first = await inspectPage(page, { url: 'https://github.com/example/repo', controls }, []);
    const second = await inspectPage(page, { url: 'https://github.com/example/repo/issues', controls: [controls[0]] }, []);
    const missing = await inspectPage(page, { url: 'https://github.com/example/repo/missing', controls }, []);
    const report = buildReport([first, first, second, missing], {
      dictionaryVersion: '1.0.0+fixture',
      observedAt: '2026-01-01T00:00:00.000Z',
    });
    equal(report.status, 'incomplete');
    equal(report.dictionaryVersion, '1.0.0+fixture');
    equal(report.findings[0].original, 'New interface label (beta): try it!');
    equal(report.findings[0].pageCount, 2);
    equal(report.findings[0].samples.length, 2);
    equal(report.findings[0].firstDetectedAt, '2026-01-01T00:00:00.000Z');
    equal(report.findings[0].fixPublishableAt, null);
    equal(report.findings[0].userInstallableAt, null);
    equal(report.findings[0].storeReviewAt, null);
    equal(report.findings.some(finding => finding.original === 'Private comment'), false);
    equal(report.findings.map(finding => finding.kind).sort().join(','), 'retained,rule-failed,unavailable,unlisted');
    equal(report.candidates[0].original, 'New interface label (beta): try it!');
  } finally {
    await browser.close();
  }
});

test('publishing reports each translation finding only once, including previously closed issues', async () => {
  const { publishFindings } = await import('../scripts/inspection-triage.mjs');
  const issues = [];
  const tracker = {
    list: async () => issues,
    create: async ({ title, body }) => {
      issues.push({ number: 64, title, body, created_at: '2026-01-01T00:00:00Z', state: 'closed' });
      return 64;
    },
  };
  const finding = { key: 'a'.repeat(64), kind: 'unlisted', control: 'some-control', original: 'New label',
    firstDetectedAt: '2026-01-01T00:00:00.000Z', samples: [{ url: 'https://github.com/example/repo' }] };
  const report = { dictionaryVersion: '1.0.0+fixture', findings: [finding, { kind: 'unavailable' }, { kind: 'retained' }] };
  await publishFindings(report, tracker);
  await publishFindings({ ...report, findings: [{ ...finding, firstDetectedAt: '2026-02-01T00:00:00.000Z' }] }, tracker);
  equal(issues.length, 1);
  equal(finding.issue, 64);
  match(issues[0].body, /2026-01-01T00:00:00.000Z/);
});

test('stock translations resolve a reported finding when the live control is reachable', async () => {
  const { inspectPage } = await import('../scripts/inspect-github.mjs');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://github.com/octocat/Hello-World', route => route.fulfill({
      path: 'tests/fixtures/repository.html',
    }));
    const result = await inspectPage(page, {
      url: 'https://github.com/octocat/Hello-World',
      controls: [{ id: 'code', selector: 'nav[aria-label="Repository"] span[data-content="Code"]',
        expected: { Code: '代码' } }],
    });
    equal(result.incomplete, false);
    equal(result.findings.length, 0);
  } finally {
    await browser.close();
  }
});

test('inspection detects missing required slots, retained drift, and punctuated candidates', async () => {
  const { inspectPage } = await import('../scripts/inspect-github.mjs');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://github.com/octocat/Hello-World', route => route.fulfill({
      path: 'tests/fixtures/repository.html',
    }));
    const result = await inspectPage(page, {
      url: 'https://github.com/octocat/Hello-World',
      controls: [
        { id: 'retained-code', selector: 'nav span[data-content="Code"]', retained: ['Code'] },
        { id: 'missing', selector: 'nav span[data-content="Missing"]', retained: ['Missing'], timeout: 10 },
        { id: 'partial', selector: 'nav span[data-content="Issues"]', min: 2, expected: { Issues: '议题' } },
      ],
    });
    equal(result.findings.filter(({ kind }) => kind === 'rule-failed').length, 3);
  } finally {
    await browser.close();
  }
});

test('release inspection accounts for narrow, keyboard, deferred, empty, and signed-in samples', async () => {
  const { inspectionSamples } = await import('../scripts/inspection-samples.mjs');
  const samples = inspectionSamples({});
  for (const state of ['narrow', 'keyboard-menu', 'deferred-menu', 'empty', 'signed-in']) {
    equal(samples.some(sample => sample.state === state), true, state);
  }
  equal(samples.some(sample => sample.state === 'signed-in' && sample.incomplete), true);
});

test('report carries lifecycle history for findings that disappear and later recur', async () => {
  const { buildReport } = await import('../scripts/inspect-github.mjs');
  const page = { url: 'https://github.com/example/repo', findings: [
    { kind: 'unlisted', control: 'one', original: 'New phrase' },
  ] };
  const first = buildReport([page], { dictionaryVersion: 'v1', observedAt: '2026-01-01' });
  const key = first.findings[0].key;
  const second = buildReport([], { dictionaryVersion: 'v2', observedAt: '2026-02-01',
    history: first.lifecycle, lifecycle: { [key]: { fixPublishableAt: '2026-02-01' } } });
  const third = buildReport([page], { dictionaryVersion: 'v3', observedAt: '2026-03-01', history: second.lifecycle });
  equal(third.findings[0].firstDetectedAt, '2026-01-01');
  equal(third.findings[0].fixPublishableAt, '2026-02-01');
});
