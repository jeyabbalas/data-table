/**
 * Memory check for Parquet loads.
 *
 * DuckDB-WASM keeps loaded tables in WebAssembly memory, which wasm32 caps at
 * 4 GiB, and refuses allocations past its own `memory_limit` (3.1 GiB by
 * default). A load that does not fit used to fail late — after reading most
 * of the file — with a raw DuckDB "Out of Memory" message. This module
 * estimates the table's size from the Parquet footer and a small sample
 * before anything is loaded, and uses the estimate to choose how DuckDB
 * reads the file:
 *
 * - `prefetch`: read a whole row group at a time. As fast as copying the
 *   file into memory, and costs about one row group of extra memory.
 * - `lazy`: read column chunks from disk as they are decoded. Two to four
 *   times slower, and the smallest peak.
 * - `buffered`: the source is already an in-memory buffer inside DuckDB, so
 *   the whole file counts against the budget.
 *
 * Loads that would not fit at all throw `LOAD_MEMORY_EXCEEDED` up front.
 *
 * The costs below were measured on DuckDB 1.5.4 (duckdb-wasm 1.33.1-dev57);
 * see docs/dev/memory-envelope.md. `memoryBudget.duckdb.test.ts` checks the
 * table estimate against DuckDB's own accounting, so a DuckDB upgrade that
 * moves them fails there rather than in a user's browser.
 */

import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { isNestedType } from '../../core/types';
import { quoteIdentifier } from './common';

const MiB = 2 ** 20;
const GiB = 2 ** 30;

/** wasm32 linear memory ceiling: 65,536 pages of 64 KiB. */
export const WASM_MEMORY_BYTES = 4 * GiB;

/** DuckDB keeps each column of a table row group in blocks of this size. */
const BLOCK_BYTES = 256 * 1024;
/** Rows in a DuckDB table row group. */
const ROW_GROUP_ROWS = 122_880;
/**
 * Values in a column's first segment. DuckDB starts each column of a new
 * table with a segment sized for one vector, and switches to whole blocks
 * once it fills.
 */
const VECTOR_ROWS = 2048;
/** Bytes per value in the first segment of a text or nested column. */
const REFERENCE_SLOT_BYTES = 16;
/** A column's first validity segment: one bit per row, for 16,384 rows. */
const HEAD_VALIDITY_BYTES = 2048;
/**
 * Bookkeeping per column of the first row group, beyond its segments.
 * Measured at about 4 KiB.
 */
const HEAD_OVERHEAD_BYTES = 4 * 1024;
/**
 * Most scan memory DuckDB holds per column while it decodes a Parquet file.
 * Measured at 0.64–0.92 MiB for column chunks of about 1 MiB; the top of
 * that range keeps the peak estimate an upper bound, so loads may use all
 * of WebAssembly memory.
 */
const SCAN_BYTES_PER_COLUMN = 0.95 * MiB;
/**
 * Scan memory per column before counting its column chunk. Measured at
 * 150–350 KiB for chunks of a few KiB, text columns the most.
 */
const SCAN_BASE_BYTES = 384 * 1024;
/** Fixed working memory of a load, independent of the file's shape. */
const LOAD_BASE_BYTES = 64 * MiB;
/** Share of DuckDB's free memory a new table may take; the rest is for queries. */
const TABLE_SHARE = 0.95;
/** Rows sampled to measure average text length. */
const LENGTH_SAMPLE_ROWS = 2048;

/** Value width assumed for nested types, whose size depends on their contents. */
const NESTED_VALUE_BYTES = 40;

const TEXT_TYPE = /^(VARCHAR|BLOB|BIT|JSON)\b/;

/**
 * Bytes one value of `columnType` takes in a DuckDB column segment. Text is a
 * 4-byte offset plus its bytes, with `averageLength` the mean byte length;
 * other types ignore it.
 */
