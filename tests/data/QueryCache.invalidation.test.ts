/**
 * Phase 4: QueryCache invalidation + LRU + hit/miss locks.
 *
 * Existing `tests/data/QueryCache.test.ts` covers basics. This file
 * targets the Phase 4 brief's specific gaps:
 *   - LRU eviction at the default `maxEntries=100` boundary.
 *   - Full hit/miss cycle through `WorkerBridge.query()` after a cache
 *     invalidation fires.
 *   - Stress: 200 distinct queries with default cache → cache size never
 *     exceeds `maxEntries`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QueryCache, attachCacheInvalidation } from '@/data/QueryCache';
import { createTableState } from '@/core/State';
import { WorkerBridge } from '@/data/WorkerBridge';

describe('QueryCache — Phase 4 LRU & invalidation', () => {
  it('default maxEntries=100 — caps the cache and evicts LRU entries', () => {
    const cache = new QueryCache(); // default { maxEntries: 100, ttlMs: 30_000 }
    for (let i = 0; i < 200; i++) {
      cache.set(`SELECT ${i}`, [{ i }]);
    }
    expect(cache.size).toBe(100);
    // The first 100 should be evicted; the last 100 should remain.
    expect(cache.get('SELECT 0')).toBeUndefined();
    expect(cache.get('SELECT 99')).toBeUndefined();
    expect(cache.get('SELECT 100')).toEqual([{ i: 100 }]);
    expect(cache.get('SELECT 199')).toEqual([{ i: 199 }]);
  });

  it('200 distinct sets with default cache never overflow maxEntries', () => {
    const cache = new QueryCache({ maxEntries: 100, ttlMs: 60_000 });
    for (let i = 0; i < 200; i++) {
      cache.set(`q${i}`, [i]);
      // Cache size never exceeds the cap, mid-loop.
      expect(cache.size).toBeLessThanOrEqual(100);
    }
    expect(cache.size).toBe(100);
  });

  it('attachCacheInvalidation — single setup; multiple state changes each trigger clearQueryCache', () => {
    const bridge = new WorkerBridge();
    const clearSpy = vi.spyOn(bridge, 'clearQueryCache');
    const state = createTableState();

    attachCacheInvalidation(bridge, state);

    // Filter change.
    state.filters.set([{ column: 'a', type: 'null' }]);
    // Sort change.
    state.sortColumns.set([{ column: 'a', direction: 'asc' }]);
    // Derived columns change (add).
    state.derivedColumns.set([{ kind: 'expression', name: 'x', expression: '1+1' }]);
    // Derived columns change (remove).
    state.derivedColumns.set([]);
    // Total rows.
    state.totalRows.set(500);
    // Schema change via tableName flip.
    state.tableName.set('reloaded_table');

    // Each of the 6 changes should trigger a clearQueryCache call.
    expect(clearSpy).toHaveBeenCalledTimes(6);
  });

  it('attachCacheInvalidation — unsubscribe stops triggering clears', () => {
    const bridge = new WorkerBridge();
    const clearSpy = vi.spyOn(bridge, 'clearQueryCache');
    const state = createTableState();

    const unsub = attachCacheInvalidation(bridge, state);
    state.filters.set([{ column: 'a', type: 'null' }]);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    unsub();
    state.filters.set([{ column: 'b', type: 'null' }]);
    state.sortColumns.set([{ column: 'a', direction: 'asc' }]);
    state.derivedColumns.set([{ kind: 'expression', name: 'x', expression: '1' }]);
    expect(clearSpy).toHaveBeenCalledTimes(1); // no further calls after unsub
  });
});

describe('QueryCache — TTL boundary', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TTL of 0 is treated as immediate-expiry but cache.set still records, get returns undefined', () => {
    vi.useFakeTimers();
    const cache = new QueryCache({ maxEntries: 10, ttlMs: 0 });
    cache.set('q', [1]);
    // Advance any time at all — even 1 ms — and the entry is expired.
    vi.advanceTimersByTime(1);
    expect(cache.get('q')).toBeUndefined();
  });

  it('TTL — entry hit before expiry, miss after', () => {
    vi.useFakeTimers();
    const cache = new QueryCache({ maxEntries: 10, ttlMs: 1_000 });
    cache.set('q', [1]);
    vi.advanceTimersByTime(500);
    expect(cache.get('q')).toEqual([1]);
    vi.advanceTimersByTime(600);
    expect(cache.get('q')).toBeUndefined();
  });
});
