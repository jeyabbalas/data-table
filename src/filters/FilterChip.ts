/**
 * FilterChip - Visual representation of a single active filter
 *
 * Renders a pill-shaped chip showing the filter's column name and
 * a human-readable description, with a remove button.
 */

import type { Filter } from './FilterTypes';

/**
 * Options for FilterChip
 */
export interface FilterChipOptions {
  classPrefix?: string;
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
    if (Number.isInteger(value) && Math.abs(value) < 1e15) {
      return value.toLocaleString();
    }
    // For floats, limit decimal places
    if (Math.abs(value) >= 1e6 || (Math.abs(value) < 0.01 && value !== 0)) {
      return value.toExponential(2);
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  return String(value);
}

/**
 * Format a filter into a human-readable description
 *
 * @returns Object with column name and description text
 */
export function formatFilter(filter: Filter): { column: string; description: string } {
  switch (filter.type) {
    case 'range': {
      const minIsOpen = typeof filter.min === 'number' && !Number.isFinite(filter.min);
      const maxIsOpen = typeof filter.max === 'number' && !Number.isFinite(filter.max);

      if (minIsOpen && maxIsOpen) {
        return { column: filter.column, description: 'any value' };
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
      return { column: filter.column, description: `${min} \u2013 ${max}` };
    }
    case 'point': {
      return { column: filter.column, description: `= ${formatDisplayValue(filter.value)}` };
    }
    case 'set': {
      const maxShow = 3;
      const shown = filter.values.slice(0, maxShow).map((v) => String(v));
      const rest = filter.values.length - maxShow;
      const list =
        rest > 0 ? `${shown.join(', ')}, +${rest} more` : shown.join(', ');
      const nullSuffix = filter.includeNull ? ' or null' : '';
      return { column: filter.column, description: `in {${list}}${nullSuffix}` };
    }
    case 'not-set': {
      const maxShow = 3;
      const shown = filter.values.slice(0, maxShow).map((v) => String(v));
      const rest = filter.values.length - maxShow;
      const list =
        rest > 0 ? `${shown.join(', ')}, +${rest} more` : shown.join(', ');
      return { column: filter.column, description: `not in {${list}}` };
    }
    case 'null': {
      return { column: filter.column, description: 'is null' };
    }
    case 'not-null': {
      return { column: filter.column, description: 'is not null' };
    }
    case 'pattern': {
      const modeLabels: Record<string, string> = {
        contains: 'contains',
        starts: 'starts with',
        ends: 'ends with',
        regex: 'matches',
      };
      const quote =
        filter.mode === 'regex' ? `/${filter.pattern}/` : `"${filter.pattern}"`;
      return {
        column: filter.column,
        description: `${modeLabels[filter.mode]} ${quote}`,
      };
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

  constructor(
    private filter: Filter,
    private onRemove: () => void,
    options: FilterChipOptions = {}
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.element = this.createElement();
  }

  private createElement(): HTMLElement {
    const { column, description } = formatFilter(this.filter);

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

    label.appendChild(colEl);
    label.appendChild(detailEl);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = `${this.prefix}-filter-chip-remove`;
    removeBtn.setAttribute('aria-label', `Remove filter for ${column}`);
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
