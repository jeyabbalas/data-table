import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escapeCSVField,
  formatCellValue,
  neutralizeFormulaPrefix,
  resolveColumns,
  rowToCSVLine,
  isContiguousRange,
  exportToCSV,
  exportFromState,
} from '@/export/CSVExport';
import type { ExportContext, ExportOptions } from '@/export/CSVExport';
import type { ColumnSchema, SortColumn, Filter } from '@/core/types';

// =========================================
// escapeCSVField Tests
// =========================================

describe('escapeCSVField', () => {
  it('should return plain string unchanged', () => {
    expect(escapeCSVField('hello', ',')).toBe('hello');
  });

  it('should return empty string unchanged', () => {
    expect(escapeCSVField('', ',')).toBe('');
  });

  it('should wrap field containing delimiter in quotes', () => {
    expect(escapeCSVField('hello, world', ',')).toBe('"hello, world"');
  });

  it('should wrap field containing double quote and escape it', () => {
    expect(escapeCSVField('say "hi"', ',')).toBe('"say ""hi"""');
  });

  it('should wrap field containing newline', () => {
    expect(escapeCSVField('line1\nline2', ',')).toBe('"line1\nline2"');
  });

  it('should wrap field containing carriage return', () => {
    expect(escapeCSVField('line1\rline2', ',')).toBe('"line1\rline2"');
  });

  it('should handle field with delimiter, quotes, and newlines', () => {
    expect(escapeCSVField('a,"b"\nc', ',')).toBe('"a,""b""\nc"');
  });

  it('should handle tab delimiter', () => {
    expect(escapeCSVField('col1\tcol2', '\t')).toBe('"col1\tcol2"');
    expect(escapeCSVField('no tab', '\t')).toBe('no tab');
  });

  it('should handle semicolon delimiter', () => {
    expect(escapeCSVField('a;b', ';')).toBe('"a;b"');
    expect(escapeCSVField('a,b', ';')).toBe('a,b');
  });
});

// =========================================
// neutralizeFormulaPrefix — CSV-injection lock (Phase 7)
// =========================================
//
// Phase 1 audited the implementation; Phase 7 locks every prefix in
// FORMULA_TRIGGER_PREFIXES against regression. A spreadsheet (Excel,
// LibreOffice Calc, Google Sheets) treats a leading `=`, `+`, `-`, `@`,
// `\t`, or `\r` as a formula trigger; the library prepends `'` so the
// cell renders as plain text.

