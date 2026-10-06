/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import {
  CHIP_VALUE_MAX_LENGTH,
  formatFilter,
  formatDisplayValue,
  FilterChip,
} from '@/filters/FilterChip';
import type { Filter } from '@/filters/FilterTypes';

// =========================================
// formatDisplayValue Tests
// =========================================

describe('formatDisplayValue', () => {
  it('should format null', () => {
    expect(formatDisplayValue(null)).toBe('null');
  });

  it('should format undefined', () => {
    expect(formatDisplayValue(undefined)).toBe('null');
  });

  it('should format integers', () => {
    expect(formatDisplayValue(42)).toBe('42');
    expect(formatDisplayValue(1000)).toBe('1,000');
    expect(formatDisplayValue(0)).toBe('0');
    expect(formatDisplayValue(-5)).toBe('-5');
  });

  it('should format large numbers with scientific notation', () => {
    expect(formatDisplayValue(1e7)).toBe('1.00e+7');
    expect(formatDisplayValue(1e15)).toBe('1.00e+15');
    expect(formatDisplayValue(-5e8)).toBe('-5.00e+8');
  });

  it('should format scientific notation values consistently with stats/cells', () => {
    expect(formatDisplayValue(1.23e-60)).toBe('1.23e-60');
    expect(formatDisplayValue(9.87e60)).toBe('9.87e+60');
    expect(formatDisplayValue(6.02e23)).toBe('6.02e+23');
    expect(formatDisplayValue(1.38e-23)).toBe('1.38e-23');
  });

  it('should format zero as "0" not in scientific notation', () => {
    expect(formatDisplayValue(0)).toBe('0');
  });

  it('should format very small numbers with exponential notation', () => {
    // 0.001 < 0.01 threshold → exponential
    expect(formatDisplayValue(0.001)).toBe('1.00e-3');
    expect(formatDisplayValue(0.005)).toBe('5.00e-3');
    // 0.05 is >= 0.01 threshold → locale format
    expect(formatDisplayValue(0.05)).toBe('0.05');
  });

  it('should format floats with limited decimals', () => {
    const result = formatDisplayValue(3.14159);
    expect(result).toContain('3.14');
  });

  it('should format booleans', () => {
    expect(formatDisplayValue(true)).toBe('true');
    expect(formatDisplayValue(false)).toBe('false');
  });

  it('should format strings', () => {
    expect(formatDisplayValue('hello')).toBe('hello');
    expect(formatDisplayValue('')).toBe('');
  });

  it('should format Date objects', () => {
    // Use noon UTC to avoid timezone-related day shifts
    const d = new Date('2024-03-15T12:00:00.000Z');
    const result = formatDisplayValue(d);
    // Should contain month, day, year
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2024/);
  });
});

// =========================================
// formatFilter Tests
// =========================================

