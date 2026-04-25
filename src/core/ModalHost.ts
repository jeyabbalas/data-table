/**
 * ModalHost — centralized implementation of modal/panel cross-cutting concerns.
 *
 * Components (ExportDialog, SQLFilterModal, DerivedColumnModal, FilterPanel,
 * FilterPresetPanel, DerivedColumnEditPanel) continue to own their DOM and
 * mount it themselves. ModalHost manages:
 *
 * - z-index stacking via a module-scoped open stack
 * - reference-counted scroll lock (modal mode only)
 * - focus trap on the dialog element (Tab / Shift+Tab cycling)
 * - focus restore to the opener element on close
 * - Escape-to-close with an optional guard predicate (for CodeMirror autocomplete)
 * - backdrop-click close (modal) or outside-click close (panel)
 * - ARIA attributes: role="dialog", aria-modal (modal only), aria-labelledby,
 *   aria-describedby
 *
 * ModalHost does not mount or move DOM. Callers are responsible for mounting
 * their element (e.g. modals into `portalTarget`, panels into the table root).
 */

import { EventEmitter } from './EventEmitter';

export interface ModalOptions {
  /**
   * 'modal' enables backdrop-click close and scroll lock; 'panel' uses
   * outside-click close and no scroll lock.
   */
  mode: 'modal' | 'panel';
  /**
   * The stacked container. For modals, typically the backdrop that wraps
   * the dialog. For panels, the panel element itself. ModalHost sets its
   * inline z-index and (in modal mode) installs the backdrop-click listener.
   */
  element: HTMLElement;
  /**
   * Inner dialog that receives role/aria attributes and is the focus-trap
   * scope. Defaults to `element` when omitted (panel mode typically omits).
   */
  dialog?: HTMLElement;
  /** Optional id for aria-labelledby. */
  labelledBy?: string;
  /** Optional id for aria-describedby. */
  describedBy?: string;
  /** Callback invoked after close completes (focus restored). */
  onClose?: () => void;
  /** Close on Escape (default true). */
  closeOnEscape?: boolean;
  /** Close on click on the backdrop. Default true for modal mode. */
  closeOnBackdropClick?: boolean;
  /** Close on click outside the panel. Default true for panel mode. */
  closeOnOutsideClick?: boolean;
  /** Install Tab/Shift+Tab focus trap on the dialog (default true). */
  trapFocus?: boolean;
  /** Restore focus to the opener on close (default true). */
  restoreFocus?: boolean;
  /**
   * Element to focus after open. `null` (or omitted) focuses the first
   * focusable descendant of the dialog.
   */
  initialFocus?: HTMLElement | null;
  /**
   * Predicate invoked on Escape keydown. Return `true` to skip close (the
   * Escape is then left for another handler — e.g. CodeMirror autocomplete).
   */
  escapeGuard?: (e: KeyboardEvent) => boolean;
  /**
   * Elements or CSS selectors whose clicks should NOT count as "outside"
   * the panel. Typical use: the anchor button that toggles the panel.
   */
  outsideClickIgnore?: Array<HTMLElement | string>;
  /**
   * Element whose `data-dt-color-scheme` attribute should be mirrored onto
   * this modal/panel on open. Typically the owning table's `.dt-root`
   * element. Body-portalled modals don't inherit the attribute via DOM
   * ancestry, so copying keeps theming in sync. The copy is live: a
   * MutationObserver watches the source and re-applies when the attribute
   * changes while the modal is open.
   */
  colorSchemeSource?: HTMLElement;
}

export type ModalHostEvents = {
  opened: { stackIndex: number };
  closed: { restoredFocus: boolean };
};

// ---------------------------------------------------------------------------
// Module-scoped state: open stack + scroll-lock refcount
// ---------------------------------------------------------------------------

/** Stacking step used when no CSS custom property is readable. */
const DEFAULT_STACK_STEP = 2;
/** z-index base for modal mode. */
const MODAL_Z_BASE = 1000;
/** z-index base for panel mode. */
const PANEL_Z_BASE = 50;

const openHosts: ModalHost[] = [];

let scrollLockCount = 0;
let scrollLockHandler: ((e: Event) => void) | null = null;

type GlobalOpenListener = () => void;
const globalOpenListeners = new Set<GlobalOpenListener>();

function notifyGlobalOpen(): void {
  for (const fn of globalOpenListeners) {
    try {
      fn();
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.error('[data-table] ModalHost open listener threw', err);
      }
    }
  }
}

