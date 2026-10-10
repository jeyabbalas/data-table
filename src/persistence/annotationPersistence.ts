/**
 * How a table's annotations persist: in a record of their own, written only
 * when they change.
 *
 * A session save used to carry `AnnotationStore.toJSON()` inside the session
 * record, so a sort, a filter or a column width serialized and cloned every
 * annotation again, about a second at a million. `SessionStore` keeps them
 * in the `dt-annotations` database instead, under the session's table name,
 * and writes them only when the file a save hands it is not the one it last
 * wrote or read. Telling is cheap: {@link currentAnnotationFile} returns the
 * same file object until the store's content changes, and each file object
 * has a token ({@link annotationFileToken}).
 *
 * A table's annotations record is a head and chunks. The head, in the
 * `annotations` store under the table name, is `{ format, owner, count,
 * chunks, file }`, `file` being the annotation file without its annotations.
 * Those are in the `chunks` store, in slices of at most
 * {@link ANNOTATION_CHUNK_MAX_COUNT} annotations or about
 * {@link ANNOTATION_CHUNK_MAX_BYTES} ({@link annotationChunkEnd}), each under
 * `[tableName, owner, index]`: one key range holds a table's chunks, another
 * those of one write. Chromium refuses any one value over 133,169,152 bytes,
 * which a million annotations pass as a single file; a chunk stays far below
 * it, and a write clones a million annotations in a hundred short tasks
 * rather than one long one. A write deletes the table's chunks and puts the
 * new ones and the head in one transaction, so a reader finds the old record
 * or the new one, never part of either.
 *
 * The session record holds a marker in place of its annotations,
 * `__annotations: { format, count, owner }`. A load attaches the annotations
 * record only when the session record has a marker and the two agree, the
 * chunks with them. `owner` is a token made for
 * each write of the record ({@link newAnnotationsOwner}) and copied into the
 * marker of the session record written with it, rather than the table name,
 * which the key already is. The two records live in separate databases, so
 * a save writes them in separate transactions, and versions before the
 * annotations record write session records without a marker and never open
 * this database: one that clears the session leaves the annotations record
 * behind, and one that saves over the session drops the marker. The marker
 * alone keeps such a record from the session that replaced it, but not from
 * one written later by this version whose own annotations record never
 * landed (a quota error, a crash between the two commits): the record found
 * then is the one left behind, or another tab's. With a token per write, the
 * load sees it is not the record the session was saved with and reports it,
 * as `PERSISTENCE_ANNOTATIONS_DROPPED`, rather than restore annotations from
 * another session or another time.
 */

import type { AnnotationStore } from '../annotations/AnnotationStore';
import { ANNOTATION_FILE_VERSION } from '../annotations/types';
import type { AnnotationFile } from '../annotations/types';

// ── File tokens ───────────────────────────────────────────────────────

const fileTokens = new WeakMap<AnnotationFile, number>();
let lastFileToken = 0;

/**
 * A number for `file`, the object: the same at every call with it, and
 * different from every other file's, unless {@link shareAnnotationFileToken}
 * gave it another's. A store that last wrote a file with this token holds
 * those annotations already.
 *
 * Assumes a file is not changed once taken: `SessionStore` writes an
 * object it has written before only once.
 *
 * @internal
 */
export function annotationFileToken(file: AnnotationFile): number {
  let token = fileTokens.get(file);
  if (token === undefined) {
    token = ++lastFileToken;
    fileTokens.set(file, token);
  }
  return token;
}

/**
 * Give `file` the token another file has, `token`: for a file read back
 * from the record that one was written to, which holds the same annotations.
 *
 * @internal
 */
export function shareAnnotationFileToken(file: AnnotationFile, token: number): void {
  fileTokens.set(file, token);
}

// ── The current file of a store ───────────────────────────────────────

interface CurrentFile {
  /** The store's `contentRevision` when `file` was taken. */
  revision: number;
  /** The table name the store resolved then, which `file` carries. */
  tableName: string | null | undefined;
  file: AnnotationFile | null;
}

const currentFiles = new WeakMap<AnnotationStore, CurrentFile>();

/**
 * `store.toJSON()`, taken once for each revision of its content and table
 * name: repeated saves of an unchanged store get the same object, and with
 * it the same {@link annotationFileToken}. `null` when the store is empty.
 * A severity-filter change leaves it as it is, being no change of content.
 *
 * The file holds the store's live annotations, as `toJSON()` does, and is
 * shared by every caller until the store changes: read it, never change it.
 *
 * @internal
 */
