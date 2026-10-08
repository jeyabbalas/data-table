# CDN (no-build)

You can load `@jeyabbalas/data-table` straight from a CDN, with no npm
install, bundler or build step. That suits demos, single-file pages,
notebooks and CMS pages that cannot run a build. The page below is
complete except for two values you fill in, listed after it. The sections
after it explain the parts a bundler would
otherwise handle: which CDN files to load, how the worker starts, and the
import map for the SQL editors. Then comes the Content Security Policy the
page needs.

## The page

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Data table from a CDN</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/data-table.css"
    />
    <style>
      html,
      body {
        height: 100%;
        margin: 0;
      }
      /* The table needs a bounded height: it renders only the rows that fit. */
      #table {
        height: 100%;
      }
    </style>
    <script type="importmap">
      {
        "imports": {
          "@jeyabbalas/data-table": "https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/data-table.js",
          "@jeyabbalas/data-table/advanced": "https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/advanced.js",
          "@codemirror/autocomplete": "https://esm.sh/*@codemirror/autocomplete@6.20.3",
          "@codemirror/commands": "https://esm.sh/*@codemirror/commands@6.11.1",
          "@codemirror/lang-sql": "https://esm.sh/*@codemirror/lang-sql@6.10.0",
          "@codemirror/language": "https://esm.sh/*@codemirror/language@6.12.4",
          "@codemirror/state": "https://esm.sh/*@codemirror/state@6.7.6",
          "@codemirror/view": "https://esm.sh/*@codemirror/view@6.43.13",
          "@lezer/common": "https://esm.sh/*@lezer/common@1.5.2",
          "@lezer/highlight": "https://esm.sh/*@lezer/highlight@1.2.5",
          "@lezer/lr": "https://esm.sh/*@lezer/lr@1.4.10",
          "@marijn/find-cluster-break": "https://esm.sh/*@marijn/find-cluster-break@1.0.2",
          "crelt": "https://esm.sh/*crelt@1.0.6",
          "style-mod": "https://esm.sh/*style-mod@4.1.3",
          "w3c-keyname": "https://esm.sh/*w3c-keyname@2.2.8"
        }
      }
    </script>
  </head>
  <body>
    <div id="table"></div>
    <script type="module">
      import { createDataTable } from '@jeyabbalas/data-table';

      // The library's worker script, from the same version. <hash> is a
      // placeholder: copy the file's name from the version's listing (see "The worker").
      const WORKER_URL =
        'https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/assets/worker-<hash>.js';

      // A browser starts no worker from another origin's script. A blob: URL
      // belongs to this page, and a module worker started from one can import it.
      function startWorker() {
        const code = `import ${JSON.stringify(WORKER_URL)};`;
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        return new Worker(url, { type: 'module' });
      }

      const table = await createDataTable({
        container: document.getElementById('table'),
        source: '/data/sales.csv',
        bridgeOptions: { workerFactory: startWorker },
      });
    </script>
  </body>
</html>
```

The two values to fill in:

- **The worker's name.** Replace `worker-<hash>.js` with the file's real
  name; [The worker](#the-worker) says where to find it.
- **The data.** Point `source` at your CSV, JSON or Parquet file. A file on
  another origin must send CORS headers (`Access-Control-Allow-Origin`).

The stylesheet goes in a `<link>`. A bundler applies
`import '@jeyabbalas/data-table/styles'`, but a browser applies no CSS from an
`import`.

The container's height is load-bearing, not cosmetic. The table virtualizes
against the container's measured height and renders only the rows that fit.
In an unbounded container it renders every row, up to hundreds of thousands,
and nothing errors or warns. Any bounded height works: `600px`, `100vh`, or
a flex child with `min-height: 0`. The page sets it in the `<style>` block
rather than a `style` attribute, which a strict policy refuses
([Content Security Policy](#content-security-policy)). See
[Sizing the container](../../README.md#sizing-the-container).

## Which CDNs work

Use a CDN that serves the package's files exactly as they were published,
such as jsDelivr's `/npm/` paths or unpkg. The library's modules load each
other by relative URL. They find the worker by a URL relative to their own,
`new URL('assets/worker-<hash>.js', import.meta.url)`. They also load the
dialogs, the value inspector and other parts from sibling files when first
used. On a raw-file CDN, all of those URLs resolve.

| Entry point                       | File                  | jsDelivr URL                                                                    |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `@jeyabbalas/data-table`          | `dist/data-table.js`  | `https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/data-table.js`  |
| `@jeyabbalas/data-table/advanced` | `dist/advanced.js`    | `https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/advanced.js`    |
| `@jeyabbalas/data-table/styles`   | `dist/data-table.css` | `https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/data-table.css` |

unpkg serves the same files at
`https://unpkg.com/@jeyabbalas/data-table@0.9.0/dist/…`. To use it, change
the host in every library URL: the stylesheet, the import map and the
worker. In the policy, put `https://unpkg.com` wherever the library comes
from jsDelivr. DuckDB's own files still come from jsDelivr, so keep
`https://cdn.jsdelivr.net` in `script-src` and `connect-src`.

