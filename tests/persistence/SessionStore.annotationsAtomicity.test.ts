/**
 * The two records a save writes live in separate databases, so no write of
 * both is atomic: the annotations record goes first, and the session record
 * names it only once it has landed, with the record it named before as its
 * fallback. Wherever a write is cut off (a reload, a failed transaction, a
 * quota) and whichever tab wrote last, a reload restores the last
 * annotations that landed, and no save after it deletes a whole record.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationStore } from '@/annotations/AnnotationStore';
import type { TableState } from '@/core/State';
import { restoreStateFromSnapshot, snapshotFromState } from '@/persistence/serialization';
import { SessionStore } from '@/persistence/SessionStore';
import type { SessionStoreOptions } from '@/persistence/SessionStore';
import type { SessionSnapshot } from '@/persistence/types';
import {
  annotate,
  deleteDatabase,
  makeAnnotations,
  makeState,
  plant,
  plantIn,
  rawAnnotations,
  rawChunks,
  rawSession,
} from '../helpers/sessionDatabases';

type LoadIssue = Parameters<NonNullable<SessionStoreOptions['onLoadIssue']>>[0];

/** A page: a session store, a table state and its annotations. */
interface Page {
  store: SessionStore;
  state: TableState;
  annotations: AnnotationStore;
  issues: LoadIssue[];
  save(): Promise<void>;
  saveSync(): void;
}

function newPage(): Page {
  const issues: LoadIssue[] = [];
  const store = new SessionStore({ onLoadIssue: (issue) => issues.push(issue) });
  const state = makeState();
  const annotations = makeAnnotations(state);
  const snapshot = () => snapshotFromState(state, undefined, undefined, annotations);
  return {
    store,
    state,
    annotations,
    issues,
    save: () => store.save(snapshot()),
    saveSync: () => store.saveSync(snapshot()),
  };
}

/** The next page, as a reload makes it: the stored session restored. */
async function reload(previous?: Page): Promise<Page & { snapshot: SessionSnapshot | null }> {
  previous?.store.close();
  const page = newPage();
  const snapshot = await page.store.load('t');
  if (snapshot) {
    restoreStateFromSnapshot(page.state, snapshot, undefined, undefined, page.annotations);
  }
  return { ...page, snapshot };
}

const ids = (annotations: AnnotationStore) => annotations.getAll().map((a) => a.id);
const range = (count: number, from = 0) => Array.from({ length: count }, (_, i) => `a${from + i}`);

/**
 * Fail the `n`th transaction (from 1) that `which` matches, from now: as a
 * page torn down at that point, or a database that turns it away.
 */
function failTransaction(
  which: { db: 'dt-sessions' | 'dt-annotations'; mode: IDBTransactionMode },
  n = 1,
): void {
  const transaction = IDBDatabase.prototype.transaction;
  let seen = 0;
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    if (this.name === which.db && (args[1] ?? 'readonly') === which.mode && ++seen === n) {
      throw new DOMException('The page is going away.', 'InvalidStateError');
    }
    return transaction.apply(this, args);
  });
}

/**
 * Abort the transaction that puts chunk `index` of a record, once the put
 * is made (as Chromium aborts a value past its cap, or a reload stops the
 * chained puts), or later, once the call that made it has returned (a page
 * torn down before the transaction commits), or throw `QuotaExceededError`
 * from the put. `before` runs first when the put of chunk `at` is made: a
 * page hidden while the chained write is under way.
 */
function failChunkPut(
  index: number | null,
  how: 'abort' | 'abort later' | 'quota' = 'abort',
  before?: { at: number; run: () => void },
): void {
  const put = IDBObjectStore.prototype.put;
  let ran = false;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const chunk = this.name === 'chunks' ? (key as unknown[])[2] : null;
    if (before && !ran && chunk === before.at) {
      ran = true;
      before.run();
    }
    if (chunk === null || chunk !== index) return put.call(this, value, key);
    if (how === 'quota') throw new DOMException('Quota exceeded', 'QuotaExceededError');
    const request = put.call(this, value, key);
    const tx = this.transaction;
    if (how === 'abort') tx.abort();
    else queueMicrotask(() => tx.abort());
    return request;
  });
}

/** The chunk puts made so far, through the spy `failChunkPut` set. */
function chunkPuts(): number {
  return vi
    .mocked(IDBObjectStore.prototype.put)
    .mock.contexts.filter((ctx) => (ctx as IDBObjectStore).name === 'chunks').length;
}