function readStackStep(): number {
  if (typeof window === 'undefined') return DEFAULT_STACK_STEP;
  try {
    const root = document.documentElement;
    const raw = window
      .getComputedStyle(root)
      .getPropertyValue('--dt-z-modal-stack-step')
      .trim();
    if (!raw) return DEFAULT_STACK_STEP;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_STACK_STEP;
  } catch {
    return DEFAULT_STACK_STEP;
  }
}

function computeZIndex(mode: 'modal' | 'panel', stackIndex: number): number {
  const base = mode === 'modal' ? MODAL_Z_BASE : PANEL_Z_BASE;
  return base + stackIndex * readStackStep();
}

// Scroll lock is event-based, not style-based: we install non-passive wheel
// and touchmove listeners that preventDefault outside any open dialog. We
// deliberately do NOT write to `body.style.overflow` or `body.style.padding*`.
// Mutating those shifts host-page layout (e.g. overriding a host's CSS
// `padding-right` with an inline value widens the body's content box and
// causes the data table to reflow). Since the scrollbar is never hidden,
// there is no scrollbar-width reflow to compensate for.
function acquireScrollLock(): void {
  scrollLockCount += 1;
  if (scrollLockCount > 1) return;

  scrollLockHandler = (e: Event) => {
    const target = e.target as Node | null;
    if (!target) return;
    for (const host of openHosts) {
      if (host.dialogEl && host.dialogEl.contains(target)) return;
    }
    e.preventDefault();
  };
  document.addEventListener('wheel', scrollLockHandler, { passive: false });
  document.addEventListener('touchmove', scrollLockHandler, { passive: false });
}

function releaseScrollLock(): void {
  if (scrollLockCount === 0) return;
  scrollLockCount -= 1;
  if (scrollLockCount > 0) return;

  if (scrollLockHandler) {
    document.removeEventListener('wheel', scrollLockHandler);
    document.removeEventListener('touchmove', scrollLockHandler);
    scrollLockHandler = null;
  }
}

// ---------------------------------------------------------------------------
// Focusable-descendant helper
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function focusableDescendants(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const result: HTMLElement[] = [];
  for (const el of Array.from(nodes)) {
    // Skip elements the page has explicitly hidden. We check inline styles +
    // the `hidden` attribute (portable across jsdom and browsers). A heavier
    // visibility check via getComputedStyle is avoided because jsdom's layout
    // engine returns values that don't match browser reality.
    if (el.hasAttribute('hidden')) continue;
    if (el.style.display === 'none') continue;
    if (el.style.visibility === 'hidden') continue;
    // Walk up ancestors for inline display:none / hidden.
    let hidden = false;
    for (let p: HTMLElement | null = el.parentElement; p && p !== root; p = p.parentElement) {
      if (p.hasAttribute('hidden') || p.style.display === 'none') {
        hidden = true;
        break;
      }
    }
    if (hidden) continue;
    result.push(el);
  }
  return result;
}

// ---------------------------------------------------------------------------
// ModalHost
// ---------------------------------------------------------------------------

export class ModalHost {
  readonly events: EventEmitter<ModalHostEvents> = new EventEmitter();

  private opts: ModalOptions | null = null;
  private _isOpen = false;
  private destroyed = false;

  private opener: HTMLElement | null = null;

  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private backdropMousedownHandler: ((e: MouseEvent) => void) | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private colorSchemeObserver: MutationObserver | null = null;
  private hadColorSchemeAttr = false;

  /** Publicly readable by the scroll-lock carve-out logic. */
  dialogEl: HTMLElement | null = null;

  get isOpen(): boolean {
    return this._isOpen;
  }

