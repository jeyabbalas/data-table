/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CellRenderer, isInspectableColumn, type CellOptions } from '@/table/Cell';
import type { ColumnSchema } from '@/core/types';
import { outlinedColumnType } from '@/nested/typeOutline';

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
        const result = renderer.formatValue(123456, 'integer');
        // Locale-specific, but should contain separators (using value < 1e6)
        expect(result).toMatch(/123.?456/);
      });

      it('should handle bigint', () => {
        const result = renderer.formatValue(BigInt(123456), 'integer');
        expect(result).toMatch(/123.?456/);
      });

      it('should use scientific notation for large numbers', () => {
        const result = renderer.formatValue(1234567, 'integer');
        // Values >= 1e6 should use scientific notation
        expect(result).toBe('1.23e+6');
      });

      it('should use scientific notation for large bigint', () => {
        const result = renderer.formatValue(BigInt(1234567890), 'integer');
        expect(result).toBe('1.23e+9');
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

      it('should trim every trailing zero from the milliseconds', () => {
        const at = (ms: string) => Date.parse(`2020-01-01T00:00:16.${ms}Z`);
        expect(renderer.formatValue(at('000'), 'timestamp')).toBe('2020-01-01 00:00:16');
        expect(renderer.formatValue(at('100'), 'timestamp')).toBe('2020-01-01 00:00:16.1');
        expect(renderer.formatValue(at('120'), 'timestamp')).toBe('2020-01-01 00:00:16.12');
        expect(renderer.formatValue(at('123'), 'timestamp')).toBe('2020-01-01 00:00:16.123');
        expect(renderer.formatValue(at('005'), 'timestamp')).toBe('2020-01-01 00:00:16.005');
      });

      it('should trim trailing zeros from a timestamp that carries an offset', () => {
        expect(renderer.formatValue('2020-01-01T00:00:16.000+00:00', 'timestamp')).toBe(
          '2020-01-01 00:00:16 +00:00',
        );
        expect(renderer.formatValue('2020-01-01T00:00:16.100+00:00', 'timestamp')).toBe(
          '2020-01-01 00:00:16.1 +00:00',
        );
      });
    });

    describe('time type', () => {
      it('should convert to string', () => {
        expect(renderer.formatValue('10:30:00', 'time')).toBe('10:30:00');
      });
    });

    describe('interval type', () => {
      it('should format days in compact form', () => {
        expect(renderer.formatValue('1 day', 'interval')).toBe('1d');
        expect(renderer.formatValue('5 days', 'interval')).toBe('5d');
      });

      it('should format years, months, days', () => {
        expect(renderer.formatValue('1 year 2 months 3 days', 'interval')).toBe('1y 2mo 3d');
      });

      it('should format time components', () => {
        expect(renderer.formatValue('04:05:06', 'interval')).toBe('4h 5m 6s');
      });

      it('should format full interval', () => {
        expect(renderer.formatValue('1 year 2 months 3 days 04:05:06', 'interval')).toBe(
          '1y 2mo 3d 4h 5m 6s',
        );
      });

      it('should return 0s for zero interval', () => {
        expect(renderer.formatValue('00:00:00', 'interval')).toBe('0s');
      });

      it('should skip zero components', () => {
        expect(renderer.formatValue('2 months', 'interval')).toBe('2mo');
        expect(renderer.formatValue('01:00:00', 'interval')).toBe('1h');
      });

      it('should handle Arrow MonthDayNano interval objects', () => {
        expect(renderer.formatValue({ months: 0, days: 1, nanoseconds: 0 }, 'interval')).toBe('1d');
        expect(
          renderer.formatValue({ months: 0, days: 0, nanoseconds: 3_600_000_000_000 }, 'interval'),
        ).toBe('1h');
        expect(
          renderer.formatValue(
            { months: 14, days: 3, nanoseconds: 14_706_000_000_000 },
            'interval',
          ),
        ).toBe('1y 2mo 3d 4h 5m 6s');
      });

      it('should handle zero interval object', () => {
        expect(renderer.formatValue({ months: 0, days: 0, nanoseconds: 0 }, 'interval')).toBe('0s');
      });

      it('should handle negative interval objects', () => {
        expect(renderer.formatValue({ months: 0, days: -1, nanoseconds: 0 }, 'interval')).toBe(
          '-1d',
        );
        expect(
          renderer.formatValue({ months: 0, days: 0, nanoseconds: -3_600_000_000_000 }, 'interval'),
        ).toBe('-1h');
        expect(
          renderer.formatValue(
            { months: -14, days: -3, nanoseconds: -14_706_000_000_000 },
            'interval',
          ),
        ).toBe('-1y 2mo 3d 4h 5m 6s');
      });

      it('should handle fractional seconds from interval objects', () => {
        expect(
          renderer.formatValue({ months: 0, days: 0, nanoseconds: 1_500_000_000 }, 'interval'),
        ).toBe('1.5s');
        expect(
          renderer.formatValue({ months: 0, days: 0, nanoseconds: 500_000_000 }, 'interval'),
        ).toBe('0.5s');
        expect(renderer.formatValue({ months: 0, days: 0, micros: 1_500_000 }, 'interval')).toBe(
          '1.5s',
        );
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

    describe('nested values', () => {
      const nested: ColumnSchema = {
        name: 'point',
        type: 'nested',
        nullable: true,
        originalType: 'STRUCT(x DOUBLE, tier VARCHAR)',
      };

      it("shows DuckDB's text as it is, as text, with a title", () => {
        renderer.render(cellEl, "{'x': 1.25, 'tier': bronze}", nested);
        expect(cellEl.textContent).toBe("{'x': 1.25, 'tier': bronze}");
        expect(cellEl.title).toBe("{'x': 1.25, 'tier': bronze}");
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
        expect(cellEl.classList.contains('dt-cell--null')).toBe(false);
      });

      it('clears the number class a reused cell carried', () => {
        renderer.render(cellEl, 42, schema);
        expect(cellEl.classList.contains('dt-cell--number')).toBe(true);
        renderer.render(cellEl, '[1, 2, 3]', { ...nested, originalType: 'INTEGER[]' });
        expect(cellEl.textContent).toBe('[1, 2, 3]');
        expect(cellEl.classList.contains('dt-cell--number')).toBe(false);
      });

      it('shows NULL as null', () => {
        renderer.render(cellEl, null, nested);
        expect(cellEl.textContent).toBe('null');
        expect(cellEl.classList.contains('dt-cell--null')).toBe(true);
      });
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
        renderer.render(cellEl, 123456, schema);
        // Using value < 1e6 to test locale separators
        expect(cellEl.textContent).toMatch(/123.?456/);
      });

      it('should use scientific notation for large values', () => {
        renderer.render(cellEl, 1234567, schema);
        // Values >= 1e6 should use scientific notation
        expect(cellEl.textContent).toBe('1.23e+6');
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
        renderer.render(cellEl, 123456, schema);
        // Using value < 1e6 to test locale separator formatting in title
        expect(cellEl.title).toMatch(/123.?456/);
      });

      it('should set title for large numbers with scientific notation', () => {
        renderer.render(cellEl, 1234567, schema);
        // Values >= 1e6 should use scientific notation in title
        expect(cellEl.title).toBe('1.23e+6');
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
        const longText =
          'This is a very long string that would be truncated in the cell display but should show fully in the tooltip';
        schema.type = 'string';
        renderer.render(cellEl, longText, schema);
        expect(cellEl.title).toBe(longText);
      });
    });
  });

  describe('inspectable cells (the value inspector)', () => {
    const nested: ColumnSchema = {
      name: 'tags',
      type: 'nested',
      nullable: true,
      originalType: 'VARCHAR[]',
    };
    const json: ColumnSchema = {
      name: 'doc',
      type: 'string',
      nullable: true,
      originalType: 'JSON',
    };
    const text: ColumnSchema = {
      name: 'name',
      type: 'string',
      nullable: true,
      originalType: 'VARCHAR',
    };

    it('takes nested and JSON columns, and nothing else', () => {
      expect(isInspectableColumn(nested)).toBe(true);
      expect(
        isInspectableColumn({ ...nested, originalType: 'STRUCT(x DOUBLE, tier VARCHAR)' }),
      ).toBe(true);
      expect(isInspectableColumn({ ...nested, originalType: 'VARIANT' })).toBe(true);
      expect(isInspectableColumn(json)).toBe(true);
      expect(isInspectableColumn(text)).toBe(false);
      expect(
        isInspectableColumn({
          name: 'n',
          type: 'integer',
          nullable: false,
          originalType: 'INTEGER',
        }),
      ).toBe(false);
      expect(isInspectableColumn(undefined)).toBe(false);
    });

    it('takes exactly the columns whose header shows a type outline, schemas built by hand included', () => {
      const answers: string[] = [];
      for (const type of ['nested', 'string', 'integer'] as const) {
        for (const originalType of ['VARCHAR[]', 'JSON', 'VARCHAR', 'INTEGER', 'STRUCT(a', '']) {
          const column: ColumnSchema = { name: 'c', type, nullable: true, originalType };
          if (isInspectableColumn(column) !== (outlinedColumnType(column) !== null)) {
            answers.push(`${type} ${originalType}`);
          }
        }
      }
      expect(answers).toEqual([]);
    });

    it('marks a cell with the class, aria-haspopup and aria-keyshortcuts, and unmarks it', () => {
      const cellEl = document.createElement('div');
      renderer.setInspectable(cellEl, true);
      expect(cellEl.classList.contains('dt-cell--inspectable')).toBe(true);
      expect(cellEl.getAttribute('aria-haspopup')).toBe('dialog');
      expect(cellEl.getAttribute('aria-keyshortcuts')).toBe('F2');

      renderer.setInspectable(cellEl, false);
      expect(cellEl.classList.contains('dt-cell--inspectable')).toBe(false);
      expect(cellEl.hasAttribute('aria-haspopup')).toBe(false);
      expect(cellEl.hasAttribute('aria-keyshortcuts')).toBe(false);
    });

    it('writes nothing when nothing changes', () => {
      const cellEl = document.createElement('div');
      renderer.setInspectable(cellEl, true);
      const setAttribute = vi.spyOn(cellEl, 'setAttribute');
      const removeAttribute = vi.spyOn(cellEl, 'removeAttribute');
      renderer.setInspectable(cellEl, true);
      expect(setAttribute).not.toHaveBeenCalled();

      renderer.setInspectable(cellEl, false);
      renderer.setInspectable(cellEl, false);
      expect(removeAttribute).toHaveBeenCalledTimes(2); // once per attribute, once only
    });

    it('uses the class prefix', () => {
      const cellEl = document.createElement('div');
      new CellRenderer({ classPrefix: 'custom' }).setInspectable(cellEl, true);
      expect(cellEl.className).toBe('custom-cell--inspectable');
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
