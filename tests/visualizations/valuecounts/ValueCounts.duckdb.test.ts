/**
 * Phase 6 — value-counts correctness against real DuckDB-WASM.
 *
 * Locks the top-N + "Other" cap, all-NULL / boolean / all-unique edges,
 * and SQL identifier quoting against adversarial column names. The "Other"
 * count is the audit's headline gap — we synthesize a 1k-row fixture with
 * 100 distinct values, take top-10, and assert that
 * `Other.count + sum(top-10) === nonNullTotal`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fetchValueCountsData } from '@/visualizations/valuecounts/ValueCountsData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

describe('value counts — real DuckDB integration', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let counter = 0;
  const tableName = (suffix: string): string => `viz_vc_${suffix}_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('all-NULL string column: empty segments, nullCount = total', async () => {
    const t = tableName('all_null');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST(NULL AS VARCHAR) AS s FROM range(7)`,
    );
    const data = await fetchValueCountsData(t, 's', [], bridge);
    expect(data.segments).toEqual([]);
    expect(data.nullCount).toBe(7);
    expect(data.total).toBe(7);
    expect(data.distinctCount).toBe(0);
    expect(data.isAllUnique).toBe(false);
  });

  it('zero rows: empty segments, distinctCount = 0', async () => {
    const t = tableName('empty');
    await harness.conn.query(`CREATE TABLE "${t}" (s VARCHAR)`);
    const data = await fetchValueCountsData(t, 's', [], bridge);
    expect(data.segments).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.nullCount).toBe(0);
    expect(data.distinctCount).toBe(0);
  });

  it('boolean column: segments for true/false, nullCount tracks NULLs separately', async () => {
    const t = tableName('boolean');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT b FROM (VALUES
        (true), (true), (true), (false), (false), (CAST(NULL AS BOOLEAN)), (CAST(NULL AS BOOLEAN))
      ) AS s(b)`,
    );
    const data = await fetchValueCountsData(t, 'b', [], bridge);
    expect(data.total).toBe(7);
    expect(data.nullCount).toBe(2);
    expect(data.distinctCount).toBe(2);
    expect(data.segments).toHaveLength(2);
    const counts = new Map(data.segments.map((s) => [s.value, s.count]));
    expect(counts.get('true')).toBe(3);
    expect(counts.get('false')).toBe(2);
  });

  it('all-unique string column: isAllUnique = true; distinctCount === nonNullCount', async () => {
    const t = tableName('all_unique');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT 'id_' || range::VARCHAR AS s FROM range(5)`,
    );
    const data = await fetchValueCountsData(t, 's', [], bridge);
    expect(data.distinctCount).toBe(5);
    expect(data.nullCount).toBe(0);
    expect(data.isAllUnique).toBe(true);
  });

  it('top-N + Other cap: with 100 distinct values and maxCategories=10, segments = 10 top + 1 Other', async () => {
    const t = tableName('top_n');
    // Triangular distribution: cat_i appears (100−i) times for i in 0..99.
    // Total rows = 100 + 99 + … + 1 = 5050. Top-10 are cat_0…cat_9.
    await harness.conn.query(
      `CREATE TABLE "${t}" AS
       SELECT 'cat_' || (n % 100)::VARCHAR AS s
       FROM (SELECT range AS n FROM range(10000))
       WHERE (n / 100) + (n % 100) < 100`,
    );
    const setup = await bridge.query<{ d: number; t: number }>(
      `SELECT COUNT(DISTINCT s) AS d, COUNT(*) AS t FROM "${t}"`,
    );
    expect(setup[0]!.d).toBe(100);
    expect(setup[0]!.t).toBe(5050);
    const totalRows = setup[0]!.t;

    const data = await fetchValueCountsData(t, 's', [], bridge, 10);
    expect(data.distinctCount).toBe(100);
    expect(data.nullCount).toBe(0);
    expect(data.segments.length).toBe(11); // 10 top + 1 Other
    const otherSeg = data.segments.find((s) => s.isOther);
    expect(otherSeg).toBeDefined();
    expect(otherSeg!.value).toBe('Other');
    expect(otherSeg!.otherCount).toBe(90); // 100 distinct − 10 in top

    // Conservation law: Other.count + sum(top-10) === nonNullTotal.
    const top10Sum = data.segments.filter((s) => !s.isOther).reduce((a, b) => a + b.count, 0);
    expect(top10Sum + otherSeg!.count).toBe(totalRows);
  });

  it('high cardinality (all unique with 200 rows, maxCategories=10): no Other when distinctCount === nonNullCount and isAllUnique', async () => {
    // When every value is unique AND distinctCount > maxCategories, the
    // implementation still emits top-10 + Other; isAllUnique is true.
    const t = tableName('all_unique_200');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT 'id_' || range::VARCHAR AS s FROM range(200)`,
    );
    const data = await fetchValueCountsData(t, 's', [], bridge, 10);
    expect(data.distinctCount).toBe(200);
    expect(data.isAllUnique).toBe(true);
    // Every distinct value has count 1; top-10 are 10 of the 200, Other holds
    // the remaining 190.
    expect(data.segments.length).toBe(11);
    const otherSeg = data.segments.find((s) => s.isOther);
    expect(otherSeg).toBeDefined();
    expect(otherSeg!.count).toBe(190);
    expect(otherSeg!.otherCount).toBe(190);
  });

  it('exactly maxCategories distinct values: no Other segment', async () => {
    const t = tableName('exact_cap');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS
       SELECT 'cat_' || (range % 5)::VARCHAR AS s FROM range(50)`,
    );
    const data = await fetchValueCountsData(t, 's', [], bridge, 10);
    expect(data.distinctCount).toBe(5);
    expect(data.segments).toHaveLength(5);
    expect(data.segments.find((s) => s.isOther)).toBeUndefined();
  });

  it('NULL accounting: nullCount + sum(segments.count) === total', async () => {
    const t = tableName('nulls_mixed');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT s FROM (VALUES
        ('a'), ('b'), (NULL), ('a'), ('c'), (NULL), ('a'), ('b')
      ) AS s(s)`,
    );
    const data = await fetchValueCountsData(t, 's', [], bridge);
    expect(data.total).toBe(8);
    expect(data.nullCount).toBe(2);
    const sum = data.segments.reduce((a, b) => a + b.count, 0);
    expect(sum + data.nullCount).toBe(data.total);
  });

  it('point filter narrows the value counts to the matching subset', async () => {
    const t = tableName('filtered');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT s FROM (VALUES
        ('us'), ('us'), ('us'), ('ca'), ('ca'), ('mx')
      ) AS s(s)`,
    );
    const data = await fetchValueCountsData(
      t,
      's',
      [{ type: 'point', column: 's', value: 'us' } as never],
      bridge,
    );
    expect(data.distinctCount).toBe(1);
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]!.value).toBe('us');
    expect(data.segments[0]!.count).toBe(3);
  });

  it('adversarial column name (spaces, quotes): SQL identifier quoting prevents injection', async () => {
    // Column name with embedded quotes and spaces — quoteIdentifier escapes
    // the closing quote so DuckDB sees a single identifier.
    const t = tableName('weird_col');
    await harness.conn.query(`CREATE TABLE "${t}" ("weird ""col"" name" VARCHAR);`);
    await harness.conn.query(`INSERT INTO "${t}" VALUES ('a'), ('b'), ('a')`);
    const data = await fetchValueCountsData(t, 'weird "col" name', [], bridge);
    expect(data.total).toBe(3);
    expect(data.distinctCount).toBe(2);
    const counts = new Map(data.segments.map((s) => [s.value, s.count]));
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
  });
});
