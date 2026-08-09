/**
 * Projection-cost spike — what a 128-row block fetch costs as a function of
 * how many columns it projects, measured against a real DuckDB.
 *
 * This is the evidence Phase 5 (`plans/scaling/phase-05-projection-clipping.md`
 * §4.6) is built on, and the evidence README §9 asks for before the Arrow-IPC
 * transport deferral can be re-decided. Two questions, one run:
 *
 *  1. **Is clipping worth it?** At WIDE the body renders ~28 of 1,000 columns
 *     but the block fetch has always projected all 1,000. This times the same
 *     block windows at three projection widths against one table in one
 *     process, so the before/after is internal to a single measurement and
 *     needs no pre-phase checkout to compare against.
 *  2. **Where does the time go — execution or serialization?** DuckDB's
 *     `conn.send()` runs the whole query before it resolves (the worker path
 *     leaves `allowStreamResult` at `false` deliberately, see
 *     `src/worker/duckdb.ts`), so the `for await` drain that follows is pure
 *     Arrow → JS materialization: `row.toJSON()` + `convertBigInts` per row.
 *     If that drain dominates, the win is in the values transferred and an
 *     Arrow-IPC transport would attack the same cost from the other side; if
 *     execution dominates, the deferral stands on its own.
 *
 * Gated by `RUN_DUCKDB_PERF=1` for the reason
 * `benchmarks.duckdb.test.ts:10-12` gives — real-load timings vary by several
 * times across machines, so they document rather than gate. Everything
 * asserted here is either a ratio internal to one run or an exact value count.
 *
 * The seeded walk means a rerun measures the same block set, so a changed
 * number is a changed engine or a changed query shape, never a changed RNG.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { quoteIdentifier } from '@/filters/FilterSQL';
import { __setConnForTests, convertBigInts, executeQueryCancellable } from '@/worker/duckdb';

import { columnName, resolveTier, tierSelectList } from '../fixtures/tiers';
import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';

const RUN = process.env['RUN_DUCKDB_PERF'] === '1';
const describeIfPerf = RUN ? describe : describe.skip;

const TABLE = 'proj_wide';
const COLS = 1_000;
/**
 * Rows in the spike table.
 *
 * 20,000 — WIDE's column count at WIDE_CI's depth, i.e. 20M cells. The full
 * WIDE tier (1,000 × 100,000) does not build here: `tierSelectSQL`'s docblock
 * records the same table overrunning DuckDB-WASM's ~3 GiB ceiling, and this
 * spike materializes rather than streams because it has to query the result
 * 120 times. Override with `DT_PROJECTION_ROWS` to re-measure at another
 * depth; anything that OOMs should be recorded rather than worked around.
 */
const ROWS = Number(process.env['DT_PROJECTION_ROWS'] ?? 20_000);
/** Rows per fetch — `TableBodyOptions.fetchBlockSize`'s default. */
const BLOCK = 128;
/** Blocks timed per shape, after the warm-up. */
const SAMPLES = 40;

/**
 * The three projection widths, in columns *excluding* `__rowid__`.
 *
 * - `full` is the pre-phase shape: every visible column, whatever is on screen.
 * - `padMax` is the phase's worst case — a 28-column render window padded by
 *   one span per side and quantized outward to a multiple of `COL_QUANTUM`
 *   (16) lands at 112.
 * - `padTypical` is the resting case: a 14-column window at the jsdom/CI
 *   viewport pads and quantizes to 40.
 */
const SHAPES = [
  { name: 'full', columns: COLS },
  { name: 'padMax', columns: 112 },
  { name: 'padTypical', columns: 40 },
] as const;

/** mulberry32 — the same deterministic walk `benchmarks.duckdb.test.ts` uses. */
function makeRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The exact SQL `TableBody.buildRowQuery` emits on the unsorted/unfiltered
 * fast path, projecting `__rowid__` plus `columns` starting at `from`.
 */
function blockSQL(from: number, columns: number, blockStart: number): string {
  const parts = [quoteIdentifier('__rowid__')];
  for (let c = from; c < from + columns; c++) parts.push(quoteIdentifier(columnName(c)));
  return (
    `SELECT ${parts.join(', ')} FROM ${quoteIdentifier(TABLE)}` +
    ` WHERE ${quoteIdentifier('__rowid__')} >= ${blockStart}` +
    ` AND ${quoteIdentifier('__rowid__')} < ${blockStart + BLOCK}` +
    ` ORDER BY ${quoteIdentifier('__rowid__')} ASC LIMIT ${BLOCK}`
  );
}

interface Timing {
  /** `await conn.send(sql)` — the whole query, since streaming is off. */
  execMs: number;
  /** The `for await` drain: Arrow batch → `toJSON()` → `convertBigInts`. */
  drainMs: number;
  /** Values materialized: rows × properties. */
  values: number;
}

