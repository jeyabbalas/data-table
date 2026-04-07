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

describe('Derived Column Visuals', () => {
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ColumnHeader — derived markers', () => {
    it('should add derived header class when isDerived is true', () => {
      const column: ColumnSchema = {
        name: 'total',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
        isDerived: true,
        expression: 'price * quantity',
      };

      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();

      expect(el.classList.contains('dt-col-header--derived')).toBe(true);

      header.destroy();
    });

    it('should create f(x) icon button in name row before column name', () => {
      const column: ColumnSchema = {
        name: 'total',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
        isDerived: true,
        expression: 'price * quantity',
      };

      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();

      const iconBtn = el.querySelector('.dt-derived-icon-btn');
      expect(iconBtn).toBeTruthy();
      expect(iconBtn?.tagName).toBe('BUTTON');
      expect(iconBtn?.getAttribute('aria-label')).toBe('Edit derived column');

      // Icon button should contain an SVG
      const svg = iconBtn?.querySelector('svg');
      expect(svg).toBeTruthy();

      // Icon button should appear before the column name in the name row
      const nameRow = el.querySelector('.dt-col-name-row');
      const children = Array.from(nameRow!.children);
      const iconIndex = children.indexOf(iconBtn as Element);
      const nameEl = nameRow?.querySelector('.dt-col-name');
      const nameIndex = children.indexOf(nameEl as Element);
      expect(iconIndex).toBeLessThan(nameIndex);

      header.destroy();
    });

    it('should set italic font style on column name when isDerived is true', () => {
      const column: ColumnSchema = {
        name: 'total',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
        isDerived: true,
        expression: 'price * quantity',
      };

      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();

      const nameEl = el.querySelector('.dt-col-name') as HTMLElement;
      expect(nameEl.style.fontStyle).toBe('italic');

      header.destroy();
    });

    it('should NOT add derived markers when isDerived is false', () => {
      const column: ColumnSchema = {
        name: 'price',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
      };

      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();

      expect(el.classList.contains('dt-col-header--derived')).toBe(false);
      expect(el.querySelector('.dt-derived-icon-btn')).toBeNull();

      const nameEl = el.querySelector('.dt-col-name') as HTMLElement;
      expect(nameEl.style.fontStyle).not.toBe('italic');

      header.destroy();
    });

    it('should NOT add derived markers when isDerived is undefined', () => {
      const column: ColumnSchema = {
        name: 'price',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
      };

      const header = new ColumnHeader(column, state, actions);
      const el = header.getElement();

      expect(el.classList.contains('dt-col-header--derived')).toBe(false);
      expect(el.querySelector('.dt-derived-icon-btn')).toBeNull();

      header.destroy();
    });

    it('should have identical action panel for derived and non-derived columns', () => {
      const derivedColumn: ColumnSchema = {
        name: 'total',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
        isDerived: true,
        expression: 'price * quantity',
      };
      const regularColumn: ColumnSchema = {
        name: 'price',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
      };

      const derivedHeader = new ColumnHeader(derivedColumn, state, actions);
      const regularHeader = new ColumnHeader(regularColumn, state, actions);

      const derivedPanel = derivedHeader.getElement().querySelector('.dt-col-action-panel');
      const regularPanel = regularHeader.getElement().querySelector('.dt-col-action-panel');

      // Both should have the same buttons in the same order
      const derivedChildren = Array.from(derivedPanel!.children);
      const regularChildren = Array.from(regularPanel!.children);

      expect(derivedChildren.length).toBe(regularChildren.length);
      expect(derivedChildren.length).toBe(5); // pin, hide, filter, sort, drag

      // Verify order: pin, hide, filter, sort, drag
      expect(derivedChildren[0].classList.contains('dt-col-pin-btn')).toBe(true);
      expect(derivedChildren[1].classList.contains('dt-col-hide-btn')).toBe(true);
      expect(derivedChildren[2].classList.contains('dt-col-filter-btn')).toBe(true);
      expect(derivedChildren[3].classList.contains('dt-col-sort-btn')).toBe(true);
      expect(derivedChildren[4].classList.contains('dt-col-drag-handle')).toBe(true);

      derivedHeader.destroy();
      regularHeader.destroy();
    });

    it('should apply custom class prefix to derived markers', () => {
      const column: ColumnSchema = {
        name: 'total',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
        isDerived: true,
        expression: 'price * quantity',
      };
      const options: ColumnHeaderOptions = { classPrefix: 'custom' };

      const header = new ColumnHeader(column, state, actions, options);
      const el = header.getElement();

      expect(el.classList.contains('custom-col-header--derived')).toBe(true);
      expect(el.querySelector('.custom-derived-icon-btn')).toBeTruthy();

      header.destroy();
    });
  });
});