export function valueWidth(columnType: string, averageLength = 8): number {
  const type = columnType.trim().toUpperCase();
  if (isNestedType(type)) return NESTED_VALUE_BYTES;
  if (TEXT_TYPE.test(type)) return 4 + Math.max(0, averageLength);
  const decimal = /^DECIMAL\((\d+)/.exec(type);
  if (decimal) return Number(decimal[1]) > 18 ? 16 : 8;
  if (/^(BOOLEAN|U?TINYINT)$/.test(type)) return 1;
  if (/^U?SMALLINT$/.test(type)) return 2;
  if (/^(U?INTEGER|FLOAT|DATE)$/.test(type)) return 4;
  if (/^(U?BIGINT|DOUBLE|TIME|TIMESTAMP)/.test(type)) return 8;
  return 16; // HUGEINT, INTERVAL, UUID, and anything unrecognized
}

/**
 * Bytes of a column's first segment, sized for one vector of values. Text
 * and nested columns hold 16-byte references there, however long their
 * values; other types hold `width`-byte values.
 */
export function firstSegmentBytes(columnType: string, width: number): number {
  const type = columnType.trim().toUpperCase();
  const slot = isNestedType(type) || TEXT_TYPE.test(type) ? REFERENCE_SLOT_BYTES : width;
  return Math.min(BLOCK_BYTES, VECTOR_ROWS * slot);
}

/**
 * Size of an in-memory DuckDB table with `rows` rows and columns of the
 * given value widths. Each column of each 122,880-row row group takes whole
 * 256 KiB blocks for its values, plus one block for its validity mask. The
 * first row group is the exception: there each column starts with a
 * one-vector segment (`headBytes`, by default 2,048 values of its width)
 * and a 2 KiB validity segment, and takes whole blocks only as those fill.
 * This matches DuckDB's own accounting to within a few percent from one row
 * to millions. A flat per-cell cost is a third low for short, wide tables,
 * and whole blocks alone are many times too high for tables of a few
 * thousand rows.
 */
export function estimateTableBytes(rows: number, widths: number[], headBytes?: number[]): number {
  if (rows <= 0) return 0;
  const firstGroupRows = Math.min(rows, ROW_GROUP_ROWS);
  const laterRows = rows - firstGroupRows;
  const fullGroups = Math.floor(laterRows / ROW_GROUP_ROWS);
  const lastGroupRows = laterRows % ROW_GROUP_ROWS;
  const blocks = (bytes: number): number => Math.ceil(bytes / BLOCK_BYTES) * BLOCK_BYTES;
  const group = (groupRows: number, width: number): number =>
    blocks(groupRows * width) + BLOCK_BYTES;
  let total = 0;
  widths.forEach((width, i) => {
    const head = headBytes?.[i] ?? Math.min(BLOCK_BYTES, VECTOR_ROWS * width);
    total += head + blocks(Math.max(0, firstGroupRows * width - head));
    total += HEAD_VALIDITY_BYTES + (firstGroupRows > HEAD_VALIDITY_BYTES * 8 ? BLOCK_BYTES : 0);
    total += HEAD_OVERHEAD_BYTES;
    total += fullGroups * group(ROW_GROUP_ROWS, width);
    if (lastGroupRows > 0) total += group(lastGroupRows, width);
  });
  return total;
}

/**
 * Scan memory DuckDB holds for one column while it decodes a Parquet file,
 * given the uncompressed size of the column's largest column chunk: a base
 * plus the chunk, up to the ~1 MiB measured for chunks of 122,880 rows.
 * Larger chunks keep that cap, so the estimate stays where it was measured
 * for large files; small chunks, as in short files, cost a fraction of it.
 */
export function scanBytesPerColumn(chunkBytes: number): number {
  return Math.min(SCAN_BYTES_PER_COLUMN, SCAN_BASE_BYTES + Math.max(0, chunkBytes));
}

/** Parse a DuckDB memory setting such as `3.1 GiB` or `512MB` into bytes. */
export function parseMemorySize(text: string): number | null {
  const match = /^\s*([\d.]+)\s*([KMGT]?i?B|bytes?)?\s*$/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] ?? 'B').toUpperCase();
  const powers: Record<string, number> = {
    B: 1,
    BYTE: 1,
    BYTES: 1,
    KB: 1e3,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    KIB: 2 ** 10,
    MIB: 2 ** 20,
    GIB: 2 ** 30,
    TIB: 2 ** 40,
  };
  const power = powers[unit];
  return power === undefined ? null : value * power;
}

