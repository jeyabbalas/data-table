/**
 * AnnotationPopover — singleton floating panel that lists the annotations
 * attached to a single cell or column header.
 *
 * One instance per {@link DataTable}; shared across every annotated cell and
 * header. Owned by `TableContainer` (constructed inside `createDataTable`),
 * passed as an option into `TableBody` and `ColumnHeader`, and destroyed
 * when the table tears down.
 *
 * The popover's DOM element is lazy-created on first {@link show} and
 * mounted to `portalTarget` (defaults to `document.body`). The same element
 * is reused for every subsequent show — never recreated per anchor.
 *
 * Visible lifecycle:
 * - Show on `pointerenter` / `focusin` of an annotated cell or header.
 * - Hide on `Escape`, click outside (both popover and anchor), viewport
 *   scroll, window resize, or explicit `hide()`.
 * - A 120 ms grace period on `pointerleave` allows users to move the cursor
 *   from anchor into popover content without flickering the popover away.
 *
 * A11y:
 * - `role="tooltip"`, `aria-live="polite"` — screen readers announce the
 *   annotation when it appears.
 * - A stable element id set at construction. `show()` writes
 *   `aria-describedby` on the anchor so assistive tech associates the
 *   popover with the cell; `hide()` clears it.
 * - `tabindex="-1"` on the popover so keyboard users can Tab past it; a
 *   mouse click inside still focuses it for follow-through interactions.
 *
 * SSR / no-DOM guard: when `typeof document === 'undefined'`, the
 * constructor and every public method become no-ops so unit tests that
 * instantiate a `DataTable` in `node` env don't throw.
 */

import type { Annotation, AnnotationSeverity } from '../annotations/types';
import { onAnyModalOpened } from '../core/ModalHost';

/** Options accepted by {@link AnnotationPopover}. */
export interface AnnotationPopoverOptions {
  /** CSS class prefix (default: `'dt'`). */
  classPrefix?: string;
  /** Where to mount the popover element. Defaults to `document.body`. */
  portalTarget?: HTMLElement;
}

let popoverInstanceCounter = 0;

const GRACE_MS = 120;
const EDGE_PAD = 4;

/**
 * Render one annotation entry's inner HTML. Keep message text-only (we
 * explicitly set `.textContent` to avoid HTML injection from the app).
 */
function renderEntry(
  ann: Annotation,
  classPrefix: string,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `${classPrefix}-annotation-entry ${classPrefix}-annotation-entry--${ann.severity}`;

  const pill = document.createElement('span');
  pill.className = `${classPrefix}-annotation-pill ${classPrefix}-annotation-pill--${ann.severity}`;
  pill.textContent = ann.severity;
  li.appendChild(pill);

  const body = document.createElement('div');
  body.className = `${classPrefix}-annotation-body`;

  const msg = document.createElement('div');
  msg.className = `${classPrefix}-annotation-message`;
  msg.textContent = ann.message;
  body.appendChild(msg);

  if (ann.code || ann.source) {
    const meta = document.createElement('div');
    meta.className = `${classPrefix}-annotation-meta`;
    const parts: string[] = [];
    if (ann.code) parts.push(ann.code);
    if (ann.source) parts.push(ann.source);
    meta.textContent = parts.join(' · ');
    body.appendChild(meta);
  }

  li.appendChild(body);
  return li;
}

function titleFor(scope: 'row' | 'column' | 'cell'): string {
  if (scope === 'row') return 'Row';
  if (scope === 'column') return 'Column';
  return 'Cell';
}

/** Rank severities so the "highest" can be surfaced in a CSS class. */
export function severityRank(sev: AnnotationSeverity): number {
  return sev === 'error' ? 0 : sev === 'warning' ? 1 : 2;
}

/** Return the highest-severity value among `anns`, or `null` if empty. */
export function maxSeverity(anns: readonly Annotation[]): AnnotationSeverity | null {
  let best: AnnotationSeverity | null = null;
  for (const a of anns) {
    if (!best || severityRank(a.severity) < severityRank(best)) {
      best = a.severity;
    }
  }
  return best;
}

