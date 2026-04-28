/**
 * JSON data loader using DuckDB's native JSON parsing
 */

import { ROWID_COLUMN, type ColumnSchema } from '../../core/types';
import { mapDuckDBType } from '../../data/SchemaDetector';
import { getDatabase, getConnection } from '../duckdb';
import {
  enhanceSchemaTypes,
  quoteIdentifier,
  wrapReservedColumnError,
  makeReservedColumnError,
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
 * Detect if data is NDJSON (newline-delimited JSON)
 * NDJSON has one JSON object per line, not wrapped in an array
 */
function isNDJSON(data: string): boolean {
  const lines = data.trim().split('\n');
  if (lines.length < 2) return false;

  try {
    const first = JSON.parse(lines[0]!);
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
  const format = options.format || (isNDJSON(jsonString) ? 'ndjson' : 'array');

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

    // Inject a synthetic __rowid__ as the first column of a new table.
    // DuckDB silently aliases a duplicate column name in the projection
    // (producing __rowid___1) rather than throwing, so preflight with
    // DESCRIBE to reject sources that already have a __rowid__ column.
    // The wrapReservedColumnError catch below stays as defense-in-depth.
    const optionsStr = `, ${jsonOptions.join(', ')}`;
    const probeResult = await conn.query(
      `DESCRIBE SELECT * FROM read_json_auto('${fileName}'${optionsStr})`,
    );
    const probeColumns = probeResult.toArray().map((row) => String(row.toJSON().column_name));
    if (probeColumns.includes(ROWID_COLUMN)) {
      throw makeReservedColumnError();
    }

    const tbl = quoteIdentifier(tableName);
    // Always cast __rowid__ to BIGINT — see the matching note in csv.ts for
    // the rationale (single typed-array shape on read, symmetry across
    // loaders). The reserved-name guard above is case-sensitive.
    const createSql = `CREATE OR REPLACE TABLE ${tbl} AS SELECT CAST(row_number() OVER () - 1 AS BIGINT) AS ${quoteIdentifier(ROWID_COLUMN)}, * FROM read_json_auto('${fileName}'${optionsStr})`;
    try {
      await conn.query(createSql);
    } catch (err) {
      throw wrapReservedColumnError(err);
    }

    // Get row count
    const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tbl}`);
    const rowCount = Number(countResult.toArray()[0]?.toJSON().count || 0);

    // Get full schema info from DESCRIBE
    const describeResult = await conn.query(`DESCRIBE ${tbl}`);
    let describeRows = describeResult.toArray().map((row) => row.toJSON());

    // Enhance schema by detecting and converting string columns to appropriate types
    // This detects ISO timestamps in VARCHAR columns and converts them to TIMESTAMP
    describeRows = await enhanceSchemaTypes(conn, tableName, describeRows);

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
