/**
 * Filesystem helpers for the dataset fixtures under
 * `tests/fixtures/datasets/{csv,json,parquet}/`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'datasets');

/** Format → file extension map. */
const EXT: Record<'csv' | 'json' | 'parquet', string> = {
  csv: 'csv',
  json: 'json',
  parquet: 'parquet',
};

export type FixtureFormat = 'csv' | 'json' | 'parquet';

/**
 * Resolve the absolute filesystem path to a fixture without reading it.
 */
export function fixturePath(format: FixtureFormat, name: string): string {
  return join(fixturesRoot, format, `${name}.${EXT[format]}`);
}

/**
 * Read a CSV / JSON fixture as a UTF-8 string.
 */
export async function readTextFixture(format: 'csv' | 'json', name: string): Promise<string> {
  return readFile(fixturePath(format, name), 'utf8');
}

/**
 * Read a fixture as an `ArrayBuffer`. Suitable for the parquet loader and
 * for the binary path of the CSV / JSON loaders.
 */
export async function readBinaryFixture(format: FixtureFormat, name: string): Promise<ArrayBuffer> {
  const buf = await readFile(fixturePath(format, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
