/**
 * The worker queue's `'elevated'` priority: a read a user is waiting on
 * (`actions.getCellValue`, the value inspector's read of one cell) runs
 * ahead of queued chart and stats work (`'normal'`), and behind viewport
 * row fetches (`'high'`), so that a loop of cell reads cannot hold up the
 * grid's rows. Entries of one priority run in the order posted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __getRunningForTests,
  __resetDispatcherForTests,
  handleMessage,
  type Respond,
} from '@/worker/dispatcher';
import type { WorkerMessage } from '@/worker/types';

vi.mock('@/worker/duckdb', () => {
  const cancelSent = vi.fn(() => Promise.resolve(true));
  const conn = { cancelSent };
  return {
    initializeDuckDB: vi.fn(() => Promise.resolve()),
    executeQuery: vi.fn(() => Promise.resolve([])),
    executeQueryCancellable: vi.fn(() => Promise.resolve([])),
    getConnection: vi.fn(() => conn),
    getDatabase: vi.fn(() => ({})),
    isInitialized: vi.fn(() => true),
    __conn: conn,
  };
});

vi.mock('@/worker/loaders/csv', () => ({ loadCSV: vi.fn() }));
vi.mock('@/worker/loaders/json', () => ({ loadJSON: vi.fn() }));
vi.mock('@/worker/loaders/parquet', () => ({ loadParquet: vi.fn() }));

interface Reply {
  id: string;
  type: string;
  payload: unknown;
}

type Priority = 'high' | 'elevated' | 'normal' | undefined;

let replies: Reply[];
const respond: Respond = (id, type, payload) => {
  replies.push({ id, type, payload });
};

function query(id: string, priority: Priority): Promise<void> {
  const payload = priority === undefined ? { sql: id } : { sql: id, priority };
  return handleMessage({ id, type: 'query', payload } as WorkerMessage, respond);
}

/** Ids whose queries ran to a result, in order. */
function ran(): string[] {
  return replies.filter((r) => r.type === 'result').map((r) => r.id);
}

async function duckdb() {
  return (await import('@/worker/duckdb')) as unknown as {
    executeQueryCancellable: ReturnType<typeof vi.fn>;
    __conn: { cancelSent: ReturnType<typeof vi.fn> };
  };
}

/** Make the query `sql` wait until the returned function is called. */
async function holdQuery(sql: string): Promise<() => void> {
  const mock = (await duckdb()).executeQueryCancellable;
  let release!: () => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = () => resolve([]);
  });
  mock.mockImplementation((text: string) => (text === sql ? held : Promise.resolve([])));
  return release;
}

describe("the worker queue's 'elevated' priority", () => {
  beforeEach(() => {
    __resetDispatcherForTests();
    vi.clearAllMocks();
    replies = [];
  });

  afterEach(() => {
    __resetDispatcherForTests();
  });

  it('runs a read at once when nothing is queued, as the value inspector needs', async () => {
    const { executeQueryCancellable } = await duckdb();
    const done = query('cell', 'elevated');
    // Started synchronously, before anything else could be queued.
    expect(__getRunningForTests()).toEqual({ id: 'cell', type: 'query' });
    expect(executeQueryCancellable).toHaveBeenCalledWith('cell');
    await done;
    expect(ran()).toEqual(['cell']);
  });

  it("runs 'high' before 'elevated', 'elevated' before 'normal', each in the order posted", async () => {
    const release = await holdQuery('running');
    const posted = [
      query('running', undefined),
      query('chart1', 'normal'),
      query('cell1', 'elevated'),
      query('rows1', 'high'),
      query('stats', undefined),
      query('cell2', 'elevated'),
      query('rows2', 'high'),
      query('cell3', 'elevated'),
      query('chart2', 'normal'),
    ];
    release();
    await Promise.all(posted);
    expect(ran()).toEqual([
      'running',
      'rows1',
      'rows2',
      'cell1',
      'cell2',
      'cell3',
      'chart1',
      'stats',
      'chart2',
    ]);
  });

  it('lets a row fetch run next behind a loop of 500 cell reads', async () => {
    const release = await holdQuery('running');
    const posted = [query('running', 'elevated')];
    for (let i = 0; i < 500; i++) posted.push(query(`cell${i}`, 'elevated'));
    posted.push(query('chart', 'normal'));
    // The user scrolls: TableBody posts the visible block.
    posted.push(query('block', 'high'));
    release();
    await Promise.all(posted);
    const order = ran();
    expect(order.slice(0, 3)).toEqual(['running', 'block', 'cell0']);
    expect(order.at(-1)).toBe('chart');
    expect(order.filter((id) => id.startsWith('cell'))).toEqual(
      Array.from({ length: 500 }, (_, i) => `cell${i}`),
    );
  });

  it('cancels a queued read as it cancels a normal query, the rest in order', async () => {
    const { executeQueryCancellable } = await duckdb();
    const release = await holdQuery('running');
    const posted = [
      query('running', undefined),
      query('cell1', 'elevated'),
      query('chart', undefined),
      query('cell2', 'elevated'),
    ];
    const cancels: Reply[] = [];
    await handleMessage(
      { id: 'c1', type: 'cancel', payload: { targetId: 'cell1' } } as WorkerMessage,
      (id, type, payload) => cancels.push({ id, type, payload }),
    );
    expect(cancels).toEqual([
      { id: 'c1', type: 'result', payload: { cancelled: true, reason: 'dequeued' } },
    ]);
    expect(replies).toContainEqual({
      id: 'cell1',
      type: 'error',
      payload: { message: 'Cancelled before execution', code: 'QUERY_CANCELLED' },
    });
    release();
    await Promise.all(posted);
    expect(ran()).toEqual(['running', 'cell2', 'chart']);
    expect(executeQueryCancellable).not.toHaveBeenCalledWith('cell1');
  });

  it('cancels a running read through the connection, as a normal query', async () => {
    const { __conn } = await duckdb();
    const release = await holdQuery('cell');
    const done = query('cell', 'elevated');
    const cancels: Reply[] = [];
    await handleMessage(
      { id: 'c1', type: 'cancel', payload: { targetId: 'cell' } } as WorkerMessage,
      (id, type, payload) => cancels.push({ id, type, payload }),
    );
    expect(__conn.cancelSent).toHaveBeenCalledTimes(1);
    expect(cancels).toEqual([{ id: 'c1', type: 'result', payload: { cancelled: true } }]);
    release();
    await done;
  });
});