export class AnnotationPopover {
  private readonly classPrefix: string;
  private readonly portalTarget: HTMLElement | null;
  private readonly popoverId: string;
  private element: HTMLElement | null = null;
  private currentAnchor: HTMLElement | null = null;
  private hideTimer: number | null = null;
  private destroyed = false;
  private unsubscribeModalOpen: (() => void) | null = null;

  private readonly onDocumentKeyDown: (e: KeyboardEvent) => void;
  private readonly onDocumentPointerDown: (e: MouseEvent) => void;
  private readonly onWindowScroll: () => void;
  private readonly onWindowResize: () => void;
  private readonly onPopoverPointerEnter: () => void;
  private readonly onPopoverPointerLeave: () => void;

  constructor(options: AnnotationPopoverOptions = {}) {
    this.classPrefix = options.classPrefix ?? 'dt';
    this.portalTarget = typeof document === 'undefined' ? null : (options.portalTarget ?? document.body);
    this.popoverId = `${this.classPrefix}-annotation-popover-${++popoverInstanceCounter}`;

    this.onDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    };
    this.onDocumentPointerDown = (e: MouseEvent) => {
      if (!this.element || !this.currentAnchor) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (this.element.contains(target) || this.currentAnchor.contains(target)) return;
      this.hide();
    };
    this.onWindowScroll = () => this.hide();
    this.onWindowResize = () => this.hide();
    this.onPopoverPointerEnter = () => this.cancelGraceHide();
    this.onPopoverPointerLeave = () => this.scheduleGraceHide();

