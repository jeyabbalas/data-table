/**
 * Annotation types — discriminated on {@link AnnotationScope}.
 *
 * Annotations are metadata overlay a host app attaches to rows, columns, or
 * cells to surface validation errors, QC rule violations, or informational
 * notes. They are NOT part of table state (no undo/redo); they live on
 * `table.annotations` and persist independently via `SessionSnapshot`.
 *
 * Row and cell annotations key on {@link RowId} (the `__rowid__` value
 * synthesized at load by the loaders — see `src/core/types.ts`). In JSON the
 * `rowId` is a `number`; callers reading `__rowid__` via
 * `table.actions.getColumnValues('__rowid__')` receive `bigint` values and
 * must convert with `Number(rowIdValue)` before constructing annotations.
 * Row counts stay well within the JS safe-integer range (< 2⁵³).
 *
 * Unknown fields — at the file top level and on each annotation — are
 * preserved verbatim across `toJSON` / `loadJSON` so host apps can stash
 * structured details (tracking ids, reviewer notes, JSON-Schema keyword
 * payloads, etc.) without negotiating a schema change with the library.
 */

/** Scope discriminator for an annotation. Immutable after creation. */
export type AnnotationScope = 'row' | 'column' | 'cell';

/** Severity of an annotation. Fixed three-level set; ordering error > warning > info. */
export type AnnotationSeverity = 'error' | 'warning' | 'info';

/**
 * Fields common to every annotation regardless of scope.
 *
 * XSS safety: the library renders every string field on this interface
 * (`message`, `code`, `source`) via `.textContent` — HTML strings are NOT
 * interpreted. This eliminates the XSS surface by construction; apps may
 * pass arbitrary strings (including JSON-Schema validator output) without
 * sanitization. `severity` is restricted by the {@link AnnotationSeverity}
 * union and validated against that allow-list before being interpolated
 * into a CSS class name.
 *
 * @remarks Use the concrete variants ({@link RowAnnotation}, {@link ColumnAnnotation},
 * {@link CellAnnotation}) or the {@link Annotation} union from the public
 * surface; this base interface is structural and intentionally not exported.
 */
export interface AnnotationBase {
  /** Stable identifier. Auto-generated if omitted at `add` time. */
  id: string;
  /** Severity level — drives CSS precedence and popover ordering in Phase 4. */
  severity: AnnotationSeverity;
  /**
   * Human-readable message. The library renders this via `.textContent` —
   * HTML strings are NOT interpreted. Pass any string safely.
   */
  message: string;
  /**
   * App-defined error / rule code (e.g. `JSON_SCHEMA_MAXIMUM`). Rendered via
   * `.textContent` — HTML strings are NOT interpreted.
   */
  code?: string;
  /**
   * App-defined origin tag (e.g. `harmonization-validator`). Rendered via
   * `.textContent` — HTML strings are NOT interpreted.
   */
  source?: string;
  /** App-defined structured metadata; round-tripped verbatim. */
  metadata?: Record<string, unknown>;
  /** ISO 8601; set to `now()` by `add` when missing. */
  createdAt?: string;
  /** ISO 8601; set on every successful `update`. */
  updatedAt?: string;
}

/** Row-scope annotation — attached to a specific row by `rowId`. */
export interface RowAnnotation extends AnnotationBase {
  scope: 'row';
  rowId: number;
}

/** Column-scope annotation — attached to a column by name. */
export interface ColumnAnnotation extends AnnotationBase {
  scope: 'column';
  column: string;
}

/** Cell-scope annotation — attached to a single `(rowId, column)` cell. */
export interface CellAnnotation extends AnnotationBase {
  scope: 'cell';
  rowId: number;
  column: string;
}

/** Discriminated union of every annotation variant. */
export type Annotation = RowAnnotation | ColumnAnnotation | CellAnnotation;

/**
 * Input shape accepted by `AnnotationStore.add` / `addMany`: any of the three
 * concrete variants with `id` optional (the store generates one when absent).
 */
export type NewAnnotation =
  | (Omit<RowAnnotation, 'id'> & { id?: string })
  | (Omit<ColumnAnnotation, 'id'> & { id?: string })
  | (Omit<CellAnnotation, 'id'> & { id?: string });

/** Current on-disk version of the annotation file format. Bump if the shape changes. */
export const ANNOTATION_FILE_VERSION = 1;

/**
 * JSON file shape emitted by `AnnotationStore.toJSON` and consumed by
 * `loadJSON`. Unknown top-level keys survive round-trip (the index signature
 * captures them at the type level; the store preserves them at runtime).
 */
export interface AnnotationFile {
  version: number;
  tableName?: string;
  createdAt?: string;
  updatedAt?: string;
  annotations: Annotation[];
  /** Unknown top-level fields are preserved verbatim across round-trips. */
  [unknown: string]: unknown;
}

/** Event payload emitted by `AnnotationStore.on('change', …)`. */
export interface AnnotationChangePayload {
  /**
   * `'filterChanged'` is a visual-only signal — it fires when
   * `setSeverityFilter` actually toggled at least one flag. The store's
   * contents are unchanged and `ids` is empty. Persistence layers should
   * skip this kind; renderers should reapply.
   */
  kind: 'added' | 'removed' | 'updated' | 'cleared' | 'filterChanged';
  ids: string[];
}

/** Handler function shape for `AnnotationStore.on('change', …)`. */
export type AnnotationChangeHandler = (payload: AnnotationChangePayload) => void;

/**
 * Visual-only severity-filter flag set. Each flag controls whether tints for
 * that severity appear; annotations themselves remain in the store regardless.
 * When all three are enabled (the default), every annotation paints per the
 * `error > warning > info` hierarchy. Disabling a flag drops it from the
 * hierarchy at render time so the next-highest enabled severity shows
 * through.
 */
export interface SeverityFilter {
  error: boolean;
  warning: boolean;
  info: boolean;
}
