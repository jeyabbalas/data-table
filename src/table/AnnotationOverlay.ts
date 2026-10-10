/**
 * AnnotationOverlay — the grid's one subscriber to the annotation store.
 *
 * Each `change` event the store emits goes, through here, to the body, to
 * the headers it touches, and to the popover. The body and the headers once
 * subscribed each on their own: a 1,000-column table ran 1,001 listeners per
 * change, and every one of them re-read its whole share of the store.
 *
 * `TableContainer` builds it before anything else hears the store (the
 * session's auto-save, app code through `table.annotations`), so the grid is
 * up to date by the time they hear of a change, and destroys it first. It
 * reads the body and the headers through getters: `TableContainer` replaces
 * the body on a new schema or table, and builds and destroys headers as
 * columns come and go.
 *
 * Internal to the grid; not part of the package's entry points.
 */

import type { AnnotationStore } from '../annotations/AnnotationStore';
import type { AnnotationChangePayload } from '../annotations/types';
import type { AnnotationPopover } from './AnnotationPopover';
import { annotationChangeOf } from './annotationRender';
import type { ColumnHeader } from './ColumnHeader';
import type { TableBody } from './TableBody';

/**
 * What an {@link AnnotationOverlay} brings up to date.
 *
 * @internal
 */
export interface AnnotationOverlayOptions {
  /** The store to hear. */
  store: AnnotationStore;
  /** The body, while there is one. */
  getBody: () => TableBody | null;
  /** The header of a visible column; `undefined` for any other. */
  getHeader: (column: string) => ColumnHeader | undefined;
  /** Every header, one per visible column. */
  getHeaders: () => Iterable<ColumnHeader>;
  /** The popover the body and the headers open. */
  popover?: AnnotationPopover | undefined;
}

/**
 * Keeps the grid's annotation classes, counts and popover in step with the
 * store, through one subscription. See the module comment.
 *
 * @internal
 */
export class AnnotationOverlay {
  private readonly options: AnnotationOverlayOptions;
  private unsubscribe: (() => void) | null;

  constructor(options: AnnotationOverlayOptions) {
    this.options = options;
    this.unsubscribe = options.store.on('change', this.handleChange);
  }

  /**
   * Synchronous, like the store's event: rows, cells and headers are current
   * when the store's next listener runs. Each part does work for the keys the
   * change touched, and writes only what differs. A header is touched by
   * column-scope changes to its column; on `all` every header compares its
   * state, which costs one O(1) summary each and writes nothing unchanged.
   */
  private readonly handleChange = (payload: AnnotationChangePayload): void => {
    if (!this.unsubscribe) return;
    const change = annotationChangeOf(payload);
    this.options.getBody()?.syncAnnotations(change);
    if (change.all) {
      for (const header of this.options.getHeaders()) header.syncAnnotations();
    } else {
      for (const column of change.columns) this.options.getHeader(column)?.syncAnnotations();
    }
    this.options.popover?.requestRefresh();
  };

  /** Stop hearing the store. Idempotent. */
  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
