/**
 * AnnotatedRowsTable: when the DuckDB table of annotated rows is synced,
 * counted in statements sent to a deferred fake bridge, and the read gate it
 * holds the view behind until a sync has landed.
 *
 * - Nothing is sent until something reads it: an annotated filter in force,
 *   or `ensureFresh`. Then one statement per content revision, the latest.
 * - The gate is closed as the filters' subscribers run, and opens when the
 *   sync lands, fails, the filter goes, or the table is destroyed.
 * - A later change under the filter keeps the gate open and refreshes the
 *   view in place once its sync lands, at most once per interval, when the
 *   rows the filter keeps changed.
 * - A sync drops the bridge's cached results that read the table it
 *   rebuilt, and only those.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnnotatedRowsTable,
  annotatedRowsChange,
  annotatedRowsStatement,
} from '@/annotations/AnnotatedRowsTable';
import type { AnnotationChangeHandler } from '@/annotations/types';
import { StateActions } from '@/core/Actions';
import { DataTableError, QueryError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { Filter } from '@/core/types';
import { WorkerBridge } from '@/data/WorkerBridge';
import { filtersToWhereClause } from '@/filters/FilterSQL';

import { createMockWorker } from '../helpers/mockWorker';
import { makeRowFetchBridge, type CapturedQuery } from '../helpers/rowFetchBridge';

/** The store's side of the contract: a content revision and its annotated rows. */
class FakeStore {
  contentRevision = 0;
  private rows = { rowIds: new Float64Array(), masks: new Uint8Array() };
  private readonly listeners = new Set<AnnotationChangeHandler>();
  readonly annotatedRowsCalls = vi.fn();

  annotatedRows(): { rowIds: Float64Array; masks: Uint8Array } {
    this.annotatedRowsCalls();
    return this.rows;
  }