describeIfPerf('projection cost per block fetch (opt-in via RUN_DUCKDB_PERF=1)', () => {
  let harness: NodeDuckDBHarness;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    // `tierTableSQL` builds `col_0…col_999` but no `__rowid__`; the loaders
    // inject that column, and the fast path's range predicate is on it — so
    // the table is `tierSelectList` with the loaders' own
    // `row_number() OVER () - 1` equivalent prepended.
    const spec = resolveTier('custom', { rows: ROWS, cols: COLS, seed: 2 });
    await harness.conn.query(
      `CREATE OR REPLACE TABLE ${quoteIdentifier(TABLE)} AS\n` +
        `SELECT CAST(i AS BIGINT) AS ${quoteIdentifier('__rowid__')}, ${tierSelectList(spec)}\n` +
        `FROM range(0, ${spec.rows}) t(i)`,
    );
    __setConnForTests(harness.conn);
  }, 600_000);

  afterAll(async () => {
    __setConnForTests(null);
    await harness?.cleanup();
  });

  it('clipping the projection cuts block latency and payload together', async () => {
    const blockCount = Math.floor(ROWS / BLOCK);
    // One seeded walk, replayed per shape, so all three time the identical
    // block windows — the comparison is internal to this run.
    const starts = (() => {
      const random = makeRandom(0xc0ffee);
      return Array.from({ length: SAMPLES }, () => Math.floor(random() * blockCount) * BLOCK);
    })();

    /**
     * Mirror of `executeQueryCancellable` with the two phases timed apart.
     * The assertion below proves the mirror is faithful before any of its
     * numbers are believed.
     */
    const timeSplit = async (sql: string): Promise<Timing> => {
      const t0 = performance.now();
      const reader = await harness.conn.send(sql);
      const t1 = performance.now();
      const rows: Record<string, unknown>[] = [];
      for await (const batch of reader) {
        for (const row of batch.toArray()) {
          rows.push(convertBigInts(row.toJSON()) as Record<string, unknown>);
        }
      }
      const t2 = performance.now();
      expect(rows).toHaveLength(BLOCK);
      return {
        execMs: t1 - t0,
        drainMs: t2 - t1,
        values: rows.length * Object.keys(rows[0]!).length,
      };
    };

    const report: Record<string, Timing & { totalMs: number; realMs: number }> = {};

    for (const shape of SHAPES) {
      // Warm-up: the first touch of a column range pays page-in costs the
      // steady state does not, and it is the steady state that ships.
      for (let k = 0; k < 3; k++) {
        await executeQueryCancellable(blockSQL(0, shape.columns, starts[k]!));
      }

      let execMs = 0;
      let drainMs = 0;
      let realMs = 0;
      let values = 0;
      for (const blockStart of starts) {
        // A different window start per block, so no shape can win by
        // repeatedly touching one hot column range.
        const from = (blockStart / BLOCK) % Math.max(1, COLS - shape.columns);
        const sql = blockSQL(from, shape.columns, blockStart);
        const split = await timeSplit(sql);
        execMs += split.execMs;
        drainMs += split.drainMs;
        values += split.values;

        const t0 = performance.now();
        const rows = await executeQueryCancellable<Record<string, unknown>>(sql);
        realMs += performance.now() - t0;
        expect(rows).toHaveLength(BLOCK);
      }

      report[shape.name] = {
        execMs: execMs / SAMPLES,
        drainMs: drainMs / SAMPLES,
        values: values / SAMPLES,
        totalMs: (execMs + drainMs) / SAMPLES,
        realMs: realMs / SAMPLES,
      };
    }

    const round = (n: number): number => Math.round(n * 1000) / 1000;
    for (const shape of SHAPES) {
      const r = report[shape.name]!;
      console.log(
        `[projection] ${shape.name.padEnd(10)} ${String(shape.columns + 1).padStart(5)} cols  ` +
          `exec ${String(round(r.execMs)).padStart(8)} ms  ` +
          `drain ${String(round(r.drainMs)).padStart(8)} ms  ` +
          `total ${String(round(r.totalMs)).padStart(8)} ms  ` +
          `(real executeQueryCancellable ${round(r.realMs)} ms)  ` +
          `drain share ${Math.round((100 * r.drainMs) / r.totalMs)}%  ` +
          `${r.values} values/block`,
      );
    }

    const full = report['full']!;
    const padMax = report['padMax']!;
    const padTypical = report['padTypical']!;
    console.log(
      `[projection] ratios vs full — padMax ${round(full.totalMs / padMax.totalMs)}×, ` +
        `padTypical ${round(full.totalMs / padTypical.totalMs)}× ` +
        `(payload ${round(full.values / padMax.values)}× / ` +
        `${round(full.values / padTypical.values)}×), ` +
        `rows=${ROWS} cols=${COLS} block=${BLOCK} samples=${SAMPLES}`,
    );

    // The mirror is a faithful stand-in for the shipping function: its two
    // phases sum to what `executeQueryCancellable` costs end to end. Without
    // this the split would be an unverified attribution.
    for (const shape of SHAPES) {
      const r = report[shape.name]!;
      expect(Math.abs(r.totalMs - r.realMs) / r.realMs).toBeLessThan(0.5);
    }

    // Payload: exact, machine-independent, and the number Phase 5's
    // `BLOCK_VALUES_MAX` budget guards in the jsdom suites.
    expect(full.values).toBe(BLOCK * (COLS + 1));
    expect(padMax.values).toBe(BLOCK * 113);
    expect(padTypical.values).toBe(BLOCK * 41);

    // Wall clock: a ratio internal to one run, so it survives a slow shared
    // runner. Deliberately far below the ~10× §4.6 predicts — this is a
    // "clipping is not a wash" gate, not a performance target.
    expect(full.totalMs / padMax.totalMs).toBeGreaterThan(2);
    expect(full.totalMs / padTypical.totalMs).toBeGreaterThan(3);
  }, 900_000);
});
