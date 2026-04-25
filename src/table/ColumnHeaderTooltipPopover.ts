/**
 * ColumnHeaderTooltipPopover — singleton floating panel that renders an
 * app-controlled, structured tooltip on a column header's name span.
 *
 * One instance per {@link DataTable}; shared across every column header.
 * Owned by `createDataTable`, passed as an option into `ColumnHeader`, and
 * destroyed when the table tears down.
 *
 * The popover's DOM element is lazy-created on first {@link show} and
 * mounted to `portalTarget` (defaults to `document.body`). The same element
 * is reused for every subsequent show — never recreated per anchor.
 *
 * Visible lifecycle:
 * - Show on `pointerenter` / `focusin` of an annotated column-name span
 *   (driven from `ColumnHeader`).
 * - Hide on `Escape`, click outside (both popover and anchor), viewport
 *   scroll, window resize, or explicit `hide()`.
 * - A 120 ms grace period on `pointerleave` allows users to move the cursor
 *   from anchor into popover content without flicker.
 *
 * A11y:
 * - `role="tooltip"`, `aria-live="polite"`.
 * - Stable element id; `show()` writes `aria-describedby` on the anchor and
 *   `hide()` clears it.
 * - `tabindex="-1"` on the popover so keyboard users can Tab past it.
 *
 * Safety:
 * - Every text-bearing node is set via `.textContent`. The single
 *   `el.innerHTML = ''` in `populate()` is a clear (no interpolation).
 *   App-supplied strings are NEVER parsed as HTML.
 *
 * SSR / no-DOM guard: when `typeof document === 'undefined'`, the constructor
 * and every public method are no-ops so unit tests instantiating a
 * `DataTable` in a `node` env don't throw.
 */

import type {
  ColumnHeaderTooltipContent,
  ColumnHeaderTooltipItem,
} from '../core/types';
import { onAnyModalOpened } from '../core/ModalHost';

/** Options accepted by {@link ColumnHeaderTooltipPopover}. */
export interface ColumnHeaderTooltipPopoverOptions {
  /** CSS class prefix (default: `'dt'`). */
  classPrefix?: string;
  /** Where to mount the popover element. Defaults to `document.body`. */
  portalTarget?: HTMLElement;
}

let popoverInstanceCounter = 0;

const GRACE_MS = 120;
const EDGE_PAD = 4;

/**
 * Render the popover's inner DOM into `el`, replacing prior content.
 * All app-supplied strings are inserted via `.textContent` to prevent
 * HTML injection — the structure is built with `createElement` only.
 */
function populateInto(
  el: HTMLElement,
  content: ColumnHeaderTooltipContent,
  classPrefix: string,
): void {
  el.innerHTML = '';

  if (content.title) {
    const titleEl = document.createElement('div');
    titleEl.className = `${classPrefix}-col-tooltip__title`;
    titleEl.textContent = content.title;
    el.appendChild(titleEl);
  }

  if (content.description) {
    const descEl = document.createElement('div');
    descEl.className = `${classPrefix}-col-tooltip__description`;
    descEl.textContent = content.description;
    el.appendChild(descEl);
  }

  if (content.items && content.items.length > 0) {
    const list = document.createElement('ul');
    list.className = `${classPrefix}-col-tooltip__items`;
    for (const item of content.items) {
      list.appendChild(renderItem(item, classPrefix));
    }
    el.appendChild(list);
  }
}

function renderItem(
  item: ColumnHeaderTooltipItem,
  classPrefix: string,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `${classPrefix}-col-tooltip__item`;

  const labelEl = document.createElement('span');
  labelEl.className = `${classPrefix}-col-tooltip__item-label`;
  labelEl.textContent = item.label;
  li.appendChild(labelEl);

  if (Array.isArray(item.value)) {
    const valuesEl = document.createElement('span');
    valuesEl.className = `${classPrefix}-col-tooltip__item-values`;
    for (const v of item.value) {
      const chip = document.createElement('span');
      chip.className = `${classPrefix}-col-tooltip__chip`;
      chip.textContent = v;
      valuesEl.appendChild(chip);
    }
    li.appendChild(valuesEl);
  } else {
    const valueEl = document.createElement('span');
    valueEl.className = `${classPrefix}-col-tooltip__item-value`;
    valueEl.textContent = item.value;
    li.appendChild(valueEl);
  }

  return li;
}

/** True when the content has at least one renderable field. */
function hasRenderableContent(content: ColumnHeaderTooltipContent): boolean {
  if (content.title) return true;
  if (content.description) return true;
  if (content.items && content.items.length > 0) return true;
  return false;
}

export class ColumnHeaderTooltipPopover {
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

  constructor(options: ColumnHeaderTooltipPopoverOptions = {}) {
    this.classPrefix = options.classPrefix ?? 'dt';
    this.portalTarget =
      typeof document === 'undefined'
        ? null
        : (options.portalTarget ?? document.body);
    this.popoverId = `${this.classPrefix}-col-tooltip-${++popoverInstanceCounter}`;

    this.onDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide();
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

    // Self-dismiss whenever any ModalHost-backed panel or modal opens —
    // mirrors AnnotationPopover so opening a filter / preset / derived modal
    // while the tooltip is showing closes it.
    this.unsubscribeModalOpen = onAnyModalOpened(() => this.hide());
  }

  /** Element id for the popover. Anchors write this into `aria-describedby`. */
  getId(): string {
    return this.popoverId;
  }

  /** The popover's DOM element, or null until first {@link show}. */
  getElement(): HTMLElement | null {
    return this.element;
  }

  /** `true` if the popover is currently anchored to `anchor`. */
  isOpenFor(anchor: HTMLElement): boolean {
    return (
      !this.destroyed &&
      this.currentAnchor === anchor &&
      this.element?.style.display !== 'none'
    );
  }

  /** `true` if the popover is open against any anchor. */
  isOpen(): boolean {
    return !this.destroyed && this.currentAnchor !== null;
  }

  /**
   * Display the popover anchored to `anchor` with the given content.
   * Empty content (no title, description, or items) hides the popover.
   */
  show(anchor: HTMLElement, content: ColumnHeaderTooltipContent): void {
    if (this.destroyed || this.portalTarget === null) return;
    if (!hasRenderableContent(content)) {
      this.hide();
      return;
    }

    const el = this.ensureElement();
    this.cancelGraceHide();
    populateInto(el, content, this.classPrefix);

    // Mark open BEFORE positioning so listeners that read `currentAnchor` are correct.
    this.currentAnchor = anchor;
    anchor.setAttribute('aria-describedby', this.popoverId);

    this.inheritColorScheme(anchor, el);

    el.style.display = 'block';
    this.position(anchor, el);

    document.addEventListener('keydown', this.onDocumentKeyDown, true);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.addEventListener('scroll', this.onWindowScroll, true);
    window.addEventListener('resize', this.onWindowResize);
  }

  /**
   * Re-render the popover in place when content changes for the currently
   * shown anchor. No-op when not currently shown for `anchor` (so callers
   * can safely invoke this on every signal change without forcing the
   * popover open).
   */
  refresh(anchor: HTMLElement, content: ColumnHeaderTooltipContent): void {
    if (this.destroyed) return;
    if (!this.isOpenFor(anchor)) return;
    if (!hasRenderableContent(content)) {
      this.hide();
      return;
    }
    const el = this.element;
    if (!el) return;
    populateInto(el, content, this.classPrefix);
    this.position(anchor, el);
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
      throw new Error('ColumnHeaderTooltipPopover: no portal target available');
    }
    const el = document.createElement('div');
    el.className = `${this.classPrefix}-col-tooltip`;
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
