/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VirtualScroller,
  type VirtualScrollerOptions,
  type VisibleRange,
} from '@/table/VirtualScroller';

describe('VirtualScroller', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  const createScroller = (options: Partial<VirtualScrollerOptions> = {}) => {
    return new VirtualScroller(container, {
      rowHeight: 32,
      ...options,
    });
  };

  describe('constructor', () => {
    it('should create DOM structure with correct elements', () => {
      const scroller = createScroller();

      const scrollContainer = scroller.getScrollContainer();
      expect(scrollContainer).toBeDefined();
      expect(scrollContainer.className).toBe('dt-virtual-scroll');

      const viewportContainer = scroller.getViewportContainer();
      expect(viewportContainer).toBeDefined();
      expect(viewportContainer.className).toBe('dt-virtual-viewport');

      scroller.destroy();
    });

    it('should apply custom class prefix', () => {
      const scroller = createScroller({ classPrefix: 'custom' });

      expect(scroller.getScrollContainer().className).toBe('custom-virtual-scroll');
      expect(scroller.getViewportContainer().className).toBe('custom-virtual-viewport');

      scroller.destroy();
    });

    it('should append elements to container', () => {
      const scroller = createScroller();

      expect(container.contains(scroller.getScrollContainer())).toBe(true);

      scroller.destroy();
    });

    it('should use default buffer rows of 5', () => {
      const scroller = createScroller();

      // Set up a scenario where we can verify buffer
      // With rowHeight=32 and 100 rows, and viewport height 160 (5 rows visible)
      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });

      scroller.setTotalRows(100);

      const range = scroller.getVisibleRange();
      // At scroll 0, raw visible is 0-5, with buffer it should be 0-10
      expect(range.start).toBe(0);
      expect(range.end).toBe(10); // 5 visible + 5 buffer

      scroller.destroy();
    });

    it('should use custom buffer rows', () => {
      const scroller = createScroller({ bufferRows: 3 });

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });

      scroller.setTotalRows(100);

      const range = scroller.getVisibleRange();
      // With buffer of 3, should be 0-8 (5 visible + 3 buffer)
      expect(range.end).toBe(8);

      scroller.destroy();
    });
  });

  describe('setTotalRows', () => {
    it('should update content height', () => {
      const scroller = createScroller();

      scroller.setTotalRows(100);

      const contentContainer = scroller.getScrollContainer().firstElementChild as HTMLElement;
      expect(contentContainer.style.height).toBe('3200px'); // 100 * 32

      scroller.destroy();
    });

    it('should update content height with different row heights', () => {
      const scroller = createScroller({ rowHeight: 48 });

      scroller.setTotalRows(50);

      const contentContainer = scroller.getScrollContainer().firstElementChild as HTMLElement;
      expect(contentContainer.style.height).toBe('2400px'); // 50 * 48

      scroller.destroy();
    });

    it('should recalculate visible range', () => {
      const scroller = createScroller();
      const callback = vi.fn();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });

      scroller.onScroll(callback);
      callback.mockClear();

      scroller.setTotalRows(100);

      expect(callback).toHaveBeenCalled();

      scroller.destroy();
    });

    it('should return correct total rows', () => {
      const scroller = createScroller();

      scroller.setTotalRows(500);

      expect(scroller.getTotalRows()).toBe(500);

      scroller.destroy();
    });
  });

  describe('getVisibleRange', () => {
    it('should return empty range when no rows', () => {
      const scroller = createScroller();

      const range = scroller.getVisibleRange();

      expect(range.start).toBe(0);
      expect(range.end).toBe(0);
      expect(range.offsetY).toBe(0);

      scroller.destroy();
    });

    it('should calculate correct range at scroll position 0', () => {
      const scroller = createScroller();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });

      scroller.setTotalRows(100);

      const range = scroller.getVisibleRange();

      expect(range.start).toBe(0);
      expect(range.offsetY).toBe(0);

      scroller.destroy();
    });

    it('should calculate correct range at scrolled position', () => {
      const scroller = createScroller();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });
      Object.defineProperty(scroller.getScrollContainer(), 'scrollTop', {
        value: 320, // Scrolled down 10 rows
        configurable: true,
      });

      scroller.setTotalRows(100);

      const range = scroller.getVisibleRange();

      // Raw visible: rows 10-15 (scrollTop 320 / 32 = 10)
      // With buffer 5: rows 5-20
      expect(range.start).toBe(5);
      expect(range.end).toBe(20);
      expect(range.offsetY).toBe(160); // 5 * 32

      scroller.destroy();
    });

    it('should clamp range to valid bounds', () => {
      const scroller = createScroller();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });
      Object.defineProperty(scroller.getScrollContainer(), 'scrollTop', {
        value: 2880, // Scrolled near end (90 rows)
        configurable: true,
      });

      scroller.setTotalRows(100);

      const range = scroller.getVisibleRange();

      // Should not exceed totalRows
      expect(range.end).toBeLessThanOrEqual(100);

      scroller.destroy();
    });

    it('should handle zero viewport height gracefully', () => {
      const scroller = createScroller();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 0,
        configurable: true,
      });

      scroller.setTotalRows(100);

      const range = scroller.getVisibleRange();

      expect(range.start).toBe(0);
      expect(range.end).toBe(0);

      scroller.destroy();
    });
  });

  describe('onScroll', () => {
    it('should call callback immediately with current range', () => {
      const scroller = createScroller();
      const callback = vi.fn();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });

      scroller.setTotalRows(100);
      scroller.onScroll(callback);

      expect(callback).toHaveBeenCalledWith(scroller.getVisibleRange());

      scroller.destroy();
    });

    it('should not call callback immediately when no rows', () => {
      const scroller = createScroller();
      const callback = vi.fn();

      scroller.onScroll(callback);

      expect(callback).not.toHaveBeenCalled();

      scroller.destroy();
    });

    it('should return unsubscribe function', () => {
      const scroller = createScroller();
      const callback = vi.fn();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });

      scroller.setTotalRows(100);

      const unsubscribe = scroller.onScroll(callback);
      callback.mockClear();

      unsubscribe();

      // Trigger a range change
      Object.defineProperty(scroller.getScrollContainer(), 'scrollTop', {
        value: 320,
        configurable: true,
      });
      scroller.refresh();

      expect(callback).not.toHaveBeenCalled();

      scroller.destroy();
    });

    it('should support multiple callbacks', () => {
      const scroller = createScroller();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });

      scroller.setTotalRows(100);

      scroller.onScroll(callback1);
      scroller.onScroll(callback2);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();

      scroller.destroy();
    });
  });

  describe('scrollToRow', () => {
    // Note: jsdom doesn't support actual scrolling, so we verify by
    // checking that scrollTop is set (even though it may not persist)
    // and by checking the implementation logic

    it('should scroll to row at start alignment', () => {
      const scroller = createScroller();
      const scrollContainer = scroller.getScrollContainer();

      // Mock scrollTop setter to track what's being set - must set up before any access
      let lastScrollTop = 0;
      Object.defineProperty(scrollContainer, 'scrollTop', {
        get: () => lastScrollTop,
        set: (val) => { lastScrollTop = val; },
        configurable: true,
      });

      Object.defineProperty(scrollContainer, 'clientHeight', {
        value: 160,
        configurable: true,
      });

      // Mock offsetHeight for max scroll calculation
      const contentContainer = scrollContainer.firstElementChild as HTMLElement;
      Object.defineProperty(contentContainer, 'offsetHeight', {
        value: 3200,
        configurable: true,
      });

      scroller.setTotalRows(100);
      scroller.scrollToRow(20, 'start');

      expect(lastScrollTop).toBe(640); // 20 * 32

      scroller.destroy();
    });

    it('should scroll to row at center alignment', () => {
      const scroller = createScroller();
      const scrollContainer = scroller.getScrollContainer();

      let lastScrollTop = 0;
      Object.defineProperty(scrollContainer, 'scrollTop', {
        get: () => lastScrollTop,
        set: (val) => { lastScrollTop = val; },
        configurable: true,
      });

      Object.defineProperty(scrollContainer, 'clientHeight', {
        value: 160,
        configurable: true,
      });

      const contentContainer = scrollContainer.firstElementChild as HTMLElement;
      Object.defineProperty(contentContainer, 'offsetHeight', {
        value: 3200,
        configurable: true,
      });

      scroller.setTotalRows(100);
      scroller.scrollToRow(20, 'center');

      // Row 20 at 640, center of viewport 80, center of row 16
      // scrollTop = 640 - 80 + 16 = 576
      expect(lastScrollTop).toBe(576);

      scroller.destroy();
    });

    it('should scroll to row at end alignment', () => {
      const scroller = createScroller();
      const scrollContainer = scroller.getScrollContainer();

      let lastScrollTop = 0;
      Object.defineProperty(scrollContainer, 'scrollTop', {
        get: () => lastScrollTop,
        set: (val) => { lastScrollTop = val; },
        configurable: true,
      });

      Object.defineProperty(scrollContainer, 'clientHeight', {
        value: 160,
        configurable: true,
      });

      const contentContainer = scrollContainer.firstElementChild as HTMLElement;
      Object.defineProperty(contentContainer, 'offsetHeight', {
        value: 3200,
        configurable: true,
      });

      scroller.setTotalRows(100);
      scroller.scrollToRow(20, 'end');

      // Row 20 at 640, viewport height 160, row height 32
      // scrollTop = 640 - 160 + 32 = 512
      expect(lastScrollTop).toBe(512);

      scroller.destroy();
    });

    it('should default to start alignment', () => {
      const scroller = createScroller();
      const scrollContainer = scroller.getScrollContainer();

      let lastScrollTop = 0;
      Object.defineProperty(scrollContainer, 'scrollTop', {
        get: () => lastScrollTop,
        set: (val) => { lastScrollTop = val; },
        configurable: true,
      });

      Object.defineProperty(scrollContainer, 'clientHeight', {
        value: 160,
        configurable: true,
      });

      const contentContainer = scrollContainer.firstElementChild as HTMLElement;
      Object.defineProperty(contentContainer, 'offsetHeight', {
        value: 3200,
        configurable: true,
      });

      scroller.setTotalRows(100);
      scroller.scrollToRow(10);

      expect(lastScrollTop).toBe(320); // 10 * 32

      scroller.destroy();
    });

    it('should clamp to valid row index', () => {
      const scroller = createScroller();
      const scrollContainer = scroller.getScrollContainer();

      Object.defineProperty(scrollContainer, 'clientHeight', {
        value: 160,
        configurable: true,
      });

      // Mock offsetHeight for max scroll calculation
      const contentContainer = scrollContainer.firstElementChild as HTMLElement;
      Object.defineProperty(contentContainer, 'offsetHeight', {
        value: 3200, // 100 * 32
        configurable: true,
      });

      let lastScrollTop = 0;
      Object.defineProperty(scrollContainer, 'scrollTop', {
        get: () => lastScrollTop,
        set: (val) => { lastScrollTop = val; },
        configurable: true,
      });

      scroller.setTotalRows(100);

      // Try to scroll past end - should clamp to last row (99)
      scroller.scrollToRow(200, 'start');
      // Clamped to 99, but also clamped to maxScroll = 3200 - 160 = 3040
      expect(lastScrollTop).toBeLessThanOrEqual(3040);
      expect(lastScrollTop).toBeGreaterThan(0);

      // Try to scroll before start - should clamp to 0
      scroller.scrollToRow(-10, 'start');
      expect(lastScrollTop).toBe(0);

      scroller.destroy();
    });

    it('should not scroll past max scroll position', () => {
      const scroller = createScroller();
      const scrollContainer = scroller.getScrollContainer();

      Object.defineProperty(scrollContainer, 'clientHeight', {
        value: 160,
        configurable: true,
      });

      // Mock offsetHeight for max scroll calculation
      const contentContainer = scrollContainer.firstElementChild as HTMLElement;
      Object.defineProperty(contentContainer, 'offsetHeight', {
        value: 3200, // 100 * 32
        configurable: true,
      });

      scroller.setTotalRows(100);
      scroller.scrollToRow(99, 'start');

      // Max scroll = 3200 - 160 = 3040
      expect(scrollContainer.scrollTop).toBeLessThanOrEqual(3040);

      scroller.destroy();
    });
  });

  describe('getScrollTop', () => {
    it('should return current scroll position', () => {
      const scroller = createScroller();

      Object.defineProperty(scroller.getScrollContainer(), 'scrollTop', {
        value: 500,
        configurable: true,
      });

      expect(scroller.getScrollTop()).toBe(500);

      scroller.destroy();
    });
  });

  describe('getViewportHeight', () => {
    it('should return viewport height', () => {
      const scroller = createScroller();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 400,
        configurable: true,
      });

      expect(scroller.getViewportHeight()).toBe(400);

      scroller.destroy();
    });
  });

  describe('getRowHeight', () => {
    it('should return configured row height', () => {
      const scroller = createScroller({ rowHeight: 48 });

      expect(scroller.getRowHeight()).toBe(48);

      scroller.destroy();
    });
  });

  describe('refresh', () => {
    it('should recalculate visible range', () => {
      const scroller = createScroller();
      const callback = vi.fn();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });

      scroller.setTotalRows(100);
      scroller.onScroll(callback);
      callback.mockClear();

      // Change scroll position
      Object.defineProperty(scroller.getScrollContainer(), 'scrollTop', {
        value: 320,
        configurable: true,
      });

      scroller.refresh();

      expect(callback).toHaveBeenCalled();

      scroller.destroy();
    });
  });

  describe('viewport positioning', () => {
    it('should position viewport with translateY', () => {
      const scroller = createScroller();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });
      Object.defineProperty(scroller.getScrollContainer(), 'scrollTop', {
        value: 320, // Scrolled 10 rows
        configurable: true,
      });

      scroller.setTotalRows(100);

      const viewport = scroller.getViewportContainer();
      // Range starts at row 5 (10 - buffer 5), offsetY = 5 * 32 = 160
      expect(viewport.style.transform).toBe('translateY(160px)');

      scroller.destroy();
    });
  });

  describe('isDestroyed', () => {
    it('should return false before destroy', () => {
      const scroller = createScroller();

      expect(scroller.isDestroyed()).toBe(false);

      scroller.destroy();
    });

    it('should return true after destroy', () => {
      const scroller = createScroller();

      scroller.destroy();

      expect(scroller.isDestroyed()).toBe(true);
    });
  });

  describe('destroy', () => {
    it('should remove element from container', () => {
      const scroller = createScroller();
      const scrollContainer = scroller.getScrollContainer();

      expect(container.contains(scrollContainer)).toBe(true);

      scroller.destroy();

      expect(container.contains(scrollContainer)).toBe(false);
    });

    it('should clear callbacks', () => {
      const scroller = createScroller();
      const callback = vi.fn();

      Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', {
        value: 160,
        configurable: true,
      });

      scroller.setTotalRows(100);
      scroller.onScroll(callback);
      callback.mockClear();

      scroller.destroy();

      // Even if refresh is called, callback should not be called
      // (destroy sets destroyed flag)
      scroller.refresh();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should be idempotent', () => {
      const scroller = createScroller();

      scroller.destroy();
      scroller.destroy();
      scroller.destroy();

      expect(scroller.isDestroyed()).toBe(true);
    });

    it('should prevent further operations', () => {
      const scroller = createScroller();
      const callback = vi.fn();

      scroller.destroy();

      // These should not throw
      scroller.setTotalRows(100);
      scroller.scrollToRow(50);
      scroller.refresh();
      scroller.onScroll(callback);

      // Callback should not have been called
      expect(callback).not.toHaveBeenCalled();

      scroller.destroy();
    });
  });
});
