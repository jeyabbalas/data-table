/**
 * Self-hosted DuckDB-WASM under a strict Content Security Policy: the setup
 * docs/guides/csp-and-offline.md describes, run as a deployment runs it.
 *
 * Nothing here uses the Vite dev server. The page is `https://app.test/`,
 * a fake origin served from disk through `context.route`: the built library
 * (`dist/`, so run `npm run build` first), DuckDB-WASM's files from
 * `node_modules/@duckdb/duckdb-wasm/dist` at `/duckdb/`, the test fixtures at
 * `/fixtures/`, and a mirror of DuckDB's extension repository at
 * `/duckdb-ext/`, which the harness fills from `extensions.duckdb.org` with
 * `route.fetch` and caches on disk (`DUCKDB_EXTENSION_CACHE`, by default
 * `node_modules/.cache/duckdb-extensions`). Every other host is aborted and
 * recorded, so the page never reaches jsDelivr or `extensions.duckdb.org`.
 *
 * `context.route` sees every request the nested workers make: the library's
 * module worker, DuckDB's `blob:` worker importing its script and fetching
 * its `.wasm`, and the synchronous XHR that loads an extension. It does not
 * see the requests of the `coi` bundle's pthread workers, so the `coi`
 * bundle, which only a cross-origin-isolated page selects, is not covered.
 *
 * The policy goes on every response. The negative control, the same policy
 * without `'wasm-unsafe-eval'`, shows that it reached DuckDB's worker, which
 * compiles the `.wasm`. Three more tests show which response that takes:
 * the library's worker gets the policy its script arrives with, not the
 * page's; DuckDB's `blob:` worker inherits the library worker's; and a
 * library worker started from a `blob:` URL takes the page's. The rest cover
 * what fails, and how fast and how clearly it says so, and the guide's two
 * ways of serving the library's worker script yourself.
 *
 * The last tests run docs/integrations/cdn.md's page under its policy, both
 * read from the guide's fenced blocks, so they fail when the guide drifts.
 * The CDNs it names come from disk: the library from `dist/`, DuckDB-WASM
 * and the esm.sh builds of CodeMirror from `node_modules`, the extensions
 * from the mirror's cache.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const DUCKDB_DIST = path.join(ROOT, 'node_modules/@duckdb/duckdb-wasm/dist');
const FIXTURES = path.join(ROOT, 'tests/fixtures/datasets');
const EXTENSION_CACHE =
  process.env['DUCKDB_EXTENSION_CACHE'] ?? path.join(ROOT, 'node_modules/.cache/duckdb-extensions');

const ORIGIN = 'https://app.test';
const EXTENSION_REPOSITORY = 'https://extensions.duckdb.org';

/** The guide's policy, as one directive per entry. */
const POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "style-src 'self'",
];

/** `POLICY` with `directive` replaced, as a header value. */
function policy(replace?: Record<string, string>): string {
  return POLICY.map((entry) => {
    const name = entry.split(' ')[0]!;
    return replace?.[name] ?? entry;
  }).join('; ');
}

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Self-hosted data table</title>
    <script src="/violations.js"></script>
    <link rel="stylesheet" href="/dist/data-table.css" />
    <link rel="stylesheet" href="/app.css" />
    <script type="module" src="/app.js"></script>
  </head>
  <body>
    <main>
      <div id="table"></div>
      <div id="inline-sized" style="height: 300px"></div>
    </main>
  </body>
</html>
`;

/** Runs before the body is parsed, to hear of the inline style it blocks. */
const VIOLATIONS_JS = `window.__violations = [];
document.addEventListener('securitypolicyviolation', (event) => {
  window.__violations.push(event.effectiveDirective + ' ' + event.blockedURI);
});
`;

const APP_JS = `import * as dataTable from '/dist/data-table.js';
window.__dataTable = dataTable;
`;

/** The container's height comes from a stylesheet: the policy strips a style attribute. */
const APP_CSS = `#table { height: 400px; }
`;

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.csv': 'text/csv',
  '.parquet': 'application/vnd.apache.parquet',
};

/** The type a path is served as. */
const typeOf = (pathname: string): string | undefined =>
  pathname === '/' ? 'text/html' : TYPES[path.extname(pathname)];

const BUILT = existsSync(path.join(DIST, 'data-table.js'));

/** Where the page serves its own copy of the library's worker script. */
const WORKER_COPY = '/static/data-table-worker.js';

/** The file name of the built worker script, `worker-<hash>.js`. */
function builtWorker(): string {
  const [name] = readdirSync(path.join(DIST, 'assets')).filter((file) =>
    /^worker-[\w-]+\.js$/.test(file),
  );
  if (!name) throw new Error('dist/assets has no worker-*.js: run `npm run build`');
  return name;
}
const CI = !['', 'false', '0'].includes(process.env['CI'] ?? '');

/** What the page asked of each host. */
interface Traffic {
  /** Paths requested of `https://app.test`, in order. */
  served: string[];
  /** Every request to another host, aborted. */
  foreign: string[];
  /** Requests the harness could not answer, aborted: an extension it could not fetch, say. */
  failed: string[];
}