  on(_event: 'change', handler: AnnotationChangeHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  /** New content: rows given as `[rowId, mask]` pairs. */
  set(pairs: [number, number][]): void {
    this.contentRevision++;
    this.rows = {
      rowIds: Float64Array.from(pairs.map(([rowId]) => rowId)),
      masks: Uint8Array.from(pairs.map(([, mask]) => mask)),
    };
    for (const listener of [...this.listeners]) listener({ kind: 'added', ids: [] });
  }

  /**
   * New content that leaves the annotated rows as they are, as a change to
   * a message or to column scope does: the same object comes back.
   */
  touch(): void {
    this.contentRevision++;
    for (const listener of [...this.listeners]) listener({ kind: 'updated', ids: [] });
  }

  /** A severity toggle: an event, no new content. */
  toggleSeverity(): void {
    for (const listener of [...this.listeners]) listener({ kind: 'filterChanged', ids: [] });
  }
}

const ANNOTATED: Filter = { type: 'annotated', column: '__annotated__', table: 't' };

/** How the annotated filter of any severity reads the table. */
const HELPER_READ = '("__rowid__" IN (SELECT "__rowid__" FROM "__dt_annot_t__"))';

interface Harness {
  state: TableState;
  actions: StateActions;
  store: FakeStore;
  queries: CapturedQuery[];
  clearQueryCache: ReturnType<typeof vi.fn>;
  /** The bridge's `invalidateQueries`, called with which cached results to drop. */
  invalidated: ReturnType<typeof vi.fn<(stale: (sql: string) => boolean) => void>>;
  table: AnnotatedRowsTable;
  onRefresh: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  settled: ReturnType<typeof vi.fn>;
  /** The statements that synced the table. */
  syncs: () => CapturedQuery[];
}

let harness: Harness | null = null;

function setup(options: { minInterval?: number; invalidates?: boolean } = {}): Harness {
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
  const settled = vi.fn();
  actions.setOnRelationSettled(settled);
  const store = new FakeStore();
  const onRefresh = vi.fn();
  const onError = vi.fn();
  const invalidated = vi.fn<(stale: (sql: string) => boolean) => void>();
  const table = new AnnotatedRowsTable({
    state,
    actions,
    bridge: (options.invalidates === false
      ? bridge
      : { ...bridge, invalidateQueries: invalidated }) as never,
    store: store as never,
    onRefresh,
    onError,
    minInterval: options.minInterval ?? 0,
  });
  harness = {
    state,
    actions,
    store,
    queries,
    clearQueryCache: bridge.clearQueryCache,
    invalidated,
    table,
    onRefresh,
    onError,
    settled,
    syncs: () => queries.filter((q) => q.sql.startsWith('CREATE OR REPLACE TEMP TABLE')),
  };
  return harness;
}

afterEach(() => {
  harness?.table.destroy();
  harness = null;
  vi.useRealTimers();
});

/** Let microtasks and zero-delay timers run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function watchReadable(actions: StateActions): { resolved: boolean } {
  const watch = { resolved: false };
  void actions.whenRelationReadable().then(() => (watch.resolved = true));
  return watch;
}

describe('AnnotatedRowsTable — what syncs', () => {
  it('sends nothing until something reads the table', async () => {
    const { store, queries, actions } = setup();
    store.set([[1, 1]]);
    store.set([
      [1, 1],
      [5, 2],
    ]);
    actions.addFilter({ type: 'range', column: 'id', min: 0, max: 9 });
    await settle();
    expect(queries).toHaveLength(0);
    expect(store.annotatedRowsCalls).not.toHaveBeenCalled();
    // Nor does it listen to the store meanwhile.
    expect(store.listenerCount()).toBe(0);
  });

  it('syncs once when the filter comes into force, in one statement of the latest rows', async () => {
    const { store, actions, syncs, invalidated } = setup();
    store.set([
      [3, 1],
      [7, 6],
    ]);
    actions.showAnnotatedRows();
    store.set([
      [3, 1],
      [7, 6],
      [9, 4],
    ]);
    await settle();
    expect(syncs()).toHaveLength(1);
    expect(syncs()[0]!.sql).toContain(`string_split('25,62,76', ',')`);
    expect(syncs()[0]!.sql).toMatch(/^CREATE OR REPLACE TEMP TABLE "__dt_annot_t__" AS /);
    expect(syncs()[0]!.options).toMatchObject({ cache: false, priority: 'elevated' });

    // Results cached before read the table as it was: those go, and only those.
    syncs()[0]!.deferred.resolve([]);
    await settle();
    expect(invalidated).toHaveBeenCalledTimes(1);
    const [stale] = invalidated.mock.calls[0]!;
    expect(stale(`SELECT count(*) FROM "t" WHERE ${HELPER_READ}`)).toBe(true);
    expect(stale('SELECT count(*) FROM "t"')).toBe(false);
    expect(syncs()).toHaveLength(1);
  });

  it('a restore, with the filter and the annotations written in one turn, syncs once', async () => {
    const { state, store, syncs } = setup();
    state.filters.set([ANNOTATED]);
    store.set([[1, 1]]);
    store.set([]);
    store.set([[2, 2]]);
    store.toggleSeverity();
    await settle();
    expect(syncs()).toHaveLength(1);
    expect(syncs()[0]!.sql).toContain(`string_split('18', ',')`);
  });

  it('never syncs for a change to the severity filter', async () => {
    const { store, actions, syncs } = setup();
    store.set([[1, 1]]);
    actions.showAnnotatedRows();
    await settle();
    syncs()[0]!.deferred.resolve([]);
    await settle();

    store.toggleSeverity();
    store.toggleSeverity();
    await settle();
    expect(syncs()).toHaveLength(1);
  });

  it('syncs each later change under the filter, at most once per interval, the latest', async () => {
    vi.useFakeTimers();
    const { store, actions, syncs, onRefresh } = setup({ minInterval: 150 });
    store.set([[1, 1]]);
    actions.showAnnotatedRows();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toHaveLength(1);
    syncs()[0]!.deferred.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onRefresh).not.toHaveBeenCalled();

    store.set([
      [1, 1],
      [2, 2],
    ]);
    store.set([
      [1, 1],
      [2, 2],
      [3, 4],
    ]);
    await vi.advanceTimersByTimeAsync(100);
    expect(syncs()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60);
    expect(syncs()).toHaveLength(2);
    expect(syncs()[1]!.sql).toContain(`string_split('9,18,28', ',')`);

    // Changes while it runs (for 100 ms, under the interval): one more
    // sync, of the latest, an interval after it lands.
    store.set([[4, 1]]);
    store.set([[5, 1]]);
    await vi.advanceTimersByTimeAsync(100);
    expect(syncs()).toHaveLength(2);
    syncs()[1]!.deferred.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(149);
    expect(syncs()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(syncs()).toHaveLength(3);
    expect(syncs()[2]!.sql).toContain(`string_split('41', ',')`);
    syncs()[2]!.deferred.resolve([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(syncs()).toHaveLength(3);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('waits as long as the last sync took, when that is longer than the interval', async () => {
    vi.useFakeTimers();
    const { store, actions, syncs } = setup({ minInterval: 150 });
    actions.showAnnotatedRows();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(400);
    syncs()[0]!.deferred.resolve([]);
    await vi.advanceTimersByTimeAsync(0);

    store.set([[1, 1]]);
    await vi.advanceTimersByTimeAsync(399);
    expect(syncs()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(syncs()).toHaveLength(2);
  });

  it('sends nothing for a change that leaves the annotated rows as they are', async () => {
    const { store, actions, table, syncs, onRefresh, invalidated } = setup();
    store.set([[1, 1]]);
    actions.showAnnotatedRows();
    await settle();
    syncs()[0]!.deferred.resolve([]);
    await settle();
    invalidated.mockClear();

    // A message edited, an annotation added to a column: under the filter…
    store.touch();
    store.touch();
    await settle();
    expect(syncs()).toHaveLength(1);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(invalidated).not.toHaveBeenCalled();
    // …for a caller of ensureFresh…
    store.touch();
    await expect(table.ensureFresh()).resolves.toBe('__dt_annot_t__');
    // …and for filters that come into force, which wait a microtask at most.
    store.touch();
    actions.addFilter({ type: 'range', column: 'id', min: 0, max: 9 });
    expect(actions.isRelationReadable()).toBe(false);
    await settle();
    expect(actions.isRelationReadable()).toBe(true);
    expect(syncs()).toHaveLength(1);
  });

  it('stops syncing, and listening, when the filter goes', async () => {
    const { store, actions, syncs } = setup();
    actions.showAnnotatedRows();
    await settle();
    syncs()[0]!.deferred.resolve([]);
    await settle();
    expect(store.listenerCount()).toBe(1);

    actions.hideAnnotatedRows();
    expect(store.listenerCount()).toBe(0);
    store.set([[1, 1]]);
    await settle();
    expect(syncs()).toHaveLength(1);
  });

  it('a filter that goes before its sync starts sends nothing', async () => {
    const { actions, queries } = setup();
    actions.showAnnotatedRows();
    actions.hideAnnotatedRows();
    await settle();
    expect(queries).toHaveLength(0);
  });

  it('a filter on another table, or with none, reads nothing and syncs nothing', async () => {
    const { state, actions, queries } = setup();
    state.filters.set([{ type: 'annotated', column: '__annotated__', table: 'other' }]);
    state.filters.set([{ type: 'annotated', column: '__annotated__' }]);
    expect(actions.isRelationReadable()).toBe(true);
    await settle();
    expect(queries).toHaveLength(0);
  });
});

describe('AnnotatedRowsTable — what a change under the filter refreshes', () => {
  /** The filter in force over rows 1 (error), 2 (warning) and 3 (info), its first sync landed. */
  async function live(options: Parameters<typeof setup>[0] & { errorsOnly?: boolean } = {}) {
    const harness = setup(options);
    harness.store.set([
      [1, 1],
      [2, 2],
      [3, 4],
    ]);
    harness.actions.showAnnotatedRows(options.errorsOnly ? { severities: ['error'] } : {});
    await settle();
    harness.syncs()[0]!.deferred.resolve([]);
    await settle();
    harness.invalidated.mockClear();
    harness.clearQueryCache.mockClear();
    /** New content, and its sync landed. */
    const change = async (pairs: [number, number][]): Promise<void> => {
      harness.store.set(pairs);
      await settle();
      harness.syncs().at(-1)!.deferred.resolve([]);
      await settle();
    };
    return { ...harness, change };
  }

