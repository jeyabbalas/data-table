# Multi-table dashboards

Mounting two or more `DataTable` instances on the same page is a
first-class use case. Each table owns its own DuckDB data, but filter
presets and IndexedDB session storage can be shared so users see a
unified experience.

## You'll learn how to

- Mount multiple tables on one page
- Share a `FilterPresetManager` so presets saved in one table are usable in another
- Share a `SessionStore` so one IDB connection backs every table
- Coordinate between tables by driving cross-table reactions off of events

## Prerequisites

- Read: [Session persistence guide](./session-persistence.md), [Filter presets guide](./filter-presets.md)
- Runnable example: [`examples/09-multi-table`](../../examples/09-multi-table/)

## Minimal example

```ts
import {
  createDataTable,
  FilterPresetManager,
  SessionStore,
} from '@jeyabbalas/data-table';

const sharedPresets = new FilterPresetManager();
const sharedStore   = new SessionStore();
await sharedStore.open();

const trips = await createDataTable({
  container: document.getElementById('trips')!,
  source: 'trips.csv',
  tableName: 'trips',
  presets:     { manager: sharedPresets },
  persistence: { sessionStore: sharedStore },
});

const users = await createDataTable({
  container: document.getElementById('users')!,
  source: 'users.csv',
  tableName: 'users',
  presets:     { manager: sharedPresets },
  persistence: { sessionStore: sharedStore },
});
```

Each table has its own `WorkerBridge` (so DuckDB state stays isolated), its
own `TableContainer` (so DOM stays isolated), and its own event bus. But
`sharedPresets` and `sharedStore` flow through both — any preset saved
from `trips` appears in `users`'s preset panel too.

## What can and cannot be shared

| Object | Shareable? | Why |
|---|---|---|
| `FilterPresetManager` | ✅ yes | Presets are table-agnostic; they can be loaded onto any table with compatible columns |
| `SessionStore` | ✅ yes | Snapshots are keyed by `tableName`, so one IDB connection can back many tables |
| `VisualizationRegistry` | ✅ yes (with caveat) | Pass the same `VisualizationRegistry` to both tables if you want identical custom viz behavior |
| `WorkerBridge` | ❌ no | The bridge owns a DuckDB database; sharing would intermix tables' data |
| `StateActions`, `TableState` | ❌ no | Per-instance by definition |

### `WorkerBridge` is not shared

Each table gets its own bridge because each bridge owns a DuckDB database
with table-specific VIEWs, derived columns, and session state. Sharing
would require coordinating namespace prefixes to keep data from clobbering
— not worth the complexity.

Mounting many tables does mean many WASM workers. On a page with more than
a few tables, consider lazy-mounting them (only call `createDataTable()`
for the ones currently visible).

## Coordinating between tables

Once the tables are running, their event buses let you drive cross-table
behavior without any library-level plumbing.

### Mirror a counter across both tables

```ts
const counter = document.getElementById('total-matching')!;

function renderCounter() {
  const t = trips.state.filteredRows.get();
  const u = users.state.filteredRows.get();
  counter.textContent = `trips: ${t.toLocaleString()} · users: ${u.toLocaleString()}`;
}

trips.on('filterChange', renderCounter);
users.on('filterChange', renderCounter);
renderCounter();
```

### Sync sort across tables

If both tables have a `created_at` column and you want them to sort
together:

```ts
trips.on('sortChange', ({ sortColumns }) => {
  const shared = sortColumns.find((s) => s.column === 'created_at');
  if (shared) {
    users.actions.setSort([shared]);
  }
});
```

Avoid two-way sync loops — if A drives B drives A, you'll toggle forever.
Use a simple guard flag or the `on('sortChange')` handler's `sortColumns`
equality check.

### Cross-filter (filter one table, narrow another)

Same pattern as sync; listen to `filterChange` on the source table and call
`actions.addFilter(...)` on the target. Remember to remove/clear filters
when the source is cleared.

## Saving a preset in one table, loading in another

Because `FilterPresetManager` is shared:

```ts
// User saves a preset in `trips`:
sharedPresets.save('Weekend trips', trips.state.filters.get());

// Later, user opens `users` and sees the same preset in its panel.
// Click-to-load routes through `sharedPresets.load(id, users.actions)`.
```

