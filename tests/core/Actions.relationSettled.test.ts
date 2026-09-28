/**
 * `StateActions.whenRelationSettled`: what the table body's row fetches wait
 * for while a derived-column change replaces the relation they read.
 */
import { describe, expect, it } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';

import { makeRowFetchBridge } from '../helpers/rowFetchBridge';

function setup() {
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
  );
  return { state, actions, queries };
}

async function drain(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('StateActions.whenRelationSettled', () => {
  it('resolves at once when no derived-column change is in flight', async () => {
    const { actions } = setup();
    let settled = false;
    void actions.whenRelationSettled().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it('resolves when a change settles, before the state update that follows it', async () => {
    const { state, actions, queries } = setup();
    const change = actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 2',
    });
    await drain();
    let tableNameWhenSettled: string | null = null;
    void actions.whenRelationSettled().then(() => (tableNameWhenSettled = state.tableName.get()));

    // Validation, type detection, then the VIEW.
    queries[0]!.deferred.resolve([]);
    await drain();
    queries[1]!.deferred.resolve([{ t: 'INTEGER' }]);
    await drain();
    expect(tableNameWhenSettled).toBeNull();
    queries[2]!.deferred.resolve([]);
    await expect(change).resolves.toEqual({ success: true });
    expect(tableNameWhenSettled).toBe('t');
    expect(state.tableName.get()).toBe('__dt_view_t__');
  });

  it('resolves when a change fails', async () => {
    const { actions, queries } = setup();
    const change = actions.addDerivedColumn({ kind: 'expression', name: 'x', expression: 'nope' });
    await drain();
    let settled = false;
    void actions.whenRelationSettled().then(() => (settled = true));
    await drain();
    expect(settled).toBe(false);

    queries[0]!.deferred.reject(new Error('Binder Error: Referenced column "nope" not found'));
    await expect(change).resolves.toMatchObject({ success: false });
    await drain();
    expect(settled).toBe(true);
  });

  it('waits for the last of two changes in flight', async () => {
    const { actions, queries } = setup();
    const first = actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 2',
    });
    const second = actions.addDerivedColumn({ kind: 'expression', name: 'x', expression: 'nope' });
    await drain();
    let settled = false;
    void actions.whenRelationSettled().then(() => (settled = true));
    const [validateFirst, validateSecond] = queries;

    validateFirst!.deferred.resolve([]);
    await drain();
    queries.at(-1)!.deferred.resolve([{ t: 'INTEGER' }]);
    await drain();
    queries.at(-1)!.deferred.resolve([]);
    await expect(first).resolves.toEqual({ success: true });
    await drain();
    expect(settled).toBe(false);

    validateSecond!.deferred.reject(new Error('Binder Error'));
    await expect(second).resolves.toMatchObject({ success: false });
    await drain();
    expect(settled).toBe(true);
  });
});
