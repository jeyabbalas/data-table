import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatValueForJSON,
  formatRowForJSON,
  exportToJSON,
  exportJSONFromState,
} from '@/export/JSONExport';
import type { ExportContext } from '@/export/ExportQuery';
import type { ColumnSchema } from '@/core/types';

// =========================================
// formatValueForJSON Tests
// =========================================

describe('formatValueForJSON', () => {
  it('should return null for null', () => {
    expect(formatValueForJSON(null)).toBeNull();
  });

  it('should return null for undefined', () => {
    expect(formatValueForJSON(undefined)).toBeNull();
  });

  it('should preserve booleans', () => {
    expect(formatValueForJSON(true)).toBe(true);
    expect(formatValueForJSON(false)).toBe(false);
  });

  it('should preserve integers', () => {
    expect(formatValueForJSON(42)).toBe(42);
    expect(formatValueForJSON(0)).toBe(0);
    expect(formatValueForJSON(-10)).toBe(-10);
  });

  it('should preserve floats', () => {
    expect(formatValueForJSON(3.14)).toBe(3.14);
  });

  it('should return null for NaN', () => {
    expect(formatValueForJSON(NaN)).toBeNull();
  });

  it('should return null for Infinity', () => {
    expect(formatValueForJSON(Infinity)).toBeNull();
    expect(formatValueForJSON(-Infinity)).toBeNull();
  });

  it('should convert safe bigint to number', () => {
    expect(formatValueForJSON(42n)).toBe(42);
    expect(formatValueForJSON(0n)).toBe(0);
    expect(formatValueForJSON(-100n)).toBe(-100);
  });

  it('should convert unsafe bigint to string', () => {
    const big = 9007199254740993n; // Number.MAX_SAFE_INTEGER + 2
    expect(formatValueForJSON(big)).toBe('9007199254740993');
  });

  it('should convert Date to ISO string', () => {
    const date = new Date('2024-06-15T12:30:00.000Z');
    expect(formatValueForJSON(date)).toBe('2024-06-15T12:30:00.000Z');
  });

  it('should convert strings as-is', () => {
    expect(formatValueForJSON('hello')).toBe('hello');
    expect(formatValueForJSON('')).toBe('');
  });

  it('should convert other types to string', () => {
    expect(formatValueForJSON(Symbol.for('x'))).toBe('Symbol(x)');
  });
});

// =========================================
// formatRowForJSON Tests
// =========================================

describe('formatRowForJSON', () => {
  it('should pick requested columns', () => {
    const row = { id: 1, name: 'Alice', price: 9.99, extra: 'hidden' };
    const result = formatRowForJSON(row, ['id', 'name', 'price']);
    expect(result).toEqual({ id: 1, name: 'Alice', price: 9.99 });
    expect(result).not.toHaveProperty('extra');
  });

  it('should preserve column order', () => {
    const row = { b: 2, a: 1, c: 3 };
    const result = formatRowForJSON(row, ['c', 'a', 'b']);
    expect(Object.keys(result)).toEqual(['c', 'a', 'b']);
  });

  it('should handle null values', () => {
    const row = { id: 1, name: null, price: undefined };
    const result = formatRowForJSON(row, ['id', 'name', 'price']);
    expect(result).toEqual({ id: 1, name: null, price: null });
  });

  it('should convert NaN and Date in row', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const row = { val: NaN, dt: date };
    const result = formatRowForJSON(row, ['val', 'dt']);
    expect(result).toEqual({ val: null, dt: '2024-01-01T00:00:00.000Z' });
  });
});

// =========================================
// exportToJSON Integration Tests
// =========================================

