/**
 * @vitest-environment jsdom
 *
 * Who subscribes to what, and how many of them there are.
 *
 * A `ColumnHeader` used to watch seven things itself — `sortColumns`,
 * `totalRows`, `pinnedColumns`, `filtersByColumn`, `visibleColumns`,
 * `columnHeaderTooltips` and the shared `AnnotationStore` — so the table's
 * subscriber count was seven times the number of headers that happened to
 * exist. That was merely wasteful while every visible column had a header. It
 * became churn once the header row windowed: every scroll frame that moves the
 * window by one column mounts and unmounts headers at the two edges, so seven
 * subscriptions were taken out and seven dropped at the exact moment the frame
 * had the least budget to spare.
 *
 * `TableContainer` now mounts its headers with `subscribe: false` and fans the
 * same seven out over `headerByColumn` itself. Two things have to hold for that
 * to be an improvement rather than a silent regression, and this file is one
 * half per describe group:
 *
 *  - The count is a **constant**. It does not grow with the column count, it
 *    does not move when the window slides, a hide or a reorder leaves it where
 *    it was, and teardown returns it to what it was before the container
 *    existed.
 *  - The fan-out is **live**. Each of the seven still reaches every mounted
 *    header, including headers that scrolled into view long after the
 *    subscription was made. This is the load-bearing half: a fan-out that is
 *    wired but never called satisfies every count above perfectly and leaves
 *    the header row frozen at whatever it was born with.
 *
 * The fixture is the tier `TableContainer.headerWindow.test.ts` uses: 150 px
 * columns (the default width — nothing here sets one) in a 600 px viewport, so
 * the un-overscanned visible run is four columns and the ten-column floor makes
 * the mounted window fourteen. Both widths are stubbed because jsdom lays
 * nothing out and reports `clientWidth === 0`, which would otherwise pin the
 * window to the floor at every offset and leave the sweeps below moving
 * nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AnnotationStore } from '@/annotations/AnnotationStore';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { ColumnHeader } from '@/table/ColumnHeader';
import { TableContainer, type TableContainerOptions } from '@/table/TableContainer';

import { headerCells, headerFor } from '../helpers/headerDom';

/** Small enough that one window holds every column. */
const SMALL_COLUMNS = 8;
/** Large enough that the window is a slice and a sweep churns dozens of headers. */
const LARGE_COLUMNS = 80;
const COL_WIDTH = 150;
const VIEWPORT = 600;

/**
 * The six state signals a header would otherwise subscribe to itself.
 *
 * The seventh thing it watched is the shared `AnnotationStore`, which is not a
 * signal and exposes no listener count — it is measured separately, by spying
 * on `on()` (see {@link spiedStore}).
 */
const FANNED_SIGNALS = [
  'sortColumns',
  'totalRows',
  'pinnedColumns',
  'filtersByColumn',
  'visibleColumns',
  'columnHeaderTooltips',
] as const;

type SignalCounts = Record<(typeof FANNED_SIGNALS)[number], number>;

/** Every fanned-out signal's live subscriber count, in one comparable record. */
function subscriberCounts(state: TableState): SignalCounts {
  const counts = {} as SignalCounts;
  for (const name of FANNED_SIGNALS) counts[name] = state[name].subscriberCount();
  return counts;
}

/** The one method the spies below need; `Signal` and `Computed` both have it. */
interface Subscribable {
  subscribe(callback: (value: never) => void): () => void;
}

/**
 * Start counting the subscriptions *taken out* against each fanned-out signal,
 * and return a reader for the running totals.
 *
 * Comparing `subscriberCount()` before and after cannot see churn: a sweep that
 * ends where it began ends with the same headers mounted, so a subscription
 * added and dropped at every column in between nets to exactly zero. Churn is
 * the thing the milestone is about — it is what a scroll frame pays for — so it
 * has to be counted at the door instead.
 */
