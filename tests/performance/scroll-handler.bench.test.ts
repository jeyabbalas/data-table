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
 * Both row counts (1M and 50M) exceed the 15M px spacer cap at 32px rows,
 * so every bench runs the compressed scroll mapping (jsdom reports
 * scrollHeight 0 → the mapping falls back to the requested physical
 * height, so maxScroll is identical at both counts and one set of
 * scrollTop patterns serves both). The linear bench's constant 13px
 * deltas exercise the LINEAR branch; the interleaved bench adds large
 * absolute jumps (every ~10th event) to exercise the PROPORTIONAL branch
 * alongside linear motion. The 50M-row variant is the regression guard
 * for the PROPORTIONAL branch's divide-before-multiply order: at 50M
 * rows `scrollTop * maxVirtualScrollTop` overflows 2^53, so the mapping
 * must divide first — and identical budgets at 50× the rows are what
 * "the mapping is O(1) in row count" means as a test.
 *
 * Local M1 medians: ~0.05ms median per call, ~0.2ms p99. Budgets are
 * generous to absorb GC pauses and CI variance.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { VirtualScroller } from '@/table/VirtualScroller';

const ROW_COUNTS = [1_000_000, 50_000_000] as const;
const ROW_HEIGHT = 32;
const VIEWPORT_HEIGHT = 600;
const SCROLL_ITERATIONS = 1_000;

// Per-scroll budgets — measured locally on M1. Generous for CI variance.
// Deliberately IDENTICAL for every row count: O(1) mapping math is the claim.
const MEDIAN_BUDGET_MS = 1;
const P99_BUDGET_MS = 16.6; // 60fps frame budget

// Every generated scrollTop stays strictly inside (0, maxScroll − 1), where
// maxScroll = 15_000_000 cap − 600 viewport = 14_999_400 in this jsdom setup.
// That matters: at scrollTop ≤ 0 or ≥ maxScroll − 1 the compressed mapping
// short-circuits into top/bottom reconciliation instead of the LINEAR /
// PROPORTIONAL branch the bench means to measure.

/**
 * Constant 13px advances (max 13_000 px). 13 px is intentionally not a
 * divisor of ROW_HEIGHT (32) — every iteration crosses a row boundary
 * somewhere, so each dispatch forces the range to actually recompute (the
 * early-return-when-unchanged path would otherwise skew the median).
 */
function linearTops(): number[] {
  const tops: number[] = [];
  for (let i = 0; i < SCROLL_ITERATIONS; i++) {
    tops.push((i + 1) * 13);
  }
  return tops;
}

/**
 * Interleaved pattern: every ~10th event is an absolute jump ≥1e6 px
 * (alternating between a ~12M and a ~1M band, both strictly inside
 * (0, maxScroll − 1)) → the PROPORTIONAL branch; all other events advance
 * by 13 px (not a divisor of ROW_HEIGHT) → the LINEAR branch with
 * row-boundary crossings, mirroring the linear bench.
 */
function interleavedTops(): number[] {
  const tops: number[] = [];
  let prev = 0;
  for (let i = 0; i < SCROLL_ITERATIONS; i++) {
    if (i % 10 === 9) {
      prev = (Math.floor(i / 10) % 2 === 0 ? 12_000_000 : 1_000_000) + i * 13;
    } else {
      prev += 13;
    }
    tops.push(prev);
  }
  return tops;
}

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

  /**
   * Mount a real VirtualScroller in jsdom, dispatch the given scrollTop
   * sequence as real 'scroll' events, and time each dispatch.
   *
   * Saves the rAF/cAF originals into the OUTER describe vars BEFORE
   * stubbing, so the afterEach restore contract holds even when an
   * assertion throws mid-bench.
   */
  function runScrollBench(
    totalRows: number,
    tops: number[],
  ): { median: number; p99: number; max: number; callbackCount: number; count: number } {
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

    scroller.setTotalRows(totalRows);

    // Time each dispatch individually so we can compute median + p99.
    const samples: number[] = [];
    for (const top of tops) {
      Object.defineProperty(scrollSource, 'scrollTop', {
        value: top,
        configurable: true,
      });
      const start = performance.now();
      scrollSource.dispatchEvent(new Event('scroll'));
      samples.push(performance.now() - start);
    }

    scroller.destroy();

    samples.sort((a, b) => a - b);
    return {
      median: samples[Math.floor(samples.length / 2)]!,
      p99: samples[Math.floor(samples.length * 0.99)]!,
      max: samples[samples.length - 1]!,
      callbackCount,
      count: samples.length,
    };
  }

  describe.each(ROW_COUNTS.map((rows) => [rows.toLocaleString('en-US'), rows] as const))(
    '%s rows',
    (_label, rows) => {
      it('1000 scroll events: median <1ms/call, p99 <16.6ms/call', () => {
        const r = runScrollBench(rows, linearTops());

        expect(r.callbackCount).toBeGreaterThan(0);
        expect(r.count).toBe(SCROLL_ITERATIONS);

        // Useful diagnostics in the test output if budgets bust.
        if (r.median > MEDIAN_BUDGET_MS || r.p99 > P99_BUDGET_MS) {
          console.warn(
            `[scroll-handler.bench] ${rows} rows linear median=${r.median.toFixed(3)}ms p99=${r.p99.toFixed(3)}ms max=${r.max.toFixed(3)}ms`,
          );
        }

        expect(r.median).toBeLessThan(MEDIAN_BUDGET_MS);
        expect(r.p99).toBeLessThan(P99_BUDGET_MS);
      });

      it('1000 interleaved scroll events (thumb-drag jumps every ~10th): median <1ms/call, p99 <16.6ms/call', () => {
        const r = runScrollBench(rows, interleavedTops());

        expect(r.callbackCount).toBeGreaterThan(0);
        expect(r.count).toBe(SCROLL_ITERATIONS);

        // Useful diagnostics in the test output if budgets bust.
        if (r.median > MEDIAN_BUDGET_MS || r.p99 > P99_BUDGET_MS) {
          console.warn(
            `[scroll-handler.bench] ${rows} rows interleaved median=${r.median.toFixed(3)}ms p99=${r.p99.toFixed(3)}ms max=${r.max.toFixed(3)}ms`,
          );
        }

        expect(r.median).toBeLessThan(MEDIAN_BUDGET_MS);
        expect(r.p99).toBeLessThan(P99_BUDGET_MS);
      });
    },
  );
});
