/**
 * @vitest-environment jsdom
 *
 * The row-structure invariant every other read of a body row assumes:
 * children are exactly `[P pinned cells][left spacer][W cells][right spacer]`.
 *
 * At this stage the window is still the whole column list and both spacers sit
 * at zero, so nothing a user can see has changed — which is the point. What is
 * asserted here is the *shape*, the absolute id keying, and the reshape a
 * pooled element goes through when it is reused for a different structure.
 * Narrowing the window to the horizontally visible span comes next, and it
 * inherits all of this.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { TableBody } from '@/table/TableBody';

import {
  SPACERS_PER_ROW,
  bodyCells,
  buildRow,
  cellFor,
  newRow,
  newRowSized,
  poolRow,
  renderedColumns,
  rowPool,
  spacerWidths,
  spacers,
} from '../helpers/tableBodyDom';

class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'price', type: 'float', nullable: false, originalType: 'DOUBLE' },
];

const ROW = { __rowid__: 4, id: 4, name: 'four', price: 4.5 };

let container: HTMLElement;
let state: TableState;
let actions: StateActions;

const bridge = {
  query: vi.fn().mockResolvedValue([]),
  isInitialized: vi.fn().mockReturnValue(true),
  initialize: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
};

function makeBody(instanceId = 't1'): TableBody {
  return new TableBody(container, state, bridge as never, actions, { instanceId });
}

/** The child sequence as roles: `cell` or `spacer:<side>`. */
function childKinds(rowEl: HTMLElement): string[] {
  return Array.from(rowEl.children).map((child) => {
    const side = child.getAttribute('data-col-spacer');
    if (side !== null) return `spacer:${side}`;
    return child.classList.contains('dt-cell') ? 'cell' : 'other';
  });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  container = document.createElement('div');
  document.body.appendChild(container);
  state = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(100);
  actions = new StateActions(state, bridge as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TableBody — row structure', () => {
  it('builds [cells][left spacer][cells][right spacer] with both spacers present', () => {
    const body = makeBody();
    const rowEl = newRow(body);

    expect(childKinds(rowEl)).toEqual(['spacer:left', 'cell', 'cell', 'cell', 'spacer:right']);
    expect(rowEl.children.length).toBe(3 + SPACERS_PER_ROW);
    expect(rowEl.getAttribute('data-window')).toBe('0:3');

    body.destroy();
  });

  it('keeps both spacers at zero while the window covers every column', () => {
    const body = makeBody();
    const rowEl = buildRow(body, 4, ROW);

    expect(spacerWidths(rowEl)).toEqual({ left: 0, right: 0 });
    expect(renderedColumns(rowEl)).toEqual(['id', 'name', 'price']);

    body.destroy();
  });

  it('puts the pinned prefix before the left spacer', () => {
    const body = makeBody();
    actions.toggleColumnPin('id');
    const rowEl = buildRow(body, 4, ROW);

    expect(childKinds(rowEl)).toEqual(['cell', 'spacer:left', 'cell', 'cell', 'spacer:right']);
    expect(rowEl.getAttribute('data-window')).toBe('1:2');
    // Still every column, just split across the pinned run and the window.
    expect(renderedColumns(rowEl)).toEqual(['id', 'name', 'price']);
    expect(cellFor(rowEl, 'id')!.classList.contains('dt-cell--pinned')).toBe(true);
    expect(cellFor(rowEl, 'name')!.classList.contains('dt-cell--pinned')).toBe(false);

    body.destroy();
  });

  it('marks spacers as presentational and non-interactive', () => {
    const body = makeBody();
    const rowEl = newRow(body);

    for (const spacer of spacers(rowEl)) {
      expect(spacer.getAttribute('aria-hidden')).toBe('true');
      expect(spacer.getAttribute('role')).toBe('presentation');
      expect(spacer.className).toBe('dt-col-spacer');
      // Not a cell: nothing that queries `.dt-cell` can pick one up.
      expect(spacer.classList.contains('dt-cell')).toBe(false);
    }
    expect(rowEl.querySelectorAll('.dt-cell').length).toBe(3);

    body.destroy();
  });

  it('keys cell ids on the absolute visible-column index', () => {
    const body = makeBody('t1');
    const rowEl = buildRow(body, 7, ROW);

    // `TableContainer.syncActiveDescendant` derives the same string from
    // `visibleColumns.indexOf(column)`, so these have to be absolute.
    expect(cellFor(rowEl, 'id')!.id).toBe('dt-t1-cell-7-0');
    expect(cellFor(rowEl, 'name')!.id).toBe('dt-t1-cell-7-1');
    expect(cellFor(rowEl, 'price')!.id).toBe('dt-t1-cell-7-2');

    body.destroy();
  });

  it('writes data-column and an absolute aria-colindex on every rendered cell', async () => {
    const body = makeBody();
    // `colIndexMap` is built by `initialize`, which is also what subscribes it
    // to `columnOrder`.
    await body.initialize();
    const rowEl = buildRow(body, 4, ROW);

    // `columnOrder` carries the schema order; `aria-colindex` is 1-based over
    // it, which is what makes it absolute rather than a position in the row.
    expect(cellFor(rowEl, 'id')!.getAttribute('aria-colindex')).toBe('1');
    expect(cellFor(rowEl, 'name')!.getAttribute('aria-colindex')).toBe('2');
    expect(cellFor(rowEl, 'price')!.getAttribute('aria-colindex')).toBe('3');

    body.destroy();
  });

  it('reshapes a pooled row rather than growing and shrinking past the spacers', () => {
    const body = makeBody();
    const wide = newRowSized(body, 3);
    poolRow(body, wide);

    const narrow = newRowSized(body, 1);
    expect(childKinds(narrow)).toEqual(['spacer:left', 'cell', 'spacer:right']);
    expect(bodyCells(narrow)).toHaveLength(1);
    expect(narrow.getAttribute('data-window')).toBe('0:1');

    poolRow(body, narrow);
    const wideAgain = newRowSized(body, 4);
    expect(childKinds(wideAgain)).toEqual([
      'spacer:left',
      'cell',
      'cell',
      'cell',
      'cell',
      'spacer:right',
    ]);
    expect(wideAgain.getAttribute('data-window')).toBe('0:4');

    body.destroy();
  });

  it('moves the left spacer when the pinned count changes at constant total width', () => {
    // The case a plain child-count check cannot see: `children.length` is
    // identical before and after, and only the spacer's position moves.
    const body = makeBody();
    const before = newRow(body);
    expect(childKinds(before)).toEqual(['spacer:left', 'cell', 'cell', 'cell', 'spacer:right']);
    poolRow(body, before);

    actions.toggleColumnPin('id');
    const after = newRow(body);
    expect(after.children.length).toBe(before.children.length);
    expect(childKinds(after)).toEqual(['cell', 'spacer:left', 'cell', 'cell', 'spacer:right']);

    body.destroy();
  });

  it('resolves a click to a column by the cell it landed on, not by position', () => {
    const body = makeBody();
    const rowEl = buildRow(body, 4, ROW);
    container.appendChild(rowEl);
    (
      body as unknown as { attachRowEventListeners(el: HTMLElement, i: number): void }
    ).attachRowEventListeners(rowEl, 4);

    cellFor(rowEl, 'price')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.focusedCell.get()).toEqual({ row: 4, column: 'price' });

    body.destroy();
  });

  it('ignores a click that lands on a spacer', () => {
    const body = makeBody();
    const rowEl = buildRow(body, 4, ROW);
    container.appendChild(rowEl);
    (
      body as unknown as { attachRowEventListeners(el: HTMLElement, i: number): void }
    ).attachRowEventListeners(rowEl, 4);
    actions.setFocusedCell({ row: 4, column: 'name' });

    spacers(rowEl)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Unchanged: `.closest('.dt-cell')` finds nothing above a spacer.
    expect(state.focusedCell.get()).toEqual({ row: 4, column: 'name' });

    body.destroy();
  });

  it('moves the cursor ring with two targeted toggles', async () => {
    const body = makeBody();
    // `updateFocusStyles` is wired to `focusedCell` by `initialize`.
    await body.initialize();
    const rowEl = buildRow(body, 4, ROW);
    (body as unknown as { rowElementMap: Map<number, HTMLElement> }).rowElementMap.set(4, rowEl);

    actions.setFocusedCell({ row: 4, column: 'name' });
    expect(cellFor(rowEl, 'name')!.classList.contains('dt-cell--focused')).toBe(true);
    expect(cellFor(rowEl, 'price')!.classList.contains('dt-cell--focused')).toBe(false);

    actions.setFocusedCell({ row: 4, column: 'price' });
    expect(cellFor(rowEl, 'name')!.classList.contains('dt-cell--focused')).toBe(false);
    expect(cellFor(rowEl, 'price')!.classList.contains('dt-cell--focused')).toBe(true);

    actions.clearFocusedCell();
    expect(rowEl.querySelectorAll('.dt-cell--focused').length).toBe(0);

    body.destroy();
  });

  it('scrubs the pooled element so it can be reused for another row', () => {
    const body = makeBody();
    const rowEl = buildRow(body, 4, ROW);
    expect(cellFor(rowEl, 'id')!.id).toBe('dt-t1-cell-4-0');

    poolRow(body, rowEl);
    const pooled = rowPool(body)[0]!;
    for (const cell of bodyCells(pooled)) {
      expect(cell.id).toBe('');
      expect(cell.classList.contains('dt-cell--focused')).toBe(false);
    }
    // The spacers survive pooling — the reshape reuses them.
    expect(spacers(pooled)).toHaveLength(SPACERS_PER_ROW);

    body.destroy();
  });

  it('skips per-cell annotation bookkeeping when the store is empty', () => {
    const body = makeBody();
    const rowEl = buildRow(body, 4, ROW);
    // No store wired at all: nothing may be marked, and nothing may throw.
    expect(rowEl.hasAttribute('data-ann-painted')).toBe(false);
    for (const cell of bodyCells(rowEl)) {
      // Type-driven classes still land; none of the annotation families do.
      expect(cell.className).not.toMatch(/annotat/);
      expect(cell.dataset['dtAnnotationCount']).toBeUndefined();
    }

    body.destroy();
  });
});
