/**
 * AutoSave's annotations-only quota breaker. A million annotations can
 * outgrow a quota the rest of a session fits in many times over: when the
 * annotations record alone hits the quota, it is reported once, and the
 * session keeps saving without its annotations — until `enable()` again,
 * as for the session-wide breaker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import { PersistenceError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { annotationFileToken } from '@/persistence/annotationPersistence';
import { AutoSave } from '@/persistence/AutoSave';
import {
  annotationsWriteFailure,
  classifyPersistenceFailure,
  isAnnotationsWriteFailure,
} from '@/persistence/persistenceErrors';
import type { SessionStore } from '@/persistence/SessionStore';
import type { SessionSnapshot } from '@/persistence/types';

const schema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

const quotaError = () => Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });

function setup(): { state: TableState; annotations: AnnotationStore } {
  const state = createTableState();
  state.tableName.set('t');
  state.baseTableName.set('t');
  state.totalRows.set(10);
  state.filteredRows.set(10);
  initializeColumnsFromSchema(state, schema);
  const annotations = new AnnotationStore({ tableName: state.baseTableName });
  annotations.add({ scope: 'row', rowId: 1, severity: 'error', message: 'x' });
  return { state, annotations };
}

/** A store whose saves fail as `failures` says, in order, then succeed. */
function makeStore(failures: unknown[] = []): SessionStore & {
  snapshots: SessionSnapshot[];
} {
  const snapshots: SessionSnapshot[] = [];
  const next = () => failures.shift();
  return {
    snapshots,
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn((snapshot: SessionSnapshot) => {
      snapshots.push(snapshot);
      const failure = next();
      return failure === undefined ? Promise.resolve() : Promise.reject(failure);
    }),
    saveSync: vi.fn((snapshot: SessionSnapshot) => {
      snapshots.push(snapshot);
      const failure = next();
      if (failure !== undefined) throw failure;
    }),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore & { snapshots: SessionSnapshot[] };
}

describe('persistence failure helpers', () => {
  it('classifies quota exhaustion by name', () => {
    expect(classifyPersistenceFailure(quotaError())).toBe('PERSISTENCE_QUOTA_EXCEEDED');
    expect(classifyPersistenceFailure({ name: 'QuotaExceededError' })).toBe(
      'PERSISTENCE_QUOTA_EXCEEDED',
    );
    expect(classifyPersistenceFailure(new Error('x'))).toBe('SAVE_FAILED');
    expect(classifyPersistenceFailure(null)).toBe('SAVE_FAILED');
  });

  it('marks an annotations write failure as one', () => {
    const cause = quotaError();
    const error = annotationsWriteFailure(cause, 't');
    expect(error).toBeInstanceOf(PersistenceError);
    expect(error).toMatchObject({
      code: 'PERSISTENCE_QUOTA_EXCEEDED',
      cause,
      details: { record: 'annotations', tableName: 't' },
    });
    expect(isAnnotationsWriteFailure(error)).toBe(true);
    expect(annotationsWriteFailure(new Error('boom'), 't').code).toBe('SAVE_FAILED');
    expect(isAnnotationsWriteFailure(new PersistenceError('x'))).toBe(false);
    expect(isAnnotationsWriteFailure(cause)).toBe(false);
  });
});

describe('AutoSave — annotations quota breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the first annotations quota error once, and keeps saving the session without annotations', async () => {
    const { state, annotations } = setup();
    const store = makeStore([annotationsWriteFailure(quotaError(), 't')]);
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, onError });
    autoSave.enable();

    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(1);
    const error = onError.mock.calls[0]![0] as PersistenceError;
    expect(error.code).toBe('PERSISTENCE_QUOTA_EXCEEDED');
    expect(error.details).toMatchObject({ record: 'annotations' });
    expect(store.snapshots[0]!.annotations?.annotations).toHaveLength(1);

    annotations.setSeverityFilter({ info: false });
    await vi.advanceTimersByTimeAsync(1000);
    state.pinnedColumns.set(['id']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.save).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
    for (const snapshot of store.snapshots.slice(1)) {
      expect(snapshot.annotations).toBeUndefined();
    }
    // The severity filter is still captured.
    expect(store.snapshots[2]!.annotationSeverityFilter).toEqual({
      error: true,
      warning: true,
      info: false,
    });
    expect(store.snapshots[2]!.pinnedColumns).toEqual(['id']);
    autoSave.destroy();
  });

  it('does not report again for a save that was in flight when it tripped', async () => {
    const { state, annotations } = setup();
    const store = makeStore([
      annotationsWriteFailure(quotaError(), 't'),
      annotationsWriteFailure(quotaError(), 't'),
    ]);
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, onError });
    autoSave.enable();

    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    autoSave.flushPendingSave();
    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(1);
    autoSave.destroy();
  });

  it('still trips the session-wide breaker on a quota error of the session record', async () => {
    const { state, annotations } = setup();
    const store = makeStore([annotationsWriteFailure(quotaError(), 't'), quotaError()]);
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, onError });
    autoSave.enable();

    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await vi.advanceTimersByTimeAsync(1000);
    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(2);
    expect((onError.mock.calls[1]![0] as PersistenceError).details).toBeUndefined();

    state.sortColumns.set([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.save).toHaveBeenCalledTimes(2);
    autoSave.destroy();
  });

  it('saves the annotations again after disable() and enable()', async () => {
    const { state, annotations } = setup();
    const store = makeStore([annotationsWriteFailure(quotaError(), 't')]);
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, onError: vi.fn() });
    autoSave.enable();
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await vi.advanceTimersByTimeAsync(1000);

    autoSave.disable();
    autoSave.enable();
    state.sortColumns.set([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.snapshots.at(-1)!.annotations?.annotations).toHaveLength(1);
    autoSave.destroy();
  });

  it('reports a failed annotations write, and the next save tries it again', async () => {
    const { state, annotations } = setup();
    const store = makeStore([annotationsWriteFailure(new Error('aborted'), 't')]);
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, onError });
    autoSave.enable();

    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as PersistenceError).code).toBe('SAVE_FAILED');

    state.sortColumns.set([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.snapshots[1]!.annotations?.annotations).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    autoSave.destroy();
  });

  it('holds the annotations back after a second failed write in a row, reported once', async () => {
    const { state, annotations } = setup();
    const tooLarge = Object.assign(new Error('The serialized value is too large'), {
      name: 'UnknownError',
    });
    const store = makeStore([
      annotationsWriteFailure(tooLarge, 't'),
      annotationsWriteFailure(tooLarge, 't'),
    ]);
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, onError });
    autoSave.enable();

    for (const direction of ['asc', 'desc', 'asc'] as const) {
      state.sortColumns.set([{ column: 'id', direction }]);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.snapshots[1]!.annotations?.annotations).toHaveLength(1);
    expect(store.snapshots[2]!.annotations).toBeUndefined();
    autoSave.destroy();
  });

  it('counts failed annotations writes in a row only', async () => {
    const { state, annotations } = setup();
    const store = makeStore([
      annotationsWriteFailure(new Error('aborted'), 't'),
      undefined,
      annotationsWriteFailure(new Error('aborted'), 't'),
    ]);
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, onError });
    autoSave.enable();

    for (const direction of ['asc', 'desc', 'asc', 'desc'] as const) {
      state.sortColumns.set([{ column: 'id', direction }]);
      await vi.advanceTimersByTimeAsync(1000);
    }
    // A success between them: both failures reported, nothing held back.
    expect(onError).toHaveBeenCalledTimes(2);
    expect(store.snapshots[3]!.annotations?.annotations).toHaveLength(1);
    autoSave.destroy();
  });

  it('trips on an annotations quota error thrown by saveSync', () => {
    const { state, annotations } = setup();
    const store = makeStore([annotationsWriteFailure(quotaError(), 't')]);
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, onError });
    autoSave.enable();

    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    autoSave.flushPendingSave();
    state.sortColumns.set([]);
    autoSave.flushPendingSave();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.saveSync).toHaveBeenCalledTimes(2);
    expect(store.snapshots[1]!.annotations).toBeUndefined();
    autoSave.destroy();
  });

  it('hands a custom store the annotations of each save, under one token while they do not change', async () => {
    const { state, annotations } = setup();
    const store = makeStore();
    const autoSave = new AutoSave(state, store, { annotationStore: annotations });
    autoSave.enable();
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await vi.advanceTimersByTimeAsync(1000);
    annotations.setSeverityFilter({ error: false });
    await vi.advanceTimersByTimeAsync(1000);
    state.columnWidths.set(new Map([['id', 120]]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.snapshots).toHaveLength(3);
    // Taken at the save, as they are then, not when the store reads them.
    for (const snapshot of store.snapshots) {
      expect(Object.getOwnPropertyDescriptor(snapshot, 'annotations')?.value).toBeDefined();
    }
    const token = annotationFileToken(store.snapshots[0]!.annotations!);
    expect(annotationFileToken(store.snapshots[1]!.annotations!)).toBe(token);
    expect(annotationFileToken(store.snapshots[2]!.annotations!)).toBe(token);

    annotations.add({ scope: 'row', rowId: 2, severity: 'info', message: 'y' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(annotationFileToken(store.snapshots[3]!.annotations!)).not.toBe(token);
    expect(store.snapshots[3]!.annotations?.annotations).toHaveLength(2);
    autoSave.destroy();
  });
});
