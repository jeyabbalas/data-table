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
 * Scan buffers DuckDB holds per column while it decodes a Parquet file.
 * Measured at 0.64–0.92 MiB; the top of that range keeps the peak estimate
 * an upper bound, so loads may use all of WebAssembly memory.
 */
const SCAN_BYTES_PER_COLUMN = 0.95 * MiB;
/** Fixed working memory of a load, independent of the file's shape. */
const LOAD_BASE_BYTES = 64 * MiB;
/** Share of DuckDB's free memory a new table may take; the rest is for queries. */
const TABLE_SHARE = 0.95;
/** Rows sampled to measure average text length. */
const LENGTH_SAMPLE_ROWS = 2048;

/** Value width assumed for nested types, whose size depends on their contents. */
const NESTED_VALUE_BYTES = 40;

/**
 * Bytes one value of `columnType` takes in a DuckDB column segment. Text is a
 * 4-byte offset plus its bytes, with `averageLength` the mean byte length;
 * other types ignore it.
 */
export function valueWidth(columnType: string, averageLength = 8): number {
  const type = columnType.trim().toUpperCase();
  if (/[[\]]|^(STRUCT|MAP|UNION)\b/.test(type)) return NESTED_VALUE_BYTES;
  if (/^(VARCHAR|BLOB|BIT|JSON)\b/.test(type)) return 4 + Math.max(0, averageLength);
  const decimal = /^DECIMAL\((\d+)/.exec(type);
  if (decimal) return Number(decimal[1]) > 18 ? 16 : 8;
  if (/^(BOOLEAN|U?TINYINT)$/.test(type)) return 1;
  if (/^U?SMALLINT$/.test(type)) return 2;
  if (/^(U?INTEGER|FLOAT|DATE)$/.test(type)) return 4;
  if (/^(U?BIGINT|DOUBLE|TIME|TIMESTAMP)/.test(type)) return 8;
  return 16; // HUGEINT, INTERVAL, UUID, and anything unrecognized
}

/**
 * Size of an in-memory DuckDB table with `rows` rows and columns of the
 * given value widths. Each column of each 122,880-row row group takes whole
 * 256 KiB blocks for its values, plus one block for its validity mask; this
 * matches DuckDB's own accounting to within a few percent, where a flat
 * per-cell cost is a third low for short, wide tables.
 */
export function estimateTableBytes(rows: number, widths: number[]): number {
  const fullGroups = Math.floor(rows / ROW_GROUP_ROWS);
  const lastGroupRows = rows % ROW_GROUP_ROWS;
  const blocks = (groupRows: number, width: number): number =>
    Math.ceil((groupRows * width) / BLOCK_BYTES) + 1;
  let total = 0;
  for (const width of widths) {
    total += fullGroups * blocks(ROW_GROUP_ROWS, width);
    if (lastGroupRows > 0) total += blocks(lastGroupRows, width);
  }
  return total * BLOCK_BYTES;
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
  /** Compressed size of the file's largest row group. */
  largestRowGroupBytes: number;
  fileBytes: number;
}

/** DuckDB's memory limit and what is already in use. */
export interface MemoryBudget {
  limitBytes: number;
  usedBytes: number;
}

export type ParquetReadMode = 'prefetch' | 'lazy' | 'buffered';

/** Why a load does not fit, for `LOAD_MEMORY_EXCEEDED`. */
export interface MemoryShortfall {
  footprint: ParquetFootprint;
  budget: MemoryBudget;
  /** `estimate`: rejected before loading; `load`: DuckDB ran out mid-load. */
  stage: 'estimate' | 'load';
  /** The source was an in-memory buffer rather than a file DuckDB could read lazily. */
  buffered: boolean;
}

/**
 * Choose how to read a Parquet source, or return null when it will not fit.
 *
 * `fromFile` is true when DuckDB reads the source from a registered file
 * handle (and so can read lazily), false when the bytes are already a buffer
 * in DuckDB's memory.
 */
export function planParquetRead(
  footprint: ParquetFootprint,
  budget: MemoryBudget,
  fromFile: boolean,
): ParquetReadMode | null {
  const free = Math.max(0, budget.limitBytes - budget.usedBytes);
  if (footprint.tableBytes > free * TABLE_SHARE) return null;

  const wasmRoom = WASM_MEMORY_BYTES - budget.usedBytes;
  const scanPeak =
    footprint.tableBytes + footprint.columns * SCAN_BYTES_PER_COLUMN + LOAD_BASE_BYTES;

  if (!fromFile) return scanPeak + footprint.fileBytes <= wasmRoom ? 'buffered' : null;
  if (scanPeak + footprint.largestRowGroupBytes <= wasmRoom) return 'prefetch';
  return scanPeak <= wasmRoom ? 'lazy' : null;
}

async function queryRows(conn: AsyncDuckDBConnection, sql: string) {
  const result = await conn.query(sql);
  return result.toArray().map((row) => row.toJSON() as Record<string, unknown>);
}

/**
 * Estimate the loaded size of `fileName` projected to `describeRows` (the
 * DESCRIBE of the load's SELECT, without `__rowid__`). Reads the footer and
 * the first {@link LENGTH_SAMPLE_ROWS} rows of text columns only.
 */
export async function measureParquetFootprint(
  conn: AsyncDuckDBConnection,
  fileName: string,
  describeRows: Record<string, unknown>[],
): Promise<ParquetFootprint> {
  const [file] = await queryRows(
    conn,
    `SELECT num_rows, file_size_bytes FROM parquet_file_metadata('${fileName}')`,
  );
  const [rowGroup] = await queryRows(
    conn,
    `SELECT max(bytes) AS bytes FROM (
       SELECT sum(total_compressed_size) AS bytes FROM parquet_metadata('${fileName}') GROUP BY row_group_id
     )`,
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

  const widths = [
    valueWidth('BIGINT'), // __rowid__
    ...columns.map((c) => valueWidth(c.type, averageLength.get(c.name))),
  ];

  return {
    rows,
    columns: columns.length + 1,
    tableBytes: estimateTableBytes(rows, widths),
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

/** Whether `err` (or its cause) is DuckDB running out of memory. */
export function isOutOfMemoryError(err: unknown): boolean {
  for (let e = err, depth = 0; e && depth < 4; depth++) {
    const message = e instanceof Error ? e.message : String(e);
    if (/out of memory/i.test(message)) return true;
    e = e instanceof Error ? e.cause : undefined;
  }
  return false;
}

function formatBytes(bytes: number): string {
  return bytes >= GiB ? `${(bytes / GiB).toFixed(1)} GiB` : `${Math.round(bytes / MiB)} MiB`;
}

/** Build the `LOAD_MEMORY_EXCEEDED` error for a Parquet load that does not fit. */
export function memoryExceededError(shortfall: MemoryShortfall, cause?: unknown): Error {
  const { footprint, budget, stage, buffered } = shortfall;
  const free = Math.max(0, budget.limitBytes - budget.usedBytes);
  const shape = `${footprint.rows.toLocaleString('en-US')} rows × ${(footprint.columns - 1).toLocaleString('en-US')} columns`;
  let message =
    stage === 'estimate'
      ? `Not enough memory to load this Parquet file: its ${shape} need about ` +
        `${formatBytes(footprint.tableBytes)} once loaded, and about ${formatBytes(free)} is free.`
      : `Ran out of memory loading this Parquet file (${shape}, about ` +
        `${formatBytes(footprint.tableBytes)} once loaded).`;
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
    details: {
      stage,
      rows: footprint.rows,
      columns: footprint.columns - 1,
      estimatedBytes: Math.round(footprint.tableBytes),
      memoryLimitBytes: Math.round(budget.limitBytes),
      usedBytes: Math.round(budget.usedBytes),
    },
  });
}
