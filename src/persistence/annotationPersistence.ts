/**
 * How a table's annotations persist: in a record of their own, written only
 * when they change, in an order that never loses a record that landed.
 *
 * A session save used to carry `AnnotationStore.toJSON()` inside the session
 * record, so a sort, a filter or a column width serialized and cloned every
 * annotation again, about a second at a million. `SessionStore` keeps them in
 * the `dt-annotations` database instead, under the session's table name, and
 * writes them only when they are not the annotations it last wrote or read.
 * Telling is cheap: a store's content has a token ({@link annotationsToken}),
 * the same until the content or its table name changes, and a snapshot from
 * `snapshotFromState` can carry it without taking the file
 * ({@link setSnapshotAnnotations}), which is then taken only when something
 * reads it, a write or a custom store. Nothing here holds on to a file.
 *
 * A table's annotations record is a head and chunks. The head, in the
 * `annotations` store under the table name, is `{ format, owner, count,
 * chunks, file, previous }`: `file` is the annotation file without its
 * annotations, which are in the `chunks` store, in slices of at most
 * {@link ANNOTATION_CHUNK_MAX_COUNT} annotations or about
 * {@link ANNOTATION_CHUNK_MAX_BYTES} ({@link annotationChunkEnd}), each under
 * `[tableName, owner, index]`; `previous` lists the records a write kept
 * whole, because a stored session record may still name them. Chromium
 * refuses any one value over 133,169,152 bytes, which a million annotations
 * pass as a single file; a chunk stays far below it, and a write clones a
 * million annotations in a hundred short tasks rather than one long one.
 *
 * The session record holds a marker in place of its annotations,
 * `__annotations: { format, count, owner, fallback }`: `owner` names the
 * record written with it, and `fallback` the record it named before, which
 * that write kept. `owner` is a token made for each write
 * ({@link newAnnotationsOwner}), so a record left behind, by a version
 * before this one (whose `clearSession` leaves it) or by a write whose
 * session record never landed, is never taken for one a session was saved
 * with.
 *
 * The two records live in separate databases, so no write of both is
 * atomic; their order makes up for it. A save writes the annotations first,
 * the new chunks and a head keeping the records the stored session record
 * may name, in one transaction; only once that has committed does it write
 * the session record naming them, with the record it named before as its
 * fallback; and once that too has committed, a small transaction drops what
 * the head kept. A save whose annotations do not land keeps the stored
 * session record's annotations as they are. So the stored session record
 * names a whole record at every point, and a reload, a crash or a failed
 * write restores the last annotations that landed, at worst older than the
 * rest of the session. Two tabs that write one table's annotations at the
 * same moment can still lose them: neither sees the other's records until
 * its own write has begun.
 */

import type { AnnotationStore } from '../annotations/AnnotationStore';
import { ANNOTATION_FILE_VERSION } from '../annotations/types';
import type { AnnotationFile } from '../annotations/types';
import type { SessionSnapshot } from './types';

// ── Tokens ────────────────────────────────────────────────────────────

let lastToken = 0;

interface FileToken {
  token: number;
  /** The file's annotations array, and its length, when the token was taken. */
  annotations: unknown;
  length: number;
}

const fileTokens = new WeakMap<AnnotationFile, FileToken>();

function lengthOf(annotations: unknown): number {
  return Array.isArray(annotations) ? annotations.length : -1;
}

/**
 * A number for `file`'s annotations: the same at every call while the file
 * holds the same `annotations` array at the same length, a new one once
 * either changed, and different from every other file's unless
 * {@link shareAnnotationFileToken} gave it another's. A session store that
 * last wrote or read annotations with this token holds them already.
 *
 * An edit in place that keeps the array and its length (an annotation's
 * message changed in place) is not seen.
 *
 * @internal
 */
export function annotationFileToken(file: AnnotationFile): number {
  const annotations: unknown = file.annotations;
  const length = lengthOf(annotations);
  const known = fileTokens.get(file);
  if (known !== undefined && known.annotations === annotations && known.length === length) {
    return known.token;
  }
  const token = ++lastToken;
  fileTokens.set(file, { token, annotations, length });
  return token;
}

/**
 * Give `file` the token `token`: for a file read back from the record
 * another one with that token was written to, which holds the same
 * annotations.
 *
 * @internal
 */
export function shareAnnotationFileToken(file: AnnotationFile, token: number): void {
  const annotations: unknown = file.annotations;
  fileTokens.set(file, { token, annotations, length: lengthOf(annotations) });
}

