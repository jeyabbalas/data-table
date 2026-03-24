/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilterPanelField } from '@/filters/FilterPanelField';
import { createTableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

// Mock WorkerBridge
const mockBridge = {
  query: vi.fn().mockResolvedValue([]),
  initialize: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
  destroy: vi.fn(),
} as any;

// Helper to create a field and attach it to the document
function createField(
  column: ColumnSchema,
  state: TableState,
  actions: StateActions
): FilterPanelField {
  const field = new FilterPanelField(column, state, actions);
  document.body.appendChild(field.getElement());
  return field;
}

describe('FilterPanelField', () => {
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    document.body.innerHTML = '';
  });

  // =========================================
  // Numeric Filters
  // =========================================

  describe('numeric filters', () => {
    const intColumn: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };

    it('should build a range filter for "between" mode', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'between';
      inputs[0].value = '10';
      inputs[1].value = '100';

      field.applyFilter();

      const filters = state.filters.get();
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual({
        type: 'range', column: 'price', min: 10, max: 100, maxInclusive: true,
      });

      field.destroy();
    });

    it('should build a point filter for "=" mode', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'eq';
      inputs[0].value = '42';

      field.applyFilter();

      const filters = state.filters.get();
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual({ type: 'point', column: 'price', value: 42 });

      field.destroy();
    });

    it('should build a not-set filter for "!=" mode', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'neq';
      inputs[0].value = '5';

      field.applyFilter();

      const filters = state.filters.get();
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual({
        type: 'not-set', column: 'price', values: [5], includeNull: true,
      });

      field.destroy();
    });

    it('should build range filter for ">" mode', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'gt';
      inputs[0].value = '10';

      field.applyFilter();

      const filters = state.filters.get();
      expect(filters[0]).toEqual({
        type: 'range', column: 'price', min: 10, max: Infinity, minExclusive: true,
      });

      field.destroy();
    });

    it('should build range filter for ">=" mode', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'gte';
      inputs[0].value = '10';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'range', column: 'price', min: 10, max: Infinity,
      });

      field.destroy();
    });

    it('should build range filter for "<" mode', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'lt';
      inputs[0].value = '50';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'range', column: 'price', min: -Infinity, max: 50,
      });

      field.destroy();
    });

    it('should build range filter for "<=" mode', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'lte';
      inputs[0].value = '50';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'range', column: 'price', min: -Infinity, max: 50, maxInclusive: true,
      });

      field.destroy();
    });

    it('should not apply filter when input is empty', () => {
      const field = createField(intColumn, state, actions);

      field.applyFilter();

      expect(state.filters.get()).toHaveLength(0);

      field.destroy();
    });

    it('should not apply filter when input is NaN', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      inputs[0].value = 'abc';

      field.applyFilter();

      expect(state.filters.get()).toHaveLength(0);

      field.destroy();
    });
  });

  // =========================================
  // String Filters
  // =========================================

  describe('string filters', () => {
    const strColumn: ColumnSchema = { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' };

    it('should build pattern filter for "contains" mode', () => {
      const field = createField(strColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      select.value = 'contains';
      input.value = 'hello';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'pattern', column: 'name', pattern: 'hello', mode: 'contains',
      });

      field.destroy();
    });

    it('should build pattern filter for "starts" mode', () => {
      const field = createField(strColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      select.value = 'starts';
      input.value = 'hello';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'pattern', column: 'name', pattern: 'hello', mode: 'starts',
      });

      field.destroy();
    });

    it('should build pattern filter for "ends" mode', () => {
      const field = createField(strColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      select.value = 'ends';
      input.value = 'hello';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'pattern', column: 'name', pattern: 'hello', mode: 'ends',
      });

      field.destroy();
    });

    it('should build pattern filter for "regex" mode with valid regex', () => {
      const field = createField(strColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      select.value = 'regex';
      input.value = '^test.*$';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'pattern', column: 'name', pattern: '^test.*$', mode: 'regex',
      });

      field.destroy();
    });

    it('should reject invalid regex and not apply filter', () => {
      const field = createField(strColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      select.value = 'regex';
      input.value = '[invalid';

      field.applyFilter();

      expect(state.filters.get()).toHaveLength(0);

      field.destroy();
    });

    it('should build point filter for "exact" mode', () => {
      const field = createField(strColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      select.value = 'exact';
      input.value = 'hello world';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'point', column: 'name', value: 'hello world',
      });

      field.destroy();
    });

    it('should not apply filter when input is empty', () => {
      const field = createField(strColumn, state, actions);

      field.applyFilter();

      expect(state.filters.get()).toHaveLength(0);

      field.destroy();
    });
  });

  // =========================================
  // Boolean Filters
  // =========================================

  describe('boolean filters', () => {
    const boolColumn: ColumnSchema = { name: 'active', type: 'boolean', nullable: true, originalType: 'BOOLEAN' };

    function getCheckboxes(field: FilterPanelField): HTMLInputElement[] {
      return Array.from(
        field.getElement().querySelectorAll('input[type="checkbox"]')
      ) as HTMLInputElement[];
    }

    it('should return no filter when all checked (default)', () => {
      const field = createField(boolColumn, state, actions);
      const checkboxes = getCheckboxes(field);

      expect(checkboxes[0].checked).toBe(true); // True
      expect(checkboxes[1].checked).toBe(true); // False
      expect(checkboxes[2].checked).toBe(true); // Null

      field.applyFilter();

      expect(state.filters.get()).toHaveLength(0);

      field.destroy();
    });

    it('should build point filter for true-only', () => {
      const field = createField(boolColumn, state, actions);
      const checkboxes = getCheckboxes(field);

      checkboxes[1].checked = false; // Uncheck False
      checkboxes[2].checked = false; // Uncheck Null

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'point', column: 'active', value: true,
      });

      field.destroy();
    });

    it('should build point filter for false-only', () => {
      const field = createField(boolColumn, state, actions);
      const checkboxes = getCheckboxes(field);

      checkboxes[0].checked = false; // Uncheck True
      checkboxes[2].checked = false; // Uncheck Null

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'point', column: 'active', value: false,
      });

      field.destroy();
    });

    it('should build null filter for null-only', () => {
      const field = createField(boolColumn, state, actions);
      const checkboxes = getCheckboxes(field);

      checkboxes[0].checked = false; // Uncheck True
      checkboxes[1].checked = false; // Uncheck False

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'null', column: 'active',
      });

      field.destroy();
    });

    it('should build not-null filter for true+false (exclude null)', () => {
      const field = createField(boolColumn, state, actions);
      const checkboxes = getCheckboxes(field);

      checkboxes[2].checked = false; // Uncheck Null

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'not-null', column: 'active',
      });

      field.destroy();
    });

    it('should build not-set filter for true+null (exclude false)', () => {
      const field = createField(boolColumn, state, actions);
      const checkboxes = getCheckboxes(field);

      checkboxes[1].checked = false; // Uncheck False

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'not-set', column: 'active', values: [false], includeNull: true,
      });

      field.destroy();
    });

    it('should build not-set filter for false+null (exclude true)', () => {
      const field = createField(boolColumn, state, actions);
      const checkboxes = getCheckboxes(field);

      checkboxes[0].checked = false; // Uncheck True

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'not-set', column: 'active', values: [true], includeNull: true,
      });

      field.destroy();
    });

    it('should return no filter when none checked', () => {
      const field = createField(boolColumn, state, actions);
      const checkboxes = getCheckboxes(field);

      checkboxes[0].checked = false;
      checkboxes[1].checked = false;
      checkboxes[2].checked = false;

      field.applyFilter();

      expect(state.filters.get()).toHaveLength(0);

      field.destroy();
    });

    it('should hide the null toggle radio group', () => {
      const field = createField(boolColumn, state, actions);
      const nullGroup = field.getElement().querySelector('.dt-filter-field-null') as HTMLElement;

      expect(nullGroup.style.display).toBe('none');

      field.destroy();
    });
  });

  // =========================================
  // Date Filters
  // =========================================

  describe('date filters', () => {
    const dateColumn: ColumnSchema = { name: 'created', type: 'date', nullable: true, originalType: 'DATE' };

    it('should build range filter for "between" mode', () => {
      const field = createField(dateColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
      select.value = 'between';
      inputs[0].value = '2024-01-01';
      inputs[1].value = '2024-12-31';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'range', column: 'created', min: '2024-01-01', max: '2024-12-31', maxInclusive: true,
      });

      field.destroy();
    });

    it('should build point filter for "=" mode', () => {
      const field = createField(dateColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
      select.value = 'eq';
      inputs[0].value = '2024-06-15';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'point', column: 'created', value: '2024-06-15',
      });

      field.destroy();
    });

    it('should build range filter for "before" mode', () => {
      const field = createField(dateColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
      select.value = 'before';
      inputs[0].value = '2024-06-15';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'range', column: 'created', min: -Infinity, max: '2024-06-15',
      });

      field.destroy();
    });

    it('should build range filter for "after" mode', () => {
      const field = createField(dateColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
      select.value = 'after';
      inputs[0].value = '2024-06-15';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'range', column: 'created', min: '2024-06-15', max: Infinity, minExclusive: true,
      });

      field.destroy();
    });

    it('should not apply filter when input is empty', () => {
      const field = createField(dateColumn, state, actions);

      field.applyFilter();

      expect(state.filters.get()).toHaveLength(0);

      field.destroy();
    });
  });

  // =========================================
  // Time Filters
  // =========================================

  describe('time filters', () => {
    const timeColumn: ColumnSchema = { name: 'start_time', type: 'time', nullable: true, originalType: 'TIME' };

    it('should build range filter with both inputs', () => {
      const field = createField(timeColumn, state, actions);
      const el = field.getElement();

      const inputs = el.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>;
      inputs[0].value = '09:00';
      inputs[1].value = '17:00';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'range', column: 'start_time', min: '09:00', max: '17:00', maxInclusive: true,
      });

      field.destroy();
    });

    it('should build range filter with from-only', () => {
      const field = createField(timeColumn, state, actions);
      const el = field.getElement();

      const inputs = el.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>;
      inputs[0].value = '09:00';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'range', column: 'start_time', min: '09:00', max: Infinity,
      });

      field.destroy();
    });

    it('should build range filter with to-only', () => {
      const field = createField(timeColumn, state, actions);
      const el = field.getElement();

      const inputs = el.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>;
      inputs[1].value = '17:00';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'range', column: 'start_time', min: -Infinity, max: '17:00', maxInclusive: true,
      });

      field.destroy();
    });

    it('should not apply filter when both inputs are empty', () => {
      const field = createField(timeColumn, state, actions);

      field.applyFilter();

      expect(state.filters.get()).toHaveLength(0);

      field.destroy();
    });
  });

  // =========================================
  // UUID Filters
  // =========================================

  describe('uuid filters', () => {
    const uuidColumn: ColumnSchema = { name: 'id', type: 'uuid', nullable: false, originalType: 'UUID' };

    it('should build pattern filter for "contains" mode', () => {
      const field = createField(uuidColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      select.value = 'contains';
      input.value = 'abc-123';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'pattern', column: 'id', pattern: 'abc-123', mode: 'contains',
      });

      field.destroy();
    });

    it('should build point filter for "exact" mode', () => {
      const field = createField(uuidColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      select.value = 'exact';
      input.value = '550e8400-e29b-41d4-a716-446655440000';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'point', column: 'id', value: '550e8400-e29b-41d4-a716-446655440000',
      });

      field.destroy();
    });
  });

  // =========================================
  // Interval Filters
  // =========================================

  describe('interval filters', () => {
    const intervalColumn: ColumnSchema = { name: 'duration', type: 'interval', nullable: true, originalType: 'INTERVAL' };

    it('should build pattern filter', () => {
      const field = createField(intervalColumn, state, actions);
      const el = field.getElement();

      const input = el.querySelector('input[type="text"]') as HTMLInputElement;
      input.value = '1 hour';

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'pattern', column: 'duration', pattern: '1 hour', mode: 'contains',
      });

      field.destroy();
    });
  });

  // =========================================
  // Null Toggle
  // =========================================

  describe('null toggle', () => {
    const intColumn: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };

    it('should apply null filter when "Is null" radio is selected', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const radios = el.querySelectorAll('.dt-filter-field-null input[type="radio"]') as NodeListOf<HTMLInputElement>;
      // radios: [any, null, not-null]
      radios[1].checked = true;

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'null', column: 'price',
      });

      field.destroy();
    });

    it('should apply not-null filter when "Is not null" radio is selected', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const radios = el.querySelectorAll('.dt-filter-field-null input[type="radio"]') as NodeListOf<HTMLInputElement>;
      radios[2].checked = true;

      field.applyFilter();

      expect(state.filters.get()[0]).toEqual({
        type: 'not-null', column: 'price',
      });

      field.destroy();
    });

    it('should apply value filter when "Any" radio is selected', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      // Set a numeric value with "Any" null toggle (default)
      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'eq';
      inputs[0].value = '42';

      field.applyFilter();

      // Should produce a value-based filter, not a null filter
      expect(state.filters.get()[0].type).not.toBe('null');
      expect(state.filters.get()[0].type).not.toBe('not-null');

      field.destroy();
    });
  });

  // =========================================
  // Clear Button
  // =========================================

  describe('clear button', () => {
    const intColumn: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };

    it('should be hidden initially', () => {
      const field = createField(intColumn, state, actions);
      const clearBtn = field.getElement().querySelector('.dt-filter-field-clear') as HTMLElement;

      expect(clearBtn.classList.contains('dt-filter-field-clear--hidden')).toBe(true);

      field.destroy();
    });

    it('should become visible after applying a filter', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'eq';
      inputs[0].value = '42';

      field.applyFilter();

      const clearBtn = el.querySelector('.dt-filter-field-clear') as HTMLElement;
      expect(clearBtn.classList.contains('dt-filter-field-clear--hidden')).toBe(false);

      field.destroy();
    });

    it('should remove filter and reset controls when clicked', () => {
      const field = createField(intColumn, state, actions);
      const el = field.getElement();

      // Apply a filter first
      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      select.value = 'eq';
      inputs[0].value = '42';
      field.applyFilter();
      expect(state.filters.get()).toHaveLength(1);

      // Click clear
      const clearBtn = el.querySelector('.dt-filter-field-clear') as HTMLButtonElement;
      clearBtn.click();

      expect(state.filters.get()).toHaveLength(0);
      expect(inputs[0].value).toBe('');
      expect(clearBtn.classList.contains('dt-filter-field-clear--hidden')).toBe(true);

      field.destroy();
    });
  });

  // =========================================
  // syncFromState
  // =========================================

  describe('syncFromState', () => {
    it('should populate numeric controls from external range filter', () => {
      const col: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };
      const field = createField(col, state, actions);

      // Add filter externally
      actions.addFilter({ type: 'range', column: 'price', min: 10, max: 100, maxInclusive: true });

      // syncFromState is called by subscription - trigger it manually
      field.syncFromState();

      const el = field.getElement();
      const select = el.querySelector('select') as HTMLSelectElement;
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;

      expect(select.value).toBe('between');
      expect(inputs[0].value).toBe('10');
      expect(inputs[1].value).toBe('100');

      field.destroy();
    });

    it('should populate string controls from external pattern filter', () => {
      const col: ColumnSchema = { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' };
      const field = createField(col, state, actions);

      actions.addFilter({ type: 'pattern', column: 'name', pattern: 'hello', mode: 'contains' });
      field.syncFromState();

      const el = field.getElement();
      const select = el.querySelector('select') as HTMLSelectElement;
      const input = el.querySelector('input[type="text"]') as HTMLInputElement;

      expect(select.value).toBe('contains');
      expect(input.value).toBe('hello');

      field.destroy();
    });

    it('should populate boolean controls from external point filter', () => {
      const col: ColumnSchema = { name: 'active', type: 'boolean', nullable: true, originalType: 'BOOLEAN' };
      const field = createField(col, state, actions);

      actions.addFilter({ type: 'point', column: 'active', value: true });
      field.syncFromState();

      const checkboxes = field.getElement().querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
      expect(checkboxes[0].checked).toBe(true);  // True
      expect(checkboxes[1].checked).toBe(false); // False
      expect(checkboxes[2].checked).toBe(false); // Null

      field.destroy();
    });

    it('should set null toggle for external null filter', () => {
      const col: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };
      const field = createField(col, state, actions);

      actions.addFilter({ type: 'null', column: 'price' });
      field.syncFromState();

      const radios = field.getElement().querySelectorAll('.dt-filter-field-null input[type="radio"]') as NodeListOf<HTMLInputElement>;
      expect(radios[0].checked).toBe(false); // Any
      expect(radios[1].checked).toBe(true);  // Is null
      expect(radios[2].checked).toBe(false); // Is not null

      field.destroy();
    });

    it('should clear controls when filter is removed externally', () => {
      const col: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };
      const field = createField(col, state, actions);

      // Add and then remove filter
      actions.addFilter({ type: 'point', column: 'price', value: 42 });
      field.syncFromState();
      actions.removeFilter('price');
      field.syncFromState();

      const el = field.getElement();
      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      expect(inputs[0].value).toBe('');
      expect(inputs[1].value).toBe('');

      field.destroy();
    });
  });

  // =========================================
  // Destroy
  // =========================================

  describe('destroy', () => {
    it('should remove element from DOM', () => {
      const col: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };
      const field = createField(col, state, actions);

      expect(document.body.contains(field.getElement())).toBe(true);

      field.destroy();

      expect(document.body.contains(field.getElement())).toBe(false);
    });

    it('should not apply filter after destroy', () => {
      const col: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };
      const field = createField(col, state, actions);
      const el = field.getElement();

      const inputs = el.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      inputs[0].value = '42';

      field.destroy();
      field.applyFilter();

      expect(state.filters.get()).toHaveLength(0);
    });
  });

  // =========================================
  // Column Name and Element
  // =========================================

  describe('public API', () => {
    it('should return the column name', () => {
      const col: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };
      const field = createField(col, state, actions);

      expect(field.getColumnName()).toBe('price');

      field.destroy();
    });

    it('should return the element with data-column attribute', () => {
      const col: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };
      const field = createField(col, state, actions);

      expect(field.getElement().getAttribute('data-column')).toBe('price');

      field.destroy();
    });

    it('should have an Apply button for non-boolean types', () => {
      const col: ColumnSchema = { name: 'price', type: 'integer', nullable: true, originalType: 'INTEGER' };
      const field = createField(col, state, actions);

      const applyBtn = field.getElement().querySelector('.dt-filter-field-apply');
      expect(applyBtn).toBeTruthy();

      field.destroy();
    });

    it('should NOT have an Apply button for boolean type', () => {
      const col: ColumnSchema = { name: 'active', type: 'boolean', nullable: true, originalType: 'BOOLEAN' };
      const field = createField(col, state, actions);

      const applyBtn = field.getElement().querySelector('.dt-filter-field-apply');
      expect(applyBtn).toBeFalsy();

      field.destroy();
    });
  });
});