    // Self-dismiss whenever any ModalHost-backed panel or modal opens. The
    // popover's outside-click logic does NOT fire when the user clicks an
    // action button inside the anchor (e.g. the column header's filter
    // button), so we rely on the modal's own open event to dismiss us.
    this.unsubscribeModalOpen = onAnyModalOpened(() => this.hide());
  }

  /** Element id for the popover. Anchors write this into `aria-describedby`. */
  getId(): string {
    return this.popoverId;
  }

  /** `true` if the popover is currently anchored to `anchor`. */
  isOpenFor(anchor: HTMLElement): boolean {
    return !this.destroyed && this.currentAnchor === anchor && this.element?.style.display !== 'none';
  }

  /** `true` if the popover is open against any anchor. */
  isOpen(): boolean {
    return !this.destroyed && this.currentAnchor !== null;
  }

  /**
   * Display the popover anchored to `anchor` with the given annotations.
   * Re-rendering happens inline on every call so consumers don't need to
   * diff annotation changes themselves.
   */
  show(anchor: HTMLElement, annotations: Annotation[]): void {
    if (this.destroyed || this.portalTarget === null) return;
    if (annotations.length === 0) {
      this.hide();
      return;
    }

    const el = this.ensureElement();
    this.cancelGraceHide();
    this.populate(el, annotations);

    // Mark open BEFORE positioning so listeners that read `currentAnchor` are correct.
    this.currentAnchor = anchor;
    anchor.setAttribute('aria-describedby', this.popoverId);

    // Match the anchor's color scheme (explicit light/dark override) so a
    // dark-mode table forces the popover into dark even when body inherits
    // the OS light preference.
    this.inheritColorScheme(anchor, el);

    el.style.display = 'block';
    // Position once with the now-visible dimensions.
    this.position(anchor, el);

    // Listeners
    document.addEventListener('keydown', this.onDocumentKeyDown, true);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.addEventListener('scroll', this.onWindowScroll, true);
    window.addEventListener('resize', this.onWindowResize);
  }

  /** Dismiss the popover and detach all listeners. Idempotent. */
  hide(): void {
    if (this.destroyed) return;
    this.cancelGraceHide();
    if (this.currentAnchor) {
      if (this.currentAnchor.getAttribute('aria-describedby') === this.popoverId) {
        this.currentAnchor.removeAttribute('aria-describedby');
      }
      this.currentAnchor = null;
    }
    if (this.element) {
      this.element.style.display = 'none';
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.onDocumentKeyDown, true);
      document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.onWindowScroll, true);
      window.removeEventListener('resize', this.onWindowResize);
    }
  }

  /** Start a grace-period timer that hides the popover unless cancelled. */
  scheduleGraceHide(): void {
    if (this.destroyed || typeof window === 'undefined') return;
    this.cancelGraceHide();
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      this.hide();
    }, GRACE_MS);
  }

  /** Cancel a pending grace-period hide (user moved pointer back in time). */
  cancelGraceHide(): void {
    if (this.hideTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  /** Tear down the popover and remove its element from the DOM. */
  destroy(): void {
    if (this.destroyed) return;
    this.hide();
    this.destroyed = true;
    if (this.unsubscribeModalOpen) {
      this.unsubscribeModalOpen();
      this.unsubscribeModalOpen = null;
    }
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }

  // =========================================
  // Internals
  // =========================================

  private ensureElement(): HTMLElement {
    if (this.element) return this.element;
    if (!this.portalTarget) {
      throw new Error('AnnotationPopover: no portal target available');
    }
    const el = document.createElement('div');
    el.className = `${this.classPrefix}-annotation-popover`;
    el.id = this.popoverId;
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('tabindex', '-1');
    el.style.display = 'none';
    el.style.position = 'fixed';
    el.addEventListener('pointerenter', this.onPopoverPointerEnter);
    el.addEventListener('pointerleave', this.onPopoverPointerLeave);
    this.portalTarget.appendChild(el);
    this.element = el;
    return el;
  }

  private populate(el: HTMLElement, annotations: Annotation[]): void {
    // Group by scope; within each group input order is preserved (callers
    // pass severity-sorted arrays from getByCell / getByColumn).
    const byScope: Record<'row' | 'column' | 'cell', Annotation[]> = {
      row: [],
      column: [],
      cell: [],
    };
    for (const ann of annotations) {
      byScope[ann.scope].push(ann);
    }

    el.innerHTML = '';
    const scopes: Array<'row' | 'column' | 'cell'> = ['row', 'column', 'cell'];
    for (const scope of scopes) {
      const anns = byScope[scope];
      if (anns.length === 0) continue;

      const section = document.createElement('section');
      section.className = `${this.classPrefix}-annotation-popover__group ${this.classPrefix}-annotation-popover__group--${scope}`;

      const title = document.createElement('h4');
      title.className = `${this.classPrefix}-annotation-popover__group-title`;
      title.textContent = titleFor(scope);
      section.appendChild(title);

      const list = document.createElement('ul');
      list.className = `${this.classPrefix}-annotation-popover__list`;
      for (const ann of anns) {
        list.appendChild(renderEntry(ann, this.classPrefix));
      }
      section.appendChild(list);
      el.appendChild(section);
    }
  }

  private position(anchor: HTMLElement, el: HTMLElement): void {
    if (typeof window === 'undefined') return;
    const rect = anchor.getBoundingClientRect();
    const viewportW = window.innerWidth || document.documentElement.clientWidth;
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const popH = el.offsetHeight;
    const popW = el.offsetWidth;

    // Vertical: prefer below; flip above if overflowing.
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    let top: number;
    if (spaceBelow >= popH + EDGE_PAD || spaceBelow >= spaceAbove) {
      top = rect.bottom + EDGE_PAD;
      // Clamp to keep the popover fully on-screen when possible.
      if (top + popH > viewportH - EDGE_PAD) {
        top = Math.max(EDGE_PAD, viewportH - popH - EDGE_PAD);
      }
    } else {
      top = rect.top - popH - EDGE_PAD;
      if (top < EDGE_PAD) top = EDGE_PAD;
    }

    // Horizontal: align to anchor.left; clamp to viewport.
    let left = rect.left;
    if (left + popW > viewportW - EDGE_PAD) {
      left = Math.max(EDGE_PAD, viewportW - popW - EDGE_PAD);
    }
    if (left < EDGE_PAD) left = EDGE_PAD;

    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(left)}px`;
  }

  private inheritColorScheme(anchor: HTMLElement, el: HTMLElement): void {
    // Walk up from the anchor looking for an explicit `data-dt-color-scheme`.
    // Mirrors the behaviour ModalHost uses for body-portalled modals.
    let node: HTMLElement | null = anchor;
    while (node) {
      const v = node.getAttribute?.('data-dt-color-scheme');
      if (v === 'light' || v === 'dark') {
        el.setAttribute('data-dt-color-scheme', v);
        return;
      }
      node = node.parentElement;
    }
    el.removeAttribute('data-dt-color-scheme');
  }
}
