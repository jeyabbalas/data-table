# CDN (no-build)

You can use `@jeyabbalas/data-table` from a CDN without a bundler — no
npm, no webpack, no Vite. Useful for quick demos, Observable notebooks,
blog post embeds, or pages where adding a build step isn't worth it.

## Minimal example

```html
<!doctype html>
<html>
  <head>
    <title>Data table — no-build</title>
    <link rel="stylesheet" href="https://esm.sh/@jeyabbalas/data-table/styles" />
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        height: 100%;
      }
      #my-table {
        height: 100vh;
      }
    </style>
  </head>
  <body>
    <div id="my-table"></div>
    <script type="module">
      import { createDataTable } from 'https://esm.sh/@jeyabbalas/data-table';

      const table = await createDataTable({
        container: document.getElementById('my-table'),
        source: 'https://example.com/data.csv',
      });
    </script>
  </body>
</html>
```

That's it. esm.sh bundles the library plus its peer deps (DuckDB-WASM,
CodeMirror) and serves them as ESM.

The `height: 100vh` on `#my-table` is load-bearing, not cosmetic. The table
virtualizes against the container's measured height and renders only the
rows that fit; with an unbounded container virtualization is silently
defeated — the render window saturates at the scroller's 15,000,000 px
height cap, hundreds of thousands of rows — and it neither errors nor
warns. Any bounded height works
(`600px`, `100vh`, a flex child with `min-height: 0`); none at all does
not. See
[Sizing the container](../../README.md#sizing-the-container).

## CDN options

Any CDN that serves npm packages as ES modules works:

- **esm.sh** — `https://esm.sh/@jeyabbalas/data-table` — most permissive; bundles deps
- **jsDelivr** — `https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table/+esm` — reliable, but you may need to resolve peer deps manually
- **unpkg** — `https://unpkg.com/@jeyabbalas/data-table?module` — works but slower
- **Skypack** (deprecated but functional) — `https://cdn.skypack.dev/@jeyabbalas/data-table`

For production, pin to a specific version:

```html
<script type="module">
  import { createDataTable } from 'https://esm.sh/@jeyabbalas/data-table@0.1.0';
</script>
```

Unpinned URLs resolve to "latest" — fine for demos, risky for anything
durable.

## Import maps (cleaner imports)

For readability, declare an import map:

```html
<script type="importmap">
  {
    "imports": {
      "@jeyabbalas/data-table": "https://esm.sh/@jeyabbalas/data-table@0.1.0",
      "@jeyabbalas/data-table/advanced": "https://esm.sh/@jeyabbalas/data-table@0.1.0/advanced",
      "@jeyabbalas/data-table/styles": "https://esm.sh/@jeyabbalas/data-table@0.1.0/styles"
    }
  }
</script>

<script type="module">
  import { createDataTable } from '@jeyabbalas/data-table';
  import '@jeyabbalas/data-table/styles';

  const table = await createDataTable({/* … */});
</script>
```

The import map must precede the first `<script type="module">` that uses
those bare specifiers. Modern Chrome, Firefox, and Safari all support
import maps natively — no polyfill needed for recent browsers.

## Loading CSS

Two options:

```html
<!-- Option 1: <link> tag -->
<link rel="stylesheet" href="https://esm.sh/@jeyabbalas/data-table@0.1.0/styles" />

<!-- Option 2: ESM side-effect import -->
<script type="module">
  import '@jeyabbalas/data-table/styles';
</script>
```

The second option requires your CDN to recognize the side-effect and
inject the stylesheet. esm.sh does; jsDelivr's `+esm` shortcut may not.
The `<link>` tag is the more reliable path.

## Self-hosted single-file bundle

If you want zero CDN dependency but still no build step, pre-build once:

```sh
npm install @jeyabbalas/data-table @duckdb/duckdb-wasm
npx esbuild --bundle --format=esm --outfile=data-table.bundle.js \
  <(echo 'export * from "@jeyabbalas/data-table"')
```

Then serve `data-table.bundle.js` from your own origin and `import` it
from your HTML.

## DuckDB bundles from CDN

By default, DuckDB-WASM fetches its `.wasm` files from jsDelivr (via
`getJsDelivrBundles()`). That works from a CDN-loaded page because the
library's JS doesn't care where the WASM comes from — it just needs the
URLs to resolve. You only need `duckdbBundles` overrides if you want to
avoid the jsDelivr dependency.

## CSP

If your site sends a CSP:

```
script-src 'self' https://esm.sh https://cdn.jsdelivr.net;
worker-src 'self' https://esm.sh https://cdn.jsdelivr.net;
connect-src 'self' https://cdn.jsdelivr.net;
```

Adjust the CDN hosts to match what you use. The `connect-src` entry
covers the WASM fetch.

## When to choose CDN over a bundler

**CDN is good for:**

- Prototypes, one-off demos, single-file HTML pages
- Observable notebooks, Quarto documents, embedded analytics
- Pages that can't have a build step (legacy CMS)
- Education and workshops

**A bundler is better for:**

- Production apps with version pinning and CI
- Offline / intranet deployments (no CDN access)
- Fine-grained tree-shaking and bundle-size control
- TypeScript integration (CDNs don't deliver types)

## Gotchas

- **TypeScript types.** CDN-loaded libraries don't come with `.d.ts` files. Your editor won't autocomplete unless you also install the npm package locally for types-only use.
- **esm.sh cold starts.** The first request to `esm.sh/<package>@<version>` compiles the ESM bundle on the server; subsequent requests are cached. Occasional 10-second delays happen on first hit.
- **Mixed CDN + pinned version.** If you use `https://esm.sh/@jeyabbalas/data-table` _and_ `https://esm.sh/@jeyabbalas/data-table/advanced@0.1.0`, you may end up with two versions of the library in the same page — duplicate signals, state isolation surprises. Always pin to the same version across entry points.
- **CORS and cross-origin DuckDB WASM.** When the library fetches WASM cross-origin, the host must send permissive CORS headers. jsDelivr does; most CDNs do. Your own self-hosted WASM must match.
- **No hot reload.** Every edit requires a hard refresh. That's the nature of no-build delivery.

## Related

- CSP / offline: [CSP and offline guide](../guides/csp-and-offline.md) for self-hosted WASM
- Vite: [Vite integration](./vite.md) for a bundled-app comparison
