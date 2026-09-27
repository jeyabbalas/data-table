/**
 * The pure half of the Parquet memory check: per-type costs, memory-size
 * parsing, and the read-mode decision. The decision cases replay files
 * measured in Chromium (docs/dev/memory-envelope.md), with the outcome each
 * read mode actually had.
 */
import { describe, expect, it } from 'vitest';

import {
  estimateTableBytes,
  isOutOfMemoryError,
  memoryExceededError,
  parseMemorySize,
  planParquetRead,
  type MemoryBudget,
  type ParquetFootprint,
  valueWidth,
} from '@/worker/loaders/memoryBudget';

const MiB = 2 ** 20;
const GiB = 2 ** 30;

describe('valueWidth', () => {
  it.each([
    ['BOOLEAN', 1],
    ['SMALLINT', 2],
    ['INTEGER', 4],
    ['DATE', 4],
    ['BIGINT', 8],
    ['DOUBLE', 8],
    ['TIMESTAMP', 8],
    ['TIMESTAMP WITH TIME ZONE', 8],
    ['DECIMAL(18,3)', 8],
    ['DECIMAL(38,2)', 16],
    ['HUGEINT', 16],
    ['INTERVAL', 16],
    ['UUID', 16],
  ])('%s is %d bytes', (type, bytes) => {
    expect(valueWidth(type)).toBe(bytes);
  });

  it('sizes text as an offset plus its average length', () => {
    expect(valueWidth('VARCHAR', 30)).toBe(34);
    expect(valueWidth('BLOB', 100)).toBe(104);
  });

  it('gives nested types a flat width', () => {
    expect(valueWidth('BIGINT[]')).toBe(40);
    expect(valueWidth('STRUCT(a INTEGER, b DOUBLE)')).toBe(40);
    expect(valueWidth('MAP(VARCHAR, INTEGER)')).toBe(40);
  });
});

describe('estimateTableBytes', () => {
  // DuckDB's accounting for 10 columns × 1M rows of one type (duckdb_memory()).
  it.each([
    ['BOOLEAN', 1, 4.72],
    ['INTEGER', 4, 6.83],
    ['BIGINT', 8, 11.03],
    ['HUGEINT', 16, 19.7],
    ['VARCHAR of 8 bytes', 12, 15.24],
    ['VARCHAR of 30 bytes', 34, 36.73],
  ])('%s: within 1%% of the measured %d-byte slot', (_label, width, measuredPerCell) => {
    const estimate = estimateTableBytes(1_000_000, Array(10).fill(width)) / 10_000_000;
    expect(estimate / measuredPerCell).toBeGreaterThan(0.99);
    expect(estimate / measuredPerCell).toBeLessThan(1.01);
  });

  it('charges a partly filled row group whole blocks', () => {
    // One 8-byte column, one row: a block for values and one for validity.
    expect(estimateTableBytes(1, [8])).toBe(2 * 256 * 1024);
    expect(estimateTableBytes(0, [8])).toBe(0);
  });
});

describe('parseMemorySize', () => {
  it.each([
    ['3.1 GiB', 3.1 * GiB],
    ['512.0 MiB', 512 * MiB],
    ['2GB', 2e9],
    ['1000 bytes', 1000],
    ['42', 42],
  ])('%s', (text, bytes) => {
    expect(parseMemorySize(text)).toBe(bytes);
  });

  it('rejects text it cannot read', () => {
    expect(parseMemorySize('unlimited')).toBeNull();
    expect(parseMemorySize('3.1 PiB')).toBeNull();
  });
});