/** What a Parquet file will cost once loaded. */
export interface ParquetFootprint {
  rows: number;
  /** Columns in the loaded table, `__rowid__` included. */
  columns: number;
  /** Estimated size of the loaded table. */
  tableBytes: number;
  /** Estimated scan memory for decoding the columns loaded, all together. */
  scanBytes: number;
  /**
   * Compressed size of the largest row group, counting the columns loaded:
   * what DuckDB prefetches from it.
   */
  largestRowGroupBytes: number;
  fileBytes: number;
}

/** DuckDB's memory limit and what is already in use. */
export interface MemoryBudget {
  limitBytes: number;
  usedBytes: number;
}

export type ParquetReadMode = 'prefetch' | 'lazy' | 'buffered';

/** The check a Parquet load fails, with the two numbers it compared. */
export interface FitFailure {
  /**
   * `table`: the table needs more than its share of DuckDB's free memory.
   * `peak`: the load's peak would pass the 4 GiB WebAssembly ceiling.
   */
  check: 'table' | 'peak';
  neededBytes: number;
  availableBytes: number;
}

/** A read mode, or the check that rules every mode out. */
export type ParquetReadPlan =
  { mode: ParquetReadMode; failure?: undefined } | { mode: null; failure: FitFailure };

/**
 * Why a load does not fit, for `LOAD_MEMORY_EXCEEDED`. Stage `estimate`
 * rejected it before loading, by the check in `failure`; stage `load` means
 * DuckDB ran out mid-load.
 */
export type MemoryShortfall = {
  footprint: ParquetFootprint;
  budget: MemoryBudget;
  /** The source was an in-memory buffer rather than a file DuckDB could read lazily. */
  buffered: boolean;
} & ({ stage: 'estimate'; failure: FitFailure } | { stage: 'load' });

/** Working memory of a load at its peak, table included, before any prefetch. */
function scanPeakBytes(footprint: ParquetFootprint): number {
  return footprint.tableBytes + footprint.scanBytes + LOAD_BASE_BYTES;
}

/**
 * Choose how to read a Parquet source, or name the check it fails.
 *
 * `fromFile` is true when DuckDB reads the source from a registered file
 * handle (and so can read lazily), false when the bytes are already a buffer
 * in DuckDB's memory.
 */
export function fitParquetRead(
  footprint: ParquetFootprint,
  budget: MemoryBudget,
  fromFile: boolean,
): ParquetReadPlan {
  const free = Math.max(0, budget.limitBytes - budget.usedBytes);
  const tableRoom = free * TABLE_SHARE;
  if (footprint.tableBytes > tableRoom) {
    return {
      mode: null,
      failure: { check: 'table', neededBytes: footprint.tableBytes, availableBytes: tableRoom },
    };
  }

  const wasmRoom = WASM_MEMORY_BYTES - budget.usedBytes;
  const scanPeak = scanPeakBytes(footprint);
  const peak = fromFile ? scanPeak : scanPeak + footprint.fileBytes;
  if (peak > wasmRoom) {
    return {
      mode: null,
      failure: { check: 'peak', neededBytes: peak, availableBytes: Math.max(0, wasmRoom) },
    };
  }

  if (!fromFile) return { mode: 'buffered' };
  return { mode: scanPeak + footprint.largestRowGroupBytes <= wasmRoom ? 'prefetch' : 'lazy' };
}

