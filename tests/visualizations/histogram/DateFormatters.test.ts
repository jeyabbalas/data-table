/**
 * Time-of-day labels of a TIME histogram's bars, at the ends of the day.
 *
 * The day's last bar ends at 86400 s, `24:00:00`, which it also holds. Its
 * hour label read "12pm", so the 11pm bar's range read `11pm - 12pm`.
 */
import { describe, expect, it } from 'vitest';

import {
  formatTimeOnlyLabel,
  formatTimeOnlyRange,
  formatTimeOnlyRangeNumeric,
} from '@/visualizations/histogram/DateFormatters';

describe('time-of-day labels', () => {
  it('reads hour 24 as midnight', () => {
    expect(formatTimeOnlyRange(82800, 86400, 'hour')).toBe('11pm - 12am');
    expect(formatTimeOnlyLabel(86400, 'hour')).toBe('12am');
    expect(formatTimeOnlyRange(0, 3600, 'hour')).toBe('12am - 1am');
    expect(formatTimeOnlyRange(39600, 43200, 'hour')).toBe('11am - 12pm');
  });

  it('writes 24:00 out where minutes and seconds show', () => {
    expect(formatTimeOnlyRange(86340, 86400, 'minute')).toBe('23:59 - 24:00');
    expect(formatTimeOnlyRange(86399, 86400, 'second')).toBe('23:59:59 - 24:00:00');
    expect(formatTimeOnlyLabel(86400, 'second')).toBe('24:00:00');
    expect(formatTimeOnlyRangeNumeric(80640, 86400)).toBe('22:24:00 – 24:00:00');
  });
});
