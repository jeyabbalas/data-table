/**
 * Exports of nested columns on real DuckDB: CSV (and with it the TSV the
 * clipboard copies), JSON and Parquet.
 *
 * CSV and JSON exports read a nested column as its exact JSON text
 * (`jsonValueSQL`), never as the values Arrow returns for it: DECIMAL,
 * HUGEINT and INTERVAL inside a nested value arrive wrong that way, and a
 * VARIANT not at all. A CSV cell is that text made standard JSON, a JSON
 * export holds the value as a real structure, and a Parquet export writes
 * every column as it is. INTERVAL, BLOB, BIT, GEOMETRY, BIGNUM and ENUM
 * columns are read as DuckDB's text.
 *
 * Rows are read with the worker's own query function,
 * `executeQueryCancellable`, which every `bridge.query` runs: the path on
 * which an ENUM value comes back null.
 *
 * Tables: the two nested fixtures, loaded by the library's loaders, and a
 * view over the SQL-only companions (UNION, ARRAY, INTERVAL[], VARIANT, MAP
 * with nested keys, an unnamed STRUCT). A table with derived columns is
 * exported from a view too.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseDuckDBType } from '@/core/duckdbType';
import { materialize, parseJsonTree, toStandardJson } from '@/core/jsonTree';
import { ROWID_COLUMN, type ColumnSchema, type Filter, type SortColumn } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { jsonValueSQL } from '@/data/valueSql';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { exportToCSV, neutralizeFormulaPrefix } from '@/export/CSVExport';
import { exportColumnRead, type ExportContext } from '@/export/ExportQuery';
import { exportToJSON } from '@/export/JSONExport';
import { exportToParquet } from '@/export/ParquetExport';
import { filtersToWhereClause, quoteIdentifier } from '@/filters/FilterSQL';
import { __setConnForTests, executeQueryCancellable } from '@/worker/duckdb';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { loadNestedFixture, SHOWCASE } from '../helpers/nestedFixture';
import { createSqlOnlyTable, createSqlOnlyView, SQL_ONLY_COLUMNS } from '../helpers/nestedSql';
import { makeNodeBridge } from '../helpers/nodeBridge';

/** Rows of the SQL-only companions: each `id % n` case of theirs, many times over. */
const SQL_ONLY_ROWS = 70;

/** A table to export, with the schema the library holds for it. */
interface ExportTable {
  name: string;
  schema: ColumnSchema[];
}

type TableKey = 'parquet' | 'json' | 'sqlOnly';

const TABLE_KEYS: readonly TableKey[] = ['parquet', 'json', 'sqlOnly'];

let harness: NodeDuckDBHarness;
/** The real loaders and COPY, with queries through `executeQueryCancellable`. */
let bridge: WorkerBridge;
const tables = new Map<TableKey, ExportTable>();

function table(key: TableKey): ExportTable {
  const found = tables.get(key);
  if (!found) throw new Error(`table ${key} not loaded`);
  return found;
}

/** Run `sql` directly on the connection: the oracle side of every check. */
async function select<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const result = await harness.conn.query(sql);
  return result.toArray().map((row) => row.toJSON() as T);
}

/** The schema the library builds for a table, from DESCRIBE, as the loaders do. */
async function describeSchema(name: string): Promise<ColumnSchema[]> {
  const rows = await select<{ column_name: string; column_type: string; null: string }>(
    `DESCRIBE ${quoteIdentifier(name)}`,
  );
  return rows.map((row) => {
    const entry: ColumnSchema = {
      name: row.column_name,
      type: mapDuckDBType(row.column_type),
      nullable: row.null === 'YES',
      originalType: row.column_type,
    };
    if (row.column_name === ROWID_COLUMN) entry.system = true;
    return entry;
  });
}

function nestedColumns(t: ExportTable): ColumnSchema[] {
  return t.schema.filter((column) => column.type === 'nested');
}

function contextFor(t: ExportTable, overrides: Partial<ExportContext> = {}): ExportContext {
  return {
    bridge,
    filters: [],
    sortColumns: [],
    selectedRows: new Set<number>(),
    columnOrder: t.schema.map((column) => column.name),
    schema: t.schema,
    ...overrides,
  };
}

/** Each row's exact JSON text for `column` (NULL stays null), in `__rowid__` order. */
async function jsonTexts(t: ExportTable, column: ColumnSchema): Promise<(string | null)[]> {
  const rows = await select<{ v: string | null }>(
    `SELECT ${jsonValueSQL(column, quoteIdentifier(column.name))} AS v ` +
      `FROM ${quoteIdentifier(t.name)} ORDER BY ${quoteIdentifier(ROWID_COLUMN)}`,
  );
  return rows.map((row) => row.v);
}

/** Each row's `CAST(column AS VARCHAR)`, in `__rowid__` order. */
async function castTexts(tableName: string, column: string): Promise<(string | null)[]> {
  const rows = await select<{ v: string | null }>(
    `SELECT CAST(${quoteIdentifier(column)} AS VARCHAR) AS v ` +
      `FROM ${quoteIdentifier(tableName)} ORDER BY ${quoteIdentifier(ROWID_COLUMN)}`,
  );
  return rows.map((row) => row.v);
}

