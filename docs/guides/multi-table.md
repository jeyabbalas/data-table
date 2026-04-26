# Multi-table dashboards

Mounting two or more `DataTable` instances on the same page is a
first-class use case. Tables can share a DuckDB worker, filter presets,
and IndexedDB session storage so users see a unified experience without
paying for two WASM runtimes.

## You'll learn how to

- Mount multiple tables on one page
- Share a `WorkerBridge` so one DuckDB instance backs every table (≈½ memory)
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
  WorkerBridge,
} from '@jeyabbalas/data-table';

const sharedBridge = new WorkerBridge();
await sharedBridge.initialize();
const sharedPresets = new FilterPresetManager();
const sharedStore = new SessionStore();
await sharedStore.open();

const trips = await createDataTable({
  container: document.getElementById('trips')!,
  source: 'trips.csv',
  tableName: 'trips',
  bridge: sharedBridge,
  presets: { manager: sharedPresets },
  persistence: { sessionStore: sharedStore },
});

const users = await createDataTable({
  container: document.getElementById('users')!,
  source: 'users.csv',
  tableName: 'users',
  bridge: sharedBridge,
  presets: { manager: sharedPresets },
  persistence: { sessionStore: sharedStore },
});
```

Each table has its own `TableContainer` (so DOM stays isolated), its own
`TableState` / `StateActions` (so filters, sort, undo stacks stay
per-table), and its own event bus. But `sharedBridge`, `sharedPresets`,
and `sharedStore` flow through both — one DuckDB heap, one preset list,
one IndexedDB handle.

## What can and cannot be shared

| Object                       | Shareable?                                | Why                                                                                                      |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `WorkerBridge`               | ✅ yes (recommended for heavy dashboards) | One DuckDB worker = ≈½ memory and one WASM init instead of two. Requires distinct `tableName` per table. |
| `FilterPresetManager`        | ✅ yes                                    | Presets are table-agnostic; they can be loaded onto any table with compatible columns                    |
| `SessionStore`               | ✅ yes                                    | Snapshots are keyed by `tableName`, so one IDB connection can back many tables                           |
| `VisualizationRegistry`      | ✅ yes (with caveat)                      | Pass the same `VisualizationRegistry` to both tables if you want identical custom viz behavior           |
| `StateActions`, `TableState` | ❌ no                                     | Per-instance by definition                                                                               |

### Sharing a `WorkerBridge`

Pass one initialized `WorkerBridge` to each `createDataTable()` via the
`bridge` option. The library honours `ownsBridge` semantics: only the
caller-owned bridge is terminated when a table's `destroy()` runs
([`src/DataTable.ts:372-374,:956`](../../src/DataTable.ts)). A bridge you
constructed yourself survives every table's destruction — call
`bridge.terminate()` when you're done with the page.

**Requirements when sharing:**

- **Distinct `tableName` per table.** DuckDB creates one table per call;
  reusing a name replaces the previous one's data. `tableName: 'trips'` and
  `tableName: 'users'` stay separate inside one DuckDB database.
- **Derived-column VIEWs are already namespaced** as `__dt_view_<tableName>__`
  ([`src/derived/DerivedColumnManager.ts:61`](../../src/derived/DerivedColumnManager.ts)),
  so adding a derived column on one table doesn't alter the other's schema.

**Caveats (honest):**

- The bridge's query cache (keyed by SQL text) is shared. Usually a benefit —
  identical queries from both tables hit the cache once. But
  `table.clearSession()` calls `bridge.clearQueryCache()` globally, briefly
  slowing queries on every table sharing the bridge until caches rewarm.
- DuckDB-WASM is single-threaded inside one worker. If table A runs a slow
  query, table B's queries queue behind it. In practice this is usually a win
  (WASM context-switching is cheap and the library already caps concurrent
  visualization queries at 4 per bridge), but avoid sharing when one table
  routinely runs multi-second analytical queries that shouldn't head-of-line
  block the other.

### When to keep `WorkerBridge` per-table

Separate bridges for each table when:

- **Strong isolation** (multi-tenant, one table per tenant).
- **Different `bridgeOptions`** — e.g., one table's WASM bundles are
  self-hosted and the other's come from a CDN.
- **Hot-swap one dataset** without invalidating the other's query cache.

Mounting many tables with per-table bridges means many WASM workers. On a
page with more than a few tables, consider lazy-mounting them (only call
`createDataTable()` for the ones currently visible).

### Memory budget

Typical cost per table, based on [`docs/performance.md`](../performance.md)'s
50-100 bytes/cell rule:

| Rows × cols | Per table (own bridge) | Two tables (shared bridge) | Two tables (own bridges) |
| ----------- | ---------------------- | -------------------------- | ------------------------ |
| 100K × 20   | ~100-200 MB + 1 worker | ~200-400 MB + 1 worker     | ~200-400 MB + 2 workers  |
| 1M × 20     | ~1-2 GB + 1 worker     | ~2-4 GB + 1 worker         | ~2-4 GB + 2 workers      |

Browsers cap per-tab memory around 2-4 GB on desktop and much lower on
mobile (often 1 GB). For two 100K-row tables, shared-bridge fits comfortably
on any device; per-table bridges can crash low-memory browsers with
DevTools open. Share the bridge when the tables' data isn't adversarial.

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
sharedBridge.terminate();
sharedStore.close();
// FilterPresetManager has no explicit close method.
```

Tables skip `bridge.terminate()` when they don't own the bridge
(`ownsBridge` in `src/DataTable.ts:372,:956`), so a shared bridge survives
both `destroy()` calls and must be terminated explicitly.

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

### Close all tables + shared resources on route unmount

```ts
async function teardownDashboard() {
  await Promise.all(tables.map((t) => t.destroy()));
  sharedBridge.terminate(); // if you're sharing one
  sharedStore.close();
}
```

## Gotchas

- **Two tables with the same `tableName` share a session snapshot AND a DuckDB table.** Their state overwrites each other on restore, and if the bridge is shared the second `loadData()` replaces the first's data. Always use unique names.
- **Worker count scales with table count when bridges aren't shared.** 5 tables × own bridge = 5 WASM workers = 5× initialization cost and 5× base memory. Share the bridge (see above) or, for many small views of the same dataset, consider one table with derived columns or a single query-driven view.
- **Cross-filter loops.** If table A's `filterChange` handler modifies table B, and B's modifies A, you'll loop forever. Check equality before setting.
- **Shared `defaultVisualizationRegistry` is a footgun.** Registering a custom viz without a per-instance registry affects every subsequent table on the page. Use explicit `VisualizationRegistry` instances.
- **`portalTarget` must not have `overflow: hidden` above it.** Or modals can get clipped. Body is the safe default.

## Related

- Session persistence: [Session persistence guide](./session-persistence.md) for `SessionStore` lifecycle
- Filter presets: [Filter presets guide](./filter-presets.md) for CRUD and export/import
- Visualizations: [Visualizations guide](./visualizations.md) for per-instance registries
- API reference: [`presets` option](../api-reference.md#createdatatable), [`persistence` option](../api-reference.md#createdatatable), [`FilterPresetManager`](../api-reference.md#filterpresetmanager)
- Source: `src/filters/FilterPresets.ts`, `src/persistence/SessionStore.ts`
