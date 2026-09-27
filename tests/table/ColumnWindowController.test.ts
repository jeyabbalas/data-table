/**
 * @vitest-environment jsdom
 *
 * `ColumnWindowController` on its own: the header and body scrollers kept
 * together, the table's programmatic sideways scrolls, and the columns it
 * publishes to mount. The same scrolling through a whole `TableContainer`
 * (the gutter, the header's echo, the filter hold, `render()`'s restore) is
 * in `TableContainer.test.ts` and `TableContainer.scroll.test.ts`.
 *
 * jsdom does no layout: widths are stubbed, `scrollLeft` is stored as written,
 * and no scroll event fires unless a test dispatches one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { batch } from '@/core/Signal';
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
let grid: HTMLElement;
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
  grid = document.createElement('div');
  headerArea = document.createElement('div');
  headerScroll = document.createElement('div');
  gutter = document.createElement('div');
  bodyScroll = document.createElement('div');
  headerArea.append(headerScroll, gutter);
  grid.append(headerArea, bodyScroll);
  root.append(grid);
  document.body.appendChild(root);
  viewport(bodyScroll, 300);

  controller = new ColumnWindowController({
    state,
    rootElement: root,
    headerArea,
    headerScroll,
    scrollbarGutter: gutter,
    bodyScroll,
    gridElement: grid,
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
    const before = controller.mountedColumns.get();
    controller.hold('j')();
    expect(controller.mountedColumns.get()).toBe(before);
  });
});

describe('the columns to mount', () => {
  const mounted = () => controller.mountedColumns.get().join(' ');

  /** Scroll the body as a user would, which reports it with a scroll event. */
  function scrollBody(left: number): void {
    bodyScroll.scrollLeft = left;
    bodyScroll.dispatchEvent(new Event('scroll'));
  }

  function resizeBody(width: number): void {
    viewport(bodyScroll, width);
    const observer = MockResizeObserver.instances.find((o) => o.observed.has(bodyScroll))!;
    observer.callback(
      [{ target: bodyScroll, contentRect: { width } } as unknown as ResizeObserverEntry],
      observer,
    );
  }

  it('are the columns in view and a viewport either side', () => {
    // A 300px view at 0: a, b, c in view; d, e, f within a viewport.
    expect(mounted()).toBe('a b c d e f');
    scrollBody(600);
    expect(mounted()).toBe('d e f g h i j');
  });

  it('are every visible column until the body has a width', () => {
    resizeBody(0);
    expect(mounted()).toBe('a b c d e f g h i j');
    resizeBody(300);
    expect(mounted()).toBe('a b c d e f');
  });

  it('stay put for a scroll that keeps half a viewport in hand, and are republished only on change', () => {
    const heard: string[] = [];
    controller.mountedColumns.subscribe((columns) => heard.push(columns.join(' ')));

    // At 100 the view needs up to 550: `f`, which ends at 600, is enough.
    scrollBody(100);
    scrollBody(50);
    expect(heard).toEqual([]);

    // At 300 it needs up to 750, so `g` and `h`: recomputed around the view.
    scrollBody(300);
    expect(heard).toEqual(['a b c d e f g h i']);
  });

  it('always start with the pinned block, however far the view is from it', () => {
    actions.toggleColumnPin('j');
    scrollBody(600);
    expect(mounted().split(' ')[0]).toBe('j');
    expect(mounted()).toBe('j d e f g h i');
  });

  it("keep the cursor's column mounted wherever it is, in its place in the order", () => {
    actions.setFocusedCell({ row: 3, column: 'i' });
    expect(mounted()).toBe('a b c d e f i');
    // A header cursor too.
    actions.setFocusedCell({ row: -1, column: 'h' });
    expect(mounted()).toBe('a b c d e f h');
    actions.clearFocusedCell();
    expect(mounted()).toBe('a b c d e f');
  });

  it('keep the column holding DOM focus while the window is away, which leaves it focused', async () => {
    const cell = document.createElement('div');
    cell.setAttribute('data-column', 'j');
    cell.tabIndex = -1;
    bodyScroll.appendChild(cell);
    cell.focus();
    await Promise.resolve();
    expect(mounted()).toBe('a b c d e f j');

    // What switching apps sends: a focusout to nowhere, focus left in place.
    cell.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    await Promise.resolve();
    expect(document.activeElement).toBe(cell);
    expect(mounted()).toBe('a b c d e f j');
  });

  it('keep the column holding DOM focus mounted until focus leaves the grid', async () => {
    const cell = document.createElement('div');
    cell.setAttribute('data-column', 'j');
    cell.tabIndex = -1;
    bodyScroll.appendChild(cell);
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    cell.focus();
    await Promise.resolve();
    expect(mounted()).toBe('a b c d e f j');
    // Within the grid, to an element of no column: nothing is held.
    grid.tabIndex = 0;
    grid.focus();
    await Promise.resolve();
    expect(mounted()).toBe('a b c d e f');
    cell.focus();
    outside.focus();
    await Promise.resolve();
    expect(mounted()).toBe('a b c d e f');
  });

  it('follow a focus change a microtask later, never while the change is being made', async () => {
    const cell = document.createElement('div');
    cell.setAttribute('data-column', 'j');
    cell.tabIndex = -1;
    bodyScroll.appendChild(cell);
    const heard: string[] = [];
    controller.mountedColumns.subscribe((columns) => heard.push(columns.join(' ')));

    cell.focus();
    expect(heard).toEqual([]);
    await Promise.resolve();
    expect(heard).toEqual(['a b c d e f j']);
  });

  it('keep a held column mounted wherever it is, until every hold on it is released', () => {
    const first = controller.hold('i');
    expect(mounted()).toBe('a b c d e f i');
    const second = controller.hold('i');
    first();
    // A release counts once, however often it is called.
    first();
    expect(mounted()).toBe('a b c d e f i');
    second();
    expect(mounted()).toBe('a b c d e f');
  });

  it('keep a held column through scrolls and column changes, and publish a hold at once', () => {
    const heard: string[] = [];
    controller.mountedColumns.subscribe((columns) => heard.push(columns.join(' ')));
    const release = controller.hold('a');
    // Already in the run: nothing to publish.
    expect(heard).toEqual([]);
    scrollBody(600);
    expect(mounted()).toBe('a d e f g h i j');
    // Hiding `b` works the run out afresh, 100px further left.
    actions.hideColumn('b');
    expect(mounted()).toBe('a e f g h i j');
    release();
    expect(mounted()).toBe('e f g h i j');
    expect(heard).toEqual(['a d e f g h i j', 'a e f g h i j', 'e f g h i j']);
  });

  it('hold a hidden column for when it is shown', () => {
    actions.hideColumn('j');
    const release = controller.hold('j');
    expect(mounted()).toBe('a b c d e f');
    actions.showColumn('j');
    expect(mounted()).toBe('a b c d e f j');
    release();
    expect(mounted()).toBe('a b c d e f');
  });

  it('are worked out afresh when the columns change', () => {
    scrollBody(300);
    expect(mounted()).toBe('a b c d e f g h i');
    // Hiding `a` moves every column left by 100; the old run's indices
    // would now name other columns.
    actions.hideColumn('a');
    expect(mounted()).toBe('b c d e f g h i j');
  });

  it('follow new widths', () => {
    scrollBody(600);
    expect(mounted()).toBe('d e f g h i j');
    // `a` 700px wide puts b–j at 700–1,600: at 600, only `a` and the next
    // few are in reach.
    actions.setColumnWidth('a', 700);
    expect(mounted()).toBe('a b c d e f');
  });

  it('follow pinning alone, which moves no column', () => {
    scrollBody(600);
    expect(mounted()).toBe('d e f g h i j');
    // `a` leads the order already, so pinning it changes nothing else, as
    // undoing an unpin of it does.
    state.pinnedColumns.set(['a']);
    expect(mounted().split(' ')[0]).toBe('a');
  });

  it('are worked out from where the body can still scroll, when a change shortens the table', () => {
    // `a` 1,000px wide: 1,900px of content, at its far right.
    actions.setColumnWidth('a', 1000);
    scrollBody(1600);
    expect(mounted()).toBe('e f g h i j');
    // Hiding `a` leaves 900px, and the body will be clamped to 600 a frame
    // later; jsdom never clamps, which is that frame. From 1,600 the view
    // would meet no column at all, and the set would be empty.
    actions.hideColumn('a');
    expect(mounted()).toBe('e f g h i j');
  });

  it('are current for a subscriber to `schema` when a batch writes it before the columns', () => {
    // As loading data does, and `TableContainer` renders on `schema`.
    const seen: string[] = [];
    const unsubscribe = state.schema.subscribe(() => seen.push(mounted()));
    const k: ColumnSchema = { name: 'k', type: 'float', nullable: false, originalType: 'DOUBLE' };
    batch(() => {
      state.schema.set([k, ...SCHEMA]);
      state.columnOrder.set(['k', ...state.columnOrder.get()]);
      state.visibleColumns.set(['k', ...state.visibleColumns.get()]);
    });
    unsubscribe();
    expect(seen).toEqual(['k a b c d e']);
  });

  it('follow the controller’s own scrolls at once', () => {
    controller.revealColumn('j');
    expect(bodyScroll.scrollLeft).toBe(700);
    expect(mounted()).toBe('e f g h i j');
    controller.restorePosition({ left: 0, top: 0 });
    expect(mounted()).toBe('a b c d e f');
  });

  it('follow the header when it scrolls on its own', () => {
    headerScroll.scrollLeft = 600;
    headerScroll.dispatchEvent(new Event('scroll'));
    expect(mounted()).toBe('d e f g h i j');
  });

  it('are recomputed when the body is resized', () => {
    resizeBody(600);
    expect(mounted()).toBe('a b c d e f g h i j');
    resizeBody(100);
    expect(mounted()).toBe('a b');
  });
});

describe('the columns to mount, on a resize', () => {
  function resize(width: number, height: number): void {
    viewport(bodyScroll, width);
    const observer = MockResizeObserver.instances.find((o) => o.observed.has(bodyScroll))!;
    observer.callback(
      [{ target: bodyScroll, contentRect: { width, height } } as unknown as ResizeObserverEntry],
      observer,
    );
  }

  it('keep the run through a resize that leaves the width as it was', () => {
    bodyScroll.scrollLeft = 300;
    bodyScroll.dispatchEvent(new Event('scroll'));
    const before = controller.mountedColumns.get();
    expect(before.join(' ')).toBe('a b c d e f g h i');
    // Back to 150, where the run still covers the view: kept. A run worked
    // out afresh here would end at `h`.
    bodyScroll.scrollLeft = 150;
    bodyScroll.dispatchEvent(new Event('scroll'));
    expect(controller.mountedColumns.get()).toBe(before);
    resize(300, 200);
    expect(controller.mountedColumns.get()).toBe(before);
    // A new width is worked out afresh.
    resize(290, 200);
    expect(controller.mountedColumns.get().join(' ')).toBe('a b c d e f g h');
  });
});
