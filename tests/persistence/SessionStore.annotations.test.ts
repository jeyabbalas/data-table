/**
 * Annotations persist in a record of their own (`dt-annotations`), written
 * only when they change: a save after a sort, a filter, a width or a
 * severity toggle clones the session record alone, and a reload writes
 * nothing. The session record names the annotations record it was saved
 * with, and a load attaches only that record.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationFile } from '@/annotations/types';
import { PersistenceError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { AutoSave } from '@/persistence/AutoSave';
import { restoreStateFromSnapshot, snapshotFromState } from '@/persistence/serialization';
import { SessionStore } from '@/persistence/SessionStore';
import type { SessionStoreOptions } from '@/persistence/SessionStore';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type { SessionSnapshot } from '@/persistence/types';

const schema: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function makeState(tableName = 't'): TableState {
  const state = createTableState();
  state.tableName.set(tableName);
  state.baseTableName.set(tableName);
  state.totalRows.set(10);
  state.filteredRows.set(10);
  initializeColumnsFromSchema(state, schema);
  return state;
}

function makeAnnotations(state: TableState): AnnotationStore {
  return new AnnotationStore({
    tableName: state.baseTableName,
    now: () => '2026-10-10T00:00:00.000Z',
  });
}

function annotate(store: AnnotationStore, count: number, from = 0): void {
  store.addMany(
    Array.from({ length: count }, (_, i) => ({
      id: `a${from + i}`,
      scope: 'cell' as const,
      rowId: from + i,
      column: 'name',
      severity: 'warning' as const,
      message: `m${from + i}`,
    })),
  );
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Read a stored value directly, without creating the database. */
function readRaw(dbName: string, storeName: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.transaction!.abort();
    request.onerror = () => resolve(undefined);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve(undefined);
        return;
      }
      const get = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      get.onsuccess = () => {
        db.close();
        resolve(get.result);
      };
      get.onerror = () => {
        db.close();
        reject(get.error);
      };
    };
  });
}

