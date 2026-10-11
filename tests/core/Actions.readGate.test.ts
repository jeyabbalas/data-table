/**
 * `StateActions.addReadGate`: a condition the reads of the relation wait
 * for besides derived-column changes, as the annotated filter's table of
 * annotated rows is. A closed gate makes the relation unreadable and
 * changing; `readGateOpened` wakes the readers waiting and reports the
 * relation settled, once it can be read, and never a reader left waiting.
 */
import { describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';

import { makeRowFetchBridge, type CapturedQuery } from '../helpers/rowFetchBridge';

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
  const gate = { open: true, isOpen: vi.fn(() => gate.open) };
  const removeGate = actions.addReadGate(gate);
  const settled = vi.fn();
  actions.setOnRelationSettled(settled);
  return { state, actions, queries, gate, removeGate, settled };
}

async function drain(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function watchReadable(actions: StateActions): { resolved: boolean } {
  const watch = { resolved: false };
  void actions.whenRelationReadable().then(() => (watch.resolved = true));
  return watch;
}

async function answer(queries: CapturedQuery[], rows: unknown[] = []): Promise<void> {
  queries.at(-1)!.deferred.resolve(rows);
  await drain();
}

describe('StateActions read gates', () => {
  it('an open gate changes nothing', async () => {
    const { actions } = setup();
    expect(actions.isRelationReadable()).toBe(true);
    expect(actions.isRelationChanging()).toBe(false);
    const readable = watchReadable(actions);
    await drain();
    expect(readable.resolved).toBe(true);
  });

  it('a closed gate holds the readers, asked as they ask, until it opens', async () => {
    const { actions, gate, settled } = setup();
    gate.open = false;
    expect(actions.isRelationReadable()).toBe(false);
    expect(actions.isRelationChanging()).toBe(true);
    const readable = watchReadable(actions);
    await drain();
    expect(readable.resolved).toBe(false);

    // Told of an opening while still closed: nothing.
    actions.readGateOpened();
    await drain();
    expect(readable.resolved).toBe(false);
    expect(settled).not.toHaveBeenCalled();

    gate.open = true;
    actions.readGateOpened();
    await drain();
    expect(readable.resolved).toBe(true);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(actions.isRelationReadable()).toBe(true);
    expect(actions.isRelationChanging()).toBe(false);

    // Once open, a call reports nothing more.
    actions.readGateOpened();
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('reports nothing when no reader found the gate closed', () => {
    const { actions, gate, settled } = setup();
    gate.open = false;
    gate.open = true;
    actions.readGateOpened();
    expect(settled).not.toHaveBeenCalled();
  });

  it('opens when it is removed, even on a destroyed table', async () => {
    const { actions, gate, removeGate, settled } = setup();
    gate.open = false;
    const readable = watchReadable(actions);
    actions.markDestroyed();
    removeGate();
    await drain();
    expect(readable.resolved).toBe(true);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(actions.isRelationReadable()).toBe(true);
    removeGate();
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('waits with a derived-column change: the readers wake once both are done', async () => {
    const { actions, queries, gate, settled } = setup();
    const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id*2' });
    await drain();
    await answer(queries);
    await answer(queries, [{ column_name: 'v', column_type: 'INTEGER' }]);
    await answer(queries);
    await expect(add).resolves.toEqual({ success: true });
    settled.mockClear();

    // The gate closes while a removal drops the VIEW.
    const removal = actions.removeDerivedColumn('x2');
    await drain();
    gate.open = false;
    const readable = watchReadable(actions);
    queries.at(-1)!.deferred.resolve([]);
    await removal;
    // The removal settled, the gate did not: still waiting, nothing settled.
    expect(readable.resolved).toBe(false);
    expect(settled).not.toHaveBeenCalled();

    gate.open = true;
    actions.readGateOpened();
    await drain();
    expect(readable.resolved).toBe(true);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('a gate opening during a derived-column change wakes no one until the change settles', async () => {
    const { actions, queries, gate } = setup();
    const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id*2' });
    await drain();
    await answer(queries);
    await answer(queries, [{ column_name: 'v', column_type: 'INTEGER' }]);
    await answer(queries);
    await add;

    gate.open = false;
    const readable = watchReadable(actions);
    const removal = actions.removeDerivedColumn('x2');
    await drain();
    gate.open = true;
    actions.readGateOpened();
    await drain();
    expect(readable.resolved).toBe(false);

    queries.at(-1)!.deferred.resolve([]);
    await removal;
    await drain();
    expect(readable.resolved).toBe(true);
  });
});
