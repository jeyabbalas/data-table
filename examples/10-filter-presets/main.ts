import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  FilterPresetManager,
  type DataTable,
} from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/nyc_taxi.csv';

const presets = new FilterPresetManager();
let table: DataTable | undefined;

const status = document.getElementById('status') as HTMLElement;
function renderStatus(): void {
  const n = presets.getPresets().length;
  const filters = table?.state.filters.get() ?? [];
  status.textContent = `${n} preset(s) · ${filters.length} active filter(s)`;
}

(async () => {
  table = await createDataTable({
    container: document.getElementById('table') as HTMLElement,
    tableName: 'trips',
    presets: { manager: presets },
  });

  table.on('filterChange', renderStatus);
  presets.presets.subscribe(renderStatus);

  await table.loadData(DATA_URL, { sourceFormat: 'csv' });
  renderStatus();

  document.getElementById('save')!.addEventListener('click', () => {
    const name = prompt('Preset name:', 'My filters');
    if (!name) return;
    presets.save(name, table!.state.filters.get(), table!.state.sortColumns.get());
  });

  document.getElementById('load-latest')!.addEventListener('click', () => {
    const latest = presets.getPresets().at(-1);
    if (!latest) return;
    presets.load(latest.id, table!.actions);
    console.log('[10] loaded preset:', latest.name);
  });

  document.getElementById('export')!.addEventListener('click', () => {
    const json = presets.exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'presets.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const json = await file.text();
    const { imported, errors } = presets.importFromJSON(json);
    console.log(`[10] imported ${imported} preset(s)`, errors);
    (e.target as HTMLInputElement).value = '';   // allow re-importing the same file
  });

  document.getElementById('clear-filters')!.addEventListener('click', () => {
    table!.actions.clearFilters();
  });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
