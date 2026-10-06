/**
 * Export batches skip the bridge's query cache.
 *
 * A batch is up to 10,000 rows, and a nested column's value arrives as its
 * JSON text (some 15,000 characters for a FLOAT[768]): cached, an export's
 * batches stayed in memory until the next filter, sort or derived-column
 * change. A real WorkerBridge over a mock worker answers every query, so
 * the posted messages tell whether a batch was served from the cache, or
 * stored in it.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ColumnSchema } from '@/core/types';
import { WorkerBridge } from '@/data/WorkerBridge';
import { exportToCSV } from '@/export/CSVExport';
import type { ExportContext } from '@/export/ExportQuery';
import { exportToJSON } from '@/export/JSONExport';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

const SCHEMA: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'emb', type: 'nested', nullable: true, originalType: 'FLOAT[768]' },
];

describe('export batches and the query cache', () => {
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;
  const queryPosts = () => mock.posted.filter((m) => m.type === 'query');

  function context(overrides: Partial<ExportContext> = {}): ExportContext {
    return {
      bridge,
      filters: [{ type: 'range', column: 'id', min: 0, max: 10 }],
      sortColumns: [{ column: 'id', direction: 'desc' }],
      selectedRows: new Set<number>(),
      columnOrder: ['id', 'emb'],
      schema: SCHEMA,
      ...overrides,
    };
  }

  beforeEach(async () => {
    mock = createMockWorker({
      onMessage: (msg) =>
        msg.type === 'query'
          ? { id: msg.id, type: 'result', payload: { rows: [{ id: 1, emb: '[0.5]' }] } }
          : undefined,
    });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
  });

  afterEach(() => {
    bridge.terminate();
  });

  it.each([
    ['CSV, all rows', () => exportToCSV('t', { scope: 'all' }, context())],
    ['CSV, filtered rows', () => exportToCSV('t', { scope: 'filtered' }, context())],
    [
      'CSV, one run of selected rows (the clipboard copies so)',
      () => exportToCSV('t', { scope: 'selected' }, context({ selectedRows: new Set([2, 3]) })),
    ],
    [
      'CSV, selected rows that are not one run',
      () => exportToCSV('t', { scope: 'selected' }, context({ selectedRows: new Set([0, 5]) })),
    ],
    ['JSON, all rows', () => exportToJSON('t', { scope: 'all' }, context())],
    [
      'NDJSON, selected rows',
      () =>
        exportToJSON(
          't',
          { scope: 'selected', format: 'ndjson' },
          context({ selectedRows: new Set([1, 4]) }),
        ),
    ],
  ])('%s: neither served from it nor kept in it', async (_, run) => {
    await run();
    const first = queryPosts().map((m) => (m.payload as { sql: string }).sql);
    expect(first.length).toBeGreaterThan(0);

    // The same export again queries the worker again...
    await run();
    expect(queryPosts()).toHaveLength(first.length * 2);
    // ...and so does the same SQL through the cache: no batch was stored.
    for (const sql of first) await bridge.query(sql);
    expect(queryPosts()).toHaveLength(first.length * 3);
  });
});
