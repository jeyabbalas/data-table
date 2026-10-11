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
  headEntries,
  isAnnotationsRefused,
  newAnnotationsOwner,
  noteAnnotationsDrop,
  readAnnotationsHead,
  readAnnotationsMarker,
  shareAnnotationFileToken,
  snapshotAnnotationsOf,
} from './annotationPersistence';
import type {
  AnnotationsDropReason,
  AnnotationsHead,
  AnnotationsMarker,
  AnnotationsRecordEntry,
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

/** A record this store saw land: as its head describes it, with its file's token. */
interface LandedRecord extends AnnotationsRecordEntry {
  /** The {@link annotationFileToken} of the annotations it holds. */
  token: number;
}

/** A write of an annotations record under way, which a synchronous save can name. */
interface PendingRecord {
  owner: string;
  count: number;
  token: number;
  /** Settles once the write has: with the record, or `null` when it failed. */
  landed: Promise<LandedRecord | null>;
}

/** What this store knows of a table's stored records: see `SessionStore.tables`. */
interface TableRecords {
  /**
   * The annotations record the stored session record names, whole when this
   * store last wrote or read it: `null` when it names none, `undefined`
   * while this store does not know.
   */
  landed: LandedRecord | null | undefined;
  /** Whether the stored session record holds its annotations itself, as versions before the annotations record wrote it. */
  embedded: boolean;
  /**
   * Whether the stored session record names annotations this store could
   * not attach to it (a record of a newer format, one it could not read
   * then, a file the restore refused): a save without annotations of its
   * own keeps them.
   */
  unattached: boolean;
  /** The write of an annotations record under way, if any. */
  pending: PendingRecord | null;
  /**
   * Counts `saveSync` and `delete` calls: an asynchronous save asked for
   * before one writes nothing more, and a load records nothing.
   */
  overtakes: number;
  /** The last operation on the table: the next waits for it. */
  tail: Promise<void>;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The session record for `snapshot`: every field but its annotations, which
 * are left out unless given here, as a marker naming their record or as a
 * file it holds itself.
 */
function sessionRecordOf(
  snapshot: SessionSnapshot,
  annotations?: { marker: AnnotationsMarker } | { embed: AnnotationFile },
): StoredSessionRecord {
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(snapshot)) {
    if (key === 'annotations' || key === '__annotations') continue;
    record[key] = (snapshot as unknown as Record<string, unknown>)[key];
  }
  if (annotations !== undefined) {
    if ('marker' in annotations) record['__annotations'] = annotations.marker;
    else record['annotations'] = annotations.embed;
  }
  return record as unknown as StoredSessionRecord;
}

/**
 * Put `record` as the session record, in a transaction of its own, enqueued
 * now: throws when it cannot be, otherwise settles with the transaction.
 */
function putSessionRecord(db: IDBDatabase, record: StoredSessionRecord): Promise<void> {
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(record);
  return transactionDone(tx);
}

/**
 * Put `record`, which has no annotations, as the session record, with the
 * annotations the stored one holds, read in the same transaction: its
 * marker, or the annotations it holds itself. Enqueued now: throws when it
 * cannot be, otherwise settles with the transaction.
 *
 * With `named`, `record` naming it goes first, and stands unless the stored
 * record holds annotations other than `named`'s (another tab's, written
 * since): a page torn down before the read comes back saves it as it would
 * have been saved before the read.
 */
function putSessionRecordKeeping(
  db: IDBDatabase,
  record: StoredSessionRecord,
  named?: LandedRecord,
): Promise<void> {
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const sessions = tx.objectStore(STORE_NAME);
  const request = sessions.get(record.tableName as string);
  if (named !== undefined) {
    sessions.put({ ...record, __annotations: markerNaming(named, null) });
  }
  request.onsuccess = () => {
    const stored: unknown = request.result;
    const kept: Record<string, unknown> = { ...record };
    if (isPlainObject(stored)) {
      if (stored['annotations'] !== undefined) kept['annotations'] = stored['annotations'];
      if (stored['__annotations'] !== undefined) kept['__annotations'] = stored['__annotations'];
    }
    if (named !== undefined) {
      // What the record put above names, or nothing stored to keep.
      if (!isPlainObject(stored)) return;
      if (
        kept['annotations'] === undefined &&
        readAnnotationsMarker(kept['__annotations'])?.owner === named.owner
      ) {
        return;
      }
    }
    sessions.put(kept);
  };
  return transactionDone(tx);
}

/**
 * Whether a save without annotations keeps the ones the stored session
 * record names, which this store could not attach to it: a newer version's
 * perhaps, kept until the table has annotations of its own to write.
 */
function keepsUnattached(table: TableRecords): boolean {
  return table.unattached || (table.landed != null && isAnnotationsRefused(table.landed.token));
}

function markerNaming(
  record: { owner: string; count: number },
  fallback: { owner: string; count: number } | null | undefined,
): AnnotationsMarker {
  return {
    format: ANNOTATIONS_RECORD_FORMAT,
    count: record.count,
    owner: record.owner,
    ...(fallback && fallback.owner !== record.owner
      ? { fallback: { owner: fallback.owner, count: fallback.count } }
      : {}),
  };
}

/** The file fields of `file`: all but its annotations, as a head keeps them. */
function fileFieldsOf(file: AnnotationFile): AnnotationsRecordEntry['file'] {
  const fields: Partial<AnnotationFile> = { ...file };
  delete fields.annotations;
  return fields as AnnotationsRecordEntry['file'];
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

/** Delete the chunks of `tableName` but those of `owners`, by the key ranges between them. */
function deleteChunksExcept(
  chunks: IDBObjectStore,
  tableName: string,
  owners: readonly string[],
): void {
  let lower: IDBValidKey = [tableName];
  let lowerOpen = false;
  for (const owner of [...new Set(owners)].sort()) {
    chunks.delete(IDBKeyRange.bound(lower, [tableName, owner], lowerOpen, true));
    // Past every key `[tableName, owner, index]`: an array sorts after a number.
    lower = [tableName, owner, []];
    lowerOpen = true;
  }
  chunks.delete(IDBKeyRange.bound(lower, [tableName, []], lowerOpen, false));
}

/**
 * Enqueue, in a new transaction of `db`, `file` as `tableName`'s annotations
 * record under `owner`: delete the table's chunks but those of the records
 * kept, put the file's annotations in chunks, then the head, naming the new
 * record and listing the kept ones as `previous`. All of it lands or, should
 * a request fail, none of it, and the old head and chunks stay whole.
 *
 * With `keep`, the head is read first, in the same transaction, and `keep`
 * says which of the records it describes to keep; each chunk is then put from
 * the previous put's `onsuccess`, which keeps the transaction active, so the
 * structured clone of a million annotations runs in a hundred short tasks
 * rather than one long one. With `kept`, nothing is read and every put is
 * enqueued at once, as a page being hidden needs; a put that cannot be
 * enqueued throws, the transaction aborted.
 *
 * Resolves with the chunks written and the records kept, once committed.
 */
function putAnnotationsRecord(
  db: IDBDatabase,
  tableName: string,
  owner: string,
  file: AnnotationFile,
  records:
    | { keep: (head: AnnotationsHead | null) => AnnotationsRecordEntry[] }
    | { kept: AnnotationsRecordEntry[] },
): Promise<{ chunks: number; kept: AnnotationsRecordEntry[] }> {
  const tx = db.transaction([ANNOTATIONS_STORE_NAME, CHUNKS_STORE_NAME], 'readwrite');
  const heads = tx.objectStore(ANNOTATIONS_STORE_NAME);
  const chunks = tx.objectStore(CHUNKS_STORE_NAME);
  const annotations: readonly unknown[] = Array.isArray(file.annotations) ? file.annotations : [];
  const fields = fileFieldsOf(file);
  let kept: AnnotationsRecordEntry[] = [];
  let start = 0;
  let index = 0;
  let failure: { error: unknown } | null = null;
  const done = new Promise<{ chunks: number; kept: AnnotationsRecordEntry[] }>(
    (resolve, reject) => {
      tx.oncomplete = () => resolve({ chunks: index, kept });
      tx.onabort = () => {
        reject(failure ? failure.error : (tx.error ?? new Error('IndexedDB transaction aborted')));
      };
    },
  );
  const abort = (error: unknown): void => {
    failure = { error };
    try {
      tx.abort();
    } catch {
      // Finished already.
    }
  };
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
      file: fields,
      ...(kept.length > 0 ? { previous: kept } : {}),
    };
    heads.put(head, tableName);
    return null;
  };
  const begin = (keep: AnnotationsRecordEntry[]): IDBRequest | null => {
    kept = keep;
    deleteChunksExcept(
      chunks,
      tableName,
      keep.map((entry) => entry.owner),
    );
    return putNext();
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
    if ('keep' in records) {
      const headRequest = heads.get(tableName);
      headRequest.onsuccess = () => {
        try {
          const request = begin(records.keep(readAnnotationsHead(headRequest.result)));
          if (request !== null) request.onsuccess = step;
        } catch (error) {
          abort(error);
        }
      };
    } else {
      let request = begin(records.kept);
      while (request !== null) request = putNext();
    }
  } catch (error) {
    abort(error);
    done.catch(() => undefined);
    throw error;
  }
  return done;
}

