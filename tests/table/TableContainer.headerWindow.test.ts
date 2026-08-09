/**
 * @vitest-environment jsdom
 *
 * The header row, windowed.
 *
 * The header row renders `[P pinned][left spacer][window][right spacer]` — a
 * body row's shape exactly — and mounts and unmounts headers at the two edges
 * as the table scrolls. Everything that used to be true of "one header per
 * visible column" has to keep being true of a moving slice, and the things
 * that were true *only* because every header existed have to be shown to have
 * a replacement.
 *
 * The tier is concrete so every expectation is arithmetic rather than a
 * recorded output: 60 columns of 150 px in a 600 px viewport. At
 * `scrollLeft = 0` the un-overscanned visible run is `[0, 4)`; the ten-column
 * floor widens it to `[0, 14)`. At `scrollLeft = 4500` — column 30's left
 * edge — the visible run is `[30, 34)`, one viewport of pixel overscan per
 * side gives `[26, 38)`, and the floor gives `[20, 44)`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { AnnotationPopover } from '@/table/AnnotationPopover';
import { ColumnHeaderTooltipPopover } from '@/table/ColumnHeaderTooltipPopover';
import { MIN_OVERSCAN_COLUMNS } from '@/table/ColumnWindow';
import { HEADER_ROW_INDEX } from '@/table/KeyboardNavigator';
import { TableContainer } from '@/table/TableContainer';

import {
  headerCells,
  headerColumns,
  headerFor,
  headerRowEl,
  headerSpacers,
} from '../helpers/headerDom';

const COLUMNS = 60;
const COL_WIDTH = 150;
const VIEWPORT = 600;
const TOTAL_WIDTH = COLUMNS * COL_WIDTH;
/** Columns fully or partly inside the viewport at any offset. */
const VISIBLE_RUN = VIEWPORT / COL_WIDTH;

class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const bridge = {
  initialize: vi.fn(),
  query: vi.fn().mockResolvedValue([]),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

function schemaOf(count: number): ColumnSchema[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `col_${i}`,
    type: 'integer' as const,
    nullable: false,
    originalType: 'INTEGER',
  }));
}

function stubWidth(el: HTMLElement, width: number): void {
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
}

interface Harness {
  container: TableContainer;
  host: HTMLElement;
  state: TableState;
  actions: StateActions;
  /** Scroll the body and re-window both axes, the way a scroll frame does. */
  scrollTo(left: number): void;
  root(): HTMLElement;
}

