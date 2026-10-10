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
 *   view in place once its sync lands, at most once per interval.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnotatedRowsTable, annotatedRowsStatement } from '@/annotations/AnnotatedRowsTable';
import type { AnnotationChangeHandler } from '@/annotations/types';
import { StateActions } from '@/core/Actions';
import { DataTableError, QueryError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { Filter } from '@/core/types';

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

interface Harness {
  state: TableState;
  actions: StateActions;
  store: FakeStore;
  queries: CapturedQuery[];
  clearQueryCache: ReturnType<typeof vi.fn>;
  table: AnnotatedRowsTable;
  onRefresh: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  settled: ReturnType<typeof vi.fn>;
  /** The statements that synced the table. */
  syncs: () => CapturedQuery[];
}

let harness: Harness | null = null;

function setup(options: { minInterval?: number } = {}): Harness {
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
  const table = new AnnotatedRowsTable({
    state,
    actions,
    bridge: bridge as never,
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
    const { store, actions, syncs, clearQueryCache } = setup();
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

    // Results cached before read the table as it was.
    clearQueryCache.mockClear();
    syncs()[0]!.deferred.resolve([]);
    await settle();
    expect(clearQueryCache).toHaveBeenCalledTimes(1);
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
    const { store, actions, table, syncs, onRefresh, clearQueryCache } = setup();
    store.set([[1, 1]]);
    actions.showAnnotatedRows();
    await settle();
    syncs()[0]!.deferred.resolve([]);
    await settle();
    clearQueryCache.mockClear();

    // A message edited, an annotation added to a column: under the filter…
    store.touch();
    store.touch();
    await settle();
    expect(syncs()).toHaveLength(1);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(clearQueryCache).not.toHaveBeenCalled();
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
    const { store, actions, syncs, onRefresh, settled, clearQueryCache } = setup();
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
    clearQueryCache.mockClear();
    syncs()[1]!.deferred.resolve([]);
    await settle();
    expect(clearQueryCache).toHaveBeenCalledTimes(1);
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
