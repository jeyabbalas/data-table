import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/parquet/nyc_taxi.parquet';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const container = $<HTMLElement>('table');
const eventLog = $<HTMLPreElement>('event-log');

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    tableName: 'nyc_taxi',
    persistence: false,
  });

  // Subscribe to derivedChange. Payload carries `kind` so consumers know
  // whether a column was added, updated, removed, or replaced.
  table.on('derivedChange', (p) => {
    eventLog.textContent = JSON.stringify(
      {
        kind: p.kind,
        columnName: p.columnName ?? '(bulk)',
        count: p.derivedColumns.length,
        names: p.derivedColumns.map((d) => d.name),
      },
      null,
      2,
    );
  });

  await table.loadData(DATA_URL, { sourceFormat: 'parquet', tableName: 'nyc_taxi' });

  // Expression column — evaluated inside DuckDB. The new column appears in
  // the table header as soon as the VIEW rebuilds (no data reload).
  $<HTMLButtonElement>('btn-expr').onclick = async () => {
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
  $<HTMLButtonElement>('btn-vec').onclick = async () => {
    // ORDER BY __rowid__ is REQUIRED: the helper table built by
    // DerivedColumnManager keys each vector value on array index, and the
    // VIEW joins `t.__rowid__ = h.__rowid__`. Without the explicit order,
    // DuckDB may return rows in arbitrary scan order and the join
    // silently misaligns, leaving every row's is_airport = NULL.
    const rows = await table!.bridge.query<{ PULocationID: number }>(
      'SELECT PULocationID FROM nyc_taxi ORDER BY __rowid__',
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

  // Dependent on `tip_pct` — added so the incompatible-replace scenario has
  // something to break against.
  $<HTMLButtonElement>('btn-dep').onclick = async () => {
    const res = await table!.actions.addDerivedColumn({
      kind: 'expression',
      name: 'tip_pct_flag',
      expression: 'tip_pct > 10',
    });
    if (!res.success) alert(`Dependent failed: ${res.error}`);
  };

  // Compatible replace: same output type, dependents still resolve.
  $<HTMLButtonElement>('btn-replace-compat').onclick = async () => {
    const res = await table!.actions.replaceDerivedColumn('tip_pct', {
      kind: 'expression',
      name: 'tip_pct',
      expression: '100 * tip_amount / NULLIF(fare_amount, 0) + 0.0001',
    });
    if (!res.success) {
      alert(`Replace failed (${res.error.code}): ${res.error.message}`);
    }
  };

  // Incompatible replace: changes result type to VARCHAR, breaking the
  // numeric comparison in `tip_pct_flag`. Pre-flight catches this before
  // touching DuckDB and returns a structured error.
  $<HTMLButtonElement>('btn-replace-incompat').onclick = async () => {
    const res = await table!.actions.replaceDerivedColumn('tip_pct', {
      kind: 'expression',
      name: 'tip_pct',
      expression: 'CAST(tip_amount AS VARCHAR)',
    });
    if (!res.success) {
      const details = res.error.details as
        | { dependentsAffected?: string[]; reasons?: Record<string, string> }
        | undefined;
      const affected = details?.dependentsAffected ?? [];
      const reasons = details?.reasons ?? {};
      const reasonsText = affected
        .map((name) => `  • ${name}: ${reasons[name] ?? '(no reason)'}`)
        .join('\n');
      alert(
        `Replace blocked (${res.error.code}):\n` +
          `${res.error.message}\n\n` +
          `Affected dependents:\n${reasonsText || '  (none)'}`,
      );
    }
  };
})();

window.addEventListener('beforeunload', () => void table?.destroy());
