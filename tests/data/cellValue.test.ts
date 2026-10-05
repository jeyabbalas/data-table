/**
 * fetchCellJson: one cell's value as exact JSON text, by `__rowid__`, on a
 * mocked bridge. The SQL it sends (with and without a cap), the rowid and
 * cap it accepts, and what it makes of the row that comes back. The values
 * themselves are read on real DuckDB in tests/core/nestedValueReads.duckdb.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';

import { QueryError } from '@/core/errors';
import type { ColumnSchema } from '@/core/types';
import { fetchCellJson, isRowId, rowIdLiteral } from '@/data/cellValue';
import type { WorkerBridge } from '@/data/WorkerBridge';

const TAGS: ColumnSchema = {
  name: 'tags',
  type: 'nested',
  nullable: true,
  originalType: 'VARCHAR[]',
};
const DOC: ColumnSchema = { name: 'doc', type: 'string', nullable: true, originalType: 'JSON' };
const VARIANT: ColumnSchema = {
  name: 'v',
  type: 'nested',
  nullable: true,
  originalType: 'VARIANT',
};

const TAGS_JSON = 'CAST(to_json("tags") AS VARCHAR)';

/** A bridge whose `query` resolves with `rows`, recording each call. */
function bridgeReturning(rows: unknown[] = []) {
  const query = vi.fn(async (_sql: string, _signal?: AbortSignal, _options?: unknown) => rows);
  return { bridge: { query } as unknown as WorkerBridge, query };
}

