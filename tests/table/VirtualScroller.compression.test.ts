/**
 * @vitest-environment jsdom
 */
/**
 * Compressed-mode (scroll-space compression) suite for VirtualScroller.
 *
 * Harness geometry (used by most cases):
 *   rowHeight 32, maxVirtualHeight 3200, bufferRows 5, clientHeight 320,
 *   totalRows 1000
 *   → V (virtual height)          = 32,000 px
 *   → P (requested spacer height) = 3,200 px
 *   → maxScroll                   = 3,200 − 320  = 2,880 px
 *   → maxVTop                     = 32,000 − 320 = 31,680 px
 *   → compression ratio           = 31,680 / 2,880 = 11
 *
 * jsdom reports scrollHeight = 0, so the mapping's measured-extent fallback
 * (P = physicalHeight) is exercised for free; scrollHeight is stubbed only
 * where a case needs a measured value. Plain `scrollTop` writes persist in
 * jsdom, and recalculation is driven synchronously via `refresh()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VirtualScroller } from '@/table/VirtualScroller';

const ROW_HEIGHT = 32;
const MAX_VIRTUAL_HEIGHT = 3_200;
const VIEWPORT_HEIGHT = 320;
const TOTAL_ROWS = 1_000;
const MAX_SCROLL = 2_880; // 3200 − 320
const MAX_V_TOP = 31_680; // 32000 − 320

describe('VirtualScroller scroll-space compression', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /** Compressed harness: V = 32,000 px against a 3,200 px cap (ratio 11). */
  const createCompressedScroller = () => {
    const scroller = new VirtualScroller(container, {
      rowHeight: ROW_HEIGHT,
      maxVirtualHeight: MAX_VIRTUAL_HEIGHT,
      bufferRows: 5,
    });
    Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
      value: VIEWPORT_HEIGHT,
      configurable: true,
    });
    scroller.setTotalRows(TOTAL_ROWS);
    return scroller;
  };

  // Case 1 — spacer heights capped (legacy + external-scroller modes)
  it('caps the spacer height at maxVirtualHeight in both construction modes', () => {
    const scroller = createCompressedScroller();
    expect(scroller.getContentContainer().style.height).toBe('3200px');
    scroller.destroy();

    // External-scroller mode: the body container is capped identically.
    const external = document.createElement('div');
    const body = document.createElement('div');
    external.appendChild(body);
    document.body.appendChild(external);
    Object.defineProperty(external, 'clientHeight', {
      value: VIEWPORT_HEIGHT,
      configurable: true,
    });
    const externalScroller = new VirtualScroller(body, {
      rowHeight: ROW_HEIGHT,
      maxVirtualHeight: MAX_VIRTUAL_HEIGHT,
      bufferRows: 5,
      externalScrollContainer: external,
    });
    externalScroller.setTotalRows(TOTAL_ROWS);

    expect(externalScroller.getContentContainer().style.height).toBe('3200px');
    expect(body.style.height).toBe('3200px');

    externalScroller.destroy();
    document.body.removeChild(external);
  });

  // Case 2 — top boundary
  it('maps scrollTop 0 to the top of the virtual range', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    scrollContainer.scrollTop = 0;
    scroller.refresh();

    const range = scroller.getVisibleRange();
    expect(range.start).toBe(0);
    expect(range.offsetY).toBe(0);

    scroller.destroy();
  });

  // Case 3 — bottom boundary
  it('maps max physical scroll to the true last row, flush with the spacer bottom', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    scrollContainer.scrollTop = MAX_SCROLL;
    scroller.refresh();

    const range = scroller.getVisibleRange();
    expect(range.end).toBe(TOTAL_ROWS);
    expect(range.start).toBe(985);
    // offsetY = s − vTop + start·H = 2880 − 31680 + 985·32
    expect(range.offsetY).toBe(2_720);
    // Last row's physical bottom coincides with the spacer's bottom edge (P).
    expect(range.offsetY + (range.end - range.start) * ROW_HEIGHT).toBe(3_200);

    scroller.destroy();
  });

  // Case 4 — linear branch: small deltas track physical motion 1:1
  it('moves the virtual position by exactly the physical delta for small deltas', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    // Mid anchor: row 500 → vTop 16,000, physical round(16000/11) = 1455.
    scroller.scrollToRow(500, 'start');
    expect(scroller.getVirtualScrollTop()).toBe(16_000);
    expect(scrollContainer.scrollTop).toBe(1_455);

    scrollContainer.scrollTop = 1_455 + 32;
    scroller.refresh();
    expect(scroller.getVirtualScrollTop()).toBe(16_032);

    scrollContainer.scrollTop = 1_487 + 100;
    scroller.refresh();
    expect(scroller.getVirtualScrollTop()).toBe(16_132);

    scrollContainer.scrollTop = 1_587 - 100;
    scroller.refresh();
    expect(scroller.getVirtualScrollTop()).toBe(16_032);

    scroller.destroy();
  });

  // Case 5 — proportional branch: large deltas map across the full range
  it('maps large deltas proportionally across the virtual range', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    // Delta 1000 > viewport height 320 → proportional: 1000/2880 · 31680 = 11,000.
    scrollContainer.scrollTop = 1_000;
    scroller.refresh();

    expect(scroller.getVirtualScrollTop()).toBeCloseTo((1_000 / MAX_SCROLL) * MAX_V_TOP, 6);
    expect(scroller.getVirtualScrollTop()).toBeCloseTo(11_000, 6);

    scroller.destroy();
  });

  // Case 6 — top-trap regression: linear steps down always reach row 0
  it('reconciles to row 0 when linear scrolling reaches physical scrollTop 0', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    // Proportional jump to s = 500 (vTop = 5,500)...
    scrollContainer.scrollTop = 500;
    scroller.refresh();

    // ...then linear steps down to 0. Without the s ≤ 0 reconciliation the
    // anchor would strand at 5500 − 500 = 5,000 with no further scroll
    // events possible.
    for (const s of [400, 300, 200, 100, 0]) {
      scrollContainer.scrollTop = s;
      scroller.refresh();
    }

    const range = scroller.getVisibleRange();
    expect(range.start).toBe(0);
    expect(range.offsetY).toBe(0);
    expect(scroller.getVirtualScrollTop()).toBe(0);

    scroller.destroy();
  });

  // Case 7 — bottom snap tolerance (fractional scrollTop on hidpi)
  it('snaps to the bottom within 1 px of max scroll', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    scrollContainer.scrollTop = 2_879.5;
    scroller.refresh();

    expect(scroller.getVirtualScrollTop()).toBe(MAX_V_TOP);
    expect(scroller.getVisibleRange().end).toBe(TOTAL_ROWS);

    scroller.destroy();
  });

  // Case 8 — scrollToRow exactness
  it('scrollToRow start-alignment lands exactly on any row index', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    for (const k of [0, 123, 500]) {
      scroller.scrollToRow(k, 'start');
      const virtualTarget = k * ROW_HEIGHT;
      expect(Math.floor(scroller.getVirtualScrollTop() / ROW_HEIGHT)).toBe(k);
      expect(scroller.getVirtualScrollTop()).toBe(virtualTarget);
      expect(scrollContainer.scrollTop).toBe(Math.round((virtualTarget / MAX_V_TOP) * MAX_SCROLL));
    }

    scroller.destroy();
  });

  it('scrollToRow(999) clamps to max virtual scroll with row 999 visible', () => {
    // Row 999's raw start-target (31,968) exceeds maxVTop (31,680), so it
    // clamps — rows 990–999 share the final viewport page, same clamp
    // behavior scrollToRow has always had at max scroll.
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    scroller.scrollToRow(999, 'start');

    expect(scroller.getVirtualScrollTop()).toBe(MAX_V_TOP);
    // Physical target derives from the POST-clamp virtual target: exactly maxScroll.
    expect(scrollContainer.scrollTop).toBe(MAX_SCROLL);
    const range = scroller.getVisibleRange();
    expect(range.end).toBe(TOTAL_ROWS);
    expect(range.start).toBeLessThanOrEqual(999);

    scroller.destroy();
  });

  it('scrollToRow honors center and end alignment in virtual space', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    // center: 500·32 − 320/2 + 32/2 = 15,856 → physical round(15856/11) = 1441
    scroller.scrollToRow(500, 'center');
    expect(scroller.getVirtualScrollTop()).toBe(15_856);
    expect(scrollContainer.scrollTop).toBe(1_441);

    // end: 500·32 − 320 + 32 = 15,712 → physical round(15712/11) = 1428
    scroller.scrollToRow(500, 'end');
    expect(scroller.getVirtualScrollTop()).toBe(15_712);
    expect(scrollContainer.scrollTop).toBe(1_428);

    scroller.destroy();
  });

  it('keeps wheel continuity after a scrollToRow jump', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    scroller.scrollToRow(123, 'start');
    const startBefore = scroller.getVisibleRange().start;

    // One wheel tick after the jump: +32 physical px → +32 virtual px → +1 row.
    scrollContainer.scrollTop = scrollContainer.scrollTop + 32;
    scroller.refresh();

    expect(scroller.getVisibleRange().start).toBe(startBefore + 1);

    scroller.destroy();
  });

  // Case 9 — shrink under live scroll (guards the negative-LIMIT bug)
  it('keeps start ≤ end when totalRows shrinks under a live scroll (compressed)', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    scrollContainer.scrollTop = 2_000;
    scroller.refresh();

    scroller.setTotalRows(10);

    const range = scroller.getVisibleRange();
    expect(range.start).toBeLessThanOrEqual(range.end);
    expect(range.end).toBe(10);

    scroller.destroy();
  });

  it('keeps start ≤ end when totalRows shrinks under a live scroll (identity)', () => {
    const scroller = new VirtualScroller(container, { rowHeight: ROW_HEIGHT, bufferRows: 5 });
    const scrollContainer = scroller.getScrollContainer();
    Object.defineProperty(scrollContainer, 'clientHeight', {
      value: VIEWPORT_HEIGHT,
      configurable: true,
    });
    scroller.setTotalRows(TOTAL_ROWS);

    scrollContainer.scrollTop = 2_000;
    scroller.refresh();

    scroller.setTotalRows(10);

    const range = scroller.getVisibleRange();
    expect(range.start).toBeLessThanOrEqual(range.end);
    expect(range.end).toBe(10);

    scroller.destroy();
  });

  // Case 10 — identity purity: below the cap, scrollHeight is never read and
  // offsetY stays start·rowHeight
  it('never reads scrollHeight below the cap and keeps offsetY = start·rowHeight', () => {
    const external = document.createElement('div');
    const body = document.createElement('div');
    external.appendChild(body);
    document.body.appendChild(external);

    // Spy installed BEFORE construction so every lifecycle phase is covered.
    const scrollHeightSpy = vi.fn(() => 32_000);
    Object.defineProperty(external, 'clientHeight', {
      value: VIEWPORT_HEIGHT,
      configurable: true,
    });
    Object.defineProperty(external, 'scrollHeight', {
      get: scrollHeightSpy,
      configurable: true,
    });

    const scroller = new VirtualScroller(body, {
      rowHeight: ROW_HEIGHT,
      bufferRows: 5,
      externalScrollContainer: external,
    });

    const expectIdentityOffset = () => {
      const range = scroller.getVisibleRange();
      expect(range.offsetY).toBe(range.start * ROW_HEIGHT);
    };

    scroller.setTotalRows(TOTAL_ROWS); // V = 32,000 ≪ default 15M cap
    expectIdentityOffset();

    external.scrollTop = 640;
    scroller.refresh();
    expectIdentityOffset();

    scroller.refresh();
    expectIdentityOffset();

    scroller.scrollToRow(500, 'start');
    expectIdentityOffset();

    scroller.scrollToRow(999, 'end');
    expectIdentityOffset();

    expect(scrollHeightSpy).not.toHaveBeenCalled();

    scroller.destroy();
    document.body.removeChild(external);
  });

  // Case 11 — measured extent below the requested spacer height
  it('reaches the last row when the engine clamps below the requested height', () => {
    const scroller = createCompressedScroller();
    const scrollContainer = scroller.getScrollContainer();

    // Engine granted only 1,600 px of the requested 3,200 px.
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      value: 1_600,
      configurable: true,
    });

    // Measured maxScroll = 1600 − 320 = 1280 → bottom reconciliation.
    scrollContainer.scrollTop = 1_280;
    scroller.refresh();

    const range = scroller.getVisibleRange();
    expect(range.end).toBe(TOTAL_ROWS);
    expect(range.start).toBe(985);

    scroller.destroy();
  });

  // Case 12 — growing across the cap boundary preserves the anchor
  it('preserves the scroll anchor when totalRows grows across the cap boundary', () => {
    const scroller = new VirtualScroller(container, {
      rowHeight: ROW_HEIGHT,
      maxVirtualHeight: MAX_VIRTUAL_HEIGHT,
      bufferRows: 5,
    });
    const scrollContainer = scroller.getScrollContainer();
    Object.defineProperty(scrollContainer, 'clientHeight', {
      value: VIEWPORT_HEIGHT,
      configurable: true,
    });

    // Identity dataset: 50 rows → V = 1,600 ≤ 3,200 cap.
    scroller.setTotalRows(50);
    scrollContainer.scrollTop = 800;
    scroller.refresh();
    expect(scroller.getVirtualScrollTop()).toBe(800);

    // Growth pushes V to 32,000, past the cap: the physical position WAS the
    // virtual position, so the anchor must carry over unchanged (no
    // proportional teleport to 800 · 11 = 8,800).
    scroller.setTotalRows(TOTAL_ROWS);
    expect(scroller.getVirtualScrollTop()).toBe(800);

    scroller.destroy();
  });
});