function mount(options: Parameters<typeof TableContainer>[4] = {}): Harness {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const state = createTableState();
  const actions = new StateActions(state, bridge);
  const schema = schemaOf(COLUMNS);

  const container = new TableContainer(host, state, actions, bridge, options);
  stubWidth(container.getScrollContainer(), VIEWPORT);
  stubWidth(container.getHeaderScroll(), VIEWPORT);

  state.schema.set(schema);
  initializeColumnsFromSchema(state, schema);
  state.tableName.set('t');

  return {
    container,
    host,
    state,
    actions,
    scrollTo(left: number) {
      container.getScrollContainer().scrollLeft = left;
      container.refreshColumnWindow();
    },
    root: () => container.getElement(),
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('windowed header row — structure', () => {
  it('mounts a bounded window rather than every visible column', () => {
    const h = mount();
    const columns = headerColumns(h.root());

    expect(columns.length).toBeLessThan(COLUMNS);
    expect(columns).toEqual(
      Array.from({ length: VISIBLE_RUN + MIN_OVERSCAN_COLUMNS }, (_, i) => `col_${i}`),
    );

    h.container.destroy();
  });

  it('places the spacers around the window, in the body row order', () => {
    const h = mount();
    h.scrollTo(4500);

    const row = headerRowEl(h.root())!;
    const { left, right } = headerSpacers(h.root());
    const cells = headerCells(row);

    // `[P pinned][left spacer][window][right spacer]`, with P = 0 here.
    expect(Array.from(row.children)).toEqual([left, ...cells, right]);

    h.container.destroy();
  });

  it('sizes the spacers to exactly the columns they stand in for', () => {
    const h = mount();
    h.scrollTo(4500);

    const { left, right } = headerSpacers(h.root());
    const mounted = headerColumns(h.root());
    const firstIndex = Number(mounted[0]!.slice('col_'.length));
    const afterLast = Number(mounted[mounted.length - 1]!.slice('col_'.length)) + 1;

    expect(left!.style.flex).toBe(`0 0 ${firstIndex * COL_WIDTH}px`);
    expect(right!.style.flex).toBe(`0 0 ${(COLUMNS - afterLast) * COL_WIDTH}px`);

    // The identity that makes the horizontal scroll extent independent of
    // which columns happen to be mounted.
    const spacerPx = firstIndex * COL_WIDTH + (COLUMNS - afterLast) * COL_WIDTH;
    expect(spacerPx + mounted.length * COL_WIDTH).toBe(TOTAL_WIDTH);
    expect(headerRowEl(h.root())!.style.minWidth).toBe(`${TOTAL_WIDTH}px`);

    h.container.destroy();
  });

  it('force-renders the pinned prefix at every offset', () => {
    const h = mount();
    h.actions.toggleColumnPin('col_0');
    h.scrollTo(4500);

    const row = headerRowEl(h.root())!;
    const columns = headerColumns(row);

    // Pinned first, before the left spacer — they are sticky at `left: 0`, and
    // `aria-colindex` has to ascend in DOM order.
    expect(columns[0]).toBe('col_0');
    expect(row.children[0]).toBe(headerFor(row, 'col_0'));
    expect(row.children[1]).toBe(headerSpacers(h.root()).left);
    // …and the window itself is still far to the right.
    expect(columns[1]).not.toBe('col_1');

    h.container.destroy();
  });

  it('keeps the window bounded through a scroll sweep', () => {
    const h = mount();
    const counts: number[] = [];
    for (const left of [0, 1500, 3000, 4500, 6000, TOTAL_WIDTH - VIEWPORT]) {
      h.scrollTo(left);
      counts.push(headerCells(h.root()).length);
    }

    // The window is `visible + 2 × overscan` at worst; nowhere near 60.
    expect(Math.max(...counts)).toBeLessThanOrEqual(VISIBLE_RUN + 2 * MIN_OVERSCAN_COLUMNS + 2);
    expect(Math.min(...counts)).toBeGreaterThan(0);

    h.container.destroy();
  });

  it('moves the window with the scroll offset', () => {
    const h = mount();
    const atRest = headerColumns(h.root());
    h.scrollTo(4500);
    const scrolled = headerColumns(h.root());

    expect(scrolled[0]).toBe(`col_${4500 / COL_WIDTH - MIN_OVERSCAN_COLUMNS}`);
    expect(scrolled).not.toEqual(atRest);
    // Contiguous, ascending, no gaps — the column oracle's invariant (a).
    const indices = scrolled.map((name) => Number(name.slice('col_'.length)));
    expect(indices.every((v, i) => i === 0 || v === indices[i - 1]! + 1)).toBe(true);

    h.container.destroy();
  });

  it('reuses surviving headers across a one-column shift', () => {
    const h = mount();
    h.scrollTo(4500);
    const survivor = headerFor(h.root(), 'col_25');
    expect(survivor).not.toBeNull();

    // One column right: the run moves by one at each end and everything
    // between is the *same element*. A rebuild here would be a full remount on
    // every scroll frame.
    h.scrollTo(4650);
    expect(headerFor(h.root(), 'col_25')).toBe(survivor);

    h.container.destroy();
  });

  it('survives a disjoint jump across the table', () => {
    const h = mount();
    h.scrollTo(0);
    h.scrollTo(TOTAL_WIDTH - VIEWPORT);

    const columns = headerColumns(h.root());
    expect(columns[columns.length - 1]).toBe(`col_${COLUMNS - 1}`);
    expect(columns).not.toContain('col_0');
    // No orphans left behind by the unmount-all path.
    expect(headerCells(h.root())).toHaveLength(columns.length);

    h.container.destroy();
  });
});

describe('windowed header row — identity and ARIA', () => {
  it('gives a column the same cell id at every window position', () => {
    const h = mount();
    h.scrollTo(3000);
    const id = headerFor(h.root(), 'col_25')!.id;

    // Scroll so col_25 is at the other end of the window, then back.
    h.scrollTo(4500);
    expect(headerFor(h.root(), 'col_25')!.id).toBe(id);
    h.scrollTo(3000);
    expect(headerFor(h.root(), 'col_25')!.id).toBe(id);

    // …and it is the column's global index, not a counter over the mounted
    // set: the leftmost mounted header must not always be `-colheader-0`.
    expect(id.endsWith('-colheader-25')).toBe(true);

    h.container.destroy();
  });

  it('keeps aria-colindex ascending in DOM order across the window', () => {
    const h = mount();
    h.actions.toggleColumnPin('col_40');
    h.scrollTo(3000);

    const indices = headerCells(h.root()).map((el) => Number(el.getAttribute('aria-colindex')));
    expect(indices.every((v, i) => i === 0 || v > indices[i - 1]!)).toBe(true);
    // Every value is the column's position in `columnOrder`, gaps included.
    const order = h.state.columnOrder.get();
    for (const el of headerCells(h.root())) {
      const name = el.getAttribute('data-column')!;
      expect(Number(el.getAttribute('aria-colindex'))).toBe(order.indexOf(name) + 1);
    }

    h.container.destroy();
  });

  it('reports the full column count, not the mounted one', () => {
    const h = mount();
    h.scrollTo(4500);
    expect(h.container.getGridElement().getAttribute('aria-colcount')).toBe(String(COLUMNS));
    expect(headerCells(h.root()).length).toBeLessThan(COLUMNS);
    h.container.destroy();
  });

  it('never mounts a row that owns no column header', () => {
    // `setColumnOrder([])` leaves `visibleColumns` empty — reachable, and a
    // `role="row"` owning only two spacers is the `aria-required-children`
    // violation the old `childElementCount` guard stopped catching.
    const h = mount();
    h.actions.setColumnOrder([]);

    const row = headerRowEl(h.root());
    if (row) expect(headerCells(row).length).toBeGreaterThan(0);
    else expect(row).toBeNull();

    h.container.destroy();
  });
});

describe('windowed header row — anchors and focus', () => {
  it('anchors the header cursor so its element exists to be named', () => {
    const h = mount();
    h.scrollTo(4500);
    const mounted = headerColumns(h.root());
    const justLeft = `col_${Number(mounted[0]!.slice('col_'.length)) - 3}`;

    h.actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: justLeft });

    expect(headerFor(h.root(), justLeft)).not.toBeNull();
    expect(h.container.getGridElement().getAttribute('aria-activedescendant')).toBe(
      headerFor(h.root(), justLeft)!.id,
    );

    h.container.destroy();
  });

  it('drops the cursor rather than mounting a column far out of the window', () => {
    const h = mount();
    h.scrollTo(4500);
    // Ten columns of budget; col_0 is thirty away.
    h.actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'col_0' });

    expect(headerFor(h.root(), 'col_0')).toBeNull();
    // A dangling IDREF is an `aria-valid-attr-value` failure — dropping the
    // attribute is the correct answer for a cursor scrolled out of view.
    expect(h.container.getGridElement().hasAttribute('aria-activedescendant')).toBe(false);
    expect(headerCells(h.root()).length).toBeLessThan(VISIBLE_RUN + 3 * MIN_OVERSCAN_COLUMNS);

    h.container.destroy();
  });

  it('paints the cursor ring on a header mounted after the cursor moved', () => {
    const h = mount();
    h.actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'col_30' });
    expect(headerFor(h.root(), 'col_30')).toBeNull();

    h.scrollTo(4500);

    // Born correct: a header scrolled into view has to be indistinguishable
    // from one built at load.
    expect(headerFor(h.root(), 'col_30')!.classList.contains('dt-col-header--focused')).toBe(true);

    h.container.destroy();
  });

  it('parks real DOM focus on the grid when its header unmounts', () => {
    const h = mount();
    const button = headerFor(h.root(), 'col_2')!.querySelector<HTMLElement>('.dt-col-sort-btn')!;
    button.focus();
    expect(document.activeElement).toBe(button);

    // Scroll far enough that col_2 is well past the anchor budget.
    h.scrollTo(TOTAL_WIDTH - VIEWPORT);

    expect(headerFor(h.root(), 'col_2')).toBeNull();
    // Never `<body>` — that silently ends keyboard navigation.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(h.container.getGridElement());

    h.container.destroy();
  });

  it('anchors a header holding focus while it is still within budget', () => {
    const h = mount();
    const button = headerFor(h.root(), 'col_12')!.querySelector<HTMLElement>('.dt-col-sort-btn')!;
    button.focus();

    // Two columns past the un-anchored window edge — inside the budget.
    h.scrollTo(COL_WIDTH * 4);

    expect(headerFor(h.root(), 'col_12')).not.toBeNull();
    expect(document.activeElement).toBe(button);

    h.container.destroy();
  });
});

