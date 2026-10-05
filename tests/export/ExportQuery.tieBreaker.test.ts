/**
 * Regression: silent row drift in exports under sort + ties.
 *
 * `ExportQuery.buildOrderByClause` and `buildSelectedRowsQuery`
 * historically built `ORDER BY <userSort>` and
 * `ROW_NUMBER() OVER(ORDER BY <userSort>)` with no tiebreaker. DuckDB's
 * ORDER BY is non-deterministic for ties, so:
 *
 * - `fetchBatchedRows` issues `LIMIT N OFFSET M` queries with
 *   monotonically increasing OFFSET; ties at batch boundaries can
 *   duplicate or skip rows in the resulting CSV/JSON file.
 * - `ROW_NUMBER() OVER(ORDER BY <userSort>)` assigns `__row_idx__`
 *   to ties in arbitrary order, so a user's selection set drifts
 *   across runs.
 * - Single-shot `buildSelectQuery` (Parquet COPY) produces files
 *   that differ in row order within tie groups — re-exports are
 *   not byte-reproducible.
 *
 * The fix appends `"__rowid__" ASC` as the final tiebreaker, and the
 * empty-sort branches now emit `ORDER BY "__rowid__" ASC` /
 * `OVER(ORDER BY "__rowid__" ASC)` so even sort-less exports are
 * deterministic. Mirrors the idiom used in `Actions.getColumnValues`
 * (Actions.ts:1769) and the loader's table-recreation paths.
 *
 * Every sort key is qualified with the table (`"t"."name"`): CSV and JSON
 * exports read nested columns as JSON text under their own names, and an
 * unqualified `ORDER BY "tags"` would bind to that alias and sort by text.
 */
import { describe, it, expect } from 'vitest';
import {
  buildOrderByClause,
  buildSelectQuery,
  buildBaseQuery,
  buildSelectedRowsQuery,
} from '@/export/ExportQuery';
import type { SortColumn } from '@/core/types';

describe('ExportQuery — __rowid__ tiebreaker (buildOrderByClause)', () => {
  it('appends __rowid__ ASC after a single user sort column', () => {
    const sort: SortColumn[] = [{ column: 'name', direction: 'asc' }];
    expect(buildOrderByClause(sort, 't')).toBe(' ORDER BY "t"."name" ASC, "t"."__rowid__" ASC');
  });

  it('appends __rowid__ ASC after multi-column user sort', () => {
    const sort: SortColumn[] = [
      { column: 'name', direction: 'asc' },
      { column: 'price', direction: 'desc' },
    ];
    expect(buildOrderByClause(sort, 't')).toBe(
      ' ORDER BY "t"."name" ASC, "t"."price" DESC, "t"."__rowid__" ASC',
    );
  });

  it('emits ORDER BY "__rowid__" ASC when user sort is empty (was: empty string)', () => {
    expect(buildOrderByClause([], 't')).toBe(' ORDER BY "t"."__rowid__" ASC');
  });

  it('does not duplicate __rowid__ when user sort already includes it (any direction)', () => {
    const asc: SortColumn[] = [{ column: '__rowid__', direction: 'asc' }];
    expect(buildOrderByClause(asc, 't')).toBe(' ORDER BY "t"."__rowid__" ASC');

    const desc: SortColumn[] = [{ column: '__rowid__', direction: 'desc' }];
    expect(buildOrderByClause(desc, 't')).toBe(' ORDER BY "t"."__rowid__" DESC');
  });

  it('does not duplicate __rowid__ when user sort includes it in a non-final position', () => {
    const sort: SortColumn[] = [
      { column: '__rowid__', direction: 'asc' },
      { column: 'name', direction: 'desc' },
    ];
    expect(buildOrderByClause(sort, 't')).toBe(' ORDER BY "t"."__rowid__" ASC, "t"."name" DESC');
  });

  it('quotes a table name that needs it, as the FROM clause does', () => {
    const sort: SortColumn[] = [{ column: 'my "col"', direction: 'desc' }];
    expect(buildOrderByClause(sort, 'my "data"')).toBe(
      ' ORDER BY "my ""data"""."my ""col""" DESC, "my ""data"""."__rowid__" ASC',
    );
  });

  it("qualifies with a derived-column view's name as with a table's", () => {
    const sort: SortColumn[] = [{ column: 'tags', direction: 'asc' }];
    expect(buildOrderByClause(sort, '__dt_view_t__')).toBe(
      ' ORDER BY "__dt_view_t__"."tags" ASC, "__dt_view_t__"."__rowid__" ASC',
    );
  });
});

