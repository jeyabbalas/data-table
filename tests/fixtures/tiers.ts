/**
 * Parametric dataset tiers for the large-scale plan (`plans/scaling/`).
 *
 * Every tier is one **column-class cycle** (`c % 20`) repeated across
 * `cols` columns named `col_0 … col_<cols-1>`, generated over
 * `FROM range(0, rows) t(i)` so the source row index `i` is 0-based. The
 * parquet loader injects `CAST(row_number() OVER () - 1 AS BIGINT) AS
 * __rowid__` (`src/worker/loaders/parquet.ts:92`), and every triggered
 * type-conversion rewrite carries `ORDER BY "__rowid__"`
 * (`src/worker/loaders/common.ts:321,378,431`), so after a
 * generate → parquet → `loadData` round trip `__rowid__ === i` holds — the
 * *row oracle*. `cellOracle(i, c, seed)` is the *column oracle*: the
 * canonical value of any cell, as a pure function of its coordinates.
 *
 * Class 15/16/17 emit **strings** shaped to satisfy the loader's
 * timestamp / date / time matchers (`common.ts:63-129`, 0.95 match ratio
 * over `SELECT DISTINCT … LIMIT 100`), so a parquet load runs all three
 * detection passes and all three full-table rewrites — the exact load-path
 * hazard Phase 1 fixes. Classes 18/19 are already native TIMESTAMP /
 * BOOLEAN, so they cost no probes but are still physically rewritten by
 * every triggered pass.
 *
 * | Class | DuckDB type (generated) | After a parquet load |
 * | ----- | ----------------------- | -------------------- |
 * | 0     | INTEGER (`i`, row oracle) | INTEGER            |
 * | 1–9   | DOUBLE, ~1% NULL        | DOUBLE               |
 * | 10–11 | INTEGER                 | INTEGER              |
 * | 12–14 | VARCHAR (cardinality 26) | VARCHAR             |
 * | 15    | VARCHAR (ISO timestamp) | **TIMESTAMP**        |
 * | 16    | VARCHAR (ISO date)      | **DATE**             |
 * | 17    | VARCHAR (24h time)      | **TIME**             |
 * | 18    | TIMESTAMP               | TIMESTAMP            |
 * | 19    | BOOLEAN                 | BOOLEAN              |
 *
 * Nothing here is ever committed as data — tiers are generated on demand
 * (README §6). New scale work belongs in this file, not in
 * `./generators.ts`.
 */

/** One named synthetic dataset shape. */
export interface TierSpec {
  /** Stable identifier — also the `?gen=` value and baseline file stem. */
  readonly name: string;
  readonly rows: number;
  readonly cols: number;
  /** Folded into every cell expression as an additive term. */
  readonly seed: number;
}

/** Keys of {@link TIERS}. */
export type TierName = 'wide-ci' | 'wide' | 'wide-csv' | 'grid' | 'deep' | 'target';

/**
 * The canonical tiers (README §6). WIDE / GRID / DEEP deliberately share a
 * ~100M-cell budget with different aspect ratios, so a fix on one axis can
 * be shown not to regress the other.
 */
export const TIERS: Readonly<Record<TierName, TierSpec>> = {
  'wide-ci': { name: 'wide-ci', rows: 20_000, cols: 300, seed: 1 },
  wide: { name: 'wide', rows: 100_000, cols: 1_000, seed: 2 },
  'wide-csv': { name: 'wide-csv', rows: 5_000, cols: 1_000, seed: 3 },
  grid: { name: 'grid', rows: 500_000, cols: 200, seed: 4 },
  deep: { name: 'deep', rows: 5_000_000, cols: 20, seed: 5 },
  target: { name: 'target', rows: 5_000_000, cols: 1_000, seed: 6 },
};

/** Length of the column-class cycle. */
export const CLASS_CYCLE = 20;

