/**
 * @vitest-environment jsdom
 *
 * What each tier of `render()` is allowed to throw away.
 *
 * `render()` used to mean exactly one thing: wipe the header row, destroy every
 * `ColumnHeader`, and destroy and recreate the whole `TableBody` — on every
 * `schema` write and every `visibleColumns` write alike. It now dispatches on
 * the `headerStructure` signature, compared by identity: a new `schema` array
 * or a new `tableName` is structural and rebuilds; anything else reconciles the
 * header row by column name and leaves `TableBody` standing.
 *
 * Two consequences are pinned here, one per describe:
 *
 *  - **A column-set change keeps the body.** `TableBody` owns a
 *    `visibleColumns` subscription that re-renders a pure reorder and calls
 *    `invalidateCacheAndRefresh()` on a set change, so destroying it from here
 *    only threw away its row cache and its scroll offset and then paid to fetch
 *    them again. Measured in a browser after the change: a column reorder costs
 *    0 DuckDB queries, where the rebuild cost 2.
 *  - **A load renders once.** `initializeColumnsFromSchema` writes `schema` and
 *    `visibleColumns` in one batch, so the `schema` subscriber runs first
 *    already seeing the final visible set and its structural render builds
 *    everything; the `visibleColumns` subscriber that follows finds every
 *    column mounted where it belongs and does only the cheap walk. Before this,
 *    a load built every `ColumnHeader` twice and constructed two `TableBody`
 *    instances — WIDE_CI load, ~1,100 ms down to ~854 ms.
 *
 * The unchanged-signature case is deliberately *not* an early return:
 * `render()` is public on an `/advanced` class and means "bring the DOM up to
 * date", so it still runs the cheap tier. Nothing here asserts that a second
 * render did nothing — what is asserted is that the expensive half happened
 * once, and that the cheap half still refreshes what the signature does not
 * cover.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { ColumnHeader } from '@/table/ColumnHeader';
import { TableBody } from '@/table/TableBody';
import { TableContainer, type TableContainerOptions } from '@/table/TableContainer';

import { headerCells, headerColumns } from '../helpers/headerDom';
import { rowsFor } from '../helpers/rowFetchBridge';

const COLUMNS = 6;
const ROWS = 200;
/** 320 px at the default 32 px rows: ten rows in view, plus the buffer. */
const VIEWPORT_HEIGHT = 320;
/** Row 20's top edge — far enough down that a reset to 0 is unmistakable. */
const SCROLL_TOP = 640;

const SCHEMA: ColumnSchema[] = Array.from({ length: COLUMNS }, (_, i) => ({
  name: `col_${i}`,
  type: 'integer' as const,
  nullable: false,
  originalType: 'INTEGER',
}));
const COLUMN_NAMES = SCHEMA.map((column) => column.name);

class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * A bridge that answers with exactly the row window the SELECT asked for,
 * whichever SQL shape `TableBody` emitted.
 *
 * Rebuilt per test rather than shared, because two tests here count its calls
 * and a module-level `vi.fn()` would carry the previous test's fetches into
 * that count.
 */
function makeBridge() {
  return {
    initialize: vi.fn(),
    query: vi.fn(async (sql: string) => rowsFor(sql, COLUMN_NAMES)),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
  };
}

let bridge: ReturnType<typeof makeBridge>;

interface Harness {
  container: TableContainer;
  state: TableState;
  actions: StateActions;
  host: HTMLElement;
}

/**
 * A container mounted *before* its data, then loaded the way `DataTable` loads
 * it: the row count and the relation name first, then one
 * `initializeColumnsFromSchema` batch.
 *
 * The order is load-bearing for every count in this file. Setting the state up
 * front and constructing afterwards — which several older suites do — puts the
 * whole load inside the constructor's single first render, where a double build
 * cannot happen and therefore cannot be observed. The renders under test are
 * the ones the subscribers drive.
 */
function mount(options: TableContainerOptions = {}): Harness {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const state = createTableState();
  const actions = new StateActions(state, bridge as unknown as WorkerBridge);
  const container = new TableContainer(
    host,
    state,
    actions,
    bridge as unknown as WorkerBridge,
    options,
  );

  state.totalRows.set(ROWS);
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);

  return { container, state, actions, host };
}

