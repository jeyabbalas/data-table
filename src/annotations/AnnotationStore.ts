/**
 * AnnotationStore — in-memory row / column / cell annotation overlay.
 *
 * Exposed on the {@link DataTable} facade as `table.annotations`. Annotations
 * are app-authored metadata (validation errors, QC rule violations, notes),
 * NOT user-authored mutations — so they live outside `TableState` and do not
 * participate in undo/redo. Persistence flows through the existing
 * `SessionSnapshot` pipeline (v5+).
 *
 * Row and cell annotations key on `rowId` (a `number`, converted from the
 * `bigint` `__rowid__` column the loaders synthesize at load time). Every
 * index is updated with the mutation that changes it, so lookups cost what
 * they return rather than a pass over the store; see {@link AnnotationStore}
 * for each method's cost.
 *
 * @example
 * table.annotations.add({
 *   scope: 'cell',
 *   rowId: 42,
 *   column: 'age',
 *   severity: 'error',
 *   message: 'Value exceeds maximum allowed 150',
 * });
 *
 * const atCell = table.annotations.getByCell(42, 'age');
 * // row 42's row annotations + age's column annotations + the (42, age) cell's,
 * // sorted by severity, then createdAt, then insertion order.
 */

import { AnnotationError } from '../core/errors';
import type { Signal } from '../core/Signal';
import { generateAnnotationId } from './AnnotationId';
import { SEVERITY_BIT, severityMaskOf } from './severity';
import type { ScopeSummary } from './severity';
import { ANNOTATION_FILE_VERSION } from './types';
import type {
  Annotation,
  AnnotationBase,
  AnnotationChangeHandler,
  AnnotationChangePayload,
  AnnotationFile,
  AnnotationScope,
  AnnotationSeverity,
  NewAnnotation,
  RowAnnotation,
  ColumnAnnotation,
  CellAnnotation,
  SeverityFilter,
} from './types';

/**
 * Construction options for {@link AnnotationStore}. All fields are optional;
 * the facade passes `tableName` as a reactive `Signal` so the store's
 * `toJSON` output tracks loader-assigned table renames.
 */
export interface AnnotationStoreOptions {
  /**
   * Table name the store's `toJSON()` output tags with. When a Signal is
   * passed (the facade passes `state.baseTableName`), the value is read at
   * `toJSON` time so it tracks loader-assigned names. A plain string or
   * `null` is captured once at construction. Omitted → `toJSON` omits the
   * field.
   */
  tableName?: Signal<string | null> | string | null;
  /** Injected id generator (for deterministic tests). */
  idGenerator?: () => string;
  /** Injected ISO timestamp factory (for deterministic tests). */
  now?: () => string;
}

type AnnotationEvent = 'change';

const RESERVED_ANNOTATION_KEYS: ReadonlySet<string> = new Set([
  'id',
  'scope',
  'severity',
  'message',
  'code',
  'source',
  'metadata',
  'createdAt',
  'updatedAt',
  'rowId',
  'column',
]);

const RESERVED_FILE_KEYS: ReadonlySet<string> = new Set([
  'version',
  'tableName',
  'createdAt',
  'updatedAt',
  'annotations',
]);

function isSeverity(v: unknown): v is AnnotationSeverity {
  return v === 'error' || v === 'warning' || v === 'info';
}

