# CSP and offline deployments

By default, `@jeyabbalas/data-table` loads the DuckDB WASM worker via a
`new Worker(new URL('../worker/worker.ts', import.meta.url), { type:
'module' })` pattern and fetches DuckDB's WASM bundles from the jsDelivr
CDN. For many apps that's fine. For apps behind a strict Content Security
Policy (CSP) or in an air-gapped environment, both behaviors are
configurable — you can supply your own worker factory, a custom worker URL,
and a self-hosted WASM bundle map.

## You'll learn how to

- Run the library under a strict `script-src` CSP
- Self-host the DuckDB WASM bundles (no CDN calls)
- Customize the worker construction for non-standard bundlers
- Extend the worker init timeout for slow WASM loads

## Prerequisites

- Read: [API reference — `bridgeOptions`, `WorkerBridgeOptions`](../api-reference.md#createdatatable)
- Helpful background: [MDN — Worker construction](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)
- No dedicated runnable example; strict-CSP depends on your build setup. See the recipes below.

## How WASM / worker loading works by default

```
createDataTable()
  └── WorkerBridge constructor
       ├── creates a Web Worker from the default module URL
       └── worker boots DuckDB-WASM
            └── DuckDB fetches WASM bundle from getJsDelivrBundles() unless overridden
```

Three extension points are exposed via `bridgeOptions` (forwarded to
`WorkerBridge`):

| Option | Purpose |
|---|---|
| `workerFactory: () => Worker` | Take full control of Worker construction. Used for blob-URL workers under strict CSP |
| `workerUrl: string \| URL` | Supply a URL/path for the worker script (bundler-emitted, static file) |
| `duckdbBundles: DuckDBBundles` | Supply custom WASM bundle URLs — crucial for self-hosted / offline setups |
| `initializeTimeoutMs: number` | Raise the init timeout (default 30 s) for slow networks |

Priority: `workerFactory` > `workerUrl` > built-in default.

## Strict-CSP setup

If your page sends `script-src 'self'` (no CDN, no blobs, no unsafe-inline),
the default worker construction may fail depending on your bundler. The
cleanest workaround is to bundle the worker as a static asset at a known URL
and pass that URL in:

```ts
await createDataTable({
  container,
  source,
  bridgeOptions: {
    workerUrl: '/static/data-table-worker.js',
    duckdbBundles: {
      // Self-hosted WASM; see next section
      mvp:  { mainModule: '/static/duckdb-mvp.wasm',  mainWorker: '/static/duckdb-mvp.worker.js' },
      eh:   { mainModule: '/static/duckdb-eh.wasm',   mainWorker: '/static/duckdb-eh.worker.js' },
    },
  },
});
```

Your CSP then needs:

```
script-src 'self';
worker-src 'self';
```

(Plus whatever your app already requires.)

If you must use a blob-URL worker (e.g., SSR-emitted inline code), pass a
factory:

```ts
const workerSource = fetch('/worker-code.js').then((r) => r.text());

const bridge = {
  workerFactory: () => {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob), { type: 'module' });
  },
};

await createDataTable({ container, source, bridgeOptions: bridge });
```

For that to work, your CSP needs `worker-src blob:`.

## Self-hosting the WASM bundles

DuckDB-WASM ships several bundles (MVP, exception-handling, with-coi) so
the runtime can pick the best fit for the browser. `getJsDelivrBundles()`
returns pointers to the jsDelivr CDN by default. Override:

```ts
import type { DuckDBBundles } from '@duckdb/duckdb-wasm';

const duckdbBundles: DuckDBBundles = {
  mvp: {
    mainModule: '/assets/duckdb/duckdb-mvp.wasm',
    mainWorker: '/assets/duckdb/duckdb-mvp.worker.js',
  },
  eh: {
    mainModule: '/assets/duckdb/duckdb-eh.wasm',
    mainWorker: '/assets/duckdb/duckdb-eh.worker.js',
  },
  coi: {
    mainModule: '/assets/duckdb/duckdb-coi.wasm',
    mainWorker: '/assets/duckdb/duckdb-coi.worker.js',
    pthreadWorker: '/assets/duckdb/duckdb-coi.pthread.worker.js',
  },
};

await createDataTable({
  container,
  source,
  bridgeOptions: { duckdbBundles },
});
```

Download the WASM artifacts from the `@duckdb/duckdb-wasm` NPM package and
serve them from your own origin. Keep version alignment: the bundles must
match the peer-dependency version declared in your `package.json`.

### Bundle size

The combined DuckDB-WASM bundle is roughly:

- ~30 MB uncompressed
- ~10 MB gzipped
- ~7 MB brotli-compressed

Serve with aggressive caching and content-encoding. A fresh page load on a
cold browser takes a few seconds; cached loads are near-instant.

### Same-origin requirement

WASM must be served from the same origin as the page that instantiates the
worker, unless CORS headers allow cross-origin WASM instantiation. If you
have to serve from a CDN, make sure it sends
`Access-Control-Allow-Origin: *` (or your origin) and
`Cross-Origin-Resource-Policy: cross-origin`.

For COOP/COEP setups (required by `coi` bundles, which use SharedArrayBuffer),
see [the DuckDB-WASM docs on cross-origin isolation](https://duckdb.org/docs/api/wasm/overview).

## Extending the init timeout

Slow connections can exceed the default 30-second worker init budget:

```ts
await createDataTable({
  container,
  source,
  bridgeOptions: { initializeTimeoutMs: 60_000 },
});
```

If `initialize()` times out, it rejects with a
`WorkerInitError` (code `WORKER_INIT_TIMEOUT`). The internal worker is
terminated so a subsequent retry can rebuild cleanly.

## Error handling

Strict-CSP and offline setups are the most common sources of worker-init
failures. Listen for them:

```ts
import { WorkerInitError } from '@jeyabbalas/data-table';

table.on('error', ({ error }) => {
  if (error instanceof WorkerInitError) {
    switch (error.code) {
      case 'WORKER_INIT_TIMEOUT':
        showToast('The library is taking longer than expected to load. Retry?');
        break;
      case 'WORKER_CRASHED':
        showToast(`Library worker crashed during init: ${error.message}`);
        break;
      case 'WORKER_UNSUPPORTED':
        showToast('This browser lacks a required feature (WASM, Worker, IndexedDB).');
        break;
    }
  }
});
```

If your custom `workerFactory` throws, the library wraps it in
`WorkerInitError` with `details.source: 'workerFactory'` so you can
discriminate.

## Strict browser-support check

Opt into an upfront probe for required browser APIs:

```ts
await createDataTable({
  container,
  source,
  strictBrowserCheck: true,
});
```

Rejects before any worker init if `WebAssembly`, `Worker`, `IndexedDB`, or
other probed APIs are unavailable — letting you render a dedicated
"unsupported browser" message instead of a half-mounted table.

## Recipes

### Vite + SPA with strict CSP

1. Add a Vite plugin to emit the worker as a static asset:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
});
```

2. Copy the DuckDB WASM bundles into `public/duckdb/` during build.
3. Pass custom `workerUrl` and `duckdbBundles` as shown above.
4. CSP: `script-src 'self'; worker-src 'self';`.

See [integrations/vite.md](../integrations/vite.md) for a fuller walkthrough.

### Electron / packaged desktop app

Electron's `file://` protocol disables cross-origin checks within your app
bundle. Ship the WASM bundles inside your packaged app and point
`duckdbBundles` at `file:///…` URLs (or use the renderer's local resource
protocol).

