/**
 * Phase 0 (`plans/scaling/phase-00-harness.md`): the tier builders and the
 * cell oracle.
 *
 * Three layers, cheapest first:
 *  1. the oracle is deterministic and its serialized copy has not drifted;
 *  2. the emitted SQL / CSV text is what later phases expect to read;
 *  3. a **real** DuckDB round trip at a micro tier (40 × 1,000) proves the
 *     generated data actually has the shape the oracle claims — including
 *     that classes 15/16/17 trip all three of the parquet loader's type
 *     detection passes.
 *
 * (3) is the load-bearing one: everything downstream (the browser column
 * oracle, the demo harness, the baselines) trusts that `cellOracle` and
 * DuckDB agree, and only a real query can establish that.
 */
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadParquet } from '@/worker/loaders/parquet';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';
import {
  CLASS_CYCLE,
  ORACLE_FN_SOURCE,
  TARGET_PROBE_COLUMNS,
  TEXT_COMPARABLE_CLASSES,
  TIERS,
  cellOracle,
  classDataType,
  classDuckDBType,
  classLoadedDuckDBType,
  columnClass,
  columnName,
  resolveTier,
  targetCopySQL,
  tierCSV,
  tierSelectSQL,
  tierTableSQL,
  type TierSpec,
} from './tiers';

/** 40 × 1,000: two full class cycles, small enough to round-trip in seconds. */
const MICRO: TierSpec = { name: 'micro', rows: 1_000, cols: 40, seed: 7 };

/** Coordinates spread across every class, both cycles, and the row range. */
function sampleGrid(spec: TierSpec): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const i of [0, 1, 7, 99, 100, 511, 999]) {
    for (let c = 0; c < spec.cols; c++) out.push([i, c]);
  }
  return out;
}

