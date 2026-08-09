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

    it('accounts nothing when disabled', () => {
      const cache = new QueryCache({ maxEntries: 0 });
      cache.set('q1', [{ v: 1 }]);
      expect(cache.approxBytes).toBe(0);
    });
  });

  /**
   * The byte bound. `maxEntries` alone cannot tell a 20-column result from a
   * 1,000-column one, so 100 entries is a few hundred KB on a narrow table
   * and hundreds of MB on a wide one — which is the shape column-clipped
   * fetches make reachable rather than hypothetical.
   */
  describe('maxBytes', () => {
    /**
     * A one-row result whose estimate is `2 × pad + 84` bytes: the row
     * stringifies to `{"pad":"…"}` (`pad + 10` chars), doubled for UTF-16,
     * plus 64 B of per-row overhead. Sized explicitly so the eviction
     * arithmetic below is legible rather than knife-edge.
     */
    const sized = (pad: number): { pad: string }[] => [{ pad: 'x'.repeat(pad) }];
    const SMALL = 400; // 884 bytes
    const LARGE = 2_000; // 4,084 bytes

    it('tracks an approximate total across set, evict and clear', () => {
      const cache = new QueryCache();
      expect(cache.approxBytes).toBe(0);

      cache.set('q1', [{ id: 1, name: 'alpha' }]);
      const afterFirst = cache.approxBytes;
      expect(afterFirst).toBeGreaterThan(0);

      cache.set('q2', [{ id: 2, name: 'beta' }]);
      expect(cache.approxBytes).toBeGreaterThan(afterFirst);

      cache.clear();
      expect(cache.approxBytes).toBe(0);
    });

    it('does not double-count an overwritten key', () => {
      const cache = new QueryCache();
      cache.set('q1', [{ v: 1 }]);
      const once = cache.approxBytes;
      cache.set('q1', [{ v: 1 }]);
      expect(cache.approxBytes).toBe(once);
      expect(cache.size).toBe(1);
    });

    it('evicts least-recently-used first when an insert goes over budget', () => {
      const cache = new QueryCache({ maxBytes: 3_000 });
      cache.set('q1', sized(SMALL));
      cache.set('q2', sized(SMALL));
      cache.set('q3', sized(SMALL));
      // Promote q1 so insertion order and recency disagree — the point of LRU.
      expect(cache.get('q1')).toBeDefined();

      cache.set('q4', sized(SMALL));

      expect(cache.has('q4')).toBe(true);
      expect(cache.has('q1')).toBe(true); // most recently used, survives
      expect(cache.has('q2')).toBe(false); // least recently used, goes first
      expect(cache.has('q3')).toBe(true);
      expect(cache.approxBytes).toBeLessThanOrEqual(3_000);
    });

    it('evicts as many entries as one oversized insert requires', () => {
      // The count bound only ever needed one eviction per insert, because
      // every entry counts for exactly one. A byte bound needs a loop, and
      // this is the case that proves it: one insert worth four of the entries
      // already held.
      const cache = new QueryCache({ maxBytes: 5_000 });
      for (let i = 0; i < 5; i++) cache.set(`small${i}`, sized(SMALL));
      expect(cache.size).toBe(5);

      cache.set('large', sized(LARGE));

      expect(cache.has('large')).toBe(true);
      expect(cache.size).toBe(2);
      expect(cache.has('small4')).toBe(true); // the most recent survivor
      expect(cache.has('small0')).toBe(false);
      expect(cache.approxBytes).toBeLessThanOrEqual(5_000);
    });

    it('does not store an entry larger than the whole budget', () => {
      const cache = new QueryCache({ maxBytes: 2_000 });
      cache.set('keep', sized(SMALL));
      const before = cache.approxBytes;

      cache.set('huge', sized(LARGE));

      // Storing it would empty the cache for something that cannot fit, and
      // then be evicted itself on the next insert.
      expect(cache.has('huge')).toBe(false);
      expect(cache.has('keep')).toBe(true);
      expect(cache.approxBytes).toBe(before);
    });

    it('samples across the result, so a head-skewed one is not underestimated', () => {
      // Row size is not stationary: sort a VARCHAR column and every long value
      // lands at one end. A head sample of `SIZE_SAMPLE_ROWS` rows called this
      // 968 KB (44× under) and the bound it feeds was decorative — eleven of
      // them fit a 1 MiB budget while genuinely retaining ~41 MiB.
      const skewed = (): Record<string, unknown>[] => [
        ...Array.from({ length: 32 }, () => ({ v: 'xxxx' })),
        ...Array.from({ length: 968 }, () => ({ v: 'y'.repeat(2_000) })),
      ];
      const MAX = 1024 * 1024;
      const cache = new QueryCache({ maxEntries: 100, maxBytes: MAX });

      let retained = 0;
      for (let i = 0; i < 11; i++) {
        const rows = skewed();
        cache.set(`q${i}`, rows);
        if (cache.has(`q${i}`)) retained += JSON.stringify(rows).length * 2;
      }

      expect(cache.approxBytes).toBeLessThanOrEqual(MAX);
      // The estimate is a sample, so it is allowed to be wrong — by a factor,
      // not by an order of magnitude. A strided sample of this result is
      // within ~3%; the head sample was 44× out.
      expect(retained).toBeLessThanOrEqual(2 * MAX);
    });

    it('falls back to a shape estimate for results JSON cannot serialize', () => {
      const cache = new QueryCache();
      // `JSON.stringify` throws on BigInt. The worker normally converts these
      // away, but nothing in the cache enforces that, and one unserializable
      // result must not disable the byte bound.
      cache.set('bigint', [
        { a: 1n, b: 2n },
        { a: 3n, b: 4n },
      ]);
      expect(cache.size).toBe(1);
      expect(cache.approxBytes).toBe(2 * 2 * 16);
    });

    it('gives back an expired entry’s bytes when the expiry is noticed', () => {
      vi.useFakeTimers();
      try {
        const cache = new QueryCache({ ttlMs: 1_000 });
        cache.set('q1', [{ v: 1 }]);
        expect(cache.approxBytes).toBeGreaterThan(0);

        vi.advanceTimersByTime(1_500);
        expect(cache.get('q1')).toBeUndefined();
        expect(cache.approxBytes).toBe(0);

        cache.set('q2', [{ v: 2 }]);
        vi.advanceTimersByTime(1_500);
        expect(cache.has('q2')).toBe(false);
        expect(cache.approxBytes).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves maxEntries and TTL behaviour alone', () => {
      // A generous byte budget must not change what the count bound does.
      const cache = new QueryCache({ maxEntries: 2, maxBytes: 1024 * 1024 });
      cache.set('q1', [{ v: 1 }]);
      cache.set('q2', [{ v: 2 }]);
      cache.set('q3', [{ v: 3 }]);
      expect(cache.size).toBe(2);
      expect(cache.has('q1')).toBe(false);
      expect(cache.has('q3')).toBe(true);
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