Electron's default CSP is permissive but production apps should lock it
down. `script-src 'self'` + `worker-src 'self'` works with bundler-emitted
workers.

### Corporate intranet, no CDN access

1. Mirror the DuckDB-WASM NPM package's `dist/` directory to your intranet
   static host.
2. Pass a `duckdbBundles` map pointing there.
3. If your intranet proxies block jsDelivr, the default behavior will fail
   loudly with a fetch error — the explicit override avoids this.

## Gotchas

- **`workerUrl` must be loadable from the page origin.** Cross-origin worker scripts need CORS headers or a blob-URL wrapper.
- **`duckdbBundles` keys are case-sensitive** and match the `DuckDBBundles` interface from `@duckdb/duckdb-wasm`. Typos become runtime 404s during init.
- **Worker init timeout kills the bridge.** A 30-second failure is permanent for that instance. After `WORKER_INIT_TIMEOUT`, destroy the table and try again (possibly with a larger timeout).
- **CSP `worker-src 'self'` must include your worker origin.** If your worker is cross-origin, `worker-src` needs that origin too.
- **`coi` bundle requires COOP/COEP.** The cross-origin-isolated bundle uses `SharedArrayBuffer`, which requires specific response headers. If you don't set them, DuckDB falls back to `mvp`/`eh` automatically — but you get slower queries.
- **Don't mix bundler-emitted and CDN-served WASM.** The versions must match. Use one or the other; the library doesn't cross-check.

## Related

- Vite integration: [Vite](../integrations/vite.md)
- Webpack integration: [Webpack](../integrations/webpack.md)
- CDN / no-build: [CDN](../integrations/cdn.md)
- Troubleshooting: [WASM 404 in production](../troubleshooting.md), [CSP blocking](../troubleshooting.md)
- API reference: [`bridgeOptions`, `WorkerBridgeOptions`](../api-reference.md#createdatatable), [`strictBrowserCheck`](../api-reference.md#createdatatable)
- Source: `src/data/WorkerBridge.ts:45-146`, `src/worker/duckdb.ts`