function watchSubscribes(state: TableState): () => SignalCounts {
  const spies = {} as Record<keyof SignalCounts, { mock: { calls: unknown[] } }>;
  for (const name of FANNED_SIGNALS) {
    // The cast is compile-time only — `vi.spyOn` still patches the signal
    // itself, which is what makes the count real.
    spies[name] = vi.spyOn(state[name] as unknown as Subscribable, 'subscribe');
  }
  return () => {
    const counts = {} as SignalCounts;
    for (const name of FANNED_SIGNALS) counts[name] = spies[name].mock.calls.length;
    return counts;
  };
}

/** All zeros — the number of new subscriptions a scroll frame is allowed. */
function noSubscribes(): SignalCounts {
  const counts = {} as SignalCounts;
  for (const name of FANNED_SIGNALS) counts[name] = 0;
  return counts;
}

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

/**
 * An annotation store that reports how many subscriptions have been taken out
 * against it.
 *
 * The store keeps its handlers in a private `Set` with no accessor, so the
 * count is taken at the door instead. Subscriptions *taken*, not held, is the
 * right measure for both uses here: mounting N columns must take out one
 * regardless of N, and a scroll sweep must take out none at all.
 */
function spiedStore(): { store: AnnotationStore; subscriptions: () => number } {
  const store = new AnnotationStore();
  const spy = vi.spyOn(store, 'on');
  return { store, subscriptions: () => spy.mock.calls.length };
}

interface Harness {
  container: TableContainer;
  state: TableState;
  actions: StateActions;
  /** Counts on the bare state, taken before the container was constructed. */
  before: SignalCounts;
  /** Total horizontal extent of the fixture, for a sweep to the far edge. */
  extent: number;
  /** Scroll the body and re-window both axes, the way a scroll frame does. */
  scrollTo(left: number): void;
  root(): HTMLElement;
}

function mount(columnCount: number, options: TableContainerOptions = {}): Harness {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const state = createTableState();
  const actions = new StateActions(state, bridge);
  // Before the container exists, so the teardown check has something to return
  // to. `StateActions` is included in the baseline on purpose: it outlives the
  // container and whatever it subscribes to is not the container's to release.
  const before = subscriberCounts(state);

  const container = new TableContainer(host, state, actions, bridge, options);
  stubWidth(container.getScrollContainer(), VIEWPORT);
  stubWidth(container.getHeaderScroll(), VIEWPORT);

  const schema = schemaOf(columnCount);
  state.schema.set(schema);
  initializeColumnsFromSchema(state, schema);
  state.tableName.set('t');

  return {
    container,
    state,
    actions,
    before,
    extent: columnCount * COL_WIDTH,
    scrollTo(left: number) {
      container.getScrollContainer().scrollLeft = left;
      container.refreshColumnWindow();
    },
    root: () => container.getElement(),
  };
}

/** The mounted header element for `column`, which the caller expects to exist. */
function headerElement(h: Harness, column: string): HTMLElement {
  const el = headerFor(h.root(), column);
  expect(el, `no header is mounted for ${column}`).not.toBeNull();
  return el!;
}

