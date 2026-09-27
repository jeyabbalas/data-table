/**
 * @vitest-environment jsdom
 *
 * `ColumnWindowController` on its own: the header and body scrollers kept
 * together, and the table's programmatic sideways scrolls. The same behaviour
 * through a whole `TableContainer` (the gutter, the header's echo, the filter
 * hold, `render()`'s restore) is in `TableContainer.test.ts` and
 * `TableContainer.scroll.test.ts`.
 *
 * jsdom does no layout: widths are stubbed, `scrollLeft` is stored as written,
 * and no scroll event fires unless a test dispatches one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { getColumnLayout } from '@/table/ColumnLayout';
import { ColumnWindowController, revealTarget } from '@/table/ColumnWindowController';

class MockResizeObserver implements ResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly observed = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe(element: Element): void {
    this.observed.add(element);
  }
  unobserve(element: Element): void {
    this.observed.delete(element);
  }
  disconnect(): void {
    this.observed.clear();
  }
}

const bridge = {
  query: vi.fn().mockResolvedValue([]),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

/** Ten 100px columns, `a`…`j`: the content is 1,000px wide. */
const SCHEMA: ColumnSchema[] = 'abcdefghij'
  .split('')
  .map((name) => ({ name, type: 'float', nullable: false, originalType: 'DOUBLE' }));

let state: TableState;
let actions: StateActions;
let root: HTMLElement;
let headerArea: HTMLElement;
let headerScroll: HTMLElement;
let gutter: HTMLElement;
let bodyScroll: HTMLElement;
let controller: ColumnWindowController;

function viewport(el: HTMLElement, width: number): void {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });

  state = createTableState();
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  actions = new StateActions(state, bridge);
  for (const { name } of SCHEMA) actions.setColumnWidth(name, 100);

  root = document.createElement('div');
  headerArea = document.createElement('div');
  headerScroll = document.createElement('div');
  gutter = document.createElement('div');
  bodyScroll = document.createElement('div');
  headerArea.append(headerScroll, gutter);
  root.append(headerArea, bodyScroll);
  document.body.appendChild(root);
  viewport(bodyScroll, 300);

  controller = new ColumnWindowController({
    state,
    rootElement: root,
    headerArea,
    headerScroll,
    scrollbarGutter: gutter,
    bodyScroll,
  });
});

