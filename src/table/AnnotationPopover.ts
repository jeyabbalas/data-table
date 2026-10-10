/**
 * AnnotationPopover — singleton floating panel that lists the annotations
 * attached to a single cell or column header.
 *
 * One instance per `DataTable`; shared across every annotated cell and
 * header. Owned by `TableContainer` (constructed inside `createDataTable`),
 * passed as an option into `TableBody` and `ColumnHeader`, and destroyed
 * when the table tears down.
 *
 * The popover's DOM element is lazy-created on first {@link show} and
 * mounted to `portalTarget` (defaults to `document.body`). The same element
 * is reused for every subsequent show — never recreated per anchor.
 *
 * What it lists: a section per scope (row, column, cell), each sorted by
 * severity, then `createdAt`, then insertion, as the store's `list*Scope`
 * methods sort them. A section lists at most {@link MAX_ENTRIES_PER_SECTION}
 * annotations and counts the rest ("+N more"): a cell can hold thousands,
 * and the popover is a tooltip. Annotations whose severity the severity
 * filter hides are left out and counted ("N hidden by the severity filter"),
 * and an anchor whose every annotation is hidden gets no popover at all.
 *
 * XSS safety (load-bearing invariant):
 * Every text-bearing node is set via `.textContent`; the structure is built
 * exclusively via `document.createElement` + `appendChild`, and cleared with
 * `replaceChildren()`. App-supplied annotation strings (`message`, `code`,
 * `source`) are NEVER parsed as HTML. Class names take a severity only
 * through {@link severityIndex}, which knows the three of the fixed
 * allow-list `'error' | 'warning' | 'info'` (the {@link AnnotationStore}
 * validates `severity` against it at every input boundary too) and nothing
 * else. Apps can pass arbitrary strings without sanitization.
 *
 * Visible lifecycle:
 * - Show on `pointerenter` / `focusin` of an annotated cell or header.
 * - Hide on `Escape`, click outside (both popover and anchor), a scroll of
 *   anything but the popover itself, window resize, or explicit `hide()`.
 * - A 120 ms grace period on `pointerleave` allows users to move the cursor
 *   from anchor into popover content without flickering the popover away.
 * - On a change in the store, `requestRefresh` reads the anchor's
 *   annotations again and updates the popover in place, or hides it when
 *   nothing it would list is left.
 *
 * A11y:
 * - `role="tooltip"`, `aria-live="polite"` — screen readers announce the
 *   annotation when it appears. A refresh that leaves the content as it was
 *   rewrites nothing, so nothing is announced again.
 * - A stable element id set at construction. `show()` writes
 *   `aria-describedby` on the anchor so assistive tech associates the
 *   popover with the cell; `hide()` clears it.
 * - `tabindex="-1"` while the content fits, so keyboard users Tab past it,
 *   and `tabindex="0"` while it overflows its `max-height` and scrolls, so
 *   the region it scrolls can be reached and scrolled from the keyboard.
 *
 * SSR / no-DOM guard: when `typeof document === 'undefined'`, the
 * constructor and every public method become no-ops so unit tests that
 * instantiate a `DataTable` in `node` env don't throw.
 */

import type {
  Annotation,
  AnnotationScope,
  AnnotationSeverity,
  SeverityFilter,
} from '../annotations/types';
import { onAnyModalOpened } from '../core/ModalHost';
import { type Strings, defaultStrings } from '../core/Strings';

/** Options accepted by {@link AnnotationPopover}. */
export interface AnnotationPopoverOptions {
  /** CSS class prefix (default: `'dt'`). */
  classPrefix?: string | undefined;
  /** Where to mount the popover element. Defaults to `document.body`. */
  portalTarget?: HTMLElement | undefined;
  /**
   * Resolved i18n strings: the section titles, the severity names on the
   * pills, and the "+N more" and "N hidden by the severity filter" lines
   * (`messages.annotations`). Defaults to English.
   */
  messages?: Strings | undefined;
  /**
   * Reads the severity filter in force. The popover leaves out the
   * annotations whose severity it hides, and says how many it left out.
   * `createDataTable` passes its store's `getSeverityFilter`. Without it,
   * every annotation is listed.
   */
  severityFilter?: (() => SeverityFilter) | undefined;
}

/**
 * The annotations an anchor holds, a list per scope, each sorted as the
 * store's `listRowScope` / `listColumnScope` / `listCellScope` sort them.
 *
 * @internal
 */
