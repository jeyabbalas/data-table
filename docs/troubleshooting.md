# Troubleshooting

Diagnostic recipes for common problems. For the full list of public errors/warnings with file references, see [API reference → Error catalog](./api-reference.md#error-catalog).

## Contents

- [Error code reference](#error-code-reference)
- [Warning events](#warning-events)
- [FAQs — why doesn't X work?](#faqs)
- [Browser support quick reference](#browser-support-quick-reference)

---

## Error code reference

Subscribe once to cover everything:

```ts
table.on('error', ({ error, source }) => {
  console.error(`[${source}] ${error.code}: ${error.message}`, error.details);
});
```

Source: `src/core/errors.ts` + error sites across `src/`.

| Code                                                                                                      | Class                   | Cause                                                                                                                                                                                                                                   | Fix                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPTIONS_INVALID`                                                                                         | `ConfigurationError`    | Invalid option passed to `createDataTable()` or a preset call.                                                                                                                                                                          | Check `error.details` for the bad value; align with [`CreateDataTableOptions`](./api-reference.md#createdatatableoptions).                                                                                       |
| `PRESET_DUPLICATE_NAME`                                                                                   | `ConfigurationError`    | `FilterPresetManager.save` / `.rename` was called with a name another preset already uses (case- and whitespace-sensitive).                                                                                                             | Read `presetManager.getPresets()` first and either pick a unique name or call `update(id, …)` to overwrite the existing preset. `error.details.name` echoes the conflicting name.                                |
| `WORKER_UNSUPPORTED`                                                                                      | `WorkerInitError`       | `strictBrowserCheck: true` detected a missing required API.                                                                                                                                                                             | Render an "unsupported browser" screen. `error.details.missing` lists the APIs.                                                                                                                                  |
| `WORKER_CRASHED`                                                                                          | `WorkerInitError`       | The DuckDB worker failed to initialize or crashed.                                                                                                                                                                                      | Check DevTools → Console for the worker-side stack; often caused by a broken WASM asset path.                                                                                                                    |
| `WORKER_INIT_TIMEOUT`                                                                                     | `WorkerInitError`       | Init exceeded `bridgeOptions.initTimeoutMs` (default 30 s).                                                                                                                                                                             | Increase the timeout, verify `duckdbBundles` is reachable, or pre-warm the WASM asset.                                                                                                                           |
| `WORKER_TERMINATED`                                                                                       | `WorkerTerminatedError` | Worker was terminated mid-operation.                                                                                                                                                                                                    | Usually a race with `destroy()`; check `isDestroyed()` guards.                                                                                                                                                   |
| `BRIDGE_NOT_READY`                                                                                        | `ConfigurationError`    | A bridge method was called before init.                                                                                                                                                                                                 | `await createDataTable(...)` before issuing queries.                                                                                                                                                             |
| `QUERY_RUNTIME`                                                                                           | `QueryError`            | DuckDB returned an error at query time.                                                                                                                                                                                                 | Check `error.details.sql` (when present); common causes: referenced a column that was since removed, or a derived-column VIEW is stale.                                                                          |
| `QUERY_ABORTED`                                                                                           | `QueryError`            | The bridge rejected a query because the supplied `AbortSignal` fired (or the bridge was torn down) before the worker reply.                                                                                                             | Non-fatal — your own `AbortSignal` fired, or the table is being destroyed.                                                                                                                                       |
| `QUERY_CANCELLED`                                                                                         | `QueryError`            | The worker reported that DuckDB interrupted an in-flight query/load/export because a `cancel` message reached it mid-flight.                                                                                                            | Non-fatal — paired with `QUERY_ABORTED` on the same `AbortSignal`. Distinct so you can branch on whether DuckDB actually stopped vs. the bridge rejected ahead of the worker.                                    |
| `SQL_SYNTAX`                                                                                              | `SQLValidationError`    | Raw-SQL filter / derived-column expression failed validation.                                                                                                                                                                           | Use `actions.validateSQLFilter` or `actions.validateExpression` before submit.                                                                                                                                   |
| `LOAD_PARSE_FAILED`                                                                                       | `LoadError`             | CSV/JSON/Parquet parse failed. `error.details.stage` indicates which coercion stage (`timestamp`, `date`, `time`).                                                                                                                      | Inspect the offending row; most commonly a bad timestamp format.                                                                                                                                                 |
| `LOAD_INVALID_TIMEZONE`                                                                                   | `LoadError`             | `loadOptions.timezone` isn't a valid IANA zone.                                                                                                                                                                                         | Use a canonical zone like `'America/New_York'`.                                                                                                                                                                  |
| `LOAD_INVALID_OPTIONS`                                                                                    | `LoadError`             | Incompatible combination of load options.                                                                                                                                                                                               | `error.details.option` names the offending key.                                                                                                                                                                  |
| `LOAD_FORMAT_UNSUPPORTED`                                                                                 | `LoadError`             | Source didn't match a known format.                                                                                                                                                                                                     | Pass `sourceFormat: 'csv' \| 'json' \| 'parquet'` explicitly.                                                                                                                                                    |
| `FETCH_FAILED`                                                                                            | `LoadError`             | URL fetch failed (network, CORS, 404).                                                                                                                                                                                                  | Verify the URL; surface a retry UI.                                                                                                                                                                              |
| `PARSE_FAILED`                                                                                            | `LoadError`             | Generic parse fallback.                                                                                                                                                                                                                 | Check `error.details` for context; often a malformed file.                                                                                                                                                       |
| `SOURCE_AMBIGUOUS`                                                                                        | `LoadError`             | A string `source` was neither a recognized URL (`http://`, `https://`, `//`, `/`, `./`, `../`) nor inline CSV/JSON/Parquet content (multi-line, or starting with `[`/`{`). The most common case is a bare filename like `'sample.csv'`. | If it's a path, prefix with `/` or `./` so the library resolves it against `window.location`. If it's inline data, check the format. `error.details.source` echoes the first 200 chars of the offending input.   |
| `WORKER_PROTOCOL_VIOLATION`                                                                               | `WorkerInitError`       | Worker sent a malformed message (missing fields, unknown type) or replied to an unknown request id.                                                                                                                                     | Almost always a buggy custom `bridgeOptions.workerFactory` / `workerUrl`; use the default worker.                                                                                                                |
| `INVALID_IDENTIFIER`                                                                                      | `SQLValidationError`    | A column or table name passed to `quoteIdentifier` was empty or contained a NUL byte.                                                                                                                                                   | Reject empty / NUL-containing identifiers at your input layer.                                                                                                                                                   |
| `EXPRESSION_INVALID`                                                                                      | `DerivedColumnError`    | Derived-column expression rejected by DuckDB.                                                                                                                                                                                           | The `error.message` echoes DuckDB's diagnostic; surface it to the user.                                                                                                                                          |
| `CIRCULAR_DEPENDENCY`                                                                                     | `DerivedColumnError`    | Derived column references itself directly or transitively.                                                                                                                                                                              | Name the column something new, or break the cycle.                                                                                                                                                               |
| `DEPENDENTS_INCOMPATIBLE`                                                                                 | `DerivedColumnError`    | `replaceDerivedColumn` would break one or more dependent columns under the proposed new definition.                                                                                                                                     | `error.details.dependentsAffected: string[]` lists the affected columns; `error.details.reasons` maps each name to the validation message. Either fix the new expression or replace the dependent columns first. |
| `NOT_FOUND`                                                                                               | `DerivedColumnError`    | `updateDerivedColumn` / `removeDerivedColumn` / `replaceDerivedColumn` targeted a non-existent column.                                                                                                                                  | Read `state.derivedColumns` first.                                                                                                                                                                               |
| `VECTOR_LENGTH_MISMATCH`                                                                                  | `DerivedColumnError`    | `values.length !== state.totalRows`.                                                                                                                                                                                                    | Resize your vector to match.                                                                                                                                                                                     |
| `LOAD_RESERVED_COLUMN_NAME`                                                                               | `LoadError`             | Source contains a column named `__rowid__`, which is reserved for the synthetic row id.                                                                                                                                                 | Rename the source column (e.g. to `_rowid_orig`) and reload.                                                                                                                                                     |
| `COLUMN_NOT_FOUND`                                                                                        | `QueryError`            | `actions.getColumnValues(name)` was called with a name that isn't in `state.schema`.                                                                                                                                                    | Read `state.schema.get()` to validate the name first; remember `__rowid__` is queryable even though it's hidden by default.                                                                                      |
| `INVALID_PAGINATION`                                                                                      | `QueryError`            | `getColumnValues` was called with a negative or non-integer `limit` / `offset`.                                                                                                                                                         | Coerce inputs to non-negative integers before passing them in.                                                                                                                                                   |
| `INVALID_ROWID`                                                                                           | `QueryError`            | `getColumnValues({ scope: 'selected' })` was called with a row id in `state.selectedRows` that is not a non-negative integer.                                                                                                           | Audit the selection-management code path that populated `state.selectedRows`.                                                                                                                                    |
| `NO_TABLE`                                                                                                | `QueryError`            | `getColumnValues` was called before data is loaded.                                                                                                                                                                                     | Await `loadComplete` first, or gate on `state.tableName.get()`.                                                                                                                                                  |
| `ANNOTATION_DUPLICATE_ID`                                                                                 | `AnnotationError`       | An annotation was added or merged with an `id` that already exists in the store.                                                                                                                                                        | Omit `id` to let the library generate one (`ann_` + Crockford base32), or remove the existing annotation first.                                                                                                  |
| `ANNOTATION_INVALID_SHAPE`                                                                                | `AnnotationError`       | `loadJSON` rejected a malformed annotation entry — wrong scope, missing required field, wrong field type.                                                                                                                               | Validate the JSON against the [annotation file format](./api-reference.md#annotation-json-format) before loading.                                                                                                |
| `ANNOTATION_VERSION_UNSUPPORTED`                                                                          | `AnnotationError`       | `loadJSON` was given a file whose `version` is greater than `ANNOTATION_FILE_VERSION`.                                                                                                                                                  | Either upgrade the library or downgrade / regenerate the JSON.                                                                                                                                                   |
| `ANNOTATION_NOT_FOUND` / `ANNOTATION_*_IMMUTABLE` / `ANNOTATION_TABLENAME_MISMATCH` / `ANNOTATION_FAILED` | `AnnotationError`       | Other annotation lifecycle errors — see the {@link AnnotationError} JSDoc in `src/core/errors.ts` for the full list.                                                                                                                    | Branch on `error.code` to surface the right user message.                                                                                                                                                        |
| `NO_TABLE_LOADED`                                                                                         | `ExportError`           | Export called before data is loaded.                                                                                                                                                                                                    | Await `loadComplete` first, or gate the export UI on `state.tableName.get()`.                                                                                                                                    |
| `CANVAS_UNAVAILABLE`                                                                                      | `ExportError`           | `HTMLCanvasElement` unavailable (e.g., headless browser without canvas).                                                                                                                                                                | Skip the export, or use a server-side renderer.                                                                                                                                                                  |
| `CLIPBOARD_UNAVAILABLE`                                                                                   | `ExportError`           | Clipboard API blocked (non-secure context, user-gesture required).                                                                                                                                                                      | Fall back to the Download button in the export dialog.                                                                                                                                                           |
| `EXPORT_FAILED`                                                                                           | `ExportError`           | Generic export pipeline failure (default code).                                                                                                                                                                                         | Inspect `error.message` and `error.cause` for the underlying issue.                                                                                                                                              |
| `SAVE_FAILED`                                                                                             | `PersistenceError`      | IndexedDB write failed (default code).                                                                                                                                                                                                  | Surface a non-blocking message; the facade keeps running.                                                                                                                                                        |
| `PERSISTENCE_QUOTA_EXCEEDED`                                                                              | `PersistenceError`      | IndexedDB rejected the save with `QuotaExceededError`.                                                                                                                                                                                  | Trigger `actions.clearSession()` or downsize the dataset; further saves are skipped until the quota frees up.                                                                                                    |
| `DESTROYED`                                                                                               | `DestroyedError`        | Public method called after `destroy()`, or async action resolved after `destroy()` and dropped its state mutation.                                                                                                                      | Guard async callbacks with `isDestroyed()`.                                                                                                                                                                      |
| `INVARIANT`                                                                                               | `ConfigurationError`    | Internal invariant violation.                                                                                                                                                                                                           | File a bug with the repro steps — this should not happen.                                                                                                                                                        |
| `UNKNOWN`                                                                                                 | `DataTableError`        | Default code on the base class. In normal operation a subclass code is always set.                                                                                                                                                      | If you see this, file a bug.                                                                                                                                                                                     |

---

## Warning events

Non-fatal issues surface on `table.on('warning', …)` instead of `error`:

```ts
table.on('warning', ({ code, message, details }) => {
  if (code === 'STYLESHEET_MISSING') {
    /* … */
  } else if (code === 'PERSISTENCE_UNAVAILABLE') {
    /* … */
  }
});
```

| Code                           | Source                            | Meaning                                                                                                                                                                 | Recommended handling                                                                                                              |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `STYLESHEET_MISSING`           | `src/DataTable.ts`                | The library didn't find the `--dt-stylesheet-loaded` marker, meaning `@jeyabbalas/data-table/styles` wasn't imported.                                                   | Add the import at application entry: `import '@jeyabbalas/data-table/styles';`.                                                   |
| `PERSISTENCE_UNAVAILABLE`      | `src/DataTable.ts`                | IndexedDB was requested but unavailable (private browsing, disabled storage).                                                                                           | Inform the user that filters won't persist across reloads.                                                                        |
| `PERSISTENCE_VERSION_REJECTED` | `src/persistence/SessionStore.ts` | Stored snapshot's `version` is outside `[1, SNAPSHOT_VERSION]`; the table booted fresh. Typical cause: a downgrade from a newer library version that wrote the IDB row. | Inform the user that the prior session was reset, or trigger your own reapply path. The library handles boot-fresh automatically. |
| (console warning)              | `src/persistence/SessionStore.ts` | An unknown filter type was encountered while restoring a snapshot.                                                                                                      | Safe to ignore for old snapshots; indicates a filter schema evolved.                                                              |

---

## FAQs

### 1. "Stylesheet missing" warning in the console

Symptom: `warning` event with `code: 'STYLESHEET_MISSING'` and the table renders without colors/spacing.

Fix:

```ts
import '@jeyabbalas/data-table/styles'; // Side-effect import — do this once at app entry.
import { createDataTable } from '@jeyabbalas/data-table';
```

The library uses a `--dt-stylesheet-loaded` CSS custom property as a load sentinel. If the sentinel is missing at init time, the warning fires. See `src/core/stylesheet.ts` for the detection logic.

---

### 2. Table renders blank in Next.js / SSR framework

The library needs `window`/`document`/`Worker`. Any SSR framework will attempt to render it on the server and crash or ship empty HTML.

Fix for Next.js App Router:

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

export default function TablePage() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let table: DataTable | undefined;
    (async () => {
      if (!ref.current) return;
      const t = await createDataTable({ container: ref.current, source: '/data.csv' });
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
  return <div ref={ref} style={{ height: 600 }} />;
}
```

For Pages Router, use `dynamic(() => import('./TableClient'), { ssr: false })`.

---

### 3. IndexedDB persistence failing in private browsing

Symptom: `warning` event with `code: 'PERSISTENCE_UNAVAILABLE'`, filters don't survive reload.

Fix: no action required — the library already falls back to in-memory state. If you want to surface this to the user:

```ts
table.on('warning', ({ code }) => {
  if (code === 'PERSISTENCE_UNAVAILABLE') {
    showBanner('Private browsing: your filters won't be saved.');
  }
});
```

Use `table.isPersistenceActive()` to branch UI on availability.

---

### 4. DuckDB CDN blocked by CSP

Symptom: worker fails to init (`WORKER_CRASHED`) because `https://cdn.jsdelivr.net/...` is blocked.

Fix: self-host the worker and WASM bundles, then point the bridge at them via `bridgeOptions`:

```ts
await createDataTable({
  container,
  source,
  bridgeOptions: {
    workerUrl: new URL('./duckdb-worker.js', import.meta.url).href,
    duckdbBundles: {
      mvp: {
        mainModule: '/duckdb/duckdb-mvp.wasm',
        mainWorker: '/duckdb/duckdb-browser-mvp.worker.js',
      },
      eh: {
        mainModule: '/duckdb/duckdb-eh.wasm',
        mainWorker: '/duckdb/duckdb-browser-eh.worker.js',
      },
    },
  },
});
```

Copy the `@duckdb/duckdb-wasm/dist/*.wasm` and worker files into your static assets at build time.

---

### 5. Filters don't apply right after `loadData()`

Symptom: `actions.addFilter()` appears to do nothing immediately after a load.

Cause: `loadData()` is asynchronous. Filters applied before the load finishes are queued against an empty state.

Fix:

```ts
await table.loadData('/data.csv');
table.actions.addFilter({ type: 'range', column: 'age', min: 18, max: 65 });
```

Or subscribe to `loadComplete`:

```ts
const unsub = table.on('loadComplete', () => {
  table.actions.addFilter({/* ... */});
  unsub();
});
```

---

### 6. WASM 404 in production (dev worked fine)

Cause: your bundler didn't copy the DuckDB WASM assets into the production build.

Fix depends on the bundler:

- **Vite**: add a `vite-plugin-static-copy` entry, or vendor the WASM files into `public/` and set `bridgeOptions.duckdbBundles` to absolute paths.
- **Webpack**: use `copy-webpack-plugin` to copy `node_modules/@duckdb/duckdb-wasm/dist/*.wasm` into the output.
- **Next.js**: place the files in `public/duckdb/` and reference them with absolute paths in `bridgeOptions`.

Verify in DevTools → Network that the `.wasm` file resolves with a 200 before creating the table.

---

### 7. React Strict Mode double-initialization

Symptom: two tables briefly appear in dev; console shows two `ready` events.

Fix: use a cancel flag and call `destroy()` in cleanup.

```tsx
useEffect(() => {
  let cancelled = false;
  let table: DataTable | undefined;
  (async () => {
    const t = await createDataTable({ container: ref.current!, source });
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

The same pattern handles navigation-driven unmounts.

---

### 8. Memory grows across successive `loadData()` calls

Cause: most of the obvious culprits are already cleaned up by the library:

- The previous base table is dropped on `loadData` when `tableName`
  differs; same-`tableName` reload uses `CREATE OR REPLACE TABLE`, so
  the catalog never accumulates orphans across reloads.
- Derived-column VIEWs are namespaced per `tableName` and dropped by
  `DerivedColumnManager.destroy()` when the table is destroyed.
- The query cache is flushed on each load.

What's left to check when memory still climbs:

- **Consumer-created tables.** Tables you registered yourself via
  `bridge.query('CREATE TABLE foo AS …')` are not tracked by any
  `DataTable`, so they outlive every load. Drop them explicitly with
  `await bridge.dropTable('foo')`.
- **References held by your app code.** A destroyed `DataTable` still
  in a closure or array prevents the worker, snapshots, and DOM from
  being garbage-collected. Null out the reference after `destroy()`.
- **Very large dataset swaps.** Both buffers coexist briefly while the
  new load is in flight. For peak-memory-sensitive paths, prefer
  `await table.destroy(); table = await createDataTable({ … })` over
  `loadData()`.

For a clean UI slate without releasing the underlying DuckDB table,
call `await table.clearSession()` — the table stays queryable until
the next `loadData` or `destroy()`.

---

### 9. Custom visualization never appears on its column

Symptom: you called `defaultVisualizationRegistry.register(...)` but the built-in histogram still shows.

Cause: either the `isApplicable` predicate returns `false` for the column's `DataType`, or your registration's `priority` is `≤ 0` (built-ins use `0` and are evaluated first for same-priority entries in insertion order).

Fix:

```ts
const registry = new VisualizationRegistry(); // per-instance
registry.register({
  name: 'my-viz',
  isApplicable: (type) => type === 'float',
  constructor: MyViz,
  priority: 10, // beats built-ins
});
await createDataTable({ container, source, visualizationRegistry: registry });
```

Prefer a per-instance `VisualizationRegistry` over mutating `defaultVisualizationRegistry` — the latter leaks across every table on the page.

---

### 10. Export dialog doesn't list all columns

Cause: the export dialog lists only **visible** columns when `columns: 'all'`. Hidden columns are excluded by design.

Fix: call `actions.showAllColumns()` before opening the dialog, or pass an explicit array to export helpers via `/advanced`:

```ts
import { exportFromState } from '@jeyabbalas/data-table/advanced';

const csv = await exportFromState(table.state, table.bridge, {
  scope: 'all',
  columns: ['id', 'name', 'hidden_col'],
  includeHeaders: true,
  delimiter: ',',
  nullValue: '',
});
```

---

### 11. i18n override doesn't apply after creation

Cause: `messages` is consumed once at `createDataTable()` time and threaded through every component. Mutating the object later has no effect.

Fix: destroy + recreate the table when the locale changes:

```ts
function swapLocale(locale: 'en' | 'fr') {
  await table.destroy();
  table = await createDataTable({ container, source, messages: messagesFor(locale) });
}
```

---

### 12. Two tables on the same page share filter state

Cause: you passed the same `SessionStore` **and** the underlying tables share a `tableName` (or both auto-generated to the same default). Snapshots are keyed by table name, so they clobber each other.

Fix: pass distinct `tableName` options, or don't share the store at all — let each table own its own:

```ts
const tableA = await createDataTable({ container: aEl, source: '/a.csv', tableName: 'set_a' });
const tableB = await createDataTable({ container: bEl, source: '/b.csv', tableName: 'set_b' });
```

Sharing a `WorkerBridge` for performance is fine even when each table owns its own store.

---

### 13. Undo/redo drifts when derived columns are involved

Cause: `addDerivedColumn` is `async` because it mutates DuckDB. If you push state snapshots from custom `/advanced` code without awaiting, the undo stack can desync from the on-disk VIEW.

Fix: always `await table.actions.addDerivedColumn(...)` before capturing the next snapshot. The facade does this already — the pitfall only affects direct `/advanced` consumers.

---

### 14. Keyboard navigation skips the header row

Cause: `headerHeight` is too small to fit its controls, so the header collapses and there is nothing to land on. The header row is part of the keyboard cursor's space — `ArrowUp` from body row 0 moves onto it — so a collapsed header reads as "the cursor skipped a row".

Fix: `headerHeight: 120` (the default) is usually right. If you've overridden it, keep it at **≥ 96** when visualizations are enabled. Lower values collide with the visualization canvas.

---

### 15. Dark mode doesn't apply inside portalled modals

Cause: modals portal to `document.body` so they don't inherit the `data-dt-color-scheme` attribute from `.dt-root` via the DOM tree.

Fix: the library mirrors the attribute onto the body for you when `colorScheme` is `'light' \| 'dark' \| 'auto'`. If you've replaced the portal target or wrapped the body in a shadow root, pass the root element explicitly:

```ts
import { ExportDialog } from '@jeyabbalas/data-table/advanced';

new ExportDialog(state, bridge, {
  classPrefix: 'dt',
  colorSchemeSource: document.querySelector('.dt-root')!, // mirror-from this element
});
```

For the facade path, `setColorScheme()` handles this automatically.

### 16. `LoadError` with code `LOAD_RESERVED_COLUMN_NAME`

Symptom: loading a CSV / JSON / Parquet file rejects with `error.code === 'LOAD_RESERVED_COLUMN_NAME'`.

Cause: the source contains a column literally named `__rowid__`. The loader synthesizes its own `__rowid__` (BIGINT, 0-indexed) on every source so apps have a stable row key, and refuses to silently overwrite or rename a same-named column.

The same name is rejected at derived-column-add time — `actions.addDerivedColumn({ name: '__rowid__', ... })` resolves `{ success: false, error: '...is reserved...' }` regardless of whether `__rowid__` is currently in the live schema, so the synthetic id can never be shadowed by a user-added column.

Fix: rename the source column (e.g. to `_rowid_orig`, `original_row_id`, anything that's not `__rowid__`) and reload. If the data was generated by an upstream tool, regenerate it without the conflicting column.

### 17. Annotations not visually appearing on rows or cells

Common causes and fixes:

- **Severity filter hides them.** `table.annotations.setSeverityFilter({ info: false })` (or `warning` / `error`) suppresses the matching severity in the rendering layer without removing data. Read `table.annotations.getSeverityFilter()` to confirm; flip the flag back to `true` to surface them again.
- **`rowId` mismatch.** Annotations are keyed by the synthetic `__rowid__` (BIGINT). When the app derives a `rowId` from `actions.getColumnValues('__rowid__')` (which returns `BigInt64Array`), convert with `Number(rowIds[i])` before adding — otherwise the bigint is stored verbatim and won't match the renderer's number-typed row index.
- **Row filtered out.** Filtered-out rows simply aren't in the DOM, so their cell-scope annotations don't render. Clear the filter (or change it) and the tint returns. The data is unchanged.
- **No stylesheet.** Annotation classes (`dt-row--annotated`, `dt-cell--annotated`, etc.) need the library stylesheet. If the `STYLESHEET_MISSING` warning fires, see FAQ §1.

### 18. Column-header tooltip vanished on reload

Symptom: tooltips set via `actions.setColumnHeaderTooltip` disappear when the user reloads the page.

Cause: the embedding app likely created the table with `persistence: false`. That's the recommended pattern when the app already owns its column registry (see [example 12](../examples/12-column-header-tooltips/)) — tooltips stay ephemeral and the embedding app re-applies them on every mount.

Fix (intentional case): re-apply the tooltips at startup by iterating the catalogue:

```ts
const catalogue: Record<string, ColumnHeaderTooltipContent | string> = {/* … */};
for (const [col, content] of Object.entries(catalogue)) {
  table.actions.setColumnHeaderTooltip(col, content);
}
```

Fix (persistence wanted): omit `persistence: false`. Tooltips ride along in `SessionSnapshot.columnHeaderTooltips` and survive reloads.

### 19. After upgrading: my older session reloaded with empty annotations

Symptom: after upgrading to a release that bumped `SNAPSHOT_VERSION` to 5, an existing IndexedDB session reloads with `table.annotations.count() === 0` even though no annotations existed before because the feature is new.

Cause: pre-v5 snapshots have no `annotations` field, so the store loads empty. This is the back-compat path — no error, no warning. Older `columnHeaderTooltips` are absent for the same reason.

Fix: nothing to fix. New annotations / tooltips created from now on persist normally. To start clean, call `await table.clearSession()` before re-loading.

### 20. My custom stats panel never renders — the built-in two-line formatter still shows

Symptom: a `BaseStatsPanel` subclass is registered, the table mounts, but the column header still renders the library's default `min · med · max` (or `<n> unique`) line.

Common causes and fixes:

- **`isApplicable(type)` predicate doesn't match.** The argument is the column's `DataType` from `state.schema.get().get(name)?.type` — one of `'integer' | 'float' | 'decimal' | 'string' | 'boolean' | 'uuid' | 'date' | 'timestamp' | 'time' | 'interval'`. A panel guarded by `(type) => type === 'number'` (no such type) silently never matches. Log the actual type from `state.schema` to confirm.
- **A higher-`priority` registration shadows yours.** Use `statsPanelRegistry.getRegisteredTypes()` to inspect the registered names, then re-register with a higher `priority`. Same-name re-register replaces the existing entry.
- **You registered on the wrong registry.** A common slip: registering on `defaultStatsPanelRegistry` (the module-scoped fallback) but constructing the table with `statsPanelRegistry: new StatsPanelRegistry()` (an empty per-instance one), or vice-versa. The per-instance registry, if passed, fully replaces the default — it does not layer on top.
- **The match is by name, not type.** Subclass `StatsPanelRegistry` and override `create(container, column, options)` to inspect `column.name`; fall back to `super.create(...)` for everything else (same pattern as `examples/08-custom-visualization`'s `StateAwareRegistry`).

### 21. Stats panel renders stale data after a fast filter change

Symptom: rapid brushing or filter toggling flashes an older stat for ~50–200 ms before the latest value renders.

Cause: a panel that issues async DuckDB queries via `options.bridge.query(…)` can have a query for filter set F1 still in flight when F2 arrives. If F1's query resolves _after_ F2's, F1's `paint()` call overwrites F2's. The library's `StatsPanelCoordinator` already stamps a `filterSequence` and short-circuits superseded `updateFilters()` invocations on the _broadcast_ side, but a panel that has its own per-call awaits still needs a local counter to drop stale results once they come back.

Fix: stamp a per-panel `fetchSeq` counter — increment at the top of every `fetch()` call, capture the value into a local, and bail before `paint()` if the local doesn't match the current counter:

```ts
private fetchSeq = 0;

private async fetch(): Promise<void> {
  if (this.isDestroyed()) return;
  const seq = ++this.fetchSeq;
  const rows = await this.options.bridge.query<{ /* ... */ }>(sql);
  if (this.isDestroyed() || seq !== this.fetchSeq) return;   // dropped
  this.paint(rows);
}
```

The canonical pattern is in [`examples/13-custom-stats-panel/main.ts`](../examples/13-custom-stats-panel/main.ts) (lines 107–143).

### 22. Stats-panel errors don't reach my `table.on('error', …)` listener

Symptom: a panel's fetch / render branch throws or rejects, but the error event never fires.

Cause: the panel didn't route the error through `options.onError`. The library's `StatsPanelCoordinator` deliberately swallows per-panel `updateFilters()` rejections so one panel's failure doesn't cascade across the other columns — surfacing the error is the panel's responsibility.

Fix: wrap each fetch / render branch in try / catch and route through `onError`:

```ts
try {
  const rows = await this.options.bridge.query(sql);
  // ...
} catch (err) {
  this.options.onError?.(
    new QueryError(err instanceof Error ? err.message : String(err), {
      code: 'QUERY_RUNTIME',
      cause: err,
    }),
    { source: 'stats-panel', column: this.column.name, phase: 'fetch' },
  );
}
```

The facade re-emits these on the `error` event with `source: 'stats-panel'` (the discriminant in the [error-event source enum](./api-reference.md#event-catalog)) so existing `table.on('error', …)` listeners catch panel failures alongside load / query / persistence ones.

### 23. I added `createSqlExtensions` but no autocomplete dropdown appears

Symptom: the host-built CodeMirror editor mounts, the SQL grammar highlights correctly, but pressing Ctrl/Cmd+Space (or typing a partial identifier) shows no dropdown.

Cause: `createSqlExtensions` ships only the autocomplete _source_ (a `PostgreSQL.language.data.of({ autocomplete: ... })` extension), not the autocomplete _UI_ extension. The bundled `CodeMirrorExpressionEditor` adds the UI explicitly (`src/sql-editor/CodeMirrorExpressionEditor.ts:60-62`) and the inline comment at `src/sql-editor/extensions.ts:156-158` flags this; host-assembled editors must do the same.

Fix: add `autocompletion()` from `@codemirror/autocomplete` to your extension array:

```ts
import { createSqlExtensions } from '@jeyabbalas/data-table/advanced';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';

new EditorView({
  state: EditorState.create({
    extensions: [
      createSqlExtensions(ctx),
      autocompletion({ tooltipClass: () => 'my-app-sql-autocomplete' }),
      // ...rest of host plumbing (keymap, history, placeholder, ...)
    ],
  }),
  parent: hostEl,
});
```

`tooltipClass` scopes any CSS targeting `.cm-tooltip-autocomplete` to your instance — the dropdown portals to `document.body` so an unscoped rule would also style any other CodeMirror autocomplete on the page.

### 24. My host SQL editor's autocomplete doesn't pick up new columns after a `derivedChange`

Symptom: a host-built editor (assembled via `createSqlExtensions`) shows the original schema in autocomplete, but a derived column added later via `actions.addDerivedColumn` never appears in the dropdown.

Common causes and fixes:

- **The completion context was a snapshot, not a thunk.** `createSqlExtensions(table.actions.getCompletionContext())` captures the schema at editor-construction time. Pass `() => table.actions.getCompletionContext()` and call it on every refresh so each `Compartment.reconfigure` reads live state. (Example 14 wires this exact pattern at [`main.ts:34, 41, 101-107`](../examples/14-standalone-sql-editor/main.ts).)

- **No subscription to `derivedChange` / `loadComplete`.** Without `table.on('derivedChange', refresh)` and `table.on('loadComplete', refresh)`, schema changes never trigger a re-pull. The `loadComplete` subscription is the one most often missed — without it, the very first `loadData` resolves with the editor still bound to an empty schema.

- **The refresh dispatched a brand-new `EditorState` instead of `Compartment.reconfigure`.** Replacing the entire state works, but loses undo history, focus, selection, and scroll position. Use a `Compartment` and call `view.dispatch({ effects: compartment.reconfigure(createSqlExtensions(getContext())) })` — preserving view state survives schema swaps cleanly. (See `src/sql-editor/CodeMirrorExpressionEditor.ts:142-148` for the rationale and example 14's `refreshContext()` at [`main.ts:101-107`](../examples/14-standalone-sql-editor/main.ts) for the canonical implementation.)

The combined pattern:

```ts
const sqlCompartment = new Compartment();
const getContext = () => table.actions.getCompletionContext(); // thunk

const refresh = () => {
  view.dispatch({
    effects: sqlCompartment.reconfigure(createSqlExtensions(getContext())),
  });
};
table.on('loadComplete', refresh);
table.on('derivedChange', refresh);
```

---

## Browser support quick reference

```ts
import { checkBrowserSupport } from '@jeyabbalas/data-table';
const { supported, missing } = checkBrowserSupport();
```

Source: `src/core/checkBrowserSupport.ts`.

| Probe             | Feature disabled if missing                       |
| ----------------- | ------------------------------------------------- |
| `Worker`          | Library can't run at all.                         |
| `WebAssembly`     | DuckDB can't initialize.                          |
| `IndexedDB`       | Session persistence. Library still runs.          |
| `ResizeObserver`  | Column resize + visualization responsive layout.  |
| `BigInt`          | Integer columns can't cross the worker boundary.  |
| `structuredClone` | Result sets can't be transferred from the worker. |

If you want initialization to fail fast (rather than render a half-broken table), set `strictBrowserCheck: true`. A `WorkerInitError` with `code: 'WORKER_UNSUPPORTED'` and `details.missing: string[]` is thrown from `createDataTable()`.
