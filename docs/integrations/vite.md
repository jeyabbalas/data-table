# Vite

Vite is the library's canonical bundler — it's used for development, the
demo app, and every runnable example. You'll get the smoothest experience
with Vite. This guide covers the defaults, the options you might need to
tweak, and how to configure Vite for strict-CSP / self-hosted WASM.

## Zero-config setup

```ts
// src/main.ts
import { createDataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const table = await createDataTable({
  container: document.getElementById('my-table')!,
  source: '/data/trips.csv',
});
```

That's usually enough. Vite handles the Web Worker and WASM imports
transparently. The library's `new Worker(new URL('../worker/worker.ts',
import.meta.url), { type: 'module' })` pattern is Vite-native.

`#my-table` is your markup, not the library's, and it needs a bounded
height: the table virtualizes against the container's measured height, and
an unbounded one silently defeats virtualization. See
[Sizing the container](../../README.md#sizing-the-container).

## Dependency optimization

For faster dev startup, tell Vite which dependencies to pre-bundle:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    // DuckDB-WASM has its own worker / WASM artifacts; let it handle
    // those itself rather than pre-bundling.
    exclude: ['@duckdb/duckdb-wasm'],
  },
});
```

This avoids occasional "worker not found" errors in dev where Vite
serves a pre-bundled version of DuckDB that doesn't include the worker
asset.

## Serving static assets

Place fixtures under `public/`:

```
public/
  data/
    trips.csv
```

Reference them with absolute URLs (`/data/trips.csv`).

## Self-hosted WASM (offline / strict CSP)

For deployments that can't reach jsDelivr:

1. **Pin `@duckdb/duckdb-wasm` exactly** to the version the library is built
   with, and copy its files into `public/duckdb/`, which Vite serves at
   `/duckdb/`:

   ```sh
   npm install --save-exact @duckdb/duckdb-wasm@1.33.1-dev57.0
   mkdir -p public/duckdb
   for file in duckdb-browser-eh.worker.js duckdb-eh.wasm \
               duckdb-browser-mvp.worker.js duckdb-mvp.wasm; do
     cp "node_modules/@duckdb/duckdb-wasm/dist/$file" public/duckdb/
   done
   ```

2. **Pass the bundles** to `createDataTable`. Relative URLs resolve against
   the page:

   ```ts
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

   await createDataTable({
     container,
     source,
     bridgeOptions: { duckdbBundles },
   });
   ```

3. **Mirror DuckDB's extensions**, `icu` (every load needs it), `parquet`
   and `json`, under `public/duckdb-ext/`, and point DuckDB at them with
   `custom_extension_repository` before anything loads. See
   [CSP and offline → DuckDB's extensions](../guides/csp-and-offline.md#duckdbs-extensions).

4. **Send one policy with every response**, the worker scripts' too:

   ```
   default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; style-src 'self'
   ```

   `'wasm-unsafe-eval'` lets DuckDB compile its `.wasm`, and `blob:` lets it
   start its worker. Size the table's container in a stylesheet: the policy
   drops `style` attributes.

See [CSP and offline](../guides/csp-and-offline.md) for the reasoning.

## Peer dependencies

The library declares optional peer deps on CodeMirror packages and a
required peer dep on `@duckdb/duckdb-wasm`. Install them in your app:

```sh
npm install @jeyabbalas/data-table \
  @duckdb/duckdb-wasm \
  @codemirror/autocomplete @codemirror/commands @codemirror/lang-sql \
  @codemirror/language @codemirror/state @codemirror/view @lezer/highlight
```

Skip the CodeMirror packages if you disable derived columns and raw-SQL
filters (`expressionFilter: false`, or pass a custom `editorFactory`).

If you serve DuckDB-WASM's files yourself, install `@duckdb/duckdb-wasm`
at exactly `1.33.1-dev57.0` (`--save-exact`), as above.

## Production build

```sh
vite build
```

Nothing special. The library ships as ESM; Vite's tree-shaker strips
unused modules.

If you import from `/advanced`, Vite includes those symbols; otherwise
they're dropped.

```ts
// Root entry — the facade plus the type-safe public surface
// (VisualizationRegistry, FilterPresetManager, SessionStore, etc.):
import { createDataTable, VisualizationRegistry } from '@jeyabbalas/data-table';

// /advanced — lower-level primitives (BaseVisualization, StateActions,
// UndoManager, table/filter UI components, export helpers):
import { BaseVisualization } from '@jeyabbalas/data-table/advanced';
```

## TypeScript config

The library ships `.d.ts` files; no extra TypeScript setup needed. If
you're using strict mode (recommended), the type-safety for
discriminated filter types and event payloads becomes more valuable.

```json
// tsconfig.json excerpt
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ESNext"
  }
}
```

## HMR

Vite's Hot Module Replacement doesn't understand the library's DOM
structure — editing your application code HMR-reloads the table, which
re-runs `createDataTable()`. The library destroys cleanly; HMR
just feels like a full remount.

## Gotchas

- **Forgetting `import '@jeyabbalas/data-table/styles'`.** The table mounts but has no colors or layout. The library emits a `STYLESHEET_MISSING` warning to the console.
- **Linking dev dependencies into published packages.** If you're building a library _on top of_ `@jeyabbalas/data-table`, don't list it as a direct dep — the consumer app should install it. Mark it as a peer dep.
- **`build.rollupOptions.external`.** Don't externalize `@jeyabbalas/data-table` unless you're intentionally doing CDN-driven delivery. Vite doesn't handle WASM well in externalized packages.
- **Worker fetch fails only in production.** If dev works but the built app can't find the worker, check that `vite build` emits worker chunks next to the main bundle. The default is `dist/assets/worker-*.js`.

## Related

- CSP / offline: [CSP and offline guide](../guides/csp-and-offline.md)
- Webpack: [Webpack integration](./webpack.md) (differences in worker / WASM handling)
- CDN: [CDN integration](./cdn.md) (no-build delivery)
