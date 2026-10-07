/**
 * Exact value reads on real DuckDB: `actions.getCellValue` and
 * `actions.getColumnValues` over the nested stress fixture (both files), the
 * SQL-only companions (UNION, VARIANT, ARRAY, INTERVAL[], an unnamed
 * STRUCT, …) and the top-level scalars Arrow returns wrong.
 *
 * Queries run through `executeQueryCancellable`, the worker's own query
 * function and the path every `bridge.query` takes in the browser, against
 * a real connection, with rows converted as the worker posts them. A nested
 * value crosses as JSON text and is materialized on the main thread. These
 * tests pin the values that come out, check that getColumnValues agrees
 * with getCellValue in every scope, and that no read fails: a VARIANT
 * selected as it is cannot cross Arrow ("Unsupported Arrow type VARIANT").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StateActions } from '@/core/Actions';
import { parseJsonTree, prettyJson } from '@/core/jsonTree';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { jsonValueSQL } from '@/data/valueSql';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { __setConnForTests, executeQueryCancellable } from '@/worker/duckdb';
import { quoteIdentifier } from '@/worker/loaders/common';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { SHOWCASE, loadNestedFixture } from '../helpers/nestedFixture';
import { createSqlOnlyTable, createSqlOnlyView } from '../helpers/nestedSql';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;
/** Queries through the worker's own `executeQueryCancellable`, as in the browser. */
let workerBridge: WorkerBridge;
/** Queries through `conn.query` (the worker's former path), which `makeNodeBridge` mirrors. */
let nodeBridge: WorkerBridge;

/** Every relation the tests read, with its schema and row count. */
const relations = new Map<string, { schema: ColumnSchema[]; rows: number }>();

const SQL_ONLY_ROWS = 40;

async function describeSchema(relation: string): Promise<ColumnSchema[]> {
  const rows = await executeQueryCancellable<{ column_name: string; column_type: string }>(
    `DESCRIBE ${quoteIdentifier(relation)}`,
  );
  return rows.map(({ column_name: name, column_type: originalType }) => ({
    name,
    type: mapDuckDBType(originalType),
    nullable: true,
    originalType,
    ...(name === '__rowid__' ? { system: true } : {}),
  }));
}

beforeAll(async () => {
  harness = await createNodeDuckDB();
  __setConnForTests(harness.conn);
  const base = { ...makeNodeBridge(harness.conn), clearQueryCache: () => {} };
  nodeBridge = base as unknown as WorkerBridge;
  workerBridge = {
    ...base,
    query: <T>(sql: string) => executeQueryCancellable<T>(sql),
  } as unknown as WorkerBridge;

  for (const format of ['parquet', 'json'] as const) {
    const loaded = await loadNestedFixture(harness, format);
    relations.set(loaded.tableName, { schema: loaded.schema, rows: loaded.rowCount });
  }

  await createSqlOnlyTable(harness.conn, 'sql_only', SQL_ONLY_ROWS);
  await createSqlOnlyView(harness.conn, 'sql_only_v', 'sql_only');
  relations.set('sql_only_v', { schema: await describeSchema('sql_only_v'), rows: SQL_ONLY_ROWS });

  // Top-level scalars whose Arrow values are wrong, or not exact, and a NULL row.
  await harness.conn.query(`
    CREATE OR REPLACE TABLE scalars AS
    SELECT CAST(r AS BIGINT) AS "__rowid__",
      CAST(iv AS INTERVAL) AS iv, CAST(e AS ENUM('a', 'b', 'c')) AS e, CAST(b AS BIT) AS b,
      CAST(g AS GEOMETRY) AS g, CAST(ttz AS TIMETZ) AS ttz, CAST(uh AS UHUGEINT) AS uh,
      CAST(h AS HUGEINT) AS h, CAST(ub AS UBIGINT) AS ub, CAST(bi AS BIGINT) AS bi,
      CAST(ui AS UINTEGER) AS ui, CAST(d4 AS DECIMAL(18,4)) AS d4, CAST(d2 AS DECIMAL(10,2)) AS d2,
      CAST(d38 AS DECIMAL(38,18)) AS d38, CAST(bn AS BIGNUM) AS bn, CAST(bl AS BLOB) AS bl,
      CAST(u AS UUID) AS u, CAST(j AS JSON) AS j, CAST(dt AS DATE) AS dt,
      CAST(tns AS TIME_NS) AS tns
    FROM (VALUES
      (0, '14 months 3 days 04:05:06', 'b', '10101', 'POINT(1 2)', '03:04:05.5+02:30',
       '340282366920938463463374607431768211455', '170141183460469231731687303715884105727',
       '18446744073709551615', '9007199254740993', '4294967295', '1.2345', '1.25',
       '-12345678901234567890.123456789012345678', '123456789012345678901234567890',
       '\\xAA\\xBB', '11fde503-bf17-47ee-b458-3ce648530d3d', '{"a": [1, 2.50]}', '2024-01-02',
       '03:04:05.123456789'),
      (1, '1 day', 'a', '1', 'LINESTRING(0 0, 1 1)', '00:00:00+00', '12', '-12', '12',
       '-9223372036854775808', '7', '0.0001', '-2.50', '1', '-1', '',
       '00000000-0000-0000-0000-000000000000', '[]', '1970-01-01', '00:00:00'),
      (2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL)
    ) AS v(r, iv, e, b, g, ttz, uh, h, ub, bi, ui, d4, d2, d38, bn, bl, u, j, dt, tns)`);
  relations.set('scalars', { schema: await describeSchema('scalars'), rows: 3 });
}, 60_000);