Presets can be loaded onto any table, but they reference columns by name.
If the target table's schema doesn't include those column names, the
filters apply but may match zero rows. Use naming conventions (e.g.,
prefix column names with the source table) or wrap `sharedPresets.load`
in a compatibility check.

## Teardown order

Destroy tables first, then close shared resources:

```ts
await trips.destroy();
await users.destroy();
sharedStore.close();
// FilterPresetManager has no explicit close method.
```

Closing the store before destroying tables is benign (auto-save may skip a
final flush) but not fatal — `SessionStore.saveSync()` silently no-ops on a
closed DB.

## Per-instance visualization registry

If you want custom visualization classes scoped per table:

```ts
import { VisualizationRegistry } from '@jeyabbalas/data-table';

const tripsRegistry = new VisualizationRegistry();
tripsRegistry.register({
  name: 'speed-spark',
  isApplicable: (t) => t === 'float',
  constructor: SpeedSparkline,
  priority: 10,
});

const usersRegistry = new VisualizationRegistry();   // just defaults

const trips = await createDataTable({ …, visualizationRegistry: tripsRegistry });
const users = await createDataTable({ …, visualizationRegistry: usersRegistry });
```

Omitting `visualizationRegistry` uses the shared `defaultVisualizationRegistry`,
which is global — any registration affects every table. Use per-instance
registries when you want scoped behavior. See [Visualizations](./visualizations.md).

## Portal targeting for many tables

Modals portal to `document.body` by default. With many tables on a page,
that's still fine — one modal is open at a time, and `ModalHost` manages
z-index stacking. If you're rendering inside a constrained layout (e.g.,
Shadow DOM, portaled iframes), pass `portalTarget` to each table:

```ts
await createDataTable({ …, portalTarget: someElement });
```

Make sure the target is high enough in the DOM to escape any
`overflow: hidden` / `transform` / `will-change` ancestors that create a
stacking context.

## Recipes

### Lazy-mount tables as the user scrolls to them

```ts
const observers: IntersectionObserver[] = [];
let trips: DataTable | null = null;

const ob = new IntersectionObserver(async ([entry]) => {
  if (!entry.isIntersecting || trips) return;
  trips = await createDataTable({
    container: entry.target as HTMLElement,
    source: 'trips.csv',
    tableName: 'trips',
  });
});
ob.observe(document.getElementById('trips')!);
observers.push(ob);
```

### Shared presets that encode which table they're for

Presets don't have a "source table" field, but you can encode it in the
preset name:

```ts
sharedPresets.save(`[trips] Weekend`, trips.state.filters.get());
```

Your load UI can then filter the preset list by prefix.

### Close all tables + store on route unmount

```ts
async function teardownDashboard() {
  await Promise.all(tables.map((t) => t.destroy()));
  sharedStore.close();
}
```

## Gotchas

- **Two tables with the same `tableName` share a session snapshot.** One overwrites the other on restore. Use unique names, or share a store and accept that the snapshot is per-name.
- **`WorkerBridge` is not a shareable resource.** Don't try to pass the same `bridge` to multiple `createDataTable()` calls — the library wasn't designed for it; worker messages would cross-talk.
- **Worker count scales with table count.** 5 tables = 5 WASM workers = 5× initialization cost. For many small tables consider one table with derived columns or a single query-driven view.
- **Cross-filter loops.** If table A's `filterChange` handler modifies table B, and B's modifies A, you'll loop forever. Check equality before setting.
- **Shared `defaultVisualizationRegistry` is a footgun.** Registering a custom viz without a per-instance registry affects every subsequent table on the page. Use explicit `VisualizationRegistry` instances.
- **`portalTarget` must not have `overflow: hidden` above it.** Or modals can get clipped. Body is the safe default.

## Related

- Session persistence: [Session persistence guide](./session-persistence.md) for `SessionStore` lifecycle
- Filter presets: [Filter presets guide](./filter-presets.md) for CRUD and export/import
- Visualizations: [Visualizations guide](./visualizations.md) for per-instance registries
- API reference: [`presets` option](../api-reference.md#createdatatable), [`persistence` option](../api-reference.md#createdatatable), [`FilterPresetManager`](../api-reference.md#filterpresetmanager)
- Source: `src/filters/FilterPresets.ts`, `src/persistence/SessionStore.ts`
