/**
 * JSON data loader using DuckDB's native JSON parsing
 */

import { ROWID_COLUMN, type ColumnSchema } from '../../core/types';
import { mapDuckDBType } from '../../data/SchemaDetector';
import { getDatabase, getConnection } from '../duckdb';
import {
  planTypedIngestProjection,
  quoteIdentifier,
  wrapReservedColumnError,
  type LoaderContext,
} from './common';
import type { LoadResult, JSONLoadOptions } from './types';

let tableCounter = 0;

/**
 * Generate a unique table name
 */
function generateTableName(): string {
  return `json_table_${++tableCounter}_${Date.now()}`;
}

/**
 * Byte budget for the {@link isNDJSON} format sniff.
 *
 * The sniff only ever needs the source's first line, so touching the whole
 * document is pure waste: the previous implementation decoded the entire
 * buffer and then `split('\n')`-ed it into one string per line — for a 500 MB
 * NDJSON file that is a full decode plus millions of substring allocations to
 * read line 1. 1 MiB is orders of magnitude more than any realistic first
 * record needs while making the sniff O(1) in the source size.
 *
 * Documented failure mode: a source whose *first line* is longer than this
 * window has no `\n` inside the window and is therefore classified as
 * `'array'`. A file with a first NDJSON record larger than 1 MiB must say so
 * explicitly — `options.format` is the escape hatch.
 *
 * @internal Not part of the public API; exported so the unit tests can assert
 *   against the budget by name.
 */
export const SNIFF_WINDOW_BYTES = 1024 * 1024;

/**
 * Detect if data is NDJSON (newline-delimited JSON).
 *
 * Inspects at most {@link SNIFF_WINDOW_BYTES} from the head of the source and
 * reports NDJSON only when all three hold:
 *
 * 1. the window contains a `\n`;
 * 2. the text before that `\n` parses as a JSON object that is not an array;
 * 3. at least one non-whitespace character follows that `\n` in the window.
 *
 * Rule 3 preserves the previous implementation's `lines.length < 2` check — a
 * lone JSON object, with or without a trailing newline, is still `'array'` —
 * without counting the lines of the whole document, which a bounded window
 * cannot do.
 *
 * @internal Not part of the public API; exported for unit tests
 *   (`tests/worker/loaders/jsonSniff.test.ts`).
 */
export function isNDJSON(data: string | ArrayBuffer): boolean {
  let head: string;
  if (data instanceof ArrayBuffer) {
    // Decode the prefix only. Cutting at an arbitrary byte can split a
    // multi-byte UTF-8 sequence; the default TextDecoder is non-fatal and
    // substitutes U+FFFD instead of throwing. That is deliberate and safe
    // here — a truncated sequence can only ever land at the very end of the
    // window, and the only text handed to JSON.parse is what precedes the
    // first `\n`. Do NOT "fix" this into a `{ fatal: true }` decoder.
    head = new TextDecoder().decode(
      new Uint8Array(data, 0, Math.min(data.byteLength, SNIFF_WINDOW_BYTES)),
    );
  } else {
    // A string source is already fully in memory, so the only cost worth
    // bounding is the scan below. Slicing by *characters* is a cheap,
    // deliberately approximate stand-in for the byte budget (a UTF-8
    // character is at least one byte, so this window is never larger).
    head = data.slice(0, SNIFF_WINDOW_BYTES);
  }

  // The previous implementation trimmed the whole document before splitting,
  // so leading whitespace — blank lines, a stray BOM (U+FEFF is whitespace
  // for String.prototype.trim) — was skipped and the first *content* line was
  // the one parsed. Keep that: an NDJSON file opening with a blank line still
  // detects as NDJSON.
  head = head.trimStart();

  const eol = head.indexOf('\n');
  // No newline in the window: either a genuinely single-line document (the
  // common `[{…},{…}]` case) or a first line that overflowed the window. Both
  // fall back to 'array' — see SNIFF_WINDOW_BYTES for the escape hatch.
  if (eol === -1) return false;
  // Nothing but whitespace after the first newline: one JSON value, not a
  // newline-delimited stream of them.
  if (!/\S/.test(head.slice(eol + 1))) return false;

  // Drop one trailing `\r` so a CRLF source takes exactly the same path as an
  // LF one. (`JSON.parse` happens to tolerate a trailing CR — it is JSON
  // whitespace — so this is belt-and-braces rather than a behavior change,
  // but the sniff should not depend on that quirk.)
  const rawFirstLine = head.slice(0, eol);
  const firstLine = rawFirstLine.endsWith('\r') ? rawFirstLine.slice(0, -1) : rawFirstLine;

  try {
    const first: unknown = JSON.parse(firstLine);
    // NDJSON has objects on each line, not an array
    return typeof first === 'object' && !Array.isArray(first);
  } catch {
    return false;
  }
}

