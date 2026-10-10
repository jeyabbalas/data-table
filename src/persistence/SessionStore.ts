/**
 * IndexedDB-backed session storage
 *
 * Persists SessionSnapshot objects keyed by tableName, each table's
 * annotations in a record of their own (see `annotationPersistence.ts`).
 * All operations degrade gracefully — returns null/[] on failure, never throws.
 */

import type { AnnotationFile } from '../annotations/types';
import type { AnnotatedFilter, Filter } from '../filters/FilterTypes';
import {
  ANNOTATIONS_RECORD_FORMAT,
  annotationChunkEnd,
  annotationFileToken,
  assembleAnnotationFile,
  checkAnnotationsHead,
  isAnnotationsMarker,
  newAnnotationsOwner,
  shareAnnotationFileToken,
} from './annotationPersistence';
import type {
  AnnotationsDropReason,
  AnnotationsHead,
  AnnotationsMarker,
} from './annotationPersistence';
import { annotationsWriteFailure } from './persistenceErrors';
import { SNAPSHOT_VERSION } from './types';
import type { DateWrapper, SerializedFilter, SessionSnapshot } from './types';

// --- IndexedDB constants ---

const DB_NAME = 'dt-sessions';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

// Each table's annotations, in a database of their own: a new store in
// `dt-sessions` would bump its version, and an upgrade waits until every
// other tab closes its connection, while versions that open version 1 would
// find a newer one and persist nothing. A record is a head, keyed by the
// table name, and its chunks, keyed `[tableName, owner, index]` (see
// `annotationPersistence.ts`). Keys are out-of-line, which spares a put the
// clone a key path costs.
const ANNOTATIONS_DB_NAME = 'dt-annotations';
const ANNOTATIONS_STORE_NAME = 'annotations';
const CHUNKS_STORE_NAME = 'chunks';
const ANNOTATIONS_DB_VERSION = 1;

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
    case 'annotated':
      return copyAnnotatedFilter(filter);
  }
}

/**
 * An annotated filter with its own copy of the severities it keeps. Saved
 * severities that are not a list are left out, so the filter keeps every
 * severity, as one that names none does.
 */
