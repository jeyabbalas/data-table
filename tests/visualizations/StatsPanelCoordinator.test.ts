/**
 * StatsPanelCoordinator — filter-broadcast tests.
 *
 * Mirrors `tests/visualizations/CrossfilterCoordinator.test.ts`. Every panel
 * that survives a filter change should see exactly one `updateFilters` call;
 * destroyed panels are skipped; one panel throwing inside `updateFilters`
 * does not abort the others; concurrency is bounded.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';

import { StatsPanelCoordinator } from '../../src/visualizations/StatsPanelCoordinator';
import { createTableState } from '../../src/core/State';
import type { Filter } from '../../src/core/types';
import type { BaseStatsPanel } from '../../src/visualizations/BaseStatsPanel';

interface StubPanel extends BaseStatsPanel {
  calls: Filter[][];
}

function makeStubPanel(opts: {
  destroyed?: boolean;
  delayMs?: number;
  throwOnUpdate?: boolean;
} = {}): StubPanel {
  const calls: Filter[][] = [];
  const panel = {
    calls,
    isDestroyed: vi.fn().mockReturnValue(Boolean(opts.destroyed)),
    async updateFilters(filters: Filter[]): Promise<void> {
      calls.push(filters);
      if (opts.throwOnUpdate) throw new Error('panel boom');
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    },
  } as unknown as StubPanel;
  return panel;
}

/** Stub panel that tracks live concurrency through a shared counter. */
function makeConcurrencyPanel(
  tracker: { inflight: number; peak: number },
  delayMs = 10,
): BaseStatsPanel {
  return {
    async updateFilters(_filters: Filter[]): Promise<void> {
      tracker.inflight += 1;
      tracker.peak = Math.max(tracker.peak, tracker.inflight);
      try {
        await new Promise((r) => setTimeout(r, delayMs));
      } finally {
        tracker.inflight -= 1;
      }
    },
    isDestroyed: () => false,
  } as unknown as BaseStatsPanel;
}

const dummyFilter: Filter = {
  type: 'not-null',
  column: 'col_0',
} as unknown as Filter;