describe('neutralizeFormulaPrefix — CSV-injection prefixes', () => {
  it('prepends a single quote to a cell starting with `=` (formula)', () => {
    expect(neutralizeFormulaPrefix('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
  });

  it('prepends a single quote to a cell starting with `+`', () => {
    expect(neutralizeFormulaPrefix('+1+1')).toBe("'+1+1");
  });

  it('prepends a single quote to a cell starting with `-` (catches negative-number-like strings)', () => {
    // Genuine negative numbers stored as strings get escaped too — documents
    // the trade-off. (Numeric `-1` cells go through formatCellValue → "-1"
    // which IS escaped here. Consumers who need un-escaped negative numbers
    // in CSV should pre-format their cells outside the export pipeline.)
    expect(neutralizeFormulaPrefix('-1')).toBe("'-1");
    expect(neutralizeFormulaPrefix('-1+CMD()')).toBe("'-1+CMD()");
  });

  it('prepends a single quote to a cell starting with `@` (Excel macro)', () => {
    expect(neutralizeFormulaPrefix('@INDIRECT("R1C1")')).toBe('\'@INDIRECT("R1C1")');
  });

  it('prepends a single quote to a cell starting with TAB (\\t)', () => {
    expect(neutralizeFormulaPrefix('\tdata')).toBe("'\tdata");
  });

  it('prepends a single quote to a cell starting with CR (\\r)', () => {
    expect(neutralizeFormulaPrefix('\rdata')).toBe("'\rdata");
  });

  it('does NOT touch a normal cell', () => {
    expect(neutralizeFormulaPrefix('hello')).toBe('hello');
    expect(neutralizeFormulaPrefix('123')).toBe('123');
    expect(neutralizeFormulaPrefix('')).toBe('');
  });

  it('does NOT touch a cell with a trigger char in the middle', () => {
    expect(neutralizeFormulaPrefix('A=B')).toBe('A=B');
    expect(neutralizeFormulaPrefix('hello+world')).toBe('hello+world');
    expect(neutralizeFormulaPrefix('msg@example.com')).toBe('msg@example.com');
  });

  it('escapeCSVField composes formula neutralisation with RFC 4180 quoting', () => {
    // Cell `=A1+B1,malicious` — the `=` triggers formula escape, then the
    // comma triggers RFC 4180 wrapping. Result: '"\'=A1+B1,malicious"'
    expect(escapeCSVField('=A1+B1,malicious', ',')).toBe('"\'=A1+B1,malicious"');
  });

  it('escapeCSVField escapes formula trigger AND embedded double-quotes', () => {
    // Cell `=A1+"X"` — formula neutralised, then RFC 4180 wrapping with
    // doubled quotes inside the wrapper.
    expect(escapeCSVField('=A1+"X"', ',')).toBe('"\'=A1+""X"""');
  });

  it('header rows go through the same neutralisation pipeline', async () => {
    // A column literally named `=ATTACK()` (yes, DuckDB allows this)
    // should be CSV-quoted with formula prefix in the header line.
    // This routes through `escapeCSVField`, mirroring the cell path.
    expect(escapeCSVField('=ATTACK()', ',')).toBe("'=ATTACK()");
  });
});

// =========================================
// formatCellValue Tests
// =========================================

describe('formatCellValue', () => {
  it('should return nullValue for null', () => {
    expect(formatCellValue(null, '')).toBe('');
    expect(formatCellValue(null, 'N/A')).toBe('N/A');
  });

  it('should return nullValue for undefined', () => {
    expect(formatCellValue(undefined, 'NULL')).toBe('NULL');
  });

  it('should format booleans as lowercase', () => {
    expect(formatCellValue(true, '')).toBe('true');
    expect(formatCellValue(false, '')).toBe('false');
  });

  it('should format integers without locale formatting', () => {
    expect(formatCellValue(42, '')).toBe('42');
    expect(formatCellValue(1234567, '')).toBe('1234567');
  });

  it('should format floats', () => {
    expect(formatCellValue(3.14, '')).toBe('3.14');
    expect(formatCellValue(0.001, '')).toBe('0.001');
  });

  it('should format bigint', () => {
    expect(formatCellValue(9007199254740993n, '')).toBe('9007199254740993');
  });

  it('should format NaN as string', () => {
    expect(formatCellValue(NaN, '')).toBe('NaN');
  });

  it('should format Infinity as string', () => {
    expect(formatCellValue(Infinity, '')).toBe('Infinity');
    expect(formatCellValue(-Infinity, '')).toBe('-Infinity');
  });

  it('should format strings as-is', () => {
    expect(formatCellValue('hello', '')).toBe('hello');
    expect(formatCellValue('', '')).toBe('');
  });

  it('should format Date as ISO string', () => {
    const date = new Date('2024-06-15T12:30:00.000Z');
    expect(formatCellValue(date, '')).toBe('2024-06-15T12:30:00.000Z');
  });

  it('should format zero correctly', () => {
    expect(formatCellValue(0, 'NULL')).toBe('0');
  });

  it('should format negative numbers', () => {
    expect(formatCellValue(-42, '')).toBe('-42');
  });
});

// =========================================
// resolveColumns Tests
// =========================================

describe('resolveColumns', () => {
  const schema: ColumnSchema[] = [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
    { name: 'price', type: 'float', nullable: true, originalType: 'DOUBLE' },
    { name: 'date', type: 'date', nullable: true, originalType: 'DATE' },
  ];

  const context = {
    columnOrder: ['id', 'name', 'price', 'date'],
    schema,
  };

  it('should return all columns in order for "all"', () => {
    expect(resolveColumns('all', context)).toEqual(['id', 'name', 'price', 'date']);
  });

  it('should return valid columns from explicit list', () => {
    expect(resolveColumns(['name', 'price'], context)).toEqual(['name', 'price']);
  });

  it('should filter out invalid column names from explicit list', () => {
    expect(resolveColumns(['name', 'nonexistent', 'price'], context)).toEqual(['name', 'price']);
  });

  it('should return empty array for all-invalid explicit list', () => {
    expect(resolveColumns(['nope', 'nada'], context)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // System-column filtering (Phase 1)
  // -------------------------------------------------------------------------

  describe('system-column filtering', () => {
    const schemaWithSystem: ColumnSchema[] = [
      { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
      ...schema,
    ];
    const orderWithSystem = ['__rowid__', 'id', 'name', 'price', 'date'];

    it('excludes system columns from "all"', () => {
      expect(
        resolveColumns('all', { columnOrder: orderWithSystem, schema: schemaWithSystem }),
      ).toEqual(['id', 'name', 'price', 'date']);
    });

    it('preserves system columns when caller passes an explicit list', () => {
      expect(
        resolveColumns(['__rowid__', 'id'], {
          columnOrder: orderWithSystem,
          schema: schemaWithSystem,
        }),
      ).toEqual(['__rowid__', 'id']);
    });

    it('returns plain columnOrder reference when the schema has no system columns', () => {
      const r = resolveColumns('all', context);
      expect(r).toEqual(context.columnOrder);
    });
  });
});

// =========================================
// rowToCSVLine Tests
// =========================================

describe('rowToCSVLine', () => {
  it('should format a basic row', () => {
    const row = { id: 1, name: 'Alice', price: 9.99 };
    expect(rowToCSVLine(row, ['id', 'name', 'price'], ',', '')).toBe('1,Alice,9.99');
  });

  it('should handle null values with custom nullValue', () => {
    const row = { id: 1, name: null, price: undefined };
    expect(rowToCSVLine(row, ['id', 'name', 'price'], ',', 'N/A')).toBe('1,N/A,N/A');
  });

  it('should escape fields containing delimiter', () => {
    const row = { id: 1, name: 'Smith, John' };
    expect(rowToCSVLine(row, ['id', 'name'], ',', '')).toBe('1,"Smith, John"');
  });

  it('should handle tab delimiter', () => {
    const row = { a: 'x', b: 'y' };
    expect(rowToCSVLine(row, ['a', 'b'], '\t', '')).toBe('x\ty');
  });

  it('should respect column order', () => {
    const row = { b: 2, a: 1, c: 3 };
    expect(rowToCSVLine(row, ['c', 'a', 'b'], ',', '')).toBe('3,1,2');
  });
});

// =========================================
// isContiguousRange Tests
// =========================================

describe('isContiguousRange', () => {
  it('should return null for empty array', () => {
    expect(isContiguousRange([])).toBeNull();
  });

  it('should detect single element as contiguous', () => {
    expect(isContiguousRange([5])).toEqual({ start: 5, length: 1 });
  });

  it('should detect contiguous range', () => {
    expect(isContiguousRange([3, 4, 5, 6, 7])).toEqual({ start: 3, length: 5 });
  });

  it('should detect range starting at 0', () => {
    expect(isContiguousRange([0, 1, 2])).toEqual({ start: 0, length: 3 });
  });

  it('should return null for non-contiguous indices', () => {
    expect(isContiguousRange([0, 1, 3])).toBeNull();
  });

  it('should return null for non-contiguous with gap', () => {
    expect(isContiguousRange([1, 2, 5, 6])).toBeNull();
  });
});

// =========================================
// exportToCSV Integration Tests
// =========================================

describe('exportToCSV', () => {
  const schema: ColumnSchema[] = [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
    { name: 'price', type: 'float', nullable: true, originalType: 'DOUBLE' },
  ];

  let mockBridge: { query: ReturnType<typeof vi.fn> };
  let baseContext: ExportContext;

  beforeEach(() => {
    mockBridge = {
      query: vi.fn(),
    };
    baseContext = {
      bridge: mockBridge as unknown as import('@/data/WorkerBridge').WorkerBridge,
      filters: [],
      sortColumns: [],
      selectedRows: new Set(),
      columnOrder: ['id', 'name', 'price'],
      schema,
    };
  });

  it('should throw when tableName is empty', async () => {
    await expect(exportToCSV('', {}, baseContext)).rejects.toThrow('No table loaded');
  });

  describe('scope: all', () => {
    it('should export all rows with headers', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'Alice', price: 10.5 },
        { id: 2, name: 'Bob', price: 20.0 },
      ]);

      const csv = await exportToCSV('test_table', { scope: 'all' }, baseContext);

      expect(csv).toBe('id,name,price\n1,Alice,10.5\n2,Bob,20');

      // Verify SQL has no WHERE clause
      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('SELECT "id", "name", "price"');
      expect(sql).toContain('FROM "test_table"');
      expect(sql).not.toContain('WHERE');
      expect(sql).toContain('LIMIT 10000 OFFSET 0');
    });

    it('should export without headers when includeHeaders is false', async () => {
      mockBridge.query.mockResolvedValueOnce([{ id: 1, name: 'Alice', price: 10.5 }]);

      const csv = await exportToCSV(
        'test_table',
        { scope: 'all', includeHeaders: false },
        baseContext,
      );

      expect(csv).toBe('1,Alice,10.5');
    });

    it('should use custom delimiter', async () => {
      mockBridge.query.mockResolvedValueOnce([{ id: 1, name: 'Alice', price: 10.5 }]);

      const csv = await exportToCSV('test_table', { scope: 'all', delimiter: '\t' }, baseContext);

      expect(csv).toBe('id\tname\tprice\n1\tAlice\t10.5');
    });

    it('should use custom nullValue', async () => {
      mockBridge.query.mockResolvedValueOnce([{ id: 1, name: null, price: undefined }]);

      const csv = await exportToCSV('test_table', { scope: 'all', nullValue: 'N/A' }, baseContext);

      expect(csv).toBe('id,name,price\n1,N/A,N/A');
    });

    it('should return header-only for empty dataset', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const csv = await exportToCSV('test_table', { scope: 'all' }, baseContext);

      expect(csv).toBe('id,name,price');
    });

    it('should return empty string for empty dataset without headers', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const csv = await exportToCSV(
        'test_table',
        { scope: 'all', includeHeaders: false },
        baseContext,
      );

      expect(csv).toBe('');
    });

    it('should include ORDER BY when sortColumns are set', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 2, name: 'Bob', price: 20 },
        { id: 1, name: 'Alice', price: 10 },
      ]);

      const context = {
        ...baseContext,
        sortColumns: [{ column: 'name', direction: 'asc' as const }],
      };

      await exportToCSV('test_table', { scope: 'all' }, context);

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY "name" ASC');
    });

    it('should handle multi-sort', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const context = {
        ...baseContext,
        sortColumns: [
          { column: 'name', direction: 'asc' as const },
          { column: 'price', direction: 'desc' as const },
        ],
      };

      await exportToCSV('test_table', { scope: 'all' }, context);

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY "name" ASC, "price" DESC');
    });
  });

  describe('scope: filtered', () => {
    it('should include WHERE clause from filters', async () => {
      mockBridge.query.mockResolvedValueOnce([{ id: 1, name: 'Alice', price: 10.5 }]);

      const context = {
        ...baseContext,
        filters: [{ type: 'range' as const, column: 'price', min: 5, max: 15 }],
      };

      const csv = await exportToCSV('test_table', { scope: 'filtered' }, context);

      expect(csv).toBe('id,name,price\n1,Alice,10.5');

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE');
      expect(sql).toContain('"price"');
    });

    it('should not include WHERE clause for scope all even with filters', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const context = {
        ...baseContext,
        filters: [{ type: 'range' as const, column: 'price', min: 5, max: 15 }],
      };

      await exportToCSV('test_table', { scope: 'all' }, context);

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).not.toContain('WHERE');
    });
  });

  describe('scope: selected', () => {
    it('should return header-only when no rows selected', async () => {
      const csv = await exportToCSV('test_table', { scope: 'selected' }, baseContext);

      expect(csv).toBe('id,name,price');
      expect(mockBridge.query).not.toHaveBeenCalled();
    });

    it('should use LIMIT/OFFSET for contiguous range', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'Alice', price: 10 },
        { id: 2, name: 'Bob', price: 20 },
        { id: 3, name: 'Charlie', price: 30 },
      ]);

      const context = {
        ...baseContext,
        selectedRows: new Set([2, 3, 4]),
      };

      const csv = await exportToCSV('test_table', { scope: 'selected' }, context);

      expect(csv).toContain('Alice');

      // Should use LIMIT/OFFSET, not ROW_NUMBER CTE
      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).not.toContain('ROW_NUMBER');
      expect(sql).toContain('LIMIT 3 OFFSET 2');
    });

    it('should use ROW_NUMBER CTE for non-contiguous indices', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'Alice', price: 10 },
        { id: 3, name: 'Charlie', price: 30 },
      ]);

      const context = {
        ...baseContext,
        selectedRows: new Set([0, 5]),
      };

      const csv = await exportToCSV('test_table', { scope: 'selected' }, context);

      expect(csv).toContain('Alice');

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('ROW_NUMBER');
      expect(sql).toContain('__row_idx__');
      expect(sql).toContain('IN (0, 5)');
    });

    it('should include ORDER BY in ROW_NUMBER OVER clause when sorting', async () => {
      mockBridge.query.mockResolvedValueOnce([{ id: 1, name: 'Alice', price: 10 }]);

      const context = {
        ...baseContext,
        selectedRows: new Set([0, 5]),
        sortColumns: [{ column: 'name', direction: 'asc' as const }],
      };

      await exportToCSV('test_table', { scope: 'selected' }, context);

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('ROW_NUMBER() OVER(ORDER BY "name" ASC)');
    });

    it('should use empty OVER clause when no sorting', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const context = {
        ...baseContext,
        selectedRows: new Set([0, 5]),
        sortColumns: [],
      };

      await exportToCSV('test_table', { scope: 'selected' }, context);

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('ROW_NUMBER() OVER()');
    });

    it('should include filters in selected rows CTE', async () => {
      mockBridge.query.mockResolvedValueOnce([]);

      const context = {
        ...baseContext,
        selectedRows: new Set([0, 2]),
        filters: [{ type: 'point' as const, column: 'name', value: 'Alice' }],
      };

      await exportToCSV('test_table', { scope: 'selected' }, context);

      const sql = mockBridge.query.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE');
      expect(sql).toContain('"name"');
    });
  });

  describe('column selection', () => {
    it('should export all columns by default', async () => {
      mockBridge.query.mockResolvedValueOnce([{ id: 1, name: 'Alice', price: 10 }]);

      const csv = await exportToCSV('test_table', {}, baseContext);

      expect(csv).toBe('id,name,price\n1,Alice,10');
    });

    it('should export all columns when columns is "all"', async () => {
      mockBridge.query.mockResolvedValueOnce([{ id: 1, name: 'Alice', price: 10 }]);

      const csv = await exportToCSV('test_table', { columns: 'all' }, baseContext);

      expect(csv).toContain('id,name,price');
    });

    it('should export specific columns', async () => {
      mockBridge.query.mockResolvedValueOnce([{ name: 'Alice', price: 10 }]);

      const csv = await exportToCSV('test_table', { columns: ['name', 'price'] }, baseContext);

      expect(csv).toBe('name,price\nAlice,10');
    });
  });

  describe('batching', () => {
    it('should fetch multiple batches when dataset is large', async () => {
      // First batch: full batch size
      const batch1 = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `row${i}`,
        price: i * 0.5,
      }));
      // Second batch: partial (end of data)
      const batch2 = [{ id: 10000, name: 'last', price: 5000 }];

      mockBridge.query.mockResolvedValueOnce(batch1).mockResolvedValueOnce(batch2);

      const csv = await exportToCSV('test_table', { scope: 'all' }, baseContext);

      // Should have made 2 queries
      expect(mockBridge.query).toHaveBeenCalledTimes(2);

      // Verify offsets
      const sql1 = mockBridge.query.mock.calls[0][0] as string;
      const sql2 = mockBridge.query.mock.calls[1][0] as string;
      expect(sql1).toContain('OFFSET 0');
      expect(sql2).toContain('OFFSET 10000');

      // Verify total lines (header + 10001 rows)
      const lines = csv.split('\n');
      expect(lines.length).toBe(10002); // header + 10000 + 1
    });
  });

  describe('abort signal', () => {
    it('should throw when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(exportToCSV('test_table', {}, baseContext, controller.signal)).rejects.toThrow(
        'Export aborted',
      );
    });
  });

  describe('data escaping', () => {
    it('should properly escape fields with commas, quotes, and newlines', async () => {
      mockBridge.query.mockResolvedValueOnce([
        { id: 1, name: 'Smith, "John"', price: 10 },
        { id: 2, name: 'line1\nline2', price: 20 },
      ]);

      const csv = await exportToCSV('test_table', { scope: 'all' }, baseContext);
      const lines = csv.split('\n');

      expect(lines[0]).toBe('id,name,price');
      expect(lines[1]).toBe('1,"Smith, ""John""",10');
      // Line with embedded newline will cause an extra split
      expect(lines[2]).toBe('2,"line1');
      expect(lines[3]).toBe('line2",20');
    });

    it('should escape column names in header row', async () => {
      const schemaWithSpecialNames: ColumnSchema[] = [
        { name: 'col,1', type: 'string', nullable: false, originalType: 'VARCHAR' },
        { name: 'col"2', type: 'string', nullable: false, originalType: 'VARCHAR' },
      ];
      mockBridge.query.mockResolvedValueOnce([]);

      const context = {
        ...baseContext,
        schema: schemaWithSpecialNames,
        columnOrder: ['col,1', 'col"2'],
      };

      const csv = await exportToCSV('test_table', { scope: 'all' }, context);

      expect(csv).toBe('"col,1","col""2"');
    });
  });
});