export interface AnnotationSections {
  readonly row?: readonly Annotation[] | undefined;
  readonly column?: readonly Annotation[] | undefined;
  readonly cell?: readonly Annotation[] | undefined;
}

/**
 * Reads the annotations at the popover's anchor again, for a refresh:
 * `null` once the anchor no longer shows what it showed when the popover
 * opened on it (its row recycled, its cell given another column).
 *
 * @internal
 */
export type AnnotationSource = () => AnnotationSections | null;

/** The most annotations one section lists; it counts the rest. */
const MAX_ENTRIES_PER_SECTION = 5;

/** What one section shows: the scope, what it lists, and what it counts. */
interface SectionView {
  readonly scope: AnnotationScope;
  /** The annotations listed, at most {@link MAX_ENTRIES_PER_SECTION}. */
  readonly shown: readonly Annotation[];
  /** Shown by the severity filter, past the ones listed. */
  readonly more: number;
  /** Hidden by the severity filter. */
  readonly hidden: number;
}

const SCOPES: readonly AnnotationScope[] = ['row', 'column', 'cell'];

let popoverInstanceCounter = 0;

const GRACE_MS = 120;
const EDGE_PAD = 4;

/**
 * Where a severity sits in the allow-list, `-1` for anything else. The only
 * way a severity reaches a class name: through the class tables, by index.
 */
function severityIndex(severity: unknown): number {
  return severity === 'error' ? 0 : severity === 'warning' ? 1 : severity === 'info' ? 2 : -1;
}

const SEVERITIES: readonly AnnotationSeverity[] = ['error', 'warning', 'info'];

/** Group annotations by scope, keeping their order within each. */
function sectionsOf(annotations: readonly Annotation[]): AnnotationSections {
  const row: Annotation[] = [];
  const column: Annotation[] = [];
  const cell: Annotation[] = [];
  for (const ann of annotations) {
    if (ann.scope === 'row') row.push(ann);
    else if (ann.scope === 'column') column.push(ann);
    else if (ann.scope === 'cell') cell.push(ann);
  }
  return { row, column, cell };
}

/** Whether two views show the same: the same annotation objects, and the same counts. */
function sameView(a: readonly SectionView[], b: readonly SectionView[] | null): boolean {
  if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.scope !== y.scope || x.more !== y.more || x.hidden !== y.hidden) return false;
    if (x.shown.length !== y.shown.length) return false;
    for (let j = 0; j < x.shown.length; j++) {
      if (x.shown[j] !== y.shown[j]) return false;
    }
  }
  return true;
}

/**
 * Shared, body-portalled popover singleton that renders the intersection of
 * row, column, and cell annotations on hover / focus of an annotated grid
 * element. One instance per `DataTable` is enough — the facade owns
 * one and threads it to every renderer that emits annotation tints.
 */
export class AnnotationPopover {
  private readonly classPrefix: string;
  private readonly portalTarget: HTMLElement | null;
  private readonly popoverId: string;
  private readonly messages: Strings;
  private readonly readSeverityFilter: (() => SeverityFilter) | null;
  private element: HTMLElement | null = null;
  private currentAnchor: HTMLElement | null = null;
  // What the popover shows now, and where it reads it again on a refresh.
  private view: readonly SectionView[] | null = null;
  private source: AnnotationSource | null = null;
  private refreshQueued = false;
  private hideTimer: number | null = null;
  private destroyed = false;
  private unsubscribeModalOpen: (() => void) | null = null;

  private readonly onDocumentKeyDown: (e: KeyboardEvent) => void;
  private readonly onDocumentPointerDown: (e: MouseEvent) => void;
  private readonly onWindowScroll: (e: Event) => void;
  private readonly onWindowResize: () => void;
  private readonly onPopoverPointerEnter: () => void;
  private readonly onPopoverPointerLeave: () => void;
  private readonly onPopoverFocusOut: (e: FocusEvent) => void;

