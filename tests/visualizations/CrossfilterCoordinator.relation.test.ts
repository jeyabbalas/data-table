/**
 * @vitest-environment jsdom
 *
 * The filtered-row count while a derived-column change can drop or rebuild
 * the relation it counts. Counted at once, it failed on the VIEW a removal
 * had dropped, and `state.filteredRows` kept the count from before the
 * filter: the body showed that many rows, and those past the true count
 * stayed placeholders. It waits for the change to settle now, and counts the
 * relation the change leaves. An add leaves the relation readable, and the
 * count goes ahead.
 *
 * The charts' refetches, and the stats panels' filter updates, query the
 * relation too, and are held back the same way: a chart refetched at once
 * queried the dropped VIEW and reported an error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { Filter } from '@/core/types';
import type { BaseStatsPanel } from '@/visualizations/BaseStatsPanel';
import type { BaseVisualization } from '@/visualizations/BaseVisualization';
import { CrossfilterCoordinator } from '@/visualizations/CrossfilterCoordinator';
import { StatsPanelCoordinator } from '@/visualizations/StatsPanelCoordinator';

import {
  deferred,
  makeRowFetchBridge,
  type CapturedQuery,
  type Deferred,
} from '../helpers/rowFetchBridge';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const FILTER: Filter = { type: 'range', column: 'id', min: 0, max: 10, maxInclusive: true };

function setup() {
  const state = createTableState();
  state.tableName.set('t');
  state.baseTableName.set('t');
  initializeColumnsFromSchema(state, [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  ]);
  state.totalRows.set(200);
  state.filteredRows.set(200);
  const { bridge, queries } = makeRowFetchBridge();
  const actions = new StateActions(
    state,
    bridge as unknown as ConstructorParameters<typeof StateActions>[1],
  );
  const coordinator = new CrossfilterCoordinator(
    state,
    actions,
    bridge as unknown as ConstructorParameters<typeof CrossfilterCoordinator>[2],
  );
  return { state, actions, coordinator, queries };
}

async function drain(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function counts(queries: CapturedQuery[]): CapturedQuery[] {
  return queries.filter((q) => q.sql.startsWith('SELECT COUNT(*)'));
}

/** Add `x2 = id * 2` and let it land: validation, type detection, the VIEW. */
async function landDerivedColumn({ actions, queries }: ReturnType<typeof setup>): Promise<void> {
  const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
  for (const rows of [[], [{ t: 'INTEGER' }], []]) {
    await drain();
    queries.at(-1)!.deferred.resolve(rows);
  }
  await expect(add).resolves.toEqual({ success: true });
}

