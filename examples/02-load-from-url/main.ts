import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/nyc_taxi.csv';

const container = document.getElementById('table') as HTMLElement;
const bar = document.querySelector('#progress > span') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;

let table: DataTable | undefined;

(async () => {
  // IMPORTANT: construct without `source` so listeners can be wired BEFORE
  // loadData is invoked. `createDataTable({ source })` awaits the initial
  // load internally, meaning progress events would fire before `.on()` could
  // attach a handler. See examples/README.md for the full rationale.
  table = await createDataTable({ container, tableName: 'nyc_taxi' });

  table.on('loadStart', () => {
    status.textContent = 'starting…';
    bar.style.width = '3%';
  });
  table.on('loadProgress', (info) => {
    const pct = Math.max(3, info.percent);
    bar.style.width = `${pct}%`;
    status.textContent = `${info.stage} ${Math.round(pct)}%`;
  });
  table.on('loadComplete', ({ rowCount }) => {
    bar.style.width = '100%';
    status.textContent = `${rowCount.toLocaleString()} rows loaded`;
  });
  table.on('loadError', ({ error }) => {
    bar.style.width = '100%';
    bar.style.background = 'var(--dt-error, #ef4444)';
    status.textContent = `error: ${error.message}`;
  });

  await table.loadData(DATA_URL, { sourceFormat: 'csv' });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
