/**
 * @vitest-environment jsdom
 *
 * The column window, live: body rows render only the horizontally visible
 * span, and everything that used to be true of "one cell per visible column"
 * has to keep being true of a moving slice.
 *
 * The tier is deliberately concrete — 60 columns of 150 px in a 600 px
 * viewport — so every expectation below is an arithmetic fact rather than a
 * recorded output. At `scrollLeft = 3000` the un-overscanned visible run is
 * `[20, 24)`; one viewport of pixel overscan per side widens it to `[16, 28)`;
 * the ten-column floor widens it again to `[10, 34)`. That is the window, its
 * left spacer is `10 × 150 = 1500`, its right spacer is `26 × 150 = 3900`, and
 * `1500 + 24 × 150 + 3900 = 9000` — the full content width, at every offset.
 * That last identity is the one real guard: it is what makes the horizontal
 * scroll extent independent of which columns happen to be mounted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { MIN_OVERSCAN_COLUMNS } from '@/table/ColumnWindow';

import { rowsFor } from '../helpers/rowFetchBridge';
import {
  SPACERS_PER_ROW,
  bodyCells,
  cellFor,
  renderedColumns,
  rowElements,
  rowPool,
  spacerWidths,
} from '../helpers/tableBodyDom';
import {
  MockResizeObserver,
  setupTableBody,
  wideHarnessSchema,
  type TableBodyHarness,
  type TableBodyHarnessOptions,
} from '../helpers/tableBodyHarness';

/** Columns, their uniform width, and the viewport the window is cut to. */
const COLUMNS = 60;
const COL_WIDTH = 150;
const VIEWPORT = 600;
const TOTAL_WIDTH = COLUMNS * COL_WIDTH;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/**
 * Resolve every captured query with exactly the rows it asked for.
 *
 * The shared bridge mock is deferred, so any state write that invalidates the
 * row cache — pinning a column, changing a width — leaves the body showing
 * placeholders until this runs. Placeholders carry no window stamp, so a
 * structural assertion against one fails for a reason that has nothing to do
 * with the window.
 */
async function settle(harness: TableBodyHarness): Promise<void> {
  for (const query of harness.queries.splice(0, harness.queries.length)) {
    query.deferred.resolve(rowsFor(query.sql, harness.columns));
  }
  await harness.drain();
}

/** A mounted body over {@link COLUMNS} columns with rows already painted. */
async function mount(options: TableBodyHarnessOptions = {}): Promise<TableBodyHarness> {
  const harness = setupTableBody({
    totalRows: 100,
    clientWidth: VIEWPORT,
    schema: wideHarnessSchema(COLUMNS),
    ...options,
    body: { prefetch: false, ...options.body },
  });
  const init = harness.body.initialize();
  await settle(harness);
  await init;
  return harness;
}

/** The first painted data row — every row in a pass has the same structure. */
function firstRow(harness: TableBodyHarness): HTMLElement {
  const row = rowElements(harness.body).get(0);
  expect(row).toBeDefined();
  return row!;
}