describe('ExportQuery — buildSelectQuery (single-shot Parquet path)', () => {
  it('always emits ORDER BY (with __rowid__ tiebreaker) for re-export reproducibility', () => {
    // Pre-fix: empty sort meant no ORDER BY, so DuckDB's parallel
    // scan order leaked into the output Parquet file. Repeat exports
    // could differ within tie groups.
    const sql = buildSelectQuery('t', ['id', 'name'], [], []);
    expect(sql).toBe('SELECT "id", "name" FROM "t" ORDER BY "t"."__rowid__" ASC');
  });

  it('appends __rowid__ tiebreaker when user sort is set', () => {
    const sort: SortColumn[] = [{ column: 'name', direction: 'asc' }];
    expect(buildSelectQuery('t', ['name'], [], sort)).toBe(
      'SELECT "name" FROM "t" ORDER BY "t"."name" ASC, "t"."__rowid__" ASC',
    );
  });
});

describe('ExportQuery — buildBaseQuery (paginated CSV/JSON batching path)', () => {
  it('every batch carries the tiebreaker so monotonic-OFFSET batches do not duplicate or skip rows at tie boundaries', () => {
    const sort: SortColumn[] = [{ column: 'category', direction: 'asc' }];
    const batch1 = buildBaseQuery('t', ['id'], [], sort, 100, 0);
    const batch2 = buildBaseQuery('t', ['id'], [], sort, 100, 100);
    expect(batch1).toContain('ORDER BY "t"."category" ASC, "t"."__rowid__" ASC');
    expect(batch2).toContain('ORDER BY "t"."category" ASC, "t"."__rowid__" ASC');
    expect(batch1).toContain('LIMIT 100 OFFSET 0');
    expect(batch2).toContain('LIMIT 100 OFFSET 100');
  });

  it('emits ORDER BY "__rowid__" ASC even when user sort is empty', () => {
    const sql = buildBaseQuery('t', ['id'], [], [], 100, 0);
    expect(sql).toContain('ORDER BY "t"."__rowid__" ASC LIMIT 100 OFFSET 0');
  });
});

describe('ExportQuery — buildSelectedRowsQuery (ROW_NUMBER CTE path)', () => {
  it('seeds ROW_NUMBER() OVER with __rowid__ ASC when user sort is empty (was: OVER())', () => {
    // Pre-fix: ROW_NUMBER() OVER() assigned __row_idx__ in arbitrary
    // order so the user's selection indices drifted across runs.
    const sql = buildSelectedRowsQuery('t', ['id'], [], [], [0, 5, 10]);
    expect(sql).toContain('ROW_NUMBER() OVER(ORDER BY "t"."__rowid__" ASC)');
  });

  it('appends __rowid__ ASC after user sort columns inside the OVER clause', () => {
    const sort: SortColumn[] = [
      { column: 'name', direction: 'asc' },
      { column: 'price', direction: 'desc' },
    ];
    const sql = buildSelectedRowsQuery('t', ['id'], [], sort, [0, 5]);
    expect(sql).toContain(
      'ROW_NUMBER() OVER(ORDER BY "t"."name" ASC, "t"."price" DESC, "t"."__rowid__" ASC)',
    );
  });

  it('does not duplicate __rowid__ when the user sort already includes it', () => {
    const sort: SortColumn[] = [{ column: '__rowid__', direction: 'desc' }];
    const sql = buildSelectedRowsQuery('t', ['id'], [], sort, [0, 5]);
    expect(sql).toContain('ROW_NUMBER() OVER(ORDER BY "t"."__rowid__" DESC)');
    expect(sql).not.toContain('"__rowid__" DESC, "t"."__rowid__" ASC');
  });
});
