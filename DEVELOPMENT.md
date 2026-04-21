# Development

Everything you need to hack on `@jeyabbalas/data-table` locally. For contribution workflow (issue reporting, PR etiquette, commit messages), see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Prerequisites

- **Node** ≥ 18 (declared in `package.json` `engines`). CI runs on **Node 20**; running Node 20 locally matches CI closest and is recommended.
- **npm** 9 or newer (ships with Node 18+).
- **Git**.
- A modern Chromium-, Gecko-, or WebKit-based browser for the dev server. DuckDB-WASM does not require cross-origin isolation headers (no COOP/COEP) for this library's use cases — plain `http://localhost` works.

## Clone and install

```bash
git clone https://github.com/jeyabbalas/data-table.git
cd data-table
npm install
```

All peer dependencies (`@codemirror/*`, `@duckdb/duckdb-wasm`, `@lezer/highlight`) are also listed under `devDependencies`, so a single `npm install` gives you a complete dev environment. Consumers of the published package install the peers themselves (they're declared `optional` in `peerDependenciesMeta`).

## Run the demo and examples

```bash
npm run dev
```

Opens Vite at `http://localhost:5173/data-table/` (the base path is set in `vite.demo.config.ts`).

Available routes:

- `/` — the full demo app (`index.html` at repo root), which is the richest working reference for the library.
- `/examples/` — the examples landing page (`examples/index.html`) linking to each runnable example.
- `/examples/NN-name/` — individual examples (`examples/01-minimal/` … `examples/09-multi-table/`), each with its own `index.html`, `main.ts`, and `README.md`.

During dev, `@jeyabbalas/data-table` resolves to `src/index.ts` and `@jeyabbalas/data-table/advanced` resolves to `src/advanced.ts` — no prebuild step is needed for source changes to appear.

## Testing

```bash
npm test                  # watch mode
npm run test:coverage     # single run with v8 coverage (HTML report in coverage/)
```

Run a single test file:

```bash
npx vitest run tests/DataTable.lifecycle.test.ts
```

Filter by test name:

```bash
npx vitest run -t "destroys cleanly"
```

### Where tests live

- All tests live under `tests/`, mirroring the `src/` directory layout (`tests/core/`, `tests/filters/`, `tests/visualizations/`, `tests/a11y/`, `tests/worker/`, and so on).
- Fixtures (CSV, JSON, Parquet) are in `tests/fixtures/datasets/`.
- Test files use the `*.test.ts` suffix (matched by `vitest.config.ts`).

### Test environment

- The default environment is `node`. Tests that need DOM primitives opt in per-file with a directive at the top of the file:

  ```ts
  // @vitest-environment jsdom
  ```

- Persistence tests import `fake-indexeddb` before the module under test to provide an in-memory IndexedDB implementation.
- Accessibility assertions use `axe-core`.

### Adding a test

Create a file that mirrors the source-module path under `tests/`. Import from the `src/` tree directly — Vitest's alias (`@` → `src/`) is configured in `vitest.config.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDataTable } from '../src';   // or from '@/index'
```

Vitest globals (`describe`, `it`, `expect`, `beforeEach`) are enabled, so you don't need to import them.

### API-surface tests

Two tests lock the exported symbol list of the root and `/advanced` entries:

- `tests/api-surface.snapshot.test.ts` — snapshot of all exports.
- `tests/api-surface.exports.test.ts` — explicit Tier-1 / Tier-2 / Tier-3 guards.

Any intentional change to the public surface requires regenerating the snapshot:

```bash
npx vitest -u
```

Mention the update in the PR description.

## Building

```bash
npm run build
```

Runs four steps in order:

1. **`check:css-vars`** — runs `scripts/check-css-vars.mjs`, which verifies that the `--dt-*` variable table in `docs/guides/theming.md` is in sync with the CSS sources under `src/styles/`. If it fails, the error message tells you exactly which variables are missing or extra.
2. **`tsc --noEmit`** — full type-check using `tsconfig.json`.
3. **`vite build`** — bundles the library. Outputs:
   - `dist/data-table.js` (ESM)
   - `dist/data-table.cjs` (CommonJS)
   - `dist/data-table.css` (bundled stylesheet)
4. **`tsc -p tsconfig.build.json`** — emits declaration files:
   - `dist/index.d.ts`, `dist/advanced.d.ts`, and subtree `.d.ts` files.

Only the `dist/` directory ships to npm (`files: ["dist"]` in `package.json`).

### Other build scripts

- `npm run build:demo` — builds the static demo site into `demo-dist/` (used by the Pages deploy workflow).
- `npm run preview` — serves the built demo from `demo-dist/`.
- `npm run check:css-vars` — runs the CSS-variable sync check in isolation (useful after editing `src/styles/`).

## Project layout

```
src/
  index.ts              # Tier-1 public API (createDataTable, errors, essential types)
  advanced.ts           # Tier-2 public API (lower-level building blocks)
  DataTable.ts          # façade implementation
  core/                 # signals, events, state, actions, browser-support probe, strings
  filters/              # filter types, UI, SQL translation
  derived/              # derived-column expression + vector pipelines
  visualizations/       # built-in visualizations and registry
  persistence/          # SessionStore, AutoSave, snapshot serializers
  table/                # grid, virtual scroller, column resizer, modal host
  export/               # export dialog, CSV/JSON/Parquet writers
  styles/               # modular CSS (source of --dt-* variable truth)
tests/                  # vitest suites mirroring src/
examples/               # 9 runnable single-feature examples
docs/                   # API reference, guides, concepts, integrations, troubleshooting
demo/                   # integrated showcase app
scripts/                # build-support scripts (check-css-vars.mjs)
vite.config.ts          # library build (targets dist/)
vite.demo.config.ts     # demo + examples dev/build (targets demo-dist/)
vitest.config.ts        # test runner config
tsconfig.json           # type-check config (used by tsc --noEmit)
tsconfig.build.json     # declaration emit config (used by the build)
```

For the reactive/worker/crossfilter architecture, see [`docs/concepts/architecture.md`](./docs/concepts/architecture.md) rather than duplicating here.

## Coding conventions

- **CSS class prefix** — every rendered element uses the `dt-` prefix (configurable per instance via the `classPrefix` option). Do not introduce unprefixed class names into `src/styles/` or inline DOM markup.
- **Reactivity** — internal signals use `createSignal` / `computed` / `batch` from `src/core/`. These are intentionally not re-exported; don't expose them in the public API.
- **Worker protocol** — all DuckDB work happens inside a Web Worker, accessed via RPC through `WorkerBridge`. Message shapes are internal.
- **Errors** — always throw a subclass of `DataTableError` with a `SCREAMING_SNAKE_CASE` `code`. Use native `Error.cause` to chain underlying errors so the root cause isn't lost.
- **Logging** — do not `console.log` in library code. Emit a `warning` event (with a `code`) for recoverable conditions the embedder might want to see, and an `error` event for thrown exceptions surfaced through the event bus.
- **Public API additions require**:
  1. JSDoc on the export (at minimum a one-sentence description and an `@example` block).
  2. An entry in [`docs/api-reference.md`](./docs/api-reference.md).
  3. A changelog entry under `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md).
  4. An update to the API-surface snapshot (`npx vitest -u`).

