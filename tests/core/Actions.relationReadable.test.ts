/**
 * `StateActions.isRelationReadable` and `whenRelationReadable`: what the
 * table body's row fetches and the filtered-row count wait for while a
 * derived-column change can drop or rebuild the relation they read. A
 * removal, a replacement, an undo can; an add can not, and reads go on
 * while one runs.
 */
import { describe, expect, it } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { UndoManager } from '@/core/UndoManager';

import { makeRowFetchBridge, type CapturedQuery } from '../helpers/rowFetchBridge';

function setup(undoManager?: UndoManager) {
  const state = createTableState();
  state.tableName.set('t');
  state.baseTableName.set('t');
  initializeColumnsFromSchema(state, [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  ]);
  const { bridge, queries } = makeRowFetchBridge();
  const actions = new StateActions(
    state,
    bridge as unknown as ConstructorParameters<typeof StateActions>[1],
    undoManager,
  );
  return { state, actions, queries };
}

async function drain(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

/** Answer the last query DuckDB was sent. */
async function answer(queries: CapturedQuery[], rows: unknown[] = []): Promise<CapturedQuery> {
  const last = queries.at(-1)!;
  last.deferred.resolve(rows);
  await drain();
  return last;
}

/** Add `x2 = id * 2` and let it land: validation, type detection, the VIEW. */
async function landDerivedColumn({ actions, queries }: ReturnType<typeof setup>): Promise<void> {
  const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
  await drain();
  await answer(queries);
  await answer(queries, [{ t: 'INTEGER' }]);
  await answer(queries);
  await expect(add).resolves.toEqual({ success: true });
}

/** Whether a `whenRelationReadable()` made now has resolved. */
function watchReadable(actions: StateActions): { resolved: boolean } {
  const watch = { resolved: false };
  void actions.whenRelationReadable().then(() => (watch.resolved = true));
  return watch;
}

describe('StateActions.whenRelationReadable', () => {
  it('resolves at once when no derived-column change is in flight', async () => {
    const { actions } = setup();
    expect(actions.isRelationReadable()).toBe(true);
    const readable = watchReadable(actions);
    await Promise.resolve();
    expect(readable.resolved).toBe(true);
  });

  it('holds while a removal drops the VIEW, and resolves before the state update', async () => {
    const harness = setup();
    const { state, actions, queries } = harness;
    await landDerivedColumn(harness);
    expect(state.tableName.get()).toBe('__dt_view_t__');

    const removal = actions.removeDerivedColumn('x2');
    await drain();
    expect(queries.at(-1)!.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);
    expect(actions.isRelationReadable()).toBe(false);
    let tableNameWhenReadable: string | null = null;
    void actions.whenRelationReadable().then(() => (tableNameWhenReadable = state.tableName.get()));
    await drain();
    expect(tableNameWhenReadable).toBeNull();

    queries.at(-1)!.deferred.resolve([]);
    await removal;
    expect(tableNameWhenReadable).toBe('__dt_view_t__');
    expect(state.tableName.get()).toBe('t');
    expect(actions.isRelationReadable()).toBe(true);
  });

  it('holds while a replacement rebuilds the VIEW, and resolves when it fails', async () => {
    const harness = setup();
    const { actions, queries } = harness;
    await landDerivedColumn(harness);

    const replace = actions.replaceDerivedColumn('x2', {
      kind: 'expression',
      name: 'x2',
      expression: 'nope * 3',
    });
    await drain();
    expect(actions.isRelationReadable()).toBe(false);
    const readable = watchReadable(actions);
    await drain();
    expect(readable.resolved).toBe(false);

    queries.at(-1)!.deferred.reject(new Error('Binder Error: Referenced column "nope" not found'));
    await expect(replace).resolves.toMatchObject({ success: false });
    await drain();
    expect(readable.resolved).toBe(true);
  });

  it('holds while an undo reconciles the VIEW', async () => {
    const harness = setup(new UndoManager());
    const { state, actions, queries } = harness;
    await landDerivedColumn(harness);

    const undo = actions.undo();
    await drain();
    expect(queries.at(-1)!.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);
    expect(actions.isRelationReadable()).toBe(false);
    const readable = watchReadable(actions);
    await drain();
    expect(readable.resolved).toBe(false);

    queries.at(-1)!.deferred.resolve([]);
    await expect(undo).resolves.toBe(true);
    expect(readable.resolved).toBe(true);
    expect(state.tableName.get()).toBe('t');
  });

  it('holds again once a change that breaks reads, waiting behind another, starts', async () => {
    const harness = setup();
    const { actions, queries } = harness;
    await landDerivedColumn(harness);

    const first = actions.replaceDerivedColumn('x2', {
      kind: 'expression',
      name: 'x2',
      expression: 'nope * 3',
    });
    await drain();
    const firstValidation = queries.at(-1)!;
    const second = actions.removeDerivedColumn('x2');
    await drain();
    // The removal waits its turn: nothing of it has gone out.
    expect(queries.at(-1)).toBe(firstValidation);
    const readable = watchReadable(actions);

    firstValidation.deferred.reject(new Error('Binder Error'));
    await expect(first).resolves.toMatchObject({ success: false });
    await drain();
    // Readable for the moment between the two: a reader checks again a task
    // later, by when the removal has started.
    expect(readable.resolved).toBe(true);
    const drop = queries.at(-1)!;
    expect(drop.sql).toMatch(/^DROP VIEW IF EXISTS/);
    expect(actions.isRelationReadable()).toBe(false);
    const readableAgain = watchReadable(actions);
    await drain();
    expect(readableAgain.resolved).toBe(false);

    drop.deferred.resolve([]);
    await second;
    await drain();
    expect(readableAgain.resolved).toBe(true);
  });

  it('does not hold for an add: the relation in force stays readable while it runs', async () => {
    const { actions, queries } = setup();
    const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
    await drain();

    expect(actions.isRelationChanging()).toBe(true);
    expect(actions.isRelationReadable()).toBe(true);
    const readable = watchReadable(actions);
    await drain();
    expect(readable.resolved).toBe(true);

    await answer(queries);
    await answer(queries, [{ t: 'INTEGER' }]);
    await answer(queries);
    await expect(add).resolves.toEqual({ success: true });
    expect(actions.isRelationChanging()).toBe(false);
  });

  it('lets reads go on while a change that breaks them waits behind an add', async () => {
    const harness = setup();
    const { actions, queries } = harness;
    await landDerivedColumn(harness);

    const add = actions.addDerivedColumn({ kind: 'expression', name: 'x3', expression: 'id * 3' });
    await drain();
    const addValidation = queries.at(-1)!;
    const replace = actions.replaceDerivedColumn('x2', {
      kind: 'expression',
      name: 'x2',
      expression: 'nope',
    });
    await drain();
    expect(actions.isRelationReadable()).toBe(true);
    expect(actions.isRelationChanging()).toBe(true);
    const readable = watchReadable(actions);
    await drain();
    expect(readable.resolved).toBe(true);

    addValidation.deferred.reject(new Error('Binder Error'));
    await expect(add).resolves.toMatchObject({ success: false });
    await drain();
    // The replacement's turn.
    expect(actions.isRelationReadable()).toBe(false);
    const readableAgain = watchReadable(actions);
    queries.at(-1)!.deferred.reject(new Error('Binder Error'));
    await expect(replace).resolves.toMatchObject({ success: false });
    await drain();
    expect(readableAgain.resolved).toBe(true);
    expect(actions.isRelationChanging()).toBe(false);
  });

  it('resolves its callers even when the settled callback throws', async () => {
    const harness = setup();
    const { actions, queries } = harness;
    await landDerivedColumn(harness);
    actions.setOnRelationSettled(() => {
      throw new Error('settled callback');
    });

    const removal = actions.removeDerivedColumn('x2');
    await drain();
    const readable = watchReadable(actions);
    queries.at(-1)!.deferred.resolve([]);
    await expect(removal).rejects.toThrow('settled callback');
    await drain();
    expect(readable.resolved).toBe(true);
  });
});