beforeEach(async () => {
  await deleteDatabase('dt-sessions');
  await deleteDatabase('dt-annotations');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a write cut off, or failed, at any point', () => {
  /** A page that saved 25,000 annotations (three chunks), then added one. */
  async function savedThenChanged(): Promise<{ page: Page; landedOwner: unknown }> {
    const page = newPage();
    annotate(page.annotations, 25_000);
    await page.save();
    const landedOwner = (await rawAnnotations())?.['owner'];
    annotate(page.annotations, 1, 25_000);
    page.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    return { page, landedOwner };
  }

  /** Reload, sort and save, then reload again: the same annotations come back each time. */
  async function expectRestoredTwice(previous: Page, expected: string[]): Promise<void> {
    const next = await reload(previous);
    expect(ids(next.annotations)).toEqual(expected);
    expect(next.issues).toEqual([]);
    next.state.sortColumns.set([{ column: 'name', direction: 'desc' }]);
    await next.save();
    const again = await reload(next);
    expect(ids(again.annotations)).toEqual(expected);
    expect(again.issues).toEqual([]);
    expect(again.snapshot?.sortColumns).toEqual([{ column: 'name', direction: 'desc' }]);
    again.store.close();
  }

  it('in the annotations transaction: the session record goes on naming the last that landed', async () => {
    const { page, landedOwner } = await savedThenChanged();
    // Each chunk is put from the previous put's success: a reload stops the
    // chain, and the transaction aborts, as here.
    failChunkPut(2);
    await expect(page.save()).rejects.toMatchObject({ details: { record: 'annotations' } });
    vi.restoreAllMocks();

    // The session record landed, with the sort, naming the record before.
    const session = await rawSession();
    expect(session?.['sortColumns']).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(session?.['__annotations']).toMatchObject({ owner: landedOwner, count: 25_000 });
    expect((await rawAnnotations())?.['owner']).toBe(landedOwner);
    await expectRestoredTwice(page, range(25_000));
  });

  it('on a quota error mid-chain: the same', async () => {
    const { page, landedOwner } = await savedThenChanged();
    failChunkPut(1, 'quota');
    await expect(page.save()).rejects.toMatchObject({
      code: 'PERSISTENCE_QUOTA_EXCEEDED',
      details: { record: 'annotations' },
    });
    vi.restoreAllMocks();
    expect((await rawSession())?.['__annotations']).toMatchObject({ owner: landedOwner });
    await expectRestoredTwice(page, range(25_000));
  });

  it('between the commits: the record before is kept, and the session record names it', async () => {
    const { page, landedOwner } = await savedThenChanged();
    // The annotations land; the page goes before the session record is put.
    failTransaction({ db: 'dt-sessions', mode: 'readwrite' });
    await expect(page.save()).rejects.toThrow('going away');
    vi.restoreAllMocks();

    const head = await rawAnnotations();
    expect(head?.['count']).toBe(25_001);
    expect(head?.['previous']).toMatchObject([{ owner: landedOwner, count: 25_000 }]);
    expect((await rawSession())?.['__annotations']).toMatchObject({ owner: landedOwner });
    await expectRestoredTwice(page, range(25_000));
  });

  it('in the cleanup: the session record names the new record, the old one is dropped later', async () => {
    const { page, landedOwner } = await savedThenChanged();
    // The write, then the session record, land; dropping what the head kept
    // does not.
    failTransaction({ db: 'dt-annotations', mode: 'readwrite' }, 2);
    await page.save();
    vi.restoreAllMocks();

    const head = await rawAnnotations();
    expect(head?.['previous']).toMatchObject([{ owner: landedOwner }]);
    expect((await rawSession())?.['__annotations']).toEqual({
      format: 1,
      count: 25_001,
      owner: head?.['owner'],
      fallback: { owner: landedOwner, count: 25_000 },
    });
    await expectRestoredTwice(page, range(25_001));
    // The next write dropped the old record.
    const owners = new Set((await rawChunks()).map((chunk) => chunk.key[1]));
    expect(owners.has(landedOwner as string)).toBe(false);
  });

  it('restores the new record once both land, and keeps nothing else', async () => {
    const { page } = await savedThenChanged();
    await page.save();
    const head = await rawAnnotations();
    expect(head).not.toHaveProperty('previous');
    expect(new Set((await rawChunks()).map((chunk) => chunk.key[1]))).toEqual(
      new Set([head?.['owner']]),
    );
    await expectRestoredTwice(page, range(25_001));
  });

  it('restores the fallback when the record the session record names is not whole', async () => {
    const { page, landedOwner } = await savedThenChanged();
    // The cleanup is cut off, then the new record is damaged.
    failTransaction({ db: 'dt-annotations', mode: 'readwrite' }, 2);
    await page.save();
    vi.restoreAllMocks();
    page.store.close();
    const head = (await rawAnnotations())!;
    await plant('dt-annotations', { ...head, count: 7 }, 't');

    const next = await reload();
    expect(ids(next.annotations)).toEqual(range(25_000));
    expect(next.issues).toEqual([]);
    expect((await rawSession())?.['__annotations']).toMatchObject({
      fallback: { owner: landedOwner },
    });
    next.store.close();
  });
});

