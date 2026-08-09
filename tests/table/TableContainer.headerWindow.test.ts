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
import type { ColumnHeader } from '@/table/ColumnHeader';
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

/**
 * The two `@internal` mount hooks.
 *
 * They exist because a windowed row has no moment at which every column's
 * header exists, so "decorate each header once" — the visualization canvas, a
 * custom stats panel — cannot be a sweep over `getColumnHeaders()` any more.
 * `createDataTable` drives all of it from these two callbacks, which makes
 * their firing discipline load-bearing: an announcement too many builds a
 * second chart into a slot that already has one, an announcement too few
 * leaves a column blank for the table's lifetime, and an announcement at the
 * wrong instant hands the listener a header it can no longer read.
 *
 * The two callbacks are deliberately asymmetric about the DOM. A header is
 * announced for mounting while it is still **detached** — the caller places
 * the element after `mountColumnHeader` returns, and a full render fills a
 * detached row before swapping it in, so no ordering inside the mount could
 * make it otherwise. It is announced for unmounting while it is still
 * **connected**, because that is the listener's last chance to read anything
 * off it. Both halves are pinned below.
 */
describe('windowed header row — mount hooks', () => {
  const namesOf = (headers: ColumnHeader[]): string[] =>
    headers.map((header) => header.getColumn().name);
  const sorted = (names: string[]): string[] => [...names].sort();

  it('announces every mounted header exactly once, built and wired', () => {
    // What each announcement carried, keyed by the header it announced. The
    // hook's contract is that its argument is usable *at the call*, and what
    // `createDataTable` reads off it there is the element and the two slots.
    const announced = new Map<
      ColumnHeader,
      { column: string; el: HTMLElement; stats: HTMLElement; viz: HTMLElement }
    >();
    const connectedAtMount: string[] = [];
    let calls = 0;
    const h = mount({
      onHeaderMount: (header: ColumnHeader) => {
        calls++;
        if (header.getElement().isConnected) connectedAtMount.push(header.getColumn().name);
        announced.set(header, {
          column: header.getColumn().name,
          el: header.getElement(),
          stats: header.getStatsElement(),
          viz: header.getVizContainer(),
        });
      },
    });

    // One call per header instance ever built. A header announced twice is a
    // second stats panel constructed into a slot that already owns one, with
    // the first leaked — it is never `destroy()`ed, because only the header
    // that displaced it could have said so.
    expect(calls).toBe(announced.size);

    // Not one header was in the document at its own mount, and no listener may
    // assume one will be: the caller places the element after
    // `mountColumnHeader` returns, and `render()` fills a detached row before
    // swapping it in, so no ordering inside the mount could promise it. This is
    // the contract a chart is written against — `BaseVisualization` measures
    // 0×0 here and corrects itself on the `ResizeObserver` callback it gets
    // once the element is connected. Anything that instead needed layout at
    // this instant would be silently wrong at every scroll offset.
    expect(connectedAtMount).toEqual([]);

    const row = headerRowEl(h.root())!;
    const mounted = h.container.getColumnHeaders();
    expect(mounted.length).toBeGreaterThan(0);
    expect(namesOf(mounted)).toEqual(headerColumns(h.root()));

    for (const header of mounted) {
      const call = announced.get(header);
      expect(call, `no mount announcement for ${header.getColumn().name}`).toBeDefined();
      // What is promised instead: the header is resolvable by name and by
      // element the moment the hook runs, and the element it hands over is the
      // one the render goes on to place — not a fragment discarded and rebuilt
      // afterwards, which would leave every chart drawing into a canvas that
      // nothing on screen contains.
      expect(call!.el).toBe(header.getElement());
      expect(row.contains(call!.el)).toBe(true);
      // Both slots resolved inside the call: `createDataTable` writes the
      // stats line and hands the viz container to the controller there.
      expect(call!.el.contains(call!.stats)).toBe(true);
      expect(call!.el.contains(call!.viz)).toBe(true);
    }

    h.container.destroy();
  });

  it('announces the columns a shift brings in and takes out, and nothing that stayed', () => {
    const mounted: ColumnHeader[] = [];
    const unmounted: ColumnHeader[] = [];
    const h = mount({
      onHeaderMount: (header: ColumnHeader) => void mounted.push(header),
      onHeaderUnmount: (header: ColumnHeader) => void unmounted.push(header),
    });

    const before = headerColumns(h.root());
    mounted.length = 0;
    unmounted.length = 0;

    // Fifteen columns right: `[0, 14)` becomes `[5, 29)`, so both ends move
    // and nine columns are common to the two windows.
    h.scrollTo(COL_WIDTH * 15);
    const after = headerColumns(h.root());

    expect(sorted(namesOf(mounted))).toEqual(sorted(after.filter((c) => !before.includes(c))));
    expect(sorted(namesOf(unmounted))).toEqual(sorted(before.filter((c) => !after.includes(c))));
    // Neither side is trivially empty — a window that stopped moving would
    // satisfy the two equalities above with nothing at all.
    expect(mounted.length).toBeGreaterThan(0);
    expect(unmounted.length).toBeGreaterThan(0);

    // The survivors are the point. They are the same header elements as
    // before the scroll, so re-announcing one would have `createDataTable`
    // tear down and rebuild its chart and its panel on every scroll frame
    // that moves the window by a column.
    const stayed = before.filter((c) => after.includes(c));
    expect(stayed.length).toBeGreaterThan(0);
    for (const name of stayed) {
      expect(namesOf(mounted)).not.toContain(name);
      expect(namesOf(unmounted)).not.toContain(name);
    }

    h.container.destroy();
  });

  it('hands the unmount hook a header that is still live and still listed', () => {
    interface Snapshot {
      column: string;
      destroyed: boolean;
      elementConnected: boolean;
      statsConnected: boolean;
      listed: boolean;
    }
    const seen: Snapshot[] = [];
    let live: TableContainer | null = null;
    const h = mount({
      onHeaderUnmount: (header: ColumnHeader) => {
        seen.push({
          column: header.getColumn().name,
          destroyed: header.isDestroyed(),
          elementConnected: header.getElement().isConnected,
          statsConnected: header.getStatsElement().isConnected,
          listed: live?.getColumnHeaders().includes(header) ?? false,
        });
      },
    });
    live = h.container;
    // Whatever the initial render unmounted was announced before `live` could
    // be assigned, so those records cannot answer `listed` honestly.
    seen.length = 0;

    h.scrollTo(COL_WIDTH * 15);

    expect(seen.length).toBeGreaterThan(0);
    for (const snapshot of seen) {
      // The hook is the last moment the header can be read: `createDataTable`
      // snapshots the column's chart data off its live canvas here and runs
      // its stats panel's `destroy()`, and neither survives
      // `ColumnHeader.destroy()` detaching the element.
      expect(snapshot).toEqual({
        column: snapshot.column,
        destroyed: false,
        elementConnected: true,
        statsConnected: true,
        listed: true,
      });
    }

    h.container.destroy();
  });

  it('pairs every unmount with a mount across a sweep out and back', () => {
    const live = new Set<ColumnHeader>();
    const net = new Map<string, number>();
    const unpaired: string[] = [];
    const bump = (name: string, by: number): void => void net.set(name, (net.get(name) ?? 0) + by);

    const h = mount({
      onHeaderMount: (header: ColumnHeader) => {
        live.add(header);
        bump(header.getColumn().name, 1);
      },
      onHeaderUnmount: (header: ColumnHeader) => {
        // By identity, not by name: an unmount for a header that was never
        // announced as mounted is a `destroy()` with nothing on the other
        // side of it — the listener never attached anything to that header.
        if (!live.delete(header)) unpaired.push(header.getColumn().name);
        bump(header.getColumn().name, -1);
      },
    });

    for (const left of [1500, 4500, TOTAL_WIDTH - VIEWPORT, 4500, 1500, 0]) h.scrollTo(left);

    expect(unpaired).toEqual([]);

    const mounted = h.container.getColumnHeaders();
    expect(live.size).toBe(mounted.length);
    for (const header of mounted) expect(live.has(header)).toBe(true);

    // Per column, mounts minus unmounts is 1 for exactly the columns mounted
    // now and 0 for every column the sweep merely passed over. A column left
    // at 2 is a chart and a panel leaked; one at -1 is a header torn down
    // twice, which runs a panel's `destroy()` on an already-destroyed panel.
    const expected = new Map(headerColumns(h.root()).map((name) => [name, 1]));
    expect(new Map([...net].filter(([, count]) => count !== 0))).toEqual(expected);

    h.container.destroy();
  });

  it('unmounts every still-mounted header on destroy', () => {
    const unmounted: ColumnHeader[] = [];
    const h = mount({ onHeaderUnmount: (header: ColumnHeader) => void unmounted.push(header) });
    h.scrollTo(4500);

    const mounted = h.container.getColumnHeaders();
    expect(mounted.length).toBeGreaterThan(0);
    unmounted.length = 0;

    h.container.destroy();

    // Teardown is the one moment the whole window unmounts at once, and it is
    // the moment a bare `destroy()` loop over the headers would silently skip
    // — leaving `createDataTable` holding a stats panel per mounted column
    // that never receives the `destroy()` its author was promised.
    expect(sorted(namesOf(unmounted))).toEqual(sorted(namesOf(mounted)));
    expect(new Set(unmounted).size).toBe(unmounted.length);
    for (const header of mounted) expect(unmounted).toContain(header);
  });

  it('renders and scrolls the same with no hooks supplied', () => {
    // Both options are optional, and the paths that construct a container
    // without them are ordinary: `TableContainer` used directly through
    // `/advanced`, and `createDataTable` before its first header exists.
    const hooked = mount({ onHeaderMount: () => {}, onHeaderUnmount: () => {} });
    const bare = mount();

    for (const left of [COL_WIDTH * 15, TOTAL_WIDTH - VIEWPORT, 0]) {
      hooked.scrollTo(left);
      expect(() => bare.scrollTo(left)).not.toThrow();
      expect(headerColumns(bare.root())).toEqual(headerColumns(hooked.root()));
    }

    expect(() => bare.container.destroy()).not.toThrow();
    hooked.container.destroy();
  });
});
