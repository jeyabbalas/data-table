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

Advanced consumers can also subscribe to signals on `table.state` directly
(they're reactive primitives returned by `createSignal`).

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

## Custom visualizations

Register a visualization for a new column type or replace a built-in:

```ts
import { VisualizationFactory } from '@jeyabbalas/data-table';

VisualizationFactory.register({
  name: 'my-geo',
  isApplicable: (col) => col.type === 'string' && col.name === 'country',
  constructor: MyGeoMap,
  priority: 100,  // overrides built-ins
});
```

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

## Advanced: modular API

If you need to orchestrate the stack yourself (custom visualization
lifecycle, headless use, etc.), the building blocks are all exported:

- `WorkerBridge` — DuckDB WASM RPC
- `createTableState` / `TableState` — reactive signals
- `StateActions` — command layer for mutations
- `TableContainer` — UI component (no visualizations by default)
- `CrossfilterCoordinator`, `InteractionManager`, `VisualizationFactory`
- `SessionStore`, `AutoSave`, `FilterPresetManager`
- `ExportDialog`, `DerivedColumnManager`, `CodeMirrorExpressionEditor`

Read `src/DataTable.ts` to see how the facade wires these up.

## Constraints

- **Client-only.** Uses Web Workers, `window`, `document`, and IndexedDB
  directly. Does not support SSR. If you render server-side, defer
  instantiation to `useEffect` / `onMount`.
- **Modern browsers.** Requires Web Workers, IndexedDB, Canvas, ES2020.
- **Schema.** DuckDB types are mapped to a simplified union
  (`integer | float | decimal | string | boolean | uuid | date |
  timestamp | time | interval`).

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
