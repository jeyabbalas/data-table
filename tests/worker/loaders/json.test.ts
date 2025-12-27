import { describe, it, expect } from 'vitest';
import type { JSONLoadOptions, LoadResult } from '@/worker/loaders/types';

describe('JSON Loader Types', () => {
  describe('JSONLoadOptions', () => {
    it('should define JSONLoadOptions interface with optional fields', () => {
      const options: JSONLoadOptions = {
        tableName: 'test_table',
        format: 'array',
        sampleSize: 1000,
      };
      expect(options.tableName).toBe('test_table');
      expect(options.format).toBe('array');
      expect(options.sampleSize).toBe(1000);
    });

    it('should allow empty options', () => {
      const options: JSONLoadOptions = {};
      expect(options.tableName).toBeUndefined();
      expect(options.format).toBeUndefined();
      expect(options.sampleSize).toBeUndefined();
      expect(options.maxDepth).toBeUndefined();
    });

    it('should support ndjson format', () => {
      const options: JSONLoadOptions = {
        format: 'ndjson',
        maxDepth: 5,
      };
      expect(options.format).toBe('ndjson');
      expect(options.maxDepth).toBe(5);
    });

    it('should support all optional fields together', () => {
      const options: JSONLoadOptions = {
        tableName: 'my_json_table',
        format: 'array',
        sampleSize: 500,
        maxDepth: 10,
      };
      expect(options.tableName).toBe('my_json_table');
      expect(options.format).toBe('array');
      expect(options.sampleSize).toBe(500);
      expect(options.maxDepth).toBe(10);
    });
  });

  describe('LoadResult with JSON data', () => {
    it('should define LoadResult interface for JSON tables', () => {
      const result: LoadResult = {
        tableName: 'json_table_1',
        rowCount: 100,
        columns: ['id', 'name', 'data'],
      };
      expect(result.tableName).toBe('json_table_1');
      expect(result.rowCount).toBe(100);
      expect(result.columns).toHaveLength(3);
    });

    it('should handle tables with nested column names', () => {
      const result: LoadResult = {
        tableName: 'nested_json',
        rowCount: 50,
        columns: ['id', 'user.name', 'user.email', 'metadata.created'],
      };
      expect(result.columns).toContain('user.name');
      expect(result.columns).toHaveLength(4);
    });
  });
});
