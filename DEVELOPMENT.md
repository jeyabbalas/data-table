# Development

Everything you need to hack on `@jeyabbalas/data-table` locally. For contribution workflow (issue reporting, PR etiquette, commit messages), see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Prerequisites

- **Node** ≥ 20 (declared in `package.json` `engines`). CI runs on **Node 20**; running Node 20 locally matches CI closest and is recommended. `.npmrc` sets `engine-strict=true`, so an older Node fails `npm install` outright rather than warning.
- **npm** 10 or newer (ships with Node 20+).
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

## Linting and formatting

```bash
npm run lint              # ESLint flat config
npm run lint:fix          # auto-fix mechanical issues
npm run format            # Prettier write
npm run format:check      # Prettier check (CI uses this)
npm run typecheck         # tsc --noEmit
```

ESLint config lives at [`eslint.config.js`](./eslint.config.js); the rule set
mixes `typescript-eslint` recommended-typed and stylistic with
`eslint-plugin-import`'s `no-cycle` and ordering checks. Prettier picks up
[`.prettierrc.json`](./.prettierrc.json); ignored paths live in
[`.prettierignore`](./.prettierignore). The `lint`/`format`/`typecheck`
scripts are gated in CI under the `Lint, typecheck, format, docs` job.

## Testing

```bash
npm test                  # watch mode
npm run test:coverage     # single run with v8 coverage (HTML report in coverage/)
```

`test:coverage` enforces the thresholds declared in
[`vitest.config.ts`](./vitest.config.ts). Phase-0 baselines are intentionally
loose; tighten them in Phase 9 of the review plan.

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
import { createDataTable } from '../src'; // or from '@/index'
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

