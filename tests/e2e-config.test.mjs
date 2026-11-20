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
