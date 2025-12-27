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
      expect(el.querySelector('.dt-col-name')).toBeTruthy();
      expect(el.querySelector('.dt-col-type')).toBeTruthy();
      expect(el.querySelector('.dt-col-stats')).toBeTruthy();
      expect(el.querySelector('.dt-col-viz')).toBeTruthy();
      expect(el.querySelector('.dt-col-sort')).toBeTruthy();

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

    it('should display stats placeholder', () => {
      const header = new ColumnHeader(column, state, actions);

      const statsEl = header.getElement().querySelector('.dt-col-stats');
      expect(statsEl?.textContent).toBe('Stats coming...');

      header.destroy();
    });

    it('should have visualization container', () => {
      const header = new ColumnHeader(column, state, actions);

      const vizEl = header.getElement().querySelector('.dt-col-viz');
      expect(vizEl).toBeTruthy();

      header.destroy();
    });
  });

  describe('sort indicator', () => {
    it('should show no indicator when not sorted', () => {
      const header = new ColumnHeader(column, state, actions);

      const sortEl = header.getElement().querySelector('.dt-col-sort');
      expect(sortEl?.textContent).toBe('');
      expect(header.getElement().getAttribute('aria-sort')).toBe('none');

      header.destroy();
    });

    it('should show ascending indicator', () => {
      state.sortColumns.set([{ column: 'test_column', direction: 'asc' }]);
      const header = new ColumnHeader(column, state, actions);

      const sortEl = header.getElement().querySelector('.dt-col-sort');
      expect(sortEl?.textContent).toBe('\u25B2'); // ▲
      expect(header.getElement().getAttribute('aria-sort')).toBe('ascending');

      header.destroy();
    });

    it('should show descending indicator', () => {
      state.sortColumns.set([{ column: 'test_column', direction: 'desc' }]);
      const header = new ColumnHeader(column, state, actions);

      const sortEl = header.getElement().querySelector('.dt-col-sort');
      expect(sortEl?.textContent).toBe('\u25BC'); // ▼
      expect(header.getElement().getAttribute('aria-sort')).toBe('descending');

      header.destroy();
    });

    it('should update indicator when sort changes', () => {
      const header = new ColumnHeader(column, state, actions);
      const sortEl = header.getElement().querySelector('.dt-col-sort');

      expect(sortEl?.textContent).toBe('');

      state.sortColumns.set([{ column: 'test_column', direction: 'asc' }]);
      expect(sortEl?.textContent).toBe('\u25B2');

      state.sortColumns.set([{ column: 'test_column', direction: 'desc' }]);
      expect(sortEl?.textContent).toBe('\u25BC');

      state.sortColumns.set([]);
      expect(sortEl?.textContent).toBe('');

      header.destroy();
    });

    it('should not show indicator when other column is sorted', () => {
      state.sortColumns.set([{ column: 'other_column', direction: 'asc' }]);
      const header = new ColumnHeader(column, state, actions);

      const sortEl = header.getElement().querySelector('.dt-col-sort');
      expect(sortEl?.textContent).toBe('');

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

      const sortEl = header.getElement().querySelector('.dt-col-sort');
      expect(sortEl?.innerHTML).toContain('\u25BC'); // ▼
      const badge = sortEl?.querySelector('.dt-col-sort-badge');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('2');

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

      header.destroy();
    });

    it('should not show badge for single sort', () => {
      state.sortColumns.set([{ column: 'test_column', direction: 'asc' }]);
      const header = new ColumnHeader(column, state, actions);

      const sortEl = header.getElement().querySelector('.dt-col-sort');
      expect(sortEl?.textContent).toBe('\u25B2');
      expect(sortEl?.querySelector('.dt-col-sort-badge')).toBeNull();

      header.destroy();
    });
  });

  describe('click handling', () => {
    it('should call toggleSort on regular click', () => {
      const header = new ColumnHeader(column, state, actions);
      const toggleSortSpy = vi.spyOn(actions, 'toggleSort');

      header.getElement().click();

      expect(toggleSortSpy).toHaveBeenCalledWith('test_column');

      header.destroy();
    });

    it('should call addToSort on Shift+click', () => {
      const header = new ColumnHeader(column, state, actions);
      const addToSortSpy = vi.spyOn(actions, 'addToSort');

      const event = new MouseEvent('click', { shiftKey: true, bubbles: true });
      header.getElement().dispatchEvent(event);

      expect(addToSortSpy).toHaveBeenCalledWith('test_column');

      header.destroy();
    });

    it('should cycle through sort states on regular clicks', () => {
      const header = new ColumnHeader(column, state, actions);
      const sortEl = header.getElement().querySelector('.dt-col-sort');

      // Initial: no sort
      expect(sortEl?.textContent).toBe('');

      // First click: ascending
      header.getElement().click();
      expect(sortEl?.textContent).toBe('\u25B2');

      // Second click: descending
      header.getElement().click();
      expect(sortEl?.textContent).toBe('\u25BC');

      // Third click: no sort
      header.getElement().click();
      expect(sortEl?.textContent).toBe('');

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
    it('should remove click listener', () => {
      const header = new ColumnHeader(column, state, actions);
      const toggleSortSpy = vi.spyOn(actions, 'toggleSort');

      header.destroy();
      header.getElement().click();

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
      const sortEl = header.getElement().querySelector('.dt-col-sort');

      header.destroy();

      // Change state after destroy
      state.sortColumns.set([{ column: 'test_column', direction: 'asc' }]);

      // Should still be empty
      expect(sortEl?.textContent).toBe('');
    });

    it('should not respond to clicks after destroy', () => {
      const header = new ColumnHeader(column, state, actions);

      header.destroy();

      // This should not throw or change state
      header.getElement().click();

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
