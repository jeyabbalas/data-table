import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import { frenchMessages } from './fr';

const DATA_URL = 'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/vins_de_france.csv';

const container = document.getElementById('table') as HTMLElement;

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    tableName: 'vins',
    messages: frenchMessages,
  });
  await table.loadData(DATA_URL, { sourceFormat: 'csv' });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
