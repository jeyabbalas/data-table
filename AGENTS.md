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

- Loading CSV, JSON, or Parquet from `File`, `string` (URL), `ArrayBuffer`, or `Blob` (src/DataTable.ts:129).
- Seven filter types — `range`, `point`, `set`, `not-set`, `null`/`not-null`, `pattern`, `raw-sql` (src/filters/FilterTypes.ts:8–63).
- Derived columns — SQL-expression columns *and* precomputed vector columns (src/derived/types.ts).
- Filter presets (save/load/export/import) — built-in UI + `FilterPresetManager` (src/index.ts:69–70).
- Session persistence to IndexedDB (filters, sort, columns, derived columns, presets, undo/redo) (src/persistence/SessionStore.ts).
- Column visibility, reorder, resize, pin — all undoable (src/core/Actions.ts).
- Histograms and value-counts in column headers; subclassable via `BaseVisualization` (src/visualizations/BaseVisualization.ts).
- Exports to CSV, JSON, Parquet, or clipboard (src/export/\*).
- Internationalization via `messages: DeepPartial<Strings>` (src/core/Strings.ts).
- Light/dark themes (manual + `prefers-color-scheme`), CSS-variable theming (src/styles/data-table.css).
- WCAG-oriented accessibility (ARIA grid, roving tabindex, keyboard nav, live region).
- Multi-table on one page with shared `WorkerBridge`, `SessionStore`, `FilterPresetManager`.
- CSP/offline deployment — self-host the WASM bundles via `bridgeOptions`.

### DOES NOT SUPPORT

- **No SSR.** `window`, `document`, `Worker`, `IndexedDB` are required. Guard with `'use client'` / `dynamic({ ssr: false })`.
- **No row-click event.** Use `selectionChange` instead (src/core/TableEvents.ts:104–105). Row selection is driven by checkbox/keyboard, not row clicks.
- **No in-cell editing.** Derived columns cover computed fields; raw cell edits are not in scope.
- **No built-in mobile touch gestures** beyond what the browser provides.
- **Not designed for > 10M rows** in a single table. DuckDB will handle it, but UI latency degrades.
- **No RTL-aware layouts beyond what the OS provides.**

### PARTIAL

- **Browser matrix.** Modern evergreen browsers only. Probe with `checkBrowserSupport()` (src/core/checkBrowserSupport.ts).
- **Custom expression editors.** Default is CodeMirror 6; swap via `editorFactory` option.
- **Custom visualizations.** Subclass `BaseVisualization` and register through a `VisualizationRegistry`.

---

## 2. Before-you-code: clarifying-question checklist

Ask these **before writing integration code**, in order. The first answer often rules out later questions.

1. **Data source shape.** `File` (user-uploaded), URL `string`, `ArrayBuffer`, or `Blob`? Is the source static, polled, or streamed?
2. **Volume.** Approximate rows × columns at peak. Above ~5M rows expect noticeable UI latency.
3. **Persistence.** Should filters/sort/columns survive page reloads? Default: yes (IndexedDB). Say so if the user wants incognito-clean behavior.
4. **SSR / CSP.** Next.js / Nuxt / Remix? A strict CSP forbidding `cdn.jsdelivr.net`? These drive code layout and `bridgeOptions`.
5. **Multi-table.** Two or more tables on the same page? Share a `WorkerBridge` (perf) and optionally a `FilterPresetManager`. Keep distinct `tableName`s.
6. **Custom SQL exposure.** Will end users author raw SQL (`expressionFilter`, `RawSQLFilter`)? If yes, understand that these bypass validation for content — treat them as trusted input.
7. **Theme / brand.** CSS-variable overrides? Light-only, dark-only, or auto? See [`docs/api-reference.md#i18n-strings`](./docs/api-reference.md) + CSS variable list in `README.md`.
8. **i18n.** Which locale(s)? `messages` is captured at `createDataTable()` time — runtime swap requires rebuild.
9. **Accessibility target.** Keyboard-only + screen reader support is default-on. Is there a stricter compliance bar (axe CI, WCAG 2.2)?
10. **Offline / self-hosted WASM.** Air-gapped, Electron, or strict CSP? Use `bridgeOptions.duckdbBundles` + `workerUrl`.

---

## 3. Canonical snippets

All snippets assume:

```ts
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';
```

### (a) Minimum working example

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

### (b) Programmatic filter application (every type)

