/**
 * How a source is read, per format, and the check those options get before
 * a load starts.
 */

import { LoadError } from '../core/errors';
import { ROWID_COLUMN } from '../core/types';

/** How a CSV source is read. DuckDB detects whatever is left out. */
export interface CSVSourceOptions {
  /**
   * The character between fields: one character (one UTF-16 code unit),
   * not a line break or NUL. Default: detected.
   */
  delimiter?: string | undefined;
  /** Whether the first row holds the column names. Default: detected. */
  header?: boolean | undefined;
  /**
   * Rows DuckDB reads to detect the dialect and the column types, or `-1`
   * for every row. Default: DuckDB's, 20,480. A value that does not fit the
   * type detected from the rows read fails the load.
   */
  sampleSize?: number | undefined;
  /** Lines to skip at the start of the file, before the header. Default: 0. */
  skip?: number | undefined;
  /**
   * Field values read as NULL. They replace DuckDB's default, under which
   * only an empty field is NULL: include `''` to keep that. None may hold a
   * NUL character.
   */
  nullValues?: readonly string[] | undefined;
}

/** How a JSON source is read. DuckDB detects whatever is left out. */
export interface JSONSourceOptions {
  /**
   * `'array'` for one JSON array of objects, `'ndjson'` for one object per
   * line. Default: detected.
   */
  format?: 'array' | 'ndjson' | undefined;
  /**
   * Objects DuckDB reads to detect the column types, or `-1` for every one.
   * Default: DuckDB's, 20,480.
   */
  sampleSize?: number | undefined;
  /**
   * How many levels of nested objects get types of their own. Values nested
   * deeper load as JSON text. Default: no limit.
   */
  maxDepth?: number | undefined;
}

/** How a Parquet source is read. */
export interface ParquetSourceOptions {
  /**
   * The columns to load, by their names in the file (case-sensitive), in
   * this order. Default: every column. The others are never read, and the
   * memory check before the load counts only these. Leave out
   * `__rowid__`: the table adds that column itself.
   */
  columns?: readonly string[] | undefined;
}

/**
 * How a source is read: passed as `sourceOptions` to `createDataTable()`,
 * `table.loadData()` and `actions.loadData()`, and spread into
 * `WorkerBridge.loadData()`'s options. A load reads the entry for its
 * source's format and ignores the others, so one object can go with sources
 * of any format. Every entry is checked before the load starts: a value of
 * the wrong type or out of range, or an unknown key, rejects the load with a
 * `LoadError` whose code is `LOAD_INVALID_OPTIONS` (or
 * `LOAD_INVALID_TIMEZONE`), and `details.option` names it. The table keeps
 * the data it had.
 */
export interface SourceOptions {
  /**
   * The time zone DuckDB works in, as an IANA name such as
   * `'America/New_York'`. SQL on TIMESTAMPTZ values uses it: date parts,
   * truncation, and casts to DATE or text, as in derived columns, SQL
   * filters and the bins of a date histogram. And in the text columns the
   * loader converts to dates and times, timestamps that carry this zone's
   * own offset load as TIMESTAMP, the local time as written, where other
   * offsets make the column TIMESTAMPTZ. Cells show TIMESTAMPTZ values in
   * UTC either way. It is a setting of the worker's DuckDB connection, so it
   * holds for every table on one `WorkerBridge`, and every load sets it: to
   * UTC unless given. Default: `'UTC'`. A name DuckDB does not know rejects
   * the load with `LOAD_INVALID_TIMEZONE`.
   */
  timezone?: string | undefined;
  /** Read by a CSV load. */
  csv?: CSVSourceOptions | undefined;
  /** Read by a JSON load. */
  json?: JSONSourceOptions | undefined;
  /** Read by a Parquet load. */
  parquet?: ParquetSourceOptions | undefined;
}

/** What a time zone name may hold; it is spliced into `SET TimeZone`. */
export const TIMEZONE_PATTERN = /^[A-Za-z0-9_/+-]+$/;

const KEYS = {
  sourceOptions: ['timezone', 'csv', 'json', 'parquet'],
  csv: ['delimiter', 'header', 'sampleSize', 'skip', 'nullValues'],
  json: ['format', 'sampleSize', 'maxDepth'],
  parquet: ['columns'],
} as const;

function invalid(option: string, message: string, value: unknown): LoadError {
  return new LoadError(`Invalid load option ${option}: ${message}`, {
    code: 'LOAD_INVALID_OPTIONS',
    details: { option, value },
  });
}

