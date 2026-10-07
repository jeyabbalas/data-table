# AGENTS.md — Coding-agent guide for `@jeyabbalas/data-table`

This file is for AI coding agents integrating the library into an application, and for humans who want a concise, source-grounded orientation. Every claim cites `src/<file>:<line>` where applicable. When the source disagrees with this file, trust the source.

For deeper reference, open [`docs/api-reference.md`](./docs/api-reference.md). For error lookups, open [`docs/troubleshooting.md`](./docs/troubleshooting.md). For runnable code, open [`examples/`](./examples/README.md).

---

## Contents

1. [What this library is / is not](#1-what-this-library-is--is-not)
2. [Before-you-code: clarifying-question checklist](#2-before-you-code-clarifying-question-checklist)
3. [Canonical snippets](#3-canonical-snippets)
4. [Default config cheat-sheet](#4-default-config-cheat-sheet)
5. [Common pitfalls](#5-common-pitfalls)
6. [When to use `/advanced`](#6-when-to-use-advanced)
7. [Trigger patterns — when to pick this library](#7-trigger-patterns--when-to-pick-this-library)
8. [Lifecycle diagram](#8-lifecycle-diagram)
9. [Pointers](#9-pointers)

---

## 1. What this library is / is not

`@jeyabbalas/data-table` is a **client-side TypeScript library** for interactive, explorable data tables. All analytics happen in the browser on top of DuckDB compiled to WebAssembly — nothing is sent to a server. The library mounts into a host `HTMLElement` and exposes a typed event bus, a reactive state layer, and a full UI (filters, column controls, derived columns, exports).

### SUPPORTS

- Loading CSV, JSON, or Parquet from `File`, `string` (URL), `ArrayBuffer`, or `Blob` (src/DataTable.ts:160-164).
- Seven filter types — `range`, `point`, `set`, `not-set`, `null`/`not-null`, `pattern`, `raw-sql` (src/filters/FilterTypes.ts:8–179). Point, set and not-set filters take `valueType: 'text'`, which compares `CAST(col AS VARCHAR)`: how a nested value is matched exactly.
- Derived columns — SQL-expression columns _and_ precomputed vector columns; `addDerivedColumn` / `updateDerivedColumn` / `replaceDerivedColumn` (same-name with dependent re-validation), and `addNestedFieldColumn(column, path, options?)`, which adds one part of a nested or JSON column (a struct field, list element, map value, JSON key, a list's length) as an expression column right after it; in the UI, a nested or JSON column header's extract button and the value inspector's "Add as column" do the same, both part of the `derivedColumns` UI. An expression must give one value for each row: `unnest(…)` and a bare aggregate (`sum(price)`) are refused. Names are unique ignoring ASCII letter case, as DuckDB binds them, on a session restore, an undo and a redo too (src/derived/types.ts, src/derived/DerivedColumnManager.ts, src/core/Actions.ts, src/core/columnNames.ts, src/table/ExtractColumnPanel.ts).
- Stable synthetic `__rowid__` (BIGINT, hidden by default) + `actions.getColumnValues(name, opts?)` for read-only column export (`Int32Array` / `Float64Array` / `BigInt64Array` / `unknown[]`), and `actions.getCellValue(rowId, column)` for one cell. Both are exact: every `BIGINT`…`UHUGEINT` digit, a `DECIMAL` as the double nearest its value, nested values as arrays, objects, `Map`s and `{ [tag]: value }` (src/core/types.ts, src/core/Actions.ts).
- Programmatic row / column / cell annotations on `table.annotations.*` — severity tiers, intersection lookup, JSON I/O, IndexedDB persistence, intersection popover (src/annotations/AnnotationStore.ts).
- Programmatic column-header tooltips via `actions.setColumnHeaderTooltip` — XSS-safe structured popover for JSON-Schema-style metadata (src/core/Actions.ts, src/core/columnHeaderTooltip.ts).
- Filter presets (save/load/export/import) — built-in UI + `FilterPresetManager` (src/index.ts:83–84).
- Session persistence to IndexedDB (filters, sort, columns, derived columns, presets, undo/redo, annotations, column-header tooltips) (src/persistence/SessionStore.ts).
- Column visibility, reorder, resize, pin — all undoable (src/core/Actions.ts).
- Histograms and value-counts in column headers, and a non-null / null summary bar for nested columns; subclassable via `BaseVisualization` (src/visualizations/BaseVisualization.ts).
- Nested columns — LIST, fixed-size ARRAY, STRUCT, MAP, UNION and VARIANT load as `type: 'nested'` (`originalType` holds the DuckDB type; JSON stays `'string'`). Cells show DuckDB's text, bounded to 32 items and 1,000 graphemes; sorting goes by value; headers show a type outline (`[integer]`, `struct(3)`); CSV and the clipboard write standard JSON, JSON export real structures, Parquet the native type. A value inspector shows any non-NULL nested or JSON cell's whole value as a keyboard tree, with Copy JSON: `F2` on the cursor, a double click, or the cell's inspect icon; `table.container.openValueInspector({ row, column })` from code, on a row the grid has rendered (`false` otherwise; a `true` still opens nothing when the user moves on first) (src/table/ValueInspector.ts). `parseDuckDBType` and `isNestedType` are on `/advanced` (src/core/duckdbType.ts, src/data/valueSql.ts, src/core/jsonTree.ts; [`docs/guides/loading-data.md#nested-and-json-columns`](./docs/guides/loading-data.md#nested-and-json-columns)).
- Custom column-stats panels via `BaseStatsPanel` + per-instance `StatsPanelRegistry` — replace the `.dt-col-stats` slot with your own DOM and DuckDB queries (src/visualizations/BaseStatsPanel.ts, src/visualizations/StatsPanelRegistry.ts, src/visualizations/StatsPanelCoordinator.ts).
- Public SQL editor primitives — host-app embedded CodeMirror SQL editors via `createSqlExtensions` / `buildCompletionContext` from `/advanced`; live-schema refresh via `Compartment.reconfigure` (src/sql-editor/extensions.ts).
- Exports to CSV, JSON, Parquet, or clipboard (src/export/\*).
- Internationalization via `messages: DeepPartial<Strings>` (src/core/Strings.ts).
- Light/dark themes (manual + `prefers-color-scheme`), CSS-variable theming (src/styles/data-table.css).
- WCAG-oriented accessibility (ARIA grid on `.dt-grid`, `aria-activedescendant` cursor, keyboard nav, live region). A loaded table is a constant five tab stops — filter bar, grid, header scroller, body scroller, hidden-columns gutter — regardless of column count, hidden columns or active filters; a nested cell's inspect icon adds none, and `F2` on such a cell opens the value inspector, a `role="dialog"` holding a WAI-ARIA tree; a nested or JSON column header's extract button is one more control in its `F2` cycle, not a tab stop (src/table/KeyboardNavigator.ts, src/core/RovingTabindex.ts, src/table/TreeView.ts).
- **Keyboard column resize and reorder** via `Shift+F2` from the header cursor — column layout mode: `←`/`→` resize by 16px (clamped 50–500), `Shift`+`←`/`→` move the column, `Home`/`End` hit the width bounds, `Backspace` resets, `Enter` commits, `Escape` restores both width and position. The whole gesture is one undo entry. Nothing becomes focusable, so the tab-stop census is unchanged; the resize handle (`role="separator"`) and the drag handle stay out of `ColumnHeader.getControls()` and the `F2` cycle on purpose (src/table/KeyboardNavigator.ts, src/table/ColumnHeader.ts).
- Multi-table on one page with shared `WorkerBridge`, `SessionStore`, `FilterPresetManager`.
- CSP/offline deployment — self-host the WASM bundles via `bridgeOptions`.

### DOES NOT SUPPORT

- **No SSR.** `window`, `document`, `Worker`, `IndexedDB` are required. Guard with `'use client'` / `dynamic({ ssr: false })`.
- **No row-click event.** Use `selectionChange` instead (src/core/TableEvents.ts:125–130). Clicking a row selects it alone (clicking the only selected row clears the selection), `Ctrl`/`Cmd`-click toggles a row, `Shift`-click selects the range from the last row selected or toggled (a click, `Ctrl`/`Cmd`-click or `Enter`), and `Enter` toggles the cursor's row. There are no checkboxes and no select-all key; `actions.selectAll()` selects the rows of the current view. A selection holds 0-based positions in the filtered, sorted view, not row ids, and is kept as it is when the filters or the sort change.
- **No in-cell editing.** Derived columns cover computed fields; raw cell edits are not in scope.
- **No built-in mobile touch gestures** beyond what the browser provides.
- **No latency guarantees on very large tables.** Scrolling stays correct at 50M+ rows, but filter/sort queries are DuckDB-bound and slow down as rows grow, and deep scrolls of a sorted or filtered table pay `OFFSET` cost that grows with depth.
- **No RTL-aware layouts beyond what the OS provides.**

### PARTIAL

- **Browser matrix.** Modern evergreen browsers only. Probe with `checkBrowserSupport()` (src/core/checkBrowserSupport.ts).
- **Custom expression editors.** Default is CodeMirror 6; swap via `editorFactory` option.
- **Custom visualizations.** Subclass `BaseVisualization` and register through a `VisualizationRegistry`.
- **Nested values.** Their header chart counts non-null values only (no value grouping, no click-to-filter), and exact filters compare DuckDB's text, which DuckDB formats for every row in each query the filter is in: seconds a query on a column of embeddings ([`docs/performance.md#nested-columns`](./docs/performance.md#nested-columns)). A raw `bridge.query` loses `DECIMAL`, `HUGEINT` and `INTERVAL` values inside a nested value, fails or misreads a date or timestamp holding `infinity`, or a `TIMESTAMP` past year 287396 or before 283458 BC, inside a STRUCT, MAP or UNION, and cannot select a VARIANT or a value holding one; select `CAST(to_json(c) AS VARCHAR)` for the first two, `CAST(c AS JSON)` for a VARIANT and `CAST(CAST(c AS VARIANT) AS JSON)` for a type holding one, or use `getColumnValues` / `getCellValue`. Every read of a type holding a VARIANT goes through VARIANT, so a UNION inside it loses its tag, and CSV and the clipboard write a MAP inside it as a key/value list. Parquet export reloads an ARRAY as a LIST, a `HUGEINT` as a `DOUBLE`, and an `ENUM` in a struct or a `BIT` in a list as `VARCHAR`; a UNION or unnamed STRUCT column's file does not load again, and a VARIANT inside a list or struct does not export. A CSV or JSON export of a large embedding column can pass the browser's string limit; export it to Parquet.

---

## 2. Before-you-code: clarifying-question checklist

Ask these **before writing integration code**, in order. The first answer often rules out later questions.

1. **Data source shape.** `File` (user-uploaded), URL `string`, `ArrayBuffer`, or `Blob`? Is the source static, polled, or streamed? A CSV in an unusual dialect (`;` between fields, no header row, `NA` for missing values), or a Parquet file of which only some columns are needed? Those go in `sourceOptions` ([`docs/guides/loading-data.md#how-a-source-is-read`](./docs/guides/loading-data.md#how-a-source-is-read)). Lists, structs, maps or JSON in it? They load as `type: 'nested'` (JSON as `'string'`), which changes what a custom chart or stats panel receives; see [pitfall 13](#5-common-pitfalls).
2. **Volume.** Approximate rows × columns at peak. Above ~5M rows expect noticeable UI latency. The loaded table must fit in browser memory — about 2.5 GiB, or 200K rows × 1,000 numeric columns — and large Parquet files should arrive as a `File`, `Blob`, or URL, not an `ArrayBuffer` ([`docs/guides/loading-data.md#large-parquet-files`](./docs/guides/loading-data.md#large-parquet-files)).
3. **Mount point and height.** Which `HTMLElement` does the table mount into (`container` takes an element, not a selector), and where does that element's height come from — an explicit `height`, a `flex: 1; min-height: 0` child, a grid track? It must be bounded. If the answer is "it grows with its content", fix that before writing any other integration code; see [`README.md#sizing-the-container`](./README.md#sizing-the-container).
4. **Persistence.** Should filters/sort/columns survive page reloads? Default: yes (IndexedDB). Say so if the user wants incognito-clean behavior.
5. **SSR / CSP.** Next.js / Nuxt / Remix? A strict CSP forbidding `cdn.jsdelivr.net`? These drive code layout and `bridgeOptions`.
6. **Multi-table.** Two or more tables on the same page? Share a `WorkerBridge` (perf) and optionally a `FilterPresetManager`. Keep distinct `tableName`s.
7. **Custom SQL exposure.** Will end users author raw SQL (`expressionFilter`, `RawSQLFilter`)? If yes, understand that these bypass validation for content — treat them as trusted input.
8. **Theme / brand.** CSS-variable overrides? Light-only, dark-only, or auto? See [`docs/api-reference.md#i18n-strings`](./docs/api-reference.md) + CSS variable list in `README.md`.
9. **i18n.** Which locale(s)? `messages` is captured at `createDataTable()` time — runtime swap requires rebuild.
10. **Accessibility target.** Keyboard-only + screen reader support is default-on. Is there a stricter compliance bar (axe CI, WCAG 2.2)?
11. **Offline / self-hosted WASM.** Air-gapped, Electron, or strict CSP? Use `bridgeOptions.duckdbBundles` + `workerUrl`.

---

## 3. Canonical snippets

All snippets assume:

```ts
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';
```

They also assume the mount container already has a **bounded height**, as set up in snippet (a). That is a hard requirement, not styling: the virtual scroller measures the container to decide how many rows to render, so an auto-height container makes it render the entire dataset — silently, with no error and no `warning` event. Only snippet (a) repeats the HTML/CSS; every later snippet takes it as given. See [pitfall 1](#5-common-pitfalls) and [`README.md#sizing-the-container`](./README.md#sizing-the-container).

### (a) Minimum working example

```html
<!-- The container MUST have a bounded height. The library never sets one, and
     measures this element to decide how many rows to put in the DOM. -->
<div id="table" style="height: 600px"></div>
```

```ts
const container = document.getElementById('table')!;
const table = await createDataTable({
  container,
  source: '/data.csv',
});
table.on('ready', () => console.log('ready'));
// Later:
await table.destroy();
```

Use a flex/grid child instead of a fixed pixel height when the table should fill the space left over:

```css
html,
body {
  height: 100%;
  margin: 0;
}
body {
  display: flex;
  flex-direction: column;
}
#table {
  flex: 1;
  min-height: 0; /* mandatory — flex items default to min-height: auto and
                    will not shrink below their intrinsic content height */
}
```

`container` takes an `HTMLElement`, not a selector string. There is no height option — sizing is entirely the host page's job. `.dt-root` is `height: 100%` (`src/styles/02-shell.css:11-19`), so it inherits whatever the container resolves to; the scroller then reads `clientHeight` off `.dt-body-scroll` (`src/table/VirtualScroller.ts:353`) and renders `⌈clientHeight / rowHeight⌉ + 2 × bufferRows` rows — ~29 at 600px, whether the dataset has 1 thousand rows or 10 million. `bufferRows` defaults to 5 and is not exposed through `createDataTable` (`src/table/VirtualScroller.ts:148`, `:18`). `height: 100%` on the container works only if every ancestor up to the viewport also has a resolved height.

### (b) Programmatic filter application (every type)

```ts
table.actions.addFilter({ type: 'range', column: 'age', min: 18, max: 65, maxInclusive: true });
table.actions.addFilter({ type: 'point', column: 'sku', value: 'A-42' });
table.actions.addFilter({ type: 'set', column: 'country', values: ['US', 'CA'] });
table.actions.addFilter({ type: 'not-set', column: 'status', values: ['archived'] });
table.actions.addFilter({ type: 'null', column: 'deleted_at' }); // or 'not-null'
table.actions.addFilter({ type: 'pattern', column: 'name', pattern: 'smith', mode: 'contains' });
// A nested (list/struct/map) column, by the text its cell shows:
table.actions.addFilter({
  type: 'point',
  column: 'tags',
  value: '[red, green]',
  valueType: 'text',
});
const rawId = table.actions.addRawSQLFilter(`price > 100 AND quantity > 0`, 'Premium in-stock');
```

All filter calls are synchronous. See [`docs/api-reference.md#filter-types`](./docs/api-reference.md#filter-types) for field semantics.

### (c) Derived column — expression-based

```ts
const result = await table.actions.addDerivedColumn({
  kind: 'expression',
  name: 'age_group',
  expression: `CASE WHEN age < 18 THEN 'minor' ELSE 'adult' END`,
});
if (!result.success) console.warn(result.error);

// One part of a nested column, as a column of its own (STRUCT(x DOUBLE, …)):
const x = await table.actions.addNestedFieldColumn('point', ['x']); // { success: true, name: 'point_x' }
```

A name another column has in any letter case (`LABEL` beside `label`) is refused: DuckDB would read `label` for it. A session restore, an undo or a redo leaves such a derived column out, with a `console.warn` carrying a `DerivedColumnError` coded `DUPLICATE_NAME` (src/derived/DerivedColumnManager.ts, `restoreColumns`). An expression with no one value for each row, `unnest(tags)` or a bare `sum(price)`, resolves `{ success: false }` with a message that says what to write instead (a list function or a subquery; `sum(price) OVER ()`). Struct fields go by name or 1-based position, list positions start at 1, JSON indexes at 0 ([`docs/api-reference.md#extracting-a-nested-field`](./docs/api-reference.md#extracting-a-nested-field)).

### (d) Derived column — vector-based

```ts
const values = new Array(table.state.totalRows.get()).fill(0).map((_, i) => Math.random());
await table.actions.addDerivedColumn({
  kind: 'vector',
  name: 'jitter',
  vectorType: 'float',
  values,
});
```

Vector length MUST equal `state.totalRows.get()`, or `VECTOR_LENGTH_MISMATCH` is emitted.

### (e) Event wiring

```ts
const offFilter = table.on('filterChange', ({ filters, filteredRowCount, totalRowCount }) => {
  console.log(`${filters.length} filters; ${filteredRowCount}/${totalRowCount} rows`);
});
// Later:
offFilter(); // returned function
// or: table.off('filterChange', handler);
```

### (f) Custom visualization class registration

```ts
import { VisualizationRegistry } from '@jeyabbalas/data-table';
import { BaseVisualization } from '@jeyabbalas/data-table/advanced';

class BoxPlot extends BaseVisualization {
  protected async fetchData() {
    /* query this.bridge */ return {/* ... */};
  }
  protected render(_data: unknown) {
    /* draw on this.ctx */
  }
  protected handleMouseMove() {}
  protected handleClick() {}
  protected handleMouseLeave() {}
}

const registry = new VisualizationRegistry();
registry.register({
  name: 'boxplot',
  isApplicable: (type) => type === 'float' || type === 'integer',
  constructor: BoxPlot as any,
  priority: 10, // beats built-in Histogram (priority 0)
});
const table = await createDataTable({ container, source, visualizationRegistry: registry });
```

### (g) `destroy()` on unmount

**React:**

```tsx
useEffect(() => {
  let cancelled = false;
  let table: DataTable | undefined;
  (async () => {
    const t = await createDataTable({ container: ref.current!, source: '/data.csv' });
    if (cancelled) {
      await t.destroy();
      return;
    }
    table = t;
  })();
  return () => {
    cancelled = true;
    table?.destroy();
  };
}, []);
```

**Vue 3:**

```ts
let table: DataTable | undefined;
onMounted(async () => {
  table = await createDataTable({ container: el.value, source });
});
onBeforeUnmount(async () => {
  await table?.destroy();
});
```

### (h) Sharing a worker / store / presets across two tables

```ts
import { WorkerBridge, SessionStore, FilterPresetManager } from '@jeyabbalas/data-table';

const bridge = new WorkerBridge();
await bridge.initialize();

const store = new SessionStore();
await store.open();

const presets = new FilterPresetManager();

const tableA = await createDataTable({
  container: aEl,
  source: '/a.csv',
  tableName: 'set_a',
  bridge,
  persistence: { sessionStore: store },
  presets: { manager: presets },
});
const tableB = await createDataTable({
  container: bEl,
  source: '/b.csv',
  tableName: 'set_b',
  bridge,
  persistence: { sessionStore: store },
  presets: { manager: presets },
});
```

Distinct `tableName`s matter — `SessionStore` snapshots are keyed by table name.

### (i) Read a column out as a typed JS array (`getColumnValues`)

```ts
// Float64Array for FLOAT / DOUBLE / DECIMAL, BigInt64Array for __rowid__ and
// BIGINT…UHUGEINT (every digit), Int32Array for smaller integers; unknown[] for
// everything else, and whenever a value is NULL or does not fit the typed array.
const fares = await table.actions.getColumnValues('fare_amount', {
  scope: 'filtered', // 'all' | 'filtered' | 'selected'
  limit: 1000,
});

const ids = await table.actions.getColumnValues('__rowid__'); // BigInt64Array
const idsAsNumbers = Array.from(ids, (v) => Number(v)); // safe up to 2^53 rows

// Nested columns ('nested'): unknown[] of arrays, objects, Maps, { [tag]: value };
// integers past 2^53 as bigints. INTERVAL / ENUM / BIT / GEOMETRY are DuckDB text.
const tags = await table.actions.getColumnValues('tags'); // e.g. [['red', 'green'], null, [], …]

// One cell, by its __rowid__ (number or bigint), exactly:
const point = await table.actions.getCellValue(10, 'point'); // { x: 1.5, y: -0.5, tier: 'gold' }
```

A MAP value is a `Map`, which `JSON.stringify` writes as `{}`, and a bigint makes `JSON.stringify` throw; convert first (`Object.fromEntries(map)`). Errors: `COLUMN_NOT_FOUND`, `NO_TABLE`, `INVALID_PAGINATION`, `INVALID_ROWID` (`getCellValue`: also a rowid no row has), `QUERY_ABORTED` — all `QueryError` ([`docs/api-reference.md#column-values-read-only-export`](./docs/api-reference.md#column-values-read-only-export)).

`__rowid__` is reserved and synthesized at load — sources containing a column named `__rowid__` reject with `LoadError('RESERVED_COLUMN_NAME')`. The column is hidden in the grid by default; toggle with `actions.showColumn('__rowid__')`. Excluded from default exports unless the user ticks "Include system columns" in the export dialog.

### (j) Replace a derived column with dependent re-validation

```ts
const result = await table.actions.replaceDerivedColumn('tip_pct', {
  kind: 'expression',
  name: 'tip_pct',
  expression: 'tip_amount / NULLIF(fare_amount, 0) * 100',
});
if (!result.success) {
  if (result.error.code === 'DEPENDENTS_INCOMPATIBLE') {
    console.warn('breaks:', result.error.details?.dependentsAffected);
  } else {
    console.warn(result.error);
  }
}
```

Use `replaceDerivedColumn` (no rename, structured error) when an end-user edits an existing expression. Use `updateDerivedColumn` for renames. The `derivedChange` event fires with `kind: 'replaced'` and `columnName: 'tip_pct'` on success.

### (k) Annotations — CRUD, JSON round-trip, severity filter

```ts
table.annotations.add({
  scope: 'cell',
  rowId: 0,
  column: 'age',
  severity: 'error',
  message: 'value 200 exceeds maximum 150',
  code: 'JSON_SCHEMA_MAXIMUM',
});

table.annotations.addMany([
  { scope: 'row', rowId: 5, severity: 'warning', message: '…' },
  { scope: 'column', column: 'tip_amount', severity: 'error', message: '…' },
]);

// Intersection: row + column + cell at (rowId, column), sorted by severity.
const here = table.annotations.getByCell(0, 'age');

// Fires on every mutation including bulk operations and severity-filter flips.
const off = table.annotations.on('change', ({ kind, ids }) => {
  console.log(kind, ids.length); // 'added' | 'updated' | 'removed' | 'cleared' | 'filterChanged'
});

// Hide info-level annotations visually without touching the data.
table.annotations.setSeverityFilter({ info: false });

// JSON round-trip — preserves unknown top-level and per-annotation fields.
const file = table.annotations.toJSON();
table.annotations.loadJSON(file, 'replace');
```

Annotations live outside `TableState` (no undo/redo participation) but auto-persist into `SessionSnapshot.annotations` (v5+). For multi-table apps, the file's `tableName` is set automatically.

### (l) Column-header tooltip — structured popover

```ts
// Rich structured content — title, description, label/value items including enum chips.
table.actions.setColumnHeaderTooltip('total_amount', {
  title: 'Total amount',
  description: 'Final fare paid by the passenger.\nIncludes tip when paid by card.',
  items: [
    { label: 'Units', value: 'USD' },
    { label: 'Components', value: ['fare', 'tip', 'tolls', 'mta_tax'] }, // chips
  ],
});

table.actions.setColumnHeaderTooltip('fare_amount', 'Base fare in USD.'); // string shorthand
table.actions.setColumnHeaderTooltip('total_amount', null); // clear
```

Every text field is rendered via `.textContent` — HTML strings are not parsed. Tooltips persist into `SessionSnapshot.columnHeaderTooltips` by default. If the embedding app already owns its column catalogue (and so should re-apply tooltips itself on every mount), opt out by disabling session persistence on the whole table via `createDataTable({ persistence: false, ... })` — see `examples/12-column-header-tooltips/main.ts:24` for the canonical pattern. There is no per-tooltip persistence flag on `setColumnHeaderTooltip(name, content)`; the toggle is global.

### (m) Custom stats panel — replace the column-stats slot

```ts
import {
  createDataTable,
  StatsPanelRegistry,
  filtersToWhereClause,
  quoteIdentifier,
  QueryError,
} from '@jeyabbalas/data-table';
import {
  BaseStatsPanel,
  type StatsPanelOptions,
  type ColumnStatsData,
} from '@jeyabbalas/data-table/advanced';
import type { ColumnSchema, Filter } from '@jeyabbalas/data-table';

class MeanStdPanel extends BaseStatsPanel {
  private fetchSeq = 0;

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    void this.refresh();
  }

  update(_stats: ColumnStatsData | null): void {
    /* paint from stats if you want */
  }

  async updateFilters(filters: Filter[]): Promise<void> {
    await super.updateFilters(filters); // refresh this.options.filters
    await this.refresh();
  }

  destroy(): void {
    this.container.replaceChildren();
    super.destroy();
  }

  private async refresh(): Promise<void> {
    if (this.isDestroyed()) return;
    const seq = ++this.fetchSeq; // stale-result guard
    const colId = quoteIdentifier(this.column.name);
    const tableId = quoteIdentifier(this.options.tableName);
    const where = filtersToWhereClause(this.options.filters);
    const sql = `SELECT AVG(${colId}) m, STDDEV_POP(${colId}) s
                 FROM ${tableId} ${where ? 'WHERE ' + where : ''}`;
    try {
      const [row] = await this.options.bridge.query<{ m: number | null; s: number | null }>(sql);
      if (this.isDestroyed() || seq !== this.fetchSeq) return; // dropped
      this.container.textContent = `μ ${row?.m ?? '—'} · σ ${row?.s ?? '—'}`;
    } catch (err) {
      this.options.onError?.(
        new QueryError(err instanceof Error ? err.message : String(err), {
          code: 'QUERY_RUNTIME',
          cause: err,
        }),
        { source: 'stats-panel', column: this.column.name, phase: 'fetch' },
      );
    }
  }
}

const statsPanelRegistry = new StatsPanelRegistry();
statsPanelRegistry.register({
  name: 'mean-std',
  isApplicable: (type) => type === 'integer' || type === 'float' || type === 'decimal',
  constructor: MeanStdPanel,
  priority: 10,
});

const table = await createDataTable({ container, source: '/data.csv', statsPanelRegistry });
```

The registry is empty by default — leaving a column type unregistered falls back to the library's built-in two-region rendering (line 1 = `formatStatsLine1` row counts, always visible; detail region = `formatStatsLine2` type summary or the viz's selection/hover text — semantics in [`docs/guides/visualizations.md#reading-the-column-stats`](./docs/guides/visualizations.md#reading-the-column-stats)), so opt-in is granular. Errors thrown inside `update` / `updateFilters` / `fetch` should route through `options.onError(err, { source: 'stats-panel', column, phase })`; the facade re-emits these on `table.on('error', …)` with `source: 'stats-panel'`. See `src/visualizations/BaseStatsPanel.ts:140-224` for the abstract contract and `examples/13-custom-stats-panel/main.ts:107-143` for the canonical `fetchSeq` stale-result pattern.

### (n) Standalone SQL editor — host-app embedded, schema-aware

```ts
import { buildCompletionContext, createSqlExtensions } from '@jeyabbalas/data-table/advanced';
import type { CompletionContext, DataTable } from '@jeyabbalas/data-table';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';

// ----- Live-schema path (paired with a DataTable) -----

const sqlCompartment = new Compartment();
const getContext = () => table.actions.getCompletionContext(); // thunk, not snapshot

const view = new EditorView({
  state: EditorState.create({
    doc: '',
    extensions: [
      // Library contribution: SQL grammar + schema/function autocomplete source.
      // Wrapped in a Compartment so we can swap on schema change without re-mounting.
      sqlCompartment.of(createSqlExtensions(getContext())),

      // Standard CodeMirror plumbing the host wires up itself.
      // createSqlExtensions ships the autocomplete *source*, not the UI — add it here
      // or no dropdown ever appears (src/sql-editor/extensions.ts:156-158).
      autocompletion({ tooltipClass: () => 'my-app-sql-autocomplete' }),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      placeholder('e.g. order_total_usd > 100'),
    ],
  }),
  parent: hostEl,
});

// Refresh autocomplete when the schema changes — preserves undo history,
// focus, scroll, and the current document.
const refresh = () => {
  view.dispatch({
    effects: sqlCompartment.reconfigure(createSqlExtensions(getContext())),
  });
};
table.on('loadComplete', refresh);
table.on('derivedChange', refresh);

// ----- Literal-schema variant (no DataTable required) -----
//
// const ctx = buildCompletionContext([
//   { name: 'price', type: 'DOUBLE' },
//   { name: 'qty',   type: 'BIGINT' },
// ]);
// new EditorView({
//   state: EditorState.create({
//     extensions: [createSqlExtensions(ctx), autocompletion()],
//   }),
//   parent: hostEl,
// });
```

`createSqlExtensions` ships the autocomplete _source_ — add `autocompletion()` yourself or no dropdown appears (`src/sql-editor/extensions.ts:156-158`). For the in-table case, use the bundled `CodeMirrorExpressionEditor` (also exported from `/advanced`), which wraps these primitives and adds the UI, keymap, and theme. Function-list precedence: `options.functions` ▶ `context.functions` ▶ `DUCKDB_FUNCTION_DETAILS`; `[]` disables function autocomplete and does _not_ fall through. See [`docs/guides/sql-editor-primitives.md`](./docs/guides/sql-editor-primitives.md) for the full walk-through and [`examples/14-standalone-sql-editor/`](./examples/14-standalone-sql-editor/) for a runnable demo.

---

## 4. Default config cheat-sheet

All values source `src/DataTable.ts:133-367`.

| Option               | Default         | Notes                                                                                            |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `persistence`        | `true`          | IndexedDB session snapshot.                                                                      |
| `presets`            | `true`          | Filter preset UI + storage.                                                                      |
| `undoRedo`           | `true`          | Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z.                                                                    |
| `expressionFilter`   | `true`          | Raw-SQL filter button.                                                                           |
| `visualizations`     | `true`          | Column header histograms / value counts / nested summary bars.                                   |
| `exportDialog`       | `true`          | CSV/JSON/Parquet export dialog.                                                                  |
| `rowHeight`          | `32`            | Pixels. Published as `--dt-row-height`; set it here, not in CSS.                                 |
| `headerHeight`       | `120`           | Pixels — ≥ 96 recommended when visualizations are on. Published as `--dt-header-height`.         |
| `fetchBlockSize`     | `128`           | Rows fetched per scroll block. Clamped to 16–1024.                                               |
| `rowCacheRows`       | `2048`          | In-memory row cache size. Rounded up to whole blocks, 4-block floor.                             |
| `prefetch`           | `true`          | Direction-aware: one block beyond the viewport while the fetch pipeline is idle.                 |
| `classPrefix`        | `'dt'`          | CSS class prefix.                                                                                |
| `colorScheme`        | `'auto'`        | Follow `prefers-color-scheme`.                                                                   |
| `portalTarget`       | `document.body` | Where modals mount.                                                                              |
| `strictBrowserCheck` | `false`         | When `true`, `createDataTable()` rejects with `WORKER_UNSUPPORTED` if required APIs are missing. |

**Container height is not an option.** There is no `height`, `maxHeight`, `minHeight`, `autoHeight`, or `fitToContainer`. `rowHeight` and `headerHeight` size the table's _contents_; the mount container's own height comes from host CSS and nothing else. Note the reverse for those two: they are options, not CSS knobs. The library writes `--dt-row-height` / `--dt-header-height` onto `.dt-root` inline from the option values (`src/table/TableContainer.ts:createRootElement`), so overriding either token in a stylesheet is a no-op — the scroller's row arithmetic runs in JS and could not see it anyway. The scroller measures it (`src/table/VirtualScroller.ts:353`) to derive how many rows exist in the DOM at all, so leaving it unbounded is a correctness problem, not a cosmetic one — see pitfall 1 below and [`README.md#sizing-the-container`](./README.md#sizing-the-container).

---

## 5. Common pitfalls

1. **Mounting into an unbounded (auto-height) container.** Symptom: nothing at first — no error, no `warning` event, and on a small dataset it looks correct — then a stalled tab, climbing memory, and unusable scrolling once the data is real. `.dt-root` is `height: 100%` (`src/styles/02-shell.css:11-19`); against an auto-height parent that resolves to content height, so `.dt-body-scroll` (`flex: 1; overflow: auto; min-height: 0`, `src/styles/02-shell.css:464-468`) grows to the spacer height that `setTotalRows()` writes onto `.dt-body` — `min(totalRows × rowHeight, 15,000,000)` px, capped by the module-private `DEFAULT_MAX_VIRTUAL_HEIGHT = 15_000_000` (`src/table/VirtualScroller.ts:73`, applied in `setTotalRows`, `:426-464`). The `clientHeight` the scroller measures (`src/table/VirtualScroller.ts:353`) is then that whole capped element, so the visible range is everything under the cap: rows are fetched in blocks (`src/table/TableBody.ts`) and a DOM row — data or placeholder — is built per row, up to ~468,750 rows at the default 32px `rowHeight` (the entire dataset when it is smaller). At 1M rows × 32px that is a 15,000,000px element and ~468,750 DOM rows. Virtualization is fully defeated and nothing tells you. Fix: give the container a bounded height before mounting.

   ```html
   <div id="table" style="height: 600px"></div>
   ```

   ```css
   /* or as a flex/grid child — `min-height: 0` is mandatory, flex items default
      to `min-height: auto` and will not shrink below intrinsic content height */
   #table {
     flex: 1;
     min-height: 0;
   }
   ```

   `height: 100%` on the container works only if every ancestor up to the viewport has a resolved height — that is the usual reason a container that "has a height" behaves as if it doesn't. The _zero_-height container is the opposite failure: it renders nothing (`src/table/VirtualScroller.ts:356-358`) and logs a one-shot plain `console.warn` at construction (`src/table/TableContainer.ts:480-491`) — a console message, not a `warning` event and not an error code. Full rationale: [`README.md#sizing-the-container`](./README.md#sizing-the-container).

2. **Forgot the stylesheet import.** Symptom: `warning` event with `code: 'STYLESHEET_MISSING'`, table renders unstyled. Fix: add `import '@jeyabbalas/data-table/styles';` at app entry.

3. **Loading the initial `source` a second time.** `createDataTable({ source })` already loads `source`, and resolves after it. Calling `loadData(source)` again resets the table's state and loads it again, so filters or sorts applied in between can be lost. Use `loadData()` only for subsequent swaps, or omit `source` and call `loadData(source, { tableName, sourceFormat, sourceOptions })` yourself when you need the initial load's events (see [§8](#8-lifecycle-diagram)).

4. **Forgetting `isDestroyed()` in async callbacks.** After `destroy()`, every public method throws `DestroyedError`. Always guard:

   ```ts
   setTimeout(() => {
     if (table.isDestroyed()) return;
     table.actions.addFilter(/* ... */);
   }, 500);
   ```

5. **Sharing a `SessionStore` with colliding `tableName`s.** Snapshots are keyed by table name. Two tables with the same (auto-generated) name clobber each other. Always pass distinct `tableName`s when sharing a store. The same holds for a shared `bridge`: `destroy()`, which a failed initial load now runs too, drops the table's DuckDB table by name, so two tables sharing a bridge and a name lose each other's data.

6. **React Strict Mode double-invocation.** In dev, effects run twice. Without the cancel-flag pattern you'll mount two tables into the same container. See [snippet (g)](#g-destroy-on-unmount).

7. **Mutating `messages` after construction.** `messages` is consumed once. Destroy + recreate the table to change locale.

8. **Registering a custom viz on `defaultVisualizationRegistry`.** Leaks across every table on the page. Create a per-instance `new VisualizationRegistry()` and pass it via `visualizationRegistry`.

9. **Assuming derived-column errors throw.** They don't. `addDerivedColumn` resolves `{ success: false, error }` for expression/vector failures. Check `result.success`.

10. **Treating raw-SQL filters as validated input.** `RawSQLFilter.sql` is spliced into a `WHERE` clause. If your end users author the SQL, you own the injection surface — validate and sanitize at your layer.

11. **Expecting synchronous completion after `loadData()`.** `loadData()` returns a promise. Await it (or subscribe to `loadComplete`) before reading `state.schema.get()` / `state.totalRows.get()`.

12. **Blocking network for the WASM bundle.** DuckDB fetches from a CDN by default. On a strict CSP, supply `bridgeOptions.duckdbBundles` with self-hosted paths.

13. **Expecting list or struct columns in a `'string'` registration.** LIST, ARRAY, STRUCT, MAP, UNION and VARIANT columns are `type: 'nested'` (src/core/types.ts:19-30), so a custom visualization or stats panel whose `isApplicable` accepts `'string'` never sees them. Accept `'nested'` too, or test with `isNestedType` from `/advanced`; read `originalType` with `parseDuckDBType` to tell the kinds apart. JSON columns are still `'string'`.

14. **Reading nested values through `bridge.query`.** Arrow corrupts a `DECIMAL` or `HUGEINT` inside a list or struct (`[1.25, 2.50]` arrives as `[6.2e-322, 0]`), hands one under a MAP or UNION over as a `Uint32Array` of its unscaled integer's words (`MAP {'a': 1.25}` as `{ a: Uint32Array [125, 0, 0, 0] }`), reads an `INTERVAL` as an `Int32Array`, reads a date or timestamp inside a STRUCT, MAP or UNION with its own getter, so that a `TIMESTAMP` there holding `infinity`, or a year past 287396 or before 283458 BC, fails the read (`9223372036854775 is not safe to convert to a number`) and a `DATE` `infinity` reads as `185542587100800000`, and cannot carry a VARIANT (`Unsupported Arrow type VARIANT`). Use `actions.getColumnValues` / `getCellValue`, or select `CAST(to_json(c) AS VARCHAR)`, which writes `infinity` as `"infinity"`; a VARIANT as `CAST(c AS JSON)`, and a type holding one (`VARIANT[]`, `STRUCT(v VARIANT)`) as `CAST(CAST(c AS VARIANT) AS JSON)`, since `to_json` writes a VARIANT as a string (`"42"`, `["42"]`) and fails on some types holding one (see the `WorkerBridge.query` JSDoc, src/data/WorkerBridge.ts).

15. **An exact filter on a nested or JSON column without `valueType: 'text'`.** `{ type: 'point', column: 'tags', value: '[red' }` makes DuckDB cast the text to `VARCHAR[]`, a Conversion Error that fails every grid query until the filter goes; on a JSON column, any text that is not JSON does the same (`Conversion Error: Malformed JSON`). With `valueType: 'text'` it compares `CAST(col AS VARCHAR)` and simply matches nothing. The filter panel sets it on nested and JSON columns; a filter added in code must set it itself. A session restore (its filters and its undo and redo entries) and a loaded or imported preset give an exact filter on a JSON column `valueType: 'text'` when it has none, since one saved before 0.9 lacks it; a derived JSON column's restored filters stay as saved, and `addFilter` changes nothing (src/filters/jsonFilters.ts).

---

## 6. When to use `/advanced`

**Default to the root entry (`@jeyabbalas/data-table`) for 95% of cases.**

Reach into `/advanced` (`@jeyabbalas/data-table/advanced`) only when at least one of these applies:

- **Custom UI shell.** You want to render `TableContainer` inside your own chrome without the built-in `FilterBar` / `ModalHost`.
- **Custom visualization type.** Subclass `BaseVisualization` (advanced) and register via `VisualizationRegistry` (root). For nested columns, `isNestedType` and `parseDuckDBType` (advanced) say what a column holds.
- **Custom persistence flow.** You're writing your own `AutoSave` or pre-populating state from a remote snapshot via `SerializedStateSnapshot`.
- **Manual undo/redo capture.** You have imperative mutations outside `StateActions` and need to push your own snapshots via `UndoManager` + `captureSnapshot`/`applySnapshot`.
- **Custom export pipeline.** You call `exportFromState`/`exportJSONFromState`/`exportParquetFromState` directly (e.g., to pipe rows into a download worker).
- **Standalone filter / preset UI.** Mount `FilterBar` / `FilterPanel` / `FilterPresetPanel` independently.
- **Custom SQL editor outside the data table.** Build your own CodeMirror editor — for filter-preset composers, query-template forms, or derived-column wizards mounted in your own UI shell — using `createSqlExtensions` + `buildCompletionContext`. The bundled `CodeMirrorExpressionEditor` handles the in-table case; reach for the primitives when the editor lives elsewhere.

Signals that you're reaching unnecessarily:

- The root entry already exposes what you need (e.g., `VisualizationRegistry`, `SessionStore`, `FilterPresetManager` are all root-level).
- You just want to call a method you see in `/advanced` — check `table.actions.<method>` first.

Detailed symbol-by-symbol list: [`docs/api-reference.md#tier-2-exports`](./docs/api-reference.md#tier-2-exports).

---

## 7. Trigger patterns — when to pick this library

Use this library when the user asks for:

- _"A privacy-preserving in-browser analytics / exploratory table."_
- _"A table with cross-filter histograms and click-to-filter on column headers."_
- _"Load a CSV / Parquet and let users slice it."_
- _"Users should be able to add computed columns with a SQL expression."_
- _"Filters, derived columns, and session state should persist across reloads."_

Recommend a different library when the user asks for:

- **Server-side paginated CRUD editor with inline editing** → ag-Grid, TanStack Table.
- **Mobile-first touch table with swipe gestures** → a mobile table library, not this one.
- **Server-rendered table with no JS** → a templating approach; this library is client-only.
- **Real-time WebSocket-driven table with tens of thousands of updates per second** → this library handles full reloads well, but not high-frequency incremental updates.

---

## 8. Lifecycle diagram

```
createDataTable(opts)
  ├─ validate options (color scheme, strictBrowserCheck)
  ├─ WorkerBridge.initialize()               ← DuckDB WASM loads here
  ├─ TableState + StateActions (+ UndoManager if undoRedo)
  ├─ EventEmitter
  ├─ SessionStore.open()                     ← if persistence
  ├─ FilterPresetManager                     ← if presets
  ├─ TableContainer (FilterBar, Header, Body, Modals, ...)
  ├─ VisualizationRegistry wiring            ← if visualizations
  ├─ emit('ready')
  ├─ [if opts.source] await loadData         ← blocks resolution; a failure tears down, rejects
  └─ await createDataTable() resolves        ← first row and chart fetches settled

// After resolution:
table.state.*    ← read reactive state
table.actions.*  ← mutate (filters, sort, columns, derived, selection)
table.on(event)  ← subscribe to events (filterChange, loadComplete, error, warning, ...)
table.loadData() ← swap data while keeping worker + UI alive
table.destroy()  ← tear down DOM, worker (if owned), store (if owned)
```

`ready` is replayed in a microtask to listeners subscribing after init (src/DataTable.ts, `on('ready', …)` path). No other event is: the initial load's `loadStart` / `loadComplete` / `loadError` fire before `createDataTable()` resolves, so no consumer listener sees them.

If the initial load fails, `createDataTable()` first tears down what it built, as `destroy()` would: its DOM and listeners, and a worker or session store it created (a `bridge` or `sessionStore` you passed in stays open). Then it rejects with the load's error (a `DataTableError`, usually `LoadError`). The container is left as it was, ready for another `createDataTable()`. To watch the initial load, or to keep the table through a failed load and retry, omit `source` and call `await table.loadData(source, { tableName, sourceFormat, sourceOptions })` after subscribing, inside `try`. The `tableName`, `sourceFormat` and `sourceOptions` given to `createDataTable` apply to `source` only; a load without a `tableName` gets a generated one, so no saved session is restored.

---

## 9. Pointers

**Reference (for lookup during code-gen)**

- **API reference** — [`docs/api-reference.md`](./docs/api-reference.md)
- **Troubleshooting** — [`docs/troubleshooting.md`](./docs/troubleshooting.md)
- **llms.txt** — [`llms.txt`](./llms.txt) (index of this doc, api-reference, troubleshooting, guides)

**Guides (task-oriented walkthroughs)**

- [`docs/guides/loading-data.md`](./docs/guides/loading-data.md), [`filters.md`](./docs/guides/filters.md), [`derived-columns.md`](./docs/guides/derived-columns.md), [`events.md`](./docs/guides/events.md), [`visualizations.md`](./docs/guides/visualizations.md), [`session-persistence.md`](./docs/guides/session-persistence.md)
- [`annotations.md`](./docs/guides/annotations.md), [`column-header-tooltips.md`](./docs/guides/column-header-tooltips.md), [`stats-panels.md`](./docs/guides/stats-panels.md), [`sql-editor-primitives.md`](./docs/guides/sql-editor-primitives.md)
- [`theming.md`](./docs/guides/theming.md), [`i18n.md`](./docs/guides/i18n.md), [`accessibility.md`](./docs/guides/accessibility.md)
- [`multi-table.md`](./docs/guides/multi-table.md), [`csp-and-offline.md`](./docs/guides/csp-and-offline.md), [`filter-presets.md`](./docs/guides/filter-presets.md)

**Concepts (deep dives on architecture)**

- [`docs/concepts/architecture.md`](./docs/concepts/architecture.md)
- [`docs/concepts/state-model.md`](./docs/concepts/state-model.md)

**Integrations (framework / bundler recipes)**

- [`docs/integrations/react.md`](./docs/integrations/react.md), [`vue.md`](./docs/integrations/vue.md), [`svelte.md`](./docs/integrations/svelte.md), [`solid.md`](./docs/integrations/solid.md), [`nextjs.md`](./docs/integrations/nextjs.md), [`nuxt.md`](./docs/integrations/nuxt.md)
- [`docs/integrations/vite.md`](./docs/integrations/vite.md), [`webpack.md`](./docs/integrations/webpack.md), [`cdn.md`](./docs/integrations/cdn.md)

**Performance**

- [`docs/performance.md`](./docs/performance.md)

**Runnable code**

- **Examples index** — [`examples/README.md`](./examples/README.md) (14 single-feature examples)
  - [`10-column-export`](./examples/10-column-export/) — `getColumnValues` + synthetic `__rowid__`
  - [`11-annotations`](./examples/11-annotations/) — `table.annotations.*` CRUD, JSON I/O, rendering, severity filter
  - [`12-column-header-tooltips`](./examples/12-column-header-tooltips/) — structured tooltip popover, XSS-safe
  - [`13-custom-stats-panel`](./examples/13-custom-stats-panel/) — `BaseStatsPanel` subclass + `StatsPanelRegistry`; numeric `n · μ · σ` via custom `AVG` / `STDDEV_POP` query, categorical top-value with percentage
  - [`14-standalone-sql-editor`](./examples/14-standalone-sql-editor/) — two host-built CodeMirror SQL editors (filter SQL composer + derived expression composer) sharing live schema via `actions.getCompletionContext()`; refresh on `derivedChange` via `Compartment.reconfigure()`
- **Demo app** (full consumer showcase) — [`demo/`](./demo/)

**Source-of-truth (prefer these over the docs when they disagree)**

- **Source entry points** — `src/index.ts` (Tier-1), `src/advanced.ts` (Tier-2)
- **Options definition** — `src/DataTable.ts:133-367`
- **Event payloads** — `src/core/TableEvents.ts`
- **Action methods** — `src/core/Actions.ts`
