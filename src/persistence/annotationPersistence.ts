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
 * The session record holds a marker in place of its annotations,
 * `__annotations: { format, count, owner }`, and the annotations record is
 * `{ format, owner, count, file }`. A load attaches the record only when the
 * session record has a marker and the two agree. `owner` is a token made for
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
 * The value of a table's annotations record in `dt-annotations`, keyed by
 * the table name.
 *
 * @internal
 */
export interface AnnotationsRecord {
  format: number;
  owner: string;
  count: number;
  file: AnnotationFile;
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
 * The annotations file of `value`, the stored annotations record of a
 * session whose marker is `marker`, when the record is the one written with
 * that session record; otherwise why not. The file's annotations are left
 * to `loadJSON` to check.
 *
 * @internal
 */
export function checkAnnotationsRecord(
  marker: AnnotationsMarker,
  value: unknown,
):
  | { ok: true; file: AnnotationFile }
  | { ok: false; reason: Exclude<AnnotationsDropReason, 'unavailable'> } {
  if (value === undefined || value === null) return { ok: false, reason: 'missing' };
  if (!isPlainObject(value) || value['format'] !== ANNOTATIONS_RECORD_FORMAT) {
    return { ok: false, reason: 'invalid' };
  }
  const owner = value['owner'];
  if (typeof owner !== 'string' || !isCount(value['count']))
    return { ok: false, reason: 'invalid' };
  if (owner !== marker.owner) return { ok: false, reason: 'mismatch' };
  const file = value['file'];
  if (
    value['count'] !== marker.count ||
    !isPlainObject(file) ||
    typeof file['version'] !== 'number' ||
    !Array.isArray(file['annotations']) ||
    file['annotations'].length !== marker.count
  ) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, file: file as unknown as AnnotationFile };
}
