/**
 * Shared utilities for data loaders
 *
 * Provides common functionality like timestamp detection and type conversion
 * that can be reused across CSV, JSON, and other loaders.
 */

import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

/**
 * Optional explicit DuckDB context for loader entry points (`loadCSV`,
 * `loadJSON`, `loadParquet`). When omitted, the loaders fall back to the
 * module-level singletons in `./duckdb.ts`. Internal seam for tests that
 * drive loaders against a Node-built DuckDB without going through the
 * worker IPC.
 */
export interface LoaderContext {
  db?: AsyncDuckDB;
  conn?: AsyncDuckDBConnection;
}

/**
 * Quote a SQL identifier (table/column name) with proper escaping.
 * Wraps in double quotes and escapes embedded double quotes by doubling them.
 */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

let sourceFileCounter = 0;

/**
 * Name under which a loader registers its source buffer in DuckDB's virtual
 * filesystem.
 *
 * Generated rather than derived from the table name: the file name is
 * spliced into a `read_xxx('…')` string literal, and a caller-supplied table
 * name may contain a quote or a path separator. Same pattern as the export
 * path's `__export_<id>` files.
 */
export function sourceFileName(extension: 'csv' | 'json' | 'parquet'): string {
  return `__dt_source_${++sourceFileCounter}.${extension}`;
}

/**
 * Unregister a loader's source file without letting a cleanup failure
 * replace the load's own error, or fail a load that succeeded.
 */
export async function dropSourceFile(db: AsyncDuckDB, fileName: string): Promise<void> {
  try {
    await db.dropFile(fileName);
  } catch {
    // Ignore cleanup errors, as the export path does.
  }
}

/**
 * A `LOAD_INVALID_OPTIONS` error naming the option, as `csv.delimiter`. The
 * main thread checks options before a load (`validateSourceOptions`); these
 * catch a loader called without that check.
 */
export function invalidOptionError(option: string, message: string): Error {
  return Object.assign(new Error(message), {
    code: 'LOAD_INVALID_OPTIONS',
    details: { option },
  });
}

/**
 * Set DuckDB's session time zone for a load: `UTC` unless one is given. A
 * value that is not a name never reaches SQL, and a name DuckDB does not
 * know keeps the previous zone. Either rejects with `LOAD_INVALID_TIMEZONE`,
 * the second with the zones DuckDB suggests.
 */
export async function setSessionTimeZone(
  conn: AsyncDuckDBConnection,
  timezone = 'UTC',
): Promise<void> {
  // The pattern of TIMEZONE_PATTERN in src/data/sourceOptions.ts: the name
  // is spliced into a string literal.
  if (!/^[A-Za-z0-9_/+-]+$/.test(timezone)) {
    throw Object.assign(new Error(`Invalid timezone: ${timezone}`), {
      code: 'LOAD_INVALID_TIMEZONE',
      details: { timezone },
    });
  }
  try {
    await conn.query(`SET TimeZone = '${timezone}'`);
  } catch (err) {
    const duckdbMessage = err instanceof Error ? err.message : String(err);
    if (!/unknown time ?zone/i.test(duckdbMessage)) throw err;
    const candidates = /Candidate time zones:\s*(.+)/i.exec(duckdbMessage)?.[1]?.trim();
    throw Object.assign(
      new Error(
        `Unknown timezone: ${timezone}` + (candidates ? `. Did you mean ${candidates}?` : ''),
      ),
      { code: 'LOAD_INVALID_TIMEZONE', details: { timezone, duckdbMessage }, cause: err },
    );
  }
}

/**
 * Build the canonical LOAD_RESERVED_COLUMN_NAME LoadError for a source that
 * already contains a `__rowid__` column.
 */
export function makeReservedColumnError(): Error {
  return Object.assign(
    new Error(
      'Column name "__rowid__" is reserved for the synthetic row id. Rename the source column and reload.',
    ),
    {
      code: 'LOAD_RESERVED_COLUMN_NAME',
      details: { sourceColumn: '__rowid__' },
    },
  );
}

/**
 * If an error from `CREATE TABLE AS SELECT ... __rowid__ ...` looks like a
 * DuckDB duplicate-column binder error (i.e. the source already has a
 * `__rowid__` column), rewrap it as the canonical reserved-name error.
 * Otherwise rethrow the original.
 */
