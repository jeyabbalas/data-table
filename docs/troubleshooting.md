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

| Code | Class | Cause | Fix |
|---|---|---|---|
| `OPTIONS_INVALID` | `ConfigurationError` | Invalid option passed to `createDataTable()` or a preset call. | Check `error.details` for the bad value; align with [`CreateDataTableOptions`](./api-reference.md#createdatatableoptions). |
| `WORKER_UNSUPPORTED` | `WorkerInitError` | `strictBrowserCheck: true` detected a missing required API. | Render an "unsupported browser" screen. `error.details.missing` lists the APIs. |
| `WORKER_CRASHED` | `WorkerInitError` | The DuckDB worker failed to initialize or crashed. | Check DevTools → Console for the worker-side stack; often caused by a broken WASM asset path. |
| `WORKER_INIT_TIMEOUT` | `WorkerInitError` | Init exceeded `bridgeOptions.initTimeoutMs` (default 30 s). | Increase the timeout, verify `duckdbBundles` is reachable, or pre-warm the WASM asset. |
| `WORKER_TERMINATED` | `WorkerTerminatedError` | Worker was terminated mid-operation. | Usually a race with `destroy()`; check `isDestroyed()` guards. |
| `BRIDGE_NOT_READY` | `ConfigurationError` | A bridge method was called before init. | `await createDataTable(...)` before issuing queries. |
| `QUERY_RUNTIME` | `QueryError` | DuckDB returned an error at query time. | Check `error.details.sql` (when present); common causes: referenced a column that was since removed, or a derived-column VIEW is stale. |
| `QUERY_ABORTED` | `QueryError` | A query was aborted (user cancel, bridge teardown). | Non-fatal — your own `AbortSignal` fired, or the table is being destroyed. |
| `SQL_SYNTAX` | `SQLValidationError` | Raw-SQL filter / derived-column expression failed validation. | Use `actions.validateSQLFilter` or `actions.validateExpression` before submit. |
| `LOAD_PARSE_FAILED` | `LoadError` | CSV/JSON/Parquet parse failed. `error.details.stage` indicates which coercion stage (`timestamp`, `date`, `time`). | Inspect the offending row; most commonly a bad timestamp format. |
| `LOAD_INVALID_TIMEZONE` | `LoadError` | `loadOptions.timezone` isn't a valid IANA zone. | Use a canonical zone like `'America/New_York'`. |
| `LOAD_INVALID_OPTIONS` | `LoadError` | Incompatible combination of load options. | `error.details.option` names the offending key. |
| `LOAD_FORMAT_UNSUPPORTED` | `LoadError` | Source didn't match a known format. | Pass `sourceFormat: 'csv' \| 'json' \| 'parquet'` explicitly. |
| `FETCH_FAILED` | `LoadError` | URL fetch failed (network, CORS, 404). | Verify the URL; surface a retry UI. |
| `PARSE_FAILED` | `LoadError` | Generic parse fallback. | Check `error.details` for context; often a malformed file. |
| `EXPRESSION_INVALID` | `DerivedColumnError` | Derived-column expression rejected by DuckDB. | The `error.message` echoes DuckDB's diagnostic; surface it to the user. |
| `CIRCULAR_DEPENDENCY` | `DerivedColumnError` | Derived column references itself directly or transitively. | Name the column something new, or break the cycle. |
| `NOT_FOUND` | `DerivedColumnError` | `updateDerivedColumn` / `removeDerivedColumn` targeted a non-existent column. | Read `state.derivedColumns` first. |
| `DUPLICATE_NAME` | `DerivedColumnError` | A column with that name already exists. | Choose a different name or update the existing one. |
| `VECTOR_LENGTH_MISMATCH` | `DerivedColumnError` | `values.length !== state.totalRows`. | Resize your vector to match. |
| `NO_TABLE_LOADED` | `ExportError` | Export called before data is loaded. | Await `loadComplete` first, or gate the export UI on `state.tableName.get()`. |
| `CANVAS_UNAVAILABLE` | `ExportError` | `HTMLCanvasElement` unavailable (e.g., headless browser without canvas). | Skip the export, or use a server-side renderer. |
| `CLIPBOARD_UNAVAILABLE` | `ExportError` | Clipboard API blocked (non-secure context, user-gesture required). | Fall back to the Download button in the export dialog. |
| `SAVE_FAILED` | `PersistenceError` | IndexedDB write failed (quota, aborted transaction). | Surface a non-blocking message; the facade keeps running. |
| `DESTROYED` | `DestroyedError` | Public method called after `destroy()`. | Guard async callbacks with `isDestroyed()`. |
| `INVARIANT` | `ConfigurationError` | Internal invariant violation. | File a bug with the repro steps — this should not happen. |

---

## Warning events

Non-fatal issues surface on `table.on('warning', …)` instead of `error`:

```ts
table.on('warning', ({ code, message, details }) => {
  if (code === 'STYLESHEET_MISSING') { /* … */ }
  else if (code === 'PERSISTENCE_UNAVAILABLE') { /* … */ }
});
```

| Code | Source | Meaning | Recommended handling |
|---|---|---|---|
| `STYLESHEET_MISSING` | `src/DataTable.ts` | The library didn't find the `--dt-stylesheet-loaded` marker, meaning `@jeyabbalas/data-table/styles` wasn't imported. | Add the import at application entry: `import '@jeyabbalas/data-table/styles';`. |
| `PERSISTENCE_UNAVAILABLE` | `src/DataTable.ts` | IndexedDB was requested but unavailable (private browsing, disabled storage). | Inform the user that filters won't persist across reloads. |
| (console warning) | `src/persistence/SessionStore.ts` | An unknown filter type was encountered while restoring a snapshot. | Safe to ignore for old snapshots; indicates a filter schema evolved. |

---

## FAQs

### 1. "Stylesheet missing" warning in the console

Symptom: `warning` event with `code: 'STYLESHEET_MISSING'` and the table renders without colors/spacing.

Fix:

```ts
import '@jeyabbalas/data-table/styles';  // Side-effect import — do this once at app entry.
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
      if (cancelled) { await t.destroy(); return; }
      table = t;
    })();
    return () => { cancelled = true; table?.destroy(); };
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
      mvp: { mainModule: '/duckdb/duckdb-mvp.wasm', mainWorker: '/duckdb/duckdb-browser-mvp.worker.js' },
      eh:  { mainModule: '/duckdb/duckdb-eh.wasm',  mainWorker: '/duckdb/duckdb-browser-eh.worker.js' },
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
  table.actions.addFilter({ /* ... */ });
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
    if (cancelled) { await t.destroy(); return; }
    table = t;
  })();
  return () => { cancelled = true; table?.destroy(); };
}, []);
```

The same pattern handles navigation-driven unmounts.

---

### 8. Memory grows across successive `loadData()` calls

Cause: each `loadData()` registers a new DuckDB table. If you also add derived columns between loads, the old VIEW stays registered until the bridge is torn down.

Fix:

- For a clean slate, call `await table.clearSession()` (also wipes IndexedDB) before `loadData()`.
- For in-place replacement with the same schema, `loadData()` reuses the existing table name.
- For a full tear-down between unrelated datasets, `await table.destroy()` and create a fresh instance.

---

### 9. Custom visualization never appears on its column

Symptom: you called `defaultVisualizationRegistry.register(...)` but the built-in histogram still shows.

Cause: either the `isApplicable` predicate returns `false` for the column's `DataType`, or your registration's `priority` is `≤ 0` (built-ins use `0` and are evaluated first for same-priority entries in insertion order).

Fix:

```ts
const registry = new VisualizationRegistry();   // per-instance
registry.register({
  name: 'my-viz',
  isApplicable: (type) => type === 'float',
  constructor: MyViz,
  priority: 10,                                  // beats built-ins
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
  scope: 'all', columns: ['id', 'name', 'hidden_col'], includeHeaders: true,
  delimiter: ',', nullValue: '',
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

Cause: `headerHeight` is too small to fit its controls; the header collapses and the roving-tabindex loop misses it.

Fix: `headerHeight: 120` (the default) is usually right. If you've overridden it, keep it at **≥ 96** when visualizations are enabled. Lower values collide with the visualization canvas.

---

### 15. Dark mode doesn't apply inside portalled modals

Cause: modals portal to `document.body` so they don't inherit the `data-dt-color-scheme` attribute from `.dt-root` via the DOM tree.

Fix: the library mirrors the attribute onto the body for you when `colorScheme` is `'light' \| 'dark' \| 'auto'`. If you've replaced the portal target or wrapped the body in a shadow root, pass the root element explicitly:

```ts
import { ExportDialog } from '@jeyabbalas/data-table/advanced';

new ExportDialog(state, bridge, {
  classPrefix: 'dt',
  colorSchemeSource: document.querySelector('.dt-root')!,   // mirror-from this element
});
```

For the facade path, `setColorScheme()` handles this automatically.

---

## Browser support quick reference

```ts
import { checkBrowserSupport } from '@jeyabbalas/data-table';
const { supported, missing } = checkBrowserSupport();
```

Source: `src/core/checkBrowserSupport.ts`.

| Probe | Feature disabled if missing |
|---|---|
| `Worker` | Library can't run at all. |
| `WebAssembly` | DuckDB can't initialize. |
| `IndexedDB` | Session persistence. Library still runs. |
| `ResizeObserver` | Column resize + visualization responsive layout. |
| `BigInt` | Integer columns can't cross the worker boundary. |
| `structuredClone` | Result sets can't be transferred from the worker. |

If you want initialization to fail fast (rather than render a half-broken table), set `strictBrowserCheck: true`. A `WorkerInitError` with `code: 'WORKER_UNSUPPORTED'` and `details.missing: string[]` is thrown from `createDataTable()`.
