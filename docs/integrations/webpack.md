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

`#my-table` is your markup, not the library's, and it needs a bounded
height: the table virtualizes against the container's measured height, and
an unbounded one silently defeats virtualization. See
[Sizing the container](../../README.md#sizing-the-container).

## Self-hosted WASM

As in the [Vite guide](./vite.md#self-hosted-wasm-offline--strict-csp),
pin `@duckdb/duckdb-wasm` to exactly `1.33.1-dev57.0`, copy
`duckdb-browser-eh.worker.js`, `duckdb-eh.wasm`,
`duckdb-browser-mvp.worker.js` and `duckdb-mvp.wasm` from
`node_modules/@duckdb/duckdb-wasm/dist/` into your static assets, and pass
them in. With `copy-webpack-plugin`, for an output served at `/` (untested,
like the rest of this page's recipes):

```js
// webpack.config.js
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  plugins: [
    new CopyPlugin({
      patterns: [
        'duckdb-browser-eh.worker.js',
        'duckdb-eh.wasm',
        'duckdb-browser-mvp.worker.js',
        'duckdb-mvp.wasm',
      ].map((file) => ({
        from: `node_modules/@duckdb/duckdb-wasm/dist/${file}`,
        to: 'static/duckdb/',
      })),
    }),
  ],
  // …
};
```

Relative URLs resolve against the page:

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

Serve the `.wasm` files as `application/wasm`, and mirror DuckDB's `icu`,
`parquet` and `json` extensions: see
[CSP and offline](../guides/csp-and-offline.md#duckdbs-extensions).

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

If you serve DuckDB-WASM's files yourself, install `@duckdb/duckdb-wasm`
at exactly `1.33.1-dev57.0` (`--save-exact`).

The CodeMirror packages are marked `optional: true` in the library's
`peerDependenciesMeta`, so npm won't error if you omit them. Webpack
will, though, if your code ends up importing them — so either install
them or keep them out of your dependency graph.

## Fallback — serve the worker script yourself

If your setup does not emit the library's worker, serve a copy of it. The
package does not export it by path: it is `dist/assets/worker-<hash>.js`
inside `node_modules/@jeyabbalas/data-table/`, and its name changes with
every release. Copy it to a fixed URL in your build (with
`copy-webpack-plugin`, say), again on every upgrade, and pass that URL:

```ts
await createDataTable({
  container,
  source,
  bridgeOptions: { workerUrl: '/static/data-table-worker.js' },
});
```

The file imports nothing, so the copy runs on its own. `workerFactory`
takes its text in a `blob:` URL instead: see
[CSP and offline → Serving the library's worker script yourself](../guides/csp-and-offline.md#serving-the-librarys-worker-script-yourself).

## CSP

Send one policy with every response, the worker scripts' too:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; style-src 'self'
```

Plus whatever your app already requires. `'self'` covers the worker chunk
wherever webpack emits it under your origin, `/static/js/` say;
`'wasm-unsafe-eval'` lets DuckDB compile its `.wasm`, and `blob:` lets it
start its worker. See [CSP and offline](../guides/csp-and-offline.md#the-content-security-policy).

`style-loader` injects `<style>` elements, which `style-src 'self'` blocks:
the library's styles, and your container's height with them if your own
CSS goes through it too, so the table renders every row. Under this
policy, extract the CSS into files with `MiniCssExtractPlugin`, or give
`style-loader` a nonce the policy allows (untested).

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
