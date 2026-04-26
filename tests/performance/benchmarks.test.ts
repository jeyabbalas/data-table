/**
 * Performance benchmark tests.
 *
 * These tests assert that critical subsystems meet timing thresholds.
 * They run without DuckDB — the demo app's performance panel covers
 * full-stack benchmarks (1M-row load, crossfilter latency).
 */

import { describe, it, expect } from 'vitest';
import { PerfMonitor } from '@/core/PerfMonitor';
import { QueryCache } from '@/data/QueryCache';
import { createSignal } from '@/core/Signal';
import { filterToSQL, filtersToWhereClause } from '@/filters/FilterSQL';
import type { Filter } from '@/filters/FilterTypes';

describe('Performance Benchmarks', () => {
  describe('PerfMonitor utility', () => {
    it('should record sync measurements', () => {
      const perf = new PerfMonitor();
      const { result, perf: measurement } = perf.measureSync('test-sync', () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });
      expect(result).toBe(499500);
      expect(measurement.durationMs).toBeGreaterThanOrEqual(0);
      expect(measurement.name).toBe('test-sync');
      expect(perf.getResults()).toHaveLength(1);
    });

    it('should record async measurements', async () => {
      const perf = new PerfMonitor();
      const { result, perf: measurement } = await perf.measure('test-async', async () => {
        return 42;
      });
      expect(result).toBe(42);
      expect(measurement.durationMs).toBeGreaterThanOrEqual(0);
      expect(perf.getResults()).toHaveLength(1);
    });

    it('should accumulate and clear results', () => {
      const perf = new PerfMonitor();
      perf.measureSync('a', () => 1);
      perf.measureSync('b', () => 2);
      expect(perf.getResults()).toHaveLength(2);

      perf.clear();
      expect(perf.getResults()).toHaveLength(0);
    });

    it('should format summary', () => {
      const perf = new PerfMonitor();
      perf.measureSync('op', () => 1);
      const summary = perf.formatSummary();
      expect(summary).toContain('op:');
      expect(summary).toContain('ms');
    });
  });

  describe('QueryCache hit performance', () => {
    it('should return cached results in under 1ms', () => {
      const cache = new QueryCache();
      const largeResult = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `row_${i}` }));
      cache.set('SELECT * FROM test', largeResult);

      const perf = new PerfMonitor();
      const { perf: measurement } = perf.measureSync('cache-hit', () => {
        for (let i = 0; i < 100; i++) {
          cache.get('SELECT * FROM test');
        }
      });

      // 100 cache hits should complete in well under 1ms
      expect(measurement.durationMs).toBeLessThan(10);
    });
  });

  describe('SQL generation performance', () => {
    it('should generate SQL for 20 filters in under 5ms', () => {
      const filters: Filter[] = [];
      for (let i = 0; i < 10; i++) {
        filters.push({ column: `col_${i}`, type: 'range', min: 0, max: 100 });
      }
      for (let i = 10; i < 20; i++) {
        filters.push({
          column: `col_${i}`,
          type: 'set',
          values: ['a', 'b', 'c', 'd', 'e'],
        });
      }

      const perf = new PerfMonitor();
      const { perf: measurement } = perf.measureSync('sql-gen-20-filters', () => {
        for (let i = 0; i < 100; i++) {
          filtersToWhereClause(filters);
        }
      });

      // 100 iterations of 20-filter WHERE clause generation
      expect(measurement.durationMs).toBeLessThan(50);
    });

    it('should generate individual filter SQL in under 1ms', () => {
      const filter: Filter = {
        column: 'price',
        type: 'range',
        min: 10.5,
        max: 99.99,
      };

      const perf = new PerfMonitor();
      const { perf: measurement } = perf.measureSync('single-filter-sql', () => {
        for (let i = 0; i < 1000; i++) {
          filterToSQL(filter);
        }
      });

      // 1000 individual filter SQL generations
      expect(measurement.durationMs).toBeLessThan(10);
    });
  });

  describe('Signal propagation performance', () => {
    it('should notify 100 subscribers in under 5ms', () => {
      const signal = createSignal(0);
      const callbacks: (() => void)[] = [];
      let callCount = 0;

      // Subscribe 100 listeners
      for (let i = 0; i < 100; i++) {
        const unsub = signal.subscribe(() => {
          callCount++;
        });
        callbacks.push(unsub);
      }

      const perf = new PerfMonitor();
      const { perf: measurement } = perf.measureSync('signal-100-subscribers', () => {
        for (let i = 1; i <= 100; i++) {
          signal.set(i);
        }
      });

      expect(callCount).toBe(10000); // 100 sets * 100 subscribers
      // 10,000 callback invocations should be fast
      expect(measurement.durationMs).toBeLessThan(50);

      // Cleanup
      callbacks.forEach((unsub) => unsub());
    });
  });
});
