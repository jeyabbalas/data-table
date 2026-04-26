import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/parquet/nyc_taxi.parquet';

const container = document.getElementById('table') as HTMLElement;

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    tableName: 'nyc_taxi',
    persistence: false,
  });

  table.on('filterChange', ({ filters }) => {
    console.log('[03] filterChange', filters);
  });

  await table.loadData(DATA_URL, { sourceFormat: 'parquet' });

  // Credit-card trips (payment_type 1 = credit card per the TLC codebook).
  document.getElementById('btn-card')!.onclick = () => {
    table!.actions.addFilter({
      type: 'set',
      column: 'payment_type',
      values: [1],
    });
  };

  // Fare between $10 and $50 — a typical mid-city ride range.
  document.getElementById('btn-fare')!.onclick = () => {
    table!.actions.addFilter({
      type: 'range',
      column: 'fare_amount',
      min: 10,
      max: 50,
      maxInclusive: true,
    });
  };

  // Tip > 20% of fare. Uses the raw-SQL escape hatch for an expression
  // not expressible with the typed Filter shapes.
  document.getElementById('btn-tip')!.onclick = () => {
    table!.actions.addRawSQLFilter(
      'tip_amount / NULLIF(fare_amount, 0) > 0.20',
      'tip > 20%',
    );
  };

  // Short trips under 2 miles — demonstrates a second RangeFilter at the
  // low end of the distribution.
  document.getElementById('btn-short')!.onclick = () => {
    table!.actions.addFilter({
      type: 'range',
      column: 'trip_distance',
      min: 0,
      max: 2,
      maxInclusive: false,
    });
  };

  document.getElementById('btn-clear')!.onclick = () => {
    table!.actions.clearFilters();
  };
})();

window.addEventListener('beforeunload', () => void table?.destroy());
