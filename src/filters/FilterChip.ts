/**
 * FilterChip - Visual representation of a single active filter
 *
 * Renders a pill-shaped chip showing the filter's column name and
 * a human-readable description, with a remove button.
 */

import { type Strings, defaultStrings } from '../core/Strings';
import type { Filter } from './FilterTypes';

/**
 * Options for FilterChip
 */
export interface FilterChipOptions {
  classPrefix?: string;
  /** Called when the chip body is clicked (for editing). Used by raw-sql filter chips. */
  onEdit?: () => void;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings;
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
 * Format a filter into a human-readable description.
 *
 * @param filter - The filter to format.
 * @param messages - Resolved i18n strings. Defaults to English.
 * @returns Object with column name and description text.
 */
export function formatFilter(
  filter: Filter,
  messages: Strings = defaultStrings,
): { column: string; description: string } {
  const d = messages.filters.chipDescriptions;
  switch (filter.type) {
    case 'range': {
      const minIsOpen = typeof filter.min === 'number' && !Number.isFinite(filter.min);
      const maxIsOpen = typeof filter.max === 'number' && !Number.isFinite(filter.max);

      if (minIsOpen && maxIsOpen) {
        return { column: filter.column, description: d.anyValue };
      }
      if (minIsOpen) {
        const op = filter.maxInclusive ? '\u2264' : '<';
        return { column: filter.column, description: `${op} ${formatDisplayValue(filter.max)}` };
      }
      if (maxIsOpen) {
        const op = filter.minExclusive ? '>' : '\u2265';
        return { column: filter.column, description: `${op} ${formatDisplayValue(filter.min)}` };
      }
      const min = formatDisplayValue(filter.min);
      const max = formatDisplayValue(filter.max);
      return { column: filter.column, description: `${min} ${d.rangeSeparator} ${max}` };
    }
    case 'point': {
      return {
        column: filter.column,
        description: `${d.pointPrefix} ${formatDisplayValue(filter.value)}`,
      };
    }
    case 'set': {
      const maxShow = 3;
      const shown = filter.values.slice(0, maxShow).map(formatDisplayValue);
      const rest = filter.values.length - maxShow;
      const list = rest > 0 ? `${shown.join(', ')}, ${d.valueListMore(rest)}` : shown.join(', ');
      return { column: filter.column, description: d.inSet(list, !!filter.includeNull) };
    }
    case 'not-set': {
      const maxShow = 3;
      const shown = filter.values.slice(0, maxShow).map(formatDisplayValue);
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
      const quote = filter.mode === 'regex' ? `/${filter.pattern}/` : `"${filter.pattern}"`;
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
  private readonly onEdit?: () => void;
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
    const { column, description } = formatFilter(this.filter, this.messages);

    // Container span
    const chip = document.createElement('span');
    chip.className = `${this.prefix}-filter-chip`;
    chip.title = `${column} ${description}`;

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