afterEach(() => {
  controller.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('revealTarget', () => {
  const at = (column: string, scrollLeft: number, width = 300) =>
    revealTarget(getColumnLayout(state), column, scrollLeft, width);

  it('leaves a column in view where it is', () => {
    expect(at('b', 0)).toBeNull();
    expect(at('e', 200)).toBeNull();
  });

  it('brings a column on the left to the left edge, and one on the right to the right edge', () => {
    expect(at('b', 400)).toBe(100);
    expect(at('h', 0)).toBe(500);
  });

  it('counts the pinned block as covering the left of the view', () => {
    actions.toggleColumnPin('a');
    // `c` spans 200–300; right of a 100px block, it is in view at 100.
    expect(at('c', 400)).toBe(100);
    expect(at('c', 100)).toBeNull();
  });

  it('leaves pinned, hidden and unknown columns alone, and a view with no width', () => {
    actions.toggleColumnPin('a');
    actions.hideColumn('e');
    expect(at('a', 500)).toBeNull();
    expect(at('e', 0)).toBeNull();
    expect(at('zz', 0)).toBeNull();
    expect(at('h', 0, 0)).toBeNull();
  });

  it('shows the start of a column wider than the view, and leaves it once it fills the view', () => {
    actions.setColumnWidth('e', 500);
    // `e` spans 400–900 in a 300px view.
    expect(at('e', 0)).toBe(400);
    expect(at('e', 450)).toBeNull();
    expect(at('e', 700)).toBe(400);
  });
});

describe('ColumnWindowController', () => {
  it('reveals a column by scrolling the body and the header together', () => {
    expect(controller.revealColumn('h')).toBe(true);
    expect(bodyScroll.scrollLeft).toBe(500);
    // At once, not on the body's scroll event a frame later.
    expect(headerScroll.scrollLeft).toBe(500);
    expect(controller.revealColumn('h')).toBe(false);
  });

  it('keeps the header on the body when the body scrolls', () => {
    bodyScroll.scrollLeft = 240;
    bodyScroll.dispatchEvent(new Event('scroll'));
    expect(headerScroll.scrollLeft).toBe(240);
  });

  it('moves the body when the header scrolls on its own', () => {
    headerScroll.scrollLeft = 180;
    headerScroll.dispatchEvent(new Event('scroll'));
    expect(bodyScroll.scrollLeft).toBe(180);
  });

  it('puts a saved position back on both scrollers', () => {
    bodyScroll.scrollLeft = 350;
    bodyScroll.scrollTop = 64;
    const saved = controller.savePosition();
    bodyScroll.scrollLeft = 0;
    bodyScroll.scrollTop = 0;
    headerScroll.scrollLeft = 0;

    controller.restorePosition(saved);
    expect(bodyScroll.scrollLeft).toBe(350);
    expect(bodyScroll.scrollTop).toBe(64);
    expect(headerScroll.scrollLeft).toBe(350);
  });

  it('names the first column in view right of the pinned block', () => {
    expect(controller.firstUnpinnedColumnInView()).toBe('a');
    actions.toggleColumnPin('a');
    bodyScroll.scrollLeft = 250;
    // The block ends at 350 in content: `d` (300–400) is the first past it.
    expect(controller.firstUnpinnedColumnInView()).toBe('d');
  });

  describe('scrollToEnd', () => {
    /** `scrollTo` that jumps, as jsdom has none; the smooth part is the test's to play. */
    function stubScrollTo(): ReturnType<typeof vi.fn> {
      const scrollTo = vi.fn();
      bodyScroll.scrollTo = scrollTo as unknown as typeof bodyScroll.scrollTo;
      return scrollTo;
    }

    it('scrolls the header at once and the body smoothly, two frames on', () => {
      const scrollTo = stubScrollTo();
      Object.defineProperty(bodyScroll, 'scrollWidth', { configurable: true, value: 1000 });
      controller.scrollToEnd();
      expect(scrollTo).not.toHaveBeenCalled();

      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
      expect(scrollTo).toHaveBeenCalledWith({ left: 1000, behavior: 'smooth' });
      expect(headerScroll.scrollLeft).toBe(1000);
    });

    it("ignores the header's scroll while the body is still moving, and lines them up at the end", () => {
      stubScrollTo();
      controller.scrollToEnd();
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();

      // Mid-animation, the header's own scroll event must not pull the body
      // back to where the header is.
      bodyScroll.scrollLeft = 300;
      headerScroll.scrollLeft = 700;
      headerScroll.dispatchEvent(new Event('scroll'));
      expect(bodyScroll.scrollLeft).toBe(300);

      bodyScroll.scrollLeft = 700;
      bodyScroll.dispatchEvent(new Event('scrollend'));
      expect(headerScroll.scrollLeft).toBe(700);
      headerScroll.scrollLeft = 650;
      headerScroll.dispatchEvent(new Event('scroll'));
      expect(bodyScroll.scrollLeft).toBe(650);
    });

    it('ends once the body has held still, where there is no scrollend', () => {
      stubScrollTo();
      controller.scrollToEnd();
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
      bodyScroll.scrollLeft = 700;
      // Three still frames past the 100ms floor.
      vi.advanceTimersByTime(200);

      headerScroll.scrollLeft = 650;
      headerScroll.dispatchEvent(new Event('scroll'));
      expect(bodyScroll.scrollLeft).toBe(650);
    });

    it('does nothing once destroyed', () => {
      const scrollTo = stubScrollTo();
      controller.scrollToEnd();
      controller.destroy();
      vi.advanceTimersByTime(100);
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  it('stops syncing, observing and holding once destroyed', () => {
    const observer = MockResizeObserver.instances.find((o) => o.observed.has(bodyScroll))!;
    bodyScroll.scrollLeft = 400;
    actions.addFilter({ type: 'range', column: 'a', min: 0, max: 1 });
    controller.destroy();

    expect(observer.observed.size).toBe(0);
    bodyScroll.scrollLeft = 0;
    vi.advanceTimersByTime(50);
    expect(bodyScroll.scrollLeft).toBe(0);
    bodyScroll.scrollLeft = 120;
    bodyScroll.dispatchEvent(new Event('scroll'));
    expect(headerScroll.scrollLeft).toBe(0);
    expect(controller.revealColumn('j')).toBe(false);
  });
});
