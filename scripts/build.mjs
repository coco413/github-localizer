import './check-locales.mjs';

import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('extension');
const output = resolve('dist');
const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
await mkdir(output, { recursive: true });

for (const browser of ['chrome', 'edge', 'firefox']) {
  const candidate = resolve(output, browser);
  const archive = resolve(output, `${browser}.zip`);
  await rm(candidate, { recursive: true, force: true });
  await rm(archive, { force: true });
  await cp(source, candidate, { recursive: true });

  const entry = 'background.js';
  const candidateManifest = { ...manifest, background: { service_worker: entry } };
  if (browser === 'firefox') {
    candidateManifest.background = { scripts: [entry] };
    candidateManifest.browser_specific_settings = {
      gecko: {
        id: 'github-localizer@coco413.github.io',
        strict_min_version: '128.0',
        data_collection_permissions: { required: ['none'] },
      },
    };
  }

  await writeFile(resolve(candidate, 'manifest.json'), JSON.stringify(candidateManifest, null, 2) + '\n');
  execFileSync('zip', ['-q', '-r', archive, '.'], { cwd: candidate });
}
