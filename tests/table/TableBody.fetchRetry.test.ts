/**
 * @vitest-environment jsdom
 *
 * A block fetch that ends without its block, failed or short, is not tried
 * again at once. It used to be: `fetchBlock`'s `finally` reconciles, the
 * block was still missing, and the reconciler issued the same fetch, as fast
 * as the worker answered, for as long as the failure lasted. In Chromium,
 * with a derived-column change holding a dropped VIEW for a second, that was
 * about 1,750 failed queries, each logged; with a bridge that answers in the
 * same tick, the loop never yielded. Now the same fetch waits 250 ms,
 * doubling with each failure in a row, up to 8 s. A fetch of other columns or
 * rows goes ahead, and a change that empties the cache starts afresh.
 *
 * And while a derived-column change that can break reads is in flight (a
 * removal, a replacement, an undo: all but an add) the body starts no fetch:
 * it reconciles a task after the change settles, when the state update that
 * follows a successful one has landed. An add leaves the relation readable,
 * and rows scrolled to meanwhile are read at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createSignal } from '@/core/Signal';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { UndoManager } from '@/core/UndoManager';

import {
  parseLimitOffset,
  parseRowWindow,
  rowsFor,
  type CapturedQuery,
} from '../helpers/rowFetchBridge';
import {
  HARNESS_COLUMNS,
  MockResizeObserver,
  setupTableBody,
  type TableBodyHarness,
} from '../helpers/tableBodyHarness';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function workerError(): Error {
  return new Error('Catalog Error: Table with name t does not exist!');
}

/** A body row fetch or top-up: they select `__rowid__`, a derived-column change's queries do not. */
function isRowQuery(query: CapturedQuery): boolean {
  return query.sql.startsWith('SELECT "__rowid__"');
}

/** Whether row `index` shows data rather than a placeholder. */
function landed(harness: TableBodyHarness, index: number): boolean {
  const row = harness.container.querySelector(`.dt-row[data-row-index="${index}"]`);
  return row !== null && !row.hasAttribute('data-placeholder');
}

/** A 100-row body, one block, whose first fetch failed. */
async function failedFirstFetch(): Promise<TableBodyHarness> {
  const harness = setupTableBody({ totalRows: 100, body: { prefetch: false } });
  const init = harness.body.initialize();
  expect(harness.queries).toHaveLength(1);
  harness.queries[0]!.deferred.reject(workerError());
  await init;
  await harness.drain();
  return harness;
}