describe('formatFilter', () => {
  describe('range filter', () => {
    it('should format numeric range', () => {
      const filter: Filter = { type: 'range', column: 'age', min: 25, max: 50 };
      const result = formatFilter(filter);
      expect(result.column).toBe('age');
      expect(result.description).toBe('25 \u2013 50');
    });

    it('should format range with large numbers', () => {
      const filter: Filter = { type: 'range', column: 'salary', min: 50000, max: 100000 };
      const result = formatFilter(filter);
      expect(result.description).toBe('50,000 \u2013 100,000');
    });

    it('should format range with very large numbers in scientific notation', () => {
      const filter: Filter = { type: 'range', column: 'value', min: 1e10, max: 1e15 };
      const result = formatFilter(filter);
      expect(result.description).toBe('1.00e+10 \u2013 1.00e+15');
    });

    it('should format range with string values (ISO dates)', () => {
      const filter: Filter = {
        type: 'range',
        column: 'date',
        min: '2024-01-05',
        max: '2024-03-22',
      };
      const result = formatFilter(filter);
      expect(result.description).toBe('2024-01-05 \u2013 2024-03-22');
    });

    it('should format open-ended range (greater than)', () => {
      const filter: Filter = {
        type: 'range',
        column: 'age',
        min: 18,
        max: Infinity,
        minExclusive: true,
      };
      const result = formatFilter(filter);
      expect(result.description).toBe('> 18');
    });

    it('should format open-ended range (greater than or equal)', () => {
      const filter: Filter = { type: 'range', column: 'age', min: 18, max: Infinity };
      const result = formatFilter(filter);
      expect(result.description).toBe('\u2265 18');
    });

    it('should format open-ended range (less than)', () => {
      const filter: Filter = { type: 'range', column: 'age', min: -Infinity, max: 100 };
      const result = formatFilter(filter);
      expect(result.description).toBe('< 100');
    });

    it('should format open-ended range (less than or equal)', () => {
      const filter: Filter = {
        type: 'range',
        column: 'age',
        min: -Infinity,
        max: 100,
        maxInclusive: true,
      };
      const result = formatFilter(filter);
      expect(result.description).toBe('\u2264 100');
    });

    it('should format fully open range', () => {
      const filter: Filter = { type: 'range', column: 'age', min: -Infinity, max: Infinity };
      const result = formatFilter(filter);
      expect(result.description).toBe('any value');
    });

    it('should format range with Date objects', () => {
      // Use noon UTC to avoid timezone-related day shifts
      const filter: Filter = {
        type: 'range',
        column: 'created',
        min: new Date('2024-01-05T12:00:00.000Z'),
        max: new Date('2024-03-22T12:00:00.000Z'),
      };
      const result = formatFilter(filter);
      expect(result.description).toMatch(/Jan.*5.*2024/);
      expect(result.description).toContain('\u2013');
      expect(result.description).toMatch(/Mar.*22.*2024/);
    });
  });

  describe('point filter', () => {
    it('should format string point filter', () => {
      const filter: Filter = { type: 'point', column: 'color', value: 'blue' };
      const result = formatFilter(filter);
      expect(result.column).toBe('color');
      expect(result.description).toBe('= blue');
    });

    it('should format numeric point filter', () => {
      const filter: Filter = { type: 'point', column: 'id', value: 42 };
      const result = formatFilter(filter);
      expect(result.description).toBe('= 42');
    });

    it('should format boolean point filter', () => {
      const filter: Filter = { type: 'point', column: 'active', value: true };
      const result = formatFilter(filter);
      expect(result.description).toBe('= true');
    });

    it('should format null point filter', () => {
      const filter: Filter = { type: 'point', column: 'notes', value: null };
      const result = formatFilter(filter);
      expect(result.description).toBe('= null');
    });
  });

  describe('set filter', () => {
    it('should format set with few values', () => {
      const filter: Filter = { type: 'set', column: 'color', values: ['red', 'blue'] };
      const result = formatFilter(filter);
      expect(result.description).toBe('in {red, blue}');
    });

    it('should format set with exactly 3 values', () => {
      const filter: Filter = { type: 'set', column: 'color', values: ['red', 'blue', 'green'] };
      const result = formatFilter(filter);
      expect(result.description).toBe('in {red, blue, green}');
    });

    it('should truncate set with many values', () => {
      const filter: Filter = {
        type: 'set',
        column: 'color',
        values: ['red', 'blue', 'green', 'yellow', 'purple'],
      };
      const result = formatFilter(filter);
      expect(result.description).toBe('in {red, blue, green, +2 more}');
    });

    it('should format set with single value', () => {
      const filter: Filter = { type: 'set', column: 'color', values: ['red'] };
      const result = formatFilter(filter);
      expect(result.description).toBe('in {red}');
    });

    it('should format set with includeNull', () => {
      const filter: Filter = {
        type: 'set',
        column: 'color',
        values: ['red', 'blue'],
        includeNull: true,
      };
      const result = formatFilter(filter);
      expect(result.description).toBe('in {red, blue} or null');
    });
  });

  describe('not-set filter', () => {
    it('should format not-set with few values', () => {
      const filter: Filter = { type: 'not-set', column: 'color', values: ['red', 'blue'] };
      const result = formatFilter(filter);
      expect(result.description).toBe('not in {red, blue}');
    });

    it('should format not-set numeric values with formatDisplayValue', () => {
      const filter: Filter = { type: 'not-set', column: 'val', values: [1e7], includeNull: true };
      const result = formatFilter(filter);
      expect(result.description).toBe('not in {1.00e+7} or null');
    });

    it('should format not-set without includeNull (no suffix)', () => {
      const filter: Filter = { type: 'not-set', column: 'val', values: [1e7] };
      const result = formatFilter(filter);
      expect(result.description).toBe('not in {1.00e+7}');
    });

    it('should truncate not-set with many values', () => {
      const filter: Filter = {
        type: 'not-set',
        column: 'color',
        values: ['a', 'b', 'c', 'd'],
      };
      const result = formatFilter(filter);
      expect(result.description).toBe('not in {a, b, c, +1 more}');
    });
  });

  describe('null filter', () => {
    it('should format null filter', () => {
      const filter: Filter = { type: 'null', column: 'notes' };
      const result = formatFilter(filter);
      expect(result.column).toBe('notes');
      expect(result.description).toBe('is null');
    });

    it('should format not-null filter', () => {
      const filter: Filter = { type: 'not-null', column: 'notes' };
      const result = formatFilter(filter);
      expect(result.description).toBe('is not null');
    });
  });

  describe('pattern filter', () => {
    it('should format contains pattern', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'test', mode: 'contains' };
      const result = formatFilter(filter);
      expect(result.description).toBe('contains "test"');
    });

    it('should format starts with pattern', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'abc', mode: 'starts' };
      const result = formatFilter(filter);
      expect(result.description).toBe('starts with "abc"');
    });

    it('should format ends with pattern', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'xyz', mode: 'ends' };
      const result = formatFilter(filter);
      expect(result.description).toBe('ends with "xyz"');
    });

    it('should format regex pattern', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: '^abc$', mode: 'regex' };
      const result = formatFilter(filter);
      expect(result.description).toBe('matches /^abc$/');
    });
  });
});

