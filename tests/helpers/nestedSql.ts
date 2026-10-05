/**
 * Nested columns that only SQL can make: the companions of the nested stress
 * fixture (tests/fixtures/datasets/nested-stress-tests.*). Parquet written by
 * pyarrow and JSON read by DuckDB never hold an ARRAY, a UNION, an INTERVAL
 * inside a list, a VARIANT or a MAP with nested keys, so each of those is an
 * expression here instead.
 *
 * Each `sql(id)` is a deterministic scalar expression in terms of an integer
 * row-id expression, with NULL in some rows, so the same text works three
 * ways: over `range` in a scratch table, over `"id"` in
 * {@link createSqlOnlyTable}, and as a derived column over the fixture in the
 * browser:
 *
 * @example
 * ```ts
 * for (const c of SQL_ONLY_COLUMNS) {
 *   await table.actions.addDerivedColumn({
 *     kind: 'expression',
 *     name: c.name,
 *     expression: c.sql('"id"'),
 *   });
 * }
 * ```
 *
 * `type` is the exact text DuckDB 1.5.4 DESCRIBE reports for the column.
 *
 * Engine limits these expressions work around (DuckDB 1.5.4):
 * - CASE cannot return an ARRAY ("Unimplemented type for case expression"),
 *   so the ARRAY columns cast a CASE over lists instead.
 * - A table cannot hold an unnamed STRUCT ("A table cannot be created from an
 *   unnamed struct"); a view or a query result can. That column has
 *   `inTable: false`, and {@link createSqlOnlyView} adds it.
 * - A VARIANT value cannot cross Arrow ("Unsupported Arrow type VARIANT"), so
 *   `SELECT *` over a relation holding one fails; DESCRIBE and aggregates work.
 */
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { quoteIdentifier } from '@/worker/loaders/common';

/** One SQL-only nested column. */
export interface SqlOnlyColumn {
  /** Column name; distinct from every column of both fixture files. */
  name: string;
  /** The type DuckDB's DESCRIBE reports for it, exactly. */
  type: string;
  /** A scalar expression over the integer row-id expression `id`, such as `'"id"'`. */
  sql: (id: string) => string;
  /** `false` when a DuckDB table cannot hold the type, only a view. */
  inTable?: false;
}

/** NULL in every seventh row (ids 6, 13, 20, ...), else `value`. */
function nullEvery7(id: string, value: string): string {
  return `CASE WHEN (${id}) % 7 = 6 THEN NULL ELSE ${value} END`;
}

const UNION_PAIR = 'UNION(i INTEGER, s VARCHAR)';
const UNION_NESTED = 'UNION(l INTEGER[], st STRUCT(a INTEGER, b VARCHAR))';

