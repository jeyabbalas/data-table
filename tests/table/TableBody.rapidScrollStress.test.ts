/**
 * @vitest-environment jsdom
 *
 * Stress: a seeded random scroll walk with fetches resolving in shuffled
 * order — the closest a unit test gets to the reported bug ("rapid
 * scrolling shows values changing in place; scroll away and back shows
 * different content"). After the storm drains, every invariant the
 * pipeline promises must hold simultaneously:
 *
 *  - viewport DOM covers exactly the final range, strictly ascending
 *  - every data row's data-row-id equals its data-row-index
 *  - no placeholders remain for cached indices
 *  - the row cache respects its cap (± one block of write slack)
 *  - aborted fetches stayed silent (no console.error)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { rowsFor, type CapturedQuery } from '../helpers/rowFetchBridge';
import { HARNESS_COLUMNS, MockResizeObserver, setupTableBody } from '../helpers/tableBodyHarness';

const BLOCK = 16;
const CACHE_ROWS = 256;
const TOTAL_ROWS = 5_000;
const STEPS = 40;

/** Deterministic PRNG (mulberry32) — the walk must be reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TableBody — rapid random scroll storm with shuffled fetch resolution', () => {
  it('all pipeline invariants hold after a 40-step seeded walk drains', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rng = mulberry32(0xc0ffee);

    const { body, queries, scrollToRow, drain } = setupTableBody({
      totalRows: TOTAL_ROWS,
      body: { fetchBlockSize: BLOCK, rowCacheRows: CACHE_ROWS }, // prefetch stays ON
    });

    const initPromise = body.initialize();
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS));
    await initPromise;

    // The storm: jump anywhere, occasionally letting microtasks run so
    // aborts, rejections, and finally-reconciles interleave mid-walk.
    for (let step = 0; step < STEPS; step++) {
      const row = Math.floor(rng() * (TOTAL_ROWS - 25));
      scrollToRow(row);
      if (step % 3 === 2) await drain(1);
    }

    // Drain the backlog: resolve every still-unsettled fetch in SHUFFLED
    // order. Aborted deferreds already rejected (resolving them is a
    // no-op). Each resolution can legitimately spawn follow-up fetches
    // (finally-reconcile top-ups, prefetch), so loop until quiet.
    const resolvedByTest = new Set<CapturedQuery>();
    resolvedByTest.add(queries[0]!);
    for (let round = 0; round < 10; round++) {
      const pending = queries.filter((q) => !resolvedByTest.has(q) && q.signal?.aborted !== true);
      if (pending.length === 0) break;
      // Fisher–Yates with the seeded rng: resolution order ≠ issue order.
      for (let i = pending.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pending[i], pending[j]] = [pending[j]!, pending[i]!];
      }
      for (const q of pending) {
        resolvedByTest.add(q);
        q.deferred.resolve(rowsFor(q.sql, HARNESS_COLUMNS));
      }
      await drain(8);
    }
    await drain(8);

    // Quiet: nothing new may be issued once everything settled.
    const settledCount = queries.length;
    await drain(8);
    expect(queries.length).toBe(settledCount);

    // --- The invariants -------------------------------------------------
    const range = body.getVisibleRange();
    const internal = body as unknown as {
      rowDataCache: Map<number, unknown>;
      rowElementMap: Map<number, HTMLElement>;
    };

    // DOM covers exactly the final range, in order.
    expect(body.__verifyDomOrderForTests()).toBe(true);
    const keys = [...internal.rowElementMap.keys()].sort((a, b) => a - b);
    expect(keys).toEqual(
      Array.from({ length: range.end - range.start }, (_, i) => range.start + i),
    );

    // Every rendered row is a data row for exactly the index it occupies,
    // and no placeholder covers a cached index.
    for (const [index, rowEl] of internal.rowElementMap) {
      expect(internal.rowDataCache.has(index), `row ${index} cached`).toBe(true);
      expect(rowEl.hasAttribute('data-placeholder'), `row ${index} promoted`).toBe(false);
      expect(rowEl.getAttribute('data-row-id'), `row ${index} identity`).toBe(String(index));
    }

    // Cache bounded by the cap (+ one block of just-written slack).
    expect(internal.rowDataCache.size).toBeLessThanOrEqual(CACHE_ROWS + BLOCK);

    // The whole storm produced zero error noise: every superseded fetch
    // was aborted and swallowed silently.
    expect(errorSpy).not.toHaveBeenCalled();

    body.destroy();
  });
});
