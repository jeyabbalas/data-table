import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/parquet/nyc_taxi.parquet';

const container = document.getElementById('table') as HTMLElement;
const bar = document.querySelector('#progress > span') as HTMLElement;

let table: DataTable | undefined;

(async () => {
  // IMPORTANT: construct without `source` so listeners can be wired BEFORE
  // loadData is invoked. `createDataTable({ source })` awaits the initial
  // load internally, meaning progress events would fire before `.on()` could
  // attach a handler. See examples/README.md for the full rationale.
  table = await createDataTable({
    container,
    tableName: 'nyc_taxi',
    persistence: false,
  });

  table.on('loadStart', () => {
    bar.style.width = '3%';
  });
  table.on('loadProgress', (info) => {
    bar.style.width = `${Math.max(3, info.percent)}%`;
  });
  table.on('loadComplete', () => {
    bar.style.width = '100%';
  });
  table.on('loadError', () => {
    bar.style.width = '100%';
    bar.style.background = 'var(--dt-error, #ef4444)';
  });

  await table.loadData(DATA_URL, { sourceFormat: 'parquet' });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