describe('fetchCellJson', () => {
  it('selects the JSON text and its length, without a cap', async () => {
    const { bridge, query } = bridgeReturning([{ json: '["a",null]', chars: 10 }]);
    await fetchCellJson(bridge, 'trips', TAGS, 5);
    expect(query.mock.calls[0]![0]).toBe(
      `SELECT ${TAGS_JSON} AS "json", length(${TAGS_JSON}) AS "chars"` +
        ` FROM "trips" WHERE "__rowid__" = 5`,
    );
  });

  it('cuts the text at maxChars inside the query', async () => {
    const { bridge, query } = bridgeReturning([{ json: '["a",', chars: 10 }]);
    await fetchCellJson(bridge, 'trips', TAGS, 5, { maxChars: 5 });
    expect(query.mock.calls[0]![0]).toBe(
      `SELECT CASE WHEN length(${TAGS_JSON}) > 5 THEN left(${TAGS_JSON}, 5) ELSE ${TAGS_JSON} END` +
        ` AS "json", length(${TAGS_JSON}) AS "chars" FROM "trips" WHERE "__rowid__" = 5`,
    );
  });

  it('reads a JSON column as its text and a VARIANT through CAST(… AS JSON)', async () => {
    const { bridge, query } = bridgeReturning([]);
    await fetchCellJson(bridge, 't', DOC, 0);
    await fetchCellJson(bridge, 't', VARIANT, 0);
    expect(query.mock.calls[0]![0]).toBe(
      'SELECT CAST("doc" AS VARCHAR) AS "json", length(CAST("doc" AS VARCHAR)) AS "chars"' +
        ' FROM "t" WHERE "__rowid__" = 0',
    );
    expect(query.mock.calls[1]![0]).toContain(
      'CASE WHEN "v" IS NULL THEN NULL ELSE CAST(CAST("v" AS JSON) AS VARCHAR) END AS "json"',
    );
  });

  it('quotes the table and column names', async () => {
    const { bridge, query } = bridgeReturning([]);
    await fetchCellJson(bridge, 'my "view"', { ...TAGS, name: 'a"b' }, 1);
    const sql = query.mock.calls[0]![0];
    expect(sql).toContain('to_json("a""b")');
    expect(sql).toContain('FROM "my ""view""" WHERE "__rowid__" = 1');
  });

  it('writes a number and a bigint rowid as the same digits', async () => {
    const { bridge, query } = bridgeReturning([]);
    await fetchCellJson(bridge, 't', TAGS, 9_007_199_254_740_991);
    await fetchCellJson(bridge, 't', TAGS, 9_007_199_254_740_991n);
    await fetchCellJson(bridge, 't', TAGS, 9_223_372_036_854_775_807n);
    expect(query.mock.calls[0]![0]).toMatch(/"__rowid__" = 9007199254740991$/);
    expect(query.mock.calls[1]![0]).toBe(query.mock.calls[0]![0]);
    expect(query.mock.calls[2]![0]).toMatch(/"__rowid__" = 9223372036854775807$/);
  });

  it.each([
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an unsafe integer', 2 ** 53],
    ['a negative bigint', -1n],
    ['a bigint past BIGINT', 2n ** 63n],
    ['a string', '5' as unknown as number],
  ])('rejects %s as a rowid without querying', async (_label, rowId) => {
    const { bridge, query } = bridgeReturning([]);
    const error = await fetchCellJson(bridge, 't', TAGS, rowId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QueryError);
    expect(error).toMatchObject({ code: 'INVALID_ROWID' });
    expect(Object.is((error as QueryError).details?.['rowId'], rowId)).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, Number.NaN])('rejects maxChars %s without querying', async (maxChars) => {
    const { bridge, query } = bridgeReturning([]);
    await expect(fetchCellJson(bridge, 't', TAGS, 0, { maxChars })).rejects.toMatchObject({
      name: 'QueryError',
      code: 'INVALID_MAX_CHARS',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts maxChars 0', async () => {
    const { bridge } = bridgeReturning([{ json: '', chars: 2 }]);
    await expect(fetchCellJson(bridge, 't', TAGS, 0, { maxChars: 0 })).resolves.toEqual({
      text: '',
      truncated: true,
      totalChars: 2,
    });
  });

  it('resolves undefined when no row has the rowid', async () => {
    const { bridge } = bridgeReturning([]);
    await expect(fetchCellJson(bridge, 't', TAGS, 42)).resolves.toBeUndefined();
  });

  it('reads SQL NULL as null text of no characters', async () => {
    const { bridge } = bridgeReturning([{ json: null, chars: null }]);
    await expect(fetchCellJson(bridge, 't', TAGS, 0, { maxChars: 10 })).resolves.toEqual({
      text: null,
      truncated: false,
      totalChars: 0,
    });
  });

  it('says whether the text was cut, and how long the whole text is', async () => {
    const cut = bridgeReturning([{ json: '["a",', chars: 10 }]);
    await expect(fetchCellJson(cut.bridge, 't', TAGS, 0, { maxChars: 5 })).resolves.toEqual({
      text: '["a",',
      truncated: true,
      totalChars: 10,
    });

    const whole = bridgeReturning([{ json: '["a"]', chars: 5 }]);
    await expect(fetchCellJson(whole.bridge, 't', TAGS, 0, { maxChars: 5 })).resolves.toEqual({
      text: '["a"]',
      truncated: false,
      totalChars: 5,
    });

    // Without a cap nothing is cut; a BIGINT length may arrive as a bigint.
    const uncapped = bridgeReturning([{ json: '["a"]', chars: 5n }]);
    await expect(fetchCellJson(uncapped.bridge, 't', TAGS, 0)).resolves.toEqual({
      text: '["a"]',
      truncated: false,
      totalChars: 5,
    });
  });

  it('runs at high priority, skips the query cache, and passes the signal on', async () => {
    const { bridge, query } = bridgeReturning([]);
    const controller = new AbortController();
    await fetchCellJson(bridge, 't', TAGS, 0, { signal: controller.signal });
    await fetchCellJson(bridge, 't', TAGS, 0);
    expect(query.mock.calls[0]!.slice(1)).toEqual([
      controller.signal,
      { priority: 'high', cache: false },
    ]);
    expect(query.mock.calls[1]!.slice(1)).toEqual([undefined, { priority: 'high', cache: false }]);
  });

  it('rejects as the query does', async () => {
    const aborted = new QueryError('Query aborted', { code: 'QUERY_ABORTED' });
    const bridge = { query: vi.fn().mockRejectedValue(aborted) } as unknown as WorkerBridge;
    await expect(fetchCellJson(bridge, 't', TAGS, 0)).rejects.toBe(aborted);
  });
});

describe('isRowId and rowIdLiteral', () => {
  it('accept non-negative safe integers and BIGINT-range bigints', () => {
    for (const rowId of [0, 7, Number.MAX_SAFE_INTEGER, 0n, 7n, 2n ** 63n - 1n]) {
      expect(isRowId(rowId)).toBe(true);
      expect(rowIdLiteral(rowId)).toBe(String(rowId));
    }
  });

  it('refuse anything else', () => {
    for (const rowId of [-1, -0.5, 1.5, NaN, 2 ** 53, -1n, 2n ** 63n, '1', null, undefined]) {
      expect(isRowId(rowId)).toBe(false);
    }
    expect(() => rowIdLiteral(-1)).toThrow(QueryError);
  });
});
