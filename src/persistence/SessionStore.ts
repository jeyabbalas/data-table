/**
 * IndexedDB-backed session storage
 *
 * Persists SessionSnapshot objects keyed by tableName.
 * All operations degrade gracefully — returns null/[] on failure, never throws.
 */

import type { Filter } from '../filters/FilterTypes';
import { SNAPSHOT_VERSION } from './types';
import type { DateWrapper, SerializedFilter, SessionSnapshot } from './types';

// --- IndexedDB constants ---

const DB_NAME = 'dt-sessions';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

// --- Date serialization helpers ---

/** Type guard for the { __date__: string } marker */
export function isDateWrapper(value: unknown): value is DateWrapper {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__date__' in value &&
    typeof (value as DateWrapper).__date__ === 'string'
  );
}

/**
 * Recursively replace Date instances with { __date__: isoString }.
 * Passes through primitives, null, and undefined unchanged.
 */
export function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return { __date__: value.toISOString() } satisfies DateWrapper;
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Recursively replace { __date__: isoString } markers with Date instances.
 */
export function deserializeValue(value: unknown): unknown {
  if (isDateWrapper(value)) {
    return new Date(value.__date__);
  }
  if (Array.isArray(value)) {
    return value.map(deserializeValue);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deserializeValue(v);
    }
    return out;
  }
  return value;
}

/** Convert a live Filter (may contain Date objects) to a serialized form */
export function serializeFilter(filter: Filter): SerializedFilter {
  switch (filter.type) {
    case 'range':
      return {
        ...filter,
        min: serializeValue(filter.min) as SerializedFilter extends { min: infer M } ? M : never,
        max: serializeValue(filter.max) as SerializedFilter extends { max: infer M } ? M : never,
      };
    case 'point':
      return {
        ...filter,
        value: serializeValue(filter.value),
      } as SerializedFilter;
    case 'set':
    case 'not-set':
      return {
        ...filter,
        values: filter.values.map(serializeValue),
      };
    case 'null':
    case 'not-null':
    case 'pattern':
    case 'raw-sql':
      return { ...filter };
  }
}

/** Convert a serialized filter back to a live Filter with Date objects restored.
 *  Returns null for unknown filter types (e.g. from a newer library version or
 *  corrupted data) — callers must filter out nulls. */
export function deserializeFilter(filter: SerializedFilter): Filter | null {
  switch (filter.type) {
    case 'range':
      return {
        ...filter,
        min: deserializeValue(filter.min),
        max: deserializeValue(filter.max),
      } as Filter;
    case 'point':
      return {
        ...filter,
        value: deserializeValue(filter.value),
      } as Filter;
    case 'set':
    case 'not-set':
      return {
        ...filter,
        values: filter.values.map(deserializeValue),
      };
    case 'null':
    case 'not-null':
    case 'pattern':
    case 'raw-sql':
      return { ...filter };
    default:
      console.warn(
        'Unknown filter type during deserialization:',
        (filter as Record<string, unknown>)['type'],
      );
      return null;
  }
}

// --- Snapshot shape coercion ---

/**
 * Required keys on a `SessionSnapshot` returned by IDB. Anything missing one
 * of these is treated as malformed and discarded — the snapshot tampering
 * surface is small (same-origin write access only), but defending against
 * partial / corrupt records keeps `restoreStateFromSnapshot` from having to
 * re-check every field.
 */
const REQUIRED_SNAPSHOT_KEYS = [
  'tableName',
  'version',
  'filters',
  'sortColumns',
  'visibleColumns',
  'columnOrder',
  'columnWidths',
  'pinnedColumns',
  'hiddenColumnInfo',
] as const;

/**
 * Phase 9: classify the rejection reason so `load()` can surface a
 * `PERSISTENCE_VERSION_REJECTED` warning when the stored snapshot is
 * from a future library version (vs. silently returning null and
 * indistinguishable from "no snapshot exists").
 */
type CoerceResult =
  | { ok: true; snapshot: SessionSnapshot }
  | { ok: false; reason: 'absent' | 'shape' }
  | { ok: false; reason: 'version'; version: number };