/** What a JSON export holds for a nested value's JSON text. */
function exported(text: string | null, column: ColumnSchema): unknown {
  if (text === null) return null;
  const value = materialize(
    parseJsonTree(text).root,
    parseDuckDBType(column.originalType),
    'export',
  );
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/**
 * Read delimited text as the exporter writes it: RFC 4180 (a field holding
 * the delimiter, a quote or a line break is quoted, its quotes doubled),
 * lines joined by `\n`. Returns rows of fields, the header row first.
 */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  for (;;) {
    let field = '';
    if (text[i] === '"') {
      i++;
      for (;;) {
        const quote = text.indexOf('"', i);
        if (quote < 0) throw new Error('A quoted field is never closed');
        field += text.slice(i, quote);
        i = quote + 1;
        if (text[i] !== '"') break;
        field += '"';
        i++;
      }
    } else {
      let end = i;
      while (end < text.length && text[end] !== delimiter && text[end] !== '\n') end++;
      field = text.slice(i, end);
      i = end;
    }
    row.push(field);
    if (i >= text.length) {
      rows.push(row);
      return rows;
    }
    if (text[i] === '\n') {
      rows.push(row);
      row = [];
    } else if (text[i] !== delimiter) {
      throw new Error(`Unexpected ${JSON.stringify(text[i])} after a field at ${i}`);
    }
    i++;
  }
}