afterAll(async () => {
  __setConnForTests(null);
  await harness?.cleanup();
});

/** Actions on `relation`, reading through `bridge`. */
function tableOn(relation: string, bridge: WorkerBridge = workerBridge) {
  const { schema, rows } = relations.get(relation)!;
  const state = createTableState();
  initializeColumnsFromSchema(state, schema);
  state.tableName.set(relation);
  state.baseTableName.set(relation);
  state.totalRows.set(rows);
  state.filteredRows.set(rows);
  return { state, actions: new StateActions(state, bridge), schema, rows };
}

function nestedColumns(relation: string): string[] {
  return relations
    .get(relation)!
    .schema.filter((c) => c.type === 'nested')
    .map((c) => c.name);
}

/**
 * A value as plain JSON-able data that keeps what `toEqual` glosses over:
 * Map entry order, -0, bigint against number, NaN and the infinities.
 */
function canon(value: unknown): unknown {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return '-0';
    return Number.isFinite(value) ? value : String(value);
  }
  if (value instanceof Map) {
    return { map: [...value.entries()].map(([k, v]) => [canon(k), canon(v)]) };
  }
  if (Array.isArray(value)) return value.map(canon);
  if (ArrayBuffer.isView(value)) return { bytes: Array.from(value as Uint8Array) };
  if (value !== null && typeof value === 'object') {
    return { object: Object.entries(value).map(([k, v]) => [k, canon(v)]) };
  }
  return value;
}

function expectSame(actual: unknown, expected: unknown, label?: string): void {
  expect(JSON.stringify(canon(actual)), label).toBe(JSON.stringify(canon(expected)));
}

const ODD_NAMES_DEMO: [string, unknown][] = [
  ['label', 'a label field'],
  ['name', 'Ada'],
  ['type', 'demo'],
  ['data', 'payload'],
  ['size', 3],
  ['length', 7],
  ['toJSON', 'not a function'],
  ['constructor', 'not a class'],
  ['__proto__', 'not a prototype'],
  ['hasOwnProperty', true],
  ['months', 14],
  ['days', 3],
  ['nanoseconds', 0],
  ['my field', 'spaced'],
  ['x,y', 2.5],
  ['quote"d', 'quoted'],
  ["it's", 'apostrophe'],
  ['2', 2],
  ['1', 1],
  ['10', 10],
  ['ünï', 'unicode'],
  ['emoji😀', '😀'],
  ['order', 1],
  ['null', 'not null'],
  ['SELECT', 'not SQL'],
  ['ID', 42],
];

