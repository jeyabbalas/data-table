/**
 * Phase 1 — the loaders report their own stages, honestly.
 *
 * What this replaces: the dispatcher posted three fixed percentages around
 * an opaque `await` — `reading` 0, `parsing` 25, `indexing` 90 — so a
 * progress bar jumped to 25 %, sat there for the entire load however long it
 * took, and then finished. `parsing` also advertised `cancelable: true`,
 * which nothing about a running DuckDB statement supports.
 *
 * The properties asserted here are the ones a consumer can actually build a
 * UI on: percentages never go backwards, the terminal report is exactly one
 * `100`, and the stage names line up with work that is really happening —
 * including `analyzing`, which was a declared `ProgressStage` that no code
 * path emitted while the loading guide told users it existed.
 *
 * The seam is `LoaderContext.reportProgress`, the same one the dispatcher
 * uses in production.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ProgressInfo } from '@/core/Progress';
import { LOAD_PROGRESS_BANDS, WORKER_PROGRESS_START } from '@/worker/loaders/common';
import { loadCSV } from '@/worker/loaders/csv';
import { loadJSON } from '@/worker/loaders/json';
import { loadParquet } from '@/worker/loaders/parquet';

import { resolveTier, tierCSV, tierSelectSQL, type TierSpec } from '../../fixtures/tiers';
import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';

/**
 * 400 columns is deliberate: the class cycle makes ~120 of them VARCHAR,
 * which is more than one probe chunk *and* past `PROBE_SAMPLE_THRESHOLD`, so
 * the `analyzing` band has something to advance through. Kept shallow so the
 * suite stays cheap.
 */
const TIER = resolveTier('custom', { rows: 100, cols: 400, seed: 1 });

describe('loader progress reporting', () => {
  let harness: NodeDuckDBHarness;
  let scratchDir: string;
  let counter = 0;
  const tn = (suffix: string): string => `progress_${suffix}_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    scratchDir = await mkdtemp(join(tmpdir(), 'dt-load-progress-'));
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
    if (scratchDir) await rm(scratchDir, { recursive: true, force: true });
  });

  /** Encode a tier through DuckDB's own writer. See `queryBudget.test.ts`. */
  async function encodeTier(spec: TierSpec, format: 'parquet' | 'json'): Promise<ArrayBuffer> {
    const path = join(scratchDir, `${tn('src')}.${format}`);
    const options = format === 'parquet' ? 'FORMAT PARQUET' : 'FORMAT JSON, ARRAY true';
    await harness.conn.query(`COPY (${tierSelectSQL(spec)}) TO '${path}' (${options})`);
    const bytes = await harness.db.copyFileToBuffer(path);
    await harness.db.dropFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  /** Every report one load produced, in order. */
  async function record(
    body: (report: (info: ProgressInfo) => void) => Promise<void>,
  ): Promise<ProgressInfo[]> {
    const reports: ProgressInfo[] = [];
    await body((info) => reports.push(info));
    return reports;
  }

  /**
   * The invariants every format must satisfy. Asserted as a helper rather
   * than duplicated three times, because the point is that a progress bar
   * behaves identically whatever the source format is.
   */
  function expectHonestSequence(reports: ProgressInfo[]): void {
    expect(reports.length).toBeGreaterThan(2);

    // Never backwards, and never below where the main thread handed over.
    const percents = reports.map((r) => r.percent);
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i], `report ${i} of ${JSON.stringify(reports[i])}`).toBeGreaterThanOrEqual(
        percents[i - 1]!,
      );
    }
    expect(percents[0]).toBeGreaterThanOrEqual(WORKER_PROGRESS_START);

    // Exactly one terminal report, and it is last.
    expect(percents.filter((p) => p === 100)).toHaveLength(1);
    expect(percents.at(-1)).toBe(100);

    // Nothing in the worker can be interrupted: `cancelSent()` does not
    // abort a running DuckDB statement, and the ingest CTAS is the longest
    // one here.
    expect(reports.every((r) => r.cancelable === false)).toBe(true);

    // Stages appear in execution order, which is not the order their names
    // suggest — DuckDB reads the source for the schema preflight, then the
    // type probe classifies, then the table is materialized.
    const stageOrder = ['parsing', 'analyzing', 'indexing'];
    const seen = reports.map((r) => r.stage);
    expect(new Set(seen)).toEqual(new Set(stageOrder));
    const firstIndex = stageOrder.map((s) => seen.indexOf(s));
    expect(firstIndex).toEqual([...firstIndex].sort((a, b) => a - b));
  }

  it('reports honest stages for CSV', async () => {
    const data = tierCSV(TIER);
    const reports = await record(async (reportProgress) => {
      await loadCSV(
        data,
        { tableName: tn('csv') },
        { db: harness.db, conn: harness.conn, reportProgress },
      );
    });
    expectHonestSequence(reports);
  }, 120_000);

  it('reports honest stages for JSON', async () => {
    const data = await encodeTier(TIER, 'json');
    const reports = await record(async (reportProgress) => {
      await loadJSON(
        data,
        { tableName: tn('json') },
        { db: harness.db, conn: harness.conn, reportProgress },
      );
    });
    expectHonestSequence(reports);
  }, 120_000);

  it('reports honest stages for Parquet, advancing through the probe chunks', async () => {
    const data = await encodeTier(TIER, 'parquet');
    const reports = await record(async (reportProgress) => {
      await loadParquet(
        data,
        { tableName: tn('parquet') },
        { db: harness.db, conn: harness.conn, reportProgress },
      );
    });
    expectHonestSequence(reports);

    // Parquet is the format that reaches the loader with every temporal
    // class still VARCHAR, so it is the one guaranteed to probe more than
    // one chunk — the only sub-step of a load with real granularity.
    const analyzing = reports.filter((r) => r.stage === 'analyzing');
    expect(analyzing.length).toBeGreaterThan(1);
    for (const report of analyzing) {
      expect(report.total).toBeGreaterThan(0);
      expect(report.loaded).toBeGreaterThan(0);
      expect(report.loaded!).toBeLessThanOrEqual(report.total!);
    }
    // The band is walked, not jumped: the last chunk closes it.
    const [, end] = LOAD_PROGRESS_BANDS.analyzing;
    expect(analyzing.at(-1)!.percent).toBe(end);
    expect(analyzing[0]!.percent).toBeLessThan(end);
  }, 120_000);

  it('runs unchanged when nobody is listening', async () => {
    // `reportProgress` is optional and the loaders must not depend on it —
    // every test that drives a loader without one is relying on this.
    const data = tierCSV(TIER);
    const result = await loadCSV(
      data,
      { tableName: tn('silent') },
      { db: harness.db, conn: harness.conn },
    );
    expect(result.rowCount).toBe(TIER.rows);
  }, 120_000);
});
