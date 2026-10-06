/**
 * readJsonValue on real DuckDB: it reads the JSON text `jsonValueSQL`
 * writes exactly as `materialize(parseJsonTree(text).root, type, mode)`
 * does, value for value, in both modes, for every nested column of the
 * nested stress fixture (both files) and of the SQL-only companions, and
 * for a table of the types it reads with `JSON.parse`, holding the values
 * `JSON.parse` rejects (NaN, ±Infinity) or might read otherwise (-0, FLOAT
 * digits, odd field names, integer extremes).
 *
 * The text is read the way the library reads it: with the worker's own
 * `executeQueryCancellable`, rows converted as the worker posts them.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { parseDuckDBType } from '@/core/duckdbType';
import { materialize, parseJsonTree } from '@/core/jsonTree';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { readJsonValue } from '@/data/cellValue';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { jsonValueSQL } from '@/data/valueSql';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { exportToJSON } from '@/export/JSONExport';
import { __setConnForTests, executeQueryCancellable } from '@/worker/duckdb';
import { quoteIdentifier } from '@/worker/loaders/common';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { loadNestedFixture } from '../helpers/nestedFixture';
import { createSqlOnlyTable, createSqlOnlyView } from '../helpers/nestedSql';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;
let bridge: WorkerBridge;

/** Every relation the tests read, with its schema and row count. */
const relations = new Map<string, { schema: ColumnSchema[]; rows: number }>();

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
  bridge = {
    ...makeNodeBridge(harness.conn),
    query: <T>(sql: string) => executeQueryCancellable<T>(sql),
  } as unknown as WorkerBridge;

  for (const format of ['parquet', 'json'] as const) {
    const loaded = await loadNestedFixture(harness, format);
    relations.set(loaded.tableName, { schema: loaded.schema, rows: loaded.rowCount });
  }
  await createSqlOnlyTable(harness.conn, 'sql_only', 70);
  await createSqlOnlyView(harness.conn, 'sql_only_v', 'sql_only');
  relations.set('sql_only_v', { schema: await describeSchema('sql_only_v'), rows: 70 });

  // The types read with JSON.parse, with the values that could tell the two
  // readers apart: NaN and ±Infinity (JSON.parse rejects them), -0, FLOAT
  // digits, field names that are JS keys or need quoting, integer extremes.
  const S = `STRUCT("x,y" DOUBLE, "2" INTEGER, "1" FLOAT, "__proto__" DOUBLE, "q""d" BOOLEAN, "ünï" DOUBLE, "toJSON" UINTEGER, "a b" SMALLINT[])`;
  const SMALL = 'STRUCT(t TINYINT[], ut UTINYINT[], us USMALLINT[])';
  await harness.conn.query(`
    CREATE OR REPLACE TABLE native_types AS
    SELECT CAST(r AS BIGINT) AS "__rowid__", CAST(f AS FLOAT[]) AS f, CAST(d AS DOUBLE[]) AS d,
      CAST(s AS ${S}) AS s, CAST(n AS INTEGER[][]) AS n, CAST(u AS UINTEGER[3]) AS u,
      CAST(b AS BOOLEAN[]) AS b, CAST(small AS ${SMALL}) AS small
    FROM (VALUES
      (0,
       [0.1, -0.0, 1e-45, 3.4028235e38, 16777217, 1.0, 100, 1e20, 1e-7]::FLOAT[],
       [0.1, -0.0, 5e-324, 1.7976931348623157e308, 9007199254740993, 1e21, 1e-7, 123456789012345680000]::DOUBLE[],
       {'x,y': -0.0, '2': 2, '1': 1.5, '__proto__': 3, 'q"d': true, 'ünï': NULL, 'toJSON': 4294967295, 'a b': [-32768, 32767]}::${S},
       [[1, NULL], [], NULL, [-2147483648, 2147483647]]::INTEGER[][],
       [4294967295, 0, NULL]::UINTEGER[],
       [true, false, NULL]::BOOLEAN[],
       {'t': [-128, 127], 'ut': [0, 255], 'us': [65535]}::${SMALL}),
      (1,
       ['nan'::FLOAT, 'inf'::FLOAT, '-inf'::FLOAT, 0.5]::FLOAT[],
       ['nan'::DOUBLE, 2.5, '-inf'::DOUBLE]::DOUBLE[],
       {'x,y': 'inf'::DOUBLE, '2': NULL, '1': 'nan'::FLOAT, '__proto__': NULL, 'q"d': NULL, 'ünï': -1e300, 'toJSON': 0, 'a b': []}::${S},
       [[]]::INTEGER[][],
       [1, 2, 3]::UINTEGER[],
       []::BOOLEAN[],
       {'t': NULL, 'ut': [], 'us': [NULL]}::${SMALL}),
      (2, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      (3, []::FLOAT[], [NULL]::DOUBLE[], NULL, [NULL]::INTEGER[][], NULL, [NULL]::BOOLEAN[], NULL)
    ) AS v(r, f, d, s, n, u, b, small)`);
  relations.set('native_types', { schema: await describeSchema('native_types'), rows: 4 });
}, 120_000);

