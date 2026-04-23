import '@jeyabbalas/data-table/styles';
import './theme.css';  // must come AFTER library styles so cascade order favors our overrides
import { createDataTable, type ColorScheme, type DataTable } from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/titanic.csv';

const container = document.getElementById('table') as HTMLElement;

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    tableName: 'titanic',
    colorScheme: 'auto',
    persistence: false,
  });

  const setScheme = (scheme: ColorScheme) => {
    table!.setColorScheme(scheme);
    for (const id of ['btn-light', 'btn-dark', 'btn-auto']) {
      const b = document.getElementById(id)!;
      b.setAttribute('aria-pressed', String(b.id === `btn-${scheme}`));
    }
  };

  document.getElementById('btn-light')!.onclick = () => setScheme('light');
  document.getElementById('btn-dark')!.onclick = () => setScheme('dark');
  document.getElementById('btn-auto')!.onclick = () => setScheme('auto');

  await table.loadData(DATA_URL, { sourceFormat: 'csv' });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