describe('TableBody after a block fetch ends without its block', () => {
  it('does not try a failed fetch again until a wait of 250 ms is over', async () => {
    const harness = await failedFirstFetch();
    const { queries } = harness;
    expect(queries).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(249);
    expect(queries).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(queries).toHaveLength(2);
    expect(queries[1]!.sql).toBe(queries[0]!.sql);

    queries[1]!.deferred.resolve(rowsFor(queries[1]!.sql, HARNESS_COLUMNS));
    await harness.drain();
    expect(landed(harness, 0)).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queries).toHaveLength(2);
    harness.body.destroy();
  });

  it('waits twice as long after each failure in a row, up to 8 s', async () => {
    const harness = await failedFirstFetch();
    const { queries } = harness;
    for (const wait of [250, 500, 1_000, 2_000, 4_000, 8_000, 8_000]) {
      const count = queries.length;
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(queries, `before ${wait} ms`).toHaveLength(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(queries, `after ${wait} ms`).toHaveLength(count + 1);
      queries.at(-1)!.deferred.reject(workerError());
      await harness.drain();
    }
    harness.body.destroy();
  });

  it('does not try a fetch that came back short again until its wait is over', async () => {
    const harness = setupTableBody({ totalRows: 100, body: { prefetch: false } });
    const { queries } = harness;
    // Sorted, so the OFFSET path, whose short answer the density valve does not see.
    harness.state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    const init = harness.body.initialize();
    expect(parseLimitOffset(queries[0]!.sql)).toEqual({ limit: 100, offset: 0 });
    // Five rows of the hundred: rows 5 on, in view, are still missing.
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS).slice(0, 5));
    await init;
    await harness.drain();
    expect(queries).toHaveLength(1);
    expect(landed(harness, 5)).toBe(false);

    await vi.advanceTimersByTimeAsync(250);
    expect(queries).toHaveLength(2);
    queries[1]!.deferred.resolve(rowsFor(queries[1]!.sql, HARNESS_COLUMNS));
    await harness.drain();
    expect(landed(harness, 5)).toBe(true);
    harness.body.destroy();
  });

  it('tries at once a fetch that selects other columns, fewer or more', async () => {
    const harness = await failedFirstFetch();
    const { state, queries } = harness;

    state.visibleColumns.set(['id']);
    await harness.drain();
    expect(queries).toHaveLength(2);
    expect(queries[1]!.sql).not.toContain('"tag"');
    queries[1]!.deferred.reject(workerError());
    await harness.drain();

    state.visibleColumns.set(['id', 'tag']);
    await harness.drain();
    expect(queries).toHaveLength(3);
    expect(queries[2]!.sql).toContain('"tag"');
    queries[2]!.deferred.resolve(rowsFor(queries[2]!.sql, HARNESS_COLUMNS));
    await harness.drain();
    expect(landed(harness, 0)).toBe(true);
    // It landed before the wait was over, and nothing is left to fire.
    expect(vi.getTimerCount()).toBe(0);
    harness.body.destroy();
  });

  it('tries at once a fetch of other rows, after the row count changed', async () => {
    const harness = setupTableBody({ totalRows: 100, body: { prefetch: false } });
    const { state, queries } = harness;
    state.filters.set([{ type: 'point', column: 'tag', value: 'x' }]);
    state.filteredRows.set(10);
    const init = harness.body.initialize();
    expect(parseLimitOffset(queries[0]!.sql)).toEqual({ limit: 10, offset: 0 });
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS).slice(0, 4));
    await init;
    await harness.drain();
    expect(queries).toHaveLength(1);

    // The count lands after the rows: the block now holds 20.
    state.filteredRows.set(20);
    await harness.drain();
    expect(queries).toHaveLength(2);
    expect(parseLimitOffset(queries[1]!.sql)).toEqual({ limit: 20, offset: 0 });
    harness.body.destroy();
  });

  it('does not prefetch a block again at once after its prefetch fails', async () => {
    const harness = setupTableBody({ totalRows: 1_000, body: { fetchBlockSize: 16 } });
    const { queries } = harness;
    const init = harness.body.initialize();
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS));
    await init;
    await harness.drain();
    // Block 0 covers the view; the next is prefetched.
    expect(queries).toHaveLength(2);
    expect(queries[1]!.options?.priority).toBe('normal');

    queries[1]!.deferred.reject(workerError());
    await harness.drain();
    expect(queries).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(250);
    expect(queries).toHaveLength(3);
    expect(queries[2]!.sql).toBe(queries[1]!.sql);
    harness.body.destroy();
  });

  it('starts afresh after a change that empties the cache', async () => {
    const harness = await failedFirstFetch();
    const { queries } = harness;

    harness.state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
    await harness.drain();
    expect(queries).toHaveLength(2);
    expect(queries[1]!.sql).toMatch(/ORDER BY/);

    // A first failure again: 250 ms, not 500.
    queries[1]!.deferred.reject(workerError());
    await harness.drain();
    await vi.advanceTimersByTimeAsync(250);
    expect(queries).toHaveLength(3);
    harness.body.destroy();
  });

  it('does not count a failure that arrives after its fetch was dropped', async () => {
    const harness = setupTableBody({
      totalRows: 100,
      body: { prefetch: false },
      bridge: { rejectOnAbort: false },
    });
    const { state, queries } = harness;
    const init = harness.body.initialize();
    // A sort change drops the first fetch while it runs, and it fails after.
    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
    await harness.drain();
    expect(queries).toHaveLength(2);
    queries[0]!.deferred.reject(workerError());
    await init;
    await harness.drain();

    // The fetch that replaced it fails: the first failure, so 250 ms.
    queries[1]!.deferred.reject(workerError());
    await harness.drain();
    expect(queries).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(250);
    expect(queries).toHaveLength(3);
    harness.body.destroy();
  });

  it('holds back nothing once the body is destroyed', async () => {
    const harness = await failedFirstFetch();
    harness.body.destroy();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(harness.queries).toHaveLength(1);
  });
});

