/**
 * Phase 1 — the load path's statement budget.
 *
 * Two numbers this pins, both machine-independent counts (`tests/budgets.ts`
 * §"the rule this file exists to enforce"):
 *
 * - **`QUERIES_MAX`** — every statement a loader issues for one load, end to
 *   end. Detection used to cost `3 × VARCHAR columns` statements on its own.
 * - **`CTAS_MAX`** — full-table `CREATE TABLE … AS SELECT`s. Each one is a
 *   complete copy plus a sort at ~2× transient memory, and none of them is
 *   interruptible by `cancelSent()`, so this is the number that decides
 *   whether a big load is survivable.
 *
 * The counting seam is `LoaderContext` (`common.ts`'s `{ db?, conn? }`): the
 * test hands the loaders a `conn` proxy that records every `query()` and
 * forwards it to a real Node-built DuckDB, so the statements counted are the
 * statements executed.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PROBE_CHUNK_COLUMNS, quoteIdentifier } from '@/worker/loaders/common';
import { loadCSV } from '@/worker/loaders/csv';
import { loadJSON } from '@/worker/loaders/json';
import { loadParquet } from '@/worker/loaders/parquet';

import { DT_BUDGET } from '../../budgets';
import { resolveTier, tierCSV, tierSelectSQL, type TierSpec } from '../../fixtures/tiers';
import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';

/**
 * The budget tier: 2,000 rows × 100 columns. Small enough to run in the
 * default suite, wide enough that the class cycle contributes 30 VARCHAR
 * columns — 90 statements of detection under the shape this phase replaced.
 */
const BUDGET_TIER = resolveTier('custom', { rows: 2000, cols: 100, seed: 1 });

/**
 * Same shape, 10× wider. Exists only for the column-count comparison; kept
 * shallow so it stays cheap.
 */
const WIDE_TIER = resolveTier('custom', { rows: 200, cols: 1000, seed: 1 });

/** A full-table materialization: `CREATE [OR REPLACE] TABLE … AS SELECT …`. */
const CTAS_RE = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\b[\s\S]*?\bAS\b/i;

/** A batched type probe — the `AS MATERIALIZED` head sample. */
const PROBE_RE = /\bAS\s+MATERIALIZED\b/i;

interface Recording {
  statements: string[];
  ctas: string[];
  probes: string[];
}

function summarize(statements: string[]): Recording {
  return {
    statements,
    ctas: statements.filter((sql) => CTAS_RE.test(sql)),
    probes: statements.filter((sql) => PROBE_RE.test(sql)),
  };
}