describe('a write whose cleanup was cut off', () => {
  /** A page with a write whose cleanup did not run: its head keeps the record before. */
  async function cutOffCleanup(): Promise<Page> {
    const page = newPage();
    annotate(page.annotations, 3);
    await page.save();
    annotate(page.annotations, 1, 3);
    failTransaction({ db: 'dt-annotations', mode: 'readwrite' }, 2);
    await page.save();
    vi.restoreAllMocks();
    expect((await rawAnnotations())?.['previous']).toHaveLength(1);
    return page;
  }

  it('leaves a session-only save resolved when its cleanup cannot start', async () => {
    const page = await cutOffCleanup();
    // A sort: the session record alone, then the cleanup of the kept
    // record, whose connection is closing (another tab's upgrade).
    page.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    failTransaction({ db: 'dt-annotations', mode: 'readwrite' });
    await expect(page.save()).resolves.toBeUndefined();
    vi.restoreAllMocks();
    expect((await rawSession())?.['sortColumns']).toEqual([{ column: 'id', direction: 'asc' }]);
    page.store.close();
  });

  it('keeps of a kept record what the head describes of it, not what it kept itself', async () => {
    const page = newPage();
    annotate(page.annotations, 1);
    await page.save();
    // Every cleanup fails from now: the second readwrite transaction of
    // dt-annotations of each save.
    const transaction = IDBDatabase.prototype.transaction;
    let writes = 0;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      if (this.name === 'dt-annotations' && args[1] === 'readwrite' && ++writes % 2 === 0) {
        throw new DOMException('Cut off.', 'InvalidStateError');
      }
      return transaction.apply(this, args);
    });
    for (let i = 1; i <= 4; i++) {
      annotate(page.annotations, 1, i);
      await page.save();
    }
    vi.restoreAllMocks();
    const previous = (await rawAnnotations())?.['previous'] as Record<string, unknown>[];
    expect(previous).toHaveLength(1);
    expect(Object.keys(previous[0]!).sort()).toEqual(['chunks', 'count', 'file', 'owner']);
    page.store.close();
  });
});

describe('a record a session saved without annotations stopped naming', () => {
  async function savedThenCleared(): Promise<{ page: Page; owner: unknown }> {
    const page = newPage();
    annotate(page.annotations, 25_000);
    await page.save();
    const owner = (await rawAnnotations())?.['owner'];
    page.annotations.clear('all');
    return { page, owner };
  }

  it('is deleted before the store closes, after a synchronous save', async () => {
    const { page } = await savedThenCleared();
    // `DataTable.destroy()` within the debounce: saveSync, then close.
    page.saveSync();
    page.store.close();
    await vi.waitFor(async () => expect(await rawAnnotations()).toBeUndefined());
    expect(await rawChunks()).toEqual([]);
    expect((await rawSession())?.['__annotations']).toBeUndefined();
  });

  it('is named as dropped, and deleted by a later load, when the page goes before it is', async () => {
    const { page, owner } = await savedThenCleared();
    // The page goes before the delete runs.
    failTransaction({ db: 'dt-annotations', mode: 'readwrite' });
    page.saveSync();
    await vi.waitFor(async () =>
      expect((await rawSession())?.['__annotationsDropped']).toBe(owner),
    );
    vi.restoreAllMocks();
    page.store.close();
    expect((await rawAnnotations())?.['owner']).toBe(owner);

    const next = await reload();
    expect(next.annotations.count()).toBe(0);
    expect(next.issues).toEqual([]);
    expect(next.snapshot).not.toHaveProperty('__annotationsDropped');
    expect(await rawAnnotations()).toBeUndefined();
    expect(await rawChunks()).toEqual([]);
    next.store.close();
  });

  it('is not deleted by a later load once another write has replaced it', async () => {
    const { page, owner } = await savedThenCleared();
    failTransaction({ db: 'dt-annotations', mode: 'readwrite' });
    page.saveSync();
    await vi.waitFor(async () =>
      expect((await rawSession())?.['__annotationsDropped']).toBe(owner),
    );
    vi.restoreAllMocks();
    page.store.close();
    // Another tab writes the table's annotations, its session record not yet put.
    const other = newPage();
    annotate(other.annotations, 2, 100);
    failTransaction({ db: 'dt-sessions', mode: 'readwrite' });
    await other.save().catch(() => undefined);
    vi.restoreAllMocks();
    other.store.close();
    const head = await rawAnnotations();
    expect(head?.['owner']).not.toBe(owner);

    const next = await reload();
    expect(next.annotations.count()).toBe(0);
    expect((await rawAnnotations())?.['owner']).toBe(head?.['owner']);
    next.store.close();
  });
});

