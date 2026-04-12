import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryCache, attachCacheInvalidation } from '@/data/QueryCache';
import { createTableState } from '@/core/State';
import { WorkerBridge } from '@/data/WorkerBridge';

describe('QueryCache', () => {
  describe('get/set basics', () => {
    it('should return cached value on hit', () => {
      const cache = new QueryCache();
      const rows = [{ id: 1 }, { id: 2 }];
      cache.set('SELECT * FROM t', rows);
      expect(cache.get('SELECT * FROM t')).toEqual(rows);
    });

    it('should return undefined on miss', () => {
      const cache = new QueryCache();
      expect(cache.get('SELECT 1')).toBeUndefined();
    });

    it('should overwrite existing key without increasing size', () => {
      const cache = new QueryCache();
      cache.set('SELECT 1', [{ a: 1 }]);
      cache.set('SELECT 1', [{ a: 2 }]);
      expect(cache.size).toBe(1);
      expect(cache.get('SELECT 1')).toEqual([{ a: 2 }]);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least-recently-used entry when at capacity', () => {
      const cache = new QueryCache({ maxEntries: 3 });
      cache.set('q1', [{ v: 1 }]);
      cache.set('q2', [{ v: 2 }]);
      cache.set('q3', [{ v: 3 }]);
      // q1 is LRU — adding q4 should evict it
      cache.set('q4', [{ v: 4 }]);
      expect(cache.size).toBe(3);
      expect(cache.get('q1')).toBeUndefined();
      expect(cache.get('q2')).toEqual([{ v: 2 }]);
      expect(cache.get('q4')).toEqual([{ v: 4 }]);
    });

    it('should promote entry on get, protecting it from eviction', () => {
      const cache = new QueryCache({ maxEntries: 3 });
      cache.set('q1', [{ v: 1 }]);
      cache.set('q2', [{ v: 2 }]);
      cache.set('q3', [{ v: 3 }]);
      // Access q1 to promote it — now q2 is LRU
      cache.get('q1');
      cache.set('q4', [{ v: 4 }]);
      expect(cache.get('q1')).toEqual([{ v: 1 }]); // promoted, survived
      expect(cache.get('q2')).toBeUndefined(); // evicted as LRU
    });
  });

  describe('TTL expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return value before TTL expires', () => {
      const cache = new QueryCache({ ttlMs: 1000 });
      cache.set('q1', [{ v: 1 }]);
      vi.advanceTimersByTime(999);
      expect(cache.get('q1')).toEqual([{ v: 1 }]);
    });

    it('should return undefined after TTL expires', () => {
      const cache = new QueryCache({ ttlMs: 1000 });
      cache.set('q1', [{ v: 1 }]);
      vi.advanceTimersByTime(1001);
      expect(cache.get('q1')).toBeUndefined();
    });

    it('should clean up expired entry on get', () => {
      const cache = new QueryCache({ ttlMs: 1000 });
      cache.set('q1', [{ v: 1 }]);
      vi.advanceTimersByTime(1001);
      cache.get('q1'); // triggers cleanup
      expect(cache.size).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new QueryCache();
      cache.set('q1', [{ v: 1 }]);
      cache.set('q2', [{ v: 2 }]);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('q1')).toBeUndefined();
      expect(cache.get('q2')).toBeUndefined();
    });
  });

  describe('has', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return true for present key', () => {
      const cache = new QueryCache();
      cache.set('q1', []);
      expect(cache.has('q1')).toBe(true);
    });

    it('should return false for absent key', () => {
      const cache = new QueryCache();
      expect(cache.has('q1')).toBe(false);
    });

    it('should return false for expired key', () => {
      const cache = new QueryCache({ ttlMs: 500 });
      cache.set('q1', []);
      vi.advanceTimersByTime(501);
      expect(cache.has('q1')).toBe(false);
    });
  });

  describe('size', () => {
    it('should track entries correctly', () => {
      const cache = new QueryCache();
      expect(cache.size).toBe(0);
      cache.set('q1', []);
      expect(cache.size).toBe(1);
      cache.set('q2', []);
      expect(cache.size).toBe(2);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('zero maxEntries (disabled)', () => {
    it('should not store entries when maxEntries is 0', () => {
      const cache = new QueryCache({ maxEntries: 0 });
      cache.set('q1', [{ v: 1 }]);
      expect(cache.size).toBe(0);
      expect(cache.get('q1')).toBeUndefined();
    });
  });
});

describe('attachCacheInvalidation', () => {
  it('should clear cache when filters change', () => {
    const state = createTableState();
    const bridge = new WorkerBridge();
    const spy = vi.spyOn(bridge, 'clearQueryCache');

    attachCacheInvalidation(bridge, state);
    state.filters.set([{ column: 'a', type: 'null' }]);
    expect(spy).toHaveBeenCalled();
  });

  it('should clear cache when sortColumns change', () => {
    const state = createTableState();
    const bridge = new WorkerBridge();
    const spy = vi.spyOn(bridge, 'clearQueryCache');

    attachCacheInvalidation(bridge, state);
    state.sortColumns.set([{ column: 'a', direction: 'asc' }]);
    expect(spy).toHaveBeenCalled();
  });

  it('should clear cache when derivedColumns change', () => {
    const state = createTableState();
    const bridge = new WorkerBridge();
    const spy = vi.spyOn(bridge, 'clearQueryCache');

    attachCacheInvalidation(bridge, state);
    state.derivedColumns.set([{ kind: 'expression', name: 'x', expression: '1+1' }]);
    expect(spy).toHaveBeenCalled();
  });

  it('should clear cache when totalRows changes', () => {
    const state = createTableState();
    const bridge = new WorkerBridge();
    const spy = vi.spyOn(bridge, 'clearQueryCache');

    attachCacheInvalidation(bridge, state);
    state.totalRows.set(500);
    expect(spy).toHaveBeenCalled();
  });

  it('should clear cache when tableName changes', () => {
    const state = createTableState();
    const bridge = new WorkerBridge();
    const spy = vi.spyOn(bridge, 'clearQueryCache');

    attachCacheInvalidation(bridge, state);
    state.tableName.set('new_table');
    expect(spy).toHaveBeenCalled();
  });

  it('should stop invalidation after unsubscribe', () => {
    const state = createTableState();
    const bridge = new WorkerBridge();
    const spy = vi.spyOn(bridge, 'clearQueryCache');

    const unsub = attachCacheInvalidation(bridge, state);
    spy.mockClear();
    unsub();

    state.filters.set([{ column: 'a', type: 'null' }]);
    state.sortColumns.set([{ column: 'a', direction: 'asc' }]);
    state.totalRows.set(999);
    expect(spy).not.toHaveBeenCalled();
  });
});