describe('windowed header row — unmount undoes mount', () => {
  it('dismisses a tooltip popover anchored inside an unmounting header', () => {
    const tooltipPopover = new ColumnHeaderTooltipPopover({ classPrefix: 'dt' });
    const h = mount({ columnHeaderTooltipPopover: tooltipPopover });
    h.actions.setColumnHeaderTooltip('col_2', { title: 'Col 2', body: 'about col 2' });

    const nameEl = headerFor(h.root(), 'col_2')!.querySelector<HTMLElement>('.dt-col-name')!;
    nameEl.dispatchEvent(new Event('pointerenter'));
    expect(tooltipPopover.isOpenFor(nameEl)).toBe(true);

    h.scrollTo(TOTAL_WIDTH - VIEWPORT);

    // Otherwise it floats over the table describing a column that is gone,
    // anchored to a detached node it keeps measuring.
    expect(tooltipPopover.isOpen()).toBe(false);

    tooltipPopover.destroy();
    h.container.destroy();
  });

  it('dismisses an annotation popover anchored on an unmounting header', () => {
    const annotationPopover = new AnnotationPopover({ classPrefix: 'dt' });
    const h = mount({ annotationPopover });

    const headerEl = headerFor(h.root(), 'col_2')!;
    annotationPopover.show(headerEl, [
      {
        id: 'a1',
        scope: 'column',
        column: 'col_2',
        severity: 'info',
        message: 'note',
        createdAt: 0,
      },
    ]);
    expect(annotationPopover.isOpenFor(headerEl)).toBe(true);

    h.scrollTo(TOTAL_WIDTH - VIEWPORT);

    expect(annotationPopover.isOpen()).toBe(false);

    annotationPopover.destroy();
    h.container.destroy();
  });

  it('leaves no listeners behind across a mount/unmount storm', () => {
    const h = mount();

    // Every listener on an element, add and remove, over a sweep that starts
    // and ends at the same scroll offset — so the window it ends on is the
    // window it began with, and a mount/unmount pair that is not symmetric
    // shows up as a non-zero balance for that event type. Deliberately
    // unfiltered by DOM position: a header attaches some of its listeners
    // (the resize handle's) before the element is in the tree, so anything
    // keyed on "is inside a header" counts the add and the remove under
    // different rules and reports a leak that is not there.
    const balance = new Map<string, number>();
    let attachedDuringSweep = 0;
    const proto = EventTarget.prototype;
    const realAdd = proto.addEventListener;
    const realRemove = proto.removeEventListener;
    const bump = (type: string, by: number): void =>
      void balance.set(type, (balance.get(type) ?? 0) + by);

    proto.addEventListener = function (type: string, ...rest: unknown[]) {
      if (this instanceof Element) {
        bump(type, 1);
        attachedDuringSweep++;
      }
      return realAdd.call(this, type, ...(rest as [EventListenerOrEventListenerObject]));
    } as typeof proto.addEventListener;
    proto.removeEventListener = function (type: string, ...rest: unknown[]) {
      if (this instanceof Element) bump(type, -1);
      return realRemove.call(this, type, ...(rest as [EventListenerOrEventListenerObject]));
    } as typeof proto.removeEventListener;

    try {
      for (let pass = 0; pass < 3; pass++) {
        h.scrollTo(TOTAL_WIDTH - VIEWPORT);
        h.scrollTo(0);
      }
    } finally {
      proto.addEventListener = realAdd;
      proto.removeEventListener = realRemove;
    }

    // The storm really did churn headers — otherwise a net zero would be the
    // trivial kind. `mousedown` is the interesting type: `ColumnReorder` holds
    // its handler in an element-keyed map that `ColumnHeader.destroy()` cannot
    // see, so a missing per-element detach leaks one closure per header ever
    // scrolled past.
    expect(headerColumns(h.root()).length).toBeGreaterThan(0);
    expect(attachedDuringSweep).toBeGreaterThan(100);
    expect(balance.has('mousedown')).toBe(true);
    for (const [type, net] of balance) {
      expect(net, `net ${type} listeners after the sweep`).toBe(0);
    }

    h.container.destroy();
  });

  it('keeps getColumnHeaders in DOM order and in sync with the row', () => {
    const h = mount();
    h.actions.toggleColumnPin('col_50');
    h.scrollTo(3000);

    const fromApi = h.container.getColumnHeaders().map((header) => header.getColumn().name);
    expect(fromApi).toEqual(headerColumns(h.root()));
    expect(h.container.getColumnHeaders().every((header) => !header.isDestroyed())).toBe(true);

    h.container.destroy();
  });
});