/** {@link fitParquetRead}'s read mode, or null when the load will not fit. */
export function planParquetRead(
  footprint: ParquetFootprint,
  budget: MemoryBudget,
  fromFile: boolean,
): ParquetReadMode | null {
  return fitParquetRead(footprint, budget, fromFile).mode;
}

async function queryRows(conn: AsyncDuckDBConnection, sql: string) {
  const result = await conn.query(sql);
  return result.toArray().map((row) => row.toJSON() as Record<string, unknown>);
}

/**
 * DuckDB prefetches a whole row group, not just the columns read, once they
 * make up more than this share of its bytes (the Parquet reader's
 * `WHOLE_GROUP_PREFETCH_MINIMUM_SCAN`).
 */
const WHOLE_GROUP_PREFETCH_SHARE = 0.95;

/**
 * The leaf columns (`parquet_metadata`'s `column_id`) under the top-level
 * columns named, from the schema tree `parquet_schema` lists depth first.
 * Null if a name is not a top-level column or the tree does not add up; the
 * caller then counts every column. `path_in_schema` cannot say this: it
 * joins path parts with `, `, which a column name may hold too.
 */
async function leafColumnIds(
  conn: AsyncDuckDBConnection,
  fileName: string,
  names: readonly string[],
): Promise<number[] | null> {
  const nodes = await queryRows(
    conn,
    `SELECT name, num_children FROM parquet_schema('${fileName}')`,
  );
  let next = 1; // nodes[0] is the root
  let leaf = 0;
  // The leaf ids of the subtree at `next`, which it moves past.
  const subtree = (): number[] | null => {
    const node = nodes[next++];
    if (!node) return null;
    const children = Number(node['num_children'] ?? 0);
    if (children <= 0) return [leaf++];
    const ids: number[] = [];
    for (let i = 0; i < children; i++) {
      const child = subtree();
      if (!child) return null;
      ids.push(...child);
    }
    return ids;
  };
  const byName = new Map<string, number[]>();
  const topLevel = Number(nodes[0]?.['num_children'] ?? 0);
  for (let i = 0; i < topLevel; i++) {
    const name = String(nodes[next]?.['name']);
    const ids = subtree();
    if (!ids) return null;
    byName.set(name, ids);
  }
  if (next !== nodes.length) return null;
  const ids: number[] = [];
  for (const name of names) {
    const own = byName.get(name);
    if (!own) return null;
    ids.push(...own);
  }
  return ids;
}

/**
 * Estimate the loaded size of `fileName` projected to `describeRows` (the
 * DESCRIBE of the load's SELECT, without `__rowid__`). Reads the footer and
 * the first {@link LENGTH_SAMPLE_ROWS} rows of text columns only.
 *
 * @param projection - The top-level columns a projection loads, if it does:
 *   the scan and prefetch estimates then count only theirs, as DuckDB reads
 *   only theirs. Without it, or if the schema cannot be matched to it, they
 *   count every column, which only errs high.
 */
