# 09 — Multi-table dashboard

Two tables side-by-side share a `WorkerBridge` (one DuckDB worker for both),
a `FilterPresetManager`, and a `SessionStore`. Filter table A, save the
filters as a preset, then load that preset onto table B — the filters
apply there too.

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/09-multi-table/
```

## API surface

- [`WorkerBridge`](../../docs/api-reference.md#workerbridge) — construct and initialize once, pass to each table via `bridge`. Cuts DuckDB memory and init cost roughly in half.
- [`FilterPresetManager`](../../docs/api-reference.md#filterpresetmanager) — construct once, pass to many tables via `presets: { manager }`
- [`SessionStore`](../../docs/api-reference.md#sessionstore) — construct once, pass via `persistence: { sessionStore }`
- [`tableName` option](../../docs/api-reference.md#createdatatable) — unique per table so snapshots and DuckDB tables don't collide

## Data

Two copies of the 100,000-row NYC taxi fixture, one per table. Same
schema, so a preset saved from A can be loaded onto B cleanly.

## What to observe

1. **Filter something on A** — drag a histogram brush, click a value in the
   ValueCounts list, or use the filter bar.
2. **Save preset from A** — snapshots the current filter set with a name.
   The preset appears in *both* tables' Presets panel because the manager
   is shared.
3. **Load latest into B** — applies A's saved filters to B in one undo
   step. Cmd/Ctrl-Z on B restores B's pre-load state.
4. **Clear both** — `actions.clearFilters()` on each table; presets
   remain, filters are wiped.
5. **Reload the page** — both tables restore their individual session
   snapshots from the shared `SessionStore`, keyed by their
   `tableName` (`trips_a`, `trips_b`).

## What's *not* shared

- `TableState` and `StateActions`. Per-instance by definition — each table has
  its own filters, sort order, column visibility, and undo/redo stack.
- DOM and event bus. Each table mounts into its own container with its own
  `table.on(...)` subscriptions.

### When would you want two bridges instead?

Stick with one bridge per table when you need strong data isolation
(multi-tenant), different `bridgeOptions` per table (e.g., self-hosted WASM
paths that differ), or when one table routinely runs multi-second queries
that shouldn't head-of-line-block the other. Otherwise, shared is the
right default — see the [multi-table guide](../../docs/guides/multi-table.md).

## Related

- Multi-table guide: [docs/guides/multi-table.md](../../docs/guides/multi-table.md)
- Filter presets guide: [docs/guides/filter-presets.md](../../docs/guides/filter-presets.md)
- Session persistence guide: [docs/guides/session-persistence.md](../../docs/guides/session-persistence.md)
