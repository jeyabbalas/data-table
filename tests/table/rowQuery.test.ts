/**
 * SQL shape of `buildRowQuery`. What the shapes return on a real engine is
 * `rowQuery.duckdb.test.ts`'s subject; this file pins the text.
 */
import { describe, expect, it } from 'vitest';

import type { ColumnSchema } from '@/core/types';
import { buildRowQuery, type RowQuery } from '@/table/rowQuery';

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'tag', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'wait', type: 'interval', nullable: true, originalType: 'INTERVAL' },
];

function query(overrides: Partial<RowQuery> = {}): RowQuery {
  return {
    tableName: 't',
    columns: ['id', 'tag'],
    sortColumns: [],
    filters: [],
    offset: 256,
    limit: 128,
    schema: SCHEMA,
    rowidFastPath: false,
    ...overrides,
  };
}

describe('buildRowQuery', () => {
  it('fast path: a __rowid__ range, ordered, with a defensive LIMIT and no OFFSET', () => {
    expect(buildRowQuery(query({ rowidFastPath: true }))).toBe(
      'SELECT "__rowid__", "id", "tag" FROM "t"' +
        ' WHERE "__rowid__" >= 256 AND "__rowid__" < 384' +
        ' ORDER BY "__rowid__" ASC LIMIT 128',
    );
  });

  it('sorted: pages row ids in a subquery, then reads those rows in the same order', () => {
    const sql = buildRowQuery(query({ sortColumns: [{ column: 'tag', direction: 'desc' }] }));
    expect(sql).toBe(
      'SELECT "__rowid__", "id", "tag" FROM "t"' +
        ' WHERE "__rowid__" IN (' +
        'SELECT "__rowid__" FROM "t" ORDER BY "tag" DESC, "__rowid__" ASC LIMIT 128 OFFSET 256' +
        ') ORDER BY "t"."tag" DESC, "t"."__rowid__" ASC',
    );
  });

  it('filtered: the WHERE clause goes in the subquery only', () => {
    const sql = buildRowQuery(query({ filters: [{ type: 'point', column: 'tag', value: 'A' }] }));
    expect(sql).toBe(
      'SELECT "__rowid__", "id", "tag" FROM "t"' +
        ' WHERE "__rowid__" IN (' +
        `SELECT "__rowid__" FROM "t" WHERE "tag" = 'A' ORDER BY "__rowid__" ASC LIMIT 128 OFFSET 256` +
        ') ORDER BY "t"."__rowid__" ASC',
    );
  });

  it('sorting by __rowid__ adds no tiebreaker to either ORDER BY', () => {
    const sql = buildRowQuery(
      query({
        sortColumns: [
          { column: '__rowid__', direction: 'desc' },
          { column: 'id', direction: 'asc' },
        ],
      }),
    );
    expect(sql).toContain('ORDER BY "__rowid__" DESC, "id" ASC LIMIT 128 OFFSET 256)');
    expect(sql).toMatch(/ORDER BY "t"\."__rowid__" DESC, "t"\."id" ASC$/);
  });

  it('the outer ORDER BY names the table, so a cast interval column sorts by value', () => {
    const sql = buildRowQuery(
      query({ columns: ['wait'], sortColumns: [{ column: 'wait', direction: 'asc' }] }),
    );
    expect(sql).toMatch(/^SELECT "__rowid__", CAST\("wait" AS VARCHAR\) AS "wait" FROM "t"/);
    expect(sql).toMatch(/ORDER BY "t"\."wait" ASC, "t"\."__rowid__" ASC$/);
  });

  it('quotes a table name that needs escaping everywhere it appears', () => {
    const sql = buildRowQuery(
      query({ tableName: 'my "data"', sortColumns: [{ column: 'id', direction: 'asc' }] }),
    );
    // Both FROMs and both qualifiers in the outer ORDER BY.
    expect(sql.match(/"my ""data"""/g)).toHaveLength(4);
    expect(sql).toMatch(/ORDER BY "my ""data"""\."id" ASC, "my ""data"""\."__rowid__" ASC$/);
  });

  it('drops a __rowid__ in the visible columns, which it always selects first', () => {
    const sql = buildRowQuery(query({ columns: ['tag', '__rowid__', 'id'], rowidFastPath: true }));
    expect(sql).toMatch(/^SELECT "__rowid__", "tag", "id" FROM/);
  });
});