function copyAnnotatedFilter(filter: AnnotatedFilter): AnnotatedFilter {
  const { severities, ...rest } = filter;
  return Array.isArray(severities) ? { ...rest, severities: [...severities] } : rest;
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
    case 'annotated':
      return copyAnnotatedFilter(filter);
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

// --- IndexedDB requests ---

/**
 * A session record as stored: with a marker in place of the annotations
 * kept in their own record.
 */
type StoredSessionRecord = SessionSnapshot & { __annotations?: unknown };

/** What a store knows of a table's annotations record: see `SessionStore.annotationRecords`. */
interface KnownAnnotationsRecord {
  /** The {@link annotationFileToken} of the file the record holds. */
  token: number;
  owner: string;
  count: number;
}

/** The writes a save enqueued. */
interface PendingWrites {
  session: Promise<void>;
  annotations: Promise<void> | null;
  /** Why the annotations record could not be enqueued, when it could not. */
  annotationsError: { error: unknown } | null;
}

/** Open `name` at `version`, or `null` when it cannot be. */
function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(name, version);
      request.onupgradeneeded = () => upgrade(request.result);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Settles when `tx` does: rejects with its error when it fails or aborts. */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** The value stored under `key`, or `ok: false` when it cannot be read. */
function readRecord(
  db: IDBDatabase,
  storeName: string,
  key: string,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  return new Promise((resolve) => {
    try {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      request.onsuccess = () => resolve({ ok: true, value: request.result });
      request.onerror = () => resolve({ ok: false });
    } catch {
      resolve({ ok: false });
    }
  });
}

/** Delete `key`; resolves whether it was, never rejects. */
function deleteRecord(db: IDBDatabase, storeName: string, key: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function markerOf(record: KnownAnnotationsRecord): AnnotationsMarker {
  return { format: ANNOTATIONS_RECORD_FORMAT, count: record.count, owner: record.owner };
}

/** Whether `db`, a `dt-annotations` connection, has the stores this version writes. */
function hasAnnotationStores(db: IDBDatabase): boolean {
  return (
    db.objectStoreNames.contains(ANNOTATIONS_STORE_NAME) &&
    db.objectStoreNames.contains(CHUNKS_STORE_NAME)
  );
}

/** The keys of every chunk of `tableName`'s annotations: `[tableName, owner, index]`. */
function tableChunks(tableName: string): IDBKeyRange {
  return IDBKeyRange.bound([tableName], [tableName, []]);
}

/**
 * Enqueue, in a new transaction of `db`, `file` as `tableName`'s annotations
 * record under `owner`: delete the table's chunks, put the file's annotations
 * in chunks, then the head. All of it lands or, should a request fail, none
 * of it, and the old record stays whole.
 *
 * With `chained`, each chunk is put from the previous put's `onsuccess`,
 * which keeps the transaction active, so the structured clone of a million
 * annotations runs in a hundred short tasks rather than one long one.
 * Without, every put is enqueued at once, as a page being hidden needs.
 * Throws, having aborted the transaction, when the first chunk cannot be
 * put; otherwise settles with the transaction.
 */
function putAnnotationsRecord(
  db: IDBDatabase,
  tableName: string,
  owner: string,
  file: AnnotationFile,
  chained: boolean,
): Promise<void> {
  const tx = db.transaction([ANNOTATIONS_STORE_NAME, CHUNKS_STORE_NAME], 'readwrite');
  const chunks = tx.objectStore(CHUNKS_STORE_NAME);
  const annotations: readonly unknown[] = Array.isArray(file.annotations) ? file.annotations : [];
  const fields: Partial<AnnotationFile> = { ...file };
  delete fields.annotations;
  let failure: { error: unknown } | null = null;
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => {
      reject(failure ? failure.error : (tx.error ?? new Error('IndexedDB transaction aborted')));
    };
  });
  const abort = (error: unknown): void => {
    failure = { error };
    try {
      tx.abort();
    } catch {
      // Finished already.
    }
  };
  let start = 0;
  let index = 0;
  // Put the next chunk, or the head after the last; return the chunk's request.
  const putNext = (): IDBRequest | null => {
    if (start < annotations.length) {
      const end = annotationChunkEnd(annotations, start);
      const request = chunks.put(annotations.slice(start, end), [tableName, owner, index++]);
      start = end;
      return request;
    }
    const head: AnnotationsHead = {
      format: ANNOTATIONS_RECORD_FORMAT,
      owner,
      count: annotations.length,
      chunks: index,
      file: fields as AnnotationsHead['file'],
    };
    tx.objectStore(ANNOTATIONS_STORE_NAME).put(head, tableName);
    return null;
  };
  const step = (): void => {
    try {
      const request = putNext();
      if (request !== null) request.onsuccess = step;
    } catch (error) {
      abort(error);
    }
  };
  try {
    chunks.delete(tableChunks(tableName));
    let request = putNext();
    if (chained) {
      if (request !== null) request.onsuccess = step;
    } else {
      while (request !== null) request = putNext();
    }
  } catch (error) {
    abort(error);
    done.catch(() => undefined);
    throw error;
  }
  return done;
}

/**
 * Read `tableName`'s annotations record for a session whose marker is
 * `marker`, in one transaction: the head, then with one `getAll` the chunks
 * it names, reassembled into the file.
 */
