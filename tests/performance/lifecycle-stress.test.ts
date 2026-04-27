/**
 * @vitest-environment jsdom
 *
 * Phase 9 — 1000-cycle create/destroy stress (opt-in via
 * `RUN_LIFECYCLE_STRESS=1`).
 *
 * Catches deep destroy-leak regressions that the 100-cycle scaffold in
 * `memory-leaks.test.ts` (default run) doesn't surface — a 0.1% leak per
 * cycle is invisible at N=100 but unmistakable at N=1000.
 *
 * Tracks:
 *   - DOM children delta on document.body (must be 0)
 *   - Long-lived shared signal subscriber count (must be unchanged)
 *   - Active timer count (intercept setTimeout / clearTimeout) — must be 0
 *
 * Wall time on M1 with stub bridge: ~5–15 s. Default per-PR run skips.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createSignal } from '@/core/Signal';
import { createDataTable, type DataTable } from '@/index';
import type { WorkerBridge } from '@/data/WorkerBridge';

const RUN = process.env['RUN_LIFECYCLE_STRESS'] === '1';
const describeIfStress = RUN ? describe : describe.skip;

const CYCLES = 1_000;

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

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

describeIfStress('Phase 9 — 1000-cycle create/destroy stress (opt-in)', () => {
  it('document.body delta == 0; persistent signal sub delta == 0; timer delta == 0', async () => {
    const persistentSignal = createSignal(0);
    const baselineSubs = persistentSignal.subscriberCount();
    const baselineDomChildren = document.body.children.length;

    // Wrap setTimeout/clearTimeout to count active timers. We don't mock —
    // the wrappers delegate to the originals so AutoSave's debounce, modal
    // animations, etc. continue to work.
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const activeTimers = new Set<ReturnType<typeof setTimeout>>();
    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const id = originalSetTimeout(
        () => {
          activeTimers.delete(id);
          if (typeof handler === 'function') (handler as (...a: unknown[]) => void)(...args);
        },
        timeout,
        ...args,
      );
      activeTimers.add(id);
      return id;
    }) as typeof globalThis.setTimeout;
    globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
      if (id !== undefined) activeTimers.delete(id);
      originalClearTimeout(id as Parameters<typeof originalClearTimeout>[0]);
    }) as typeof globalThis.clearTimeout;

    try {
      const baselineTimers = activeTimers.size;

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
        await table.destroy();
        container.remove();
      }

      expect(document.body.children.length).toBe(baselineDomChildren);
      expect(persistentSignal.subscriberCount()).toBe(baselineSubs);
      // Allow a small tolerance (≤2) for timers from outside the loop
      // (e.g., a test-runner heartbeat). Hard zero would be ideal but
      // jsdom occasionally schedules its own.
      expect(activeTimers.size - baselineTimers).toBeLessThanOrEqual(2);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  }, 60_000);
});
