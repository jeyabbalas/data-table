/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilterPanel } from '@/filters/FilterPanel';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

// Mock WorkerBridge
const mockBridge = {
  query: vi.fn().mockResolvedValue([]),
  initialize: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
  destroy: vi.fn(),
  clearQueryCache: vi.fn(),
} as any;

const testSchema: ColumnSchema[] = [
  { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'active', type: 'boolean', nullable: true, originalType: 'BOOLEAN' },
];

describe('FilterPanel', () => {
  let state: TableState;
  let actions: StateActions;
  let panel: FilterPanel;
  let anchor: HTMLElement;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    initializeColumnsFromSchema(state, testSchema);
    document.body.innerHTML = '<div class="dt-root"></div>';

    panel = new FilterPanel(state, actions);
    document.querySelector('.dt-root')!.appendChild(panel.getElement());

    // Create a mock anchor element
    anchor = document.createElement('button');
    anchor.className = 'dt-col-filter-btn';
    document.querySelector('.dt-root')!.appendChild(anchor);
  });

  // =========================================
  // Open / Close / Toggle
  // =========================================

  describe('open/close/toggle', () => {
    it('should start closed', () => {
      expect(panel.getIsOpen()).toBe(false);
      expect(panel.getCurrentColumn()).toBeNull();
      expect(panel.getElement().style.display).toBe('none');
    });

    it('should open for a column', () => {
      panel.open('price', anchor);

      expect(panel.getIsOpen()).toBe(true);
      expect(panel.getCurrentColumn()).toBe('price');
      expect(panel.getElement().style.display).toBe('');
    });

    it('should close when close() is called', () => {
      panel.open('price', anchor);
      panel.close();

      expect(panel.getIsOpen()).toBe(false);
      expect(panel.getCurrentColumn()).toBeNull();
      expect(panel.getElement().style.display).toBe('none');
    });

    it('should toggle open then closed for same column', () => {
      panel.toggle('price', anchor);
      expect(panel.getIsOpen()).toBe(true);

      panel.toggle('price', anchor);
      expect(panel.getIsOpen()).toBe(false);
    });

    it('should switch columns when opening a different column', () => {
      panel.open('price', anchor);
      expect(panel.getCurrentColumn()).toBe('price');

      panel.open('name', anchor);
      expect(panel.getCurrentColumn()).toBe('name');
      expect(panel.getIsOpen()).toBe(true);
    });

    it('should not open for unknown column', () => {
      panel.open('nonexistent', anchor);
      expect(panel.getIsOpen()).toBe(false);
    });
  });

  // =========================================
  // Header Content
  // =========================================

  describe('header content', () => {
    it('should show column name in title', () => {
      panel.open('price', anchor);

      const title = panel.getElement().querySelector('.dt-filter-panel-title');
      expect(title?.textContent).toBe('Filter: price');
    });

    it('should show column type badge', () => {
      panel.open('price', anchor);

      const badge = panel.getElement().querySelector('.dt-filter-panel-type');
      expect(badge?.textContent).toBe('integer');
    });

    it('should update header when switching columns', () => {
      panel.open('price', anchor);
      panel.open('name', anchor);

      const title = panel.getElement().querySelector('.dt-filter-panel-title');
      expect(title?.textContent).toBe('Filter: name');

      const badge = panel.getElement().querySelector('.dt-filter-panel-type');
      expect(badge?.textContent).toBe('string');
    });
  });

  // =========================================
  // Clear Button
  // =========================================

  describe('clear button', () => {
    it('should be hidden when no filter is active', () => {
      panel.open('price', anchor);

      const clearBtn = panel.getElement().querySelector('.dt-filter-panel-clear');
      expect(clearBtn?.classList.contains('dt-filter-panel-clear--hidden')).toBe(true);
    });

    it('should be visible when a filter is active for the column', () => {
      actions.addFilter({ type: 'point', column: 'price', value: 42 });
      panel.open('price', anchor);

      const clearBtn = panel.getElement().querySelector('.dt-filter-panel-clear');
      expect(clearBtn?.classList.contains('dt-filter-panel-clear--hidden')).toBe(false);
    });
  });

  // =========================================
  // Escape Key
  // =========================================

  describe('escape key', () => {
    it('should close panel on Escape keydown', async () => {
      panel.open('price', anchor);

      // requestAnimationFrame is used for registering handlers — flush it
      await new Promise((r) => requestAnimationFrame(r));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(panel.getIsOpen()).toBe(false);
    });
  });

  // =========================================
  // Destroy
  // =========================================

  describe('destroy', () => {
    it('should remove element from DOM', () => {
      const root = document.querySelector('.dt-root')!;
      expect(root.contains(panel.getElement())).toBe(true);

      panel.destroy();

      expect(root.contains(panel.getElement())).toBe(false);
    });

    it('should not open after destroy', () => {
      panel.destroy();
      panel.open('price', anchor);

      expect(panel.getIsOpen()).toBe(false);
    });
  });
});