function readAnnotationsRecord(
  db: IDBDatabase,
  tableName: string,
  marker: AnnotationsMarker,
): Promise<{ ok: true; file: AnnotationFile } | { ok: false; reason: AnnotationsDropReason }> {
  return new Promise((resolve) => {
    const unavailable = (): void => resolve({ ok: false, reason: 'unavailable' });
    try {
      const tx = db.transaction([ANNOTATIONS_STORE_NAME, CHUNKS_STORE_NAME], 'readonly');
      const headRequest = tx.objectStore(ANNOTATIONS_STORE_NAME).get(tableName);
      headRequest.onerror = unavailable;
      headRequest.onsuccess = () => {
        const checked = checkAnnotationsHead(marker, headRequest.result);
        if (!checked.ok) {
          resolve(checked);
          return;
        }
        const { head } = checked;
        const assemble = (chunks: unknown[]): void => {
          const file = assembleAnnotationFile(head, chunks);
          resolve(file === null ? { ok: false, reason: 'invalid' } : { ok: true, file });
        };
        if (head.chunks === 0) {
          assemble([]);
          return;
        }
        try {
          const range = IDBKeyRange.bound(
            [tableName, head.owner, 0],
            [tableName, head.owner, head.chunks - 1],
          );
          const chunksRequest = tx.objectStore(CHUNKS_STORE_NAME).getAll(range);
          chunksRequest.onerror = unavailable;
          chunksRequest.onsuccess = () => assemble(chunksRequest.result);
        } catch {
          unavailable();
        }
      };
    } catch {
      unavailable();
    }
  });
}

/** Delete `tableName`'s annotations record, its head and its chunks, in one transaction. */
function deleteAnnotationsRecord(db: IDBDatabase, tableName: string): Promise<void> {
  const tx = db.transaction([ANNOTATIONS_STORE_NAME, CHUNKS_STORE_NAME], 'readwrite');
  tx.objectStore(ANNOTATIONS_STORE_NAME).delete(tableName);
  tx.objectStore(CHUNKS_STORE_NAME).delete(tableChunks(tableName));
  return transactionDone(tx);
}

// --- SessionStore class ---

/**
 * Optional per-instance configuration for {@link SessionStore}. When omitted,
 * `SessionStore` is a pure read/write wrapper around IndexedDB; supplying
 * `onLoadIssue` enables structured surfacing of load-time problems that
 * don't merit a thrown error: a future-version snapshot rejected
 * (`code: 'PERSISTENCE_VERSION_REJECTED'`), and annotations a session was
 * saved with that could not be attached to it
 * (`code: 'PERSISTENCE_ANNOTATIONS_DROPPED'`).
 *
 * The facade wires this automatically when constructing an internal
 * `SessionStore`; consumers passing their own store can wire it themselves
 * to route the warning through the same path.
 */
export interface SessionStoreOptions {
  /**
   * Called when `load()` drops all or part of a stored session for a reason
   * the consumer may want to surface as a warning. Switch on `issue.code`;
   * `tableName` echoes the requested key.
   *
   * - `'PERSISTENCE_VERSION_REJECTED'`: the snapshot's `version` is outside
   *   `[1, SNAPSHOT_VERSION]`, and `load` returns `null`. `details.version`
   *   is the rejected version number; `details.expectedMax` is
   *   `SNAPSHOT_VERSION`.
   * - `'PERSISTENCE_ANNOTATIONS_DROPPED'`: the session was saved with
   *   annotations that cannot be attached to it, and `load` returns it
   *   without them. `details.reason` is `'missing'` (no annotations record),
   *   `'mismatch'` (a record written with another save of the session: one
   *   whose writes did not both land, or another tab's), `'invalid'` (a
   *   malformed record, or one of a format this version does not read) or
   *   `'unavailable'` (the annotations database could not be read).
   *   `details.count`, when known, is how many annotations the session was
   *   saved with.
   *
   * Other rejections — generic shape mismatch, IDB read failure, missing
   * snapshot — silently return `null` from `load` and do NOT call this.
   */
  onLoadIssue?(
    issue:
      | {
          code: 'PERSISTENCE_VERSION_REJECTED';
          tableName: string;
          details: { version: number; expectedMax: number };
        }
      | {
          code: 'PERSISTENCE_ANNOTATIONS_DROPPED';
          tableName: string;
          details: {
            reason: 'missing' | 'mismatch' | 'invalid' | 'unavailable';
            count?: number;
          };
        },
  ): void;
}