Use the raw files. Services that rebuild the package serve their own
modules: jsDelivr's `/+esm` bundles each lazily loaded part separately and
the SQL editors fail; unpkg's `?module` points every import at a version
range and loads a second `@codemirror/state`; esm.sh picks CodeMirror
itself, at the newest versions, so nothing stays pinned. Skypack returns a 404.

Pin an exact version in every URL. An unversioned URL follows the latest
release, so a later release can change the worker's name under the page,
and mix files from two versions in it.

## The worker

The library finds its worker script next to its own modules, at
`dist/assets/worker-<hash>.js`, and starts it with
`new Worker(url, { type: 'module' })`. A browser refuses that for a script on
another origin. Without a `workerFactory`, `createDataTable()` rejects with
this error, in Chrome's words:

```text
SecurityError: Failed to construct 'Worker': Script at
'https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/assets/worker-<hash>.js'
cannot be accessed from origin 'https://your-site.example'.
```

The page's `startWorker` gets around this. A `blob:` URL belongs to the
page that made it, so the browser starts a module worker from one. That
worker's one line imports the CDN script, and an import may cross origins
when the server allows it: jsDelivr and unpkg send
`Access-Control-Allow-Origin: *`. To share one worker among several tables,
pass the factory to `new WorkerBridge({ workerFactory: startWorker })`, and
give each table that `bridge` and a `tableName` of its own. A table ignores
`bridgeOptions` when it is given a bridge.

The `<hash>` in the file's name is a hash of the file's content, set when
the package is built, so the name changes when the worker's code changes.
Copy it from the version's file listing:

