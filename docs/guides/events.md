# Events

Every observable thing a `DataTable` does — data loading, filter changes, sort
changes, errors, teardown — surfaces through a typed event bus. Subscribe with
`table.on()`; unsubscribe via the returned function or `table.off()`.

## You'll learn how to

- Subscribe to every event the library emits
- Tell the difference between `error`, `warning`, and `loadError`
- Order your app's reactions correctly against the lifecycle
- Clean up subscriptions on unmount

## Prerequisites

- Read: [API reference — Event catalog](../api-reference.md#event-catalog)
- Runnable example: [`examples/05-event-listeners`](../../examples/05-event-listeners/)

## Minimal example

```ts
const unsub = table.on('filterChange', ({ filters, filteredRowCount }) => {
  console.log(filters.length, 'filters,', filteredRowCount, 'rows match');
});

// Later:
unsub(); // or: table.off('filterChange', handler);
```

## Event catalog

Every event is strongly typed. The full map lives at
[`src/core/TableEvents.ts`](../../src/core/TableEvents.ts).

| Event             | Payload                                          | Fires when                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`           | `{ bridgeReady: true }`                          | Worker is initialized; the table can accept queries.                                                                                                                                                                                                                                                                                                                                                          |
| `loadStart`       | `{ source: string }`                             | `loadData()` begins. `source` is a short description (URL or `'<buffer>'`).                                                                                                                                                                                                                                                                                                                                   |
| `loadProgress`    | `ProgressInfo`                                   | Load progress: `percent` 0–100, non-decreasing, ending in exactly one `100`. Stages `reading` → `parsing` → `analyzing` → `indexing`. See [Loading data — Progress](./loading-data.md#progress-reporting).                                                                                                                                                                                                    |
| `loadComplete`    | `{ tableName, rowCount, schema }`                | First interactive paint: data is loaded, the schema is known, the first rows are painted, and the filter counts are correct. It does **not** mean the column charts are drawn — that is `vizReady`.                                                                                                                                                                                                           |
| `vizReady`        | `{ tableName, vizCount }`                        | Once per load, when the column charts whose headers were visible at load time have finished fetching. `vizCount` is that wave's size (visible columns plus overscan), `0` when nothing was visible or `visualizations: false`. Fires **after** `loadComplete` by default, **before** it under `visualizations: { eager: true }` or `false`. Not emitted at all if the load fails.                             |
| `loadError`       | `{ error: Error }`                               | A load failed. `error` is always a `DataTableError` subclass.                                                                                                                                                                                                                                                                                                                                                 |
| `error`           | `{ error: DataTableError, source }`              | Any recoverable typed error — see [Errors](#errors-warnings-and-load-failures).                                                                                                                                                                                                                                                                                                                               |
| `warning`         | `{ code, message, details? }`                    | Non-fatal degradation (e.g., missing stylesheet, IndexedDB unavailable).                                                                                                                                                                                                                                                                                                                                      |
| `filterChange`    | `{ filters, filteredRowCount, totalRowCount }`   | Active filter list changes.                                                                                                                                                                                                                                                                                                                                                                                   |
| `sortChange`      | `{ sortColumns }`                                | Sort order changes.                                                                                                                                                                                                                                                                                                                                                                                           |
| `selectionChange` | `{ selectedRows: Set<number> }`                  | User selects or deselects rows.                                                                                                                                                                                                                                                                                                                                                                               |
| `columnChange`    | `{ visibleColumns, pinnedColumns, columnOrder }` | Column visibility, pin state, or order changes.                                                                                                                                                                                                                                                                                                                                                               |
| `derivedChange`   | `{ derivedColumns, kind, columnName? }`          | Derived-column list changed. `kind: 'added' \| 'removed' \| 'replaced' \| 'updated'`. `columnName` names the affected column (set on `'added'` / `'removed'` / `'replaced'`; not set when the whole list is replaced atomically). `'replaced'` fires for [`replaceDerivedColumn`](./derived-columns.md#replacing-a-derived-column-same-name--dependent-re-validation), `'updated'` for `updateDerivedColumn`. |
| `undoChange`      | `{ canUndo, canRedo }`                           | Undo/redo availability changes.                                                                                                                                                                                                                                                                                                                                                                               |
| `destroy`         | `{}`                                             | Emitted once, just before `destroy()` disposes signals.                                                                                                                                                                                                                                                                                                                                                       |

`on` returns an unsubscribe function; `off` works too and accepts the original
handler reference.

### Annotation events (separate channel)

Annotation mutations don't flow through the main event bus — they live on `table.annotations.on('change', handler)`. The payload is `{ kind: 'added' | 'updated' | 'removed' | 'cleared' | 'filterChanged'; ids: string[] }`. Subscribe there for fine-grained reactions:

```ts
const off = table.annotations.on('change', ({ kind, ids }) => {
  if (kind === 'filterChanged') {
    // setSeverityFilter() flipped a flag; re-render whatever lists annotations.
  } else {
    // ids[] is the list of annotation IDs affected by this mutation.
  }
});
```

See the [annotations guide](./annotations.md) for the full lifecycle.

## Lifecycle ordering

```
createDataTable()
  └── worker init
       └── ready
            └── (if `source` was passed)
                 loadStart
                 └── loadProgress* (0+)
                      └── loadComplete | loadError
                           └── derivedChange (if sessionStore restored derived columns)
                           └── columnChange, filterChange, sortChange (if session restored)
                           └── vizReady (visible column charts drawn; after loadComplete,
                                         but before it under `visualizations: { eager: true }`
                                         or `visualizations: false`)

user actions
  └── action events (filterChange, sortChange, selectionChange, columnChange, derivedChange)
       └── undoChange (after every state mutation that captures an undo snapshot)

destroy()
  └── destroy
       └── (signals disposed, worker terminated if owned)
```

Subscribe to `ready` before you assume the worker is available — for anything
driven by `createDataTable({ source })`, `ready` fires _before_ `loadStart`.
Raw `table.bridge.query()` calls made before `ready` will throw
`ConfigurationError` with `code: 'BRIDGE_NOT_READY'`.

`loadComplete` and `vizReady` split what used to be one moment. The load
promise — `await table.loadData(…)`, `await createDataTable({ source })` —
resolves with `loadComplete`, at first interactive paint: rows painted,
counts correct, charts possibly still fetching. Column charts are created
lazily as their headers scroll into view (see the
[visualizations guide](./visualizations.md#when-charts-are-created)), so
"the charts you can see are drawn" gets its own event, and its own promise:

```ts
const table = await createDataTable({ container, source });
await table.whenVizReady(); // same moment as the `vizReady` event
```

Pass `visualizations: { eager: true }` if you need the load promise itself
to wait for every chart. In a hidden document (background tab, `display:
none` host) the browser delivers no `IntersectionObserver` callbacks, so
nothing is visible, and `vizReady` fires immediately with `vizCount: 0`.

## Errors, warnings, and load failures

Three event channels carry failure information, each with different semantics.

### `loadError` — one-shot load failure

Emitted when a call to `loadData()` fails (bad URL, parse error, unsupported
format). After this event, the table is back to its pre-load state; call
`loadData()` again to retry.

```ts
table.on('loadError', ({ error }) => {
  showToast(`Could not load: ${error.message}`);
});
```

### `error` — any recoverable typed error

Fires for **every** typed error the library surfaces at runtime — load
failures (also `loadError`), SQL validation failures, export failures,
persistence write failures, visualization fetch failures, user-listener
exceptions. Use the `source` discriminator to route:

```ts
import { LoadError, QueryError } from '@jeyabbalas/data-table';

table.on('error', ({ error, source }) => {
  if (error instanceof LoadError) {
    // Also emitted as loadError; handle in one place, not both.
  } else if (source === 'persistence') {
    // IDB write failed — table still works, but session won't save.
    console.warn(error);
  } else if (error instanceof QueryError) {
    reportToSentry(error);
  }
});
```

`source` values: `'load' | 'query' | 'export' | 'persistence' |
'visualization' | 'sql-validation' | 'derived-column' | 'listener' |
'unknown'`.

`loadError` is a strict subset of `error` — both fire for the same underlying
failure. Handle one or the other, not both, unless you specifically want
separate pathways.

### `warning` — non-fatal degradation

The library keeps running but in a reduced mode. Codes you'll see in
practice:

| Code                      | Meaning                                                    | What to do                             |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `STYLESHEET_MISSING`      | `@jeyabbalas/data-table/styles` wasn't imported            | Import it                              |
| `PERSISTENCE_UNAVAILABLE` | IndexedDB isn't usable (private browsing, blocked storage) | Inform the user; session won't persist |

```ts
table.on('warning', ({ code, message }) => {
  if (code === 'STYLESHEET_MISSING') {
    console.warn('Forgot to import @jeyabbalas/data-table/styles?');
  } else if (code === 'PERSISTENCE_UNAVAILABLE') {
    showBanner("Your browser is blocking local storage — session won't be saved.");
  }
});
```

## Handler cleanup

Always unsubscribe before you throw away your event-producing UI frame:

```ts
const subs = [
  table.on('filterChange', syncFilterBadge),
  table.on('sortChange', syncSortIcon),
  table.on('error', reportError),
];

// On unmount:
subs.forEach((unsub) => unsub());
await table.destroy();
```

`destroy()` disposes all remaining subscriptions as part of teardown, so
forgetting to call `unsub()` won't leak beyond the lifetime of the table —
but it will leak _during_ it, so prefer explicit cleanup.

### React

```tsx
useEffect(() => {
  const unsub = table.on('filterChange', ({ filteredRowCount }) => {
    setCount(filteredRowCount);
  });
  return unsub;
}, [table]);
```

### Vue 3

```ts
import { onBeforeUnmount } from 'vue';

const unsub = table.on('filterChange', onFilter);
onBeforeUnmount(unsub);
```

## Reading state without subscribing

Sometimes you need a one-off snapshot rather than an event:

```ts
const currentFilters = table.state.filters.get();
const filteredCount = table.state.filteredRows.get();
const visibleCols = table.state.visibleColumns.get();
```

Use events when you want to react to changes; use `state.*.get()` when you
just need the current value.

## Recipes

### Mirror filter state to a counter

```ts
const counter = document.getElementById('filtered-count')!;
counter.textContent = String(table.state.filteredRows.get());
table.on('filterChange', ({ filteredRowCount }) => {
  counter.textContent = filteredRowCount.toLocaleString();
});
```

### Wire undo/redo buttons

```ts
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const redoBtn = document.getElementById('redo') as HTMLButtonElement;

table.on('undoChange', ({ canUndo, canRedo }) => {
  undoBtn.disabled = !canUndo;
  redoBtn.disabled = !canRedo;
});

undoBtn.addEventListener('click', () => table.actions.undo());
redoBtn.addEventListener('click', () => table.actions.redo());
```

### Track a long load

```ts
table.on('loadStart', () => {
  progressEl.style.display = 'block';
});
table.on('loadProgress', ({ percent, stage }) => {
  progressEl.textContent = `${stage} ${Math.round(percent)}%`;
});
table.on('loadComplete', () => {
  progressEl.style.display = 'none';
});
table.on('loadError', () => {
  progressEl.style.display = 'none';
});
```

`loadComplete` is the right place to drop a spinner: the grid is interactive
there. If your spinner is covering the _charts_ rather than the grid, hide it
on `vizReady` instead — and hide it on `loadError` too, since a failed load
never emits `vizReady`.

### Route errors to Sentry, but tolerate persistence failures

```ts
table.on('error', ({ error, source }) => {
  if (source === 'persistence') return; // silent degrade is fine
  Sentry.captureException(error, { tags: { source } });
});
```

## Gotchas

- **`on(event)` returns the unsubscribe.** Forgetting to store it leaks the handler until the table is destroyed.
- **Handler exceptions don't crash the library.** They surface as an `error` event with `source: 'listener'`. Don't subscribe to `error` inside an `error` handler (you'll loop).
- **`loadError` and `error` both fire for a load failure.** Choose one path.
- **`loadComplete` no longer waits for column charts.** If you screenshot, measure, or reveal UI on it, you may be capturing empty chart slots. Use `vizReady` / `whenVizReady()`, or `visualizations: { eager: true }`.
- **`vizReady` fires once per load, and not at all on a failed load.** `whenVizReady()` still settles on failure, so an awaiter never hangs — it just resolves without the event.
- **`destroy` fires once.** After it, `table.isDestroyed()` is `true` and further API calls throw `DestroyedError`.
- **`selectionChange` fires on filter changes too**, because the visible selection changes when previously-selected rows become filtered out. If you're rendering a selection badge, subscribe to both.
- **`undoChange` fires after an undo or redo**, with the new `canUndo` / `canRedo` values reflecting the post-operation history boundary.

## Related

- Loading data: [Loading data guide](./loading-data.md) for `loadStart` / `loadProgress` / `loadComplete` / `loadError` details
- Visualizations: [When charts are created](./visualizations.md#when-charts-are-created) for `vizReady`, `whenVizReady()`, and the `eager` opt-out
- Troubleshooting: [Warnings reference](../troubleshooting.md)
- API reference: [Event catalog](../api-reference.md#event-catalog)
- Source: `src/core/TableEvents.ts`, `src/core/EventEmitter.ts`