/**
 * IndexedDB-backed persistence store for `SessionSnapshot` records, keyed by
 * `tableName` — the loader-assigned DuckDB table name unless a `tableName` was
 * passed to `loadData()`. Not the table's `instanceId`, which is a DOM-id
 * qualifier and carries a fresh random suffix on every construction. A
 * snapshot's annotations are kept apart, in the `dt-annotations` database
 * under the same table name, in chunks, and written only when they change,
 * so that saving a sort or a column width does not copy a million
 * annotations again.
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
  /** `dt-annotations`; `null` until opened, after it closes, or when it could not open. */
  private annotationsDb: IDBDatabase | null = null;
  /**
   * Whether `dt-annotations` failed to open: annotations are then saved in
   * the session record, as versions before it did, until {@link close}.
   */
  private annotationsUnavailable = false;
  private opening: Promise<boolean> | null = null;
  /** Counts {@link close} calls: an open that a close overtook keeps nothing it opened. */
  private generation = 0;
  private readonly onLoadIssue: SessionStoreOptions['onLoadIssue'];
  /**
   * The annotations record this store last wrote or read for each table, by
   * table name: absent while it does not know what the record holds (nothing
   * written or read since it opened, or a write that failed), `null` when it
   * knows there is none. A save writes a table's record only when its file's
   * token differs from the one here, and deletes it only when it may exist.
   */
  private readonly annotationRecords = new Map<string, KnownAnnotationsRecord | null>();

  constructor(options?: SessionStoreOptions) {
    this.onLoadIssue = options?.onLoadIssue;
  }

  /**
   * Open the IndexedDB databases: `dt-sessions`, and `dt-annotations` for the
   * tables' annotations, in parallel. Returns true on success, false if
   * unavailable. When only `dt-annotations` cannot be opened, or lacks the
   * stores this version writes, sessions save their annotations in the
   * session record.
   */
  async open(): Promise<boolean> {
    if (this.isOpen()) return true;
    if (this.opening) return this.opening;

    const opening = this._open();
    this.opening = opening;
    try {
      return await opening;
    } finally {
      if (this.opening === opening) this.opening = null;
    }
  }

  private isOpen(): boolean {
    return this.db !== null && (this.annotationsDb !== null || this.annotationsUnavailable);
  }

  private async _open(): Promise<boolean> {
    if (typeof indexedDB === 'undefined') return false;

    const generation = this.generation;
    const openSessions = this.db === null;
    const openAnnotations = this.annotationsDb === null && !this.annotationsUnavailable;
    const [db, annotationsDb] = await Promise.all([
      openSessions
        ? openDatabase(DB_NAME, DB_VERSION, (created) => {
            if (!created.objectStoreNames.contains(STORE_NAME)) {
              created.createObjectStore(STORE_NAME, { keyPath: 'tableName' });
            }
          })
        : this.db,
      openAnnotations
        ? openDatabase(ANNOTATIONS_DB_NAME, ANNOTATIONS_DB_VERSION, (created) => {
            if (!created.objectStoreNames.contains(ANNOTATIONS_STORE_NAME)) {
              created.createObjectStore(ANNOTATIONS_STORE_NAME);
            }
            if (!created.objectStoreNames.contains(CHUNKS_STORE_NAME)) {
              created.createObjectStore(CHUNKS_STORE_NAME);
            }
          })
        : this.annotationsDb,
    ]);

    // Closed while opening, or no session database to persist anything in.
    if (generation !== this.generation || db === null) {
      if (openSessions) db?.close();
      if (openAnnotations) annotationsDb?.close();
      return false;
    }
    if (openSessions) this.attachSessions(db);
    if (openAnnotations) {
      // One without the stores this version writes, which its upgrade
      // makes, is not one this version can use.
      if (annotationsDb !== null && hasAnnotationStores(annotationsDb)) {
        this.attachAnnotations(annotationsDb);
      } else {
        annotationsDb?.close();
        this.annotationsUnavailable = true;
      }
    }
    return true;
  }

  // A connection closes when another tab upgrades or deletes its database,
  // which would otherwise wait for it, or when the browser drops it; the
  // next operation opens it again.
  private attachSessions(db: IDBDatabase): void {
    this.db = db;
    const release = (): void => {
      if (this.db === db) this.db = null;
    };
    db.onversionchange = () => {
      db.close();
      release();
    };
    db.onclose = release;
  }

  private attachAnnotations(db: IDBDatabase): void {
    this.annotationsDb = db;
    const release = (): void => {
      if (this.annotationsDb !== db) return;
      this.annotationsDb = null;
      // The records may be gone, or rewritten by another version.
      this.annotationRecords.clear();
    };
    db.onversionchange = () => {
      db.close();
      release();
    };
    db.onclose = release;
  }

  private async ensureOpen(): Promise<boolean> {
    return this.isOpen() ? true : this.open();
  }

  /**
   * Store a snapshot. No-op if `tableName` is null or IDB is unavailable
   * (private browsing, opt-out, no-IDB environment).
   *
   * The snapshot's `annotations` go in a record of their own, written only
   * when they are not the file object this store last wrote or read for
   * the table (an unchanged `AnnotationStore` hands the same one to every
   * save), and deleted when the snapshot has none; the session record names
   * that record instead. Both writes start at once; the annotations go in
   * chunks, each put once the previous one is, so that cloning a million
   * of them takes many short tasks. When `dt-annotations` could not be
   * opened, the annotations stay in the session record. Treat a file passed
   * here as read-only: one written before is not written again, and a
   * chunked write reads it over several tasks.
   *
   * Rejects with the underlying `DOMException` (typically
   * `QuotaExceededError`) when IDB IS available but the session record's
   * transaction fails — see `AutoSave` for the consumer-side mapping to a
   * typed `PersistenceError`. When only the annotations record fails, the
   * session record is saved without it, and the save rejects with a
   * `PersistenceError` whose `details.record` is `'annotations'`. The "never
   * throws" contract applies only to the no-IDB fallback; quota and abort
   * errors must reach the consumer.
   */
  async save(snapshot: SessionSnapshot): Promise<void> {
    if (snapshot.tableName == null) return;
    if (!(await this.ensureOpen())) return;

    const tableName = snapshot.tableName;
    let writes: PendingWrites;
    try {
      writes = this.write(snapshot, tableName, true);
    } catch (cause) {
      throw cause instanceof Error ? cause : new Error(String(cause));
    }
    const [session, annotations] = await Promise.allSettled([writes.session, writes.annotations]);
    if (session.status === 'rejected') throw session.reason;
    if (writes.annotationsError !== null) {
      throw annotationsWriteFailure(writes.annotationsError.error, tableName);
    }
    if (annotations.status === 'rejected') {
      throw annotationsWriteFailure(annotations.reason, tableName);
    }
  }

  /**
   * Synchronous save — enqueues the IDB puts (the session record's, and the
   * annotations record's chunks and head when it changed, as {@link save}
   * writes them) without yielding to the microtask queue. Use this in page lifecycle handlers
   * (beforeunload, visibilitychange) where an async await could be skipped
   * by the browser during page teardown.
   *
   * No-op if the database hasn't been opened yet or `tableName` is null.
   * Re-throws synchronously if `transaction()` / `put()` throws — typically
   * `QuotaExceededError`. `AutoSave.flushPendingSave` catches and
   * routes through `reportError`. When only the annotations record's put
   * throws, the session record is still enqueued, without it, and a
   * `PersistenceError` whose `details.record` is `'annotations'` is thrown.
   */
  saveSync(snapshot: SessionSnapshot): void {
    if (snapshot.tableName == null) return;
    if (!this.db) return;

    const tableName = snapshot.tableName;
    const writes = this.write(snapshot, tableName, false);
    // Nothing waits on these during teardown, as nothing did before.
    writes.session.catch(() => undefined);
    writes.annotations?.catch(() => undefined);
    if (writes.annotationsError !== null) {
      throw annotationsWriteFailure(writes.annotationsError.error, tableName);
    }
  }

  /**
   * Enqueue a save's writes without yielding: the annotations record's
   * first, as the session record names it, then the session record's.
   * `chained` puts the annotations' chunks one after another rather than at
   * once. Throws when the session record cannot be enqueued.
   */
  private write(snapshot: SessionSnapshot, tableName: string, chained: boolean): PendingWrites {
    const annotationsDb = this.annotationsDb;
    let record: StoredSessionRecord = snapshot;
    let annotations: Promise<void> | null = null;
    let annotationsError: { error: unknown } | null = null;
    if (annotationsDb !== null) {
      const { annotations: file, ...session } = snapshot;
      record = session;
      try {
        const written = this.writeAnnotations(annotationsDb, tableName, file ?? null, chained);
        annotations = written.done;
        if (written.marker !== null) record = { ...session, __annotations: written.marker };
      } catch (error) {
        // The session record goes without its annotations.
        annotationsError = { error };
      }
    } else {
      // In the session record, as before `dt-annotations`: a load takes
      // them over any annotations record, and the next save with the
      // database open writes the record again.
      this.annotationRecords.delete(tableName);
    }
    try {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      return { session: transactionDone(tx), annotations, annotationsError };
    } catch (error) {
      // Nothing waits on the annotations write once this throws.
      annotations?.catch(() => undefined);
      throw error;
    }
  }

  /**
   * Enqueue what `file` needs of `tableName`'s annotations record: a write
   * when it is not the file the record holds, a delete when there is no
   * file and a record may exist, otherwise nothing. Returns the marker for
   * the session record, `null` when it has no annotations.
   */
  private writeAnnotations(
    db: IDBDatabase,
    tableName: string,
    file: AnnotationFile | null,
    chained: boolean,
  ): { marker: AnnotationsMarker | null; done: Promise<void> | null } {
    const known = this.annotationRecords.get(tableName);
    if (file === null) {
      if (known === null) return { marker: null, done: null };
      const deleted = deleteAnnotationsRecord(db, tableName);
      this.annotationRecords.set(tableName, null);
      return { marker: null, done: this.forgetIfFailed(tableName, null, deleted) };
    }
    const token = annotationFileToken(file);
    if (known !== undefined && known !== null && known.token === token) {
      return { marker: markerOf(known), done: null };
    }
    const owner = newAnnotationsOwner();
    const written = putAnnotationsRecord(db, tableName, owner, file, chained);
    const count = Array.isArray(file.annotations) ? file.annotations.length : 0;
    const next: KnownAnnotationsRecord = { token, owner, count };
    this.annotationRecords.set(tableName, next);
    return { marker: markerOf(next), done: this.forgetIfFailed(tableName, next, written) };
  }

  /**
   * `done`, which forgets `expected` as what `tableName`'s record holds if
   * it rejects: a failed write leaves the record unknown, and the next save
   * writes it again.
   */
  private forgetIfFailed(
    tableName: string,
    expected: KnownAnnotationsRecord | null,
    done: Promise<void>,
  ): Promise<void> {
    return done.catch((error: unknown) => {
      if (this.annotationRecords.get(tableName) === expected) {
        this.annotationRecords.delete(tableName);
      }
      throw error;
    });
  }

  /**
   * Load a snapshot by table name. Returns `null` if not found, if IDB is
   * unavailable, or if the stored value fails a structural shape check (a
   * partially-tampered blob from a same-origin attacker, or a snapshot from
   * a future schema version we can't recognise).
   *
   * Annotations saved in a record of their own come back in the snapshot's
   * `annotations`, when that record is the one written with the session
   * record. Otherwise the session comes back without them, and
   * `onLoadIssue` is told (`PERSISTENCE_ANNOTATIONS_DROPPED`). Annotations
   * saved in the session record itself — by versions before the record, or
   * by a custom store — win over any record.
   */
  async load(tableName: string): Promise<SessionSnapshot | null> {
    if (!(await this.ensureOpen())) return null;

    const read = await readRecord(this.db!, STORE_NAME, tableName);
    const result = coerceLoadedSnapshotWithStatus(read.ok ? read.value : null);
    // What this store wrote last, until the record read below says what
    // the table's annotations record holds.
    const known = this.annotationRecords.get(tableName);
    this.annotationRecords.delete(tableName);
    if (!result.ok) {
      if (result.reason === 'version') {
        this.onLoadIssue?.({
          code: 'PERSISTENCE_VERSION_REJECTED',
          tableName,
          details: { version: result.version, expectedMax: SNAPSHOT_VERSION },
        });
      }
      return null;
    }

    const { __annotations: marker, ...snapshot } = result.snapshot as StoredSessionRecord;
    if (snapshot.annotations !== undefined || marker === undefined) return snapshot;

    const dropped = (reason: AnnotationsDropReason, count?: number): SessionSnapshot => {
      this.onLoadIssue?.({
        code: 'PERSISTENCE_ANNOTATIONS_DROPPED',
        tableName,
        details: count === undefined ? { reason } : { reason, count },
      });
      return snapshot;
    };
    if (!isAnnotationsMarker(marker)) return dropped('invalid');
    const annotationsDb = this.annotationsDb;
    if (annotationsDb === null) return dropped('unavailable', marker.count);
    const stored = await readAnnotationsRecord(annotationsDb, tableName, marker);
    if (!stored.ok) return dropped(stored.reason, marker.count);

    // A record this store wrote: the copy read back takes the token of the
    // file it was written from, so that a save of that file after a load
    // that restores nothing (an app reading the session) writes nothing. A
    // restore adopts the copy's token either way.
    if (known !== undefined && known !== null && known.owner === marker.owner) {
      shareAnnotationFileToken(stored.file, known.token);
    }
    this.annotationRecords.set(tableName, {
      token: annotationFileToken(stored.file),
      owner: marker.owner,
      count: marker.count,
    });
    snapshot.annotations = stored.file;
    return snapshot;
  }

  /**
   * Delete a snapshot by table name, and its annotations record, head and
   * chunks. No-op if db unavailable.
   */
  async delete(tableName: string): Promise<void> {
    if (!(await this.ensureOpen())) return;

    const deletions = [deleteRecord(this.db!, STORE_NAME, tableName)];
    const annotationsDb = this.annotationsDb;
    if (annotationsDb !== null) {
      this.annotationRecords.set(tableName, null);
      let deleted: Promise<boolean>;
      try {
        deleted = deleteAnnotationsRecord(annotationsDb, tableName).then(
          () => true,
          () => false,
        );
      } catch {
        deleted = Promise.resolve(false);
      }
      deletions.push(
        deleted.then((ok) => {
          if (!ok && this.annotationRecords.get(tableName) === null) {
            this.annotationRecords.delete(tableName);
          }
          return ok;
        }),
      );
    }
    await Promise.all(deletions);
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

  /** Close both database connections and reset state. */
  close(): void {
    this.generation++;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (this.annotationsDb) {
      this.annotationsDb.close();
      this.annotationsDb = null;
    }
    this.annotationsUnavailable = false;
    this.annotationRecords.clear();
    this.opening = null;
  }
}