/** `relative` under `dir`, or null when it would leave it. */
function under(dir: string, relative: string): string | null {
  const file = path.resolve(dir, relative);
  return file.startsWith(dir + path.sep) ? file : null;
}

/**
 * An extension from the mirror, `/duckdb-ext/<version>/<platform>/<name>
 * .duckdb_extension.wasm`, the layout DuckDB requests: from the cache, or
 * fetched once from DuckDB's repository into it.
 */
async function mirrored(route: Route, pathname: string): Promise<Buffer | null> {
  const match = /^\/duckdb-ext\/(v[\d.]+\/wasm_\w+\/\w+\.duckdb_extension\.wasm)$/.exec(pathname);
  if (!match) return null;
  const file = path.join(EXTENSION_CACHE, match[1]!);
  if (existsSync(file)) return readFile(file);
  const url = `${EXTENSION_REPOSITORY}/${match[1]}`;
  const upstream = await route.fetch({ url, timeout: 30_000 }).catch((error: Error) => {
    throw new Error(`could not fetch ${url} for the extension mirror: ${error.message}`);
  });
  if (upstream.status() !== 200) {
    throw new Error(`${url} answered ${upstream.status()}, so the extension mirror lacks it`);
  }
  const body = await upstream.body();
  await mkdir(path.dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.part`;
  await writeFile(partial, body);
  await rename(partial, file);
  return body;
}

/** The file for a path of `https://app.test`, or null. */
async function fileFor(route: Route, pathname: string): Promise<Buffer | string | null> {
  if (pathname === '/') return PAGE;
  if (pathname === WORKER_COPY) return readFile(path.join(DIST, 'assets', builtWorker()));
  if (pathname === '/violations.js') return VIOLATIONS_JS;
  if (pathname === '/app.js') return APP_JS;
  if (pathname === '/app.css') return APP_CSS;
  if (pathname.startsWith('/duckdb-ext/')) return mirrored(route, pathname);
  const roots: [string, string][] = [
    ['/dist/', DIST],
    ['/duckdb/', DUCKDB_DIST],
    ['/fixtures/', FIXTURES],
  ];
  for (const [prefix, dir] of roots) {
    if (!pathname.startsWith(prefix)) continue;
    const file = under(dir, decodeURIComponent(pathname.slice(prefix.length)));
    return file && existsSync(file) ? readFile(file) : null;
  }
  return null;
}

/**
 * Serve `https://app.test` from disk, each response with the policy
 * `policyFor` returns for its path, or none for `null`, and the type
 * `typeFor` returns, and abort every other host.
 */
async function serve(
  context: BrowserContext,
  policyFor: (pathname: string) => string | null,
  typeFor: (pathname: string) => string | undefined = typeOf,
): Promise<Traffic> {
  const traffic: Traffic = { served: [], foreign: [], failed: [] };
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      traffic.foreign.push(url.href);
      await route.abort('blockedbyclient');
      return;
    }
    traffic.served.push(url.pathname);
    try {
      const body = await fileFor(route, url.pathname);
      const type = typeFor(url.pathname);
      const csp = policyFor(url.pathname);
      await route.fulfill({
        status: body === null ? 404 : 200,
        body: body ?? 'Not found',
        headers: {
          'content-type': body === null ? 'text/plain' : (type ?? 'application/octet-stream'),
          ...(csp === null ? {} : { 'content-security-policy': csp }),
        },
      });
    } catch (error) {
      // Answered, so that DuckDB's synchronous XHR does not wait out the test.
      traffic.failed.push(`${url.pathname}: ${(error as Error).message}`);
      await route.abort('failed');
    }
  });
  return traffic;
}

/** Every console message and uncaught error of the page and its workers. */
function listen(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => messages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  return messages;
}

/**
 * Run `run`, a step in the page, and fail with the harness's own failures
 * first: when the extension mirror cannot be filled, the page only sees a
 * load fail.
 */
async function step<T>(traffic: Traffic, run: () => Promise<T>): Promise<T> {
  const check = () =>
    expect(traffic.failed, 'the harness could not answer these requests').toEqual([]);
  let result: T;
  try {
    result = await run();
  } catch (error) {
    check();
    throw error;
  }
  check();
  return result;
}

/** Open the page and wait for its module script to load the library. */
async function open(page: Page): Promise<void> {
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => '__dataTable' in window);
}

type Library = typeof import('../../src/index');

/** What `startBridge` saw of `initialize()`. */
interface Start {
  ok: boolean;
  ms: number;
  /**
   * The error's class, by `instanceof`: a built class's `name` is whatever
   * the bundler called it.
   */
  error?: string;
  code?: string;
  message?: string;
}

/**
 * Initialize a `WorkerBridge` in the page with root-relative bundle URLs
 * under `/duckdb/`, `mainWorker` and `mainModule` as given, and with
 * `urlObject`, the `eh` bundle's `mainModule` as a `URL` object.
 */
