/**
 * Phase 1 — IndexedDB snapshot tampering regression tests.
 *
 * Snapshots live in IndexedDB and can be modified by anything running on
 * the same origin (DevTools, browser extensions, malicious scripts loaded
 * via mis-configured CSP). The library shape-checks loaded snapshots and
 * drops anything that doesn't match the expected structure, then defers
 * field-level validation to `restoreStateFromSnapshot`.
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from '@/persistence/SessionStore';
import { SNAPSHOT_VERSION, type SessionSnapshot } from '@/persistence/types';

function makeValidSnapshot(): SessionSnapshot {
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
  };
}

/**
 * Bypass SessionStore.save's type guard to plant adversarial blobs into IDB.
 * Mirrors what a same-origin attacker (or a corrupt snapshot from a future
 * version) could put there.
 */
async function plantRaw(value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('dt-sessions', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'tableName' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(value);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('dt-sessions');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('SessionStore.load — shape coercion', () => {
  let store: SessionStore;

  beforeEach(async () => {
    await clearStore();
    store = new SessionStore();
    await store.open();
  });

  afterEach(() => {
    store.close();
  });

  it('returns a valid snapshot unchanged', async () => {
    const snap = makeValidSnapshot();
    await store.save(snap);
    const loaded = await store.load('test_table');
    expect(loaded).not.toBeNull();
    expect(loaded?.tableName).toBe('test_table');
  });

  it('returns null for a missing key', async () => {
    expect(await store.load('does_not_exist')).toBeNull();
  });

  it('returns null when version field is missing', async () => {
    await plantRaw({
      // version intentionally omitted
      timestamp: 0,
      tableName: 'tampered_no_version',
      filters: [],
      sortColumns: [],
      visibleColumns: [],
      columnOrder: [],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
    });
    expect(await store.load('tampered_no_version')).toBeNull();
  });

  it('returns null when filters is not an array', async () => {
    await plantRaw({
      version: SNAPSHOT_VERSION,
      timestamp: 0,
      tableName: 'tampered_filters',
      filters: 'not-an-array',
      sortColumns: [],
      visibleColumns: [],
      columnOrder: [],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
    });
    expect(await store.load('tampered_filters')).toBeNull();
  });

  it('returns null when columnWidths is not an object', async () => {
    await plantRaw({
      version: SNAPSHOT_VERSION,
      timestamp: 0,
      tableName: 'tampered_widths',
      filters: [],
      sortColumns: [],
      visibleColumns: [],
      columnOrder: [],
      columnWidths: null,
      pinnedColumns: [],
      hiddenColumnInfo: {},
    });
    expect(await store.load('tampered_widths')).toBeNull();
  });

  it('rejects a future-version snapshot (Phase 7 — explicit version range check)', async () => {
    // Phase 7 changed the contract: `coerceLoadedSnapshot` now range-checks
    // `version` to be an integer in [1, SNAPSHOT_VERSION]. Future-version
    // blobs (e.g. v99999 from a newer library that wrote the IDB row before
    // a downgrade) load as `null` so the table boots fresh rather than risk
    // misinterpreting unknown fields. See
    // docs/migration-guides/phase-7-snapshot-version-policy.md.
    await plantRaw({
      ...makeValidSnapshot(),
      tableName: 'future_version',
      version: 99999,
    });
    const loaded = await store.load('future_version');
    expect(loaded).toBeNull();
  });

  it('returns null when the stored value is a primitive', async () => {
    // fake-indexeddb requires keyPath to resolve, so a primitive is rejected
    // by the planting step. Simulate by putting a structurally-wrong object
    // (string in tableName slot via primitive coercion).
    await plantRaw({
      tableName: 'primitive',
    });
    expect(await store.load('primitive')).toBeNull();
  });

  it('does not pollute Object.prototype via __proto__ in columnWidths', async () => {
    const malicious = {
      ...makeValidSnapshot(),
      tableName: 'proto_poison',
      columnWidths: JSON.parse('{"__proto__": {"polluted": "yes"}, "id": 100}'),
    };
    await plantRaw(malicious);
    const loaded = await store.load('proto_poison');
    // load() may accept (shape passes) or drop — but Object.prototype must remain clean.
    expect((Object.prototype as unknown as { polluted?: string }).polluted).toBeUndefined();
    expect(({} as unknown as { polluted?: string }).polluted).toBeUndefined();
    if (loaded) {
      // Defensive read — loaded is treated as opaque by our consumers.
      expect(loaded.columnWidths).toBeDefined();
    }
  });
});

/** Put a raw value into a store of `dt-annotations`, keyed out-of-line. */
async function plantAnnotations(
  key: IDBValidKey,
  value: unknown,
  storeName: 'annotations' | 'chunks' = 'annotations',
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('dt-annotations', 1);
    req.onupgradeneeded = () => {
      for (const name of ['annotations', 'chunks']) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('SessionStore.load — a tampered annotations record or marker', () => {
  let store: SessionStore;
  let issues: unknown[];

  beforeEach(async () => {
    await clearStore();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('dt-annotations');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    issues = [];
    store = new SessionStore({ onLoadIssue: (issue) => issues.push(issue) });
    await store.open();
  });

  afterEach(() => {
    store.close();
  });

  const marker = { format: 1, count: 1, owner: 'o' };
  const fields = { version: 1, tableName: 'test_table' };
  const head = { format: 1, owner: 'o', count: 1, chunks: 1, file: fields };
  const chunk = [{ id: 'a', scope: 'row', rowId: 0, severity: 'info', message: 'm' }];

  it('never hands back the marker, whatever it holds', async () => {
    await plantRaw({ ...makeValidSnapshot(), __annotations: 'not a marker' });
    const loaded = await store.load('test_table');
    expect(loaded).not.toBeNull();
    expect(loaded).not.toHaveProperty('__annotations');
    expect(loaded?.annotations).toBeUndefined();
    expect(issues).toMatchObject([{ details: { reason: 'invalid' } }]);
  });

  it('does not pollute Object.prototype through a marker, a head or a chunk', async () => {
    await plantRaw({
      ...makeValidSnapshot(),
      __annotations: JSON.parse(
        '{"__proto__": {"polluted": "yes"}, "format": 1, "count": 1, "owner": "o"}',
      ),
    });
    await plantAnnotations(
      'test_table',
      JSON.parse(
        `{"__proto__": {"polluted": "yes"}, "format": 1, "owner": "o", "count": 1, "chunks": 1, "file": ${JSON.stringify(fields)}}`,
      ),
    );
    await plantAnnotations(
      ['test_table', 'o', 0],
      JSON.parse(
        '[{"__proto__": {"polluted": "yes"}, "id": "a", "scope": "row", "rowId": 0, "severity": "info", "message": "m"}]',
      ),
      'chunks',
    );
    const loaded = await store.load('test_table');
    expect((Object.prototype as unknown as { polluted?: string }).polluted).toBeUndefined();
    expect(({} as unknown as { polluted?: string }).polluted).toBeUndefined();
    expect(loaded?.annotations?.annotations).toHaveLength(1);
  });

  it('does not attach a head that is not one, or chunks that are not lists', async () => {
    await plantRaw({ ...makeValidSnapshot(), __annotations: marker });
    for (const [bad, badChunk] of [
      [{ ...head, file: [fields] }, chunk],
      [{ ...head, count: '1' }, chunk],
      [{ ...head, format: '1' }, chunk],
      [{ ...head, chunks: '1' }, chunk],
      [head, { 0: chunk[0], length: 1 }],
      [head, 'a'],
    ] as const) {
      await plantAnnotations('test_table', bad);
      await plantAnnotations(['test_table', 'o', 0], badChunk, 'chunks');
      issues = [];
      const loaded = await store.load('test_table');
      expect(loaded?.annotations, JSON.stringify(bad)).toBeUndefined();
      expect(issues, JSON.stringify(bad)).toMatchObject([{ details: { reason: 'invalid' } }]);
    }
  });

  it('does not attach a record stored under another table’s keys', async () => {
    await plantRaw({ ...makeValidSnapshot(), __annotations: marker });
    await plantAnnotations('other_table', head);
    await plantAnnotations(['other_table', 'o', 0], chunk, 'chunks');
    expect((await store.load('test_table'))?.annotations).toBeUndefined();
    expect(issues).toMatchObject([{ details: { reason: 'missing', count: 1 } }]);

    // A head of its own, its chunk under the other table's key.
    await plantAnnotations('test_table', head);
    issues = [];
    expect((await store.load('test_table'))?.annotations).toBeUndefined();
    expect(issues).toMatchObject([{ details: { reason: 'invalid', count: 1 } }]);
  });
});
