/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColumnHeader, type ColumnHeaderOptions } from '@/table/ColumnHeader';
import { createTableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

// Mock WorkerBridge
const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
} as unknown as WorkerBridge;

describe('ColumnHeader', () => {
  let state: TableState;
  let actions: StateActions;
  let column: ColumnSchema;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    column = {
      name: 'test_column',
      type: 'integer',
      nullable: false,
      originalType: 'INTEGER',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create DOM element with correct structure', () => {
      const header = new ColumnHeader(column, state, actions);

      const el = header.getElement();
      expect(el).toBeDefined();
      expect(el.className).toBe('dt-col-header');
      expect(el.querySelector('.dt-col-name-row')).toBeTruthy();
      expect(el.querySelector('.dt-col-drag-handle')).toBeTruthy();
      expect(el.querySelector('.dt-col-name')).toBeTruthy();
      expect(el.querySelector('.dt-col-type')).toBeTruthy();
      expect(el.querySelector('.dt-col-stats')).toBeTruthy();
      expect(el.querySelector('.dt-col-viz')).toBeTruthy();
      expect(el.querySelector('.dt-col-sort')).toBeTruthy();

      header.destroy();
    });

    it('should create drag handle inline with name in name-row', () => {
      const header = new ColumnHeader(column, state, actions);

      const el = header.getElement();
      const nameRow = el.querySelector('.dt-col-name-row');
      expect(nameRow).toBeTruthy();

      // Drag handle should be inside name-row
      const dragHandle = nameRow?.querySelector('.dt-col-drag-handle');
      expect(dragHandle).toBeTruthy();
      expect(dragHandle?.tagName).toBe('BUTTON');
      expect(dragHandle?.getAttribute('type')).toBe('button');
      expect(dragHandle?.getAttribute('aria-label')).toBe('Drag to reorder test_column');
      expect(dragHandle?.querySelector('svg')).toBeTruthy();

      // Name should also be inside name-row
      const name = nameRow?.querySelector('.dt-col-name');
      expect(name).toBeTruthy();
      expect(name?.textContent).toBe('test_column');

      header.destroy();
    });

    it('should apply custom class prefix', () => {
      const options: ColumnHeaderOptions = { classPrefix: 'custom' };
      const header = new ColumnHeader(column, state, actions, options);

      const el = header.getElement();
      expect(el.className).toBe('custom-col-header');
      expect(el.querySelector('.custom-col-name')).toBeTruthy();
      expect(el.querySelector('.custom-col-type')).toBeTruthy();
      expect(el.querySelector('.custom-col-sort')).toBeTruthy();

      header.destroy();
    });

    it('should set correct ARIA attributes', () => {
      const header = new ColumnHeader(column, state, actions);

      const el = header.getElement();
      expect(el.getAttribute('role')).toBe('columnheader');
      expect(el.getAttribute('aria-label')).toBe('test_column, integer');
      expect(el.getAttribute('data-column')).toBe('test_column');

      header.destroy();
    });
  });

  describe('DOM content', () => {
    it('should display column name', () => {
      const header = new ColumnHeader(column, state, actions);

      const nameEl = header.getElement().querySelector('.dt-col-name');
      expect(nameEl?.textContent).toBe('test_column');

      header.destroy();
    });

    it('should display column type', () => {
      const header = new ColumnHeader(column, state, actions);

      const typeEl = header.getElement().querySelector('.dt-col-type');
      expect(typeEl?.textContent).toBe('integer');

      header.destroy();
    });

    it('should display row count in stats line', () => {
      // Set row count before header is created
      state.totalRows.set(1234);

      const header = new ColumnHeader(column, state, actions);

      const statsEl = header.getElement().querySelector('.dt-col-stats');
      expect(statsEl?.textContent).toBe('1,234 rows');

      header.destroy();
    });

    it('should update stats line when row count changes', () => {
      const header = new ColumnHeader(column, state, actions);

      // Initially empty (0 rows)
      let statsEl = header.getElement().querySelector('.dt-col-stats');
      expect(statsEl?.textContent).toBe('');

      // Update row count - subscription triggers update
      state.totalRows.set(5678);
      expect(statsEl?.textContent).toBe('5,678 rows');

      header.destroy();
    });

    it('should display empty stats line when no rows', () => {
      // State starts with 0 rows (default)
      const header = new ColumnHeader(column, state, actions);

      const statsEl = header.getElement().querySelector('.dt-col-stats');
      expect(statsEl?.textContent).toBe('');

      header.destroy();
    });

    it('should have visualization container', () => {
      const header = new ColumnHeader(column, state, actions);

      const vizEl = header.getElement().querySelector('.dt-col-viz');
      expect(vizEl).toBeTruthy();

      header.destroy();
    });
  });

  describe('sort button', () => {
    it('should show sort button with SVG arrows', () => {
      const header = new ColumnHeader(column, state, actions);

      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn');
      expect(sortBtn).toBeTruthy();
      expect(sortBtn?.querySelector('svg')).toBeTruthy();
      expect(sortBtn?.querySelector('.arrow-up')).toBeTruthy();
      expect(sortBtn?.querySelector('.arrow-down')).toBeTruthy();
      expect(header.getElement().getAttribute('aria-sort')).toBe('none');

      header.destroy();
    });

    it('should have ascending class when sorted ascending', () => {
      state.sortColumns.set([{ column: 'test_column', direction: 'asc' }]);
      const header = new ColumnHeader(column, state, actions);

      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn');
      expect(sortBtn?.classList.contains('dt-col-sort-btn--asc')).toBe(true);
      expect(sortBtn?.classList.contains('dt-col-sort-btn--desc')).toBe(false);
      expect(header.getElement().getAttribute('aria-sort')).toBe('ascending');

      header.destroy();
    });

    it('should have descending class when sorted descending', () => {
      state.sortColumns.set([{ column: 'test_column', direction: 'desc' }]);
      const header = new ColumnHeader(column, state, actions);

      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn');
      expect(sortBtn?.classList.contains('dt-col-sort-btn--asc')).toBe(false);
      expect(sortBtn?.classList.contains('dt-col-sort-btn--desc')).toBe(true);
      expect(header.getElement().getAttribute('aria-sort')).toBe('descending');

      header.destroy();
    });

    it('should update button class when sort changes', () => {
      const header = new ColumnHeader(column, state, actions);
      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn');

      expect(sortBtn?.classList.contains('dt-col-sort-btn--asc')).toBe(false);
      expect(sortBtn?.classList.contains('dt-col-sort-btn--desc')).toBe(false);

      state.sortColumns.set([{ column: 'test_column', direction: 'asc' }]);
      expect(sortBtn?.classList.contains('dt-col-sort-btn--asc')).toBe(true);

      state.sortColumns.set([{ column: 'test_column', direction: 'desc' }]);
      expect(sortBtn?.classList.contains('dt-col-sort-btn--desc')).toBe(true);
      expect(sortBtn?.classList.contains('dt-col-sort-btn--asc')).toBe(false);

      state.sortColumns.set([]);
      expect(sortBtn?.classList.contains('dt-col-sort-btn--asc')).toBe(false);
      expect(sortBtn?.classList.contains('dt-col-sort-btn--desc')).toBe(false);

      header.destroy();
    });

    it('should not show sort state when other column is sorted', () => {
      state.sortColumns.set([{ column: 'other_column', direction: 'asc' }]);
      const header = new ColumnHeader(column, state, actions);

      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn');
      expect(sortBtn?.classList.contains('dt-col-sort-btn--asc')).toBe(false);
      expect(sortBtn?.classList.contains('dt-col-sort-btn--desc')).toBe(false);

      header.destroy();
    });
  });

  describe('multi-sort badges', () => {
    it('should show position badge for multi-sort', () => {
      state.sortColumns.set([
        { column: 'other_column', direction: 'asc' },
        { column: 'test_column', direction: 'desc' },
      ]);
      const header = new ColumnHeader(column, state, actions);

      const badge = header.getElement().querySelector('.dt-col-sort-badge');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('2');
      expect(badge?.style.display).not.toBe('none');

      header.destroy();
    });

    it('should show correct position for first sort column', () => {
      state.sortColumns.set([
        { column: 'test_column', direction: 'asc' },
        { column: 'other_column', direction: 'desc' },
      ]);
      const header = new ColumnHeader(column, state, actions);

      const badge = header.getElement().querySelector('.dt-col-sort-badge');
      expect(badge?.textContent).toBe('1');
      expect(badge?.style.display).not.toBe('none');

      header.destroy();
    });

    it('should hide badge for single sort', () => {
      state.sortColumns.set([{ column: 'test_column', direction: 'asc' }]);
      const header = new ColumnHeader(column, state, actions);

      const badge = header.getElement().querySelector('.dt-col-sort-badge');
      expect(badge?.style.display).toBe('none');

      header.destroy();
    });
  });

  describe('click handling', () => {
    it('should call toggleSort on sort button click', () => {
      const header = new ColumnHeader(column, state, actions);
      const toggleSortSpy = vi.spyOn(actions, 'toggleSort');
      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn') as HTMLElement;

      sortBtn.click();

      expect(toggleSortSpy).toHaveBeenCalledWith('test_column');

      header.destroy();
    });

    it('should NOT call toggleSort when clicking header (only sort button triggers sort)', () => {
      const header = new ColumnHeader(column, state, actions);
      const toggleSortSpy = vi.spyOn(actions, 'toggleSort');

      // Click on the header itself, not the sort button
      header.getElement().click();

      expect(toggleSortSpy).not.toHaveBeenCalled();

      header.destroy();
    });

    it('should call addToSort on Shift+click sort button', () => {
      const header = new ColumnHeader(column, state, actions);
      const addToSortSpy = vi.spyOn(actions, 'addToSort');
      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn') as HTMLElement;

      const event = new MouseEvent('click', { shiftKey: true, bubbles: true });
      sortBtn.dispatchEvent(event);

      expect(addToSortSpy).toHaveBeenCalledWith('test_column');

      header.destroy();
    });

    it('should cycle through sort states on sort button clicks', () => {
      const header = new ColumnHeader(column, state, actions);
      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn') as HTMLElement;

      // Initial: no sort
      expect(sortBtn.classList.contains('dt-col-sort-btn--asc')).toBe(false);
      expect(sortBtn.classList.contains('dt-col-sort-btn--desc')).toBe(false);

      // First click: ascending
      sortBtn.click();
      expect(sortBtn.classList.contains('dt-col-sort-btn--asc')).toBe(true);

      // Second click: descending
      sortBtn.click();
      expect(sortBtn.classList.contains('dt-col-sort-btn--desc')).toBe(true);

      // Third click: no sort
      sortBtn.click();
      expect(sortBtn.classList.contains('dt-col-sort-btn--asc')).toBe(false);
      expect(sortBtn.classList.contains('dt-col-sort-btn--desc')).toBe(false);

      header.destroy();
    });
  });

  describe('getColumn', () => {
    it('should return the column schema', () => {
      const header = new ColumnHeader(column, state, actions);

      expect(header.getColumn()).toBe(column);

      header.destroy();
    });
  });

  describe('isDestroyed', () => {
    it('should return false before destroy', () => {
      const header = new ColumnHeader(column, state, actions);

      expect(header.isDestroyed()).toBe(false);

      header.destroy();
    });

    it('should return true after destroy', () => {
      const header = new ColumnHeader(column, state, actions);

      header.destroy();

      expect(header.isDestroyed()).toBe(true);
    });
  });

  describe('destroy', () => {
    it('should remove click listener from sort button', () => {
      const header = new ColumnHeader(column, state, actions);
      const toggleSortSpy = vi.spyOn(actions, 'toggleSort');
      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn') as HTMLElement;

      header.destroy();
      sortBtn.click();

      expect(toggleSortSpy).not.toHaveBeenCalled();
    });

    it('should unsubscribe from state', () => {
      const header = new ColumnHeader(column, state, actions);
      const sortSubsBefore = state.sortColumns.subscriberCount();

      header.destroy();

      expect(state.sortColumns.subscriberCount()).toBeLessThan(sortSubsBefore);
    });

    it('should remove element from parent', () => {
      const parent = document.createElement('div');
      const header = new ColumnHeader(column, state, actions);
      parent.appendChild(header.getElement());

      expect(parent.contains(header.getElement())).toBe(true);

      header.destroy();

      expect(parent.contains(header.getElement())).toBe(false);
    });

    it('should be idempotent', () => {
      const header = new ColumnHeader(column, state, actions);

      header.destroy();
      header.destroy();
      header.destroy();

      expect(header.isDestroyed()).toBe(true);
    });

    it('should not update after destroy', () => {
      const header = new ColumnHeader(column, state, actions);
      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn');

      header.destroy();

      // Change state after destroy
      state.sortColumns.set([{ column: 'test_column', direction: 'asc' }]);

      // Should not have sort class
      expect(sortBtn?.classList.contains('dt-col-sort-btn--asc')).toBe(false);
    });

    it('should not respond to sort button clicks after destroy', () => {
      const header = new ColumnHeader(column, state, actions);
      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn') as HTMLElement;

      header.destroy();

      // This should not throw or change state
      sortBtn.click();

      expect(state.sortColumns.get()).toEqual([]);
    });
  });

  describe('different column types', () => {
    it('should display string type', () => {
      const stringColumn: ColumnSchema = {
        name: 'text_col',
        type: 'string',
        nullable: true,
        originalType: 'VARCHAR',
      };

      const header = new ColumnHeader(stringColumn, state, actions);
      const typeEl = header.getElement().querySelector('.dt-col-type');
      expect(typeEl?.textContent).toBe('string');

      header.destroy();
    });

    it('should display timestamp type', () => {
      const timestampColumn: ColumnSchema = {
        name: 'created_at',
        type: 'timestamp',
        nullable: false,
        originalType: 'TIMESTAMP',
      };

      const header = new ColumnHeader(timestampColumn, state, actions);
      const typeEl = header.getElement().querySelector('.dt-col-type');
      expect(typeEl?.textContent).toBe('timestamp');

      header.destroy();
    });

    it('should display boolean type', () => {
      const boolColumn: ColumnSchema = {
        name: 'is_active',
        type: 'boolean',
        nullable: false,
        originalType: 'BOOLEAN',
      };

      const header = new ColumnHeader(boolColumn, state, actions);
      const typeEl = header.getElement().querySelector('.dt-col-type');
      expect(typeEl?.textContent).toBe('boolean');

      header.destroy();
    });
  });
});
