import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { arch, cpus, release, tmpdir, totalmem, type } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, firefox } from 'playwright';

const url = 'https://github.com/octocat/Hello-World';
const fixture = await readFile(new URL('../tests/fixtures/repository.html', import.meta.url), 'utf8');
const tested = process.argv.slice(2);
const targets = tested.length ? tested : ['chrome', 'edge', 'firefox'];

async function installFirefox(addonPath, port) {
  // Firefox Remote Debugging Protocol frames JSON with a UTF-8 byte count.
  const socket = createConnection(port, '127.0.0.1');
  socket.setTimeout(5_000, () => socket.destroy(new Error('Firefox debugger timed out')));
  let input = Buffer.alloc(0);
  const frames = socket[Symbol.asyncIterator]();
  async function receive() {
    while (true) {
      const end = input.indexOf(':');
      if (end !== -1) {
        const size = Number(input.subarray(0, end).toString());
        const after = end + 1 + size;
        if (input.length >= after) {
          const reply = JSON.parse(input.subarray(end + 1, after).toString());
          input = input.subarray(after);
          assert.equal(reply.error, undefined, JSON.stringify(reply));
          return reply;
        }
      }
      const frame = await frames.next();
      assert.equal(frame.done, false, 'Firefox closed its debugger connection');
      input = Buffer.concat([input, frame.value]);
    }
  }

  function send(message) {
    const json = JSON.stringify(message);
    socket.write(`${Buffer.byteLength(json)}:${json}`);
  }

  try {
    assert.equal((await receive()).applicationType, 'browser');
    send({ to: 'root', type: 'getRoot' });
    const { addonsActor } = await receive();
    send({ to: addonsActor, type: 'installTemporaryAddon', addonPath });
    assert.equal((await receive()).addon.id, 'github-localizer@coco413.github.io');
  } finally {
    socket.destroy();
  }
}

async function debuggerPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

async function launch(browser, directory) {
  const profile = join(directory, 'profile');
  const executablePath = process.env[`${browser.toUpperCase()}_EXECUTABLE`];
  if (browser === 'firefox') {
    const port = await debuggerPort();
    return {
      context: await firefox.launchPersistentContext(profile, {
        executablePath,
        args: ['--start-debugger-server', String(port)],
        firefoxUserPrefs: {
          'devtools.debugger.remote-enabled': true,
          'devtools.debugger.prompt-connection': false,
        },
      }),
      install: (path) => installFirefox(path, port),
      binary: executablePath ?? firefox.executablePath(),
    };
  }
  const context = await chromium.launchPersistentContext(profile, {
    ...(executablePath ? { executablePath } : { channel: browser === 'edge' ? 'msedge' : 'chrome' }),
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  return {
    context,
    async install(path) {
      const session = await context.browser().newBrowserCDPSession();
      try {
        const { product } = await session.send('Browser.getVersion');
        assert.match(product, browser === 'edge' ? /^Edg\// : /^Chrome\//);
        assert.ok((await session.send('Extensions.loadUnpacked', { path })).id);
      } finally {
        await session.detach();
      }
    },
    binary: executablePath ?? (browser === 'edge' ? 'msedge' : 'chrome'),
  };
}

function sampleFixture() {
  // The inert fixture becomes recognizable when it is inserted. Start the
  // observer before insertion so synchronous and asynchronous writes count.
  return fixture.replace('<body>', '<body><template id="sample">')
    .replace('</body>', `</template><script>
      const sample = document.querySelector('#sample').content;
      const target = sample.querySelector('[data-content="Pull requests"]');
      const translated = '拉取请求（PR）';
      window.observeTranslation = (makeRecognizable) => new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (target.textContent !== translated) return;
          const duration = performance.now() - start;
          observer.disconnect();
          clearTimeout(timeout);
          resolve(duration);
        });
        observer.observe(target, { childList: true, characterData: true, subtree: true });
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(new Error('No translation write observed in 3 seconds'));
        }, 3000);
        const start = performance.now();
        makeRecognizable();
      });
      window.first = observeTranslation(() => document.body.append(sample));
      window.dynamic = () => observeTranslation(() => { target.textContent = 'Pull requests'; });
      window.idle = () => new Promise(resolve => {
        let writes = 0;
        const observer = new MutationObserver(records => { writes += records.length; });
        observer.observe(document.documentElement, {
          subtree: true, childList: true, characterData: true, attributes: true,
        });
        setTimeout(() => { observer.disconnect(); resolve(writes); }, 5000);
      });
    </script></body>`);
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples, p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

async function benchmark(browser) {
  assert.ok(['chrome', 'edge', 'firefox'].includes(browser), `Unknown browser: ${browser}`);
  const directory = await mkdtemp(join(tmpdir(), 'github-localizer-benchmark-'));
  let context;
  try {
    const extension = join(directory, 'extension');
    await cp(resolve('dist', browser), extension, { recursive: true });
    const path = join(extension, 'manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    // Equivalent to starting with the GitHub grant already approved.
    manifest.host_permissions = manifest.optional_host_permissions;
    delete manifest.optional_host_permissions;
    await writeFile(path, JSON.stringify(manifest));

    const instance = await launch(browser, directory);
    ({ context } = instance);
    await instance.install(extension);
    const html = sampleFixture();
    await context.route('**/*', (route) => (
      route.request().url() === url
        ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
        : route.abort()
    ));
    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate(() => window.first);
    const userAgent = await page.evaluate(() => navigator.userAgent);
    assert.match(userAgent, {
      chrome: /Chrome\//,
      edge: /Edg\//,
      firefox: /Firefox\//,
    }[browser]);

    const first = [];
    const dynamic = [];
    for (let i = 0; i < 30; i++) {
      await page.reload();
      first.push(await page.evaluate(() => window.first));
      dynamic.push(await page.evaluate(() => window.dynamic()));
    }
    return {
      browser, binary: instance.binary, userAgent,
      version: context.browser().version(),
      first: summarize(first), dynamic: summarize(dynamic),
      idleWrites: await page.evaluate(() => window.idle()),
    };
  } finally {
    await context?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

const report = {
  capturedAt: new Date().toISOString(),
  host: { os: type(), kernel: release(), architecture: arch(), cpu: cpus()[0].model, memoryBytes: totalmem() },
  browsers: [],
};
for (const browser of targets) report.browsers.push(await benchmark(browser));
console.log(JSON.stringify(report, null, 2));
for (const { browser, first, dynamic, idleWrites } of report.browsers) {
  assert.ok(first.p95 <= 200, `${browser} first-screen P95: ${first.p95} ms`);
  assert.ok(dynamic.p95 <= 200, `${browser} dynamic P95: ${dynamic.p95} ms`);
  assert.equal(idleWrites, 0, `${browser}: writes during five idle seconds`);
}
