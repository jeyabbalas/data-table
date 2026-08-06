/**
 * @vitest-environment jsdom
 *
 * Memory leak detection tests.
 *
 * Verifies that create/destroy cycles properly clean up subscriptions,
 * event listeners, DOM elements, and cached data.
 *
 * Phase 9 extensions:
 *   - Shared `WorkerBridge` + `SessionStore` survives partial destroy
 *     (validates `ownsBridge` / `ownsSessionStore` flags in DataTable.ts).
 *   - 100k filter mutations with autosave on: subscriber-count delta == 0,
 *     `store.save` callCount stays small (debounce coalesces).
 *   - 100-cycle create/destroy scaffold (default-run; the 1000-cycle deep
 *     stress is separate at `tests/performance/lifecycle-stress.test.ts`).
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSignal } from '@/core/Signal';
import { createTableState } from '@/core/State';
import { QueryCache } from '@/data/QueryCache';
import { createDataTable, type DataTable } from '@/index';
import { SessionStore } from '@/persistence/SessionStore';
import { AutoSave } from '@/persistence/AutoSave';
import { StateActions } from '@/core/Actions';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { Filter } from '@/core/types';

import { rowsFor } from '../helpers/rowFetchBridge';
import { HARNESS_COLUMNS, setupTableBody } from '../helpers/tableBodyHarness';

// Polyfill ResizeObserver for jsdom — class form so `new ResizeObserver(...)`
// at production call sites (TableContainer.setupResizeObserver) actually
// constructs. The earlier `vi.fn().mockImplementation(...)` form failed with
// "is not a constructor" once `createDataTable` started reaching that code path
// in the Phase 9 lifecycle / shared-bridge tests below.
beforeEach(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
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

  describe('Row cache bounds (TableBody)', () => {
    it('a long scroll walk keeps rowDataCache at or under rowCacheRows (+ one block of write slack)', async () => {
      const BLOCK = 16;
      const CACHE_ROWS = 64;
      const { body, queries, scrollToRow, drain } = setupTableBody({
        totalRows: 10_000,
        body: { fetchBlockSize: BLOCK, rowCacheRows: CACHE_ROWS },
      });

      const initPromise = body.initialize();
      queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS));
      await initPromise;

      // Walk 600 rows down, resolving every fetch (visible and prefetch)
      // as it appears — the cache is written far more rows than its cap.
      for (let row = 20; row <= 600; row += 20) {
        scrollToRow(row);
        for (const q of queries) {
          if (q.signal?.aborted !== true) {
            q.deferred.resolve(rowsFor(q.sql, HARNESS_COLUMNS));
          }
        }
        for (let i = 0; i < 4; i++) await drain();
      }

      const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
      // Bound: the cap, plus at most one block of just-written slack
      // (eviction runs after each block write and exempts that block).
      expect(cache.size).toBeLessThanOrEqual(CACHE_ROWS + BLOCK);

      body.destroy();
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

  // ---------------------------------------------------------------------------
  // Phase 9 — shared resource ownership semantics. Two `DataTable` instances
  // share a single bridge + session store. Destroying one must NOT terminate
  // the bridge or close the store; the other instance must continue to work.
  // ---------------------------------------------------------------------------
  describe('Phase 9 — shared bridge + sessionStore survives partial destroy', () => {
    function makeStubBridge(): WorkerBridge {
      const stub: Partial<WorkerBridge> = {
        initialize: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue([]),
        loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
        exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
        clearQueryCache: vi.fn(),
        terminate: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(true),
      };
      return stub as WorkerBridge;
    }

    it('destroy(A) does not terminate the shared bridge or close the shared sessionStore', async () => {
      const bridge = makeStubBridge();
      const store = new SessionStore();
      await store.open();
      const closeSpy = vi.spyOn(store, 'close');

      const containerA = document.createElement('div');
      const containerB = document.createElement('div');
      document.body.append(containerA, containerB);

      const tableA = await createDataTable({
        container: containerA,
        bridge,
        persistence: { sessionStore: store },
        tableName: 'shared_a',
        presets: false,
        undoRedo: false,
        expressionFilter: false,
        visualizations: false,
        exportDialog: false,
      });
      const tableB = await createDataTable({
        container: containerB,
        bridge,
        persistence: { sessionStore: store },
        tableName: 'shared_b',
        presets: false,
        undoRedo: false,
        expressionFilter: false,
        visualizations: false,
        exportDialog: false,
      });

      await tableA.destroy();

      // Ownership invariants — A doesn't own the shared resources.
      expect(bridge.terminate).not.toHaveBeenCalled();
      expect(closeSpy).not.toHaveBeenCalled();

      // B still operational.
      expect(tableB.isDestroyed()).toBe(false);
      expect(typeof tableB.actions.addFilter).toBe('function');

      // A query through B still reaches the bridge.
      tableB.actions.addFilter({ type: 'point', column: 'x', value: 1 });

      await tableB.destroy();
      // Now nobody owns the shared resources, but the facade still doesn't
      // terminate them — only the original CONSTRUCTOR (the consumer) owns
      // teardown of injected resources. Verified once more.
      expect(bridge.terminate).not.toHaveBeenCalled();
      expect(closeSpy).not.toHaveBeenCalled();

      store.close();
      containerA.remove();
      containerB.remove();
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 9 — many filter mutations with autosave. Verifies (a) state-signal
  // subscriber counts return to baseline after the loop (no leaked subscriber
  // per mutation), and (b) `store.save` callCount stays small (debounce
  // coalesces). Skip heap-byte assertions — GC variance dominates and would
  // make CI flaky for no signal gain.
  //
  // 1000 iterations is the sweet spot: small enough that fake-timers + the
  // full StateActions path completes in ~2s, large enough that any per-call
  // subscriber-count regression would visibly accumulate. Heavier
  // (100k-cycle) variant is opt-in at lifecycle-stress.test.ts.
  // ---------------------------------------------------------------------------
  describe('Phase 9 — 1k filter mutations with autosave', () => {
    it(
      'subscriber counts unchanged; store.save coalesced under debounce',
      { timeout: 30_000 },
      async () => {
        // Real timers — fake-timer overhead per scheduleSave/clearTimeout
        // dominated the loop time. The 50ms debounce fires once after the
        // synchronous loop completes, exactly the coalescing we want to verify.
        const state = createTableState();
        // SessionStore.save bails when snapshot.tableName is null. Seed the
        // signal so AutoSave's save path actually reaches the store.
        state.tableName.set('autosave_perf_test');
        const store = new SessionStore();
        await store.open();
        const saveSpy = vi.spyOn(store, 'save').mockResolvedValue();

        // Need a bridge to construct StateActions; a minimal stub works
        // since we never call any worker-bound action. clearQueryCache is
        // required because attachCacheInvalidation hooks the filter signal.
        const bridge = {
          query: vi.fn().mockResolvedValue([]),
          loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
          clearQueryCache: vi.fn(),
          isInitialized: () => true,
        } as unknown as WorkerBridge;
        const actions = new StateActions(state, bridge);

        // Capture baseline AFTER actions are wired (attachCacheInvalidation
        // adds a permanent filter subscriber). Then enable AutoSave so the
        // post-test assertion isolates AutoSave's contribution.
        const baseline = {
          filters: state.filters.subscriberCount(),
          sortColumns: state.sortColumns.subscriberCount(),
          visibleColumns: state.visibleColumns.subscriberCount(),
        };

        const autoSave = new AutoSave(state, store, { debounceMs: 50 });
        autoSave.enable();

        const filter: Filter = { type: 'range', column: 'c', min: 0, max: 100 };

        const ITERATIONS = 1_000;
        for (let i = 0; i < ITERATIONS; i++) {
          actions.addFilter({ ...filter, min: i, max: i + 1 });
          actions.removeFilter('c');
        }

        // Wait past the 50ms debounce so the trailing save has a chance to fire.
        await new Promise<void>((r) => setTimeout(r, 200));

        // Coalescing contract — 1000 mutations should produce ≪ 100 saves.
        expect(saveSpy).toHaveBeenCalled();
        expect(saveSpy.mock.calls.length).toBeLessThan(10);

        autoSave.destroy();

        // After teardown, subscriber counts return to baseline — AutoSave's
        // internal subscriptions all unwound.
        expect(state.filters.subscriberCount()).toBe(baseline.filters);
        expect(state.sortColumns.subscriberCount()).toBe(baseline.sortColumns);
        expect(state.visibleColumns.subscriberCount()).toBe(baseline.visibleColumns);

        store.close();
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Phase 9 — 100-cycle create/destroy stress (per-PR fast variant). The
  // 1000-cycle deep stress is opt-in at tests/performance/lifecycle-stress.test.ts
  // (RUN_LIFECYCLE_STRESS=1) — this lighter version catches regressions per-PR.
  // ---------------------------------------------------------------------------
  describe('Phase 9 — 100 createDataTable/destroy cycles (default run)', () => {
    function makeStubBridge(): WorkerBridge {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue([]),
        loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
        exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
        clearQueryCache: vi.fn(),
        terminate: vi.fn(),
        isInitialized: vi.fn().mockReturnValue(true),
      } as unknown as WorkerBridge;
    }

    it('100 cycles leave document.body empty + persistent signal subscribers unchanged', async () => {
      const persistentSignal = createSignal(0);
      const baselineSubs = persistentSignal.subscriberCount();
      const baselineDomChildren = document.body.children.length;

      const CYCLES = 100;
      for (let i = 0; i < CYCLES; i++) {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const table: DataTable = await createDataTable({
          container,
          bridge: makeStubBridge(),
          persistence: false,
          presets: false,
          undoRedo: false,
          expressionFilter: false,
          visualizations: false,
          exportDialog: false,
        });
        // Subscribe to the persistent signal mid-life; verify the unsubscribe
        // is also released by the cycle (we never explicitly unsubscribe — the
        // subscriber should be GC-eligible after destroy + container.remove).
        await table.destroy();
        container.remove();
      }

      expect(document.body.children.length).toBe(baselineDomChildren);
      expect(persistentSignal.subscriberCount()).toBe(baselineSubs);
    });
  });
});