describe('load path statement budget', () => {
  let harness: NodeDuckDBHarness;
  /**
   * `COPY … TO '<path>'` writes to the **real** filesystem under the Node
   * target, and `db.dropFile` only unregisters the virtual handle — so a
   * bare filename would litter the repo root with parquet/JSON (plus
   * DuckDB's `tmp_`-prefixed staging siblings) on every run. Everything the
   * writer touches goes in one scratch directory that is removed wholesale.
   */
  let scratchDir: string;
  let counter = 0;
  const tn = (suffix: string): string => `budget_${suffix}_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    scratchDir = await mkdtemp(join(tmpdir(), 'dt-query-budget-'));
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
    if (scratchDir) await rm(scratchDir, { recursive: true, force: true });
  });

  /**
   * Run `body` with a `conn` that records every statement it executes, and
   * return what it saw. The proxy forwards to the real connection, so this
   * counts executed statements rather than intended ones.
   */
  async function record(body: (conn: AsyncDuckDBConnection) => Promise<void>): Promise<Recording> {
    const statements: string[] = [];
    const counting = new Proxy(harness.conn, {
      get(target, prop, receiver) {
        if (prop === 'query') {
          return (sql: string) => {
            statements.push(sql);
            return target.query(sql);
          };
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    await body(counting);
    return summarize(statements);
  }

  /** Encode a tier through DuckDB's own writer and hand back the bytes. */
  async function encodeTier(spec: TierSpec, format: 'parquet' | 'json'): Promise<ArrayBuffer> {
    const path = join(scratchDir, `${tn('src')}.${format}`);
    const options = format === 'parquet' ? 'FORMAT PARQUET' : 'FORMAT JSON, ARRAY true';
    await harness.conn.query(`COPY (${tierSelectSQL(spec)}) TO '${path}' (${options})`);
    const bytes = await harness.db.copyFileToBuffer(path);
    await harness.db.dropFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /** How many VARCHAR columns the loader will actually have to probe. */
  async function varcharCount(tableName: string): Promise<number> {
    const described = await harness.conn.query(`DESCRIBE ${quoteIdentifier(tableName)}`);
    return described
      .toArray()
      .map((row) => String((row.toJSON() as { column_type: unknown }).column_type))
      .filter((type) => type.toUpperCase() === 'VARCHAR').length;
  }

  describe(`budget tier (${BUDGET_TIER.rows} × ${BUDGET_TIER.cols})`, () => {
    it('loads Parquet inside the statement and CTAS budgets', async () => {
      const data = await encodeTier(BUDGET_TIER, 'parquet');
      const table = tn('parquet');
      const seen = await record(async (conn) => {
        await loadParquet(data, { tableName: table }, { db: harness.db, conn });
      });

      expect(seen.statements.length).toBeLessThanOrEqual(DT_BUDGET.LOAD.QUERIES_MAX);
      expect(seen.ctas.length).toBeLessThanOrEqual(DT_BUDGET.LOAD.CTAS_MAX);
      // Detection actually ran — an empty plan would trivially satisfy both.
      expect(seen.probes.length).toBeGreaterThan(0);
      // …and its casts rode along in the one materialization rather than
      // costing a second one. The tier's classes 15/16/17 reach the Parquet
      // loader as VARCHAR by construction, so all three must appear.
      expect(seen.ctas).toHaveLength(1);
      expect(seen.ctas[0]).toContain('TRY_CAST');
      for (const sqlType of ['AS TIMESTAMP)', 'AS DATE)', 'AS TIME)']) {
        expect(seen.ctas[0]).toContain(sqlType);
      }
      // The probe precedes the materialization — that ordering is the whole
      // mechanism, not an incidental detail.
      expect(seen.statements.indexOf(seen.probes[0]!)).toBeLessThan(
        seen.statements.indexOf(seen.ctas[0]!),
      );
    }, 120_000);

    it('loads CSV inside the statement and CTAS budgets', async () => {
      const data = tierCSV(BUDGET_TIER);
      const table = tn('csv');
      const seen = await record(async (conn) => {
        await loadCSV(data, { tableName: table }, { db: harness.db, conn });
      });

      expect(seen.statements.length).toBeLessThanOrEqual(DT_BUDGET.LOAD.QUERIES_MAX);
      expect(seen.ctas.length).toBeLessThanOrEqual(DT_BUDGET.LOAD.CTAS_MAX);
      expect(seen.probes.length).toBeGreaterThan(0);
    }, 120_000);

    it('loads JSON inside the statement and CTAS budgets', async () => {
      const data = await encodeTier(BUDGET_TIER, 'json');
      const table = tn('json');
      const seen = await record(async (conn) => {
        await loadJSON(data, { tableName: table }, { db: harness.db, conn });
      });

      expect(seen.statements.length).toBeLessThanOrEqual(DT_BUDGET.LOAD.QUERIES_MAX);
      expect(seen.ctas.length).toBeLessThanOrEqual(DT_BUDGET.LOAD.CTAS_MAX);
      expect(seen.probes.length).toBeGreaterThan(0);
    }, 120_000);

    it('spends at most one batched probe per PROBE_CHUNK_COLUMNS columns', async () => {
      const data = await encodeTier(BUDGET_TIER, 'parquet');
      const table = tn('chunks');
      // Materialize the same source once with no conversions so the VARCHAR
      // count the loader will face can be read independently.
      const raw = tn('raw');
      const file = `${raw}.parquet`;
      await harness.db.registerFileBuffer(file, new Uint8Array(data.slice(0)));
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(raw)} AS SELECT * FROM read_parquet('${file}')`,
      );
      await harness.db.dropFile(file);
      const varchars = await varcharCount(raw);
      expect(varchars).toBeGreaterThan(0);

      const seen = await record(async (conn) => {
        await loadParquet(data, { tableName: table }, { db: harness.db, conn });
      });
      expect(seen.probes).toHaveLength(Math.ceil(varchars / PROBE_CHUNK_COLUMNS));
    }, 120_000);
  });

  describe('column-count independence', () => {
    /**
     * The claim: widening a source 10× does not multiply the work the load
     * path does. Materialization count is flat; probe count grows by
     * `ceil(VARCHAR / PROBE_CHUNK_COLUMNS)`, not by `3 × VARCHAR`.
     *
     * Parquet only — it is the format that reaches the loader with all three
     * temporal classes still VARCHAR, so it exercises the full plan-and-
     * rewrite path. (DuckDB's CSV and JSON sniffers type some of those
     * columns natively; see `tierCSV`'s note.)
     */
    it('does not scale materializations or probes with column count', async () => {
      const narrowData = await encodeTier(BUDGET_TIER, 'parquet');
      const narrow = await record(async (conn) => {
        await loadParquet(narrowData, { tableName: tn('narrow') }, { db: harness.db, conn });
      });

      const wideData = await encodeTier(WIDE_TIER, 'parquet');
      const wide = await record(async (conn) => {
        await loadParquet(wideData, { tableName: tn('wide') }, { db: harness.db, conn });
      });

      // 10× the columns, same number of full-table copies.
      expect(wide.ctas.length).toBe(narrow.ctas.length);
      // …and still inside the overall budget, which the old shape could not
      // have been: 300 VARCHAR columns cost 900 detection statements alone.
      expect(wide.statements.length).toBeLessThanOrEqual(DT_BUDGET.LOAD.QUERIES_MAX);
      expect(wide.probes.length).toBeLessThanOrEqual(
        Math.ceil(WIDE_TIER.cols / PROBE_CHUNK_COLUMNS),
      );
      // Growth is in the probe count only, and it is sub-linear in columns.
      const extraProbes = wide.probes.length - narrow.probes.length;
      expect(wide.statements.length - narrow.statements.length).toBe(extraProbes);
    }, 180_000);
  });
});