export function wrapReservedColumnError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  // DuckDB phrasing varies slightly across versions ("duplicate column name",
  // "Table has duplicate column name", "duplicate alias", etc.); match on the
  // pair of signals that is specific to our injected __rowid__.
  if (/duplicate/i.test(message) && /__rowid__/.test(message)) {
    return makeReservedColumnError();
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * ISO timestamp pattern
 * Matches formats:
 * - YYYY-MM-DDTHH:MM:SS
 * - YYYY-MM-DDTHH:MM:SS.sss (with milliseconds/microseconds)
 * - YYYY-MM-DDTHH:MM:SSZ (UTC)
 * - YYYY-MM-DD HH:MM:SS (space separator)
 * - YYYY-MM-DDTHH:MM:SS+HH:MM (with timezone offset)
 */
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * ISO date pattern (date only, no time component)
 * Matches: YYYY-MM-DD
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Time pattern (24-hour format)
 * Matches:
 * - HH:MM:SS
 * - HH:MM:SS.ffffff (with microseconds)
 */
const TIME_PATTERN = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;

/**
 * Check if a value matches ISO timestamp format
 */
function isISOTimestamp(value: string): boolean {
  const trimmed = value.trim();
  if (!ISO_TIMESTAMP_PATTERN.test(trimmed)) {
    return false;
  }
  // Validate it's a real timestamp by parsing
  const date = new Date(trimmed.replace(' ', 'T'));
  return !isNaN(date.getTime());
}

/**
 * Check if a value matches ISO date format (YYYY-MM-DD)
 */
function isISODate(value: string): boolean {
  const trimmed = value.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return false;
  }
  // Validate it's a real date by parsing
  const date = new Date(trimmed + 'T00:00:00');
  return !isNaN(date.getTime());
}

/**
 * Check if a value matches 24-hour time format (HH:MM:SS or HH:MM:SS.ffffff)
 */
function isTimeFormat(value: string): boolean {
  const trimmed = value.trim();
  if (!TIME_PATTERN.test(trimmed)) {
    return false;
  }
  // Validate time components are in valid range
  const parts = trimmed.split(':');
  const hours = parseInt(parts[0]!, 10);
  const minutes = parseInt(parts[1]!, 10);
  const seconds = parseFloat(parts[2]!);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds < 60;
}

/** DuckDB type a text column of dates or times converts to. */
export type TemporalType = 'TIMESTAMP' | 'TIMESTAMPTZ' | 'DATE' | 'TIME';

/**
 * The exact form a value needs to convert unchanged, as RE2 patterns for
 * `regexp_full_match`. DuckDB's casts are lenient: a DATE cast keeps a valid
 * date prefix and drops the rest (`2024-03-15 to 2024-04-01`,
 * `2024-03-15 14:30:00`), a TIME cast drops `PM`, and TIMESTAMP and TIME keep
 * six fractional digits. So a value converts only if it matches in full, with
 * at most six fractional digits.
 */
const EXACT_TIMESTAMP_PATTERN =
  '^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?(Z|[+-]\\d{2}:?\\d{2})?$';
const EXACT_TEMPORAL_PATTERNS: Record<TemporalType, string> = {
  DATE: '^\\d{4}-\\d{2}-\\d{2}$',
  TIME: '^\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?$',
  TIMESTAMP: EXACT_TIMESTAMP_PATTERN,
  TIMESTAMPTZ: EXACT_TIMESTAMP_PATTERN,
};

/** Leading rows sampled to guess which text columns hold dates or times. */
const TEMPORAL_SAMPLE_ROWS = 2048;
/** Distinct values per column the guess looks at. */
const TEMPORAL_SAMPLE_VALUES = 100;
/**
 * Sampled values are cut to this many characters, which bounds the sample's
 * memory. ISO dates and times are shorter, so cut text still fails to match.
 */
const TEMPORAL_SAMPLE_CHARS = 64;
/** Share of sampled values that must match one format. */
const TEMPORAL_MATCH_SHARE = 0.95;

const TEMPORAL_FORMATS = [
  ['TIMESTAMP', isISOTimestamp],
  ['DATE', isISODate],
  ['TIME', isTimeFormat],
] as const;

async function firstRow(
  conn: AsyncDuckDBConnection,
  sql: string,
): Promise<Record<string, unknown> | undefined> {
  const result = await conn.query(sql);
  return result.toArray()[0]?.toJSON() as Record<string, unknown> | undefined;
}

/**
 * Find the text columns of `relation` that hold ISO dates, timestamps or
 * times, and the type each can convert to without losing a value.
 *
 * Two queries. The first samples distinct values from the leading rows of
 * every VARCHAR column and matches them against the ISO formats, most
 * specific first. The second reads the matching columns in full and counts
 * the values a conversion would lose: a value that does not cast would become
 * NULL, and one not in the exact format would cast but change (see
 * {@link EXACT_TEMPORAL_PATTERNS}), so either keeps its column as text. Blank
 * values are missing and become NULL. A timestamp column whose values carry
 * a UTC offset becomes TIMESTAMPTZ, because casting to TIMESTAMP drops the
 * offset; offsets that match the session time zone lose nothing and stay
 * TIMESTAMP.
 *
 * Both queries are best effort: if either fails, the columns stay text.
 *
 * @param relation - What to read: a quoted table name, or a table function
 *   such as `read_parquet('…')`
 * @param describeRows - DESCRIBE rows of `relation`
 * @returns Columns to convert, and their types
 */
