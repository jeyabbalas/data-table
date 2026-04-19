# @jeyabbalas/data-table

A client-side TypeScript library for interactive, explorable data tables.
Built on [DuckDB WASM](https://duckdb.org/docs/api/wasm/overview) — all
analytics run entirely in the browser, so no data ever leaves the user's
machine.

- Per-column visualizations (histograms, value counts, date/time histograms)
  with brush/click crossfilter
- Manual filter UI per column + raw-SQL `WHERE` filters
- Pin / hide / reorder / resize columns; virtual scrolling
- Derived columns (SQL expressions or JS-provided value vectors)
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
  source: myCsvFileOrUrl,      // File | string URL | ArrayBuffer | Blob
  persistence: true,
  presets: true,
  undoRedo: true,
});

table.on('filterChange', ({ filters, filteredRowCount }) => {
  console.log(`${filters.length} filters, ${filteredRowCount} rows match`);
});

// When unmounting (e.g., route change in an SPA):
await table.destroy();
```

`createDataTable` resolves once the worker is ready AND the initial `source`
(if supplied) has loaded — so by the time you get the `DataTable`, the UI is
fully populated.

## Framework integration

The library is **browser-only** — it uses Web Workers, `window`, `document`,
and IndexedDB directly, and is not safe to evaluate during SSR. Mount the
table inside your framework's client-side lifecycle hook.

### React

```tsx
import { useEffect, useRef, useState } from 'react';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

export function Table({ source }: { source: File | string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState<DataTable | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    let instance: DataTable | undefined;

    void createDataTable({ container: hostRef.current, source }).then((t) => {
      if (cancelled) { void t.destroy(); return; }
      instance = t;
      setTable(t);
    });

    return () => {
      cancelled = true;
      if (instance && !instance.isDestroyed()) void instance.destroy();
    };
  }, [source]);

  return <div ref={hostRef} style={{ height: 600 }} />;
}
```

The `cancelled` flag handles the case where the effect re-runs before the
`createDataTable` promise resolves. `isDestroyed()` guards against double
destroys when React's Strict Mode double-invokes effects in dev.

### Vue 3

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const host = ref<HTMLElement | null>(null);
let table: DataTable | undefined;

onMounted(async () => {
  if (!host.value) return;
  table = await createDataTable({ container: host.value, source: props.source });
});

onBeforeUnmount(async () => {
  if (table && !table.isDestroyed()) await table.destroy();
});
</script>

<template>
  <div ref="host" style="height: 600px" />
</template>
```

### Closure-capture guard

If you stash `table` in a long-lived closure (event handler, interval, external
subscription), check `table.isDestroyed()` before calling methods. After
`destroy()`, the public methods (`loadData`, `on`, `off`, `openExportDialog`,
`clearSession`, `setColorScheme`) throw `DestroyedError`.

## Feature toggles

All features are on by default; pass `false` or a config object to customize:

| Option              | Default | Notes                                                 |
|---------------------|---------|-------------------------------------------------------|
| `persistence`       | `true`  | Auto-save filters/sort/columns to IndexedDB           |
| `presets`           | `true`  | Show the "Presets" button for saving filter sets      |
| `undoRedo`          | `true`  | Ctrl/Cmd+Z and Ctrl+Y keyboard shortcuts              |
| `expressionFilter`  | `true`  | Show the "Expression" (raw SQL) filter button         |
| `visualizations`    | `true`  | Auto-attach column header histograms / value counts   |
| `exportDialog`      | `true`  | `table.openExportDialog()` opens a CSV/JSON/Parquet modal |

Other options worth knowing:

| Option               | Purpose                                                       |
|----------------------|---------------------------------------------------------------|
| `portalTarget`       | Where fixed-position modals mount (default `document.body`)   |
| `bridge`             | Share a `WorkerBridge` across multiple tables (one worker)    |
| `bridgeOptions`      | Pass `{ initializeTimeoutMs, cache }` if you own the bridge   |
| `editorFactory`      | Swap out the CodeMirror SQL editor for a custom one           |
| `classPrefix`        | CSS class prefix (default `'dt'`)                             |
| `rowHeight` / `headerHeight` | Pixel sizes                                           |

## Events

Consumers subscribe with `table.on(event, handler)` — returns an unsubscribe
function. See `src/core/TableEvents.ts` for full payloads.