describe('exportToJSON', () => {
  const schema: ColumnSchema[] = [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
    { name: 'active', type: 'boolean', nullable: false, originalType: 'BOOLEAN' },
  ];

  let mockBridge: { query: ReturnType<typeof vi.fn> };
  let baseContext: ExportContext;

  beforeEach(() => {
    mockBridge = { query: vi.fn() };
    baseContext = {
      bridge: mockBridge as unknown as import('@/data/WorkerBridge').WorkerBridge,
      filters: [],
      sortColumns: [],
      selectedRows: new Set(),
      visibleColumns: ['id', 'name', 'active'],
      columnOrder: ['id', 'name', 'active'],
      schema,
    };
  });

  it('should throw when tableName is empty', async () => {
    await expect(exportToJSON('', {}, baseContext)).rejects.toThrow('No table loaded');
  });

  describe('array format', () => {
    it('should export valid JSON array', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false },
      ]);

      const json = await exportToJSON('test', { format: 'array' }, baseContext);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual([
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false },
      ]);
    });

    it('should return [] for empty dataset', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const json = await exportToJSON('test', { format: 'array' }, baseContext);
      expect(json).toBe('[]');
    });

    it('should pretty-print when pretty is true', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'Alice', active: true },
      ]);

      const json = await exportToJSON('test', { format: 'array', pretty: true }, baseContext);

      expect(json).toContain('\n');
      expect(json).toMatch(/^\[\n {2}/); // starts with [\n  (2-space indent)
      expect(json).toMatch(/\n\]$/); // ends with \n]

      // Should still be valid JSON
      const parsed = JSON.parse(json);
      expect(parsed).toEqual([{ id: 1, name: 'Alice', active: true }]);
    });

    it('should produce compact output when pretty is false', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'A', active: true },
        { id: 2, name: 'B', active: false },
      ]);

      const json = await exportToJSON('test', { format: 'array', pretty: false }, baseContext);

      expect(json).not.toContain('\n');
      expect(JSON.parse(json)).toHaveLength(2);
    });

    it('should preserve native JSON types', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: null, active: true },
      ]);

      const json = await exportToJSON('test', { format: 'array' }, baseContext);
      const parsed = JSON.parse(json);

      expect(parsed[0].id).toBe(1);
      expect(parsed[0].name).toBeNull();
      expect(parsed[0].active).toBe(true);
    });

    it('should return [] for no columns', async () => {
      const context = { ...baseContext, visibleColumns: [] };
      const json = await exportToJSON('test', { format: 'array' }, context);
      expect(json).toBe('[]');
    });
  });

  describe('ndjson format', () => {
    it('should output one JSON object per line', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false },
      ]);

      const ndjson = await exportToJSON('test', { format: 'ndjson' }, baseContext);
      const lines = ndjson.split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual({ id: 1, name: 'Alice', active: true });
      expect(JSON.parse(lines[1])).toEqual({ id: 2, name: 'Bob', active: false });
    });

    it('should return empty string for empty dataset', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const ndjson = await exportToJSON('test', { format: 'ndjson' }, baseContext);
      expect(ndjson).toBe('');
    });

    it('should return empty string for no columns', async () => {
      const context = { ...baseContext, visibleColumns: [] };
      const ndjson = await exportToJSON('test', { format: 'ndjson' }, context);
      expect(ndjson).toBe('');
    });
  });

  describe('scope', () => {
    it('should not include WHERE for scope all', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const context = {
        ...baseContext,
        filters: [{ type: 'point' as const, column: 'name', value: 'Alice' }],
      };

      await exportToJSON('test', { scope: 'all' }, context);

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).not.toContain('WHERE');
    });

    it('should include WHERE for scope filtered', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const context = {
        ...baseContext,
        filters: [{ type: 'point' as const, column: 'name', value: 'Alice' }],
      };

      await exportToJSON('test', { scope: 'filtered' }, context);

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE');
    });

    it('should handle selected rows with CTE', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'Alice', active: true },
      ]);

      const context = {
        ...baseContext,
        selectedRows: new Set([0, 5]),
      };

      await exportToJSON('test', { scope: 'selected' }, context);

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('ROW_NUMBER');
      expect(sql).toContain('IN (0, 5)');
    });

    it('should return empty array for selected scope with no selection', async () => {
      const json = await exportToJSON('test', { scope: 'selected', format: 'array' }, baseContext);
      expect(json).toBe('[]');
      expect(mockBridge.query).not.toHaveBeenCalled();
    });

    it('should return empty string for selected scope ndjson with no selection', async () => {
      const json = await exportToJSON('test', { scope: 'selected', format: 'ndjson' }, baseContext);
      expect(json).toBe('');
      expect(mockBridge.query).not.toHaveBeenCalled();
    });
  });

  describe('column selection', () => {
    it('should export visible columns by default', async () => {
      mockBridge.query.mockResolvedValueOnce([{ id: 1, name: 'Alice' }]);

      const context = { ...baseContext, visibleColumns: ['id', 'name'] };
      const json = await exportToJSON('test', { format: 'array' }, context);
      const parsed = JSON.parse(json);

      expect(Object.keys(parsed[0])).toEqual(['id', 'name']);
    });

    it('should export all columns when columns is "all"', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'Alice', active: true },
      ]);

      const json = await exportToJSON('test', { columns: 'all', format: 'array' }, baseContext);
      const parsed = JSON.parse(json);

      expect(Object.keys(parsed[0])).toEqual(['id', 'name', 'active']);
    });

    it('should export specific columns', async () => {
      mockBridge.query.mockResolvedValueOnce([{ name: 'Alice' }]);

      const json = await exportToJSON('test', { columns: ['name'], format: 'array' }, baseContext);
      const parsed = JSON.parse(json);

      expect(Object.keys(parsed[0])).toEqual(['name']);
    });
  });

  describe('abort signal', () => {
    it('should throw when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        exportToJSON('test', {}, baseContext, controller.signal)
      ).rejects.toThrow('Export aborted');
    });
  });

  describe('batching', () => {
    it('should fetch multiple batches', async () => {
      const batch1 = Array.from({ length: 10000 }, (_, i) => ({
        id: i, name: `r${i}`, active: true,
      }));
      const batch2 = [{ id: 10000, name: 'last', active: false }];

      mockBridge.query
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2);

      const json = await exportToJSON('test', { format: 'array' }, baseContext);
      const parsed = JSON.parse(json);

      expect(mockBridge.query).toHaveBeenCalledTimes(2);
      expect(parsed).toHaveLength(10001);
    });
  });
});

// =========================================
// exportJSONFromState Tests
// =========================================

describe('exportJSONFromState', () => {
  it('should throw when tableName is null', async () => {
    const mockState = {
      tableName: { get: () => null },
    };

    await expect(
      exportJSONFromState(
        mockState as unknown as import('@/core/State').TableState,
        {} as unknown as import('@/data/WorkerBridge').WorkerBridge
      )
    ).rejects.toThrow('No table loaded');
  });

  it('should read signals and delegate to exportToJSON', async () => {
    const mockQuery = vi.fn().mockResolvedValueOnce([
      { id: 1, name: 'Alice' },
    ]);

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

    const mockBridge = { query: mockQuery };

    const json = await exportJSONFromState(
      mockState as unknown as import('@/core/State').TableState,
      mockBridge as unknown as import('@/data/WorkerBridge').WorkerBridge,
      { format: 'array' }
    );

    const parsed = JSON.parse(json);
    expect(parsed).toEqual([{ id: 1, name: 'Alice' }]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
