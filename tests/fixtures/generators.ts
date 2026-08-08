/**
 * Test data generators for performance benchmarks.
 *
 * Uses DuckDB's `generate_series()` to create tables directly in the
 * database, avoiding the overhead of generating and parsing CSV strings.
 *
 * **New scale work belongs in `./tiers.ts`, not here.** These builders use
 * `random()`, so no cell oracle is possible and nothing they produce can be
 * asserted against. `tiers.ts` defines the named tiers of
 * `plans/scaling/README.md` §6 with a deterministic `cellOracle(i, c, seed)`
 * for every cell. This file stays only because the existing perf suite
 * references `generateTableSQL`.
 */

/**
 * Generate SQL to create a table with mixed column types.
 *
 * Columns: id (INTEGER), val1..val3 (DOUBLE), cat1 (VARCHAR),
 * bool1 (BOOLEAN), date1 (DATE), ts1 (TIMESTAMP).
 */
export function generateTableSQL(tableName: string, rows: number): string {
  return `CREATE OR REPLACE TABLE ${tableName} AS
SELECT
  i AS id,
  random() AS val1,
  random() * 1000 AS val2,
  random() * 100 - 50 AS val3,
  'category_' || (i % 100)::VARCHAR AS cat1,
  (i % 2 = 0) AS bool1,
  DATE '2020-01-01' + INTERVAL (i % 3650) DAY AS date1,
  TIMESTAMP '2020-01-01' + INTERVAL (i * 37) SECOND AS ts1
FROM generate_series(1, ${rows}) t(i)`;
}

/**
 * Generate SQL to create a wide table with many numeric columns.
 *
 * Creates `numColumns` columns: id + (numColumns - 1) random DOUBLE columns.
 */
export function generateWideTableSQL(tableName: string, rows: number, numColumns: number): string {
  const cols = ['i AS id'];
  for (let c = 1; c < numColumns; c++) {
    cols.push(`random() AS col_${c}`);
  }
  return `CREATE OR REPLACE TABLE ${tableName} AS
SELECT ${cols.join(',\n  ')}
FROM generate_series(1, ${rows}) t(i)`;
}