These tests are the project's lightweight equivalent of running
[`api-extractor`](https://api-extractor.com/) — they fail CI on any
unintended addition, removal, or renaming of a public export, which is the
guard that matters most for a library with two entry points. Signature-level
diff tracking (`api-extractor`'s richer mode) isn't worth the config overhead
at this scale; if the surface ever grows to warrant it, layer `api-extractor`
on top of the existing snapshot without replacing it.

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
- `npm run docs:api` — regenerates [`docs/api/`](./docs/api/) from source JSDoc via [typedoc](https://typedoc.org/) + `typedoc-plugin-markdown`. Commit the resulting files alongside source changes so GitHub renders the refreshed reference without a build step.
- `npm run docs:api:check` — runs typedoc in non-emit mode to verify that generation succeeds (useful in a pre-commit or CI step after JSDoc edits).

### Generated API reference

`docs/api/` is the **exhaustive, generated** API reference — every public symbol from `src/index.ts` and `src/advanced.ts` with signatures, parameter types, and rendered `@example` blocks. It complements [`docs/api-reference.md`](./docs/api-reference.md), which stays a **curated, narrative** overview (options tables, event catalog, error codes).

- Source of truth: JSDoc on the `export`ed declarations.
- Regenerate after any JSDoc or signature change: `npm run docs:api`.
- Do not hand-edit files inside `docs/api/` — they're overwritten on the next generation.
- Typedoc is deliberately **not** wired into `npm run build`; keep the core build path lean and treat the generated reference as a pure-docs artifact.

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
  3. A `.changeset/*.md` file (`npx changeset`) describing the change. The
     [release workflow](./.github/workflows/release.yml) uses these to roll
     forward `CHANGELOG.md` automatically when versioning.
  4. An update to the API-surface snapshot (`npx vitest -u`).

## Release process

The repo uses [changesets](https://github.com/changesets/changesets) for
versioning and publishing. A push to `main` triggers
[`.github/workflows/release.yml`](./.github/workflows/release.yml), which
either opens a "Version Packages" PR (when one or more `.changeset/*.md`
files exist) or runs `changeset publish` once that PR merges. npm provenance
(`NPM_CONFIG_PROVENANCE=true`) is enabled in the workflow.

### One-time setup before the workflow can publish

The workflow is committed in a safe, secret-gated state:

1. Add an `NPM_TOKEN` repository secret with publish access to
   `@jeyabbalas/data-table`, **or** enable npm OIDC trusted publishing
   (recommended — see "Trusted publishing (npm OIDC)" below).
2. Settings → Actions → General → check **"Allow GitHub Actions to create
   and approve pull requests"** so the changesets action can open the
   "Version Packages" PR.

Until both are configured, the publish step is a no-op.

### Trusted publishing (npm OIDC)

OIDC trusted publishing replaces the long-lived `NPM_TOKEN` secret with
short-lived tokens minted by GitHub Actions per-publish. Recommended for
new repos — no secret rotation, smaller blast radius if the workflow is
compromised.

**Setup (one time, in this order):**

1. **npm side.** Visit
   `https://www.npmjs.com/package/@jeyabbalas/data-table/access`
   (or the package's "Settings" tab) and add a **Trusted Publisher**:
   - Provider: `GitHub Actions`
   - Repository: `jeyabbalas/data-table`
   - Workflow filename: `release.yml`
   - Job name: `release` (matches `.github/workflows/release.yml`)
   - Environment: leave blank (no `environment:` declared in the job)

2. **GitHub side.** The workflow already declares `permissions: id-token:
write` (required for OIDC token minting). Confirm by inspecting
   `.github/workflows/release.yml` — line ~43.

3. **Remove the legacy secret.** Once OIDC is verified working on the
   first publish, delete the `NPM_TOKEN` repository secret and remove the
   `NPM_TOKEN` env line from `release.yml`. `npm publish` (npm CLI ≥ 9.5)
   discovers the OIDC token automatically; provenance attestation is
   issued in the same step.

**Verifying without publishing.** Run `npm publish --dry-run --provenance`
locally — outside CI it prints a banner explaining the OIDC requirement.
The workflow's first real publish is the only smoke test for the trust
binding; rehearse the manual fallback (below) once before that publish so
you have a clean rollback path.

Until OIDC is configured AND the first publish succeeds, leave the
`NPM_TOKEN` secret in place as a fallback.

### Day-to-day flow

1. As part of every PR, run:
   ```bash
   npx changeset
   ```
   …and answer the prompts. The CLI writes a markdown file under `.changeset/`.
   Commit it alongside your code.
2. Merge the PR.
3. The release workflow opens (or updates) a `chore: version packages` PR
   that bumps `package.json` and prepends a fresh `CHANGELOG.md` section
   built from the changesets.
4. Review the version PR. Merge when ready.
5. The workflow runs `changeset publish` against npm with provenance, and
   tags the commit.

### Manual fallback

If GitHub Actions is unavailable:

```bash
npm run typecheck && npm run lint && npm run format:check
npm run test:coverage
npm run build
npx changeset version            # bumps package.json, writes CHANGELOG
npx changeset publish            # publishes; --provenance comes from .npmrc / env
git push && git push --tags
```

`prepublishOnly` runs `npm run build && npm run test:coverage` as a final
guard against publishing a broken artifact.

## Troubleshooting the dev loop

- **`check:css-vars` fails after editing `src/styles/*`.** The script prints the exact list of missing or extra variables. Update the `--dt-*` reference table in `docs/guides/theming.md` to match, then re-run `npm run check:css-vars`.
- **`tsc --noEmit` fails on CodeMirror or DuckDB imports.** Peer-dependency `devDependencies` weren't installed. Re-run `npm install`.
- **Tests hang or fail on IndexedDB.** Import `fake-indexeddb/auto` _before_ the module under test; the library checks for `globalThis.indexedDB` at module load time.
- **Demo server shows a 404 at `/`.** The base path is `/data-table/`, not `/`. Open `http://localhost:5173/data-table/`.
- **`axe-core` flags a violation in a new component.** Check roles, labels, and keyboard focus — the grid (`role="grid"`) exposes `aria-rowcount` / `aria-colcount` / `aria-rowindex` / `aria-colindex`, and modals require a focus trap via `ModalHost`. See [`docs/guides/accessibility.md`](./docs/guides/accessibility.md).
