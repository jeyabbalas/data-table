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
 * Nested columns (LIST, ARRAY, STRUCT, MAP, UNION, VARIANT) are sized from
 * the columns DuckDB stores for them, which {@link storageColumns} reads
 * off the type, with list lengths and text lengths from the same sample.
 *
 * The costs below were measured on DuckDB 1.5.4 (duckdb-wasm 1.33.1-dev57);
 * see docs/dev/memory-envelope.md. `memoryBudget.duckdb.test.ts` checks the
 * table estimate against DuckDB's own accounting, so a DuckDB upgrade that
 * moves them fails there rather than in a user's browser.
 */

import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { dataTypeOf, parseDuckDBType, type DuckDBTypeNode } from '../../core/duckdbType';
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
/**
 * Bytes per value in the first segment of a text column or of a LIST's
 * offsets. DuckDB sizes that segment for one vector of its in-memory
 * values, 16-byte `string_t` and `list_entry_t`, whatever it then stores
 * per value.
 */
const REFERENCE_SLOT_BYTES = 16;
/** A column's first validity segment: one bit per value, for 16,384 values. */
const HEAD_VALIDITY_BYTES = 2048;
/**
 * Bookkeeping per column of the first row group, beyond its segments.
 * Measured at about 4 KiB: what the Parquet reader's file cache keeps per
 * column chunk it read, so a nested column pays it per leaf.
 */
const HEAD_OVERHEAD_BYTES = 4 * 1024;
/**
 * Bytes DuckDB stores per row of a LIST or MAP: the end offset of the row's
 * items in its child column. The first segment holds 4,096 of them (one
 * vector of 16-byte slots).
 */
const LIST_OFFSET_BYTES = 8;
/**
 * Items assumed per list or map the length sample does not measure: lists
 * and maps inside another list, map or array, and all of them when the
 * sample fails.
 */
const DEFAULT_LIST_ITEMS = 4;
/** Bytes assumed per text value when the sample does not measure them. */
const DEFAULT_TEXT_LENGTH = 8;
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
/** Rows sampled to measure average text and list lengths. */
const LENGTH_SAMPLE_ROWS = 2048;

/** Scalar types stored as text (a 4-byte offset plus their bytes), measured with `strlen`. */
const STRING_NAMES = new Set(['VARCHAR', 'CHAR', 'BPCHAR', 'TEXT', 'STRING']);
/** Scalar types stored as text, measured with `octet_length`. */
const BINARY_NAMES = new Set(['BLOB', 'BYTEA', 'BINARY', 'VARBINARY', 'BIT', 'BITSTRING']);

/**
 * How to measure a value of `node` in bytes, if DuckDB stores it as text (a
 * VARCHAR, BLOB, BIT or JSON): SQL for the length of `value`. Null for
 * every other type, lists and structs of text included. `strlen` counts
 * bytes, like `octet_length` does for binary types.
 */
function textLength(node: DuckDBTypeNode): ((value: string) => string) | null {
  // Text is cast to VARCHAR first, which costs nothing for a VARCHAR: a
  // JSON value read from Parquet has no `strlen` (a Binder error) until the
  // json extension has loaded, and nothing loads it before a Parquet load.
  if (node.kind === 'json' || (node.kind === 'scalar' && STRING_NAMES.has(node.name))) {
    return (value) => `strlen(CAST(${value} AS VARCHAR))`;
  }
  if (node.kind === 'scalar' && BINARY_NAMES.has(node.name)) {
    return (value) => `octet_length(${value})`;
  }
  return null;
}

