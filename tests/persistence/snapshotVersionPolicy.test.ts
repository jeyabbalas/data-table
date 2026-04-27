import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '@/persistence/SessionStore';
import type { SessionSnapshot } from '@/persistence/types';
import { SNAPSHOT_VERSION } from '@/persistence/types';

/**
 * Phase 7 — snapshot version policy lock.
 *
 * `coerceLoadedSnapshot` rejects any snapshot whose `version` is not an
 * integer in `[1, SNAPSHOT_VERSION]`. Pre-1.0 clean break: no migration
 * framework. Pre-v5 snapshots that happen to have the required fields
 * keep loading via the lenient field-by-field shape check; future-version
 * snapshots are explicitly refused so a downgraded library does not
 * misinterpret a newer blob.
 */

function baseSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName: 'test_table',
    filters: [],
    sortColumns: [],
    visibleColumns: ['id'],
    columnOrder: ['id'],
    columnWidths: { id: 100 },
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

describe('SessionStore — snapshot version policy', () => {
  let store: SessionStore;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('dt-sessions');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
    store = new SessionStore();
    await store.open();
  });

  afterEach(() => {
    store.close();
  });

  it('accepts the current SNAPSHOT_VERSION', async () => {
    const snap = baseSnapshot({ version: SNAPSHOT_VERSION });
    await store.save(snap);
    const loaded = await store.load('test_table');
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SNAPSHOT_VERSION);
  });

  it('accepts every legacy version in [1, SNAPSHOT_VERSION] via lenient shape check', async () => {
    for (let ver = 1; ver <= SNAPSHOT_VERSION; ver++) {
      const snap = baseSnapshot({ version: ver, tableName: `legacy_${ver}` });
      await store.save(snap);
      const loaded = await store.load(`legacy_${ver}`);
      expect(loaded, `legacy v${ver} snapshot should load`).not.toBeNull();
      expect(loaded!.version).toBe(ver);
    }
  });

  it('rejects a future-version snapshot (version > SNAPSHOT_VERSION)', async () => {
    const future = baseSnapshot({ version: SNAPSHOT_VERSION + 1, tableName: 'future' });
    await store.save(future);
    const loaded = await store.load('future');
    expect(loaded).toBeNull();
  });

  it('rejects very-future versions (e.g. v999)', async () => {
    const future = baseSnapshot({ version: 999, tableName: 'far_future' });
    await store.save(future);
    const loaded = await store.load('far_future');
    expect(loaded).toBeNull();
  });

  it('rejects version 0', async () => {
    const v0 = baseSnapshot({ version: 0, tableName: 'v0' });
    await store.save(v0);
    const loaded = await store.load('v0');
    expect(loaded).toBeNull();
  });

  it('rejects negative versions', async () => {
    const negative = baseSnapshot({ version: -1, tableName: 'neg' });
    await store.save(negative);
    const loaded = await store.load('neg');
    expect(loaded).toBeNull();
  });

  it('rejects fractional versions (NaN-safe via Number.isInteger)', async () => {
    const fractional = baseSnapshot({ version: 5.5, tableName: 'frac' });
    await store.save(fractional);
    const loaded = await store.load('frac');
    expect(loaded).toBeNull();
  });

  it('rejects NaN version', async () => {
    const nan = baseSnapshot({ version: NaN, tableName: 'nan' });
    await store.save(nan);
    const loaded = await store.load('nan');
    expect(loaded).toBeNull();
  });

  it('rejects Infinity version', async () => {
    const infinity = baseSnapshot({ version: Infinity, tableName: 'inf' });
    await store.save(infinity);
    const loaded = await store.load('inf');
    expect(loaded).toBeNull();
  });

  it('still rejects when version is the wrong type (string)', async () => {
    // Bypass the SessionSnapshot type to simulate a tampered same-origin blob.
    const tampered = baseSnapshot({ tableName: 'tampered' }) as unknown as Record<string, unknown>;
    tampered['version'] = '5';
    await store.save(tampered as unknown as SessionSnapshot);
    const loaded = await store.load('tampered');
    expect(loaded).toBeNull();
  });

  it('synthesised pre-v4 snapshot with inline vector values still loads (no _poolRef)', async () => {
    // Pre-v4: derivedColumns store inline `values: [...]` arrays directly,
    // without a `_poolRef` indirection. The library's `isPooledVectorRef`
    // guard distinguishes the two at deserialisation. This test locks the
    // contract that an "older" v4 snapshot (which today is functionally
    // identical to v5 modulo annotations) loads cleanly.
    const oldVector = baseSnapshot({
      version: 4,
      tableName: 'pre_v5',
      derivedColumns: [
        {
          kind: 'vector',
          name: 'jitter',
          vectorType: 'float',
          values: [0.1, 0.2, 0.3],
        },
      ],
    });
    await store.save(oldVector);
    const loaded = await store.load('pre_v5');
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(4);
    expect(loaded!.derivedColumns).toHaveLength(1);
    expect(loaded!.derivedColumns[0]).toMatchObject({ kind: 'vector', name: 'jitter' });
  });

  it('snapshot missing `version` key is rejected by the required-keys check', async () => {
    const broken = baseSnapshot({ tableName: 'noversion' }) as unknown as Record<string, unknown>;
    delete broken['version'];
    await store.save(broken as unknown as SessionSnapshot);
    const loaded = await store.load('noversion');
    expect(loaded).toBeNull();
  });
});