  open(opts: ModalOptions): void {
    if (this.destroyed || this._isOpen) return;

    this.opts = opts;
    const dialog = opts.dialog ?? opts.element;
    this.dialogEl = dialog;

    // Capture opener for focus restore.
    const active = document.activeElement;
    this.opener =
      active instanceof HTMLElement && active !== document.body ? active : null;

    // Push onto the stack and compute z-index.
    openHosts.push(this);
    const stackIndex = openHosts.length - 1;
    opts.element.style.zIndex = String(computeZIndex(opts.mode, stackIndex));

    // ARIA.
    dialog.setAttribute('role', 'dialog');
    if (opts.mode === 'modal') dialog.setAttribute('aria-modal', 'true');
    if (opts.labelledBy) dialog.setAttribute('aria-labelledby', opts.labelledBy);
    if (opts.describedBy) dialog.setAttribute('aria-describedby', opts.describedBy);
    // Ensure the dialog can receive keyboard events for the focus trap / Escape.
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');

    // Scroll lock (modal only).
    if (opts.mode === 'modal') acquireScrollLock();

    // Install backdrop-click (modal) or outside-click (panel) listener.
    if (opts.mode === 'modal' && opts.closeOnBackdropClick !== false) {
      this.backdropMousedownHandler = (e: MouseEvent) => {
        if (e.target === opts.element) this.close();
      };
      opts.element.addEventListener('mousedown', this.backdropMousedownHandler);
    }

    if (opts.mode === 'panel' && opts.closeOnOutsideClick !== false) {
      // Install after the current microtask so the opening click doesn't
      // count as an outside click.
      const register = () => {
        if (!this._isOpen) return;
        this.outsideClickHandler = (e: MouseEvent) => this.handleOutsideClick(e);
        document.addEventListener('mousedown', this.outsideClickHandler);
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(register);
      } else {
        queueMicrotask(register);
      }
    }

    // Combined keydown: focus trap + Escape.
    this.keydownHandler = (e: KeyboardEvent) => this.handleKeydown(e);
    dialog.addEventListener('keydown', this.keydownHandler);

    // Color-scheme inheritance for portalled modals.
    this.setupColorSchemeMirror(opts);

    this._isOpen = true;

    // Initial focus.
    const target = this.resolveInitialFocus();
    if (target) {
      // Defer to the next frame so any lazy-rendered content (CodeMirror,
      // async form setup) has a chance to mount before we focus.
      const focusNow = () => {
        if (!this._isOpen) return;
        try {
          target.focus({ preventScroll: false });
        } catch {
          /* focus may fail in jsdom for non-focusable targets */
        }
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusNow);
      else focusNow();
    }

    this.events.emit('opened', { stackIndex });
    notifyGlobalOpen();
  }