describe('TableBody after a column top-up ends without its columns', () => {
  /** Sixty-four columns, `c00`…`c63`; rows render the ones `mounted` holds. */
  const COLUMNS = Array.from({ length: 64 }, (_, i) => `c${String(i).padStart(2, '0')}`);
  const SCHEMA: ColumnSchema[] = COLUMNS.map((name) => ({
    name,
    type: 'string',
    nullable: true,
    originalType: 'VARCHAR',
  }));

  /**
   * Answer a top-up with the rows it reads, `c{i}-{id}` in each column it
   * selects: those `keep` lets through.
   */
  function answer(query: CapturedQuery, keep: (id: number) => boolean = () => true): void {
    const [, list, ids] = /^SELECT (.*?) FROM .* IN \(([\d, ]+)\)$/.exec(query.sql)!;
    const columns = list!.split(', ').map((part) => part.replace(/"/g, ''));
    query.deferred.resolve(
      ids!
        .split(', ')
        .map(Number)
        .filter(keep)
        .map((id) =>
          Object.fromEntries(columns.map((c) => [c, c === '__rowid__' ? id : `${c}-${id}`])),
        ),
    );
  }

  /** A body whose first block landed with `c00`…`c15`, the fetch around `c00`…`c07`. */
  async function setup(failFirst: boolean) {
    const mounted = createSignal<readonly string[]>(COLUMNS.slice(0, 8));
    const harness = setupTableBody({ body: { mountedColumns: mounted, prefetch: false } });
    initializeColumnsFromSchema(harness.state, SCHEMA);
    const layout = new StateActions(harness.state, {
      query: vi.fn(),
      clearQueryCache: vi.fn(),
    } as unknown as ConstructorParameters<typeof StateActions>[1]);
    for (const name of COLUMNS) layout.setColumnWidth(name, 100);
    const { queries } = harness;
    const init = harness.body.initialize();
    await harness.drain();
    if (failFirst) {
      queries[0]!.deferred.reject(workerError());
      await init;
      await vi.advanceTimersByTimeAsync(250);
    }
    const block = queries.at(-1)!;
    block.deferred.resolve(rowsFor(block.sql, COLUMNS.slice(0, 16)));
    await init;
    await harness.drain();
    return { harness, mounted, queries };
  }

  it('does not try it again until its wait is over', async () => {
    const { harness, mounted, queries } = await setup(false);
    expect(queries).toHaveLength(1);

    mounted.set(COLUMNS.slice(40, 48));
    await harness.drain();
    expect(queries).toHaveLength(2);
    expect(queries[1]!.sql).toMatch(/"__rowid__" IN \(0, 1, /);
    queries[1]!.deferred.reject(workerError());
    await harness.drain();
    expect(queries).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(250);
    expect(queries).toHaveLength(3);
    expect(queries[2]!.sql).toBe(queries[1]!.sql);
    harness.body.destroy();
  });

  it('does not fetch the block again at once when a top-up comes back short', async () => {
    const { harness, mounted, queries } = await setup(false);
    mounted.set(COLUMNS.slice(40, 48));
    await harness.drain();
    expect(queries).toHaveLength(2);
    // Rows 0–63 missing: dropped, so the block has to be fetched whole.
    answer(queries[1]!, (id) => id >= 64);
    await harness.drain();
    expect(landed(harness, 0)).toBe(false);
    expect(queries).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(250);
    expect(queries).toHaveLength(3);
    expect(queries[2]!.sql).not.toContain('IN (0,');
    harness.body.destroy();
  });

  it('counts afresh after a top-up that landed', async () => {
    const { harness, mounted, queries } = await setup(false);
    mounted.set(COLUMNS.slice(40, 48));
    await harness.drain();
    queries[1]!.deferred.reject(workerError());
    await harness.drain();
    await vi.advanceTimersByTimeAsync(250);
    expect(queries).toHaveLength(3);
    answer(queries[2]!);
    await harness.drain();

    // Back to the first columns, which the block dropped: another top-up,
    // whose failure is the first in a row.
    mounted.set(COLUMNS.slice(0, 8));
    await harness.drain();
    expect(queries).toHaveLength(4);
    expect(queries[3]!.sql).toContain('IN (0,');
    queries[3]!.deferred.reject(workerError());
    await harness.drain();
    await vi.advanceTimersByTimeAsync(250);
    expect(queries).toHaveLength(5);
    harness.body.destroy();
  });

  it('counts afresh from a block that landed', async () => {
    // The block's first fetch failed and its second landed: the top-up's
    // failure is the first in a row.
    const { harness, mounted, queries } = await setup(true);
    expect(queries).toHaveLength(2);

    mounted.set(COLUMNS.slice(40, 48));
    await harness.drain();
    expect(queries).toHaveLength(3);
    queries[2]!.deferred.reject(workerError());
    await harness.drain();
    await vi.advanceTimersByTimeAsync(250);
    expect(queries).toHaveLength(4);
    harness.body.destroy();
  });
});

describe('TableBody during a derived-column change', () => {
  const WITH_X2 = [...HARNESS_COLUMNS, 'x2'];

  /** A 1,000-row body in 16-row blocks, its first block landed, over table `t`. */
  async function setup(undoManager?: UndoManager): Promise<TableBodyHarness> {
    const harness = setupTableBody({
      totalRows: 1_000,
      body: { prefetch: false, fetchBlockSize: 16 },
      undoManager,
    });
    harness.state.baseTableName.set('t');
    const init = harness.body.initialize();
    harness.queries[0]!.deferred.resolve(rowsFor(harness.queries[0]!.sql, HARNESS_COLUMNS));
    await init;
    await harness.drain();
    expect(harness.queries).toHaveLength(1);
    return harness;
  }

  /** Answer the last query DuckDB was sent. */
  async function answerLast(harness: TableBodyHarness, rows: unknown[] = []): Promise<void> {
    harness.queries.at(-1)!.deferred.resolve(rows);
    await harness.drain();
  }

  /** Land every row read not yet answered, selecting `columns`. */
  async function landReads(harness: TableBodyHarness, columns: readonly string[]): Promise<void> {
    for (const read of harness.queries.filter(isRowQuery)) {
      read.deferred.resolve(rowsFor(read.sql, columns));
    }
    await harness.drain();
  }

  /** `setup`, then `x2 = id * 2` added and landed: the body reads the VIEW, with the column. */
  async function withDerivedColumn(undoManager?: UndoManager): Promise<TableBodyHarness> {
    const harness = await setup(undoManager);
    const add = harness.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 2',
    });
    await harness.drain();
    // Validation, type detection, then the VIEW.
    await answerLast(harness);
    await answerLast(harness, [{ t: 'INTEGER' }]);
    await answerLast(harness);
    await expect(add).resolves.toEqual({ success: true });
    await vi.advanceTimersByTimeAsync(0);
    await landReads(harness, WITH_X2);
    expect(harness.queries.filter(isRowQuery).at(-1)!.sql).toContain('FROM "__dt_view_t__"');
    expect(landed(harness, 0)).toBe(true);
    return harness;
  }

  it('starts no row fetch during a removal, then reads the table it leaves', async () => {
    const harness = await withDerivedColumn();
    const { actions, queries } = harness;

    const removal = actions.removeDerivedColumn('x2');
    await harness.drain();
    const start = queries.length;
    expect(queries[start - 1]!.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);

    harness.scrollToRow(500);
    await harness.drain();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queries.slice(start).filter(isRowQuery)).toEqual([]);

    queries[start - 1]!.deferred.resolve([]);
    await removal;
    await vi.advanceTimersByTimeAsync(0);

    // Every row fetch since the change began reads the table, without the column.
    const reads = queries.slice(start).filter(isRowQuery);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.sql).toContain('FROM "t"');
      expect(read.sql).not.toContain('"x2"');
    }
    await landReads(harness, HARNESS_COLUMNS);
    expect(landed(harness, 500)).toBe(true);
    harness.body.destroy();
  });

  it('starts no row fetch during a replacement, then reads the VIEW it rebuilt', async () => {
    const harness = await withDerivedColumn();
    const { actions, queries } = harness;

    const replace = actions.replaceDerivedColumn('x2', {
      kind: 'expression',
      name: 'x2',
      expression: 'id * 3',
    });
    await harness.drain();
    const start = queries.length;
    expect(queries[start - 1]!.sql).toMatch(/ LIMIT 0$/);

    harness.scrollToRow(500);
    await harness.drain();
    expect(queries.slice(start).filter(isRowQuery)).toEqual([]);

    // Validation, type detection, then the VIEW.
    queries[start - 1]!.deferred.resolve([]);
    await harness.drain();
    await answerLast(harness, [{ t: 'INTEGER' }]);
    expect(queries.at(-1)!.sql).toMatch(/^CREATE OR REPLACE VIEW "__dt_view_t__"/);
    expect(queries.slice(start).filter(isRowQuery)).toEqual([]);
    await answerLast(harness);
    await expect(replace).resolves.toMatchObject({ success: true });
    await vi.advanceTimersByTimeAsync(0);

    const reads = queries.slice(start).filter(isRowQuery);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.sql).toContain('FROM "__dt_view_t__"');
      expect(read.sql).toContain('"x2"');
    }
    await landReads(harness, WITH_X2);
    expect(landed(harness, 500)).toBe(true);
    harness.body.destroy();
  });

  it('starts no row fetch during an undo, then reads the table it restores', async () => {
    const harness = await withDerivedColumn(new UndoManager());
    const { actions, queries } = harness;

    const undo = actions.undo();
    await harness.drain();
    const start = queries.length;
    expect(queries[start - 1]!.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);

    harness.scrollToRow(500);
    await harness.drain();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queries.slice(start).filter(isRowQuery)).toEqual([]);

    queries[start - 1]!.deferred.resolve([]);
    await expect(undo).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(0);

    const reads = queries.slice(start).filter(isRowQuery);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(read.sql).toContain('FROM "t"');
    await landReads(harness, HARNESS_COLUMNS);
    expect(landed(harness, 500)).toBe(true);
    harness.body.destroy();
  });

  it('fetches what it held back once a change that failed has settled', async () => {
    const harness = await withDerivedColumn();
    const { actions, queries } = harness;
    const failingReplace = () =>
      actions.replaceDerivedColumn('x2', {
        kind: 'expression',
        name: 'x2',
        expression: 'no_such_col + 1',
      });

    const change = failingReplace();
    await harness.drain();
    const start = queries.length;

    harness.scrollToRow(500);
    await harness.drain();
    expect(queries.slice(start).filter(isRowQuery)).toEqual([]);

    queries[start - 1]!.deferred.reject(
      new Error('Binder Error: Referenced column "no_such_col" not found'),
    );
    await expect(change).resolves.toMatchObject({ success: false });
    await harness.drain();
    await vi.advanceTimersByTimeAsync(0);

    const reads = queries.slice(start).filter(isRowQuery);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(read.sql).toContain('FROM "__dt_view_t__"');
    await landReads(harness, WITH_X2);
    expect(landed(harness, 500)).toBe(true);

    // And a change after it, the same way.
    const again = failingReplace();
    await harness.drain();
    const next = queries.length;
    harness.scrollToRow(800);
    await harness.drain();
    expect(queries.slice(next).filter(isRowQuery)).toEqual([]);
    queries[next - 1]!.deferred.reject(new Error('Binder Error'));
    await expect(again).resolves.toMatchObject({ success: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(queries.slice(next).filter(isRowQuery).length).toBeGreaterThan(0);
    await landReads(harness, WITH_X2);
    expect(landed(harness, 800)).toBe(true);
    harness.body.destroy();
  });

  it('keeps whenFetched waiting until the fetch after the change has landed', async () => {
    const harness = await withDerivedColumn();
    const { actions, queries } = harness;

    const change = actions.removeDerivedColumn('x2');
    await harness.drain();
    const start = queries.length;

    harness.body.refresh();
    let fetched = false;
    void harness.body.whenFetched().then(() => (fetched = true));
    await harness.drain();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetched).toBe(false);
    // Nothing read meanwhile, that whenFetched could resolve on.
    expect(queries.slice(start).filter(isRowQuery)).toEqual([]);

    queries[start - 1]!.deferred.resolve([]);
    await change;
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toBe(false);
    await landReads(harness, HARNESS_COLUMNS);
    await harness.drain(8);
    expect(fetched).toBe(true);
    harness.body.destroy();
  });

  it('aborts a fetch left out of reach while a change holds the rest back', async () => {
    const harness = await withDerivedColumn();
    const { actions, queries } = harness;
    harness.scrollToRow(500);
    await harness.drain();
    const around500 = queries.slice(-1)[0]!;
    expect(isRowQuery(around500)).toBe(true);
    expect(around500.signal?.aborted).toBe(false);

    const removal = actions.removeDerivedColumn('x2');
    await harness.drain();
    const drop = queries.at(-1)!;
    harness.scrollToRow(900);
    await harness.drain();
    expect(around500.signal?.aborted).toBe(true);

    drop.deferred.resolve([]);
    await removal;
    harness.body.destroy();
  });

  it('reads the rows in view once a change lands, for a body built during it', async () => {
    // TableContainer builds a new body when an undo sets the schema mid-change.
    const harness = setupTableBody({
      totalRows: 1_000,
      body: { prefetch: false, fetchBlockSize: 16 },
    });
    const { state, actions, queries } = harness;
    state.baseTableName.set('t');
    const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
    await harness.drain();
    await answerLast(harness);
    await answerLast(harness, [{ t: 'INTEGER' }]);
    await answerLast(harness);
    await add;

    const removal = actions.removeDerivedColumn('x2');
    await harness.drain();
    const drop = queries.at(-1)!;
    const start = queries.length;
    const init = harness.body.initialize();
    await harness.drain();
    // The view moves before the change lands, and the body does not follow the
    // scroller before its first fetch has landed.
    harness.scrollToRow(500);
    await harness.drain();
    expect(queries.slice(start).filter(isRowQuery)).toEqual([]);

    // The change fails, so no state update empties the body and reads the
    // range again.
    drop.deferred.reject(new Error('Catalog Error'));
    await expect(removal).rejects.toThrow('Catalog Error');
    await vi.advanceTimersByTimeAsync(0);
    // Read from where the view is now, not from where it was when the body was
    // built, and shown there as placeholders meanwhile.
    const reads = queries.slice(start).filter(isRowQuery);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(parseRowWindow(read.sql).offset).toBeGreaterThanOrEqual(480);
    const row500 = harness.container.querySelector('.dt-row[data-row-index="500"]');
    expect(row500?.hasAttribute('data-placeholder')).toBe(true);
    await landReads(harness, WITH_X2);
    await init;
    expect(landed(harness, 500)).toBe(true);
    harness.body.destroy();
  });

  /** Start adding a 1,000-value vector column, and hold it at its INSERT into the helper table. */
  async function startVectorAdd(harness: TableBodyHarness): Promise<{ add: Promise<unknown> }> {
    const add = harness.actions.addDerivedColumn({
      kind: 'vector',
      name: 'v',
      vectorType: 'float',
      values: Array.from({ length: 1_000 }, (_, i) => i / 10),
    });
    await harness.drain();
    expect(harness.queries.at(-1)!.sql).toMatch(/^DROP TABLE IF EXISTS "__dt_vec_0_v_0__"/);
    await answerLast(harness);
    expect(harness.queries.at(-1)!.sql).toMatch(/^CREATE TABLE "__dt_vec_0_v_0__"/);
    await answerLast(harness);
    expect(harness.queries.at(-1)!.sql).toMatch(/^INSERT INTO "__dt_vec_0_v_0__"/);
    expect(harness.actions.isRelationChanging()).toBe(true);
    return { add };
  }

  it('reads the rows scrolled to during an add, which leaves the table readable', async () => {
    const harness = await setup();
    const { queries } = harness;
    const { add } = await startVectorAdd(harness);
    const start = queries.length;

    harness.scrollToRow(500);
    await harness.drain();
    const reads = queries.slice(start).filter(isRowQuery);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(read.sql).toContain('FROM "t"');
    await landReads(harness, HARNESS_COLUMNS);
    expect(landed(harness, 500)).toBe(true);

    queries[start - 1]!.deferred.reject(new Error('Out of Memory'));
    await add;
    harness.body.destroy();
  });

  it('reads the rows in view again at once after a sort during an add', async () => {
    const harness = await setup();
    const { state, queries } = harness;
    const { add } = await startVectorAdd(harness);
    const start = queries.length;

    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
    await harness.drain();
    const reads = queries.slice(start).filter(isRowQuery);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(read.sql).toMatch(/FROM "t".*ORDER BY/);
    await landReads(harness, HARNESS_COLUMNS);
    expect(landed(harness, 0)).toBe(true);

    queries[start - 1]!.deferred.reject(new Error('Out of Memory'));
    await add;
    harness.body.destroy();
  });
});

