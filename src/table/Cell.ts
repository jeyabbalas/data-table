/**
 * CellRenderer - Handles cell value formatting and rendering
 *
 * Provides type-aware formatting for cell values and manages
 * cell element updates with appropriate CSS classes.
 */

import type { ColumnSchema, DataType } from '../core/types';

/**
 * Format a number with scientific notation for extreme values.
 * Same thresholds as histogram: |value| >= 1e6 or |value| < 0.01
 *
 * @returns Formatted string, or null to signal standard formatting should be used
 */
function formatNumberWithScientific(value: number): string | null {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  if (value === 0) {
    return null; // Use standard formatting for zero
  }

  const abs = Math.abs(value);

  // Scientific notation for very large numbers
  if (abs >= 1e6) {
    return value.toExponential(2);
  }

  // Scientific notation for very small numbers
  if (abs < 0.01) {
    return value.toExponential(2);
  }

  return null; // Signal to use standard formatting
}

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
      const formatted = this.formatValue(value, schema?.type, schema?.originalType);
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
   * @param originalType - The original DuckDB type (optional, used for TIMESTAMPTZ detection)
   * @returns Formatted string representation
   */
  formatValue(value: unknown, type?: DataType, originalType?: string): string {
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
        return this.formatTimestamp(value, originalType);

      case 'time':
        return this.formatTimeValue(value);

      case 'interval':
        return this.formatInterval(value);

      case 'string':
      default:
        return String(value);
    }
  }

  /**
   * Format an integer value with locale-aware thousand separators.
   * Uses scientific notation for extreme values (|value| >= 1e6).
   */
  private formatInteger(value: unknown): string {
    if (typeof value === 'number') {
      // Check if scientific notation is needed
      const scientific = formatNumberWithScientific(value);
      if (scientific !== null) {
        return scientific;
      }
      return value.toLocaleString(this.locale);
    }
    if (typeof value === 'bigint') {
      // BigInt: check magnitude for scientific notation
      const num = Number(value);
      if (Number.isFinite(num)) {
        const scientific = formatNumberWithScientific(num);
        if (scientific !== null) {
          return scientific;
        }
      }
      return value.toLocaleString(this.locale);
    }
    return String(value);
  }

  /**
   * Format a decimal/float value with up to 4 decimal places.
   * Trailing zeros are removed.
   * Uses scientific notation for extreme values (|value| >= 1e6 or |value| < 0.01).
   */
  private formatDecimal(value: unknown): string {
    if (typeof value === 'number') {
      // Check if scientific notation is needed
      const scientific = formatNumberWithScientific(value);
      if (scientific !== null) {
        return scientific;
      }
      return value.toLocaleString(this.locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    }
    return String(value);
  }

  /**
   * Format a date value as ISO date string (YYYY-MM-DD).
   * Handles: Date objects, ISO strings, and BigInt/number/string (milliseconds from DuckDB-WASM).
   */
  private formatDate(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    // DuckDB-WASM returns DATE as milliseconds since epoch (via row.toJSON())
    if (typeof value === 'bigint' || typeof value === 'number') {
      const date = new Date(Number(value)); // Value IS milliseconds
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      return String(value);
    }
    // Handle string values
    if (typeof value === 'string') {
      // Check if it's a numeric string (milliseconds since epoch)
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        const date = new Date(Number(value)); // Value IS milliseconds
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
      // Already formatted string (ISO date or other format)
      return value;
    }
    return String(value);
  }

  /**
   * Format a timestamp value in consistent UTC format.
   * Output: "2025-12-30 14:30:45" or "2025-12-30 14:30:45.123" (trailing zeros removed)
   * For TIMESTAMPTZ: "2025-12-30 14:30:45 +00:00" (with timezone offset)
   * Handles: Date objects, ISO strings, and BigInt/number/string (milliseconds from DuckDB-WASM).
   */
  private formatTimestamp(value: unknown, originalType?: string): string {
    const isTimestampTz = originalType?.toUpperCase().includes('TIMESTAMPTZ') ||
      originalType?.toUpperCase().includes('WITH TIME ZONE');

    // Helper to format the result with optional timezone
    const formatResult = (date: Date): string => {
      const formatted = this.formatTimestampCore(date);
      if (isTimestampTz) {
        return `${formatted} +00:00`;
      }
      return formatted;
    };

    // DuckDB-WASM returns TIMESTAMP as milliseconds since epoch (via row.toJSON())
    if (typeof value === 'bigint' || typeof value === 'number') {
      const date = new Date(Number(value)); // Value IS milliseconds
      if (!isNaN(date.getTime())) {
        return formatResult(date);
      }
      return String(value);
    }

    // Handle string values
    if (typeof value === 'string') {
      // Check if it's a numeric string (milliseconds since epoch)
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        const date = new Date(Number(value)); // Value IS milliseconds
        if (!isNaN(date.getTime())) {
          return formatResult(date);
        }
      }

      // Check if string value has timezone offset: 2025-12-30T14:30:45+05:00
      const tzMatch = value.match(/^(.+?)([+-]\d{2}:?\d{2})$/);
      if (tzMatch) {
        const [, , offset] = tzMatch;
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          const formatted = this.formatTimestampCore(parsed);
          const normalizedOffset = offset.includes(':') ? offset :
            `${offset.slice(0, 3)}:${offset.slice(3)}`;
          return `${formatted} ${normalizedOffset}`;
        }
      }

      // Try to parse as ISO date string
      try {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return formatResult(parsed);
        }
      } catch {
        // Fall through
      }
    }

    // Handle Date objects
    if (value instanceof Date) {
      return formatResult(value);
    }

    return String(value);
  }

  /**
   * Core timestamp formatting logic - produces "2025-12-30 14:30:45.123" format
   */
  private formatTimestampCore(date: Date): string {
    // Use ISO format: "2025-12-30T14:30:45.123Z"
    const iso = date.toISOString();
    // Replace T with space, remove Z: "2025-12-30 14:30:45.123"
    let formatted = iso.replace('T', ' ').replace('Z', '');
    // Remove trailing zeros from milliseconds
    // ".120" → ".12", ".100" → ".1", ".000" → ""
    formatted = formatted.replace(/(\.\d*)0+$/, '$1').replace(/\.$/, '');
    return formatted;
  }

  /**
   * Format an INTERVAL value in compact human-readable format.
   * DuckDB formats: "1 year 2 months 3 days 04:05:06", "2 days", "00:00:00"
   * Output: "1y 2mo 3d 4h 5m 6s", "2d", "0s"
   */
  private formatInterval(value: unknown): string {
    if (typeof value !== 'string') {
      return String(value);
    }

    const input = value.trim();
    if (!input) return '0s';

    const parts: string[] = [];

    // Parse year/month/day components
    const yearMatch = input.match(/(\d+)\s*years?/i);
    const monthMatch = input.match(/(\d+)\s*months?/i);
    const dayMatch = input.match(/(\d+)\s*days?/i);

    if (yearMatch) parts.push(`${parseInt(yearMatch[1], 10)}y`);
    if (monthMatch) parts.push(`${parseInt(monthMatch[1], 10)}mo`);
    if (dayMatch) parts.push(`${parseInt(dayMatch[1], 10)}d`);

    // Parse time component (HH:MM:SS or HH:MM:SS.ffffff)
    const timeMatch = input.match(/(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = parseInt(timeMatch[3], 10);
      const fraction = timeMatch[4];

      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      if (seconds > 0 || fraction) {
        if (fraction) {
          // Remove trailing zeros from fraction
          const trimmedFraction = fraction.replace(/0+$/, '');
          if (trimmedFraction) {
            parts.push(`${seconds}.${trimmedFraction}s`);
          } else {
            parts.push(`${seconds}s`);
          }
        } else {
          parts.push(`${seconds}s`);
        }
      }
    }

    // Return "0s" for zero interval
    return parts.length > 0 ? parts.join(' ') : '0s';
  }

  /**
   * Format a TIME value.
   * DuckDB returns TIME as "HH:MM:SS" or "HH:MM:SS.ffffff", or BigInt (microseconds since midnight).
   * Truncate microseconds to milliseconds and remove trailing zeros.
   * Examples: "14:30:45.100" → "14:30:45.1", "14:30:45.000" → "14:30:45"
   */
  private formatTimeValue(value: unknown): string {
    // DuckDB returns TIME as BigInt: microseconds since midnight
    if (typeof value === 'bigint' || typeof value === 'number') {
      const totalMicros = Number(value);
      const totalSeconds = Math.floor(totalMicros / 1_000_000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const micros = totalMicros % 1_000_000;

      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');

      if (micros > 0) {
        // Truncate to milliseconds (first 3 digits of microseconds) and remove trailing zeros
        const ms = Math.floor(micros / 1000);
        const frac = String(ms).padStart(3, '0').replace(/0+$/, '');
        if (frac) {
          return `${hh}:${mm}:${ss}.${frac}`;
        }
      }
      return `${hh}:${mm}:${ss}`;
    }

    if (typeof value === 'string') {
      // Match TIME format: HH:MM:SS or HH:MM:SS.ffffff
      const match = value.match(/^(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/);
      if (match) {
        const [, time, frac] = match;
        if (frac) {
          // Truncate to milliseconds (3 digits) and remove trailing zeros
          const truncated = frac.slice(0, 3).replace(/0+$/, '');
          if (truncated) {
            return `${time}.${truncated}`;
          }
        }
        // No fractional part or all zeros
        return time;
      }
    }
    return String(value);
  }
}
