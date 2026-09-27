/**
 * @vitest-environment jsdom
 *
 * Body cells are found by their `data-column`, never by their position in
 * the row.
 *
 * Only `TableBody.updateRowContent` decides which column a cell shows.
 * Everything else that reaches for "the cell of column X" — the cursor ring,
 * a click, a width change, an annotation, the resize-reset animation — has to
 * land on the same cell whatever order the row's children
 * are in. With column windowing a row holds a subset of the visible columns
 * and the two stop coinciding; these tests get there without windowing by
 * reversing a rendered row's cells.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnotationStore } from '@/annotations/AnnotationStore';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { AnnotationPopover } from '@/table/AnnotationPopover';
import { TableContainer } from '@/table/TableContainer';

import { rowsFor } from '../helpers/rowFetchBridge';
import {
  HARNESS_COLUMNS,
  MockResizeObserver,
  setupTableBody,
  type TableBodyHarness,
} from '../helpers/tableBodyHarness';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** Initialize the body and answer its first fetch, so rows 0–9 are data rows. */
async function renderRows(harness: TableBodyHarness): Promise<void> {
  const init = harness.body.initialize();
  await harness.drain();
  const first = harness.queries[0]!;
  first.deferred.resolve(rowsFor(first.sql, HARNESS_COLUMNS));
  await init;
}

/** The rendered element for body row `index`. */
function rowAt(harness: TableBodyHarness, index: number): HTMLElement {
  const row = harness.container.querySelector<HTMLElement>(`.dt-row[data-row-index="${index}"]`);
  if (!row) throw new Error(`row ${index} is not rendered`);
  return row;
}

/** The cell of `column` in `row`, by attribute. */
function cellOf(row: HTMLElement, column: string): HTMLElement {
  const cell = Array.from(row.children).find((c) => c.getAttribute('data-column') === column);
  if (!cell) throw new Error(`no cell for ${column}`);
  return cell as HTMLElement;
}

/** Put a row's cells in the opposite order to `visibleColumns`. */
function reverseCells(row: HTMLElement): void {
  for (const cell of Array.from(row.children).reverse()) row.appendChild(cell);
}

describe('TableBody finds cells by column', () => {
  it('puts the cursor ring on the cursor column’s cell', async () => {
    const harness = setupTableBody();
    await renderRows(harness);
    const row = rowAt(harness, 2);
    reverseCells(row);

    harness.state.focusedCell.set({ row: 2, column: 'tag' });

    expect(cellOf(row, 'tag').classList.contains('dt-cell--focused')).toBe(true);
    expect(cellOf(row, 'id').classList.contains('dt-cell--focused')).toBe(false);

    // Moving the cursor off clears the ring from the same cell.
    harness.state.focusedCell.set({ row: 3, column: 'tag' });
    expect(cellOf(row, 'tag').classList.contains('dt-cell--focused')).toBe(false);
    harness.body.destroy();
  });

  it('puts the cursor on the clicked cell’s column', async () => {
    const harness = setupTableBody();
    await renderRows(harness);
    const row = rowAt(harness, 4);
    reverseCells(row);

    cellOf(row, 'tag').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(harness.state.focusedCell.get()).toEqual({ row: 4, column: 'tag' });
    harness.body.destroy();
  });

  it('gives each cell its own column’s width', async () => {
    const harness = setupTableBody();
    await renderRows(harness);
    const row = rowAt(harness, 1);
    reverseCells(row);

    harness.state.columnWidths.set(new Map([['tag', 222]]));

    expect(cellOf(row, 'tag').style.width).toBe('222px');
    expect(cellOf(row, 'id').style.width).toBe('150px');
    harness.body.destroy();
  });

  it('repaints an annotation on the annotated column’s cell', async () => {
    const store = new AnnotationStore();
    const popover = new AnnotationPopover({ portalTarget: document.body });
    const harness = setupTableBody({ body: { annotations: store, annotationPopover: popover } });
    await renderRows(harness);
    const row = rowAt(harness, 0);
    reverseCells(row);

    store.add({ scope: 'cell', rowId: 0, column: 'tag', severity: 'error', message: 'bad' });

    const tag = cellOf(row, 'tag');
    expect(tag.classList.contains('dt-cell--annotated')).toBe(true);
    expect(tag.textContent).toBe('tag-0');
    expect(cellOf(row, 'id').classList.contains('dt-cell--annotated')).toBe(false);
    expect(cellOf(row, 'id').textContent).toBe('0');

    harness.body.destroy();
    popover.destroy();
    store.destroy();
  });
});

describe('ColumnHeader finds cells by column', () => {
  const SCHEMA: ColumnSchema[] = [
    { name: 'a', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'b', type: 'string', nullable: true, originalType: 'VARCHAR' },
  ];

  /**
   * A container with headers (it has actions) but no bridge, so no
   * `TableBody`: the row appended below is the only row, and nothing
   * re-renders it.
   */
  function setup() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const state = createTableState();
    const bridge = { query: vi.fn(), clearQueryCache: vi.fn() } as unknown as ConstructorParameters<
      typeof StateActions
    >[1];
    const actions = new StateActions(state, bridge);
    const container = new TableContainer(host, state, actions);
    state.tableName.set('t');
    initializeColumnsFromSchema(state, SCHEMA);

    // One data row with its cells in the opposite order to `visibleColumns`.
    const row = document.createElement('div');
    row.className = 'dt-row';
    for (const column of ['b', 'a']) {
      const cell = document.createElement('div');
      cell.className = 'dt-cell';
      cell.setAttribute('data-column', column);
      row.appendChild(cell);
    }
    container.getBodyContainer().appendChild(row);
    return { state, container, row };
  }

  it('animates a width reset on the reset column’s cells', () => {
    const { container, row } = setup();
    const header = container.getElement().querySelector('.dt-col-header[data-column="b"]')!;
    const handle = header.querySelector('.dt-col-resize-handle')!;

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    expect(cellOf(row, 'b').classList.contains('dt-col-resetting')).toBe(true);
    expect(cellOf(row, 'a').classList.contains('dt-col-resetting')).toBe(false);
    container.destroy();
  });
});
