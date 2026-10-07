/**
 * How CSV and JSON exports read each column, and that Parquet export reads
 * every column as it is.
 *
 * A nested column (LIST, ARRAY, STRUCT, MAP, UNION, VARIANT) is read as its
 * exact JSON text (`jsonValueSQL`), and dates, times, INTERVAL, BLOB, BIT,
 * GEOMETRY, BIGNUM and ENUM columns as DuckDB's text, a TIMESTAMP WITH TIME
 * ZONE in UTC, each under its own name. The values Arrow returns for them
 * are wrong or unusable in a file. Every other column, a JSON one included,
 * is read as it is.
 */
import { describe, it, expect } from 'vitest';

import type { ColumnSchema, SortColumn } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import {
  buildBaseQuery,
  buildSelectQuery,
  buildSelectedRowsQuery,
  exportColumnRead,
  exportJsonColumns,
  exportTimestampColumns,
  type ExportContext,
} from '@/export/ExportQuery';
import { buildParquetQuery } from '@/export/ParquetExport';

function column(name: string, originalType: string): ColumnSchema {
  return { name, type: mapDuckDBType(originalType), nullable: true, originalType };
}

const SCHEMA: ColumnSchema[] = [
  { ...column('__rowid__', 'BIGINT'), system: true },
  column('id', 'INTEGER'),
  column('name', 'VARCHAR'),
  column('price', 'DOUBLE'),
  column('amount', 'DECIMAL(10,2)'),
  column('day', 'DATE'),
  column('at', 'TIMESTAMP WITH TIME ZONE'),
  column('flag', 'BOOLEAN'),
  column('uid', 'UUID'),
  column('doc', 'JSON'),
  column('tags', 'VARCHAR[]'),
  column('embedding', 'FLOAT[768]'),
  column('point', 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)'),
  column('attrs', 'MAP(VARCHAR, INTEGER)'),
  column('choice', 'UNION(i INTEGER, s VARCHAR)'),
  column('v', 'VARIANT'),
  column('vl', 'VARIANT[]'),
  column('vs', 'STRUCT(k VARIANT)'),
  column('docs', 'JSON[]'),
  column('span', 'INTERVAL'),
  column('bytes', 'BLOB'),
  column('bits', 'BIT'),
  column('shape', 'GEOMETRY'),
  column('huge', 'BIGNUM'),
  column('mood', "ENUM('sad', 'it''s ok')"),
  column('my "col"', 'INTEGER[]'),
  column('x,y', 'VARCHAR'),
  column('tz', 'TIME WITH TIME ZONE'),
  column('tns', 'TIME_NS'),
  column('wide', 'DECIMAL(18,17)'),
  column('dec', 'DECIMAL'),
  column('tm', 'TIME'),
  column('ts', 'TIMESTAMP'),
  column('tsns', 'TIMESTAMP_NS'),
  column('tstz', 'TIMESTAMPTZ'),
];

describe('exportColumnRead', () => {
  it('reads nested columns as JSON, dates and a few scalars as text, everything else as it is', () => {
    expect(Object.fromEntries(SCHEMA.map((c) => [c.name, exportColumnRead(c)]))).toEqual({
      __rowid__: 'raw',
      id: 'raw',
      name: 'raw',
      price: 'raw',
      amount: 'double',
      day: 'text',
      at: 'utc',
      flag: 'raw',
      uid: 'raw',
      doc: 'raw',
      tags: 'json',
      embedding: 'json',
      point: 'json',
      attrs: 'json',
      choice: 'json',
      v: 'json',
      vl: 'json',
      vs: 'json',
      docs: 'json',
      span: 'text',
      bytes: 'text',
      bits: 'text',
      shape: 'text',
      huge: 'text',
      mood: 'text',
      'my "col"': 'json',
      'x,y': 'raw',
      tz: 'text',
      tns: 'text',
      wide: 'double',
      dec: 'double',
      tm: 'text',
      ts: 'timestamp',
      tsns: 'timestamp',
      tstz: 'utc',
    });
  });

  it("follows the library's type when the DuckDB type is missing or unreadable", () => {
    const bare = { name: 'c', nullable: true } as const;
    expect(exportColumnRead({ ...bare, type: 'nested' } as ColumnSchema)).toBe('json');
    expect(exportColumnRead({ ...bare, type: 'interval' } as ColumnSchema)).toBe('text');
    expect(exportColumnRead({ ...bare, type: 'string' } as ColumnSchema)).toBe('raw');
    expect(exportColumnRead({ ...bare, type: 'interval', originalType: 'INTERVAL(' })).toBe('text');
    // Typed 'string' (as a schema from before 'nested' existed might be), but a list.
    expect(exportColumnRead({ ...bare, type: 'string', originalType: 'INTEGER[]' })).toBe('json');
  });
});