describe('getCellValue on the Parquet fixture', () => {
  const cell = (rowId: number, column: string) =>
    tableOn('nested_parquet').actions.getCellValue(rowId, column);

  it('reads DECIMAL lists as exact numbers, NULL as null', async () => {
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'decimals'), [1.25, 2.5, 3.75]);
    expectSame(await cell(SHOWCASE.NULL_ELEMENTS, 'decimals'), [1, null, -2.5]);
    expectSame(await cell(SHOWCASE.EMPTIES, 'decimals'), []);
    expect(await cell(SHOWCASE.ALL_NULL, 'decimals')).toBeNull();
  });

  it('reads integers beyond 2^53 as bigints and those within as numbers', async () => {
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'big_ints'), [
      9007199254740991,
      9007199254740993n,
      -9223372036854775808n,
      9223372036854775807n,
    ]);
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'ubig'), [
      0,
      9007199254740993n,
      18446744073709551615n,
    ]);
  });

  it('keeps NaN, the infinities and -0, and FLOATs at their float32 value', async () => {
    const doubles = (await cell(SHOWCASE.NUMERIC_EXTREMES, 'doubles')) as number[];
    expectSame(doubles, [
      NaN,
      Infinity,
      -Infinity,
      -0,
      5e-324,
      1.7976931348623157e308,
      -1.7976931348623157e308,
      0.1,
    ]);
    expect(Object.is(doubles[3], -0)).toBe(true);

    const embedding = (await cell(SHOWCASE.NUMERIC_EXTREMES, 'embedding')) as number[];
    expect(embedding).toHaveLength(32);
    expectSame(embedding.slice(0, 4), [NaN, Infinity, -Infinity, -0]);
    for (const value of embedding) expect(Object.is(Math.fround(value), value)).toBe(true);
    expect(embedding[4]).toBe(1.401298464324817e-45);
    // A fixed-size list is never NULL: the all-NULL row holds 32 NULL elements.
    expectSame(await cell(SHOWCASE.ALL_NULL, 'embedding'), new Array(32).fill(null));
  });

  it('reads a MAP as a Map, keys in order, `size` and `__proto__` keys like any other', async () => {
    const attrs = await cell(SHOWCASE.NAME_COLLISIONS, 'attrs');
    expect(attrs).toBeInstanceOf(Map);
    expect([...(attrs as Map<string, number>).entries()]).toEqual([
      ['size', 1],
      ['toJSON', 2],
      ['constructor', 3],
      ['__proto__', 4],
      ['2', 5],
      ['1', 6],
      ['k=v', 7],
      ['k_v', 8],
      ['K_V', 9],
    ]);
    expectSame(await cell(SHOWCASE.EMPTIES, 'attrs'), new Map());
    expectSame(
      await cell(SHOWCASE.NULL_ELEMENTS, 'attrs'),
      new Map([
        ['a', null],
        ['b', 1],
      ]),
    );
  });

  it('types MAP keys by the key type', async () => {
    expectSame(
      await cell(SHOWCASE.DEMO, 'int_keys'),
      new Map([
        [2, 'two'],
        [1, 'one'],
        [10, 'ten'],
      ]),
    );
    expectSame(
      await cell(SHOWCASE.DATE_BINARY_EDGES, 'date_keys'),
      new Map([
        ['0001-01-01', [1]],
        ['9999-12-31', [2, 3]],
        ['1970-01-01', []],
        ['1969-07-20', null],
      ]),
    );
    expectSame(
      await cell(SHOWCASE.DEMO, 'map_of_structs'),
      new Map([
        ['apple', { qty: 3, price: 1.25, note: 'fresh' }],
        ['pear', { qty: 1, price: 0.8, note: 'ripe' }],
      ]),
    );
  });

  it('reads a struct with 26 odd field names as own properties that clone', async () => {
    const value = (await cell(SHOWCASE.DEMO, 'odd_names')) as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    for (const [name, expected] of ODD_NAMES_DEMO) {
      expect(Object.hasOwn(value, name), name).toBe(true);
      expect(Object.getOwnPropertyDescriptor(value, name)?.value, name).toBe(expected);
    }
    expect(Object.keys(value)).toHaveLength(26);
    expectSame(structuredClone(value), value);
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);

    const extremes = (await cell(SHOWCASE.NUMERIC_EXTREMES, 'odd_names')) as Record<
      string,
      unknown
    >;
    expect(extremes['nanoseconds']).toBe(-9223372036854775808n);
    expect(extremes['ID']).toBe(9223372036854775807n);
    expect(extremes['x,y']).toBe(1.7976931348623157e308);
    expect(Object.getOwnPropertyDescriptor(extremes, '__proto__')?.value).toBeNull();
  });

  it('reads lists of structs and deep structs', async () => {
    expectSame(await cell(SHOWCASE.DEMO, 'people'), [
      { name: 'Ada', age: 36, langs: ['en', 'fr'] },
      { name: 'Linus', age: 54, langs: ['fi', 'sv', 'en'] },
    ]);
    expectSame(await cell(SHOWCASE.NULL_ELEMENTS, 'people'), [
      null,
      { name: null, age: null, langs: null },
      { name: 'Ada', age: 36, langs: ['en', null] },
    ]);
    expectSame(await cell(SHOWCASE.DEMO, 'nested_struct'), {
      owner: {
        name: 'Grace Hopper',
        contact: {
          email: 'grace.hopper@example.com',
          phones: ['+1-555-0100', '+1-555-0199'],
          address: { city: 'Arlington', zip: '22201' },
        },
      },
      version: 2,
    });
    expectSame(await cell(SHOWCASE.NULL_ELEMENTS, 'matrix'), [[1, null], null, []]);
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'matrix'), [[-32768, 32767], [0]]);
  });

  it('reads typed leaves: temporal, UUID and BLOB as DuckDB text, numbers exact', async () => {
    expectSame(await cell(SHOWCASE.DEMO, 'typed_leaves'), {
      // A DECIMAL is the double nearest its digits.
      dec38: Number('12345678901234567890'),
      dec18_4: 1.25,
      uuid: '12345678-1234-5678-1234-567812345678',
      blob: 'hello',
      time: '09:30:00',
      ts: '2024-01-01 09:30:00',
      tstz: '2024-01-01 09:30:00+00',
      date: '2024-01-01',
      flag: true,
      f32: Math.fround(0.1),
      i64: 9007199254740993n,
    });
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'typed_leaves'), {
      dec38: 1e38,
      dec18_4: Number('99999999999999.9999'),
      uuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      blob: '\\xFF\\xFF\\xFF\\xFF\\xFF\\xFF\\xFF\\xFF',
      time: '23:59:59.999999',
      ts: '9999-12-31 23:59:59.999999',
      tstz: '9999-12-31 23:59:59.999999+00',
      date: '9999-12-31',
      flag: true,
      f32: 3.4028234663852886e38,
      i64: -9223372036854775808n,
    });
    expectSame(await cell(SHOWCASE.DATE_BINARY_EDGES, 'blobs'), [
      '',
      '\\x00',
      '\\xFF',
      '\\x00\\xFF\\x80\\x7F\\x0A\\x27\\x22\\x5C',
    ]);
  });

  it('tells [NULL] from [NULL text], and reads JSON[] items from their JSON', async () => {
    expectSame(await cell(SHOWCASE.NULL_ELEMENTS, 'tier_list'), [null]);
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'tier_list'), ['NULL']);
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'json_list'), [
      9007199254740993n,
      -9223372036854775808n,
      18446744073709551615n,
      1.25,
      -0,
      5e-324,
    ]);
  });

  it('returns a JSON column’s text', async () => {
    const doc = await cell(SHOWCASE.DEMO, 'doc');
    expect(typeof doc).toBe('string');
    expect(JSON.parse(doc as string)).toEqual({
      k: 'alpha',
      score: 0.92,
      kind: 'demo',
      'my field': 'spaced key',
      'a.b': 'dotted key',
      'q"k': 'quoted key',
      ünï: 'unicode key',
    });
    expect(JSON.parse((await cell(SHOWCASE.LIST_2500, 'doc')) as string)).toBe(42);
    // The JSON literal null is text; SQL NULL is null.
    expect(await cell(SHOWCASE.LIST_10000, 'doc')).toBe('null');
    expect(await cell(SHOWCASE.ALL_NULL, 'doc')).toBeNull();
  });

  it('reads a 10,000-item list whole', async () => {
    const list = (await cell(SHOWCASE.LIST_10000, 'long_list')) as number[];
    expect(list).toHaveLength(10_000);
    expect(list[0]).toBe(1);
    expect(list[9_999]).toBe(10_000);
  });
});

