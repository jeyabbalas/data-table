/**
 * The check `sourceOptions` get before a load starts: every value of the
 * wrong type or out of range, and every unknown key, rejects with the
 * option named, as `LOAD_INVALID_OPTIONS` (or `LOAD_INVALID_TIMEZONE`).
 */
import { describe, expect, it } from 'vitest';

import { LoadError } from '@/core/errors';
import { validateSourceOptions } from '@/data/sourceOptions';

function rejection(options: unknown): LoadError {
  try {
    validateSourceOptions(options);
  } catch (err) {
    expect(err).toBeInstanceOf(LoadError);
    return err as LoadError;
  }
  throw new Error('expected the options to be rejected');
}

describe('validateSourceOptions', () => {
  it('accepts no options, empty ones and every option in range', () => {
    expect(() => validateSourceOptions(undefined)).not.toThrow();
    expect(() => validateSourceOptions({})).not.toThrow();
    expect(() =>
      validateSourceOptions({
        timezone: 'America/New_York',
        csv: { delimiter: ';', header: false, sampleSize: -1, skip: 0, nullValues: ['', 'NA'] },
        json: { format: 'ndjson', sampleSize: 1, maxDepth: 1 },
        parquet: { columns: ['a'] },
      }),
    ).not.toThrow();
    // Undefined values are as good as absent.
    expect(() =>
      validateSourceOptions({ timezone: undefined, csv: { delimiter: undefined } }),
    ).not.toThrow();
  });

  it.each([
    ['not an object', 'csv', 'sourceOptions'],
    ['an unknown key', { delimiter: ';' }, 'delimiter'],
    ['csv not an object', { csv: ';' }, 'csv'],
    ['an unknown csv key', { csv: { delimeter: ';' } }, 'csv.delimeter'],
    ['a two-character delimiter', { csv: { delimiter: ',,' } }, 'csv.delimiter'],
    ['an empty delimiter', { csv: { delimiter: '' } }, 'csv.delimiter'],
    ['a line feed delimiter', { csv: { delimiter: '\n' } }, 'csv.delimiter'],
    ['a carriage return delimiter', { csv: { delimiter: '\r' } }, 'csv.delimiter'],
    ['a NUL delimiter', { csv: { delimiter: '\0' } }, 'csv.delimiter'],
    ['a null value holding NUL', { csv: { nullValues: ['NA', 'x\0'] } }, 'csv.nullValues'],
    [
      '__rowid__ among the Parquet columns',
      { parquet: { columns: ['a', '__rowid__'] } },
      'parquet.columns',
    ],
    ['a header that is not a boolean', { csv: { header: 'yes' } }, 'csv.header'],
    ['a zero sample size', { csv: { sampleSize: 0 } }, 'csv.sampleSize'],
    ['a fractional sample size', { csv: { sampleSize: 1.5 } }, 'csv.sampleSize'],
    ['a negative sample size other than -1', { csv: { sampleSize: -2 } }, 'csv.sampleSize'],
    ['a sample size given as text', { csv: { sampleSize: '5' } }, 'csv.sampleSize'],
    ['a negative skip', { csv: { skip: -1 } }, 'csv.skip'],
    ['no null values', { csv: { nullValues: [] } }, 'csv.nullValues'],
    ['null values that are not a list', { csv: { nullValues: 'NA' } }, 'csv.nullValues'],
    ['a null value that is not text', { csv: { nullValues: [1] } }, 'csv.nullValues'],
    ['an unknown JSON format', { json: { format: 'lines' } }, 'json.format'],
    ['a zero JSON sample size', { json: { sampleSize: 0 } }, 'json.sampleSize'],
    ['a maximum depth of -1', { json: { maxDepth: -1 } }, 'json.maxDepth'],
    ['an unknown json key', { json: { records: 'ndjson' } }, 'json.records'],
    ['no Parquet columns', { parquet: { columns: [] } }, 'parquet.columns'],
    ['Parquet columns that are not a list', { parquet: { columns: 'a' } }, 'parquet.columns'],
    ['a Parquet column named twice', { parquet: { columns: ['a', 'a'] } }, 'parquet.columns'],
    ['a Parquet column that is not text', { parquet: { columns: [1] } }, 'parquet.columns'],
  ])('rejects %s', (_label, options, option) => {
    const error = rejection(options);
    expect(error.code).toBe('LOAD_INVALID_OPTIONS');
    expect(error.details).toMatchObject({ option });
    expect(error.message).toContain(option);
  });

  it('says why __rowid__ cannot be among the Parquet columns', () => {
    expect(rejection({ parquet: { columns: ['__rowid__'] } }).message).toBe(
      'Invalid load option parquet.columns: leave out __rowid__: the table adds that column itself',
    );
  });

  it.each([['inva!id;tz'], [''], [5], ["UTC'; DROP TABLE t; --"]])(
    'rejects the time zone %j as LOAD_INVALID_TIMEZONE',
    (timezone) => {
      const error = rejection({ timezone });
      expect(error.code).toBe('LOAD_INVALID_TIMEZONE');
      expect(error.details).toMatchObject({ option: 'timezone', timezone });
    },
  );
});
