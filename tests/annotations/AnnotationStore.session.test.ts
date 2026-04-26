import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { AutoSave } from '@/persistence/AutoSave';
import { snapshotFromState, restoreStateFromSnapshot } from '@/persistence/serialization';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type { SessionSnapshot } from '@/persistence/types';
import type { SessionStore } from '@/persistence/SessionStore';
import { AnnotationStore } from '@/annotations/AnnotationStore';

const schema: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function setupState(): TableState {
  const state = createTableState();
  state.tableName.set('t');
  state.baseTableName.set('t');
  state.totalRows.set(10);
  state.filteredRows.set(10);
  initializeColumnsFromSchema(state, schema);
  return state;
}

function createMockStore(): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

describe('AnnotationStore — session persistence integration', () => {
  let state: TableState;
  let annotationStore: AnnotationStore;

  beforeEach(() => {
    vi.useFakeTimers();
    state = setupState();
    let seq = 0;
    annotationStore = new AnnotationStore({
      tableName: state.baseTableName,
      idGenerator: () => `ann_session_${++seq}`,
      now: () => '2026-04-24T00:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('snapshotFromState includes annotations when the store has entries', () => {
    annotationStore.add({ scope: 'row', rowId: 1, severity: 'error', message: 'x' });
    const snap = snapshotFromState(state, undefined, undefined, annotationStore);
    expect(snap.version).toBe(SNAPSHOT_VERSION);
    expect(snap.annotations?.annotations).toHaveLength(1);
    expect(snap.annotations?.tableName).toBe('t');
  });

  it('snapshotFromState omits annotations when the store is empty', () => {
    const snap = snapshotFromState(state, undefined, undefined, annotationStore);
    expect(snap.annotations).toBeUndefined();
  });

  it('AutoSave schedules a save on annotation-store change', () => {
    const store = createMockStore();
    const autoSave = new AutoSave(state, store, { annotationStore });
    autoSave.enable();
    annotationStore.add({ scope: 'row', rowId: 0, severity: 'info', message: 'x' });
    expect(store.save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(store.save).toHaveBeenCalledTimes(1);
    autoSave.destroy();
  });

  it('AutoSave persists severity-filter toggles via the snapshot', () => {
    const store = createMockStore();
    const autoSave = new AutoSave(state, store, { annotationStore });
    autoSave.enable();
    annotationStore.setSeverityFilter({ error: false });
    vi.advanceTimersByTime(1000);
    expect(store.save).toHaveBeenCalledTimes(1);
    const snap = (store.save as unknown as { mock: { calls: Array<[SessionSnapshot]> } }).mock
      .calls[0][0];
    expect(snap.annotationSeverityFilter).toEqual({ error: false, warning: true, info: true });
    autoSave.destroy();
  });

  it('snapshotFromState omits annotationSeverityFilter at the all-true default', () => {
    const snap = snapshotFromState(state, undefined, undefined, annotationStore);
    expect(snap.annotationSeverityFilter).toBeUndefined();
  });

  it('snapshotFromState includes annotationSeverityFilter when any flag is off', () => {
    annotationStore.setSeverityFilter({ warning: false, info: false });
    const snap = snapshotFromState(state, undefined, undefined, annotationStore);
    expect(snap.annotationSeverityFilter).toEqual({ error: true, warning: false, info: false });
  });

  it('restoreStateFromSnapshot applies annotationSeverityFilter when present', () => {
    const baseSnap = snapshotFromState(state);
    const withFilter: SessionSnapshot = {
      ...baseSnap,
      annotationSeverityFilter: { error: false, warning: true, info: false },
    };
    const fresh = new AnnotationStore({ tableName: state.baseTableName });
    restoreStateFromSnapshot(state, withFilter, undefined, undefined, fresh);
    expect(fresh.getSeverityFilter()).toEqual({ error: false, warning: true, info: false });
  });

  it('restoreStateFromSnapshot leaves filter at all-true when annotationSeverityFilter is absent', () => {
    const baseSnap = snapshotFromState(state);
    expect(baseSnap.annotationSeverityFilter).toBeUndefined();
    const fresh = new AnnotationStore({ tableName: state.baseTableName });
    restoreStateFromSnapshot(state, baseSnap, undefined, undefined, fresh);
    expect(fresh.getSeverityFilter()).toEqual({ error: true, warning: true, info: true });
  });

  it('AutoSave passes the annotation store through to the snapshot', () => {
    const store = createMockStore();
    const autoSave = new AutoSave(state, store, { annotationStore });
    autoSave.enable();
    annotationStore.add({ scope: 'row', rowId: 0, severity: 'info', message: 'x' });
    vi.advanceTimersByTime(1000);
    const snap = (store.save as unknown as { mock: { calls: Array<[SessionSnapshot]> } }).mock
      .calls[0][0];
    expect(snap.annotations?.annotations).toHaveLength(1);
    autoSave.destroy();
  });

  it('restoreStateFromSnapshot hydrates the annotation store', () => {
    const baseSnap = snapshotFromState(state);
    const withAnns: SessionSnapshot = {
      ...baseSnap,
      annotations: {
        version: 1,
        tableName: 't',
        annotations: [
          { id: 'r1', scope: 'row', rowId: 0, severity: 'info', message: 'restored' },
          { id: 'c1', scope: 'column', column: 'name', severity: 'error', message: 'col' },
        ],
      },
    };
    const fresh = new AnnotationStore({ tableName: state.baseTableName });
    restoreStateFromSnapshot(state, withAnns, undefined, undefined, fresh);
    expect(fresh.count()).toBe(2);
    expect(fresh.get('r1')?.message).toBe('restored');
  });

  it('restoreStateFromSnapshot leaves the store empty for a pre-v5 snapshot (no annotations field)', () => {
    const baseSnap = snapshotFromState(state);
    expect(baseSnap.annotations).toBeUndefined();
    const fresh = new AnnotationStore({ tableName: state.baseTableName });
    restoreStateFromSnapshot(state, baseSnap, undefined, undefined, fresh);
    expect(fresh.count()).toBe(0);
  });

  it('restoreStateFromSnapshot does not throw when the annotations blob is corrupt', () => {
    const baseSnap = snapshotFromState(state);
    const corrupt: SessionSnapshot = {
      ...baseSnap,
      annotations: { version: 999, annotations: [] } as unknown as SessionSnapshot['annotations'],
    };
    const fresh = new AnnotationStore();
    expect(() =>
      restoreStateFromSnapshot(state, corrupt, undefined, undefined, fresh),
    ).not.toThrow();
    expect(fresh.count()).toBe(0);
  });

  it('end-to-end round-trip: annotate → save → load → restore', () => {
    const store = createMockStore();
    const autoSave = new AutoSave(state, store, { annotationStore });
    autoSave.enable();
    annotationStore.add({
      id: 'x',
      scope: 'cell',
      rowId: 3,
      column: 'name',
      severity: 'warning',
      message: 'round-trip',
    });
    vi.advanceTimersByTime(1000);
    const savedSnap = (store.save as unknown as { mock: { calls: Array<[SessionSnapshot]> } }).mock
      .calls[0][0];
    autoSave.destroy();

    const nextStore = new AnnotationStore({ tableName: state.baseTableName });
    restoreStateFromSnapshot(state, savedSnap, undefined, undefined, nextStore);
    expect(nextStore.count()).toBe(1);
    const restored = nextStore.get('x');
    expect(restored?.message).toBe('round-trip');
    expect(restored?.scope).toBe('cell');
  });
});