describe('getCellValue on the JSON fixture', () => {
  const cell = (rowId: number, column: string) =>
    tableOn('nested_json').actions.getCellValue(rowId, column);

  it('reads BIGINT[] and HUGEINT[] exactly', async () => {
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'counts'), [
      0,
      9007199254740991,
      9007199254740993n,
      9223372036854775807n,
    ]);
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'signed'), [
      -9223372036854775808n,
      -1,
      0,
      9223372036854775807n,
    ]);
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'huge'), [
      9223372036854775808n,
      18446744073709551615n,
    ]);
    expectSame(
      await cell(SHOWCASE.NUMERIC_EXTREMES, 'floats'),
      [-0, 5e-324, 1.7976931348623157e308, -1.7976931348623157e308, 18446744073709552000],
    );
  });

  it('reads integer-named fields, maps and JSON lists', async () => {
    expect(await cell(SHOWCASE.NUMERIC_EXTREMES, 'key_order')).toEqual({ '2': 0, '1': 5 });
    expectSame(
      await cell(SHOWCASE.NAME_COLLISIONS, 'props'),
      new Map([
        ['a.b', 1],
        ['a_b', 2],
        ['A_B', 3],
        ['k=v', 4],
        ['k_v', 5],
        ['K_V', 6],
      ]),
    );
    expectSame(await cell(SHOWCASE.EMPTIES, 'empty_obj'), new Map());
    expectSame(await cell(SHOWCASE.DEMO, 'mixed_list'), [1, 'two', true, { k: 3 }, [4]]);
    expectSame(await cell(SHOWCASE.NUMERIC_EXTREMES, 'mixed_list'), [
      9007199254740993n,
      -9223372036854775808n,
      18446744073709551615n,
      -0,
    ]);
    expectSame(await cell(SHOWCASE.DEMO, 'depth5'), {
      l2: { l3: { l4: { l5: { leaf: 42 } } } },
    });
    expect(await cell(SHOWCASE.DEMO, 'shifty')).toBe('{"k":"demo","n":1}');
  });
});

describe('getCellValue on the SQL-only companions', () => {
  const cell = (rowId: number, column: string) =>
    tableOn('sql_only_v').actions.getCellValue(rowId, column);

  it('reads a UNION as { tag: value }, the same-text pair kept apart', async () => {
    expectSame(await cell(0, 'union_pair'), { i: 0 });
    expectSame(await cell(1, 'union_pair'), { s: '0' });
    expect(await cell(6, 'union_pair')).toBeNull();
    expectSame(await cell(0, 'union_nested'), { l: [0, null] });
    expectSame(await cell(1, 'union_nested'), { st: { a: 1, b: 'x1' } });
  });

  it('reads arrays, lists of arrays and an unnamed struct', async () => {
    expectSame(await cell(0, 'int_array3'), [0, 0, null]);
    expectSame(await cell(1, 'int_array3'), [1, 2, 3]);
    expectSame(await cell(3, 'int_pairs'), [
      [3, 0],
      [3, 1],
      [3, 2],
    ]);
    expectSame(await cell(0, 'int_pairs'), []);
    expectSame(await cell(0, 'unnamed_struct'), [0, 'r0']);
    expect(await cell(6, 'unnamed_struct')).toBeNull();

    const embedding = (await cell(1, 'embedding768')) as number[];
    expect(embedding).toHaveLength(768);
    embedding.forEach((value, k) => {
      expect(Object.is(Math.fround(value), value)).toBe(true);
      expect(Math.abs(value - Math.sin(768 + k))).toBeLessThan(1e-6);
    });
  });

  it('reads INTERVAL, ENUM and BIT leaves as DuckDB text', async () => {
    expectSame(await cell(1, 'intervals'), [
      '1 day',
      '1 month',
      '00:00:01.000003',
      '1 year 01:00:00',
    ]);
    expectSame(await cell(0, 'intervals'), ['00:00:00', '00:00:00', '00:00:00', null]);
    expectSame(await cell(2, 'enum_struct'), { e: "it's", n: 2 });
    expectSame(await cell(1, 'enum_struct'), { e: 'y,z', n: 1 });
    expectSame(await cell(2, 'bit_list'), ['10', '10101010', null]);
  });

  it('reads HUGEINT and UHUGEINT fields exactly', async () => {
    expectSame(await cell(0, 'huge_struct'), {
      h: 170141183460469231731687303715884105727n,
      u: 340282366920938463463374607431768211455n,
    });
    expectSame(await cell(1, 'huge_struct'), {
      h: -170141183460469231731687303715884105728n,
      u: 1,
    });
    expectSame(await cell(2, 'huge_struct'), {
      h: 200000000000000000000000n,
      u: 340282366920938463463374607431768211455n,
    });
  });

  it('reads VARIANT values, lists and fields', async () => {
    expectSame(await cell(0, 'variant_value'), 0);
    expectSame(await cell(1, 'variant_value'), 'text 1');
    expectSame(await cell(2, 'variant_value'), [2, null]);
    expectSame(await cell(3, 'variant_value'), { k: 3, s: 'v' });
    expect(await cell(4, 'variant_value')).toBeNull();
    expectSame(await cell(1, 'variant_list'), [1, 's1', null]);
    expect(await cell(6, 'variant_list')).toBeNull();
    expectSame(await cell(0, 'variant_struct'), { k: 0 });
    expectSame(await cell(1, 'variant_struct'), { k: 'v1' });
  });

  it('reads STRUCT and LIST map keys as their DuckDB text', async () => {
    expectSame(
      await cell(0, 'struct_key_map'),
      new Map([
        ["{'k': 0}", 'a0'],
        ["{'k': 1}", 'b0'],
      ]),
    );
    expectSame(
      await cell(1, 'list_key_map'),
      new Map([
        ['[1]', 1],
        ['[1, 0]', 2],
      ]),
    );
  });
});

