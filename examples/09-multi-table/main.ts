import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  FilterPresetManager,
  SessionStore,
  WorkerBridge,
  type DataTable,
} from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/nyc_taxi.csv';

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

const status = document.getElementById('status') as HTMLElement;
function renderCounter(): void {
  if (!a || !b) return;
  const an = a.state.filteredRows.get();
  const bn = b.state.filteredRows.get();
  status.textContent = `A: ${an.toLocaleString()} · B: ${bn.toLocaleString()}`;
}

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

  a.on('filterChange', renderCounter);
  b.on('filterChange', renderCounter);

  // Fetch the CSV once on the main thread and pass the ArrayBuffer to both
  // tables. Avoids the 2× 10 MB JS-heap peak and the 2× network round-trip
  // the previous `Promise.all([a.loadData(url), b.loadData(url)])` created.
  // Loads are serialised because DuckDB-WASM is single-threaded — the parallel
  // version was queueing behind itself inside DuckDB anyway.
  const res = await fetch(DATA_URL);
  const buf = await res.arrayBuffer();
  await a.loadData(buf, { sourceFormat: 'csv' });
  await b.loadData(buf, { sourceFormat: 'csv' });
  renderCounter();

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
})();

window.addEventListener('beforeunload', async () => {
  await a?.destroy();
  await b?.destroy();
  // Neither table owns the bridge, so it survives both destroys — terminate
  // explicitly since this page is unloading.
  sharedBridge.terminate();
  sharedStore.close();
});