// =========================================
// FilterChip DOM Tests
// =========================================

describe('FilterChip', () => {
  it('should create DOM element with correct structure', () => {
    const filter: Filter = { type: 'point', column: 'color', value: 'blue' };
    const chip = new FilterChip(filter, () => {});
    const el = chip.getElement();

    expect(el.tagName).toBe('SPAN');
    expect(el.className).toBe('dt-filter-chip');
    expect(el.querySelector('.dt-filter-chip-column')?.textContent).toBe('color');
    expect(el.querySelector('.dt-filter-chip-detail')?.textContent).toBe(' = blue');
    expect(el.querySelector('.dt-filter-chip-remove')).toBeTruthy();

    chip.destroy();
  });

  it('should display formatted filter description', () => {
    const filter: Filter = { type: 'range', column: 'age', min: 25, max: 50 };
    const chip = new FilterChip(filter, () => {});
    const el = chip.getElement();

    expect(el.querySelector('.dt-filter-chip-column')?.textContent).toBe('age');
    expect(el.querySelector('.dt-filter-chip-detail')?.textContent).toBe(' 25 \u2013 50');
    expect(el.title).toBe('age 25 \u2013 50');

    chip.destroy();
  });

  it('should call onRemove when X button is clicked', () => {
    const onRemove = vi.fn();
    const filter: Filter = { type: 'point', column: 'color', value: 'blue' };
    const chip = new FilterChip(filter, onRemove);
    const el = chip.getElement();

    const removeBtn = el.querySelector('.dt-filter-chip-remove') as HTMLButtonElement;
    removeBtn.click();

    expect(onRemove).toHaveBeenCalledTimes(1);

    chip.destroy();
  });

  it('should not call onRemove after destroy', () => {
    const onRemove = vi.fn();
    const filter: Filter = { type: 'point', column: 'color', value: 'blue' };
    const chip = new FilterChip(filter, onRemove);
    const el = chip.getElement();

    chip.destroy();

    const removeBtn = el.querySelector('.dt-filter-chip-remove') as HTMLButtonElement;
    removeBtn.click();

    expect(onRemove).not.toHaveBeenCalled();
  });

  it('should return the filter via getFilter()', () => {
    const filter: Filter = { type: 'null', column: 'notes' };
    const chip = new FilterChip(filter, () => {});

    expect(chip.getFilter()).toBe(filter);

    chip.destroy();
  });

  it('should support custom classPrefix', () => {
    const filter: Filter = { type: 'point', column: 'x', value: 1 };
    const chip = new FilterChip(filter, () => {}, { classPrefix: 'my' });
    const el = chip.getElement();

    expect(el.className).toBe('my-filter-chip');
    expect(el.querySelector('.my-filter-chip-column')).toBeTruthy();
    expect(el.querySelector('.my-filter-chip-remove')).toBeTruthy();

    chip.destroy();
  });

  it('should have accessible remove button', () => {
    const filter: Filter = { type: 'point', column: 'status', value: 'active' };
    const chip = new FilterChip(filter, () => {});
    const el = chip.getElement();

    const removeBtn = el.querySelector('.dt-filter-chip-remove') as HTMLButtonElement;
    expect(removeBtn.getAttribute('aria-label')).toBe('Remove filter for status');
    expect(removeBtn.type).toBe('button');

    chip.destroy();
  });

  it('should render raw-sql chip with SQL column label', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_abc__',
      sql: 'age > 30',
      id: 'abc',
    };
    const chip = new FilterChip(filter, () => {});
    const el = chip.getElement();

    const colEl = el.querySelector('.dt-filter-chip-column');
    expect(colEl?.textContent).toBe('SQL');

    const detailEl = el.querySelector('.dt-filter-chip-detail');
    expect(detailEl?.textContent).toContain('age > 30');

    chip.destroy();
  });

  it('should render raw-sql chip with label instead of SQL when provided', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_abc__',
      sql: 'age > 30 AND status = 1',
      id: 'abc',
      label: 'Adult active',
    };
    const chip = new FilterChip(filter, () => {});
    const el = chip.getElement();

    const detailEl = el.querySelector('.dt-filter-chip-detail');
    expect(detailEl?.textContent).toContain('Adult active');

    chip.destroy();
  });

  it('should add code icon and SQL class to raw-sql chip', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_abc__',
      sql: 'age > 30',
      id: 'abc',
    };
    const chip = new FilterChip(filter, () => {});
    const el = chip.getElement();

    expect(el.querySelector('.dt-filter-chip-sql-icon')).toBeTruthy();
    expect(el.querySelector('.dt-filter-chip-label--sql')).toBeTruthy();

    chip.destroy();
  });

  it('should make label clickable when onEdit is provided', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_abc__',
      sql: 'age > 30',
      id: 'abc',
    };
    const onEdit = vi.fn();
    const chip = new FilterChip(filter, () => {}, { onEdit });
    const el = chip.getElement();

    const label = el.querySelector('.dt-filter-chip-label') as HTMLElement;
    expect(label.classList.contains('dt-filter-chip-label--clickable')).toBe(true);

    label.click();
    expect(onEdit).toHaveBeenCalledTimes(1);

    chip.destroy();
  });

  it('should not trigger onEdit when X button is clicked', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_abc__',
      sql: 'age > 30',
      id: 'abc',
    };
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const chip = new FilterChip(filter, onRemove, { onEdit });
    const el = chip.getElement();

    const removeBtn = el.querySelector('.dt-filter-chip-remove') as HTMLButtonElement;
    removeBtn.click();
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();

    chip.destroy();
  });
});