describe.each([
  ['the worker path', () => workerBridge],
  ['conn.query', () => nodeBridge],
] as const)('top-level scalars through %s', (_path, bridgeOf) => {
  const table = () => tableOn('scalars', bridgeOf());

  it.each([
    ['iv', ['1 year 2 months 3 days 04:05:06', '1 day']],
    ['e', ['b', 'a']],
    ['b', ['10101', '1']],
    ['g', ['POINT (1 2)', 'LINESTRING (0 0, 1 1)']],
    ['ttz', ['03:04:05.5+02:30', '00:00:00+00']],
    // Arrow's number for a TIME_NS is nanoseconds, where a 'time' column's is microseconds.
    ['tns', ['03:04:05.123456789', '00:00:00']],
    ['bn', ['123456789012345678901234567890', '-1']],
    ['u', ['11fde503-bf17-47ee-b458-3ce648530d3d', '00000000-0000-0000-0000-000000000000']],
    ['j', ['{"a": [1, 2.50]}', '[]']],
  ] as const)('reads %s as DuckDB text', async (column, [first, second]) => {
    const { actions } = table();
    expect(await actions.getCellValue(0, column)).toBe(first);
    expect(await actions.getCellValue(1n, column)).toBe(second);
    expect(await actions.getCellValue(2, column)).toBeNull();
    expect(await actions.getColumnValues(column)).toEqual([first, second, null]);
  });

  it('reads wide integers exactly, as bigints', async () => {
    const { actions } = table();
    expect(await actions.getCellValue(0, 'uh')).toBe(340282366920938463463374607431768211455n);
    expect(await actions.getCellValue(1, 'uh')).toBe(12n);
    expect(await actions.getCellValue(0, 'h')).toBe(170141183460469231731687303715884105727n);
    expect(await actions.getCellValue(1, 'h')).toBe(-12n);
    expect(await actions.getCellValue(0, 'ub')).toBe(18446744073709551615n);
    expect(await actions.getCellValue(0, 'bi')).toBe(9007199254740993n);
    expect(await actions.getCellValue(1, 'bi')).toBe(-9223372036854775808n);
    expect(await actions.getCellValue(2, 'bi')).toBeNull();

    // A BigInt64Array when every value fits it...
    const bi = await actions.getColumnValues('bi', { limit: 2 });
    expect(bi).toBeInstanceOf(BigInt64Array);
    expect(Array.from(bi as BigInt64Array)).toEqual([9007199254740993n, -9223372036854775808n]);
    const small = await actions.getColumnValues('uh', { offset: 1, limit: 1 });
    expect(small).toBeInstanceOf(BigInt64Array);
    expect(Array.from(small as BigInt64Array)).toEqual([12n]);
    // ...else an array: numbers when exact, bigints beyond.
    expectSame(await actions.getColumnValues('uh', { limit: 2 }), [
      340282366920938463463374607431768211455n,
      12,
    ]);
    expectSame(await actions.getColumnValues('uh'), [
      340282366920938463463374607431768211455n,
      12,
      null,
    ]);
  });

  it('reads a UINTEGER past 2^31 - 1 as a number', async () => {
    const { actions } = table();
    expect(await actions.getCellValue(0, 'ui')).toBe(4294967295);
    expect(await actions.getColumnValues('ui', { limit: 2 })).toEqual([4294967295, 7]);
    const fits = await actions.getColumnValues('ui', { offset: 1, limit: 1 });
    expect(fits).toBeInstanceOf(Int32Array);
    expect(Array.from(fits as Int32Array)).toEqual([7]);
  });

  it('reads DECIMALs as the nearest double', async () => {
    const { actions } = table();
    expect(await actions.getCellValue(0, 'd4')).toBe(1.2345);
    expect(await actions.getCellValue(1, 'd4')).toBe(0.0001);
    expect(await actions.getCellValue(0, 'd2')).toBe(1.25);
    expect(await actions.getCellValue(1, 'd2')).toBe(-2.5);
    expect(await actions.getCellValue(0, 'd38')).toBe(
      Number('-12345678901234567890.123456789012345678'),
    );
    const d4 = await actions.getColumnValues('d4', { limit: 2 });
    expect(d4).toBeInstanceOf(Float64Array);
    expect(Array.from(d4 as Float64Array)).toEqual([1.2345, 0.0001]);
    expect(await actions.getColumnValues('d38')).toEqual([
      Number('-12345678901234567890.123456789012345678'),
      1,
      null,
    ]);
  });

  it('keeps a BLOB a Uint8Array, a DATE epoch milliseconds, and __rowid__ a BigInt64Array', async () => {
    const { actions } = table();
    expect(await actions.getCellValue(0, 'bl')).toEqual(new Uint8Array([0xaa, 0xbb]));
    expect(await actions.getCellValue(1, 'bl')).toEqual(new Uint8Array(0));
    expect(await actions.getCellValue(0, 'dt')).toBe(Date.UTC(2024, 0, 2));
    const rowIds = await actions.getColumnValues('__rowid__');
    expect(rowIds).toBeInstanceOf(BigInt64Array);
    expect(Array.from(rowIds as BigInt64Array)).toEqual([0n, 1n, 2n]);
    expect(await actions.getCellValue(2, '__rowid__')).toBe(2n);
  });

  it('rejects a rowid no row has', async () => {
    await expect(table().actions.getCellValue(3, 'iv')).rejects.toMatchObject({
      name: 'QueryError',
      code: 'INVALID_ROWID',
      details: { rowId: 3 },
    });
  });
});

