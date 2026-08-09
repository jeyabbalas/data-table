/**
 * @vitest-environment jsdom
 *
 * One column window, two consumers.
 *
 * The header row and the body render the same columns at the same offsets.
 * Computing that twice is how they drift, and a header one column ahead of its
 * own cells is exactly the failure the spacer arithmetic exists to prevent —
 * so `TableContainer` owns the model, the viewport definition and the drivers,
 * and hands all three to `TableBody`.
 *
 * The tier is concrete so every expectation is arithmetic rather than a
 * recorded output: 60 columns of 150 px, a 600 px body viewport and a 900 px
 * header viewport (they differ in the real thing by the body's vertical
 * scrollbar; the gap is exaggerated here so a wrong choice of viewport is
 * visible rather than a rounding argument).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { MIN_OVERSCAN_COLUMNS } from '@/table/ColumnWindow';
import { TableBody } from '@/table/TableBody';
import { TableContainer } from '@/table/TableContainer';

import { headerRowEl } from '../helpers/headerDom';

const COLUMNS = 60;
const COL_WIDTH = 150;
const BODY_VIEWPORT = 600;
const HEADER_VIEWPORT = 900;
const TOTAL_WIDTH = COLUMNS * COL_WIDTH;

/**
 * Records every live instance so a test can deliver a resize on demand and
 * count what the container actually watches. jsdom performs no layout and
 * dispatches no entries, so anything keyed on a box change is untestable
 * without it.
 */
class MockResizeObserver implements ResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  /** Fire this observer's callback; the entries themselves are never read. */
  fire(): void {
    this.callback([], this);
  }

  static observing(target: Element): MockResizeObserver | undefined {
    return MockResizeObserver.instances.find((i) => i.targets.has(target));
  }

  static reset(): void {
    MockResizeObserver.instances = [];
  }
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

/** Fix an element's `clientWidth`, which jsdom otherwise reports as 0. */
function stubWidth(el: HTMLElement, width: number): void {
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
}

interface Harness {
  container: TableContainer;
  host: HTMLElement;
  state: TableState;
  body: TableBody;
}

/**
 * A loaded container with a real `TableBody`, both viewports measured.
 *
 * `totalRows` stays 0 on purpose: the window is a function of widths and
 * offsets alone, so a row fetch would only add a settling problem to a test
 * about geometry. `renderVisibleRows` still runs and still publishes the
 * window, which is what every assertion here reads.
 */
function mount(): Harness {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const state = createTableState();
  const actions = new StateActions(state, bridge);
  const schema = schemaOf(COLUMNS);

  const container = new TableContainer(host, state, actions, bridge, {});

  stubWidth(container.getScrollContainer(), BODY_VIEWPORT);
  stubWidth(container.getHeaderScroll(), HEADER_VIEWPORT);

  state.schema.set(schema);
  initializeColumnsFromSchema(state, schema);
  state.tableName.set('t');

  const body = container.getTableBody();
  if (!body) throw new Error('expected a TableBody');
  return { container, host, state, body };
}

beforeEach(() => {
  MockResizeObserver.reset();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  MockResizeObserver.reset();
  document.body.innerHTML = '';
});

describe('TableContainer — the shared column window', () => {
  it('cuts the window to the wider of the two scrollers', () => {
    const { container, body } = mount();
    container.refreshColumnWindow();

    // At scrollLeft 0 over 150 px columns: the un-overscanned visible run is
    // [0, 6) at 900 px and [0, 4) at 600 px. The ten-column floor puts `end`
    // at 16 and 14 respectively — so the two viewports are distinguishable,
    // and the header's is the one that must win. Taking the body's would
    // leave the header's rightmost columns unmounted while their cells were
    // rendered.
    const visibleAtHeaderWidth = Math.ceil(HEADER_VIEWPORT / COL_WIDTH);
    expect(body.getColumnWindow().end).toBe(visibleAtHeaderWidth + MIN_OVERSCAN_COLUMNS);

    container.destroy();
  });

  it('re-windows the body synchronously from a programmatic scroll', () => {
    const { container, body } = mount();
    container.refreshColumnWindow();
    const before = body.getColumnWindow();

    // No `scroll` event: jsdom dispatches none for a written offset, and
    // neither does a real browser until the task ends. That is the whole
    // reason `refreshColumnWindow` is synchronous — without it the frame
    // after any programmatic scroll shows the previous offset's window, which
    // at 1,000 columns is a blank table.
    container.getScrollContainer().scrollLeft = 4500;
    container.refreshColumnWindow();

    const after = body.getColumnWindow();
    expect(after.start).toBeGreaterThan(before.start);
    expect(after.end).toBeGreaterThan(before.end);
    // 4500 px is column 30; the visible run starts there and the floor pulls
    // `start` back by ten.
    expect(after.start).toBe(4500 / COL_WIDTH - MIN_OVERSCAN_COLUMNS);

    container.destroy();
  });

  it('re-windows when the viewport widens without scrolling', () => {
    const { container, body } = mount();
    container.refreshColumnWindow();
    const before = body.getColumnWindow();

    stubWidth(container.getScrollContainer(), BODY_VIEWPORT * 4);
    stubWidth(container.getHeaderScroll(), BODY_VIEWPORT * 4);
    MockResizeObserver.observing(container.getScrollContainer())?.fire();

    expect(body.getColumnWindow().end).toBeGreaterThan(before.end);

    container.destroy();
  });

  it('publishes one content extent to the header row and the scroller', () => {
    const { container, body, host } = mount();

    // Written by `render()` from the shared prefix sums the moment the row is
    // built — before the body's first render pass, which is one fetch away
    // when there are rows and never happens when there are none.
    expect(headerRowEl(host)!.style.minWidth).toBe(`${TOTAL_WIDTH}px`);

    container.refreshColumnWindow();
    expect(headerRowEl(host)!.style.minWidth).toBe(`${TOTAL_WIDTH}px`);
    expect(body.getColumnWindow().totalWidthPx).toBe(TOTAL_WIDTH);

    container.destroy();
  });

  it('installs one column-window observer, on the body scroller', () => {
    const { container } = mount();

    // The body no longer installs its own when it is handed a host: two
    // observers on the same element would recompute the same window twice per
    // resize, and the second would be the one nothing disconnects on a body
    // rebuild.
    const watching = MockResizeObserver.instances.filter((i) =>
      i.targets.has(container.getScrollContainer()),
    );
    expect(watching).toHaveLength(1);

    container.destroy();
  });

  it('leaves a standalone TableBody owning its own window', () => {
    // The `/advanced` path: no container, no host, so the body reconstructs
    // exactly what it owned before the hoist — its own model, its own
    // observer, and its own reach across the DOM for the header row's width.
    const host = document.createElement('div');
    document.body.appendChild(host);
    stubWidth(host, BODY_VIEWPORT);

    const state = createTableState();
    const actions = new StateActions(state, bridge);
    const schema = schemaOf(COLUMNS);
    state.schema.set(schema);
    initializeColumnsFromSchema(state, schema);
    state.tableName.set('t');

    const body = new TableBody(host, state, bridge, actions, {});
    stubWidth(body.getVirtualScroller().getScrollContainer(), BODY_VIEWPORT);
    body.refreshColumnWindow();

    expect(body.getColumnWindow().end).toBe(
      Math.ceil(BODY_VIEWPORT / COL_WIDTH) + MIN_OVERSCAN_COLUMNS,
    );
    expect(
      MockResizeObserver.observing(body.getVirtualScroller().getScrollContainer()),
    ).toBeDefined();

    body.destroy();
  });
});