export async function measureParquetFootprint(
  conn: AsyncDuckDBConnection,
  fileName: string,
  describeRows: Record<string, unknown>[],
  projection?: readonly string[],
): Promise<ParquetFootprint> {
  const [file] = await queryRows(
    conn,
    `SELECT num_rows, file_size_bytes FROM parquet_file_metadata('${fileName}')`,
  );
  const leaves = projection ? await leafColumnIds(conn, fileName, projection) : null;
  const read = leaves ? `column_id IN (${leaves.join(', ') || 'NULL'})` : 'true';
  // A row group's bytes that DuckDB prefetches: those of the columns read,
  // or all of them once those are nearly all.
  const [rowGroup] = await queryRows(
    conn,
    `SELECT max(CASE WHEN loaded > ${WHOLE_GROUP_PREFETCH_SHARE} * total THEN total ELSE loaded END) AS bytes
     FROM (
       SELECT sum(total_compressed_size) AS total,
              coalesce(sum(total_compressed_size) FILTER (WHERE ${read}), 0) AS loaded
       FROM parquet_metadata('${fileName}') GROUP BY row_group_id
     )`,
  );
  // Each leaf column's largest chunk, which sets its scan memory.
  const chunks = await queryRows(
    conn,
    `SELECT max(total_uncompressed_size) AS bytes FROM parquet_metadata('${fileName}')
     WHERE ${read} GROUP BY column_id`,
  );
  const rows = Number(file?.['num_rows'] ?? 0);

  const columns = describeRows.map((row) => ({
    name: String(row['column_name']),
    type: String(row['column_type']),
  }));
  const textColumns = columns.filter((c) => /^(VARCHAR|BLOB|BIT|JSON)\b/i.test(c.type));
  const averageLength = new Map<string, number>();
  if (rows > 0 && textColumns.length > 0) {
    // Best effort: the sample decodes each text column's first page, which
    // can itself be tens of MiB. If it fails, the lengths default, and a
    // load that truly does not fit still fails as LOAD_MEMORY_EXCEEDED when
    // the table is built.
    try {
      const [sample] = await queryRows(
        conn,
        `SELECT ${textColumns
          .map((c, i) => {
            // strlen counts bytes, like octet_length does for binary types.
            const length = /^(VARCHAR|JSON)\b/i.test(c.type) ? 'strlen' : 'octet_length';
            return `avg(${length}(${quoteIdentifier(c.name)})) AS "${i}"`;
          })
          .join(', ')}
         FROM (SELECT ${textColumns.map((c) => quoteIdentifier(c.name)).join(', ')}
               FROM read_parquet('${fileName}') LIMIT ${LENGTH_SAMPLE_ROWS})`,
      );
      textColumns.forEach((c, i) => averageLength.set(c.name, Number(sample?.[String(i)] ?? 0)));
    } catch {
      // Keep the default lengths.
    }
  }

  const types = ['BIGINT', ...columns.map((c) => c.type)]; // __rowid__ first
  const widths = types.map((type, i) =>
    valueWidth(type, i === 0 ? undefined : averageLength.get(columns[i - 1]!.name)),
  );
  const heads = types.map((type, i) => firstSegmentBytes(type, widths[i]!));

  // Columns without a chunk (__rowid__, or every column of a file with no
  // row groups) have nothing to decode, and cost only the base.
  const scanBytes =
    chunks.reduce((sum, chunk) => sum + scanBytesPerColumn(Number(chunk['bytes'] ?? 0)), 0) +
    Math.max(0, types.length - chunks.length) * SCAN_BASE_BYTES;

  return {
    rows,
    columns: types.length,
    tableBytes: estimateTableBytes(rows, widths, heads),
    scanBytes,
    largestRowGroupBytes: Number(rowGroup?.['bytes'] ?? 0),
    fileBytes: Number(file?.['file_size_bytes'] ?? 0),
  };
}

/** DuckDB's memory limit and current usage. */
export async function readMemoryBudget(conn: AsyncDuckDBConnection): Promise<MemoryBudget> {
  const [row] = await queryRows(
    conn,
    `SELECT current_setting('memory_limit') AS lim,
            (SELECT sum(memory_usage_bytes) FROM duckdb_memory()) AS used`,
  );
  const limit = parseMemorySize(String(row?.['lim'] ?? ''));
  return {
    // An unparseable limit leaves the wasm32 ceiling as the only bound.
    limitBytes: limit ?? WASM_MEMORY_BYTES,
    usedBytes: Number(row?.['used'] ?? 0),
  };
}

/**
 * DuckDB's out-of-memory message in `err` or its cause chain, or undefined
 * when there is none.
 */
export function outOfMemoryMessage(err: unknown): string | undefined {
  for (let e = err, depth = 0; e && depth < 4; depth++) {
    const message = e instanceof Error ? e.message : String(e);
    if (/out of memory/i.test(message)) return message;
    e = e instanceof Error ? e.cause : undefined;
  }
  return undefined;
}