function coerceLoadedSnapshotWithStatus(raw: unknown): CoerceResult {
  if (raw === null || raw === undefined) return { ok: false, reason: 'absent' };
  if (typeof raw !== 'object') return { ok: false, reason: 'shape' };
  const obj = raw as Record<string, unknown>;
  for (const key of REQUIRED_SNAPSHOT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return { ok: false, reason: 'shape' };
  }
  if (typeof obj['tableName'] !== 'string') return { ok: false, reason: 'shape' };
  if (typeof obj['version'] !== 'number') return { ok: false, reason: 'shape' };
  // Reject snapshots from future library versions (forward incompat) and
  // invalid sentinel versions (≤ 0). Pre-v5 snapshots that happen to have
  // the required fields keep loading via the lenient field-by-field shape
  // check below — pre-1.0 clean break, no migration framework.
  const ver = obj['version'] as number;
  if (!Number.isInteger(ver) || ver < 1 || ver > SNAPSHOT_VERSION) {
    return { ok: false, reason: 'version', version: ver };
  }
  if (!Array.isArray(obj['filters'])) return { ok: false, reason: 'shape' };
  if (!Array.isArray(obj['sortColumns'])) return { ok: false, reason: 'shape' };
  if (!Array.isArray(obj['visibleColumns'])) return { ok: false, reason: 'shape' };
  if (!Array.isArray(obj['columnOrder'])) return { ok: false, reason: 'shape' };
  if (!Array.isArray(obj['pinnedColumns'])) return { ok: false, reason: 'shape' };
  if (typeof obj['columnWidths'] !== 'object' || obj['columnWidths'] === null) {
    return { ok: false, reason: 'shape' };
  }
  if (typeof obj['hiddenColumnInfo'] !== 'object' || obj['hiddenColumnInfo'] === null) {
    return { ok: false, reason: 'shape' };
  }
  return { ok: true, snapshot: obj as unknown as SessionSnapshot };
}

// --- SessionStore class ---

/**
 * Optional per-instance configuration for {@link SessionStore}. When omitted,
 * `SessionStore` is a pure read/write wrapper around IndexedDB; supplying
 * `onLoadIssue` enables structured surfacing of load-time problems that
 * don't merit a thrown error (today: future-version snapshot rejection,
 * surfaced as `code: 'PERSISTENCE_VERSION_REJECTED'`).
 *
 * The facade wires this automatically when constructing an internal
 * `SessionStore`; consumers passing their own store can wire it themselves
 * to route the warning through the same path.
 */
export interface SessionStoreOptions {
  /**
   * Called when `load()` rejects a stored snapshot for a reason the
   * consumer may want to surface as a warning (currently: a snapshot
   * whose `version` is outside `[1, SNAPSHOT_VERSION]`). Other
   * rejections — generic shape mismatch, IDB read failure, missing
   * snapshot — silently return `null` from `load` and do NOT call this.
   *
   * `tableName` echoes the requested key. `details.version` is the
   * rejected version number; `details.expectedMax` is `SNAPSHOT_VERSION`.
   */
  onLoadIssue?: (issue: {
    code: 'PERSISTENCE_VERSION_REJECTED';
    tableName: string;
    details: { version: number; expectedMax: number };
  }) => void;
}

/**
 * IndexedDB-backed persistence store for `SessionSnapshot` records, keyed by
 * `tableName` — the loader-assigned DuckDB table name unless a `tableName` was
 * passed to `loadData()`. Not the table's `instanceId`, which is a DOM-id
 * qualifier and carries a fresh random suffix on every construction.
 *
 * `createDataTable()` constructs and manages one internally when
 * `persistence: true` (default). Construct your own to share one store
 * across multiple `DataTable` instances on a page, inject a differently-keyed
 * store, or swap the default for an app-specific backend (localStorage,
 * remote sync, in-memory mock). Open / read / list methods degrade
 * gracefully — they return `null` / `[]` when IndexedDB is unavailable
 * (private browsing, opt-out, no-IDB environment) and never throw — so
 * those environments fall back to a non-persistent session. Write methods
 * (`save`, `saveSync`, `delete`) reject / throw with the underlying
 * `DOMException` when IDB IS available but a transaction fails (typically
 * `QuotaExceededError`); see `AutoSave` for the consumer-side
 * mapping to a typed `PersistenceError`.
 *
 * @example
 * import {
 *   SessionStore,
 *   createDataTable,
 * } from '@jeyabbalas/data-table';
 *
 * // Share one store across many tables:
 * const store = new SessionStore();
 * await store.open();
 *
 * const t1 = await createDataTable({ container: '#one', data: csvA, sessionStore: store });
 * const t2 = await createDataTable({ container: '#two', data: csvB, sessionStore: store });
 *
 * // Inspect persisted sessions:
 * const snapshot = await store.load('my-table');
 *
 * @see SessionSnapshot
 * @see AutoSave
 * @see ../../docs/guides/session-persistence.md
 */