describe('TableBody — the rendered column window follows scrollLeft', () => {
  it('renders a bounded window instead of every column', async () => {
    const harness = await mount();

    // At rest: the visible run is [0, 4), the pixel overscan takes it to
    // [0, 8), the column floor to [0, 14).
    expect(harness.body.getColumnWindow()).toMatchObject({ start: 0, end: 14, pinnedCount: 0 });

    const row = firstRow(harness);
    expect(renderedColumns(row)).toEqual(Array.from({ length: 14 }, (_, i) => `col_${i}`));
    expect(row.children.length).toBe(14 + SPACERS_PER_ROW);
    expect(row.getAttribute('data-window')).toBe('0:14');
    // 46 columns are standing behind the right spacer.
    expect(spacerWidths(row)).toEqual({ left: 0, right: 46 * COL_WIDTH });

    harness.body.destroy();
  });

  it('moves the window and both spacers when scrolled', async () => {
    const harness = await mount();
    harness.scrollToColumnPx(3000);

    expect(harness.body.getColumnWindow()).toMatchObject({ start: 10, end: 34 });

    const row = firstRow(harness);
    expect(renderedColumns(row)[0]).toBe('col_10');
    expect(renderedColumns(row).at(-1)).toBe('col_33');
    expect(bodyCells(row)).toHaveLength(24);
    expect(row.getAttribute('data-window')).toBe('0:24');
    expect(spacerWidths(row)).toEqual({ left: 1500, right: 3900 });
    // Nothing outside the window is mounted, in any row.
    expect(cellFor(row, 'col_0')).toBeNull();
    expect(cellFor(row, 'col_59')).toBeNull();

    harness.body.destroy();
  });

  it('keeps spacers + rendered cells equal to the full content width at every offset', async () => {
    // The invariant the horizontal scroll extent rests on. If it ever fails,
    // `scrollWidth` changes as the user scrolls and the scrollbar walks away
    // from under the thumb.
    const harness = await mount();
    const maxScroll = TOTAL_WIDTH - VIEWPORT;

    for (const at of [0, 0.25, 0.5, 0.75, 1]) {
      harness.scrollToColumnPx(Math.round(maxScroll * at));

      const row = firstRow(harness);
      const spacers = spacerWidths(row);
      const rendered = bodyCells(row).length * COL_WIDTH;
      expect(spacers.left + rendered + spacers.right).toBe(TOTAL_WIDTH);
      expect(harness.body.getColumnWindow().totalWidthPx).toBe(TOTAL_WIDTH);
      // …and the window never grows back to the whole table.
      expect(bodyCells(row).length).toBeLessThan(COLUMNS);
    }

    harness.body.destroy();
  });

  it('keys cell ids and aria-colindex on the absolute column index', async () => {
    // The cursor is published as `aria-activedescendant`, and
    // `TableContainer.syncActiveDescendant` builds that id from
    // `visibleColumns.indexOf(column)`. A window-relative id would resolve to
    // the wrong cell the moment the window moved off zero.
    const harness = await mount({ body: { instanceId: 'w1', prefetch: false } });
    harness.scrollToColumnPx(3000);

    const row = firstRow(harness);
    const first = cellFor(row, 'col_10')!;
    expect(first).not.toBeNull();
    expect(first.id).toBe('dt-w1-cell-0-10');
    expect(first.getAttribute('aria-colindex')).toBe('11');

    const last = cellFor(row, 'col_33')!;
    expect(last.id).toBe('dt-w1-cell-0-33');
    expect(last.getAttribute('aria-colindex')).toBe('34');

    harness.body.destroy();
  });

  it('renders pinned columns at any offset, ahead of the left spacer', async () => {
    const harness = await mount();
    harness.state.pinnedColumns.set(['col_0']);
    await settle(harness);
    harness.scrollToColumnPx(TOTAL_WIDTH - VIEWPORT);

    const win = harness.body.getColumnWindow();
    expect(win.pinnedCount).toBe(1);
    expect(win.end).toBe(COLUMNS);

    const row = firstRow(harness);
    const columns = renderedColumns(row);
    expect(columns[0]).toBe('col_0');
    expect(columns[1]).toBe(`col_${win.start}`);
    expect(row.getAttribute('data-window')).toBe(`1:${win.end - win.start}`);
    expect(cellFor(row, 'col_0')!.classList.contains('dt-cell--pinned')).toBe(true);
    // The left spacer covers everything between the pinned run and the window.
    expect(spacerWidths(row).left).toBe((win.start - 1) * COL_WIDTH);

    harness.body.destroy();
  });
});

