import { describe, it, expect } from 'vitest';
import type { ParquetLoadOptions, LoadResult } from '@/worker/loaders/types';

describe('Parquet Loader Types', () => {
  describe('ParquetLoadOptions', () => {
    it('should define ParquetLoadOptions interface with optional fields', () => {
      const options: ParquetLoadOptions = {
        tableName: 'test_table',
        columns: ['id', 'name'],
      };
      expect(options.tableName).toBe('test_table');
      expect(options.columns).toHaveLength(2);
    });

    it('should allow empty options', () => {
      const options: ParquetLoadOptions = {};
      expect(options.tableName).toBeUndefined();
      expect(options.columns).toBeUndefined();
    });

    it('should support column selection', () => {
      const options: ParquetLoadOptions = {
        columns: ['col1', 'col2', 'col3'],
      };
      expect(options.columns).toContain('col1');
      expect(options.columns).toContain('col2');
      expect(options.columns).toContain('col3');
      expect(options.columns).toHaveLength(3);
    });

    it('should support table name only', () => {
      const options: ParquetLoadOptions = {
        tableName: 'my_parquet_table',
      };
      expect(options.tableName).toBe('my_parquet_table');
      expect(options.columns).toBeUndefined();
    });
  });

  describe('LoadResult with Parquet data', () => {
    it('should define LoadResult interface for Parquet tables', () => {
      const result: LoadResult = {
        tableName: 'parquet_table_1',
        rowCount: 1000,
        columns: ['id', 'timestamp', 'value'],
      };
      expect(result.tableName).toBe('parquet_table_1');
      expect(result.rowCount).toBe(1000);
      expect(result.columns).toHaveLength(3);
    });

    it('should handle large row counts', () => {
      const result: LoadResult = {
        tableName: 'large_parquet',
        rowCount: 100000,
        columns: ['pickup_datetime', 'dropoff_datetime', 'passenger_count', 'trip_distance', 'fare_amount'],
      };
      expect(result.rowCount).toBe(100000);
      expect(result.columns).toHaveLength(5);
    });
  });
});