describe('windowed header row — widths', () => {
  it('re-sizes the spacers and the extent when a column width changes', () => {
    const h = mount();
    h.scrollTo(3000);

    h.actions.setColumnWidth('col_0', COL_WIDTH * 3);

    // The extent grows by exactly what the column gained.
    const grown = TOTAL_WIDTH + COL_WIDTH * 2;
    expect(headerRowEl(h.root())!.style.minWidth).toBe(`${grown}px`);

    // And the row is still made of the right pieces: two spacers plus the
    // mounted columns account for every pixel of it. Updating the mounted
    // headers alone would leave the row the right total width made of the
    // wrong parts, which is invisible until a cell lands under the wrong
    // header.
    const widthOf = (name: string): number => (name === 'col_0' ? COL_WIDTH * 3 : COL_WIDTH);
    const { left, right } = headerSpacers(h.root());
    const mountedPx = headerColumns(h.root()).reduce((sum, name) => sum + widthOf(name), 0);
    const spacerPx =
      Number(left!.style.flexBasis.replace('px', '')) +
      Number(right!.style.flexBasis.replace('px', ''));
    expect(spacerPx + mountedPx).toBe(grown);

    h.container.destroy();
  });

  it('gives a header scrolled into view the width state already holds', () => {
    const h = mount();
    h.actions.setColumnWidth('col_30', 275);
    expect(headerFor(h.root(), 'col_30')).toBeNull();

    h.scrollTo(4500);

    expect(headerFor(h.root(), 'col_30')!.style.width).toBe('275px');

    h.container.destroy();
  });
});
