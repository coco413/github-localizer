import { execFileSync } from 'node:child_process';

const repository = 'coco413/github-localizer';
const marker = /<!-- github-localizer-inspection:([a-f0-9]{64}) (\S+) -->/;

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 32 * 1024 * 1024 });
}

const github = {
  async list() {
    return JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/issues?state=all&per_page=100`]))
      .flat().filter(issue => !issue.pull_request);
  },
  async create({ title, body }) {
    const result = gh(['api', '--method', 'POST', `repos/${repository}/issues`, '--input', '-'],
      JSON.stringify({ title, body, labels: ['needs-triage'] }));
    return JSON.parse(result).number;
  },
};

export async function publishFindings(report, tracker = github) {
  const known = new Map();
  for (const issue of await tracker.list()) {
    const fingerprint = marker.exec(issue.body ?? '');
    if (fingerprint) known.set(fingerprint[1], { issue: issue.number, firstDetectedAt: fingerprint[2] });
  }

  for (const finding of report.findings) {
    if (finding.kind !== 'unlisted' && finding.kind !== 'rule-failed') continue;
    const prior = known.get(finding.key);
    if (prior) {
      Object.assign(finding, prior);
      continue;
    }
    const title = `[巡检] ${finding.kind === 'unlisted' ? '未收录' : '规则失效'} · ${finding.control} · ${finding.original}`;
    const lines = finding.samples.map(({ url, selector, attribute, reason, expected }) =>
      JSON.stringify({ url, selector, attribute, reason, expected }).replaceAll('`', '\\u0060'));
    const body = [
      `<!-- github-localizer-inspection:${finding.key} ${finding.firstDetectedAt} -->`,
      `词库版本 ${report.dictionaryVersion}，首次发现 ${finding.firstDetectedAt}。`,
      '', '样例位置', '', '```text', ...lines, '```',
    ].join('\n');
    finding.issue = await tracker.create({ title, body });
    known.set(finding.key, { issue: finding.issue, firstDetectedAt: finding.firstDetectedAt });
  }
}
