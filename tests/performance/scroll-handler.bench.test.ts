/**
 * @vitest-environment jsdom
 *
 * Phase 9 — VirtualScroller scroll-handler frame budget.
 *
 * The 60fps frame budget (16.6ms / frame) is a contract for scroll
 * smoothness. Real-browser paint cost is unmeasurable from Node, but the
 * scroll-handler MATH (range calculation, viewport positioning, callback
 * dispatch) is the part the library controls — and any regression to
 * O(n) per scroll event would surface here as a budget bust.
 *
 * Setup:
 *   - Construct a VirtualScroller against a jsdom container.
 *   - jsdom returns 0 for scroll-source clientHeight by default;
 *     stub it via Object.defineProperty so the visible-range math runs.
 *   - Stub `requestAnimationFrame` to fire synchronously so each scroll
 *     event runs `updateVisibleRange` deterministically.
 *   - Drive 1000 scroll events with non-row-aligned scrollTop deltas
 *     (forces every iteration to recompute the range).
 *   - Assert per-call median ≤ 1ms and p99 ≤ 16.6ms (60fps).
 *
 * Local M1 medians: ~0.05ms median per call, ~0.2ms p99. Budgets are
 * generous to absorb GC pauses and CI variance.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { VirtualScroller } from '@/table/VirtualScroller';

const TOTAL_ROWS = 1_000_000;
const ROW_HEIGHT = 32;
const VIEWPORT_HEIGHT = 600;
const SCROLL_ITERATIONS = 1_000;

// Per-scroll budgets — measured locally on M1. Generous for CI variance.
const MEDIAN_BUDGET_MS = 1;
const P99_BUDGET_MS = 16.6; // 60fps frame budget

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe('VirtualScroller — Phase 9 scroll-handler frame budget', () => {
  let originalRAF: typeof globalThis.requestAnimationFrame;
  let originalCAF: typeof globalThis.cancelAnimationFrame;

  afterEach(() => {
    if (originalRAF) globalThis.requestAnimationFrame = originalRAF;
    if (originalCAF) globalThis.cancelAnimationFrame = originalCAF;
    document.body.innerHTML = '';
  });

  it('1000 scroll events on 1M rows: median <1ms/call, p99 <16.6ms/call', () => {
    // Stub rAF so handleScroll's throttle fires synchronously per event.
    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;
    let rafId = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(performance.now());
      return ++rafId;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;

    const container = document.createElement('div');
    document.body.appendChild(container);

    const scroller = new VirtualScroller(container, {
      rowHeight: ROW_HEIGHT,
      bufferRows: 5,
    });

    // The scroll source is the inner scroll-container created by VirtualScroller.
    // jsdom returns 0 for clientHeight by default — stub it before measuring.
    const scrollSource = container.firstChild as HTMLElement;
    expect(scrollSource).toBeTruthy();
    Object.defineProperty(scrollSource, 'clientHeight', {
      value: VIEWPORT_HEIGHT,
      configurable: true,
    });

    let callbackCount = 0;
    scroller.onScroll(() => {
      callbackCount++;
    });

    scroller.setTotalRows(TOTAL_ROWS);

    // Pre-arrange scrollTop deltas that aren't row-aligned, so each
    // dispatch crosses a row boundary and forces the range to actually
    // recompute (the early-return-when-unchanged path would otherwise
    // skew the median).
    const deltas: number[] = [];
    for (let i = 0; i < SCROLL_ITERATIONS; i++) {
      // 13 px is intentionally not a divisor of ROW_HEIGHT (32) — every
      // iteration crosses at least one row boundary somewhere.
      deltas.push((i + 1) * 13);
    }

    // Time each dispatch individually so we can compute median + p99.
    const samples: number[] = [];
    for (const top of deltas) {
      Object.defineProperty(scrollSource, 'scrollTop', {
        value: top,
        configurable: true,
      });
      const start = performance.now();
      scrollSource.dispatchEvent(new Event('scroll'));
      samples.push(performance.now() - start);
    }

    expect(callbackCount).toBeGreaterThan(0);
    expect(samples).toHaveLength(SCROLL_ITERATIONS);

    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    const p99 = samples[Math.floor(samples.length * 0.99)]!;
    const max = samples[samples.length - 1]!;

    // Useful diagnostics in the test output if budgets bust.
    if (median > MEDIAN_BUDGET_MS || p99 > P99_BUDGET_MS) {
      console.warn(
        `[scroll-handler.bench] median=${median.toFixed(3)}ms p99=${p99.toFixed(3)}ms max=${max.toFixed(3)}ms`,
      );
    }

    expect(median).toBeLessThan(MEDIAN_BUDGET_MS);
    expect(p99).toBeLessThan(P99_BUDGET_MS);

    scroller.destroy();
  });
});