/** The companions, in the order {@link createSqlOnlyTable} creates them. */
export const SQL_ONLY_COLUMNS: readonly SqlOnlyColumn[] = [
  {
    // The same text, '0', from different members: CAST(… AS VARCHAR) loses
    // the tag, to_json keeps it ({"i":0} against {"s":"0"}).
    name: 'union_pair',
    type: UNION_PAIR,
    sql: (id) =>
      `CASE WHEN (${id}) % 7 = 6 THEN NULL WHEN (${id}) % 2 = 0 ` +
      `THEN CAST(union_value(i := 0) AS ${UNION_PAIR}) ` +
      `ELSE CAST(union_value(s := '0') AS ${UNION_PAIR}) END`,
  },
  {
    name: 'union_nested',
    type: UNION_NESTED,
    sql: (id) => {
      const list = `union_value(l := [CAST(${id} AS INTEGER), NULL])`;
      const struct = `union_value(st := {'a': CAST(${id} AS INTEGER), 'b': 'x' || (${id})})`;
      return (
        `CASE WHEN (${id}) % 7 = 6 THEN NULL WHEN (${id}) % 2 = 0 ` +
        `THEN CAST(${list} AS ${UNION_NESTED}) ELSE CAST(${struct} AS ${UNION_NESTED}) END`
      );
    },
  },
  {
    // The ARRAY columns cast a CASE over lists: CASE cannot return an ARRAY.
    name: 'int_array3',
    type: 'INTEGER[3]',
    sql: (id) => {
      const third = `CASE WHEN (${id}) % 3 = 0 THEN NULL ELSE (${id}) * 3 END`;
      return `CAST(${nullEvery7(id, `[${id}, (${id}) * 2, ${third}]`)} AS INTEGER[3])`;
    },
  },
  {
    // Embedding-like: 768 values of sin, different in every row.
    name: 'embedding768',
    type: 'FLOAT[768]',
    sql: (id) => {
      const values = `list_transform(range(768), lambda k: sin((${id}) * 768 + k))`;
      return `CAST(${nullEvery7(id, values)} AS FLOAT[768])`;
    },
  },
  {
    // A list of fixed-size pairs; empty when id % 4 = 0.
    name: 'int_pairs',
    type: 'INTEGER[2][]',
    sql: (id) => {
      const pairs = `list_transform(range((${id}) % 4), lambda k: [${id}, k])`;
      return `CAST(${nullEvery7(id, pairs)} AS INTEGER[2][])`;
    },
  },
  {
    name: 'intervals',
    type: 'INTERVAL[]',
    sql: (id) =>
      nullEvery7(
        id,
        `[to_days(CAST((${id}) % 400 AS INTEGER)), to_months(CAST((${id}) % 30 AS INTEGER)), ` +
          `to_microseconds((${id}) * 1000003), ` +
          `CASE WHEN (${id}) % 3 = 0 THEN NULL ELSE INTERVAL 1 YEAR + to_hours((${id}) % 48) END]`,
      ),
  },
  {
    // HUGEINT max and min, and UHUGEINT max, in alternating rows.
    name: 'huge_struct',
    type: 'STRUCT(h HUGEINT, u UHUGEINT)',
    sql: (id) =>
      nullEvery7(
        id,
        `{'h': CASE (${id}) % 3 ` +
          `WHEN 0 THEN CAST('170141183460469231731687303715884105727' AS HUGEINT) ` +
          `WHEN 1 THEN CAST('-170141183460469231731687303715884105728' AS HUGEINT) ` +
          `ELSE CAST(${id} AS HUGEINT) * CAST('100000000000000000000000' AS HUGEINT) END, ` +
          `'u': CASE WHEN (${id}) % 2 = 0 ` +
          `THEN CAST('340282366920938463463374607431768211455' AS UHUGEINT) ` +
          `ELSE CAST(${id} AS UHUGEINT) END}`,
      ),
  },
  {
    // Enum members holding a comma and a quote, which the type text must escape.
    name: 'enum_struct',
    type: "STRUCT(e ENUM('x', 'y,z', 'it''s'), n INTEGER)",
    sql: (id) =>
      nullEvery7(
        id,
        `{'e': CAST(CASE (${id}) % 3 WHEN 0 THEN 'x' WHEN 1 THEN 'y,z' ELSE 'it''s' END ` +
          `AS ENUM('x', 'y,z', 'it''s')), 'n': CAST(${id} AS INTEGER)}`,
      ),
  },
  {
    name: 'bit_list',
    type: 'BIT[]',
    sql: (id) => nullEvery7(id, `[CAST(bin(${id}) AS BIT), CAST('10101010' AS BIT), NULL]`),
  },
  {
    // A number, text, a list, a struct, or NULL (ids 4, 9, 14, ...).
    name: 'variant_value',
    type: 'VARIANT',
    sql: (id) =>
      `CASE (${id}) % 5 ` +
      `WHEN 0 THEN CAST(${id} AS VARIANT) ` +
      `WHEN 1 THEN CAST('text ' || (${id}) AS VARIANT) ` +
      `WHEN 2 THEN CAST([${id}, NULL] AS VARIANT) ` +
      `WHEN 3 THEN CAST({'k': ${id}, 's': 'v'} AS VARIANT) ` +
      `ELSE NULL END`,
  },
  {
    name: 'variant_list',
    type: 'VARIANT[]',
    sql: (id) => {
      const text = `CAST('s' || (${id}) AS VARIANT)`;
      return nullEvery7(id, `[CAST(${id} AS VARIANT), ${text}, NULL]`);
    },
  },
  {
    name: 'variant_struct',
    type: 'STRUCT(k VARIANT)',
    sql: (id) =>
      nullEvery7(
        id,
        `{'k': CASE WHEN (${id}) % 2 = 0 THEN CAST(${id} AS VARIANT) ` +
          `ELSE CAST('v' || (${id}) AS VARIANT) END}`,
      ),
  },
  {
    name: 'struct_key_map',
    type: 'MAP(STRUCT(k INTEGER), VARCHAR)',
    sql: (id) =>
      nullEvery7(
        id,
        `map([{'k': CAST(${id} AS INTEGER)}, {'k': CAST((${id}) + 1 AS INTEGER)}], ` +
          `['a' || (${id}), 'b' || (${id})])`,
      ),
  },
  {
    name: 'list_key_map',
    type: 'MAP(INTEGER[], BIGINT)',
    sql: (id) =>
      nullEvery7(
        id,
        `map([[CAST(${id} AS INTEGER)], [CAST(${id} AS INTEGER), 0]], [${id}, (${id}) * 2])`,
      ),
  },
  {
    // Fields without names: DuckDB renders the value as (1, r1).
    name: 'unnamed_struct',
    type: 'STRUCT(INTEGER, VARCHAR)',
    sql: (id) => nullEvery7(id, `row(CAST(${id} AS INTEGER), 'r' || (${id}))`),
    inTable: false,
  },
];