// =========================================
// Long values — a nested value's text runs to 1,000 characters
// =========================================

describe('long values', () => {
  // 1,190 characters: [0, 1, 2, …, 299]
  const longText = `[${Array.from({ length: 300 }, (_, i) => i).join(', ')}]`;
  const family = '\u{1F468}‍\u{1F469}‍\u{1F467}'; // one grapheme, five code points

  describe('formatFilter', () => {
    it('keeps every value whole unless asked to cut them', () => {
      const filter: Filter = { type: 'point', column: 'tags', value: longText, valueType: 'text' };
      expect(formatFilter(filter).description).toBe(`= ${longText}`);
    });

    it('cuts a value to maxValueLength characters, the ellipsis one of them', () => {
      const point = (value: string): Filter => ({ type: 'point', column: 'c', value });
      const cut = (value: string) =>
        formatFilter(point(value), undefined, { maxValueLength: 10 }).description;
      expect(cut('abcdefghij')).toBe('= abcdefghij');
      expect(cut('abcdefghijk')).toBe('= abcdefghi…');
      expect(cut(longText)).toBe(`= ${longText.slice(0, 9)}…`);
    });

    it('cuts each value a set shows, keeping the count of the rest', () => {
      const values = ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20), 'd'.repeat(20)];
      const options = { maxValueLength: 5 };
      expect(
        formatFilter({ type: 'set', column: 'c', values }, undefined, options).description,
      ).toBe('in {aaaa…, bbbb…, cccc…, +1 more}');
      expect(
        formatFilter(
          { type: 'not-set', column: 'c', values, includeNull: true },
          undefined,
          options,
        ).description,
      ).toBe('not in {aaaa…, bbbb…, cccc…, +1 more} or null');
    });

    it('cuts a pattern inside its quotes', () => {
      const options = { maxValueLength: 6 };
      const pattern = (mode: 'contains' | 'regex'): Filter => ({
        type: 'pattern',
        column: 'c',
        pattern: longText,
        mode,
      });
      expect(formatFilter(pattern('contains'), undefined, options).description).toBe(
        'contains "[0, 1…"',
      );
      expect(formatFilter(pattern('regex'), undefined, options).description).toBe(
        'matches /[0, 1…/',
      );
    });

    it('never splits an emoji sequence, or a letter from its accent', () => {
      const cut = (value: string) =>
        formatFilter({ type: 'point', column: 'c', value }, undefined, { maxValueLength: 10 })
          .description;
      expect(cut(`${'a'.repeat(8)}${family}bbbbb`)).toBe(`= ${'a'.repeat(8)}${family}…`);
      expect(cut('é'.repeat(12))).toBe(`= ${'é'.repeat(9)}…`);
    });

    it('cuts at code points where the runtime has no Intl.Segmenter', async () => {
      const segmenter = Intl.Segmenter;
      vi.resetModules();
      (Intl as { Segmenter: unknown }).Segmenter = undefined;
      try {
        const fresh = await import('@/filters/FilterChip');
        const cut = (value: string) =>
          fresh.formatFilter({ type: 'point', column: 'c', value }, undefined, {
            maxValueLength: 10,
          }).description;
        // A surrogate pair stays whole; a sequence of them may not.
        expect(cut('\u{1F600}'.repeat(12))).toBe(`= ${'\u{1F600}'.repeat(9)}…`);
        expect(cut(`${'a'.repeat(8)}${family}bbbbb`)).toBe(`= ${'a'.repeat(8)}\u{1F468}…`);
      } finally {
        (Intl as { Segmenter: unknown }).Segmenter = segmenter;
      }
    });
  });

  describe('FilterChip', () => {
    it('shows a long value cut short, and keeps it whole in the title', () => {
      const filter: Filter = { type: 'point', column: 'tags', value: longText, valueType: 'text' };
      const chip = new FilterChip(filter, () => {});
      const el = chip.getElement();

      const detail = el.querySelector('.dt-filter-chip-detail')!.textContent!;
      expect(detail).toBe(` = ${longText.slice(0, CHIP_VALUE_MAX_LENGTH - 1)}…`);
      expect(el.title).toBe(`tags = ${longText}`);

      chip.destroy();
    });

    it('names the remove button by the column alone', () => {
      const filter: Filter = { type: 'set', column: 'tags', values: [longText, longText] };
      const chip = new FilterChip(filter, () => {});
      const removeBtn = chip.getElement().querySelector('.dt-filter-chip-remove')!;
      expect(removeBtn.getAttribute('aria-label')).toBe('Remove filter for tags');
      chip.destroy();
    });

    it('shows a value that fits whole', () => {
      const value = 'x'.repeat(CHIP_VALUE_MAX_LENGTH);
      const chip = new FilterChip({ type: 'point', column: 'c', value }, () => {});
      expect(chip.getElement().querySelector('.dt-filter-chip-detail')!.textContent).toBe(
        ` = ${value}`,
      );
      chip.destroy();
    });
  });
});