export class SessionStore {
  private db: IDBDatabase | null = null;
  private opening: Promise<boolean> | null = null;
  private readonly onLoadIssue: SessionStoreOptions['onLoadIssue'];

  constructor(options?: SessionStoreOptions) {
    this.onLoadIssue = options?.onLoadIssue;
  }

  /** Open the IndexedDB database. Returns true on success, false if unavailable. */
  async open(): Promise<boolean> {
    if (this.db) return true;
    if (this.opening) return this.opening;

    this.opening = this._open();
    const result = await this.opening;
    if (!result) this.opening = null;
    return result;
  }

  private _open(): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(false);
        return;
      }

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'tableName' });
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve(true);
        };

        request.onerror = () => {
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  private async ensureOpen(): Promise<boolean> {
    return this.db ? true : this.open();
  }

  /**
   * Store a snapshot. No-op if `tableName` is null or IDB is unavailable
   * (private browsing, opt-out, no-IDB environment).
   *
   * Rejects with the underlying `DOMException` (typically
   * `QuotaExceededError`) when IDB IS available but the transaction fails
   * — see `AutoSave` for the consumer-side mapping to a typed
   * `PersistenceError`. The "never throws" contract applies only to the
   * no-IDB fallback; quota and abort errors must reach the consumer.
   */
  async save(snapshot: SessionSnapshot): Promise<void> {
    if (snapshot.tableName == null) return;
    if (!(await this.ensureOpen())) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(snapshot);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  }

  /**
   * Synchronous save — enqueues an IDB put without yielding to the microtask
   * queue. Use this in page lifecycle handlers (beforeunload, visibilitychange)
   * where an async await could be skipped by the browser during page teardown.
   *
   * No-op if the database hasn't been opened yet or `tableName` is null.
   * Re-throws synchronously if `transaction()` / `put()` throws — typically
   * `QuotaExceededError`. `AutoSave.flushPendingSave` catches and
   * routes through `reportError`.
   */
  saveSync(snapshot: SessionSnapshot): void {
    if (snapshot.tableName == null) return;
    if (!this.db) return;

    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(snapshot);
  }

  /**
   * Load a snapshot by table name. Returns `null` if not found, if IDB is
   * unavailable, or if the stored value fails a structural shape check (a
   * partially-tampered blob from a same-origin attacker, or a snapshot from
   * a future schema version we can't recognise).
   */
  async load(tableName: string): Promise<SessionSnapshot | null> {
    if (!(await this.ensureOpen())) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(tableName);
        request.onsuccess = () => {
          const result = coerceLoadedSnapshotWithStatus(request.result);
          if (!result.ok && result.reason === 'version') {
            this.onLoadIssue?.({
              code: 'PERSISTENCE_VERSION_REJECTED',
              tableName,
              details: { version: result.version, expectedMax: SNAPSHOT_VERSION },
            });
          }
          resolve(result.ok ? result.snapshot : null);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /** Delete a snapshot by table name. No-op if db unavailable. */
  async delete(tableName: string): Promise<void> {
    if (!(await this.ensureOpen())) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(tableName);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** List all stored table names. Returns [] if db unavailable. */
  async list(): Promise<string[]> {
    if (!(await this.ensureOpen())) return [];

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result as string[]);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /** Close the database connection and reset state. */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.opening = null;
  }
}