describe('CrossfilterCoordinator during a derived-column change', () => {
  it('counts the filtered rows once a removal has settled, in the table it leaves', async () => {
    const harness = setup();
    const { state, actions, coordinator, queries } = harness;
    await landDerivedColumn(harness);

    const removal = actions.removeDerivedColumn('x2');
    await drain();
    const drop = queries.at(-1)!;
    expect(drop.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);

    actions.addFilter(FILTER);
    await drain();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(counts(queries)).toEqual([]);

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    const [count] = counts(queries);
    expect(count!.sql).toContain('FROM "t"');
    count!.deferred.resolve([{ cnt: 23 }]);
    await drain();
    expect(state.filteredRows.get()).toBe(23);
    coordinator.destroy();
  });

  it('counts once a change that failed has settled', async () => {
    const harness = setup();
    const { state, actions, coordinator, queries } = harness;
    await landDerivedColumn(harness);

    const replace = actions.replaceDerivedColumn('x2', {
      kind: 'expression',
      name: 'x2',
      expression: 'nope',
    });
    await drain();
    const validation = queries.at(-1)!;
    actions.addFilter(FILTER);
    await drain();
    expect(counts(queries)).toEqual([]);

    validation.deferred.reject(new Error('Binder Error'));
    await expect(replace).resolves.toMatchObject({ success: false });
    await vi.advanceTimersByTimeAsync(0);
    const [count] = counts(queries);
    expect(count!.sql).toContain('FROM "__dt_view_t__"');
    count!.deferred.resolve([{ cnt: 23 }]);
    await drain();
    expect(state.filteredRows.get()).toBe(23);
    coordinator.destroy();
  });

  it('waits out a second change that starts as the first settles', async () => {
    const harness = setup();
    const { state, actions, coordinator, queries } = harness;
    await landDerivedColumn(harness);

    const replace = actions.replaceDerivedColumn('x2', {
      kind: 'expression',
      name: 'x2',
      expression: 'nope',
    });
    await drain();
    const validation = queries.at(-1)!;
    actions.addFilter(FILTER);
    await drain();

    validation.deferred.reject(new Error('Binder Error'));
    await replace;
    // Before the count's task runs, a removal starts.
    const removal = actions.removeDerivedColumn('x2');
    await drain();
    const drop = queries.at(-1)!;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(counts(queries)).toEqual([]);

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    const [count] = counts(queries);
    expect(count!.sql).toContain('FROM "t"');
    count!.deferred.resolve([{ cnt: 23 }]);
    await drain();
    expect(state.filteredRows.get()).toBe(23);
    coordinator.destroy();
  });

  it('counts at once during an add', async () => {
    const { state, actions, coordinator, queries } = setup();
    const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
    await drain();

    actions.addFilter(FILTER);
    await drain();
    const [count] = counts(queries);
    expect(count!.sql).toContain('FROM "t"');
    count!.deferred.resolve([{ cnt: 23 }]);
    await drain();
    expect(state.filteredRows.get()).toBe(23);

    queries.find((q) => / LIMIT 0$/.test(q.sql))!.deferred.reject(new Error('Binder Error'));
    await add;
    coordinator.destroy();
  });

  it('counts nothing for filters replaced while it waited', async () => {
    const harness = setup();
    const { actions, coordinator, queries } = harness;
    await landDerivedColumn(harness);

    const removal = actions.removeDerivedColumn('x2');
    await drain();
    const drop = queries.at(-1)!;
    actions.addFilter(FILTER);
    await drain();
    actions.addFilter({ type: 'range', column: 'id', min: 0, max: 20, maxInclusive: true });
    await drain();

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    // One count: of the filters in force.
    const all = counts(queries);
    expect(all).toHaveLength(1);
    expect(all[0]!.sql).toContain('20');
    coordinator.destroy();
  });
});

/** A chart, or a stats panel, that records the filters of each update. */
interface Recorder {
  updates: Filter[][];
  destroyed: boolean;
  updateFilters: (filters: Filter[]) => Promise<void>;
  isDestroyed: () => boolean;
}

function recorder(): Recorder {
  const r: Recorder = {
    updates: [],
    destroyed: false,
    updateFilters: async (filters) => {
      r.updates.push(filters);
    },
    isDestroyed: () => r.destroyed,
  };
  return r;
}

const asChart = (r: Recorder) => r as unknown as BaseVisualization;
const asPanel = (r: Recorder) => r as unknown as BaseStatsPanel;

const WIDER: Filter = { type: 'range', column: 'id', min: 0, max: 20, maxInclusive: true };

/** Start removing `x2`, and return its DROP, held, with the removal. */
async function startRemoval({ actions, queries }: ReturnType<typeof setup>) {
  const removal = actions.removeDerivedColumn('x2');
  await drain();
  const drop = queries.at(-1)!;
  expect(drop.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);
  return { removal, drop };
}

