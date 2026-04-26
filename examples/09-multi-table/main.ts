import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  FilterPresetManager,
  SessionStore,
  WorkerBridge,
  type DataTable,
} from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/parquet/nyc_taxi.parquet';

// One WorkerBridge (= one DuckDB WASM instance, one Web Worker) backs both
// tables. Each table still owns its own UI, state, and filters; they just
// share the ~100-200 MB DuckDB heap instead of running two copies.
// Safe because workers route messages by id and DuckDB tables are namespaced
// by the `tableName` option below.
const sharedBridge = new WorkerBridge();
const sharedPresets = new FilterPresetManager();
const sharedStore = new SessionStore();

let a: DataTable | undefined;
let b: DataTable | undefined;
// Cached once the initial load lands so the "Clear session + reload" button
// can feed both tables again without a second network round-trip. The worker
// bridge copies — not transfers — the ArrayBuffer, so reusing it across
// loadData calls is safe.
let sharedBuffer: ArrayBuffer | null = null;

(async () => {
  await sharedBridge.initialize();
  await sharedStore.open();

  // Each table has a unique tableName — session snapshots are keyed by it,
  // so the two tables don't overwrite each other's state in IDB, and the
  // shared bridge keeps their DuckDB tables separate.
  a = await createDataTable({
    container: document.getElementById('table-a') as HTMLElement,
    tableName: 'trips_a',
    bridge: sharedBridge,
    presets: { manager: sharedPresets },
    persistence: { sessionStore: sharedStore },
  });

  b = await createDataTable({
    container: document.getElementById('table-b') as HTMLElement,
    tableName: 'trips_b',
    bridge: sharedBridge,
    presets: { manager: sharedPresets },
    persistence: { sessionStore: sharedStore },
  });

  // Fetch the parquet file once on the main thread and pass the ArrayBuffer
  // to both tables. Avoids the 2× JS-heap peak and the 2× network round-trip
  // the previous `Promise.all([a.loadData(url), b.loadData(url)])` created.
  // Loads are serialised because DuckDB-WASM is single-threaded — the parallel
  // version was queueing behind itself inside DuckDB anyway.
  const res = await fetch(DATA_URL);
  sharedBuffer = await res.arrayBuffer();
  // Explicit tableName is required for session persistence to key correctly —
  // without it the loader auto-generates a fresh name every page load and
  // AutoSave would never find the snapshot on reload.
  await a.loadData(sharedBuffer, { sourceFormat: 'parquet', tableName: 'trips_a' });
  await b.loadData(sharedBuffer, { sourceFormat: 'parquet', tableName: 'trips_b' });

  document.getElementById('save-a')!.addEventListener('click', () => {
    const name = `A snapshot ${sharedPresets.getPresets().length + 1}`;
    sharedPresets.save(name, a!.state.filters.get(), a!.state.sortColumns.get());
    console.log('[09] saved preset:', name);
  });

  document.getElementById('load-b')!.addEventListener('click', () => {
    const latest = sharedPresets.getPresets().at(-1);
    if (!latest) return;
    sharedPresets.load(latest.id, b!.actions);
    console.log('[09] loaded into B:', latest.name);
  });

  document.getElementById('clear')!.addEventListener('click', () => {
    a!.actions.clearFilters();
    b!.actions.clearFilters();
  });

  // Full-session wipe for both tables: deletes both IDB rows, empties the
  // shared preset list, clears each table's undo stack, then reloads the
  // parquet buffer into both tables so the page stays usable. `clearSession`
  // resets JS state only — the DuckDB tables survive, so drop them before
  // the second loadData or `CREATE TABLE` throws "already exists".
  document.getElementById('clear-session')!.addEventListener('click', async () => {
    if (!sharedBuffer) return;
    await a!.clearSession();
    await b!.clearSession();
    await sharedBridge.query('DROP TABLE IF EXISTS "trips_a"');
    await sharedBridge.query('DROP TABLE IF EXISTS "trips_b"');
    await a!.loadData(sharedBuffer, { sourceFormat: 'parquet', tableName: 'trips_a' });
    await b!.loadData(sharedBuffer, { sourceFormat: 'parquet', tableName: 'trips_b' });
    console.log('[09] session cleared and both tables reloaded');
  });
})();

window.addEventListener('beforeunload', async () => {
  await a?.destroy();
  await b?.destroy();
  // Neither table owns the bridge, so it survives both destroys — terminate
  // explicitly since this page is unloading.
  sharedBridge.terminate();
  sharedStore.close();
});
