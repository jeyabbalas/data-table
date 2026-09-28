/**
 * How a source is read, end to end: WorkerBridge.loadData → the payload,
 * structured-cloned as a real Worker would → the real dispatcher and
 * loaders on a real DuckDB (Node target) → the table, or the typed error
 * the bridge rejects with.
 *
 * Before `sourceOptions` existed the payload carried only the format and
 * the table name, so none of these options reached a loader.
 */
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoadError } from '@/core/errors';
import { WorkerBridge, type LoadOptions } from '@/data/WorkerBridge';
import { handleMessage } from '@/worker/dispatcher';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

// The dispatcher and loaders reach DuckDB through these module singletons;
// point them at the Node harness.
const duckdb = vi.hoisted(() => ({ harness: null as NodeDuckDBHarness | null }));
vi.mock('@/worker/duckdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/worker/duckdb')>()),
  isInitialized: () => duckdb.harness !== null,
  getConnection: () => duckdb.harness!.conn,
  getDatabase: () => duckdb.harness!.db,
}));

describe('WorkerBridge.loadData — source options end to end', () => {
  let harness: NodeDuckDBHarness;
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;
  const files: string[] = [];
  let tables = 0;

  async function rows(table: string): Promise<Record<string, unknown>[]> {
    const result = await harness.conn.query(`SELECT * EXCLUDE (__rowid__) FROM "${table}"`);
    return result
      .toArray()
      .map((row) =>
        Object.fromEntries(
          Object.entries(row.toJSON() as Record<string, unknown>).map(([k, v]) => [
            k,
            typeof v === 'bigint' ? Number(v) : v,
          ]),
        ),
      );
  }

  async function load(data: ArrayBuffer | string, options: LoadOptions) {
    return bridge.loadData(data, { tableName: `opts_${++tables}`, ...options });
  }

  async function loadError(data: ArrayBuffer | string, options: LoadOptions): Promise<LoadError> {
    const error = await load(data, options).then(
      () => {
        throw new Error('expected the load to reject');
      },
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(LoadError);
    return error as LoadError;
  }

  async function parquet(select: string): Promise<ArrayBuffer> {
    const path = join(tmpdir(), `dt_source_options_${process.pid}_${files.length}.parquet`);
    files.push(path);
    await harness.conn.query(`COPY (${select}) TO '${path}' (FORMAT parquet)`);
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  const loadsPosted = () => mock.posted.filter((m) => m.type === 'load').length;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    duckdb.harness = harness;
    mock = createMockWorker({
      onMessage: (message) => {
        if (message.type !== 'load') return null; // `init` is answered by the mock
        void handleMessage(structuredClone(message), (id, type, payload) =>
          mock.sendFromWorker({ id, type, payload: structuredClone(payload) }),
        );
        return null;
      },
    });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
  }, 30_000);

  beforeEach(async () => {
    await harness.conn.query("SET TimeZone = 'UTC'");
  });

  afterAll(async () => {
    bridge?.terminate();
    duckdb.harness = null;
    await harness?.cleanup();
    await Promise.all(files.map((f) => unlink(f).catch(() => {})));
  });

  describe('CSV', () => {
    it('reads the first row as data when told there is no header', async () => {
      // Detected, `a,b` is a header over one row of numbers.
      const result = await load('a,b\n1,2\n', { format: 'csv', csv: { header: false } });
      expect(result.columns).toEqual(['__rowid__', 'column0', 'column1']);
      expect(await rows(result.tableName)).toEqual([
        { column0: 'a', column1: 'b' },
        { column0: '1', column1: '2' },
      ]);
    });

    it('splits on the delimiter given, not the one detected', async () => {
      // Detected, the comma splits every row in two.
      const result = await load('a|b,c\n1|2,3\n4|5,6\n', {
        format: 'csv',
        csv: { delimiter: '|' },
      });
      expect(result.columns).toEqual(['__rowid__', 'a', 'b,c']);
      expect(await rows(result.tableName)).toEqual([
        { a: 1, 'b,c': '2,3' },
        { a: 4, 'b,c': '5,6' },
      ]);
    });

    it('skips the lines given', async () => {
      // Skipping the header line leaves rows of numbers, which have none.
      const result = await load('x,y\n1,2\n3,4\n', { format: 'csv', csv: { skip: 1 } });
      expect(result.columns).toEqual(['__rowid__', 'column0', 'column1']);
      expect(await rows(result.tableName)).toEqual([
        { column0: 1, column1: 2 },
        { column0: 3, column1: 4 },
      ]);
    });

    it('reads the null values given as NULL, so a column of numbers stays numeric', async () => {
      const result = await load("n,s\n1,NA\nNA,it's\n3,N/A\n", {
        format: 'csv',
        csv: { nullValues: ['NA', 'N/A', "it's"] },
      });
      expect(result.schema.find((c) => c.name === 'n')?.type).toBe('integer');
      expect(await rows(result.tableName)).toEqual([
        { n: 1, s: null },
        { n: null, s: null },
        { n: 3, s: null },
      ]);
    });

    it('detects types from every row with a sample size of -1', async () => {
      // DuckDB samples 20,480 rows by default, types `n` as BIGINT and then
      // fails on the text at the end.
      const lines = ['n', ...Array.from({ length: 30_000 }, (_, i) => String(i)), 'x'];
      const csv = lines.join('\n');

      const failed = await loadError(csv, { format: 'csv' });
      expect(failed.code).toBe('LOAD_PARSE_FAILED');
      expect(failed.message).toMatch(/Could not convert string "x"/);

      const result = await load(csv, { format: 'csv', csv: { sampleSize: -1 } });
      expect(result.rowCount).toBe(30_001);
      expect(result.schema.find((c) => c.name === 'n')?.originalType).toBe('VARCHAR');
    }, 30_000);
  });

  describe('JSON', () => {
    it('reads a single object per line when told the format', async () => {
      // One line of NDJSON is detected as a JSON array, and fails as one.
      const failed = await loadError('{"a":1}', { format: 'json' });
      expect(failed.message).toMatch(/Expected top-level JSON array/);

      const result = await load('{"a":1}', { format: 'json', json: { format: 'ndjson' } });
      expect(await rows(result.tableName)).toEqual([{ a: 1 }]);
    });

    it('stops typing nested objects at the maximum depth', async () => {
      const data = '[{"a":1,"b":{"c":{"d":2}}}]';
      const nested = await load(data, { format: 'json' });
      expect(nested.schema.find((c) => c.name === 'b')?.originalType).toMatch(/^STRUCT/);

      const flat = await load(data, { format: 'json', json: { maxDepth: 1 } });
      expect(flat.schema.find((c) => c.name === 'b')?.originalType).toBe('JSON');
    });
  });

  describe('Parquet', () => {
    let data: ArrayBuffer;
    beforeAll(async () => {
      data = await parquet(
        "SELECT range AS a, range * 2 AS b, 'x' || range AS Fare, range % 2 = 0 AS d FROM range(10)",
      );
    });

    it('loads only the columns given, in their order', async () => {
      const result = await load(data, { format: 'parquet', parquet: { columns: ['Fare', 'a'] } });
      expect(result.columns).toEqual(['__rowid__', 'Fare', 'a']);
      expect(result.rowCount).toBe(10);
    });

    it('names the columns the file lacks, and one it has under other case', async () => {
      const error = await loadError(data, {
        format: 'parquet',
        parquet: { columns: ['a', 'fare', 'nope'] },
      });
      expect(error.code).toBe('LOAD_INVALID_OPTIONS');
      expect(error.details).toMatchObject({ option: 'parquet.columns', missing: ['fare', 'nope'] });
      expect(error.message).toBe(
        'Parquet columns not in the file: "fare" (the file has "Fare"), "nope"',
      );
    });
  });

  describe('time zone', () => {
    it('sets DuckDB’s session time zone for the load', async () => {
      await load('a\n1\n', { format: 'csv', timezone: 'America/New_York' });
      const result = await harness.conn.query("SELECT current_setting('TimeZone') AS tz");
      expect(result.toArray()[0]?.toJSON().tz).toBe('America/New_York');
    });

    it('reads text timestamps with the zone’s own offset as local times', async () => {
      // A Parquet text column the loader converts: in New York the offsets
      // are the zone's own and the column loads as TIMESTAMP, 10:00 as
      // written; in UTC it keeps them, as TIMESTAMPTZ.
      const data = await parquet(
        `SELECT * FROM (VALUES ('2024-01-15T10:00:00-05:00'), ('2024-07-15T10:00:00-04:00')) t(seen)`,
      );
      const type = async (timezone: string) => {
        const result = await load(data.slice(0), { format: 'parquet', timezone });
        const seen = result.schema.find((c) => c.name === 'seen')?.originalType;
        const shown = await harness.conn.query(
          `SELECT CAST(seen AS VARCHAR) AS v FROM "${result.tableName}" ORDER BY 1`,
        );
        return { seen, first: shown.toArray()[0]?.toJSON().v };
      };
      expect(await type('America/New_York')).toEqual({
        seen: 'TIMESTAMP',
        first: '2024-01-15 10:00:00',
      });
      expect(await type('UTC')).toEqual({
        seen: 'TIMESTAMP WITH TIME ZONE',
        first: '2024-01-15 15:00:00+00',
      });
    });

    it('rejects a zone DuckDB does not know, with the zones it suggests', async () => {
      const error = await loadError('a\n1\n', { format: 'csv', timezone: 'Mars/Olympus' });
      expect(error.code).toBe('LOAD_INVALID_TIMEZONE');
      expect(error.message).toMatch(/^Unknown timezone: Mars\/Olympus\. Did you mean ".+"\?$/);
      expect(error.details).toMatchObject({
        timezone: 'Mars/Olympus',
        duckdbMessage: expect.stringMatching(/Unknown TimeZone/),
      });
    });
  });

  describe('checked before anything is sent', () => {
    it.each<[string, LoadOptions, string, string]>([
      [
        'an invalid CSV option',
        { format: 'csv', csv: { delimiter: ';;' } },
        'LOAD_INVALID_OPTIONS',
        'csv.delimiter',
      ],
      [
        'an unknown Parquet option',
        { format: 'parquet', parquet: { cols: ['a'] } as never },
        'LOAD_INVALID_OPTIONS',
        'parquet.cols',
      ],
      [
        'a time zone that is not a name',
        { format: 'csv', timezone: "UTC'; --" },
        'LOAD_INVALID_TIMEZONE',
        'timezone',
      ],
    ])('rejects %s without posting the load', async (_label, options, code, option) => {
      const before = loadsPosted();
      const error = await loadError('a\n1\n', options);
      expect(error.code).toBe(code);
      expect(error.details).toMatchObject({ option });
      expect(loadsPosted()).toBe(before);
    });
  });
});