async function startBridge(
  page: Page,
  options: {
    mainWorker?: string;
    mainModule?: string;
    initializeTimeoutMs?: number;
    urlObject?: boolean;
    /** The library's worker from `WORKER_COPY`: its URL, or its text in a `blob:` URL. */
    worker?: { copy: string; as: 'workerUrl' | 'workerFactory' };
    /** Pass the `mvp` bundle alone, as for a browser without WebAssembly exceptions. */
    mvpOnly?: boolean;
  } = {},
): Promise<Start> {
  return page.evaluate(
    async ({ mainWorker, mainModule, initializeTimeoutMs, urlObject, worker, mvpOnly }) => {
      const library = (window as unknown as { __dataTable: Library }).__dataTable;
      // The guide's workerFactory: the text first, since the factory runs synchronously.
      const code =
        worker?.as === 'workerFactory' ? await fetch(worker.copy).then((r) => r.text()) : '';
      const bridge = new library.WorkerBridge({
        ...(worker?.as === 'workerUrl' ? { workerUrl: worker.copy } : {}),
        ...(worker?.as === 'workerFactory'
          ? {
              workerFactory: () =>
                new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), {
                  type: 'module',
                }),
            }
          : {}),
        initializeTimeoutMs,
        duckdbBundles: {
          mvp: {
            mainModule: mainModule ?? '/duckdb/duckdb-mvp.wasm',
            mainWorker: mainWorker ?? '/duckdb/duckdb-browser-mvp.worker.js',
          },
          ...(mvpOnly
            ? {}
            : {
                eh: {
                  mainModule: urlObject
                    ? new URL('/duckdb/duckdb-eh.wasm', document.baseURI)
                    : (mainModule ?? '/duckdb/duckdb-eh.wasm'),
                  mainWorker: mainWorker ?? '/duckdb/duckdb-browser-eh.worker.js',
                },
              }),
        },
      });
      (window as unknown as { __bridge: unknown }).__bridge = bridge;
      const started = performance.now();
      try {
        await bridge.initialize();
        return { ok: true, ms: performance.now() - started };
      } catch (error) {
        const { code, message } = error as { code: string; message: string };
        const kind =
          error instanceof library.WorkerInitError
            ? 'WorkerInitError'
            : error instanceof library.ConfigurationError
              ? 'ConfigurationError'
              : `${(error as Error).name} (not a DataTableError)`;
        return { ok: false, ms: performance.now() - started, error: kind, code, message };
      }
    },
    options,
  );
}

test.skip(!BUILT && !CI, 'dist/ is not built: run `npm run build` first');

test.beforeAll(() => {
  if (!BUILT) throw new Error('dist/ is missing: run `npm run build` first');
});

/** What the page keeps on `window` from one step of a test to the next. */
type InPage = {
  __dataTable: Library;
  __bridge: import('../../src/index').WorkerBridge;
  __table: import('../../src/index').DataTable;
  __violations: string[];
};

test('loads CSV, Parquet and nested values with every file from the page origin', async ({
  context,
  page,
}) => {
  const traffic = await serve(context, () => policy());
  const messages = listen(page);
  await open(page);

  // The policy stripped the inline style; the stylesheet sized the container.
  expect(await page.locator('#inline-sized').evaluate((el) => el.clientHeight)).toBe(0);
  expect(await page.locator('#table').evaluate((el) => el.clientHeight)).toBe(400);

  expect(await startBridge(page, { urlObject: true })).toEqual({
    ok: true,
    ms: expect.any(Number),
  });
  const { version, platform } = await page.evaluate(async () => {
    const w = window as unknown as InPage;
    const [versionRow] = await w.__bridge.query<{ library_version: string }>('PRAGMA version');
    const [platformRow] = await w.__bridge.query<{ platform: string }>('PRAGMA platform');
    w.__table = await w.__dataTable.createDataTable({
      container: document.getElementById('table')!,
      bridge: w.__bridge,
    });
    return { version: versionRow!.library_version, platform: platformRow!.platform };
  });
  const mirror = (name: string) =>
    `/duckdb-ext/${version}/${platform}/${name}.duckdb_extension.wasm`;

  // DuckDB's worker, which loads extensions, cannot resolve a relative
  // repository URL. A CSV load needs ICU, for its time zone, and fails.
  const relative = await page.evaluate(async () => {
    const w = window as unknown as InPage;
    await w.__bridge.query("SET custom_extension_repository = '/duckdb-ext'");
    return w.__table.loadData('/fixtures/csv/titanic.csv').then(
      () => 'loaded',
      (error: { code?: string; message?: string }) => ({
        code: error.code,
        message: error.message,
      }),
    );
  });
  expect(relative).toEqual({
    code: 'LOAD_PARSE_FAILED',
    message: expect.stringMatching(/Invalid URL/),
  });

  // An absolute one, from the page's own URL, serves ICU from the mirror.
  const csv = await step(traffic, () =>
    page.evaluate(async () => {
      const w = window as unknown as InPage;
      const repository = new URL('/duckdb-ext', document.baseURI).href;
      await w.__bridge.query(`SET custom_extension_repository = '${repository}'`);
      await w.__table.loadData('/fixtures/csv/titanic.csv');
      return w.__table.state.totalRows.get();
    }),
  );
  expect(csv).toBe(891);
  expect(traffic.served).toContain(mirror('icu'));
  expect(traffic.served).not.toContain(mirror('parquet'));

  // Parquet, with a JSON column, needs parquet and json; so do exact reads.
  const parquet = await step(traffic, () =>
    page.evaluate(async () => {
      const w = window as unknown as InPage;
      await w.__table.loadData('/fixtures/parquet/nested-stress-tests.parquet');
      return {
        rows: w.__table.state.totalRows.get(),
        point: await w.__table.actions.getCellValue(10, 'point'),
        tags: await w.__table.actions.getCellValue(10, 'tags'),
        renderedRows: document.querySelectorAll('#table [role="row"]').length,
        violations: w.__violations,
      };
    }),
  );
  expect(parquet.rows).toBe(1000);
  expect(parquet.point).toEqual({ x: 1.5, y: -0.5, tier: 'gold' });
  expect(parquet.tags).toEqual(['red', 'green', 'blue']);
  // The bounded container keeps the grid virtualized: 1,000 rows, a few in the DOM.
  expect(parquet.renderedRows).toBeGreaterThan(0);
  expect(parquet.renderedRows).toBeLessThan(60);

  // DuckDB came from the page's origin, and so did the three extensions the
  // library needs, under PRAGMA version and PRAGMA platform.
  expect(traffic.served).toEqual(
    expect.arrayContaining([
      '/duckdb/duckdb-browser-eh.worker.js',
      '/duckdb/duckdb-eh.wasm',
      ...['icu', 'parquet', 'json'].map(mirror),
    ]),
  );
  expect(traffic.foreign).toEqual([]);
  expect(messages.filter((m) => /jsdelivr|extensions\.duckdb\.org/i.test(m))).toEqual([]);

  // The one violation is the inline style; no worker reported one.
  expect(parquet.violations).toEqual(['style-src-attr inline']);
  expect(
    messages.filter((m) => /Content Security Policy/i.test(m) && !/inline style/i.test(m)),
  ).toEqual([]);
});