describe('dates and timestamps at infinity and at the ends of their range', () => {
  // Rows: the infinities, NULL, an ordinary value, each type's last and
  // first values. Arrow's getter threw on TIMESTAMP's infinity and its ends
  // (`… is not safe to convert to a number`) and read DATE's infinity as
  // 185542587100800000.
  beforeAll(async () => {
    await harness.conn.query(`
      CREATE OR REPLACE TABLE temporals AS
      SELECT CAST(r AS BIGINT) AS "__rowid__", CAST(ts AS TIMESTAMP) AS ts,
        CAST(ts_s AS TIMESTAMP_S) AS ts_s, CAST(ts_ms AS TIMESTAMP_MS) AS ts_ms,
        CAST(ts_ns AS TIMESTAMP_NS) AS ts_ns, CAST(tstz AS TIMESTAMPTZ) AS tstz,
        CAST(d AS DATE) AS d
      FROM (VALUES
        (0, 'infinity', 'infinity', 'infinity', 'infinity', 'infinity', 'infinity'),
        (1, '-infinity', '-infinity', '-infinity', '-infinity', '-infinity', '-infinity'),
        (2, NULL, NULL, NULL, NULL, NULL, NULL),
        (3, '2024-01-02 03:04:05.123456', '2024-01-02 03:04:05', '2024-01-02 03:04:05.123',
         '2024-01-02 03:04:05.123456789', '2024-01-02 03:04:05.123456+00', '2024-01-02'),
        (4, '294247-01-10 04:00:54.775806', '294247-01-10 04:00:54', '294247-01-10 04:00:54.775',
         '2262-04-11 23:47:16.854775806', '294247-01-10 04:00:54.775806+00', '5881580-07-10'),
        (5, '290309-12-22 (BC) 00:00:00', '290309-12-22 (BC) 00:00:00',
         '290309-12-22 (BC) 00:00:00', '1677-09-22', '290309-12-22 (BC) 00:00:00+00',
         '5877642-06-25 (BC)')
      ) AS v(r, ts, ts_s, ts_ms, ts_ns, tstz, d)`);
    relations.set('temporals', { schema: await describeSchema('temporals'), rows: 6 });
  });

  // Epoch milliseconds, as Arrow reads them; past ±2^53 the nearest number.
  const EXPECTED: [string, (number | null)[]][] = [
    [
      'ts',
      [
        Infinity,
        -Infinity,
        null,
        1_704_164_645_123.456,
        9_223_372_036_854_776,
        -9_223_372_022_400_000,
      ],
    ],
    [
      'ts_s',
      [Infinity, -Infinity, null, 1_704_164_645_000, 9_223_372_036_854_000, -9_223_372_022_400_000],
    ],
    [
      'ts_ms',
      [Infinity, -Infinity, null, 1_704_164_645_123, 9_223_372_036_854_776, -9_223_372_022_400_000],
    ],
    [
      'ts_ns',
      [
        Infinity,
        -Infinity,
        null,
        1_704_164_645_123.4568,
        9_223_372_036_854.775,
        -9_223_286_400_000,
      ],
    ],
    [
      'tstz',
      [
        Infinity,
        -Infinity,
        null,
        1_704_164_645_123.456,
        9_223_372_036_854_776,
        -9_223_372_022_400_000,
      ],
    ],
    [
      'd',
      [
        Infinity,
        -Infinity,
        null,
        1_704_153_600_000,
        185_542_587_014_400_000,
        -185_542_587_014_400_000,
      ],
    ],
  ];

  describe.each([
    ['the worker path', () => workerBridge],
    ['conn.query', () => nodeBridge],
  ] as const)('through %s', (_path, bridgeOf) => {
    it('the columns are the types they claim', () => {
      const { schema } = tableOn('temporals', bridgeOf());
      expect(schema.map((c) => [c.name, c.type, c.originalType])).toEqual([
        ['__rowid__', 'integer', 'BIGINT'],
        ['ts', 'timestamp', 'TIMESTAMP'],
        ['ts_s', 'timestamp', 'TIMESTAMP_S'],
        ['ts_ms', 'timestamp', 'TIMESTAMP_MS'],
        ['ts_ns', 'timestamp', 'TIMESTAMP_NS'],
        ['tstz', 'timestamp', 'TIMESTAMP WITH TIME ZONE'],
        ['d', 'date', 'DATE'],
      ]);
    });

    it.each(EXPECTED)('getCellValue reads %s, infinity as ±Infinity', async (column, expected) => {
      const { actions } = tableOn('temporals', bridgeOf());
      for (const [rowId, value] of expected.entries()) {
        expect(await actions.getCellValue(rowId, column), `row ${rowId}`).toBe(value);
      }
    });

    it.each(EXPECTED)(
      'getColumnValues reads %s the same, in an array',
      async (column, expected) => {
        const { actions } = tableOn('temporals', bridgeOf());
        const values = await actions.getColumnValues(column);
        expect(Array.isArray(values)).toBe(true);
        expect(values).toEqual(expected);
        // Without the NULL row, still an array: no typed array holds a date.
        const infinities = await actions.getColumnValues(column, { limit: 2 });
        expect(Array.isArray(infinities)).toBe(true);
        expect(infinities).toEqual([Infinity, -Infinity]);
      },
    );
  });
});