/** The fields of one column of parsed delimited text, header row left out. */
function columnOf(rows: string[][], name: string): string[] {
  const index = rows[0]!.indexOf(name);
  if (index < 0) throw new Error(`No column ${name}`);
  return rows.slice(1).map((row) => row[index]!);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

beforeAll(async () => {
  harness = await createNodeDuckDB();
  __setConnForTests(harness.conn);
  const nodeBridge = makeNodeBridge(harness.conn, harness.db);
  bridge = {
    ...nodeBridge,
    query: <T>(sql: string) => executeQueryCancellable<T>(sql),
  } as WorkerBridge;

  for (const format of ['parquet', 'json'] as const) {
    const loaded = await loadNestedFixture(harness, format);
    tables.set(format, { name: loaded.tableName, schema: loaded.schema });
  }
  await createSqlOnlyTable(harness.conn, 'sql_only', SQL_ONLY_ROWS);
  await createSqlOnlyView(harness.conn, 'sql_only_view', 'sql_only');
  tables.set('sqlOnly', { name: 'sql_only_view', schema: await describeSchema('sql_only_view') });
}, 120_000);

afterAll(async () => {
  __setConnForTests(null);
  await harness?.cleanup();
});

describe('the tables', () => {
  it('cover every kind of nested column, and the SQL-only view is a view', async () => {
    const kinds = new Set(
      TABLE_KEYS.flatMap((key) => nestedColumns(table(key))).map(
        (column) => parseDuckDBType(column.originalType).kind,
      ),
    );
    expect([...kinds].sort()).toEqual(['array', 'list', 'map', 'struct', 'union', 'variant']);
    expect(nestedColumns(table('sqlOnly')).map((c) => c.name)).toEqual(
      SQL_ONLY_COLUMNS.map((c) => c.name),
    );
    const [view] = await select<{ n: number }>(
      `SELECT count(*) AS n FROM duckdb_views() WHERE view_name = 'sql_only_view'`,
    );
    expect(Number(view!.n)).toBe(1);
  });
});

describe.each(TABLE_KEYS)('the %s table', (key) => {
  describe('CSV export', () => {
    let csv: string;
    let rows: string[][];

    beforeAll(async () => {
      const t = table(key);
      csv = await exportToCSV(t.name, { scope: 'all', columns: 'all' }, contextFor(t));
      rows = parseDelimited(csv, ',');
    }, 60_000);

    it('has every column but __rowid__, one line per row', async () => {
      const t = table(key);
      expect(rows[0]).toEqual(t.schema.filter((c) => !c.system).map((c) => c.name));
      const [count] = await select<{ n: number }>(
        `SELECT count(*) AS n FROM ${quoteIdentifier(t.name)}`,
      );
      expect(rows.length - 1).toBe(Number(count!.n));
    });

    it('writes each nested value as standard JSON, every digit kept', async () => {
      const t = table(key);
      for (const column of nestedColumns(t)) {
        const texts = await jsonTexts(t, column);
        const cells = columnOf(rows, column.name);
        expect(cells.length, column.name).toBe(texts.length);
        cells.forEach((cell, i) => {
          const text = texts[i]!;
          if (text === null) {
            expect(cell, `${column.name} row ${i}`).toBe('');
            return;
          }
          expect(cell, `${column.name} row ${i}`).toBe(toStandardJson(text));
          expect(() => JSON.parse(cell) as unknown, `${column.name} row ${i}`).not.toThrow();
        });
      }
    });

    it('writes JSON columns and the scalars read as text as their text', async () => {
      const t = table(key);
      const columns = t.schema.filter(
        (c) => !c.system && (c.originalType === 'JSON' || exportColumnRead(c) === 'text'),
      );
      for (const column of columns) {
        const texts = await castTexts(t.name, column.name);
        const expected = texts.map((text) => (text === null ? '' : neutralizeFormulaPrefix(text)));
        expect(columnOf(rows, column.name), column.name).toEqual(expected);
      }
    });

    it('reloads through the CSV loader with the same text in every nested column', async () => {
      const t = table(key);
      const reloaded = await bridge.loadData(csv, {
        format: 'csv',
        tableName: `csv_reload_${key}`,
      });
      for (const column of nestedColumns(t)) {
        // read_csv never infers a nested type: the JSON comes back as text.
        expect(reloaded.schema.find((c) => c.name === column.name)?.originalType).toBe('VARCHAR');
        const texts = await castTexts(reloaded.tableName, column.name);
        const expected = columnOf(rows, column.name).map((cell) => (cell === '' ? null : cell));
        expect(texts, column.name).toEqual(expected);
      }
    });
  });

  describe('JSON export', () => {
    let array: Record<string, unknown>[];

    beforeAll(async () => {
      const t = table(key);
      const json = await exportToJSON(t.name, { scope: 'all', format: 'array' }, contextFor(t));
      array = JSON.parse(json) as Record<string, unknown>[];
    }, 60_000);

    it('holds each nested value as a structure, read by its type', async () => {
      const t = table(key);
      for (const column of nestedColumns(t)) {
        const texts = await jsonTexts(t, column);
        expect(array.length).toBe(texts.length);
        texts.forEach((text, i) => {
          expect(array[i]![column.name], `${column.name} row ${i}`).toEqual(exported(text, column));
        });
      }
    });

    it('keeps JSON columns as their text', async () => {
      const t = table(key);
      for (const column of t.schema.filter((c) => c.originalType === 'JSON')) {
        const texts = await castTexts(t.name, column.name);
        expect(
          array.map((row) => row[column.name]),
          column.name,
        ).toEqual(texts);
      }
    });

    it('writes the same rows as NDJSON, and pretty-printed', async () => {
      const t = table(key);
      const ndjson = await exportToJSON(t.name, { scope: 'all', format: 'ndjson' }, contextFor(t));
      const lines = ndjson.split('\n');
      expect(lines).toHaveLength(array.length);
      expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual(array);
      const pretty = await exportToJSON(
        t.name,
        { scope: 'all', format: 'array', pretty: true },
        contextFor(t),
      );
      expect(JSON.parse(pretty)).toEqual(array);
    });
  });
});

describe('JSON export values', () => {
  async function exportRows(key: TableKey): Promise<Record<string, unknown>[]> {
    const t = table(key);
    const json = await exportToJSON(t.name, { scope: 'all', format: 'array' }, contextFor(t));
    return JSON.parse(json) as Record<string, unknown>[];
  }

  it('Parquet fixture: decimals, integers past 2^53 as strings, NaN and ±Infinity as null', async () => {
    const rows = await exportRows('parquet');
    const row = rows[SHOWCASE.NUMERIC_EXTREMES]!;
    expect(row['decimals']).toEqual([1.25, 2.5, 3.75]);
    expect(row['big_ints']).toEqual([
      9007199254740991,
      '9007199254740993',
      '-9223372036854775808',
      '9223372036854775807',
    ]);
    expect(row['ubig']).toEqual([0, '9007199254740993', '18446744073709551615']);
    expect(row['doubles']).toEqual([
      null,
      null,
      null,
      0,
      5e-324,
      1.7976931348623157e308,
      -1.7976931348623157e308,
      0.1,
    ]);
    // FLOAT values arrive widened, as Math.fround gives them.
    expect((row['embedding'] as unknown[]).slice(0, 5)).toEqual([
      null,
      null,
      null,
      0,
      Math.fround(1.401298464324817e-45),
    ]);
    expect(rows[SHOWCASE.NULL_ELEMENTS]!['decimals']).toEqual([1, null, -2.5]);
  });

  it('Parquet fixture: struct fields and map keys that name JavaScript members are plain keys', async () => {
    const rows = await exportRows('parquet');
    const odd = rows[SHOWCASE.DEMO]!['odd_names'] as Record<string, unknown>;
    expect(Object.getPrototypeOf(odd)).toBe(Object.prototype);
    expect(Object.keys(odd)).toHaveLength(26);
    for (const name of [
      '__proto__',
      'constructor',
      'toJSON',
      'hasOwnProperty',
      'my field',
      'x,y',
    ]) {
      expect(Object.hasOwn(odd, name), name).toBe(true);
    }
    expect(odd['__proto__']).toBe('not a prototype');
    expect(odd['constructor']).toBe('not a class');
    expect(odd['quote"d']).toBe('quoted');
    const extremes = rows[SHOWCASE.NUMERIC_EXTREMES]!['odd_names'] as Record<string, unknown>;
    expect(extremes['nanoseconds']).toBe('-9223372036854775808');
    expect(extremes['ID']).toBe('9223372036854775807');
    expect(extremes['size']).toBe(2147483647);

    // A MAP is an object keyed by each key's text.
    const attrs = rows[SHOWCASE.NAME_COLLISIONS]!['attrs'] as Record<string, unknown>;
    expect(Object.hasOwn(attrs, '__proto__')).toBe(true);
    expect(attrs).toEqual(
      Object.fromEntries([
        ['size', 1],
        ['toJSON', 2],
        ['constructor', 3],
        ['__proto__', 4],
        ['2', 5],
        ['1', 6],
        ['k=v', 7],
        ['k_v', 8],
        ['K_V', 9],
      ]),
    );
    expect(rows[SHOWCASE.DEMO]!['int_keys']).toEqual({ '1': 'one', '2': 'two', '10': 'ten' });
    expect(rows[SHOWCASE.DATE_BINARY_EDGES]!['date_keys']).toEqual({
      '0001-01-01': [1],
      '9999-12-31': [2, 3],
      '1970-01-01': [],
      '1969-07-20': null,
    });
  });

  it('Parquet fixture: temporal, UUID and BLOB leaves are DuckDB text; JSON stays text', async () => {
    const rows = await exportRows('parquet');
    const leaves = rows[SHOWCASE.DEMO]!['typed_leaves'] as Record<string, unknown>;
    expect(leaves).toMatchObject({
      uuid: '12345678-1234-5678-1234-567812345678',
      blob: 'hello',
      time: '09:30:00',
      ts: '2024-01-01 09:30:00',
      tstz: '2024-01-01 09:30:00+00',
      date: '2024-01-01',
      flag: true,
      f32: Math.fround(0.1),
      i64: '9007199254740993',
    });
    expect(typeof rows[SHOWCASE.DEMO]!['doc']).toBe('string');
    expect(JSON.parse(rows[SHOWCASE.DEMO]!['doc'] as string)).toMatchObject({ k: 'alpha' });
    const strings = rows[SHOWCASE.TEXT_ESCAPES]!['strings_edge'] as string[];
    expect(strings.slice(0, 11)).toEqual([
      "it's",
      '"dq"',
      'a, b',
      '[x]',
      'k=v',
      'NULL',
      '',
      "''",
      '\\',
      'line\nbreak',
      'tab\there',
    ]);
  });

  it('JSON fixture: HUGEINT and BIGINT lists keep their digits', async () => {
    const rows = await exportRows('json');
    const row = rows[SHOWCASE.NUMERIC_EXTREMES]!;
    expect(row['huge']).toEqual(['9223372036854775808', '18446744073709551615']);
    expect(row['signed']).toEqual(['-9223372036854775808', -1, 0, '9223372036854775807']);
    expect(row['counts']).toEqual([0, 9007199254740991, '9007199254740993', '9223372036854775807']);
    expect(rows[SHOWCASE.DEMO]!['key_order']).toEqual({ '2': 2, '1': 1 });
  });

  it('SQL-only columns: union tags, unnamed structs, VARIANT, maps with nested keys', async () => {
    const rows = await exportRows('sqlOnly');
    const byId = (id: number): Record<string, unknown> => rows[id]!;
    expect(byId(0)['union_pair']).toEqual({ i: 0 });
    expect(byId(1)['union_pair']).toEqual({ s: '0' });
    expect(byId(6)['union_pair']).toBeNull();
    expect(byId(2)['union_nested']).toEqual({ l: [2, null] });
    expect(byId(3)['union_nested']).toEqual({ st: { a: 3, b: 'x3' } });
    expect(byId(3)['unnamed_struct']).toEqual([3, 'r3']);
    expect(byId(0)['huge_struct']).toEqual({
      h: '170141183460469231731687303715884105727',
      u: '340282366920938463463374607431768211455',
    });
    expect(byId(1)['huge_struct']).toEqual({ h: '-170141183460469231731687303715884105728', u: 1 });
    expect(byId(1)['enum_struct']).toEqual({ e: 'y,z', n: 1 });
    expect(byId(5)['bit_list']).toEqual(['101', '10101010', null]);
    expect(byId(3)['int_array3']).toEqual([3, 6, null]);
    expect(byId(2)['intervals']).toEqual([
      '2 days',
      '2 months',
      '00:00:02.000006',
      '1 year 02:00:00',
    ]);
    expect(byId(0)['variant_value']).toBe(0);
    expect(byId(1)['variant_value']).toBe('text 1');
    expect(byId(2)['variant_value']).toEqual([2, null]);
    expect(byId(3)['variant_value']).toEqual({ k: 3, s: 'v' });
    expect(byId(4)['variant_value']).toBeNull();
    expect(byId(1)['variant_list']).toEqual([1, 's1', null]);
    expect(byId(1)['variant_struct']).toEqual({ k: 'v1' });
    expect(byId(2)['variant_struct']).toEqual({ k: 2 });
    expect(byId(1)['struct_key_map']).toEqual({ "{'k': 1}": 'a1', "{'k': 2}": 'b1' });
    expect(byId(1)['list_key_map']).toEqual({ '[1]': 1, '[1, 0]': 2 });
  });
});

describe('scalars read as text', () => {
  let t: ExportTable;

  beforeAll(async () => {
    await harness.conn.query(
      `CREATE OR REPLACE TABLE scalar_texts AS SELECT
         CAST(range AS BIGINT) AS "__rowid__",
         CAST(range AS BIGINT) AS id,
         CAST(CASE range % 3 WHEN 0 THEN 'a' WHEN 1 THEN 'b,c' END AS ENUM('a', 'b,c')) AS e,
         to_days(CAST(range AS INTEGER)) + to_microseconds(range * 1500) AS iv,
         CASE WHEN range % 2 = 0 THEN '\\xAA\\x00'::BLOB ELSE CAST('-x' AS BLOB) END AS b,
         CAST(bin(range + 1) AS BIT) AS bits,
         CAST('POINT(' || range || ' 2)' AS GEOMETRY) AS g,
         CAST('-1' || repeat('0', 30) AS BIGNUM) AS big,
         CAST(CAST(-range - 1 AS VARCHAR) AS JSON) AS j,
         CAST(-range - 1 AS VARIANT) AS v
       FROM range(4)`,
    );
    t = { name: 'scalar_texts', schema: await describeSchema('scalar_texts') };
  });

  it('reads INTERVAL, BLOB, BIT, GEOMETRY, BIGNUM and ENUM as text, JSON as it is', () => {
    expect(Object.fromEntries(t.schema.map((c) => [c.name, exportColumnRead(c)]))).toEqual({
      __rowid__: 'raw',
      id: 'raw',
      e: 'text',
      iv: 'text',
      b: 'text',
      bits: 'text',
      g: 'text',
      big: 'text',
      j: 'raw',
      v: 'json',
    });
  });

  it('because Arrow, on the query path the worker uses, gets them wrong', async () => {
    // Pinned so that a duckdb-wasm or apache-arrow upgrade that reads them
    // right shows up here: the CAST could then go. An ENUM comes back right,
    // but only because the worker runs a query whose result holds one a
    // second time (see `executeQueryCancellable`); read as text, it runs once.
    const [row] = await executeQueryCancellable<Record<string, unknown>>(
      'SELECT e, iv, b, big FROM scalar_texts WHERE id = 0',
    );
    expect(row!['e']).toBe('a');
    expect(row!['iv']).toBeInstanceOf(Int32Array);
    expect(row!['b']).toBeInstanceOf(Uint8Array);
    expect(row!['big']).toBeInstanceOf(Uint8Array);
  });

  it('writes them to CSV as DuckDB text, and VARIANT numbers as JSON', async () => {
    const csv = await exportToCSV(t.name, { scope: 'all' }, contextFor(t));
    expect(csv.split('\n')).toEqual([
      'id,e,iv,b,bits,g,big,j,v',
      `0,a,00:00:00,\\xAA\\x00,1,POINT (0 2),'-1${'0'.repeat(30)},'-1,-1`,
      `1,"b,c",1 day 00:00:00.0015,'-x,10,POINT (1 2),'-1${'0'.repeat(30)},'-2,-2`,
      `2,,2 days 00:00:00.003,\\xAA\\x00,11,POINT (2 2),'-1${'0'.repeat(30)},'-3,-3`,
      `3,a,3 days 00:00:00.0045,'-x,100,POINT (3 2),'-1${'0'.repeat(30)},'-4,-4`,
    ]);
  });

  it('writes them to JSON as DuckDB text', async () => {
    const json = await exportToJSON(t.name, { scope: 'all', format: 'ndjson' }, contextFor(t));
    expect(JSON.parse(json.split('\n')[1]!)).toEqual({
      id: 1,
      e: 'b,c',
      iv: '1 day 00:00:00.0015',
      b: '-x',
      bits: '10',
      g: 'POINT (1 2)',
      big: `-1${'0'.repeat(30)}`,
      j: '-2',
      v: -2,
    });
  });
});

describe('batches read their values for their own rows only', () => {
  const ROWS = 25_000;
  let t: ExportTable;

  beforeAll(async () => {
    // `boom` cannot be computed outside rows 10 to 14, as a derived column's
    // expression might fail on rows a user never asked for: copying those
    // rows must not compute it for any other. The other columns hold ties,
    // NULLs and a VARIANT of mixed kinds, over more rows than one batch.
    await harness.conn.query(
      `CREATE OR REPLACE TABLE batch_base AS SELECT
         CAST(range AS BIGINT) AS "__rowid__",
         CAST(range AS BIGINT) AS id,
         CASE WHEN range % 7 = 0 THEN NULL ELSE CAST(range % 3 AS INTEGER) END AS k,
         CASE WHEN range % 11 = 0 THEN NULL ELSE [CAST(range % 4 AS INTEGER)] END AS l,
         CASE range % 3 WHEN 0 THEN CAST(range % 5 AS VARIANT)
           WHEN 1 THEN CAST('s' || (range % 5) AS VARIANT) ELSE NULL END AS v
       FROM range(${ROWS})`,
    );
    await harness.conn.query(
      `CREATE OR REPLACE VIEW batch_view AS SELECT *,
         CASE WHEN "__rowid__" BETWEEN 10 AND 14 THEN ["__rowid__"]
           ELSE error('boom computed for row ' || "__rowid__") END AS boom
       FROM batch_base`,
    );
    t = { name: 'batch_view', schema: await describeSchema('batch_view') };
  });

  it('copies rows 10 to 14 without computing anything for another row', async () => {
    const tsv = await exportToCSV(
      t.name,
      { scope: 'selected', columns: ['id', 'boom'], delimiter: '\t' },
      contextFor(t, { selectedRows: new Set([10, 11, 12, 13, 14]) }),
    );
    expect(tsv.split('\n')).toEqual([
      'id\tboom',
      '10\t[10]',
      '11\t[11]',
      '12\t[12]',
      '13\t[13]',
      '14\t[14]',
    ]);
  });

  /** Row ids of `ORDER BY …, "__rowid__"` with `where`, as the grid sorts. */
  async function viewOrder(orderBy: string, where = ''): Promise<number[]> {
    const rows = await select<{ id: number }>(
      `SELECT "id" FROM "batch_base" ${where} ORDER BY ${orderBy}, "__rowid__" ASC`,
    );
    return rows.map((row) => Number(row.id));
  }

  it.each([
    { sort: { column: 'k', direction: 'desc' }, orderBy: '"k" DESC' },
    { sort: { column: 'l', direction: 'asc' }, orderBy: '"l" ASC' },
    { sort: { column: 'v', direction: 'desc' }, orderBy: '"v" DESC' },
  ] as const)(
    'writes every batch in the sort’s order, ties and NULLs included: $sort.column',
    async ({ sort, orderBy }) => {
      const base: ExportTable = { name: 'batch_base', schema: await describeSchema('batch_base') };
      const filters: Filter[] = [{ type: 'not-null', column: 'l' }];
      for (const scope of ['all', 'filtered'] as const) {
        const context = contextFor(base, { sortColumns: [sort], filters });
        const csv = await exportToCSV(base.name, { scope, columns: ['id', 'l'] }, context);
        const expected = await viewOrder(
          orderBy,
          scope === 'filtered' ? `WHERE ${filtersToWhereClause(filters)}` : '',
        );
        const rows = parseDelimited(csv, ',');
        expect(columnOf(rows, 'id').map(Number), scope).toEqual(expected);
        expect(expected.length).toBeGreaterThan(20_000);
      }
      // A selection across the first batch boundary, in one run and not.
      const order = await viewOrder(orderBy);
      for (const positions of [
        Array.from({ length: 30 }, (_, i) => 9_985 + i),
        [0, 9_999, 10_000, 10_001, 24_999],
      ]) {
        const context = contextFor(base, {
          sortColumns: [sort],
          selectedRows: new Set(positions),
        });
        const ndjson = await exportToJSON(
          base.name,
          { scope: 'selected', columns: ['id'], format: 'ndjson' },
          context,
        );
        expect(ndjson.split('\n').map((line) => (JSON.parse(line) as { id: number }).id)).toEqual(
          positions.map((p) => order[p]),
        );
      }
    },
    60_000,
  );
});

describe('TSV of selected rows, as the clipboard copies them', () => {
  it('writes nested values as standard JSON, tab-separated', async () => {
    const t = table('sqlOnly');
    // copyRowsToClipboard's own options.
    const tsv = await exportToCSV(
      t.name,
      { scope: 'selected', columns: 'all', includeHeaders: true, delimiter: '\t', nullValue: '' },
      contextFor(t, { selectedRows: new Set([1, 4, 9, 13]) }),
    );
    const rows = parseDelimited(tsv, '\t');
    expect(rows).toHaveLength(5);
    expect(columnOf(rows, 'id')).toEqual(['1', '4', '9', '13']);
    for (const column of nestedColumns(t)) {
      const texts = await jsonTexts(t, column);
      const expected = [1, 4, 9, 13].map((id) => {
        const text = texts[id]!;
        return text === null ? '' : toStandardJson(text);
      });
      expect(columnOf(rows, column.name), column.name).toEqual(expected);
    }
  });
});

describe('Parquet export', () => {
  async function exportAndReload(
    t: ExportTable,
    columns: 'all' | string[],
    tableName: string,
  ): Promise<ExportTable> {
    const bytes = await exportToParquet(t.name, { scope: 'all', columns }, contextFor(t));
    const reloaded = await bridge.loadData(toArrayBuffer(bytes), { format: 'parquet', tableName });
    return { name: reloaded.tableName, schema: reloaded.schema };
  }

  function types(schema: ColumnSchema[]): Record<string, string> {
    return Object.fromEntries(schema.map((c) => [c.name, c.originalType]));
  }

  it('writes the Parquet fixture natively: it reloads with the same types and values', async () => {
    const t = table('parquet');
    const back = await exportAndReload(t, 'all', 'parquet_reload_parquet');
    expect(types(back.schema)).toEqual(types(t.schema));
    for (const column of nestedColumns(t)) {
      const before = await jsonTexts(t, column);
      if (column.name === 'typed_leaves') {
        // DuckDB writes, or reads back, a FLOAT -0.0 in a struct as 0.0 (a
        // DOUBLE, or a FLOAT in a list, keeps its sign).
        const row = SHOWCASE.DATE_BINARY_EDGES;
        expect(before[row]).toContain('"f32":-0.0,');
        before[row] = before[row]!.replace('"f32":-0.0,', '"f32":0.0,');
      }
      expect(await jsonTexts(back, column), column.name).toEqual(before);
    }
  });

  it('writes the JSON fixture natively, HUGEINT lists as DOUBLE lists', async () => {
    // DuckDB writes a HUGEINT to Parquet as a DOUBLE: 2^63 and beyond lose digits.
    const t = table('json');
    const back = await exportAndReload(t, 'all', 'parquet_reload_json');
    expect(types(back.schema)).toEqual({
      ...types(t.schema),
      signed: 'DOUBLE[]',
      huge: 'DOUBLE[]',
    });
    for (const column of nestedColumns(t)) {
      if (column.name === 'signed' || column.name === 'huge') continue;
      expect(await jsonTexts(back, column), column.name).toEqual(await jsonTexts(t, column));
    }
  });

  /**
   * What exporting each SQL-only column to Parquet and loading the file
   * back gives (DuckDB 1.5.4): the type it reloads as, or where it fails.
   */
  const SQL_ONLY_PARQUET: Record<
    string,
    { type: string; sameText: boolean } | { exportError: RegExp } | { reloadError: RegExp }
  > = {
    // A UNION is written as a struct of its tag and members, the tag field
    // unnamed, which a table cannot hold.
    union_pair: { reloadError: /A table cannot be created from an unnamed struct/ },
    union_nested: { reloadError: /Struct remap can only remap named structs/ },
    // An ARRAY comes back as a LIST.
    int_array3: { type: 'INTEGER[]', sameText: true },
    embedding768: { type: 'FLOAT[]', sameText: true },
    int_pairs: { type: 'INTEGER[][]', sameText: true },
    // Parquet's INTERVAL holds milliseconds: the microseconds are lost.
    intervals: { type: 'INTERVAL[]', sameText: false },
    huge_struct: { type: 'STRUCT(h DOUBLE, u DOUBLE)', sameText: false },
    enum_struct: { type: 'STRUCT(e VARCHAR, n INTEGER)', sameText: true },
    bit_list: { type: 'VARCHAR[]', sameText: true },
    variant_value: { type: 'VARIANT', sameText: true },
    // A VARIANT inside a list or struct cannot be written at all.
    variant_list: { exportError: /ColumnWriter of type 'VARIANT' requires a transform/ },
    variant_struct: { exportError: /ColumnWriter of type 'VARIANT' requires a transform/ },
    struct_key_map: { type: 'MAP(STRUCT(k INTEGER), VARCHAR)', sameText: true },
    list_key_map: { type: 'MAP(INTEGER[], BIGINT)', sameText: true },
    unnamed_struct: { reloadError: /A table cannot be created from an unnamed struct/ },
  };

  it.each([
    ['not one run', [0, 2, 9, 40]],
    ['one run', [3, 4, 5]],
  ])(
    'writes selected rows (%s) of a sort by a VARIANT whose values differ in kind, in order',
    async (_, positions) => {
      // A selection that is not one run of rows is numbered by ROW_NUMBER()
      // OVER (ORDER BY …), and a window cannot compare VARIANT values of
      // different kinds; the column is numbered by its sort key instead (see
      // buildSelectedRowsQuery). One run is read with ORDER BY … LIMIT.
      const t = table('sqlOnly');
      const sort: SortColumn = { column: 'variant_value', direction: 'asc' };
      const context = contextFor(t, { sortColumns: [sort], selectedRows: new Set(positions) });
      const bytes = await exportToParquet(
        t.name,
        { scope: 'selected', columns: ['id', 'variant_value'] },
        context,
      );
      const back = await bridge.loadData(toArrayBuffer(bytes), {
        format: 'parquet',
        tableName: `parquet_variant_sorted_${positions.length}`,
      });
      const order = await select<{ id: number }>(
        `SELECT "id" FROM ${quoteIdentifier(t.name)} ` +
          `ORDER BY "variant_value" ASC, "__rowid__" ASC`,
      );
      const written = await select<{ id: number }>(
        `SELECT "id" FROM ${quoteIdentifier(back.tableName)} ORDER BY "__rowid__"`,
      );
      expect(written.map((row) => Number(row.id))).toEqual(
        positions.map((p) => Number(order[p]!.id)),
      );
      expect(back.schema.find((c) => c.name === 'variant_value')?.originalType).toBe('VARIANT');
    },
  );

  it('covers every SQL-only column', () => {
    expect(Object.keys(SQL_ONLY_PARQUET).sort()).toEqual(
      SQL_ONLY_COLUMNS.map((c) => c.name).sort(),
    );
  });

  it.each(Object.entries(SQL_ONLY_PARQUET))('writes %s natively: %o', async (name, outcome) => {
    const t = table('sqlOnly');
    const tableName = `parquet_reload_${name}`;
    if ('exportError' in outcome) {
      await expect(
        exportToParquet(t.name, { scope: 'all', columns: [name] }, contextFor(t)),
      ).rejects.toThrow(outcome.exportError);
      return;
    }
    if ('reloadError' in outcome) {
      await expect(exportAndReload(t, [name], tableName)).rejects.toThrow(outcome.reloadError);
      return;
    }
    const back = await exportAndReload(t, [name], tableName);
    expect(types(back.schema)[name]).toBe(outcome.type);
    const before = await castTexts(t.name, name);
    const after = await castTexts(back.name, name);
    if (outcome.sameText) expect(after).toEqual(before);
    else expect(after).not.toEqual(before);
  });
});

describe('sorted by a nested column', () => {
  /** A range filter on `id` (= `__rowid__` in every table), for the filtered and selected scopes. */
  const FILTERS: Filter[] = [{ type: 'range', column: 'id', min: 3, max: 55 }];
  const WHERE = `WHERE ${filtersToWhereClause(FILTERS)}`;

  const SORTS: { key: TableKey; column: string; direction: 'asc' | 'desc' }[] = [
    { key: 'parquet', column: 'scores', direction: 'asc' },
    { key: 'parquet', column: 'point', direction: 'desc' },
    { key: 'parquet', column: 'attrs', direction: 'asc' },
    { key: 'sqlOnly', column: 'int_pairs', direction: 'desc' },
    { key: 'sqlOnly', column: 'union_nested', direction: 'asc' },
    { key: 'sqlOnly', column: 'variant_value', direction: 'desc' },
    { key: 'sqlOnly', column: 'struct_key_map', direction: 'asc' },
  ];

  const SCOPES: {
    label: string;
    scope: 'all' | 'filtered' | 'selected';
    positions?: number[];
  }[] = [
    { label: 'all', scope: 'all' },
    { label: 'filtered', scope: 'filtered' },
    { label: 'selected, contiguous', scope: 'selected', positions: [2, 3, 4, 5, 6] },
    { label: 'selected, not contiguous', scope: 'selected', positions: [0, 3, 7, 11, 19, 40] },
  ];

  /** Row ids in `ORDER BY "col" dir, "__rowid__"`, as the grid shows them. */
  async function valueOrder(t: ExportTable, sort: SortColumn, where: string): Promise<number[]> {
    const rows = await select<{ id: number }>(
      `SELECT "id" FROM ${quoteIdentifier(t.name)} ${where} ` +
        `ORDER BY ${quoteIdentifier(sort.column)} ${sort.direction.toUpperCase()}, "__rowid__" ASC`,
    );
    return rows.map((row) => Number(row.id));
  }

  it.each(SORTS)('$column ($key) sorts differently by value than by its JSON text', async (s) => {
    // Otherwise the checks below could not tell a sort by the text alias.
    const t = table(s.key);
    const column = t.schema.find((c) => c.name === s.column)!;
    const byText = await select<{ id: number }>(
      `SELECT "id" FROM ${quoteIdentifier(t.name)} ` +
        `ORDER BY ${jsonValueSQL(column, quoteIdentifier(s.column))} ${s.direction.toUpperCase()}, "__rowid__" ASC`,
    );
    const sort: SortColumn = { column: s.column, direction: s.direction };
    expect(byText.map((row) => Number(row.id))).not.toEqual(await valueOrder(t, sort, ''));
  });

  describe.each(SCOPES)('scope $label', ({ scope, positions }) => {
    it.each(SORTS)('$column ($key, $direction): CSV and JSON rows in value order', async (s) => {
      const t = table(s.key);
      const column = t.schema.find((c) => c.name === s.column)!;
      const sort: SortColumn = { column: s.column, direction: s.direction };
      const order = await valueOrder(t, sort, scope === 'all' ? '' : WHERE);
      const expectedIds = positions ? positions.map((p) => order[p]!) : order;
      const context = contextFor(t, {
        filters: FILTERS,
        sortColumns: [sort],
        selectedRows: new Set(positions ?? []),
      });

      const csv = await exportToCSV(t.name, { scope, columns: ['id', s.column] }, context);
      const rows = parseDelimited(csv, ',');
      expect(columnOf(rows, 'id').map(Number)).toEqual(expectedIds);
      const texts = await jsonTexts(t, column);
      expect(columnOf(rows, s.column)).toEqual(
        expectedIds.map((id) => {
          const text = texts[id]!;
          return text === null ? '' : toStandardJson(text);
        }),
      );

      const ndjson = await exportToJSON(
        t.name,
        { scope, columns: ['id', s.column], format: 'ndjson' },
        context,
      );
      const objects = ndjson.split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(objects.map((o) => o['id'])).toEqual(expectedIds);
      expect(objects.map((o) => o[s.column])).toEqual(
        expectedIds.map((id) => exported(texts[id]!, column)),
      );
    });
  });
});