/** Put a value as another writer (an older version, a tamperer) would. */
function plant(
  dbName: 'dt-sessions' | 'dt-annotations',
  value: unknown,
  key?: string,
): Promise<void> {
  const storeName = dbName === 'dt-sessions' ? 'sessions' : 'annotations';
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(
        storeName,
        dbName === 'dt-sessions' ? { keyPath: 'tableName' } : undefined,
      );
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(storeName, 'readwrite');
      if (key === undefined) tx.objectStore(storeName).put(value);
      else tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

const rawSession = (key = 't') =>
  readRaw('dt-sessions', 'sessions', key) as Promise<Record<string, unknown> | undefined>;
const rawAnnotations = (key = 't') =>
  readRaw('dt-annotations', 'annotations', key) as Promise<Record<string, unknown> | undefined>;

/** Counts the puts and deletes each object store receives. */
function countWrites() {
  const put = vi.spyOn(IDBObjectStore.prototype, 'put');
  const del = vi.spyOn(IDBObjectStore.prototype, 'delete');
  const tally = (spy: { mock: { contexts: unknown[] } }, store: string) =>
    spy.mock.contexts.filter((ctx) => (ctx as IDBObjectStore).name === store).length;
  return {
    puts: (store: 'sessions' | 'annotations') => tally(put, store),
    deletes: (store: 'sessions' | 'annotations') => tally(del, store),
  };
}

function sessionSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: 0,
    tableName: 't',
    filters: [],
    sortColumns: [{ column: 'id', direction: 'desc' }],
    visibleColumns: ['id', 'name'],
    columnOrder: ['__rowid__', 'id', 'name'],
    columnWidths: { id: 90 },
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

function annotationFile(count: number): AnnotationFile {
  return {
    version: 1,
    tableName: 't',
    annotations: Array.from({ length: count }, (_, i) => ({
      id: `old${i}`,
      scope: 'row' as const,
      rowId: i,
      severity: 'error' as const,
      message: `old ${i}`,
    })),
  };
}

type LoadIssue = Parameters<NonNullable<SessionStoreOptions['onLoadIssue']>>[0];

describe('SessionStore — annotations in a record of their own', () => {
  let store: SessionStore;
  let issues: LoadIssue[];

  beforeEach(async () => {
    await deleteDatabase('dt-sessions');
    await deleteDatabase('dt-annotations');
    issues = [];
    store = new SessionStore({ onLoadIssue: (issue) => issues.push(issue) });
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
  });

  it('writes the annotations record on the first save that has annotations, and not again until they change', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    const writes = countWrites();

    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('sessions')).toBe(1);
    expect(writes.puts('annotations')).toBe(0);

    annotate(annotations, 3);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('annotations')).toBe(1);

    const session = await rawSession();
    const record = await rawAnnotations();
    expect(session).not.toHaveProperty('annotations');
    expect(session?.['__annotations']).toEqual({ format: 1, count: 3, owner: record?.['owner'] });
    expect(record).toMatchObject({ format: 1, count: 3 });
    expect((record?.['file'] as AnnotationFile).annotations.map((a) => a.id)).toEqual([
      'a0',
      'a1',
      'a2',
    ]);

    // A sort, a width and a severity toggle: the session record alone.
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    state.columnWidths.set(new Map([['id', 140]]));
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    annotations.setSeverityFilter({ warning: false });
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('sessions')).toBe(5);
    expect(writes.puts('annotations')).toBe(1);
    expect((await rawSession())?.['__annotations']).toEqual(session?.['__annotations']);
    expect((await rawSession())?.['annotationSeverityFilter']).toEqual({
      error: true,
      warning: false,
      info: true,
    });

    // A change of the annotations writes them, under a new owner.
    annotate(annotations, 1, 3);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('annotations')).toBe(2);
    const after = await rawAnnotations();
    expect(after?.['count']).toBe(4);
    expect(after?.['owner']).not.toBe(record?.['owner']);
    expect((await rawSession())?.['__annotations']).toEqual({
      format: 1,
      count: 4,
      owner: after?.['owner'],
    });
  });

  it('loads the annotations back with the session, without the marker', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    store.close();

    const reader = new SessionStore();
    const loaded = await reader.load('t');
    reader.close();
    expect(loaded).not.toHaveProperty('__annotations');
    expect(loaded?.annotations?.annotations.map((a) => a.id)).toEqual(['a0', 'a1']);
    expect(loaded?.annotations?.tableName).toBe('t');
  });

  it('does not write unchanged annotations again after a reload', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 5);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    store.close();

    // The next page: a new session store, a new annotation store.
    const reloaded = new SessionStore();
    const nextState = makeState();
    const nextAnnotations = makeAnnotations(nextState);
    const snapshot = await reloaded.load('t');
    restoreStateFromSnapshot(nextState, snapshot!, undefined, undefined, nextAnnotations);
    expect(nextAnnotations.count()).toBe(5);

    const writes = countWrites();
    await reloaded.save(snapshotFromState(nextState, undefined, undefined, nextAnnotations));
    nextState.sortColumns.set([{ column: 'name', direction: 'asc' }]);
    await reloaded.save(snapshotFromState(nextState, undefined, undefined, nextAnnotations));
    expect(writes.puts('sessions')).toBe(2);
    expect(writes.puts('annotations')).toBe(0);
    expect(writes.deletes('annotations')).toBe(0);

    // And the session still names the record it was saved with.
    const again = new SessionStore();
    expect((await again.load('t'))?.annotations?.annotations).toHaveLength(5);
    again.close();
    reloaded.close();
  });

  it('does not write them again when the same session store reloads the table', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 4);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));

    // `loadData` of the same table: the store is cleared, then restored.
    annotations.clear('all');
    const snapshot = await store.load('t');
    restoreStateFromSnapshot(state, snapshot!, undefined, undefined, annotations);

    const writes = countWrites();
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('annotations')).toBe(0);
  });

  it('does not write them again after a load that restores nothing', async () => {
    // An app reading the session while AutoSave keeps saving the table.
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 3);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(3);

    const writes = countWrites();
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('annotations')).toBe(0);
  });

  it('saves a sort or a severity toggle through AutoSave without the annotations', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 20);
    const saved: Promise<void>[] = [];
    const save = store.save.bind(store);
    vi.spyOn(store, 'save').mockImplementation((snapshot) => {
      const done = save(snapshot);
      saved.push(done);
      return done;
    });
    const autoSave = new AutoSave(state, store, { annotationStore: annotations, debounceMs: 1 });
    autoSave.enable();
    const settle = async (count: number) => {
      await vi.waitFor(() => expect(saved).toHaveLength(count));
      await Promise.all(saved);
    };

    state.filters.set([{ type: 'null', column: 'name' }]);
    await settle(1);
    const writes = countWrites();

    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await settle(2);
    annotations.setSeverityFilter({ info: false });
    await settle(3);
    expect(writes.puts('sessions')).toBe(2);
    expect(writes.puts('annotations')).toBe(0);

    annotations.remove('a0');
    await settle(4);
    expect(writes.puts('annotations')).toBe(1);
    expect((await rawAnnotations())?.['count']).toBe(19);
    autoSave.destroy();
  });

  it('enqueues both puts synchronously in saveSync', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    await store.open();
    const writes = countWrites();

    store.saveSync(snapshotFromState(state, undefined, undefined, annotations));
    // No await between the call and these counts.
    expect(writes.puts('sessions')).toBe(1);
    expect(writes.puts('annotations')).toBe(1);

    const record = await rawAnnotations();
    expect(record?.['count']).toBe(2);
    expect((await rawSession())?.['__annotations']).toMatchObject({ owner: record?.['owner'] });
  });

  it('deletes the annotations record when the store empties, once', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    const writes = countWrites();

    annotations.clear('all');
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.deletes('annotations')).toBe(1);
    expect(await rawAnnotations()).toBeUndefined();
    expect(await rawSession()).not.toHaveProperty('__annotations');
  });

  it('delete() removes both records, and the next save writes the annotations again', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(await rawAnnotations()).toBeDefined();

    await store.delete('t');
    expect(await rawSession()).toBeUndefined();
    expect(await rawAnnotations()).toBeUndefined();
    expect(await store.load('t')).toBeNull();

    // AutoSave's next save — the same, unchanged file — puts them back.
    const writes = countWrites();
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('annotations')).toBe(1);
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(2);
  });

  it('keeps the records of two tables on one store apart', async () => {
    const stateA = makeState('a');
    const stateB = makeState('b');
    const annotationsA = makeAnnotations(stateA);
    const annotationsB = makeAnnotations(stateB);
    annotate(annotationsA, 2);
    annotate(annotationsB, 3);
    const saveBoth = () =>
      Promise.all([
        store.save(snapshotFromState(stateA, undefined, undefined, annotationsA)),
        store.save(snapshotFromState(stateB, undefined, undefined, annotationsB)),
      ]);
    await saveBoth();
    const writes = countWrites();

    annotate(annotationsB, 1, 3);
    stateA.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await saveBoth();
    const putKeys = vi
      .mocked(IDBObjectStore.prototype.put)
      .mock.calls.filter((_, i) => {
        const ctx = vi.mocked(IDBObjectStore.prototype.put).mock.contexts[i] as IDBObjectStore;
        return ctx.name === 'annotations';
      })
      .map((call) => call[1]);
    expect(putKeys).toEqual(['b']);
    expect(writes.puts('sessions')).toBe(2);

    expect((await store.load('a'))?.annotations?.annotations).toHaveLength(2);
    expect((await store.load('b'))?.annotations?.annotations).toHaveLength(4);

    await store.delete('a');
    expect(await rawAnnotations('a')).toBeUndefined();
    expect(await rawAnnotations('b')).toBeDefined();
  });

  describe('sessions saved by versions before the annotations record', () => {
    it('restores annotations embedded in the session record, and moves them to the record on the next save', async () => {
      await plant('dt-sessions', sessionSnapshot({ annotations: annotationFile(3) }));
      const state = makeState();
      const annotations = makeAnnotations(state);
      const snapshot = await store.load('t');
      expect(snapshot?.annotations?.annotations).toHaveLength(3);
      restoreStateFromSnapshot(state, snapshot!, undefined, undefined, annotations);
      expect(annotations.count()).toBe(3);
      expect(issues).toEqual([]);

      const writes = countWrites();
      await store.save(snapshotFromState(state, undefined, undefined, annotations));
      expect(writes.puts('annotations')).toBe(1);
      const session = await rawSession();
      expect(session).not.toHaveProperty('annotations');
      expect(session?.['__annotations']).toMatchObject({ count: 3 });

      // Moved once: the next save leaves them.
      state.sortColumns.set([]);
      await store.save(snapshotFromState(state, undefined, undefined, annotations));
      expect(writes.puts('annotations')).toBe(1);
    });

    it('prefers annotations embedded in the session record to a record', async () => {
      // This version wrote both; an older one then saved the session over
      // them, with annotations of its own in it.
      const state = makeState();
      const annotations = makeAnnotations(state);
      annotate(annotations, 2);
      await store.save(snapshotFromState(state, undefined, undefined, annotations));
      await plant('dt-sessions', sessionSnapshot({ annotations: annotationFile(1) }));

      const snapshot = await store.load('t');
      expect(snapshot?.annotations?.annotations.map((a) => a.id)).toEqual(['old0']);
      expect(issues).toEqual([]);
    });

    it('does not attach a record when the session record has no marker', async () => {
      // This version wrote both; an older one then saved the session over
      // them without annotations (or cleared it and saved a new one).
      const state = makeState();
      const annotations = makeAnnotations(state);
      annotate(annotations, 2);
      await store.save(snapshotFromState(state, undefined, undefined, annotations));
      await plant('dt-sessions', sessionSnapshot());
      store.close();

      const reloaded = new SessionStore({ onLoadIssue: (issue) => issues.push(issue) });
      const snapshot = await reloaded.load('t');
      expect(snapshot).not.toBeNull();
      expect(snapshot?.annotations).toBeUndefined();
      expect(issues).toEqual([]);

      // The record left behind goes with the next save of an empty store.
      const fresh = makeAnnotations(makeState());
      restoreStateFromSnapshot(state, snapshot!, undefined, undefined, fresh);
      await reloaded.save(snapshotFromState(state, undefined, undefined, fresh));
      expect(await rawAnnotations()).toBeUndefined();
      reloaded.close();
    });

    it('does not attach a record left behind when a later save of this version did not write its own', async () => {
      // A record an older version's clearSession left behind; then this
      // version saves a session whose annotations put fails.
      await plant(
        'dt-annotations',
        { format: 1, owner: 'left-behind', count: 1, file: annotationFile(1) },
        't',
      );
      const state = makeState();
      const annotations = makeAnnotations(state);
      annotate(annotations, 1);
      const put = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = put.call(this, value, key);
        if (this.name === 'annotations') this.transaction.abort();
        return request;
      });
      await expect(
        store.save(snapshotFromState(state, undefined, undefined, annotations)),
      ).rejects.toBeInstanceOf(PersistenceError);
      vi.mocked(IDBObjectStore.prototype.put).mockRestore();
      store.close();

      const reloaded = new SessionStore({ onLoadIssue: (issue) => issues.push(issue) });
      const snapshot = await reloaded.load('t');
      expect(snapshot?.annotations).toBeUndefined();
      expect(snapshot?.sortColumns).toEqual([]);
      expect(issues).toEqual([
        {
          code: 'PERSISTENCE_ANNOTATIONS_DROPPED',
          tableName: 't',
          details: { reason: 'mismatch', count: 1 },
        },
      ]);
      reloaded.close();
    });

    it('restores a stored file whose ids repeat, keeping each first', async () => {
      const file = annotationFile(3);
      file.annotations.push({ ...file.annotations[1]!, message: 'repeat' });
      await plant('dt-sessions', sessionSnapshot({ annotations: file }));
      const state = makeState();
      const annotations = makeAnnotations(state);
      const restoreIssues: unknown[] = [];
      restoreStateFromSnapshot(
        state,
        (await store.load('t'))!,
        undefined,
        undefined,
        annotations,
        (issue) => restoreIssues.push(issue),
      );
      expect(annotations.count()).toBe(3);
      expect(annotations.get('old1')?.message).toBe('old 1');
      expect(restoreIssues).toEqual([]);

      // Not adopted: the next save writes them without the repeat.
      await store.save(snapshotFromState(state, undefined, undefined, annotations));
      expect((await rawAnnotations())?.['count']).toBe(3);
    });
  });

  describe('a stored annotations record that cannot be attached', () => {
    async function savedWithTwo(): Promise<void> {
      const state = makeState();
      state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
      const annotations = makeAnnotations(state);
      annotate(annotations, 2);
      await store.save(snapshotFromState(state, undefined, undefined, annotations));
    }

    async function loadFresh(): Promise<SessionSnapshot | null> {
      store.close();
      store = new SessionStore({ onLoadIssue: (issue) => issues.push(issue) });
      return store.load('t');
    }

    function expectRestoredWithout(snapshot: SessionSnapshot | null): void {
      expect(snapshot).not.toBeNull();
      expect(snapshot).not.toHaveProperty('__annotations');
      expect(snapshot?.annotations).toBeUndefined();
      // The rest of the session comes back.
      expect(snapshot?.tableName).toBe('t');
      expect(snapshot?.sortColumns).toEqual([{ column: 'id', direction: 'desc' }]);
      expect(snapshot?.visibleColumns).toEqual(['id', 'name']);
    }

    it('is reported missing when the record is gone', async () => {
      await savedWithTwo();
      await deleteDatabase('dt-annotations');
      const snapshot = await loadFresh();
      expectRestoredWithout(snapshot);
      expect(issues).toEqual([
        {
          code: 'PERSISTENCE_ANNOTATIONS_DROPPED',
          tableName: 't',
          details: { reason: 'missing', count: 2 },
        },
      ]);
    });

    it('is reported as a mismatch when another save wrote it', async () => {
      await savedWithTwo();
      const record = await rawAnnotations();
      await plant('dt-annotations', { ...record, owner: 'another-tab' }, 't');
      expectRestoredWithout(await loadFresh());
      expect(issues).toMatchObject([{ details: { reason: 'mismatch', count: 2 } }]);
    });

    it.each([
      ['a newer record format', (r: Record<string, unknown>) => ({ ...r, format: 2 })],
      ['a count that disagrees', (r: Record<string, unknown>) => ({ ...r, count: 3 })],
      ['a file that is not an object', (r: Record<string, unknown>) => ({ ...r, file: 'x' })],
      [
        'a file with fewer annotations',
        (r: Record<string, unknown>) => ({
          ...r,
          file: { ...(r['file'] as object), annotations: [] },
        }),
      ],
      ['a value that is not a record', () => 42],
    ])('is reported invalid for %s', async (_label, tamper) => {
      await savedWithTwo();
      const record = (await rawAnnotations())!;
      await plant('dt-annotations', tamper(record), 't');
      expectRestoredWithout(await loadFresh());
      expect(issues).toMatchObject([
        { code: 'PERSISTENCE_ANNOTATIONS_DROPPED', details: { reason: 'invalid', count: 2 } },
      ]);
    });

    it('is reported invalid for a marker this version does not read', async () => {
      await plant('dt-sessions', {
        ...sessionSnapshot(),
        __annotations: { format: 2, count: 1, owner: 'x' },
      });
      expectRestoredWithout(await loadFresh());
      expect(issues).toEqual([
        { code: 'PERSISTENCE_ANNOTATIONS_DROPPED', tableName: 't', details: { reason: 'invalid' } },
      ]);
    });

    it('is reported when loadJSON refuses the file, and the rest of the session restores', async () => {
      await savedWithTwo();
      const record = (await rawAnnotations())!;
      const file = record['file'] as AnnotationFile;
      // Passes the record's shape check; `loadJSON` refuses its entries.
      const broken = {
        ...file,
        annotations: file.annotations.map((a) => ({ ...a, scope: 'table' })),
      };
      await plant('dt-annotations', { ...record, file: broken }, 't');
      const snapshot = await loadFresh();
      expect(issues).toEqual([]);

      const state = makeState();
      state.sortColumns.set([]);
      const annotations = makeAnnotations(state);
      const restoreIssues: unknown[] = [];
      restoreStateFromSnapshot(state, snapshot!, undefined, undefined, annotations, (issue) =>
        restoreIssues.push(issue),
      );
      expect(annotations.count()).toBe(0);
      expect(state.sortColumns.get()).toEqual([{ column: 'id', direction: 'desc' }]);
      expect(restoreIssues).toEqual([
        {
          code: 'PERSISTENCE_ANNOTATIONS_DROPPED',
          tableName: 't',
          details: {
            reason: 'invalid',
            count: 2,
            errorCode: 'ANNOTATION_INVALID_SHAPE',
            errorMessage: expect.any(String),
          },
        },
      ]);
    });

    it('is reported unavailable when the annotations database cannot be read', async () => {
      await savedWithTwo();
      store.close();
      // A newer version upgraded it past the version this one opens.
      await deleteDatabase('dt-annotations');
      await new Promise<void>((resolve) => {
        const request = indexedDB.open('dt-annotations', 2);
        request.onupgradeneeded = () => request.result.createObjectStore('annotations');
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
      });
      store = new SessionStore({ onLoadIssue: (issue) => issues.push(issue) });
      expectRestoredWithout(await store.load('t'));
      expect(issues).toMatchObject([{ details: { reason: 'unavailable', count: 2 } }]);
    });
  });

  describe('when dt-annotations cannot be opened', () => {
    beforeEach(async () => {
      await new Promise<void>((resolve) => {
        const request = indexedDB.open('dt-annotations', 2);
        request.onupgradeneeded = () => request.result.createObjectStore('annotations');
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
      });
    });

    it('keeps the annotations in the session record, as before', async () => {
      const state = makeState();
      const annotations = makeAnnotations(state);
      annotate(annotations, 2);
      expect(await store.open()).toBe(true);
      await store.save(snapshotFromState(state, undefined, undefined, annotations));
      const session = await rawSession();
      expect(session).not.toHaveProperty('__annotations');
      expect((session?.['annotations'] as AnnotationFile).annotations).toHaveLength(2);
      expect((await store.load('t'))?.annotations?.annotations).toHaveLength(2);
      expect(issues).toEqual([]);
    });
  });

  it('closes its connections when another tab deletes a database, and opens them again', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));

    const blocked = vi.fn();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('dt-annotations');
      request.onblocked = blocked;
      request.onsuccess = () => resolve();
    });
    expect(blocked).not.toHaveBeenCalled();

    // The record went with the database; the next save writes it again.
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect((await rawAnnotations())?.['count']).toBe(2);
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(2);
  });

  it('close() closes both databases', async () => {
    await store.open();
    store.close();
    const blocked = vi.fn();
    await new Promise<void>((resolve) => {
      let pending = 2;
      for (const name of ['dt-sessions', 'dt-annotations']) {
        const request = indexedDB.deleteDatabase(name);
        request.onblocked = blocked;
        request.onsuccess = () => {
          if (--pending === 0) resolve();
        };
      }
    });
    expect(blocked).not.toHaveBeenCalled();
  });
});

