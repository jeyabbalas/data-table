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
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { Filter } from '@/core/types';
import { CrossfilterCoordinator } from '@/visualizations/CrossfilterCoordinator';

import { makeRowFetchBridge, type CapturedQuery } from '../helpers/rowFetchBridge';

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