describe('saveSync', () => {
  async function saved(): Promise<{ page: Page; landedOwner: unknown }> {
    const page = newPage();
    annotate(page.annotations, 3);
    await page.save();
    return { page, landedOwner: (await rawAnnotations())?.['owner'] };
  }

  it('names the new record, with the one before as its fallback', async () => {
    const { page, landedOwner } = await saved();
    annotate(page.annotations, 1, 3);
    page.saveSync();
    await vi.waitFor(async () => expect((await rawAnnotations())?.['count']).toBe(4));
    const head = await rawAnnotations();
    expect(head?.['previous']).toMatchObject([{ owner: landedOwner }]);
    expect((await rawSession())?.['__annotations']).toEqual({
      format: 1,
      count: 4,
      owner: head?.['owner'],
      fallback: { owner: landedOwner, count: 3 },
    });
    const next = await reload(page);
    expect(ids(next.annotations)).toEqual(range(4));
    expect(next.issues).toEqual([]);
    next.store.close();
  });

  it('restores the record before when the annotations do not land', async () => {
    const { page, landedOwner } = await saved();
    annotate(page.annotations, 1, 3);
    page.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    // The page goes before the annotations transaction commits.
    failChunkPut(0, 'abort later');
    page.saveSync();
    await vi.waitFor(async () =>
      expect((await rawSession())?.['sortColumns']).toEqual([{ column: 'id', direction: 'asc' }]),
    );
    vi.restoreAllMocks();
    expect((await rawAnnotations())?.['owner']).toBe(landedOwner);

    const next = await reload(page);
    expect(ids(next.annotations)).toEqual(range(3));
    expect(next.snapshot?.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(next.issues).toEqual([]);
    // And its next save keeps it.
    await next.save();
    const again = await reload(next);
    expect(ids(again.annotations)).toEqual(range(3));
    again.store.close();
  });

  it('names an asynchronous write of the same annotations under way, without writing them again', async () => {
    const { page } = await saved();
    annotate(page.annotations, 25_000, 3);
    // The page is hidden while the chained write puts its second chunk.
    let chunksBySaveSync = -1;
    failChunkPut(null, 'abort', {
      at: 1,
      run: () => {
        const before = chunkPuts();
        page.saveSync();
        chunksBySaveSync = chunkPuts() - before;
      },
    });
    await page.save();
    vi.restoreAllMocks();
    expect(chunksBySaveSync).toBe(0);
    const head = await rawAnnotations();
    expect(head?.['count']).toBe(25_003);
    expect((await rawSession())?.['__annotations']).toMatchObject({ owner: head?.['owner'] });
    const next = await reload(page);
    expect(next.annotations.count()).toBe(25_003);
    expect(next.issues).toEqual([]);
    next.store.close();
  });

  it('names the record before as the fallback of an asynchronous write that then fails', async () => {
    const { page, landedOwner } = await saved();
    annotate(page.annotations, 25_000, 3);
    // Hidden while the chained write puts its second chunk, which the
    // browser then aborts at the third.
    failChunkPut(2, 'abort', { at: 1, run: () => page.saveSync() });
    await expect(page.save()).rejects.toMatchObject({ details: { record: 'annotations' } });
    vi.restoreAllMocks();
    await vi.waitFor(async () =>
      expect(await rawSession()).toHaveProperty('__annotations.fallback'),
    );
    expect((await rawAnnotations())?.['owner']).toBe(landedOwner);
    expect((await rawSession())?.['__annotations']).toMatchObject({
      fallback: { owner: landedOwner, count: 3 },
    });
    const next = await reload(page);
    expect(ids(next.annotations)).toEqual(range(3));
    expect(next.issues).toEqual([]);
    next.store.close();
  });

  it('names a write whose annotations landed and whose session record is on its way', async () => {
    const { page } = await saved();
    annotate(page.annotations, 1, 3);
    const snapshot = () =>
      snapshotFromState(page.state, undefined, undefined, page.annotations, {
        lazyAnnotations: true,
      });
    // The page is hidden as the asynchronous save puts its session record,
    // and a rewrite of the annotations would not land.
    const transaction = IDBDatabase.prototype.transaction;
    let hidden = false;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const tx = transaction.apply(this, args);
      if (!hidden && this.name === 'dt-sessions' && args[1] === 'readwrite') {
        hidden = true;
        failChunkPut(0, 'abort later');
        page.store.saveSync(snapshot());
      }
      return tx;
    });
    await page.store.save(snapshot());
    vi.restoreAllMocks();
    expect(hidden).toBe(true);
    expect((await rawAnnotations())?.['count']).toBe(4);
    const next = await reload(page);
    expect(ids(next.annotations)).toEqual(range(4));
    expect(next.issues).toEqual([]);
    next.store.close();
  });

  it('stops an asynchronous save it overtakes', async () => {
    const { page } = await saved();
    page.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    const saving = page.save();
    page.state.sortColumns.set([{ column: 'name', direction: 'desc' }]);
    page.saveSync();
    await saving;
    expect((await rawSession())?.['sortColumns']).toEqual([{ column: 'name', direction: 'desc' }]);
  });
});