/** A store's content at one `contentRevision`, under the table name it resolved then. */
interface ContentToken {
  revision: number;
  tableName: string | null | undefined;
  token: number;
}

const contentTokens = new WeakMap<AnnotationStore, ContentToken>();

/** The token of `store`'s content now; `null` when it is empty. */
function contentTokenOf(store: AnnotationStore): ContentToken | null {
  if (store.count() === 0) return null;
  const revision = store.contentRevision;
  const tableName = store.resolvedTableName();
  const known = contentTokens.get(store);
  if (known !== undefined && known.revision === revision && known.tableName === tableName) {
    return known;
  }
  const content: ContentToken = { revision, tableName, token: ++lastToken };
  contentTokens.set(store, content);
  return content;
}

/**
 * The token of `store`'s content: the same until its content or the table
 * name it resolves changes, a severity-filter change being neither; `null`
 * when the store is empty. O(1): it takes no file.
 *
 * @internal
 */
export function annotationsToken(store: AnnotationStore): number | null {
  return contentTokenOf(store)?.token ?? null;
}

/**
 * The file of `store`'s content as `content` describes it, under its token
 * and table name, while the store holds that content still; `undefined`
 * once it changed. A new file at every call, which nothing here keeps: it
 * holds the store's live annotations, and a merged copy of each that has
 * fields of the app's own.
 */
function fileOf(store: AnnotationStore, content: ContentToken): AnnotationFile | undefined {
  if (store.contentRevision !== content.revision || store.count() === 0) return undefined;
  const file = store.toJSON();
  // As `toJSON` tagged it then: a load resets the table name before it
  // empties the store.
  if (content.tableName === null || content.tableName === undefined) {
    delete file.tableName;
  } else {
    file.tableName = content.tableName;
  }
  shareAnnotationFileToken(file, content.token);
  return file;
}

/**
 * `store.toJSON()`, under the token of the content it holds
 * ({@link annotationsToken}); `null` when the store is empty. A new file at
 * every call, which nothing here keeps.
 *
 * @internal
 */
export function takeAnnotationFile(store: AnnotationStore): AnnotationFile | null {
  const content = contentTokenOf(store);
  return content === null ? null : (fileOf(store, content) ?? null);
}

/**
 * Let `file`, which `store` was just loaded from (`loadJSON` in replace
 * mode, nothing skipped), stand for the store's content: the content takes
 * `file`'s token, so a session store that wrote or read `file` does not
 * write the same annotations again. A restore calls it. `file` is not kept.
 *
 * Nothing is adopted when the store's file would differ from `file` in
 * more than its timestamps (another table name, an older file version) or
 * the store holds a different number of annotations (a duplicate skipped):
 * the next save then writes the store's own.
 *
 * @internal
 */
export function adoptAnnotationFile(store: AnnotationStore, file: AnnotationFile): void {
  if (store.count() === 0 || file.version !== ANNOTATION_FILE_VERSION) return;
  if (lengthOf(file.annotations) !== store.count()) return;
  const tableName = store.resolvedTableName();
  // `toJSON` leaves the name out when the store resolves none.
  if (file.tableName !== (tableName ?? undefined)) return;
  contentTokens.set(store, {
    revision: store.contentRevision,
    tableName,
    token: annotationFileToken(file),
  });
}

const refusedTokens = new Set<number>();

/**
 * Note that a restore's `loadJSON` refused `file`, which a session store
 * read: the record it came from stays, as one this version cannot read,
 * until the table has annotations of its own to write.
 *
 * @internal
 */
export function noteAnnotationsRefused(file: AnnotationFile): void {
  refusedTokens.add(annotationFileToken(file));
}

/** Whether the annotations of token `token` were refused by a restore. @internal */
export function isAnnotationsRefused(token: number): boolean {
  return refusedTokens.has(token);
}

// ── Snapshots ─────────────────────────────────────────────────────────

/** What a snapshot from `snapshotFromState` says of its annotations, beyond its `annotations`. */
type SnapshotAnnotations =
  /** The annotations of a store, under `token`, whose file is taken when read. */
  | { kind: 'file'; token: number }
  /** Annotations held back from saving, or gone: the stored ones stay as they are. */
  | { kind: 'held' };

const snapshotAnnotations = new WeakMap<object, SnapshotAnnotations>();

/** The store and content of each snapshot whose annotations' file is still to be taken. */
const pendingContents = new WeakMap<object, { store: AnnotationStore; content: ContentToken }>();

