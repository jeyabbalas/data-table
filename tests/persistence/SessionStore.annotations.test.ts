/**
 * Annotations persist in a record of their own (`dt-annotations`), written
 * only when they change: a save after a sort, a filter, a width or a
 * severity toggle clones the session record alone, and a reload writes
 * nothing. The session record names the annotations record it was saved
 * with, and the one before as its fallback, and a load attaches the first
 * of them that is whole. (Cut-off writes and two tabs:
 * `SessionStore.annotationsAtomicity.test.ts`.)
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationFile } from '@/annotations/types';
import { PersistenceError } from '@/core/errors';
import { AutoSave } from '@/persistence/AutoSave';
import { restoreStateFromSnapshot, snapshotFromState } from '@/persistence/serialization';
import { SessionStore } from '@/persistence/SessionStore';
import type { SessionStoreOptions } from '@/persistence/SessionStore';
import type { SessionSnapshot } from '@/persistence/types';
import {
  annotate,
  annotationFile,
  countWrites,
  deleteDatabase,
  deleteRaw,
  makeAnnotations,
  makeState,
  plant,
  plantIn,
  plantRecord,
  rawAnnotations,
  rawChunks,
  rawIds,
  rawSession,
  sessionSnapshot,
} from '../helpers/sessionDatabases';

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
    expect(writes.puts('chunks')).toBe(0);

    annotate(annotations, 3);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('annotations')).toBe(1);
    expect(writes.puts('chunks')).toBe(1);

    const session = await rawSession();
    const record = await rawAnnotations();
    expect(session).not.toHaveProperty('annotations');
    expect(session?.['__annotations']).toEqual({ format: 1, count: 3, owner: record?.['owner'] });
    expect(record).toMatchObject({ format: 1, count: 3, chunks: 1 });
    expect(record?.['file']).toMatchObject({ version: 1, tableName: 't' });
    expect(record?.['file']).not.toHaveProperty('annotations');
    expect((await rawChunks()).map((chunk) => chunk.key)).toEqual([['t', record?.['owner'], 0]]);
    expect(await rawIds()).toEqual(['a0', 'a1', 'a2']);

    // A sort, a width and a severity toggle: the session record alone.
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    state.columnWidths.set(new Map([['id', 140]]));
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    annotations.setSeverityFilter({ warning: false });
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('sessions')).toBe(5);
    expect(writes.puts('annotations')).toBe(1);
    expect(writes.puts('chunks')).toBe(1);
    // The write's, which clears the table's chunks first: the first save,
    // which found no annotations, knew of no record to delete.
    expect(writes.deletes('chunks')).toBe(1);
    expect(writes.deletes('annotations')).toBe(0);
    expect((await rawSession())?.['__annotations']).toEqual(session?.['__annotations']);
    expect((await rawSession())?.['annotationSeverityFilter']).toEqual({
      error: true,
      warning: false,
      info: true,
    });

    // A change of the annotations writes them, under a new owner, keeping
    // the old record until the session record names the new one, with the
    // old as its fallback; then the old owner's chunks go.
    annotate(annotations, 1, 3);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    // The new head, keeping the old record, then the same without it.
    expect(writes.puts('annotations')).toBe(3);
    const after = await rawAnnotations();
    expect(after?.['count']).toBe(4);
    expect(after?.['owner']).not.toBe(record?.['owner']);
    expect(after).not.toHaveProperty('previous');
    expect((await rawChunks()).map((chunk) => chunk.key)).toEqual([['t', after?.['owner'], 0]]);
    expect(await rawIds()).toEqual(['a0', 'a1', 'a2', 'a3']);
    expect((await rawSession())?.['__annotations']).toEqual({
      format: 1,
      count: 4,
      owner: after?.['owner'],
      fallback: { owner: record?.['owner'], count: 3 },
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
    expect(writes.puts('chunks')).toBe(1);
    // The new head, then the same without the record it kept.
    expect(writes.puts('annotations')).toBe(2);
    expect((await rawAnnotations())?.['count']).toBe(19);
    autoSave.destroy();
  });

  it('enqueues both puts synchronously in saveSync', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    // A session saved before, which names no annotations.
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    annotate(annotations, 2);
    const writes = countWrites();

    store.saveSync(snapshotFromState(state, undefined, undefined, annotations));
    // No await between the call and these counts.
    expect(writes.puts('sessions')).toBe(1);
    expect(writes.puts('chunks')).toBe(1);
    expect(writes.puts('annotations')).toBe(1);

    await vi.waitFor(async () => expect((await rawAnnotations())?.['count']).toBe(2));
    const record = await rawAnnotations();
    expect((await rawSession())?.['__annotations']).toEqual({
      format: 1,
      count: 2,
      owner: record?.['owner'],
    });
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(2);
  });

  it('keeps the annotations in the session record in saveSync while it knows nothing of the table', async () => {
    // A store that has neither read nor written the table: the stored session
    // record may name a record it does not know, which it must not delete.
    await plantRecord('t', 'unknown-to-it', annotationFile(1));
    await plant('dt-sessions', {
      ...sessionSnapshot(),
      __annotations: { format: 1, count: 1, owner: 'unknown-to-it' },
    });
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    await store.open();
    const writes = countWrites();

    store.saveSync(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('sessions')).toBe(1);
    expect(writes.puts('chunks')).toBe(0);
    expect(writes.puts('annotations')).toBe(0);
    await vi.waitFor(async () => expect(await rawSession()).toHaveProperty('annotations'));
    const session = await rawSession();
    expect(session).not.toHaveProperty('__annotations');
    expect((session?.['annotations'] as AnnotationFile).annotations).toHaveLength(2);
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(2);
    // The record it did not know stays, for a write to replace.
    expect((await rawAnnotations())?.['owner']).toBe('unknown-to-it');
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
    // B's new head, then the same without the record it kept.
    expect(putKeys).toEqual(['b', 'b']);
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

      // The record left behind stays through a save without annotations,
      // as one this store does not know, and goes once a write replaces it.
      const fresh = makeAnnotations(makeState());
      restoreStateFromSnapshot(state, snapshot!, undefined, undefined, fresh);
      await reloaded.save(snapshotFromState(state, undefined, undefined, fresh));
      const leftBehind = await rawAnnotations();
      expect(leftBehind?.['count']).toBe(2);
      annotate(fresh, 1, 10);
      await reloaded.save(snapshotFromState(state, undefined, undefined, fresh));
      const head = await rawAnnotations();
      expect(head).toMatchObject({ count: 1 });
      expect(head?.['owner']).not.toBe(leftBehind?.['owner']);
      expect((await rawChunks()).map((chunk) => chunk.key)).toEqual([['t', head?.['owner'], 0]]);
      reloaded.close();
    });

    it('does not attach a record left behind when a later save of this version did not write its own', async () => {
      // A record an older version's clearSession left behind; then this
      // version saves a session whose annotations put fails. The session
      // record lands without a marker: it never names a record before that
      // record has landed.
      await plantRecord('t', 'left-behind', annotationFile(1));
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
        if (this.name === 'chunks') this.transaction.abort();
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
      expect(await rawSession()).not.toHaveProperty('__annotations');
      expect(issues).toEqual([]);
      expect((await rawAnnotations())?.['owner']).toBe('left-behind');
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
      ['more chunks than it has', (r: Record<string, unknown>) => ({ ...r, chunks: 2 })],
      ['no chunks for its annotations', (r: Record<string, unknown>) => ({ ...r, chunks: 0 })],
      ['more chunks than annotations', (r: Record<string, unknown>) => ({ ...r, chunks: 3 })],
      ['a value that is not a head', () => 42],
    ])('is reported invalid for a head with %s', async (_label, tamper) => {
      await savedWithTwo();
      const record = (await rawAnnotations())!;
      await plant('dt-annotations', tamper(record), 't');
      expectRestoredWithout(await loadFresh());
      expect(issues).toMatchObject([
        { code: 'PERSISTENCE_ANNOTATIONS_DROPPED', details: { reason: 'invalid', count: 2 } },
      ]);
    });

    it.each([
      ['missing', null],
      ['empty', []],
      ['not a list', { 0: 'a' }],
      ['short of the count', 'one'],
    ])('is reported invalid for a chunk %s', async (_label, replacement) => {
      await savedWithTwo();
      const [chunk] = await rawChunks();
      if (replacement === null) await deleteRaw('chunks', chunk!.key);
      else if (replacement === 'one') {
        await plantIn('dt-annotations', 'chunks', [
          [(chunk!.value as unknown[]).slice(0, 1), chunk!.key],
        ]);
      } else await plantIn('dt-annotations', 'chunks', [[replacement, chunk!.key]]);
      expectRestoredWithout(await loadFresh());
      expect(issues).toMatchObject([
        { code: 'PERSISTENCE_ANNOTATIONS_DROPPED', details: { reason: 'invalid', count: 2 } },
      ]);
    });

    it('reads only the chunks of the head it attaches', async () => {
      await savedWithTwo();
      // Chunks of another write, which a range covering the table holds too.
      await plantIn('dt-annotations', 'chunks', [
        [annotationFile(5).annotations, ['t', 'another-write', 0]],
        [annotationFile(5).annotations, ['t', 'another-write', 1]],
      ]);
      const snapshot = await loadFresh();
      expect(issues).toEqual([]);
      expect(snapshot?.annotations?.annotations.map((a) => a.id)).toEqual(['a0', 'a1']);
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
      const [chunk] = await rawChunks();
      // Passes the record's checks; `loadJSON` refuses its entries.
      const broken = (chunk!.value as object[]).map((a) => ({ ...a, scope: 'table' }));
      await plantIn('dt-annotations', 'chunks', [[broken, chunk!.key]]);
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

  /** Make the put of chunk `index` of every record write throw, or abort its transaction. */
  function failAnnotationsPut(how: 'throw' | 'abort', index = 0): void {
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name !== 'chunks' || (key as unknown[])[2] !== index) {
        return put.call(this, value, key);
      }
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
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    const landed = await rawSession();
    annotate(annotations, 1, 2);
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    failAnnotationsPut('throw');

    expect(() =>
      store.saveSync(snapshotFromState(state, undefined, undefined, annotations)),
    ).toThrowError(expect.objectContaining({ code: 'PERSISTENCE_QUOTA_EXCEEDED' }));
    // The session record lands, naming the annotations that landed before.
    await vi.waitFor(async () =>
      expect((await rawSession())?.['sortColumns']).toEqual([{ column: 'id', direction: 'asc' }]),
    );
    expect((await rawSession())?.['__annotations']).toEqual(landed?.['__annotations']);
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(2);
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

  it('holds the annotations back through AutoSave when their record fails to land twice', async () => {
    // As Chromium aborts a value over its size cap: after the put, with
    // `UnknownError`, every time.
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    failAnnotationsPut('abort');

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
    const writes = countWrites();
    for (const [i, direction] of (['asc', 'desc', 'asc'] as const).entries()) {
      state.sortColumns.set([{ column: 'id', direction }]);
      await vi.waitFor(() => expect(saved).toHaveLength(i + 1));
      await Promise.all(saved);
    }

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatchObject({
      code: 'SAVE_FAILED',
      details: { record: 'annotations' },
    });
    // Two attempts, then none.
    expect(writes.puts('chunks')).toBe(2);
    expect(writes.puts('annotations')).toBe(0);
    const session = await rawSession();
    expect(session?.['sortColumns']).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(session).not.toHaveProperty('__annotations');
    autoSave.destroy();
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
    expect(session).not.toHaveProperty('annotations');
    // The session goes on naming the record that landed before the quota
    // ran out, and a reload restores it.
    expect(session?.['__annotations']).toMatchObject({ count: 2 });
    expect((await rawAnnotations())?.['count']).toBe(2);
    autoSave.destroy();
    store.close();
    const reloaded = new SessionStore();
    const snapshot = await reloaded.load('t');
    expect(snapshot?.annotations?.annotations.map((a) => a.id)).toEqual(['a0', 'a1']);
    expect(snapshot?.sortColumns).toEqual([{ column: 'name', direction: 'desc' }]);
    reloaded.close();
  });
});