describe('a struct field named ""', () => {
  beforeAll(async () => {
    const loader = makeNodeBridge(harness.conn, harness.db);
    const { tableName, schema } = await loader.loadData(
      '{"s":{"b":2,"":1}}\n{"s":{"b":3,"":4}}\n',
      { format: 'json', tableName: 'empty_name' },
    );
    relations.set(tableName, { schema, rows: 2 });
    // The same struct in a type holding a VARIANT, read through VARIANT.
    await harness.conn.query(
      `CREATE VIEW empty_name_v AS SELECT "__rowid__", struct_insert(s, v := 7::VARIANT) AS sv FROM empty_name`,
    );
    relations.set('empty_name_v', { schema: await describeSchema('empty_name_v'), rows: 2 });
  });

  it('is read as an object keyed "", as DuckDB writes the struct, not as a tuple', async () => {
    const { actions, schema } = tableOn('empty_name');
    expect(schema.find((c) => c.name === 's')!.originalType).toBe('STRUCT(b BIGINT,  BIGINT)');
    expectSame(await actions.getCellValue(0, 's'), { b: 2, '': 1 });
    expectSame(await actions.getColumnValues('s'), [
      { b: 2, '': 1 },
      { b: 3, '': 4 },
    ]);
  });

  it('keeps its value in a type holding a VARIANT', async () => {
    const { actions, schema } = tableOn('empty_name_v');
    expect(schema.find((c) => c.name === 'sv')!.originalType).toBe(
      'STRUCT(b BIGINT,  BIGINT, v VARIANT)',
    );
    expectSame(await actions.getCellValue(1, 'sv'), { b: 3, '': 4, v: 7 });
  });
});

describe('a union inside a type holding a VARIANT', () => {
  beforeAll(async () => {
    const union = 'UNION(a STRUCT(b BIGINT), b DOUBLE)';
    await harness.conn.query(`
      CREATE VIEW union_in_variant AS
      SELECT 0::BIGINT AS "__rowid__",
        {'u': union_value(a := {'b': 9007199254740993::BIGINT})::${union}, 'v': 1::VARIANT} AS s
      UNION ALL
      SELECT 1, {'u': union_value(b := 2.5)::${union}, 'v': 'x'::VARIANT}`);
    relations.set('union_in_variant', {
      schema: await describeSchema('union_in_variant'),
      rows: 2,
    });
  });

  it('reads a struct member as the struct, not as the member its field is named like', async () => {
    // Through VARIANT the union loses its tag: {"u":{"b":9007199254740993},…}
    // is member a's struct, whose field b is no DOUBLE.
    const { actions } = tableOn('union_in_variant');
    const values = [
      { u: { b: 9007199254740993n }, v: 1 },
      { u: 2.5, v: 'x' },
    ];
    expectSame(await actions.getCellValue(0, 's'), values[0]);
    expectSame(await actions.getColumnValues('s'), values);
  });
});

