/**
 * The Parquet loader loads DuckDB's json extension with a table that holds
 * JSON. duckdb-wasm loads it for the first JSON function a query uses, and
 * until then writes a JSON value inside a nested one as a quoted string, and
 * compares a JSON column with any text, so a cell's text or a filter would
 * change the first time anything read a value exactly (the value inspector,
 * an export, `getCellValue`).
 */
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadParquet } from '@/worker/loaders/parquet';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { loadNestedFixture } from '../../helpers/nestedFixture';

let harnesses: NodeDuckDBHarness[] = [];

/** A database of its own: the extension, once loaded, stays loaded. */
async function freshDuckDB(): Promise<NodeDuckDBHarness> {
  const harness = await createNodeDuckDB();
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  for (const harness of harnesses) await harness.cleanup();
  harnesses = [];
});

async function jsonLoaded(harness: NodeDuckDBHarness): Promise<boolean> {
  const result = await harness.conn.query(
    "SELECT loaded FROM duckdb_extensions() WHERE extension_name = 'json'",
  );
  return Boolean(result.toArray()[0]?.toJSON().loaded);
}

/**
 * A Parquet file of `select`'s rows, written in a database of its own: one
 * that loads the extension to cast to JSON.
 */
async function writeParquet(select: string): Promise<ArrayBuffer> {
  const writer = await freshDuckDB();
  const path = join(tmpdir(), `dt_json_extension_${process.pid}_${harnesses.length}.parquet`);
  try {
    await writer.conn.query(`COPY (${select}) TO '${path}' (FORMAT parquet)`);
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } finally {
    await unlink(path).catch(() => undefined);
  }
}

async function text(harness: NodeDuckDBHarness, sql: string): Promise<unknown> {
  const result = await harness.conn.query(sql);
  return result.toArray()[0]?.toJSON().v;
}

describe('the Parquet loader and the json extension', () => {
  it('loads it with a table whose list holds JSON, which then reads as JSON', async () => {
    const harness = await freshDuckDB();
    expect(await jsonLoaded(harness)).toBe(false);

    await loadNestedFixture(harness, 'parquet', 'nested');

    expect(await jsonLoaded(harness)).toBe(true);
    // Row 2 holds 1, an SQL NULL and the JSON literal null.
    expect(
      await text(harness, 'SELECT CAST(json_list AS VARCHAR) AS v FROM nested WHERE id = 2'),
    ).toBe('[1, NULL, null]');
  }, 60_000);

  it('loads it with a table whose only JSON is a column of its own', async () => {
    const harness = await freshDuckDB();
    await loadParquet(
      await writeParquet(`SELECT 1 AS id, CAST('{"a": [1, null]}' AS JSON) AS doc, [1, 2] AS ints`),
      { tableName: 'plain' },
      { db: harness.db, conn: harness.conn },
    );

    expect(await jsonLoaded(harness)).toBe(true);
    expect(await text(harness, 'SELECT typeof(doc) AS v FROM plain')).toBe('JSON');
    // Spacing as written.
    expect(await text(harness, 'SELECT CAST(doc AS VARCHAR) AS v FROM plain')).toBe(
      '{"a": [1, null]}',
    );
    // Text that is not JSON is refused from the first query, not from the
    // first JSON read on; compared as text, it matches nothing.
    await expect(
      harness.conn.query(`SELECT count(*) AS v FROM plain WHERE doc = 'abc'`),
    ).rejects.toThrow(/Malformed JSON/);
    expect(
      Number(
        await text(harness, `SELECT count(*) AS v FROM plain WHERE CAST(doc AS VARCHAR) = 'abc'`),
      ),
    ).toBe(0);
  }, 60_000);

  it('leaves it alone for a table without JSON', async () => {
    const harness = await freshDuckDB();
    await loadParquet(
      await writeParquet(`SELECT 1 AS id, [1, 2] AS ints, {'a': 'x'} AS s`),
      { tableName: 'plain' },
      { db: harness.db, conn: harness.conn },
    );

    expect(await jsonLoaded(harness)).toBe(false);
  }, 60_000);
});