## Release process

1. Verify `main` is green:
   ```bash
   npm test
   npm run build
   ```
2. Update [`CHANGELOG.md`](./CHANGELOG.md):
   - Rename `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD`.
   - Add a fresh, empty `## [Unreleased]` block above it (with the standard subsection headings).
3. Bump the version (this also creates a git tag):
   ```bash
   npm version X.Y.Z
   ```
4. Publish:
   ```bash
   npm publish --access public
   ```
   The `--access public` flag is required for scoped packages (`@jeyabbalas/…`) on first publish; it's saved for subsequent publishes of the same package.
5. Push the commit and tag:
   ```bash
   git push && git push --tags
   ```
6. Create a GitHub Release from the new tag and copy the corresponding `CHANGELOG.md` entry into the release notes.
7. Verify the new version appears on https://www.npmjs.com/package/@jeyabbalas/data-table and that `npm install @jeyabbalas/data-table@X.Y.Z` resolves against a clean registry cache.

## Troubleshooting the dev loop

- **`check:css-vars` fails after editing `src/styles/*`.** The script prints the exact list of missing or extra variables. Update the `--dt-*` reference table in `docs/guides/theming.md` to match, then re-run `npm run check:css-vars`.
- **`tsc --noEmit` fails on CodeMirror or DuckDB imports.** Peer-dependency `devDependencies` weren't installed. Re-run `npm install`.
- **Tests hang or fail on IndexedDB.** Import `fake-indexeddb/auto` *before* the module under test; the library checks for `globalThis.indexedDB` at module load time.
- **Demo server shows a 404 at `/`.** The base path is `/data-table/`, not `/`. Open `http://localhost:5173/data-table/`.
- **`axe-core` flags a violation in a new component.** Check roles, labels, and keyboard focus — the grid (`role="grid"`) exposes `aria-rowcount` / `aria-colcount` / `aria-rowindex` / `aria-colindex`, and modals require a focus trap via `ModalHost`. See [`docs/guides/accessibility.md`](./docs/guides/accessibility.md).
