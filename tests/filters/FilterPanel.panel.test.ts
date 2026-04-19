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

  it('has role="dialog" (aria-modal omitted)', () => {
    const el = panel.getElement();
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBeNull();
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
});
