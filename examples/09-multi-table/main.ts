import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  FilterPresetManager,
  SessionStore,
  type DataTable,
} from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/nyc_taxi.csv';

// Shared across both tables so a preset saved in A is usable in B,
// and one IndexedDB connection backs both session snapshots.
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
  await sharedStore.open();

  // Each table has a unique tableName — session snapshots are keyed by it,
  // so the two tables don't overwrite each other's state in IDB.
  a = await createDataTable({
    container: document.getElementById('table-a') as HTMLElement,
    tableName: 'trips_a',
    presets: { manager: sharedPresets },
    persistence: { sessionStore: sharedStore },
  });

  b = await createDataTable({
    container: document.getElementById('table-b') as HTMLElement,
    tableName: 'trips_b',
    presets: { manager: sharedPresets },
    persistence: { sessionStore: sharedStore },
  });

  a.on('filterChange', renderCounter);
  b.on('filterChange', renderCounter);

  await Promise.all([
    a.loadData(DATA_URL, { sourceFormat: 'csv' }),
    b.loadData(DATA_URL, { sourceFormat: 'csv' }),
  ]);
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
  sharedStore.close();
});
