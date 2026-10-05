/**
 * The nested stress fixture against a real DuckDB (Node target): both files
 * load through the library's loaders, DESCRIBE reports the types the
 * manifest records, and DuckDB's own counts of NULL, empty and longest values
 * equal the generator's. Also builds the SQL-only companions (nestedSql.ts)
 * and checks their types.
 *
 * A failure after a DuckDB upgrade means the engine now reads a file
 * differently. Once the change is understood, update the expected types in
 * tests/fixtures/datasets/generate-nested-stress-tests.py and regenerate.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { quoteIdentifier } from '@/worker/loaders/common';
import type { LoadResult } from '@/worker/loaders/types';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { readBinaryFixture } from '../../helpers/fixtures';
import {
  MANIFEST,
  SHOWCASE,
  loadNestedFixture,
  type NestedManifestColumn,
} from '../../helpers/nestedFixture';
import { SQL_ONLY_COLUMNS, createSqlOnlyTable, createSqlOnlyView } from '../../helpers/nestedSql';
import { makeNodeBridge } from '../../helpers/nodeBridge';

/** What a column's emptiness and size are measured with, by kind. */
const SIZE_FUNCTION: Partial<Record<NestedManifestColumn['kind'], string>> = {
  list: 'len',
  map: 'cardinality',
};