describe('SessionStore — annotations in chunks', () => {
  let store: SessionStore;

  beforeEach(async () => {
    await deleteDatabase('dt-sessions');
    await deleteDatabase('dt-annotations');
    store = new SessionStore();
    await store.open();
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
  });

  it.each([
    [1, [1]],
    [10_000, [10_000]],
    [10_001, [10_000, 1]],
    [20_000, [10_000, 10_000]],
  ])('round-trips %i annotations in chunks of %j', async (count, sizes) => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, count);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));

    const head = await rawAnnotations();
    const chunks = await rawChunks();
    expect(head).toMatchObject({ count, chunks: sizes.length });
    expect(chunks.map((chunk) => chunk.key)).toEqual(
      sizes.map((_, i) => ['t', head?.['owner'], i]),
    );
    expect(chunks.map((chunk) => (chunk.value as unknown[]).length)).toEqual(sizes);

    store.close();
    const reloaded = new SessionStore();
    const next = makeState();
    const nextAnnotations = makeAnnotations(next);
    const snapshot = await reloaded.load('t');
    expect(snapshot?.annotations?.annotations).toHaveLength(count);
    restoreStateFromSnapshot(next, snapshot!, undefined, undefined, nextAnnotations);
    expect(nextAnnotations.getAll().map((a) => a.id)).toEqual(
      annotations.getAll().map((a) => a.id),
    );
    const writes = countWrites();
    await reloaded.save(snapshotFromState(next, undefined, undefined, nextAnnotations));
    expect(writes.puts('chunks')).toBe(0);
    expect(writes.puts('annotations')).toBe(0);
    reloaded.close();
  });

  it('bounds a chunk by bytes as well as by count', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    const detail = 'x'.repeat(4_000);
    annotations.addMany(
      Array.from({ length: 3_000 }, (_, i) => ({
        scope: 'row' as const,
        rowId: i,
        severity: 'info' as const,
        message: `m${i}`,
        metadata: { detail },
      })),
    );
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    const chunks = await rawChunks();
    // About 8 KB each as estimated, 8 MiB a chunk: three chunks, not one.
    expect(chunks.length).toBe(3);
    expect(chunks.reduce((n, chunk) => n + (chunk.value as unknown[]).length, 0)).toBe(3_000);
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(3_000);
  });

  it('puts the chunks one after another in save(), and all at once in saveSync()', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 25_000);
    // For each chunk put, whether the put before it in the same transaction
    // had landed.
    const previousDone: boolean[] = [];
    let last: IDBRequest | null = null;
    const put = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = put.call(this, value, key);
      if (this.name === 'chunks') {
        if ((key as unknown[])[2] !== 0) previousDone.push(last?.readyState === 'done');
        last = request;
      }
      return request;
    });
    const chunkPuts = () =>
      spy.mock.contexts.filter((ctx) => (ctx as IDBObjectStore).name === 'chunks').length;

    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(chunkPuts()).toBe(3);
    expect(previousDone).toEqual([true, true]);

    annotate(annotations, 1, 25_000);
    previousDone.length = 0;
    store.saveSync(snapshotFromState(state, undefined, undefined, annotations));
    // No await between the call and these.
    expect(chunkPuts()).toBe(6);
    expect(previousDone).toEqual([false, false]);
    await vi.waitFor(async () => expect((await rawAnnotations())?.['count']).toBe(25_001));
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(25_001);
  });

  it.each([
    ['aborts', 'abort', 'SAVE_FAILED'],
    ['throws', 'throw', 'PERSISTENCE_QUOTA_EXCEEDED'],
  ] as const)(
    'keeps the previous record whole when a later chunk %s, and reports it',
    async (_label, how, code) => {
      const state = makeState();
      const annotations = makeAnnotations(state);
      annotate(annotations, 25_000);
      await store.save(snapshotFromState(state, undefined, undefined, annotations));
      const before = await rawAnnotations();
      const beforeChunks = await rawChunks();

      annotate(annotations, 1, 25_000);
      const put = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (this.name !== 'chunks' || (key as unknown[])[2] !== 1) {
          return put.call(this, value, key);
        }
        if (how === 'throw') throw new DOMException('quota', 'QuotaExceededError');
        const request = put.call(this, value, key);
        this.transaction.abort();
        return request;
      });
      await expect(
        store.save(snapshotFromState(state, undefined, undefined, annotations)),
      ).rejects.toMatchObject({ code, details: { record: 'annotations' } });
      vi.mocked(IDBObjectStore.prototype.put).mockRestore();

      expect(await rawAnnotations()).toEqual(before);
      expect(await rawChunks()).toEqual(beforeChunks);
    },
  );

  it('deletes the old chunks when the annotations shrink', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 20_001);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    expect(await rawChunks()).toHaveLength(3);

    annotations.removeMany(
      annotations
        .getAll()
        .slice(5)
        .map((a) => a.id),
    );
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    const head = await rawAnnotations();
    expect(head).toMatchObject({ count: 5, chunks: 1 });
    expect((await rawChunks()).map((chunk) => chunk.key)).toEqual([['t', head?.['owner'], 0]]);
  });

  it('deletes the head and every chunk with the session', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 20_001);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    await store.delete('t');
    expect(await rawSession()).toBeUndefined();
    expect(await rawAnnotations()).toBeUndefined();
    expect(await rawChunks()).toEqual([]);
  });

  it('writes nothing to dt-annotations for a save whose annotations did not change', async () => {
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 20_001);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    const writes = countWrites();
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    annotations.setSeverityFilter({ error: false });
    store.saveSync(snapshotFromState(state, undefined, undefined, annotations));
    expect(writes.puts('sessions')).toBe(2);
    for (const name of ['annotations', 'chunks'] as const) {
      expect(writes.puts(name)).toBe(0);
      expect(writes.deletes(name)).toBe(0);
    }
  });

  it('keeps annotations in the session record with a database made without the chunk store', async () => {
    store.close();
    // As an earlier build of this version made it.
    await deleteDatabase('dt-annotations');
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('dt-annotations', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('annotations');
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
    store = new SessionStore();
    const state = makeState();
    const annotations = makeAnnotations(state);
    annotate(annotations, 2);
    await store.save(snapshotFromState(state, undefined, undefined, annotations));
    const session = await rawSession();
    expect(session).not.toHaveProperty('__annotations');
    expect((session?.['annotations'] as AnnotationFile).annotations).toHaveLength(2);
    expect((await store.load('t'))?.annotations?.annotations).toHaveLength(2);
  });
});
