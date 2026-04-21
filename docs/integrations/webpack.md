# Webpack

Webpack can host the library, but the Web Worker + WASM story requires
some configuration. This guide covers webpack 5's native worker support,
the WASM asset-module setup, and peer-dep tree-shaking.

## Minimum viable setup (webpack 5+)

Webpack 5 supports `new Worker(new URL('./worker.ts', import.meta.url))`
natively — the same pattern the library uses. Webpack emits the worker
as a separate chunk.

```ts
// webpack.config.js
module.exports = {
  experiments: {
    asyncWebAssembly: true,
    outputModule: true,
  },
  output: {
    module: true,
    chunkFormat: 'module',
    environment: {
      module: true,
    },
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'asset/resource',
      },
    ],
  },
  // …
};
```

Key points:

- `asyncWebAssembly` lets webpack resolve `.wasm` imports.
- `outputModule: true` emits ESM bundles, so `type: 'module'` workers work.
- The `.wasm` file test emits WASM as a resource.

## Importing the library

```ts
import { createDataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const table = await createDataTable({
  container: document.getElementById('my-table')!,
  source: '/data/trips.csv',
});
```

The CSS side-effect import works with webpack's `style-loader` +
`css-loader` pipeline. If you're using MiniCssExtractPlugin, the CSS
extracts into a separate file.

## Self-hosted WASM

Like the [Vite guide](./vite.md#self-hosted-wasm-offline--strict-csp),
place DuckDB bundles under your static asset directory and pass them in:

```ts
const bundles = {
  mvp: {
    mainModule: '/static/duckdb/duckdb-mvp.wasm',
    mainWorker: '/static/duckdb/duckdb-browser-mvp.worker.js',
  },
  eh: {
    mainModule: '/static/duckdb/duckdb-eh.wasm',
    mainWorker: '/static/duckdb/duckdb-browser-eh.worker.js',
  },
};

await createDataTable({
  container,
  source,
  bridgeOptions: { duckdbBundles: bundles },
});
```

## CodeMirror chunk splitting

CodeMirror (used by the library's SQL editor) is heavy. Webpack's
default code splitting should produce a separate chunk for it. To force
a dedicated chunk:

```js
// webpack.config.js
optimization: {
  splitChunks: {
    cacheGroups: {
      codemirror: {
        test: /[\\/]node_modules[\\/]@codemirror[\\/]/,
        name: 'codemirror',
        chunks: 'all',
      },
    },
  },
},
```

If you don't use derived columns or raw-SQL filters, set
`expressionFilter: false` and/or pass a custom `editorFactory` — webpack
tree-shakes the CodeMirror imports and the chunk shrinks to zero.

## Peer dependencies

Install peer deps directly in your app:

```sh
npm install @jeyabbalas/data-table \
  @duckdb/duckdb-wasm \
  @codemirror/autocomplete @codemirror/commands @codemirror/lang-sql \
  @codemirror/language @codemirror/state @codemirror/view @lezer/highlight
```

The CodeMirror packages are marked `optional: true` in the library's
`peerDependenciesMeta`, so npm won't error if you omit them. Webpack
will, though, if your code ends up importing them — so either install
them or keep them out of your dependency graph.

## Fallback — `worker-loader`

On older webpack setups (webpack 4) or when the native `new Worker(new
URL(...))` pattern doesn't work, use `worker-loader`:

```ts
// Inline
await createDataTable({
  container,
  source,
  bridgeOptions: {
    workerFactory: () => new Worker(
      new URL('@jeyabbalas/data-table/dist/worker/worker.js', import.meta.url),
      { type: 'module' },
    ),
  },
});
```

Or with `worker-loader`'s import syntax (if installed):

```ts
// worker-loader import:
import MyWorker from 'worker-loader!@jeyabbalas/data-table/dist/worker/worker.js';

await createDataTable({
  container,
  source,
  bridgeOptions: { workerFactory: () => new MyWorker() },
});
```

Prefer the native pattern where possible; `worker-loader` is unmaintained
and webpack 5's built-in support is preferred.

## CSP

```
script-src 'self';
worker-src 'self';
```

Plus whatever your app already requires. Match your worker output path —
e.g., if webpack emits to `/static/js/`, that's allowed by `'self'`.

## Dev server proxying

If you serve data from a local API during development, proxy those
requests in webpack-dev-server:

```js
devServer: {
  proxy: {
    '/api': { target: 'http://localhost:4000' },
  },
},
```

## Gotchas

- **Worker 404 in production but not dev.** Webpack may inline workers in dev and emit them as files in prod. Check `dist/` after `webpack build` for the worker chunk.
- **`asyncWebAssembly` requirement.** If you see `Module parse failed` errors on `.wasm` files, your webpack config needs `experiments.asyncWebAssembly: true`.
- **CSS loader misconfigured.** The library expects `import '@jeyabbalas/data-table/styles'` to add a stylesheet to the document. With `style-loader` this works; with MiniCssExtractPlugin you need to include the extracted CSS file in your HTML template.
- **Module federation.** The library isn't tested as a federated module. Worker + WASM resource resolution under Module Federation is non-obvious; prefer bundling it inline.
- **Tree-shaking `@jeyabbalas/data-table/advanced`.** If you only import from the root entry point, webpack correctly drops the advanced symbols. If you import from both, both are included — that's fine, the overlap is small.

## Related

- CSP / offline: [CSP and offline guide](../guides/csp-and-offline.md)
- Vite: [Vite integration](./vite.md) (canonical bundler)
- Next.js: [Next.js integration](./nextjs.md) (uses webpack under the hood for the non-Turbopack path)