  it('content with every row and mask as the table holds them sends nothing', async () => {
    const { store, syncs, onRefresh, invalidated } = await live();
    // Another list, the same rows and masks, and rowIds no row has.
    store.set([
      [-1, 1],
      [1, 1],
      [2, 2],
      [2.5, 4],
      [3, 4],
    ]);
    await settle();
    expect(syncs()).toHaveLength(1);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(invalidated).not.toHaveBeenCalled();
  });

  it('new severities on rows the filter keeps rebuild the table, and leave the view and its cached results', async () => {
    const { state, syncs, onRefresh, invalidated, change } = await live();
    // A warning on the row with an error: any severity keeps it either way.
    await change([
      [1, 3],
      [2, 2],
      [3, 4],
    ]);
    expect(syncs()).toHaveLength(2);
    expect(syncs()[1]!.sql).toContain(`string_split('11,18,28', ',')`);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(invalidated).toHaveBeenCalledTimes(1);
    const [stale] = invalidated.mock.calls[0]!;
    const view = filtersToWhereClause(state.filters.get());
    // What the view's own queries read keeps the same rows; anything else
    // that reads the table, as navigation's searches do, may have changed.
    expect(stale(`SELECT COUNT(*) as cnt FROM "t" WHERE ${view}`)).toBe(false);
    expect(stale('SELECT "__rowid__" FROM "__dt_annot_t__" WHERE ("__mask__" & 2) <> 0')).toBe(
      true,
    );
    expect(
      stale(
        `SELECT count(*) FROM "t" WHERE ${view} AND "__rowid__" IN (SELECT "__rowid__" FROM "__dt_annot_t__" WHERE ("__mask__" & 1) <> 0)`,
      ),
    ).toBe(true);
    expect(stale('SELECT count(*) FROM "u"')).toBe(false);
  });