describe('TableBody — the cursor and a moving window', () => {
  it('drops the ring when its column scrolls out and restores it on the way back', async () => {
    // The failure this pins down: a window that moves *at constant size* is
    // repainted in place, cell elements and all. If the ring were removed by
    // re-resolving the old cursor through the new window it would resolve to
    // nothing, and the class would sit there on whatever column now occupies
    // that child position — a second cursor, in the wrong place.
    const harness = await mount();
    harness.state.focusedCell.set({ row: 0, column: 'col_2' });

    const ringed = (): HTMLElement | null =>
      firstRow(harness).querySelector<HTMLElement>('.dt-cell--focused');
    expect(ringed()?.getAttribute('data-column')).toBe('col_2');

    // Far enough that even the focus fallback cannot reach back to col_2.
    harness.scrollToColumnPx(TOTAL_WIDTH - VIEWPORT);
    expect(cellFor(firstRow(harness), 'col_2')).toBeNull();
    expect(ringed()).toBeNull();

    harness.scrollToColumnPx(0);
    expect(ringed()?.getAttribute('data-column')).toBe('col_2');

    harness.body.destroy();
  });

  it('force-renders a cursor just outside the window, but not one far outside', async () => {
    const harness = await mount();
    // Window at rest is [0, 14). `col_20` is 7 past its end — inside the
    // ten-column budget — so it is pulled in.
    harness.state.focusedCell.set({ row: 0, column: 'col_20' });
    harness.body.refreshColumnWindow();

    expect(harness.body.getColumnWindow().end).toBe(21);
    expect(cellFor(firstRow(harness), 'col_20')).not.toBeNull();
    expect(spacerWidths(firstRow(harness)).right).toBe((COLUMNS - 21) * COL_WIDTH);

    // `col_40` is 27 past the end. Rendering it would mean mounting 27 cells
    // nobody can see, which is the cost windowing exists to remove.
    harness.state.focusedCell.set({ row: 0, column: 'col_40' });
    harness.body.refreshColumnWindow();

    expect(harness.body.getColumnWindow().end).toBe(14);
    expect(cellFor(firstRow(harness), 'col_40')).toBeNull();

    harness.body.destroy();
  });

  it('bounds the fallback at exactly the overscan budget', async () => {
    const harness = await mount();
    const end = harness.body.getColumnWindow().end;

    harness.state.focusedCell.set({ row: 0, column: `col_${end + MIN_OVERSCAN_COLUMNS - 1}` });
    harness.body.refreshColumnWindow();
    expect(harness.body.getColumnWindow().end).toBe(end + MIN_OVERSCAN_COLUMNS);

    harness.state.focusedCell.set({ row: 0, column: `col_${end + MIN_OVERSCAN_COLUMNS}` });
    harness.body.refreshColumnWindow();
    expect(harness.body.getColumnWindow().end).toBe(end);

    harness.body.destroy();
  });
});

describe('TableBody — refreshColumnWindow', () => {
  it('updates the DOM synchronously, without waiting for a frame', async () => {
    // The contract every programmatic `scrollLeft` writer depends on: the
    // browser does not dispatch `scroll` until the current task ends, so a
    // caller that scrolls and then reads the DOM must not see the old window.
    const harness = await mount();
    harness.scrollContainer.scrollLeft = 3000;

    // Nothing has run yet — no event, no frame.
    expect(renderedColumns(firstRow(harness))[0]).toBe('col_0');

    harness.body.refreshColumnWindow();
    expect(renderedColumns(firstRow(harness))[0]).toBe('col_10');

    harness.body.destroy();
  });

  it('does no DOM work when the window did not move', async () => {
    let renders = 0;
    const harness = await mount({ body: { prefetch: false, onRowsRendered: () => renders++ } });

    // Half a column past the left edge does move the window: the right edge
    // crosses into column 4, and the window ends one column later.
    harness.scrollContainer.scrollLeft = 75;
    renders = 0;
    harness.body.refreshColumnWindow();
    expect(renders).toBe(1);
    expect(harness.body.getColumnWindow()).toMatchObject({ start: 0, end: 15 });

    // The next 25 px stay inside every band they were already in, so the
    // window is identical and the body must not touch the DOM for it. This is
    // the common case at 60 fps — most frames of a scroll move no boundary.
    harness.scrollContainer.scrollLeft = 100;
    harness.body.refreshColumnWindow();
    expect(renders).toBe(1);
    expect(harness.body.getColumnWindow()).toMatchObject({ start: 0, end: 15 });

    harness.body.destroy();
  });

  it('is inert after destroy', async () => {
    const harness = await mount();
    harness.body.destroy();
    harness.scrollContainer.scrollLeft = 3000;
    expect(() => harness.body.refreshColumnWindow()).not.toThrow();
  });
});

describe('TableBody — the horizontal scroll listener', () => {
  it('coalesces a burst of scroll events into one render', async () => {
    let renders = 0;
    const harness = await mount({ body: { prefetch: false, onRowsRendered: () => renders++ } });
    renders = 0;

    harness.scrollContainer.scrollLeft = 3000;
    harness.fireScroll();
    harness.fireScroll();
    harness.fireScroll();
    // Still nothing: the work is deferred to the frame.
    expect(renders).toBe(0);

    harness.flushFrames();
    expect(renders).toBe(1);
    expect(renderedColumns(firstRow(harness))[0]).toBe('col_10');

    harness.body.destroy();
  });

  it('costs nothing when only scrollTop moved', async () => {
    // This listener fires on every wheel tick of a vertical scroll. If it did
    // not compare `scrollLeft` first, every one of them would schedule a frame
    // and recompute a window that cannot have changed.
    let renders = 0;
    const harness = await mount({ body: { prefetch: false, onRowsRendered: () => renders++ } });
    harness.body.refreshColumnWindow(); // record the current offset
    renders = 0;

    harness.fireScroll();
    harness.flushFrames();
    expect(renders).toBe(0);

    harness.body.destroy();
  });

  it('stops tracking scroll once the body is destroyed', async () => {
    // `TableContainer` owns `.dt-body-scroll` and rebuilds the body into it on
    // every schema change, so the element outlives this instance.
    let renders = 0;
    const harness = await mount({ body: { prefetch: false, onRowsRendered: () => renders++ } });
    harness.body.destroy();
    renders = 0;

    harness.scrollContainer.scrollLeft = 3000;
    harness.fireScroll();
    expect(() => harness.flushFrames()).not.toThrow();
    expect(renders).toBe(0);
  });
});