/** The head stored under `tableName`, as this version reads it, or `ok: false` when it cannot be read. */
async function readHead(
  db: IDBDatabase,
  tableName: string,
): Promise<{ ok: true; head: AnnotationsHead | null } | { ok: false }> {
  const read = await readRecord(db, ANNOTATIONS_STORE_NAME, tableName);
  return read.ok ? { ok: true, head: readAnnotationsHead(read.value) } : read;
}

/**
 * Read the record a session whose marker is `marker` names, in one
 * transaction: the head, then, for the marker's `owner` and then its
 * `fallback`, the chunks of the record the head describes under that owner,
 * with one `getAll`, until one is whole.
 */
function readNamedRecord(
  db: IDBDatabase,
  tableName: string,
  marker: AnnotationsMarker,
): Promise<
  | { ok: true; file: AnnotationFile; entry: AnnotationsRecordEntry }
  | { ok: false; reason: AnnotationsDropReason }
> {
  return new Promise((resolve) => {
    const unavailable = (): void => resolve({ ok: false, reason: 'unavailable' });
    try {
      const tx = db.transaction([ANNOTATIONS_STORE_NAME, CHUNKS_STORE_NAME], 'readonly');
      const headRequest = tx.objectStore(ANNOTATIONS_STORE_NAME).get(tableName);
      headRequest.onerror = unavailable;
      headRequest.onsuccess = () => {
        if (headRequest.result === undefined) {
          resolve({ ok: false, reason: 'missing' });
          return;
        }
        const head = readAnnotationsHead(headRequest.result);
        if (head === null) {
          resolve({ ok: false, reason: 'invalid' });
          return;
        }
        const entries = headEntries(head);
        const wanted = marker.fallback ? [marker, marker.fallback] : [marker];
        let invalid = false;
        const attempt = (i: number): void => {
          const named = wanted[i];
          if (named === undefined) {
            resolve({ ok: false, reason: invalid ? 'invalid' : 'mismatch' });
            return;
          }
          const entry = entries.find((candidate) => candidate.owner === named.owner);
          if (entry === undefined) {
            attempt(i + 1);
            return;
          }
          const assemble = (values: unknown[]): void => {
            const file = entry.count === named.count ? assembleAnnotationFile(entry, values) : null;
            if (file !== null) {
              resolve({ ok: true, file, entry });
            } else {
              invalid = true;
              attempt(i + 1);
            }
          };
          if (entry.chunks === 0 || entry.count !== named.count) {
            assemble([]);
            return;
          }
          try {
            const range = IDBKeyRange.bound(
              [tableName, entry.owner, 0],
              [tableName, entry.owner, entry.chunks - 1],
            );
            const chunksRequest = tx.objectStore(CHUNKS_STORE_NAME).getAll(range);
            chunksRequest.onerror = unavailable;
            chunksRequest.onsuccess = () => assemble(chunksRequest.result);
          } catch {
            unavailable();
          }
        };
        attempt(0);
      };
    } catch {
      unavailable();
    }
  });
}

