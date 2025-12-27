import { describe, it, expect } from 'vitest';
import type { CSVLoadOptions, LoadResult } from '@/worker/loaders/types';

describe('CSV Loader Types', () => {
  describe('CSVLoadOptions', () => {
    it('should define CSVLoadOptions interface with optional fields', () => {
      const options: CSVLoadOptions = {
        tableName: 'test_table',
        delimiter: ',',
        header: true,
      };
      expect(options.tableName).toBe('test_table');
      expect(options.delimiter).toBe(',');
      expect(options.header).toBe(true);
    });

    it('should allow empty options', () => {
      const options: CSVLoadOptions = {};
      expect(options.tableName).toBeUndefined();
      expect(options.delimiter).toBeUndefined();
    });

    it('should support all optional fields', () => {
      const options: CSVLoadOptions = {
        tableName: 'my_table',
        delimiter: ';',
        header: false,
        sampleSize: 500,
        skip: 2,
        nullValues: ['NA', 'N/A', ''],
      };
      expect(options.sampleSize).toBe(500);
      expect(options.skip).toBe(2);
      expect(options.nullValues).toHaveLength(3);
    });
  });

  describe('LoadResult', () => {
    it('should define LoadResult interface', () => {
      const result: LoadResult = {
        tableName: 'my_table',
        rowCount: 100,
        columns: ['id', 'name', 'value'],
      };
      expect(result.tableName).toBe('my_table');
      expect(result.rowCount).toBe(100);
      expect(result.columns).toHaveLength(3);
    });

    it('should support empty columns array', () => {
      const result: LoadResult = {
        tableName: 'empty_table',
        rowCount: 0,
        columns: [],
      };
      expect(result.rowCount).toBe(0);
      expect(result.columns).toHaveLength(0);
    });
  });
});
