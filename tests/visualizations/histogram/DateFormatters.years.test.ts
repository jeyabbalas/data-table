/**
 * A date histogram's labels for years before 1 and past 9999.
 *
 * A label spanning years ends with the year's last two digits, `Jan 2 '24`.
 * Outside 1000–9999 those named another year: 44 BC (year -43, as
 * `getUTCFullYear` numbers it) read `'43`, and the year 12000 read `'00`.
 * Such a year is now written in full.
 */
import { describe, expect, it } from 'vitest';

import {
  analyzeDateContext,
  formatDateForType,
  formatDateLabel,
} from '@/visualizations/histogram/DateFormatters';

const at = (iso: string): Date => new Date(iso);

describe('date labels for years outside 1000–9999', () => {
  // A range across years, so the labels carry the year.
  const context = analyzeDateContext(
    at('-000043-03-15T00:00:00.000Z'),
    at('+012000-01-01T00:00:00.000Z'),
  );

  it('writes a year before 1 in full', () => {
    const date = at('-000043-03-15T00:00:00.000Z');
    expect(formatDateLabel(date, 'day', context)).toBe('Mar 15 -43');
    expect(formatDateLabel(date, 'week', context)).toBe('Mar 15 -43');
    expect(formatDateLabel(date, 'month', context)).toBe('Mar -43');
    expect(formatDateLabel(date, 'quarter', context)).toBe('Q1 -43');
    expect(formatDateLabel(date, 'hour', context)).toBe('Mar 15 -43');
    expect(formatDateLabel(date, 'year', context)).toBe('-43');
  });

  it('writes a year past 9999 in full', () => {
    const date = at('+012000-01-01T00:00:00.000Z');
    expect(formatDateLabel(date, 'day', context)).toBe('Jan 1 12000');
    expect(formatDateLabel(date, 'month', context)).toBe('Jan 12000');
    expect(formatDateLabel(date, 'quarter', context)).toBe('Q1 12000');
    expect(formatDateLabel(date, 'year', context)).toBe('12000');
  });

  it('writes a year from 1 to 999 in full', () => {
    expect(formatDateLabel(at('0050-06-15T00:00:00.000Z'), 'day', context)).toBe('Jun 15 50');
    expect(formatDateLabel(at('0999-06-15T00:00:00.000Z'), 'month', context)).toBe('Jun 999');
  });

  it("keeps the short year from 1000 to 9999: Jan 2 '24", () => {
    expect(formatDateLabel(at('2024-01-02T00:00:00.000Z'), 'day', context)).toBe("Jan 2 '24");
    expect(formatDateLabel(at('1000-05-01T00:00:00.000Z'), 'month', context)).toBe("May '00");
    expect(formatDateLabel(at('9999-12-31T00:00:00.000Z'), 'quarter', context)).toBe("Q4 '99");
  });

  it('labels the equal-width bars with the full year, as before', () => {
    expect(formatDateForType(at('-000043-03-15T00:00:00.000Z'), 'date')).toBe('Mar 15, -43');
    expect(formatDateForType(at('+012000-01-01T08:30:00.000Z'), 'timestamp')).toBe(
      'Jan 1, 12000 08:30',
    );
  });
});