describe('SessionStore — a failed annotations write', () => {
  let store: SessionStore;

  beforeEach(async () => {
    await deleteDatabase('dt-sessions');
    await deleteDatabase('dt-annotations');
    store = new SessionStore();
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
  });

  function failAnnotationsPut(how: 'throw' | 'abort'): void {
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name !== 'annotations') return put.call(this, value, key);
      if (how === 'throw') throw new DOMException('quota', 'QuotaExceededError');
      const request = put.call(this, value, key);
      this.transaction.abort();
      return request;
    });
  }

  it('saves the session record without its annotations, and rejects for the annotations alone', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    failAnnotationsPut('throw');

    const error = await store
      .save(snapshotFromState(state, undefined, undefined, annotations))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PersistenceError);
    expect(error).toMatchObject({
      code: 'PERSISTENCE_QUOTA_EXCEEDED',
      details: { record: 'annotations', tableName: 't' },
    });
    const session = await rawSession();
    expect(session?.['sortColumns']).toEqual([]);
    expect(session).not.toHaveProperty('__annotations');
    expect(session).not.toHaveProperty('annotations');
  });

  it('throws from saveSync after enqueueing the session record', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    await store.open();
    failAnnotationsPut('throw');

    expect(() =>
      store.saveSync(snapshotFromState(state, undefined, undefined, annotations)),
    ).toThrowError(expect.objectContaining({ code: 'PERSISTENCE_QUOTA_EXCEEDED' }));
    expect(await rawSession()).not.toHaveProperty('__annotations');
  });

  it('writes the annotations again on the next save after a write that did not land', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    failAnnotationsPut('abort');
    await expect(
      store.save(snapshotFromState(state, undefined, undefined, annotations)),
    ).rejects.toMatchObject({ code: 'SAVE_FAILED', details: { record: 'annotations' } });
    vi.mocked(IDBObjectStore.prototype.put).mockRestore();

    const writes = countWrites();
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('annotations')).toBe(1);
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(2);
  });

  it('keeps saving the session through AutoSave once the annotations are over quota', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    // A record from before the quota ran out, which the session stops naming.
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    annotate(annotations, 1, 2);
    failAnnotationsPut('throw');

    const saved: Promise<unknown>[] = [];
    const save = store.save.bind(store);
    vi.spyOn(store, 'save').mockImplementation((snapshot) => {
      const done = save(snapshot);
      saved.push(done.catch(() => undefined));
      return done;
    });
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, {
      annotationStore: annotations,
      debounceMs: 1,
      onError,
    });
    autoSave.enable();
    const settle = async (count: number) => {
      await vi.waitFor(() => expect(saved).toHaveLength(count));
      await Promise.all(saved);
    };

    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await settle(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatchObject({
      code: 'PERSISTENCE_QUOTA_EXCEEDED',
      details: { record: 'annotations' },
    });

    state.sortColumns.set([{ column: 'name', direction: 'desc' }]);
    await settle(2);
    annotate(annotations, 1, 3);
    await settle(3);
    expect(onError).toHaveBeenCalledTimes(1);
    const session = await rawSession();
    expect(session?.['sortColumns']).toEqual([{ column: 'name', direction: 'desc' }]);
    expect(session).not.toHaveProperty('__annotations');
    expect(session).not.toHaveProperty('annotations');
    // The record the session no longer names is gone.
    expect(await rawAnnotations()).toBeUndefined();
    autoSave.destroy();
  });
});