/** A descendant of `column`'s mounted header, which the caller expects to exist. */
function partOf(h: Harness, column: string, selector: string): HTMLElement {
  const el = headerElement(h, column).querySelector<HTMLElement>(selector);
  expect(el, `${column}'s header has no ${selector}`).not.toBeNull();
  return el!;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('TableContainer — the subscriber count is a constant, not a multiple', () => {
  it('holds every count flat from 8 columns to 80', () => {
    const small = spiedStore();
    const large = spiedStore();
    const h8 = mount(SMALL_COLUMNS, { annotations: small.store });
    const h80 = mount(LARGE_COLUMNS, { annotations: large.store });

    // The premise of the comparison: the two fixtures mount different numbers
    // of headers. Eight columns fit inside one window; eighty do not, and the
    // window is a slice of them.
    const mounted8 = headerCells(h8.root()).length;
    const mounted80 = headerCells(h80.root()).length;
    expect(mounted8).toBe(SMALL_COLUMNS);
    expect(mounted80).toBeLessThan(LARGE_COLUMNS);
    expect(mounted80).not.toBe(mounted8);

    // The assertion this milestone exists for. Every one of these six used to
    // grow by one per *mounted* header — and, before the header row was
    // windowed, by one per column, so the 266-column tier took out 1,862
    // subscriptions for its header row alone and notified every one of them on
    // every sort, filter and row-count write.
    expect(subscriberCounts(h80.state), 'the subscriber count grew with the column count').toEqual(
      subscriberCounts(h8.state),
    );
    expect(large.subscriptions(), 'annotation-store subscriptions grew with the column count').toBe(
      small.subscriptions(),
    );

    // And flat is flat at a small number, not at "one per header that happens
    // to be equal by coincidence of the two window sizes": no signal may carry
    // as many subscribers as the smaller fixture has headers.
    for (const [name, count] of Object.entries(subscriberCounts(h80.state))) {
      expect(count, `${name} subscribers`).toBeLessThan(mounted8);
    }

    h8.container.destroy();
    h80.container.destroy();
    small.store.destroy();
    large.store.destroy();
  });

  it('takes out and drops nothing across a scroll sweep', () => {
    const { store, subscriptions } = spiedStore();
    let mounted = 0;
    let unmounted = 0;
    const h = mount(LARGE_COLUMNS, {
      annotations: store,
      onHeaderMount: () => void mounted++,
      onHeaderUnmount: () => void unmounted++,
    });

    const before = subscriberCounts(h.state);
    const storeBefore = subscriptions();
    const subscribes = watchSubscribes(h.state);
    mounted = 0;
    unmounted = 0;

    // Out to the far edge and back, then out again and back, so the window ends
    // exactly where it began and every count is comparable to the one recorded
    // before it moved.
    for (const left of [1500, 4500, h.extent - VIEWPORT, 4500, 1500, 0, 6000, 0]) h.scrollTo(left);

    // The sweep really did churn the window. Without this every equality below
    // would hold for the uninteresting reason that no header was ever mounted
    // or unmounted to take a subscription with it.
    expect(mounted, 'the sweep mounted no headers').toBeGreaterThan(20);
    expect(unmounted, 'the sweep unmounted no headers').toBeGreaterThan(20);

    // Not one subscription taken out for all that mounting — the property the
    // milestone is actually about, and the one a before/after count cannot see.
    // Measured with the header's own subscriptions put back: this sweep mounts
    // 126 headers and so takes out 126 subscriptions per signal, 882 with the
    // annotation store included — every one of them a `Set` insert and a closure
    // allocated inside a scroll frame, and every one paid back by a `Set` delete
    // as soon as the window moves one column further.
    expect(subscribes(), 'a scroll sweep subscribed to state signals').toEqual(noSubscribes());
    expect(subscriptions(), 'a scroll sweep subscribed to the annotation store').toBe(storeBefore);

    // And byte-identical at the end, which is the other half: a mount that
    // subscribes is an unmount that has to unsubscribe, and any asymmetry
    // between the two is a leak that grows for as long as the user scrolls.
    expect(subscriberCounts(h.state), 'a scroll sweep changed the subscriber count').toEqual(
      before,
    );

    h.container.destroy();
    store.destroy();
  });

  it('takes out and drops nothing across a hide, a show and a reorder', () => {
    const { store, subscriptions } = spiedStore();
    let mounted = 0;
    let unmounted = 0;
    const h = mount(LARGE_COLUMNS, {
      annotations: store,
      onHeaderMount: () => void mounted++,
      onHeaderUnmount: () => void unmounted++,
    });

    const before = subscriberCounts(h.state);
    const storeBefore = subscriptions();
    const subscribes = watchSubscribes(h.state);
    mounted = 0;
    unmounted = 0;

    // Three column-set changes that all rewrite `visibleColumns` and all churn
    // the mounted set: the hide unmounts one header and pulls one in at the
    // right edge, the show puts it back, and reversing the order replaces the
    // whole window with the columns from the far end of the table.
    h.actions.hideColumn('col_3');
    h.actions.showColumn('col_3');
    h.actions.setColumnOrder([...h.state.columnOrder.get()].reverse());

    expect(mounted, 'the column-set changes mounted no headers').toBeGreaterThan(0);
    expect(unmounted, 'the column-set changes unmounted no headers').toBeGreaterThan(0);

    // Same two halves as the scroll sweep. The reorder is the pointed one: it
    // rewrites `visibleColumns`, and `visibleColumns` is a signal the headers
    // used to be subscribed to themselves — so the render it triggers mounted
    // headers that inserted into the very subscriber `Set` the notification was
    // still iterating, and a `Set` visits entries added during iteration.
    expect(subscribes(), 'a column-set change subscribed to state signals').toEqual(noSubscribes());
    expect(subscriptions(), 'a column-set change subscribed to the annotation store').toBe(
      storeBefore,
    );
    expect(
      subscriberCounts(h.state),
      'a hide, a show or a reorder changed the subscriber count',
    ).toEqual(before);

    h.container.destroy();
    store.destroy();
  });

  it('returns every count to its pre-container value on destroy', () => {
    const { store } = spiedStore();
    const h = mount(LARGE_COLUMNS, { annotations: store });
    // Churn first, so teardown is asked to release a window made of headers
    // mounted at different times rather than the one the load built.
    h.scrollTo(4500);
    h.scrollTo(1500);

    // The container did subscribe to something — otherwise "returns to
    // baseline" would be true of a container that never wired anything up.
    expect(subscriberCounts(h.state)).not.toEqual(h.before);
    expect(headerCells(h.root()).length).toBeGreaterThan(0);

    h.container.destroy();

    // The leak check. A subscription left behind here holds the container, its
    // header row and every element in it alive for as long as the state does,
    // and goes on running fan-outs over a `headerByColumn` full of destroyed
    // headers on every write for the rest of the page's life.
    expect(subscriberCounts(h.state), 'destroy() left subscriptions behind').toEqual(h.before);

    // Nothing on the other side of the store listener either: an annotation
    // added after teardown must not reach a destroyed header.
    expect(() =>
      store.add({ scope: 'column', column: 'col_0', severity: 'info', message: 'after teardown' }),
    ).not.toThrow();

    store.destroy();
  });
});

/**
 * The fan-out, end to end.
 *
 * One test per signal, each asserting the DOM the header's own private updater
 * writes rather than a proxy for it, because the failure this group exists to
 * catch is a fan-out that is wired and never called — `subscribe: false` on the
 * header plus a missing `forEachMountedHeader` line in the container. That
 * combination leaves every count in the group above perfect and every mounted
 * header stuck on the values it was constructed with.
 */
describe('TableContainer — the fan-out reaches every mounted header', () => {
  it('flips the sort button state class on a sortColumns write', () => {
    const h = mount(SMALL_COLUMNS);
    const sortBtn = partOf(h, 'col_1', '.dt-col-sort-btn');
    expect(sortBtn.classList.contains('dt-col-sort-btn--asc')).toBe(false);

    h.actions.setSort([{ column: 'col_1', direction: 'asc' }]);

    expect(
      sortBtn.classList.contains('dt-col-sort-btn--asc'),
      'a sort landed and the mounted header still shows no sort indicator',
    ).toBe(true);
    expect(headerElement(h, 'col_1').getAttribute('aria-sort')).toBe('ascending');
    // Only that column's. `update()` reads the header's own row of the sort
    // list, so a fan-out handing every header the same answer shows up here.
    expect(headerElement(h, 'col_2').getAttribute('aria-sort')).toBe('none');

    h.actions.setSort([{ column: 'col_1', direction: 'desc' }]);

    expect(sortBtn.classList.contains('dt-col-sort-btn--desc')).toBe(true);
    expect(sortBtn.classList.contains('dt-col-sort-btn--asc')).toBe(false);

    h.container.destroy();
  });

  it('rewrites the stats line on a totalRows write', () => {
    const h = mount(SMALL_COLUMNS);
    const stats = partOf(h, 'col_0', '.dt-col-stats');
    // The fixture loads no rows, and the stats line is blank at zero rather
    // than printing "0 rows".
    expect(stats.textContent).toBe('');

    h.state.totalRows.set(1234);

    expect(stats.textContent, 'the row count changed and the stats line did not').toBe(
      '1,234 rows',
    );

    h.state.totalRows.set(7);

    expect(stats.textContent).toBe('7 rows');

    h.container.destroy();
  });

  it('lights the pin button on a pinnedColumns write', () => {
    const h = mount(SMALL_COLUMNS);
    expect(
      partOf(h, 'col_1', '.dt-col-pin-btn').classList.contains('dt-col-action-btn--active'),
    ).toBe(false);

    h.actions.toggleColumnPin('col_1');

    // Re-read the button: a pin re-renders the row, and the assertion has to be
    // about whatever header is mounted for the column now.
    expect(
      partOf(h, 'col_1', '.dt-col-pin-btn').classList.contains('dt-col-action-btn--active'),
      'the column was pinned and its pin button never lit up',
    ).toBe(true);
    // The same updater disables drag-to-reorder for a pinned column, which is
    // the half a screen reader hears.
    expect(partOf(h, 'col_1', '.dt-col-drag-handle').getAttribute('aria-disabled')).toBe('true');

    h.actions.toggleColumnPin('col_1');

    expect(
      partOf(h, 'col_1', '.dt-col-pin-btn').classList.contains('dt-col-action-btn--active'),
    ).toBe(false);
    expect(partOf(h, 'col_1', '.dt-col-drag-handle').getAttribute('aria-disabled')).toBe('false');

    h.container.destroy();
  });

  it('toggles the filter indicator on a filtersByColumn write', () => {
    const h = mount(SMALL_COLUMNS);
    expect(headerElement(h, 'col_2').classList.contains('dt-col-header--filtered')).toBe(false);

    h.actions.addFilter({ type: 'range', column: 'col_2', min: 0, max: 10 });

    expect(
      headerElement(h, 'col_2').classList.contains('dt-col-header--filtered'),
      'a filter landed and the mounted header shows no filter indicator',
    ).toBe(true);
    expect(
      partOf(h, 'col_2', '.dt-col-filter-btn').classList.contains('dt-col-action-btn--active'),
    ).toBe(true);
    // The updater rebuilds the aria-label from sort + filter state, which is
    // how the filter is announced at all.
    expect(headerElement(h, 'col_2').getAttribute('aria-label')).toContain('filtered');
    // A filter on one column must not tint the rest of the row.
    expect(headerElement(h, 'col_3').classList.contains('dt-col-header--filtered')).toBe(false);

    h.actions.removeFilter('col_2');

    expect(headerElement(h, 'col_2').classList.contains('dt-col-header--filtered')).toBe(false);
    expect(
      partOf(h, 'col_2', '.dt-col-filter-btn').classList.contains('dt-col-action-btn--active'),
    ).toBe(false);

    h.container.destroy();
  });

  it('disables the hide button when a visibleColumns write leaves one column', () => {
    const h = mount(SMALL_COLUMNS);
    const restored = [...h.state.visibleColumns.get()];
    expect(partOf(h, 'col_0', '.dt-col-hide-btn').hasAttribute('disabled')).toBe(false);

    // Written straight to the signal because `hideColumn` refuses to take the
    // last visible column away — the state this button guards is unreachable
    // through the action that would produce it. This is also the one signal of
    // the seven whose fan-out runs from `finishRender` rather than from a
    // subscription, so it is the one that would break if a render path stopped
    // calling it.
    h.state.visibleColumns.set(['col_0']);

    const disabled = partOf(h, 'col_0', '.dt-col-hide-btn');
    expect(
      disabled.hasAttribute('disabled'),
      'the hide button would take the last visible column away and is still enabled',
    ).toBe(true);
    expect(disabled.classList.contains('dt-col-action-btn--disabled')).toBe(true);

    h.state.visibleColumns.set(restored);

    // And back: a hide button left disabled after the set grows again is a
    // control the user can never recover.
    expect(partOf(h, 'col_0', '.dt-col-hide-btn').hasAttribute('disabled')).toBe(false);
    expect(partOf(h, 'col_7', '.dt-col-hide-btn').hasAttribute('disabled')).toBe(false);

    h.container.destroy();
  });

  it('gives the name element its tooltip affordance on a columnHeaderTooltips write', () => {
    const h = mount(SMALL_COLUMNS);
    expect(partOf(h, 'col_0', '.dt-col-name').hasAttribute('tabindex')).toBe(false);

    h.actions.setColumnHeaderTooltip('col_0', { title: 'Col 0', body: 'about col 0' });

    // `-1`, not `0`: the name span becomes an F2-controls-mode stop rather than
    // a tab stop, which is what keeps the tab order independent of the column
    // count. Without it the popover is unreachable by keyboard entirely.
    expect(
      partOf(h, 'col_0', '.dt-col-name').getAttribute('tabindex'),
      'a tooltip override landed and its column is still unreachable by keyboard',
    ).toBe('-1');
    expect(partOf(h, 'col_1', '.dt-col-name').hasAttribute('tabindex')).toBe(false);

    h.actions.setColumnHeaderTooltip('col_0', null);

    expect(partOf(h, 'col_0', '.dt-col-name').hasAttribute('tabindex')).toBe(false);

    h.container.destroy();
  });

  it('tints the header on an annotation-store write', () => {
    const store = new AnnotationStore();
    const h = mount(SMALL_COLUMNS, { annotations: store });
    const el = headerElement(h, 'col_0');
    expect(el.classList.contains('dt-col-header--annotated')).toBe(false);

    const ann = store.add({
      scope: 'column',
      column: 'col_0',
      severity: 'error',
      message: 'column broken',
    });

    expect(
      el.classList.contains('dt-col-header--annotated'),
      'an annotation landed on the column and its header is untinted',
    ).toBe(true);
    expect(el.classList.contains('dt-col-header--annotation-error')).toBe(true);
    expect(el.dataset.dtAnnotationCount).toBe('1');
    // An annotation on one column must not tint the rest of the row.
    expect(headerElement(h, 'col_1').classList.contains('dt-col-header--annotated')).toBe(false);

    store.remove(ann.id);

    // Both directions, because `applyAnnotationClasses` clears before it reads:
    // a fan-out that only ever ran on `add` would leave a column tinted for an
    // annotation the app has already withdrawn.
    expect(el.classList.contains('dt-col-header--annotated')).toBe(false);
    expect(el.dataset.dtAnnotationCount).toBeUndefined();

    h.container.destroy();
    store.destroy();
  });

  it('reaches a header that scrolled into view long after the fan-out was wired', () => {
    const h = mount(LARGE_COLUMNS);
    h.state.totalRows.set(1234);
    h.actions.setSort([{ column: 'col_40', direction: 'desc' }]);
    expect(headerFor(h.root(), 'col_40')).toBeNull();

    h.scrollTo(COL_WIDTH * 40);

    // Born correct: the constructor pulls current values whether or not it
    // subscribes, so a header scrolled into view is indistinguishable from one
    // built at load.
    const el = headerElement(h, 'col_40');
    expect(el.getAttribute('aria-sort'), 'a header scrolled into view missing the sort').toBe(
      'descending',
    );
    expect(partOf(h, 'col_40', '.dt-col-stats').textContent).toBe('1,234 rows');

    h.state.totalRows.set(7);
    h.actions.setSort([]);

    // …and then live. `forEachMountedHeader` walks the map this header joined
    // at mount, so later writes have to reach it too. A fan-out that captured
    // the headers existing when the subscription was made would pass every
    // assertion above and freeze here — a column that scrolls into view once
    // and never updates again for the rest of the session.
    expect(
      el.getAttribute('aria-sort'),
      'the fan-out never reached a header mounted after it was wired',
    ).toBe('none');
    expect(partOf(h, 'col_40', '.dt-col-stats').textContent).toBe('7 rows');

    h.container.destroy();
  });
});

/**
 * The header's own subscriptions, which `subscribe` defaults to keeping.
 *
 * `TableContainer` is not the only thing that builds a `ColumnHeader`: the
 * class is public on `/advanced`, and a header constructed directly has no
 * owner to fan anything out to it. The default therefore has to stay `true`,
 * and `false` has to be exactly "the same header, minus the reactions its owner
 * now owes it" — correct on arrival either way.
 */
describe('ColumnHeader — subscribe defaults to true', () => {
  const COLUMN: ColumnSchema = {
    name: 'col_0',
    type: 'integer',
    nullable: false,
    originalType: 'INTEGER',
  };

  /** A state and actions pair with nothing mounted against them. */
  function bare(): { state: TableState; actions: StateActions } {
    const state = createTableState();
    return { state, actions: new StateActions(state, bridge) };
  }

  it('subscribes to all seven and reacts on its own', () => {
    const { state, actions } = bare();
    const { store, subscriptions } = spiedStore();
    const before = subscriberCounts(state);

    const header = new ColumnHeader(COLUMN, state, actions, { annotations: store });

    for (const name of FANNED_SIGNALS) {
      expect(state[name].subscriberCount(), `${name} after a default construction`).toBe(
        before[name] + 1,
      );
    }
    expect(subscriptions(), 'annotation-store subscriptions').toBe(1);

    // Live, not merely present: `/advanced` constructs headers directly and
    // nothing else would drive this one.
    state.sortColumns.set([{ column: 'col_0', direction: 'asc' }]);
    expect(header.getElement().getAttribute('aria-sort')).toBe('ascending');
    state.totalRows.set(5);
    expect(header.getStatsElement().textContent).toBe('5 rows');

    header.destroy();

    // And the header releases every one of them, which is what makes the
    // container's own teardown check meaningful for headers built the old way.
    expect(subscriberCounts(state)).toEqual(before);

    store.destroy();
  });

  it('subscribes to nothing under subscribe: false, and is correct on arrival', () => {
    const { state, actions } = bare();
    const { store, subscriptions } = spiedStore();

    // Everything the constructor has to pull, established before it runs.
    state.totalRows.set(1234);
    state.visibleColumns.set(['col_0']);
    state.pinnedColumns.set(['col_0']);
    actions.addFilter({ type: 'range', column: 'col_0', min: 0, max: 10 });
    actions.setColumnHeaderTooltip('col_0', { title: 'Col 0', body: 'about col 0' });
    store.add({ scope: 'column', column: 'col_0', severity: 'warning', message: 'check me' });
    const before = subscriberCounts(state);

    const header = new ColumnHeader(COLUMN, state, actions, {
      annotations: store,
      subscribe: false,
    });
    const el = header.getElement();

    expect(subscriberCounts(state), 'subscribe: false still subscribed').toEqual(before);
    expect(subscriptions(), 'subscribe: false still subscribed to the annotation store').toBe(0);

    // A signal fires only on change, so a header that skipped the pull would
    // render blank — no row count, no filter tint, no pin, an enabled hide
    // button on the last visible column — until some unrelated write happened
    // to land. Correct on arrival is the whole basis of the arrangement.
    expect(header.getStatsElement().textContent).toBe('1,234 rows');
    expect(el.classList.contains('dt-col-header--filtered')).toBe(true);
    expect(
      el.querySelector('.dt-col-pin-btn')!.classList.contains('dt-col-action-btn--active'),
    ).toBe(true);
    expect(el.querySelector('.dt-col-hide-btn')!.hasAttribute('disabled')).toBe(true);
    // These two are pulled from `createElement` rather than `subscribeToState`,
    // so they are unaffected by the flag — asserted here so a later refactor
    // that moves them into the skipped branch is caught.
    expect(el.classList.contains('dt-col-header--annotated')).toBe(true);
    expect(el.querySelector('.dt-col-name')!.getAttribute('tabindex')).toBe('-1');

    header.destroy();
    store.destroy();
  });

  it('reacts only through the refresh methods under subscribe: false', () => {
    const { state, actions } = bare();
    const { store } = spiedStore();
    state.visibleColumns.set(['col_0', 'col_1']);

    const header = new ColumnHeader(COLUMN, state, actions, {
      annotations: store,
      subscribe: false,
    });
    const el = header.getElement();

    // One write per signal the owner took over.
    state.sortColumns.set([{ column: 'col_0', direction: 'asc' }]);
    state.totalRows.set(1234);
    state.pinnedColumns.set(['col_0']);
    actions.addFilter({ type: 'range', column: 'col_0', min: 0, max: 10 });
    state.visibleColumns.set(['col_0']);
    actions.setColumnHeaderTooltip('col_0', { title: 'Col 0', body: 'about col 0' });
    store.add({ scope: 'column', column: 'col_0', severity: 'error', message: 'broken' });

    // Nothing moved. This is what the container is signing up for when it
    // passes `subscribe: false`: every one of these is now its debt, and a
    // missing fan-out line leaves the header exactly here.
    expect(el.getAttribute('aria-sort'), 'subscribe: false reacted to a sort anyway').toBe('none');
    expect(header.getStatsElement().textContent).toBe('');
    expect(
      el.querySelector('.dt-col-pin-btn')!.classList.contains('dt-col-action-btn--active'),
    ).toBe(false);
    expect(el.classList.contains('dt-col-header--filtered')).toBe(false);
    expect(el.querySelector('.dt-col-hide-btn')!.hasAttribute('disabled')).toBe(false);
    expect(el.querySelector('.dt-col-name')!.hasAttribute('tabindex')).toBe(false);
    expect(el.classList.contains('dt-col-header--annotated')).toBe(false);

    header.update();
    header.refreshStatsLine(state.totalRows.get());
    header.refreshPinState();
    header.refreshFilterIndicator();
    header.refreshHideButtonState(state.visibleColumns.get());
    header.refreshTooltip();
    header.refreshAnnotations();

    // Each entry point is exactly what that header's own subscription callback
    // did, so the two arrangements produce the same DOM from the same state. A
    // divergence here is a header that its owner can no longer bring up to date
    // at all, which no count in this file would notice.
    expect(el.getAttribute('aria-sort'), 'update() did not apply the current sort').toBe(
      'ascending',
    );
    expect(header.getStatsElement().textContent).toBe('1,234 rows');
    expect(
      el.querySelector('.dt-col-pin-btn')!.classList.contains('dt-col-action-btn--active'),
    ).toBe(true);
    expect(el.classList.contains('dt-col-header--filtered')).toBe(true);
    expect(el.querySelector('.dt-col-hide-btn')!.hasAttribute('disabled')).toBe(true);
    expect(el.querySelector('.dt-col-name')!.getAttribute('tabindex')).toBe('-1');
    expect(el.classList.contains('dt-col-header--annotated')).toBe(true);

    header.destroy();

    // A fan-out walks a set its owner maintains, so one that lags a teardown by
    // a tick has to be harmless rather than throwing out of the middle of a
    // scroll frame — the reason every refresh returns early once destroyed.
    expect(() => {
      header.update();
      header.refreshStatsLine(0);
      header.refreshPinState();
      header.refreshFilterIndicator();
      header.refreshHideButtonState([]);
      header.refreshTooltip();
      header.refreshAnnotations();
    }).not.toThrow();

    store.destroy();
  });
});