describe('exportJsonColumns', () => {
  it('gives the parsed type of each exported nested column, once', () => {
    const types = exportJsonColumns(['id', 'tags', 'doc', 'choice', 'missing', 'span'], SCHEMA);
    expect([...types.keys()]).toEqual(['tags', 'choice']);
    expect(types.get('tags')).toMatchObject({ kind: 'list', element: { name: 'VARCHAR' } });
    expect(types.get('choice')).toMatchObject({ kind: 'union' });
  });
});

describe('exportTimestampColumns', () => {
  it('names the exported columns read as a timestamp’s text, zoned or not', () => {
    const columns = ['id', 'day', 'tm', 'ts', 'tz', 'at', 'tsns', 'missing', 'tstz', 'name'];
    expect([...exportTimestampColumns(columns, SCHEMA)]).toEqual(['ts', 'at', 'tsns', 'tstz']);
    // A schema built by hand without a DuckDB type reads the value as it is.
    const bare: ColumnSchema = { name: 'when', type: 'timestamp', nullable: true } as ColumnSchema;
    expect(exportColumnRead(bare)).toBe('raw');
    expect(exportTimestampColumns(['when'], [bare]).size).toBe(0);
  });
});

describe('projections in the export query builders', () => {
  const JSON_TAGS = 'CAST(to_json("tags") AS VARCHAR) AS "tags"';

  it('buildSelectQuery reads each column as exportColumnRead says, under its own name', () => {
    const sql = buildSelectQuery(
      't',
      ['id', 'tags', 'point', 'attrs', 'choice', 'doc', 'span', 'bytes', 'bits', 'shape', 'mood'],
      [],
      [],
      SCHEMA,
    );
    expect(sql).toBe(
      'SELECT "id", ' +
        `${JSON_TAGS}, ` +
        'CAST(to_json("point") AS VARCHAR) AS "point", ' +
        'CAST(to_json("attrs") AS VARCHAR) AS "attrs", ' +
        'CAST(to_json("choice") AS VARCHAR) AS "choice", ' +
        '"doc", ' +
        'CAST("span" AS VARCHAR) AS "span", ' +
        'CAST("bytes" AS VARCHAR) AS "bytes", ' +
        'CAST("bits" AS VARCHAR) AS "bits", ' +
        'CAST("shape" AS VARCHAR) AS "shape", ' +
        'CAST("mood" AS VARCHAR) AS "mood" ' +
        'FROM "t" ORDER BY "t"."__rowid__" ASC',
    );
  });

  it('reads a VARIANT, and a type holding one, through JSON with NULL kept', () => {
    const sql = buildSelectQuery('t', ['v', 'vl', 'docs'], [], [], SCHEMA);
    expect(sql).toBe(
      'SELECT CASE WHEN "v" IS NULL THEN NULL ELSE CAST(CAST("v" AS JSON) AS VARCHAR) END AS "v", ' +
        'CASE WHEN "vl" IS NULL THEN NULL ELSE CAST(CAST(CAST("vl" AS VARIANT) AS JSON) AS VARCHAR) END AS "vl", ' +
        'CAST(to_json("docs") AS VARCHAR) AS "docs" ' +
        'FROM "t" ORDER BY "t"."__rowid__" ASC',
    );
  });

  it('reads plain scalars as they are', () => {
    const scalars = ['id', 'name', 'price', 'flag', 'uid', 'doc', 'x,y'];
    expect(buildSelectQuery('t', scalars, [], [], SCHEMA)).toBe(
      'SELECT "id", "name", "price", "flag", "uid", "doc", "x,y" ' +
        'FROM "t" ORDER BY "t"."__rowid__" ASC',
    );
  });

  it('reads dates and times as text, a TIMESTAMP WITH TIME ZONE in UTC with Z', () => {
    expect(buildSelectQuery('t', ['day', 'tm', 'ts', 'tsns', 'at', 'tstz'], [], [], SCHEMA)).toBe(
      'SELECT CAST("day" AS VARCHAR) AS "day", CAST("tm" AS VARCHAR) AS "tm", ' +
        'CAST("ts" AS VARCHAR) AS "ts", CAST("tsns" AS VARCHAR) AS "tsns", ' +
        'CASE WHEN isfinite("at") THEN CAST(make_timestamp(epoch_us("at")) AS VARCHAR) || \'Z\' ' +
        'ELSE CAST("at" AS VARCHAR) END AS "at", ' +
        'CASE WHEN isfinite("tstz") THEN CAST(make_timestamp(epoch_us("tstz")) AS VARCHAR) || \'Z\' ' +
        'ELSE CAST("tstz" AS VARCHAR) END AS "tstz" ' +
        'FROM "t" ORDER BY "t"."__rowid__" ASC',
    );
  });

  it('sorts a date read as text by its value, in the batch and in a selection', () => {
    // Unqualified, `ORDER BY "day"` would bind to the text alias.
    const sort: SortColumn[] = [{ column: 'day', direction: 'asc' }];
    const orderBy = 'ORDER BY "t"."day" ASC, "t"."__rowid__" ASC';
    expect(buildBaseQuery('t', ['day'], [], sort, 10, 0, SCHEMA)).toBe(
      'SELECT CAST("day" AS VARCHAR) AS "day" FROM "t" WHERE "t"."__rowid__" IN ' +
        `(SELECT "t"."__rowid__" FROM "t" ${orderBy} LIMIT 10 OFFSET 0) ${orderBy}`,
    );
    expect(buildSelectedRowsQuery('t', ['day'], [], sort, [0, 2], SCHEMA)).toBe(
      'WITH numbered AS (SELECT "day", ROW_NUMBER() OVER(ORDER BY "t"."day" ASC, ' +
        '"t"."__rowid__" ASC) - 1 AS __row_idx__ FROM "t") ' +
        'SELECT CAST("day" AS VARCHAR) AS "day" FROM numbered WHERE __row_idx__ IN (0, 2) ' +
        'ORDER BY __row_idx__ ASC',
    );
  });

  it('reads a DECIMAL as the nearest double, past 15 digits through its text', () => {
    expect(buildSelectQuery('t', ['amount', 'wide', 'dec', 'tz', 'tns'], [], [], SCHEMA)).toBe(
      'SELECT CAST("amount" AS DOUBLE) AS "amount", ' +
        'CAST(CAST("wide" AS VARCHAR) AS DOUBLE) AS "wide", ' +
        'CAST(CAST("dec" AS VARCHAR) AS DOUBLE) AS "dec", ' +
        'CAST("tz" AS VARCHAR) AS "tz", CAST("tns" AS VARCHAR) AS "tns" ' +
        'FROM "t" ORDER BY "t"."__rowid__" ASC',
    );
  });

  it('quotes odd column and table names in projections and ORDER BY alike', () => {
    const sort: SortColumn[] = [{ column: 'my "col"', direction: 'desc' }];
    const orderBy = 'ORDER BY "my ""data"""."my ""col""" DESC, "my ""data"""."__rowid__" ASC';
    expect(buildBaseQuery('my "data"', ['my "col"', 'x,y'], [], sort, 10, 20, SCHEMA)).toBe(
      'SELECT CAST(to_json("my ""col""") AS VARCHAR) AS "my ""col""", "x,y" FROM "my ""data""" ' +
        'WHERE "my ""data"""."__rowid__" IN (SELECT "my ""data"""."__rowid__" FROM "my ""data""" ' +
        `${orderBy} LIMIT 10 OFFSET 20) ${orderBy}`,
    );
  });

  it('buildBaseQuery picks the batch by rowid, then reads the values of its rows only', () => {
    const sort: SortColumn[] = [{ column: 'tags', direction: 'asc' }];
    const sql = buildBaseQuery('t', ['tags'], [], sort, 100, 0, SCHEMA);
    const orderBy = 'ORDER BY "t"."tags" ASC, "t"."__rowid__" ASC';
    expect(sql).toBe(
      `SELECT ${JSON_TAGS} FROM "t" WHERE "t"."__rowid__" IN ` +
        `(SELECT "t"."__rowid__" FROM "t" ${orderBy} LIMIT 100 OFFSET 0) ${orderBy}`,
    );
    // Sorted by the value: unqualified, `ORDER BY "tags"` would bind to the
    // JSON-text alias.
    expect(sql).not.toMatch(/ORDER BY "tags"/);
  });

  it('filters the rows of a batch on their values, in the subquery that picks them', () => {
    const sql = buildBaseQuery(
      't',
      ['tags'],
      [{ type: 'null', column: 'tags' }],
      [],
      100,
      0,
      SCHEMA,
    );
    expect(sql).toBe(
      `SELECT ${JSON_TAGS} FROM "t" WHERE "t"."__rowid__" IN (SELECT "t"."__rowid__" FROM "t" ` +
        'WHERE "tags" IS NULL ORDER BY "t"."__rowid__" ASC LIMIT 100 OFFSET 0) ' +
        'ORDER BY "t"."__rowid__" ASC',
    );
  });

  it('buildSelectedRowsQuery projects in its outer SELECT only, numbering rows by value', () => {
    const sort: SortColumn[] = [{ column: 'point', direction: 'desc' }];
    const sql = buildSelectedRowsQuery('t', ['id', 'tags', 'span'], [], sort, [0, 5], SCHEMA);
    expect(sql).toBe(
      'WITH numbered AS (SELECT "id", "tags", "span", ' +
        'ROW_NUMBER() OVER(ORDER BY "t"."point" DESC, "t"."__rowid__" ASC) - 1 AS __row_idx__ FROM "t") ' +
        `SELECT "id", ${JSON_TAGS}, CAST("span" AS VARCHAR) AS "span" ` +
        'FROM numbered WHERE __row_idx__ IN (0, 5) ORDER BY __row_idx__ ASC',
    );
  });

  it('buildSelectedRowsQuery orders a VARIANT sort column by its sort key in the window', () => {
    const sort: SortColumn[] = [
      { column: 'v', direction: 'desc' },
      { column: 'vs', direction: 'asc' },
      { column: 'tags', direction: 'asc' },
    ];
    const sql = buildSelectedRowsQuery('t', ['id'], [], sort, [1, 3], SCHEMA);
    expect(sql).toContain(
      'ROW_NUMBER() OVER(ORDER BY create_sort_key("t"."v", \'DESC NULLS LAST\'), ' +
        'create_sort_key("t"."vs", \'ASC NULLS LAST\'), ' +
        '"t"."tags" ASC, "t"."__rowid__" ASC)',
    );
    // Without a schema, the types are unknown, and the column is ordered as it is.
    expect(buildSelectedRowsQuery('t', ['id'], [], sort, [1, 3])).toContain(
      'ROW_NUMBER() OVER(ORDER BY "t"."v" DESC, "t"."vs" ASC, "t"."tags" ASC, "t"."__rowid__" ASC)',
    );
  });

  it('buildSelectedRowsQuery can sort by the schema and still read every column as it is', () => {
    // getColumnValues and the Parquet export read the values themselves.
    const sort: SortColumn[] = [{ column: 'v', direction: 'asc' }];
    expect(buildSelectedRowsQuery('t', ['tags', 'v'], [], sort, [1, 3], undefined, SCHEMA)).toBe(
      'WITH numbered AS (SELECT "tags", "v", ' +
        'ROW_NUMBER() OVER(ORDER BY create_sort_key("t"."v", \'ASC NULLS LAST\'), "t"."__rowid__" ASC)' +
        ' - 1 AS __row_idx__ FROM "t") ' +
        'SELECT "tags", "v" FROM numbered WHERE __row_idx__ IN (1, 3) ORDER BY __row_idx__ ASC',
    );
  });

  it('reads a column the schema does not know as it is', () => {
    expect(buildSelectQuery('t', ['tags', 'ghost'], [], [], SCHEMA)).toBe(
      `SELECT ${JSON_TAGS}, "ghost" FROM "t" ORDER BY "t"."__rowid__" ASC`,
    );
  });

  it('reads every column as it is without a schema, as callers from before did', () => {
    const columns = ['tags', 'span', 'v'];
    const sort: SortColumn[] = [{ column: 'v', direction: 'asc' }];
    expect(buildSelectQuery('t', columns, [], [])).toBe(
      'SELECT "tags", "span", "v" FROM "t" ORDER BY "t"."__rowid__" ASC',
    );
    expect(buildBaseQuery('t', columns, [], [], 5, 0)).toBe(
      'SELECT "tags", "span", "v" FROM "t" WHERE "t"."__rowid__" IN (SELECT "t"."__rowid__" ' +
        'FROM "t" ORDER BY "t"."__rowid__" ASC LIMIT 5 OFFSET 0) ORDER BY "t"."__rowid__" ASC',
    );
    expect(buildSelectedRowsQuery('t', columns, [], sort, [2])).toBe(
      'WITH numbered AS (SELECT "tags", "span", "v", ' +
        'ROW_NUMBER() OVER(ORDER BY "t"."v" ASC, "t"."__rowid__" ASC) - 1 AS __row_idx__ FROM "t") ' +
        'SELECT "tags", "span", "v" FROM numbered WHERE __row_idx__ IN (2) ORDER BY __row_idx__ ASC',
    );
  });
});