function isScope(v: unknown): v is AnnotationScope {
  return v === 'row' || v === 'column' || v === 'cell';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extractExtras(
  source: Record<string, unknown>,
  reserved: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  let extras: Record<string, unknown> | undefined;
  for (const key of Object.keys(source)) {
    if (reserved.has(key)) continue;
    if (!extras) extras = {};
    extras[key] = source[key];
  }
  return extras;
}

/** Options bag for {@link AnnotationStore.loadJSON}. */
export interface LoadJSONOptions {
  mode?: 'replace' | 'merge';
  /**
   * When `true`, reject the load if `file.tableName` and the store's resolved
   * table name are both non-null and unequal. Throws
   * `ANNOTATION_TABLENAME_MISMATCH`. A warning is logged regardless.
   */
  validateTableName?: boolean;
  /**
   * An id the file repeats: `'throw'` (the default) rejects the file with
   * `ANNOTATION_DUPLICATE_ID`; `'skip'` keeps its first occurrence and counts
   * the others in the result's `skipped`. Session restore passes `'skip'`, so
   * a session that version 0.9 or earlier saved with a repeated id restores.
   *
   * @internal
   */
  duplicates?: 'throw' | 'skip';
}

function normalizeLoadOptions(modeOrOptions: 'replace' | 'merge' | LoadJSONOptions): {
  mode: 'replace' | 'merge';
  validateTableName: boolean;
  skipDuplicates: boolean;
} {
  if (typeof modeOrOptions === 'string') {
    return { mode: modeOrOptions, validateTableName: false, skipDuplicates: false };
  }
  return {
    mode: modeOrOptions.mode ?? 'replace',
    validateTableName: modeOrOptions.validateTableName === true,
    skipDuplicates: modeOrOptions.duplicates === 'skip',
  };
}

/**
 * One stored annotation. `ann` is the object `get()` returns; `update`
 * replaces it here, so an entry never moves in an index or in insertion
 * order.
 */
class Entry {
  ann: Annotation;
  /** Insertion sequence: unique and increasing, the insertion-order tiebreak. */
  readonly seq: number;
  /** `SEVERITY_BIT` of `ann.severity`. */
  sev: number;
  /** Unknown fields of the object it was added or loaded from, for `toJSON`. */
  readonly extras: Record<string, unknown> | undefined;

  constructor(
    ann: Annotation,
    seq: number,
    sev: number,
    extras: Record<string, unknown> | undefined,
  ) {
    this.ann = ann;
    this.seq = seq;
    this.sev = sev;
    this.extras = extras;
  }
}

/**
 * The entries of one scope at one key, when there are two or more; a single
 * entry is stored bare. Counts each severity, so a bucket's severity mask
 * costs three comparisons.
 */
class MultiBucket {
  readonly entries = new Set<Entry>();
  errors = 0;
  warnings = 0;
  infos = 0;

  constructor(first: Entry, second: Entry) {
    this.add(first);
    this.add(second);
  }

  add(entry: Entry): void {
    this.entries.add(entry);
    this.countSeverity(entry.sev, 1);
  }

  delete(entry: Entry): void {
    if (this.entries.delete(entry)) this.countSeverity(entry.sev, -1);
  }

  countSeverity(bit: number, delta: number): void {
    if (bit === SEVERITY_BIT.error) this.errors += delta;
    else if (bit === SEVERITY_BIT.warning) this.warnings += delta;
    else this.infos += delta;
  }

  mask(): number {
    return (
      (this.errors > 0 ? SEVERITY_BIT.error : 0) |
      (this.warnings > 0 ? SEVERITY_BIT.warning : 0) |
      (this.infos > 0 ? SEVERITY_BIT.info : 0)
    );
  }
}

type Bucket = Entry | MultiBucket;

function bucketAdd<K>(map: Map<K, Bucket>, key: K, entry: Entry): void {
  const bucket = map.get(key);
  if (bucket === undefined) map.set(key, entry);
  else if (bucket instanceof MultiBucket) bucket.add(entry);
  else map.set(key, new MultiBucket(bucket, entry));
}

function bucketRemove<K>(map: Map<K, Bucket>, key: K, entry: Entry): void {
  const bucket = map.get(key);
  if (bucket === entry) {
    map.delete(key);
  } else if (bucket instanceof MultiBucket) {
    bucket.delete(entry);
    // Back to a bare entry at one.
    if (bucket.entries.size === 1) map.set(key, bucket.entries.values().next().value!);
  }
}

function bucketSize(bucket: Bucket | undefined): number {
  if (bucket === undefined) return 0;
  return bucket instanceof MultiBucket ? bucket.entries.size : 1;
}

function bucketMask(bucket: Bucket | undefined): number {
  if (bucket === undefined) return 0;
  return bucket instanceof MultiBucket ? bucket.mask() : bucket.sev;
}

function pushBucket(out: Entry[], bucket: Bucket | undefined): void {
  if (bucket === undefined) return;
  if (bucket instanceof MultiBucket) {
    for (const entry of bucket.entries) out.push(entry);
  } else {
    out.push(bucket);
  }
}

/**
 * The cell-scope entries of one row, in the by-row index: a bare entry, or
 * an array of two or more in no particular order. Nothing reads its
 * severities in O(1), so it keeps no counts, and an array is a fraction of a
 * `MultiBucket`'s size.
 */
type RowCells = Entry | Entry[];

function rowCellsAdd(map: Map<number, RowCells>, rowId: number, entry: Entry): void {
  const cells = map.get(rowId);
  if (cells === undefined) map.set(rowId, entry);
  else if (Array.isArray(cells)) cells.push(entry);
  else map.set(rowId, [cells, entry]);
}

function rowCellsRemove(map: Map<number, RowCells>, rowId: number, entry: Entry): void {
  const cells = map.get(rowId);
  if (cells === entry) {
    map.delete(rowId);
  } else if (Array.isArray(cells)) {
    const i = cells.indexOf(entry);
    if (i < 0) return;
    cells[i] = cells[cells.length - 1]!;
    cells.pop();
    if (cells.length === 1) map.set(rowId, cells[0]!);
  }
}

function pushRowCells(out: Entry[], cells: RowCells | undefined): void {
  if (cells === undefined) return;
  if (Array.isArray(cells)) {
    for (const entry of cells) out.push(entry);
  } else {
    out.push(cells);
  }
}

function rowCellsMask(cells: RowCells): number {
  if (!Array.isArray(cells)) return cells.sev;
  let mask = 0;
  for (const entry of cells) mask |= entry.sev;
  return mask;
}

function bySeq(a: Entry, b: Entry): number {
  return a.seq - b.seq;
}

/**
 * Severity (error first), then `createdAt` ascending with a missing one last,
 * then insertion order. `SEVERITY_BIT` rises as the severity falls.
 */
function bySeverityThenAge(a: Entry, b: Entry): number {
  if (a.sev !== b.sev) return a.sev - b.sev;
  const aTime = a.ann.createdAt;
  const bTime = b.ann.createdAt;
  if (aTime !== bTime) {
    if (aTime === undefined) return 1;
    if (bTime === undefined) return -1;
    if (aTime < bTime) return -1;
    if (aTime > bTime) return 1;
  }
  return a.seq - b.seq;
}

function annotationsOf(entries: Entry[], compare: (a: Entry, b: Entry) => number): Annotation[] {
  if (entries.length > 1) entries.sort(compare);
  return entries.map((entry) => entry.ann);
}

function idsOf(entries: Iterable<Entry>): string[] {
  return Array.from(entries, (entry) => entry.ann.id);
}

function highestShown(mask: number): AnnotationSeverity | null {
  if (mask & SEVERITY_BIT.error) return 'error';
  if (mask & SEVERITY_BIT.warning) return 'warning';
  if (mask & SEVERITY_BIT.info) return 'info';
  return null;
}

/**
 * In-memory store + index for row / column / cell annotations. Exposed on the
 * facade as `table.annotations`. Provides CRUD, lookups (`getByRow` /
 * `getByColumn` / `getByCell`), severity-tier filtering, JSON I/O
 * (`toJSON` / `loadJSON`), and a `change` event channel. Annotations live
 * outside `TableState` (no undo/redo) and persist independently into
 * `SessionSnapshot.annotations` (v5+).
 *
 * Lookups:
 * - `getByRow(rowId)`: that row's row- and cell-scope annotations, in
 *   insertion order.
 * - `getByColumn(column)`: that column's column- and cell-scope annotations,
 *   in insertion order.
 * - `getByCell(rowId, column)`: the row-scope annotations at `rowId`, the
 *   column-scope annotations at `column`, and the cell-scope annotations at
 *   exactly `(rowId, column)`, sorted by severity (error first), then
 *   `createdAt` ascending (a missing one last), then insertion order.
 * - `getAll()`: everything, in insertion order.
 *
 * Costs, for a store of N annotations and a result of k: `get`, `update`,
 * `remove` and `count` are O(1); `removeMany` is O(k); `getByCell`,
 * `getByRow` and `getByColumn` are O(k log k), never a pass over the store
 * (the first `getByRow` call that meets cell annotations builds a by-row
 * index of them, O(cells), kept up to date afterwards); `add` is O(1) and
 * `addMany` O(k); `getAll`, `toJSON`, `loadJSON` and `clear('all')` are
 * O(N); `clear(scope)` is O(k) for the k annotations it removes.
 *
 * Limits and contracts:
 * - Each annotation is one entry in a `Map`, and V8 caps a `Map` at 2²⁴
 *   (~16.7M) entries: past that, `add` / `addMany` / `loadJSON` throw a
 *   `RangeError` and leave the store as it was.
 * - Any finite `rowId` is accepted, but the grid renders only the
 *   non-negative integers its `__rowid__` column holds.
 * - `get`, the lookups and the change payloads return the stored objects
 *   themselves, unfrozen. Mutating one directly is unsupported: the indexes
 *   do not see it. Use `update`.
 */
export class AnnotationStore {
  /** Every entry by id. Its Map order is the insertion order. */
  private byId = new Map<string, Entry>();
  /** Row-scope entries by rowId. */
  private rowScoped = new Map<number, Bucket>();
  /** Column-scope entries by column. */
  private colScoped = new Map<string, Bucket>();
  /** Cell-scope entries by column, then rowId. */
  private cells = new Map<string, Map<number, Bucket>>();
  /** Cell-scope entries by rowId; built by the first `getByRow` that needs it. */
  private cellsByRow: Map<number, RowCells> | null = null;
  private rowCount = 0;
  private columnCount = 0;
  private cellCount = 0;
  /** The next entry's `seq`. */
  private nextSeq = 0;
  private rev = 0;
  private contentRev = 0;
  /** `annotatedRows()`'s result, until a change to row or cell scope. */
  private annotatedCache: { rowIds: Float64Array; masks: Uint8Array } | null = null;
  private extraFileFields: Record<string, unknown> | undefined;
  private fileCreatedAt: string | undefined;

  private readonly listeners = new Set<AnnotationChangeHandler>();
  private readonly nameSource: Signal<string | null> | string | null | undefined;
  private readonly idGenerator: () => string;
  private readonly now: () => string;
  private destroyed = false;

  // Visual-only — annotations themselves are never affected by these flags;
  // see `setSeverityFilter` below and the `'filterChanged'` change kind.
  private readonly severityFilter: SeverityFilter = {
    error: true,
    warning: true,
    info: true,
  };
  /** `severityFilter` as a mask of `SEVERITY_BIT`s. */
  private severityMask = severityMaskOf(this.severityFilter);

  constructor(options: AnnotationStoreOptions = {}) {
    this.nameSource = options.tableName;
    this.idGenerator = options.idGenerator ?? generateAnnotationId;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  // =========================================
  // Revisions
  // =========================================

  /**
   * Increases by one on every change to the store's contents and on every
   * `setSeverityFilter` call that changes a flag: whenever what a renderer
   * shows could change.
   *
   * @internal
   */
  get revision(): number {
    return this.rev;
  }

  /**
   * Increases by one whenever what `toJSON()` returns could change: every
   * change to the annotations, `loadJSON`, and `clear('all')` (which also
   * resets the file-level fields). Never on a severity-filter change. The
   * table name and the `updatedAt` stamp `toJSON` reads at call time are not
   * tracked.
   *
   * @internal
   */
  get contentRevision(): number {
    return this.contentRev;
  }

  /**
   * The table name `toJSON()` tags its file with, resolved now. A cache of
   * that file keys on it as well as on {@link contentRevision}, which does
   * not track it.
   *
   * @internal
   */
  resolvedTableName(): string | null | undefined {
    return this.resolveTableName();
  }

  // =========================================
  // CRUD
  // =========================================

  /** Add a single annotation. Generates `id` and `createdAt` if missing. */
  add(ann: NewAnnotation): Annotation {
    if (!isPlainObject(ann)) {
      throw new AnnotationError('Annotation must be an object', {
        code: 'ANNOTATION_INVALID_SHAPE',
      });
    }
    return this.insertNew([ann], false)[0]!;
  }

  /**
   * Add many annotations atomically: all of them, or none. Every entry is
   * validated first, so a malformed one throws `ANNOTATION_INVALID_SHAPE`
   * (`details.index` is its position) before the store changes. An id that
   * is already in the store, or that the batch repeats, throws
   * `ANNOTATION_DUPLICATE_ID` (`details: { id, index }`) with the store as
   * it was. On success, emits a single `change` event with all added ids.
   *
   * Entries without `createdAt` share one timestamp, taken once per call.
   */
  addMany(anns: NewAnnotation[]): Annotation[] {
    return this.insertNew(Array.isArray(anns) ? anns : Array.from(anns), true);
  }

  /** Lookup by id. Returns `null` when not present. */
  get(id: string): Annotation | null {
    return this.byId.get(id)?.ann ?? null;
  }

  /** All annotations in insertion order. */
  getAll(): Annotation[] {
    return Array.from(this.byId.values(), (entry) => entry.ann);
  }

  /**
   * Apply a partial update. Rejects any patch that would change `id`,
   * `scope`, `rowId`, or `column` — those are immutable after creation.
   * Sets `updatedAt` to `now()` on every successful update. A `severity` or
   * `message` given as `undefined` is ignored.
   *
   * Returns a new object, which `get(id)` returns from then on; the
   * annotation keeps its place in insertion order.
   */
  update(id: string, patch: Partial<AnnotationBase>): Annotation {
    const entry = this.byId.get(id);
    if (!entry) {
      throw new AnnotationError(`Annotation ${id} not found`, {
        code: 'ANNOTATION_NOT_FOUND',
        details: { id },
      });
    }
    const existing = entry.ann;
    if ('id' in patch && patch.id !== undefined && patch.id !== existing.id) {
      throw new AnnotationError('Annotation id is immutable', {
        code: 'ANNOTATION_ID_IMMUTABLE',
        details: { id },
      });
    }
    const patchAny = patch as Record<string, unknown>;
    if ('scope' in patchAny && patchAny['scope'] !== existing.scope) {
      throw new AnnotationError('Annotation scope is immutable', {
        code: 'ANNOTATION_SCOPE_IMMUTABLE',
        details: { id },
      });
    }
    if ('rowId' in patchAny) {
      const currentRowId = (existing as RowAnnotation | CellAnnotation).rowId;
      if (currentRowId === undefined || patchAny['rowId'] !== currentRowId) {
        throw new AnnotationError('Annotation rowId is immutable', {
          code: 'ANNOTATION_ROWID_IMMUTABLE',
          details: { id },
        });
      }
    }
    if ('column' in patchAny) {
      const currentColumn = (existing as ColumnAnnotation | CellAnnotation).column;
      if (currentColumn === undefined || patchAny['column'] !== currentColumn) {
        throw new AnnotationError('Annotation column is immutable', {
          code: 'ANNOTATION_COLUMN_IMMUTABLE',
          details: { id },
        });
      }
    }
    if (patch.severity !== undefined && !isSeverity(patch.severity)) {
      throw new AnnotationError(`Invalid severity: ${String(patch.severity)}`, {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { id, field: 'severity' },
      });
    }
    if (
      patch.message !== undefined &&
      (typeof patch.message !== 'string' || patch.message.length === 0)
    ) {
      throw new AnnotationError('Annotation message must be a non-empty string', {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { id, field: 'message' },
      });
    }

    // A `severity` or `message` given as `undefined` is absent: the spread
    // below would otherwise delete the annotation's own. Deep-clone any
    // metadata patch so post-update mutation of the caller's object cannot
    // reach into the stored entry. The structuredClone is part of the
    // browser baseline (checkBrowserSupport.ts).
    const dropSeverity = 'severity' in patchAny && patchAny['severity'] === undefined;
    const dropMessage = 'message' in patchAny && patchAny['message'] === undefined;
    const cloneMetadata = 'metadata' in patchAny && isPlainObject(patchAny['metadata']);
    let effective: Record<string, unknown> = patchAny;
    if (dropSeverity || dropMessage || cloneMetadata) {
      effective = { ...patchAny };
      if (dropSeverity) delete effective['severity'];
      if (dropMessage) delete effective['message'];
      if (cloneMetadata) effective['metadata'] = structuredClone(patchAny['metadata']);
    }

    const merged: Annotation = {
      ...existing,
      ...effective,
      id: existing.id,
      scope: existing.scope,
      updatedAt: this.now(),
    } as Annotation;
    const sev = SEVERITY_BIT[merged.severity];
    if (sev !== entry.sev) this.moveSeverity(entry, sev);
    entry.ann = merged;
    this.touch();
    if (this.isObserved()) {
      this.emit({ kind: 'updated', ids: [id], annotations: [merged], previous: [existing] });
    }
    return merged;
  }

  /** Remove by id. Returns `true` if something was removed. */
  remove(id: string): boolean {
    const entry = this.byId.get(id);
    if (!entry) return false;
    this.byId.delete(id);
    this.unindexEntry(entry);
    this.touch();
    if (this.isObserved()) {
      this.emit({ kind: 'removed', ids: [entry.ann.id], annotations: [entry.ann] });
    }
    return true;
  }

  /**
   * Remove many ids in a batch. Unknown ids are silently skipped.
   * Returns the count of ids actually removed. Emits a single `change`
   * event when at least one was removed.
   */
  removeMany(ids: string[]): number {
    const removed: Entry[] | null = this.isObserved() ? [] : null;
    let count = 0;
    for (const id of ids) {
      const entry = this.byId.get(id);
      if (!entry) continue;
      this.byId.delete(id);
      this.unindexEntry(entry);
      count++;
      removed?.push(entry);
    }
    if (count === 0) return 0;
    this.touch();
    if (removed) {
      this.emit({ kind: 'removed', ids: idsOf(removed), annotations: removed.map((e) => e.ann) });
    }
    return count;
  }

  /**
   * Clear by scope (default `'all'`). Emits a single `change` event with
   * `kind: 'cleared'` and the removed ids, in insertion order, when it
   * removed any. `'all'` also forgets the file-level fields an earlier
   * `loadJSON` kept. Returns the number of annotations removed.
   */
  clear(scope: AnnotationScope | 'all' = 'all'): number {
    if (scope === 'all') return this.clearAll();
    if (!isScope(scope)) return 0;
    const count = this.scopeCount(scope);
    if (count === 0) return 0;
    const collect = this.isObserved();
    // Walk the scope's own index when it holds at most half the store;
    // otherwise one pass over `byId` keeps the rest.
    const removed =
      count * 2 <= this.byId.size
        ? this.clearScopeByIndex(scope, collect)
        : this.clearScopeByPass(scope, collect);
    this.touch();
    if (removed) {
      this.emit({ kind: 'cleared', ids: idsOf(removed), annotations: removed.map((e) => e.ann) });
    }
    return count;
  }

  /** Number of annotations currently in the store. */
  count(): number {
    return this.byId.size;
  }

  // =========================================
  // Lookups
  // =========================================

  /**
   * Annotations on row `rowId`: its row-scope annotations and its cells'
   * cell-scope annotations, in insertion order.
   */
  getByRow(rowId: number): Annotation[] {
    const out: Entry[] = [];
    pushBucket(out, this.rowScoped.get(rowId));
    if (this.cellCount > 0) pushRowCells(out, this.cellsByRowIndex().get(rowId));
    return annotationsOf(out, bySeq);
  }

  /**
   * Annotations on column `column`: its column-scope annotations and its
   * cells' cell-scope annotations, in insertion order.
   */
  getByColumn(column: string): Annotation[] {
    const out: Entry[] = [];
    pushBucket(out, this.colScoped.get(column));
    const inner = this.cells.get(column);
    if (inner) {
      for (const bucket of inner.values()) pushBucket(out, bucket);
    }
    return annotationsOf(out, bySeq);
  }

  /**
   * The annotations that apply to the cell `(rowId, column)`: row-scope
   * annotations at `rowId`, column-scope annotations at `column`, and
   * cell-scope annotations at exactly `(rowId, column)`. Sorted by severity
   * (error > warning > info), then by `createdAt` ascending (missing sorts
   * last), then by insertion order.
   */
  getByCell(rowId: number, column: string): Annotation[] {
    const out: Entry[] = [];
    pushBucket(out, this.rowScoped.get(rowId));
    pushBucket(out, this.colScoped.get(column));
    pushBucket(out, this.cells.get(column)?.get(rowId));
    return annotationsOf(out, bySeverityThenAge);
  }

  // =========================================
  // Per-scope reads for renderers and navigation
  // =========================================

  /**
   * Writes into `out` and returns it: how many row-scope annotations row
   * `rowId` has, whatever the severity filter shows, and the highest
   * severity among them that the filter shows. O(1), allocates nothing.
   *
   * @internal
   */
  summarizeRowScope(rowId: number, out: ScopeSummary): ScopeSummary {
    return this.summarize(this.rowScoped.get(rowId), out);
  }

  /**
   * As {@link AnnotationStore.summarizeRowScope}, for the column-scope
   * annotations of `column`.
   *
   * @internal
   */
  summarizeColumnScope(column: string, out: ScopeSummary): ScopeSummary {
    return this.summarize(this.colScoped.get(column), out);
  }

  /**
   * As {@link AnnotationStore.summarizeRowScope}, for the cell-scope
   * annotations at exactly `(rowId, column)`.
   *
   * @internal
   */
  summarizeCellScope(rowId: number, column: string, out: ScopeSummary): ScopeSummary {
    const inner = this.cells.get(column);
    return this.summarize(inner === undefined ? undefined : inner.get(rowId), out);
  }

  /**
   * Row `rowId`'s row-scope annotations, sorted as `getByCell` sorts, whatever
   * the severity filter shows.
   *
   * @internal
   */
  listRowScope(rowId: number): Annotation[] {
    const out: Entry[] = [];
    pushBucket(out, this.rowScoped.get(rowId));
    return annotationsOf(out, bySeverityThenAge);
  }

  /**
   * The column-scope annotations of `column`, sorted as `getByCell` sorts,
   * whatever the severity filter shows.
   *
   * @internal
   */
  listColumnScope(column: string): Annotation[] {
    const out: Entry[] = [];
    pushBucket(out, this.colScoped.get(column));
    return annotationsOf(out, bySeverityThenAge);
  }

  /**
   * The cell-scope annotations at exactly `(rowId, column)`, sorted as
   * `getByCell` sorts, whatever the severity filter shows.
   *
   * @internal
   */
  listCellScope(rowId: number, column: string): Annotation[] {
    const out: Entry[] = [];
    pushBucket(out, this.cells.get(column)?.get(rowId));
    return annotationsOf(out, bySeverityThenAge);
  }

  /**
   * The `SEVERITY_BIT`s of row `rowId`'s row-scope annotations, ORed,
   * whatever the severity filter shows; 0 for none. O(1).
   *
   * @internal
   */
  rowScopeMask(rowId: number): number {
    return bucketMask(this.rowScoped.get(rowId));
  }

  /**
   * The `SEVERITY_BIT`s of the column-scope annotations of `column`, ORed,
   * whatever the severity filter shows; 0 for none. O(1).
   *
   * @internal
   */
  columnScopeMask(column: string): number {
    return bucketMask(this.colScoped.get(column));
  }

  /**
   * The `SEVERITY_BIT`s of the cell-scope annotations at exactly
   * `(rowId, column)`, ORed, whatever the severity filter shows; 0 for none.
   * O(1).
   *
   * @internal
   */
  cellScopeMask(rowId: number, column: string): number {
    const inner = this.cells.get(column);
    return inner === undefined ? 0 : bucketMask(inner.get(rowId));
  }

  /**
   * Every distinct rowId holding a row- or cell-scope annotation (any finite
   * rowId), ascending, with `masks[i]` the `SEVERITY_BIT`s of all of them on
   * `rowIds[i]`, ORed, whatever the severity filter shows.
   *
   * Built on the first call after a change to row or cell scope, O(R log R +
   * cells) for R rows, so at most once per `contentRevision`; the same object
   * is returned until then. Callers must not mutate the arrays.
   *
   * @internal
   */
  annotatedRows(): { rowIds: Float64Array; masks: Uint8Array } {
    if (this.annotatedCache) return this.annotatedCache;
    const byRow = new Map<number, number>();
    const merge = (bucket: Bucket, rowId: number): void => {
      byRow.set(rowId, (byRow.get(rowId) ?? 0) | bucketMask(bucket));
    };
    this.rowScoped.forEach(merge);
    if (this.cellsByRow) {
      this.cellsByRow.forEach((cells, rowId) => {
        byRow.set(rowId, (byRow.get(rowId) ?? 0) | rowCellsMask(cells));
      });
    } else {
      for (const inner of this.cells.values()) inner.forEach(merge);
    }
    const rowIds = new Float64Array(byRow.size);
    let i = 0;
    for (const rowId of byRow.keys()) rowIds[i++] = rowId;
    rowIds.sort();
    const masks = new Uint8Array(rowIds.length);
    for (i = 0; i < rowIds.length; i++) masks[i] = byRow.get(rowIds[i]!)!;
    this.annotatedCache = { rowIds, masks };
    return this.annotatedCache;
  }

  /**
   * Row `rowId`'s mask in {@link AnnotationStore.annotatedRows}, or 0 when it
   * holds no row- or cell-scope annotation. O(log R) once that is built.
   *
   * @internal
   */
  annotatedRowMask(rowId: number): number {
    const { rowIds, masks } = this.annotatedRows();
    let lo = 0;
    let hi = rowIds.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const value = rowIds[mid]!;
      if (value < rowId) lo = mid + 1;
      else if (value === rowId) return masks[mid]!;
      else hi = mid - 1;
    }
    return 0;
  }

  // =========================================
  // Severity filter (visual-only)
  // =========================================

  /**
   * Toggle one or more severities on or off for visual rendering.
   *
   * Contract: the store **always retains every annotation** regardless of
   * filter state. The flags only affect the cell / row / column-header tints
   * via `getSeverityFilter()` consulted by the renderer
   * (`TableBody.applyCellAnnotationClasses`, etc.). Lookup methods
   * (`getByRow`, `getByColumn`, `getByCell`, `getAll`) are **not** filtered —
   * downstream code that wants the visible subset should consult
   * `getSeverityFilter()` directly.
   *
   * When at least one flag actually changes, emits a single `change` event
   * with `kind: 'filterChanged'` and an empty `ids` array so renderers
   * reapply. The flag state is also captured in `SessionSnapshot.annotationSeverityFilter`
   * so toggles survive a page reload.
   */
  setSeverityFilter(patch: Partial<SeverityFilter>): void {
    let changed = false;
    for (const sev of ['error', 'warning', 'info'] as const) {
      const next = patch[sev];
      if (typeof next === 'boolean' && this.severityFilter[sev] !== next) {
        this.severityFilter[sev] = next;
        changed = true;
      }
    }
    if (!changed) return;
    this.severityMask = severityMaskOf(this.severityFilter);
    this.rev++;
    this.emit({ kind: 'filterChanged', ids: [] });
  }

  /** Snapshot of the current severity-filter flags. Returns a fresh copy. */
  getSeverityFilter(): SeverityFilter {
    return { ...this.severityFilter };
  }

  // =========================================
  // JSON I/O
  // =========================================

  /**
   * Serialize the store to a JSON-safe {@link AnnotationFile}. Unknown
   * top-level keys and unknown per-annotation keys captured by an earlier
   * `loadJSON` call are reattached verbatim.
   */
  toJSON(): AnnotationFile {
    const tableName = this.resolveTableName();
    const annotations = new Array<Annotation>(this.byId.size);
    let i = 0;
    for (const entry of this.byId.values()) {
      annotations[i++] = entry.extras
        ? ({ ...entry.extras, ...entry.ann } as Annotation)
        : entry.ann;
    }
    const nowIso = this.now();
    const file: AnnotationFile = {
      ...(this.extraFileFields ?? {}),
      version: ANNOTATION_FILE_VERSION,
      ...(tableName !== null && tableName !== undefined ? { tableName } : {}),
      createdAt: this.fileCreatedAt ?? nowIso,
      updatedAt: nowIso,
      annotations,
    };
    return file;
  }

  /**
   * Load annotations from an {@link AnnotationFile}. Every entry is validated
   * before the store changes, so a rejected file leaves it as it was.
   *
   * - `'replace'` (default) wipes existing annotations, preserving ids from
   *   the file. Emits `cleared` for what the store held (when it held
   *   anything), then `added` for what the file holds (when it holds
   *   anything).
   * - `'merge'` retains existing annotations; throws `ANNOTATION_DUPLICATE_ID`
   *   when a file id is already in the store, before adding any.
   *
   * An id the file itself repeats throws `ANNOTATION_DUPLICATE_ID`
   * (`details: { id, index }`) in either mode.
   *
   * The second argument may also be an options bag:
   * - `mode`: same `'replace' | 'merge'` choice as above.
   * - `validateTableName`: when `true` and the file's `tableName` does not
   *   match the store's resolved table name (and both are non-null), throw
   *   `ANNOTATION_TABLENAME_MISMATCH` before any state mutation. Multi-table
   *   apps should opt in to catch cross-table loads.
   *
   * Regardless of `validateTableName`, a `console.warn` is emitted on every
   * tableName mismatch (both sides non-null). This makes the cross-table
   * case visible even when callers do not opt into the throw.
   */
  loadJSON(
    file: AnnotationFile,
    modeOrOptions: 'replace' | 'merge' | LoadJSONOptions = 'replace',
  ): { added: number; skipped: number } {
    const { mode, validateTableName, skipDuplicates } = normalizeLoadOptions(modeOrOptions);
    if (!isPlainObject(file)) {
      throw new AnnotationError('Annotation file must be an object', {
        code: 'ANNOTATION_INVALID_SHAPE',
      });
    }
    const version = (file as { version?: unknown }).version;
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      throw new AnnotationError('Annotation file version must be an integer', {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { field: 'version' },
      });
    }
    if (version > ANNOTATION_FILE_VERSION) {
      throw new AnnotationError(
        `Annotation file version ${version} is newer than supported ${ANNOTATION_FILE_VERSION}`,
        {
          code: 'ANNOTATION_VERSION_UNSUPPORTED',
          details: { requested: version, current: ANNOTATION_FILE_VERSION },
        },
      );
    }
    // tableName cross-check. Runs before any state mutation.
    const fileTableName = (file as { tableName?: unknown }).tableName;
    if (typeof fileTableName === 'string' && fileTableName.length > 0) {
      const current = this.resolveTableName();
      if (typeof current === 'string' && current.length > 0 && current !== fileTableName) {
        // Always emit a warning so multi-table apps see the signal.
        console.warn(
          `[AnnotationStore] loadJSON: file.tableName "${fileTableName}" does not match store table "${current}".`,
        );
        if (validateTableName) {
          throw new AnnotationError(
            `Annotation file tableName "${fileTableName}" does not match store table "${current}"`,
            {
              code: 'ANNOTATION_TABLENAME_MISMATCH',
              details: { fileTableName, currentTableName: current },
            },
          );
        }
      }
    }
    const rawAnns = (file as { annotations?: unknown }).annotations;
    if (!Array.isArray(rawAnns)) {
      throw new AnnotationError('Annotation file must have an `annotations` array', {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { field: 'annotations' },
      });
    }

    // Validate every entry up-front (no partial state).
    const seq0 = this.nextSeq;
    const prepared = new Array<Entry>(rawAnns.length);
    for (let i = 0; i < rawAnns.length; i++) {
      prepared[i] = this.prepare(rawAnns[i], i, null, seq0 + i);
    }

    // Claim ids into a staging map: an id the file repeats throws or, when
    // skipping, keeps its first occurrence.
    const staging = new Map<string, Entry>();
    let skipped = 0;
    for (let i = 0; i < prepared.length; i++) {
      const entry = prepared[i]!;
      const id = entry.ann.id;
      if (staging.has(id)) {
        if (skipDuplicates) {
          skipped++;
          continue;
        }
        throw duplicateIdError(id, i);
      }
      if (mode === 'merge' && this.byId.has(id)) throw duplicateIdError(id, i);
      staging.set(id, entry);
    }
    this.nextSeq = seq0 + prepared.length;

    if (mode === 'replace') {
      const prior = this.byId;
      this.resetIndexes();
      this.byId = staging;
      this.extraFileFields = extractExtras(file, RESERVED_FILE_KEYS);
      const maybeCreatedAt = (file as { createdAt?: unknown }).createdAt;
      this.fileCreatedAt = typeof maybeCreatedAt === 'string' ? maybeCreatedAt : undefined;
      for (const entry of staging.values()) this.indexEntry(entry);
      this.touch();
      if (prior.size > 0 && this.isObserved()) {
        this.emit({
          kind: 'cleared',
          ids: Array.from(prior.keys()),
          annotations: Array.from(prior.values(), (e) => e.ann),
        });
      }
      if (staging.size > 0 && this.isObserved()) {
        this.emit({
          kind: 'added',
          ids: Array.from(staging.keys()),
          annotations: Array.from(staging.values(), (e) => e.ann),
        });
      }
      return { added: staging.size, skipped };
    }

    // mode: 'merge'. Nothing above touched the store.
    const accepted = Array.from(staging.values());
    this.claim(accepted, true);
    // Merge file-level extras onto whatever we already have.
    const incomingExtras = extractExtras(file, RESERVED_FILE_KEYS);
    if (incomingExtras) {
      this.extraFileFields = { ...(this.extraFileFields ?? {}), ...incomingExtras };
    }
    for (const entry of accepted) this.indexEntry(entry);
    if (accepted.length > 0 || incomingExtras) this.touch();
    if (accepted.length > 0 && this.isObserved()) {
      this.emit({ kind: 'added', ids: idsOf(accepted), annotations: accepted.map((e) => e.ann) });
    }
    return { added: accepted.length, skipped };
  }

  // =========================================
  // Events
  // =========================================

  /**
   * Subscribe to store mutations. Returns an unsubscribe function.
   * Handlers that throw are caught and logged; other handlers still fire.
   */
  on(event: AnnotationEvent, handler: AnnotationChangeHandler): () => void {
    if (event !== 'change') {
      throw new AnnotationError(`Unknown event: ${String(event)}`, {
        code: 'ANNOTATION_FAILED',
      });
    }
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  // =========================================
  // Lifecycle
  // =========================================

  /** Clear all listeners. Called from `DataTable.destroy`. */
  destroy(): void {
    this.destroyed = true;
    this.listeners.clear();
  }

  // =========================================
  // Internals
  // =========================================

  /**
   * `add` / `addMany`: validate every entry, claim every id, then index
   * every entry. A failure in the first two phases leaves the store as it
   * was.
   */
  private insertNew(list: readonly unknown[], batch: boolean): Annotation[] {
    const n = list.length;
    if (n === 0) return [];
    let createdAt: string | undefined;
    const defaultCreatedAt = (): string => (createdAt ??= this.now());
    const seq0 = this.nextSeq;
    const entries = new Array<Entry>(n);
    for (let i = 0; i < n; i++) {
      entries[i] = this.prepare(list[i], batch ? i : -1, defaultCreatedAt, seq0 + i);
    }
    this.claim(entries, batch);
    this.nextSeq = seq0 + n;
    for (let i = 0; i < n; i++) this.indexEntry(entries[i]!);
    this.touch();
    const added = entries.map((entry) => entry.ann);
    if (this.isObserved()) {
      this.emit({ kind: 'added', ids: idsOf(entries), annotations: added.slice() });
    }
    return added;
  }

  /**
   * Puts each entry into `byId` under its id, in order. An id already there
   * (in the store, or earlier in `entries`) or any other failure deletes
   * exactly the ids this call put, so `byId` is as it was, and throws.
   */
  private claim(entries: readonly Entry[], withIndex: boolean): void {
    const byId = this.byId;
    let i = 0;
    try {
      for (; i < entries.length; i++) {
        const entry = entries[i]!;
        const id = entry.ann.id;
        if (byId.has(id)) {
          throw withIndex
            ? duplicateIdError(id, i)
            : new AnnotationError(`Duplicate annotation id: ${id}`, {
                code: 'ANNOTATION_DUPLICATE_ID',
                details: { id },
              });
        }
        byId.set(id, entry);
      }
    } catch (err) {
      for (let j = 0; j < i; j++) byId.delete(entries[j]!.ann.id);
      throw err;
    }
  }

  /**
   * Validate a raw annotation object and build its entry, with any extras.
   * `defaultCreatedAt` is given by `add`/`addMany`, where `id` may be missing
   * (one is generated) and a missing `createdAt` takes its value; `loadJSON`
   * passes `null`, and requires `id`.
   */
  private prepare(
    raw: unknown,
    index: number,
    defaultCreatedAt: (() => string) | null,
    seq: number,
  ): Entry {
    if (!isPlainObject(raw)) {
      throw new AnnotationError('Annotation entry must be an object', {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { index },
      });
    }
    const scope = raw['scope'];
    if (!isScope(scope)) {
      throw new AnnotationError(`Invalid annotation scope: ${String(scope)}`, {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { index, field: 'scope' },
      });
    }
    const severity = raw['severity'];
    if (!isSeverity(severity)) {
      throw new AnnotationError(`Invalid annotation severity: ${String(severity)}`, {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { index, field: 'severity' },
      });
    }
    const message = raw['message'];
    if (typeof message !== 'string' || message.length === 0) {
      throw new AnnotationError('Annotation message must be a non-empty string', {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { index, field: 'message' },
      });
    }
    const rawId = raw['id'];
    let id: string;
    if (rawId === undefined || rawId === null) {
      if (!defaultCreatedAt) {
        throw new AnnotationError('Annotation id is required', {
          code: 'ANNOTATION_INVALID_SHAPE',
          details: { index, field: 'id' },
        });
      }
      id = this.idGenerator();
    } else if (typeof rawId === 'string' && rawId.length > 0) {
      id = rawId;
    } else {
      throw new AnnotationError('Annotation id must be a non-empty string', {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { index, field: 'id' },
      });
    }

    const rowId = raw['rowId'];
    if (scope !== 'column' && (typeof rowId !== 'number' || !Number.isFinite(rowId))) {
      throw new AnnotationError('rowId must be a finite number', {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { index, field: 'rowId' },
      });
    }
    const column = raw['column'];
    if (scope !== 'row' && (typeof column !== 'string' || column.length === 0)) {
      throw new AnnotationError('column must be a non-empty string', {
        code: 'ANNOTATION_INVALID_SHAPE',
        details: { index, field: 'column' },
      });
    }

    const rawCreatedAt = raw['createdAt'];
    const createdAt =
      typeof rawCreatedAt === 'string'
        ? rawCreatedAt
        : defaultCreatedAt
          ? defaultCreatedAt()
          : undefined;
    const rawUpdatedAt = raw['updatedAt'];
    const updatedAt = typeof rawUpdatedAt === 'string' ? rawUpdatedAt : undefined;
    const rawCode = raw['code'];
    const code = typeof rawCode === 'string' ? rawCode : undefined;
    const rawSource = raw['source'];
    const source = typeof rawSource === 'string' ? rawSource : undefined;
    // Deep-clone metadata so post-add mutation of the caller's object cannot
    // mutate the stored annotation. structuredClone is part of the browser
    // baseline (checkBrowserSupport.ts).
    const rawMetadata = raw['metadata'];
    const metadata = isPlainObject(rawMetadata) ? structuredClone(rawMetadata) : undefined;

    let ann: Annotation;
    if (
      createdAt !== undefined &&
      updatedAt === undefined &&
      code === undefined &&
      source === undefined &&
      metadata === undefined
    ) {
      // The common shape, one literal per scope, so these annotations share
      // a hidden class with their fields in-object. Same key order as below.
      if (scope === 'cell') {
        ann = {
          id,
          severity,
          message,
          createdAt,
          scope,
          rowId: rowId as number,
          column: column as string,
        };
      } else if (scope === 'row') {
        ann = { id, severity, message, createdAt, scope, rowId: rowId as number };
      } else {
        ann = { id, severity, message, createdAt, scope, column: column as string };
      }
    } else {
      const base: AnnotationBase = {
        id,
        severity,
        message,
        ...(code !== undefined ? { code } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        ...(createdAt !== undefined ? { createdAt } : {}),
        ...(updatedAt !== undefined ? { updatedAt } : {}),
      };
      if (scope === 'row') {
        ann = { ...base, scope: 'row', rowId: rowId as number };
      } else if (scope === 'column') {
        ann = { ...base, scope: 'column', column: column as string };
      } else {
        ann = { ...base, scope: 'cell', rowId: rowId as number, column: column as string };
      }
    }

    return new Entry(
      ann,
      seq,
      SEVERITY_BIT[severity],
      extractExtras(raw, RESERVED_ANNOTATION_KEYS),
    );
  }

  /** Adds a claimed entry to its scope's index. */
  private indexEntry(entry: Entry): void {
    const ann = entry.ann;
    if (ann.scope === 'cell') {
      const { rowId, column } = ann;
      let inner = this.cells.get(column);
      if (inner === undefined) {
        inner = new Map();
        this.cells.set(column, inner);
      }
      bucketAdd(inner, rowId, entry);
      if (this.cellsByRow) rowCellsAdd(this.cellsByRow, rowId, entry);
      this.cellCount++;
      this.annotatedCache = null;
    } else if (ann.scope === 'row') {
      bucketAdd(this.rowScoped, ann.rowId, entry);
      this.rowCount++;
      this.annotatedCache = null;
    } else {
      bucketAdd(this.colScoped, ann.column, entry);
      this.columnCount++;
    }
  }

  /** Takes an entry `byId` no longer holds out of its scope's index. */
  private unindexEntry(entry: Entry): void {
    const ann = entry.ann;
    if (ann.scope === 'cell') {
      const { rowId, column } = ann;
      const inner = this.cells.get(column);
      if (inner !== undefined) {
        bucketRemove(inner, rowId, entry);
        if (inner.size === 0) this.cells.delete(column);
      }
      if (this.cellsByRow) rowCellsRemove(this.cellsByRow, rowId, entry);
      this.cellCount--;
      this.annotatedCache = null;
    } else if (ann.scope === 'row') {
      bucketRemove(this.rowScoped, ann.rowId, entry);
      this.rowCount--;
      this.annotatedCache = null;
    } else {
      bucketRemove(this.colScoped, ann.column, entry);
      this.columnCount--;
    }
  }

  /** Moves an entry's severity count in the bucket that holds it to `sev`. */
  private moveSeverity(entry: Entry, sev: number): void {
    const ann = entry.ann;
    const bucket =
      ann.scope === 'cell'
        ? this.cells.get(ann.column)?.get(ann.rowId)
        : ann.scope === 'row'
          ? this.rowScoped.get(ann.rowId)
          : this.colScoped.get(ann.column);
    if (bucket instanceof MultiBucket) {
      bucket.countSeverity(entry.sev, -1);
      bucket.countSeverity(sev, 1);
    }
    entry.sev = sev;
    if (ann.scope !== 'column') this.annotatedCache = null;
  }

  private summarize(bucket: Bucket | undefined, out: ScopeSummary): ScopeSummary {
    out.count = bucketSize(bucket);
    out.severity = highestShown(bucketMask(bucket) & this.severityMask);
    return out;
  }

  /** The by-row index of cell-scope entries, built on first use. */
  private cellsByRowIndex(): Map<number, RowCells> {
    let index = this.cellsByRow;
    if (index === null) {
      const built = new Map<number, RowCells>();
      for (const inner of this.cells.values()) {
        inner.forEach((bucket, rowId) => {
          if (bucket instanceof MultiBucket) {
            for (const entry of bucket.entries) rowCellsAdd(built, rowId, entry);
          } else {
            rowCellsAdd(built, rowId, bucket);
          }
        });
      }
      // Arrays grown by `push` keep spare capacity: copy each to its size.
      built.forEach((cells, rowId) => {
        if (Array.isArray(cells)) built.set(rowId, cells.slice());
      });
      index = this.cellsByRow = built;
    }
    return index;
  }

  private scopeCount(scope: AnnotationScope): number {
    return scope === 'row' ? this.rowCount : scope === 'column' ? this.columnCount : this.cellCount;
  }

  /**
   * `clear(scope)` through the scope's own index. Returns the removed
   * entries in insertion order when `collect`.
   */
  private clearScopeByIndex(scope: AnnotationScope, collect: boolean): Entry[] | null {
    const removed: Entry[] = [];
    if (scope === 'row') {
      for (const bucket of this.rowScoped.values()) pushBucket(removed, bucket);
    } else if (scope === 'column') {
      for (const bucket of this.colScoped.values()) pushBucket(removed, bucket);
    } else {
      for (const inner of this.cells.values()) {
        for (const bucket of inner.values()) pushBucket(removed, bucket);
      }
    }
    for (const entry of removed) this.byId.delete(entry.ann.id);
    this.resetScope(scope);
    if (!collect) return null;
    removed.sort(bySeq);
    return removed;
  }

  /**
   * `clear(scope)` by one pass over `byId` that keeps the other scopes.
   * Returns the removed entries in insertion order when `collect`.
   */
  private clearScopeByPass(scope: AnnotationScope, collect: boolean): Entry[] | null {
    const kept = new Map<string, Entry>();
    const removed: Entry[] | null = collect ? [] : null;
    this.byId.forEach((entry, id) => {
      if (entry.ann.scope === scope) removed?.push(entry);
      else kept.set(id, entry);
    });
    this.byId = kept;
    this.resetScope(scope);
    return removed;
  }

  private clearAll(): number {
    const prior = this.byId;
    const count = prior.size;
    if (count === 0 && this.extraFileFields === undefined && this.fileCreatedAt === undefined) {
      return 0;
    }
    this.byId = new Map();
    this.resetIndexes();
    this.extraFileFields = undefined;
    this.fileCreatedAt = undefined;
    this.touch();
    if (count > 0 && this.isObserved()) {
      this.emit({
        kind: 'cleared',
        ids: Array.from(prior.keys()),
        annotations: Array.from(prior.values(), (entry) => entry.ann),
      });
    }
    return count;
  }

  private resetScope(scope: AnnotationScope): void {
    if (scope === 'row') {
      this.rowScoped = new Map();
      this.rowCount = 0;
      this.annotatedCache = null;
    } else if (scope === 'column') {
      this.colScoped = new Map();
      this.columnCount = 0;
    } else {
      this.cells = new Map();
      this.cellsByRow = null;
      this.cellCount = 0;
      this.annotatedCache = null;
    }
  }

  /** Empties every scope index (not `byId`). */
  private resetIndexes(): void {
    this.resetScope('row');
    this.resetScope('column');
    this.resetScope('cell');
  }

  /** Records a change to the store's contents. */
  private touch(): void {
    this.rev++;
    this.contentRev++;
  }

  /** Whether an event would reach anyone, so its payload is worth building. */
  private isObserved(): boolean {
    return !this.destroyed && this.listeners.size > 0;
  }

  private emit(payload: AnnotationChangePayload): void {
    if (this.destroyed) return;
    const snapshot = Array.from(this.listeners);
    for (const fn of snapshot) {
      try {
        fn(payload);
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error('[AnnotationStore] change handler threw:', err);
        }
      }
    }
  }

  private resolveTableName(): string | null | undefined {
    const src = this.nameSource;
    if (src === undefined) return undefined;
    if (src === null) return null;
    if (typeof src === 'string') return src;
    return src.get();
  }
}

function duplicateIdError(id: string, index: number): AnnotationError {
  return new AnnotationError(`Duplicate annotation id: ${id}`, {
    code: 'ANNOTATION_DUPLICATE_ID',
    details: { id, index },
  });
}
