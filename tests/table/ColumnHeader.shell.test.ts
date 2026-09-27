/**
 * @vitest-environment jsdom
 *
 * A `ColumnHeader` without its controls: the shell `TableContainer` keeps for
 * a column far from the view, and the controls it builds and takes down as
 * the column is mounted and unmounted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { ColumnHeader } from '@/table/ColumnHeader';

const bridge = {
  query: vi.fn().mockResolvedValue([]),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

const SCHEMA: ColumnSchema[] = [
  { name: 'price', type: 'float', nullable: false, originalType: 'DOUBLE' },
  { name: 'qty', type: 'integer', nullable: false, originalType: 'INTEGER' },
];

/** Every control, in the order the header lays them out. */
const CONTROLS = [
  '.dt-col-pin-btn',
  '.dt-col-hide-btn',
  '.dt-col-filter-btn',
  '.dt-col-sort-btn',
  '.dt-col-drag-handle',
  '.dt-col-resize-handle',
];

function controlsIn(el: HTMLElement): string[] {
  return CONTROLS.filter((selector) => el.querySelector(selector) !== null);
}

let state: TableState;
let actions: StateActions;
let header: ColumnHeader | null = null;

beforeEach(() => {
  state = createTableState();
  initializeColumnsFromSchema(state, SCHEMA);
  actions = new StateActions(state, bridge);
});

afterEach(() => {
  header?.destroy();
  header = null;
  document.body.innerHTML = '';
});

function shell(column: ColumnSchema = SCHEMA[0]!, options = {}): ColumnHeader {
  header = new ColumnHeader(column, state, actions, { controls: false, ...options });
  document.body.appendChild(header.getElement());
  return header;
}

