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
import type { RangeFilter } from '@/filters/FilterTypes';

/**
 * Phase 7 — DateWrapper timezone-stability lock.
 *
 * The wire format is `{ __date__: <ISO 8601 UTC string> }`. ISO 8601 carries
 * an explicit Z (UTC) offset, so deserialisation is independent of the host
 * process timezone — `new Date('2024-06-15T12:30:00.000Z')` yields the same
 * absolute instant whether the browser is set to PST, JST, or UTC. These
 * tests lock that invariant against accidental switches to a host-tz
 * representation (e.g. `value.toString()` instead of `.toISOString()`).
 */

function baseSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName: 'tz_table',
    filters: [],
    sortColumns: [],
    visibleColumns: ['ts'],
    columnOrder: ['ts'],
    columnWidths: { ts: 100 },
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

describe('DateWrapper — timezone-stable wire format', () => {
  it('serializeValue emits an ISO 8601 string with explicit Z (UTC) suffix', () => {
    const d = new Date('2024-06-15T12:30:00.000Z');
    const wrapped = serializeValue(d) as { __date__: string };
    expect(isDateWrapper(wrapped)).toBe(true);
    expect(wrapped.__date__).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    expect(wrapped.__date__.endsWith('Z')).toBe(true);
  });

  it('deserializeValue → Date yields the same absolute instant regardless of host tz', () => {
    const original = new Date('2024-06-15T12:30:00.000Z');
    const wrapped = serializeValue(original);
    const restored = deserializeValue(wrapped) as Date;
    expect(restored).toBeInstanceOf(Date);
    // getTime() is the absolute Unix epoch ms — independent of timezone.
    expect(restored.getTime()).toBe(original.getTime());
    expect(restored.toISOString()).toBe(original.toISOString());
  });

  it('round-trips a DST-spanning date (Mar 10 2024, US DST start)', () => {
    // The instant 06:30 UTC on the spring-forward day is 02:30 EDT (-04:00)
    // or 23:30 PDT the prior day — a host-tz string would lose this.
    const dst = new Date('2024-03-10T06:30:00.000Z');
    const wrapped = serializeValue(dst);
    const restored = deserializeValue(wrapped) as Date;
    expect(restored.toISOString()).toBe('2024-03-10T06:30:00.000Z');
  });

  it('round-trips a far-future date (year 9999)', () => {
    const d = new Date('9999-12-31T23:59:59.999Z');
    const wrapped = serializeValue(d);
    const restored = deserializeValue(wrapped) as Date;
    expect(restored.getTime()).toBe(d.getTime());
  });

  it('round-trips the Unix epoch boundary', () => {
    const epoch = new Date(0);
    const wrapped = serializeValue(epoch);
    const restored = deserializeValue(wrapped) as Date;
    expect(restored.getTime()).toBe(0);
    expect((wrapped as { __date__: string }).__date__).toBe('1970-01-01T00:00:00.000Z');
  });

  it('round-trips a Date-bearing RangeFilter through IndexedDB', async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('dt-sessions');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
    const store = new SessionStore();
    await store.open();
    try {
      const filter: RangeFilter = {
        type: 'range',
        column: 'ts',
        min: new Date('2024-01-15T00:00:00.000Z'),
        max: new Date('2024-12-31T23:59:59.999Z'),
        maxInclusive: true,
      };
      const snap = baseSnapshot({ filters: [serializeFilter(filter)] });

      await store.save(snap);
      const loaded = await store.load('tz_table');
      expect(loaded).not.toBeNull();
      expect(loaded!.filters).toHaveLength(1);

      const restored = deserializeFilter(loaded!.filters[0]) as RangeFilter;
      expect(restored.min).toBeInstanceOf(Date);
      expect(restored.max).toBeInstanceOf(Date);
      expect((restored.min as Date).getTime()).toBe((filter.min as Date).getTime());
      expect((restored.max as Date).getTime()).toBe((filter.max as Date).getTime());
    } finally {
      store.close();
    }
  });
});