/**
 * Load JSON data into a DuckDB table
 *
 * Supports:
 * - Array of objects: [{"a": 1}, {"a": 2}]
 * - Newline-delimited JSON (NDJSON): {"a": 1}\n{"a": 2}
 *
 * @param data - JSON content as string or ArrayBuffer
 * @param options - JSON loading options
 * @param context - Optional explicit { db, conn }; see {@link loadCSV} for
 *   the rationale. Production callers (worker.ts) omit it.
 * @returns LoadResult with table name, row count, and columns
 */
export async function loadJSON(
  data: string | ArrayBuffer,
  options: JSONLoadOptions = {},
  context?: LoaderContext,
): Promise<LoadResult> {
  const db = context?.db ?? getDatabase();
  const conn = context?.conn ?? getConnection();
  const tableName = options.tableName || generateTableName();

  // Set timezone for TIMESTAMPTZ columns (default: UTC)
  const timezone = options.timezone ?? 'UTC';
  if (!/^[A-Za-z0-9_/+-]+$/.test(timezone)) {
    throw Object.assign(new Error(`Invalid timezone: ${timezone}`), {
      code: 'LOAD_INVALID_TIMEZONE',
      details: { timezone },
    });
  }
  await conn.query(`SET TimeZone = '${timezone}'`);

  // Convert ArrayBuffer to string if needed
  const jsonString = data instanceof ArrayBuffer ? new TextDecoder().decode(data) : data;

  // Detect format if not specified
  // Sniff the original source, not `jsonString` — the sniff reads a bounded
  // byte prefix and must not depend on the full decode above.
  const format = options.format || (isNDJSON(data) ? 'ndjson' : 'array');

  // Convert to Uint8Array for DuckDB's file system
  const content = new TextEncoder().encode(jsonString);

  // Register file with DuckDB's virtual filesystem
  const fileName = `${tableName}.json`;
  await db.registerFileBuffer(fileName, content);

  try {
    // Build read_json options
    const jsonOptions: string[] = [];

    // Set format based on detection or user specification
    if (format === 'ndjson') {
      jsonOptions.push("format = 'newline_delimited'");
    } else {
      jsonOptions.push("format = 'array'");
    }

    // Enable auto-detection of types
    jsonOptions.push('auto_detect = true');

    if (options.sampleSize) {
      const n = Number(options.sampleSize);
      if (!Number.isInteger(n) || n <= 0) {
        throw Object.assign(new Error('JSON sampleSize must be a positive integer'), {
          code: 'LOAD_INVALID_OPTIONS',
          details: { option: 'sampleSize' },
        });
      }
      jsonOptions.push(`sample_size = ${n}`);
    }

    if (options.maxDepth) {
      const n = Number(options.maxDepth);
      if (!Number.isInteger(n) || n <= 0) {
        throw Object.assign(new Error('JSON maxDepth must be a positive integer'), {
          code: 'LOAD_INVALID_OPTIONS',
          details: { option: 'maxDepth' },
        });
      }
      jsonOptions.push(`maximum_depth = ${n}`);
    }

    // Preflight the reader relation — see the matching note in csv.ts. One
    // DESCRIBE serves as both the reserved-name guard and the type planner's
    // column list, and the planned casts ride along in the ingest CTAS.
    //
    // Array-form JSON pays more for this than CSV does: `LIMIT` does not let
    // DuckDB stop reading an array document early — it still scans the whole
    // document for record boundaries, measured at ~0.6 ms/MB versus
    // ~2.9 ms/MB for a full parse. That is still far cheaper than the
    // full-table copy-and-sort it replaces.
    const optionsStr = `, ${jsonOptions.join(', ')}`;
    const relation = `read_json_auto('${fileName}'${optionsStr})`;
    const projection = await planTypedIngestProjection(conn, relation);

    const tbl = quoteIdentifier(tableName);
    // Always cast __rowid__ to BIGINT — see the matching note in csv.ts for
    // the rationale (single typed-array shape on read, symmetry across
    // loaders). The reserved-name guard above is case-sensitive.
    const createSql = `CREATE OR REPLACE TABLE ${tbl} AS SELECT CAST(row_number() OVER () - 1 AS BIGINT) AS ${quoteIdentifier(ROWID_COLUMN)}, ${projection} FROM ${relation}`;
    try {
      await conn.query(createSql);
    } catch (err) {
      throw wrapReservedColumnError(err);
    }

    // Get row count
    const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tbl}`);
    const rowCount = Number(countResult.toArray()[0]?.toJSON().count || 0);

    // Get full schema info from DESCRIBE — already the post-conversion shape.
    const describeResult = await conn.query(`DESCRIBE ${tbl}`);
    const describeRows = describeResult.toArray().map((row) => row.toJSON());

    const columns = describeRows.map((row) => String(row.column_name));
    const schema = describeRows.map((row) => {
      const name = String(row.column_name);
      const entry: ColumnSchema = {
        name,
        type: mapDuckDBType(String(row.column_type)),
        nullable: row.null === 'YES',
        originalType: String(row.column_type),
      };
      if (name === ROWID_COLUMN) entry.system = true;
      return entry;
    });

    return { tableName, rowCount, columns, schema };
  } finally {
    // Clean up virtual file
    await db.dropFile(fileName);
  }
}