describe('TableBody — pooled rows across a window change', () => {
  it('reshapes a reused row to the new window instead of leaving it short', async () => {
    const harness = await mount();
    expect(bodyCells(firstRow(harness))).toHaveLength(14);

    // Scroll vertically far enough that every row is recycled into the pool,
    // then scroll horizontally into a wider window and back down.
    harness.scrollToRow(400);
    expect(rowPool(harness.body).length).toBeGreaterThan(0);
    harness.scrollToColumnPx(3000);
    harness.scrollToRow(0);
    for (const query of harness.queries.splice(0, harness.queries.length)) {
      query.deferred.resolve(rowsFor(query.sql, harness.columns));
    }
    await harness.drain();

    for (const row of rowElements(harness.body).values()) {
      if (row.hasAttribute('data-placeholder')) continue;
      expect(row.getAttribute('data-window')).toBe('0:24');
      expect(row.children.length).toBe(24 + SPACERS_PER_ROW);
      expect(renderedColumns(row)[0]).toBe('col_10');
    }

    harness.body.destroy();
  });

  it('rebuilds every mounted row when a width change moves the window', async () => {
    const harness = await mount();
    harness.scrollToColumnPx(3000);
    expect(harness.body.getColumnWindow()).toMatchObject({ start: 10, end: 34 });

    // Widening col_0 by 3,000 px pushes everything after it right, so the
    // columns under the (unchanged) scroll offset are earlier ones.
    const widths = new Map(harness.state.columnWidths.get());
    widths.set('col_0', COL_WIDTH + 3000);
    harness.state.columnWidths.set(widths);

    const win = harness.body.getColumnWindow();
    expect(win.start).toBeLessThan(10);
    for (const row of rowElements(harness.body).values()) {
      if (row.hasAttribute('data-placeholder')) continue;
      expect(row.getAttribute('data-window')).toBe(`0:${win.end - win.start}`);
      expect(renderedColumns(row)[0]).toBe(`col_${win.start}`);
    }

    harness.body.destroy();
  });
});

describe('TableBody — shared column geometry', () => {
  it('answers where a column sits, from the same sums it draws with', async () => {
    const harness = await mount();

    expect(harness.body.getColumnSpan('col_0')).toEqual({ left: 0, width: COL_WIDTH });
    expect(harness.body.getColumnSpan('col_20')).toEqual({ left: 3000, width: COL_WIDTH });
    // Answering for a column outside the window is the point: keyboard
    // navigation scrolls to columns that are not rendered yet.
    expect(harness.body.getColumnSpan('col_59')).toEqual({
      left: (COLUMNS - 1) * COL_WIDTH,
      width: COL_WIDTH,
    });
    expect(harness.body.getColumnSpan('nope')).toBeNull();

    harness.body.destroy();
  });

  it('measures the pinned band over visible columns, not over pinnedColumns', async () => {
    const harness = await mount();
    expect(harness.body.getPinnedWidthPx()).toBe(0);

    harness.state.pinnedColumns.set(['col_0', 'col_1']);
    harness.state.visibleColumns.set([...harness.state.visibleColumns.get()]);
    expect(harness.body.getPinnedWidthPx()).toBe(2 * COL_WIDTH);

    // `hideColumn` leaves a column in `pinnedColumns`; counting it there
    // would overstate the band by a full column.
    harness.state.visibleColumns.set(
      harness.state.visibleColumns.get().filter((c) => c !== 'col_1'),
    );
    expect(harness.body.getPinnedWidthPx()).toBe(COL_WIDTH);

    harness.body.destroy();
  });

  it('hands out a copy of the window, not the live object', async () => {
    const harness = await mount();
    const win = harness.body.getColumnWindow();
    win.start = 999;
    expect(harness.body.getColumnWindow().start).toBe(0);

    harness.body.destroy();
  });
});