function count(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

describe('nested stress fixture (real DuckDB)', () => {
  let harness: NodeDuckDBHarness;

  async function rows(sql: string): Promise<Record<string, unknown>[]> {
    const result = await harness.conn.query(sql);
    return result.toArray().map((row) => row.toJSON() as Record<string, unknown>);
  }

  async function describeTypes(relation: string): Promise<[string, string][]> {
    return (await rows(`DESCRIBE ${relation}`)).map((row) => [
      String(row['column_name']),
      String(row['column_type']),
    ]);
  }

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('names the showcase rows as the manifest does', () => {
    const rowsByName = Object.fromEntries(
      Object.entries(MANIFEST.showcaseRows).map(([name, { row }]) => [name, row]),
    );
    expect(rowsByName).toEqual(SHOWCASE);
  });

  describe.each(['parquet', 'json'] as const)('%s file', (format) => {
    const manifest = MANIFEST[format];
    let loaded: LoadResult;
    let table: string;

    beforeAll(async () => {
      loaded = await loadNestedFixture(harness, format);
      table = quoteIdentifier(loaded.tableName);
    }, 30_000);

    it('loads every row, with __rowid__ first and equal to id', async () => {
      expect(loaded.rowCount).toBe(MANIFEST.rowCount);
      expect(loaded.columns).toEqual(['__rowid__', ...manifest.columns.map((c) => c.name)]);
      const [ids] = await rows(
        `SELECT count(*) FILTER (WHERE "__rowid__" IS DISTINCT FROM "id") AS mismatched,
                min("__rowid__") AS lo, max("__rowid__") AS hi
         FROM ${table}`,
      );
      expect(count(ids?.['mismatched'])).toBe(0);
      expect(count(ids?.['lo'])).toBe(0);
      expect(count(ids?.['hi'])).toBe(MANIFEST.rowCount - 1);
    });

    it('reports the manifest types, names and order', async () => {
      const expected = [
        ['__rowid__', 'BIGINT'],
        ...manifest.columns.map((c) => [c.name, c.duckdbType]),
      ];
      expect(await describeTypes(table)).toEqual(expected);
      expect(loaded.schema.map((c) => [c.name, c.originalType])).toEqual(expected);
    });

    it("types lists, structs and maps 'nested', and JSON columns 'string'", () => {
      const typeOf = new Map(loaded.schema.map((c) => [c.name, c.type]));
      const library = { list: 'nested', struct: 'nested', map: 'nested', json: 'string' };
      const expected = manifest.columns
        .filter((c) => c.kind !== 'scalar')
        .map((c) => [c.name, library[c.kind as keyof typeof library]]);
      expect(expected.map(([name]) => [name, typeOf.get(name!)])).toEqual(expected);
    });

    it('holds the NULL, empty and longest values the generator counted', async () => {
      const measures = manifest.columns.flatMap((c, i) => {
        const col = quoteIdentifier(c.name);
        const size = SIZE_FUNCTION[c.kind];
        const nulls = `count(*) FILTER (WHERE ${col} IS NULL) AS "nulls_${i}"`;
        return size
          ? [
              nulls,
              `count(*) FILTER (WHERE ${size}(${col}) = 0) AS "empty_${i}"`,
              `max(${size}(${col})) AS "longest_${i}"`,
            ]
          : [nulls];
      });
      const [measured = {}] = await rows(`SELECT ${measures.join(', ')} FROM ${table}`);

      const actual = manifest.columns.map((c, i) => ({
        name: c.name,
        nullCount: count(measured[`nulls_${i}`]),
        emptyCount: SIZE_FUNCTION[c.kind] ? count(measured[`empty_${i}`]) : null,
        maxLength: SIZE_FUNCTION[c.kind] ? count(measured[`longest_${i}`]) : null,
      }));
      const expected = manifest.columns.map(({ name, nullCount, emptyCount, maxLength }) => ({
        name,
        nullCount,
        emptyCount,
        maxLength,
      }));
      expect(actual).toEqual(expected);
    });
  });

  it('loads through makeNodeBridge().loadData as through the loader', async () => {
    const bridge = makeNodeBridge(harness.conn, harness.db);
    const direct = await loadNestedFixture(harness, 'json', 'nested_json_direct');
    const viaBridge = await bridge.loadData(
      await readBinaryFixture('json', 'nested-stress-tests'),
      {
        format: 'json',
        tableName: 'nested_json_bridge',
      },
    );
    expect(viaBridge).toEqual({ ...direct, tableName: 'nested_json_bridge' });

    // A loader's error comes back as the typed error the bridge rebuilds.
    await expect(
      bridge.loadData(await readBinaryFixture('parquet', 'nested-stress-tests'), {
        format: 'parquet',
        tableName: 'nested_missing_column',
        parquet: { columns: ['id', 'nope'] },
      }),
    ).rejects.toMatchObject({
      name: 'LoadError',
      code: 'LOAD_INVALID_OPTIONS',
      details: { option: 'parquet.columns', missing: ['nope'] },
    });
    await expect(
      makeNodeBridge(harness.conn).loadData(new ArrayBuffer(0), { format: 'json' }),
    ).rejects.toThrow('loadData requires `db`');
  }, 30_000);

  describe('SQL-only companions', () => {
    const ROWS = 100;
    const stored = SQL_ONLY_COLUMNS.filter((c) => c.inTable !== false);

    beforeAll(async () => {
      await createSqlOnlyTable(harness.conn, 'nested_sql_only', ROWS);
      await createSqlOnlyView(harness.conn, 'nested_sql_view', 'nested_sql_only');
    });

    it('creates a table of every companion a table can hold, with its type', async () => {
      expect(await describeTypes('"nested_sql_only"')).toEqual([
        ['__rowid__', 'BIGINT'],
        ['id', 'BIGINT'],
        ...stored.map((c) => [c.name, c.type]),
      ]);
      const [ids] = await rows(
        `SELECT count(*) AS n,
                count(*) FILTER (WHERE "__rowid__" IS DISTINCT FROM "id") AS mismatched,
                min("__rowid__") AS lo, max("__rowid__") AS hi
         FROM "nested_sql_only"`,
      );
      expect([ids?.['n'], ids?.['mismatched'], ids?.['lo'], ids?.['hi']].map(count)).toEqual([
        ROWS,
        0,
        0,
        ROWS - 1,
      ]);
    });

    it('adds the rest in a view, which has every companion in order', async () => {
      expect(stored.length).toBeLessThan(SQL_ONLY_COLUMNS.length);
      expect(await describeTypes('"nested_sql_view"')).toEqual([
        ['__rowid__', 'BIGINT'],
        ['id', 'BIGINT'],
        ...SQL_ONLY_COLUMNS.map((c) => [c.name, c.type]),
      ]);
    });

    it('holds NULL in some rows of every companion and a value in the others', async () => {
      const nulls = SQL_ONLY_COLUMNS.map(
        (c, i) => `count(*) FILTER (WHERE ${quoteIdentifier(c.name)} IS NULL) AS "nulls_${i}"`,
      );
      const [measured = {}] = await rows(`SELECT ${nulls.join(', ')} FROM "nested_sql_view"`);
      for (const [i, c] of SQL_ONLY_COLUMNS.entries()) {
        const n = Number(measured[`nulls_${i}`]);
        expect({ name: c.name, someNull: n > 0, someValue: n < ROWS }).toEqual({
          name: c.name,
          someNull: true,
          someValue: true,
        });
      }
    });

    it("evaluates over the fixture's id column, as a derived column would", async () => {
      const fixture = await loadNestedFixture(harness, 'parquet', 'nested_sql_base');
      const select = SQL_ONLY_COLUMNS.map((c) => `${c.sql('"id"')} AS ${quoteIdentifier(c.name)}`);
      expect(
        await describeTypes(
          `SELECT ${select.join(', ')} FROM ${quoteIdentifier(fixture.tableName)}`,
        ),
      ).toEqual(SQL_ONLY_COLUMNS.map((c) => [c.name, c.type]));
    }, 30_000);
  });
});
