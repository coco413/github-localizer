import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, release, tmpdir, totalmem, type } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const url = 'https://github.com/octocat/Hello-World';
const fixture = await readFile(new URL('../tests/fixtures/repository.html', import.meta.url), 'utf8');
const tested = process.argv.slice(2);
const targets = tested.length ? tested : ['chrome', 'edge', 'firefox'];

async function launchFirefox(profile, binary) {
  // Firefox exposes the standard WebDriver BiDi endpoint on loopback.
  await mkdir(profile, { recursive: true });
  await writeFile(join(profile, 'user.js'), 'user_pref("remote.experimental.enabled", true);');
  const browser = spawn(binary, ['--headless', '--no-remote', '--profile', profile,
    '--remote-debugging-port', '0', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const finished = new Promise((resolve) => browser.once('close', resolve));
  let socket;
  async function close() {
    socket?.close();
    browser.kill();
    await finished;
  }

  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Firefox startup timed out')), 15_000);
      browser.once('error', (err) => { clearTimeout(timeout); reject(err); });
      browser.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Firefox exited: ${code}`)); });
      browser.stderr.on('data', (chunk) => {
        const match = String(chunk).match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1] + '/session');
        }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const pending = new Map();
    let next = 0;
    let intercept;
    let interceptionFailure;
    function send(method, params) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Firefox command timed out: ${method}`, { cause: interceptionFailure }));
        }, 10_000);
        pending.set(id, (message) => {
          clearTimeout(timer);
          if (message.type === 'error') reject(new Error(`${method}: ${message.message}`));
          else resolve(message.result);
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }

    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      const finish = pending.get(message.id);
      if (finish) {
        pending.delete(message.id);
        finish(message);
      }
      if (message.method === 'network.beforeRequestSent' && message.params.isBlocked) {
        void intercept(message.params.request).catch((err) => { interceptionFailure = err; });
      }
    });
    const { capabilities } = await send('session.new', { capabilities: {} });
    assert.equal(capabilities.browserName, 'firefox');
    const { contexts: [{ context }] } = await send('browsingContext.getTree', {});
    return {
      binary, version: capabilities.browserVersion, build: capabilities['moz:buildID'], close,
      async install(path) {
        const { extension } = await send('webExtension.install', {
          extensionData: { type: 'path', path },
        });
        assert.equal(extension, 'github-localizer@coco413.github.io');
      },
      async route(html) {
        const headers = [{ name: 'content-type', value: { type: 'string', value: 'text/html; charset=utf-8' } }];
        const body = { type: 'base64', value: Buffer.from(html).toString('base64') };
        intercept = ({ url: requestUrl, request }) => requestUrl === url
          ? send('network.provideResponse', { request, statusCode: 200, headers, body })
          : send('network.failRequest', { request });
        await send('session.subscribe', { events: ['network.beforeRequestSent'], contexts: [context] });
        await send('network.addIntercept', { phases: ['beforeRequestSent'], contexts: [context] });
      },
      goto: () => send('browsingContext.navigate', { context, url, wait: 'complete' }),
      reload: () => send('browsingContext.reload', { context, wait: 'complete' }),
      async evaluate(callback) {
        const reply = await send('script.evaluate', {
          expression: `(${callback})()`, awaitPromise: true, target: { context },
        });
        assert.equal(reply.type, 'success', reply.exceptionDetails?.text);
        return reply.result.value;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

async function launch(browser, directory) {
  const profile = join(directory, 'profile');
  const executablePath = process.env[`${browser.toUpperCase()}_EXECUTABLE`];
  if (browser === 'firefox') return launchFirefox(profile, executablePath ?? (
    process.platform === 'darwin' ? '/Applications/Firefox.app/Contents/MacOS/firefox'
      : process.platform === 'win32' ? 'C:\\Program Files\\Mozilla Firefox\\firefox.exe' : 'firefox'
  ));

  const channel = browser === 'edge' ? 'msedge' : 'chrome';
  const context = await chromium.launchPersistentContext(profile, {
    ...(executablePath ? { executablePath } : { channel }),
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const page = await context.newPage();
  return {
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
    route: (html) => context.route('**/*', (route) => (
      route.request().url() === url
        ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
        : route.abort()
    )),
    goto: () => page.goto(url),
    reload: () => page.reload(),
    evaluate: (callback) => page.evaluate(callback),
    close: () => context.close(),
    binary: executablePath ?? channel,
    version: context.browser().version(),
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
  let instance;
  try {
    const extension = join(directory, 'extension');
    await cp(resolve('dist', browser), extension, { recursive: true });
    const path = join(extension, 'manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    // Equivalent to starting with the GitHub grant already approved.
    manifest.host_permissions = manifest.optional_host_permissions;
    delete manifest.optional_host_permissions;
    await writeFile(path, JSON.stringify(manifest));

    instance = await launch(browser, directory);
    await instance.install(extension);
    await instance.route(sampleFixture());
    await instance.goto();
    await instance.evaluate(() => window.first);
    const userAgent = await instance.evaluate(() => navigator.userAgent);
    assert.match(userAgent, {
      chrome: /Chrome\//,
      edge: /Edg\//,
      firefox: /Firefox\//,
    }[browser]);

    const first = [];
    const dynamic = [];
    for (let i = 0; i < 30; i++) {
      await instance.reload();
      first.push(await instance.evaluate(() => window.first));
      dynamic.push(await instance.evaluate(() => window.dynamic()));
    }
    return {
      browser, binary: instance.binary, userAgent,
      version: instance.version, build: instance.build,
      first: summarize(first), dynamic: summarize(dynamic),
      idleWrites: await instance.evaluate(() => window.idle()),
    };
  } finally {
    try {
      await instance?.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
