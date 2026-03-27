import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildParquetQuery,
  exportToParquet,
  exportParquetFromState,
} from '@/export/ParquetExport';
import type { ExportContext } from '@/export/ExportQuery';
import type { ColumnSchema } from '@/core/types';

// =========================================
// buildParquetQuery Tests
// =========================================

describe('buildParquetQuery', () => {
  const schema: ColumnSchema[] = [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
    { name: 'price', type: 'float', nullable: true, originalType: 'DOUBLE' },
  ];

  let baseContext: ExportContext;

  beforeEach(() => {
    baseContext = {
      bridge: {} as unknown as import('@/data/WorkerBridge').WorkerBridge,
      filters: [],
      sortColumns: [],
      selectedRows: new Set(),
      visibleColumns: ['id', 'name', 'price'],
      columnOrder: ['id', 'name', 'price'],
      schema,
    };
  });

  it('should build SELECT without WHERE or LIMIT for scope all', () => {
    const sql = buildParquetQuery(
      'test_table',
      ['id', 'name', 'price'],
      { scope: 'all', columns: 'visible' },
      baseContext
    );

    expect(sql).toBe('SELECT "id", "name", "price" FROM "test_table"');
    expect(sql).not.toContain('WHERE');
    expect(sql).not.toContain('LIMIT');
  });

  it('should include ORDER BY when sort is active', () => {
    const context = {
      ...baseContext,
      sortColumns: [{ column: 'name', direction: 'asc' as const }],
    };

    const sql = buildParquetQuery(
      'test_table',
      ['id', 'name'],
      { scope: 'all', columns: 'visible' },
      context
    );

    expect(sql).toContain('ORDER BY "name" ASC');
  });

  it('should include WHERE for scope filtered', () => {
    const context = {
      ...baseContext,
      filters: [{ type: 'range' as const, column: 'price', min: 10, max: 50 }],
    };

    const sql = buildParquetQuery(
      'test_table',
      ['id', 'name', 'price'],
      { scope: 'filtered', columns: 'visible' },
      context
    );

    expect(sql).toContain('WHERE');
    expect(sql).toContain('"price"');
    expect(sql).not.toContain('LIMIT');
  });

  it('should not include WHERE for scope all even with filters', () => {
    const context = {
      ...baseContext,
      filters: [{ type: 'point' as const, column: 'name', value: 'Alice' }],
    };

    const sql = buildParquetQuery(
      'test_table',
      ['id', 'name'],
      { scope: 'all', columns: 'visible' },
      context
    );

    expect(sql).not.toContain('WHERE');
  });

  it('should use WHERE FALSE for selected scope with no selection', () => {
    const sql = buildParquetQuery(
      'test_table',
      ['id', 'name'],
      { scope: 'selected', columns: 'visible' },
      baseContext
    );

    expect(sql).toContain('WHERE FALSE');
  });

  it('should use LIMIT/OFFSET for contiguous selected rows', () => {
    const context = {
      ...baseContext,
      selectedRows: new Set([3, 4, 5, 6]),
    };

    const sql = buildParquetQuery(
      'test_table',
      ['id', 'name'],
      { scope: 'selected', columns: 'visible' },
      context
    );

    expect(sql).toContain('LIMIT 4 OFFSET 3');
    expect(sql).not.toContain('ROW_NUMBER');
  });

  it('should use CTE with ROW_NUMBER for non-contiguous selected rows', () => {
    const context = {
      ...baseContext,
      selectedRows: new Set([0, 5, 10]),
    };

    const sql = buildParquetQuery(
      'test_table',
      ['id', 'name'],
      { scope: 'selected', columns: 'visible' },
      context
    );

    expect(sql).toContain('ROW_NUMBER');
    expect(sql).toContain('__row_idx__');
    expect(sql).toContain('IN (0, 5, 10)');
  });

  it('should include sort in ROW_NUMBER OVER for selected rows', () => {
    const context = {
      ...baseContext,
      selectedRows: new Set([0, 5]),
      sortColumns: [{ column: 'name', direction: 'desc' as const }],
    };

    const sql = buildParquetQuery(
      'test_table',
      ['id', 'name'],
      { scope: 'selected', columns: 'visible' },
      context
    );

    expect(sql).toContain('ROW_NUMBER() OVER(ORDER BY "name" DESC)');
  });

  it('should include filters in selected rows query', () => {
    const context = {
      ...baseContext,
      selectedRows: new Set([0, 5]),
      filters: [{ type: 'point' as const, column: 'name', value: 'Alice' }],
    };

    const sql = buildParquetQuery(
      'test_table',
      ['id', 'name'],
      { scope: 'selected', columns: 'visible' },
      context
    );

    expect(sql).toContain('WHERE');
    expect(sql).toContain('"name"');
  });
});

// =========================================
// exportToParquet Integration Tests
// =========================================

