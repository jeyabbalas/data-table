/**
 * @vitest-environment jsdom
 *
 * A column change updates the grid in place. Each column keeps its
 * `ColumnHeader` through a hide, a show or a move of other columns, and gets a
 * new one only when its schema entry changes; the body is kept unless the
 * schema or the table changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { TableContainer } from '@/table/TableContainer';

class MockResizeObserver implements ResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const bridge = {
  query: vi.fn().mockResolvedValue([]),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

const SCHEMA: ColumnSchema[] = 'abcdef'
  .split('')
  .map((name) => ({ name, type: 'float', nullable: false, originalType: 'DOUBLE' }));

let state: TableState;
let actions: StateActions;
let table: TableContainer;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  state = createTableState();
  actions = new StateActions(state, bridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(10);
  state.tableName.set('t');
  const container = document.createElement('div');
  document.body.appendChild(container);
  table = new TableContainer(container, state, actions, bridge);
});

afterEach(() => {
  table.destroy();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** The header elements in the row, in DOM order. */
function row(): HTMLElement[] {
  return Array.from(
    table.getHeaderRow().querySelectorAll<HTMLElement>('.dt-header-row > .dt-col-header'),
  );
}

function order(): string {
  return row()
    .map((el) => el.getAttribute('data-column'))
    .join(' ');
}

function byColumn(): Map<string, HTMLElement> {
  return new Map(row().map((el) => [el.getAttribute('data-column')!, el]));
}

describe('a column change', () => {
  it('keeps each column’s header through a hide, a show and a move', () => {
    const before = byColumn();

    actions.hideColumn('b');
    expect(order()).toBe('a c d e f');
    for (const column of 'acdef') expect(byColumn().get(column)).toBe(before.get(column));

    actions.showColumn('b');
    expect(order()).toBe('a b c d e f');
    // The column shown gets a header of its own.
    expect(byColumn().get('b')).not.toBe(before.get('b'));

    actions.setColumnOrder(['f', 'a', 'b', 'c', 'd', 'e']);
    expect(order()).toBe('f a b c d e');
    for (const column of 'acdef') expect(byColumn().get(column)).toBe(before.get(column));
    expect(table.getColumnHeaders().map((header) => header.getElement())).toEqual(row());
  });

  it('moves ids and aria-colindex with the columns', () => {
    actions.hideColumn('b');
    actions.setColumnOrder(['f', 'a', 'c', 'd', 'e']);
    const prefix = `dt-${table.getInstanceId()}-colheader-`;
    expect(row().map((el) => el.id)).toEqual([0, 1, 2, 3, 4].map((i) => `${prefix}${i}`));
    // Positions in `columnOrder`, the hidden `b` included.
    expect(row().map((el) => Number(el.getAttribute('aria-colindex')))).toEqual([1, 2, 4, 5, 6]);
  });

  it('rebuilds the header of a column whose schema entry changed, and only that one', () => {
    const before = byColumn();
    state.schema.set(SCHEMA.map((c) => (c.name === 'c' ? { ...c, type: 'integer' } : c)));
    const after = byColumn();
    expect(after.get('c')).not.toBe(before.get('c'));
    expect(after.get('c')!.querySelector('.dt-col-type')!.textContent).toBe('integer');
    for (const column of 'abdef') expect(after.get(column)).toBe(before.get(column));
  });

  it('leaves DOM focus on a header button, and puts the others in order around it', () => {
    const sort = byColumn().get('d')!.querySelector<HTMLButtonElement>('.dt-col-sort-btn')!;
    sort.focus();
    const blur = vi.fn();
    sort.addEventListener('blur', blur);

    actions.setColumnOrder(['d', 'a', 'b', 'c', 'e', 'f']);
    expect(order()).toBe('d a b c e f');
    expect(document.activeElement).toBe(sort);
    expect(blur).not.toHaveBeenCalled();
  });

  it('keeps the body, and builds another for a new schema', () => {
    const body = table.getTableBody();
    expect(body).not.toBeNull();
    actions.hideColumn('b');
    actions.showColumn('b');
    actions.setColumnOrder(['f', 'a', 'b', 'c', 'd', 'e']);
    actions.toggleColumnPin('c');
    expect(table.getTableBody()).toBe(body);

    state.schema.set([...SCHEMA]);
    expect(table.getTableBody()).not.toBe(body);
    expect(table.getTableBody()).not.toBeNull();
  });

  it('takes the header row out while no column is visible, and puts it back', () => {
    const rowElement = table.getHeaderRow().querySelector('.dt-header-row');
    state.visibleColumns.set([]);
    expect(table.getHeaderRow().querySelector('.dt-header-row')).toBeNull();
    state.visibleColumns.set(['a', 'b']);
    expect(table.getHeaderRow().querySelector('.dt-header-row')).toBe(rowElement);
    expect(order()).toBe('a b');
  });
});