describe('TableBody with rows in view past the row count', () => {
  /** Count `fetchBlock` calls, and stop a runaway before the stack overflows. */
  function countFetchBlocks(harness: TableBodyHarness): { calls: number } {
    const counter = { calls: 0 };
    const body = harness.body as unknown as { fetchBlock: (...a: unknown[]) => Promise<void> };
    const fetchBlock = body.fetchBlock.bind(body);
    body.fetchBlock = (...args: unknown[]) => {
      if (++counter.calls > 100) throw new Error('fetchBlock called 100 times');
      return fetchBlock(...args);
    };
    return counter;
  }

  it('asks for no block past the rows there are after the count drops mid-fetch', async () => {
    const harness = setupTableBody({ totalRows: 100, body: { prefetch: false } });
    const { state, queries } = harness;
    state.filters.set([{ type: 'point', column: 'tag', value: 'zzz' }]);
    const calls = countFetchBlocks(harness);
    const init = harness.body.initialize();
    expect(queries).toHaveLength(1);

    // The filter's count lands while the first fetch runs: no rows.
    state.filteredRows.set(0);
    queries[0]!.deferred.resolve([]);
    await init;
    await harness.drain(20);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.calls).toBe(1);
    expect(queries).toHaveLength(1);
    harness.body.destroy();
  });

  it('reads only the rows there are after the count drops below the rows in view', async () => {
    const harness = setupTableBody({ totalRows: 100, body: { prefetch: false } });
    const { state, queries } = harness;
    state.filters.set([{ type: 'point', column: 'tag', value: 'k1' }]);
    const init = harness.body.initialize();
    expect(parseRowWindow(queries[0]!.sql).limit).toBe(100);

    // The filter's count lands while the first fetch runs: five rows.
    state.filteredRows.set(5);
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS).slice(0, 5));
    await init;
    await harness.drain(20);
    await vi.advanceTimersByTimeAsync(10_000);
    // Rows 0-4 are all there are: nothing is read again.
    expect(queries).toHaveLength(1);
    expect(landed(harness, 4)).toBe(true);
    harness.body.destroy();
  });

  it('asks for none either for a body built during a change, once it settles', async () => {
    const harness = setupTableBody({ totalRows: 100, body: { prefetch: false } });
    const { state, actions, queries } = harness;
    state.baseTableName.set('t');
    const add = actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
    await harness.drain();
    for (const rows of [[], [{ t: 'INTEGER' }], []]) {
      queries.at(-1)!.deferred.resolve(rows);
      await harness.drain();
    }
    await add;
    state.filters.set([{ type: 'point', column: 'tag', value: 'zzz' }]);

    const removal = actions.removeDerivedColumn('x2');
    await harness.drain();
    const drop = queries.at(-1)!;
    const calls = countFetchBlocks(harness);
    const init = harness.body.initialize();
    await harness.drain();
    // The filter's count lands during the change: no rows. Then the change fails.
    state.filteredRows.set(0);
    await harness.drain();
    drop.deferred.reject(new Error('Catalog Error'));
    await expect(removal).rejects.toThrow('Catalog Error');
    await vi.advanceTimersByTimeAsync(0);
    // (Without the gate, the body read its rows as it was built.)
    for (const read of queries.filter(isRowQuery)) read.deferred.resolve([]);
    await init;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.calls).toBe(0);
    expect(queries.filter(isRowQuery)).toEqual([]);
    harness.body.destroy();
  });
});

describe('TableBody during the filter-change scroll animation', () => {
  it('starts no fetch when a wait before a retry ends mid-animation', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
    const harness = setupTableBody({
      totalRows: 1_000,
      body: { prefetch: false, fetchBlockSize: 16 },
    });
    const { state, queries } = harness;
    const init = harness.body.initialize();
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS));
    await init;
    harness.scrollToRow(500);
    await harness.drain();
    for (const read of queries.slice(1)) read.deferred.reject(workerError());
    await harness.drain();
    const failed = queries.length;

    // A filter scrolls the view back to the top over 300 ms; the retries'
    // wait ends at 250.
    state.filters.set([{ type: 'point', column: 'tag', value: 'x' }]);
    await vi.advanceTimersByTimeAsync(280);
    expect(queries).toHaveLength(failed);

    // At its end, the rows at the top are read, filtered.
    await vi.advanceTimersByTimeAsync(100);
    const reads = queries.slice(failed).filter(isRowQuery);
    expect(reads.length).toBeGreaterThan(0);
    expect(parseRowWindow(reads[0]!.sql).offset).toBe(0);
    expect(reads[0]!.sql).toContain('WHERE');
    harness.body.destroy();
  });
});
