/**
 * AutoSave with the session store under it: a save under way when the store
 * closes, as `DataTable.destroy()` closes one it owns, or when the page is
 * hidden, still lands, with the state asked for after it; a store that is
 * not a `SessionStore` as this version wrote it (a subclass, a custom one)
 * gets the annotations' file as it is at the save, the same object while
 * they do not change, and AutoSave keeps none of the snapshots it handed
 * one.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoSave } from '@/persistence/AutoSave';
import { snapshotFromState } from '@/persistence/serialization';
import { SessionStore } from '@/persistence/SessionStore';
import type { SessionSnapshot } from '@/persistence/types';
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A table with 3 annotations saved and landed, and AutoSave on it. */
async function savedTable() {
  const store = new SessionStore();
  await store.open();
  const state = makeState();
  const annotations = makeAnnotations(state);
  annotate(annotations, 3);
  await store.save(snapshotFromState(state, undefined, undefined, annotations));
  const autoSave = new AutoSave(state, store, { annotationStore: annotations, debounceMs: 5 });
  autoSave.enable();
  return { store, state, annotations, autoSave };
}

/** Wait until `count` saves have been asked of `store`, watched without keeping them. */
async function untilSaves(store: SessionStore, count: number): Promise<Promise<unknown>[]> {
  const saves: Promise<unknown>[] = [];
  const save = SessionStore.prototype.save;
  const watched = vi.spyOn(SessionStore.prototype, 'save').mockImplementation(function (
    this: SessionStore,
    snapshot: SessionSnapshot,
  ) {
    const done = save.call(this, snapshot);
    if (this === store) saves.push(done.catch(() => undefined));
    return done;
  });
  await vi.waitFor(() => expect(saves.length).toBeGreaterThanOrEqual(count));
  watched.mockRestore();
  return saves;
}

describe('a save under way', () => {
  it('lands when the store closes, with the state asked for after it', async () => {
    const { store, state, annotations, autoSave } = await savedTable();
    // The annotations transaction waits, as behind a long write.
    const blocker = await holdAnnotationsDb();
    const saving = untilSaves(store, 2);
    // The user adds annotations; the save starts, and waits. Then sorts.
    annotate(annotations, 2, 3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    const saves = await saving;

    // As `DataTable.destroy()` does with a store it owns.
    autoSave.destroy();
    store.close();
    await blocker.release();
    await Promise.all(saves);
    await vi.waitFor(async () => expect((await rawAnnotations())?.['count']).toBe(5));

    const reader = new SessionStore();
    const snapshot = await reader.load('t');
    reader.close();
    expect(snapshot?.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(snapshot?.annotations?.annotations).toHaveLength(5);
  });

  it('is saved at once when the page is hidden, naming the write it waits for', async () => {
    const { store, state, annotations, autoSave } = await savedTable();
    const blocker = await holdAnnotationsDb();
    const saveSync = vi.spyOn(SessionStore.prototype, 'saveSync');
    const saving = untilSaves(store, 2);
    annotate(annotations, 2, 3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    const saves = await saving;

    // visibilitychange → hidden, or beforeunload: the page may go now.
    autoSave.flushPendingSave();
    expect(saveSync).toHaveBeenCalledTimes(1);
    // The session record lands without waiting for the annotations: it
    // names their write, with the 3 before as the fallback.
    await vi.waitFor(async () =>
      expect((await rawSession())?.['sortColumns']).toEqual([{ column: 'id', direction: 'asc' }]),
    );
    expect((await rawSession())?.['__annotations']).toMatchObject({
      count: 5,
      fallback: { count: 3 },
    });

    autoSave.destroy();
    await blocker.release();
    await Promise.all(saves);
    store.close();
    const reader = new SessionStore();
    expect((await reader.load('t'))?.annotations?.annotations).toHaveLength(5);
    reader.close();
  });

  it('restores the annotations before when the page goes before they land', async () => {
    const { store, state, annotations, autoSave } = await savedTable();
    const blocker = await holdAnnotationsDb();
    annotate(annotations, 2, 3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    autoSave.flushPendingSave();
    await vi.waitFor(async () =>
      expect((await rawSession())?.['sortColumns']).toEqual([{ column: 'id', direction: 'asc' }]),
    );
    autoSave.destroy();
    // The page goes: its write of the 5 never lands.
    const put = IDBObjectStore.prototype.put;
    const abort = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name !== 'chunks') return put.call(this, value, key);
      this.transaction.abort();
      throw new DOMException('The page is going away.', 'AbortError');
    });
    await blocker.release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    abort.mockRestore();
    store.close();

    const reader = new SessionStore();
    const snapshot = await reader.load('t');
    reader.close();
    expect(snapshot?.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(snapshot?.annotations?.annotations).toHaveLength(3);
  });
});

describe('a store that is not a SessionStore as this version wrote it', () => {
  class StampingStore extends SessionStore {
    gate: Promise<void> = Promise.resolve();
    override async save(snapshot: SessionSnapshot): Promise<void> {
      await this.gate; // An app-level lock, a permission check.
      return super.save({ ...snapshot, timestamp: 42 });
    }
  }

  it('gets the annotations as they are at the save: a subclass copying it later keeps them', async () => {
    const store = new StampingStore();
    await store.open();
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 3);
    await SessionStore.prototype.save.call(
      store,
      snapshotFromState(state, undefined, undefined, annotations),
    );

    let release!: () => void;
    store.gate = new Promise<void>((resolve) => (release = resolve));
    const save = vi.spyOn(store, 'save');
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, debounceMs: 5 });
    autoSave.enable();
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    autoSave.disableWith('drop');
    // The annotations change while the save waits.
    annotate(annotations, 1, 3);
    release();
    await save.mock.results[0]!.value;

    expect((await rawSession())?.['__annotations']).toMatchObject({ count: 3 });
    expect((await rawAnnotations())?.['count']).toBe(3);
    store.close();
  });

  it('gets the same file while the annotations do not change, and is held by nothing', async () => {
    vi.useFakeTimers();
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 1000);
    const toJSON = vi.spyOn(annotations, 'toJSON');
    // A store that answers late (a remote backend, offline): never, here.
    const snapshots: SessionSnapshot[] = [];
    const store = {
      save: (snapshot: SessionSnapshot) => {
        snapshots.push(snapshot);
        return new Promise<void>(() => {});
      },
      saveSync: () => {},
    } as unknown as SessionStore;
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, debounceMs: 10 });
    autoSave.enable();
    for (let i = 0; i < 5; i++) {
      state.columnWidths.set(new Map([['id', 100 + i]]));
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(snapshots).toHaveLength(5);
    expect(new Set(snapshots.map((snapshot) => snapshot.annotations)).size).toBe(1);
    expect(toJSON).toHaveBeenCalledTimes(1);
    expect((autoSave as unknown as { saving: Set<unknown> }).saving.size).toBe(0);

    // A change: a new file, taken at the next save.
    annotate(annotations, 1, 1000);
    await vi.advanceTimersByTimeAsync(20);
    expect(snapshots).toHaveLength(6);
    expect(snapshots[5]!.annotations).not.toBe(snapshots[0]!.annotations);
    expect(snapshots[5]!.annotations?.annotations).toHaveLength(1001);
    autoSave.destroy();
  });
});