describe('buildParquetQuery reads nested columns and dates natively', () => {
  const columns = ['id', 'tags', 'point', 'v', 'span', 'bytes', 'day', 'at'];

  function context(overrides: Partial<ExportContext> = {}): ExportContext {
    return {
      bridge: {} as ExportContext['bridge'],
      filters: [{ type: 'range', column: 'id', min: 1 }],
      sortColumns: [{ column: 'tags', direction: 'desc' }],
      selectedRows: new Set<number>(),
      columnOrder: SCHEMA.map((c) => c.name),
      schema: SCHEMA,
      ...overrides,
    };
  }

  it.each([
    ['all', new Set<number>()],
    ['filtered', new Set<number>()],
    ['selected', new Set<number>()],
    ['selected', new Set([3, 4, 5])],
    ['selected', new Set([0, 7])],
  ] as const)('scope %s, selection %o: no projection', (scope, selectedRows) => {
    const sql = buildParquetQuery(
      't',
      columns,
      { scope, columns: 'all' },
      context({ selectedRows: new Set(selectedRows) }),
    );
    expect(sql).toContain('SELECT "id", "tags", "point", "v", "span", "bytes", "day", "at"');
    expect(sql).not.toContain('to_json');
    expect(sql).not.toContain('AS VARCHAR');
    expect(sql).not.toContain('make_timestamp');
    expect(sql).not.toContain('create_sort_key');
  });

  it('numbers selected rows sorted by a VARIANT by its sort key, reading every column as it is', () => {
    const sql = buildParquetQuery(
      't',
      columns,
      { scope: 'selected', columns: 'all' },
      context({ sortColumns: [{ column: 'v', direction: 'desc' }], selectedRows: new Set([0, 7]) }),
    );
    expect(sql).toContain(
      'ROW_NUMBER() OVER(ORDER BY create_sort_key("t"."v", \'DESC NULLS LAST\'), "t"."__rowid__" ASC)',
    );
    expect(sql).toContain(
      'SELECT "id", "tags", "point", "v", "span", "bytes", "day", "at" FROM numbered',
    );
    expect(sql).not.toContain('to_json');
  });
});
