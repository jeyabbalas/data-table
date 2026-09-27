/**
 * @vitest-environment jsdom
 *
 * The header, the body, the pinned divider and keyboard scroll-into-view all
 * place columns from one `ColumnLayout`.
 *
 * Each used to sum `columnWidths` itself. The pinned offsets walked
 * `pinnedColumns`, which keeps a column after it is hidden, so hiding the
 * first of two pinned columns left the second one sticky at the hidden
 * column's width, over its neighbour, with the divider past it. Resizing a
 * pinned column updated widths but no offsets. A width that was not a finite
 * number reached the DOM as `NaNpx`, which the browser drops.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { KeyboardNavigator } from '@/table/KeyboardNavigator';
import type { TableBody } from '@/table/TableBody';
import { TableContainer } from '@/table/TableContainer';

import { rowsFor } from '../helpers/rowFetchBridge';
import {
  HARNESS_COLUMNS,
  MockResizeObserver,
  setupTableBody,
  type TableBodyHarness,
} from '../helpers/tableBodyHarness';

const COLUMNS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const SCHEMA: ColumnSchema[] = COLUMNS.map((name) => ({
  name,
  type: 'integer',
  nullable: false,
  originalType: 'INTEGER',
}));

function mockBridge() {
  return {
    query: vi.fn().mockResolvedValue([]),
    clearQueryCache: vi.fn(),
  } as unknown as ConstructorParameters<typeof StateActions>[1];
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TableContainer pinned styles', () => {
  /** Headers but no body: the header row and the divider are what is checked. */
  function setup() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const state = createTableState();
    const actions = new StateActions(state, mockBridge());
    const container = new TableContainer(host, state, actions);
    state.tableName.set('t');
    initializeColumnsFromSchema(state, SCHEMA);
    const header = (column: string) =>
      host.querySelector<HTMLElement>(`.dt-col-header[data-column="${column}"]`)!;
    const divider = () => host.querySelector<HTMLElement>('.dt-pinned-demarcation');
    return { state, actions, container, header, divider };
  }

  it('closes the pinned block up when a pinned column is hidden', () => {
    const { actions, container, header, divider } = setup();
    actions.toggleColumnPin('a');
    actions.toggleColumnPin('b');

    actions.hideColumn('a');

    expect(header('b').style.position).toBe('sticky');
    expect(header('b').style.left).toBe('0px');
    expect(divider()!.style.left).toBe('150px');
    container.destroy();
  });

  it('hides the divider when every pinned column is hidden', () => {
    const { actions, container, divider } = setup();
    actions.toggleColumnPin('a');

    actions.hideColumn('a');

    expect(divider()?.style.display).toBe('none');
    container.destroy();
  });

  it('moves later pinned columns and the divider when a pinned column is resized', () => {
    const { actions, container, header, divider } = setup();
    actions.toggleColumnPin('a');
    actions.toggleColumnPin('b');

    actions.setColumnWidth('a', 300);

    expect(header('b').style.left).toBe('300px');
    expect(divider()!.style.left).toBe('450px');
    container.destroy();
  });

  it('gives a column with an unusable stored width the default width', () => {
    const { actions, container, header } = setup();
    actions.setColumnWidth('c', 200);

    actions.setColumnWidth('c', Number.NaN);

    // `NaNpx` is dropped by the browser, which left the previous 200px.
    expect(header('c').style.width).toBe('150px');
    container.destroy();
  });
});

