# Session persistence

By default, `@jeyabbalas/data-table` persists your filters, sort, column
layout, derived columns, and undo/redo stack to IndexedDB (keyed by the
DuckDB table name) and auto-restores them next time the page loads. This
guide covers how that works, how to opt out, how to share storage across
multiple tables, and how to handle environments where IndexedDB isn't
available.

## You'll learn how to

- Understand what gets persisted and when
- Opt out of persistence entirely or per-feature
- Share a `SessionStore` across multiple table instances
- Handle IndexedDB unavailability (private browsing, storage blocked)
- Use the synchronous `saveSync()` for page-exit handlers
- Clear a session programmatically

## Prerequisites

- Read: [API reference — `persistence` option](../api-reference.md#createdatatable), [API reference — `SessionStore`](../api-reference.md#sessionstore)

## What gets persisted

A session snapshot is a JSON-serializable object keyed by `tableName`:

| Field                                                                                | Content                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filters`                                                                            | All active filters (Dates wrapped as `{ __date__: ISO8601 }`)                                                                                                                                  |
| `sortColumns`                                                                        | Current sort priorities                                                                                                                                                                        |
| `visibleColumns`, `columnOrder`, `pinnedColumns`, `columnWidths`, `hiddenColumnInfo` | Column layout state                                                                                                                                                                            |
| `derivedColumns`                                                                     | Expression and vector column definitions                                                                                                                                                       |
| `undoStack`, `redoStack`                                                             | Undo/redo history                                                                                                                                                                              |
| `vectorValuePool`                                                                    | Deduplicated vector column values shared across undo entries                                                                                                                                   |
| `filterPresets`                                                                      | Saved filter presets                                                                                                                                                                           |
| `annotations`                                                                        | Full `AnnotationFile` written by `table.annotations.toJSON()` — every annotation (row / column / cell) plus unknown app-defined fields. See the [annotations guide](./annotations.md).         |
| `columnHeaderTooltips`                                                               | Per-column structured tooltip content (`{ title?, description?, items? }`) attached via `actions.setColumnHeaderTooltip`. See the [column-header tooltips guide](./column-header-tooltips.md). |

Other state (hovered row, focused cell, row selection) is transient and not
persisted.

The snapshot schema version (`SNAPSHOT_VERSION`, currently `5`) sits at the
top. On load, older versions are upgraded transparently — pre-v5 snapshots
load with empty `annotations` and absent `columnHeaderTooltips`, no error.
Unknown filter types from a newer version are silently dropped with a warning
to the console.

## Default behavior

```ts
const table = await createDataTable({
  container,
  source: 'data.csv',
  tableName: 'trips',
  // persistence: true,   // ← default
});
```

On mount:

1. Open IndexedDB database `dt-sessions`
2. Look up a snapshot by `tableName` (here, `'trips'`)
3. If one exists, restore filters/sort/columns/derived after data load
4. Subsequent mutations auto-save on a debounced timer

On unmount (call `table.destroy()`): the auto-save flushes a final snapshot.

### `tableName` determines the session key

Two tables with the _same_ `tableName` share a snapshot — the second one
overwrites the first. Either provide unique `tableName` values when mounting
multiple tables, or pass a shared `SessionStore` (see below) and rely on the
keying.

### Per-dataset state is reset on `loadData`

`loadData` resets the table's per-dataset state before loading the new
dataset, then re-populates it from the new dataset's snapshot if one
exists. Specifically, `loadData` clears:

- the active filter / sort / column layout / undo–redo history (already
  done — `loadData` always reset these),
- the **owned** `FilterPresetManager`'s presets,
- the `AnnotationStore`,
- the worker bridge's SQL query cache.

A user-supplied (shared) `FilterPresetManager` passed via
`presets: { manager }` is **not** cleared — sharing across tables is
opt-in (see [Multi-table dashboards](./multi-table.md)). The annotation
store and query cache are always per-DataTable, so they're unconditionally
cleared.

Practical consequence: in a single-table app, saving a filter preset on
dataset A then loading dataset B starts B with no presets. Refreshing the
browser on the same dataset still restores the saved presets via the
snapshot — the clear-then-restore order means restoration wins on the
same-`tableName` path.

`clearSession` follows the same ownership rule: it clears the
`FilterPresetManager` only when this DataTable owns it, so a multi-table
dashboard's shared presets survive when one table is wiped.

## Opting out

```ts
// Disable entirely:
await createDataTable({ container, source, persistence: false });

// Disable just presets (but keep filter/sort persistence):
await createDataTable({ container, source, presets: false });

// Disable undo/redo (and its persistence):
await createDataTable({ container, source, undoRedo: false });
```

With `persistence: false`, filters and sort changes don't survive a page
reload. This is the right choice when the table mounts inside ephemeral UI
(a side panel, a modal) where restoring old state would be confusing.

## Sharing a `SessionStore` across tables

The default flow creates one `SessionStore` per `createDataTable()` call.
For multi-table dashboards, create one store up front and pass it in:

```ts
import { SessionStore } from '@jeyabbalas/data-table';

const sharedStore = new SessionStore();
await sharedStore.open();

const t1 = await createDataTable({
  container: el1,
  source: 'trips.csv',
  tableName: 'trips',
  persistence: { sessionStore: sharedStore },
});

const t2 = await createDataTable({
  container: el2,
  source: 'users.csv',
  tableName: 'users',
  persistence: { sessionStore: sharedStore },
});
```

Both tables share a single IDB connection; each keeps its own snapshot
(keyed by `tableName`). On teardown:

```ts
await t1.destroy();
await t2.destroy();
sharedStore.close(); // release the IDB connection
```

See also the [Multi-table guide](./multi-table.md) for patterns sharing
`FilterPresetManager` and coordinating events.

## Handling IndexedDB unavailability

`SessionStore.open()` returns `Promise<boolean>` — `false` when IndexedDB
isn't available or blocked. The facade catches this and emits a `warning`
event:

```ts
table.on('warning', ({ code, message }) => {
  if (code === 'PERSISTENCE_UNAVAILABLE') {
    showBanner("Your browser is blocking local storage — session won't persist.");
  }
});
```

Common causes:

- Private / incognito browsing (Firefox in particular)
- Storage blocked by the user (Safari's Intelligent Tracking Prevention)
- Quota exceeded (unusual in practice; snapshots are small)

The table continues working; only persistence is disabled.

`table.isPersistenceActive()` returns `false` when persistence was opted
out _or_ when IDB was unavailable at init. Check the `warning` event to
distinguish.

## `save()` vs `saveSync()`

The library runs an auto-save on a short debounce — most apps don't need
to call `save` directly. Two reasons you might:

1. **Forcing a save before a programmatic unmount** — `table.destroy()`
   already flushes, but if you're about to navigate without destroying,
   call `table.actions.saveSession?.()` or rely on `beforeunload`.
2. **Page-exit handlers** — `beforeunload` and `visibilitychange` fire at a
   point where `async` work may be skipped by the browser. Use the
   synchronous variant:

```ts
import { SessionStore } from '@jeyabbalas/data-table';

addEventListener('beforeunload', () => {
  // saveSync requires the DB to already be open
  sharedStore.saveSync(buildSnapshotFromState(state));
});
```

The library's own auto-save wiring uses `saveSync` under the hood for
page-exit paths, so most apps don't need this recipe.

## Clearing a session

To wipe the persisted snapshot and reset the in-memory state in one call:

```ts
await table.clearSession();
```

Effect:

- IDB record for `tableName` deleted (if persistence enabled)
- Filters, sort, column layout, derived columns reset
- Undo/redo stacks cleared
- Query cache flushed
- Annotations cleared
- Filter presets cleared **only when the manager is owned by this table**
  (i.e. you didn't pass a shared `presets: { manager }`)

After `clearSession()`, the table is fresh. Call `loadData()` to re-populate
it (or pass a new `source` and mount a new table).

To manually delete a snapshot without touching the running table:

```ts
import { SessionStore } from '@jeyabbalas/data-table';

const store = new SessionStore();
await store.open();
await store.delete('trips');
await store.close?.();
```

## Listing stored sessions

```ts
const names = await sharedStore.list();
console.log(names); // ['trips', 'users', …]
```

Useful for debugging, or for showing the user a "previous sessions" picker.

## Date serialization

All `Date` objects in filter values are wrapped as `{ __date__: ISO8601 }`
before storage, and unwrapped on restore. If you're writing custom code that
round-trips filters through JSON — a custom backend, a URL state encoder —
use `serializeFilter` / `deserializeFilter` from `@jeyabbalas/data-table`
so the wrapping stays consistent.

## Recipes

### Per-user session key

Prefix `tableName` with a user identifier so sessions don't collide across
logged-in users:

```ts
const tableName = `user-${userId}-trips`;
await createDataTable({ container, source, tableName });
```

### Clear all persisted sessions

```ts
const store = new SessionStore();
await store.open();
for (const name of await store.list()) {
  await store.delete(name);
}
```

### React unmount with persistence flush

```tsx
useEffect(() => {
  let cancelled = false;
  let table: DataTable | null = null;
  (async () => {
    const t = await createDataTable({ container: containerRef.current!, source });
    if (cancelled) {
      await t.destroy();
      return;
    }
    table = t;
  })();
  return () => {
    cancelled = true;
    table?.destroy(); // flushes session
  };
}, [source]);
```

## Gotchas

- **Two tables with the same `tableName` overwrite each other's sessions.** Pick unique names, or share the store and accept the overwrite.
- **Two tabs of the same app race on the IDB row.** Two browser tabs that mount a table with the same `tableName` against the same `dt-sessions` database both open their own `SessionStore` and write debounced snapshots. There is no cross-tab coordination (no `BroadcastChannel`, no IDB observer): whichever tab's debounced save lands second wins, and the other tab's most-recent edits are lost on reload. Practical mitigations: scope `tableName` per-tab (e.g. include a tab id or session id), avoid sharing the same `tableName` across tabs that are likely to be edited concurrently, or accept last-writer-wins as the documented contract. A future Phase-9-or-later release may add `BroadcastChannel` coordination; until then, treat IDB session state as single-writer.
- **`SessionStore` is a thin IDB wrapper — it never throws.** On failure (closed DB, blocked storage) it resolves with `null` / `false`. Check return values and listen for `warning`.
- **`saveSync()` requires the DB to already be open.** It's a no-op until after `await store.open()` resolves. The library opens the DB during `createDataTable()` init.
- **Snapshot size grows with derived vectors.** A 1M-row vector column adds ~MBs per snapshot. Use expression columns when possible; otherwise, accept the cost.
- **IDB quotas vary by browser.** Safari is stingiest. Prune old sessions if you mount many. When a save trips `QuotaExceededError`, AutoSave latches a one-shot circuit-breaker: the consumer's `onError` (or the facade's `error` event with `source: 'persistence'`) fires exactly once for that quota episode, and subsequent state mutations skip the save attempt. Calling `actions.clearSession()` (which deletes the snapshot) re-arms the breaker — saves resume on the next debounce tick.
- **Private browsing silently fails.** No error, no exception — just a `warning` event. Your UI should handle the no-persist case gracefully.
- **Session restore happens _after_ data load.** Filters/sort don't apply during the load progress stage; they snap into place on `loadComplete`.
- **Snapshot version is bound to the library version.** `coerceLoadedSnapshot` rejects any snapshot whose `version` is not in `[1, SNAPSHOT_VERSION]`. Future-version blobs (e.g., a snapshot written by a newer library, then read by a downgraded build) load as `null`; the table boots fresh. Pre-1.0 has no migration framework — earlier versions load only by luck of optional-field absence. Treat the snapshot as bound to the major library version.

## Related

- Multi-table: [Multi-table dashboards](./multi-table.md) for shared-store patterns
- Troubleshooting: [IndexedDB persistence failing](../troubleshooting.md)
- API reference: [`persistence` option](../api-reference.md#createdatatable), [`SessionStore`](../api-reference.md#sessionstore)
- Source: `src/persistence/SessionStore.ts:1-283`, `src/persistence/types.ts`, `src/persistence/AutoSave.ts`
