# Session persistence

By default, `@jeyabbalas/data-table` persists your filters, sort, column
layout, derived columns, undo/redo stack and annotations to IndexedDB (keyed
by the DuckDB table name) and auto-restores them next time the page loads.
This guide covers how that works, how to opt out, how to share storage across
multiple tables, and how to handle environments where IndexedDB isn't
available.

## You'll learn how to

- Understand what gets persisted and when
- Know where annotations are kept, and when they are written
- Opt out of persistence entirely or per-feature
- Share a `SessionStore` across multiple table instances
- Handle IndexedDB unavailability (private browsing, storage blocked)
- Use the synchronous `saveSync()` for page-exit handlers
- Clear a session programmatically

## Prerequisites

- Read: [API reference — `persistence` option](../api-reference.md#createdatatable), [API reference — `SessionStore`](../api-reference.md#sessionstore)

## What gets persisted

A session snapshot is a JSON-serializable object keyed by `tableName`:

| Field                                                                                | Content                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filters`                                                                            | All active filters (Dates wrapped as `{ __date__: ISO8601 }`)                                                                                                                                                                |
| `sortColumns`                                                                        | Current sort priorities                                                                                                                                                                                                      |
| `visibleColumns`, `columnOrder`, `pinnedColumns`, `columnWidths`, `hiddenColumnInfo` | Column layout state                                                                                                                                                                                                          |
| `derivedColumns`                                                                     | Expression and vector column definitions                                                                                                                                                                                     |
| `undoStack`, `redoStack`                                                             | Undo/redo history                                                                                                                                                                                                            |
| `vectorValuePool`                                                                    | Deduplicated vector column values shared across undo entries                                                                                                                                                                 |
| `filterPresets`                                                                      | Saved filter presets                                                                                                                                                                                                         |
| `annotations`                                                                        | Full `AnnotationFile` written by `table.annotations.toJSON()` — every annotation (row / column / cell) plus unknown app-defined fields. Kept in a database of its own; see [below](#annotations-in-a-database-of-their-own). |
| `columnHeaderTooltips`                                                               | Per-column structured tooltip content (`{ title?, description?, items? }`) attached via `actions.setColumnHeaderTooltip`. See the [column-header tooltips guide](./column-header-tooltips.md).                               |

Other state (hovered row, focused cell, row selection) is transient and not
persisted.

The snapshot schema version (`SNAPSHOT_VERSION`, currently `5`) sits at the
top. On load, older versions are upgraded transparently — pre-v5 snapshots
load with empty `annotations` and absent `columnHeaderTooltips`, no error.
Unknown filter types from a newer version are silently dropped with a warning
to the console. `SessionStore.load()` returns a snapshot with its annotations
in `annotations`, wherever they were stored.

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

1. Open the IndexedDB databases `dt-sessions` and `dt-annotations`
2. Look up a snapshot by `tableName` (here, `'trips'`), and its annotations
3. If one exists, restore filters/sort/columns/derived after data load. With
   derived columns, the filters, sort and columns are restored in one change
   with them: a filter or sort that names a derived column is read and
   counted once the VIEW that has the column is back, and one whose derived
   column does not come back is dropped. A derived column does not come back
   when its expression no longer binds, or when another column has its name
   in any letter case (`Total` restored beside a new file's `total`; see
   [Derived columns → Validation](./derived-columns.md#validation)), and a
   base column of the same name keeps its place. An exact filter on a JSON
   column saved without a `valueType`, as before 0.9, is given
   `valueType: 'text'`, in the undo and redo entries too. An annotated
   filter keeps the annotated rows of the table it comes back to
4. Subsequent mutations auto-save on a debounced timer

On unmount (call `table.destroy()`): the auto-save flushes a final snapshot,
and a save under way still lands.

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
cleared. The presets and the annotations go once the worker has loaded the
new data, in the load's turn: a load the worker rejects for its source
options keeps them, with the rest of the table, and a load a newer load or
a clear supersedes restores nothing into the table that replaces it. A save
the table had pending, of the data being replaced, is written first.

The DuckDB-side cleanup is symmetric:

- If the new load uses a **different** `tableName`, the previous base
  table is dropped from the worker after the new one is live. Same-
  `tableName` reloads skip the drop — the loader's
  `CREATE OR REPLACE TABLE` handles the catalog conflict atomically.
  A failed load leaves the previous data queryable as a fallback.

Practical consequence: in a single-table app, saving a filter preset on
dataset A then loading dataset B starts B with no presets. Refreshing the
browser on the same dataset still restores the saved presets via the
snapshot — the clear-then-restore order means restoration wins on the
same-`tableName` path.

`clearSession` follows the same ownership rule: it clears the
`FilterPresetManager` only when this DataTable owns it, so a multi-table
dashboard's shared presets survive when one table is wiped.

## Annotations in a database of their own

A table's annotations are not stored in its session record. They go to a
second IndexedDB database, `dt-annotations`, under the same table name, and
are written only when they change, so that saving a sort or a column width
does not copy a million annotations again.

| Database         | Store         | Key                         | Holds                                                                                                                                                                                 |
| ---------------- | ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dt-sessions`    | `sessions`    | `tableName`                 | The session snapshot, without its annotations, and a marker in their place: `__annotations: { format: 1, count, owner, fallback? }`.                                                  |
| `dt-annotations` | `annotations` | `tableName`                 | The head: `{ format: 1, owner, count, chunks, file, previous? }`, `file` being the `AnnotationFile` without its `annotations` array, and `previous` the earlier records a write kept. |
| `dt-annotations` | `chunks`      | `[tableName, owner, index]` | The annotations, in slices of at most 10,000 annotations or about 8 MiB.                                                                                                              |

`owner` is a token made for each write of the annotations. The session
record's marker names the record it was saved with (`owner`, `count`) and
the one it named before (`fallback`). `SessionStore.load()` strips the
marker and attaches the first of the two that it finds whole, among the
head and the records the head keeps.

**When they are written.** The store writes a table's annotations only when
they are not the annotations it last wrote or read, by a token of their
content that stays the same until they change, so a snapshot carries them
without their file being taken. A save:

1. puts the new chunks and the head in one readwrite transaction, keeping
   whole, in the head's `previous`, the records the stored session record
   may name; each chunk is put once the one before it is stored, so cloning
   a million annotations takes many short tasks;
2. only once that has committed, writes the session record naming the new
   record, with the one it named before as its `fallback`;
3. once that has committed too, drops the records the head kept, in a small
   transaction.

So the stored session record names a whole record at every point: a reload
at any point, or a write that fails, restores the last annotations that
landed, at worst older than the rest of the session. A failed annotations
write saves the session record naming the annotations it named before.

- A save after a sort, filter, width or severity-filter change writes the
  session record alone, after one small read of the head (has another tab
  written them since?), and nothing to `dt-annotations`: 0.2–0.3 ms in
  Chromium with a million annotations, where serializing and cloning them all
  took about 1.2 s (Node) before.
- A save after the annotations change takes 0.43–0.51 s at a million in
  Chromium, 100 chunks, with no task over 16 ms.
- `saveSync()`, which runs only from `destroy()` and when the page is hidden
  or unloaded, enqueues all of it at once: the chunks and the head, keeping
  every record the stored head describes and deleting none, and the session
  record naming them, which reads the stored one in the same transaction and,
  when another tab has written the table's annotations since, takes that
  tab's record as its fallback. One task of 0.32 s for a changed million. It
  covers a save under way too: when that save is writing the same
  annotations, `saveSync()` names its write rather than writing them again,
  a session record of 0–1 ms. An asynchronous save it overtakes writes
  nothing more.
- A reload restores the annotations and writes nothing back until they
  change. Reading a million took 0.37–0.8 s in Chromium, most of it one
  `getAll` of the chunks, and restoring them 0.70–0.73 s.
- A table's saves, loads and deletes run one at a time, in call order,
  whichever `SessionStore` asks for them; a `saveSync()` and a `delete()`
  stop the older asynchronous saves. `close()` lets the operations asked for
  before it end, those asked for in the same task included, then closes the
  connections; one asked for after it opens the databases again, once those
  have ended. So `destroy()`, which closes a store the table owns, never
  drops a save under way, nor a `clearSession()` called just before it, and
  a table mounted again on the same name, with a store of its own, reads
  what those saves wrote.
- `loadData()` writes the save it had pending, of the data it replaces,
  asynchronously; `clearSession()` drops its pending save, the session going
  anyway. Auto-save stays off while any load or clear runs, and a load that
  a newer load or a clear supersedes restores nothing.
- Emptying the store (`table.annotations.clear()`) deletes its record at the
  next save. Until the record is deleted, the session record names it as
  dropped (`__annotationsDropped`, which `load()` strips): should the save not
  get to delete it, as when the page goes first, a later load does, unless a
  write has replaced it since. A record this version cannot attach (a newer
  format, an unreadable one, a file `loadJSON` refused), or one an older
  version's `clearSession()` left behind, stays until the table has
  annotations to write.

The chunks are there because Chromium refuses any single IndexedDB value
over 133,169,152 bytes (127 MiB), and a million annotations of about 167
bytes each pass that in one value. A chunk can reach it only with some 13 KB
an annotation in parts its size estimate cannot see, such as a `Blob` in
`metadata`.

**Two tabs.** The last tab to write a table's session wins, annotations
included: a tab whose annotations the other has replaced since writes its
own again at its next save, even one that only changes the sort. Only two
tabs writing the same table's annotations at the same moment can leave
neither restorable.

**When they are not restored.** When neither the record the session names
nor its fallback is whole, the rest of the session restores, and the table
emits a `warning` coded `PERSISTENCE_ANNOTATIONS_DROPPED`, whoever owns the
store, with `details: { tableName, reason, count? }`, `count` being how many
the session was saved with, when known:

| `reason`        | Cause                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'missing'`     | The session names annotations, but no record of them is there, as when another tab cleared the session meanwhile.                                                          |
| `'mismatch'`    | The table's record is another save's, which replaced both the one the session names and its fallback: two tabs wrote the same table's annotations at the same moment.      |
| `'invalid'`     | A malformed head, chunk or marker, a record of a newer format, or a file `loadJSON` refused, whose code and message are in `details.errorCode` and `details.errorMessage`. |
| `'unavailable'` | `dt-annotations` could not be read.                                                                                                                                        |

A record this version could not read (`'invalid'`, `'unavailable'`) stays,
and the session goes on naming it, until the table has annotations to write.

**Writes that fail.** The annotations have a circuit breaker of their own.
A quota error on them stops their saves at once; any other failure is
retried by the next save, and a second one in a row stops them. Each failure
until then is reported as an `error` event with `source: 'persistence'` and
`details.record: 'annotations'`. The session keeps saving, naming the last
annotations that landed, which a reload restores; `clearSession()` or a
reload starts their saves again.

**Older sessions and older versions.**

- A session saved by 0.9 or earlier holds its annotations inside the session
  record. It restores them, and the next save moves them to `dt-annotations`.
  Annotations inside a session record always win over a separate record.
- `dt-sessions` keeps its version, 1, and `SNAPSHOT_VERSION` stays 5, so a
  tab running an older version keeps its connection and keeps saving. An
  older version reading a session saved this way restores all of it but the
  annotations, which it does not look for, and an annotated filter, which it
  drops with a console warning. Once it saves that session, the record has no
  marker, and this version restores the session without the annotations too:
  export them with `toJSON()` before going back to an older version.
- When `dt-annotations` cannot be opened, annotations are saved inside the
  session record, as before.

**Custom stores.** An object of your own passed as
`persistence.sessionStore` receives whole snapshots, annotations included:
the same `annotations` file object from save to save while the annotations
do not change, and a new one once they do, where 0.9 built a new one at each
save. So does a `SessionStore` whose `save` or `saveSync` is not the
library's own, a subclass's override or a wrapper, which may copy a snapshot
after an `await`. Treat the file as read-only: it holds the annotation
store's own objects. Annotations inside the session records it returns are
restored as they are.

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
sharedStore.close(); // lets the saves under way finish, then releases the IDB connections
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

- IDB records for `tableName` deleted, the session's and its annotations'
  head and chunks (if persistence enabled); a save still pending is dropped
- Filters, sort, column layout, derived columns reset
- Undo/redo stacks cleared
- Query cache flushed
- Annotations cleared
- Filter presets cleared **only when the manager is owned by this table**
  (i.e. you didn't pass a shared `presets: { manager }`)
- The DuckDB table is **not** dropped — its rows remain queryable via
  `bridge.query()` until the next `loadData()` (or `destroy()` on a
  shared bridge) evicts it, with the temporary table of its annotated
  rows. Use `bridge.dropTable(tableName)` to release that worker memory
  immediately if you need to. The derived
  columns' VIEW and helper tables are dropped, and `derivedChange` fires
  when there were any.
- A `loadData()` still in flight when `clearSession()` is called lands
  first, and it is its table that is emptied, and its snapshot that is
  deleted. That load fires no `loadComplete`.
- `clearSession()` and `destroy()` called one after the other, as a "reset
  and close" button does, still delete the session and its annotations, and
  `clearSession()` resolves: the in-memory state goes with the table. It
  rejects with `DestroyedError` only when a `loadData()` in flight landed a
  table of its own first, whose session it did not get to delete.

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
- **Two tabs of the same app race on the IDB row.** Two browser tabs that mount a table with the same `tableName` against the same `dt-sessions` database both open their own `SessionStore` and write debounced snapshots. There is no cross-tab coordination (no `BroadcastChannel`, no IDB observer): whichever tab's debounced save lands second wins, and the other tab's most-recent edits are lost on reload. Practical mitigations: scope `tableName` per-tab (e.g. include a tab id or session id), avoid sharing the same `tableName` across tabs that are likely to be edited concurrently, or accept last-writer-wins as the documented contract. A future Phase-9-or-later release may add `BroadcastChannel` coordination; until then, treat IDB session state as single-writer. Annotations follow the same rule: a tab whose annotations the other has replaced since writes its own again at its next save. Two tabs writing the same table's annotations at the same moment can leave neither restorable, which the next reload reports as `PERSISTENCE_ANNOTATIONS_DROPPED` (`'mismatch'`).
- **`SessionStore` is a thin IDB wrapper — it never throws.** On failure (closed DB, blocked storage) it resolves with `null` / `false`. Check return values and listen for `warning`.
- **`saveSync()` requires the DB to already be open.** It's a no-op until after `await store.open()` resolves. The library opens the DB during `createDataTable()` init.
- **Snapshot size grows with derived vectors.** A 1M-row vector column adds ~MBs per snapshot. Use expression columns when possible; otherwise, accept the cost.
- **IDB quotas vary by browser.** Safari is stingiest. Prune old sessions if you mount many. When a save trips `QuotaExceededError`, AutoSave latches a one-shot circuit-breaker: the consumer's `onError` (or the facade's `error` event with `source: 'persistence'`) fires exactly once for that quota episode, and subsequent state mutations skip the save attempt. Calling `actions.clearSession()` (which deletes the snapshot) re-arms the breaker — saves resume on the next debounce tick. A quota error on the annotations alone (`details.record: 'annotations'`) stops only their saves: see [Annotations in a database of their own](#annotations-in-a-database-of-their-own).
- **Private browsing silently fails.** No error, no exception — just a `warning` event. Your UI should handle the no-persist case gracefully.
- **Session restore happens _after_ data load.** Filters/sort don't apply during the load progress stage; they snap into place on `loadComplete`.
- **A snapshot that cannot be read is skipped.** If a `SessionStore` hands back a snapshot whose fields are malformed, the load logs `[data-table] Could not restore the saved session; loading without it` to the console and goes ahead with the fresh state, rather than rejecting.
- **Snapshot version is bound to the library version.** `coerceLoadedSnapshot` rejects any snapshot whose `version` is not in `[1, SNAPSHOT_VERSION]`. Future-version blobs (e.g., a snapshot written by a newer library, then read by a downgraded build) load as `null`; the table boots fresh. Pre-1.0 has no migration framework — earlier versions load only by luck of optional-field absence. Treat the snapshot as bound to the major library version.

## Related

- Multi-table: [Multi-table dashboards](./multi-table.md) for shared-store patterns
- Troubleshooting: [IndexedDB persistence failing](../troubleshooting.md)
- API reference: [`persistence` option](../api-reference.md#createdatatable), [`SessionStore`](../api-reference.md#sessionstore)
- Source: `src/persistence/SessionStore.ts`, `src/persistence/annotationPersistence.ts`, `src/persistence/types.ts`, `src/persistence/AutoSave.ts`