describe('planParquetRead', () => {
  // DuckDB-WASM's default memory_limit, and nothing loaded yet.
  const fresh: MemoryBudget = { limitBytes: 3.1 * GiB, usedBytes: 0 };

  /**
   * gen.py's 1,000-column mix, per 20 columns: 12 doubles, 3 integers, 3
   * eight-byte strings, a timestamp and a boolean. Plus __rowid__.
   */
  const MIX = [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 4, 4, 4, 12, 12, 12, 8, 1];
  const WIDE_WIDTHS = [8, ...Array.from({ length: 50 }, () => MIX).flat()];

  function wide(rows: number, rowGroupMiB: number, fileMiB: number): ParquetFootprint {
    return {
      rows,
      columns: 1001,
      tableBytes: estimateTableBytes(rows, WIDE_WIDTHS),
      largestRowGroupBytes: rowGroupMiB * MiB,
      fileBytes: fileMiB * MiB,
    };
  }

  it('estimates the measured wide tables within 5%', () => {
    // DuckDB's accounting after the library loaded each file in Chromium.
    expect(wide(50_000, 370, 370).tableBytes / (756 * MiB)).toBeGreaterThan(0.95);
    expect(wide(200_000, 898, 1464).tableBytes / (2259 * MiB)).toBeGreaterThan(0.95);
  });

  it('prefetches when a row group fits beside the table (50K × 1,000: fast path measured at 1.7 GiB)', () => {
    expect(planParquetRead(wide(50_000, 370, 370), fresh, true)).toBe('prefetch');
  });

  it('reads the 1.5 GB 200K × 1,000 file lazily: its 898 MiB first row group crowds the ceiling', () => {
    // Prefetching fit in practice (3.6 GiB peak), but the estimate is an
    // upper bound and lands 7 MiB over 4 GiB, so the load takes the slower
    // path (28 s instead of 10 s) rather than risk running out.
    expect(planParquetRead(wide(200_000, 898, 1464), fresh, true)).toBe('lazy');
  });

  it('prefetches 200K × 1,000 when the row groups are half that size', () => {
    expect(planParquetRead(wide(200_000, 449, 1464), fresh, true)).toBe('prefetch');
  });

  it('reads 250K × 1,000 lazily: prefetching would not fit (lazy peak measured at 3.6 GiB)', () => {
    expect(planParquetRead(wide(250_000, 898, 1830), fresh, true)).toBe('lazy');
  });

  it('rejects 300K × 1,000, which ran DuckDB out of memory', () => {
    expect(planParquetRead(wide(300_000, 898, 2196), fresh, true)).toBeNull();
  });

  it('counts the file against the budget when it is already a buffer', () => {
    // Buffer loads measured: 150K fits (3.6 GiB peak), 200K ran out.
    expect(planParquetRead(wide(150_000, 898, 1098), fresh, false)).toBe('buffered');
    expect(planParquetRead(wide(200_000, 898, 1464), fresh, false)).toBeNull();
  });

  it('leaves room for tables that are already loaded', () => {
    const footprint = wide(100_000, 370, 740);
    expect(planParquetRead(footprint, fresh, true)).toBe('prefetch');
    expect(planParquetRead(footprint, { ...fresh, usedBytes: 2 * GiB }, true)).toBeNull();
  });

  it('prefetches a deep, narrow file (1M × 40: fast path measured at 537 MiB)', () => {
    const deep: ParquetFootprint = {
      rows: 1_000_000,
      columns: 41,
      tableBytes: estimateTableBytes(1_000_000, [8, ...MIX, ...MIX]),
      largestRowGroupBytes: 33 * MiB,
      fileBytes: 293 * MiB,
    };
    // DuckDB reported 419 MiB for this table.
    expect(deep.tableBytes / (419 * MiB)).toBeCloseTo(1, 1);
    expect(planParquetRead(deep, fresh, true)).toBe('prefetch');
  });
});

describe('isOutOfMemoryError', () => {
  it('recognizes DuckDB out-of-memory errors, directly or as a cause', () => {
    const oom = new Error('Out of Memory Error: could not allocate block of size 256.0 KiB');
    expect(isOutOfMemoryError(oom)).toBe(true);
    expect(isOutOfMemoryError(new Error('Failed to convert columns', { cause: oom }))).toBe(true);
    expect(isOutOfMemoryError('Out of Memory Error: Allocation failure')).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isOutOfMemoryError(new Error('Binder Error: column not found'))).toBe(false);
    expect(isOutOfMemoryError(undefined)).toBe(false);
  });
});

describe('memoryExceededError', () => {
  const footprint: ParquetFootprint = {
    rows: 300_000,
    columns: 1001,
    tableBytes: 3 * GiB,
    largestRowGroupBytes: 731 * MiB,
    fileBytes: 2 * GiB,
  };

  it('carries the code and the numbers behind the decision', () => {
    const error = memoryExceededError({
      footprint,
      budget: { limitBytes: 3.1 * GiB, usedBytes: 0 },
      stage: 'estimate',
      buffered: false,
    }) as Error & { code: string; details: Record<string, unknown> };
    expect(error.code).toBe('LOAD_MEMORY_EXCEEDED');
    expect(error.details).toEqual({
      stage: 'estimate',
      rows: 300_000,
      columns: 1000,
      estimatedBytes: 3 * GiB,
      memoryLimitBytes: Math.round(3.1 * GiB),
      usedBytes: 0,
    });
    expect(error.message).toBe(
      'Not enough memory to load this Parquet file: its 300,000 rows × 1,000 columns need ' +
        'about 3.0 GiB once loaded, and about 3.1 GiB is free. Load fewer rows or columns.',
    );
  });

  it('names memory held by loaded tables, and suggests a File for buffers', () => {
    const error = memoryExceededError({
      footprint,
      budget: { limitBytes: 3.1 * GiB, usedBytes: 1.2 * GiB },
      stage: 'estimate',
      buffered: true,
    });
    expect(error.message).toContain('Tables already loaded use 1.2 GiB.');
    expect(error.message).toContain('as a File, Blob or URL instead of an ArrayBuffer');
  });

  it('keeps the DuckDB error as the cause when the engine ran out mid-load', () => {
    const cause = new Error('Out of Memory Error: Allocation failure');
    const error = memoryExceededError(
      {
        footprint,
        budget: { limitBytes: 3.1 * GiB, usedBytes: 0 },
        stage: 'load',
        buffered: false,
      },
      cause,
    );
    expect(error.message).toMatch(/^Ran out of memory loading this Parquet file/);
    expect(error.cause).toBe(cause);
  });
});