describe('delete', () => {
  it('stops the saves asked for before it, which would write what it deletes', async () => {
    const page = newPage();
    annotate(page.annotations, 2);
    await page.save();
    annotate(page.annotations, 25_000, 2);
    const chunkPutsBefore = (await rawChunks()).length;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    const saving = page.save();
    await page.store.delete('t');
    await saving;
    const chunkPuts = put.mock.contexts.filter(
      (ctx) => (ctx as IDBObjectStore).name === 'chunks',
    ).length;
    expect(chunkPutsBefore).toBe(1);
    expect(chunkPuts).toBe(0);
    expect(await rawSession()).toBeUndefined();
    expect(await rawAnnotations()).toBeUndefined();
    expect(await rawChunks()).toEqual([]);

    // A save asked for after it writes them all again.
    await page.save();
    const next = await reload(page);
    expect(next.annotations.count()).toBe(25_002);
    next.store.close();
  });
});

describe('two tabs on one table', () => {
  it('keeps the last writer’s annotations, and loses none that landed', async () => {
    // Tab A saves 2 annotations.
    const tabA = newPage();
    annotate(tabA.annotations, 2);
    await tabA.save();

    // Tab B opens the same table, restores them, adds one; its save lands.
    const tabB = await reload();
    expect(tabB.annotations.count()).toBe(2);
    annotate(tabB.annotations, 1, 2);
    await tabB.save();

    // Back in tab A, the user sorts: A's annotations are written again, as
    // the last writer's.
    tabA.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await tabA.save();
    tabA.store.close();
    tabB.store.close();

    const reloaded = await reload();
    expect(reloaded.snapshot?.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(ids(reloaded.annotations)).toEqual(range(2));
    expect(reloaded.issues).toEqual([]);

    // Then tab B sorts: its annotations, the last writer's now.
    const tabB2 = await reload();
    annotate(tabB2.annotations, 1, 2);
    await tabB2.save();
    reloaded.state.sortColumns.set([{ column: 'name', direction: 'asc' }]);
    await reloaded.save();
    tabB2.state.sortColumns.set([{ column: 'name', direction: 'desc' }]);
    await tabB2.save();
    const last = await reload(tabB2);
    expect(ids(last.annotations)).toEqual(range(3));
    expect(last.issues).toEqual([]);
    reloaded.store.close();
    last.store.close();
  });

  it('keeps the other tab’s annotations when a stale tab’s page is hidden', async () => {
    const tabA = newPage();
    annotate(tabA.annotations, 2);
    await tabA.save();
    const tabB = await reload();
    annotate(tabB.annotations, 1, 2);
    await tabB.save();

    // Tab A, which knows only its own record, hides with a sort pending.
    tabA.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    tabA.saveSync();
    await vi.waitFor(async () =>
      expect((await rawSession())?.['sortColumns']).toEqual([{ column: 'id', direction: 'asc' }]),
    );
    const next = await reload(tabA);
    expect(ids(next.annotations)).toEqual(range(3));
    expect(next.issues).toEqual([]);
    tabB.store.close();
    next.store.close();
  });

  it('keeps the other tab’s annotations when a stale tab’s annotations fail to write', async () => {
    const tabA = newPage();
    annotate(tabA.annotations, 2);
    await tabA.save();
    const tabB = await reload();
    annotate(tabB.annotations, 1, 2);
    await tabB.save();

    annotate(tabA.annotations, 1, 10);
    failChunkPut(0);
    await expect(tabA.save()).rejects.toMatchObject({ details: { record: 'annotations' } });
    vi.restoreAllMocks();
    const next = await reload(tabA);
    expect(ids(next.annotations)).toEqual(range(3));
    expect(next.issues).toEqual([]);
    tabB.store.close();
    next.store.close();
  });

  it('takes the other tab’s record as the fallback of a stale tab’s synchronous save', async () => {
    // Tab A saves X; tab B restores it, adds one, saves Y, and drops X.
    const tabA = newPage();
    annotate(tabA.annotations, 2);
    await tabA.save();
    const tabB = await reload();
    annotate(tabB.annotations, 1, 2);
    await tabB.save();
    const yOwner = (await rawAnnotations())?.['owner'];
    expect(new Set((await rawChunks()).map((chunk) => chunk.key[1]))).toEqual(new Set([yOwner]));

    // Tab A, which knows only X, changes its annotations and is hidden;
    // their write does not land.
    annotate(tabA.annotations, 2, 10);
    failChunkPut(0, 'abort later');
    tabA.saveSync();
    await vi.waitFor(async () =>
      expect((await rawSession())?.['__annotations']).toMatchObject({
        count: 4,
        fallback: { owner: yOwner, count: 3 },
      }),
    );
    vi.restoreAllMocks();
    expect((await rawAnnotations())?.['owner']).toBe(yOwner);

    tabB.store.close();
    const next = await reload(tabA);
    expect(ids(next.annotations)).toEqual(range(3));
    expect(next.issues).toEqual([]);
    next.store.close();
  });

  it('takes the other tab’s record as the fallback when the stale tab had no annotations', async () => {
    const tabA = newPage();
    await tabA.save();
    const tabB = await reload();
    annotate(tabB.annotations, 3);
    await tabB.save();
    const yOwner = (await rawAnnotations())?.['owner'];

    annotate(tabA.annotations, 1, 50);
    failChunkPut(0, 'abort later');
    tabA.saveSync();
    await vi.waitFor(async () =>
      expect((await rawSession())?.['__annotations']).toMatchObject({
        count: 1,
        fallback: { owner: yOwner },
      }),
    );
    vi.restoreAllMocks();
    expect((await rawChunks()).map((chunk) => chunk.key[1])).toEqual([yOwner]);

    tabB.store.close();
    const next = await reload(tabA);
    expect(ids(next.annotations)).toEqual(range(3));
    expect(next.issues).toEqual([]);
    next.store.close();
  });

  it('keeps the other tab’s record when a stale tab’s synchronous save lands', async () => {
    const tabA = newPage();
    annotate(tabA.annotations, 2);
    await tabA.save();
    const tabB = await reload();
    annotate(tabB.annotations, 1, 2);
    await tabB.save();
    const yOwner = (await rawAnnotations())?.['owner'];

    annotate(tabA.annotations, 2, 10);
    tabA.saveSync();
    await vi.waitFor(async () => expect((await rawAnnotations())?.['count']).toBe(4));
    // The head keeps Y, which the stored session record named: a page that
    // went before A's record landed would have restored it.
    expect((await rawAnnotations())?.['previous']).toMatchObject([{ owner: yOwner }]);
    tabB.store.close();
    const next = await reload(tabA);
    expect(ids(next.annotations)).toEqual([...range(2), 'a10', 'a11']);
    next.store.close();
  });
});

describe('a loaded snapshot saved again', () => {
  it('writes annotations pushed onto its file', async () => {
    const page = newPage();
    annotate(page.annotations, 2);
    await page.save();

    // An app appending an annotation to a stored session without a table.
    const snapshot = (await page.store.load('t'))!;
    snapshot.annotations!.annotations.push({
      id: 'added-offline',
      scope: 'row',
      rowId: 9,
      severity: 'info',
      message: 'appended',
    });
    snapshot.sortColumns = [{ column: 'name', direction: 'asc' }];
    await page.store.save(snapshot);

    const next = await reload(page);
    expect(next.snapshot?.sortColumns).toEqual([{ column: 'name', direction: 'asc' }]);
    expect(ids(next.annotations)).toEqual([...range(2), 'added-offline']);
    next.store.close();
  });

  it('writes a file whose annotations were replaced', async () => {
    const page = newPage();
    annotate(page.annotations, 2);
    await page.save();
    const snapshot = (await page.store.load('t'))!;
    snapshot.annotations!.annotations = snapshot.annotations!.annotations.map((a) => ({
      ...a,
      message: 'edited',
    }));
    await page.store.save(snapshot);
    const next = await reload(page);
    expect(next.annotations.getAll().map((a) => a.message)).toEqual(['edited', 'edited']);
    next.store.close();
  });
});

describe('a record this version could not attach', () => {
  it('stays, named, through saves without annotations, until the table has annotations to write', async () => {
    const page = newPage();
    annotate(page.annotations, 2);
    await page.save();
    page.store.close();
    // A newer version rewrote the head in a format this one does not read.
    const head = (await rawAnnotations())!;
    await plant('dt-annotations', { ...head, format: 2 }, 't');
    const marker = (await rawSession())?.['__annotations'];

    const older = await reload();
    expect(older.issues).toMatchObject([{ details: { reason: 'invalid', count: 2 } }]);
    older.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await older.save();
    older.saveSync();
    await vi.waitFor(async () =>
      expect((await rawSession())?.['sortColumns']).toEqual([{ column: 'id', direction: 'asc' }]),
    );
    expect((await rawSession())?.['__annotations']).toEqual(marker);
    expect(await rawAnnotations()).toEqual({ ...head, format: 2 });
    expect(await rawChunks()).toHaveLength(1);

    // Annotations of its own replace it.
    annotate(older.annotations, 1, 5);
    await older.save();
    expect(await rawAnnotations()).toMatchObject({ format: 1, count: 1 });
    const next = await reload(older);
    expect(ids(next.annotations)).toEqual(['a5']);
    next.store.close();
  });

  it('stays when the annotations database could not be read, and attaches once it can', async () => {
    const page = newPage();
    annotate(page.annotations, 2);
    await page.save();
    page.store.close();

    // The chunks cannot be read for a while.
    const getAll = IDBObjectStore.prototype.getAll;
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['getAll']>
    ) {
      if (this.name === 'chunks') throw new DOMException('busy', 'UnknownError');
      return getAll.apply(this, args);
    });
    const unavailable = await reload();
    expect(unavailable.issues).toMatchObject([{ details: { reason: 'unavailable', count: 2 } }]);
    vi.restoreAllMocks();
    unavailable.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await unavailable.save();

    const next = await reload(unavailable);
    expect(ids(next.annotations)).toEqual(range(2));
    expect(next.snapshot?.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
    next.store.close();
  });

  it('stays when the restore refused its file', async () => {
    const page = newPage();
    annotate(page.annotations, 2);
    await page.save();
    page.store.close();
    // Passes the record's checks; `loadJSON` refuses its entries.
    const [chunk] = await rawChunks();
    await plantIn('dt-annotations', 'chunks', [
      [(chunk!.value as object[]).map((a) => ({ ...a, scope: 'table' })), chunk!.key],
    ]);
    const marker = (await rawSession())?.['__annotations'];

    const refused = await reload();
    expect(refused.annotations.count()).toBe(0);
    refused.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await refused.save();
    expect((await rawSession())?.['__annotations']).toEqual(marker);
    expect((await rawAnnotations())?.['count']).toBe(2);
    refused.store.close();
  });
});