/**
 * Classes whose rendered DOM text is a byte-exact function of
 * `cellOracle`. The injected `dtCellOracle` returns `null` — "skip this
 * cell" — for everything else.
 *
 * **Every class except 15 and 18**, established by census against a real
 * 300-column mount (`tiers.smoke.spec.ts` logs it, and asserts every class
 * listed here still matches). Integers, doubles, letters, dates, times and
 * booleans all round-trip exactly through `CellRenderer.formatValue`
 * (`src/table/Cell.ts:114-197`), including its locale grouping and its
 * scientific-notation thresholds, which `dtCellOracle` mirrors.
 *
 * 15 and 18 are the two TIMESTAMP classes. `formatTimestampCore`
 * (`Cell.ts:306-315`) trims trailing zeros with
 * `/(\.\d*)0+$/` → `'$1'`, whose greedy `\d*` leaves `…:16.00` rather than
 * `…:16` for a whole-second timestamp. That is a pre-existing rendering
 * quirk, not something Phase 0 may fix (its scope is measurement only), so
 * the two classes stay out of the text oracle and the quirk is recorded in
 * `plans/scaling/STATUS.md` for a later phase to decide on.
 */
export const TEXT_COMPARABLE_CLASSES: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19,
];

/** How many leading TARGET columns carry the oracle-checkable class cycle. */
export const TARGET_PROBE_COLUMNS = 16;

/** Default parquet row-group size for {@link targetCopySQL}. */
export const TARGET_ROW_GROUP_SIZE = 30_720;

/** Column name for index `c`. */
export function columnName(c: number): string {
  return `col_${c}`;
}

/** Class index for column `c`. */
export function columnClass(c: number): number {
  return c % CLASS_CYCLE;
}

/**
 * DuckDB `DESCRIBE` type for column `c` **as generated** by
 * {@link tierTableSQL} — before any loader type detection runs.
 */
export function classDuckDBType(c: number): string {
  const k = columnClass(c);
  if (k === 0 || k === 10 || k === 11) return 'INTEGER';
  if (k <= 9) return 'DOUBLE';
  if (k <= 17) return 'VARCHAR';
  if (k === 18) return 'TIMESTAMP';
  return 'BOOLEAN';
}

/**
 * DuckDB `DESCRIBE` type for column `c` **after** a parquet round trip
 * through the real loader, i.e. once `enhanceSchemaTypes` has converted
 * classes 15/16/17. Asserting this is what proves detection actually ran.
 */
export function classLoadedDuckDBType(c: number): string {
  const k = columnClass(c);
  if (k === 15) return 'TIMESTAMP';
  if (k === 16) return 'DATE';
  if (k === 17) return 'TIME';
  return classDuckDBType(c);
}

/**
 * The library `DataType` (`state.schema[].type`) for column `c` after a
 * parquet round trip — `mapDuckDBType` applied to
 * {@link classLoadedDuckDBType}.
 */
export function classDataType(c: number): string {
  const t = classLoadedDuckDBType(c);
  if (t === 'INTEGER') return 'integer';
  if (t === 'DOUBLE') return 'float';
  if (t === 'VARCHAR') return 'string';
  if (t === 'TIMESTAMP') return 'timestamp';
  if (t === 'DATE') return 'date';
  if (t === 'TIME') return 'time';
  return 'boolean';
}

/**
 * The canonical value of cell `(i, c)` for a tier with the given `seed`.
 *
 * **Self-contained by contract** — no imports, no closure, no references to
 * anything outside its own body. {@link ORACLE_FN_SOURCE} serializes this
 * function with `Function.prototype.toString()` so `page.evaluate`,
 * `addInitScript`, and the demo harness all run *this* implementation
 * rather than a hand-copied twin. Keep it that way; `tiers.test.ts` fails
 * loudly if the serialized copy drifts.
 *
 * Returned shapes match what `bridge.query` yields for the generated
 * table: `number` for INTEGER/DOUBLE, `string` for VARCHAR, `boolean` for
 * BOOLEAN, and **epoch milliseconds** for the native TIMESTAMP class 18
 * (duckdb-wasm surfaces TIMESTAMP as ms since epoch via `row.toJSON()`).
 * Classes 15/16/17 return the generated *string*, which is what the table
 * holds before the loader converts them.
 */
