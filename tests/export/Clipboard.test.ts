/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard, copyRowsToClipboard } from '@/export/Clipboard';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

// Mock clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);
const mockWrite = vi.fn().mockResolvedValue(undefined);

// Mock ClipboardItem as a class
class MockClipboardItem {
  items: Record<string, Blob>;
  constructor(items: Record<string, Blob>) {
    this.items = items;
  }
}

// Mock WorkerBridge
const mockBridge = {
  query: vi.fn().mockResolvedValue([]),
} as any;

const testSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'price', type: 'float', nullable: true, originalType: 'DOUBLE' },
];

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
        write: mockWrite,
      },
    });
    (globalThis as any).ClipboardItem = MockClipboardItem;
  });

  it('should call writeText for text format', async () => {
    await copyToClipboard('hello world', 'text');
    expect(mockWriteText).toHaveBeenCalledWith('hello world');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('should call write with ClipboardItem for html format', async () => {
    await copyToClipboard('<b>bold</b>', 'html');
    expect(mockWrite).toHaveBeenCalledTimes(1);

    const clipboardItems = mockWrite.mock.calls[0][0];
    expect(clipboardItems).toHaveLength(1);
    expect(clipboardItems[0]).toBeInstanceOf(MockClipboardItem);
    expect(clipboardItems[0].items).toHaveProperty('text/html');
    expect(clipboardItems[0].items).toHaveProperty('text/plain');
  });

  it('should handle empty string', async () => {
    await copyToClipboard('', 'text');
    expect(mockWriteText).toHaveBeenCalledWith('');
  });

  it('should propagate errors from writeText', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('Permission denied'));
    await expect(copyToClipboard('data', 'text')).rejects.toThrow('Permission denied');
  });

  it('should propagate errors from write', async () => {
    mockWrite.mockRejectedValueOnce(new Error('Clipboard API error'));
    await expect(copyToClipboard('<p>hi</p>', 'html')).rejects.toThrow('Clipboard API error');
  });
});

describe('copyRowsToClipboard', () => {
  let state: TableState;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
        write: mockWrite,
      },
    });

    state = createTableState();
    initializeColumnsFromSchema(state, testSchema);
    state.tableName.set('test_table');
    state.totalRows.set(100);
    state.filteredRows.set(100);
  });

  it('should return immediately for empty rows array', async () => {
    await copyRowsToClipboard([], state, mockBridge);
    expect(mockBridge.query).not.toHaveBeenCalled();
    expect(mockWriteText).not.toHaveBeenCalled();
  });

  it('should throw when no table is loaded', async () => {
    state.tableName.set(null);
    await expect(copyRowsToClipboard([0], state, mockBridge)).rejects.toThrow('No table loaded');
  });

  it('should produce TSV with headers and tab delimiter', async () => {
    mockBridge.query.mockResolvedValueOnce([
      { id: 1, name: 'Alice', price: 9.99 },
      { id: 2, name: 'Bob', price: 19.99 },
    ]);

    await copyRowsToClipboard([0, 1], state, mockBridge);

    expect(mockWriteText).toHaveBeenCalledTimes(1);
    const tsv = mockWriteText.mock.calls[0][0] as string;

    // Should have headers
    const lines = tsv.split('\n');
    expect(lines[0]).toBe('id\tname\tprice');
    expect(lines[1]).toBe('1\tAlice\t9.99');
    expect(lines[2]).toBe('2\tBob\t19.99');
  });

  it('should use visible columns only', async () => {
    // Hide the price column
    state.visibleColumns.set(['id', 'name']);

    mockBridge.query.mockResolvedValueOnce([
      { id: 1, name: 'Alice' },
    ]);

    await copyRowsToClipboard([0], state, mockBridge);

    const tsv = mockWriteText.mock.calls[0][0] as string;
    const header = tsv.split('\n')[0];
    expect(header).toBe('id\tname');
    expect(header).not.toContain('price');
  });

  it('should handle null values as empty strings', async () => {
    mockBridge.query.mockResolvedValueOnce([
      { id: 1, name: null, price: null },
    ]);

    await copyRowsToClipboard([0], state, mockBridge);

    const tsv = mockWriteText.mock.calls[0][0] as string;
    const dataLine = tsv.split('\n')[1];
    expect(dataLine).toBe('1\t\t');
  });

  it('should pass selected rows in the query', async () => {
    mockBridge.query.mockResolvedValueOnce([
      { id: 5, name: 'Eve', price: 50 },
    ]);

    await copyRowsToClipboard([4], state, mockBridge);

    // Verify the query uses LIMIT/OFFSET for contiguous range
    const sql = mockBridge.query.mock.calls[0][0] as string;
    expect(sql).toContain('LIMIT');
    expect(sql).toContain('OFFSET');
  });

  it('should handle non-contiguous row indices', async () => {
    mockBridge.query.mockResolvedValueOnce([
      { id: 1, name: 'Alice', price: 10 },
      { id: 4, name: 'Dan', price: 40 },
    ]);

    await copyRowsToClipboard([0, 3], state, mockBridge);

    expect(mockWriteText).toHaveBeenCalledTimes(1);
    const tsv = mockWriteText.mock.calls[0][0] as string;
    expect(tsv.split('\n').length).toBe(3); // header + 2 rows
  });

  it('should escape fields containing tabs', async () => {
    mockBridge.query.mockResolvedValueOnce([
      { id: 1, name: 'has\ttab', price: 10 },
    ]);

    await copyRowsToClipboard([0], state, mockBridge);

    const tsv = mockWriteText.mock.calls[0][0] as string;
    // Field with tab should be wrapped in quotes
    expect(tsv).toContain('"has\ttab"');
  });
});