describe('tier oracle', () => {
  it('is deterministic and pure in (i, c, seed)', () => {
    for (const [i, c] of sampleGrid(MICRO)) {
      expect(cellOracle(i, c, MICRO.seed)).toEqual(cellOracle(i, c, MICRO.seed));
    }
    // A different seed must actually move the values (otherwise the seed is
    // decorative and two tiers would be indistinguishable).
    const withSeed = sampleGrid(MICRO).map(([i, c]) => cellOracle(i, c, 7));
    const other = sampleGrid(MICRO).map(([i, c]) => cellOracle(i, c, 8));
    expect(withSeed).not.toEqual(other);
  });

  it('produces the documented shape per class', () => {
    const seed = 3;
    expect(cellOracle(42, 0, seed)).toBe(42); // class 0 — row oracle
    expect(typeof cellOracle(42, 20, seed)).toBe('number'); // class 0, cycle 2
    expect(typeof cellOracle(1, 1, seed)).toBe('number'); // class 1–9 DOUBLE
    expect(typeof cellOracle(0, 10, seed)).toBe('number'); // class 10 INTEGER
    expect(cellOracle(0, 12, seed)).toMatch(/^[A-Z]$/); // class 12–14 VARCHAR
    expect(cellOracle(0, 15, seed)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(cellOracle(0, 16, seed)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cellOracle(0, 17, seed)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(typeof cellOracle(0, 18, seed)).toBe('number'); // class 18 epoch ms
    expect(typeof cellOracle(0, 19, seed)).toBe('boolean'); // class 19 BOOLEAN
  });

  it('emits ~1% NULLs in the DOUBLE classes and none elsewhere', () => {
    let nulls = 0;
    for (let i = 0; i < 1000; i++) if (cellOracle(i, 1, 0) === null) nulls++;
    expect(nulls).toBe(10);
    for (let c = 0; c < CLASS_CYCLE; c++) {
      if (columnClass(c) >= 1 && columnClass(c) <= 9) continue;
      for (let i = 0; i < 200; i++) expect(cellOracle(i, c, 0)).not.toBeNull();
    }
  });

  it('matches the loader detection patterns for classes 15/16/17', () => {
    // The exact regexes from src/worker/loaders/common.ts:72,79,87 — if the
    // loader's matchers move, this test is the tripwire.
    const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    const TIME = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;
    for (let i = 0; i < 500; i++) {
      const ts = cellOracle(i, 15, 4) as string;
      const date = cellOracle(i, 16, 4) as string;
      const time = cellOracle(i, 17, 4) as string;
      expect(ts).toMatch(ISO_TIMESTAMP);
      expect(Number.isNaN(new Date(ts.replace(' ', 'T')).getTime())).toBe(false);
      expect(date).toMatch(ISO_DATE);
      expect(date).not.toMatch(ISO_TIMESTAMP);
      expect(time).toMatch(TIME);
      expect(time).not.toMatch(ISO_TIMESTAMP);
      expect(time).not.toMatch(ISO_DATE);
      // The loader's range check (common.ts:118-129).
      const [h, m, s] = time.split(':').map(Number) as [number, number, number];
      expect(h).toBeLessThanOrEqual(23);
      expect(m).toBeLessThanOrEqual(59);
      expect(s).toBeLessThan(60);
    }
  });
});

describe('ORACLE_FN_SOURCE', () => {
  const built = new Function(ORACLE_FN_SOURCE)() as ((
    i: number,
    c: number,
    seed: number,
  ) => string | null) & {
    value: typeof cellOracle;
  };

  it('carries the same value implementation (anti-drift)', () => {
    for (const [i, c] of sampleGrid(MICRO)) {
      expect(built.value(i, c, MICRO.seed)).toEqual(cellOracle(i, c, MICRO.seed));
    }
  });

  it('returns rendered text only for text-comparable classes', () => {
    for (const [i, c] of sampleGrid(MICRO)) {
      const text = built(i, c, MICRO.seed);
      if (!TEXT_COMPARABLE_CLASSES.includes(columnClass(c))) {
        expect(text).toBeNull();
        continue;
      }
      expect(typeof text).toBe('string');
    }
  });

  it('renders integers, letters and booleans the way CellRenderer does', () => {
    // Mirrors src/table/Cell.ts:156-177 (integers) and :131-132 (booleans).
    expect(built(42, 0, 0)).toBe((42).toLocaleString());
    expect(built(123456, 0, 0)).toBe((123456).toLocaleString());
    expect(built(1_000_000, 0, 0)).toBe((1_000_000).toExponential(2));
    expect(built(0, 0, 0)).toBe('0');
    expect(built(0, 12, 0)).toMatch(/^[A-Z]$/);
    expect(['true', 'false']).toContain(built(0, 19, 0));
  });

  it('is self-contained — no module-scope references leak into the source', () => {
    // If `cellOracle` ever grows a call to a module-level helper, the
    // serialized copy silently breaks in `page.evaluate`. Building it in a
    // bare `new Function` scope (done above) already proves evaluability;
    // this pins the contract that the source names only its own symbols.
    expect(ORACLE_FN_SOURCE).toContain('function dtCellValue');
    expect(ORACLE_FN_SOURCE).toContain('return dtCellOracle;');
    expect(ORACLE_FN_SOURCE).not.toMatch(/\bimport\b|\brequire\(/);
  });
});

describe('tier specs', () => {
  it('matches the README §6 tier table', () => {
    expect(TIERS['wide-ci']).toEqual({ name: 'wide-ci', rows: 20_000, cols: 300, seed: 1 });
    expect(TIERS.wide).toEqual({ name: 'wide', rows: 100_000, cols: 1_000, seed: 2 });
    expect(TIERS['wide-csv']).toEqual({ name: 'wide-csv', rows: 5_000, cols: 1_000, seed: 3 });
    expect(TIERS.grid).toEqual({ name: 'grid', rows: 500_000, cols: 200, seed: 4 });
    expect(TIERS.deep).toEqual({ name: 'deep', rows: 5_000_000, cols: 20, seed: 5 });
    expect(TIERS.target).toEqual({ name: 'target', rows: 5_000_000, cols: 1_000, seed: 6 });
  });

  it('resolves overrides and rejects nonsense', () => {
    expect(resolveTier('wide-ci')).toEqual(TIERS['wide-ci']);
    expect(resolveTier('wide-ci', { rows: 10, cols: 5, seed: 2 })).toEqual({
      name: 'wide-ci',
      rows: 10,
      cols: 5,
      seed: 2,
    });
    expect(resolveTier('custom', { rows: 10, cols: 5 })).toEqual({
      name: 'custom',
      rows: 10,
      cols: 5,
      seed: 0,
    });
    expect(() => resolveTier('bogus')).toThrow(/Unknown tier/);
    expect(() => resolveTier('custom', { cols: 5 })).toThrow(/rows must be/);
    expect(() => resolveTier('custom', { rows: 5 })).toThrow(/cols must be/);
    expect(() => resolveTier('wide-ci', { seed: -1 })).toThrow(/seed must be/);
  });
});

describe('emitted SQL', () => {
  it('builds a CREATE OR REPLACE over range(0, rows)', () => {
    const sql = tierTableSQL({ name: 't', rows: 5, cols: 3, seed: 0 }, 'scratch');
    expect(sql).toBe(
      'CREATE OR REPLACE TABLE "scratch" AS\n' +
        'SELECT CAST(i AS INTEGER) AS "col_0",\n' +
        '       CASE WHEN (i + 1) % 100 = 0 THEN NULL ELSE CAST((i * 31 + 17) % 100000 AS DOUBLE) / CAST(100 AS DOUBLE) END AS "col_1",\n' +
        '       CASE WHEN (i + 2) % 100 = 0 THEN NULL ELSE CAST((i * 31 + 34) % 100000 AS DOUBLE) / CAST(100 AS DOUBLE) END AS "col_2"\n' +
        'FROM range(0, 5) t(i)',
    );
  });

  it('emits one column per tier column, in order', () => {
    const sql = tierTableSQL(MICRO, 'scratch');
    for (let c = 0; c < MICRO.cols; c++) expect(sql).toContain(`AS "${columnName(c)}"`);
    expect(sql.indexOf('AS "col_0"')).toBeLessThan(sql.indexOf('AS "col_39"'));
  });

  it('builds a streamed SELECT with the same projection and no table', () => {
    const spec = { name: 't', rows: 5, cols: 3, seed: 0 };
    const select = tierSelectSQL(spec);
    expect(select).toBe(
      'SELECT CAST(i AS INTEGER) AS "col_0", ' +
        'CASE WHEN (i + 1) % 100 = 0 THEN NULL ELSE CAST((i * 31 + 17) % 100000 AS DOUBLE) / CAST(100 AS DOUBLE) END AS "col_1", ' +
        'CASE WHEN (i + 2) % 100 = 0 THEN NULL ELSE CAST((i * 31 + 34) % 100000 AS DOUBLE) / CAST(100 AS DOUBLE) END AS "col_2" ' +
        'FROM range(0, 5) t(i)',
    );
    // Same columns as the materializing form — the browser harness swapped
    // to this one to stay inside DuckDB-WASM's heap, and a projection that
    // drifted from `tierTableSQL` would make the two paths different tiers.
    for (let c = 0; c < spec.cols; c++) {
      expect(select).toContain(`AS "${columnName(c)}"`);
    }
    // Deliberately unsorted: an ORDER BY would force the materialization
    // this form exists to avoid. `range()` scan order is the contract.
    expect(select).not.toContain('ORDER BY');
  });

  it('folds the seed into every class expression', () => {
    const a = tierTableSQL({ name: 't', rows: 2, cols: CLASS_CYCLE, seed: 0 }, 'x');
    const b = tierTableSQL({ name: 't', rows: 2, cols: CLASS_CYCLE, seed: 1 }, 'x');
    expect(a).not.toBe(b);
  });

  it('builds a streamed COPY for TARGET with probe + bulk columns', () => {
    const sql = targetCopySQL(TIERS.target, 'dt_target.parquet');
    expect(sql.startsWith('COPY (SELECT ')).toBe(true);
    expect(sql).toContain("TO 'dt_target.parquet' (FORMAT PARQUET, ROW_GROUP_SIZE 30720)");
    expect(sql).toContain('FROM range(0, 5000000) t(i)');
    // Probe columns keep the class-cycle expressions the oracle describes…
    expect(sql).toContain('CAST(i AS INTEGER) AS "col_0"');
    expect(sql).toContain(`AS "${columnName(TARGET_PROBE_COLUMNS - 1)}"`);
    // …everything past them is a run-length column.
    expect(sql).toContain(`((i + ${TARGET_PROBE_COLUMNS * 4096}) // 4096)`);
    expect(sql).not.toContain('CREATE');
  });

  it('honours a lowered ROW_GROUP_SIZE (the documented memory fallback)', () => {
    expect(targetCopySQL(TIERS.target, 'f.parquet', 8192)).toContain('ROW_GROUP_SIZE 8192');
  });
});

describe('tierCSV', () => {
  const spec: TierSpec = { name: 'csv', rows: 4, cols: CLASS_CYCLE, seed: 2 };
  const csv = tierCSV(spec);
  const lines = csv.trimEnd().split('\n');

  it('starts with a col_<n> header and holds one line per row', () => {
    expect(lines[0]).toBe(Array.from({ length: spec.cols }, (_, c) => columnName(c)).join(','));
    expect(lines).toHaveLength(spec.rows + 1);
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('serializes every class back to its oracle value', () => {
    for (let i = 0; i < spec.rows; i++) {
      const fields = lines[i + 1]!.split(',');
      expect(fields).toHaveLength(spec.cols);
      for (let c = 0; c < spec.cols; c++) {
        const value = cellOracle(i, c, spec.seed);
        const field = fields[c]!;
        if (value === null) expect(field).toBe('');
        else if (typeof value === 'boolean') expect(field).toBe(String(value));
        else if (typeof value === 'string') expect(field).toBe(value);
        else if (columnClass(c) === 18) {
          expect(field).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
          expect(new Date(field.replace(' ', 'T') + 'Z').getTime()).toBe(value);
        } else expect(Number(field)).toBe(value);
      }
    }
  });

  it('never emits a field that would need CSV quoting', () => {
    expect(csv).not.toMatch(/[",]\s*[",]/);
    for (const line of lines) expect(line).not.toContain('"');
  });
});

// The Node DuckDB boot costs ~300–800 ms (`tests/helpers/duckdbNode.ts:109`),
// so the whole round trip shares one instance.
describe('micro-tier round trip through real DuckDB', () => {
  let harness: NodeDuckDBHarness;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 60_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('materializes the spec: row count, column count, per-class types', async () => {
    await harness.conn.query(tierTableSQL(MICRO, 'micro_src'));

    const count = await harness.conn.query('SELECT COUNT(*) AS n FROM micro_src');
    expect(Number(count.toArray()[0]!.toJSON().n)).toBe(MICRO.rows);

    const described = await harness.conn.query('DESCRIBE micro_src');
    const rows = described.toArray().map((r) => r.toJSON() as Record<string, unknown>);
    expect(rows).toHaveLength(MICRO.cols);
    for (let c = 0; c < MICRO.cols; c++) {
      expect(String(rows[c]!['column_name'])).toBe(columnName(c));
      expect(String(rows[c]!['column_type'])).toBe(classDuckDBType(c));
    }
  }, 120_000);

  it('agrees with cellOracle cell by cell', async () => {
    const bridge = makeNodeBridge(harness.conn, harness.db);
    const probeRows = [0, 1, 99, 100, 501, 999];
    const fetched = await bridge.query<Record<string, unknown>>(
      `SELECT * FROM micro_src WHERE "col_0" IN (${probeRows.join(', ')}) ORDER BY "col_0"`,
    );
    expect(fetched).toHaveLength(probeRows.length);

    for (const [n, row] of fetched.entries()) {
      const i = probeRows[n]!;
      for (let c = 0; c < MICRO.cols; c++) {
        const actual = row[columnName(c)];
        const expected = cellOracle(i, c, MICRO.seed);
        const label = `row ${i} ${columnName(c)} (class ${columnClass(c)})`;
        if (expected === null) {
          expect(actual, label).toBeNull();
        } else if (columnClass(c) === 18) {
          // Native TIMESTAMP arrives as epoch ms after convertBigInts.
          expect(Number(actual), label).toBe(expected);
        } else if (typeof expected === 'number') {
          expect(Number(actual), label).toBeCloseTo(expected, 10);
        } else {
          expect(actual, label).toBe(expected);
        }
      }
    }
  }, 120_000);

  it('survives the real parquet load path with all three detection passes', async () => {
    const bridge = makeNodeBridge(harness.conn, harness.db);
    const buf = await bridge.exportToBuffer('SELECT * FROM micro_src ORDER BY "col_0"', 'parquet');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

    const result = await loadParquet(
      ab,
      { tableName: 'micro_loaded' },
      {
        db: harness.db,
        conn: harness.conn,
      },
    );

    expect(result.rowCount).toBe(MICRO.rows);
    expect(result.columns[0]).toBe('__rowid__');
    expect(result.columns).toHaveLength(MICRO.cols + 1);

    const byName = new Map(result.schema.map((s) => [s.name, s]));
    for (let c = 0; c < MICRO.cols; c++) {
      const entry = byName.get(columnName(c))!;
      const label = `${columnName(c)} (class ${columnClass(c)})`;
      expect(entry.originalType, label).toBe(classLoadedDuckDBType(c));
      expect(entry.type, label).toBe(classDataType(c));
    }
    // The whole point: classes 15/16/17 came in as VARCHAR and left as
    // TIMESTAMP / DATE / TIME, which only happens if the loader ran all
    // three detect-and-rewrite passes.
    expect(byName.get('col_15')!.originalType).toBe('TIMESTAMP');
    expect(byName.get('col_16')!.originalType).toBe('DATE');
    expect(byName.get('col_17')!.originalType).toBe('TIME');

    // Three full-table rewrites later, __rowid__ still equals the source
    // row index — the row oracle survives, because each rewrite is
    // ORDER BY "__rowid__".
    const drift = await bridge.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM micro_loaded WHERE "__rowid__" <> "col_0"',
    );
    expect(Number(drift[0]!.n)).toBe(0);
  }, 180_000);

  // TARGET is a ~1 h, multi-hundred-MB write at full scale; a syntax slip in
  // `bulkExpr` (DuckDB's `//` integer division, the COPY option list) must
  // not be discovered there. Same SQL, 40 × 2,000.
  it('streams a TARGET-shaped COPY straight to parquet', async () => {
    const scaled: TierSpec = { name: 'target', rows: 2_000, cols: 40, seed: TIERS.target.seed };
    const file = join(tmpdir(), `dt_target_probe_${process.pid}.parquet`);
    try {
      await harness.conn.query(targetCopySQL(scaled, file, 512));
      const bridge = makeNodeBridge(harness.conn, harness.db);
      const [counted] = await bridge.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM read_parquet('${file}')`,
      );
      expect(Number(counted!.n)).toBe(scaled.rows);

      const described = await bridge.query<Record<string, unknown>>(
        `DESCRIBE SELECT * FROM read_parquet('${file}')`,
      );
      expect(described).toHaveLength(scaled.cols);
      for (let c = 0; c < TARGET_PROBE_COLUMNS; c++) {
        expect(String(described[c]!['column_type']), columnName(c)).toBe(classDuckDBType(c));
      }

      // A deep windowed fetch, the shape Phase 10 asserts at row 4,999,000:
      // the probe columns must still be oracle-correct.
      const window = await bridge.query<Record<string, unknown>>(
        `SELECT * FROM read_parquet('${file}') WHERE "col_0" >= 1900 ORDER BY "col_0" LIMIT 8`,
      );
      for (const [n, row] of window.entries()) {
        const i = 1900 + n;
        for (let c = 0; c < TARGET_PROBE_COLUMNS; c++) {
          const expected = cellOracle(i, c, scaled.seed);
          const label = `row ${i} ${columnName(c)}`;
          if (expected === null) expect(row[columnName(c)], label).toBeNull();
          else if (typeof expected === 'number')
            expect(Number(row[columnName(c)]), label).toBeCloseTo(expected, 10);
          else expect(row[columnName(c)], label).toBe(expected);
        }
      }
    } finally {
      await rm(file, { force: true });
    }
  }, 180_000);
});