export async function detectTemporalColumns(
  conn: AsyncDuckDBConnection,
  relation: string,
  describeRows: Record<string, unknown>[],
): Promise<Map<string, TemporalType>> {
  const detected = new Map<string, TemporalType>();
  const textColumns = describeRows
    .filter((row) => String(row['column_type']).toUpperCase() === 'VARCHAR')
    .map((row) => String(row['column_name']));
  if (textColumns.length === 0) return detected;

  const candidates: { name: string; type: (typeof TEMPORAL_FORMATS)[number][0] }[] = [];
  try {
    const sample = await firstRow(
      conn,
      `SELECT ${textColumns
        .map((name, i) => {
          const col = quoteIdentifier(name);
          return `(list(DISTINCT left(${col}, ${TEMPORAL_SAMPLE_CHARS})) FILTER (WHERE trim(${col}) <> ''))[1:${TEMPORAL_SAMPLE_VALUES}] AS "${i}"`;
        })
        .join(', ')}
       FROM (SELECT ${textColumns.map(quoteIdentifier).join(', ')}
             FROM ${relation} LIMIT ${TEMPORAL_SAMPLE_ROWS})`,
    );
    textColumns.forEach((name, i) => {
      const list = sample?.[String(i)] as Iterable<unknown> | null | undefined;
      const values = list ? Array.from(list, String) : [];
      if (values.length === 0) return;
      const format = TEMPORAL_FORMATS.find(
        ([, matches]) => values.filter(matches).length / values.length >= TEMPORAL_MATCH_SHARE,
      );
      if (format) candidates.push({ name, type: format[0] });
    });
  } catch {
    return detected;
  }
  if (candidates.length === 0) return detected;

  let counts: Record<string, unknown> | undefined;
  try {
    counts = await firstRow(
      conn,
      `SELECT ${candidates
        .flatMap(({ name, type }, i) => {
          const col = quoteIdentifier(name);
          // Blank text is missing, not lost: it becomes NULL, as the CSV
          // reader already reads an empty field.
          const lost = (target: TemporalType) =>
            `count(*) FILTER (WHERE trim(${col}) <> '' AND (NOT regexp_full_match(trim(${col}), '${EXACT_TEMPORAL_PATTERNS[target]}') OR TRY_CAST(${col} AS ${target}) IS NULL))`;
          const checks = [`${lost(type)} AS "lost_${i}"`];
          if (type === 'TIMESTAMP') {
            // A value reads differently as TIMESTAMPTZ when it names an
            // offset other than the session time zone's.
            checks.push(
              `${lost('TIMESTAMPTZ')} AS "lost_tz_${i}"`,
              `count(*) FILTER (WHERE TRY_CAST(${col} AS TIMESTAMPTZ) IS DISTINCT FROM CAST(TRY_CAST(${col} AS TIMESTAMP) AS TIMESTAMPTZ)) AS "zoned_${i}"`,
            );
          }
          return checks;
        })
        .join(', ')}
       FROM ${relation}`,
    );
  } catch {
    return detected;
  }

  candidates.forEach(({ name, type }, i) => {
    // A missing count reads as a loss, so the column stays text.
    const count = (key: string): number => Number(counts?.[`${key}_${i}`] ?? 1);
    if (type !== 'TIMESTAMP') {
      if (count('lost') === 0) detected.set(name, type);
    } else if (count('zoned') > 0) {
      if (count('lost_tz') === 0) detected.set(name, 'TIMESTAMPTZ');
    } else if (count('lost') === 0) {
      detected.set(name, 'TIMESTAMP');
    }
  });
  return detected;
}

/** `TRY_CAST` of a detected column to its type, keeping its name. */
export function temporalCast(name: string, type: TemporalType): string {
  const col = quoteIdentifier(name);
  return `TRY_CAST(${col} AS ${type}) AS ${col}`;
}

/**
 * Convert the text columns of a loaded table that hold ISO dates, timestamps
 * or times; see {@link detectTemporalColumns} for which ones convert.
 *
 * Each column converts in place with `ALTER COLUMN … SET DATA TYPE`, which
 * rewrites only that column and keeps every row where it was. (Rebuilding
 * the table instead would need a second copy of it in memory.) The Parquet
 * loader converts while it reads the file instead, so it never calls this.
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to enhance
 * @param describeRows - Current schema from DESCRIBE query
 * @returns Updated describeRows after type conversion
 */
export async function enhanceSchemaTypes(
  conn: AsyncDuckDBConnection,
  tableName: string,
  describeRows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const table = quoteIdentifier(tableName);
  const detected = await detectTemporalColumns(conn, table, describeRows);
  if (detected.size === 0) return describeRows;

  for (const [name, type] of detected) {
    const col = quoteIdentifier(name);
    try {
      await conn.query(
        `ALTER TABLE ${table} ALTER COLUMN ${col} SET DATA TYPE ${type} USING TRY_CAST(${col} AS ${type})`,
      );
    } catch (cause) {
      const stage = type === 'TIMESTAMPTZ' ? 'timestamp' : type.toLowerCase();
      throw Object.assign(
        new Error(`Failed to convert column ${name} to ${type} in table ${tableName}`, { cause }),
        { code: 'LOAD_PARSE_FAILED', details: { tableName, stage } },
      );
    }
  }

  const describeResult = await conn.query(`DESCRIBE ${table}`);
  return describeResult.toArray().map((row) => row.toJSON());
}