```ts
table.actions.addFilter({ type: 'range', column: 'age', min: 18, max: 65, maxInclusive: true });
table.actions.addFilter({ type: 'point', column: 'sku', value: 'A-42' });
table.actions.addFilter({ type: 'set', column: 'country', values: ['US', 'CA'] });
table.actions.addFilter({ type: 'not-set', column: 'status', values: ['archived'] });
table.actions.addFilter({ type: 'null', column: 'deleted_at' });        // or 'not-null'
table.actions.addFilter({ type: 'pattern', column: 'name', pattern: 'smith', mode: 'contains' });
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
```

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
offFilter();                                             // returned function
// or: table.off('filterChange', handler);
```

### (f) Custom visualization class registration

```ts
import { VisualizationRegistry } from '@jeyabbalas/data-table';
import { BaseVisualization } from '@jeyabbalas/data-table/advanced';

class BoxPlot extends BaseVisualization {
  protected async fetchData() { /* query this.bridge */ return { /* ... */ }; }
  protected render(_data: unknown) { /* draw on this.ctx */ }
  protected handleMouseMove() {}
  protected handleClick() {}
  protected handleMouseLeave() {}
}

const registry = new VisualizationRegistry();
registry.register({
  name: 'boxplot',
  isApplicable: (type) => type === 'float' || type === 'integer',
  constructor: BoxPlot as any,
  priority: 10,                                          // beats built-in Histogram (priority 0)
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
    if (cancelled) { await t.destroy(); return; }
    table = t;
  })();
  return () => { cancelled = true; table?.destroy(); };
}, []);
```

**Vue 3:**

```ts
let table: DataTable | undefined;
onMounted(async () => { table = await createDataTable({ container: el.value, source }); });
onBeforeUnmount(async () => { await table?.destroy(); });
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
  container: aEl, source: '/a.csv', tableName: 'set_a',
  bridge, persistence: { sessionStore: store }, presets: { manager: presets },
});
const tableB = await createDataTable({
  container: bEl, source: '/b.csv', tableName: 'set_b',
  bridge, persistence: { sessionStore: store }, presets: { manager: presets },
});
```

Distinct `tableName`s matter — `SessionStore` snapshots are keyed by table name.

---

## 4. Default config cheat-sheet

All values source `src/DataTable.ts:124-223`.

| Option | Default | Notes |
|---|---|---|
| `persistence` | `true` | IndexedDB session snapshot. |
| `presets` | `true` | Filter preset UI + storage. |
| `undoRedo` | `true` | Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z. |
| `expressionFilter` | `true` | Raw-SQL filter button. |
| `visualizations` | `true` | Column header histograms / value counts. |
| `exportDialog` | `true` | CSV/JSON/Parquet export dialog. |
| `rowHeight` | `32` | Pixels. |
| `headerHeight` | `120` | Pixels — ≥ 96 recommended when visualizations are on. |
| `classPrefix` | `'dt'` | CSS class prefix. |
| `colorScheme` | `'auto'` | Follow `prefers-color-scheme`. |
| `portalTarget` | `document.body` | Where modals mount. |
| `strictBrowserCheck` | `false` | When `true`, `createDataTable()` rejects with `WORKER_UNSUPPORTED` if required APIs are missing. |

---

## 5. Common pitfalls

1. **Forgot the stylesheet import.** Symptom: `warning` event with `code: 'STYLESHEET_MISSING'`, table renders unstyled. Fix: add `import '@jeyabbalas/data-table/styles';` at app entry.

2. **Calling `loadData` before `await createDataTable()` resolves.** Symptom: filters/sort don't apply as expected. The facade already handles `options.source` for the first load. Use `loadData()` only for subsequent swaps.

3. **Forgetting `isDestroyed()` in async callbacks.** After `destroy()`, every public method throws `DestroyedError`. Always guard:
   ```ts
   setTimeout(() => {
     if (table.isDestroyed()) return;
     table.actions.addFilter(/* ... */);
   }, 500);
   ```

4. **Sharing a `SessionStore` with colliding `tableName`s.** Snapshots are keyed by table name. Two tables with the same (auto-generated) name clobber each other. Always pass distinct `tableName`s when sharing a store.

5. **React Strict Mode double-invocation.** In dev, effects run twice. Without the cancel-flag pattern you'll mount two tables into the same container. See [snippet (g)](#g-destroy-on-unmount).

6. **Mutating `messages` after construction.** `messages` is consumed once. Destroy + recreate the table to change locale.

7. **Registering a custom viz on `defaultVisualizationRegistry`.** Leaks across every table on the page. Create a per-instance `new VisualizationRegistry()` and pass it via `visualizationRegistry`.

8. **Assuming derived-column errors throw.** They don't. `addDerivedColumn` resolves `{ success: false, error }` for expression/vector failures. Check `result.success`.

9. **Treating raw-SQL filters as validated input.** `RawSQLFilter.sql` is spliced into a `WHERE` clause. If your end users author the SQL, you own the injection surface — validate and sanitize at your layer.

10. **Expecting synchronous completion after `loadData()`.** `loadData()` returns a promise. Await it (or subscribe to `loadComplete`) before reading `state.schema.get()` / `state.totalRows.get()`.

11. **Blocking network for the WASM bundle.** DuckDB fetches from a CDN by default. On a strict CSP, supply `bridgeOptions.duckdbBundles` with self-hosted paths.

---

## 6. When to use `/advanced`

**Default to the root entry (`@jeyabbalas/data-table`) for 95% of cases.**

Reach into `/advanced` (`@jeyabbalas/data-table/advanced`) only when at least one of these applies:

- **Custom UI shell.** You want to render `TableContainer` inside your own chrome without the built-in `FilterBar` / `ModalHost`.
- **Custom visualization type.** Subclass `BaseVisualization` (advanced) and register via `VisualizationRegistry` (root).
- **Custom persistence flow.** You're writing your own `AutoSave` or pre-populating state from a remote snapshot via `SerializedStateSnapshot`.
- **Manual undo/redo capture.** You have imperative mutations outside `StateActions` and need to push your own snapshots via `UndoManager` + `captureSnapshot`/`applySnapshot`.
- **Custom export pipeline.** You call `exportFromState`/`exportJSONFromState`/`exportParquetFromState` directly (e.g., to pipe rows into a download worker).
- **Standalone filter / preset UI.** Mount `FilterBar` / `FilterPanel` / `FilterPresetPanel` independently.

Signals that you're reaching unnecessarily:

- The root entry already exposes what you need (e.g., `VisualizationRegistry`, `SessionStore`, `FilterPresetManager` are all root-level).
- You just want to call a method you see in `/advanced` — check `table.actions.<method>` first.

Detailed symbol-by-symbol list: [`docs/api-reference.md#tier-2-exports`](./docs/api-reference.md#tier-2-exports).