  constructor(options: AnnotationPopoverOptions = {}) {
    this.classPrefix = options.classPrefix ?? 'dt';
    this.portalTarget =
      typeof document === 'undefined' ? null : (options.portalTarget ?? document.body);
    this.popoverId = `${this.classPrefix}-annotation-popover-${++popoverInstanceCounter}`;
    this.messages = options.messages ?? defaultStrings;
    this.readSeverityFilter = options.severityFilter ?? null;

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
    // Any scroll moves the anchor out from under the popover, except the
    // popover's own: it scrolls once its content passes its `max-height`.
    // Scroll events do not bubble; this capture listener on `window` hears
    // them all, with the scrolled element as the target.
    this.onWindowScroll = (e: Event) => {
      const target = e.target;
      if (this.element && target instanceof Node && this.element.contains(target)) return;
      this.hide();
    };
    this.onWindowResize = () => this.hide();
    this.onPopoverPointerEnter = () => this.cancelGraceHide();
    this.onPopoverPointerLeave = () => this.scheduleGraceHide();
    // Focus moving inside the popover, or back to its anchor, keeps it.
    this.onPopoverFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      const staying =
        next instanceof Node &&
        (this.element?.contains(next) === true || this.currentAnchor?.contains(next) === true);
      if (!staying) this.scheduleGraceHide();
    };

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
    return (
      !this.destroyed && this.currentAnchor === anchor && this.element?.style.display !== 'none'
    );
  }

  /** `true` if the popover is open against any anchor. */
  isOpen(): boolean {
    return !this.destroyed && this.currentAnchor !== null;
  }

  /**
   * The element the popover is open against, or `null` while it is hidden.
   * A renderer about to recycle an element checks whether the popover is
   * anchored inside it.
   *
   * @internal
   */
  getAnchor(): HTMLElement | null {
    return this.destroyed ? null : this.currentAnchor;
  }

  /**
   * Display the popover anchored to `anchor`, listing `annotations` by scope
   * (row, then column, then cell), each scope in the order given, five at
   * most each. Annotations the severity filter hides are left out; when it
   * hides every one, or `annotations` is empty, the popover hides instead.
   */
  show(anchor: HTMLElement, annotations: readonly Annotation[]): void {
    if (this.destroyed || this.portalTarget === null) return;
    const sections = sectionsOf(annotations);
    this.display(anchor, sections, () => sections);
  }

  /**
   * {@link AnnotationPopover.show}, reading the anchor's annotations from
   * `source`, which a refresh reads again (see `requestRefresh`): the grid's
   * cells and headers open the popover this way, so it follows the store
   * while it is open. Hides the popover when `source` gives nothing.
   *
   * @internal
   */
  showFrom(anchor: HTMLElement, source: AnnotationSource): void {
    if (this.destroyed || this.portalTarget === null) return;
    const sections = source();
    if (sections) this.display(anchor, sections, source);
    else this.hide();
  }

  /**
   * Bring an open popover up to date with the store, once the current task's
   * changes are in: a microtask later, so a loop of changes refreshes it
   * once. Its anchor's annotations are read again; the popover is rewritten
   * only if what it shows changed, and hides when it would show nothing.
   * Nothing happens while it is hidden. A popover opened with
   * {@link AnnotationPopover.show} applies the severity filter again to the
   * annotations it was given.
   *
   * @internal
   */
  requestRefresh(): void {
    if (this.destroyed || !this.currentAnchor || this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      this.refresh();
    });
  }

  /** {@link AnnotationPopover.show}'s work, from sections and where to read them again. */
  private display(
    anchor: HTMLElement,
    sections: AnnotationSections,
    source: AnnotationSource,
  ): void {
    const view = this.viewOf(sections);
    if (!view.some((section) => section.shown.length > 0)) {
      this.hide();
      return;
    }

    const el = this.ensureElement();
    this.cancelGraceHide();
    // Rewritten only when what it shows changed: `aria-live` re-announces a
    // rewrite, which focus moving back onto the same cell would cause.
    if (this.currentAnchor !== anchor || !sameView(view, this.view)) this.populate(el, view);
    this.view = view;
    this.source = source;

    // Clear the previous anchor's aria-describedby before re-pointing the
    // popover. Without this, a sequence of show(A) → show(B) leaves A
    // claiming an active description that no longer belongs to it.
    if (this.currentAnchor && this.currentAnchor !== anchor) {
      if (this.currentAnchor.getAttribute('aria-describedby') === this.popoverId) {
        this.currentAnchor.removeAttribute('aria-describedby');
      }
    }

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
    this.view = null;
    this.source = null;
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

  /** `requestRefresh`'s work, in its microtask. */
  private refresh(): void {
    const anchor = this.currentAnchor;
    const el = this.element;
    if (this.destroyed || !anchor || !el) return;
    const sections = this.source?.() ?? null;
    const view = sections ? this.viewOf(sections) : null;
    if (!view || !view.some((section) => section.shown.length > 0)) {
      this.hide();
      return;
    }
    if (sameView(view, this.view)) return;
    this.populate(el, view);
    this.view = view;
    this.position(anchor, el);
  }

  /**
   * What the popover shows for `sections` under the severity filter in
   * force: a view per scope that holds anything, shown or hidden.
   */
  private viewOf(sections: AnnotationSections): SectionView[] {
    const filter = this.readSeverityFilter?.() ?? null;
    const views: SectionView[] = [];
    for (const scope of SCOPES) {
      const list = sections[scope];
      if (!list || list.length === 0) continue;
      const shown: Annotation[] = [];
      let visible = 0;
      let hidden = 0;
      for (const ann of list) {
        // A severity outside the allow-list is listed, unstyled.
        const index = severityIndex(ann.severity);
        if (filter && index >= 0 && !filter[SEVERITIES[index]!]) {
          hidden++;
          continue;
        }
        visible++;
        if (shown.length < MAX_ENTRIES_PER_SECTION) shown.push(ann);
      }
      views.push({ scope, shown, more: visible - shown.length, hidden });
    }
    return views;
  }

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
    // Focus inside it, once it scrolls and takes focus, holds it open as the
    // pointer does.
    el.addEventListener('focusin', this.onPopoverPointerEnter);
    el.addEventListener('focusout', this.onPopoverFocusOut);
    this.portalTarget.appendChild(el);
    this.element = el;
    return el;
  }

  private populate(el: HTMLElement, view: readonly SectionView[]): void {
    const p = this.classPrefix;
    const strings = this.messages.annotations.popover;
    const titles: Record<AnnotationScope, string> = {
      row: strings.rowTitle,
      column: strings.columnTitle,
      cell: strings.cellTitle,
    };
    const sections: HTMLElement[] = [];
    for (const section of view) {
      const sectionEl = document.createElement('section');
      sectionEl.className = `${p}-annotation-popover__group ${p}-annotation-popover__group--${section.scope}`;

      const title = document.createElement('h4');
      title.className = `${p}-annotation-popover__group-title`;
      title.textContent = titles[section.scope];
      sectionEl.appendChild(title);

      if (section.shown.length > 0) {
        const list = document.createElement('ul');
        list.className = `${p}-annotation-popover__list`;
        for (const ann of section.shown) list.appendChild(this.renderEntry(ann));
        sectionEl.appendChild(list);
      }
      if (section.more > 0) {
        const more = document.createElement('p');
        more.className = `${p}-annotation-popover__more`;
        more.textContent = strings.moreEntries(section.more);
        sectionEl.appendChild(more);
      }
      if (section.hidden > 0) {
        const hidden = document.createElement('p');
        hidden.className = `${p}-annotation-popover__hidden`;
        hidden.textContent = strings.hiddenBySeverityFilter(section.hidden);
        sectionEl.appendChild(hidden);
      }
      sections.push(sectionEl);
    }
    el.replaceChildren(...sections);
  }

  /**
   * Render one annotation entry. All app-supplied strings (`message`,
   * `code`, `source`) are written via `.textContent`; structure is built
   * with `createElement` + `appendChild`. No HTML parsing path exists.
   */
  private renderEntry(ann: Annotation): HTMLLIElement {
    const p = this.classPrefix;
    const index = severityIndex(ann.severity);
    const severity = index >= 0 ? SEVERITIES[index]! : null;

    const li = document.createElement('li');
    li.className = severity
      ? `${p}-annotation-entry ${p}-annotation-entry--${severity}`
      : `${p}-annotation-entry`;

    const pill = document.createElement('span');
    pill.className = severity
      ? `${p}-annotation-pill ${p}-annotation-pill--${severity}`
      : `${p}-annotation-pill`;
    pill.textContent = severity
      ? this.messages.annotations.severityNames[severity]
      : String(ann.severity);
    li.appendChild(pill);

    const body = document.createElement('div');
    body.className = `${p}-annotation-body`;

    const msg = document.createElement('div');
    msg.className = `${p}-annotation-message`;
    msg.textContent = ann.message;
    body.appendChild(msg);

    if (ann.code || ann.source) {
      const meta = document.createElement('div');
      meta.className = `${p}-annotation-meta`;
      const parts: string[] = [];
      if (ann.code) parts.push(ann.code);
      if (ann.source) parts.push(ann.source);
      meta.textContent = parts.join(' · ');
      body.appendChild(meta);
    }

    li.appendChild(body);
    return li;
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

    // A popover that scrolls is a tab stop, so the keyboard can scroll it
    // too (WCAG 2.1.1); one that fits is not.
    const tabIndex = el.scrollHeight > el.clientHeight ? '0' : '-1';
    if (el.getAttribute('tabindex') !== tabIndex) el.setAttribute('tabindex', tabIndex);
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
