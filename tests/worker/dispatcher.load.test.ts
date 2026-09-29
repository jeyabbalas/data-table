/**
 * The dispatcher hands each loader the options for its own format, the
 * table name and the time zone, and nothing meant for another format.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetDispatcherForTests, handleMessage } from '@/worker/dispatcher';
import { loadCSV } from '@/worker/loaders/csv';
import { loadJSON } from '@/worker/loaders/json';
import { loadParquet } from '@/worker/loaders/parquet';
import type { LoadPayload, WorkerMessage } from '@/worker/types';

vi.mock('@/worker/duckdb', () => ({
  initializeDuckDB: vi.fn(() => Promise.resolve()),
  executeQuery: vi.fn(() => Promise.resolve([])),
  executeQueryCancellable: vi.fn(() => Promise.resolve([])),
  getConnection: vi.fn(() => ({ cancelSent: vi.fn(() => Promise.resolve(true)) })),
  getDatabase: vi.fn(() => ({})),
  isInitialized: vi.fn(() => true),
}));

const RESULT = { tableName: 't', rowCount: 0, columns: [], schema: [] };
vi.mock('@/worker/loaders/csv', () => ({ loadCSV: vi.fn(() => Promise.resolve(RESULT)) }));
vi.mock('@/worker/loaders/json', () => ({ loadJSON: vi.fn(() => Promise.resolve(RESULT)) }));
vi.mock('@/worker/loaders/parquet', () => ({
  loadParquet: vi.fn(() => Promise.resolve(RESULT)),
}));

const OPTIONS = {
  timezone: 'Europe/Paris',
  csv: { delimiter: ';', header: false, sampleSize: -1, skip: 2, nullValues: ['NA'] },
  json: { format: 'ndjson', sampleSize: 10, maxDepth: 2 },
  parquet: { columns: ['b', 'a'] },
} satisfies Omit<LoadPayload, 'data' | 'format'>;

async function dispatchLoad(payload: LoadPayload): Promise<void> {
  const message: WorkerMessage = { id: 'load-1', type: 'load', payload };
  await handleMessage(structuredClone(message), () => {});
}

describe('worker dispatcher — load options', () => {
  beforeEach(() => {
    __resetDispatcherForTests();
    vi.clearAllMocks();
  });

  it('gives the CSV loader its options, the table name and the time zone', async () => {
    await dispatchLoad({ data: 'a;b\n1;2', format: 'csv', tableName: 'people', ...OPTIONS });
    expect(loadCSV).toHaveBeenCalledWith('a;b\n1;2', {
      ...OPTIONS.csv,
      tableName: 'people',
      timezone: 'Europe/Paris',
    });
  });

  it('gives the JSON loader its options, the table name and the time zone', async () => {
    await dispatchLoad({ data: '{"a":1}', format: 'json', tableName: 'events', ...OPTIONS });
    expect(loadJSON).toHaveBeenCalledWith('{"a":1}', {
      ...OPTIONS.json,
      tableName: 'events',
      timezone: 'Europe/Paris',
    });
  });

  it('gives the Parquet loader its options, the table name and the time zone', async () => {
    const data = new ArrayBuffer(8);
    await dispatchLoad({ data, format: 'parquet', tableName: 'trips', ...OPTIONS });
    expect(loadParquet).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
      ...OPTIONS.parquet,
      tableName: 'trips',
      timezone: 'Europe/Paris',
    });
  });

  it('passes no options when the load has none', async () => {
    await dispatchLoad({ data: 'a\n1', format: 'csv' });
    expect(loadCSV).toHaveBeenCalledWith('a\n1', { tableName: undefined, timezone: undefined });
  });
});
