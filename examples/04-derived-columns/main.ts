import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/nyc_taxi.csv';

const container = document.getElementById('table') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({ container, tableName: 'nyc_taxi' });

  table.on('loadComplete', ({ rowCount }) => {
    status.textContent = `${rowCount.toLocaleString()} rows`;
  });
  table.on('derivedChange', ({ derivedColumns }) => {
    status.textContent = `${derivedColumns.length} derived: ${derivedColumns
      .map((d) => d.name)
      .join(', ')}`;
  });

  await table.loadData(DATA_URL, { sourceFormat: 'csv', tableName: 'nyc_taxi' });

  // Expression column — evaluated inside DuckDB. The new column appears in
  // the table header as soon as the VIEW rebuilds (no data reload).
  document.getElementById('btn-expr')!.onclick = async () => {
    const res = await table!.actions.addDerivedColumn({
      kind: 'expression',
      name: 'tip_pct',
      expression: '100 * tip_amount / NULLIF(fare_amount, 0)',
    });
    if (!res.success) alert(`Expression failed: ${res.error}`);
  };

  // Vector column — precomputed Uint8 array. Here we tag airport pickups
  // (TLC zones 1 = EWR, 132 = JFK, 138 = LGA) by running a single SELECT
  // against the loaded table and materializing a 0/1 array in JS. This is
  // the pattern you use when the per-row value comes from an ML model,
  // an external API, or a geo lookup that can't be done in SQL.
  document.getElementById('btn-vec')!.onclick = async () => {
    // ORDER BY rowid is REQUIRED: the helper table built by
    // DerivedColumnManager keys each vector value on array index, and the
    // VIEW joins `t.rowid = h.__rowid__`. Without the explicit order,
    // DuckDB may return rows in arbitrary scan order and the join
    // silently misaligns, leaving every row's is_airport = NULL.
    const rows = await table!.bridge.query<{ PULocationID: number }>(
      'SELECT PULocationID FROM nyc_taxi ORDER BY rowid',
    );
    const AIRPORTS = new Set([1, 132, 138]);
    const values = new Uint8Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      values[i] = AIRPORTS.has(rows[i].PULocationID) ? 1 : 0;
    }
    const res = await table!.actions.addDerivedColumn({
      kind: 'vector',
      name: 'is_airport',
      vectorType: 'integer',
      values,
    });
    if (!res.success) alert(`Vector failed: ${res.error}`);
  };
})();

window.addEventListener('beforeunload', () => void table?.destroy());