export function cellOracle(i: number, c: number, seed: number): number | string | boolean | null {
  const k = c % 20;
  if (k === 0) return i;
  if (k <= 9) {
    if ((i + c + seed) % 100 === 0) return null;
    return ((i * 31 + c * 17 + seed) % 100000) / 100;
  }
  if (k <= 11) return (i * 7 + c + seed) % 100000;
  if (k <= 14) return String.fromCharCode(65 + ((i + c + seed) % 26));
  // 2020-01-01T00:00:00Z — the anchor every temporal class counts from.
  const epoch = 1577836800000;
  if (k === 15) return new Date(epoch + ((i + c + seed) % 86400) * 1000).toISOString().slice(0, 19);
  if (k === 16) {
    return new Date(epoch + ((i + c + seed) % 3650) * 86400000).toISOString().slice(0, 10);
  }
  if (k === 17)
    return new Date(epoch + ((i + c + seed) % 86400) * 1000).toISOString().slice(11, 19);
  if (k === 18) return epoch + ((i + c + seed) % 86400) * 1000;
  return (i + c + seed) % 2 === 0;
}

/**
 * Self-contained source for the in-page oracle. Evaluate it to get
 * `dtCellOracle(i, c, seed) -> string | null`, the **rendered text** a
 * resolved cell must show, or `null` when the class is not text-comparable
 * and the caller should skip the cell:
 *
 * ```ts
 * const oracle = new Function(ORACLE_FN_SOURCE)();
 * oracle(7, 0, 1);          // '7'
 * oracle(7, 3, 1);          // null — DOUBLE rendering is formatter-dependent
 * oracle.value(7, 3, 1);    // 0.62 — the canonical value oracle
 * ```
 *
 * `dtCellOracle.value` is the serialized {@link cellOracle} itself, so a
 * consumer that needs raw values (rather than DOM text) does not need a
 * second injection. The text branch mirrors `CellRenderer.formatValue`
 * (`src/table/Cell.ts:114`): scientific notation at `|v| >= 1e6` or
 * `|v| < 0.01`, `toLocaleString()` otherwise, `'true'`/`'false'` for
 * booleans, `'null'` for NULL.
 */
export const ORACLE_FN_SOURCE: string = [
  // The one true implementation, renamed so the wrapper can call it.
  cellOracle.toString().replace(/^\s*function\s*[\w$]*/, 'function dtCellValue'),
  `var DT_TEXT_CLASSES = ${JSON.stringify(TEXT_COMPARABLE_CLASSES)};`,
  // `force` bypasses the text-comparable gate so a spec can census which
  // classes *would* render byte-exact — the evidence for widening the set.
  'function dtCellOracle(i, c, seed, force) {',
  '  var k = c % 20;',
  '  if (!force && DT_TEXT_CLASSES.indexOf(k) === -1) return null;',
  '  var v = dtCellValue(i, c, seed);',
  "  if (v === null) return 'null';",
  "  if (typeof v === 'boolean') return v ? 'true' : 'false';",
  "  if (typeof v !== 'number') return String(v);",
  '  if (!isFinite(v)) return String(v);',
  '  if (v !== 0) {',
  '    var abs = Math.abs(v);',
  '    if (abs >= 1e6 || abs < 0.01) return v.toExponential(2);',
  '  }',
  '  return k >= 1 && k <= 9',
  '    ? v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })',
  '    : v.toLocaleString();',
  '}',
  'dtCellOracle.value = dtCellValue;',
  'return dtCellOracle;',
].join('\n');

