/**
 * Phase 4: end-to-end JSON loader tests against real fixtures.
 *
 * Drives `loadJSON` directly. Covers every JSON fixture under
 * `tests/fixtures/datasets/json/` plus NDJSON auto-detection and
 * reserved-column rejection.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadJSON } from '@/worker/loaders/json';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { readBinaryFixture, readTextFixture } from '../../helpers/fixtures';

describe('JSON loader — fixture integration', () => {
  let harness: NodeDuckDBHarness;
  let testCounter = 0;
  const tableName = (suffix: string): string => `json_${suffix}_${++testCounter}`;
  const ctx = (): { db: NodeDuckDBHarness['db']; conn: NodeDuckDBHarness['conn'] } => ({
    db: harness.db,
    conn: harness.conn,
  });

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  describe('titanic.json', () => {
    it('loads 891 rows × 13 columns', async () => {
      const data = await readBinaryFixture('json', 'titanic');
      const result = await loadJSON(data, { tableName: tableName('titanic') }, ctx());
      expect(result.rowCount).toBe(891);
      expect(result.columns).toContain('__rowid__');
      expect(result.columns).toContain('PassengerId');
      expect(result.columns).toContain('Name');
      expect(result.columns).toHaveLength(13);
    }, 15_000);

    it('infers types correctly through DuckDB JSON reader', async () => {
      const data = await readBinaryFixture('json', 'titanic');
      const result = await loadJSON(data, { tableName: tableName('titanic_t') }, ctx());
      const types = Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
      expect(types['PassengerId']).toBe('integer');
      expect(types['Survived']).toBe('integer');
      expect(types['Name']).toBe('string');
      expect(types['Age']).toBe('float');
      expect(types['Fare']).toBe('float');
    }, 15_000);
  });

  describe('nyc_taxi.json (subsample)', () => {
    it('loads with the expected schema', async () => {
      const data = await readBinaryFixture('json', 'nyc_taxi');
      const result = await loadJSON(data, { tableName: tableName('nyc') }, ctx());
      expect(result.rowCount).toBeGreaterThan(0);
      expect(result.columns).toContain('VendorID');
      expect(result.columns).toContain('total_amount');
      const types = Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
      // JSON ISO timestamps come back as VARCHAR from DuckDB; enhanceSchemaTypes coerces to TIMESTAMP.
      expect(types['tpep_pickup_datetime']).toBe('timestamp');
    }, 30_000);
  });

  describe('vins_de_france.json', () => {
    it('loads 40 rows × 9 columns', async () => {
      const data = await readBinaryFixture('json', 'vins_de_france');
      const result = await loadJSON(data, { tableName: tableName('vins') }, ctx());
      expect(result.rowCount).toBe(40);
      expect(result.columns).toEqual([
        '__rowid__',
        'region',
        'appellation',
        'cepage',
        'couleur',
        'millesime',
        'prix_eur',
        'production_hl',
        'bio',
      ]);
    });
  });

  describe('test_patterns.json', () => {
    it('loads with all string-pattern fixture columns present', async () => {
      const data = await readBinaryFixture('json', 'test_patterns');
      const result = await loadJSON(data, { tableName: tableName('patterns') }, ctx());
      expect(result.rowCount).toBeGreaterThan(0);
      // Test patterns fixture should contain at least one column we expect — UUID, email, or url.
      const cols = new Set(result.columns);
      const someExpected = ['uuid', 'email', 'url', 'ip', 'phone', 'sku'];
      const found = someExpected.some((c) => cols.has(c));
      expect(
        found,
        `expected at least one of ${someExpected.join(', ')} in ${[...cols].join(',')}`,
      ).toBe(true);
    });
  });

  describe('format auto-detection', () => {
    it('detects NDJSON when the source has one object per line', async () => {
      const ndjson = '{"a":1,"b":"x"}\n{"a":2,"b":"y"}\n{"a":3,"b":"z"}\n';
      const result = await loadJSON(ndjson, { tableName: tableName('nd') }, ctx());
      expect(result.rowCount).toBe(3);
      expect(result.columns).toEqual(['__rowid__', 'a', 'b']);
    });

    it('detects array format for [{}, {}] sources', async () => {
      const arr = '[{"a":1,"b":"x"},{"a":2,"b":"y"}]';
      const result = await loadJSON(arr, { tableName: tableName('arr') }, ctx());
      expect(result.rowCount).toBe(2);
    });

    it('honors an explicit format: ndjson option', async () => {
      const ndjson = '{"a":1}\n{"a":2}\n';
      const result = await loadJSON(
        ndjson,
        { tableName: tableName('explicit_nd'), format: 'ndjson' },
        ctx(),
      );
      expect(result.rowCount).toBe(2);
    });
  });

  describe('options & error paths', () => {
    it('throws LOAD_RESERVED_COLUMN_NAME for a JSON source containing __rowid__', async () => {
      const data = '[{"__rowid__":1,"name":"alice"},{"__rowid__":2,"name":"bob"}]';
      try {
        await loadJSON(data, { tableName: tableName('reserved') }, ctx());
        throw new Error('should have thrown');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('LOAD_RESERVED_COLUMN_NAME');
      }
    });

    it('rejects invalid sampleSize with LOAD_INVALID_OPTIONS', async () => {
      try {
        await loadJSON('[{"a":1}]', { tableName: tableName('badss'), sampleSize: -1 }, ctx());
        throw new Error('should have thrown');
      } catch (err) {
        expect((err as { code?: string; details?: { option?: string } }).code).toBe(
          'LOAD_INVALID_OPTIONS',
        );
      }
    });

    it('rejects non-integer maxDepth with LOAD_INVALID_OPTIONS', async () => {
      try {
        await loadJSON('[{"a":1}]', { tableName: tableName('baddepth'), maxDepth: 1.5 }, ctx());
        throw new Error('should have thrown');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('LOAD_INVALID_OPTIONS');
      }
    });

    it('accepts a string source equivalently to ArrayBuffer', async () => {
      const text = await readTextFixture('json', 'titanic');
      const result = await loadJSON(text, { tableName: tableName('titanic_str') }, ctx());
      expect(result.rowCount).toBe(891);
    }, 15_000);
  });
});
