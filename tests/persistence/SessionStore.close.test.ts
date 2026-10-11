/**
 * `SessionStore.close()` lets the operations asked for before it end, those
 * asked for in the same task included, and an operation on a table, whichever
 * store asks for it, waits for those asked for before it: a new store's load
 * reads what a closed store's save, still landing, wrote.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotFromState } from '@/persistence/serialization';
import { SessionStore } from '@/persistence/SessionStore';
import {
  annotate,
  deleteDatabase,
  holdAnnotationsDb,
  makeAnnotations,
  makeState,
  rawAnnotations,
  rawSession,
} from '../helpers/sessionDatabases';

beforeEach(async () => {
  await deleteDatabase('dt-sessions');
  await deleteDatabase('dt-annotations');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sorted = [{ column: 'id', direction: 'asc' as const }];

describe('an operation asked for in the same task as close()', () => {
  it('a save lands', async () => {
    const store = new SessionStore();
    await store.open();
    const state = makeState();
    state.sortColumns.set(sorted);
    const saved = store.save(snapshotFromState(state));
    store.close();
    await saved;
    expect((await rawSession())?.['sortColumns']).toEqual(sorted);
  });

  it('a delete deletes the session and its annotations', async () => {
    const store = new SessionStore();
    await store.open();
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 3);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    const deleted = store.delete('t');
    store.close();
    await deleted;
    expect(await rawSession()).toBeUndefined();
    expect(await rawAnnotations()).toBeUndefined();
  });

  it('a load reads the session', async () => {
    const store = new SessionStore();
    await store.open();
    const state = makeState();
    state.sortColumns.set(sorted);
    await store.save(snapshotFromState(state));
    const loaded = store.load('t');
    store.close();
    expect((await loaded)?.sortColumns).toEqual(sorted);
  });

  it('one asked for before the databases were open does nothing', async () => {
    const store = new SessionStore();
    const state = makeState();
    const saved = store.save(snapshotFromState(state));
    store.close();
    await saved;
    expect(await rawSession()).toBeUndefined();
  });
});

describe('a load while a closed store lets a save under way end', () => {
  /** A store whose save of 2 more annotations and a sort waits, as behind a long write. */
  async function savingWhenClosed() {
    const store = new SessionStore();
    await store.open();
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 3);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    const blocker = await holdAnnotationsDb();
    annotate(annotations, 2, 3);
    state.sortColumns.set(sorted);
    const saving = store.save(snapshotFromState(state, undefined, undefined, annotations));
    await new Promise((resolve) => setTimeout(resolve, 20));
    store.close();
    return { store, blocker, saving };
  }

  it('by the same store, open again: reads what the save wrote', async () => {
    const { store, blocker, saving } = await savingWhenClosed();
    const loading = store.load('t');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await blocker.release();
    await saving;
    const snapshot = await loading;
    expect(snapshot?.annotations?.annotations).toHaveLength(5);
    expect(snapshot?.sortColumns).toEqual(sorted);
    store.close();
  });

  it('by another store, a new table on the same name: reads what the save wrote', async () => {
    const { blocker, saving } = await savingWhenClosed();
    const other = new SessionStore();
    const loading = other.load('t');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await blocker.release();
    await saving;
    const snapshot = await loading;
    expect(snapshot?.annotations?.annotations).toHaveLength(5);
    expect(snapshot?.sortColumns).toEqual(sorted);
    other.close();
  });

  it('by another store that saves next: its state lands last', async () => {
    const { blocker, saving } = await savingWhenClosed();
    const other = new SessionStore();
    await other.open();
    const state = makeState();
    state.sortColumns.set([{ column: 'name', direction: 'desc' }]);
    const saved = other.save(snapshotFromState(state));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await blocker.release();
    await Promise.all([saving, saved]);
    expect((await rawSession())?.['sortColumns']).toEqual([{ column: 'name', direction: 'desc' }]);
    other.close();
  });
});
