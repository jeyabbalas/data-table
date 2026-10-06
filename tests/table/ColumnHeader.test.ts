/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColumnHeader, type ColumnHeaderOptions } from '@/table/ColumnHeader';
import { createTableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import { defaultStrings, mergeStrings } from '@/core/Strings';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

// Mock WorkerBridge
const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
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
      expect(el.querySelector('.dt-col-sort-btn')).toBeTruthy();

      header.destroy();
    });

    it('should create name-row with only column name', () => {
      const header = new ColumnHeader(column, state, actions);

      const el = header.getElement();
      const nameRow = el.querySelector('.dt-col-name-row');
      expect(nameRow).toBeTruthy();

      // Name should be inside name-row
      const name = nameRow?.querySelector('.dt-col-name');
      expect(name).toBeTruthy();
      expect(name?.textContent).toBe('test_column');

      // Drag handle and sort button should NOT be in name-row (moved to action panel)
      expect(nameRow?.querySelector('.dt-col-drag-handle')).toBeNull();
      expect(nameRow?.querySelector('.dt-col-sort-btn')).toBeNull();

      header.destroy();
    });

    it('should have sort button and drag handle in action panel', () => {
      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();
      const actionPanel = el.querySelector('.dt-col-action-panel');

      expect(actionPanel?.querySelector('.dt-col-sort-btn')).toBeTruthy();
      expect(actionPanel?.querySelector('.dt-col-drag-handle')).toBeTruthy();

      // Verify action panel button order: pin, hide, filter, sort, drag
      const children = Array.from(actionPanel!.children);
      expect(children[0].classList.contains('dt-col-pin-btn')).toBe(true);
      expect(children[1].classList.contains('dt-col-hide-btn')).toBe(true);
      expect(children[2].classList.contains('dt-col-filter-btn')).toBe(true);
      expect(children[3].classList.contains('dt-col-sort-btn')).toBe(true);
      expect(children[4].classList.contains('dt-col-drag-handle')).toBe(true);

      header.destroy();
    });

    it('should apply custom class prefix', () => {
      const options: ColumnHeaderOptions = { classPrefix: 'custom' };
      const header = new ColumnHeader(column, state, actions, options);

      const el = header.getElement();
      expect(el.className).toBe('custom-col-header');
      expect(el.querySelector('.custom-col-name')).toBeTruthy();
      expect(el.querySelector('.custom-col-type')).toBeTruthy();
      expect(el.querySelector('.custom-col-sort-btn')).toBeTruthy();

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
      const statsEl = header.getElement().querySelector('.dt-col-stats');
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

  describe('filter indicator', () => {
    it('should not have filtered class when column has no filters', () => {
      const header = new ColumnHeader(column, state, actions);

      expect(header.getElement().classList.contains('dt-col-header--filtered')).toBe(false);

      header.destroy();
    });

    it('should have filtered class when column has active filter', () => {
      state.filters.set([{ type: 'range', column: 'test_column', min: 0, max: 100 }]);
      const header = new ColumnHeader(column, state, actions);

      expect(header.getElement().classList.contains('dt-col-header--filtered')).toBe(true);

      header.destroy();
    });

    it('should add filtered class when filter is added after creation', () => {
      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().classList.contains('dt-col-header--filtered')).toBe(false);

      state.filters.set([{ type: 'range', column: 'test_column', min: 0, max: 100 }]);
      expect(header.getElement().classList.contains('dt-col-header--filtered')).toBe(true);

      header.destroy();
    });

    it('should remove filtered class when filter is removed', () => {
      state.filters.set([{ type: 'range', column: 'test_column', min: 0, max: 100 }]);
      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().classList.contains('dt-col-header--filtered')).toBe(true);

      state.filters.set([]);
      expect(header.getElement().classList.contains('dt-col-header--filtered')).toBe(false);

      header.destroy();
    });

    it('should not have filtered class when only other columns have filters', () => {
      state.filters.set([{ type: 'range', column: 'other_column', min: 0, max: 100 }]);
      const header = new ColumnHeader(column, state, actions);

      expect(header.getElement().classList.contains('dt-col-header--filtered')).toBe(false);

      header.destroy();
    });

    it('should not update filter indicator after destroy', () => {
      const header = new ColumnHeader(column, state, actions);
      header.destroy();

      state.filters.set([{ type: 'range', column: 'test_column', min: 0, max: 100 }]);
      expect(header.getElement().classList.contains('dt-col-header--filtered')).toBe(false);
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

    it('should call addToSort on Cmd+click sort button', () => {
      const header = new ColumnHeader(column, state, actions);
      const addToSortSpy = vi.spyOn(actions, 'addToSort');
      const sortBtn = header.getElement().querySelector('.dt-col-sort-btn') as HTMLElement;

      const event = new MouseEvent('click', { metaKey: true, bubbles: true });
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

  describe('resize drag', () => {
    function holdRecorder(): { holdColumn: (c: string) => () => void; held: string[] } {
      const held: string[] = [];
      return {
        held,
        holdColumn: (c) => {
          held.push(c);
          return () => {
            const at = held.indexOf(c);
            if (at >= 0) held.splice(at, 1);
          };
        },
      };
    }

    function pressHandle(header: ColumnHeader): void {
      header
        .getElement()
        .querySelector('.dt-col-resize-handle')!
        .dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    }

    it('holds its column from the press to the release', () => {
      const recorder = holdRecorder();
      const header = new ColumnHeader(column, state, actions, { holdColumn: recorder.holdColumn });
      header.getElement().style.width = '150px';
      document.body.appendChild(header.getElement());

      pressHandle(header);
      expect(recorder.held).toEqual(['test_column']);
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140 }));
      expect(state.columnWidths.get().get('test_column')).toBe(190);
      expect(recorder.held).toEqual(['test_column']);
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 140 }));
      expect(recorder.held).toEqual([]);

      header.destroy();
    });

    it('lets go when destroyed mid-drag', () => {
      const recorder = holdRecorder();
      const header = new ColumnHeader(column, state, actions, { holdColumn: recorder.holdColumn });
      document.body.appendChild(header.getElement());

      pressHandle(header);
      header.destroy();
      expect(recorder.held).toEqual([]);
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

  describe('nested and JSON column types', () => {
    const typeOf = (header: ColumnHeader): HTMLElement =>
      header.getElement().querySelector<HTMLElement>('.dt-col-type')!;

    it.each([
      ['tags', 'VARCHAR[]', '[varchar]', 'tags, list of varchar'],
      ['scores', 'INTEGER[]', '[integer]', 'scores, list of integer'],
      ['embedding', 'FLOAT[768]', 'float[768]', 'embedding, array of 768 float'],
      [
        'point',
        'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
        'struct(3)',
        'point, struct with 3 fields',
      ],
      [
        'attrs',
        'MAP(VARCHAR, INTEGER)',
        '{varchar → integer}',
        'attrs, map from varchar to integer',
      ],
      ['u', 'UNION(num INTEGER, str VARCHAR)', 'union(2)', 'u, union of 2 types'],
      [
        'people',
        'STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]',
        '[struct(3)]',
        'people, list of struct with 3 fields',
      ],
      ['v', 'VARIANT', 'variant', 'v, variant'],
    ])(
      'labels %s (%s) as %s, titled with its full type, spoken as "%s"',
      (name, originalType, label, ariaLabel) => {
        const header = new ColumnHeader(
          { name, type: 'nested', nullable: true, originalType },
          state,
          actions,
        );
        expect(typeOf(header).textContent).toBe(label);
        expect(typeOf(header).getAttribute('title')).toBe(originalType);
        expect(header.getElement().getAttribute('aria-label')).toBe(ariaLabel);
        header.destroy();
      },
    );

    it('labels a JSON column json, and says JSON', () => {
      const header = new ColumnHeader(
        { name: 'doc', type: 'string', nullable: true, originalType: 'JSON' },
        state,
        actions,
      );
      expect(typeOf(header).textContent).toBe('json');
      expect(typeOf(header).getAttribute('title')).toBe('JSON');
      expect(header.getElement().getAttribute('aria-label')).toBe('doc, JSON');
      header.destroy();
    });

    it('keeps a scalar column’s type, with no title', () => {
      for (const column of [
        { name: 'n', type: 'integer', nullable: false, originalType: 'INTEGER' },
        { name: 's', type: 'string', nullable: true, originalType: 'VARCHAR' },
        { name: 'd', type: 'decimal', nullable: true, originalType: 'DECIMAL(18,4)' },
      ] satisfies ColumnSchema[]) {
        const header = new ColumnHeader(column, state, actions);
        expect(typeOf(header).textContent).toBe(column.type);
        expect(typeOf(header).hasAttribute('title')).toBe(false);
        expect(header.getElement().getAttribute('aria-label')).toBe(
          `${column.name}, ${column.type}`,
        );
        header.destroy();
      }
    });

    it('keeps the spoken type when sort and filter state join the label', () => {
      const column: ColumnSchema = {
        name: 'tags',
        type: 'nested',
        nullable: true,
        originalType: 'VARCHAR[]',
      };
      const header = new ColumnHeader(column, state, actions);
      state.sortColumns.set([{ column: 'tags', direction: 'asc' }]);
      expect(header.getElement().getAttribute('aria-label')).toBe(
        'tags, list of varchar, sorted ascending',
      );
      header.destroy();
    });

    it('says the type in the configured language', () => {
      const messages = mergeStrings(defaultStrings, {
        values: { typeList: (element: string) => `liste de ${element}` },
      });
      const header = new ColumnHeader(
        { name: 'tags', type: 'nested', nullable: true, originalType: 'VARCHAR[]' },
        state,
        actions,
        { messages },
      );
      expect(header.getElement().getAttribute('aria-label')).toBe('tags, liste de varchar');
      header.destroy();
    });

    it('leaves markup in a field name as text', () => {
      const header = new ColumnHeader(
        {
          name: 'evil',
          type: 'nested',
          nullable: true,
          originalType: 'STRUCT("<img src=x onerror=alert(1)>" INTEGER)[]',
        },
        state,
        actions,
      );
      // The label names no field; the title holds the type as text.
      expect(typeOf(header).textContent).toBe('[struct(1)]');
      expect(typeOf(header).querySelector('img')).toBeNull();
      expect(typeOf(header).title).toBe('STRUCT("<img src=x onerror=alert(1)>" INTEGER)[]');
      header.destroy();
    });
  });

  describe('hide button', () => {
    it('should have a hide button in the action panel', () => {
      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();

      const hideBtn = el.querySelector('.dt-col-hide-btn');
      expect(hideBtn).toBeTruthy();
      expect(hideBtn?.tagName).toBe('BUTTON');

      header.destroy();
    });

    it('should call actions.hideColumn when hide button is clicked', () => {
      state.visibleColumns.set(['test_column', 'other_column']);
      state.columnOrder.set(['test_column', 'other_column']);

      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();
      const hideBtn = el.querySelector('.dt-col-hide-btn') as HTMLButtonElement;

      const hideSpy = vi.spyOn(actions, 'hideColumn');
      hideBtn.click();

      expect(hideSpy).toHaveBeenCalledWith('test_column');

      header.destroy();
    });

    it('should be disabled when only one column is visible', () => {
      state.visibleColumns.set(['test_column']);
      state.columnOrder.set(['test_column']);

      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();
      const hideBtn = el.querySelector('.dt-col-hide-btn') as HTMLButtonElement;

      expect(hideBtn.hasAttribute('disabled')).toBe(true);
      expect(hideBtn.classList.contains('dt-col-action-btn--disabled')).toBe(true);

      header.destroy();
    });

    it('should enable hide button when more columns become visible', () => {
      state.visibleColumns.set(['test_column']);
      state.columnOrder.set(['test_column', 'other_column']);

      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();
      const hideBtn = el.querySelector('.dt-col-hide-btn') as HTMLButtonElement;

      expect(hideBtn.hasAttribute('disabled')).toBe(true);

      // Add another visible column
      state.visibleColumns.set(['test_column', 'other_column']);

      expect(hideBtn.hasAttribute('disabled')).toBe(false);
      expect(hideBtn.classList.contains('dt-col-action-btn--disabled')).toBe(false);

      header.destroy();
    });
  });

  describe('extract button', () => {
    const point: ColumnSchema = {
      name: 'point',
      type: 'nested',
      nullable: true,
      originalType: 'STRUCT(x DOUBLE, y DOUBLE)',
    };
    const doc: ColumnSchema = { name: 'doc', type: 'string', nullable: true, originalType: 'JSON' };

    const extractOf = (header: ColumnHeader): HTMLButtonElement | null =>
      header.getElement().querySelector<HTMLButtonElement>('.dt-col-extract-btn');

    it('is on a nested or JSON column, after the filter button, out of the tab order', () => {
      state.visibleColumns.set(['point', 'doc']);
      for (const col of [point, doc, { ...point, originalType: 'VARIANT' }]) {
        const onExtractClick = vi.fn();
        const header = new ColumnHeader(col, state, actions, { onExtractClick });
        const button = extractOf(header)!;
        expect(button, col.originalType).toBeTruthy();
        expect(button.tagName).toBe('BUTTON');
        expect(button.getAttribute('type')).toBe('button');
        expect(button.getAttribute('tabindex')).toBe('-1');
        expect(button.classList.contains('dt-col-action-btn')).toBe(true);
        expect(button.getAttribute('aria-haspopup')).toBe('dialog');
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button.getAttribute('aria-label')).toBe(`Extract from ${col.name}`);
        expect(button.getAttribute('title')).toBe('Extract a field as a column');
        // An inline SVG, as the other buttons draw theirs: no `data:` URI.
        expect(button.querySelector('svg[aria-hidden="true"] path')).toBeTruthy();
        expect(button.outerHTML).not.toContain('data:');

        const children = Array.from(
          header.getElement().querySelector('.dt-col-action-panel')!.children,
        );
        expect(children.map((c) => c.classList[1] ?? c.classList[0])).toEqual([
          'dt-col-pin-btn',
          'dt-col-hide-btn',
          'dt-col-filter-btn',
          'dt-col-extract-btn',
          'dt-col-sort-btn',
          'dt-col-drag-handle',
        ]);
        header.destroy();
      }
    });

    it('is not on a scalar column, nor without a click handler (extraction off)', () => {
      const scalar = new ColumnHeader(column, state, actions, { onExtractClick: vi.fn() });
      expect(extractOf(scalar)).toBeNull();
      scalar.destroy();
      const off = new ColumnHeader(point, state, actions);
      expect(extractOf(off)).toBeNull();
      expect(off.getControls().some((c) => c.classList.contains('dt-col-extract-btn'))).toBe(false);
      off.destroy();
    });

    it('is a controls-mode stop, between filter and sort', () => {
      state.visibleColumns.set(['point', 'doc']);
      const header = new ColumnHeader(point, state, actions, { onExtractClick: vi.fn() });
      document.body.appendChild(header.getElement());
      const controls = header.getControls();
      const at = controls.indexOf(extractOf(header)!);
      expect(at).toBeGreaterThan(0);
      expect(controls[at - 1]!.classList.contains('dt-col-filter-btn')).toBe(true);
      expect(controls[at + 1]!.classList.contains('dt-col-sort-btn')).toBe(true);
      header.destroy();
    });

    it('hands the click on with the column and itself, and nothing else', () => {
      const onExtractClick = vi.fn();
      const onFilterClick = vi.fn();
      const header = new ColumnHeader(point, state, actions, { onExtractClick, onFilterClick });
      const sort = vi.spyOn(actions, 'toggleSort');
      const button = extractOf(header)!;
      button.click();
      expect(onExtractClick).toHaveBeenCalledWith('point', button);
      expect(onFilterClick).not.toHaveBeenCalled();
      expect(sort).not.toHaveBeenCalled();
      header.destroy();
    });

    it('comes and goes with the controls, and its listener with it', () => {
      const onExtractClick = vi.fn();
      const header = new ColumnHeader(point, state, actions, { onExtractClick, controls: false });
      expect(extractOf(header)).toBeNull();
      header.setControlsMounted(true);
      const button = extractOf(header)!;
      header.setControlsMounted(false);
      expect(extractOf(header)).toBeNull();
      button.click();
      expect(onExtractClick).not.toHaveBeenCalled();
      header.destroy();
    });

    it('is labelled in the configured language', () => {
      const messages = mergeStrings(defaultStrings, {
        values: {
          extractButtonLabel: (name: string) => `Extraire de ${name}`,
          extractButtonTitle: 'Extraire un champ',
        },
      });
      const header = new ColumnHeader(point, state, actions, {
        onExtractClick: vi.fn(),
        messages,
      });
      expect(extractOf(header)!.getAttribute('aria-label')).toBe('Extraire de point');
      expect(extractOf(header)!.getAttribute('title')).toBe('Extraire un champ');
      header.destroy();
    });
  });
});
