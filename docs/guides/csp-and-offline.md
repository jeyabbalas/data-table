# CSP and offline deployments

By default the library starts its worker from the script your bundler emits,
DuckDB-WASM loads its worker script and `.wasm` file from jsDelivr, and
DuckDB fetches the extensions it needs from `extensions.duckdb.org`. A page
behind a strict Content Security Policy (CSP), or one that cannot reach those
hosts, serves all of them from its own origin. This guide covers what to
serve, how to point the library at it, and the policy that lets it run.

The setup it describes runs in the library's browser test,
[`tests/browser/self-hosted-bundles.spec.ts`](../../tests/browser/self-hosted-bundles.spec.ts):
the built package, under the policy below, with every file from the page's
own origin. What the test does not cover, the guide marks as untested.

## You'll learn how to

- Serve DuckDB-WASM's files from your own origin
- Mirror the three DuckDB extensions the library loads
- Write a Content Security Policy that lets both workers run, and send it where they read it
- Serve the library's worker script yourself
- Tell the failures apart

## Prerequisites

- Read: [API reference — `bridgeOptions`, `WorkerBridgeOptions`](../api-reference.md#createdatatable)
- Helpful background: [MDN — Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

## The workers

DuckDB does not run in the library's worker but in one of its own, started
from inside it:

```
page (main thread)
└── the library's worker     a module worker: dist/assets/worker-*.js, which your
    │                        bundler emits (or bridgeOptions.workerUrl / workerFactory)
    └── DuckDB's worker      a classic worker the library starts from a blob: URL.
        │                    It runs importScripts(mainWorker), fetches mainModule,
        │                    and loads each extension with a synchronous XMLHttpRequest
        └── pthread workers  the coi bundle only, started from pthreadWorker
```

DuckDB-WASM ships three bundles, in `node_modules/@duckdb/duckdb-wasm/dist/`,
and picks one as it starts:

| Bundle | `mainWorker`                   | `mainModule`      | `pthreadWorker`                        | Picked when                                                                                             |
| ------ | ------------------------------ | ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `eh`   | `duckdb-browser-eh.worker.js`  | `duckdb-eh.wasm`  | —                                      | The browser has WebAssembly exceptions, as current browsers do.                                         |
| `mvp`  | `duckdb-browser-mvp.worker.js` | `duckdb-mvp.wasm` | —                                      | Otherwise. `mvp` is the one bundle `DuckDBBundles` requires.                                            |
| `coi`  | `duckdb-browser-coi.worker.js` | `duckdb-coi.wasm` | `duckdb-browser-coi.pthread.worker.js` | You pass it, and the page is cross-origin isolated, in a browser with WebAssembly threads and SIMD too. |

DuckDB's worker fetches these files, not the page or the library's worker,
and its `blob:` URL is no base for a relative URL. So `WorkerBridge`
resolves each `mainModule`, `mainWorker` and `pthreadWorker` against the
page's `document.baseURI` (a `<base href>` when it has one) when
`initialize()` starts, before any worker exists. Root-relative, relative
and absolute URLs all work, and so do `URL` objects. One that does not
resolve, or is not a string or a `URL`, rejects `initialize()` with a
`ConfigurationError` whose code is `OPTIONS_INVALID` and whose
`details.option` names it, such as `'duckdbBundles.eh.mainWorker'`.

## Serving DuckDB-WASM yourself

1. **Pin `@duckdb/duckdb-wasm` exactly.**

   ```sh
   npm install --save-exact @duckdb/duckdb-wasm@1.33.1-dev57.0
   ```

   `1.33.1-dev57.0` is the version whose runtime the library's worker
   bundles, and the one the library's tests run. Take every file from that
   one version: DuckDB's worker scripts and `.wasm` files are built
   together.

2. **Copy the `eh` and `mvp` files** to a directory your server serves,
   here `public/duckdb/`:

   ```sh
   mkdir -p public/duckdb
   for file in duckdb-browser-eh.worker.js duckdb-eh.wasm \
               duckdb-browser-mvp.worker.js duckdb-mvp.wasm; do
     cp "node_modules/@duckdb/duckdb-wasm/dist/$file" public/duckdb/
   done
   ```

   Serve the `.wasm` files as `application/wasm`: DuckDB compiles its module
   with `WebAssembly.instantiateStreaming`, which takes no other type. A
   browser downloads one of them, the bulk of the download: `duckdb-eh.wasm`
   is 35.9 MB, 8.1 MB gzipped and 5.5 MB as brotli, and `duckdb-mvp.wasm`
   41.3 MB, 9.2 MB and 6.2 MB. Serve them compressed, and cache them.

3. **Pass them** as `bridgeOptions.duckdbBundles`:

   ```ts
   import { createDataTable } from '@jeyabbalas/data-table';

   const duckdbBundles = {
     mvp: {
       mainModule: '/duckdb/duckdb-mvp.wasm',
       mainWorker: '/duckdb/duckdb-browser-mvp.worker.js',
     },
     eh: {
       mainModule: '/duckdb/duckdb-eh.wasm',
       mainWorker: '/duckdb/duckdb-browser-eh.worker.js',
     },
   };

   await createDataTable({ container, source, bridgeOptions: { duckdbBundles } });
   ```

A cross-origin-isolated page can also pass the `coi` bundle, whose threads
need `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`
headers. The library's tests do not run it, and its pthread workers go
without one of the library's fixes (see [Gotchas](#gotchas)).

## DuckDB's extensions

DuckDB-WASM fetches three extensions the library uses from DuckDB's
extension repository, `extensions.duckdb.org` unless told otherwise, the
first time a query needs each, not from the bundle:

- `icu`, on every load. A load sets DuckDB's time zone
  (`sourceOptions.timezone`, `UTC` by default), which needs ICU. Where ICU
  cannot load, every load fails, a CSV's too, with a `LoadError` whose code
  is `LOAD_PARSE_FAILED` and whose message is the browser's `XMLHttpRequest`
  error, such as `Failed to load
'https://extensions.duckdb.org/v1.5.4/wasm_eh/icu.duckdb_extension.wasm'`.
- `parquet`, for a Parquet source or export.
- `json`, for
  - a JSON source;
  - a Parquet source with a JSON column, or with JSON inside a list, array,
    struct, map or union, which loads it with the table, so cells and
    filters read the same from the first query;
  - exact reads of nested values: `actions.getCellValue`,
    `actions.getColumnValues` on a nested column, the value inspector, and
    CSV, JSON and clipboard exports of nested values;
  - extracting a value from JSON or VARIANT, whether a column of its own or
    inside a nested column.

Where `parquet` or `json` cannot load, what needs it fails with DuckDB's
error, and a Parquet source does not load at all. The one exception is the
Parquet loader's own load of `json`, which is best effort: the table loads,
and its JSON reads as plain text, with JSON inside a list or struct shown as
quoted strings (`[1, NULL, 'null']`).

To serve them yourself, mirror the repository's layout,
`<repository>/<version>/<platform>/<name>.duckdb_extension.wasm`. For the
`eh` bundle of `1.33.1-dev57.0` that is `v1.5.4/wasm_eh/`, as
`PRAGMA version` (its `library_version`) and `PRAGMA platform` report:
DuckDB asks for the directory of the version and the bundle it runs, so
mirror one for each bundle you serve. With `bridge` a started
`WorkerBridge`, as in the next example:

```ts
const [{ library_version }] = await bridge.query('PRAGMA version'); // 'v1.5.4'
const [{ platform }] = await bridge.query('PRAGMA platform'); // 'wasm_eh'
```

Then copy the files from DuckDB's repository:

```sh
for name in icu parquet json; do
  curl -fsSL --create-dirs -o "public/duckdb-ext/v1.5.4/wasm_eh/$name.duckdb_extension.wasm" \
    "https://extensions.duckdb.org/v1.5.4/wasm_eh/$name.duckdb_extension.wasm"
done
```

And point DuckDB at the mirror with an absolute URL, once the bridge is up
and before anything loads:

```ts
import { WorkerBridge, createDataTable } from '@jeyabbalas/data-table';

const bridge = new WorkerBridge({ duckdbBundles });
await bridge.initialize();
const repository = new URL('/duckdb-ext', document.baseURI).href;
await bridge.query(`SET custom_extension_repository = '${repository}'`);

const table = await createDataTable({ container, source: '/data/trips.csv', bridge });

// Later: a bridge you create is yours to terminate, after its tables.
await table.destroy();
bridge.terminate();
```

Absolute, because DuckDB's worker fetches the extensions from its `blob:`
URL: with a relative repository URL, the next load fails with
`LOAD_PARSE_FAILED` and the message `Failed to execute 'open' on
'XMLHttpRequest': Invalid URL`.

## The Content Security Policy

One policy, sent with every response:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; style-src 'self'
```

| Directive                              | Why                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-src 'self' 'wasm-unsafe-eval'` | The library's modules, and DuckDB's `mainWorker`, which its worker imports. `'wasm-unsafe-eval'` lets DuckDB's worker compile its `.wasm`: without it, DuckDB never starts. No `'unsafe-eval'`: `icu`, `parquet` and `json` load without it. DuckDB-WASM runs any JavaScript an extension carries with `eval`, so an extension you load yourself may need it. |
| `worker-src 'self' blob:`              | `'self'` for the library's worker script, `blob:` for DuckDB's worker, which the library starts from a `blob:` URL.                                                                                                                                                                                                                                           |
| `connect-src 'self'`                   | DuckDB's worker fetches its `.wasm` and the extensions, and the library a URL source. Add any other origin you load data or these files from.                                                                                                                                                                                                                 |
| `style-src 'self'`                     | The library's stylesheet. The table needs no `'unsafe-inline'`; the SQL editors, which CodeMirror draws, are untested under this policy.                                                                                                                                                                                                                      |
| `default-src 'self'`                   | Everything else.                                                                                                                                                                                                                                                                                                                                              |

### Send it with every response

Each worker takes the policy that arrives with its own script, not the
page's: the library's worker takes the one sent with
`assets/worker-*.js`, and DuckDB's `blob:` worker inherits the library
worker's. A policy sent only with the page leaves both workers without one,
and a different policy on your scripts' responses governs them instead. So
send the same policy with every response: the page, its scripts, the
library's worker script, and the rest.

### Size the container in a stylesheet

`style-src 'self'` drops `style` attributes, so
`<div id="table" style="height: 600px">` comes out unsized. Without a
bounded height the table defeats its own virtualization and puts every row
in the DOM, without an error
([Sizing the container](../../README.md#sizing-the-container)). Size it in
your stylesheet instead:

```css
#table {
  height: 600px;
}
```

## Serving the library's worker script yourself

By default your bundler emits the library's worker,
`dist/assets/worker-*.js`, with your own scripts, and `worker-src 'self'`
covers it. Where it cannot, serve a copy: the built worker imports nothing,
so the file runs on its own (a test checks every build for it). Copy it
again on every upgrade: it belongs to its version.

- **At a URL of your own**, with `bridgeOptions.workerUrl`:

  ```ts
  await createDataTable({
    container,
    source,
    bridgeOptions: { workerUrl: '/static/data-table-worker.js', duckdbBundles },
  });
  ```

- **As text in a `blob:` URL**, with `bridgeOptions.workerFactory`. The
  factory runs synchronously, so fetch the text first:

  ```ts
  const workerCode = await fetch('/static/data-table-worker.js').then((r) => r.text());

  await createDataTable({
    container,
    source,
    bridgeOptions: {
      duckdbBundles,
      workerFactory: () =>
        new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' })), {
          type: 'module',
        }),
    },
  });
  ```

  `worker-src` needs `blob:` for this, as the policy above has.

## Error handling

A setup that cannot start DuckDB rejects `initialize()`, and so
`createDataTable()`, at once, with an error that says what to fix, except
for one case: a `.wasm` file that does not load or compile, which times out.

| What is wrong                                                                                                                                                    | What `initialize()` does                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bundle URL that is not a URL, or does not resolve against the page                                                                                             | Rejects at once, before any worker starts: `ConfigurationError`, `OPTIONS_INVALID`, `details.option` naming it.                                                        |
| `mainWorker` does not load: a 404, or an origin `script-src` leaves out                                                                                          | Rejects at once: `WorkerInitError`, `WORKER_CRASHED`, its message naming the URL.                                                                                      |
| `worker-src` without `blob:`                                                                                                                                     | Rejects at once: `WORKER_CRASHED`, "DuckDB's worker could not start from its blob: URL".                                                                               |
| The page's policy blocks the library's worker script, or the library is served from another origin than the page                                                 | Rejects at once: `WORKER_CRASHED`, its message naming `bridgeOptions.workerFactory`.                                                                                   |
| `mainModule`, the `.wasm`, does not load or compile: a 404, a type other than `application/wasm`, an origin `connect-src` leaves out, or no `'wasm-unsafe-eval'` | Nothing, until `initializeTimeoutMs` (30 s by default): then `WorkerInitError`, `WORKER_INIT_TIMEOUT`. DuckDB-WASM leaves the error unhandled, and the console has it. |
| An extension that does not load                                                                                                                                  | Succeeds. The load or query that needs it fails: for `icu`, every load, with `LOAD_PARSE_FAILED`.                                                                      |

After `WORKER_CRASHED` or `WORKER_INIT_TIMEOUT` the worker is gone, and
calling `initialize()` again starts a new one. A slow network can need a
longer timeout:

```ts
await createDataTable({
  container,
  source,
  bridgeOptions: { duckdbBundles, initializeTimeoutMs: 60_000 },
});
```

[Troubleshooting §4](../troubleshooting.md#4-duckdb-does-not-start-under-a-csp-or-offline)
goes through each cause. To report them in the app:

```ts
import { ConfigurationError, WorkerInitError, createDataTable } from '@jeyabbalas/data-table';

try {
  await createDataTable({ container, source, bridgeOptions: { duckdbBundles } });
} catch (error) {
  if (error instanceof ConfigurationError && error.code === 'OPTIONS_INVALID') {
    showError(`Check ${String(error.details?.option)}.`);
  } else if (error instanceof WorkerInitError) {
    showError(`DuckDB did not start (${error.code}): ${error.message}`);
  }
}
```

## Strict browser-support check

Opt into an upfront probe for required browser APIs:

```ts
await createDataTable({
  container,
  source,
  strictBrowserCheck: true,
});
```

It rejects before any worker starts if `WebAssembly`, `Worker`, `IndexedDB`,
or another probed API is missing, so you can render an "unsupported
browser" message instead of a half-mounted table.

## Other setups

### Another origin for DuckDB's files

Untested: the library's test serves every file from the page's origin. From
another origin, DuckDB's worker fetches the `.wasm` and the extensions with
CORS, so that origin must send `Access-Control-Allow-Origin`, and the policy
must list it in `script-src` and `connect-src`. `Cross-Origin-Resource-Policy`
matters only on a cross-origin-isolated page, one sent with
`Cross-Origin-Embedder-Policy`, as the `coi` bundle needs.

### Electron and other packaged apps

Untested: the library's tests do not run Electron. A `file://` page has no
origin for `'self'` to name, so rather than `file://` URLs, serve the app
and DuckDB's files from a privileged custom scheme (Electron's
`protocol.registerSchemesAsPrivileged`), and follow this guide on it.

### An intranet without the CDN

1. Serve DuckDB-WASM's files and mirror the extensions as above.
2. Pass `duckdbBundles`, and set `custom_extension_repository` on the bridge
   before anything loads.
3. Without the mirror, the first load fails with `LOAD_PARSE_FAILED` on
   `icu`; without `duckdbBundles`, DuckDB never starts.

## Gotchas

- **Every file from one DuckDB-WASM version.** Pin `@duckdb/duckdb-wasm` to
  `1.33.1-dev57.0` exactly, and copy its worker scripts and `.wasm` files
  together, again whenever the library's pinned version changes. The
  extensions' directory follows the version DuckDB reports.
- **The policy on the page alone reaches neither worker.** Send it with the
  library's worker script too: see
  [Send it with every response](#send-it-with-every-response).
- **`duckdbBundles` keys are case-sensitive**, and match the `DuckDBBundles`
  interface from `@duckdb/duckdb-wasm`: `mvp`, `eh`, `coi`, each with
  `mainModule` and `mainWorker`, and `pthreadWorker` for `coi`.
- **`coi` needs cross-origin isolation.** Without `Cross-Origin-Opener-Policy`
  and `Cross-Origin-Embedder-Policy`, DuckDB picks `eh` or `mvp` instead.
- **`coi` bundle's pthread workers go without one of the library's fixes.**
  Once DuckDB's memory passes 2 GiB, duckdb-wasm can lose the size of a file
  it opens; the library corrects this in DuckDB's main worker, but not in the
  pthread workers, which load their own script. See
  [Troubleshooting FAQ §32](../troubleshooting.md#32-too-small-to-be-a-parquet-file-or-prefetch-registered-for-bytes-outside-file--file-size-0).

## Related

- Vite integration: [Vite](../integrations/vite.md)
- Webpack integration: [Webpack](../integrations/webpack.md)
- CDN / no-build: [CDN](../integrations/cdn.md)
- Troubleshooting: [DuckDB does not start under a CSP or offline](../troubleshooting.md#4-duckdb-does-not-start-under-a-csp-or-offline), [WASM 404 in production](../troubleshooting.md#6-wasm-404-in-production-dev-worked-fine)
- API reference: [`bridgeOptions`, `WorkerBridgeOptions`](../api-reference.md#createdatatable), [`strictBrowserCheck`](../api-reference.md#createdatatable)
- Source: `src/data/WorkerBridge.ts` (`WorkerBridgeOptions.duckdbBundles`, `initialize`), `src/worker/duckdb.ts` (`initializeDuckDB`)
- Test: [`tests/browser/self-hosted-bundles.spec.ts`](../../tests/browser/self-hosted-bundles.spec.ts)