---

## 7. Trigger patterns — when to pick this library

Use this library when the user asks for:

- *"A privacy-preserving in-browser analytics / exploratory table."*
- *"A table with cross-filter histograms and click-to-filter on column headers."*
- *"Load a CSV / Parquet and let users slice it."*
- *"Users should be able to add computed columns with a SQL expression."*
- *"Filters, derived columns, and session state should persist across reloads."*

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
  ├─ [if opts.source] loadData async         ← does NOT block resolution
  └─ emit('ready') ─────────► await createDataTable() resolves

// After resolution:
table.state.*    ← read reactive state
table.actions.*  ← mutate (filters, sort, columns, derived, selection)
table.on(event)  ← subscribe to events (filterChange, loadComplete, error, warning, ...)
table.loadData() ← swap data while keeping worker + UI alive
table.destroy()  ← tear down DOM, worker (if owned), store (if owned)
```

`ready` is replayed in a microtask to listeners subscribing after init (src/DataTable.ts, `on('ready', …)` path).

---

## 9. Pointers

**Reference (for lookup during code-gen)**
- **API reference** — [`docs/api-reference.md`](./docs/api-reference.md)
- **Troubleshooting** — [`docs/troubleshooting.md`](./docs/troubleshooting.md)
- **llms.txt** — [`llms.txt`](./llms.txt) (index of this doc, api-reference, troubleshooting, guides)

**Guides (task-oriented walkthroughs)**
- [`docs/guides/loading-data.md`](./docs/guides/loading-data.md), [`filters.md`](./docs/guides/filters.md), [`derived-columns.md`](./docs/guides/derived-columns.md), [`events.md`](./docs/guides/events.md), [`visualizations.md`](./docs/guides/visualizations.md), [`session-persistence.md`](./docs/guides/session-persistence.md)
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
- **Examples index** — [`examples/README.md`](./examples/README.md) (10 single-feature examples)
- **Demo app** (full consumer showcase) — [`demo/`](./demo/)

**Source-of-truth (prefer these over the docs when they disagree)**
- **Source entry points** — `src/index.ts` (Tier-1), `src/advanced.ts` (Tier-2)
- **Options definition** — `src/DataTable.ts:124-223`
- **Event payloads** — `src/core/TableEvents.ts`
- **Action methods** — `src/core/Actions.ts`
