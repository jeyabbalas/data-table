import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isDateWrapper,
  serializeValue,
  deserializeValue,
  serializeFilter,
  deserializeFilter,
  SessionStore,
} from '@/persistence/SessionStore';
import type { SessionSnapshot } from '@/persistence/types';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type {
  RangeFilter,
  PointFilter,
  SetFilter,
  NotSetFilter,
  NullFilter,
  PatternFilter,
} from '@/filters/FilterTypes';

// --- Test helpers ---

function createTestSnapshot(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName: 'test_table',
    filters: [],
    sortColumns: [],
    visibleColumns: ['id', 'name'],
    columnOrder: ['id', 'name'],
    columnWidths: { id: 100, name: 200 },
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

// =========================================
// Date serialization helpers
// =========================================

describe('isDateWrapper', () => {
  it('returns true for a valid DateWrapper', () => {
    expect(isDateWrapper({ __date__: '2024-01-15T00:00:00.000Z' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isDateWrapper(null)).toBe(false);
  });

  it('returns false for a plain object without __date__', () => {
    expect(isDateWrapper({ foo: 'bar' })).toBe(false);
  });

  it('returns false for an object with non-string __date__', () => {
    expect(isDateWrapper({ __date__: 123 })).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isDateWrapper('hello')).toBe(false);
    expect(isDateWrapper(42)).toBe(false);
    expect(isDateWrapper(true)).toBe(false);
    expect(isDateWrapper(undefined)).toBe(false);
  });
});

describe('serializeValue', () => {
  it('wraps Date as { __date__: isoString }', () => {
    const d = new Date('2024-06-15T12:30:00.000Z');
    expect(serializeValue(d)).toEqual({ __date__: '2024-06-15T12:30:00.000Z' });
  });

  it('passes through primitives unchanged', () => {
    expect(serializeValue(42)).toBe(42);
    expect(serializeValue('hello')).toBe('hello');
    expect(serializeValue(true)).toBe(true);
    expect(serializeValue(null)).toBe(null);
    expect(serializeValue(undefined)).toBe(undefined);
  });

  it('recursively wraps Dates in arrays', () => {
    const d = new Date('2024-01-01T00:00:00.000Z');
    expect(serializeValue([1, d, 'x'])).toEqual([
      1,
      { __date__: '2024-01-01T00:00:00.000Z' },
      'x',
    ]);
  });

  it('recursively wraps Dates in nested objects', () => {
    const d = new Date('2024-03-20T08:00:00.000Z');
    expect(serializeValue({ a: d, b: { c: d } })).toEqual({
      a: { __date__: '2024-03-20T08:00:00.000Z' },
      b: { c: { __date__: '2024-03-20T08:00:00.000Z' } },
    });
  });
});

describe('deserializeValue', () => {
  it('unwraps { __date__: isoString } to Date', () => {
    const result = deserializeValue({ __date__: '2024-06-15T12:30:00.000Z' });
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe('2024-06-15T12:30:00.000Z');
  });

  it('passes through primitives unchanged', () => {
    expect(deserializeValue(42)).toBe(42);
    expect(deserializeValue('hello')).toBe('hello');
    expect(deserializeValue(true)).toBe(true);
    expect(deserializeValue(null)).toBe(null);
    expect(deserializeValue(undefined)).toBe(undefined);
  });

  it('recursively unwraps Dates in arrays', () => {
    const input = [1, { __date__: '2024-01-01T00:00:00.000Z' }, 'x'];
    const result = deserializeValue(input) as unknown[];
    expect(result[0]).toBe(1);
    expect(result[1]).toBeInstanceOf(Date);
    expect(result[2]).toBe('x');
  });

  it('recursively unwraps Dates in nested objects', () => {
    const input = {
      a: { __date__: '2024-03-20T08:00:00.000Z' },
      b: { c: { __date__: '2024-03-20T08:00:00.000Z' } },
    };
    const result = deserializeValue(input) as Record<string, unknown>;
    expect(result.a).toBeInstanceOf(Date);
    expect((result.b as Record<string, unknown>).c).toBeInstanceOf(Date);
  });

  it('round-trip: serialize then deserialize preserves Date values', () => {
    const d = new Date('2024-07-04T16:45:30.123Z');
    const roundTripped = deserializeValue(serializeValue(d));
    expect(roundTripped).toBeInstanceOf(Date);
    expect((roundTripped as Date).getTime()).toBe(d.getTime());
  });
});

// =========================================
// Filter serialization
// =========================================

describe('serializeFilter / deserializeFilter', () => {
  it('round-trips a RangeFilter with Date min/max', () => {
    const d1 = new Date('2024-01-15T00:00:00.000Z');
    const d2 = new Date('2024-06-30T23:59:59.999Z');
    const filter: RangeFilter = {
      type: 'range',
      column: 'created',
      min: d1,
      max: d2,
      maxInclusive: true,
    };

    const serialized = serializeFilter(filter);
    expect(serialized.type).toBe('range');
    expect((serialized as { min: unknown }).min).toEqual({
      __date__: '2024-01-15T00:00:00.000Z',
    });
    expect((serialized as { max: unknown }).max).toEqual({
      __date__: '2024-06-30T23:59:59.999Z',
    });

    const deserialized = deserializeFilter(serialized) as RangeFilter;
    expect(deserialized.min).toBeInstanceOf(Date);
    expect(deserialized.max).toBeInstanceOf(Date);
    expect((deserialized.min as Date).getTime()).toBe(d1.getTime());
    expect((deserialized.max as Date).getTime()).toBe(d2.getTime());
    expect(deserialized.maxInclusive).toBe(true);
  });

  it('round-trips a RangeFilter with numeric min/max unchanged', () => {
    const filter: RangeFilter = {
      type: 'range',
      column: 'price',
      min: 10,
      max: 100,
    };
    const serialized = serializeFilter(filter);
    const deserialized = deserializeFilter(serialized) as RangeFilter;
    expect(deserialized.min).toBe(10);
    expect(deserialized.max).toBe(100);
  });

  it('round-trips a PointFilter with Date value', () => {
    const d = new Date('2024-03-15T10:00:00.000Z');
    const filter: PointFilter = { type: 'point', column: 'date', value: d };

    const serialized = serializeFilter(filter);
    const deserialized = deserializeFilter(serialized) as PointFilter;
    expect(deserialized.value).toBeInstanceOf(Date);
    expect((deserialized.value as Date).getTime()).toBe(d.getTime());
  });

  it('round-trips a PointFilter with string value unchanged', () => {
    const filter: PointFilter = {
      type: 'point',
      column: 'name',
      value: 'Alice',
    };
    const deserialized = deserializeFilter(serializeFilter(filter));
    expect(deserialized).toEqual(filter);
  });

  it('round-trips a SetFilter with Date values in array', () => {
    const d = new Date('2024-02-14T00:00:00.000Z');
    const filter: SetFilter = {
      type: 'set',
      column: 'dates',
      values: [d, 'other', 42],
      includeNull: true,
    };

    const serialized = serializeFilter(filter);
    const deserialized = deserializeFilter(serialized) as SetFilter;
    expect(deserialized.values[0]).toBeInstanceOf(Date);
    expect((deserialized.values[0] as Date).getTime()).toBe(d.getTime());
    expect(deserialized.values[1]).toBe('other');
    expect(deserialized.values[2]).toBe(42);
    expect(deserialized.includeNull).toBe(true);
  });

  it('round-trips a NotSetFilter with mixed values', () => {
    const filter: NotSetFilter = {
      type: 'not-set',
      column: 'status',
      values: ['active', 'pending'],
    };
    const deserialized = deserializeFilter(serializeFilter(filter));
    expect(deserialized).toEqual(filter);
  });

  it('passes through NullFilter unchanged', () => {
    const filter: NullFilter = { type: 'null', column: 'email' };
    expect(serializeFilter(filter)).toEqual(filter);
    expect(deserializeFilter(serializeFilter(filter))).toEqual(filter);
  });

  it('passes through PatternFilter unchanged', () => {
    const filter: PatternFilter = {
      type: 'pattern',
      column: 'name',
      pattern: '^A',
      mode: 'regex',
    };
    expect(serializeFilter(filter)).toEqual(filter);
    expect(deserializeFilter(serializeFilter(filter))).toEqual(filter);
  });
});

// =========================================
// SessionStore — IndexedDB operations
// =========================================

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(async () => {
    // Delete the database before each test to prevent data leaking between tests
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('dt-sessions');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
    store = new SessionStore();
  });

  afterEach(() => {
    store.close();
  });

  // --- open() ---

  describe('open()', () => {
    it('returns true when IndexedDB is available', async () => {
      expect(await store.open()).toBe(true);
    });

    it('is idempotent — second call returns true immediately', async () => {
      expect(await store.open()).toBe(true);
      expect(await store.open()).toBe(true);
    });

    it('deduplicates concurrent open calls', async () => {
      const [r1, r2, r3] = await Promise.all([
        store.open(),
        store.open(),
        store.open(),
      ]);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(r3).toBe(true);
    });
  });

  // --- save() and load() ---

  describe('save() and load()', () => {
    it('round-trips a full SessionSnapshot', async () => {
      const snapshot = createTestSnapshot({
        filters: [
          {
            type: 'range',
            column: 'price',
            min: 10,
            max: 100,
          },
        ],
        sortColumns: [{ column: 'name', direction: 'asc' }],
        pinnedColumns: ['id'],
        hiddenColumnInfo: {
          hidden_col: {
            column: 'hidden_col',
            leftNeighbor: 'id',
            rightNeighbor: 'name',
          },
        },
      });

      await store.save(snapshot);
      const loaded = await store.load('test_table');

      expect(loaded).not.toBeNull();
      expect(loaded!.tableName).toBe('test_table');
      expect(loaded!.version).toBe(SNAPSHOT_VERSION);
      expect(loaded!.filters).toEqual(snapshot.filters);
      expect(loaded!.sortColumns).toEqual(snapshot.sortColumns);
      expect(loaded!.visibleColumns).toEqual(snapshot.visibleColumns);
      expect(loaded!.columnOrder).toEqual(snapshot.columnOrder);
      expect(loaded!.columnWidths).toEqual(snapshot.columnWidths);
      expect(loaded!.pinnedColumns).toEqual(snapshot.pinnedColumns);
      expect(loaded!.hiddenColumnInfo).toEqual(snapshot.hiddenColumnInfo);
      expect(loaded!.derivedColumns).toEqual([]);
    });

    it('returns null for a key that does not exist', async () => {
      await store.open();
      expect(await store.load('nonexistent')).toBeNull();
    });

    it('overwrites existing snapshot for same tableName', async () => {
      await store.save(createTestSnapshot({ pinnedColumns: [] }));
      await store.save(createTestSnapshot({ pinnedColumns: ['id'] }));

      const loaded = await store.load('test_table');
      expect(loaded!.pinnedColumns).toEqual(['id']);
    });

    it('stores snapshots independently per tableName', async () => {
      await store.save(
        createTestSnapshot({
          tableName: 'table_a',
          visibleColumns: ['a'],
        }),
      );
      await store.save(
        createTestSnapshot({
          tableName: 'table_b',
          visibleColumns: ['b'],
        }),
      );

      const a = await store.load('table_a');
      const b = await store.load('table_b');
      expect(a!.visibleColumns).toEqual(['a']);
      expect(b!.visibleColumns).toEqual(['b']);
    });

    it('no-ops when tableName is null', async () => {
      await store.save(createTestSnapshot({ tableName: null }));
      const list = await store.list();
      expect(list).toEqual([]);
    });
  });

  // --- delete() ---

  describe('delete()', () => {
    it('removes a stored snapshot', async () => {
      await store.save(createTestSnapshot());
      await store.delete('test_table');
      expect(await store.load('test_table')).toBeNull();
    });

    it('no-ops when deleting a non-existent key', async () => {
      await store.open();
      // Should not throw
      await store.delete('nonexistent');
    });
  });

  // --- list() ---

  describe('list()', () => {
    it('returns empty array when store is empty', async () => {
      await store.open();
      expect(await store.list()).toEqual([]);
    });

    it('returns all stored table names', async () => {
      await store.save(createTestSnapshot({ tableName: 'alpha' }));
      await store.save(createTestSnapshot({ tableName: 'beta' }));
      await store.save(createTestSnapshot({ tableName: 'gamma' }));

      const names = await store.list();
      expect(names.sort()).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('reflects deletions', async () => {
      await store.save(createTestSnapshot({ tableName: 'x' }));
      await store.save(createTestSnapshot({ tableName: 'y' }));
      await store.delete('x');

      const names = await store.list();
      expect(names).toEqual(['y']);
    });
  });

  // --- close() ---

  describe('close()', () => {
    it('clears the db reference', async () => {
      await store.open();
      store.close();
      // After close, load should re-open and still work
      const snapshot = createTestSnapshot({ tableName: 'after_close' });
      await store.save(snapshot);
      expect(await store.load('after_close')).not.toBeNull();
    });

    it('re-open after close works', async () => {
      await store.open();
      store.close();
      expect(await store.open()).toBe(true);
    });
  });
});

// =========================================
// Graceful fallback when IndexedDB unavailable
// =========================================

describe('SessionStore — graceful fallback', () => {
  let store: SessionStore;
  let originalIDB: typeof globalThis.indexedDB;

  beforeEach(() => {
    originalIDB = globalThis.indexedDB;
    // Remove IndexedDB to simulate unavailable environment
    (globalThis as Record<string, unknown>).indexedDB = undefined;
    store = new SessionStore();
  });

  afterEach(() => {
    store.close();
    globalThis.indexedDB = originalIDB;
  });

  it('open returns false', async () => {
    expect(await store.open()).toBe(false);
  });

  it('save is a no-op', async () => {
    await store.save(createTestSnapshot());
    // No error thrown
  });

  it('load returns null', async () => {
    expect(await store.load('anything')).toBeNull();
  });

  it('delete is a no-op', async () => {
    await store.delete('anything');
    // No error thrown
  });

  it('list returns empty array', async () => {
    expect(await store.list()).toEqual([]);
  });
});