/** Bytes one value of a fixed-size scalar type takes. */
function scalarWidth(sqlType: string): number {
  const type = sqlType.trim().toUpperCase();
  const decimal = /^DECIMAL\((\d+)/.exec(type);
  if (decimal) return Number(decimal[1]) > 18 ? 16 : 8;
  if (/^(BOOLEAN|U?TINYINT)$/.test(type)) return 1;
  if (/^U?SMALLINT$/.test(type)) return 2;
  if (/^(U?INTEGER|FLOAT|DATE)$/.test(type)) return 4;
  if (/^(U?BIGINT|DOUBLE|TIME|TIMESTAMP)/.test(type)) return 8;
  return 16; // HUGEINT, INTERVAL, UUID, and anything unrecognized
}

/**
 * One of the columns DuckDB stores for a table column: its values in
 * segments, and a validity mask in segments of its own. A scalar column is
 * one. A nested column is a tree of them (DuckDB's `ColumnData`), which
 * {@link storageColumns} lists:
 *
 * - LIST: an 8-byte offset per row, and a child column of the rows' items.
 * - ARRAY: a validity mask only, and a child column of `size` items per row.
 * - STRUCT: a validity mask only, and a column per field.
 * - MAP: a LIST of `STRUCT(key, value)`.
 * - UNION: a STRUCT of a UTINYINT tag and a column per member, each holding
 *   a value (NULL unless the tag picks it) for every row.
 * - VARIANT: a STRUCT of four columns; see {@link VariantLengths}.
 *
 * Measured with duckdb_memory() on tables of 1 to 200,000 rows: INTEGER[],
 * VARCHAR[], JSON[], INTEGER[][], FLOAT[] and FLOAT[768], STRUCT(x DOUBLE,
 * y DOUBLE, tier VARCHAR), STRUCT(id INTEGER, tags VARCHAR[]), a LIST of
 * STRUCT, MAP(VARCHAR, INTEGER), UNION(i INTEGER, s VARCHAR) and VARIANT
 * take exactly what these columns predict, to the block, given the true
 * lengths of their lists and text.
 */
export interface StorageColumn {
  /** Values it holds per table row: 1, or the items of the lists above it. */
  readonly perRow: number;
  /** Bytes per value in its data segments; 0 for a column with a validity mask only. */
  readonly width: number;
  /** Bytes of its first data segment in a new table: one vector of slots, at most a block. */
  readonly headBytes: number;
  /** A leaf of the type, which a Parquet file keeps as a column chunk of its own. */
  readonly leaf: boolean;
}

/**
 * A VARIANT value as its DuckDB text (`CAST(v AS VARCHAR)`) shows it,
 * averaged per value: the text's length, and its nodes (values, arrays and
 * objects alike), counted as 1 + its commas + its `[` and `{`.
 *
 * DuckDB stores a VARIANT as a STRUCT of its object keys (a VARCHAR list),
 * the children of its arrays and objects (a list of two UINTEGER indexes),
 * its values (a list of a UTINYINT type and a UINTEGER offset) and its data
 * (a BLOB), under a validity mask of its own: 13 columns, so one row takes
 * 212 KiB of first segments (measured). Counted from the text, every node
 * but the first is a child with a key (an 8-byte key is assumed), and the
 * data is the text plus 8 bytes per node. Against duckdb_memory() for
 * 200,000 VARIANTs read from Parquet, that errs high: 1.0× for integers
 * and long strings, 1.2× for doubles, 1.6–1.7× for arrays of numbers and
 * for objects.
 */
export interface VariantLengths {
  readonly length: number;
  readonly nodes: number;
}

/** A VARIANT the sample did not measure: a small document. */
const DEFAULT_VARIANT: VariantLengths = { length: 64, nodes: 4 };
/** Bytes assumed per object key in a VARIANT's key list. */
const VARIANT_KEY_BYTES = 8;
/** Data bytes per VARIANT node beyond its text: a number's 8-byte value. */
const VARIANT_NODE_DATA_BYTES = 8;

/**
 * What the length sample measured about a nested column's values. The text
 * values inside it take `averageLength` (see {@link valueWidth}).
 */
export interface NestedLengths {
  /**
   * Average items per list or map at the column's outermost level of lists:
   * the column itself, or a list or map reached through struct fields and
   * union members. Lists and maps inside those hold
   * {@link DEFAULT_LIST_ITEMS} (4) items each.
   */
  readonly items?: number;
  /** VARIANT values inside, and values of a type the parser cannot read. */
  readonly variant?: VariantLengths;
}

/**
 * The columns DuckDB stores for a table column of `columnType` (see
 * {@link StorageColumn}). Text values take `averageLength` bytes plus a
 * 4-byte offset wherever they sit; lists and maps take the items in
 * `lengths`, or {@link DEFAULT_LIST_ITEMS} (4) where it has none.
 */
export function storageColumns(
  columnType: string,
  averageLength = DEFAULT_TEXT_LENGTH,
  lengths: NestedLengths = {},
): StorageColumn[] {
  const columns: StorageColumn[] = [];
  const add = (perRow: number, width: number, slot: number, leaf = true): void => {
    columns.push({ perRow, width, headBytes: Math.min(BLOCK_BYTES, VECTOR_ROWS * slot), leaf });
  };
  const mask = (perRow: number): void => add(perRow, 0, 0, false);
  const offsets = (perRow: number): void =>
    add(perRow, LIST_OFFSET_BYTES, REFERENCE_SLOT_BYTES, false);
  const text = (perRow: number, length: number): void =>
    add(perRow, 4 + Math.max(0, length), REFERENCE_SLOT_BYTES);
  const scalar = (perRow: number, sqlType: string): void => {
    const width = scalarWidth(sqlType);
    add(perRow, width, width);
  };

  const variant = (perRow: number): void => {
    const { length, nodes } = lengths.variant ?? DEFAULT_VARIANT;
    const children = Math.max(0, nodes - 1);
    mask(perRow); // the VARIANT
    mask(perRow); // its STRUCT
    offsets(perRow); // keys: VARCHAR[]
    text(perRow * children, VARIANT_KEY_BYTES);
    offsets(perRow); // children: STRUCT(keys_index UINTEGER, values_index UINTEGER)[]
    mask(perRow * children);
    add(perRow * children, 4, 4);
    add(perRow * children, 4, 4);
    offsets(perRow); // values: STRUCT(type_id UTINYINT, byte_offset UINTEGER)[]
    mask(perRow * nodes);
    add(perRow * nodes, 1, 1);
    add(perRow * nodes, 4, 4);
    text(perRow, length + VARIANT_NODE_DATA_BYTES * nodes); // data: BLOB
  };

  // `outermost`: no list, map or array encloses the node.
  const visit = (node: DuckDBTypeNode, perRow: number, outermost: boolean): void => {
    switch (node.kind) {
      case 'scalar':
      case 'json':
        if (textLength(node)) text(perRow, averageLength);
        else scalar(perRow, node.sqlType);
        return;
      case 'list':
      case 'map': {
        const items = outermost ? (lengths.items ?? DEFAULT_LIST_ITEMS) : DEFAULT_LIST_ITEMS;
        offsets(perRow);
        if (node.kind === 'list') {
          visit(node.element, perRow * items, false);
          return;
        }
        mask(perRow * items); // each entry's STRUCT(key, value)
        visit(node.key, perRow * items, false);
        visit(node.value, perRow * items, false);
        return;
      }
      case 'array':
        mask(perRow);
        visit(node.element, perRow * node.size, false);
        return;
      case 'struct':
        mask(perRow);
        for (const field of node.fields) visit(field.type, perRow, outermost);
        return;
      case 'union':
        mask(perRow);
        add(perRow, 1, 1); // the tag
        for (const member of node.members) visit(member.type, perRow, outermost);
        return;
      case 'variant':
        variant(perRow);
        return;
      case 'unknown':
        // Text the parser cannot read: sized like a VARIANT if it looks nested.
        if (dataTypeOf(node) === 'nested') variant(perRow);
        else scalar(perRow, node.sqlType);
        return;
    }
  };
  visit(parseDuckDBType(columnType), 1, true);
  return columns;
}

/**
 * Bytes one value of `columnType` takes in DuckDB's column segments,
 * validity masks aside: the sum over the columns that store it (see
 * {@link storageColumns}). Text is a 4-byte offset plus its bytes, with
 * `averageLength` the mean byte length, inside nested values too; a LIST
 * adds an 8-byte offset to its items, an ARRAY `size` items, a STRUCT its
 * fields, a MAP its entries' keys and values, a UNION a tag byte and every
 * member. A `FLOAT[768]` embedding is 3,072 bytes.
 */
export function valueWidth(
  columnType: string,
  averageLength = DEFAULT_TEXT_LENGTH,
  lengths?: NestedLengths,
): number {
  return storageColumns(columnType, averageLength, lengths).reduce(
    (sum, column) => sum + column.perRow * column.width,
    0,
  );
}

/**
 * Bytes of a column's first segment, sized for one vector of values. Text
 * columns hold 16-byte references there, however long their values; other
 * scalars hold `width`-byte values. A nested column's is that of its
 * outermost storage column: a LIST's or MAP's offsets (16-byte slots), or
 * none for a STRUCT, ARRAY, UNION or VARIANT, whose outermost column is a
 * validity mask.
 */
export function firstSegmentBytes(columnType: string, width: number): number {
  const node = parseDuckDBType(columnType);
  if (dataTypeOf(node) === 'nested') return storageColumns(columnType)[0]!.headBytes;
  const slot = textLength(node) ? REFERENCE_SLOT_BYTES : width;
  return Math.min(BLOCK_BYTES, VECTOR_ROWS * slot);
}

/**
 * Size of an in-memory DuckDB table with `rows` rows and scalar columns of
 * the given value widths; see {@link estimateStorageBytes}. `headBytes`
 * gives each column's first segment, by default 2,048 values of its width.
 */
export function estimateTableBytes(rows: number, widths: number[], headBytes?: number[]): number {
  return estimateStorageBytes(
    rows,
    widths.map((width, i) => ({
      perRow: 1,
      width,
      headBytes: headBytes?.[i] ?? Math.min(BLOCK_BYTES, VECTOR_ROWS * width),
      leaf: true,
    })),
  );
}

/**
 * Size of an in-memory DuckDB table with `rows` rows, from the columns it
 * stores (see {@link storageColumns}). Each storage column of each
 * 122,880-row row group takes whole 256 KiB blocks for its values and for
 * its validity mask, at least one of each, even for a child column with no
 * items in the group. The first row group is the exception: there each
 * starts with a one-vector segment (`headBytes`) and a 2 KiB validity
 * segment, and takes whole blocks only as those fill. A list's child
 * column holds every item of the group's rows, so a `FLOAT[768]` column
 * fills 1,440 blocks per row group. This matches DuckDB's own accounting
 * to within a few percent from one row to millions. A flat per-cell cost
 * is a third low for short, wide tables, and whole blocks alone are many
 * times too high for tables of a few thousand rows.
 */
export function estimateStorageBytes(rows: number, columns: readonly StorageColumn[]): number {
  if (rows <= 0) return 0;
  const firstGroupRows = Math.min(rows, ROW_GROUP_ROWS);
  const laterRows = rows - firstGroupRows;
  const fullGroups = Math.floor(laterRows / ROW_GROUP_ROWS);
  const lastGroupRows = laterRows % ROW_GROUP_ROWS;
  const blocks = (bytes: number): number =>
    Math.ceil(Math.max(0, bytes) / BLOCK_BYTES) * BLOCK_BYTES;
  let total = 0;
  for (const { perRow, width, headBytes, leaf } of columns) {
    const group = (groupRows: number): number => {
      const values = groupRows * perRow;
      const data = width > 0 ? Math.max(BLOCK_BYTES, blocks(values * width)) : 0;
      return data + Math.max(BLOCK_BYTES, blocks(values / 8));
    };
    const values = firstGroupRows * perRow;
    if (width > 0) total += headBytes + blocks(values * width - headBytes);
    total += HEAD_VALIDITY_BYTES + blocks(values / 8 - HEAD_VALIDITY_BYTES);
    if (leaf) total += HEAD_OVERHEAD_BYTES;
    total += fullGroups * group(ROW_GROUP_ROWS);
    if (lastGroupRows > 0) total += group(lastGroupRows);
  }
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
 * Probes a length sample may hold. Past this, nested columns keep the
 * default lengths rather than make the sample's SQL grow with the schema.
 */
const MAX_LENGTH_PROBES = 2000;
/** The lambda parameter in a probe's `list_transform`. */
const PROBE_ITEM = '__dt_item';

type ProbeKind =
  'items' | 'textBytes' | 'textValues' | 'variantLength' | 'variantNodes' | 'variantValues';

/** Per-row SQL over one nested column, which the sample sums. */
interface LengthProbe {
  kind: ProbeKind;
  sql: string;
}

/** A nested column's lengths as sampled, with the average length of its text values. */
interface NestedSample {
  averageLength?: number;
  lengths: NestedLengths;
}

function sqlString(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * The probes that measure a nested column's {@link NestedLengths} and text:
 * the items of each list and map at its outermost level of lists, and the
 * bytes of the text and VARIANT values reached through struct fields, union
 * members and those items. Lists, maps and arrays deeper down are not
 * entered: their items take the defaults, and their text the average of
 * the text reached. A NULL value counts as empty, as DuckDB stores it.
 */
function lengthProbes(column: string, type: DuckDBTypeNode): LengthProbe[] {
  const probes: LengthProbe[] = [];
  /**
   * @param value - SQL for the node's value: a column, a field of one, or
   *   PROBE_ITEM inside `outer`.
   * @param outer - The outermost list holding the node (SQL for the list,
   *   and for its items per row), or null outside any.
   */
  const visit = (
    node: DuckDBTypeNode,
    value: string,
    outer: { list: string; items: string } | null,
  ): void => {
    // `perValue` summed over the row: over its list's items, if any.
    const perRow = (perValue: string): string =>
      outer
        ? `coalesce(list_sum(list_transform(${outer.list}, lambda ${PROBE_ITEM}: ${perValue})), 0)`
        : perValue;
    const values = outer ? outer.items : '1';
    const length = textLength(node);
    if (length) {
      probes.push(
        { kind: 'textBytes', sql: perRow(`coalesce(${length(value)}, 0)`) },
        { kind: 'textValues', sql: values },
      );
      return;
    }
    switch (node.kind) {
      case 'struct':
        node.fields.forEach((field, i) => {
          visit(field.type, `struct_extract_at(${value}, ${i + 1})`, outer);
        });
        return;
      case 'union':
        for (const member of node.members) {
          visit(member.type, `union_extract(${value}, ${sqlString(member.tag)})`, outer);
        }
        return;
      case 'array':
        if (!outer) visit(node.element, PROBE_ITEM, { list: value, items: String(node.size) });
        return;
      case 'list':
      case 'map': {
        if (outer) return;
        const items = `coalesce(${node.kind === 'list' ? 'len' : 'cardinality'}(${value}), 0)`;
        probes.push({ kind: 'items', sql: items });
        if (node.kind === 'list') {
          visit(node.element, PROBE_ITEM, { list: value, items });
        } else {
          visit(node.key, PROBE_ITEM, { list: `map_keys(${value})`, items });
          visit(node.value, PROBE_ITEM, { list: `map_values(${value})`, items });
        }
        return;
      }
      case 'variant':
      case 'unknown': {
        const text = `CAST(${value} AS VARCHAR)`;
        const removed = (rest: string): string => `strlen(${text}) - strlen(${rest})`;
        const nodes = `1 + ${removed(`replace(${text}, ',', '')`)} + ${removed(
          `replace(replace(${text}, '[', ''), '{', '')`,
        )}`;
        probes.push(
          { kind: 'variantLength', sql: perRow(`coalesce(strlen(${text}), 0)`) },
          { kind: 'variantNodes', sql: perRow(`coalesce(${nodes}, 0)`) },
          { kind: 'variantValues', sql: values },
        );
        return;
      }
      default:
        return;
    }
  };
  visit(type, quoteIdentifier(column), null);
  return probes;
}

/**
 * Measure the nested columns' lengths from the first
 * {@link LENGTH_SAMPLE_ROWS} rows. Best effort, like the text sample: a
 * column the sample leaves out, or a sample that fails, keeps the defaults.
 */
async function sampleNestedLengths(
  conn: AsyncDuckDBConnection,
  fileName: string,
  columns: readonly { name: string; node: DuckDBTypeNode }[],
): Promise<Map<string, NestedSample>> {
  const sampled = new Map<string, NestedSample>();
  const probed: { name: string; probes: LengthProbe[]; first: number }[] = [];
  let count = 0;
  for (const { name, node } of columns) {
    const probes = lengthProbes(name, node);
    if (probes.length === 0 || count + probes.length > MAX_LENGTH_PROBES) continue;
    probed.push({ name, probes, first: count });
    count += probes.length;
  }
  if (probed.length === 0) return sampled;

  try {
    const sums = probed.flatMap(({ probes, first }) =>
      probes.map((probe, i) => `CAST(sum(${probe.sql}) AS DOUBLE) AS "${first + i}"`),
    );
    const [sample] = await queryRows(
      conn,
      `SELECT count(*) AS n, ${sums.join(', ')}
       FROM (SELECT ${probed.map((c) => quoteIdentifier(c.name)).join(', ')}
             FROM read_parquet('${fileName}') LIMIT ${LENGTH_SAMPLE_ROWS})`,
    );
    const rows = Number(sample?.['n'] ?? 0);
    if (!sample || rows <= 0) return sampled;
    for (const { name, probes, first } of probed) {
      const total = (kind: ProbeKind): number =>
        probes.reduce(
          (sum, probe, i) =>
            probe.kind === kind ? sum + Number(sample[String(first + i)] ?? 0) : sum,
          0,
        );
      const lists = probes.filter((probe) => probe.kind === 'items').length;
      const textValues = total('textValues');
      const variantValues = total('variantValues');
      const lengths: { items?: number; variant?: VariantLengths } = {};
      if (lists > 0) lengths.items = total('items') / (lists * rows);
      if (variantValues > 0) {
        lengths.variant = {
          length: total('variantLength') / variantValues,
          nodes: total('variantNodes') / variantValues,
        };
      }
      sampled.set(
        name,
        textValues > 0 ? { lengths, averageLength: total('textBytes') / textValues } : { lengths },
      );
    }
  } catch {
    // Keep the default lengths.
  }
  return sampled;
}

/**
 * Estimate the loaded size of `fileName` projected to `describeRows` (the
 * DESCRIBE of the load's SELECT, without `__rowid__`). Reads the footer and
 * the first {@link LENGTH_SAMPLE_ROWS} rows of text and nested columns only.
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

  const columns = describeRows.map((row) => {
    const type = String(row['column_type']);
    return { name: String(row['column_name']), type, node: parseDuckDBType(type) };
  });
  // Top-level text columns only: text inside a list or struct is measured
  // with the nested columns, and `strlen` of a VARCHAR[] is a Binder error
  // that would fail this whole sample.
  const textColumns = columns.flatMap((c) => {
    const length = textLength(c.node);
    return length ? [{ ...c, length }] : [];
  });
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
          .map((c, i) => `avg(${c.length(quoteIdentifier(c.name))}) AS "${i}"`)
          .join(', ')}
         FROM (SELECT ${textColumns.map((c) => quoteIdentifier(c.name)).join(', ')}
               FROM read_parquet('${fileName}') LIMIT ${LENGTH_SAMPLE_ROWS})`,
      );
      textColumns.forEach((c, i) => averageLength.set(c.name, Number(sample?.[String(i)] ?? 0)));
    } catch {
      // Keep the default lengths.
    }
  }
  // A separate sample, so that either can fail without the other.
  const nestedColumns = columns.filter((c) => dataTypeOf(c.node) === 'nested');
  const nested =
    rows > 0 && nestedColumns.length > 0
      ? await sampleNestedLengths(conn, fileName, nestedColumns)
      : new Map<string, NestedSample>();

  const storage = [
    ...storageColumns('BIGINT'), // __rowid__
    ...columns.flatMap((c) => {
      const sampled = nested.get(c.name);
      return storageColumns(
        c.type,
        averageLength.get(c.name) ?? sampled?.averageLength,
        sampled?.lengths,
      );
    }),
  ];

  // Columns without a chunk (__rowid__, or every column of a file with no
  // row groups) have nothing to decode, and cost only the base.
  const tableColumns = columns.length + 1;
  const scanBytes =
    chunks.reduce((sum, chunk) => sum + scanBytesPerColumn(Number(chunk['bytes'] ?? 0)), 0) +
    Math.max(0, tableColumns - chunks.length) * SCAN_BASE_BYTES;

  return {
    rows,
    columns: tableColumns,
    tableBytes: estimateStorageBytes(rows, storage),
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