/** SQL expression producing column `c` of a tier, over `range(0, rows) t(i)`. */
function columnExpr(c: number, seed: number): string {
  const k = columnClass(c);
  // `c + seed` and `c * 17 + seed` are folded to constants so the emitted
  // SQL stays short at 1,000 columns; the arithmetic is identical to
  // `cellOracle`'s because every term is an exact integer.
  const off = c + seed;
  if (k === 0) return 'CAST(i AS INTEGER)';
  if (k <= 9) {
    return (
      `CASE WHEN (i + ${off}) % 100 = 0 THEN NULL ` +
      `ELSE CAST((i * 31 + ${c * 17 + seed}) % 100000 AS DOUBLE) / CAST(100 AS DOUBLE) END`
    );
  }
  if (k <= 11) return `CAST((i * 7 + ${off}) % 100000 AS INTEGER)`;
  if (k <= 14) return `chr(65 + CAST((i + ${off}) % 26 AS INTEGER))`;
  if (k === 15) {
    return `strftime(TIMESTAMP '2020-01-01' + INTERVAL ((i + ${off}) % 86400) SECOND, '%Y-%m-%dT%H:%M:%S')`;
  }
  if (k === 16) {
    return `strftime(DATE '2020-01-01' + INTERVAL ((i + ${off}) % 3650) DAY, '%Y-%m-%d')`;
  }
  if (k === 17) {
    return `strftime(TIMESTAMP '2020-01-01' + INTERVAL ((i + ${off}) % 86400) SECOND, '%H:%M:%S')`;
  }
  if (k === 18) return `TIMESTAMP '2020-01-01' + INTERVAL ((i + ${off}) % 86400) SECOND`;
  return `((i + ${off}) % 2 = 0)`;
}

/**
 * Run-length expression for a TARGET bulk column: 4,096-row runs over ≤50
 * distinct values, which parquet's RLE/dictionary encoding collapses to a
 * few bytes per row group. This is what keeps a 1,000 × 5,000,000 file to
 * a few hundred MB instead of tens of GB.
 */