- jsDelivr:
  [cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/assets/](https://cdn.jsdelivr.net/npm/@jeyabbalas/data-table@0.9.0/dist/assets/)
- unpkg:
  [app.unpkg.com/@jeyabbalas/data-table@0.9.0/files/dist/assets](https://app.unpkg.com/@jeyabbalas/data-table@0.9.0/files/dist/assets)

The folder holds two files, `worker-<hash>.js` and its source map,
`worker-<hash>.js.map`. For a given version the name never changes. npm
does not let a published version's files change, and both CDNs serve those
files as they are, cached for a year. The URL you copy keeps working for as
long as you stay on that version. Look the name up again whenever you change
the version. A name that is not in this version's folder fails: the worker's
import gets a 404, and `createDataTable()` rejects with a `WorkerInitError`
whose code is `WORKER_CRASHED`, "The worker script failed to load".

## The SQL editors

The **Expression** filter dialog, the add-column (**+**) dialog and a
derived column's edit panel each hold a CodeMirror editor. The library loads
it only when one of them first opens. Its code imports CodeMirror by package
name (`@codemirror/state`), and a browser resolves a package name only
through an import map. Without the map, those buttons do nothing, and the
console shows `Failed to resolve module specifier "@codemirror/autocomplete"`.
An `editorFactory` does not change this, since the dialogs' code imports the
CodeMirror editor whether or not it is used. `@jeyabbalas/data-table/advanced`
imports the editor directly, so importing it fails the same way, at once.

The page's map sends each name to esm.sh, which builds npm packages into
browser modules. The versions are the ones the library is tested with,
pinned exactly. The `*` before each package name tells esm.sh to leave that
package's own imports as names too. Those names then come back through the
map, so every module that imports `@codemirror/state` or `@codemirror/view`
gets the same copy. Without the `*`, esm.sh resolves each package's
dependencies itself, to the newest matching version. In testing, a map
without the `*` loaded a second, newer `@codemirror/view` and
`@codemirror/language`, and autocomplete stopped working, with no error. A
second `@codemirror/state` fails louder: "Unrecognized extension value in
extension set … multiple instances of @codemirror/state are loaded". That is
why the map lists thirteen packages rather than the seven the editor
imports. The `*` builds import six more: `@lezer/common`, `@lezer/lr`,
`@marijn/find-cluster-break`, `crelt`, `style-mod` and `w3c-keyname`. When
you upgrade CodeMirror, upgrade all thirteen together: the seven within the
ranges in the library's `peerDependencies`, and the other six within the
ranges those seven declare.

A page that needs no editors can leave CodeMirror out. Pass
`expressionFilter: false` and `derivedColumns: false` to `createDataTable()`
and no editor ever loads. The map then needs only the library's entries, and
the policy needs no esm.sh. `derivedColumns: false` also removes the buttons
that extract a field of a nested or JSON column into a column of its own.

## DuckDB's files

The library's worker has DuckDB-WASM's JavaScript built in (1.33.1-dev57.0
in 0.9.0), so the page imports nothing from `@duckdb/duckdb-wasm`. When the
worker starts, it fetches DuckDB's own worker script and the matching
WebAssembly from jsDelivr. DuckDB then downloads extensions from
`extensions.duckdb.org` as it needs them: `icu` on every load, `parquet` for
a Parquet file, and `json` for JSON and nested values. To serve these from
your own host, see [CSP and offline deployments](../guides/csp-and-offline.md).

## Content Security Policy

A page without a policy needs nothing more. If your site sends a
`Content-Security-Policy` header, the page needs at least these sources. The
header is shown here on several lines, but you send it as one. A host that
cannot set headers can put the same policy in a
`<meta http-equiv="Content-Security-Policy" content="…">` element at the top
of `<head>`; it reaches the page's `blob:` workers too.

```http
Content-Security-Policy: default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net https://esm.sh 'wasm-unsafe-eval'
    'sha256-<hash of the import map>' 'sha256-<hash of the module script>';
  style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline';
  style-src-attr 'none';
  worker-src blob: https://cdn.jsdelivr.net;
  connect-src 'self' https://cdn.jsdelivr.net https://extensions.duckdb.org
```

What each directive allows:

- **`script-src`** allows the library's modules and DuckDB's worker script
  from `https://cdn.jsdelivr.net`, and CodeMirror from `https://esm.sh`. The
  two hashes allow the page's inline scripts. `'wasm-unsafe-eval'` lets
  DuckDB compile its WebAssembly. Nothing on the page needs `'unsafe-eval'`.
- **`style-src`** allows the library's stylesheet. Its `'unsafe-inline'`
  allows the page's `<style>` block, and the `<style>` element CodeMirror
  writes its styles into when an editor opens. Put no hash or nonce in this
  directive: a browser that finds one ignores `'unsafe-inline'`, and the
  editors then show unstyled.
- **`style-src-attr 'none'`** refuses inline `style` attributes. The table
  never writes them; it styles elements through `element.style`, which a
  policy does not restrict. So the container's height belongs in a
  stylesheet: a refused `style="height: …"` leaves the container unbounded.
- **`worker-src`** allows `blob:`, for the page's worker and for DuckDB's
  own worker, which the library also starts from a `blob:` URL. The worker's
  import of the library's worker script counts as a worker load, not a script
  load, so `https://cdn.jsdelivr.net` goes here as well.
- **`connect-src`** allows your data, DuckDB's WebAssembly on
  `https://cdn.jsdelivr.net`, and its extensions on
  `https://extensions.duckdb.org`. `'self'` covers data on your own origin.
  For data on another host, add that host.

**The inline scripts.** The import map and the module script are inline, so
the policy allows them by hash. A hash covers a script's exact text, every
space and line break included, so any edit changes it. To get the hashes,
open the page with the policy in place: the console names the hash each
refused script needs ("Either the 'unsafe-inline' keyword, a hash
('sha256-…'), or a nonce ('nonce-...') is required"). A page your server
renders can use a nonce instead: a fresh random value for each response, sent
as `'nonce-<value>'` in the policy and set as `nonce="<value>"` on both
`<script>` elements. You can also move the module script into a file of its
own, which `'self'` covers. The import map has to stay inline.

**Without the editors.** On a page that turns the editors off
([The SQL editors](#the-sql-editors)), drop `https://esm.sh` from
`script-src`. In `style-src`, replace `'unsafe-inline'` with the hash of the
page's `<style>` block, which the console names the same way.

When a source is missing, the page fails in one of these ways, quoted as
Chrome reports them:

| Missing from the policy                          | What happens                                                                                                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blob:` in `worker-src`                          | The console reports "Creating a worker from 'blob:…' violates the following Content Security Policy directive", and `createDataTable()` rejects: "The worker script failed to load".               |
| `https://cdn.jsdelivr.net` in `worker-src`       | The worker's import is refused, and `createDataTable()` rejects: "The worker script failed to load".                                                                                               |
| `'wasm-unsafe-eval'` in `script-src`             | "CompileError: WebAssembly.instantiateStreaming(): Compiling or instantiating WebAssembly module violates the following Content Security policy directive"; 30 s later, `WORKER_INIT_TIMEOUT`.     |
| `https://cdn.jsdelivr.net` in `connect-src`      | DuckDB's WebAssembly fails to download ("Failed to fetch"); 30 s later, `WORKER_INIT_TIMEOUT`.                                                                                                     |
| `https://extensions.duckdb.org` in `connect-src` | The load fails: "Failed to load 'https://extensions.duckdb.org/…/icu.duckdb_extension.wasm'".                                                                                                      |
| `https://esm.sh` in `script-src`                 | The editors' dialogs never open, and the console reports each refused CodeMirror module.                                                                                                           |
| `'unsafe-inline'` in `style-src`                 | The page's `<style>` block is refused too, so the container has no bounded height and the table renders every row. The editors work but show unstyled, and the console reports each refused style. |

## Serving the files yourself

To load nothing of the library from a CDN, serve the package's `dist/`
folder from your own origin, at `/vendor/data-table/` for example. Get it
from the package's tarball,
`https://registry.npmjs.org/@jeyabbalas/data-table/-/data-table-0.9.0.tgz`
(its `package/dist/` folder), or copy
`node_modules/@jeyabbalas/data-table/dist/` from any project that installs
the package. Point the stylesheet and the import map at those files. The
worker is then on the page's own origin, and `createDataTable()` starts it
itself, so leave out `bridgeOptions`. In the policy, the library's sources
become `'self'`, with `worker-src 'self' blob:`. Send that policy on every
response, the worker script's included. A worker started from a URL takes
its policy from that file's response, not from the page, unlike the CDN
page's `blob:` worker, which inherits the page's. DuckDB's files, its
extensions and CodeMirror still come from their CDNs unless you host those
too; [CSP and offline deployments](../guides/csp-and-offline.md) covers
DuckDB's.

## When to choose a CDN over a bundler

**A CDN is good for:**

- Prototypes, one-off demos and single-file HTML pages
- Notebooks, Quarto documents and embedded analytics
- Pages that cannot have a build step, such as a legacy CMS
- Teaching and workshops

**A bundler is better for:**

- Production apps with locked dependencies and CI
- Offline and intranet deployments with no CDN access
- Control over bundle size and code splitting
- TypeScript, since a CDN page gets no type checking

## Gotchas

- **TypeScript types.** A page that loads the library from a CDN gets no
  `.d.ts` files. Install the package locally if you want your editor's
  autocompletion and type checking.
- **One version everywhere.** The stylesheet, the import map and the
  worker must all name the same version. The library's files are built to
  work with each other, not with another release's: the messages between
  the page and the worker, for one, are internal and change between
  releases.
- **esm.sh's first build.** esm.sh builds a package version the first time
  anyone asks for it. That can take several seconds, and the first request
  can fail outright, with a CORS error; later requests come from its cache.
  Only the editors depend on it, since CodeMirror loads when an editor first
  opens.

## Related

- [CSP and offline deployments](../guides/csp-and-offline.md): hosting
  DuckDB's files and extensions yourself
- [Vite](./vite.md): the same table in a bundled app
- [Sizing the container](../../README.md#sizing-the-container): why the
  container needs a bounded height
