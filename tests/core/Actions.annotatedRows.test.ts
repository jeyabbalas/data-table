/**
 * `actions.showAnnotatedRows` / `hideAnnotatedRows`.
 */
import { describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { ConfigurationError, DestroyedError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { UndoManager } from '@/core/UndoManager';

import { makeRowFetchBridge } from '../helpers/rowFetchBridge';

const SCHEMA: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

function setup() {
  const state = createTableState();
  state.tableName.set('orders');
  state.baseTableName.set('orders');
  initializeColumnsFromSchema(state, SCHEMA);
  const undo = new UndoManager();
  const { bridge, queries } = makeRowFetchBridge();
  const actions = new StateActions(
    state,
    bridge as unknown as ConstructorParameters<typeof StateActions>[1],
    undo,
  );
  return { state, actions, undo, queries };
}

const ANY = { type: 'annotated', column: '__annotated__', table: 'orders' } as const;

describe('showAnnotatedRows', () => {
  it('adds an annotated filter of this table, of any severity, as one undo entry', () => {
    const { state, actions, undo } = setup();
    actions.addFilter({ type: 'range', column: 'age', min: 1, max: 9 });
    actions.showAnnotatedRows();
    expect(state.filters.get()).toEqual([{ type: 'range', column: 'age', min: 1, max: 9 }, ANY]);
    expect(undo.undoDepth).toBe(2);
  });

  it('keeps the severities given, each once and most severe first; none or all three is any', () => {
    const { state, actions } = setup();
    actions.showAnnotatedRows({ severities: ['info', 'error', 'info'] });
    expect(state.filters.get()).toEqual([{ ...ANY, severities: ['error', 'info'] }]);
    actions.showAnnotatedRows({ severities: ['warning', 'info', 'error'] });
    expect(state.filters.get()).toEqual([ANY]);
    actions.showAnnotatedRows({ severities: ['warning'] });
    actions.showAnnotatedRows({ severities: [] });
    expect(state.filters.get()).toEqual([ANY]);
  });

  it('changes nothing when the rows it would show are the ones shown', () => {
    const { state, actions, undo } = setup();
    actions.showAnnotatedRows({ severities: ['warning', 'error'] });
    const filters = state.filters.get();
    const spy = vi.fn();
    state.filters.subscribe(spy);

    actions.showAnnotatedRows({ severities: ['error', 'warning'] });
    expect(spy).not.toHaveBeenCalled();
    expect(state.filters.get()).toBe(filters);
    expect(undo.undoDepth).toBe(1);
  });

  it('replaces the annotated filter in force, which an undo brings back', async () => {
    const { state, actions } = setup();
    actions.showAnnotatedRows({ severities: ['error'] });
    actions.showAnnotatedRows({ severities: ['info'] });
    expect(state.filters.get()).toEqual([{ ...ANY, severities: ['info'] }]);

    await actions.undo();
    expect(state.filters.get()).toEqual([{ ...ANY, severities: ['error'] }]);
    await actions.undo();
    expect(state.filters.get()).toEqual([]);
    await actions.redo();
    expect(state.filters.get()).toEqual([{ ...ANY, severities: ['error'] }]);
  });

  it.each([[['fatal']], ['error'], [[1]], [null]])(
    'rejects severities %j, changing nothing',
    (severities) => {
      const { state, actions, undo } = setup();
      const call = () => actions.showAnnotatedRows({ severities } as never);
      expect(call).toThrow(ConfigurationError);
      expect(call).toThrow(expect.objectContaining({ code: 'OPTIONS_INVALID' }));
      expect(state.filters.get()).toEqual([]);
      expect(undo.undoDepth).toBe(0);
    },
  );

  it('throws DestroyedError once the table is destroyed', () => {
    const { actions } = setup();
    actions.markDestroyed();
    expect(() => actions.showAnnotatedRows()).toThrow(DestroyedError);
    expect(() => actions.hideAnnotatedRows()).toThrow(DestroyedError);
  });
});

describe('hideAnnotatedRows', () => {
  it('removes the annotated filter, and only it, as one undo entry', async () => {
    const { state, actions, undo } = setup();
    const onRemove = vi.fn();
    actions.setOnFilterRemove(onRemove);
    actions.addFilter({ type: 'range', column: 'age', min: 1, max: 9 });
    actions.showAnnotatedRows();

    actions.hideAnnotatedRows();
    expect(state.filters.get()).toEqual([{ type: 'range', column: 'age', min: 1, max: 9 }]);
    expect(undo.undoDepth).toBe(3);
    expect(onRemove).toHaveBeenCalledWith('__annotated__');

    await actions.undo();
    expect(state.filters.get()).toEqual([{ type: 'range', column: 'age', min: 1, max: 9 }, ANY]);
  });

  it('changes nothing without an annotated filter in force', () => {
    const { state, actions, undo } = setup();
    const spy = vi.fn();
    state.filters.subscribe(spy);
    actions.hideAnnotatedRows();
    expect(spy).not.toHaveBeenCalled();
    expect(undo.undoDepth).toBe(0);
  });
});