test("without a mirror, a CSV load fails on ICU from DuckDB's repository", async ({
  context,
  page,
}) => {
  const traffic = await serve(context, () => policy());
  await open(page);
  expect(await startBridge(page)).toEqual({ ok: true, ms: expect.any(Number) });

  const load = await page.evaluate(async () => {
    const w = window as unknown as InPage;
    w.__table = await w.__dataTable.createDataTable({
      container: document.getElementById('table')!,
      bridge: w.__bridge,
    });
    return w.__table.loadData('/fixtures/csv/titanic.csv').then(
      () => 'loaded',
      (error: { code?: string; message?: string }) => ({
        code: error.code,
        message: error.message,
      }),
    );
  });

  // connect-src stops the request in the browser: it never reaches the network.
  expect(load).toEqual({
    code: 'LOAD_PARSE_FAILED',
    message: expect.stringMatching(
      /https:\/\/extensions\.duckdb\.org\/v[\d.]+\/wasm_\w+\/icu\.duckdb_extension\.wasm/,
    ),
  });
  expect(traffic.foreign).toEqual([]);
});

test('the mvp bundle runs too, with its extensions under its own platform', async ({
  context,
  page,
}) => {
  const traffic = await serve(context, () => policy());
  await open(page);
  expect(await startBridge(page, { mvpOnly: true })).toEqual({ ok: true, ms: expect.any(Number) });

  const result = await step(traffic, () =>
    page.evaluate(async () => {
      const w = window as unknown as InPage;
      const [platformRow] = await w.__bridge.query<{ platform: string }>('PRAGMA platform');
      const repository = new URL('/duckdb-ext', document.baseURI).href;
      await w.__bridge.query(`SET custom_extension_repository = '${repository}'`);
      w.__table = await w.__dataTable.createDataTable({
        container: document.getElementById('table')!,
        bridge: w.__bridge,
      });
      await w.__table.loadData('/fixtures/csv/titanic.csv');
      return { platform: platformRow!.platform, rows: w.__table.state.totalRows.get() };
    }),
  );

  expect(result).toEqual({ platform: 'wasm_mvp', rows: 891 });
  expect(traffic.served).toEqual(
    expect.arrayContaining([
      '/duckdb/duckdb-browser-mvp.worker.js',
      '/duckdb/duckdb-mvp.wasm',
      expect.stringMatching(/^\/duckdb-ext\/v[\d.]+\/wasm_mvp\/icu\.duckdb_extension\.wasm$/),
    ]),
  );
  expect(traffic.foreign).toEqual([]);
});

/** The negative control's policy: the guide's, without `'wasm-unsafe-eval'`. */
const NO_WASM = policy({ 'script-src': "script-src 'self'" });

/** Whether a console message says the policy blocked compiling a WebAssembly module. */
const blockedWasm = (messages: string[]): boolean =>
  messages.some((m) => /WebAssembly/.test(m) && /Content Security Policy/.test(m));

test("without 'wasm-unsafe-eval', DuckDB's worker cannot compile its module", async ({
  context,
  page,
}) => {
  const traffic = await serve(context, () => NO_WASM);
  const messages = listen(page);
  await open(page);

  const start = await startBridge(page, { initializeTimeoutMs: 5_000 });

  // duckdb-wasm swallows the compile error: the bridge's timeout reports it.
  expect(start).toMatchObject({ ok: false, error: 'WorkerInitError', code: 'WORKER_INIT_TIMEOUT' });
  expect(traffic.served).toContain('/duckdb/duckdb-eh.wasm');
  expect(blockedWasm(messages), messages.join('\n')).toBe(true);
  expect(traffic.foreign).toEqual([]);
});

