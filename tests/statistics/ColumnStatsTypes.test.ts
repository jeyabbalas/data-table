import { describe, expect, it } from 'vitest';

import type { DataType } from '../../src/core/types';
import { statsKindForDataType } from '../../src/statistics/ColumnStatsTypes';

describe('statsKindForDataType', () => {
  it.each<[DataType, string]>([
    ['integer', 'numeric'],
    ['float', 'numeric'],
    ['decimal', 'numeric'],
    ['string', 'categorical'],
    ['boolean', 'categorical'],
    ['uuid', 'categorical'],
    ['date', 'temporal'],
    ['timestamp', 'temporal'],
    ['time', 'time'],
    ['interval', 'interval'],
    ['nested', 'nested'],
  ])('maps %s to %s', (dataType, kind) => {
    expect(statsKindForDataType(dataType)).toBe(kind);
  });

  it('rejects a type it does not know', () => {
    expect(() => statsKindForDataType('geometry' as DataType)).toThrow(/Unknown DataType/);
  });
});
