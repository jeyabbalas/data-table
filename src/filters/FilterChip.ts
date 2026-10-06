/**
 * FilterChip - Visual representation of a single active filter
 *
 * Renders a pill-shaped chip showing the filter's column name and
 * a human-readable description, with a remove button.
 */

import { graphemeSegmenter } from '../core/graphemes';
import { type Strings, defaultStrings } from '../core/Strings';
import type { Filter } from './FilterTypes';

/**
 * Options for FilterChip
 */
export interface FilterChipOptions {
  classPrefix?: string | undefined;
  /** Called when the chip body is clicked (for editing). Used by raw-sql filter chips. */
  onEdit?: (() => void) | undefined;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings | undefined;
}

/**
 * Format a value for display in a filter chip
 */
export function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (value instanceof Date) {
    return value.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  if (typeof value === 'number') {
    if (value === 0) return '0';
    const abs = Math.abs(value);
    // Scientific notation first (same thresholds as Cell.ts / StatsFormatters.ts / Histogram.ts)
    if (abs >= 1e6 || abs < 0.01) {
      return value.toExponential(2);
    }
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  return String(value);
}

/**
 * Truncate a SQL string with ellipsis if it exceeds maxLen.
 */
function truncateSQL(sql: string, maxLen: number): string {
  if (sql.length <= maxLen) return sql;
  return sql.slice(0, maxLen - 1) + '\u2026';
}

/**
 * Most characters of one value a chip shows. A nested value's text runs to
 * 1,000 characters, and so can the value of an exact filter on it; the chip
 * is at most 280px wide and clips its text there anyway. Cutting each value
 * well past that width changes nothing on screen but keeps the chip's text,
 * which a screen reader reads out, short. The chip's `title` keeps every
 * value whole.
 */
export const CHIP_VALUE_MAX_LENGTH = 60;

/**
 * Cut `text` to at most `max` characters, the last of them `…`. Characters
 * are graphemes where the runtime has `Intl.Segmenter`, so an emoji sequence
 * or a letter with its accent is never split, else code points.
 */
function shortenText(text: string, max: number): string {
  // A string's UTF-16 length is never below its count of characters.
  if (text.length <= max) return text;
  const segmenter = graphemeSegmenter();
  // Read one character past `max`, to learn whether there is more to cut.
  const head: string[] = [];
  if (segmenter) {
    for (const { segment } of segmenter.segment(text)) {
      head.push(segment);
      if (head.length > max) break;
    }
  } else {
    for (const point of text) {
      head.push(point);
      if (head.length > max) break;
    }
  }
  if (head.length <= max) return text;
  return head.slice(0, max - 1).join('') + '\u2026';
}

/**
 * Format a filter into a human-readable description.
 *
 * @param filter - The filter to format.
 * @param messages - Resolved i18n strings. Defaults to English.
 * @param options - `maxValueLength` cuts each value, and a pattern, to that
 *   many characters with `…`. Values are whole by default.
 * @returns Object with column name and description text.
 */
export function formatFilter(
  filter: Filter,
  messages: Strings = defaultStrings,
  options: { maxValueLength?: number } = {},
): { column: string; description: string } {
  const d = messages.filters.chipDescriptions;
  const maxLength = options.maxValueLength;
  const fit = (text: string): string =>
    maxLength === undefined ? text : shortenText(text, maxLength);
  const show = (value: unknown): string => fit(formatDisplayValue(value));
  switch (filter.type) {
    case 'range': {
      const minIsOpen = typeof filter.min === 'number' && !Number.isFinite(filter.min);
      const maxIsOpen = typeof filter.max === 'number' && !Number.isFinite(filter.max);

      if (minIsOpen && maxIsOpen) {
        return { column: filter.column, description: d.anyValue };
      }
      if (minIsOpen) {
        const op = filter.maxInclusive ? '\u2264' : '<';
        return { column: filter.column, description: `${op} ${show(filter.max)}` };
      }
      if (maxIsOpen) {
        const op = filter.minExclusive ? '>' : '\u2265';
        return { column: filter.column, description: `${op} ${show(filter.min)}` };
      }
      const min = show(filter.min);
      const max = show(filter.max);
      return { column: filter.column, description: `${min} ${d.rangeSeparator} ${max}` };
    }
    case 'point': {
      return {
        column: filter.column,
        description: `${d.pointPrefix} ${show(filter.value)}`,
      };
    }
    case 'set': {
      const maxShow = 3;
      const shown = filter.values.slice(0, maxShow).map(show);
      const rest = filter.values.length - maxShow;
      const list = rest > 0 ? `${shown.join(', ')}, ${d.valueListMore(rest)}` : shown.join(', ');
      return { column: filter.column, description: d.inSet(list, !!filter.includeNull) };
    }
    case 'not-set': {
      const maxShow = 3;
      const shown = filter.values.slice(0, maxShow).map(show);
      const rest = filter.values.length - maxShow;
      const list = rest > 0 ? `${shown.join(', ')}, ${d.valueListMore(rest)}` : shown.join(', ');
      return { column: filter.column, description: d.notInSet(list, !!filter.includeNull) };
    }
    case 'null': {
      return { column: filter.column, description: d.isNull };
    }
    case 'not-null': {
      return { column: filter.column, description: d.isNotNull };
    }
    case 'pattern': {
      const modeLabel =
        filter.mode === 'starts'
          ? d.patternModes.startsWith
          : filter.mode === 'ends'
            ? d.patternModes.endsWith
            : filter.mode === 'regex'
              ? d.patternModes.regex
              : d.patternModes.contains;
      const pattern = fit(filter.pattern);
      const quote = filter.mode === 'regex' ? `/${pattern}/` : `"${pattern}"`;
      return {
        column: filter.column,
        description: `${modeLabel} ${quote}`,
      };
    }
    case 'raw-sql': {
      const display = filter.label || truncateSQL(filter.sql, 40);
      return { column: d.sqlColumn, description: display };
    }
  }
}

/**
 * FilterChip renders a single filter as a removable pill-shaped chip.
 */
export class FilterChip {
  private element: HTMLElement;
  private destroyed = false;
  private readonly prefix: string;
  private readonly onEdit?: (() => void) | undefined;
  private readonly messages: Strings;

  constructor(
    private filter: Filter,
    private onRemove: () => void,
    options: FilterChipOptions = {},
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.onEdit = options.onEdit;
    this.messages = options.messages ?? defaultStrings;
    this.element = this.createElement();
  }

  private createElement(): HTMLElement {
    // The chip shows each value cut short; its title keeps them whole. The
    // remove button is named by the column alone, however long the value.
    const { column, description } = formatFilter(this.filter, this.messages, {
      maxValueLength: CHIP_VALUE_MAX_LENGTH,
    });
    const fullDescription = formatFilter(this.filter, this.messages).description;

    // Container span
    const chip = document.createElement('span');
    chip.className = `${this.prefix}-filter-chip`;
    chip.title = `${column} ${fullDescription}`;

    // Label area
    const label = document.createElement('span');
    label.className = `${this.prefix}-filter-chip-label`;

    const colEl = document.createElement('strong');
    colEl.className = `${this.prefix}-filter-chip-column`;
    colEl.textContent = column;

    const detailEl = document.createElement('span');
    detailEl.className = `${this.prefix}-filter-chip-detail`;
    detailEl.textContent = ` ${description}`;

    // For raw-sql filters: add code icon prefix and SQL-specific styling
    if (this.filter.type === 'raw-sql') {
      label.classList.add(`${this.prefix}-filter-chip-label--sql`);

      const icon = document.createElement('span');
      icon.className = `${this.prefix}-filter-chip-sql-icon`;
      icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 2L1 6L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 2L11 6L8 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
      label.appendChild(icon);
    }

    label.appendChild(colEl);
    label.appendChild(detailEl);

    // Clickable label for editing (used by raw-sql chips)
    if (this.onEdit) {
      label.classList.add(`${this.prefix}-filter-chip-label--clickable`);
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.destroyed) {
          this.onEdit!();
        }
      });
    }

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = `${this.prefix}-filter-chip-remove`;
    removeBtn.setAttribute('aria-label', this.messages.filters.ariaLabels.removeFilter(column));
    removeBtn.type = 'button';
    removeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.destroyed) {
        this.onRemove();
      }
    });

    chip.appendChild(label);
    chip.appendChild(removeBtn);

    return chip;
  }

  /**
   * Get the chip's DOM element
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Get the filter this chip represents
   */
  getFilter(): Filter {
    return this.filter;
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