test('a policy sent only with the page does not reach the workers', async ({ context, page }) => {
  // The negative control's policy on the page alone: DuckDB compiles its
  // module all the same.
  await serve(context, (pathname) => (pathname === '/' ? NO_WASM : null));
  await open(page);

  expect(await startBridge(page)).toEqual({ ok: true, ms: expect.any(Number) });
});

test("DuckDB's worker takes the policy sent with the library's worker script", async ({
  context,
  page,
}) => {
  // The negative control's policy on the library's worker script alone:
  // DuckDB's blob: worker inherits it, and cannot compile its module.
  await serve(context, (pathname) =>
    /^\/dist\/assets\/worker-[\w-]+\.js$/.test(pathname) ? NO_WASM : null,
  );
  const messages = listen(page);
  await open(page);

  const start = await startBridge(page, { initializeTimeoutMs: 5_000 });

  expect(start).toMatchObject({ ok: false, error: 'WorkerInitError', code: 'WORKER_INIT_TIMEOUT' });
  expect(blockedWasm(messages), messages.join('\n')).toBe(true);
});

test("a library worker started from a blob: URL takes the page's policy", async ({
  context,
  page,
}) => {
  // The negative control's policy on the page alone: the workerFactory
  // recipe's blob: worker inherits it, and passes it on to DuckDB's worker.
  await serve(context, (pathname) => (pathname === '/' ? NO_WASM : null));
  const messages = listen(page);
  await open(page);

  const start = await startBridge(page, {
    worker: { copy: WORKER_COPY, as: 'workerFactory' },
    initializeTimeoutMs: 5_000,
  });

  expect(start).toMatchObject({ ok: false, error: 'WorkerInitError', code: 'WORKER_INIT_TIMEOUT' });
  expect(blockedWasm(messages), messages.join('\n')).toBe(true);
});

/**
 * Ways a `.wasm` file fails to load or compile, each under the guide's
 * policy but for the one difference. duckdb-wasm leaves the rejection of
 * `WebAssembly.instantiateStreaming` unhandled, so DuckDB never starts and
 * the bridge's timeout is all that reports it; the console says why.
 */
const WASM_FAILURES: {
  name: string;
  mainModule: string;
  typeFor?: (pathname: string) => string | undefined;
  console?: RegExp;
}[] = [
  { name: 'a 404', mainModule: '/duckdb/missing.wasm', console: /HTTP status code is not ok/ },
  {
    name: 'a type other than application/wasm',
    mainModule: '/duckdb/duckdb-eh.wasm',
    typeFor: (pathname) => (pathname.endsWith('.wasm') ? 'application/octet-stream' : undefined),
    console: /Incorrect response MIME type/,
  },
  // connect-src stops the fetch in the browser: it never reaches the network.
  {
    name: 'an origin connect-src leaves out',
    mainModule: 'https://cdn.example.test/duckdb-eh.wasm',
    console: /Failed to fetch/,
  },
];

for (const failure of WASM_FAILURES) {
  test(`a .wasm with ${failure.name} leaves DuckDB waiting until the timeout`, async ({
    context,
    page,
  }) => {
    const traffic = await serve(
      context,
      () => policy(),
      (pathname) => failure.typeFor?.(pathname) ?? typeOf(pathname),
    );
    const messages = listen(page);
    await open(page);

    const start = await startBridge(page, {
      mainModule: failure.mainModule,
      initializeTimeoutMs: 3_000,
    });

    expect(start).toMatchObject({
      ok: false,
      error: 'WorkerInitError',
      code: 'WORKER_INIT_TIMEOUT',
    });
    if (failure.console) {
      expect(
        messages.some((m) => failure.console!.test(m)),
        messages.join('\n'),
      ).toBe(true);
    }
    expect(traffic.foreign).toEqual([]);
  });
}

/** A `mainWorker` DuckDB's worker cannot import: its error event rejects init at once. */
const MAIN_WORKER_FAILURES = [
  {
    name: 'a 404',
    url: '/duckdb/missing.worker.js',
    named: 'https://app.test/duckdb/missing.worker.js',
  },
  {
    name: 'an origin script-src leaves out',
    url: 'https://cdn.example.test/duckdb-browser-eh.worker.js',
    named: 'https://cdn.example.test/duckdb-browser-eh.worker.js',
  },
];

for (const failure of MAIN_WORKER_FAILURES) {
  test(`a mainWorker with ${failure.name} rejects at once, naming it`, async ({
    context,
    page,
  }) => {
    const traffic = await serve(context, () => policy());
    await open(page);

    const start = await startBridge(page, { mainWorker: failure.url });

    expect(start).toMatchObject({ ok: false, error: 'WorkerInitError', code: 'WORKER_CRASHED' });
    expect(start.ms).toBeLessThan(5_000);
    expect(start.message).toContain(failure.named);
    expect(traffic.foreign).toEqual([]);
  });
}

