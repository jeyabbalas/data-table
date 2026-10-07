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
 * columns are read as DuckDB's text, and so are dates and times, a
 * TIMESTAMP WITH TIME ZONE in UTC: JSON writes a timestamp with `T` between
 * date and time, CSV and the TSV with a space.
 *
 * Rows are read with the worker's own query function,
 * `executeQueryCancellable`, which every `bridge.query` runs: the path on
 * which an ENUM value comes back null.
 *
 * Tables: the two nested fixtures, loaded by the library's loaders, and a
 * view over the SQL-only companions (UNION, ARRAY, INTERVAL[], VARIANT, MAP
 * with nested keys, an unnamed STRUCT). A table with derived columns is
 * exported from a view too, and a table of every date and time type with
 * infinity, BC and five-digit years from one of its own.
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

describe('scalars Arrow carries inexactly', () => {
  let t: ExportTable;

  beforeAll(async () => {
    // Arrow gives a TIME WITH TIME ZONE as microseconds since midnight, the
    // offset lost; a TIME_NS as nanoseconds; and, with castDecimalToDouble,
    // a DECIMAL as a double that is not the nearest one for many values
    // (0.35 as 0.35000000000000003). The widest DECIMALs are ones DuckDB's
    // own cast to DOUBLE rounds wrong too.
    await harness.conn.query(
      `CREATE OR REPLACE TABLE exact_scalars AS SELECT
         CAST(r AS BIGINT) AS "__rowid__", CAST(r AS BIGINT) AS id,
         CAST(tz AS TIMETZ) AS tz, CAST(tns AS TIME_NS) AS tns,
         CAST(d2 AS DECIMAL(10,2)) AS d2, CAST(d4 AS DECIMAL(18,4)) AS d4,
         CAST(d17 AS DECIMAL(18,17)) AS d17, CAST(d38 AS DECIMAL(38,18)) AS d38
       FROM (VALUES
         (0, '12:34:56+05:30', '03:04:05.123456789', '0.35', '1.2345',
          '3.79371274909505664', '-14562988237691892737.177349146278896538'),
         (1, '12:34:56+00', '00:00:00', '19.99', '0.0003', '1.55763871152627520', '0.1'),
         (2, '12:34:56-08', '23:59:59.999999999', '-0.70', '2.5', '-0.15379371274909505', '-1'),
         (3, NULL, NULL, NULL, NULL, NULL, NULL)
       ) AS v(r, tz, tns, d2, d4, d17, d38)`,
    );
    t = { name: 'exact_scalars', schema: await describeSchema('exact_scalars') };
  });

  /** Each value as `getColumnValues` reads it: DuckDB's text, and a DECIMAL's nearest double. */
  const EXPECTED = {
    tz: ['12:34:56+05:30', '12:34:56+00', '12:34:56-08', null],
    tns: ['03:04:05.123456789', '00:00:00', '23:59:59.999999999', null],
    d2: [0.35, 19.99, -0.7, null],
    d4: [1.2345, 0.0003, 2.5, null],
    d17: [
      Number('3.79371274909505664'),
      Number('1.55763871152627520'),
      Number('-0.15379371274909505'),
      null,
    ],
    d38: [Number('-14562988237691892737.177349146278896538'), 0.1, -1, null],
  };

  it('reads TIME WITH TIME ZONE and TIME_NS as text, a DECIMAL as the nearest double', () => {
    expect(Object.fromEntries(t.schema.map((c) => [c.name, exportColumnRead(c)]))).toEqual({
      __rowid__: 'raw',
      id: 'raw',
      tz: 'text',
      tns: 'text',
      d2: 'double',
      d4: 'double',
      d17: 'double',
      d38: 'double',
    });
  });

  it('writes them to JSON and CSV as getColumnValues reads them', async () => {
    const ndjson = await exportToJSON(t.name, { scope: 'all', format: 'ndjson' }, contextFor(t));
    const rows = ndjson.split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    const csv = parseDelimited(await exportToCSV(t.name, { scope: 'all' }, contextFor(t)), ',');
    for (const [name, values] of Object.entries(EXPECTED)) {
      expect(
        rows.map((row) => row[name]),
        name,
      ).toEqual(values);
      expect(columnOf(csv, name), name).toEqual(
        values.map((v) => (v === null ? '' : neutralizeFormulaPrefix(String(v)))),
      );
    }
  });

  it.each([
    { column: 'tz', direction: 'asc', where: '"d2" >= 0' },
    { column: 'd2', direction: 'desc', where: '"tz" IS NOT NULL' },
    { column: 'd38', direction: 'asc', where: '"d38" < 0.5' },
  ] as const)('sorts and filters by the value, not the text: $column', async (s) => {
    const filter: Filter = { type: 'raw-sql', column: '__raw_sql_x__', id: 'x', sql: s.where };
    const sort: SortColumn = { column: s.column, direction: s.direction };
    const expected = await select<{ id: number }>(
      `SELECT "id" FROM "exact_scalars" WHERE ${s.where} ` +
        `ORDER BY ${quoteIdentifier(s.column)} ${s.direction.toUpperCase()}, "__rowid__" ASC`,
    );
    const context = contextFor(t, { filters: [filter], sortColumns: [sort] });
    const csv = parseDelimited(
      await exportToCSV(t.name, { scope: 'filtered', columns: ['id', s.column] }, context),
      ',',
    );
    expect(columnOf(csv, 'id').map(Number)).toEqual(expected.map((row) => Number(row.id)));
    expect(expected.length).toBeGreaterThan(1);
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

describe('dates and times', () => {
  // One case per row in every column: a fraction, a time before 1970,
  // ±infinity, BC, a five-digit year, NULL. A TIME has no infinity or BC
  // (row 2 is 24:00:00), and a TIMESTAMP_NS holds 1677-09-21 to 2262-04-11
  // only, so its rows 3 and 4 are near those ends. Row 1's TIMESTAMP WITH
  // TIME ZONE is given at +05:30.
  const TEMPORAL = `CREATE OR REPLACE TABLE temporal AS SELECT
       CAST(r AS BIGINT) AS "__rowid__", CAST(r AS BIGINT) AS id,
       CAST(v.d AS DATE) AS d, CAST(v.tm AS TIME) AS tm, CAST(v.ts AS TIMESTAMP) AS ts,
       CAST(v.ts_s AS TIMESTAMP_S) AS ts_s, CAST(v.ts_ms AS TIMESTAMP_MS) AS ts_ms,
       CAST(v.ts_ns AS TIMESTAMP_NS) AS ts_ns, CAST(v.tz AS TIMESTAMPTZ) AS tz,
       CASE WHEN v.ts IS NOT NULL THEN [CAST(v.ts AS TIMESTAMP)] END AS ts_list,
       CASE WHEN v.tz IS NOT NULL THEN {'at': CAST(v.tz AS TIMESTAMPTZ)} END AS tz_struct
     FROM (VALUES
       (0, '2024-01-02', '03:04:05.5', '2024-01-02 03:04:05.123456', '2024-01-02 03:04:05',
        '2024-01-02 03:04:05.123', '2024-01-02 03:04:05.123456789', '2024-01-02 03:04:05.5+00'),
       (1, '1969-07-20', '00:00:00', '1969-07-20 20:17:40', '1969-07-20 20:17:40',
        '1969-07-20 20:17:40.5', '1969-07-20 20:17:40', '2024-07-01 12:00:00+05:30'),
       (2, 'infinity', '24:00:00', 'infinity', 'infinity', '-infinity', 'infinity', '-infinity'),
       (3, '0044-03-15 (BC)', '23:59:59.999999', '0044-03-15 (BC) 10:00:00.5',
        '0044-03-15 (BC) 10:00:00', '0044-03-15 (BC) 10:00:00.5', '1677-09-22 00:00:00.000000001',
        '0044-03-15 (BC) 10:00:00+00'),
       (4, '12345-01-02', '12:00:00.000001', '12345-01-02 03:04:05.25', '12345-01-02 03:04:05',
        '12345-01-02 03:04:05.25', '2262-04-11 23:47:16.854775806', '12345-01-02 03:04:05.25+00'),
       (5, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
     ) AS v(r, d, tm, ts, ts_s, ts_ms, ts_ns, tz)`;

  /**
   * Each column's values in a JSON export, by row: ISO 8601 text, `T`
   * between date and time, a zoned timestamp in UTC with `Z`. Infinity and
   * BC are DuckDB's text, and so is every date inside a nested value.
   */
  const JSON_VALUES: Record<string, unknown[]> = {
    id: [0, 1, 2, 3, 4, 5],
    d: ['2024-01-02', '1969-07-20', 'infinity', '0044-03-15 (BC)', '12345-01-02', null],
    tm: ['03:04:05.5', '00:00:00', '24:00:00', '23:59:59.999999', '12:00:00.000001', null],
    ts: [
      '2024-01-02T03:04:05.123456',
      '1969-07-20T20:17:40',
      'infinity',
      '0044-03-15 (BC) 10:00:00.5',
      '12345-01-02T03:04:05.25',
      null,
    ],
    ts_s: [
      '2024-01-02T03:04:05',
      '1969-07-20T20:17:40',
      'infinity',
      '0044-03-15 (BC) 10:00:00',
      '12345-01-02T03:04:05',
      null,
    ],
    ts_ms: [
      '2024-01-02T03:04:05.123',
      '1969-07-20T20:17:40.5',
      '-infinity',
      '0044-03-15 (BC) 10:00:00.5',
      '12345-01-02T03:04:05.25',
      null,
    ],
    ts_ns: [
      '2024-01-02T03:04:05.123456789',
      '1969-07-20T20:17:40',
      'infinity',
      '1677-09-22T00:00:00.000000001',
      '2262-04-11T23:47:16.854775806',
      null,
    ],
    tz: [
      '2024-01-02T03:04:05.5Z',
      '2024-07-01T06:30:00Z',
      '-infinity',
      '0044-03-15 (BC) 10:00:00Z',
      '12345-01-02T03:04:05.25Z',
      null,
    ],
    ts_list: [
      ['2024-01-02 03:04:05.123456'],
      ['1969-07-20 20:17:40'],
      ['infinity'],
      ['0044-03-15 (BC) 10:00:00.5'],
      ['12345-01-02 03:04:05.25'],
      null,
    ],
    tz_struct: [
      { at: '2024-01-02 03:04:05.5+00' },
      { at: '2024-07-01 06:30:00+00' },
      { at: '-infinity' },
      { at: '0044-03-15 (BC) 10:00:00+00' },
      { at: '12345-01-02 03:04:05.25+00' },
      null,
    ],
  };

  /**
   * Each column's fields in a CSV or TSV, by row: a space between date and
   * time, and the formula guard's `'` before `-infinity`. A nested value is
   * standard JSON of DuckDB's text, as in any nested column.
   */
  const CSV_FIELDS: Record<string, string[]> = {
    id: ['0', '1', '2', '3', '4', '5'],
    d: ['2024-01-02', '1969-07-20', 'infinity', '0044-03-15 (BC)', '12345-01-02', ''],
    tm: ['03:04:05.5', '00:00:00', '24:00:00', '23:59:59.999999', '12:00:00.000001', ''],
    ts: [
      '2024-01-02 03:04:05.123456',
      '1969-07-20 20:17:40',
      'infinity',
      '0044-03-15 (BC) 10:00:00.5',
      '12345-01-02 03:04:05.25',
      '',
    ],
    ts_s: [
      '2024-01-02 03:04:05',
      '1969-07-20 20:17:40',
      'infinity',
      '0044-03-15 (BC) 10:00:00',
      '12345-01-02 03:04:05',
      '',
    ],
    ts_ms: [
      '2024-01-02 03:04:05.123',
      '1969-07-20 20:17:40.5',
      "'-infinity",
      '0044-03-15 (BC) 10:00:00.5',
      '12345-01-02 03:04:05.25',
      '',
    ],
    ts_ns: [
      '2024-01-02 03:04:05.123456789',
      '1969-07-20 20:17:40',
      'infinity',
      '1677-09-22 00:00:00.000000001',
      '2262-04-11 23:47:16.854775806',
      '',
    ],
    tz: [
      '2024-01-02 03:04:05.5Z',
      '2024-07-01 06:30:00Z',
      "'-infinity",
      '0044-03-15 (BC) 10:00:00Z',
      '12345-01-02 03:04:05.25Z',
      '',
    ],
    ts_list: [
      '["2024-01-02 03:04:05.123456"]',
      '["1969-07-20 20:17:40"]',
      '["infinity"]',
      '["0044-03-15 (BC) 10:00:00.5"]',
      '["12345-01-02 03:04:05.25"]',
      '',
    ],
    tz_struct: [
      '{"at":"2024-01-02 03:04:05.5+00"}',
      '{"at":"2024-07-01 06:30:00+00"}',
      '{"at":"-infinity"}',
      '{"at":"0044-03-15 (BC) 10:00:00+00"}',
      '{"at":"12345-01-02 03:04:05.25+00"}',
      '',
    ],
  };

  let t: ExportTable;
  /** The session's time zone before this block, restored after it. */
  let sessionZone: string;

  async function ndjsonRows(context: ExportContext): Promise<Record<string, unknown>[]> {
    const ndjson = await exportToJSON(t.name, { scope: 'all', format: 'ndjson' }, context);
    return ndjson.split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  beforeAll(async () => {
    const [setting] = await select<{ zone: string }>(`SELECT current_setting('TimeZone') AS zone`);
    sessionZone = setting!.zone;
    await harness.conn.query(`SET TimeZone = 'UTC'`);
    await harness.conn.query(TEMPORAL);
    t = { name: 'temporal', schema: await describeSchema('temporal') };
  });

  afterAll(async () => {
    await harness.conn.query(`SET TimeZone = '${sessionZone}'`);
  });

  it('reads them as text, a TIMESTAMP WITH TIME ZONE in UTC, nested values as JSON', () => {
    expect(Object.fromEntries(t.schema.map((c) => [c.name, exportColumnRead(c)]))).toEqual({
      __rowid__: 'raw',
      id: 'raw',
      d: 'text',
      tm: 'text',
      ts: 'timestamp',
      ts_s: 'timestamp',
      ts_ms: 'timestamp',
      ts_ns: 'timestamp',
      tz: 'utc',
      ts_list: 'json',
      tz_struct: 'json',
    });
  });

  it('writes them to JSON as ISO 8601 text, every digit kept', async () => {
    const rows = await ndjsonRows(contextFor(t));
    expect(Object.keys(rows[0]!)).toEqual(Object.keys(JSON_VALUES));
    for (const [name, values] of Object.entries(JSON_VALUES)) {
      expect(
        rows.map((row) => row[name]),
        name,
      ).toEqual(values);
    }
    // An array, pretty-printed or not, holds the same values.
    for (const pretty of [false, true]) {
      const json = await exportToJSON(t.name, { scope: 'all', pretty }, contextFor(t));
      expect(JSON.parse(json)).toEqual(rows);
    }
  });

  it('writes them to CSV with a space between date and time', async () => {
    const csv = await exportToCSV(t.name, { scope: 'all' }, contextFor(t));
    const rows = parseDelimited(csv, ',');
    expect(rows[0]).toEqual(Object.keys(CSV_FIELDS));
    for (const [name, fields] of Object.entries(CSV_FIELDS)) {
      expect(columnOf(rows, name), name).toEqual(fields);
    }
    // A space needs no quotes; a nested value's JSON does, for its `"`.
    expect(csv.split('\n')[1]).toBe(
      '0,2024-01-02,03:04:05.5,2024-01-02 03:04:05.123456,2024-01-02 03:04:05,' +
        '2024-01-02 03:04:05.123,2024-01-02 03:04:05.123456789,2024-01-02 03:04:05.5Z,' +
        '"[""2024-01-02 03:04:05.123456""]","{""at"":""2024-01-02 03:04:05.5+00""}"',
    );
  });

  it.each([
    ['in one run', [0, 1]],
    ['not in one run', [0, 2, 3]],
  ])('copies selected rows %s as TSV, as the clipboard does', async (_, positions) => {
    // One run is read with LIMIT and OFFSET (buildBaseQuery), any other
    // selection numbered by ROW_NUMBER() (buildSelectedRowsQuery).
    const tsv = await exportToCSV(
      t.name,
      { scope: 'selected', columns: 'all', includeHeaders: true, delimiter: '\t', nullValue: '' },
      contextFor(t, { selectedRows: new Set(positions) }),
    );
    const rows = parseDelimited(tsv, '\t');
    expect(rows[0]).toEqual(Object.keys(CSV_FIELDS));
    for (const [name, fields] of Object.entries(CSV_FIELDS)) {
      expect(columnOf(rows, name), name).toEqual(positions.map((p) => fields[p]));
    }
  });

  it.each(['America/New_York', 'Asia/Kolkata'])(
    'writes the same text when the session time zone is %s',
    async (zone) => {
      const json = await exportToJSON(t.name, { scope: 'all', format: 'ndjson' }, contextFor(t));
      const csv = await exportToCSV(t.name, { scope: 'all' }, contextFor(t));
      try {
        await harness.conn.query(`SET TimeZone = '${zone}'`);
        // The zone is in effect: DuckDB's own text of a zoned value follows it.
        const [row] = await select<{ v: string }>(
          `SELECT CAST(tz AS VARCHAR) AS v FROM temporal WHERE id = 0`,
        );
        expect(row!.v).not.toBe('2024-01-02 03:04:05.5+00');
        expect(await exportToJSON(t.name, { scope: 'all', format: 'ndjson' }, contextFor(t))).toBe(
          json,
        );
        expect(await exportToCSV(t.name, { scope: 'all' }, contextFor(t))).toBe(csv);
      } finally {
        await harness.conn.query(`SET TimeZone = 'UTC'`);
      }
    },
  );

  /** Row ids in `ORDER BY <order>, "__rowid__"`. */
  async function idsBy(order: string): Promise<number[]> {
    const rows = await select<{ id: number }>(
      `SELECT "id" FROM "temporal" ORDER BY ${order}, "__rowid__" ASC`,
    );
    return rows.map((row) => Number(row.id));
  }

  it.each([
    { column: 'd', direction: 'asc', positions: null },
    { column: 'ts', direction: 'desc', positions: [0, 2, 4] },
    { column: 'tz', direction: 'asc', positions: [1, 2, 3] },
  ] as const)(
    'sorts by $column $direction by the value, not by the text it reads',
    async ({ column, direction, positions }) => {
      const quoted = quoteIdentifier(column);
      const order = direction.toUpperCase();
      const byValue = await idsBy(`${quoted} ${order}`);
      // Otherwise the check could not tell a sort by the text alias.
      expect(await idsBy(`CAST(${quoted} AS VARCHAR) ${order}`)).not.toEqual(byValue);
      const expected = positions ? positions.map((p) => byValue[p]) : byValue;
      const scope = positions ? 'selected' : 'all';
      const context = contextFor(t, {
        sortColumns: [{ column, direction }],
        selectedRows: new Set(positions ?? []),
      });

      const csv = await exportToCSV(t.name, { scope, columns: ['id', column] }, context);
      expect(columnOf(parseDelimited(csv, ','), 'id').map(Number)).toEqual(expected);
      const ndjson = await exportToJSON(
        t.name,
        { scope, columns: ['id', column], format: 'ndjson' },
        context,
      );
      expect(ndjson.split('\n').map((line) => (JSON.parse(line) as { id: number }).id)).toEqual(
        expected,
      );
    },
  );

  it('loads back through the library’s loaders as dates and times', async () => {
    // Rows 0 and 1, which a file of every format can hold. read_csv reads a
    // TIMESTAMP_NS's text as a TIMESTAMP, to the microsecond; read_json
    // leaves it text, and reads one ending in `Z` as a TIMESTAMP in UTC.
    const columns = ['id', 'd', 'tm', 'ts', 'ts_ns', 'tz'];
    const context = contextFor(t, { selectedRows: new Set([0, 1]) });
    const files = {
      csv: await exportToCSV(t.name, { scope: 'selected', columns }, context),
      json: await exportToJSON(t.name, { scope: 'selected', columns }, context),
    };
    const types = {
      csv: {
        d: 'DATE',
        tm: 'TIME',
        ts: 'TIMESTAMP',
        ts_ns: 'TIMESTAMP',
        tz: 'TIMESTAMP WITH TIME ZONE',
      },
      json: { d: 'DATE', tm: 'TIME', ts: 'TIMESTAMP', ts_ns: 'VARCHAR', tz: 'TIMESTAMP' },
    };
    /** Each row's microseconds since 1970 for `column`, in `__rowid__` order. */
    const epochs = async (table: string, column: string): Promise<unknown[]> =>
      (
        await select<{ v: unknown }>(
          `SELECT epoch_us(${quoteIdentifier(column)}) AS v FROM ${quoteIdentifier(table)} ` +
            `ORDER BY ${quoteIdentifier(ROWID_COLUMN)}`,
        )
      ).map((row) => row.v);

    for (const format of ['csv', 'json'] as const) {
      const back = await bridge.loadData(files[format], {
        format,
        tableName: `temporal_reload_${format}`,
      });
      expect(
        Object.fromEntries(back.schema.map((c) => [c.name, c.originalType])),
        format,
      ).toMatchObject(types[format]);
      for (const name of ['d', 'tm', 'ts']) {
        expect(await castTexts(back.tableName, name), `${format} ${name}`).toEqual(
          (await castTexts(t.name, name)).slice(0, 2),
        );
      }
      expect(await epochs(back.tableName, 'tz'), format).toEqual(
        (await epochs(t.name, 'tz')).slice(0, 2),
      );
    }
  });
});
