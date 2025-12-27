/**
 * CellRenderer - Handles cell value formatting and rendering
 *
 * Provides type-aware formatting for cell values and manages
 * cell element updates with appropriate CSS classes.
 */

import type { ColumnSchema, DataType } from '../core/types';

/**
 * Options for configuring the CellRenderer
 */
export interface CellOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
  /** Locale for number/date formatting (default: undefined = user's locale) */
  locale?: string;
}

/**
 * CellRenderer handles formatting and rendering of cell values.
 *
 * @example
 * ```typescript
 * const renderer = new CellRenderer({ classPrefix: 'dt' });
 *
 * // Render a cell
 * renderer.render(cellElement, 1234567, { type: 'integer', name: 'count', nullable: false, originalType: 'INTEGER' });
 *
 * // Just format a value
 * const formatted = renderer.formatValue(1234567, 'integer');
 * // Returns: "1,234,567"
 * ```
 */
export class CellRenderer {
  private readonly classPrefix: string;
  private readonly locale: string | undefined;

  constructor(options: CellOptions = {}) {
    this.classPrefix = options.classPrefix ?? 'dt';
    this.locale = options.locale;
  }

  /**
   * Render a value into a cell element with appropriate formatting and styling.
   *
   * @param cellEl - The cell DOM element to update
   * @param value - The value to render
   * @param schema - Optional column schema for type-aware formatting
   */
  render(cellEl: HTMLElement, value: unknown, schema?: ColumnSchema): void {
    const nullClass = `${this.classPrefix}-cell--null`;
    const numberClass = `${this.classPrefix}-cell--number`;

    if (value === null || value === undefined) {
      cellEl.textContent = 'null';
      cellEl.title = '';  // No tooltip for null values
      cellEl.classList.add(nullClass);
      cellEl.classList.remove(numberClass);
    } else {
      const formatted = this.formatValue(value, schema?.type);
      cellEl.textContent = formatted;
      cellEl.title = formatted;  // Tooltip shows full text on hover
      cellEl.classList.remove(nullClass);

      // Apply number class for right-alignment
      if (schema && ['integer', 'float', 'decimal'].includes(schema.type)) {
        cellEl.classList.add(numberClass);
      } else {
        cellEl.classList.remove(numberClass);
      }
    }
  }

  /**
   * Format a value to string based on its data type.
   *
   * @param value - The value to format
   * @param type - The data type (optional)
   * @returns Formatted string representation
   */
  formatValue(value: unknown, type?: DataType): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (!type) {
      return String(value);
    }

    switch (type) {
      case 'integer':
        return this.formatInteger(value);

      case 'float':
      case 'decimal':
        return this.formatDecimal(value);

      case 'boolean':
        return value ? 'true' : 'false';

      case 'date':
        return this.formatDate(value);

      case 'timestamp':
        return this.formatTimestamp(value);

      case 'time':
        return String(value);

      case 'interval':
        return String(value);

      case 'string':
      default:
        return String(value);
    }
  }

  /**
   * Format an integer value with locale-aware thousand separators.
   */
  private formatInteger(value: unknown): string {
    if (typeof value === 'number') {
      return value.toLocaleString(this.locale);
    }
    if (typeof value === 'bigint') {
      return value.toLocaleString(this.locale);
    }
    return String(value);
  }

  /**
   * Format a decimal/float value with up to 4 decimal places.
   * Trailing zeros are removed.
   */
  private formatDecimal(value: unknown): string {
    if (typeof value === 'number') {
      return value.toLocaleString(this.locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    }
    return String(value);
  }

  /**
   * Format a date value as ISO date string (YYYY-MM-DD).
   */
  private formatDate(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    // DuckDB may return date as string in ISO format
    return String(value);
  }

  /**
   * Format a timestamp value using locale-aware formatting.
   */
  private formatTimestamp(value: unknown): string {
    if (value instanceof Date) {
      return value.toLocaleString(this.locale);
    }
    // Try to parse string as date
    if (typeof value === 'string') {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString(this.locale);
        }
      } catch {
        // Fall through to string
      }
    }
    return String(value);
  }
}