- `ready` — worker initialized
- `loadStart` / `loadProgress` / `loadComplete` / `loadError`
- `filterChange` — `{ filters, filteredRowCount, totalRowCount }`
- `sortChange` — `{ sortColumns }`
- `selectionChange` — `{ selectedRows: Set<number> }`
- `columnChange` — `{ visibleColumns, pinnedColumns, columnOrder }`
- `derivedChange` — `{ derivedColumns }`
- `undoChange` — `{ canUndo, canRedo }`
- `destroy` — the library is tearing down

Two additional events cover recoverable failure modes:

- `error` — any typed `DataTableError` the library catches at runtime, plus a
  `source` discriminator (`'load' | 'query' | 'export' | 'persistence' |
  'visualization' | 'sql-validation' | 'derived-column' | 'listener' |
  'unknown'`). See [Error handling](#error-handling) for the full pattern.
- `warning` — non-fatal degraded-mode signals (e.g., `STYLESHEET_MISSING`,
  `PERSISTENCE_UNAVAILABLE`) with a `code`, `message`, and optional `details`.

Power users can still read reactive signals off `table.state` (exported as the
`TableState` type), but the event bus is the supported surface for embedders.

## Theming

All colors, spacing, and typography are driven by CSS custom properties on
`:root`. Override globally:

```css
:root {
  --dt-primary: #10b981;
  --dt-radius: 4px;
  --dt-z-modal: 1500;       /* if your app's modal layer sits at z-index 1000 */
  --dt-panel-width: 420px;  /* widen filter, preset, and derived-edit panels */
}
```

Floating-panel width (filter panel, preset panel, derived-column edit panel)
is driven by `--dt-panel-width` (default `320px`). Override at `:root` or on
any scoped ancestor — the TS-side edge-clamp measures the live width via
`offsetWidth`, so overrides don't cause panels to overflow the table.

…or per-instance by adding a class to the table element:

```html
<div id="my-table" class="dt-root mint-theme"></div>
<style>
  .dt-root.mint-theme {
    --dt-primary: #10b981;
  }
</style>
```

### Light / dark mode

By default the library follows the OS `prefers-color-scheme` media query.
Pass `colorScheme` to `createDataTable` to force a theme per instance, or
call `table.setColorScheme(...)` at runtime to respond to your own theme
toggle:

```ts
const table = await createDataTable({
  container,
  source,
  colorScheme: 'dark',           // 'light' | 'dark' | 'auto' (default)
});

myThemeToggle.addEventListener('change', (e) => {
  table.setColorScheme(e.target.value); // 'light' | 'dark' | 'auto'
});
```

`'light'` / `'dark'` set `data-dt-color-scheme="..."` on the `.dt-root`
element (overriding the OS preference for that instance); `'auto'` clears
the attribute and defers to `prefers-color-scheme`. Body-portalled modals
(export dialog, SQL filter modal, derived-column modal) observe the
attribute via `MutationObserver` so they stay in sync when the theme flips
while a modal is open.

### Variable reference

<!-- dt-vars:start -->

Every CSS custom property the library reads. All default to light-mode
values declared on `:root`; dark-mode variants apply automatically under
`prefers-color-scheme: dark` (unless the instance carries
`data-dt-color-scheme="light"`) and unconditionally under
`data-dt-color-scheme="dark"`.

#### Palette

| Variable | Role |
|---|---|
| `--dt-primary` | Accent colour for focused UI, buttons, sort indicators. |
| `--dt-primary-hover` | Hover state for `--dt-primary`. |
| `--dt-primary-light` | Light wash behind active rows/filters. |
| `--dt-primary-lighter` | Lighter wash for selected-row backgrounds. |
| `--dt-primary-alpha-10` | 10% alpha of `--dt-primary` (derived via `color-mix`). |
| `--dt-primary-alpha-20` | 20% alpha of `--dt-primary`. |
| `--dt-primary-alpha-30` | 30% alpha of `--dt-primary`. |
| `--dt-primary-alpha-50` | 50% alpha of `--dt-primary`. |
| `--dt-accent` | Secondary accent (null bars, warning chrome). |
| `--dt-accent-hover` | Hover state for `--dt-accent`. |
| `--dt-accent-soft` | Soft translucent version of `--dt-accent`. |
| `--dt-neutral` | Neutral slate for ValueCounts "Other" category. |
| `--dt-neutral-hover` | Hover state for `--dt-neutral`. |
| `--dt-neutral-soft` | Soft translucent version of `--dt-neutral`. |
| `--dt-success` | Success indicator colour (e.g. validated SQL). |

#### Surfaces

| Variable | Role |
|---|---|
| `--dt-bg` | Primary table background. |
| `--dt-bg-secondary` | Secondary background (header, filter bar). |
| `--dt-bg-tertiary` | Tertiary background (hover rows, input fills). |
| `--dt-border` | Primary border colour. |
| `--dt-border-light` | Subtle border for nested components. |
| `--dt-backdrop` | Modal scrim (semi-transparent). |

#### Text & icons

| Variable | Role |
|---|---|
| `--dt-text` | Default text colour. |
| `--dt-text-secondary` | Secondary / caption text. |
| `--dt-text-tertiary` | Tertiary / placeholder text. |
| `--dt-arrow-default` | Idle colour for sort/expand icons. |
| `--dt-arrow-hover` | Hover colour for sort/expand icons. |

#### Error / validation

| Variable | Role |
|---|---|
| `--dt-error` | Base error colour. |
| `--dt-error-dark` | Darker error accent (button hover, text). |
| `--dt-error-darker` | Strongest error accent. |
| `--dt-error-soft` | Soft translucent error wash. |
| `--dt-error-bg` | Error surface background (banners, panels). |
| `--dt-error-border-soft` | Soft border for error banners. |
| `--dt-error-text-strong` | Strong error text for dark-mode legibility. |
| `--dt-on-error` | Foreground on error-coloured surfaces. |

#### Sizing

| Variable | Default | Role |
|---|--:|---|
| `--dt-header-height` | `120px` | Column header area height (room for visualizations). |
| `--dt-row-height` | `32px` | Virtual-scroller row height. |
| `--dt-col-width` | `200px` | Default column width. |
| `--dt-scrollbar-width` | `17px` | Reserved gutter for the body's vertical scrollbar. |
| `--dt-panel-width` | `320px` | Floating-panel (filter / preset / derived-edit) width. |
| `--dt-radius` | `8px` | Default border radius. |
| `--dt-radius-sm` | `4px` | Small border radius (buttons, chips). |

#### Typography

| Variable | Role |
|---|---|
| `--dt-font-family` | Font family for all library chrome. |
| `--dt-font-size` | Base font size. |
| `--dt-font-size-sm` | Small font size (filter chips, hints). |
| `--dt-font-size-xs` | Extra-small font size (stats captions). |

#### Effects

| Variable | Role |
|---|---|
| `--dt-transition` | Shared transition timing (`0.15s ease`). |
| `--dt-shadow-sm` | Small elevation shadow. |
| `--dt-shadow-md` | Medium elevation shadow (panels, modals). |

#### Syntax highlighting

| Variable | Role |
|---|---|
| `--dt-syntax-string` | String literals in the SQL editor. |
| `--dt-syntax-type` | Type keywords in the SQL editor. |

#### Stacking ladder

Every `z-index` in the library goes through a `--dt-z-*` variable, so you
can interleave your own layers without hunting through the stylesheet.
Defaults:

| Variable | Default | Layer |
|---|--:|---|
| `--dt-z-table-body` | `1` | Table body cells (focused cells, resize handle). |
| `--dt-z-pinned-col` | `20` | Sticky pinned-column base; JS adds per-pin offsets. |
| `--dt-z-header` | `21` | Column header row + hidden-columns gutter. |
| `--dt-z-action-panel` | `30` | Per-column action panel popovers. |
| `--dt-z-filter-bar` | `40` | Filter bar at the top of the table. |
| `--dt-z-floating-panel` | `50` | In-page panels (filter, preset, derived-edit). |
| `--dt-z-autocomplete` | `60` | CodeMirror autocomplete tooltip (portalled to `<body>`). |
| `--dt-z-modal` | `1000` | Full-screen modals + backdrops. |
| `--dt-z-modal-stack-step` | `2` | Step added per stacked modal/panel so two-at-once dialogs layer predictably. |

Simultaneously-open modals or panels receive `--dt-z-{modal,floating-panel}
+ stackIndex * --dt-z-modal-stack-step`, so they never collide at the same
layer. Gaps are ≥ 10 so you can slot host-app UI between layers:

```css
:root {
  --dt-z-modal: 5000;
  --dt-z-autocomplete: 4900;
  --dt-z-floating-panel: 4800;
}
```

Pinned-column stacking is computed as `--dt-z-pinned-col + pinOrderOffset`,
so overriding `--dt-z-pinned-col` shifts the whole pinned group together.

#### Internal

| Variable | Role |
|---|---|
| `--dt-stylesheet-loaded` | Library-internal marker used by `createDataTable()` to warn when the stylesheet import is missing. Do not override. |

<!-- dt-vars:end -->

## CSS isolation

The library is designed to embed cleanly inside third-party apps. All
selectors are prefixed with `dt-`. Notably:

- Column-drag cursor changes are scoped to `.dt-root` (not `<body>`).
- CodeMirror autocomplete tooltips carry a `dt-cm-autocomplete` class so
  they don't collide with any other CodeMirror editor in your page.
- Fixed-position modals use `z-index: var(--dt-z-modal, 1000)` — raise or
  lower the variable to slot into your own stacking layer.
- No bare tag selectors (`button { ... }`, `input { ... }`) leak into
  your page.

### Shadow DOM

The library is intentionally **not** packaged in a shadow root. The `dt-`
prefix plus the `classPrefix` option is the escape hatch for stricter
isolation — pass `classPrefix: 'myapp-dt'` (or similar) and every selector,
modal, and tooltip re-renders with that prefix.

Full shadow-DOM encapsulation was considered and deliberately rejected:
modals portal into light DOM so they can inherit `--dt-*` theme variables
from `:root` and escape ancestor `overflow: hidden`; wrapping the library
in a shadow root blocks that inheritance unless every variable is manually
forwarded. If your host app still needs shadow-DOM isolation, wrap the
table yourself and forward the theme variables plus a light-DOM
`portalTarget` — the library does not fight you, but it does not do it
for you.

## Error handling

Every error the library surfaces extends `DataTableError`, which extends the
native `Error`. Catch-sites can narrow with `instanceof` and branch on
`err.code`. There are two event-bus entry points:

- `error` — a typed failure occurred (load, query, export, persistence,
  visualization, SQL validation, derived-column, listener). Includes a
  `source` discriminator so you can route by subsystem.
- `warning` — the library is degrading gracefully. Examples:
  `STYLESHEET_MISSING` (caller forgot to import the CSS),
  `PERSISTENCE_UNAVAILABLE` (IndexedDB blocked / private window).

```ts
import {
  createDataTable,
  DataTableError,
  LoadError,
  QueryError,
  SQLValidationError,
  ExportError,
  PersistenceError,
} from '@jeyabbalas/data-table';

const table = await createDataTable({ container, source });

table.on('error', ({ error, source }) => {
  if (error instanceof LoadError && error.code === 'PARSE_FAILED') {
    toast('Could not read that file.');
    return;
  }
  if (error instanceof QueryError && error.code === 'QUERY_SYNTAX') {
    toast(`SQL error: ${error.message}`);
    return;
  }
  if (error instanceof SQLValidationError) {
    // raw-SQL filter modal already shows inline messaging; swallow
    return;
  }
  if (source === 'persistence' && error instanceof PersistenceError) {
    console.warn('Session save failed — continuing without persistence.');
    return;
  }
  if (source === 'export' && error instanceof ExportError) {
    toast(`Export failed: ${error.message}`);
    return;
  }
  // Fallback: log to telemetry.
  reportToSentry(error);
});

table.on('warning', ({ code, message }) => {
  if (code === 'STYLESHEET_MISSING') {
    console.warn("Forgot to import '@jeyabbalas/data-table/styles'?");
  } else if (code === 'PERSISTENCE_UNAVAILABLE') {
    banner('Saved sessions are unavailable in this window.');
  }
});
```

Errors also surface as rejected promises from the methods that originate them
(`loadData`, `actions.*`). Use `try/catch` around those calls if you want
inline handling in addition to the bus.

## Custom visualizations

Register a visualization for a new column type or replace a built-in via a
`VisualizationRegistry` instance. Prefer the per-instance pattern — no global
side effects, easy to tear down.

```ts
import {
  createDataTable,
  VisualizationRegistry,
  defaultVisualizationRegistry,
} from '@jeyabbalas/data-table';

// --- Option A: per-instance (recommended) ---
const registry = new VisualizationRegistry();  // seeded with built-ins
registry.register({
  name: 'my-geo',
  isApplicable: (col) => col.type === 'string' && col.name === 'country',
  constructor: MyGeoMap,
  priority: 100,  // wins over built-ins on ties
});

const table = await createDataTable({
  container,
  source,
  visualizationRegistry: registry,
});

// --- Option B: extend the shared default ---
// Affects every table that doesn't pass its own `visualizationRegistry`.
defaultVisualizationRegistry.register({
  name: 'my-geo',
  isApplicable: (col) => col.type === 'string' && col.name === 'country',
  constructor: MyGeoMap,
  priority: 100,
});
```

The legacy static `VisualizationFactory` is still exported from `/advanced` for
source-compatibility but is deprecated — use `VisualizationRegistry`.

## Multiple tables on one page

Share a worker to avoid spinning up two DuckDB instances:

```ts
import { createDataTable, WorkerBridge } from '@jeyabbalas/data-table';

const bridge = new WorkerBridge();
await bridge.initialize();

const t1 = await createDataTable({ container: el1, source: f1, bridge });
const t2 = await createDataTable({ container: el2, source: f2, bridge });

// Tear down — neither table owns the bridge, so we terminate explicitly.
await t1.destroy();
await t2.destroy();
bridge.terminate();
```

Each table also gets a unique `instanceId` (auto-generated as `t<n>-<hex>`,
e.g. `t1-a3f9`) that is mixed into modal element IDs and `aria-labelledby`
targets so two tables on the same page never collide. It is exposed
read-only on the returned `DataTable` — most consumers never touch it;
pass `instanceId: 'my-stable-id'` only if you need deterministic DOM IDs
for tests.

For maximally-isolated side-by-side deployments (e.g. two tables with
different themes, or mounting inside a page that also uses the library
under a different version), give each table its own `classPrefix` and
`portalTarget`:

```ts
const primaryPortal = document.getElementById('primary-modals')!;
const comparePortal = document.getElementById('compare-modals')!;

const primary = await createDataTable({
  container: document.getElementById('primary')!,
  source: f1,
  classPrefix: 'primary-dt',
  portalTarget: primaryPortal,
});

const compare = await createDataTable({
  container: document.getElementById('compare')!,
  source: f2,
  classPrefix: 'compare-dt',
  portalTarget: comparePortal,
});
```

With distinct `classPrefix` values the two tables share no CSS selectors;
with distinct `portalTarget` elements their modals mount into separate
subtrees, so host styles can target one without affecting the other.

## CSP and offline deployment

Out of the box the worker is spawned from a Vite-emitted URL and DuckDB WASM
is fetched from `cdn.jsdelivr.net`. Strict Content Security Policies
(`worker-src 'self'; script-src 'self'`) and air-gapped deployments need to
self-host both. `WorkerBridgeOptions` exposes `workerFactory` (or the simpler
`workerUrl`) and `duckdbBundles` for exactly this.

```ts
import { createDataTable } from '@jeyabbalas/data-table';
import type { DuckDBBundles } from '@duckdb/duckdb-wasm';

// Bundled by your app at build time; served from the same origin.
import workerUrl from '/assets/duckdb-worker.js?url';
import mvpWasm from '/assets/duckdb-mvp.wasm?url';
import ehWasm from '/assets/duckdb-eh.wasm?url';
import ehWorker from '/assets/duckdb-browser-eh.worker.js?url';

const bundles: DuckDBBundles = {
  mvp: {
    mainModule: mvpWasm,
    mainWorker: workerUrl,
  },
  eh: {
    mainModule: ehWasm,
    mainWorker: ehWorker,
  },
};

const table = await createDataTable({
  container,
  source,
  bridgeOptions: {
    workerFactory: () =>
      new Worker(new URL(workerUrl, import.meta.url), { type: 'module' }),
    duckdbBundles: bundles,
  },
});
```

`workerFactory` takes precedence over `workerUrl`; a factory that hands back
a fully-configured `Worker` (correct `type`, `name`, etc.) is the most
portable shape. Copy DuckDB's WASM artifacts into your own static assets at
build time so the browser only talks to your origin.

## Internationalization

Every user-facing string the library renders — button labels, placeholders,
tooltips, `aria-label` copy, live-region announcements, stats templates —
comes from a single typed `Strings` object. Pass a `DeepPartial<Strings>`
override via `messages`; missing keys fall back to the English defaults.
Messages are resolved once at construction, so to switch languages at
runtime you recreate the table.

```ts
import { createDataTable, type Strings, type DeepPartial } from '@jeyabbalas/data-table';

const fr: DeepPartial<Strings> = {
  common: { close: 'Fermer', apply: 'Appliquer', cancel: 'Annuler' },
  export: { dialogTitle: 'Exporter' },
  a11y: {
    rowCountAnnouncement: (filtered, total) =>
      `${filtered} sur ${total} lignes affichées.`,
  },
};

const table = await createDataTable({ container, source, messages: fr });
```

No translations are bundled — ship your own locale files (or share a locale
pack across apps) and merge only the keys you care about. `mergeStrings` and
`defaultStrings` are exported if you want to build a fallback chain
(e.g. French → English → defaults) yourself.

## Accessibility

The grid aims for WCAG 2.1 AA parity. What embedders inherit:

- `role="grid"` on the table root, with `aria-rowcount` / `aria-colcount`
  kept in sync with filtered / visible counts.
- `role="columnheader"` / `role="row"` / `role="gridcell"` plus
  `aria-rowindex` / `aria-colindex` / `aria-sort` on the right elements.
- Roving `tabindex`: arrow keys move cell focus, Home / End jump to row
  ends, Ctrl/Cmd+Home / End jump to the corners, PageUp / PageDown move by
  one viewport. Enter on a header toggles sort; Enter on a cell selects
  the row. Tab still leaves the grid via the document's focus order.
- A polite `aria-live` region announces filter, sort, and row-count changes
  (debounced). Announcement strings are translatable via `messages.a11y`.
- Every modal and panel (export dialog, raw-SQL filter, derived-column
  editor, filter panel, preset panel) runs through the shared `ModalHost`
  — focus trap, Escape-to-close, scroll lock on modals, focus restore to
  the opener on close, stack-index-aware z-indexes for simultaneously-open
  dialogs.
- `axe-core` runs in the test suite; zero critical / serious violations is
  a CI gate.
- Focus-visible outlines and the grid's selected-cell ring both use
  `--dt-primary`, so custom themes don't accidentally drop contrast below
  3:1.

Known limitations (deliberately out of scope):

- No in-cell editing.
- No touch / mobile-specific gestures — keyboard + pointer only.
- No RTL layout.

## Browser support

The library assumes a reasonably modern browser. It requires:

| API | Used for |
|---|---|
| `Worker` | DuckDB runs in a dedicated worker |
| `WebAssembly` | DuckDB is compiled to Wasm |
| `IndexedDB` | Session persistence (optional — only when `persistence !== false`) |
| `ResizeObserver` | Column resize, responsive visualizations |
| `BigInt` | DuckDB integer columns cross the worker boundary as BigInt |
| `structuredClone` | Bridge snapshots result sets |

In practice that's Chrome / Edge 98+, Firefox 94+, Safari 15.4+. For
programmatic checks:

```ts
import { checkBrowserSupport } from '@jeyabbalas/data-table';

const { supported, missing } = checkBrowserSupport();
if (!supported) {
  renderUnsupportedScreen(missing);  // e.g., ['ResizeObserver', 'structuredClone']
}
```

Or opt into fail-fast init — `createDataTable` will reject with
`WorkerInitError` (`code: 'WORKER_UNSUPPORTED'`, `details.missing: string[]`)
before touching the worker:

```ts
const table = await createDataTable({ container, source, strictBrowserCheck: true });
```

Other constraints to keep in mind:

- **Client-only.** No SSR — see [Framework integration](#framework-integration).
- **Schema.** DuckDB types map to a simplified union (`integer | float |
  decimal | string | boolean | uuid | date | timestamp | time | interval`).

## Advanced: modular API

The root entry (`@jeyabbalas/data-table`) exposes the facade plus a small set
of stable hooks. Power users who want to orchestrate the stack themselves
— custom visualization lifecycles, headless use, driving the bridge directly
— can import the building blocks from the `/advanced` subpath:

```ts
import {
  createTableState,
  StateActions,
  UndoManager,
  EventEmitter,
  TableContainer,
  FilterBar,
  FilterPanel,
  ExportDialog,
  DerivedColumnManager,
  CodeMirrorExpressionEditor,
  AutoSave,
  BaseVisualization,
  CrossfilterCoordinator,
  InteractionManager,
  // …and more
} from '@jeyabbalas/data-table/advanced';
```

The `/advanced` surface trades stability for flexibility: it is **not** covered
by the same semver guarantees as the root entry — internals may change between
minor versions. Read `src/DataTable.ts` to see how the facade wires these
together.

## Development

```bash
npm install
npm run dev              # library playground
npm run dev:demo         # demo app on http://localhost:5173/data-table/
npm test
npm run build            # emits dist/data-table.{js,cjs} + dist/index.d.ts
npm run build:demo
```

## License

MIT