describe('exportToParquet', () => {
  const schema: ColumnSchema[] = [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  ];

  const dummyBuffer = new Uint8Array([80, 65, 82, 49]); // "PAR1" magic bytes

  let mockBridge: { exportToBuffer: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
  let baseContext: ExportContext;

  beforeEach(() => {
    mockBridge = {
      exportToBuffer: vi.fn().mockResolvedValue(dummyBuffer),
      query: vi.fn(),
    };
    baseContext = {
      bridge: mockBridge as unknown as import('@/data/WorkerBridge').WorkerBridge,
      filters: [],
      sortColumns: [],
      selectedRows: new Set(),
      visibleColumns: ['id', 'name'],
      columnOrder: ['id', 'name'],
      schema,
    };
  });

  it('should throw when tableName is empty', async () => {
    await expect(exportToParquet('', {}, baseContext)).rejects.toThrow('No table loaded');
  });

  it('should return empty Uint8Array for no columns', async () => {
    const context = { ...baseContext, visibleColumns: [] as string[] };
    const result = await exportToParquet('test', {}, context);
    expect(result).toEqual(new Uint8Array(0));
    expect(mockBridge.exportToBuffer).not.toHaveBeenCalled();
  });

  it('should call exportToBuffer with correct SQL for scope all', async () => {
    const result = await exportToParquet('test', { scope: 'all' }, baseContext);

    expect(result).toEqual(dummyBuffer);
    expect(mockBridge.exportToBuffer).toHaveBeenCalledTimes(1);

    const sql = mockBridge.exportToBuffer.mock.calls[0][0] as string;
    expect(sql).toContain('SELECT "id", "name" FROM "test"');
    expect(sql).not.toContain('WHERE');

    const format = mockBridge.exportToBuffer.mock.calls[0][1];
    expect(format).toBe('parquet');
  });

  it('should include WHERE for scope filtered', async () => {
    const context = {
      ...baseContext,
      filters: [{ type: 'point' as const, column: 'name', value: 'Alice' }],
    };

    await exportToParquet('test', { scope: 'filtered' }, context);

    const sql = mockBridge.exportToBuffer.mock.calls[0][0] as string;
    expect(sql).toContain('WHERE');
  });

  it('should use CTE for non-contiguous selected rows', async () => {
    const context = {
      ...baseContext,
      selectedRows: new Set([0, 5]),
    };

    await exportToParquet('test', { scope: 'selected' }, context);

    const sql = mockBridge.exportToBuffer.mock.calls[0][0] as string;
    expect(sql).toContain('ROW_NUMBER');
    expect(sql).toContain('IN (0, 5)');
  });

  it('should export empty result for selected with no rows', async () => {
    await exportToParquet('test', { scope: 'selected' }, baseContext);

    const sql = mockBridge.exportToBuffer.mock.calls[0][0] as string;
    expect(sql).toContain('WHERE FALSE');
  });

  it('should export all columns when columns is "all"', async () => {
    await exportToParquet('test', { columns: 'all' }, baseContext);

    const sql = mockBridge.exportToBuffer.mock.calls[0][0] as string;
    expect(sql).toContain('"id"');
    expect(sql).toContain('"name"');
  });

  it('should export specific columns', async () => {
    await exportToParquet('test', { columns: ['name'] }, baseContext);

    const sql = mockBridge.exportToBuffer.mock.calls[0][0] as string;
    expect(sql).toContain('"name"');
    expect(sql).not.toContain('"id"');
  });

  it('should throw when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      exportToParquet('test', {}, baseContext, controller.signal)
    ).rejects.toThrow('Export aborted');
  });

  it('should pass signal to exportToBuffer', async () => {
    const controller = new AbortController();

    await exportToParquet('test', {}, baseContext, controller.signal);

    expect(mockBridge.exportToBuffer).toHaveBeenCalledWith(
      expect.any(String),
      'parquet',
      controller.signal
    );
  });
});

// =========================================
// exportParquetFromState Tests
// =========================================

describe('exportParquetFromState', () => {
  it('should throw when tableName is null', async () => {
    const mockState = {
      tableName: { get: () => null },
    };

    await expect(
      exportParquetFromState(
        mockState as unknown as import('@/core/State').TableState,
        {} as unknown as import('@/data/WorkerBridge').WorkerBridge
      )
    ).rejects.toThrow('No table loaded');
  });

  it('should read signals and delegate to exportToParquet', async () => {
    const dummyBuffer = new Uint8Array([1, 2, 3]);
    const mockExportToBuffer = vi.fn().mockResolvedValue(dummyBuffer);

    const mockState = {
      tableName: { get: () => 'my_table' },
      filters: { get: () => [] },
      sortColumns: { get: () => [] },
      selectedRows: { get: () => new Set<number>() },
      visibleColumns: { get: () => ['id', 'name'] },
      columnOrder: { get: () => ['id', 'name'] },
      schema: {
        get: () => [
          { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
          { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
        ],
      },
    };

    const mockBridge = { exportToBuffer: mockExportToBuffer, query: vi.fn() };

    const result = await exportParquetFromState(
      mockState as unknown as import('@/core/State').TableState,
      mockBridge as unknown as import('@/data/WorkerBridge').WorkerBridge,
      { scope: 'all' }
    );

    expect(result).toEqual(dummyBuffer);
    expect(mockExportToBuffer).toHaveBeenCalledTimes(1);
    const sql = mockExportToBuffer.mock.calls[0][0] as string;
    expect(sql).toContain('FROM "my_table"');
  });
});