export function currentAnnotationFile(store: AnnotationStore): AnnotationFile | null {
  const revision = store.contentRevision;
  const tableName = store.resolvedTableName();
  const cached = currentFiles.get(store);
  if (cached !== undefined && cached.revision === revision && cached.tableName === tableName) {
    return cached.file;
  }
  const file = store.count() > 0 ? store.toJSON() : null;
  currentFiles.set(store, { revision, tableName, file });
  return file;
}

/**
 * Let `file`, which `store` was just loaded from (`loadJSON` in replace
 * mode, nothing skipped), stand for the store's content: the store's current
 * file takes `file`'s token, so a session store that wrote or read `file`
 * does not write the same annotations again. A restore, and the put-back of
 * a load turned away for its source options, call it.
 *
 * The current file is taken from the store now, and `file` is not kept: the
 * store made annotations of its own from it, and holding both would double
 * the memory of a million annotations. Nothing is adopted when the store's
 * file would differ from `file` in more than its timestamps (another table
 * name, an older file version) or holds fewer annotations (a duplicate
 * skipped): the next save then writes the store's own.
 *
 * @internal
 */
export function adoptAnnotationFile(store: AnnotationStore, file: AnnotationFile): void {
  const current = currentAnnotationFile(store);
  if (current === null || current === file) return;
  if (file.version !== ANNOTATION_FILE_VERSION || file.tableName !== current.tableName) return;
  if (!Array.isArray(file.annotations)) return;
  if (file.annotations.length !== current.annotations.length) return;
  fileTokens.set(current, annotationFileToken(file));
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
 * annotations it was saved with.
 *
 * @internal
 */
export interface AnnotationsMarker {
  format: number;
  /** How many annotations the record holds. */
  count: number;
  /** The `owner` of the annotations record written with the session record. */
  owner: string;
}

/**
 * The head of a table's annotations record in `dt-annotations`, keyed by the
 * table name: its file without the annotations, which are in `chunks`
 * chunks, keyed `[tableName, owner, 0]` to `[tableName, owner, chunks - 1]`.
 *
 * @internal
 */
export interface AnnotationsHead {
  format: number;
  owner: string;
  count: number;
  chunks: number;
  file: Omit<AnnotationFile, 'annotations'>;
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

/**
 * Whether `value`, a session record's `__annotations`, is a marker this
 * version reads.
 *
 * @internal
 */
export function isAnnotationsMarker(value: unknown): value is AnnotationsMarker {
  return (
    isPlainObject(value) &&
    value['format'] === ANNOTATIONS_RECORD_FORMAT &&
    isCount(value['count']) &&
    typeof value['owner'] === 'string' &&
    value['owner'].length > 0
  );
}

/**
 * The head of `value`, the stored head of the annotations record of a
 * session whose marker is `marker`, when it is the head written with that
 * session record; otherwise why not.
 *
 * @internal
 */
export function checkAnnotationsHead(
  marker: AnnotationsMarker,
  value: unknown,
):
  | { ok: true; head: AnnotationsHead }
  | { ok: false; reason: Exclude<AnnotationsDropReason, 'unavailable'> } {
  if (value === undefined || value === null) return { ok: false, reason: 'missing' };
  if (!isPlainObject(value) || value['format'] !== ANNOTATIONS_RECORD_FORMAT) {
    return { ok: false, reason: 'invalid' };
  }
  const { owner, count, chunks, file } = value;
  if (typeof owner !== 'string' || !isCount(count) || !isCount(chunks)) {
    return { ok: false, reason: 'invalid' };
  }
  if (owner !== marker.owner) return { ok: false, reason: 'mismatch' };
  if (
    count !== marker.count ||
    // Every chunk holds an annotation at least.
    chunks > count ||
    (count > 0 && chunks === 0) ||
    !isPlainObject(file) ||
    typeof file['version'] !== 'number'
  ) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, head: value as unknown as AnnotationsHead };
}

/**
 * The file `head` and the values stored for its chunks, in key order, make;
 * `null` when they do not agree with it. The annotations themselves are left
 * to `loadJSON` to check.
 *
 * @internal
 */
export function assembleAnnotationFile(
  head: AnnotationsHead,
  chunks: readonly unknown[],
): AnnotationFile | null {
  if (chunks.length !== head.chunks) return null;
  let count = 0;
  for (const chunk of chunks) {
    if (!Array.isArray(chunk) || chunk.length === 0) return null;
    count += chunk.length;
  }
  if (count !== head.count) return null;
  const annotations = new Array<unknown>(count);
  let i = 0;
  for (const chunk of chunks as unknown[][]) {
    for (const annotation of chunk) annotations[i++] = annotation;
  }
  return { ...head.file, annotations } as AnnotationFile;
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