describe('a header made without its controls', () => {
  it('is the cell, its name and type, its stats and chart slots, and nothing to operate', () => {
    const h = shell(SCHEMA[0], { cellId: 'h0', colIndex: 1 });
    const el = h.getElement();
    expect(el.getAttribute('role')).toBe('columnheader');
    expect(el.id).toBe('h0');
    expect(el.getAttribute('aria-colindex')).toBe('1');
    expect(el.getAttribute('aria-sort')).toBe('none');
    expect(el.getAttribute('data-column')).toBe('price');
    expect(el.querySelector('.dt-col-name')!.textContent).toBe('price');
    expect(el.querySelector('.dt-col-type')!.textContent).toBe('float');
    expect(h.getStatsElement()).toBe(el.querySelector('.dt-col-stats'));
    expect(h.getVizContainer()).toBe(el.querySelector('.dt-col-viz'));
    expect(el.querySelector('.dt-col-action-panel')!.childElementCount).toBe(0);
    expect(controlsIn(el)).toEqual([]);
    expect(el.querySelectorAll('button')).toHaveLength(0);
    expect(h.hasControls()).toBe(false);
    expect(h.getControls()).toEqual([]);
  });

  it('keeps the sort, filter and layout-mode state on the cell', () => {
    const el = shell().getElement();
    actions.toggleSort('price');
    actions.addFilter({ type: 'range', column: 'price', min: 0, max: 1 });
    header!.setLayoutMode(true);
    expect(el.getAttribute('aria-sort')).toBe('ascending');
    expect(el.classList.contains('dt-col-header--filtered')).toBe(true);
    expect(el.getAttribute('aria-label')).toBe('price, float, sorted ascending, filtered');
    expect(el.classList.contains('dt-col-header--layout')).toBe(true);
  });

  it('builds its controls in the state the column is in', () => {
    const el = shell().getElement();
    actions.toggleSort('qty');
    actions.addToSort('price');
    actions.addFilter({ type: 'range', column: 'price', min: 0, max: 1 });
    actions.toggleColumnPin('price');
    actions.hideColumn('qty');
    header!.setLayoutMode(true);

    header!.setControlsMounted(true);
    expect(header!.hasControls()).toBe(true);
    expect(controlsIn(el)).toEqual(CONTROLS);
    const sort = el.querySelector('.dt-col-sort-btn')!;
    expect(sort.classList.contains('dt-col-sort-btn--asc')).toBe(true);
    expect(el.querySelector('.dt-col-sort-badge')!.textContent).toBe('2');
    const filter = el.querySelector('.dt-col-filter-btn')!;
    expect(filter.classList.contains('dt-col-action-btn--active')).toBe(true);
    const pin = el.querySelector('.dt-col-pin-btn')!;
    expect(pin.classList.contains('dt-col-action-btn--active')).toBe(true);
    expect(el.querySelector('.dt-col-drag-handle')!.getAttribute('aria-disabled')).toBe('true');
    expect(el.querySelector('.dt-col-hide-btn')!.hasAttribute('disabled')).toBe(true);
    expect(
      el.querySelector('.dt-col-resize-handle')!.classList.contains('dt-col-resize-handle--active'),
    ).toBe(true);
    for (const button of el.querySelectorAll('button')) {
      expect(button.getAttribute('tabindex')).toBe('-1');
    }
    // The hide button is disabled, so F2 skips it.
    expect(header!.getControls()).toEqual([pin, filter, sort]);
  });

  it('builds one set of controls however often it is asked, and takes them all down', () => {
    const el = shell().getElement();
    header!.setControlsMounted(true);
    header!.setControlsMounted(true);
    expect(el.querySelectorAll('.dt-col-sort-btn')).toHaveLength(1);
    expect(el.querySelectorAll('.dt-col-resize-handle')).toHaveLength(1);
    header!.setControlsMounted(false);
    expect(controlsIn(el)).toEqual([]);
    expect(el.querySelectorAll('button')).toHaveLength(0);
    expect(header!.hasControls()).toBe(false);
  });

  it('works its buttons once built, and again once built a second time', () => {
    const onFilterClick = vi.fn();
    const el = shell(SCHEMA[1], { onFilterClick }).getElement();
    header!.setControlsMounted(true);
    el.querySelector<HTMLElement>('.dt-col-sort-btn')!.click();
    expect(state.sortColumns.get()).toEqual([{ column: 'qty', direction: 'asc' }]);

    header!.setControlsMounted(false);
    header!.setControlsMounted(true);
    const filter = el.querySelector<HTMLElement>('.dt-col-filter-btn')!;
    filter.click();
    expect(onFilterClick).toHaveBeenCalledWith('qty', filter);
    el.querySelector<HTMLElement>('.dt-col-sort-btn')!.click();
    expect(state.sortColumns.get()).toEqual([{ column: 'qty', direction: 'desc' }]);
    expect(el.getAttribute('aria-sort')).toBe('descending');
  });

  it('ends a resize drag when its controls are taken down mid-drag', () => {
    const released = vi.fn();
    const end = vi.spyOn(actions, 'endColumnWidthChange');
    const h = shell(SCHEMA[0], { holdColumn: () => released });
    h.getElement().style.width = '150px';
    h.setControlsMounted(true);
    h.getElement()
      .querySelector('.dt-col-resize-handle')!
      .dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    h.setControlsMounted(false);
    expect(end).toHaveBeenCalledTimes(1);
    expect(released).toHaveBeenCalledTimes(1);
    // The drag's listeners went with it.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
    expect(state.columnWidths.get().has('price')).toBe(false);
  });

  it('leaves no width-reset animation behind when its controls come down mid-reset', () => {
    const root = document.createElement('div');
    root.className = 'dt-root';
    const row = document.createElement('div');
    row.className = 'dt-row';
    const cell = document.createElement('div');
    cell.className = 'dt-cell';
    cell.setAttribute('data-column', 'price');
    row.appendChild(cell);
    document.body.appendChild(root);
    const h = shell();
    root.append(h.getElement(), row);
    h.setControlsMounted(true);
    h.getElement()
      .querySelector('.dt-col-resize-handle')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(cell.classList.contains('dt-col-resetting')).toBe(true);

    // Its column scrolled away before the 250 ms animation ended. The header
    // stays, and the body reuses the cell for another column.
    h.setControlsMounted(false);
    expect(h.getElement().classList.contains('dt-col-resetting')).toBe(false);
    expect(cell.classList.contains('dt-col-resetting')).toBe(false);
  });

  it('answers the keyboard width gestures without a resize handle', () => {
    const h = shell();
    expect(h.getWidthBounds()).toEqual({ min: 50, max: 500 });
    expect(h.setWidth(9999)).toBe(500);
    expect(state.columnWidths.get().get('price')).toBe(500);
    expect(h.resizeBy(-600)).toBe(50);
  });

  it('keeps a derived column’s f(x) icon, whose name row would change height without it', () => {
    const derived: ColumnSchema = {
      name: 'total',
      type: 'float',
      nullable: true,
      originalType: 'DOUBLE',
      isDerived: true,
      expression: 'price * qty',
    };
    const onDerivedIconClick = vi.fn();
    const h = shell(derived, { onDerivedIconClick });
    const icon = h.getElement().querySelector<HTMLElement>('.dt-derived-icon-btn')!;
    expect(icon.getAttribute('tabindex')).toBe('-1');
    expect(h.getDerivedIconBtn()).toBe(icon);
    expect(h.getControls()).toEqual([icon]);
    icon.click();
    expect(onDerivedIconClick).toHaveBeenCalledWith('total', icon);
  });
});
