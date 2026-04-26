# Architecture

A bird's-eye view of how `@jeyabbalas/data-table` fits together. The
library is a reactive-signal layer over a DuckDB-WASM worker. Every user
action — filter change, sort, derived column, export — flows through a
small number of coordinated components.

## You'll learn

- How the major components relate
- Where queries execute (hint: not on the main thread)
- How filter changes propagate to visualizations and the row count
- How modals escape CSS containment via portals

Not a task-oriented guide. If you just want to use the library, skip to
the [guides index](../README.md#guides-task-oriented). Read this when you
want to understand _why_ the code is organized the way it is.

## 10-second summary

```
host app                                  main thread
─────────                                 ───────────────────────────────

createDataTable(options) ────► DataTable (facade)
                               │
                               ├─ TableState   (reactive signals)
                               │
                               ├─ StateActions (mutation layer, undo)
                               │
                               ├─ WorkerBridge ◄─── postMessage ───┐
                               │                                    │
                               ├─ TableContainer (DOM)              │
                               │   ├─ VirtualScroller               │
                               │   ├─ FilterPanel / ColumnHeader    │ worker thread
                               │   └─ KeyboardNavigator             │ ──────────────
                               │                                    │
                               ├─ CrossfilterCoordinator            │ DuckDB-WASM
                               │                                    │  (SQL engine)
                               ├─ DerivedColumnManager ─────────────┘
                               │
                               ├─ ModalHost    (body portal)
                               ├─ AnnotationPopover           (singleton)
                               ├─ ColumnHeaderTooltipPopover  (singleton)
                               ├─ SessionStore (IndexedDB)
                               ├─ UndoManager  (snapshot history)
                               ├─ AnnotationStore             (overlay metadata)
                               ├─ StatsPanelCoordinator       (filter-broadcast to BaseStatsPanel instances)
                               └─ FilterPresetManager
```

SQL runs on the worker. The main thread runs signals, DOM, and message
routing.

## Reactive core: signals

Every piece of observable state is a `Signal<T>` or `Computed<T>` (from
[`src/core/Signal.ts`](../../src/core/Signal.ts)):

- `signal.get()` returns the current value
- `signal.set(next)` replaces it and notifies subscribers (shallow equality check)
- `signal.subscribe(fn)` registers a callback, returns an unsubscribe
- `computed(() => fn, [dep1, dep2])` derives a value that recomputes when any dep changes
- `batch(() => { … })` defers notifications until the outer batch ends — updates happen immediately (readable via `get()`), subscribers fire once with the final value after the batch

Signals are intentionally tiny — a mutable value, a Set of callbacks, a
shallow equality check. They're not reactive like Solid or MobX in the
sense of automatic dependency tracking; you explicitly list a computed's
dependencies. This keeps the reactivity model easy to reason about and
cheap to debug.

The signal primitives (`createSignal`, `computed`, `batch`) are
implementation details — not exported from the public surface. Consumers
interact with the state indirectly via `table.on(...)` events, by reading
signals through `table.state.<field>.get()` / `.subscribe()`, and by
writing via `table.actions.*`.

### Batching and shallow equality

`SignalImpl.set` compares with `!==`. Mutating a `Set`, `Map`, or array in
place and calling `.set(sameRef)` is a no-op — subscribers won't fire. The
library (and your code) must construct a new reference to notify:

```ts
state.selectedRows.set(new Set(state.selectedRows.get()).add(5));
```

`batch()` is useful when one logical change touches several signals. The
library uses it in `StateActions` around filter+sort updates and inside
undo/redo reconciliation.

## State: `TableState`

All table state lives on a single `TableState` object ([`src/core/State.ts:22-70`](../../src/core/State.ts)).
See the [state model](./state-model.md) for the field inventory. Briefly:

- **Data signals** — `tableName`, `schema`, `totalRows`, `derivedColumns`
- **Filter signals** — `filters`, `filteredRows`, `filtersByColumn` (computed)
- **Sort signal** — `sortColumns`
- **Column layout signals** — `visibleColumns`, `columnOrder`, `columnWidths` (Map), `pinnedColumns`, `hiddenColumnInfo`
- **Selection signal** — `selectedRows` (Set)
- **UI signals** — `hoveredRow`, `hoveredColumn`, `focusedCell`

The signals are the single source of truth. Every UI component subscribes
to what it needs and re-renders when notified.

## Mutations: `StateActions`

Direct signal writes are discouraged — the public API routes through
[`StateActions`](../../src/core/Actions.ts). Why:

1. **Undo snapshots.** Each method starts by calling `captureForUndo()` so every mutation pushes a snapshot onto the history stack.
2. **Cross-coordinated writes.** Some actions touch multiple signals; doing them outside a `batch` would fire multiple events.
3. **Derived-column reconciliation.** Async actions like `addDerivedColumn` need to talk to DuckDB and update the VIEW before the state changes become visible.

The guideline: **read through `state`, write through `actions`**.

## Worker bridge: `WorkerBridge`

DuckDB runs in a Web Worker. [`WorkerBridge`](../../src/data/WorkerBridge.ts)
is a thin Promise-based RPC wrapper:

- **Messages.** Every request gets a unique id; the bridge maintains a
  map of `pendingRequests`. The worker replies with the same id, which
  resolves the corresponding Promise.
- **Types.** `init`, `query`, `load`, `export`, `cancel`, `progress`.
- **Query cache.** SELECTs are cached by SQL text (LRU with configurable
  size/TTL). Non-SELECTs bypass. Cache is invalidated automatically on
  mutation via `attachCacheInvalidation`.
- **Abort support.** Every async method takes an optional
  `AbortSignal`; aborts send a `cancel` message to the worker and
  unregister the request.
- **Lifecycle.** `initialize()` boots the worker and DuckDB; `terminate()`
  kills the worker and rejects all pending promises. See
  [CSP and offline guide](../guides/csp-and-offline.md) for construction
  customization.

The bridge is the _only_ place the main thread talks to DuckDB. Every
derived column, every visualization fetch, every export goes through it.

## Crossfilter: `CrossfilterCoordinator`

When a filter changes:

1. `state.filters` signal fires
2. `CrossfilterCoordinator` is subscribed; it receives the new filter list
3. The coordinator recomputes `filteredRowCount` by querying DuckDB with
   the updated WHERE clause
4. Each visualization receives the updated filter set via its
   `updateFilters(filters)` method and re-renders itself
5. The `filterChange` event fires on the event bus

The coordinator batches rapid-fire filter changes (histogram brushes can
fire continuously during a drag) so the expensive count query runs only
on settle.

Visualizations can _own_ a filter: `Histogram`'s brush selection is a
`range` filter on its column. When the user drags the brush, the viz
emits a filter through the `onFilterChange` callback; the coordinator
feeds it back into `state.filters`; the signal fires; all other viz
receive the update.

## Virtual scroller

The table body renders only visible rows. Given:

- `rowHeight` (default 32 px)
- `state.totalRows` / `state.filteredRows`
- the container's scroll position

The `VirtualScroller` computes `[firstVisibleRow, lastVisibleRow]` and
queries DuckDB for that slice. Rows are re-rendered as the user scrolls.

Fixed row heights are an assumption — content taller than `rowHeight`
will clip or overflow. That's the cost of virtualization; you opt out of
automatic layout in exchange for constant-time rendering regardless of
row count.

## Modal portals: `ModalHost`

Modals (export dialog, SQL filter editor, derived-column editor, the
CodeMirror autocomplete tooltip) render into `document.body` — not inside
the table's DOM. Why:

1. **Escape stacking contexts.** A table inside a CSS `transform` or
   `overflow: hidden` ancestor would clip modal content.
2. **Escape z-index battles.** Host apps often have their own modal
   layers; the library exposes `--dt-z-modal` so you can coordinate.
3. **Focus trap consistency.** Portalled modals capture focus on open and
   restore it on close.

[`ModalHost`](../../src/core/ModalHost.ts) manages the portal: it appends
the modal root to `portalTarget` (defaults to `document.body`), copies
the owning table's `data-dt-color-scheme` attribute so portalled modals
stay in light/dark sync, and sets `role="dialog"` with a focus trap.

## Derived columns: DuckDB VIEW reconciliation

Adding a derived column creates a DuckDB VIEW combining the base table
with the derived columns (expressions SQL'd inline, vectors stored in
helper tables). `state.tableName` flips from the base table to the VIEW
so every subsequent query — filters, visualizations, exports —
transparently routes through the combined view.

[`DerivedColumnManager`](../../src/derived/DerivedColumnManager.ts) owns
the VIEW lifecycle. Each mutation (add / update / remove) drops and
recreates the VIEW; undo/redo must reconcile the VIEW _before_ applying
the snapshot signals (otherwise `visibleColumns` could reference a column
the VIEW hasn't been rebuilt with yet).

See the [derived columns guide](../guides/derived-columns.md) for user-
facing behavior.

## Persistence: `SessionStore` + `AutoSave`

[`SessionStore`](../../src/persistence/SessionStore.ts) is a thin
IndexedDB wrapper. [`AutoSave`](../../src/persistence/AutoSave.ts)
subscribes to the relevant state signals and debounces writes to the
store.

Snapshots are keyed by `tableName` and JSON-serializable. Dates are
wrapped via `{ __date__: ISO8601 }` round-tripping. The schema version is
`4` as of this writing; older versions are upgraded transparently, newer
versions are rejected.

See the [session persistence guide](../guides/session-persistence.md).

## Undo/redo: `UndoManager`

[`UndoManager`](../../src/core/UndoManager.ts) is a pair of stacks (`undo`
and `redo`). `captureSnapshot(state)` grabs every persistable field into a
plain object; `applySnapshot(state, snap)` writes them back in one batch.

Every `StateActions` method calls `captureForUndo()` at its top to push
the pre-mutation state. `actions.undo()` pops the undo stack, pushes the
current state onto the redo stack, and applies the popped snapshot.

Derived-column changes add a wrinkle: the VIEW must be rebuilt before the
snapshot's `visibleColumns` apply. `undo()` and `redo()` are `async`
specifically to await that reconciliation.

## Annotation overlay (`AnnotationStore`)

[`AnnotationStore`](../../src/annotations/AnnotationStore.ts) holds
app-authored overlay metadata — row, column, and cell annotations with a
fixed three-level severity (`error` / `warning` / `info`). It is a
sibling of `TableState` rather than a field on it, for two reasons:

1. **No undo/redo.** Annotations come from app-side validators
   (JSON-Schema, quality-control rules), not from user view edits. A
   bulk-load of 10 000 annotations should not inflate the undo stack
   with 10 000 entries.
2. **Independent change channel.** The store emits its own
   `change` event — `kind: 'added' | 'updated' | 'removed' | 'cleared'
| 'filterChanged'`, plus the affected `ids[]`. The rendering layer
   (`TableBody` / `ColumnHeader`) subscribes to this event and
   invalidates only the affected rows / cells / headers, never the
   whole grid.

Internally the store keeps four indexes — `byId`, `byRow`,
`byColumn`, `byCell` — so `getByRow` / `getByColumn` / `getByCell` are
O(1) regardless of total annotation count. `getByCell(rowId, column)`
returns the union of row + column + cell annotations, sorted by
severity → `createdAt` → insertion order, so the popover always shows
the most-relevant entry first.

The store auto-persists into [`SessionSnapshot`](#persistence-sessionstore--autosave)`.annotations`
(v5+) via `AutoSave`. A single shared
[`AnnotationPopover`](../../src/table/AnnotationPopover.ts) instance is
reused across hover targets — created lazily, anchored on demand,
dismissed on `Escape` / blur / scroll / click outside. The
[`ColumnHeaderTooltipPopover`](../../src/table/ColumnHeaderTooltipPopover.ts)
is constructed and torn down alongside it but anchors on the
column-name span and uses a higher z-index so both can be visible
together.

`setSeverityFilter` is a view concern, not a data concern — it flips
flags that the rendering layer reads, but the underlying data is
unchanged. `getAll` / `getByRow` / `getByColumn` / `getByCell` always
return the full set; clearing a severity in the filter only changes
what gets painted (or popped).

## Stats panel coordination (`StatsPanelCoordinator`)

[`StatsPanelCoordinator`](../../src/visualizations/StatsPanelCoordinator.ts)
is a sibling of [`CrossfilterCoordinator`](#crossfilter-crossfiltercoordinator)
that broadcasts filter changes to every registered
[`BaseStatsPanel`](../../src/visualizations/BaseStatsPanel.ts). It is a
sibling rather than a hook on `CrossfilterCoordinator` for one decisive
reason: a stats panel can exist for a column that has no visualization
(e.g. `uuid` columns, which are never visualized). Parenting panel
broadcasts to visualization broadcasts would silently skip those columns
on every filter change.

The coordinator stamps a monotonically-increasing `filterSequence` on
every broadcast, captured per-panel before the `await panel.updateFilters(filters)`
call lands. If a fresh filter change arrives while an in-flight broadcast
is still fanning out, the stale call short-circuits before applying —
without this guard the base-class default's last-write-wins on
`this.options.filters` could land filter set F1's data on a panel after
filter set F2's broadcast had already completed. The same race-guard
pattern lives on `CrossfilterCoordinator`; the two coordinators stay in
sync deliberately. The rationale is captured in
[`StatsPanelCoordinator.ts:42–57`](../../src/visualizations/StatsPanelCoordinator.ts).

Fan-out is bounded — `DEFAULT_PANEL_CONCURRENCY = 4` — sized
independently of the visualization fan-out cap because a panel may issue
its _own_ DuckDB queries (mean+stddev, top-value, custom aggregates) and
flooding the single-threaded worker on a 200-column table is the
dominant failure mode. Per-panel rejections are swallowed at the
coordinator boundary so one panel's failure does not cascade across
columns; surfacing the error is the panel's responsibility (route
through `options.onError(err, { source: 'stats-panel', column, phase })`).

## Event bus: `EventEmitter`

[`EventEmitter`](../../src/core/EventEmitter.ts) is a tiny typed
pub/sub. The facade wraps it so subscribers call `table.on(event,
handler)` instead of poking at the signal layer directly.

The event bus is a convenience over the signals — consumers of the facade
don't need to know which signal holds which state. Power users can use
both: subscribe to `table.on('filterChange')` for callbacks, or
`table.state.filters.subscribe()` for fine-grained reactive updates.

See the [events guide](../guides/events.md).

## Data flow — end-to-end example

User drags a histogram brush:

1. `Histogram.handleMouseMove` / `handleMouseUp` on the visualization
2. Brush emits a `range` filter via `onFilterChange` callback (→ `CrossfilterCoordinator`)
3. Coordinator calls `state.filters.set(updatedList)`
4. Subscribers fire:
   - `CrossfilterCoordinator` itself → runs a `SELECT COUNT(*)` with the new WHERE clause → sets `filteredRows`
   - Every visualization's `updateFilters(newFilters)` → re-runs its fetch query with the new WHERE → re-renders
   - `AutoSave` → debounce → save snapshot to IDB
   - `filterChange` event → notifies the facade → runs host-app handlers
   - `UndoManager` (via `captureForUndo()` _before_ the set) → records undoable snapshot

Every step is either a signal notification (main thread, synchronous) or a
DuckDB query (worker thread, Promise). No global state, no hidden
singletons — just signals and a bridge.

## Where to go from here

- **Using the library** — start at [Quick start](../../README.md#quick-start)
- **State deep-dive** — [State model](./state-model.md)
- **Worker / WASM customization** — [CSP and offline](../guides/csp-and-offline.md)
- **Per-subsystem guides** — [filters](../guides/filters.md), [derived columns](../guides/derived-columns.md), [visualizations](../guides/visualizations.md), [events](../guides/events.md)
