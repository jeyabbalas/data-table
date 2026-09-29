/**
 * The pure half of the Parquet memory check: per-type costs, memory-size
 * parsing, and the read-mode decision. The decision cases replay files
 * measured in Chromium (docs/dev/memory-envelope.md), with the outcome each
 * read mode actually had.
 */
import { describe, expect, it } from 'vitest';

import {
  estimateTableBytes,
  firstSegmentBytes,
  fitParquetRead,
  isOutOfMemoryError,
  measureParquetFootprint,
  memoryExceededError,
  parseMemorySize,
  planParquetRead,
  scanBytesPerColumn,
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

  // DuckDB's accounting per column for short tables of one type
  // (duckdb_memory(), 50 columns, DuckDB 1.5.4). A column starts with a
  // one-vector segment and takes whole blocks only once it fills.
  it.each([
    ['DOUBLE', 8, 1, 21.7],
    ['DOUBLE', 8, 2048, 22.2],
    ['DOUBLE', 8, 2049, 278.2],
    ['DOUBLE', 8, 16_385, 534.2],
    ['DOUBLE', 8, 100_000, 1046.2],
    ['DOUBLE', 8, 122_880, 1302.2],
    ['DOUBLE', 8, 122_980, 1818.3],
    ['INTEGER', 4, 2048, 14.2],
    ['BOOLEAN', 1, 2048, 7.8],
    ['VARCHAR', 12, 2048, 38.2],
    ['VARCHAR', 34, 2048, 294.3],
    ['VARCHAR', 34, 10_000, 550.3],
  ])(
    '%s of %d bytes × %d rows: the measured %d KiB, within 3%',
    (type, width, rows, measuredKiB) => {
      const estimate = estimateTableBytes(rows, [width], [firstSegmentBytes(type, width)]) / 1024;
      expect(estimate / measuredKiB).toBeGreaterThan(0.97);
      expect(estimate / measuredKiB).toBeLessThan(1.03);
    },
  );

  it('sizes the first segment for one vector of values or text references', () => {
    expect(firstSegmentBytes('DOUBLE', 8)).toBe(2048 * 8);
    expect(firstSegmentBytes('BOOLEAN', 1)).toBe(2048);
    // Text holds 16-byte references there, whatever its length.
    expect(firstSegmentBytes('VARCHAR', 34)).toBe(2048 * 16);
    expect(firstSegmentBytes('INTEGER[]', 40)).toBe(2048 * 16);
    expect(estimateTableBytes(0, [8])).toBe(0);
  });
});