/**
 * Once the session record names `owner`'s record alone, drop the records its
 * head kept: their chunks and its `previous`. Nothing when another write has
 * replaced the head since.
 */
function dropKeptRecords(db: IDBDatabase, tableName: string, owner: string): Promise<void> {
  const tx = db.transaction([ANNOTATIONS_STORE_NAME, CHUNKS_STORE_NAME], 'readwrite');
  const heads = tx.objectStore(ANNOTATIONS_STORE_NAME);
  const request = heads.get(tableName);
  request.onsuccess = () => {
    const head = readAnnotationsHead(request.result);
    if (head === null || head.owner !== owner || head.previous === undefined) return;
    deleteChunksExcept(tx.objectStore(CHUNKS_STORE_NAME), tableName, [owner]);
    const whole: AnnotationsHead = {
      format: head.format,
      owner: head.owner,
      count: head.count,
      chunks: head.chunks,
      file: head.file,
    };
    heads.put(whole, tableName);
  };
  return transactionDone(tx);
}

/**
 * Delete `tableName`'s annotations record, its head and its chunks, when its
 * head names `owner`'s: a record another write or a newer version made is
 * left alone. Pass no owner to delete it whatever it is.
 */
function deleteAnnotationsRecord(
  db: IDBDatabase,
  tableName: string,
  owner?: string,
): Promise<void> {
  const tx = db.transaction([ANNOTATIONS_STORE_NAME, CHUNKS_STORE_NAME], 'readwrite');
  const heads = tx.objectStore(ANNOTATIONS_STORE_NAME);
  const remove = (): void => {
    heads.delete(tableName);
    tx.objectStore(CHUNKS_STORE_NAME).delete(tableChunks(tableName));
  };
  if (owner === undefined) {
    remove();
  } else {
    const request = heads.get(tableName);
    request.onsuccess = () => {
      if (readAnnotationsHead(request.result)?.owner === owner) remove();
    };
  }
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
   *   `'mismatch'` (the table's record is another save's, which replaced
   *   both the one the session was saved with and its fallback: another
   *   tab's, written at the same moment), `'invalid'` (a malformed record or
   *   marker, or one of a format this version does not read) or
   *   `'unavailable'` (the annotations database could not be read).
   *   `details.count`, when known, is how many annotations the session was
   *   saved with. A record this version could not read stays, and the
   *   session goes on naming it, until the table has annotations to write.
   *   A `DataTable` that restores the snapshot warns of it too (a `warning`
   *   event), whoever owns the store.
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
 * annotations again; they are written before the session record that names
 * them, so that a reload restores the last annotations that landed, whatever
 * point a write was cut off at (see {@link SessionStore.save}).
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
 * import { SessionStore, createDataTable } from '@jeyabbalas/data-table';
 *
 * // Share one store across many tables, each under a table name of its own:
 * const store = new SessionStore();
 * await store.open();
 *
 * const t1 = await createDataTable({
 *   container: document.getElementById('one')!,
 *   source: '/a.csv',
 *   tableName: 'set_a',
 *   persistence: { sessionStore: store },
 * });
 * const t2 = await createDataTable({
 *   container: document.getElementById('two')!,
 *   source: '/b.csv',
 *   tableName: 'set_b',
 *   persistence: { sessionStore: store },
 * });
 *
 * // Inspect persisted sessions:
 * const snapshot = await store.load('set_a');
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
  /** Counts {@link close} calls: an operation a close overtook keeps and records nothing. */
  private generation = 0;
  private readonly onLoadIssue: SessionStoreOptions['onLoadIssue'];
  /**
   * What this store knows of each table's stored records, by table name, and
   * the table's queue: `save`, `load` and `delete` of one table run one at a
   * time, in call order, so that none reads or writes what another is half
   * way through. `saveSync`, which cannot wait, goes first: an asynchronous
   * save it overtook stops where it is, the newer state being written.
   */
  private readonly tables = new Map<string, TableRecords>();

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
      for (const table of this.tables.values()) table.landed = undefined;
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

  private table(tableName: string): TableRecords {
    let table = this.tables.get(tableName);
    if (table === undefined) {
      table = {
        landed: undefined,
        embedded: false,
        unattached: false,
        pending: null,
        overtakes: 0,
        tail: Promise.resolve(),
      };
      this.tables.set(tableName, table);
    }
    return table;
  }

  /** Run `operation` in `table`'s turn: once every operation on it asked for before has ended. */
  private inTurn<R>(table: TableRecords, operation: () => Promise<R>): Promise<R> {
    const run = table.tail.then(operation);
    table.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Store a snapshot. No-op if `tableName` is null or IDB is unavailable
   * (private browsing, opt-out, no-IDB environment).
   *
   * The snapshot's `annotations` go in a record of their own, in chunks,
   * written only when they are not the annotations this store last wrote or
   * read for the table, or when another tab has written the table's since;
   * the session record names that record. They go first, and the session
   * record only once they have landed, naming the record it named before as
   * a fallback, which their write keeps until it has: a reload at any
   * point, or a write that fails, restores the last annotations that
   * landed. A snapshot from `snapshotFromState` says whether its annotations
   * changed without their file being taken. Any other file is compared by
   * identity: by its `annotations` array and that array's length, so an
   * edit made in place, to a file this store wrote or loaded, is not seen
   * (an annotation pushed onto the array is). Saves of one table run one at
   * a time, in call order. When `dt-annotations` could not be opened, the
   * annotations stay in the session record.
   *
   * Rejects with the underlying `DOMException` (typically
   * `QuotaExceededError`) when IDB IS available but the session record's
   * transaction fails — see `AutoSave` for the consumer-side mapping to a
   * typed `PersistenceError`. When only the annotations record fails, the
   * session record is saved with the annotations it held before, and the
   * save rejects with a `PersistenceError` whose `details.record` is
   * `'annotations'`. The "never throws" contract applies only to the no-IDB
   * fallback; quota and abort errors must reach the consumer.
   */
  async save(snapshot: SessionSnapshot): Promise<void> {
    if (snapshot.tableName == null) return;
    const tableName = snapshot.tableName;
    const table = this.table(tableName);
    const overtakes = table.overtakes;
    const generation = this.generation;
    if (!(await this.ensureOpen())) return;
    // A synchronous save since has the newer state written; a delete, none.
    const stale = (): boolean => table.overtakes !== overtakes || generation !== this.generation;
    return this.inTurn(table, () => this.saveInTurn(snapshot, tableName, table, stale));
  }

  private async saveInTurn(
    snapshot: SessionSnapshot,
    tableName: string,
    table: TableRecords,
    stale: () => boolean,
  ): Promise<void> {
    const db = this.db;
    if (db === null || stale()) return;
    const annotations = snapshotAnnotationsOf(snapshot);
    if (annotations.kind === 'held' || (annotations.kind === 'none' && keepsUnattached(table))) {
      await putSessionRecordKeeping(db, sessionRecordOf(snapshot));
      return;
    }
    const annotationsDb = this.annotationsDb;
    if (annotationsDb === null) {
      // As before `dt-annotations`: the session record holds them itself.
      const file = annotations.kind === 'file' ? annotations.file() : undefined;
      if (annotations.kind === 'file' && file === undefined) {
        // Gone from the annotation store since the snapshot.
        await putSessionRecordKeeping(db, sessionRecordOf(snapshot));
        return;
      }
      await putSessionRecord(db, sessionRecordOf(snapshot, file && { embed: file }));
      if (stale()) return;
      table.landed = null;
      table.embedded = file !== undefined;
      table.unattached = false;
      return;
    }
    if (annotations.kind === 'none') {
      await this.saveWithoutAnnotations(snapshot, tableName, table, db, annotationsDb, stale);
      return;
    }
    const landed = table.landed;
    if (landed && landed.token === annotations.token) {
      // Unchanged: the session record alone, unless another tab has written
      // the table's annotations since, which these then replace, as the last
      // writer's.
      const head = await readHead(annotationsDb, tableName);
      if (stale()) return;
      if (!head.ok || head.head?.owner === landed.owner) {
        await putSessionRecord(
          db,
          sessionRecordOf(snapshot, { marker: markerNaming(landed, null) }),
        );
        // Records a write kept, whose cleanup was cut off.
        if (head.ok && head.head?.previous !== undefined && !stale()) {
          await dropKeptRecords(annotationsDb, tableName, landed.owner).catch(() => undefined);
        }
        return;
      }
    }
    const file = annotations.file();
    if (file === undefined) {
      // Gone from the annotation store since the snapshot: the save its
      // change asked for writes the new ones.
      await putSessionRecordKeeping(db, sessionRecordOf(snapshot));
      return;
    }
    await this.writeAnnotations(snapshot, tableName, table, db, annotationsDb, file, stale);
  }

  /** Save a session that has no annotations: the record it named goes. */
  private async saveWithoutAnnotations(
    snapshot: SessionSnapshot,
    tableName: string,
    table: TableRecords,
    db: IDBDatabase,
    annotationsDb: IDBDatabase,
    stale: () => boolean,
  ): Promise<void> {
    const landed = table.landed;
    await putSessionRecord(db, sessionRecordOf(snapshot));
    if (stale()) return;
    table.landed = null;
    table.embedded = false;
    if (!landed) return;
    try {
      await deleteAnnotationsRecord(annotationsDb, tableName, landed.owner);
    } catch {
      // Left behind: the next write replaces it.
    }
  }

  /**
   * Write `file` as the table's annotations record, then the session record
   * naming it, then drop what the head kept; see {@link save}.
   */
  private async writeAnnotations(
    snapshot: SessionSnapshot,
    tableName: string,
    table: TableRecords,
    db: IDBDatabase,
    annotationsDb: IDBDatabase,
    file: AnnotationFile,
    stale: () => boolean,
  ): Promise<void> {
    const token = annotationFileToken(file);
    const count = Array.isArray(file.annotations) ? file.annotations.length : 0;
    const owner = newAnnotationsOwner();
    const before = table.landed;
    // Kept whole: the record the stored session record names, as far as this
    // store knows, and the head's own, which another tab's may name; while
    // this store knows nothing, every record the head describes.
    const keep = (head: AnnotationsHead | null): AnnotationsRecordEntry[] => {
      if (head === null) return [];
      const entries = headEntries(head);
      if (before === undefined) return entries;
      return entries.filter((entry) => entry.owner === head.owner || entry.owner === before?.owner);
    };
    let settle!: (record: LandedRecord | null) => void;
    const pending: PendingRecord = {
      owner,
      count,
      token,
      landed: new Promise((resolve) => (settle = resolve)),
    };
    table.pending = pending;
    let written: { chunks: number; kept: AnnotationsRecordEntry[] };
    try {
      written = await putAnnotationsRecord(annotationsDb, tableName, owner, file, { keep });
    } catch (error) {
      settle(null);
      if (table.pending === pending) table.pending = null;
      // The session record goes on naming the annotations it named.
      if (!stale()) await putSessionRecordKeeping(db, sessionRecordOf(snapshot));
      throw annotationsWriteFailure(error, tableName);
    }
    const record: LandedRecord = {
      owner,
      count,
      chunks: written.chunks,
      file: fileFieldsOf(file),
      token,
    };
    settle(record);
    if (table.pending === pending) table.pending = null;
    // A synchronous save since wrote a newer session record, naming this
    // record or another, and records what it names.
    if (stale()) return;
    const fallback = written.kept.find((entry) => entry.owner === before?.owner) ?? written.kept[0];
    await putSessionRecord(
      db,
      sessionRecordOf(snapshot, { marker: markerNaming(record, fallback) }),
    );
    if (stale()) return;
    table.landed = record;
    table.embedded = false;
    table.unattached = false;
    try {
      await dropKeptRecords(annotationsDb, tableName, owner);
    } catch {
      // The next write drops them.
    }
  }

  /**
   * Synchronous save — enqueues the IDB puts (the session record's, and the
   * annotations record's chunks and head when they changed) without yielding
   * to the microtask queue. Use this in page lifecycle handlers
   * (beforeunload, visibilitychange) where an async await could be skipped
   * by the browser during page teardown.
   *
   * Both go at once: the session record names the new annotations with the
   * record it named before as their fallback, which their write keeps, so a
   * page that goes before they land restores that one. When the asynchronous
   * write of the same annotations is under way, the session record names it
   * instead of writing them again; an asynchronous save this overtakes
   * writes nothing more. When the stored session record names annotations
   * this store does not know of, the annotations go in the session record
   * itself.
   *
   * No-op if the database hasn't been opened yet or `tableName` is null.
   * Re-throws synchronously if `transaction()` / `put()` throws — typically
   * `QuotaExceededError`. `AutoSave.flushPendingSave` catches and
   * routes through `reportError`. When only the annotations record's put
   * throws, the session record is still enqueued, with the annotations it
   * held before, and a `PersistenceError` whose `details.record` is
   * `'annotations'` is thrown.
   */
  saveSync(snapshot: SessionSnapshot): void {
    if (snapshot.tableName == null) return;
    const db = this.db;
    if (!db) return;

    const tableName = snapshot.tableName;
    const table = this.table(tableName);
    const overtakes = ++table.overtakes;
    const generation = this.generation;
    const annotations = snapshotAnnotationsOf(snapshot);
    const annotationsDb = this.annotationsDb;
    const landed = table.landed;
    const session = sessionRecordOf(snapshot);

    // How the session record is put, and what it says of its annotations.
    let put: () => Promise<void> = () => putSessionRecordKeeping(db, session);
    let after: Pick<TableRecords, 'embedded'> & { landed?: TableRecords['landed'] } = {
      embedded: table.embedded,
    };
    let landing: Promise<LandedRecord | null> | null = null;
    let annotationsError: { error: unknown } | null = null;
    // A record this store knows, and the session record it names.
    const known = annotationsDb !== null && !table.embedded ? landed : undefined;
    if (annotations.kind === 'none') {
      if (!keepsUnattached(table)) {
        put = () => putSessionRecord(db, session);
        after = { embedded: false, landed: null };
      }
    } else if (annotations.kind === 'file') {
      if (known && known.token === annotations.token) {
        put = () => putSessionRecordKeeping(db, session, known);
      } else if (known !== undefined && table.pending?.token === annotations.token) {
        // The write under way holds them: name it.
        const marker = markerNaming(table.pending, known);
        put = () => putSessionRecord(db, { ...session, __annotations: marker });
        landing = table.pending.landed;
        after = { embedded: false };
      } else {
        const file = annotations.file();
        if (file === undefined) {
          // Gone from the annotation store since the snapshot: the stored ones stay.
        } else if (annotationsDb === null || known === undefined) {
          // In the session record itself: nothing to name, and nothing lost
          // should the page go before it lands.
          put = () => putSessionRecord(db, { ...session, annotations: file });
          after = { embedded: true, landed: null };
        } else {
          // Write them now, all at once, keeping the record the session names.
          const owner = newAnnotationsOwner();
          const count = Array.isArray(file.annotations) ? file.annotations.length : 0;
          try {
            const written = putAnnotationsRecord(annotationsDb, tableName, owner, file, {
              kept: known ? [known] : [],
            });
            const marker = markerNaming({ owner, count }, known);
            put = () => putSessionRecord(db, { ...session, __annotations: marker });
            const fields = fileFieldsOf(file);
            landing = written.then(
              (done): LandedRecord => ({
                owner,
                count,
                chunks: done.chunks,
                file: fields,
                token: annotations.token,
              }),
              () => null,
            );
            table.pending = { owner, count, token: annotations.token, landed: landing };
            after = { embedded: false };
          } catch (error) {
            annotationsError = { error };
          }
        }
      }
    }

    let written: Promise<void>;
    try {
      written = put();
    } catch (error) {
      if (landing !== null && table.pending?.landed === landing) table.pending = null;
      throw error;
    }
    // Recorded once both have settled, before the table's next operation.
    const settled = Promise.allSettled([written, landing]).then(([session, record]) => {
      if (table.pending !== null && table.pending.landed === landing) table.pending = null;
      if (table.overtakes !== overtakes || generation !== this.generation) return;
      if (session.status === 'rejected') return;
      table.embedded = after.embedded;
      if (after.landed !== undefined) table.landed = after.landed;
      if (record.status === 'fulfilled' && record.value) table.landed = record.value;
      if (after.landed !== undefined || landing !== null) table.unattached = false;
      // The record the session record named no longer: dropped, unless
      // another write has replaced it since.
      if (after.landed === null && landed && annotationsDb !== null) {
        return deleteAnnotationsRecord(annotationsDb, tableName, landed.owner).catch(
          () => undefined,
        );
      }
    });
    table.tail = Promise.all([table.tail, settled]).then(
      () => undefined,
      () => undefined,
    );
    if (annotationsError !== null) throw annotationsWriteFailure(annotationsError.error, tableName);
  }

  /**
   * Load a snapshot by table name. Returns `null` if not found, if IDB is
   * unavailable, or if the stored value fails a structural shape check (a
   * partially-tampered blob from a same-origin attacker, or a snapshot from
   * a future schema version we can't recognise).
   *
   * Annotations saved in a record of their own come back in the snapshot's
   * `annotations`: the record the session record names, or, when that one
   * is not whole, the one it names as its fallback. When neither is, the
   * session comes back without them, and `onLoadIssue` is told
   * (`PERSISTENCE_ANNOTATIONS_DROPPED`), as is a `DataTable` that restores
   * the snapshot, which warns. Annotations saved in the session record
   * itself — by versions before the record, or by a custom store — win over
   * any record. A load waits for the table's saves asked for before it.
   */
  async load(tableName: string): Promise<SessionSnapshot | null> {
    if (!(await this.ensureOpen())) return null;
    const table = this.table(tableName);
    return this.inTurn(table, () => this.loadInTurn(tableName, table));
  }

  private async loadInTurn(
    tableName: string,
    table: TableRecords,
  ): Promise<SessionSnapshot | null> {
    const db = this.db;
    if (db === null) return null;
    const overtakes = table.overtakes;
    const generation = this.generation;
    // What a synchronous save or a delete while this reads wrote is newer
    // than what it read.
    const record = (
      landed: TableRecords['landed'],
      state: Partial<Pick<TableRecords, 'embedded' | 'unattached'>> = {},
    ): void => {
      if (table.overtakes !== overtakes || generation !== this.generation) return;
      table.landed = landed;
      table.embedded = state.embedded ?? false;
      table.unattached = state.unattached ?? false;
    };

    const read = await readRecord(db, STORE_NAME, tableName);
    const result = coerceLoadedSnapshotWithStatus(read.ok ? read.value : null);
    if (!result.ok) {
      if (result.reason === 'version') {
        this.onLoadIssue?.({
          code: 'PERSISTENCE_VERSION_REJECTED',
          tableName,
          details: { version: result.version, expectedMax: SNAPSHOT_VERSION },
        });
      }
      // None stored names no record; one this version cannot read, one it
      // does not know.
      record(read.ok && result.reason === 'absent' ? null : undefined);
      return null;
    }

    const { __annotations: marker, ...snapshot } = result.snapshot as StoredSessionRecord;
    if (snapshot.annotations !== undefined || marker === undefined) {
      record(null, { embedded: snapshot.annotations !== undefined });
      return snapshot;
    }

    const dropped = (reason: AnnotationsDropReason, count?: number): SessionSnapshot => {
      const details = count === undefined ? { reason } : { reason, count };
      noteAnnotationsDrop(snapshot, details);
      this.onLoadIssue?.({ code: 'PERSISTENCE_ANNOTATIONS_DROPPED', tableName, details });
      // A record that is gone is forgotten; one this version could not read
      // stays, named, until the table has annotations of its own to write.
      if (reason === 'missing' || reason === 'mismatch') record(null);
      else record(undefined, { unattached: true });
      return snapshot;
    };
    const named = readAnnotationsMarker(marker);
    if (named === null) return dropped('invalid');
    const annotationsDb = this.annotationsDb;
    if (annotationsDb === null) return dropped('unavailable', named.count);
    const stored = await readNamedRecord(annotationsDb, tableName, named);
    if (!stored.ok) return dropped(stored.reason, named.count);

    // A record this store wrote: the copy read back takes the token of the
    // file it was written from, so that a save of that file after a load
    // that restores nothing (an app reading the session) writes nothing. A
    // restore adopts the copy's token either way.
    const known = table.landed;
    if (known && known.owner === stored.entry.owner) {
      shareAnnotationFileToken(stored.file, known.token);
    }
    record({ ...stored.entry, token: annotationFileToken(stored.file) });
    snapshot.annotations = stored.file;
    return snapshot;
  }

  /**
   * Delete a snapshot by table name, and its annotations record, head and
   * chunks, once the table's operations asked for before have ended; a save
   * among them that has not written its annotations yet writes nothing
   * more. No-op if db unavailable.
   */
  async delete(tableName: string): Promise<void> {
    const table = this.table(tableName);
    table.overtakes++;
    if (!(await this.ensureOpen())) return;
    return this.inTurn(table, async () => {
      const db = this.db;
      if (db === null) return;
      // Nothing a synchronous save makes meanwhile names the records going.
      table.landed = undefined;
      table.embedded = false;
      table.unattached = false;
      const annotationsDb = this.annotationsDb;
      let annotations: Promise<unknown> = Promise.resolve();
      if (annotationsDb !== null) {
        try {
          annotations = deleteAnnotationsRecord(annotationsDb, tableName).catch(() => undefined);
        } catch {
          // Left behind: no session record names it.
        }
      }
      const [deleted] = await Promise.all([deleteRecord(db, STORE_NAME, tableName), annotations]);
      if (deleted && table.landed === undefined) table.landed = null;
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
    this.tables.clear();
    this.opening = null;
  }
}
