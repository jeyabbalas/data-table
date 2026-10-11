/**
 * `actions.showAnnotatedRows` / `hideAnnotatedRows`, and the reads of the
 * filtered rows that wait for an annotated filter's table of annotated rows
 * to be current (`ensureFiltersFresh`, `getColumnValues`).
 */
import { describe, expect, it, vi } from 'vitest';

import type { AnnotatedRowsSource } from '@/annotations/annotatedRowsSource';
import { StateActions } from '@/core/Actions';
import { ConfigurationError, DestroyedError, QueryError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { UndoManager } from '@/core/UndoManager';

import { deferred, makeRowFetchBridge } from '../helpers/rowFetchBridge';

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

async function drain(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

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

describe('reads of the filtered rows under an annotated filter', () => {
  function withSource() {
    const harness = setup();
    const fresh = deferred<string>();
    const ensureFresh = vi.fn((_signal?: AbortSignal) => fresh.promise);
    const source: AnnotatedRowsSource = { ensureFresh };
    harness.actions.setAnnotatedRowsSource(source);
    return { ...harness, fresh, ensureFresh };
  }

  it('wait for the table of annotated rows to be current before a filtered read', async () => {
    const { actions, queries, fresh, ensureFresh } = withSource();
    actions.showAnnotatedRows();
    const signal = new AbortController().signal;
    const read = actions.getColumnValues('age', { scope: 'filtered', signal });
    await drain();
    expect(ensureFresh).toHaveBeenCalledWith(signal);
    expect(queries).toHaveLength(0);

    fresh.resolve('__dt_annot_orders__');
    await drain();
    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toContain('FROM "__dt_annot_orders__"');
    queries[0]!.deferred.resolve([{ val: 4 }]);
    await expect(read).resolves.toEqual(Int32Array.from([4]));
  });

  it('not before a read of the selected rows: the positions selected in the view as it shows them', async () => {
    const { state, actions, queries, ensureFresh } = withSource();
    actions.showAnnotatedRows();
    state.selectedRows.set(new Set([0]));
    const read = actions.getColumnValues('age', { scope: 'selected' });
    await drain();
    expect(ensureFresh).not.toHaveBeenCalled();
    expect(queries).toHaveLength(1);
    queries[0]!.deferred.resolve([]);
    await expect(read).resolves.toBeDefined();
  });

  it('do not wait for a read of every row, nor without an annotated filter', async () => {
    const { actions, queries, ensureFresh } = withSource();
    actions.addFilter({ type: 'range', column: 'age', min: 1, max: 9 });
    void actions.getColumnValues('age', { scope: 'filtered' });
    actions.showAnnotatedRows();
    void actions.getColumnValues('age');
    await drain();
    expect(ensureFresh).not.toHaveBeenCalled();
    expect(queries).toHaveLength(2);
  });

  it('reject as the table of annotated rows does, and as destroyed once destroyed', async () => {
    const first = withSource();
    first.actions.showAnnotatedRows();
    const failed = first.actions.getColumnValues('age', { scope: 'filtered' });
    first.fresh.reject(new QueryError('Operation aborted', { code: 'QUERY_ABORTED' }));
    await expect(failed).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    expect(first.queries).toHaveLength(0);

    const second = withSource();
    second.actions.showAnnotatedRows();
    const destroyed = second.actions.getColumnValues('age', { scope: 'filtered' });
    await drain();
    second.actions.markDestroyed();
    second.fresh.resolve('__dt_annot_orders__');
    await expect(destroyed).rejects.toBeInstanceOf(DestroyedError);
  });

  it('ensureFiltersFresh resolves at once with no source, or no annotated filter', async () => {
    const { actions } = setup();
    actions.showAnnotatedRows();
    await expect(actions.ensureFiltersFresh()).resolves.toBeUndefined();
  });
});
