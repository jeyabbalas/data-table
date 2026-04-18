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
both `:root` and `.dt-root`. Override globally:

```css
:root {
  --dt-primary: #10b981;
  --dt-radius: 4px;
  --dt-z-modal: 1500;   /* if your app's modal layer sits at z-index 1000 */
}
```

…or per-instance by adding a class to the table element:

```html
<div id="my-table" class="dt-root mint-theme"></div>
<style>
  .dt-root.mint-theme {
    --dt-primary: #10b981;
  }
</style>
```

Dark mode uses `@media (prefers-color-scheme: dark)` automatically; override
the dark-mode variables the same way.

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
