# State model

Every piece of observable state in `@jeyabbalas/data-table` lives on a
`TableState` object — 16 fields in total (15 signals + 1 computed). This
doc is the field-by-field map. Use it when you want to read state
directly (instead of via events) or subscribe to changes at the
lowest level.

## You'll learn

- Every field on `TableState` and its type
- The difference between `Signal` and `Computed`
- How to subscribe, combine signals, and avoid stale reads
- Where state writes go (hint: through `actions`, not `state`)
- How undo snapshots map to state fields

## Prerequisites

- Read: [Architecture](./architecture.md) for the 10-second big picture
- API reference: [TableState](../api-reference.md#state-signals), [StateActions](../api-reference.md#state-actions)

## The `TableState` interface

From [`src/core/State.ts:22-70`](../../src/core/State.ts). Grouped by role:

### Data

| Field | Type | Meaning |
|---|---|---|
| `tableName` | `Signal<string \| null>` | Name of the DuckDB table or VIEW being queried. When derived columns exist, this is the VIEW name; otherwise it's the base table name |
| `baseTableName` | `Signal<string \| null>` | Name of the original base DuckDB table (unchanged by derived columns) |
| `schema` | `Signal<ColumnSchema[]>` | Array of column metadata: name, type, nullable, originalType, isDerived, expression (if expression column) |
| `totalRows` | `Signal<number>` | Row count of the base table (after load, before any filter) |
| `derivedColumns` | `Signal<DerivedColumnDef[]>` | Ordered list of expression / vector derived-column definitions |

### Filters

| Field | Type | Meaning |
|---|---|---|
| `filters` | `Signal<Filter[]>` | Active filter list; every filter has a `type` discriminant and a `column`. See [filters guide](../guides/filters.md) |
| `filteredRows` | `Signal<number>` | Row count matching the current filter set. Updated asynchronously after DuckDB returns a `COUNT(*)` result |
| `filtersByColumn` | `Computed<Map<string, Filter[]>>` | Re-derivation of `filters` grouped by column name. Read by FilterPanel and visualizations |

### Sorting

| Field | Type | Meaning |
|---|---|---|
| `sortColumns` | `Signal<SortColumn[]>` | Sort priorities; first entry is primary. Shape: `{ column: string; direction: 'asc' \| 'desc' }` |

### Column layout

| Field | Type | Meaning |
|---|---|---|
| `visibleColumns` | `Signal<string[]>` | Names of currently visible columns, in display order |
| `columnOrder` | `Signal<string[]>` | Full column order including hidden ones |
| `columnWidths` | `Signal<Map<string, number>>` | Custom column widths (pixel values); columns without a key use `--dt-col-width` |
| `pinnedColumns` | `Signal<string[]>` | Names of columns pinned to the left edge |
| `hiddenColumnInfo` | `Signal<Map<string, HiddenColumnInfo>>` | Metadata for each hidden column — captures `leftNeighbor` / `rightNeighbor` so re-show can place the column back where it belonged |
| `columnHeaderTooltips` | `Signal<Map<string, ColumnHeaderTooltipContent>>` | Per-column structured popover content (`{ title?, description?, items? }`) attached via `actions.setColumnHeaderTooltip`. Empty map by default; persisted into `SessionSnapshot.columnHeaderTooltips` |

#### A note on `__rowid__`

The reserved synthetic [`__rowid__`](../glossary.md#__rowid__-synthetic-row-id) column appears in `schema` and `columnOrder` but is excluded from `visibleColumns` by default. Toggle visibility with `actions.showColumn('__rowid__')` / `actions.hideColumn('__rowid__')`. The library marks the column with `system: true` on its `ColumnSchema` entry; consumers can detect system columns by reading that flag from `state.schema.get()`.

### Selection

| Field | Type | Meaning |
|---|---|---|
| `selectedRows` | `Signal<Set<number>>` | 0-based row indices selected by the user; indices map to the filtered row set |

### Transient UI

| Field | Type | Meaning |
|---|---|---|
| `hoveredRow` | `Signal<number \| null>` | Row index under the mouse; `null` when not hovering |
| `hoveredColumn` | `Signal<string \| null>` | Column name under the mouse |
| `focusedCell` | `Signal<{ row: number; column: string } \| null>` | The one cell carrying `tabindex="0"` (roving focus); `null` when the table isn't focused |

Transient UI fields don't participate in undo / redo and aren't persisted.

## What's not in `TableState`

A handful of subsystems live alongside `TableState` rather than on it. The split is deliberate — these stores have lifecycles or data-volume profiles that don't fit the per-mutation undo / persistence wiring that `TableState` enforces.

| Subsystem | Where to find it | Why it's separate |
|---|---|---|
| **Annotations** ([`AnnotationStore`](../../src/annotations/AnnotationStore.ts)) | `table.annotations` (CRUD, JSON I/O, severity filter, change events) | App-injected validation overlay — not user-driven view state. Sits outside undo/redo so a 10 000-entry bulk-load doesn't inflate the undo stack. Auto-persists into `SessionSnapshot.annotations` (v5+) but is restored as a separate field, not as a signal. See [annotations guide](../guides/annotations.md). |
| **Undo manager** ([`UndoManager`](../../src/core/UndoManager.ts)) | `actions.getUndoManager()` | Holds two stacks of `StateSnapshot`s. The signals it captures are in `TableState`, but the stacks themselves are not signals — they're synchronous arrays. |
| **Filter presets** ([`FilterPresetManager`](../../src/filters/FilterPresets.ts)) | `presets` option / shared instance | Cross-table named view sets. Not part of any single table's state. |
| **Session store** ([`SessionStore`](../../src/persistence/SessionStore.ts)) | `persistence.sessionStore` option | IndexedDB-backed persistence layer — written to, not subscribed to. |

The two singletons that *render* against state but don't hold it — [`AnnotationPopover`](../../src/table/AnnotationPopover.ts) and [`ColumnHeaderTooltipPopover`](../../src/table/ColumnHeaderTooltipPopover.ts) — read from `table.annotations` and `state.columnHeaderTooltips` respectively and re-render on the corresponding change channel.

## `Signal` vs `Computed`

Two container types, slight API difference:

```ts
interface Signal<T> {
  get(): T;
  set(value: T): void;
  subscribe(fn: (value: T) => void): () => void;
  subscriberCount(): number;
}

interface Computed<T> {
  get(): T;
  // no set()
  subscribe(fn: (value: T) => void): () => void;
  subscriberCount(): number;
  dispose(): void;   // unsubscribes from deps
}
```

`Computed` re-derives lazily on dep change. The library's only computed on
`TableState` is `filtersByColumn`; every other field is a signal.

## Reading state

```ts
// Snapshot:
const filters = table.state.filters.get();
const filteredRowCount = table.state.filteredRows.get();

// Subscribing:
const unsub = table.state.filters.subscribe((filters) => {
  console.log('Filters changed:', filters);
});

// Unsubscribe when done:
unsub();
```

If you just want to react to changes, the [event bus](../guides/events.md)
is usually more convenient — `filterChange`, `sortChange`, etc. bundle
the relevant signals into one callback. Reach for direct signal
subscriptions when you need state that doesn't have a dedicated event
(e.g., `hoveredRow`).

## Writing state

**Always go through `table.actions`.** Writes via `state.filters.set(...)`
work — they'll update the signal — but bypass undo snapshots, cache
invalidation, and cross-signal coordination. Every public action does all
three.

```ts
// Good
table.actions.addFilter({ type: 'range', column: 'age', min: 18, max: 65 });

// Avoid
table.state.filters.set([ { type: 'range', column: 'age', min: 18, max: 65 } ]);
```

The rare exception: UI signals (`hoveredRow`, `focusedCell`). These don't
participate in undo and the library's UI components set them directly
without going through actions.

## Mutation and equality

Signals use `!==` (shallow) to decide whether to notify. `Set` and `Map`
mutations need a new reference:

```ts
// No notification — same reference
const rows = table.state.selectedRows.get();
rows.add(5);
table.state.selectedRows.set(rows);

// Notification — new reference
table.state.selectedRows.set(new Set(table.state.selectedRows.get()).add(5));
```

Arrays: same story. Always construct a new array / Set / Map when
updating.

## Atomic multi-signal writes

Signal writes notify subscribers synchronously: two back-to-back `set`
calls fire two notifications. When one logical change touches several
signals, the library batches them internally so subscribers see a
single consistent update. `StateActions` uses this around filter-preset
loads, derived-column changes, and undo reconciliation.

The batching primitive itself is an internal detail — it is not part of
the public surface. When you need to apply several related mutations as
one step from outside `StateActions`, prefer a public action that already
does it for you (for example `actions.loadFilterPreset(filters,
sortColumns?)` replaces both filters and sort in one go and captures a
single undo snapshot).

## Undo / redo snapshots

`UndoManager` captures and applies a `StateSnapshot`:

```ts
interface StateSnapshot {
  filters: Filter[];
  sortColumns: SortColumn[];
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Map<string, number>;
  pinnedColumns: string[];
  hiddenColumnInfo: Map<string, HiddenColumnInfo>;
  derivedColumns: DerivedColumnDef[];
}
```

Notice what's **not** there: `tableName`, `baseTableName`, `schema`,
`totalRows`, `filteredRows`, `selectedRows`, `hoveredRow`,
`hoveredColumn`, `focusedCell`. Those fields either don't change in
response to user actions (data-shape fields) or are transient UI state
that doesn't belong in history.

Every `StateActions` method calls `captureForUndo()` *before* its
mutations, pushing a snapshot onto the undo stack. Undo pops a snapshot,
pushes the current state onto redo, and re-applies the popped snapshot.

## Subscription patterns

### Subscribe once to react repeatedly

```ts
table.state.filters.subscribe((filters) => {
  updateBadge(filters.length);
});
```

### Single-shot read

```ts
if (table.state.filters.get().some((f) => f.column === 'age')) { /* … */ }
```

### Combining several signals

Subscribe to each signal you care about and rebuild the derived value
from inside the callback. The library already batches related mutations
(see [Atomic multi-signal writes](#atomic-multi-signal-writes)), so you
won't see partial states mid-action:

```ts
const render = () => {
  const n = table.state.filters.get().length;
  const m = table.state.filteredRows.get();
  badgeEl.textContent = `${n} filters, ${m} rows`;
};

const unsub1 = table.state.filters.subscribe(render);
const unsub2 = table.state.filteredRows.subscribe(render);
render();   // initial paint

// When done:
unsub1();
unsub2();
```

The library exposes one pre-built combined signal — `filtersByColumn`
(a `Computed` that groups `filters` by column name) — for the common
"group filters by column" case.

## Resetting state

`resetTableState(state)` (from `src/core/State.ts`) clears every signal
back to the default. The library calls it on `clearSession()` and at the
start of a new `loadData()`. You rarely need to call it directly.

`initializeColumnsFromSchema(state, schema)` sets `schema`,
`visibleColumns`, and `columnOrder` based on a loaded schema. The library
calls this after every successful data load.

## Gotchas

- **`state.filters.get()` returns the live array.** Don't mutate it in place; construct a new array. The signal compares with `!==`.
- **Subscription cleanup is your responsibility.** Every `subscribe()` returns an `unsubscribe` function — call it when your consumer unmounts so the library can drop the reference. `table.destroy()` cleans up the library's own subscribers, not yours.
- **Transient UI signals aren't persisted.** Page reloads don't restore `focusedCell` or `hoveredRow`. Good — those would be confusing to restore.
- **`filtersByColumn` recomputes on every `filters` change.** Don't subscribe to it in hot code; subscribe to `filters` directly and compute your own grouping if needed.
- **`selectedRows` indexes the filtered set, not the base table.** When filters change, the set of "selected row indices" may now point to different actual rows. The built-in selection UI handles this; custom code should keep track.
- **Write through actions.** Bypassing actions to write a signal skips undo, cache invalidation, and cross-coordinated writes. Fine for transient UI signals, dangerous for persistable state.

## Related

- Architecture: [Architecture](./architecture.md) — big-picture context for these signals
- Events: [Events guide](../guides/events.md) — higher-level subscription API
- API reference: [TableState](../api-reference.md#state-signals), [StateActions](../api-reference.md#state-actions)
- Source: `src/core/State.ts:22-70`, `src/core/Signal.ts`, `src/core/UndoManager.ts`