describe('getColumnValues agrees with getCellValue', () => {
  /** Rows read one by one: every showcase row, and a few seeded ones. */
  const sampleRows = (rows: number): number[] =>
    rows > 100
      ? [...Object.values(SHOWCASE), 37, 99, 250, 500, rows - 1]
      : Array.from({ length: Math.min(rows, 14) }, (_, i) => i);

  describe.each(['nested_parquet', 'nested_json', 'sql_only_v'])('%s', (relation) => {
    it('in every scope, for every nested column', async () => {
      const { state, actions, rows } = tableOn(relation);
      const columns = nestedColumns(relation);
      expect(columns.length).toBeGreaterThan(10);

      for (const column of columns) {
        const all = (await actions.getColumnValues(column)) as unknown[];
        expect(Array.isArray(all), column).toBe(true);
        expect(all, column).toHaveLength(rows);
        for (const rowId of sampleRows(rows)) {
          expectSame(all[rowId], await actions.getCellValue(rowId, column), `${column}[${rowId}]`);
        }
        expectSame(
          await actions.getColumnValues(column, { limit: 3, offset: 2 }),
          all.slice(2, 5),
          `${column} limit/offset`,
        );

        // Filtered: ids 3 to 12, in rowid order.
        actions.addFilter({ type: 'range', column: 'id', min: 3, max: 13 });
        expectSame(
          await actions.getColumnValues(column, { scope: 'filtered' }),
          all.slice(3, 13),
          `${column} filtered`,
        );
        expectSame(
          await actions.getColumnValues(column, { scope: 'filtered', limit: 4, offset: 2 }),
          all.slice(5, 9),
          `${column} filtered limit/offset`,
        );

        // Selected, in a view sorted by id descending and filtered: view
        // positions 0, 2 and 9 are ids 12, 10 and 3.
        actions.setSort([{ column: 'id', direction: 'desc' }]);
        state.selectedRows.set(new Set([9, 0, 2]));
        expectSame(
          await actions.getColumnValues(column, { scope: 'selected' }),
          [all[12], all[10], all[3]],
          `${column} selected`,
        );
        expectSame(
          await actions.getColumnValues(column, { scope: 'selected', limit: 1, offset: 1 }),
          [all[10]],
          `${column} selected limit/offset`,
        );

        // Selected without the filter: the last row of the view is id 0.
        actions.clearFilters();
        state.selectedRows.set(new Set([0, rows - 1]));
        expectSame(
          await actions.getColumnValues(column, { scope: 'selected' }),
          [all[rows - 1], all[0]],
          `${column} selected, unfiltered`,
        );
        actions.setSort([]);
        state.selectedRows.set(new Set());
      }
    }, 120_000);
  });
});

describe('getColumnValues of a page reads the page’s rows only', () => {
  beforeAll(async () => {
    // `boom` cannot be computed outside rows 10 to 14, as a derived column's
    // expression might fail on rows nobody asked for.
    await harness.conn.query(
      `CREATE OR REPLACE TABLE page_base AS SELECT CAST(range AS BIGINT) AS "__rowid__",
         CAST(range % 4 AS INTEGER) AS k FROM range(5000)`,
    );
    await harness.conn.query(
      `CREATE OR REPLACE VIEW page_view AS SELECT *,
         CASE WHEN "__rowid__" BETWEEN 10 AND 14 THEN ["__rowid__", k]
           ELSE error('boom computed for row ' || "__rowid__") END AS boom
       FROM page_base`,
    );
    relations.set('page_view', { schema: await describeSchema('page_view'), rows: 5000 });
  });

  it.each([
    ['filtered', []],
    ['all', [{ column: 'k', direction: 'desc' }]],
  ] as const)('scope %s, sorted by %j', async (scope, sort) => {
    const { actions } = tableOn('page_view');
    actions.setSort([...sort]);
    expectSame(await actions.getColumnValues('boom', { scope, limit: 5, offset: 10 }), [
      [10, 2],
      [11, 3],
      [12, 0],
      [13, 1],
      [14, 2],
    ]);
    expect(await actions.getColumnValues('k', { scope, offset: 12, limit: 2 })).toEqual(
      new Int32Array([0, 1]),
    );
  });
});

describe('getColumnValues of selected rows, sorted by a VARIANT whose values differ in kind', () => {
  // variant_value holds numbers, text, lists, structs and NULL. A window's
  // ORDER BY cannot compare two of different kinds; the grid's plain ORDER
  // BY can, and the selection's positions are positions in that order.
  const CASES = [
    ['asc', 'one run', [0, 1, 2, 3]],
    ['desc', 'one run', [5, 6, 7]],
    ['asc', 'not one run', [0, 3, 7, 11, 19, SQL_ONLY_ROWS - 1]],
    ['desc', 'not one run', [1, 4, 13, 30]],
  ] as const;

  it.each(CASES)('%s, %s: every column, in the order the grid shows', async (direction, _, at) => {
    const { state, actions, schema } = tableOn('sql_only_v');
    actions.setSort([{ column: 'variant_value', direction }]);
    state.selectedRows.set(new Set(at));
    const order = await executeQueryCancellable<{ r: number }>(
      `SELECT "__rowid__" AS r FROM "sql_only_v" ` +
        `ORDER BY "variant_value" ${direction.toUpperCase()}, "__rowid__" ASC`,
    );
    const rowIds = at.map((position) => Number(order[position]!.r));
    for (const column of schema) {
      const values = await actions.getColumnValues(column.name, { scope: 'selected' });
      const expected: unknown[] = [];
      for (const rowId of rowIds) expected.push(await actions.getCellValue(rowId, column.name));
      expectSame(Array.from(values as ArrayLike<unknown>), expected, column.name);
    }
  });
});

describe('the JSON channel', () => {
  it.each(['nested_parquet', 'nested_json', 'sql_only_v'])(
    'prints every nested value of %s as standard JSON',
    async (relation) => {
      const { schema } = relations.get(relation)!;
      for (const column of schema.filter((c) => c.type === 'nested' || c.originalType === 'JSON')) {
        const rows = await executeQueryCancellable<{ j: string | null }>(
          `SELECT ${jsonValueSQL(column, quoteIdentifier(column.name))} AS j` +
            ` FROM ${quoteIdentifier(relation)} ORDER BY "__rowid__"`,
        );
        for (const { j } of rows) {
          if (j === null) continue;
          const { root, truncated } = parseJsonTree(j);
          expect(truncated, column.name).toBe(false);
          expect(() => JSON.parse(prettyJson(root)), column.name).not.toThrow();
          expect(() => JSON.parse(prettyJson(root, 0)), column.name).not.toThrow();
        }
      }
    },
    60_000,
  );
});