/** Whether `err` (or its cause) is DuckDB running out of memory. */
export function isOutOfMemoryError(err: unknown): boolean {
  return outOfMemoryMessage(err) !== undefined;
}

function formatBytes(bytes: number): string {
  return bytes >= GiB ? `${(bytes / GiB).toFixed(1)} GiB` : `${Math.round(bytes / MiB)} MiB`;
}

/**
 * Build the `LOAD_MEMORY_EXCEEDED` error for a Parquet load that does not
 * fit. The message names the check that failed and its numbers. At stage
 * `load`, DuckDB's own message goes in `details.duckdbMessage` as well as
 * `cause`: only `code`, `message` and `details` cross the worker boundary.
 */
export function memoryExceededError(shortfall: MemoryShortfall, cause?: unknown): Error {
  const { footprint, budget, buffered } = shortfall;
  const shape = `${footprint.rows.toLocaleString('en-US')} rows × ${(footprint.columns - 1).toLocaleString('en-US')} columns`;
  const details: Record<string, unknown> = {
    stage: shortfall.stage,
    rows: footprint.rows,
    columns: footprint.columns - 1,
    estimatedBytes: Math.round(footprint.tableBytes),
    memoryLimitBytes: Math.round(budget.limitBytes),
    usedBytes: Math.round(budget.usedBytes),
  };

  let message: string;
  if (shortfall.stage === 'estimate') {
    const { check, neededBytes, availableBytes } = shortfall.failure;
    Object.assign(details, {
      check,
      neededBytes: Math.round(neededBytes),
      availableBytes: Math.round(availableBytes),
    });
    if (check === 'table') {
      const free = Math.max(0, budget.limitBytes - budget.usedBytes);
      message =
        `Not enough memory to load this Parquet file: its ${shape} need about ` +
        `${formatBytes(neededBytes)} once loaded, more than the ${formatBytes(availableBytes)} ` +
        `a new table may take (${TABLE_SHARE * 100}% of the ${formatBytes(free)} DuckDB has free).`;
    } else {
      const parts = [
        `${formatBytes(footprint.tableBytes)} for the table`,
        `${formatBytes(footprint.scanBytes + LOAD_BASE_BYTES)} to decode the file`,
      ];
      if (buffered) parts.push(`${formatBytes(footprint.fileBytes)} for the file itself`);
      message =
        `Not enough memory to load this Parquet file: loading its ${shape} would peak at about ` +
        `${formatBytes(neededBytes)} (${parts.join(', ')}), more than the ` +
        `${formatBytes(availableBytes)} left of WebAssembly's 4 GiB.`;
    }
  } else {
    const duckdbMessage = outOfMemoryMessage(cause);
    message =
      `Ran out of memory loading this Parquet file (${shape}, about ` +
      `${formatBytes(footprint.tableBytes)} once loaded).`;
    if (duckdbMessage !== undefined) {
      details['duckdbMessage'] = duckdbMessage;
      // DuckDB's first line says what failed; the rest is advice about
      // temp directories that does not apply in the browser.
      const firstLine = duckdbMessage.split('\n')[0]!.trim();
      message += ` DuckDB: ${firstLine}${/[.!?]$/.test(firstLine) ? '' : '.'}`;
    }
  }

  if (budget.usedBytes > budget.limitBytes * 0.05) {
    message += ` Tables already loaded use ${formatBytes(budget.usedBytes)}.`;
  }
  message += ' Load fewer rows or columns.';
  if (buffered) {
    message +=
      ' Passing the file as a File, Blob or URL instead of an ArrayBuffer lets DuckDB read it from disk, which needs less memory.';
  }
  return Object.assign(new Error(message, cause === undefined ? undefined : { cause }), {
    code: 'LOAD_MEMORY_EXCEEDED',
    details,
  });
}