describe('StatsPanelCoordinator', () => {
  it('subscribes to state.filters and broadcasts to every registered panel', async () => {
    const state = createTableState();
    state.tableName.set('t');

    const coord = new StatsPanelCoordinator(state);
    const a = makeStubPanel();
    const b = makeStubPanel();
    coord.register('age', a);
    coord.register('country', b);

    state.filters.set([dummyFilter]);
    // Yield twice: once for the synchronous setter, once for the async broadcast.
    await Promise.resolve();
    await Promise.resolve();

    // Wait until both panels have received the update (broadcast is async).
    const start = Date.now();
    while ((a.calls.length === 0 || b.calls.length === 0) && Date.now() - start < 1000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
    expect(a.calls[0]).toEqual([dummyFilter]);

    coord.destroy();
  });

  it('skips destroyed panels on broadcast', async () => {
    const state = createTableState();
    state.tableName.set('t');

    const coord = new StatsPanelCoordinator(state);
    const live = makeStubPanel();
    const dead = makeStubPanel({ destroyed: true });
    coord.register('a', live);
    coord.register('b', dead);

    state.filters.set([dummyFilter]);
    const start = Date.now();
    while (live.calls.length === 0 && Date.now() - start < 1000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(live.calls).toHaveLength(1);
    expect(dead.calls).toHaveLength(0);

    coord.destroy();
  });

  it('one panel throwing in updateFilters does not abort the others', async () => {
    const state = createTableState();
    state.tableName.set('t');

    const coord = new StatsPanelCoordinator(state);
    const ok = makeStubPanel();
    const bad = makeStubPanel({ throwOnUpdate: true });
    coord.register('ok', ok);
    coord.register('bad', bad);

    state.filters.set([dummyFilter]);
    const start = Date.now();
    while (ok.calls.length === 0 && Date.now() - start < 1000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(ok.calls).toHaveLength(1);
    expect(bad.calls).toHaveLength(1); // updateFilters started before throwing

    coord.destroy();
  });

  it('register / unregister round-trip; unregistered panel does not receive updates', async () => {
    const state = createTableState();
    state.tableName.set('t');

    const coord = new StatsPanelCoordinator(state);
    const a = makeStubPanel();
    coord.register('age', a);
    coord.unregister('age');

    state.filters.set([dummyFilter]);
    await new Promise((r) => setTimeout(r, 20));

    expect(a.calls).toHaveLength(0);
    expect(coord.has('age')).toBe(false);

    coord.destroy();
  });

  it('register on a destroyed coordinator is a no-op', () => {
    const state = createTableState();
    const coord = new StatsPanelCoordinator(state);
    coord.destroy();

    coord.register('age', makeStubPanel());
    expect(coord.has('age')).toBe(false);
  });

  it('destroy() unsubscribes; further filter changes do not broadcast', async () => {
    const state = createTableState();
    state.tableName.set('t');

    const coord = new StatsPanelCoordinator(state);
    const a = makeStubPanel();
    coord.register('age', a);
    coord.destroy();

    state.filters.set([dummyFilter]);
    await new Promise((r) => setTimeout(r, 20));

    expect(a.calls).toHaveLength(0);
  });

  it('syncExistingFilters() pushes the supplied filter array to every panel', async () => {
    const state = createTableState();
    state.tableName.set('t');

    const coord = new StatsPanelCoordinator(state);
    const a = makeStubPanel();
    coord.register('age', a);

    coord.syncExistingFilters([dummyFilter]);
    const start = Date.now();
    while (a.calls.length === 0 && Date.now() - start < 1000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(a.calls).toHaveLength(1);
    expect(a.calls[0]).toEqual([dummyFilter]);

    coord.destroy();
  });

  it('caps concurrent updateFilters calls at the configured ceiling', async () => {
    const state = createTableState();
    state.tableName.set('t');
    const coord = new StatsPanelCoordinator(state, 4);

    const tracker = { inflight: 0, peak: 0 };
    for (let i = 0; i < 20; i += 1) {
      coord.register(`col_${i}`, makeConcurrencyPanel(tracker, 15));
    }

    state.filters.set([dummyFilter]);

    const start = Date.now();
    while (tracker.inflight > 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(tracker.peak).toBeGreaterThan(0);
    expect(tracker.peak).toBeLessThanOrEqual(4);

    coord.destroy();
  });

  it('floors the concurrency at 1 when given a non-positive value', async () => {
    const state = createTableState();
    state.tableName.set('t');
    const coord = new StatsPanelCoordinator(state, 0);

    const tracker = { inflight: 0, peak: 0 };
    for (let i = 0; i < 5; i += 1) {
      coord.register(`col_${i}`, makeConcurrencyPanel(tracker, 5));
    }

    state.filters.set([dummyFilter]);
    const start = Date.now();
    while (tracker.inflight > 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(tracker.peak).toBe(1);

    coord.destroy();
  });

  it('drops superseded broadcasts before they reach the next panel', async () => {
    // Regression for the missing filterSequence guard. Setup: concurrency=1
    // serializes panels in registration order, and panel A's updateFilters
    // yields long enough for F2 to land while F1 is still in flight. After
    // F2 advances the seq, the worker dequeues panel B's task for F1 and
    // self-skips before reaching panel B; F1 never touches panel B.
    const state = createTableState();
    state.tableName.set('t');
    const coord = new StatsPanelCoordinator(state, 1);

    const a = makeStubPanel({ delayMs: 50 });
    const b = makeStubPanel();
    coord.register('a', a);
    coord.register('b', b);

    const F1: Filter = { type: 'not-null', column: 'col_0' } as unknown as Filter;
    const F2: Filter = { type: 'not-null', column: 'col_1' } as unknown as Filter;

    state.filters.set([F1]);
    // Wait long enough for panel A's updateFilters to push F1 and start
    // awaiting its 50ms delay, while panel B's task is still queued.
    await new Promise((r) => setTimeout(r, 15));
    state.filters.set([F2]);

    // Wait for both broadcasts to settle.
    await new Promise((r) => setTimeout(r, 200));

    // Panel A: hit by F1 (already in flight), then by F2.
    expect(a.calls).toEqual([[F1], [F2]]);
    // Panel B: F1 was skipped (seq advanced before its turn); only F2 lands.
    expect(b.calls).toEqual([[F2]]);

    coord.destroy();
  });
});
