/**
 * A Parquet load with `columns` hands them to the memory estimate, whose
 * scan and prefetch figures then count only those columns (see
 * memoryBudget.duckdb.test.ts); a load of every column hands none.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { measureParquetFootprint } from '@/worker/loaders/memoryBudget';
import { loadParquet } from '@/worker/loaders/parquet';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { readBinaryFixture } from '../../helpers/fixtures';

vi.mock('@/worker/loaders/memoryBudget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/worker/loaders/memoryBudget')>();
  return { ...actual, measureParquetFootprint: vi.fn(actual.measureParquetFootprint) };
});

describe('Parquet loader — the projection reaches the memory estimate', () => {
  let harness: NodeDuckDBHarness;
  const ctx = () => ({ db: harness.db, conn: harness.conn });

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('passes the columns loaded, and nothing for a load of every column', async () => {
    const estimate = vi.mocked(measureParquetFootprint);
    const data = await readBinaryFixture('parquet', 'titanic');

    await loadParquet(data.slice(0), { tableName: 'proj_some', columns: ['Name', 'Age'] }, ctx());
    expect(estimate.mock.calls.at(-1)?.[3]).toEqual(['Name', 'Age']);

    await loadParquet(data.slice(0), { tableName: 'proj_all' }, ctx());
    expect(estimate.mock.calls.at(-1)?.[3]).toBeUndefined();
  }, 30_000);
});
