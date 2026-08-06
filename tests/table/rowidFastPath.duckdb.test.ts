/**
 * Real-DuckDB parity proof for the __rowid__ range fast path.
 *
 * TableBody's fast path (no filters, no user sort) replaces
 * `ORDER BY "__rowid__" ASC LIMIT n OFFSET k` with
 * `WHERE "__rowid__" >= k AND "__rowid__" < k+n ORDER BY "__rowid__" ASC`.
 * The two must return byte-identical windows whenever __rowid__ is dense
 * 0..N-1 — which is how every loader materializes it
 * (`row_number() OVER () - 1`) and how the derived-column VIEW preserves
 * it (`base t LEFT JOIN helper h ON t.__rowid__ = h.__rowid__`).
 *
 * The SQL strings here mirror the two shapes `buildRowQuery` emits; the
 * shapes themselves are pinned against buildRowQuery's actual output by
 * `TableBody.fastPathSql.test.ts`, so the pair of suites closes the
 * drift loop: unit test proves the emitted shape, this test proves the
 * shape's semantics on a real engine — including at depths where OFFSET
 * cost is the whole point.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

const TOTAL_ROWS = 50_000;

interface ParityCase {
  label: string;
  offset: number;
  limit: number;
}

const CASES: ParityCase[] = [
  { label: 'top of table', offset: 0, limit: 16 },
  { label: 'mid table, unaligned-feeling offset', offset: 1_234, limit: 64 },
  { label: 'deep offset (where OFFSET pagination pays top-k cost)', offset: 25_000, limit: 128 },
  { label: 'exact tail window', offset: TOTAL_ROWS - 16, limit: 16 },
];

describe('__rowid__ range fast path ≡ OFFSET pagination (real DuckDB)', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);

    // Base table shaped like a loader's output: dense BIGINT __rowid__
    // 0..N-1 plus payload columns (val cycles so ties exist; label is
    // unique so misalignment is detectable per row).
    await harness.conn.query(
      `CREATE TABLE base AS
         SELECT CAST(range AS BIGINT) AS "__rowid__",
                (range * 7) % 1000 AS val,
                'r' || range AS label
         FROM range(${TOTAL_ROWS})`,
    );

    // Derived-column shape: a sparse helper LEFT-JOINed on __rowid__ —
    // exactly DerivedColumnManager.recreateView's join, density preserved,
    // with NULLs where the helper has no row.
    await harness.conn.query(
      `CREATE TABLE helper AS
         SELECT "__rowid__", "__rowid__" * 2 AS x
         FROM base
         WHERE "__rowid__" % 3 = 0`,
    );
    await harness.conn.query(
      `CREATE VIEW v AS
         SELECT t.*, h.x
         FROM base t
         LEFT JOIN helper h ON t."__rowid__" = h."__rowid__"`,
    );
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  function fastSql(source: string, columns: string, offset: number, limit: number): string {
    return (
      `SELECT ${columns} FROM "${source}"` +
      ` WHERE "__rowid__" >= ${offset} AND "__rowid__" < ${offset + limit}` +
      ` ORDER BY "__rowid__" ASC LIMIT ${limit}`
    );
  }

  function offsetSql(source: string, columns: string, offset: number, limit: number): string {
    return (
      `SELECT ${columns} FROM "${source}"` +
      ` ORDER BY "__rowid__" ASC LIMIT ${limit} OFFSET ${offset}`
    );
  }

  for (const source of [
    { name: 'base', columns: '"__rowid__", val, label' },
    { name: 'v', columns: '"__rowid__", val, label, x' },
  ]) {
    describe(`source: ${source.name}`, () => {
      for (const { label, offset, limit } of CASES) {
        it(`${label} — [${offset}, ${offset + limit}) windows are identical`, async () => {
          const fast = await bridge.query(fastSql(source.name, source.columns, offset, limit));
          const paged = await bridge.query(offsetSql(source.name, source.columns, offset, limit));

          expect(fast).toHaveLength(limit);
          expect(fast).toEqual(paged);
          // And the window really is the positional window: dense rowids.
          for (let i = 0; i < limit; i++) {
            expect((fast[i] as { __rowid__: number }).__rowid__).toBe(offset + i);
          }
        });
      }
    });
  }

  it('the VIEW preserves base row count exactly (LEFT JOIN adds/drops nothing)', async () => {
    const [{ n }] = (await bridge.query('SELECT COUNT(*)::INT AS n FROM v')) as Array<{
      n: number;
    }>;
    expect(n).toBe(TOTAL_ROWS);
  });
});
