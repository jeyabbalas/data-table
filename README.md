# @jeyabbalas/data-table

A client-side TypeScript library for interactive, explorable data tables.
Built on [DuckDB WASM](https://duckdb.org/docs/api/wasm/overview) — all
analytics run entirely in the browser, so no data ever leaves the user's
machine.

- Per-column visualizations (histograms, value counts, date/time histograms)
  with brush/click crossfilter
- Manual filter UI per column + raw-SQL `WHERE` filters
- Pin / hide / reorder / resize columns; virtual scrolling
- Derived columns (SQL expressions or JS-provided value vectors), with
  same-name dependency-aware replacement
- Stable synthetic `__rowid__` + read-only column export
  (`actions.getColumnValues`) for app-side row alignment and chart feeds
- Programmatic row / column / cell annotations — severity tiers, intersection
  popover, JSON round-trip, session-persisted
- Programmatic column-header tooltips — XSS-safe structured popover
  (title / description / items + enum chips)
- Custom column-stats panels — replace the built-in two-line stats
  display in a column header with your own DOM and DuckDB queries via
  `BaseStatsPanel` + per-instance `StatsPanelRegistry`
- Public CodeMirror SQL editor primitives — embed a schema- and
  DuckDB-aware SQL editor anywhere in your own UI shell via
  `createSqlExtensions` / `buildCompletionContext` (filter-preset
  composers, derived-column wizards, query-template editors); live or
  literal schema, optional library theme
- Filter presets (import/export JSON)
- Undo/redo and IndexedDB session persistence
- CSV / JSON / Parquet export
- Automatic light/dark mode via CSS custom properties

## Install

```bash
npm install @jeyabbalas/data-table \
  @duckdb/duckdb-wasm \
  @codemirror/autocomplete @codemirror/commands @codemirror/lang-sql \
  @codemirror/language @codemirror/state @codemirror/view @lezer/highlight
```

`@duckdb/duckdb-wasm` is a required peer dependency. The `@codemirror/*`
and `@lezer/*` packages are optional peers — install them only if you use
the default SQL expression editor (for derived columns and raw-SQL filters).
If you supply your own `editorFactory` or disable those features, you can
omit them.

## Quick start

```ts
import { createDataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const table = await createDataTable({
  container: document.getElementById('my-table')!,
  source: myCsvFileOrUrl, // File | string URL | ArrayBuffer | Blob
});

table.on('filterChange', ({ filters, filteredRowCount }) => {
  console.log(`${filters.length} filters, ${filteredRowCount} rows match`);
});

// When unmounting (e.g., route change in an SPA):
await table.destroy();
```

For file pickers, URL inputs, or "swap dataset" flows, mount once and load
on user action — no `destroy()`/recreate dance needed:

```ts
const table = await createDataTable({
  container: document.getElementById('my-table')!,
});

document.getElementById('file-picker')!.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await table.loadData(file);
});
```

`loadData(source)` accepts a `File`, an absolute URL (`https://…`,
`http://…`, `file:`, `data:`, `blob:`), a protocol-relative URL
(`//host/…`), a root-relative path (`/data.csv`), a dot-prefixed relative
path (`./data.csv`, `../data.csv`), an `ArrayBuffer`, a `Blob`, or inline
CSV/JSON content (multi-line text, or a string starting with `[` / `{`).
Relative URLs resolve against `window.location` — the same way `<img src>`
and `fetch` behave. Ambiguous strings (a single-line `sample.csv` with no
leading slash, for example) throw `LoadError` with code `SOURCE_AMBIGUOUS`
rather than silently parsing the literal text as CSV content.

Probe required browser APIs before mounting:

```ts
import { checkBrowserSupport } from '@jeyabbalas/data-table';

const support = checkBrowserSupport();
if (!support.supported) {
  renderUnsupportedScreen(support.missing); // ['Worker', 'WebAssembly', …]
  return;
}
// safe to call createDataTable(...) here
```

The library is **ESM-only** since v0.4.0. Use `import` syntax (every modern
bundler — Vite, webpack 5, Rollup, esbuild, Bun — resolves the ESM build
by default). It is browser-only and not safe to evaluate during SSR — see
[Framework integration](#framework-integration) below for client-side
mounting patterns.

## Documentation

Full documentation lives under [`docs/`](./docs/README.md). A quick index:

**Start here**

- Quick start (above) · [Runnable examples](./examples/README.md)
- [AGENTS.md](./AGENTS.md) — agent-facing guide: capability matrix, clarifying-question checklist, canonical snippets, pitfalls

**Reference**

- [API reference](./docs/api-reference.md) — every option, event, action, error, filter shape, derived-column type
- [Troubleshooting](./docs/troubleshooting.md) — 34 error codes and 19 common-issue FAQs with fix snippets

**Guides**

- [Loading data](./docs/guides/loading-data.md) · [Filters](./docs/guides/filters.md) · [Derived columns](./docs/guides/derived-columns.md) · [Events](./docs/guides/events.md)
- [Annotations](./docs/guides/annotations.md) · [Column-header tooltips](./docs/guides/column-header-tooltips.md) · [Visualizations](./docs/guides/visualizations.md) · [Stats panels](./docs/guides/stats-panels.md) · [SQL editor primitives](./docs/guides/sql-editor-primitives.md)
- [Session persistence](./docs/guides/session-persistence.md) · [Theming](./docs/guides/theming.md) · [i18n](./docs/guides/i18n.md) · [Accessibility](./docs/guides/accessibility.md) · [Multi-table dashboards](./docs/guides/multi-table.md)
- [CSP and offline](./docs/guides/csp-and-offline.md) · [Filter presets](./docs/guides/filter-presets.md)

**Concepts**

- [Architecture](./docs/concepts/architecture.md) · [State model](./docs/concepts/state-model.md)

**Integrations**

- Frameworks: [React](./docs/integrations/react.md) · [Vue](./docs/integrations/vue.md) · [Svelte](./docs/integrations/svelte.md) · [Solid](./docs/integrations/solid.md) · [Next.js](./docs/integrations/nextjs.md) · [Nuxt](./docs/integrations/nuxt.md)
- Bundlers: [Vite](./docs/integrations/vite.md) · [Webpack](./docs/integrations/webpack.md) · [CDN (no-build)](./docs/integrations/cdn.md)

**Source**

- Tier-1 exports live in [`src/index.ts`](./src/index.ts); Tier-2 in [`src/advanced.ts`](./src/advanced.ts).

## Framework integration

The library is **browser-only** — it uses Web Workers, `window`, `document`,
and IndexedDB directly, and is not safe to evaluate during SSR. Mount the
table inside your framework's client-side lifecycle hook.

### React

```tsx
import { useEffect, useRef } from 'react';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

export function Table({ source }: { source: File | string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    let instance: DataTable | undefined;
    void createDataTable({ container: hostRef.current, source }).then((t) => {
      if (cancelled) {
        void t.destroy();
        return;
      }
      instance = t;
    });
    return () => {
      cancelled = true;
      if (instance && !instance.isDestroyed()) void instance.destroy();
    };
  }, [source]);
  return <div ref={hostRef} style={{ height: 600 }} />;
}
```

The `cancelled` flag handles the case where the effect re-runs before
`createDataTable` resolves. `isDestroyed()` guards against double destroys
when React's Strict Mode double-invokes effects in dev.

### Vue 3

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const host = ref<HTMLElement | null>(null);
let table: DataTable | undefined;

onMounted(async () => {
  if (host.value) table = await createDataTable({ container: host.value, source: props.source });
});
onBeforeUnmount(async () => {
  if (table && !table.isDestroyed()) await table.destroy();
});
</script>

<template>
  <div ref="host" style="height: 600px" />
</template>
```

After `destroy()`, the public methods (`loadData`, `on`, `off`,
`openExportDialog`, `clearSession`, `setColorScheme`) throw `DestroyedError`.
Check `table.isDestroyed()` in long-lived closures before calling them.

## Feature toggles

All features are on by default; pass `false` or a config object to customize:

| Option             | Default | Notes                                                              |
| ------------------ | ------- | ------------------------------------------------------------------ |
| `persistence`      | `true`  | Auto-save filters/sort/columns to IndexedDB                        |
| `presets`          | `true`  | Show the "Presets" button for saving filter sets                   |
| `undoRedo`         | `true`  | Ctrl/Cmd+Z and Ctrl+Y keyboard shortcuts                           |
| `expressionFilter` | `true`  | Show the "Expression" (raw SQL) filter button                      |
| `derivedColumns`   | `true`  | Show the "+" add-column button and per-header `f(x)` edit icon     |
| `visualizations`   | `true`  | Auto-attach column header histograms / value counts                |
| `exportDialog`     | `true`  | `table.openExportDialog()` opens a CSV/JSON/Parquet modal          |

For the full options surface (mounting, worker, UI, customization), see
[docs/api-reference.md#createdatatableoptions](./docs/api-reference.md#createdatatableoptions).

### Skipping CodeMirror

When both `expressionFilter: false` and `derivedColumns: false` are set, the
library no longer reaches the CodeMirror-bound modals at runtime. Consumers in
this configuration can omit the `@codemirror/*` and `@lezer/highlight` peer
dependencies (already marked `optional` in `peerDependenciesMeta`) — modern
bundlers chunk-split the modals into separate runtime modules that the
unreachable code paths never load. The programmatic API
(`actions.addFilter({ type: 'raw-sql' })`, `actions.addDerivedColumn`,
`FilterPresetManager`) keeps working in this mode. When the flags are on, the
first click of an SQL or derived-column button now fetches a small modal chunk
on demand instead of loading it eagerly on table mount.

## Events

Subscribe with `table.on(event, handler)` — returns an unsubscribe function.
The event bus covers `ready`, `loadStart` / `loadProgress` / `loadComplete` /
`loadError`, `filterChange`, `sortChange`, `selectionChange`, `columnChange`,
`derivedChange` (with a `kind: 'added' | 'removed' | 'replaced' | 'updated'`
discriminator and the affected `columnName`), `undoChange`, `destroy`, plus
`error` and `warning` for recoverable failure modes. Annotation mutations
flow through a separate `table.annotations.on('change', …)` channel — see
the [annotations guide](./docs/guides/annotations.md). For payload types
see [docs/api-reference.md#event-catalog](./docs/api-reference.md#event-catalog).

## Theming

All colors, spacing, typography, and z-indices are driven by CSS custom
properties (74 `--dt-*` tokens — covering the full palette, sizing scale,
z-index stacking ladder, annotation severity tints, and column-header
tooltip layering). Override the ones you care about on `:root`, on a
per-instance element, or at runtime.

```css
:root {
  --dt-primary: #10b981;
  --dt-radius: 4px;
  --dt-z-modal: 1500; /* raise above your app's modal layer */
  --dt-panel-width: 420px; /* widen filter / preset / derived-edit panels */
}
```

Light/dark mode follows `prefers-color-scheme` by default. Pass
`colorScheme: 'light' | 'dark' | 'auto'` to force a theme, or call
`table.setColorScheme(...)` at runtime; body-portalled modals stay in sync.

See **[docs/guides/theming.md](./docs/guides/theming.md)** for the complete
variable reference with light/dark defaults side-by-side, the dark-mode
scoping model, stacking-ladder deep-dive, and per-instance override patterns.

## CSS isolation

All selectors carry the `dt-` prefix. Column-drag cursor, CodeMirror
autocomplete, and modal stacking are all scoped so they don't collide with
host styles. For stricter isolation (two copies of the library on one page,
strict brand walls), pass `classPrefix: 'myapp-dt'` and every selector,
modal, and tooltip re-renders with that prefix.

Shadow DOM is intentionally not used — modals portal into light DOM so they
can inherit `--dt-*` variables from `:root`. Wrap the library in a shadow
root yourself if you need that, and forward the theme variables +
`portalTarget` accordingly.

## Error handling

Every error extends `DataTableError` (which extends `Error`). Subscribe to
the `error` event to route by subsystem, or to `warning` for non-fatal
degradations like `STYLESHEET_MISSING` / `PERSISTENCE_UNAVAILABLE`:

```ts
table.on('error', ({ error, source }) => {
  if (error.code === 'PARSE_FAILED') toast('Could not read that file.');
  else if (source === 'persistence') console.warn(error);
  else reportToSentry(error);
});
```

For the full list of 34 error codes with triggers and fixes, see
[docs/troubleshooting.md](./docs/troubleshooting.md).

## Multiple tables, CSP, and offline

- **Multiple tables:** share a `WorkerBridge` (and optionally a
  `SessionStore` / `FilterPresetManager`) to avoid spinning up two DuckDB
  instances. Give each table a distinct `tableName` so session snapshots
  don't clobber each other.
- **CSP / air-gapped:** self-host the worker and WASM bundles and pass
  `bridgeOptions.workerFactory` + `bridgeOptions.duckdbBundles`.

See [AGENTS.md §3(h)](./AGENTS.md#3-canonical-snippets) for a shared-bridge
snippet, and [docs/troubleshooting.md §4](./docs/troubleshooting.md#4-duckdb-cdn-blocked-by-csp)
for the CSP recipe.

## Accessibility

The grid targets WCAG 2.1 AA: `role="grid"` with `aria-rowcount` /
`aria-colcount`, roving-tabindex arrow-key navigation, polite `aria-live`
announcements on filter/sort/row-count changes, focus trap + escape-to-close
on every modal, and `axe-core` as a CI gate. Known out-of-scope: in-cell
editing, mobile touch gestures, RTL.

## Custom visualizations

Subclass `BaseVisualization` (from `/advanced`) and register on a
per-instance `VisualizationRegistry`:

```ts
import { createDataTable, VisualizationRegistry } from '@jeyabbalas/data-table';
import { BaseVisualization } from '@jeyabbalas/data-table/advanced';

class MyViz extends BaseVisualization {
  /* fetchData, render, … */
}

const registry = new VisualizationRegistry();
registry.register({
  name: 'my-viz',
  isApplicable: (t) => t === 'float',
  constructor: MyViz as any,
  priority: 10,
});
const table = await createDataTable({ container, source, visualizationRegistry: registry });
```

Runnable version in [examples/08-custom-visualization](./examples/08-custom-visualization/).

## Internationalization

Every user-facing string comes from a typed `Strings` object. Pass a
`DeepPartial<Strings>` via `messages`; missing keys fall back to English
defaults. Messages are resolved once at construction — recreate the table
to switch locales.

```ts
await createDataTable({
  container,
  source,
  messages: {
    common: { close: 'Fermer', apply: 'Appliquer' },
    filters: { panelTitle: 'Filtres' },
  },
});
```

Runnable version in [examples/07-i18n-french](./examples/07-i18n-french/).

## Browser support

| API               | Used for                                                   |
| ----------------- | ---------------------------------------------------------- |
| `Worker`          | DuckDB runs in a dedicated worker                          |
| `WebAssembly`     | DuckDB is compiled to Wasm                                 |
| `IndexedDB`       | Session persistence (skipped when `persistence: false`)    |
| `ResizeObserver`  | Column resize, responsive visualizations                   |
| `BigInt`          | DuckDB integer columns cross the worker boundary as BigInt |
| `structuredClone` | Bridge snapshots result sets                               |

Roughly Chrome/Edge 98+, Firefox 94+, Safari 15.4+. Probe at runtime with
`checkBrowserSupport()` or opt into fail-fast init via
`strictBrowserCheck: true`. See
[docs/api-reference.md#browser-support-probe](./docs/api-reference.md#browser-support-probe).

## Advanced: modular API

The root entry (`@jeyabbalas/data-table`) exposes the facade plus a small
set of stable hooks. Power users who want to orchestrate the stack directly
— custom visualization lifecycles, headless use, driving the bridge
themselves — can import the building blocks from `/advanced`:

```ts
import {
  TableContainer,
  FilterBar,
  ExportDialog,
  BaseVisualization /* … */,
} from '@jeyabbalas/data-table/advanced';
```

The `/advanced` surface trades stability for flexibility: it is **not**
covered by the same semver guarantees as the root entry. See
[docs/api-reference.md#tier-2-exports](./docs/api-reference.md#tier-2-exports)
for the full symbol list.

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for local setup, testing, the build pipeline, and the release workflow. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to report bugs and submit changes.

## License

MIT