describe('scanBytesPerColumn', () => {
  it('charges a base plus the column chunk, up to the ~1 MiB measured for full row groups', () => {
    expect(scanBytesPerColumn(0)).toBe(384 * 1024);
    expect(scanBytesPerColumn(78 * 1024)).toBe((384 + 78) * 1024);
    // Chunks of 122,880 doubles (~0.94 MiB) and larger keep the cap.
    expect(scanBytesPerColumn(960 * 1024)).toBe(0.95 * MiB);
    expect(scanBytesPerColumn(8 * MiB)).toBe(0.95 * MiB);
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

  /** Scan memory for `columns` file columns of `chunkBytes` each, plus __rowid__. */
  function scan(columns: number, chunkBytes: number): number {
    return columns * scanBytesPerColumn(chunkBytes) + scanBytesPerColumn(0);
  }

  function wide(rows: number, rowGroupMiB: number, fileMiB: number): ParquetFootprint {
    return {
      rows,
      columns: 1001,
      tableBytes: estimateTableBytes(rows, WIDE_WIDTHS),
      // Random data: a column chunk is about its share of the row group.
      scanBytes: scan(1000, (rowGroupMiB * MiB) / 1000),
      largestRowGroupBytes: rowGroupMiB * MiB,
      fileBytes: fileMiB * MiB,
    };
  }

  /**
   * `rows` × 3,000 random doubles, as measureParquetFootprint sees them: the
   * largest column chunk and file sizes are from the Parquet files DuckDB
   * wrote for these shapes.
   */
  function short3000(rows: number, chunkKiB: number, fileMiB: number): ParquetFootprint {
    const widths = Array<number>(3001).fill(8);
    return {
      rows,
      columns: 3001,
      tableBytes: estimateTableBytes(
        rows,
        widths,
        widths.map((w) => firstSegmentBytes('DOUBLE', w)),
      ),
      scanBytes: scan(3000, chunkKiB * 1024),
      largestRowGroupBytes: fileMiB * MiB,
      fileBytes: fileMiB * MiB,
    };
  }

  it('estimates short, wide tables within 5% of what DuckDB reports', () => {
    // duckdb_memory() after loading each file with __rowid__ (Node, DuckDB 1.5.4).
    expect(short3000(5, 0.1, 0.4).tableBytes / (64.5 * MiB)).toBeCloseTo(1, 1);
    expect(short3000(10_000, 78.2, 226.4).tableBytes / (814.7 * MiB)).toBeCloseTo(1, 1);
  });

  it('loads short, wide files that whole-block estimates refused (5 and 10K rows × 3,000)', () => {
    // Both loaded before #120; peak WebAssembly memory measured at 515 and
    // 1,828 MiB (buffered, the file included).
    expect(planParquetRead(short3000(5, 0.1, 0.4), fresh, true)).toBe('prefetch');
    expect(planParquetRead(short3000(5, 0.1, 0.4), fresh, false)).toBe('buffered');
    expect(planParquetRead(short3000(10_000, 78.2, 226.4), fresh, true)).toBe('prefetch');
    expect(planParquetRead(short3000(10_000, 78.2, 226.4), fresh, false)).toBe('buffered');
  });

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
    // About 1.0 GiB once loaded (DuckDB reports 1,046 KiB per double column
    // at 100K rows), so it fits beside 2 GiB of tables but not 2.2 GiB.
    const footprint = wide(100_000, 370, 740);
    expect(planParquetRead(footprint, fresh, true)).toBe('prefetch');
    expect(planParquetRead(footprint, { ...fresh, usedBytes: 2 * GiB }, true)).toBe('lazy');
    expect(planParquetRead(footprint, { ...fresh, usedBytes: 2.2 * GiB }, true)).toBeNull();
  });

  it('prefetches a deep, narrow file (1M × 40: fast path measured at 537 MiB)', () => {
    const deep: ParquetFootprint = {
      rows: 1_000_000,
      columns: 41,
      tableBytes: estimateTableBytes(1_000_000, [8, ...MIX, ...MIX]),
      scanBytes: scan(40, (33 * MiB) / 40),
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
    scanBytes: 0.95 * 1001 * MiB,
    largestRowGroupBytes: 731 * MiB,
    fileBytes: 2 * GiB,
  };
  const fresh: MemoryBudget = { limitBytes: 3.1 * GiB, usedBytes: 0 };
  type WithDetails = Error & { code: string; details: Record<string, unknown> };

  it('names the table-share check and its numbers', () => {
    const plan = fitParquetRead(footprint, fresh, true);
    expect(plan.failure?.check).toBe('table');
    const error = memoryExceededError({
      footprint,
      budget: fresh,
      stage: 'estimate',
      failure: plan.failure!,
      buffered: false,
    }) as WithDetails;
    expect(error.code).toBe('LOAD_MEMORY_EXCEEDED');
    expect(error.details).toEqual({
      stage: 'estimate',
      check: 'table',
      rows: 300_000,
      columns: 1000,
      estimatedBytes: 3 * GiB,
      neededBytes: 3 * GiB,
      availableBytes: Math.round(3.1 * GiB * 0.95),
      memoryLimitBytes: Math.round(3.1 * GiB),
      usedBytes: 0,
    });
    expect(error.message).toBe(
      'Not enough memory to load this Parquet file: its 300,000 rows × 1,000 columns need ' +
        'about 3.0 GiB once loaded, more than the 2.9 GiB a new table may take (95% of the ' +
        '3.1 GiB DuckDB has free). Load fewer rows or columns.',
    );
  });

  it('names the peak check and what makes up the peak', () => {
    // A table that fits its share, with decoding that pushes the peak past 4 GiB.
    const wideShort = { ...footprint, tableBytes: 1.5 * GiB, scanBytes: 2.8 * GiB };
    const plan = fitParquetRead(wideShort, fresh, true);
    expect(plan.failure?.check).toBe('peak');
    const error = memoryExceededError({
      footprint: wideShort,
      budget: fresh,
      stage: 'estimate',
      failure: plan.failure!,
      buffered: false,
    }) as WithDetails;
    expect(error.details).toMatchObject({
      check: 'peak',
      neededBytes: Math.round(1.5 * GiB + 2.8 * GiB + 64 * MiB),
      availableBytes: 4 * GiB,
    });
    expect(error.message).toBe(
      'Not enough memory to load this Parquet file: loading its 300,000 rows × 1,000 columns ' +
        'would peak at about 4.4 GiB (1.5 GiB for the table, 2.9 GiB to decode the file), more ' +
        "than the 4.0 GiB left of WebAssembly's 4 GiB. Load fewer rows or columns.",
    );
  });

  it('names memory held by loaded tables, and suggests a File for buffers', () => {
    const budget = { limitBytes: 3.1 * GiB, usedBytes: 1.2 * GiB };
    const error = memoryExceededError({
      footprint,
      budget,
      stage: 'estimate',
      failure: fitParquetRead(footprint, budget, false).failure!,
      buffered: true,
    });
    expect(error.message).toContain('Tables already loaded use 1.2 GiB.');
    expect(error.message).toContain('as a File, Blob or URL instead of an ArrayBuffer');
  });

  it("carries DuckDB's message in details and the message when the engine ran out mid-load", () => {
    const duckdb = new Error(
      'Out of Memory Error: could not allocate block of size 256.0 KiB (274.9 MiB/275.0 MiB used)\n\n' +
        'Database is launched in in-memory mode and no temporary directory is specified.',
    );
    // As enhanceSchemaTypes throws it: DuckDB's error wrapped as the cause.
    const cause = new Error('Failed to convert columns to date in table t', { cause: duckdb });
    const error = memoryExceededError(
      { footprint, budget: fresh, stage: 'load', buffered: false },
      cause,
    ) as WithDetails;
    expect(error.message).toBe(
      'Ran out of memory loading this Parquet file (300,000 rows × 1,000 columns, about 3.0 GiB ' +
        'once loaded). DuckDB: Out of Memory Error: could not allocate block of size 256.0 KiB ' +
        '(274.9 MiB/275.0 MiB used). Load fewer rows or columns.',
    );
    expect(error.details).toMatchObject({ stage: 'load', duckdbMessage: duckdb.message });
    expect(error.details).not.toHaveProperty('check');
    expect(error.cause).toBe(cause);
  });
});

describe('measureParquetFootprint with a projection', () => {
  /** A connection that answers the estimate's queries and records them. */
  function fakeConnection(schema: Record<string, unknown>[]) {
    const sql: string[] = [];
    const conn = {
      query: (query: string) => {
        sql.push(query);
        const rows = query.includes('parquet_schema')
          ? schema
          : query.includes('parquet_file_metadata')
            ? [{ num_rows: 10, file_size_bytes: 1000 }]
            : [{ bytes: 100 }];
        return Promise.resolve({ toArray: () => rows.map((row) => ({ toJSON: () => row })) });
      },
    };
    return { conn: conn as unknown as Parameters<typeof measureParquetFootprint>[0], sql };
  }

  const DESCRIBE = [{ column_name: 'b', column_type: 'DOUBLE' }];
  const chunkQuery = (sql: string[]) => sql.find((q) => q.includes('GROUP BY column_id'));

  it("reads only the projected columns' chunks", async () => {
    const { conn, sql } = fakeConnection([
      { name: 'duckdb_schema', num_children: 2 },
      { name: 'a', num_children: null },
      { name: 'b', num_children: null },
    ]);
    await measureParquetFootprint(conn, 'f.parquet', DESCRIBE, ['b']);
    expect(chunkQuery(sql)).toContain('column_id IN (1)');
  });

  it('counts every column when the schema listing does not add up', async () => {
    // One node more than the root's children account for.
    const { conn, sql } = fakeConnection([
      { name: 'duckdb_schema', num_children: 1 },
      { name: 'a', num_children: null },
      { name: 'b', num_children: null },
    ]);
    await measureParquetFootprint(conn, 'f.parquet', DESCRIBE, ['a']);
    expect(chunkQuery(sql)).not.toContain('column_id IN');
  });
});