afterAll(async () => {
  __setConnForTests(null);
  await harness?.cleanup();
});

/**
 * A value as plain JSON-able data that keeps what `toEqual` glosses over:
 * Map entry order, -0, bigint against number, NaN and the infinities, an
 * object's own keys in order and its prototype.
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
  if (value !== null && typeof value === 'object') {
    return {
      plain: Object.getPrototypeOf(value) === Object.prototype,
      object: Object.entries(value).map(([k, v]) => [k, canon(v)]),
    };
  }
  return value;
}

function nestedColumns(relation: string): ColumnSchema[] {
  return relations.get(relation)!.schema.filter((c) => c.type === 'nested');
}

/** Each row's JSON text for `column`, NULL left out. */
async function texts(relation: string, column: ColumnSchema): Promise<string[]> {
  const rows = await executeQueryCancellable<{ j: string | null }>(
    `SELECT ${jsonValueSQL(column, quoteIdentifier(column.name))} AS j` +
      ` FROM ${quoteIdentifier(relation)} ORDER BY "__rowid__"`,
  );
  return rows.map((row) => row.j).filter((j): j is string => j !== null);
}

describe('readJsonValue gives what materialize gives', () => {
  it.each(['nested_parquet', 'nested_json', 'sql_only_v', 'native_types'])(
    'for every nested column of %s, in both modes',
    async (relation) => {
      const columns = nestedColumns(relation);
      expect(columns.length).toBeGreaterThan(5);
      for (const column of columns) {
        const type = parseDuckDBType(column.originalType);
        for (const text of await texts(relation, column)) {
          for (const mode of ['value', 'export'] as const) {
            const expected = materialize(parseJsonTree(text).root, type, mode);
            expect(
              canon(readJsonValue(text, type, mode)),
              `${column.name} ${mode}: ${text}`,
            ).toEqual(canon(expected));
          }
        }
      }
    },
    60_000,
  );

  it('reads lists, arrays and named structs of numbers and booleans with JSON.parse', async () => {
    const parse = vi.spyOn(JSON, 'parse');
    try {
      const cases: [relation: string, column: string, native: boolean][] = [
        ...nestedColumns('native_types').map((c) => ['native_types', c.name, true] as const),
        ['sql_only_v', 'embedding768', true],
        ['sql_only_v', 'int_array3', true],
        ['sql_only_v', 'int_pairs', true],
        ['sql_only_v', 'huge_struct', false],
        ['sql_only_v', 'union_pair', false],
        ['sql_only_v', 'struct_key_map', false],
        ['sql_only_v', 'unnamed_struct', false],
        ['sql_only_v', 'variant_list', false],
        ['nested_parquet', 'big_ints', false],
        ['nested_parquet', 'decimals', false],
        ['nested_parquet', 'tags', false],
      ];
      for (const [relation, name, native] of cases) {
        const column = nestedColumns(relation).find((c) => c.name === name)!;
        const type = parseDuckDBType(column.originalType);
        const values = await texts(relation, column);
        parse.mockClear();
        for (const text of values) readJsonValue(text, type, 'value');
        expect(parse.mock.calls.length, name).toBe(native ? values.length : 0);
      }
      // NaN: JSON.parse rejects the row, which is read losslessly.
      const f = parseDuckDBType('FLOAT[]');
      parse.mockClear();
      expect(canon(readJsonValue('[NaN,-0.0,0.10000000149011612]', f, 'value'))).toEqual(
        canon([NaN, -0, Math.fround(0.1)]),
      );
      expect(canon(readJsonValue('[Infinity,-0.0]', f, 'export'))).toEqual(canon([null, -0]));
      expect(parse).toHaveBeenCalledTimes(2);
    } finally {
      parse.mockRestore();
    }
  });
});