test("a worker-src without blob: rejects at once, saying DuckDB's worker needs it", async ({
  context,
  page,
}) => {
  await serve(context, () => policy({ 'worker-src': "worker-src 'self'" }));
  await open(page);

  const start = await startBridge(page, { initializeTimeoutMs: 10_000 });

  expect(start).toMatchObject({ ok: false, error: 'WorkerInitError', code: 'WORKER_CRASHED' });
  expect(start.ms).toBeLessThan(5_000);
  expect(start.message).toMatch(/blob:.*worker-src/);
});

test("a policy that blocks the library's worker names workerFactory and CSP", async ({
  context,
  page,
}) => {
  await serve(context, () => policy({ 'worker-src': 'worker-src blob:' }));
  await open(page);

  const start = await startBridge(page, { initializeTimeoutMs: 10_000 });

  expect(start).toMatchObject({ ok: false, error: 'WorkerInitError', code: 'WORKER_CRASHED' });
  expect(start.ms).toBeLessThan(5_000);
  expect(start.message).toMatch(/Content Security Policy/);
  expect(start.message).toMatch(/workerFactory/);
});

for (const as of ['workerUrl', 'workerFactory'] as const) {
  test(`a copy of the library's worker script runs from bridgeOptions.${as}`, async ({
    context,
    page,
  }) => {
    // The built worker imports nothing, so a copy of it runs on its own: at a
    // URL of the page's, or as text in a blob: URL, which takes the page's policy.
    const traffic = await serve(context, () => policy());
    await open(page);

    expect(await startBridge(page, { worker: { copy: WORKER_COPY, as } })).toEqual({
      ok: true,
      ms: expect.any(Number),
    });
    const rows = await page.evaluate(() =>
      (window as unknown as InPage).__bridge.query('SELECT 42 AS answer'),
    );

    expect(rows).toEqual([{ answer: 42 }]);
    expect(traffic.served).toContain(WORKER_COPY);
    expect(traffic.served.filter((p) => p.startsWith('/dist/assets/'))).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// The CDN page of docs/integrations/cdn.md
// ---------------------------------------------------------------------------

const CDN_GUIDE = path.join(ROOT, 'docs/integrations/cdn.md');

/** The guide's page and its policy header's value, verbatim from its fenced blocks. */
async function cdnGuide(): Promise<{ page: string; policy: string }> {
  const markdown = await readFile(CDN_GUIDE, 'utf8');
  const page = /^```html\n(<!doctype html>\n[\s\S]*?)^```$/m.exec(markdown)?.[1];
  const header = /^```http\nContent-Security-Policy:([\s\S]*?)^```$/m.exec(markdown)?.[1];
  if (!page || !header) throw new Error('docs/integrations/cdn.md has lost its page or its policy');
  // Shown on several lines, sent as one.
  return { page, policy: header.replace(/\s+/g, ' ').trim() };
}

/** The text of the page's inline `<script type="…">`, which a hash covers. */
function inlineScript(page: string, type: 'importmap' | 'module'): string {
  const text = new RegExp(`<script type="${type}">([\\s\\S]*?)</script>`).exec(page)?.[1];
  if (text === undefined) throw new Error(`the guide's page has no inline ${type} script`);
  return text;
}

/** The page's import map. */
const importsOf = (page: string): Record<string, string> =>
  (JSON.parse(inlineScript(page, 'importmap')) as { imports: Record<string, string> }).imports;

/** A policy's source for an inline script's text. */
const hashOf = (text: string): string =>
  `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/** Where the guide's policy leaves the module script's hash, which depends on `source`. */
const MODULE_HASH = "'sha256-<hash of the module script>'";

/** The module script's `source`, the one value the guide leaves to the reader. */
function sourceOf(page: string): string {
  const source = /source: '([^']+)'/.exec(page)?.[1];
  if (!source) throw new Error("the guide's module script has no source: '…'");
  return source;
}

/** A package's version and module entry, as installed in node_modules. */
async function installed(name: string): Promise<{ version: string; entry: string | null }> {
  const dir = path.join(ROOT, 'node_modules', name);
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as {
    version: string;
    exports?: { import?: unknown; '.'?: { import?: unknown } };
    module?: unknown;
  };
  const entry = pkg.exports?.import ?? pkg.exports?.['.']?.import ?? pkg.module;
  return { version: pkg.version, entry: typeof entry === 'string' ? path.join(dir, entry) : null };
}

/** What the CDN page took from the CDNs, and the violations it reported. */
interface Cdn {
  /** The CDN URLs answered from disk, in order. */
  served: string[];
  /** Each violation the page or a worker reported, as `<directive> <blocked URI>`. */
  violations: string[];
}

/**
 * Serve `html`, the guide's CDN page, at `https://app.test/` under `policy`,
 * with violations reported to `/csp-report`, and answer the CDNs it names
 * from disk, for any origin, as a CDN does:
 *
 * - the library, under its import map's URL, from `dist/`, and the worker URL
 *   the page names from the built worker, whatever the guide calls it;
 * - DuckDB-WASM's files, from `node_modules`, at the installed version only;
 * - each esm.sh `*` build the import map pins, from the package's own module
 *   file in `node_modules`, at the installed version only: like the `*`
 *   build, it leaves its imports bare, for the map;
 * - DuckDB's extensions, from the mirror (`mirrored`).
 *
 * `serve`, run first, answers the rest: the fixtures, and every other host,
 * aborted and recorded in `traffic.foreign`, as is a CDN URL the page should
 * not ask for.
 */
async function serveCdnPage(
  context: BrowserContext,
  traffic: Traffic,
  html: string,
  policy: string,
): Promise<Cdn> {
  const cdn: Cdn = { served: [], violations: [] };
  const library = new URL('.', importsOf(html)['@jeyabbalas/data-table']).href;
  const workerUrl = /const WORKER_URL =\s*'([^']+)'/.exec(html)?.[1];
  if (!workerUrl?.startsWith(`${library}assets/worker-`)) {
    throw new Error(`the guide's worker URL is not the library's worker: ${String(workerUrl)}`);
  }
  const { version: duckdbVersion } = await installed('@duckdb/duckdb-wasm');
  const duckdb = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${duckdbVersion}/dist/`;

  /** Answer from disk, or record the request and abort it. */
  async function answer(route: Route, file: () => Promise<string | Buffer | null>, type?: string) {
    const url = route.request().url();
    try {
      const body = await file();
      if (body === null) {
        traffic.foreign.push(url);
        await route.abort('blockedbyclient');
        return;
      }
      cdn.served.push(url);
      await route.fulfill({
        body,
        headers: {
          'content-type': type ?? 'application/octet-stream',
          'access-control-allow-origin': '*',
        },
      });
    } catch (error) {
      traffic.failed.push(`${url}: ${(error as Error).message}`);
      await route.abort('failed');
    }
  }

  await context.route(`${ORIGIN}/`, (route) =>
    route.fulfill({
      body: html,
      headers: {
        'content-type': 'text/html',
        'content-security-policy': `${policy}; report-uri ${ORIGIN}/csp-report`,
      },
    }),
  );
  await context.route(`${ORIGIN}/csp-report`, async (route) => {
    const report = (
      JSON.parse(route.request().postData() ?? '{}') as {
        'csp-report'?: Record<string, string>;
      }
    )['csp-report'];
    cdn.violations.push(
      `${report?.['effective-directive'] ?? report?.['violated-directive']} ${report?.['blocked-uri']}`,
    );
    await route.fulfill({ status: 204 });
  });

  await context.route('https://cdn.jsdelivr.net/**', (route) => {
    const url = route.request().url();
    const file =
      url === workerUrl
        ? path.join(DIST, 'assets', builtWorker())
        : url.startsWith(library)
          ? under(DIST, decodeURIComponent(url.slice(library.length)))
          : url.startsWith(duckdb)
            ? under(DUCKDB_DIST, decodeURIComponent(url.slice(duckdb.length)))
            : null;
    return answer(
      route,
      async () => (file && existsSync(file) ? readFile(file) : null),
      file ? TYPES[path.extname(file)] : undefined,
    );
  });

  await context.route('https://esm.sh/**', (route) =>
    answer(
      route,
      async () => {
        const url = route.request().url();
        const pin = /^https:\/\/esm\.sh\/\*((?:@[^/]+\/)?[^/@]+)@([^/?#]+)$/.exec(url);
        if (!pin) return null;
        const { version, entry } = await installed(pin[1]!);
        if (version !== pin[2] || !entry) {
          throw new Error(`the import map pins ${pin[1]}@${pin[2]}, node_modules has ${version}`);
        }
        return readFile(entry);
      },
      'text/javascript',
    ),
  );

  await context.route('https://extensions.duckdb.org/**', (route) =>
    answer(
      route,
      () => mirrored(route, `/duckdb-ext${new URL(route.request().url()).pathname}`),
      'application/wasm',
    ),
  );
  return cdn;
}

/** An extension's URL on DuckDB's repository, for any version and platform. */
const extension = (name: string) =>
  expect.stringMatching(
    new RegExp(
      `^https://extensions\\.duckdb\\.org/v[\\d.]+/wasm_\\w+/${name}\\.duckdb_extension\\.wasm$`,
    ),
  );