describe('Charts during a derived-column change', () => {
  it('refetches no chart while a removal runs, and each once after it, with the filters then', async () => {
    const harness = setup();
    const { actions, coordinator } = harness;
    await landDerivedColumn(harness);
    const [a, b] = [recorder(), recorder()];
    coordinator.register('id', asChart(a));
    coordinator.register('x2', asChart(b));

    const { removal, drop } = await startRemoval(harness);
    actions.addFilter(FILTER);
    await drain();
    actions.addFilter(WIDER);
    await drain();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(a.updates).toEqual([]);
    expect(b.updates).toEqual([]);

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    expect(a.updates).toEqual([[WIDER]]);
    expect(b.updates).toEqual([[WIDER]]);
    coordinator.destroy();
  });

  it('refetches no chart destroyed or replaced while it waited', async () => {
    const harness = setup();
    const { actions, coordinator } = harness;
    await landDerivedColumn(harness);
    const [gone, replaced, kept] = [recorder(), recorder(), recorder()];
    coordinator.register('a', asChart(gone));
    coordinator.register('b', asChart(replaced));
    coordinator.register('c', asChart(kept));

    const { removal, drop } = await startRemoval(harness);
    actions.addFilter(FILTER);
    await drain();
    gone.destroyed = true;
    // Made after the filter change, and so with its filters.
    const successor = recorder();
    coordinator.register('b', asChart(successor));

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    expect(gone.updates).toEqual([]);
    expect(replaced.updates).toEqual([]);
    expect(successor.updates).toEqual([]);
    expect(kept.updates).toEqual([[FILTER]]);
    coordinator.destroy();
  });

  it('refetches the charts once a change that failed has settled', async () => {
    const harness = setup();
    const { actions, coordinator, queries } = harness;
    await landDerivedColumn(harness);
    const chart = recorder();
    coordinator.register('id', asChart(chart));

    const replace = actions.replaceDerivedColumn('x2', {
      kind: 'expression',
      name: 'x2',
      expression: 'nope',
    });
    await drain();
    const validation = queries.at(-1)!;
    actions.addFilter(FILTER);
    await drain();
    expect(chart.updates).toEqual([]);

    validation.deferred.reject(new Error('Binder Error'));
    await expect(replace).resolves.toMatchObject({ success: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(chart.updates).toEqual([[FILTER]]);
    coordinator.destroy();
  });

  it('refetches the charts at once during an add', async () => {
    const { actions, coordinator, queries } = setup();
    const chart = recorder();
    coordinator.register('id', asChart(chart));
    const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
    await drain();

    actions.addFilter(FILTER);
    expect(chart.updates).toEqual([[FILTER]]);

    queries.find((q) => / LIMIT 0$/.test(q.sql))!.deferred.reject(new Error('Binder Error'));
    await add;
    coordinator.destroy();
  });

  it('refetches and counts nothing once destroyed while it waited', async () => {
    const harness = setup();
    const { actions, coordinator, queries } = harness;
    await landDerivedColumn(harness);
    const chart = recorder();
    coordinator.register('id', asChart(chart));

    const { removal, drop } = await startRemoval(harness);
    actions.addFilter(FILTER);
    await drain();
    coordinator.destroy();

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    expect(chart.updates).toEqual([]);
    expect(counts(queries)).toEqual([]);
  });
});

/**
 * A chart or panel whose update is held until the test settles it, and which
 * logs, as each one goes out, whether the relation could be read then.
 */
function slowUpdater(log: string[], name: string, readable: () => boolean) {
  const pending: Deferred<void>[] = [];
  return {
    pending,
    updateFilters: (_filters: Filter[]): Promise<void> => {
      log.push(`${name}:${readable() ? 'readable' : 'UNREADABLE'}`);
      const d = deferred<void>();
      pending.push(d);
      return d.promise;
    },
    isDestroyed: () => false,
  };
}

describe('Updates queued behind the concurrency cap when a change starts', () => {
  /**
   * A filter added while the relation is readable starts four updates, and
   * queues four. A removal starts; the first four land.
   */
  async function queueEightThenRemove(
    harness: ReturnType<typeof setup>,
    register: (name: string, updater: ReturnType<typeof slowUpdater>) => void,
  ) {
    const { actions } = harness;
    await landDerivedColumn(harness);
    const log: string[] = [];
    const updaters = Array.from({ length: 8 }, (_, i) =>
      slowUpdater(log, `c${i}`, () => actions.isRelationReadable()),
    );
    updaters.forEach((updater, i) => register(`c${i}`, updater));

    actions.addFilter(FILTER);
    await drain();
    expect(log).toEqual(['c0', 'c1', 'c2', 'c3'].map((name) => `${name}:readable`));

    const { removal, drop } = await startRemoval(harness);
    for (const updater of updaters.slice(0, 4)) updater.pending[0]!.resolve();
    await drain();
    await vi.advanceTimersByTimeAsync(1_000);
    return { log, removal, drop };
  }

  it('sends none of the queued chart refetches until the removal settles', async () => {
    const harness = setup();
    const { coordinator } = harness;
    const { log, removal, drop } = await queueEightThenRemove(harness, (name, updater) =>
      coordinator.register(name, updater as unknown as BaseVisualization),
    );
    expect(log).toHaveLength(4);

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    expect(log.slice(4).sort()).toEqual(['c4', 'c5', 'c6', 'c7'].map((name) => `${name}:readable`));
    coordinator.destroy();
  });

  it('sends none of the queued panel updates until the removal settles', async () => {
    const harness = setup();
    const coord = new StatsPanelCoordinator(harness.state, undefined, harness.actions);
    const { log, removal, drop } = await queueEightThenRemove(harness, (name, updater) =>
      coord.register(name, updater as unknown as BaseStatsPanel),
    );
    expect(log).toHaveLength(4);

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    expect(log.slice(4).sort()).toEqual(['c4', 'c5', 'c6', 'c7'].map((name) => `${name}:readable`));
    coord.destroy();
    harness.coordinator.destroy();
  });
});

describe('Stats panels during a derived-column change', () => {
  function panels(harness: ReturnType<typeof setup>): StatsPanelCoordinator {
    return new StatsPanelCoordinator(harness.state, undefined, harness.actions);
  }

  it('updates no panel while a removal runs, and each once after it, with the filters then', async () => {
    const harness = setup();
    const { actions, coordinator } = harness;
    await landDerivedColumn(harness);
    const coord = panels(harness);
    const [a, b] = [recorder(), recorder()];
    coord.register('id', asPanel(a));
    coord.register('x2', asPanel(b));

    const { removal, drop } = await startRemoval(harness);
    actions.addFilter(FILTER);
    await drain();
    actions.addFilter(WIDER);
    await drain();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(a.updates).toEqual([]);
    expect(b.updates).toEqual([]);

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    expect(a.updates).toEqual([[WIDER]]);
    expect(b.updates).toEqual([[WIDER]]);
    coord.destroy();
    coordinator.destroy();
  });

  it('updates no panel destroyed or replaced while it waited', async () => {
    const harness = setup();
    const { actions, coordinator } = harness;
    await landDerivedColumn(harness);
    const coord = panels(harness);
    const [gone, replaced, kept] = [recorder(), recorder(), recorder()];
    coord.register('a', asPanel(gone));
    coord.register('b', asPanel(replaced));
    coord.register('c', asPanel(kept));

    const { removal, drop } = await startRemoval(harness);
    actions.addFilter(FILTER);
    await drain();
    gone.destroyed = true;
    const successor = recorder();
    coord.register('b', asPanel(successor));

    drop.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);
    expect(gone.updates).toEqual([]);
    expect(replaced.updates).toEqual([]);
    expect(successor.updates).toEqual([]);
    expect(kept.updates).toEqual([[FILTER]]);
    coord.destroy();
    coordinator.destroy();
  });

  it('updates the panels at once during an add', async () => {
    const harness = setup();
    const { actions, coordinator, queries } = harness;
    const coord = panels(harness);
    const panel = recorder();
    coord.register('id', asPanel(panel));
    const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
    await drain();

    actions.addFilter(FILTER);
    await drain();
    expect(panel.updates).toEqual([[FILTER]]);

    queries.find((q) => / LIMIT 0$/.test(q.sql))!.deferred.reject(new Error('Binder Error'));
    await add;
    coord.destroy();
    coordinator.destroy();
  });

  it('updates the panels at once, change or not, without the actions', async () => {
    const harness = setup();
    const { actions, coordinator, state } = harness;
    await landDerivedColumn(harness);
    const coord = new StatsPanelCoordinator(state);
    const panel = recorder();
    coord.register('id', asPanel(panel));

    const { removal, drop } = await startRemoval(harness);
    actions.addFilter(FILTER);
    await drain();
    expect(panel.updates).toEqual([[FILTER]]);

    drop.deferred.resolve([]);
    await removal;
    coord.destroy();
    coordinator.destroy();
  });
});
