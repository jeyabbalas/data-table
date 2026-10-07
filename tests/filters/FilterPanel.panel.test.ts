/**
 * @vitest-environment jsdom
 *
 * Verifies FilterPanel's ModalHost (panel-mode) wiring: role attribute,
 * Escape-close, focus restore, no body scroll lock, outside-click ignore of
 * filter buttons.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FilterPanel } from '@/filters/FilterPanel';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { __resetModalHostForTests } from '@/core/ModalHost';

const mockBridge = {
  query: vi.fn().mockResolvedValue([]),
  initialize: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
  destroy: vi.fn(),
  clearQueryCache: vi.fn(),
} as any;

const schema: ColumnSchema[] = [
  { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' },
  { name: 'qty', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

describe('FilterPanel — panel-mode focus/escape', () => {
  let state: TableState;
  let actions: StateActions;
  let panel: FilterPanel;
  let anchor: HTMLButtonElement;

  beforeEach(() => {
    __resetModalHostForTests();
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    initializeColumnsFromSchema(state, schema);
    document.body.innerHTML = '<div class="dt-root"></div>';
    const root = document.querySelector('.dt-root') as HTMLElement;

    panel = new FilterPanel(state, actions);
    root.appendChild(panel.getElement());

    anchor = document.createElement('button');
    anchor.className = 'dt-col-filter-btn';
    root.appendChild(anchor);
    anchor.focus();
  });

  afterEach(() => {
    panel.destroy();
    document.body.innerHTML = '';
    __resetModalHostForTests();
  });

  it('reports the column it is open for, a switch, and its close', () => {
    const onOpenChange = vi.fn();
    const reporting = new FilterPanel(state, actions, { onOpenChange });
    document.querySelector('.dt-root')!.appendChild(reporting.getElement());

    reporting.open('price', anchor);
    reporting.open('qty', anchor);
    reporting.close();
    expect(onOpenChange.mock.calls).toEqual([['price'], ['qty'], [null]]);
    // A column the schema does not have opens nothing.
    reporting.open('nope', anchor);
    expect(onOpenChange).toHaveBeenCalledTimes(3);

    // Destroyed while open: closed first, and reported.
    reporting.open('price', anchor);
    reporting.destroy();
    expect(onOpenChange.mock.calls.slice(3)).toEqual([['price'], [null]]);
  });

  it('has role="dialog" (aria-modal omitted)', () => {
    const el = panel.getElement();
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBeNull();
  });

  it('is named by its title, which names the column it is open for', () => {
    const el = panel.getElement();
    panel.open('price', anchor);
    const title = document.getElementById(el.getAttribute('aria-labelledby')!);
    expect(title).toBe(el.querySelector('.dt-filter-panel-title'));
    expect(title!.textContent).toBe('Filter: price');
    // Switched to another column while open: the same title, retitled.
    panel.open('qty', anchor);
    expect(document.getElementById(el.getAttribute('aria-labelledby')!)!.textContent).toBe(
      'Filter: qty',
    );
    panel.close();
  });

  it('gives each panel a title id of its own', () => {
    const other = new FilterPanel(state, actions);
    const ids = [panel, other].map(
      (p) => p.getElement().querySelector('.dt-filter-panel-title')!.id,
    );
    expect(ids[0]).toMatch(/^dt-t\d+-[0-9a-f]{4}-filter-panel-title$/);
    expect(ids[1]).toMatch(/-filter-panel-title$/);
    expect(ids[1]).not.toBe(ids[0]);
    other.destroy();
  });

  it('does not apply body scroll lock', () => {
    panel.open('price', anchor);
    expect(document.body.style.paddingRight).toBe('');
    expect(document.body.style.overflow).toBe('');
    panel.close();
  });

  it('closes on Escape and restores focus to the filter button', () => {
    panel.open('price', anchor);
    expect(panel.getIsOpen()).toBe(true);

    panel
      .getElement()
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(panel.getIsOpen()).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  it('hands focus to the close button when Clear hides itself', () => {
    actions.addFilter({ type: 'range', column: 'price', min: 1, max: 5 });
    panel.open('price', anchor);
    const clear = panel.getElement().querySelector<HTMLButtonElement>('.dt-filter-panel-clear')!;
    expect(clear.classList.contains('dt-filter-panel-clear--hidden')).toBe(false);

    // What Enter on the focused button does.
    clear.focus();
    clear.click();

    expect(clear.classList.contains('dt-filter-panel-clear--hidden')).toBe(true);
    expect(document.activeElement).toBe(panel.getElement().querySelector('.dt-filter-panel-close'));
    panel.close();
  });
});
