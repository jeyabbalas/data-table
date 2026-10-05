/**
 * The nested-types stress fixture:
 * `tests/fixtures/datasets/{parquet,json}/nested-stress-tests.*` and
 * `nested-stress-tests.manifest.json`, all written by
 * `generate-nested-stress-tests.py` in the same directory.
 *
 * Exposes the files' paths, the parsed manifest ({@link MANIFEST}), the
 * showcase row ids ({@link SHOWCASE}), and {@link loadNestedFixture}, which
 * loads a file through the library's real loaders.
 *
 * @example
 * ```ts
 * const harness = await createNodeDuckDB();
 * const { tableName } = await loadNestedFixture(harness, 'parquet');
 * const rows = await harness.conn.query(
 *   `SELECT CAST("tags" AS VARCHAR) AS t FROM "${tableName}" WHERE "id" = ${SHOWCASE.CAP_EDGE}`,
 * );
 * ```
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { loadJSON } from '@/worker/loaders/json';
import { loadParquet } from '@/worker/loaders/parquet';
import type { LoadResult } from '@/worker/loaders/types';

import type { NodeDuckDBHarness } from './duckdbNode';
import { fixturePath, readBinaryFixture } from './fixtures';

const FIXTURE_NAME = 'nested-stress-tests';

/** Absolute path of the Parquet file: 1,000 rows, 36 columns, 4 row groups. */
export const NESTED_PARQUET_PATH = fixturePath('parquet', FIXTURE_NAME);

/** Absolute path of the JSON file: an array of 1,000 records, 21 columns. */
export const NESTED_JSON_PATH = fixturePath('json', FIXTURE_NAME);

/** Absolute path of the manifest the generator writes beside the files. */
export const NESTED_MANIFEST_PATH = join(
  dirname(dirname(NESTED_PARQUET_PATH)),
  `${FIXTURE_NAME}.manifest.json`,
);

/**
 * Row ids of the showcase rows: the same row holds the same kind of edge case
 * in every column that can express it. The manifest's `showcaseRows`
 * describes each. The ids equal the `id` column and the loaders' `__rowid__`.
 */
export const SHOWCASE = {
  /** NULL in every column but id, embedding (32 NULL elements) and all_empty_list. */
  ALL_NULL: 0,
  /** `[]`, `{}`, structs of NULL fields, `''`, an empty blob. */
  EMPTIES: 1,
  /** NULL inside values: `[4, NULL, 17]`, NULL map values and struct fields. */
  NULL_ELEMENTS: 2,
  /** 2^53±1, INT64/UINT64 bounds, `[1.25, 2.50, 3.75]`, NaN, ±Infinity, -0.0, 5e-324. */
  NUMERIC_EXTREMES: 3,
  /**
   * it's, "dq", `a, b`, `[x]`, `k=v`, the text NULL, `''`, backslash, newline,
   * tab, right-to-left text, combining marks.
   */
  TEXT_ESCAPES: 4,
  /** long_list holds 1..1000; int_keys holds 600 entries. */
  LIST_1000: 5,
  /** long_list holds 1..2500. */
  LIST_2500: 6,
  /** long_list holds 1..10000. */
  LIST_10000: 7,
  /** A 20,000-character element; a ZWJ emoji across the 1,000-grapheme cap. */
  CAP_EDGE: 8,
  /** 0001-01-01, 9999-12-31, 1970-01-01, a pre-1970 date; empty, \x00 and \xff blobs. */
  DATE_BINARY_EDGES: 9,
  /** Readable values for demos and docs. */
  DEMO: 10,
  /** Keys whose extracted column names collide: a.b / a_b / A_B, k=v / k_v / K_V. */
  NAME_COLLISIONS: 11,
} as const;

/** Name of a showcase row. */
export type ShowcaseName = keyof typeof SHOWCASE;

/** How a column's values nest, which decides how the manifest counts them. */
export type NestedColumnKind = 'scalar' | 'list' | 'struct' | 'map' | 'json';

/** One column of a fixture file, as the manifest records it. */
export interface NestedManifestColumn {
  name: string;
  kind: NestedColumnKind;
  /** The Arrow type pyarrow wrote (Parquet only; null for the JSON file). */
  arrowType: string | null;
  /** What DESCRIBE reports once the file is loaded through the library's loader. */
  duckdbType: string;
  /** Rows whose value is NULL. */
  nullCount: number;
  /** Rows holding `[]` (lists) or an empty map; null for other kinds. */
  emptyCount: number | null;
  /** Longest list (`len`) or largest map (`cardinality`); null for other kinds. */
  maxLength: number | null;
  description: string;
}

/** One fixture file in the manifest. */
export interface NestedManifestFile {
  /** Path relative to `tests/fixtures/datasets/`. */
  file: string;
  /** Columns in file order, without the `__rowid__` the loaders add. */
  columns: NestedManifestColumn[];
}

/** `nested-stress-tests.manifest.json`. */
export interface NestedManifest {
  generator: string;
  seed: number;
  rowCount: number;
  /** DuckDB version the expected types were recorded with. */
  duckdbVersion: string;
  /** Graphemes a nested cell is capped at in the grid. */
  displayCap: number;
  /** 1-based code point where the CAP_EDGE row's ZWJ emoji starts in its cell text. */
  capEmojiStart: number;
  showcaseRows: Record<ShowcaseName, { row: number; purpose: string }>;
  parquet: NestedManifestFile & { rowGroups: number };
  json: NestedManifestFile;
}

/** The parsed manifest. */
export const MANIFEST = JSON.parse(readFileSync(NESTED_MANIFEST_PATH, 'utf8')) as NestedManifest;

/**
 * Load a fixture file through the library's real loader (`loadParquet` or
 * `loadJSON`) with the harness's `{ db, conn }`, from its bytes, as a buffer
 * source loads in the browser.
 *
 * @param tableName - Defaults to `nested_parquet` or `nested_json`.
 */
export async function loadNestedFixture(
  harness: NodeDuckDBHarness,
  format: 'parquet' | 'json',
  tableName = `nested_${format}`,
): Promise<LoadResult> {
  const data = await readBinaryFixture(format, FIXTURE_NAME);
  const context = { db: harness.db, conn: harness.conn };
  return format === 'parquet'
    ? loadParquet(data, { tableName }, context)
    : loadJSON(data, { tableName }, context);
}
