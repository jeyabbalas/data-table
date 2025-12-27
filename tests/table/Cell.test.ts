/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CellRenderer, type CellOptions } from '@/table/Cell';
import type { ColumnSchema } from '@/core/types';

describe('CellRenderer', () => {
  let renderer: CellRenderer;

  beforeEach(() => {
    renderer = new CellRenderer();
  });

  describe('constructor', () => {
    it('should use default class prefix', () => {
      const cellEl = document.createElement('div');
      renderer.render(cellEl, null);
      expect(cellEl.classList.contains('dt-cell--null')).toBe(true);
    });

    it('should use custom class prefix', () => {
      const customRenderer = new CellRenderer({ classPrefix: 'custom' });
      const cellEl = document.createElement('div');
      customRenderer.render(cellEl, null);
      expect(cellEl.classList.contains('custom-cell--null')).toBe(true);
    });
  });

  describe('formatValue', () => {
    describe('null/undefined handling', () => {
      it('should format null as "null"', () => {
        expect(renderer.formatValue(null)).toBe('null');
      });

      it('should format undefined as "null"', () => {
        expect(renderer.formatValue(undefined)).toBe('null');
      });

      it('should format null with type as "null"', () => {
        expect(renderer.formatValue(null, 'integer')).toBe('null');
      });
    });

    describe('without type', () => {
      it('should convert to string', () => {
        expect(renderer.formatValue(123)).toBe('123');
        expect(renderer.formatValue('hello')).toBe('hello');
        expect(renderer.formatValue(true)).toBe('true');
      });
    });

    describe('integer type', () => {
      it('should format number with locale separators', () => {
        const result = renderer.formatValue(1234567, 'integer');
        // Locale-specific, but should contain separators
        expect(result).toMatch(/1.?234.?567/);
      });

      it('should handle bigint', () => {
        const result = renderer.formatValue(BigInt(1234567), 'integer');
        expect(result).toMatch(/1.?234.?567/);
      });

      it('should handle string value', () => {
        expect(renderer.formatValue('123', 'integer')).toBe('123');
      });

      it('should handle negative numbers', () => {
        const result = renderer.formatValue(-1234, 'integer');
        expect(result).toMatch(/-1.?234/);
      });
    });

    describe('float/decimal type', () => {
      it('should format with up to 4 decimal places', () => {
        const result = renderer.formatValue(1234.56789, 'float');
        // Should have at most 4 decimal places
        expect(result).toMatch(/1.?234/);
      });

      it('should remove trailing zeros', () => {
        const result = renderer.formatValue(1234.5, 'float');
        // Should not have trailing zeros
        expect(result).not.toMatch(/\.50/);
      });

      it('should work for decimal type', () => {
        const result = renderer.formatValue(99.99, 'decimal');
        expect(result).toMatch(/99/);
      });

      it('should handle whole numbers', () => {
        const result = renderer.formatValue(1000, 'float');
        expect(result).toMatch(/1.?000/);
      });

      it('should handle string value', () => {
        expect(renderer.formatValue('123.45', 'float')).toBe('123.45');
      });
    });

    describe('boolean type', () => {
      it('should format true as "true"', () => {
        expect(renderer.formatValue(true, 'boolean')).toBe('true');
      });

      it('should format false as "false"', () => {
        expect(renderer.formatValue(false, 'boolean')).toBe('false');
      });

      it('should format truthy values as "true"', () => {
        expect(renderer.formatValue(1, 'boolean')).toBe('true');
        expect(renderer.formatValue('yes', 'boolean')).toBe('true');
      });

      it('should format falsy values as "false"', () => {
        expect(renderer.formatValue(0, 'boolean')).toBe('false');
        expect(renderer.formatValue('', 'boolean')).toBe('false');
      });
    });

    describe('date type', () => {
      it('should format Date object as ISO date', () => {
        const date = new Date('2024-06-15T10:30:00Z');
        const result = renderer.formatValue(date, 'date');
        expect(result).toBe('2024-06-15');
      });

      it('should pass through string dates', () => {
        expect(renderer.formatValue('2024-06-15', 'date')).toBe('2024-06-15');
      });
    });

    describe('timestamp type', () => {
      it('should format Date object with locale string', () => {
        const date = new Date('2024-06-15T10:30:00Z');
        const result = renderer.formatValue(date, 'timestamp');
        // Should be a locale string, not ISO
        expect(result).not.toBe('2024-06-15T10:30:00.000Z');
        expect(result.length).toBeGreaterThan(0);
      });

      it('should parse string timestamps', () => {
        const result = renderer.formatValue('2024-06-15T10:30:00Z', 'timestamp');
        // Should be formatted, not raw string
        expect(result.length).toBeGreaterThan(0);
      });

      it('should handle invalid date strings', () => {
        const result = renderer.formatValue('not a date', 'timestamp');
        expect(result).toBe('not a date');
      });
    });

    describe('time type', () => {
      it('should convert to string', () => {
        expect(renderer.formatValue('10:30:00', 'time')).toBe('10:30:00');
      });
    });

    describe('interval type', () => {
      it('should convert to string', () => {
        expect(renderer.formatValue('1 day', 'interval')).toBe('1 day');
      });
    });

    describe('string type', () => {
      it('should pass through strings', () => {
        expect(renderer.formatValue('hello world', 'string')).toBe('hello world');
      });

      it('should convert other values to string', () => {
        expect(renderer.formatValue(123, 'string')).toBe('123');
        expect(renderer.formatValue(true, 'string')).toBe('true');
      });
    });
  });

  describe('render', () => {
    let cellEl: HTMLElement;
    let schema: ColumnSchema;

    beforeEach(() => {
      cellEl = document.createElement('div');
      schema = {
        name: 'test_col',
        type: 'integer',
        nullable: false,
        originalType: 'INTEGER',
      };
    });

    describe('null values', () => {
      it('should display "null" text', () => {
        renderer.render(cellEl, null, schema);
        expect(cellEl.textContent).toBe('null');
      });

      it('should add null class', () => {
        renderer.render(cellEl, null, schema);
        expect(cellEl.classList.contains('dt-cell--null')).toBe(true);
      });

      it('should remove number class', () => {
        cellEl.classList.add('dt-cell--number');
        renderer.render(cellEl, null, schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
      });

      it('should handle undefined', () => {
        renderer.render(cellEl, undefined, schema);
        expect(cellEl.textContent).toBe('null');
        expect(cellEl.classList.contains('dt-cell--null')).toBe(true);
      });
    });

    describe('integer values', () => {
      it('should format with locale separators', () => {
        renderer.render(cellEl, 1234567, schema);
        expect(cellEl.textContent).toMatch(/1.?234.?567/);
      });

      it('should add number class', () => {
        renderer.render(cellEl, 123, schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(true);
      });

      it('should remove null class', () => {
        cellEl.classList.add('dt-cell--null');
        renderer.render(cellEl, 123, schema);
        expect(cellEl.classList.contains('dt-cell--null')).toBe(false);
      });
    });

    describe('float values', () => {
      it('should add number class', () => {
        schema.type = 'float';
        renderer.render(cellEl, 123.45, schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(true);
      });
    });

    describe('decimal values', () => {
      it('should add number class', () => {
        schema.type = 'decimal';
        renderer.render(cellEl, 99.99, schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(true);
      });
    });

    describe('non-numeric types', () => {
      it('should not add number class for string', () => {
        schema.type = 'string';
        renderer.render(cellEl, 'hello', schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
      });

      it('should not add number class for boolean', () => {
        schema.type = 'boolean';
        renderer.render(cellEl, true, schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
      });

      it('should not add number class for date', () => {
        schema.type = 'date';
        renderer.render(cellEl, new Date(), schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
      });

      it('should not add number class for timestamp', () => {
        schema.type = 'timestamp';
        renderer.render(cellEl, new Date(), schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
      });
    });

    describe('without schema', () => {
      it('should convert to string', () => {
        renderer.render(cellEl, 123);
        expect(cellEl.textContent).toBe('123');
      });

      it('should not add number class', () => {
        renderer.render(cellEl, 123);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
      });

      it('should still handle null', () => {
        renderer.render(cellEl, null);
        expect(cellEl.textContent).toBe('null');
        expect(cellEl.classList.contains('dt-cell--null')).toBe(true);
      });
    });

    describe('custom class prefix', () => {
      it('should use custom prefix for null class', () => {
        const customRenderer = new CellRenderer({ classPrefix: 'my-table' });
        renderer = customRenderer;
        renderer.render(cellEl, null, schema);
        expect(cellEl.classList.contains('my-table-cell--null')).toBe(true);
      });

      it('should use custom prefix for number class', () => {
        const customRenderer = new CellRenderer({ classPrefix: 'my-table' });
        customRenderer.render(cellEl, 123, schema);
        expect(cellEl.classList.contains('my-table-cell--number')).toBe(true);
      });
    });

    describe('class toggling', () => {
      it('should remove null class when rendering non-null', () => {
        cellEl.classList.add('dt-cell--null');
        renderer.render(cellEl, 123, schema);
        expect(cellEl.classList.contains('dt-cell--null')).toBe(false);
      });

      it('should remove number class when rendering null', () => {
        cellEl.classList.add('dt-cell--number');
        renderer.render(cellEl, null, schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
      });

      it('should remove number class when rendering non-numeric', () => {
        cellEl.classList.add('dt-cell--number');
        schema.type = 'string';
        renderer.render(cellEl, 'hello', schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
      });
    });

    describe('tooltip (title attribute)', () => {
      it('should set title attribute with formatted value', () => {
        renderer.render(cellEl, 'Hello World', schema);
        expect(cellEl.title).toBe('Hello World');
      });

      it('should set title for numbers with formatting', () => {
        renderer.render(cellEl, 1234567, schema);
        expect(cellEl.title).toMatch(/1.?234.?567/);
      });

      it('should set empty title for null values', () => {
        renderer.render(cellEl, null, schema);
        expect(cellEl.title).toBe('');
      });

      it('should set empty title for undefined values', () => {
        renderer.render(cellEl, undefined, schema);
        expect(cellEl.title).toBe('');
      });

      it('should update title when value changes', () => {
        renderer.render(cellEl, 'First', schema);
        expect(cellEl.title).toBe('First');

        renderer.render(cellEl, 'Second', schema);
        expect(cellEl.title).toBe('Second');
      });

      it('should clear title when changing from value to null', () => {
        renderer.render(cellEl, 'Some text', schema);
        expect(cellEl.title).toBe('Some text');

        renderer.render(cellEl, null, schema);
        expect(cellEl.title).toBe('');
      });

      it('should set title for long strings', () => {
        const longText = 'This is a very long string that would be truncated in the cell display but should show fully in the tooltip';
        schema.type = 'string';
        renderer.render(cellEl, longText, schema);
        expect(cellEl.title).toBe(longText);
      });
    });
  });

  describe('locale support', () => {
    it('should accept locale option', () => {
      const options: CellOptions = { locale: 'en-US' };
      const usRenderer = new CellRenderer(options);

      const result = usRenderer.formatValue(1234.5, 'float');
      // US locale uses comma for thousands and period for decimal
      expect(result).toMatch(/1.?234/);
    });
  });
});