describe('TableBody pinned and sized cells', () => {
  async function renderRows(harness: TableBodyHarness): Promise<void> {
    const init = harness.body.initialize();
    await harness.drain();
    const first = harness.queries[0]!;
    first.deferred.resolve(rowsFor(first.sql, HARNESS_COLUMNS));
    await init;
  }

  function cell(harness: TableBodyHarness, column: string): HTMLElement {
    return harness.container.querySelector<HTMLElement>(
      `.dt-row[data-row-index="0"] .dt-cell[data-column="${column}"]`,
    )!;
  }

  it('leaves a hidden pinned column out of the offsets', async () => {
    // `id` is pinned and hidden; `tag` is the only visible pinned column.
    const harness = setupTableBody();
    harness.state.pinnedColumns.set(['id', 'tag']);
    harness.state.visibleColumns.set(['tag']);
    await renderRows(harness);

    expect(cell(harness, 'tag').style.position).toBe('sticky');
    expect(cell(harness, 'tag').style.left).toBe('0px');
    harness.body.destroy();
  });

  it('moves a later pinned column when an earlier one is resized', async () => {
    const harness = setupTableBody();
    harness.state.pinnedColumns.set(['id', 'tag']);
    await renderRows(harness);
    const fetched = harness.queries.length;

    harness.state.columnWidths.set(new Map([['id', 260]]));

    expect(cell(harness, 'id').style.width).toBe('260px');
    expect(cell(harness, 'tag').style.left).toBe('260px');
    expect(harness.queries.length).toBe(fetched);
    harness.body.destroy();
  });

  it('clears the sticky styles of a cell reused for an unpinned column', async () => {
    const harness = setupTableBody();
    harness.state.pinnedColumns.set(['id']);
    await renderRows(harness);
    const first = harness.container.querySelector<HTMLElement>(
      '.dt-row[data-row-index="0"] .dt-cell',
    )!;
    expect(first.getAttribute('data-column')).toBe('id');
    expect(first.style.position).toBe('sticky');

    // A reorder re-renders the rows from the cache, so the element that
    // showed the pinned `id` now shows the unpinned `tag`.
    harness.state.visibleColumns.set(['tag', 'id']);

    expect(first.getAttribute('data-column')).toBe('tag');
    expect(first.style.position).toBe('');
    expect(first.style.left).toBe('');
    expect(first.classList.contains('dt-cell--pinned')).toBe(false);
    harness.body.destroy();
  });

  it('gives a cell with an unusable stored width the default width', async () => {
    const harness = setupTableBody();
    harness.state.columnWidths.set(new Map([['tag', -40]]));
    await renderRows(harness);

    expect(cell(harness, 'tag').style.width).toBe('150px');
    harness.body.destroy();
  });
});

describe('KeyboardNavigator scroll-into-view', () => {
  it('measures the pinned block from the visible pinned columns only', () => {
    const state = createTableState();
    initializeColumnsFromSchema(state, SCHEMA);
    state.totalRows.set(10);
    const actions = new StateActions(state, mockBridge());
    actions.toggleColumnPin('a');
    actions.toggleColumnPin('b');
    actions.hideColumn('a');
    // Visible: b (pinned, 0–150), c, d, e (450–600), f, g.

    const root = document.createElement('div');
    document.body.appendChild(root);
    const bodyScroll = document.createElement('div');
    Object.defineProperty(bodyScroll, 'clientWidth', { value: 400 });
    bodyScroll.scrollLeft = 600;
    const vs = {
      getViewportHeight: () => 320,
      getRowHeight: () => 32,
      getVirtualScrollTop: () => 0,
      scrollToRow: vi.fn(),
    };
    const nav = new KeyboardNavigator({
      rootElement: root,
      bodyScroll,
      state,
      actions,
      getTableBody: () => ({ getVirtualScroller: () => vs }) as unknown as TableBody,
    });
    actions.setFocusedCell({ row: 0, column: 'f' });

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    // `e` starts at 450 and the pinned block is 150 wide, so it sits right
    // against the block at scrollLeft 300. Counting the hidden `a` as part of
    // the block gave 150, scrolling 150px further than needed.
    expect(state.focusedCell.get()).toEqual({ row: 0, column: 'e' });
    expect(bodyScroll.scrollLeft).toBe(300);
    nav.destroy();
  });
});
