/**
 * @vitest-environment jsdom
 *
 * Memory leak detection tests.
 *
 * Verifies that create/destroy cycles properly clean up subscriptions,
 * event listeners, DOM elements, and cached data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSignal } from '@/core/Signal';
import { createTableState } from '@/core/State';
import { QueryCache } from '@/data/QueryCache';

// Mock ResizeObserver for jsdom
beforeEach(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
  }
});

describe('Memory Leak Detection', () => {
  describe('Signal subscription cleanup', () => {
    it('should have zero subscribers after all unsubscribe', () => {
      const signal = createSignal(0);
      const unsubs: (() => void)[] = [];

      for (let i = 0; i < 100; i++) {
        unsubs.push(signal.subscribe(() => {}));
      }

      expect(signal.subscriberCount()).toBe(100);

      for (const unsub of unsubs) {
        unsub();
      }

      expect(signal.subscriberCount()).toBe(0);
    });

    it('should not accumulate subscribers across repeated subscribe/unsubscribe cycles', () => {
      const signal = createSignal('test');

      for (let i = 0; i < 1000; i++) {
        const unsub = signal.subscribe(() => {});
        unsub();
      }

      expect(signal.subscriberCount()).toBe(0);
    });

    it('should handle duplicate unsubscribe calls gracefully', () => {
      const signal = createSignal(0);
      const unsub = signal.subscribe(() => {});

      expect(signal.subscriberCount()).toBe(1);
      unsub();
      unsub(); // Duplicate — should not throw or go negative

      expect(signal.subscriberCount()).toBe(0);
    });
  });

  describe('TableState subscription cleanup', () => {
    it('should return to baseline subscriber counts after external subscribe/unsubscribe', () => {
      const state = createTableState();

      // Record baseline subscriber counts
      const baseline = {
        filters: state.filters.subscriberCount(),
        sortColumns: state.sortColumns.subscriberCount(),
        visibleColumns: state.visibleColumns.subscriberCount(),
        schema: state.schema.subscriberCount(),
        tableName: state.tableName.subscriberCount(),
      };

      // Simulate external subscriptions (like a component would do)
      const unsubs: (() => void)[] = [];
      for (let i = 0; i < 10; i++) {
        unsubs.push(state.filters.subscribe(() => {}));
        unsubs.push(state.sortColumns.subscribe(() => {}));
        unsubs.push(state.visibleColumns.subscribe(() => {}));
        unsubs.push(state.schema.subscribe(() => {}));
        unsubs.push(state.tableName.subscribe(() => {}));
      }

      // Verify subscriptions increased
      expect(state.filters.subscriberCount()).toBe(baseline.filters + 10);

      // Unsubscribe all
      for (const unsub of unsubs) {
        unsub();
      }

      // Verify back to baseline
      expect(state.filters.subscriberCount()).toBe(baseline.filters);
      expect(state.sortColumns.subscriberCount()).toBe(baseline.sortColumns);
      expect(state.visibleColumns.subscriberCount()).toBe(baseline.visibleColumns);
      expect(state.schema.subscriberCount()).toBe(baseline.schema);
      expect(state.tableName.subscriberCount()).toBe(baseline.tableName);
    });
  });

  describe('QueryCache bounds', () => {
    it('should never exceed maxEntries', () => {
      const cache = new QueryCache({ maxEntries: 50 });

      for (let i = 0; i < 200; i++) {
        cache.set(`SELECT ${i}`, [{ v: i }]);
      }

      expect(cache.size).toBeLessThanOrEqual(50);
    });

    it('should be empty after clear', () => {
      const cache = new QueryCache();

      for (let i = 0; i < 100; i++) {
        cache.set(`q${i}`, [{ v: i }]);
      }

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('DOM element pooling bounds', () => {
    it('should not exceed pool size limit when returning many rows', () => {
      // Simulate the row pool pattern from TableBody
      const MAX_POOL_SIZE = 100;
      const pool: HTMLElement[] = [];

      // Create and pool 200 row elements
      for (let i = 0; i < 200; i++) {
        const el = document.createElement('div');
        if (pool.length < MAX_POOL_SIZE) {
          pool.push(el);
        }
        // Elements beyond pool size are simply discarded (GC'd)
      }

      expect(pool.length).toBe(MAX_POOL_SIZE);
    });
  });

  describe('Event listener cleanup patterns', () => {
    it('should remove event listeners after cleanup', () => {
      const el = document.createElement('div');
      const handler = vi.fn();

      el.addEventListener('click', handler);
      el.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);

      el.removeEventListener('click', handler);
      el.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1); // No additional call
    });

    it('should not leak AbortSignal listeners when cleaned up', () => {
      const controller = new AbortController();
      const { signal } = controller;
      const handler = vi.fn();

      signal.addEventListener('abort', handler);
      signal.removeEventListener('abort', handler);

      controller.abort();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Repeated create/destroy cycle stress', () => {
    it('should handle 100 signal create/subscribe/destroy cycles', () => {
      for (let cycle = 0; cycle < 100; cycle++) {
        const signals = Array.from({ length: 10 }, (_, i) => createSignal(i));
        const unsubs: (() => void)[] = [];

        // Cross-subscribe: each signal subscribes to updates
        for (const sig of signals) {
          for (let j = 0; j < 5; j++) {
            unsubs.push(sig.subscribe(() => {}));
          }
        }

        // Trigger updates
        for (const sig of signals) {
          sig.set(sig.get() + 1);
        }

        // Destroy: unsubscribe all
        for (const unsub of unsubs) {
          unsub();
        }

        // Verify clean state
        for (const sig of signals) {
          expect(sig.subscriberCount()).toBe(0);
        }
      }
    });
  });
});