/** Let an in-flight row fetch and its render pass settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

/** Wait out the frame a structural render defers its scroll restore to. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  bridge = makeBridge();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('TableContainer — a column-set change keeps the body', () => {
  it('keeps the same TableBody instance across a hide', () => {
    const h = mount();
    const body = h.container.getTableBody();
    expect(body).not.toBeNull();

    h.actions.hideColumn('col_2');

    // The hide really landed — otherwise the identity below would hold for the
    // uninteresting reason that nothing happened at all.
    expect(headerColumns(h.container.getElement())).not.toContain('col_2');

    // The assertion this file exists for. `TableBody` re-renders and refetches
    // off its own `visibleColumns` subscription, so a destroy/recreate here
    // buys nothing and costs the row cache, the scroll offset, and a fresh
    // round of SELECTs — 2 DuckDB queries per hide, measured.
    expect(
      h.container.getTableBody(),
      'a hide destroyed and recreated TableBody instead of reconciling the header row',
    ).toBe(body);
    expect(body!.isDestroyed()).toBe(false);

    h.container.destroy();
  });

  it('keeps the body — and its scroll offset — across a reorder', async () => {
    const h = mount();
    const body = h.container.getTableBody()!;
    const scroll = h.container.getScrollContainer();

    // jsdom lays nothing out, so both of these have to be stubbed for the body
    // to have a scrolled state at all: without a `clientHeight` the scroller's
    // visible range is empty, and `scrollTop` reads 0 forever. `scrollTop` is a
    // *writable* data property on purpose — that way a write from inside the
    // container is recorded rather than swallowed, which is what lets the
    // assertion below fail. Nothing in jsdom clamps it back to 0 the way a
    // browser would when the body's rows are wiped, so this catches the write,
    // and the instance identity catches the rebuild.
    Object.defineProperty(scroll, 'clientHeight', { value: VIEWPORT_HEIGHT, configurable: true });
    Object.defineProperty(scroll, 'scrollTop', { value: 0, writable: true, configurable: true });

    // Both waits are needed before the offset is seeded. The load's structural
    // render saves the scroll offsets and writes them back in a
    // `requestAnimationFrame`, so an offset set before that frame lands is
    // overwritten by the restore rather than by anything under test here.
    await h.container.whenBodyReady();
    await nextFrame();

    scroll.scrollTop = SCROLL_TOP;
    body.getVirtualScroller().refresh();
    await settle();
    const queriesBefore = bridge.query.mock.calls.length;
    const rangeBefore = body.getVisibleRange();
    expect(rangeBefore.start).toBeGreaterThan(0);
    // The fetch pipeline is live, so "no new queries" below is a fact about
    // the reorder rather than about a body that never queries anything.
    expect(queriesBefore).toBeGreaterThan(0);

    h.actions.setColumnOrder([...COLUMN_NAMES].reverse());

    expect(headerColumns(h.container.getElement())).toEqual([...COLUMN_NAMES].reverse());
    expect(
      h.container.getTableBody(),
      'a reorder destroyed and recreated TableBody instead of letting it re-render in place',
    ).toBe(body);
    expect(scroll.scrollTop, 'the reorder moved the user away from the rows they were on').toBe(
      SCROLL_TOP,
    );
    expect(body.getVisibleRange()).toEqual(rangeBefore);

    // The measurement the change was made for: a reorder is a DOM permutation
    // of rows already in the cache, so it must not reach DuckDB. A rebuilt body
    // starts with an empty cache and refetches the window on `initialize()`.
    await settle();
    expect(
      bridge.query.mock.calls.length - queriesBefore,
      'the reorder issued row queries — the cached rows were thrown away with the body',
    ).toBe(0);

    h.container.destroy();
  });

  it('replaces the TableBody when the schema identity changes', () => {
    // The other half of the first test, and not a formality: without it, "the
    // body survived a hide" would also be satisfied by a container that stopped
    // creating a body at all, or by one that never reached the structural tier
    // again. A new `schema` array is what a reload writes, and it must still
    // rebuild — the old body is subscribed against columns that no longer exist
    // and holds a row cache for a different relation.
    const h = mount();
    const before = h.container.getTableBody();
    expect(before).not.toBeNull();

    h.state.schema.set([...SCHEMA]);

    const after = h.container.getTableBody();
    expect(after).not.toBeNull();
    expect(after, 'a schema write reused the TableBody built for the previous relation').not.toBe(
      before,
    );
    expect(before!.isDestroyed()).toBe(true);

    h.container.destroy();
  });
});

describe('TableContainer — the load renders once', () => {
  it('builds each column header exactly once across a load', () => {
    // `onHeaderMount` fires once per `ColumnHeader` *construction*, which is
    // the quantity in question — `getColumnHeaders()` would only ever show the
    // survivors of a rebuild and so could not tell one build from two.
    const built: string[] = [];
    const h = mount({
      onHeaderMount: (header: ColumnHeader) => void built.push(header.getColumn().name),
    });

    const counts = new Map<string, number>();
    for (const name of built) counts.set(name, (counts.get(name) ?? 0) + 1);
    const repeats = [...counts]
      .filter(([, n]) => n > 1)
      .map(([name, n]) => `${name} x${n}`)
      .sort();

    // Every duplicate here is a header constructed, wired, announced and then
    // thrown away within the same load — and with it a stats panel and a
    // visualization built into a container nothing on screen contains. This
    // was the state of every load before `render()` dispatched: the `schema`
    // write built all six, and the `visibleColumns` write of the same batch
    // destroyed them and built six more.
    expect(
      repeats,
      `column headers built more than once during one load: ${repeats.join(', ')}`,
    ).toEqual([]);

    // …and the run really covered the table, rather than being trivially
    // duplicate-free because almost nothing was built.
    expect(built).toHaveLength(COLUMNS);
    expect([...counts.keys()].sort()).toEqual([...COLUMN_NAMES].sort());
    expect(headerColumns(h.container.getElement())).toEqual(COLUMN_NAMES);

    h.container.destroy();
  });

  it('constructs exactly one TableBody across a load', () => {
    // Counted through `initialize()` because `renderStructural` is the only
    // place in the container that constructs a body and it initializes the one
    // it just built on the spot — so a call here is a construction, and the
    // `this` it arrives on names which instance.
    const constructed: TableBody[] = [];
    const realInitialize = TableBody.prototype.initialize;
    vi.spyOn(TableBody.prototype, 'initialize').mockImplementation(function (this: TableBody) {
      constructed.push(this);
      return realInitialize.call(this);
    });

    const h = mount();

    // Two of these is the load paying twice for the same table: two virtual
    // scrollers, two subscription sets, and two opening SELECTs, with the first
    // body destroyed before its rows ever reached the screen.
    expect(
      constructed.length,
      `the load constructed ${constructed.length} TableBody instances`,
    ).toBe(1);
    expect(h.container.getTableBody()).toBe(constructed[0]);

    h.container.destroy();
  });
});

describe('TableContainer — an explicit render that changed nothing', () => {
  it('keeps the mounted headers and the body', () => {
    const h = mount();
    const headersBefore = h.container.getColumnHeaders();
    const elementsBefore = headersBefore.map((header) => header.getElement());
    const bodyBefore = h.container.getTableBody();
    expect(headersBefore).toHaveLength(COLUMNS);

    h.container.render();

    // `render()` is public on an `/advanced` class, so a host is entitled to
    // call it at any time to pick up something the container does not
    // subscribe to. It must not cost the caller their charts: a rebuilt header
    // is a new element, and `VizDataController.sync` destroys and re-creates a
    // visualization whose container *identity* changed.
    const headersAfter = h.container.getColumnHeaders();
    expect(headersAfter).toHaveLength(headersBefore.length);
    for (const [i, header] of headersBefore.entries()) {
      expect(headersAfter[i], `header ${header.getColumn().name} was rebuilt`).toBe(header);
      expect(headersAfter[i]!.getElement()).toBe(elementsBefore[i]);
    }
    expect(h.container.getTableBody()).toBe(bodyBefore);
    expect(headerColumns(h.container.getElement())).toEqual(COLUMN_NAMES);

    h.container.destroy();
  });

  it('still picks up state the signature does not dispatch on', () => {
    // The `/advanced` shell with no bridge and no actions, where the body is a
    // row count rather than a grid. `TableContainer.test.ts`'s "should show
    // column info when data is loaded" already covers that the count is
    // correct after such a render; what is added here is that the cheap tier is
    // what produced it — the same placeholder element and the same header
    // elements, updated in place. `totalRows` is not part of the render
    // signature and never will be, so this is the case that would be silently
    // lost to an early return on an unchanged signature.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const state = createTableState();
    const container = new TableContainer(host, state);

    state.tableName.set('t');
    initializeColumnsFromSchema(state, SCHEMA);

    const placeholder = host.querySelector<HTMLElement>('.dt-body-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder!.textContent).toBe('0 rows');
    const cellsBefore = headerCells(host);
    expect(cellsBefore).toHaveLength(COLUMNS);

    // A bare `totalRows` write renders nothing — it only refreshes the ARIA
    // counts — which is exactly why a host has to be able to ask for a render.
    state.totalRows.set(1000);
    expect(placeholder!.textContent).toBe('0 rows');

    container.render();

    // Identity first, because it is what distinguishes the two ways this can
    // read correctly: a structural render would also end up showing the right
    // count, but on a *new* placeholder inside a rebuilt `.dt-body`, with every
    // header element replaced alongside it.
    expect(
      host.querySelector('.dt-body-placeholder'),
      'the render rebuilt the body instead of updating the placeholder in place',
    ).toBe(placeholder);
    expect(placeholder!.textContent).toBe('1,000 rows');

    const cellsAfter = headerCells(host);
    expect(cellsAfter).toHaveLength(cellsBefore.length);
    for (const [i, cell] of cellsBefore.entries()) expect(cellsAfter[i]).toBe(cell);

    container.destroy();
  });
});