describe('the readers that use it', () => {
  function actionsOn(relation: string): StateActions {
    const { schema, rows } = relations.get(relation)!;
    const state = createTableState();
    initializeColumnsFromSchema(state, schema);
    state.tableName.set(relation);
    state.baseTableName.set(relation);
    state.totalRows.set(rows);
    state.filteredRows.set(rows);
    return new StateActions(state, bridge);
  }

  it('getColumnValues and getCellValue read native_types as materialize does', async () => {
    const actions = actionsOn('native_types');
    for (const column of nestedColumns('native_types')) {
      const type = parseDuckDBType(column.originalType);
      const rows = await executeQueryCancellable<{ j: string | null }>(
        `SELECT ${jsonValueSQL(column, quoteIdentifier(column.name))} AS j` +
          ` FROM "native_types" ORDER BY "__rowid__"`,
      );
      const expected = rows.map((row) =>
        row.j === null ? null : materialize(parseJsonTree(row.j).root, type, 'value'),
      );
      expect(canon(await actions.getColumnValues(column.name)), column.name).toEqual(
        canon(expected),
      );
      for (let rowId = 0; rowId < rows.length; rowId++) {
        expect(canon(await actions.getCellValue(rowId, column.name)), column.name).toEqual(
          canon(expected[rowId]),
        );
      }
    }
  });

  it('getColumnValues and a JSON export read an embedding with JSON.parse', async () => {
    const { schema } = relations.get('sql_only_v')!;
    const rows = (
      await texts(
        'sql_only_v',
        schema.find((c) => c.name === 'embedding768')!,
      )
    ).length;
    const parse = vi.spyOn(JSON, 'parse');
    /** Calls on an embedding's text: 768 numbers. */
    const embeddingParses = () =>
      parse.mock.calls.filter(
        ([text]) => typeof text === 'string' && text.split(',').length === 768,
      ).length;
    try {
      const values = (await actionsOn('sql_only_v').getColumnValues('embedding768')) as unknown[];
      expect(values.filter((v) => v !== null)).toHaveLength(rows);
      expect(embeddingParses()).toBe(rows);
      parse.mockClear();
      await exportToJSON(
        'sql_only_v',
        { scope: 'all', columns: ['id', 'embedding768'], format: 'ndjson' },
        {
          bridge,
          filters: [],
          sortColumns: [],
          selectedRows: new Set(),
          columnOrder: schema.map((c) => c.name),
          schema,
        },
      );
      expect(embeddingParses()).toBe(rows);
    } finally {
      parse.mockRestore();
    }
  });

  it('a JSON export of native_types holds what materialize gives, NaN and ±Infinity as null', async () => {
    const { schema } = relations.get('native_types')!;
    const json = await exportToJSON(
      'native_types',
      { scope: 'all', format: 'array' },
      {
        bridge,
        filters: [],
        sortColumns: [],
        selectedRows: new Set(),
        columnOrder: schema.map((c) => c.name),
        schema,
      },
    );
    const rows = JSON.parse(json) as Record<string, unknown>[];
    expect(rows[1]!['f']).toEqual([null, null, null, 0.5]);
    expect(rows[0]!['d']).toEqual([
      0.1, 0, 5e-324, 1.7976931348623157e308, 9007199254740992, 1e21, 1e-7, 123456789012345680000,
    ]);
    expect(Object.keys(rows[0]!['s'] as object)).toEqual([
      '1',
      '2',
      'x,y',
      '__proto__',
      'q"d',
      'ünï',
      'toJSON',
      'a b',
    ]);
  });
});