/**
 * Fail on any violation the page or its workers reported: the recorder must
 * hear the one the test causes, a style attribute, which the policy refuses,
 * and only that.
 */
async function expectNoViolations(page: Page, cdn: Cdn): Promise<void> {
  await page.evaluate(() => document.body.setAttribute('style', 'outline: none'));
  await expect.poll(() => cdn.violations).toEqual(['style-src-attr inline']);
}

test("the CDN guide's page runs as the guide gives it, under the guide's policy", async ({
  context,
  page,
}) => {
  const guide = await cdnGuide();
  // The policy names the import map by the hash of its text as printed.
  expect(guide.policy).toContain(hashOf(inlineScript(guide.page, 'importmap')));
  // The module script's depends on `source`: the reader works it out, as here.
  expect(guide.policy).toContain(MODULE_HASH);
  const policy = guide.policy.replace(MODULE_HASH, hashOf(inlineScript(guide.page, 'module')));

  const traffic = await serve(context, () => null);
  const cdn = await serveCdnPage(context, traffic, guide.page, policy);
  // The reader's data, at the page's own `source`: the test's CSV.
  await context.route(`${ORIGIN}${sourceOf(guide.page)}`, async (route) =>
    route.fulfill({
      body: await readFile(path.join(FIXTURES, 'csv/titanic.csv')),
      headers: { 'content-type': 'text/csv' },
    }),
  );

  await step(traffic, async () => {
    await page.goto(`${ORIGIN}/`);
    await expect(page.getByText('Braund, Mr. Owen Harris').first()).toBeVisible({
      timeout: 60_000,
    });
  });
  // The stylesheet bounds the container: a few rows in the DOM, not 891.
  const rendered = await page.locator('#table [role="row"]').count();
  expect(rendered).toBeGreaterThan(1);
  expect(rendered).toBeLessThan(60);

  // The SQL filter editor, CodeMirror through the import map.
  await page.locator('.dt-filter-expression-btn').click();
  const sqlDialog = page.locator('.dt-sql-filter-modal-backdrop--open');
  await sqlDialog.locator('.cm-content').click();
  await page.keyboard.type('"Age" > 60');
  await expect(sqlDialog.locator('.cm-content')).toHaveText('"Age" > 60');
  await sqlDialog.locator('.dt-sql-filter-modal-close').click();
  await expect(sqlDialog).toHaveCount(0);

  // The derived column's expression editor. Its autocomplete offers a column:
  // one copy of each CodeMirror package, as the map's `*` builds keep it.
  await page.locator('.dt-add-column-btn').click();
  const derivedDialog = page.locator('.dt-derived-modal-backdrop--open');
  await derivedDialog.locator('.cm-content').click();
  await page.keyboard.type('"Fare" * "Si');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('SibSp');
  await derivedDialog.locator('.dt-derived-modal-close').click();
  await expect(derivedDialog).toHaveCount(0);

  // Without the trampoline, the library's worker is another origin's script:
  // initialize() rejects at once, and says where to look.
  const unaided: { ok: boolean; error?: string; code?: string; message?: string } =
    await page.evaluate(async (url) => {
      const library = (await import(url)) as Library;
      const bridge = new library.WorkerBridge();
      try {
        await bridge.initialize();
        return { ok: true };
      } catch (error) {
        const { code, message } = error as { code: string; message: string };
        const kind =
          error instanceof library.WorkerInitError
            ? 'WorkerInitError'
            : `${(error as Error).name} (not a WorkerInitError)`;
        return { ok: false, error: kind, code, message };
      }
    }, importsOf(guide.page)['@jeyabbalas/data-table']!);
  expect(unaided).toMatchObject({ ok: false, error: 'WorkerInitError', code: 'WORKER_CRASHED' });
  expect(unaided.message).toMatch(/cannot be accessed from origin 'https:\/\/app\.test'/);
  expect(unaided.message).toMatch(/bridgeOptions\.workerFactory/);

  await expectNoViolations(page, cdn);
  expect(traffic.foreign).toEqual([]);
  expect(traffic.failed).toEqual([]);
  // What the page took from the CDNs: DuckDB, ICU for the load's time zone,
  // and each CodeMirror package the map pins, once.
  const pinned = Object.values(importsOf(guide.page)).filter((url) =>
    url.startsWith('https://esm.sh/'),
  );
  expect(cdn.served.filter((url) => url.startsWith('https://esm.sh/')).sort()).toEqual(
    pinned.sort(),
  );
  expect(cdn.served).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/\/duckdb-wasm@[^/]+\/dist\/duckdb-browser-eh\.worker\.js$/),
      expect.stringMatching(/\/duckdb-wasm@[^/]+\/dist\/duckdb-eh\.wasm$/),
      extension('icu'),
    ]),
  );
});