function settleAnnotations(snapshot: SessionSnapshot, file: AnnotationFile | undefined): void {
  Object.defineProperty(snapshot, 'annotations', {
    value: file,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Give `snapshot` the annotations of `store`; nothing when it is empty.
 *
 * With `lazy`, their file is not taken now: `annotations` takes it when
 * first read (by a custom store, `JSON`, a structured clone, a spread), and
 * a `SessionStore` that finds them unchanged never reads it. Read once the
 * store's content has changed, it is `undefined`, and the snapshot's
 * annotations count as held back ({@link holdBackSnapshotAnnotations}): a
 * save of it leaves the stored ones as they are, and the save the change
 * asked for writes the new ones. {@link settleSnapshotAnnotations} takes the
 * files of snapshots still to be saved before a store is emptied for other
 * data.
 *
 * @internal
 */
export function setSnapshotAnnotations(
  snapshot: SessionSnapshot,
  store: AnnotationStore,
  lazy: boolean,
): void {
  const content = contentTokenOf(store);
  if (content === null) return;
  if (!lazy) {
    const file = fileOf(store, content);
    if (file !== undefined) snapshot.annotations = file;
    return;
  }
  snapshotAnnotations.set(snapshot, { kind: 'file', token: content.token });
  pendingContents.set(snapshot, { store, content });
  Object.defineProperty(snapshot, 'annotations', {
    enumerable: true,
    configurable: true,
    get(this: SessionSnapshot): AnnotationFile | undefined {
      return settleFrom(this, fileOf(store, content));
    },
    set(this: SessionSnapshot, file: AnnotationFile | undefined) {
      snapshotAnnotations.delete(this);
      pendingContents.delete(this);
      settleAnnotations(this, file);
    },
  });
}

/** Settle `snapshot`'s lazy annotations as `file`: held back when it is gone. */
function settleFrom(
  snapshot: SessionSnapshot,
  file: AnnotationFile | undefined,
): AnnotationFile | undefined {
  pendingContents.delete(snapshot);
  if (file === undefined) snapshotAnnotations.set(snapshot, { kind: 'held' });
  settleAnnotations(snapshot, file);
  return file;
}

/**
 * Take now the files of `snapshots`' lazy annotations that are still to be
 * taken, one per content: before their store is emptied for other data,
 * which would leave a save under way without them.
 *
 * @internal
 */
export function settleSnapshotAnnotations(snapshots: Iterable<SessionSnapshot>): void {
  const files = new Map<ContentToken, AnnotationFile | undefined>();
  for (const snapshot of snapshots) {
    const pending = pendingContents.get(snapshot);
    if (pending === undefined) continue;
    let file = files.get(pending.content);
    if (!files.has(pending.content)) {
      file = fileOf(pending.store, pending.content);
      files.set(pending.content, file);
    }
    settleFrom(snapshot, file);
  }
}

/**
 * Mark `snapshot`'s annotations as held back from saving (it has no
 * `annotations`): a `SessionStore` leaves the stored ones as they are, and
 * the session record goes on naming them.
 *
 * @internal
 */
export function holdBackSnapshotAnnotations(snapshot: SessionSnapshot): void {
  snapshotAnnotations.set(snapshot, { kind: 'held' });
}

/**
 * What `snapshot` holds of its annotations, for a session store to tell
 * whether they changed without taking their file: none, held back, or a
 * file under a token, which `file()` takes (`undefined` when they are gone,
 * which then count as held back).
 *
 * @internal
 */
export function snapshotAnnotationsOf(
  snapshot: SessionSnapshot,
):
  | { kind: 'none' }
  | { kind: 'held' }
  | { kind: 'file'; token: number; file: () => AnnotationFile | undefined } {
  const noted = snapshotAnnotations.get(snapshot);
  if (noted?.kind === 'held') return { kind: 'held' };
  if (noted?.kind === 'file' && pendingContents.has(snapshot)) {
    return { kind: 'file', token: noted.token, file: () => snapshot.annotations };
  }
  const file = snapshot.annotations;
  if (file === undefined || file === null) return { kind: 'none' };
  return { kind: 'file', token: annotationFileToken(file), file: () => file };
}

/**
 * Why the annotations a stored session named were not restored, and how
 * many it was saved with: noted on the snapshot `SessionStore.load` returns,
 * for the restore to report, whoever owns the store.
 *
 * @internal
 */
export interface AnnotationsDrop {
  reason: AnnotationsDropReason;
  count?: number;
}

const snapshotDrops = new WeakMap<object, AnnotationsDrop>();

/** @internal */
export function noteAnnotationsDrop(snapshot: SessionSnapshot, drop: AnnotationsDrop): void {
  snapshotDrops.set(snapshot, drop);
}

/** The drop noted on `snapshot` by the load that returned it, if any. @internal */
export function annotationsDropOf(snapshot: SessionSnapshot): AnnotationsDrop | undefined {
  return snapshotDrops.get(snapshot);
}

// ── The records ───────────────────────────────────────────────────────

/**
 * The format of an annotations record, and of the marker that names it.
 *
 * @internal
 */
export const ANNOTATIONS_RECORD_FORMAT = 1;

/**
 * What a session record holds, under `__annotations`, in place of the
 * annotations it was saved with: the record written with it (`owner`, of
 * `count` annotations) and, when that write kept one, the record it named
 * before (`fallback`).
 *
 * @internal
 */
export interface AnnotationsMarker {
  format: number;
  count: number;
  owner: string;
  fallback?: { owner: string; count: number };
}

/**
 * A record as a head describes it: its owner, its annotations' count, its
 * chunks' count, and the file without its annotations. Its chunks are keyed
 * `[tableName, owner, 0]` to `[tableName, owner, chunks - 1]`.
 *
 * @internal
 */
export interface AnnotationsRecordEntry {
  owner: string;
  count: number;
  chunks: number;
  file: Omit<AnnotationFile, 'annotations'>;
}

/**
 * The head of a table's annotations record in `dt-annotations`, keyed by
 * the table name: the record the last write wrote, and in `previous` those
 * it kept whole because a stored session record may still name them.
 *
 * @internal
 */
export interface AnnotationsHead extends AnnotationsRecordEntry {
  format: number;
  previous?: AnnotationsRecordEntry[];
}

/**
 * Why a session's annotations were not restored: `'missing'`, no annotations
 * record; `'mismatch'`, a record written with another save of the session;
 * `'invalid'`, a malformed record or marker, one of a format this version
 * does not read, or a file `loadJSON` refused; `'unavailable'`, the
 * annotations database could not be read.
 */
export type AnnotationsDropReason = 'missing' | 'mismatch' | 'invalid' | 'unavailable';

let ownerPrefix: string | null = null;
let lastOwner = 0;

/**
 * A new `owner` for an annotations record about to be written: unique to
 * this write, among all tabs. It tells records apart, and needs no more
 * than that from its randomness.
 *
 * @internal
 */
export function newAnnotationsOwner(): string {
  ownerPrefix ??= `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
  return `${ownerPrefix}.${(++lastOwner).toString(36)}`;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOwnedCount(value: unknown): value is { owner: string; count: number } {
  return (
    isPlainObject(value) &&
    typeof value['owner'] === 'string' &&
    value['owner'].length > 0 &&
    isCount(value['count'])
  );
}

/**
 * The marker `value`, a session record's `__annotations`, when it is one
 * this version reads; a `fallback` it cannot read is left out. `null`
 * otherwise.
 *
 * @internal
 */
export function readAnnotationsMarker(value: unknown): AnnotationsMarker | null {
  if (
    !isOwnedCount(value) ||
    (value as Record<string, unknown>)['format'] !== ANNOTATIONS_RECORD_FORMAT
  ) {
    return null;
  }
  const fallback = (value as Record<string, unknown>)['fallback'];
  const marker: AnnotationsMarker = {
    format: ANNOTATIONS_RECORD_FORMAT,
    count: value.count,
    owner: value.owner,
  };
  if (isOwnedCount(fallback) && fallback.owner !== value.owner) {
    marker.fallback = { owner: fallback.owner, count: fallback.count };
  }
  return marker;
}

function readEntry(value: unknown): AnnotationsRecordEntry | null {
  if (!isOwnedCount(value)) return null;
  const { chunks, file } = value as Record<string, unknown>;
  if (
    !isCount(chunks) ||
    // Every chunk holds an annotation at least.
    chunks > value.count ||
    (value.count > 0 && chunks === 0) ||
    !isPlainObject(file) ||
    typeof file['version'] !== 'number'
  ) {
    return null;
  }
  return value as unknown as AnnotationsRecordEntry;
}

/**
 * The head `value`, as stored under a table's name, when it is one this
 * version reads: the record it names and those it kept, a kept one it cannot
 * read left out. `null` otherwise, a head of a newer format included.
 *
 * @internal
 */
export function readAnnotationsHead(value: unknown): AnnotationsHead | null {
  if (!isPlainObject(value) || value['format'] !== ANNOTATIONS_RECORD_FORMAT) return null;
  const entry = readEntry(value);
  if (entry === null) return null;
  const previous = Array.isArray(value['previous'])
    ? value['previous'].flatMap((kept: unknown) => {
        const read = readEntry(kept);
        return read === null || read.owner === entry.owner ? [] : [read];
      })
    : [];
  return {
    format: ANNOTATIONS_RECORD_FORMAT,
    owner: entry.owner,
    count: entry.count,
    chunks: entry.chunks,
    file: entry.file,
    ...(previous.length > 0 ? { previous } : {}),
  };
}

/** The records `head` describes: the one it names first, then those it kept. @internal */
export function headEntries(head: AnnotationsHead): AnnotationsRecordEntry[] {
  return [head, ...(head.previous ?? [])];
}

/**
 * The file `entry` and the values stored for its chunks, in key order,
 * make; `null` when they do not agree with it. The annotations themselves
 * are left to `loadJSON` to check.
 *
 * @internal
 */
export function assembleAnnotationFile(
  entry: AnnotationsRecordEntry,
  chunks: readonly unknown[],
): AnnotationFile | null {
  if (chunks.length !== entry.chunks) return null;
  let count = 0;
  for (const chunk of chunks) {
    if (!Array.isArray(chunk) || chunk.length === 0) return null;
    count += chunk.length;
  }
  if (count !== entry.count) return null;
  const annotations = new Array<unknown>(count);
  let i = 0;
  for (const chunk of chunks as unknown[][]) {
    for (const annotation of chunk) annotations[i++] = annotation;
  }
  return { ...entry.file, annotations } as AnnotationFile;
}

// ── Chunks ────────────────────────────────────────────────────────────

/**
 * The annotations a chunk holds at most. Together with
 * {@link ANNOTATION_CHUNK_MAX_BYTES} it keeps a chunk far below Chromium's
 * cap on one value, 133,169,152 bytes: only annotations averaging over
 * 13 KB in parts the estimate does not see (a `Blob`'s contents) could fill
 * one, or an annotation of 127 MiB by itself.
 *
 * @internal
 */
export const ANNOTATION_CHUNK_MAX_COUNT = 10_000;

/**
 * The bytes a chunk holds at most, as {@link estimateAnnotationBytes}
 * counts them: two to a character, so about twice what Latin-1 text takes.
 * A chunk of plain annotations reaches the count first.
 *
 * @internal
 */
export const ANNOTATION_CHUNK_MAX_BYTES = 8 * 1024 * 1024;

/** Parts a value's estimate visits at most; past them, a cycle perhaps, it fills a chunk. */
const ESTIMATE_MAX_PARTS = 4096;
let partsLeft = 0;

function sizeOf(value: unknown): number {
  if (--partsLeft < 0) return 0;
  switch (typeof value) {
    case 'string':
      return 4 + 2 * value.length;
    case 'object': {
      if (value === null) return 1;
      if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return 16 + value.byteLength;
      let bytes = 8;
      if (Array.isArray(value)) {
        for (const item of value) bytes += sizeOf(item);
      } else if (value instanceof Map) {
        for (const [key, item] of value) bytes += sizeOf(key) + sizeOf(item);
      } else if (value instanceof Set) {
        for (const item of value) bytes += sizeOf(item);
      } else {
        for (const key in value) {
          bytes += 4 + 2 * key.length + sizeOf((value as Record<string, unknown>)[key]);
        }
      }
      return bytes;
    }
    default:
      return 9;
  }
}

/**
 * About the bytes a structured clone of `annotation` takes, or more: two to
 * a character, which a string past Latin-1 takes, and a few for each number
 * and container. A value of more than 4,096 parts — a cycle among them —
 * counts as a chunk's worth, so that it goes in a chunk of its own.
 *
 * @internal
 */
export function estimateAnnotationBytes(annotation: unknown): number {
  partsLeft = ESTIMATE_MAX_PARTS;
  const bytes = sizeOf(annotation);
  return partsLeft < 0 ? ANNOTATION_CHUNK_MAX_BYTES : bytes;
}

/**
 * Where the chunk of `annotations` that starts at `start` ends (exclusive):
 * after {@link ANNOTATION_CHUNK_MAX_COUNT} annotations, or before the one
 * that takes it past {@link ANNOTATION_CHUNK_MAX_BYTES}, but after one at
 * least.
 *
 * @internal
 */
export function annotationChunkEnd(annotations: readonly unknown[], start: number): number {
  const limit = Math.min(annotations.length, start + ANNOTATION_CHUNK_MAX_COUNT);
  let bytes = 0;
  let end = start;
  while (end < limit) {
    bytes += estimateAnnotationBytes(annotations[end]);
    if (bytes > ANNOTATION_CHUNK_MAX_BYTES && end > start) break;
    end++;
  }
  return end;
}