  close(): void {
    if (!this._isOpen) return;
    const opts = this.opts;
    if (!opts) return;

    this._isOpen = false;

    // Remove from stack.
    const ix = openHosts.indexOf(this);
    if (ix >= 0) openHosts.splice(ix, 1);

    // Clear inline z-index we set.
    opts.element.style.removeProperty('z-index');

    // ARIA cleanup: remove attributes we added.
    const dialog = this.dialogEl;
    if (dialog) {
      dialog.removeAttribute('aria-modal');
      // role + aria-labelledby stay on the element across open/close cycles
      // since components set them once at construction — leaving role and
      // labelledby in place is fine and avoids flicker.
    }

    if (this.keydownHandler && dialog) {
      dialog.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.backdropMousedownHandler) {
      opts.element.removeEventListener('mousedown', this.backdropMousedownHandler);
      this.backdropMousedownHandler = null;
    }
    if (this.outsideClickHandler) {
      document.removeEventListener('mousedown', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }

    this.teardownColorSchemeMirror(opts);

    if (opts.mode === 'modal') releaseScrollLock();

    // Focus restore.
    let restored = false;
    if (opts.restoreFocus !== false && this.opener) {
      if (document.contains(this.opener)) {
        try {
          this.opener.focus({ preventScroll: false });
          restored = true;
        } catch {
          /* ignore */
        }
      }
    }
    if (!restored && opts.restoreFocus !== false) {
      // Fallback so focus doesn't stay on a hidden element.
      try {
        document.body.focus?.();
      } catch {
        /* ignore */
      }
    }

    this.opener = null;
    this.dialogEl = null;
    this.opts = null;

    if (opts.onClose) {
      try {
        opts.onClose();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[data-table] ModalHost onClose threw', err);
      }
    }

    this.events.emit('closed', { restoredFocus: restored });
  }

  destroy(): void {
    if (this.destroyed) return;
    if (this._isOpen) this.close();
    this.destroyed = true;
    this.events.removeAllListeners();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private setupColorSchemeMirror(opts: ModalOptions): void {
    const source = opts.colorSchemeSource;
    if (!source) return;
    const target = opts.element;
    // Capture whether the target already carried the attribute so we can
    // restore the original state on close without clobbering non-library
    // attributes set by the caller.
    this.hadColorSchemeAttr = target.hasAttribute('data-dt-color-scheme');
    this.applyColorSchemeFrom(source, target);

    if (typeof MutationObserver === 'undefined') return;
    this.colorSchemeObserver = new MutationObserver(() => {
      if (this._isOpen) this.applyColorSchemeFrom(source, target);
    });
    this.colorSchemeObserver.observe(source, {
      attributes: true,
      attributeFilter: ['data-dt-color-scheme'],
    });
  }

  private teardownColorSchemeMirror(opts: ModalOptions): void {
    if (this.colorSchemeObserver) {
      this.colorSchemeObserver.disconnect();
      this.colorSchemeObserver = null;
    }
    if (opts.colorSchemeSource && !this.hadColorSchemeAttr) {
      // Remove only if we added it; callers that pre-set the attribute keep theirs.
      opts.element.removeAttribute('data-dt-color-scheme');
    }
    this.hadColorSchemeAttr = false;
  }

  private applyColorSchemeFrom(source: HTMLElement, target: HTMLElement): void {
    const value = source.getAttribute('data-dt-color-scheme');
    if (value === null) {
      if (!this.hadColorSchemeAttr) {
        target.removeAttribute('data-dt-color-scheme');
      }
    } else {
      target.setAttribute('data-dt-color-scheme', value);
    }
  }

  private resolveInitialFocus(): HTMLElement | null {
    const opts = this.opts;
    if (!opts) return null;
    if (opts.initialFocus) return opts.initialFocus;
    const dialog = this.dialogEl;
    if (!dialog) return null;
    const focusables = focusableDescendants(dialog);
    if (focusables.length > 0) return focusables[0];
    // Fall back to the dialog itself (tabindex="-1" was set in open()).
    return dialog;
  }

  private handleKeydown(e: KeyboardEvent): void {
    const opts = this.opts;
    if (!opts) return;

    if (e.key === 'Escape') {
      if (opts.closeOnEscape === false) return;
      if (opts.escapeGuard?.(e)) return;
      if (e.defaultPrevented) return;
      e.stopPropagation();
      this.close();
      return;
    }

    if (e.key === 'Tab' && opts.trapFocus !== false) {
      const dialog = this.dialogEl;
      if (!dialog) return;
      const focusables = focusableDescendants(dialog);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (!active || active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!active || active === last || !dialog.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  private handleOutsideClick(e: MouseEvent): void {
    const opts = this.opts;
    if (!opts) return;
    const target = e.target as Node | null;
    if (!target) return;

    // Inside the panel → ignore.
    if (opts.element.contains(target)) return;

    // outsideClickIgnore list.
    if (opts.outsideClickIgnore && target instanceof Element) {
      for (const entry of opts.outsideClickIgnore) {
        if (typeof entry === 'string') {
          if (target.closest(entry)) return;
        } else if (entry.contains(target)) {
          return;
        }
      }
    }

    this.close();
  }
}

// ---------------------------------------------------------------------------
// Module-level queries
// ---------------------------------------------------------------------------

/**
 * Returns true when at least one ModalHost-managed dialog or panel is open.
 * Consumers (e.g. the grid keyboard navigator) use this to defer to the open
 * modal rather than compete for keystrokes.
 */
export function isAnyModalOpen(): boolean {
  return openHosts.length > 0;
}

/**
 * Subscribe to "any ModalHost opened" events. The handler fires every time
 * any {@link ModalHost.open} call completes, regardless of mode (modal or
 * panel). Returns an unsubscribe function.
 *
 * Used by persistent floating surfaces (e.g. the annotation popover) so they
 * can self-dismiss when a panel or modal opens that would otherwise visually
 * occlude them. Surfaces that should NOT be dismissed (the modals themselves)
 * simply don't subscribe.
 */
export function onAnyModalOpened(handler: () => void): () => void {
  globalOpenListeners.add(handler);
  return () => {
    globalOpenListeners.delete(handler);
  };
}

// ---------------------------------------------------------------------------
// Test-only helper: reset module state between tests. Exported under an
// underscore name to signal it's not part of the stable API.
// ---------------------------------------------------------------------------

/** @internal */
export function __resetModalHostForTests(): void {
  for (const host of [...openHosts]) {
    try {
      host.close();
    } catch {
      /* ignore */
    }
  }
  openHosts.length = 0;
  scrollLockCount = 0;
  if (scrollLockHandler) {
    document.removeEventListener('wheel', scrollLockHandler);
    document.removeEventListener('touchmove', scrollLockHandler);
    scrollLockHandler = null;
  }
}