// =========================================
// exportFromState Tests
// =========================================

describe('exportFromState', () => {
  it('should throw when tableName is null', async () => {
    const mockState = {
      tableName: { get: () => null },
    };

    await expect(
      exportFromState(
        mockState as unknown as import('@/core/State').TableState,
        {} as unknown as import('@/data/WorkerBridge').WorkerBridge,
      ),
    ).rejects.toThrow('No table loaded');
  });

  it('should read signals and delegate to exportToCSV', async () => {
    const mockQuery = vi.fn().mockResolvedValueOnce([{ id: 1, name: 'Alice' }]);

    const mockState = {
      tableName: { get: () => 'my_table' },
      filters: { get: () => [] },
      sortColumns: { get: () => [] },
      selectedRows: { get: () => new Set<number>() },
      columnOrder: { get: () => ['id', 'name'] },
      schema: {
        get: () => [
          { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
          { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
        ],
      },
    };

    const mockBridge = { query: mockQuery };

    const csv = await exportFromState(
      mockState as unknown as import('@/core/State').TableState,
      mockBridge as unknown as import('@/data/WorkerBridge').WorkerBridge,
      { scope: 'all' },
    );

    expect(csv).toBe('id,name\n1,Alice');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('FROM "my_table"');
  });
});

// =========================================
// __rowid__ system-column end-to-end (Phase 7)
// =========================================
//
// Phase 1 locked `resolveColumns` system-column filtering. Phase 7 adds an
// end-to-end CSV cross-check that BIGINT-typed `__rowid__` formats as a
// decimal string (no scientific notation, no precision loss) when the
// caller opts in via an explicit columns array.

describe('exportToCSV — __rowid__ default-exclusion + opt-in', () => {
  const schemaWithSystem: ColumnSchema[] = [
    {
      name: '__rowid__',
      type: 'integer',
      nullable: false,
      originalType: 'BIGINT',
      system: true,
    },
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'label', type: 'string', nullable: false, originalType: 'VARCHAR' },
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
      columnOrder: ['__rowid__', 'id', 'label'],
      schema: schemaWithSystem,
    };
  });

  it("scope:'all' + columns:'all' excludes __rowid__ from the SELECT", async () => {
    mockBridge.query.mockResolvedValueOnce([{ id: 1, label: 'a' }]);
    const csv = await exportToCSV('t', { scope: 'all', columns: 'all' }, baseContext);
    expect(csv).toBe('id,label\n1,a');
    const sql = mockBridge.query.mock.calls[0][0] as string;
    expect(sql).not.toContain('"__rowid__"');
    expect(sql).toContain('"id"');
    expect(sql).toContain('"label"');
  });

  it("explicit ['__rowid__', 'id', 'label'] includes __rowid__ as the leftmost column", async () => {
    // Mimic the BIGINT row-id values DuckDB produces — JS BigInt cells in
    // result rows. CSV emits decimal strings via formatCellValue.
    mockBridge.query.mockResolvedValueOnce([
      { __rowid__: 0n, id: 1, label: 'a' },
      { __rowid__: 1n, id: 2, label: 'b' },
    ]);
    const csv = await exportToCSV(
      't',
      { scope: 'all', columns: ['__rowid__', 'id', 'label'] },
      baseContext,
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('__rowid__,id,label');
    expect(lines[1]).toBe('0,1,a');
    expect(lines[2]).toBe('1,2,b');
    const sql = mockBridge.query.mock.calls[0][0] as string;
    expect(sql).toContain('"__rowid__"');
  });

  it('BIGINT __rowid__ values beyond Number.MAX_SAFE_INTEGER format as decimal string (no scientific notation, no precision loss)', async () => {
    const big = BigInt('9007199254740993'); // MAX_SAFE_INTEGER + 2
    mockBridge.query.mockResolvedValueOnce([{ __rowid__: big, id: 1, label: 'huge' }]);
    const csv = await exportToCSV(
      't',
      { scope: 'all', columns: ['__rowid__', 'id', 'label'] },
      baseContext,
    );
    expect(csv).toContain('9007199254740993,1,huge');
    expect(csv).not.toMatch(/e\+/i); // no scientific notation
  });
});
