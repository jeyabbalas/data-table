/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableContainer, type TableContainerOptions } from '@/table/TableContainer';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;
  private observedElements: Set<Element> = new Set();
  static instances: MockResizeObserver[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observedElements.add(element);
  }

  unobserve(element: Element): void {
    this.observedElements.delete(element);
  }

  disconnect(): void {
    this.observedElements.clear();
  }

  // Helper to trigger resize
  triggerResize(entries: Partial<ResizeObserverEntry>[]): void {
    this.callback(entries as ResizeObserverEntry[], this);
  }

  getObservedElements(): Set<Element> {
    return this.observedElements;
  }

  static getLastInstance(): MockResizeObserver | undefined {
    return MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
  }

  /** The observer watching `element`: the body scroller has its own. */
  static observing(element: Element): MockResizeObserver | undefined {
    return MockResizeObserver.instances.find((o) => o.observedElements.has(element));
  }

  static clearInstances(): void {
    MockResizeObserver.instances = [];
  }
}

// Setup mock before tests
beforeEach(() => {
  MockResizeObserver.clearInstances();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  MockResizeObserver.clearInstances();
});

describe('TableContainer', () => {
  let container: HTMLElement;
  let state: TableState;

  beforeEach(() => {
    container = document.createElement('div');
    state = createTableState();
  });

  describe('constructor', () => {
    it('should create DOM structure with correct elements', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.getElement()).toBeDefined();
      expect(tableContainer.getHeaderRow()).toBeDefined();
      expect(tableContainer.getBodyContainer()).toBeDefined();

      tableContainer.destroy();
    });

    it('should apply default options', () => {
      const tableContainer = new TableContainer(container, state);

      const options = tableContainer.getOptions();
      expect(options.rowHeight).toBe(32);
      expect(options.headerHeight).toBe(120);
      expect(options.classPrefix).toBe('dt');

      tableContainer.destroy();
    });

    it('should apply custom options', () => {
      const customOptions: TableContainerOptions = {
        rowHeight: 40,
        headerHeight: 150,
        classPrefix: 'custom',
      };

      const tableContainer = new TableContainer(
        container,
        state,
        undefined,
        undefined,
        customOptions,
      );

      const options = tableContainer.getOptions();
      expect(options.rowHeight).toBe(40);
      expect(options.headerHeight).toBe(150);
      expect(options.classPrefix).toBe('custom');

      tableContainer.destroy();
    });

    it('should partially override default options', () => {
      const tableContainer = new TableContainer(container, state, undefined, undefined, {
        rowHeight: 50,
      });

      const options = tableContainer.getOptions();
      expect(options.rowHeight).toBe(50);
      expect(options.headerHeight).toBe(120); // default
      expect(options.classPrefix).toBe('dt'); // default

      tableContainer.destroy();
    });

    // `--dt-row-height` is not decorative: the stylesheet derives `.dt-row`'s
    // height from it *and* the `line-height` that re-centres text in every
    // cell using `align-self: stretch` (`.dt-cell--focused`,
    // `.dt-cell--derived`, annotation-tinted cells). Those cells opt out of
    // the row's `align-items: center`, so if the token keeps the stylesheet's
    // 32px default while the scroller lays rows out at `rowHeight`, they
    // render off-centre against their neighbours.
    it('should publish rowHeight and headerHeight as custom properties on the root', () => {
      const tableContainer = new TableContainer(container, state);
      const root = tableContainer.getElement();

      expect(root.style.getPropertyValue('--dt-row-height')).toBe('32px');
      expect(root.style.getPropertyValue('--dt-header-height')).toBe('120px');

      tableContainer.destroy();
    });

    it('should track a custom rowHeight in --dt-row-height', () => {
      const tableContainer = new TableContainer(container, state, undefined, undefined, {
        rowHeight: 48,
        headerHeight: 96,
      });
      const root = tableContainer.getElement();

      expect(root.style.getPropertyValue('--dt-row-height')).toBe('48px');
      expect(root.style.getPropertyValue('--dt-header-height')).toBe('96px');

      tableContainer.destroy();
    });

    // The invariant the token exists to preserve: whatever the scroller uses
    // for its row arithmetic is what CSS lays a row out at.
    it('should keep --dt-row-height equal to the row height the scroller uses', () => {
      for (const rowHeight of [16, 32, 48, 64]) {
        const host = document.createElement('div');
        const tableContainer = new TableContainer(host, createTableState(), undefined, undefined, {
          rowHeight,
        });

        expect(tableContainer.getElement().style.getPropertyValue('--dt-row-height')).toBe(
          `${tableContainer.getOptions().rowHeight}px`,
        );

        tableContainer.destroy();
      }
    });

    // `createDataTable` forwards `rowHeight: opts.rowHeight` and
    // `headerHeight: opts.headerHeight` verbatim, so leaving either off the
    // public options spreads an explicit `undefined` over the default here.
    // Both are interpolated into CSS lengths, where `undefined` produces the
    // invalid "undefinedpx" and the browser drops the declaration — which is
    // how the documented 120px header default reached no header at all.
    it('should not let an explicit undefined clobber the sizing defaults', () => {
      const tableContainer = new TableContainer(container, state, undefined, undefined, {
        rowHeight: undefined,
        headerHeight: undefined,
      });

      const options = tableContainer.getOptions();
      expect(options.rowHeight).toBe(32);
      expect(options.headerHeight).toBe(120);

      const root = tableContainer.getElement();
      expect(root.style.getPropertyValue('--dt-row-height')).toBe('32px');
      expect(root.style.getPropertyValue('--dt-header-height')).toBe('120px');
      expect(tableContainer.getHeaderRow().style.minHeight).toBe('120px');

      tableContainer.destroy();
    });

    // Written as an inline declaration so the option beats a stylesheet
    // override of the same token. The row height is also the virtual
    // scroller's scroll arithmetic, which cannot see a CSS value, so CSS
    // moving it alone would desync the scroller instead.
    it('should write the sizing tokens inline so the option wins the cascade', () => {
      const tableContainer = new TableContainer(container, state, undefined, undefined, {
        rowHeight: 40,
      });

      expect(tableContainer.getElement().getAttribute('style')).toContain('--dt-row-height: 40px');

      tableContainer.destroy();
    });

    it('should set up resize observer', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();

      expect(mockInstance).toBeDefined();
      expect(mockInstance?.getObservedElements().has(tableContainer.getElement())).toBe(true);

      tableContainer.destroy();
    });

    it('should append element to container', () => {
      const tableContainer = new TableContainer(container, state);

      expect(container.contains(tableContainer.getElement())).toBe(true);

      tableContainer.destroy();
    });
  });

  describe('DOM structure', () => {
    it('should have root element with correct class', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.getElement().className).toBe('dt-root');

      tableContainer.destroy();
    });

    it('should have root element with custom class prefix', () => {
      const tableContainer = new TableContainer(container, state, undefined, undefined, {
        classPrefix: 'my-table',
      });

      expect(tableContainer.getElement().className).toBe('my-table-root');

      tableContainer.destroy();
    });

    it('should have header row element with correct class', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.getHeaderRow().className).toBe('dt-header');

      tableContainer.destroy();
    });

    it('should have body container element with correct class', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.getBodyContainer().className).toBe('dt-body');

      tableContainer.destroy();
    });

    it('leaves the root roleless and puts grid semantics on .dt-grid', () => {
      state.schema.set([{ name: 'a', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
      state.tableName.set('t');
      const tableContainer = new TableContainer(container, state);

      // `.dt-root` hosts the grid AND its toolbar/status siblings, which no
      // table or grid role may own — so it carries no role at all.
      expect(tableContainer.getElement().getAttribute('role')).toBeNull();
      expect(tableContainer.getElement().hasAttribute('tabindex')).toBe(false);

      const grid = tableContainer.getGridElement();
      expect(grid.getAttribute('role')).toBe('grid');
      expect(grid.getAttribute('tabindex')).toBe('0');
      expect(grid.getAttribute('aria-label')).toBe('Data table');

      // The rowgroups are the scroll containers: they need `tabindex="-1"`
      // for scrollable-region-focusable, and a focusable roleless div is not
      // a permitted child of role="grid".
      expect(tableContainer.getScrollContainer().getAttribute('role')).toBe('rowgroup');
      expect(tableContainer.getHeaderScroll().getAttribute('role')).toBe('rowgroup');
      // `tabindex="0"`, not `-1`: `scrollable-region-focusable` asks whether
      // the region is in the TAB order, not whether it can take focus.
      expect(tableContainer.getScrollContainer().getAttribute('tabindex')).toBe('0');
      expect(tableContainer.getHeaderScroll().getAttribute('tabindex')).toBe('0');

      tableContainer.destroy();
    });

    it('drops grid semantics entirely while no data is loaded', () => {
      const tableContainer = new TableContainer(container, state);
      const grid = tableContainer.getGridElement();

      // An empty shell owns no rows, so role="grid" would be an
      // aria-required-children violation — and a tab stop with nothing to
      // navigate is just noise.
      expect(grid.hasAttribute('role')).toBe(false);
      expect(grid.hasAttribute('tabindex')).toBe(false);
      expect(grid.hasAttribute('aria-label')).toBe(false);
      expect(grid.hasAttribute('aria-rowcount')).toBe(false);

      // The scroll regions go quiet too — nothing overflows an empty shell,
      // so their tab stops would be two rings around empty chrome.
      expect(tableContainer.getHeaderScroll().hasAttribute('tabindex')).toBe(false);
      expect(tableContainer.getScrollContainer().hasAttribute('tabindex')).toBe(false);

      tableContainer.destroy();
    });

    it('should have header and body inside scroll structure', () => {
      const tableContainer = new TableContainer(container, state);
      const root = tableContainer.getElement();

      // Structure:
      // root > [filterBar] > grid > headerArea > (headerScroll > header) + scrollbarGutter
      //                           > bodyScroll > body
      const grid = root.children[0];
      expect(grid.className).toContain('dt-grid');
      expect(grid).toBe(tableContainer.getGridElement());

      const headerArea = grid.children[0];
      expect(headerArea.className).toContain('header-area');

      const headerScroll = headerArea.children[0];
      expect(headerScroll.className).toContain('header-scroll');
      expect(headerScroll.children[0]).toBe(tableContainer.getHeaderRow());

      const scrollbarGutter = headerArea.children[1];
      expect(scrollbarGutter.className).toContain('scrollbar-gutter');

      const bodyScroll = grid.children[1];
      expect(bodyScroll.className).toContain('body-scroll');
      expect(bodyScroll.children[0]).toBe(tableContainer.getBodyContainer());

      tableContainer.destroy();
    });

    it('mounts the filter bar above the grid', () => {
      const actions = new StateActions(state, mockBridge);
      const tableContainer = new TableContainer(container, state, actions, mockBridge);
      const root = tableContainer.getElement();

      expect(root.children[0]?.className).toContain('dt-filter-bar');
      expect(root.children[1]).toBe(tableContainer.getGridElement());

      tableContainer.destroy();
    });

    it('should set header min-height based on options', () => {
      const tableContainer = new TableContainer(container, state, undefined, undefined, {
        headerHeight: 200,
      });

      expect(tableContainer.getHeaderRow().style.minHeight).toBe('200px');

      tableContainer.destroy();
    });
  });

  describe('resize observer', () => {
    it('should fire callback on size change', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();
      const resizeCallback = vi.fn();

      tableContainer.onResize(resizeCallback);

      // Trigger resize
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).toHaveBeenCalledWith({ width: 800, height: 600 });

      tableContainer.destroy();
    });

    it('should provide dimensions via getDimensions', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();

      // Trigger resize
      mockInstance?.triggerResize([
        {
          contentRect: { width: 1024, height: 768 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(tableContainer.getDimensions()).toEqual({ width: 1024, height: 768 });

      tableContainer.destroy();
    });

    it('should not notify if dimensions have not changed', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();
      const resizeCallback = vi.fn();

      tableContainer.onResize(resizeCallback);

      // First resize
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).toHaveBeenCalledTimes(1);

      // Same dimensions again
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      // Should still be 1 (no additional call)
      expect(resizeCallback).toHaveBeenCalledTimes(1);

      tableContainer.destroy();
    });

    it('should call callback immediately with current dimensions if available', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();

      // Set initial dimensions
      mockInstance?.triggerResize([
        {
          contentRect: { width: 500, height: 400 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      // Subscribe after resize
      const resizeCallback = vi.fn();
      tableContainer.onResize(resizeCallback);

      // Should be called immediately with current dimensions
      expect(resizeCallback).toHaveBeenCalledWith({ width: 500, height: 400 });

      tableContainer.destroy();
    });

    it("sizes the header's scrollbar gutter to the body's vertical scrollbar", () => {
      const tableContainer = new TableContainer(container, state);
      const root = tableContainer.getElement();
      const body = root.querySelector<HTMLElement>('.dt-body-scroll')!;
      const gutter = root.querySelector<HTMLElement>('.dt-scrollbar-gutter')!;
      const resizeCallback = vi.fn();
      tableContainer.onResize(resizeCallback);
      const mockInstance = MockResizeObserver.observing(body)!;
      expect(mockInstance).toBeDefined();

      const measure = (border: number, content: number): void => {
        mockInstance.triggerResize([
          {
            target: body,
            contentRect: { width: content, height: 400 } as DOMRectReadOnly,
            borderBoxSize: [{ inlineSize: border, blockSize: 400 }],
            contentBoxSize: [{ inlineSize: content, blockSize: 400 }],
          },
        ]);
      };

      // A classic 15px scrollbar.
      measure(800, 785);
      expect(gutter.style.width).toBe('15px');
      // Overlay scrollbars, or too few rows to scroll.
      measure(800, 800);
      expect(gutter.style.width).toBe('0px');
      // A scrollbar that is a fraction of a pixel wide, at 125% zoom.
      measure(800.5, 787.7);
      expect(gutter.style.width).toBe('12.8px');
      // The body is not the container: the observer behind `onResize` does
      // not watch it, so its resizes are not reported as the container's.
      expect(MockResizeObserver.observing(root)?.getObservedElements().has(body)).toBe(false);
      expect(resizeCallback).not.toHaveBeenCalled();

      tableContainer.destroy();
    });

    it('falls back to client widths, and puts the header back where the body is', () => {
      const tableContainer = new TableContainer(container, state);
      const root = tableContainer.getElement();
      const headerArea = root.querySelector<HTMLElement>('.dt-header-area')!;
      const body = root.querySelector<HTMLElement>('.dt-body-scroll')!;
      const mockInstance = MockResizeObserver.observing(body)!;
      const headerScroll = root.querySelector<HTMLElement>('.dt-header-scroll')!;
      const gutter = root.querySelector<HTMLElement>('.dt-scrollbar-gutter')!;

      // An entry without box sizes, as older engines report it.
      Object.defineProperty(headerArea, 'clientWidth', { configurable: true, value: 800 });
      Object.defineProperty(body, 'clientWidth', { configurable: true, value: 785 });
      // The header clamped short of the body while its gutter was too narrow.
      body.scrollLeft = 4845;
      headerScroll.scrollLeft = 4830;
      mockInstance.triggerResize([
        { target: body, contentRect: { width: 785, height: 400 } as DOMRectReadOnly },
      ]);
      expect(gutter.style.width).toBe('15px');
      expect(headerScroll.scrollLeft).toBe(4845);

      tableContainer.destroy();
    });

    it('should allow unsubscribing from resize events', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();
      const resizeCallback = vi.fn();

      const unsubscribe = tableContainer.onResize(resizeCallback);

      // First resize should trigger callback
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Second resize should not trigger callback
      mockInstance?.triggerResize([
        {
          contentRect: { width: 900, height: 700 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).toHaveBeenCalledTimes(1); // Still 1

      tableContainer.destroy();
    });
  });

  describe('scroll sync', () => {
    /**
     * Ten 100px columns, `a`…`j`, with a body 300px wide. `before` runs once
     * the state and actions exist, and before the container does.
     */
    function wideTable(before?: () => void) {
      const names = 'abcdefghij'.split('');
      const schema: ColumnSchema[] = names.map((name) => ({
        name,
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
      }));
      const bridge = {
        ...mockBridge,
        query: vi.fn().mockResolvedValue([]),
      } as unknown as WorkerBridge;
      const actions = new StateActions(state, bridge);
      state.schema.set(schema);
      initializeColumnsFromSchema(state, schema);
      for (const name of names) actions.setColumnWidth(name, 100);
      state.totalRows.set(10);
      state.tableName.set('t');
      document.body.appendChild(container);
      before?.();
      const tableContainer = new TableContainer(container, state, actions, bridge);
      const root = tableContainer.getElement();
      const body = root.querySelector<HTMLElement>('.dt-body-scroll')!;
      const headerScroll = root.querySelector<HTMLElement>('.dt-header-scroll')!;
      Object.defineProperty(body, 'clientWidth', { configurable: true, value: 300 });
      return { tableContainer, actions, root, body, headerScroll };
    }

    it('scrolls the keyboard cursor into view through the one scroll owner', () => {
      const { tableContainer, actions, body, headerScroll } = wideTable();
      tableContainer.getGridElement().focus();
      actions.setFocusedCell({ row: -1, column: 'a' });

      tableContainer
        .getGridElement()
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

      // `j` spans 900–1,000 in a 300px view. The header moves with the body
      // at once, which only the column window controller does: a navigator
      // on its own leaves the header for the body's scroll event.
      expect(state.focusedCell.get()).toEqual({ row: -1, column: 'j' });
      expect(body.scrollLeft).toBe(700);
      expect(headerScroll.scrollLeft).toBe(700);

      tableContainer.destroy();
    });

    it('gives only the mounted columns’ headers their controls, and every column a header', () => {
      const { tableContainer, actions, root, body } = wideTable();
      const withControls = () =>
        Array.from(root.querySelectorAll('.dt-col-header'), (h) =>
          h.querySelector('.dt-col-sort-btn') ? h.getAttribute('data-column') : '-',
        ).join(' ');
      // Until the body has a width, every column is mounted.
      expect(withControls()).toBe('a b c d e f g h i j');

      body.dispatchEvent(new Event('scroll'));
      expect(withControls()).toBe('a b c d e f - - - -');
      body.scrollLeft = 700;
      body.dispatchEvent(new Event('scroll'));
      expect(withControls()).toBe('- - - - e f g h i j');

      // A header rebuilt by a render starts the way the controller has it.
      actions.hideColumn('a');
      expect(withControls()).toBe('- - - e f g h i j');

      tableContainer.destroy();
    });

    it('keeps the column an open filter panel belongs to mounted, until the panel closes', async () => {
      const { tableContainer, root, body } = wideTable();
      const mounted = () => tableContainer.getColumnWindow().mountedColumns.get().join(' ');
      const filterButton = (column: string) =>
        root.querySelector<HTMLElement>(
          `.dt-col-header[data-column="${column}"] .dt-col-filter-btn`,
        )!;
      body.dispatchEvent(new Event('scroll'));
      expect(mounted()).toBe('a b c d e f');

      filterButton('b').click();
      body.scrollLeft = 700;
      body.dispatchEvent(new Event('scroll'));
      expect(mounted()).toBe('b e f g h i j');

      // Closing gives focus back to the button, whose own focus holds the
      // column; the panel's hold is gone once focus moves on.
      tableContainer.getFilterPanel()!.close();
      expect(document.activeElement).toBe(filterButton('b'));
      tableContainer.getGridElement().focus();
      await Promise.resolve();
      expect(mounted()).toBe('e f g h i j');

      tableContainer.destroy();
    });

    it('moves the hold, and where focus goes back to, when the panel switches columns', async () => {
      const { tableContainer, root, body } = wideTable();
      const mounted = () => tableContainer.getColumnWindow().mountedColumns.get().join(' ');
      const filterButton = (column: string) =>
        root.querySelector<HTMLElement>(
          `.dt-col-header[data-column="${column}"] .dt-col-filter-btn`,
        )!;
      body.dispatchEvent(new Event('scroll'));

      // Clicked with focus on each, as Chrome gives a clicked button focus.
      filterButton('b').focus();
      filterButton('b').click();
      filterButton('c').focus();
      filterButton('c').click();
      expect(tableContainer.getFilterPanel()!.getCurrentColumn()).toBe('c');
      body.scrollLeft = 700;
      body.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
      expect(mounted()).toBe('c e f g h i j');

      tableContainer.getFilterPanel()!.close();
      expect(document.activeElement).toBe(filterButton('c'));

      tableContainer.destroy();
    });

    it('stops following the scrollers and state once destroyed', () => {
      let filtersBefore = 0;
      const { tableContainer, body } = wideTable(() => {
        filtersBefore = state.filters.subscriberCount();
      });
      const bodyObserver = MockResizeObserver.observing(body)!;
      expect(state.filters.subscriberCount()).toBeGreaterThan(filtersBefore);

      tableContainer.destroy();

      expect(state.filters.subscriberCount()).toBe(filtersBefore);
      expect(bodyObserver.getObservedElements().size).toBe(0);
    });

    it("does not let the header's shorter reach pull the body back", () => {
      const tableContainer = new TableContainer(container, state);
      const root = tableContainer.getElement();
      const body = root.querySelector<HTMLElement>('.dt-body-scroll')!;
      const headerScroll = root.querySelector<HTMLElement>('.dt-header-scroll')!;
      // A header that can scroll no further than 4830, as when its viewport
      // is still wider than a body that has just grown a scrollbar.
      let headerLeft = 0;
      Object.defineProperty(headerScroll, 'scrollLeft', {
        configurable: true,
        get: () => headerLeft,
        set: (v: number) => {
          headerLeft = Math.min(v, 4830);
        },
      });

      body.scrollLeft = 4845;
      body.dispatchEvent(new Event('scroll'));
      expect(headerScroll.scrollLeft).toBe(4830);
      // The header's scroll event for that sync.
      headerScroll.dispatchEvent(new Event('scroll'));
      expect(body.scrollLeft).toBe(4845);

      // A scroll of the header's own still moves the body, even back to where
      // the header stopped before.
      headerScroll.scrollLeft = 4700;
      headerScroll.dispatchEvent(new Event('scroll'));
      expect(body.scrollLeft).toBe(4700);
      headerScroll.scrollLeft = 4830;
      headerScroll.dispatchEvent(new Event('scroll'));
      expect(body.scrollLeft).toBe(4830);

      tableContainer.destroy();
    });
  });

  describe('state subscriptions', () => {
    it('should re-render when schema changes', () => {
      const tableContainer = new TableContainer(container, state);
      const renderSpy = vi.spyOn(tableContainer, 'render');

      const schema: ColumnSchema[] = [
        { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      ];

      state.schema.set(schema);

      expect(renderSpy).toHaveBeenCalled();

      tableContainer.destroy();
    });

    it('should re-render when visible columns change', () => {
      const tableContainer = new TableContainer(container, state);
      const renderSpy = vi.spyOn(tableContainer, 'render');

      state.visibleColumns.set(['col1', 'col2']);

      expect(renderSpy).toHaveBeenCalled();

      tableContainer.destroy();
    });

    it('should update column widths in place when column widths change (without re-render)', () => {
      const tableContainer = new TableContainer(container, state);
      const renderSpy = vi.spyOn(tableContainer, 'render');

      state.columnWidths.set(new Map([['col1', 100]]));

      // We no longer call render() on columnWidths change to avoid killing
      // the resize operation mid-drag. Instead, we update widths in place.
      expect(renderSpy).not.toHaveBeenCalled();

      tableContainer.destroy();
    });
  });

  describe('render', () => {
    it('should show placeholder when no data is loaded', () => {
      const tableContainer = new TableContainer(container, state);

      const body = tableContainer.getBodyContainer();
      expect(body.textContent).toContain('Load data to see the table');

      tableContainer.destroy();
    });

    it('should show column info when data is loaded', () => {
      const tableContainer = new TableContainer(container, state);

      // Set up state with data
      state.tableName.set('test_table');
      const schema: ColumnSchema[] = [
        { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
        { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
      ];
      initializeColumnsFromSchema(state, schema);
      state.totalRows.set(1000);

      // Re-render
      tableContainer.render();

      const header = tableContainer.getHeaderRow();
      expect(header.textContent).toContain('id');
      expect(header.textContent).toContain('integer');
      expect(header.textContent).toContain('name');
      expect(header.textContent).toContain('string');

      const body = tableContainer.getBodyContainer();
      expect(body.textContent).toContain('1,000 rows');

      tableContainer.destroy();
    });

    it('should not render if destroyed', () => {
      const tableContainer = new TableContainer(container, state);

      // Get the body container before destroy
      const bodyContainer = tableContainer.getBodyContainer();
      const initialContent = bodyContainer.innerHTML;

      tableContainer.destroy();

      // Verify it's destroyed
      expect(tableContainer.isDestroyed()).toBe(true);

      // Calling render should not throw and should not modify content
      tableContainer.render();

      // Content should remain unchanged (render was skipped)
      expect(bodyContainer.innerHTML).toBe(initialContent);
    });
  });

  describe('destroy', () => {
    it('should remove element from container', () => {
      const tableContainer = new TableContainer(container, state);
      const element = tableContainer.getElement();

      expect(container.contains(element)).toBe(true);

      tableContainer.destroy();

      expect(container.contains(element)).toBe(false);
    });

    it('should disconnect resize observer', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();

      tableContainer.destroy();

      expect(mockInstance?.getObservedElements().size).toBe(0);
    });

    it('should unsubscribe from state', () => {
      const tableContainer = new TableContainer(container, state);

      // Get subscriber counts before destroy
      const schemaSubsBefore = state.schema.subscriberCount();

      tableContainer.destroy();

      // Subscriber count should decrease
      expect(state.schema.subscriberCount()).toBeLessThan(schemaSubsBefore);
    });

    it('should prevent further renders', () => {
      const tableContainer = new TableContainer(container, state);

      tableContainer.destroy();

      // Changing state should not cause issues
      state.tableName.set('test');
      state.schema.set([{ name: 'x', type: 'string', nullable: false, originalType: 'VARCHAR' }]);

      // Should not throw and render should be skipped
      expect(tableContainer.isDestroyed()).toBe(true);
    });

    it('should clear resize callbacks', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();
      const resizeCallback = vi.fn();

      tableContainer.onResize(resizeCallback);

      tableContainer.destroy();

      // Triggering resize after destroy should not call callback
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).not.toHaveBeenCalled();
    });

    it('should be idempotent', () => {
      const tableContainer = new TableContainer(container, state);

      // Call destroy multiple times
      tableContainer.destroy();
      tableContainer.destroy();
      tableContainer.destroy();

      // Should not throw
      expect(tableContainer.isDestroyed()).toBe(true);
    });
  });

  describe('isDestroyed', () => {
    it('should return false before destroy', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.isDestroyed()).toBe(false);

      tableContainer.destroy();
    });

    it('should return true after destroy', () => {
      const tableContainer = new TableContainer(container, state);

      tableContainer.destroy();

      expect(tableContainer.isDestroyed()).toBe(true);
    });
  });
});
