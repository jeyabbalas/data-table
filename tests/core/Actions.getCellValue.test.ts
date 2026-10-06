/**
 * StateActions.getCellValue on a mocked bridge: the errors it throws, the
 * query each kind of column gets (a nested column's JSON text through
 * fetchCellJson, a scalar read so that it arrives exact), and what it makes
 * of the row that comes back. The values themselves are read on real DuckDB
 * in nestedValueReads.duckdb.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { DestroyedError, QueryError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

const schema: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'big', type: 'integer', nullable: true, originalType: 'BIGINT' },
  { name: 'huge', type: 'integer', nullable: true, originalType: 'UHUGEINT' },
  { name: 'price', type: 'float', nullable: true, originalType: 'DOUBLE' },
  { name: 'amount', type: 'decimal', nullable: true, originalType: 'DECIMAL(18,4)' },
  { name: 'cents', type: 'decimal', nullable: true, originalType: 'DECIMAL(10,2)' },
  { name: 'wait', type: 'interval', nullable: true, originalType: 'INTERVAL' },
  { name: 'tier', type: 'string', nullable: true, originalType: "ENUM('a', 'b')" },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'doc', type: 'string', nullable: true, originalType: 'JSON' },
  { name: 'tags', type: 'nested', nullable: true, originalType: 'VARCHAR[]' },
  { name: 'attrs', type: 'nested', nullable: true, originalType: 'MAP(VARCHAR, INTEGER)' },
  { name: 'v', type: 'nested', nullable: true, originalType: 'VARIANT' },
];

interface QueryCall {
  sql: string;
  signal: AbortSignal | undefined;
  options: unknown;
}

function createMockBridge() {
  const calls: QueryCall[] = [];
  let rows: (sql: string) => Promise<unknown[]> = async () => [];
  const bridge = {
    query: vi.fn(async (sql: string, signal?: AbortSignal, options?: unknown) => {
      calls.push({ sql, signal, options });
      return rows(sql);
    }),
    clearQueryCache: vi.fn(),
  };
  return {
    bridge,
    calls,
    setRows: (fn: (sql: string) => Promise<unknown[]>) => {
      rows = fn;
    },
  };
}

describe('StateActions.getCellValue', () => {
  let state: TableState;
  let mock: ReturnType<typeof createMockBridge>;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    mock = createMockBridge();
    actions = new StateActions(state, mock.bridge as never);
    initializeColumnsFromSchema(state, schema);
    state.tableName.set('t');
    state.totalRows.set(10);
  });

  describe('errors', () => {
    it('throws COLUMN_NOT_FOUND for a column the schema lacks', async () => {
      await expect(actions.getCellValue(0, 'nope')).rejects.toMatchObject({
        name: 'QueryError',
        code: 'COLUMN_NOT_FOUND',
        details: { column: 'nope' },
      });
      expect(mock.calls).toHaveLength(0);
    });

    it('throws NO_TABLE when the schema names the column but no table is loaded', async () => {
      state.tableName.set(null);
      await expect(actions.getCellValue(0, 'id')).rejects.toMatchObject({ code: 'NO_TABLE' });
      expect(mock.calls).toHaveLength(0);
    });

    it('throws COLUMN_NOT_FOUND before any data is loaded: the schema is empty', async () => {
      const fresh = new StateActions(createTableState(), mock.bridge as never);
      await expect(fresh.getCellValue(0, 'id')).rejects.toMatchObject({
        code: 'COLUMN_NOT_FOUND',
      });
      expect(mock.calls).toHaveLength(0);
    });

    it.each([
      ['-1', -1],
      ['1.5', 1.5],
      ['NaN', Number.NaN],
      ['-1n', -1n],
    ])('throws INVALID_ROWID for rowid %s without querying', async (_label, rowId) => {
      for (const column of ['id', 'tags']) {
        const error = await actions.getCellValue(rowId, column).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(QueryError);
        expect(error).toMatchObject({ code: 'INVALID_ROWID' });
        expect(Object.is((error as QueryError).details?.['rowId'], rowId)).toBe(true);
      }
      expect(mock.calls).toHaveLength(0);
    });

    it.each(['id', 'tags'])(
      'throws INVALID_ROWID when no row has the rowid (%s)',
      async (column) => {
        mock.setRows(async () => []);
        await expect(actions.getCellValue(99, column)).rejects.toMatchObject({
          name: 'QueryError',
          code: 'INVALID_ROWID',
          details: { rowId: 99 },
        });
        await expect(actions.getCellValue(99n, column)).rejects.toMatchObject({
          code: 'INVALID_ROWID',
          details: { rowId: 99n },
        });
      },
    );

    it('throws DestroyedError after destroy', async () => {
      actions.markDestroyed();
      await expect(actions.getCellValue(0, 'id')).rejects.toBeInstanceOf(DestroyedError);
      expect(mock.calls).toHaveLength(0);
    });

    it.each(['id', 'tags'])(
      'throws DestroyedError when destroy lands during the query (%s)',
      async (column) => {
        let resolve!: (rows: unknown[]) => void;
        mock.setRows(() => new Promise((r) => (resolve = r)));
        const value = actions.getCellValue(0, column);
        await vi.waitFor(() => expect(mock.calls).toHaveLength(1));
        actions.markDestroyed();
        resolve([{ val: 1, json: '[]', chars: 2 }]);
        await expect(value).rejects.toBeInstanceOf(DestroyedError);
      },
    );

    it.each(['id', 'tags'])(
      'passes the signal on, and rejects as an aborted query does (%s)',
      async (column) => {
        const controller = new AbortController();
        const aborted = new QueryError('Query aborted', { code: 'QUERY_ABORTED' });
        mock.setRows(async () => {
          throw aborted;
        });
        await expect(actions.getCellValue(0, column, { signal: controller.signal })).rejects.toBe(
          aborted,
        );
        expect(mock.calls[0]!.signal).toBe(controller.signal);
      },
    );
  });

  describe('a scalar column', () => {
    it('selects the value by rowid, at elevated priority, past the query cache', async () => {
      mock.setRows(async () => [{ val: 7 }]);
      await expect(actions.getCellValue(3, 'id')).resolves.toBe(7);
      expect(mock.calls[0]).toEqual({
        sql: 'SELECT "id" AS val FROM "t" WHERE "__rowid__" = 3',
        signal: undefined,
        options: { priority: 'elevated', cache: false },
      });
    });

    it('reads the current effective table, a derived-column VIEW included', async () => {
      state.tableName.set('__dt_view_t');
      mock.setRows(async () => [{ val: 'x' }]);
      await actions.getCellValue(3n, 'name');
      expect(mock.calls[0]!.sql).toBe(
        'SELECT "name" AS val FROM "__dt_view_t" WHERE "__rowid__" = 3',
      );
    });

    it('reads wide integers as text, and returns bigints', async () => {
      mock.setRows(async () => [{ val: '9007199254740993' }]);
      await expect(actions.getCellValue(0, 'big')).resolves.toBe(9007199254740993n);
      expect(mock.calls[0]!.sql).toBe(
        'SELECT CAST("big" AS VARCHAR) AS val FROM "t" WHERE "__rowid__" = 0',
      );

      mock.setRows(async () => [{ val: '340282366920938463463374607431768211455' }]);
      await expect(actions.getCellValue(0, 'huge')).resolves.toBe(
        340282366920938463463374607431768211455n,
      );
      mock.setRows(async () => [{ val: '12' }]);
      await expect(actions.getCellValue(0, 'huge')).resolves.toBe(12n);
    });

    it('returns __rowid__ as a bigint, read as it is', async () => {
      mock.setRows(async () => [{ val: 4 }]);
      await expect(actions.getCellValue(4, '__rowid__')).resolves.toBe(4n);
      expect(mock.calls[0]!.sql).toBe('SELECT "__rowid__" AS val FROM "t" WHERE "__rowid__" = 4');
    });

    it('reads a DECIMAL as the nearest double', async () => {
      mock.setRows(async () => [{ val: '1.2345' }]);
      await expect(actions.getCellValue(0, 'amount')).resolves.toBe(1.2345);
      expect(mock.calls[0]!.sql).toContain('CAST("amount" AS VARCHAR) AS val');

      mock.setRows(async () => [{ val: 1.25 }]);
      await expect(actions.getCellValue(0, 'cents')).resolves.toBe(1.25);
      expect(mock.calls[1]!.sql).toContain('CAST("cents" AS DOUBLE) AS val');
    });

    it('reads INTERVAL and ENUM as DuckDB text', async () => {
      mock.setRows(async () => [{ val: '1 year 2 months' }]);
      await expect(actions.getCellValue(0, 'wait')).resolves.toBe('1 year 2 months');
      expect(mock.calls[0]!.sql).toContain('CAST("wait" AS VARCHAR) AS val');

      mock.setRows(async () => [{ val: 'b' }]);
      await expect(actions.getCellValue(0, 'tier')).resolves.toBe('b');
      expect(mock.calls[1]!.sql).toContain('CAST("tier" AS VARCHAR) AS val');
    });

    it('returns a JSON column’s text as it is', async () => {
      mock.setRows(async () => [{ val: '{"a": [1, 2.50]}' }]);
      await expect(actions.getCellValue(0, 'doc')).resolves.toBe('{"a": [1, 2.50]}');
      expect(mock.calls[0]!.sql).toBe('SELECT "doc" AS val FROM "t" WHERE "__rowid__" = 0');
    });

    it('returns NULL as null', async () => {
      for (const column of ['id', 'big', 'price', 'amount', 'wait', 'name']) {
        mock.setRows(async () => [{ val: null }]);
        await expect(actions.getCellValue(0, column), column).resolves.toBeNull();
      }
    });
  });

  describe('a nested column', () => {
    it('reads the exact JSON text by rowid, uncapped, at elevated priority, past the cache', async () => {
      mock.setRows(async () => [{ json: '["a",null,"b"]', chars: 14 }]);
      await expect(actions.getCellValue(2, 'tags')).resolves.toEqual(['a', null, 'b']);
      expect(mock.calls[0]).toEqual({
        sql:
          'SELECT CAST(to_json("tags") AS VARCHAR) AS "json",' +
          ' length(CAST(to_json("tags") AS VARCHAR)) AS "chars" FROM "t" WHERE "__rowid__" = 2',
        signal: undefined,
        options: { priority: 'elevated', cache: false },
      });
    });

    it('materializes a MAP as a Map, keys in order', async () => {
      mock.setRows(async () => [{ json: '{"size":1,"__proto__":2,"2":3,"1":4}', chars: 34 }]);
      const value = await actions.getCellValue(0, 'attrs');
      expect(value).toBeInstanceOf(Map);
      expect([...(value as Map<string, number>).entries()]).toEqual([
        ['size', 1],
        ['__proto__', 2],
        ['2', 3],
        ['1', 4],
      ]);
    });

    it('reads a VARIANT through CAST(… AS JSON), integers past 2^53 as bigints', async () => {
      mock.setRows(async () => [{ json: '{"k":9007199254740993,"n":[1.5,NaN]}', chars: 36 }]);
      const value = (await actions.getCellValue(0, 'v')) as { k: unknown; n: number[] };
      expect(value.k).toBe(9007199254740993n);
      expect(value.n).toEqual([1.5, NaN]);
      expect(mock.calls[0]!.sql).toContain(
        'CASE WHEN "v" IS NULL THEN NULL ELSE CAST(CAST("v" AS JSON) AS VARCHAR) END AS "json"',
      );
    });

    it('returns NULL as null', async () => {
      mock.setRows(async () => [{ json: null, chars: null }]);
      await expect(actions.getCellValue(0, 'tags')).resolves.toBeNull();
    });
  });
});