/**
 * The object at `path` (`''` for the options themselves), with only the keys
 * `known` allows.
 */
function checkObject(
  value: unknown,
  path: string,
  known: readonly string[],
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(path || 'sourceOptions', 'expected an object', value);
  }
  const entries = value as Record<string, unknown>;
  for (const key of Object.keys(entries)) {
    if (!known.includes(key)) {
      const option = path ? `${path}.${key}` : key;
      throw invalid(option, `unknown option; expected one of ${known.join(', ')}`, entries[key]);
    }
  }
  return entries;
}

/** A positive whole number, or -1 for "every row" where `allowAll`. */
function checkCount(
  value: unknown,
  option: string,
  { min, allowAll = false }: { min: number; allowAll?: boolean },
): void {
  if (value === undefined) return;
  const ok =
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (value >= min || (allowAll && value === -1));
  if (!ok) {
    const expected = min === 0 ? 'a whole number, 0 or more' : 'a whole number, 1 or more';
    throw invalid(option, allowAll ? `expected ${expected}, or -1` : `expected ${expected}`, value);
  }
}

function checkStrings(value: unknown, option: string, { unique }: { unique: boolean }): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0) {
    throw invalid(option, 'expected a non-empty array of strings', value);
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      throw invalid(option, 'expected a non-empty array of strings', value);
    }
  }
  if (unique && new Set(value).size !== value.length) {
    throw invalid(option, 'a name appears more than once', value);
  }
}

/**
 * Check `options` before a load starts, so that a mistake rejects at once,
 * with the option named, rather than after the source is read or as a
 * DuckDB error. Whether DuckDB knows a well-formed time zone name is left to
 * the worker, which rejects an unknown one with `LOAD_INVALID_TIMEZONE`.
 *
 * @throws LoadError - `LOAD_INVALID_OPTIONS`, or `LOAD_INVALID_TIMEZONE` for
 *   a time zone that is not a name. `details.option` names the option.
 */
export function validateSourceOptions(options: unknown): void {
  const top = checkObject(options, '', KEYS.sourceOptions);
  if (!top) return;

  const { timezone } = top;
  if (
    timezone !== undefined &&
    (typeof timezone !== 'string' || !TIMEZONE_PATTERN.test(timezone))
  ) {
    throw new LoadError(`Invalid timezone: ${String(timezone)}`, {
      code: 'LOAD_INVALID_TIMEZONE',
      details: { option: 'timezone', timezone },
    });
  }

  const csv = checkObject(top['csv'], 'csv', KEYS.csv);
  if (csv) {
    const { delimiter, header } = csv;
    if (
      delimiter !== undefined &&
      (typeof delimiter !== 'string' || delimiter.length !== 1 || /[\n\r\0]/.test(delimiter))
    ) {
      throw invalid(
        'csv.delimiter',
        'expected a single character, not a line break or NUL',
        delimiter,
      );
    }
    if (header !== undefined && typeof header !== 'boolean') {
      throw invalid('csv.header', 'expected true or false', header);
    }
    checkCount(csv['sampleSize'], 'csv.sampleSize', { min: 1, allowAll: true });
    checkCount(csv['skip'], 'csv.skip', { min: 0 });
    checkStrings(csv['nullValues'], 'csv.nullValues', { unique: false });
    if ((csv['nullValues'] as string[] | undefined)?.some((v) => v.includes('\0'))) {
      throw invalid('csv.nullValues', 'a value holds a NUL character', csv['nullValues']);
    }
  }

  const json = checkObject(top['json'], 'json', KEYS.json);
  if (json) {
    const { format } = json;
    if (format !== undefined && format !== 'array' && format !== 'ndjson') {
      throw invalid('json.format', "expected 'array' or 'ndjson'", format);
    }
    checkCount(json['sampleSize'], 'json.sampleSize', { min: 1, allowAll: true });
    checkCount(json['maxDepth'], 'json.maxDepth', { min: 1 });
  }

  const parquet = checkObject(top['parquet'], 'parquet', KEYS.parquet);
  if (parquet) {
    checkStrings(parquet['columns'], 'parquet.columns', { unique: true });
    if ((parquet['columns'] as string[] | undefined)?.includes(ROWID_COLUMN)) {
      throw invalid(
        'parquet.columns',
        `leave out ${ROWID_COLUMN}: the table adds that column itself`,
        parquet['columns'],
      );
    }
  }
}
