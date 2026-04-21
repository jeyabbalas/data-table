# 09 — Multi-table dashboard

Two tables side-by-side share a `FilterPresetManager` and a `SessionStore`.
Filter table A, save the filters as a preset, then load that preset onto
table B — the filters apply there too.

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/09-multi-table/
```

## API surface

- [`FilterPresetManager`](../../docs/api-reference.md#filterpresetmanager) — construct once, pass to many tables via `presets: { manager }`
- [`SessionStore`](../../docs/api-reference.md#sessionstore) — construct once, pass via `persistence: { sessionStore }`
- [`tableName` option](../../docs/api-reference.md#createdatatable) — unique per table so snapshots don't collide

## Data

Two copies of the 100,000-row NYC taxi fixture, one per table. Same
schema, so a preset saved from A can be loaded onto B cleanly.

## What to observe

1. **Filter something on A** — drag a histogram brush, click a value in the
   ValueCounts list, or use the filter bar. The status bar shows updated
   counts for both tables.
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

- The `WorkerBridge`. Each table owns its own DuckDB worker and data. The
  library doesn't support bridge sharing (see the [multi-table
  guide](../../docs/guides/multi-table.md) for why).
- `TableState` and `StateActions`. Per-instance by definition.

## Related

- Multi-table guide: [docs/guides/multi-table.md](../../docs/guides/multi-table.md)
- Filter presets guide: [docs/guides/filter-presets.md](../../docs/guides/filter-presets.md)
- Session persistence guide: [docs/guides/session-persistence.md](../../docs/guides/session-persistence.md)
