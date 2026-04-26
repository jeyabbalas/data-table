import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

// Smallest possible mount: hand-coded rows in a JS array. `loadData` accepts
// a Blob, so wrap the array as JSON and hand it straight to the table — no
// network, no worker progress, no fixtures on disk. For real datasets, see
// example 02 (URL + progress bar) or 03 (100 K-row CSV).
const DATA = [
  { name: 'Alice Chen', role: 'Engineer', team: 'Platform', joined: 2019, active: true },
  { name: 'Bao Nguyen', role: 'Designer', team: 'Product', joined: 2021, active: true },
  { name: 'Carlos Ruiz', role: 'Engineer', team: 'Data', joined: 2018, active: false },
  { name: 'Dana Patel', role: 'Manager', team: 'Product', joined: 2016, active: true },
  { name: 'Ebele Okafor', role: 'Researcher', team: 'Data', joined: 2022, active: true },
  { name: 'Farid Hamidi', role: 'Engineer', team: 'Platform', joined: 2020, active: true },
  { name: 'Grace Lee', role: 'Designer', team: 'Product', joined: 2023, active: false },
  { name: 'Hiro Tanaka', role: 'Engineer', team: 'Data', joined: 2017, active: true },
];

const container = document.getElementById('table') as HTMLElement;

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    tableName: 'team',
    persistence: false,
  });
  const blob = new Blob([JSON.stringify(DATA)], { type: 'application/json' });
  await table.loadData(blob, { sourceFormat: 'json' });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
