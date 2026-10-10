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

/** Put a raw value into the annotations store, keyed out-of-line. */
async function plantAnnotations(key: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('dt-annotations', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('annotations')) {
        req.result.createObjectStore('annotations');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('annotations', 'readwrite');
      tx.objectStore('annotations').put(value, key);
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
  const file = {
    version: 1,
    tableName: 'test_table',
    annotations: [{ id: 'a', scope: 'row', rowId: 0, severity: 'info', message: 'm' }],
  };

  it('never hands back the marker, whatever it holds', async () => {
    await plantRaw({ ...makeValidSnapshot(), __annotations: 'not a marker' });
    const loaded = await store.load('test_table');
    expect(loaded).not.toBeNull();
    expect(loaded).not.toHaveProperty('__annotations');
    expect(loaded?.annotations).toBeUndefined();
    expect(issues).toMatchObject([{ details: { reason: 'invalid' } }]);
  });

  it('does not pollute Object.prototype through a marker or a record', async () => {
    await plantRaw({
      ...makeValidSnapshot(),
      __annotations: JSON.parse(
        '{"__proto__": {"polluted": "yes"}, "format": 1, "count": 1, "owner": "o"}',
      ),
    });
    await plantAnnotations(
      'test_table',
      JSON.parse(
        `{"__proto__": {"polluted": "yes"}, "format": 1, "owner": "o", "count": 1, "file": ${JSON.stringify(file)}}`,
      ),
    );
    const loaded = await store.load('test_table');
    expect((Object.prototype as unknown as { polluted?: string }).polluted).toBeUndefined();
    expect(({} as unknown as { polluted?: string }).polluted).toBeUndefined();
    expect(loaded?.annotations?.annotations).toHaveLength(1);
  });

  it('does not attach a record whose file is not an object with as many annotations as it says', async () => {
    await plantRaw({ ...makeValidSnapshot(), __annotations: marker });
    for (const bad of [
      { format: 1, owner: 'o', count: 1, file: [file] },
      { format: 1, owner: 'o', count: 1, file: { ...file, annotations: {} } },
      { format: 1, owner: 'o', count: 1, file: { ...file, annotations: [] } },
      { format: 1, owner: 'o', count: '1', file },
      { format: '1', owner: 'o', count: 1, file },
    ]) {
      await plantAnnotations('test_table', bad);
      issues = [];
      const loaded = await store.load('test_table');
      expect(loaded?.annotations, JSON.stringify(bad)).toBeUndefined();
      expect(issues, JSON.stringify(bad)).toMatchObject([{ details: { reason: 'invalid' } }]);
    }
  });

  it('does not attach a record stored under another table’s key', async () => {
    await plantRaw({ ...makeValidSnapshot(), __annotations: marker });
    await plantAnnotations('other_table', { format: 1, owner: 'o', count: 1, file });
    const loaded = await store.load('test_table');
    expect(loaded?.annotations).toBeUndefined();
    expect(issues).toMatchObject([{ details: { reason: 'missing', count: 1 } }]);
  });
});