function bulkExpr(c: number): string {
  const run = `((i + ${c * 4096}) // 4096)`;
  switch (c % 4) {
    case 0:
      return `CAST(${run} % 50 AS INTEGER)`;
    case 1:
      return `CAST(${run} % 50 AS DOUBLE) / CAST(4 AS DOUBLE)`;
    case 2:
      return `chr(65 + CAST(${run} % 26 AS INTEGER))`;
    default:
      return `(${run} % 2 = 0)`;
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * `CREATE OR REPLACE TABLE <tableName> AS SELECT …` for a tier.
 *
 * Materializes the whole tier as a DuckDB table. Callers that then want the
 * *real* load path export it to parquet and feed that to `loadData` — see
 * `tests/browser/helpers/wideTable.ts`.
 */
export function tierTableSQL(spec: TierSpec, tableName: string): string {
  const cols: string[] = [];
  for (let c = 0; c < spec.cols; c++) {
    cols.push(`${columnExpr(c, spec.seed)} AS ${quoteIdent(columnName(c))}`);
  }
  return (
    `CREATE OR REPLACE TABLE ${quoteIdent(tableName)} AS\n` +
    `SELECT ${cols.join(',\n       ')}\n` +
    `FROM range(0, ${spec.rows}) t(i)`
  );
}

/**
 * `SELECT` list for a tier, in column order — the projection
 * {@link tierTableSQL} materializes. Exposed so a caller can re-derive the
 * same columns without a table (e.g. a `read_parquet` probe).
 */
export function tierSelectList(spec: TierSpec): string {
  const cols: string[] = [];
  for (let c = 0; c < spec.cols; c++) {
    cols.push(`${columnExpr(c, spec.seed)} AS ${quoteIdent(columnName(c))}`);
  }
  return cols.join(', ');
}

/**
 * Streamed `COPY (…) TO '<fileName>' (FORMAT PARQUET, ROW_GROUP_SIZE …)`
 * for the TARGET tier — the only route to 1,000 × 5,000,000, since that
 * many cells can never be materialized inside DuckDB-WASM's 4 GB ceiling
 * (README §3).
 *
 * The first {@link TARGET_PROBE_COLUMNS} columns carry the ordinary class
 * cycle so {@link cellOracle} still describes them exactly (Phase 10's deep
 * window fetch asserts against them); everything after is a
 * {@link bulkExpr} run-length column. Nothing is materialized: DuckDB
 * streams `range()` straight into the parquet writer, one row group at a
 * time, which is why `ROW_GROUP_SIZE` is the first knob to turn if the
 * write runs out of memory.
 */
export function targetCopySQL(
  spec: TierSpec,
  fileName = 'dt_target.parquet',
  rowGroupSize: number = TARGET_ROW_GROUP_SIZE,
): string {
  const cols: string[] = [];
  for (let c = 0; c < spec.cols; c++) {
    const expr = c < TARGET_PROBE_COLUMNS ? columnExpr(c, spec.seed) : bulkExpr(c);
    cols.push(`${expr} AS ${quoteIdent(columnName(c))}`);
  }
  return (
    `COPY (SELECT ${cols.join(', ')} FROM range(0, ${spec.rows}) t(i)) ` +
    `TO '${fileName}' (FORMAT PARQUET, ROW_GROUP_SIZE ${rowGroupSize})`
  );
}

/** Serialize one oracle value into a CSV field. */
function csvCell(value: number | string | boolean | null, c: number): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  // Class 18 is a native TIMESTAMP; the oracle carries epoch ms, so the CSV
  // needs a text form `read_csv_auto` will sniff back to TIMESTAMP.
  if (columnClass(c) === 18) {
    return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
  }
  return String(value);
}

/**
 * The tier as CSV text, built in JS — the text-format load path.
 *
 * Bounded on purpose: `wide-csv` (1,000 × 5,000) is ≈ 40 MB, which a
 * browser can hold as one string. Do not call this for `wide` or anything
 * deeper.
 *
 * Note the types will **not** match {@link classDuckDBType}:
 * `read_csv_auto` sniffs ISO timestamps and dates natively
 * (`src/worker/loaders/csv.ts`), so classes 15/16 arrive already typed and
 * the loader's three detection passes do not all fire. The "all three
 * rewrites" claim is about the parquet path.
 */
export function tierCSV(spec: TierSpec): string {
  const header: string[] = [];
  for (let c = 0; c < spec.cols; c++) header.push(columnName(c));
  const out: string[] = [header.join(',')];
  const row = new Array<string>(spec.cols);
  for (let i = 0; i < spec.rows; i++) {
    for (let c = 0; c < spec.cols; c++) row[c] = csvCell(cellOracle(i, c, spec.seed), c);
    out.push(row.join(','));
  }
  return out.join('\n') + '\n';
}

/**
 * Resolve a `?gen=` / CLI tier argument into a spec, applying `rows` /
 * `cols` / `seed` overrides. `custom` requires both `rows` and `cols`.
 *
 * @throws Error with a human-readable message on an unknown tier or a
 *   missing/invalid override — callers surface it rather than throwing at
 *   the user.
 */
export function resolveTier(
  name: string,
  overrides: {
    rows?: number | undefined;
    cols?: number | undefined;
    seed?: number | undefined;
  } = {},
): TierSpec {
  const base =
    name === 'custom' ? { name: 'custom', rows: NaN, cols: NaN, seed: 0 } : TIERS[name as TierName];
  if (!base) {
    throw new Error(
      `Unknown tier "${name}". Expected one of: ${Object.keys(TIERS).join(', ')}, custom.`,
    );
  }
  const rows = overrides.rows ?? base.rows;
  const cols = overrides.cols ?? base.cols;
  const seed = overrides.seed ?? base.seed;
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new Error(`Tier "${name}": rows must be a positive integer (got ${String(rows)}).`);
  }
  if (!Number.isInteger(cols) || cols <= 0) {
    throw new Error(`Tier "${name}": cols must be a positive integer (got ${String(cols)}).`);
  }
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error(`Tier "${name}": seed must be a non-negative integer (got ${String(seed)}).`);
  }
  return { name: base.name, rows, cols, seed };
}
