import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/titanic.csv';

const container = document.getElementById('table') as HTMLElement;
const obsFilter = document.getElementById('obs-filter') as HTMLElement;
const obsSort = document.getElementById('obs-sort') as HTMLElement;
const obsSel = document.getElementById('obs-sel') as HTMLElement;

const unsubs: Array<() => void> = [];
let table: DataTable | undefined;

(async () => {
  table = await createDataTable({ container, tableName: 'titanic' });

  // ----- Observe: side panel reflects state updates driven by events -----
  unsubs.push(
    table.on('filterChange', ({ filters, filteredRowCount, totalRowCount }) => {
      obsFilter.textContent = `${filteredRowCount}/${totalRowCount}\n${JSON.stringify(filters, null, 2)}`;
    }),
    table.on('sortChange', ({ sortColumns }) => {
      obsSort.textContent = sortColumns.length
        ? JSON.stringify(sortColumns, null, 2)
        : '(unsorted)';
    }),
    table.on('selectionChange', ({ selectedRows }) => {
      const list = Array.from(selectedRows).slice(0, 20).join(', ');
      obsSel.textContent = `${selectedRows.size} rows: [${list}${selectedRows.size > 20 ? ', …' : ''}]`;
    }),
  );

  await table.loadData(DATA_URL, { sourceFormat: 'csv' });

  // ----- Drive: external buttons mutate state via `actions.*` -----
  // Each click fires the corresponding event, which the Observe pane picks up.
  document.getElementById('drv-sort')!.onclick = () => {
    table!.actions.setSort([{ column: 'Fare', direction: 'desc' }]);
  };
  document.getElementById('drv-survived')!.onclick = () => {
    table!.actions.addFilter({ type: 'set', column: 'Survived', values: [1] });
  };
  document.getElementById('drv-first10')!.onclick = () => {
    const first10 = new Set<number>();
    for (let i = 0; i < 10; i++) first10.add(i);
    table!.state.selectedRows.set(first10);
  };
  document.getElementById('drv-clear')!.onclick = () => {
    table!.actions.clearFilters();
    table!.actions.clearSelection();
    table!.actions.setSort([]);
  };
})();

window.addEventListener('beforeunload', () => {
  for (const un of unsubs) un();
  void table?.destroy();
});