  it('under errors only, rows without an error come and go unseen; a row that gains or loses one refreshes', async () => {
    const { syncs, onRefresh, invalidated, change } = await live({ errorsOnly: true });
    // A warning on the error row, a new info row, the warning row gone.
    await change([
      [1, 3],
      [3, 4],
      [5, 4],
    ]);
    expect(syncs()).toHaveLength(2);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(invalidated).toHaveBeenCalledTimes(1);
    // Row 3 gains an error.
    await change([
      [1, 3],
      [3, 5],
      [5, 4],
    ]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // Row 1 loses its.
    await change([
      [1, 2],
      [3, 5],
      [5, 4],
    ]);
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(syncs()).toHaveLength(4);
    // Each dropped every result that read the table.
    const [stale] = invalidated.mock.calls.at(-1)!;
    expect(
      stale(`SELECT 1 WHERE ${HELPER_READ.replace(')', ' WHERE ("__mask__" & 1) <> 0)')}`),
    ).toBe(true);
  });

  it('a bridge without invalidateQueries has its whole cache cleared', async () => {
    const { clearQueryCache, onRefresh, change } = await live({ invalidates: false });
    await change([[7, 1]]);
    expect(clearQueryCache).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('annotatedRowsChange', () => {
  const rows = (pairs: [number, number][]) => ({
    rowIds: Float64Array.from(pairs.map(([rowId]) => rowId)),
    masks: Uint8Array.from(pairs.map(([, mask]) => mask)),
  });
  /** `kept[mask]`: any severity keeps a row, errors only a row with an error, no filter all. */
  const ANY = Uint8Array.from([0, 1, 1, 1, 1, 1, 1, 1]);
  const ERRORS = Uint8Array.from([0, 1, 0, 1, 0, 1, 0, 1]);
  const NO_FILTER = new Uint8Array(8).fill(1);
  const before = rows([
    [1, 1],
    [4, 2],
    [9, 4],
  ]);

  it('says whether the rows a view keeps changed, or only their masks, or nothing', () => {
    expect(annotatedRowsChange(null, before, ANY)).toBe('rows');
    expect(annotatedRowsChange(before, before, ANY)).toBe('none');
    const same = rows([
      [1, 1],
      [4, 2],
      [9, 4],
    ]);
    expect(annotatedRowsChange(before, same, ANY)).toBe('none');
    const warned = rows([
      [1, 3],
      [4, 2],
      [9, 4],
    ]);
    expect(annotatedRowsChange(before, warned, ANY)).toBe('masks');
    expect(
      annotatedRowsChange(
        before,
        rows([
          [1, 1],
          [4, 2],
        ]),
        ANY,
      ),
    ).toBe('rows');
    const added = rows([
      [0, 4],
      [1, 1],
      [4, 2],
      [9, 4],
    ]);
    expect(annotatedRowsChange(before, added, ANY)).toBe('rows');
    // Errors only: rows without one come and go unseen.
    const others = rows([
      [1, 1],
      [9, 4],
      [12, 2],
    ]);
    expect(annotatedRowsChange(before, others, ERRORS)).toBe('masks');
    const erred = rows([
      [1, 1],
      [4, 3],
      [9, 4],
    ]);
    expect(annotatedRowsChange(before, erred, ERRORS)).toBe('rows');
    expect(
      annotatedRowsChange(
        before,
        rows([
          [4, 2],
          [9, 4],
        ]),
        ERRORS,
      ),
    ).toBe('rows');
    // With no annotated filter, the view keeps every row: masks only.
    expect(annotatedRowsChange(before, rows([[2, 1]]), NO_FILTER)).toBe('masks');
  });

  it('counts nothing of a rowId the table leaves out', () => {
    const odd = rows([
      [-2, 1],
      [1, 1],
      [1.5, 2],
      [4, 2],
      [9, 4],
      [2 ** 50, 4],
    ]);
    expect(annotatedRowsChange(before, odd, ANY)).toBe('none');
  });
});

describe('AnnotatedRowsTable — the read gate', () => {
  it('is closed before the filters’ subscribers run, and opens when the sync lands', async () => {
    const { state, actions, syncs, settled, onRefresh } = setup();
    // As the grid's subscriber, which the table cannot subscribe ahead of.
    const seen: boolean[] = [];
    state.filters.subscribe(() => seen.push(actions.isRelationReadable()));
    actions.showAnnotatedRows();
    expect(seen).toEqual([false]);
    expect(actions.isRelationChanging()).toBe(true);
    const readable = watchReadable(actions);

    await settle();
    expect(readable.resolved).toBe(false);
    syncs()[0]!.deferred.resolve([]);
    await settle();
    expect(readable.resolved).toBe(true);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(actions.isRelationReadable()).toBe(true);
    // The view had read nothing: nothing to refresh.
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('stays open while later changes sync, and refreshes the view once each lands', async () => {
    const { store, actions, syncs, onRefresh, settled, invalidated } = setup();
    actions.showAnnotatedRows();
    await settle();
    syncs()[0]!.deferred.resolve([]);
    await settle();
    settled.mockClear();

    store.set([[1, 1]]);
    expect(actions.isRelationReadable()).toBe(true);
    await settle();
    expect(syncs()).toHaveLength(2);
    expect(actions.isRelationReadable()).toBe(true);
    expect(actions.isRelationChanging()).toBe(false);
    invalidated.mockClear();
    syncs()[1]!.deferred.resolve([]);
    await settle();
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
  });

  it('opens at once for filters that come into force while the table is current', async () => {
    const { actions, syncs } = setup();
    actions.showAnnotatedRows();
    await settle();
    syncs()[0]!.deferred.resolve([]);
    await settle();

    actions.addFilter({ type: 'range', column: 'id', min: 0, max: 9 });
    expect(actions.isRelationReadable()).toBe(true);
    actions.hideAnnotatedRows();
    actions.showAnnotatedRows({ severities: ['error'] });
    expect(actions.isRelationReadable()).toBe(true);
    await settle();
    expect(syncs()).toHaveLength(1);
  });

  it('closes for filters that come into force after the annotations changed, until a sync', async () => {
    const { store, actions, syncs, onRefresh } = setup();
    actions.showAnnotatedRows();
    await settle();
    syncs()[0]!.deferred.resolve([]);
    await settle();
    actions.hideAnnotatedRows();
    store.set([[1, 1]]);

    actions.showAnnotatedRows();
    expect(actions.isRelationReadable()).toBe(false);
    await settle();
    expect(syncs()).toHaveLength(2);
    syncs()[1]!.deferred.resolve([]);
    await settle();
    expect(actions.isRelationReadable()).toBe(true);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('a sync that started before the filters came in, the annotations changed since, is followed by one more before it opens', async () => {
    const { store, actions, syncs } = setup();
    actions.showAnnotatedRows();
    await settle();
    syncs()[0]!.deferred.resolve([]);
    await settle();

    // A change under the filter: its sync starts.
    store.set([[1, 1]]);
    await settle();
    expect(syncs()).toHaveLength(2);
    // New filters, and new annotations, while it runs.
    actions.addFilter({ type: 'range', column: 'id', min: 0, max: 9 });
    store.set([[2, 1]]);
    expect(actions.isRelationReadable()).toBe(false);
    syncs()[1]!.deferred.resolve([]);
    await settle();
    expect(actions.isRelationReadable()).toBe(false);
    expect(syncs()).toHaveLength(3);
    syncs()[2]!.deferred.resolve([]);
    await settle();
    expect(actions.isRelationReadable()).toBe(true);
  });

  it('opens when the sync fails, reporting the failure as an error', async () => {
    const { actions, syncs, onError, onRefresh } = setup();
    actions.showAnnotatedRows();
    const readable = watchReadable(actions);
    const fresh = expect(harness!.table.ensureFresh()).rejects.toThrow('Out of Memory Error');
    await settle();
    syncs()[0]!.deferred.reject(new Error('Out of Memory Error'));
    await settle();
    expect(readable.resolved).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
    const [error] = onError.mock.calls[0]! as [DataTableError];
    expect(error).toBeInstanceOf(QueryError);
    expect(error).toMatchObject({ code: 'QUERY_RUNTIME', message: 'Out of Memory Error' });
    await fresh;
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('a sync that keeps failing is tried again only when something changes, each content reported once', async () => {
    vi.useFakeTimers();
    const { store, actions, table, syncs, onError, onRefresh } = setup({ minInterval: 150 });
    const fail = (i: number): void => syncs()[i]!.deferred.reject(new Error('Out of Memory Error'));
    store.set([[1, 1]]);
    actions.showAnnotatedRows();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toHaveLength(1);
    fail(0);
    // Ten seconds of a page on which nothing changes: no sync, no report.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncs()).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(actions.isRelationReadable()).toBe(true);

    // A caller of ensureFresh tries again; the same content is not reported again.
    const fresh = expect(table.ensureFresh()).rejects.toThrow('Out of Memory Error');
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toHaveLength(2);
    fail(1);
    await fresh;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncs()).toHaveLength(2);

    // So do new filters.
    actions.showAnnotatedRows({ severities: ['error'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toHaveLength(3);
    fail(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncs()).toHaveLength(3);
    expect(onError).toHaveBeenCalledTimes(1);

    // New content is tried after the interval, and its failure reported.
    store.set([[2, 1]]);
    await vi.advanceTimersByTimeAsync(150);
    expect(syncs()).toHaveLength(4);
    fail(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncs()).toHaveLength(4);
    expect(onError).toHaveBeenCalledTimes(2);

    // And content that syncs updates the view, which read a table that failed.
    store.set([[3, 1]]);
    await vi.advanceTimersByTimeAsync(150);
    expect(syncs()).toHaveLength(5);
    syncs()[4]!.deferred.resolve([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncs()).toHaveLength(5);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('passes on the error a sync fails with when it is the library’s', async () => {
    const { actions, syncs, onError } = setup();
    actions.showAnnotatedRows();
    await settle();
    const crash = new QueryError('worker gone', { code: 'QUERY_RUNTIME' });
    syncs()[0]!.deferred.reject(crash);
    await settle();
    expect(onError).toHaveBeenCalledWith(crash);
  });

  it('opens when the filter goes before the sync lands', async () => {
    const { actions, syncs, settled } = setup();
    actions.showAnnotatedRows();
    const readable = watchReadable(actions);
    await settle();
    actions.hideAnnotatedRows();
    await settle();
    expect(readable.resolved).toBe(true);
    expect(settled).toHaveBeenCalledTimes(1);
    syncs()[0]!.deferred.resolve([]);
    await settle();
    expect(actions.isRelationReadable()).toBe(true);
  });

  it('opens when the table is destroyed, rejecting the callers waiting', async () => {
    const { actions, table, syncs } = setup();
    actions.showAnnotatedRows();
    const readable = watchReadable(actions);
    const fresh = expect(table.ensureFresh()).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    await settle();
    table.destroy();
    await settle();
    expect(readable.resolved).toBe(true);
    await fresh;
    expect(syncs()[0]!.signal?.aborted).toBe(true);
    expect(actions.isRelationReadable()).toBe(true);
    await expect(table.ensureFresh()).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
  });
});

describe('AnnotatedRowsTable — ensureFresh', () => {
  it('syncs at once without a filter, and resolves the table’s name', async () => {
    vi.useFakeTimers();
    const { store, table, syncs } = setup({ minInterval: 10_000 });
    store.set([[2, 4]]);
    const fresh = table.ensureFresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toHaveLength(1);
    syncs()[0]!.deferred.resolve([]);
    await expect(fresh).resolves.toBe('__dt_annot_t__');

    // Current: at once, with nothing sent.
    await expect(table.ensureFresh()).resolves.toBe('__dt_annot_t__');
    expect(syncs()).toHaveLength(1);

    // A lazy sync leaves no listener and no timer behind.
    store.set([[3, 4]]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(syncs()).toHaveLength(1);
  });

  it('skips the interval the view waits for', async () => {
    vi.useFakeTimers();
    const { store, actions, table, syncs } = setup({ minInterval: 10_000 });
    actions.showAnnotatedRows();
    await vi.advanceTimersByTimeAsync(0);
    syncs()[0]!.deferred.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    store.set([[1, 1]]);
    const fresh = table.ensureFresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toHaveLength(2);
    syncs()[1]!.deferred.resolve([]);
    await expect(fresh).resolves.toBe('__dt_annot_t__');
  });

  it('waits for a sync that started after it was asked, not one running before', async () => {
    const { store, table, syncs } = setup();
    store.set([[1, 1]]);
    const first = table.ensureFresh();
    await settle();
    store.set([[2, 2]]);
    let secondDone = false;
    const second = table.ensureFresh().then((name) => {
      secondDone = true;
      return name;
    });
    syncs()[0]!.deferred.resolve([]);
    await expect(first).resolves.toBe('__dt_annot_t__');
    await settle();
    expect(secondDone).toBe(false);
    expect(syncs()).toHaveLength(2);
    syncs()[1]!.deferred.resolve([]);
    await expect(second).resolves.toBe('__dt_annot_t__');
  });

  it('rejects with NO_TABLE without a table, and QUERY_ABORTED when its signal aborts', async () => {
    const { state, table, syncs } = setup();
    const controller = new AbortController();
    const fresh = expect(table.ensureFresh(controller.signal)).rejects.toMatchObject({
      code: 'QUERY_ABORTED',
    });
    await settle();
    controller.abort();
    await fresh;
    // The sync carries on, for whoever else waits.
    expect(syncs()[0]!.signal?.aborted).toBe(false);
    await expect(table.ensureFresh(controller.signal)).rejects.toMatchObject({
      code: 'QUERY_ABORTED',
    });
    syncs()[0]!.deferred.resolve([]);
    await settle();

    state.baseTableName.set(null);
    state.tableName.set(null);
    await expect(table.ensureFresh()).rejects.toMatchObject({ code: 'NO_TABLE' });
  });

  it('a new base table aborts the sync running and its callers, and starts over', async () => {
    const { state, table, syncs, store } = setup();
    store.set([[1, 1]]);
    const fresh = expect(table.ensureFresh()).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    await settle();
    state.baseTableName.set(null);
    state.tableName.set('u');
    state.baseTableName.set('u');
    await fresh;
    expect(syncs()[0]!.signal?.aborted).toBe(true);

    const again = table.ensureFresh();
    await settle();
    expect(syncs()).toHaveLength(2);
    expect(syncs()[1]!.sql).toMatch(/^CREATE OR REPLACE TEMP TABLE "__dt_annot_u__"/);
    syncs()[1]!.deferred.resolve([]);
    await expect(again).resolves.toBe('__dt_annot_u__');
  });

  it('a derived-column view over the base table changes nothing', async () => {
    const { state, table, syncs } = setup();
    const fresh = table.ensureFresh();
    await settle();
    state.tableName.set('__dt_view_t__');
    syncs()[0]!.deferred.resolve([]);
    await expect(fresh).resolves.toBe('__dt_annot_t__');
  });
});

describe('AnnotatedRowsTable — the bridge’s cached results', () => {
  it('a sync drops the results that read its table, not another table’s on the same bridge', async () => {
    const HELD = 'SELECT max("__rowid__") AS n FROM "__dt_annot_t__"';
    let held: { id: string } | null = null;
    const mock = createMockWorker({
      onMessage: (message) => {
        if (message.type !== 'query') return undefined;
        if ((message.payload as { sql: string }).sql === HELD) {
          held = message;
          return null;
        }
        return { id: message.id, type: 'result', payload: { rows: [{ n: 1 }] } };
      },
    });
    const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
    const actions = { addReadGate: () => () => undefined, readGateOpened: () => undefined };
    const [t, u] = ['t', 'u'].map((base) => {
      const state = createTableState();
      state.tableName.set(base);
      state.baseTableName.set(base);
      const store = new FakeStore();
      store.set([[1, 1]]);
      const table = new AnnotatedRowsTable({ state, actions, bridge, store: store as never });
      return { store, table };
    }) as [
      { store: FakeStore; table: AnnotatedRowsTable },
      { store: FakeStore; table: AnnotatedRowsTable },
    ];
    try {
      await t.table.ensureFresh();
      await u.table.ensureFresh();
      const reads = [
        'SELECT count(*) AS n FROM "t" WHERE "__rowid__" IN (SELECT "__rowid__" FROM "__dt_annot_t__")',
        'SELECT count(*) AS n FROM "u" WHERE "__rowid__" IN (SELECT "__rowid__" FROM "__dt_annot_u__")',
        'SELECT count(*) AS n FROM "t"',
      ];
      for (const sql of reads) await bridge.query(sql);
      const posts = (): string[] =>
        mock.posted
          .filter((m) => m.type === 'query')
          .map((m) => (m.payload as { sql: string }).sql);
      const cached = posts().length;
      // A read of the table in flight while it is rebuilt.
      const inFlight = bridge.query(HELD);
      await vi.waitFor(() => expect(held).not.toBeNull());

      t.store.set([[2, 1]]);
      await t.table.ensureFresh();
      expect(posts()).toHaveLength(cached + 2);
      mock.sendFromWorker({ id: held!.id, type: 'result', payload: { rows: [{ n: 1 }] } });
      await inFlight;

      held = null;
      for (const sql of reads) await bridge.query(sql);
      const again = bridge.query(HELD);
      await vi.waitFor(() => expect(held).not.toBeNull());
      mock.sendFromWorker({ id: held!.id, type: 'result', payload: { rows: [{ n: 2 }] } });
      await again;
      // The read of the rebuilt table, and the one in flight, go to DuckDB
      // again; the other table's and the plain read come from the cache.
      expect(posts().slice(cached + 2)).toEqual([reads[0], HELD]);
    } finally {
      t.table.destroy();
      u.table.destroy();
      bridge.terminate();
    }
  });
});

describe('annotatedRowsStatement', () => {
  const rows = (rowIds: number[], masks: number[]) => ({
    rowIds: Float64Array.from(rowIds),
    masks: Uint8Array.from(masks),
  });

  it('packs each row as rowId * 8 + mask, in one literal DuckDB splits', async () => {
    const sql = await annotatedRowsStatement('t', rows([0, 1, 2 ** 40], [1, 7, 4]));
    expect(sql).toBe(
      'CREATE OR REPLACE TEMP TABLE "t" AS ' +
        'SELECT CAST(v >> 3 AS BIGINT) AS "__rowid__", CAST(v & 7 AS UTINYINT) AS "__mask__" ' +
        `FROM (SELECT CAST(s AS BIGINT) AS v FROM (SELECT unnest(string_split('1,15,${2 ** 43 + 4}', ',')) AS s))`,
    );
  });

  it('leaves out rowIds that are not integers in [0, 2^50)', async () => {
    const sql = await annotatedRowsStatement(
      't',
      rows([-1, 0.5, 3, 2 ** 50 - 1, 2 ** 50, Infinity, NaN], [1, 1, 2, 1, 1, 1, 1]),
    );
    expect(sql).toContain(`string_split('26,${(2 ** 50 - 1) * 8 + 1}', ',')`);
  });

  it('makes an empty table of no rows, or of none it can write', async () => {
    const empty = 'CREATE OR REPLACE TEMP TABLE "t" ("__rowid__" BIGINT, "__mask__" UTINYINT)';
    await expect(annotatedRowsStatement('t', rows([], []))).resolves.toBe(empty);
    await expect(annotatedRowsStatement('t', rows([-5], [1]))).resolves.toBe(empty);
  });

  it('builds the text in chunks, yielding between them, to the same statement', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => i * 3);
    const masks = ids.map((_, i) => (i % 7) + 1);
    const yieldNow = vi.fn(() => Promise.resolve());
    const chunked = await annotatedRowsStatement('t', rows(ids, masks), {
      chunkSize: 3,
      yieldNow,
    });
    expect(yieldNow).toHaveBeenCalledTimes(3);
    expect(chunked).toBe(await annotatedRowsStatement('t', rows(ids, masks)));
  });

  it('resolves null when aborted between chunks', async () => {
    const controller = new AbortController();
    const yieldNow = vi.fn(() => {
      controller.abort();
      return Promise.resolve();
    });
    await expect(
      annotatedRowsStatement('t', rows([1, 2, 3, 4], [1, 1, 1, 1]), {
        chunkSize: 2,
        yieldNow,
        signal: controller.signal,
      }),
    ).resolves.toBeNull();
  });

  it('quotes the table’s name', async () => {
    const sql = await annotatedRowsStatement('__dt_annot_a"b__', rows([], []));
    expect(sql).toContain('"__dt_annot_a""b__"');
  });
});

beforeEach(() => {
  harness = null;
});