test("the CDN guide's page loads nested Parquet and inspects a value, under its policy", async ({
  context,
  page,
}) => {
  const guide = await cdnGuide();
  // The reader's one edit, `source`: here the nested Parquet fixture.
  const html = guide.page.replace(
    `source: '${sourceOf(guide.page)}'`,
    "source: '/fixtures/parquet/nested-stress-tests.parquet'",
  );
  expect(html).not.toBe(guide.page);
  const policy = guide.policy.replace(MODULE_HASH, hashOf(inlineScript(html, 'module')));

  const traffic = await serve(context, () => null);
  const cdn = await serveCdnPage(context, traffic, html, policy);

  await step(traffic, async () => {
    await page.goto(`${ORIGIN}/`);
    // The value inspector: two more of the library's lazy files, and json.
    await page.locator('.dt-cell--inspectable').first().dblclick({ timeout: 60_000 });
    await expect(page.getByRole('tree')).toBeVisible();
  });
  await page.keyboard.press('Escape');

  await expectNoViolations(page, cdn);
  expect(traffic.foreign).toEqual([]);
  expect(traffic.failed).toEqual([]);
  expect(traffic.served).toContain('/fixtures/parquet/nested-stress-tests.parquet');
  expect(cdn.served).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/\/ValueInspector-[\w-]+\.js$/),
      ...['icu', 'parquet', 'json'].map(extension),
    ]),
  );
});