/**
 * Create table `tableName` with `rows` rows: `__rowid__` (BIGINT, 0-based and
 * first, as the loaders synthesize it), `id` (equal to it, as in the
 * fixture), then each companion a table can hold, in
 * {@link SQL_ONLY_COLUMNS} order.
 *
 * `SELECT *` on the table fails because it holds VARIANT columns; select the
 * other columns by name, or read them as text.
 */
export async function createSqlOnlyTable(
  conn: AsyncDuckDBConnection,
  tableName: string,
  rows: number,
): Promise<void> {
  const id = quoteIdentifier('id');
  const columns = SQL_ONLY_COLUMNS.filter((c) => c.inTable !== false).map(
    (c) => `${c.sql(id)} AS ${quoteIdentifier(c.name)}`,
  );
  await conn.query(
    `CREATE OR REPLACE TABLE ${quoteIdentifier(tableName)} AS ` +
      `SELECT "__rowid__", ${id}, ${columns.join(', ')} ` +
      `FROM (SELECT CAST(range AS BIGINT) AS "__rowid__", CAST(range AS BIGINT) AS ${id} ` +
      `FROM range(${Math.floor(rows)}))`,
  );
}

/**
 * Create view `viewName` over a table {@link createSqlOnlyTable} made: its
 * columns, plus the companions a table cannot hold, so the view has every
 * companion in {@link SQL_ONLY_COLUMNS} order.
 */
export async function createSqlOnlyView(
  conn: AsyncDuckDBConnection,
  viewName: string,
  tableName: string,
): Promise<void> {
  const id = quoteIdentifier('id');
  const columns = SQL_ONLY_COLUMNS.map((c) =>
    c.inTable === false ? `${c.sql(id)} AS ${quoteIdentifier(c.name)}` : quoteIdentifier(c.name),
  );
  await conn.query(
    `CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS ` +
      `SELECT "__rowid__", ${id}, ${columns.join(', ')} FROM ${quoteIdentifier(tableName)}`,
  );
}
