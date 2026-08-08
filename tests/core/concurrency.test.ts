/**
 * `runLimited` — the bounded-concurrency task pool shared by the two
 * filter-broadcast coordinators (`src/core/concurrency.ts`).
 *
 * Both `CrossfilterCoordinator` and `StatsPanelCoordinator` used to carry a
 * private copy of this loop; the hoisted version has to keep every property
 * they each relied on:
 *
 *   1. results in **input** order (the crossfilter copy returned `T[]`),
 *   2. an empty-task short circuit (the stats-panel copy had one),
 *   3. a real ceiling on in-flight tasks (the reason both existed),
 *   4. `concurrency` clamped to at least one worker,
 *   5. `Promise.all`-style rejection: the combined promise rejects, siblings
 *      already in flight run to completion.
 */

import { describe, it, expect } from 'vitest';

import { runLimited } from '../../src/core/concurrency';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Shared in-flight counter so tasks can observe real parallelism. */
function makeTracker(): { inflight: number; peak: number; started: number[] } {
  return { inflight: 0, peak: 0, started: [] };
}

/** A task that occupies a pool slot for `ms` and reports its index. */
function makeTask(
  tracker: ReturnType<typeof makeTracker>,
  index: number,
  ms: number,
): () => Promise<number> {
  return async () => {
    tracker.started.push(index);
    tracker.inflight += 1;
    tracker.peak = Math.max(tracker.peak, tracker.inflight);
    try {
      await delay(ms);
      return index;
    } finally {
      tracker.inflight -= 1;
    }
  };
}

describe('runLimited', () => {
  it('resolves results in input order, not completion order', async () => {
    const completions: number[] = [];
    // Descending delays: task 0 finishes last, task 4 finishes first.
    const tasks = [40, 30, 20, 10, 1].map((ms, i) => async () => {
      await delay(ms);
      completions.push(i);
      return `r${i}`;
    });

    const results = await runLimited(tasks, 5);

    expect(results).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
    // Sanity: completion order really was the reverse, so ordering is not
    // an accident of the tasks settling in sequence.
    expect(completions).toEqual([4, 3, 2, 1, 0]);
  });

  it('holds the concurrency ceiling: the in-flight high-water mark equals the cap', async () => {
    const tracker = makeTracker();
    const tasks = Array.from({ length: 12 }, (_, i) => makeTask(tracker, i, 15));

    const results = await runLimited(tasks, 3);

    expect(tracker.peak).toBe(3);
    expect(tracker.inflight).toBe(0);
    // Every task ran exactly once, and the pool pulled them in order.
    expect(tracker.started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('never starts more workers than there are tasks', async () => {
    const tracker = makeTracker();
    const tasks = Array.from({ length: 2 }, (_, i) => makeTask(tracker, i, 10));

    await runLimited(tasks, 64);

    expect(tracker.peak).toBe(2);
  });

  it('short-circuits an empty task list to []', async () => {
    const tracker = makeTracker();

    await expect(runLimited([], 4)).resolves.toEqual([]);
    await expect(runLimited([], 0)).resolves.toEqual([]);

    expect(tracker.started).toEqual([]);
  });

  it('clamps a concurrency below 1 to a single worker instead of stalling', async () => {
    for (const cap of [1, 0, -5]) {
      const tracker = makeTracker();
      const tasks = Array.from({ length: 4 }, (_, i) => makeTask(tracker, i, 5));

      const results = await runLimited(tasks, cap);

      expect(tracker.peak).toBe(1);
      expect(results).toEqual([0, 1, 2, 3]);
    }
  });

  it('clamps a non-finite concurrency to a single worker (never a silent no-op)', async () => {
    const tracker = makeTracker();
    const tasks = Array.from({ length: 3 }, (_, i) => makeTask(tracker, i, 5));

    // `Array.from({ length: NaN })` is empty, so an unguarded cap would
    // resolve without running a single task.
    const results = await runLimited(tasks, Number.NaN);

    expect(tracker.peak).toBe(1);
    expect(results).toEqual([0, 1, 2]);
  });

  it('rejects with the first failure while sibling tasks keep running', async () => {
    const settled: string[] = [];
    const tasks = [
      async () => {
        await delay(5);
        settled.push('a');
        throw new Error('boom');
      },
      async () => {
        await delay(40);
        settled.push('b');
        return 'b';
      },
      async () => {
        await delay(40);
        settled.push('c');
        return 'c';
      },
    ];

    // Cap === task count, so all three are in flight when 'a' rejects.
    await expect(runLimited(tasks, 3)).rejects.toThrow('boom');

    // The combined promise rejected before the siblings finished...
    expect(settled).toEqual(['a']);

    // ...and rejecting did not cancel them.
    await delay(60);
    expect(settled).toEqual(['a', 'b', 'c']);
  });

  it('does not start work still queued behind a failed worker', async () => {
    const started: number[] = [];
    const tasks = [
      async () => {
        started.push(0);
        await delay(1);
        throw new Error('boom');
      },
      async () => {
        started.push(1);
        return 1;
      },
      async () => {
        started.push(2);
        return 2;
      },
    ];

    // One worker: the rejection tears down the only puller, so tasks 1 and 2
    // are never invoked. This is the documented divergence from
    // `Promise.all(tasks.map((t) => t()))`, which starts everything up front.
    await expect(runLimited(tasks, 1)).rejects.toThrow('boom');
    await delay(20);
    expect(started).toEqual([0]);
  });
});
