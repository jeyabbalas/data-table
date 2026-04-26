/**
 * @vitest-environment jsdom
 *
 * Phase 3 ModalHost test gaps:
 *
 *   1. Nested-modal Esc closes only the inner modal; the outer stays open
 *      and retains the topmost remaining z-index. Focus returns to the
 *      inner's opener (a button inside the outer modal).
 *   2. `destroy()` without a prior `close()` cleans up document-level event
 *      listeners and releases the open-stack reservation.
 *   3. Mixed inline panel + portalled modal stacking — the modal must sit
 *      above the panel regardless of open order (modal base z = 1000,
 *      panel base z = 50; see `ModalHost.ts:131`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModalHost, __resetModalHostForTests } from '@/core/ModalHost';

function makeModalPair(name: string): {
  backdrop: HTMLElement;
  dialog: HTMLElement;
  buttons: HTMLButtonElement[];
} {
  const backdrop = document.createElement('div');
  backdrop.className = `bd-${name}`;
  const dialog = document.createElement('div');
  dialog.className = `dg-${name}`;
  const buttons: HTMLButtonElement[] = [];
  for (const label of ['one', 'two', 'three']) {
    const btn = document.createElement('button');
    btn.textContent = `${name}-${label}`;
    dialog.appendChild(btn);
    buttons.push(btn);
  }
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  return { backdrop, dialog, buttons };
}

function makePanel(name: string): {
  panel: HTMLElement;
  buttons: HTMLButtonElement[];
} {
  const panel = document.createElement('div');
  panel.className = `pn-${name}`;
  const buttons: HTMLButtonElement[] = [];
  for (const label of ['p1', 'p2']) {
    const btn = document.createElement('button');
    btn.textContent = `${name}-${label}`;
    panel.appendChild(btn);
    buttons.push(btn);
  }
  document.body.appendChild(panel);
  return { panel, buttons };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.style.cssText = '';
  __resetModalHostForTests();
});

afterEach(() => {
  __resetModalHostForTests();
  document.body.innerHTML = '';
  document.body.style.cssText = '';
});

// ---------------------------------------------------------------------------
// Nested-modal Esc behaviour
// ---------------------------------------------------------------------------
describe('ModalHost — nested-modal Esc closes only the inner (Phase 3)', () => {
  it('Esc on the inner dialog closes inner; outer stays open with the topmost z-index', () => {
    const outer = makeModalPair('outer');
    const inner = makeModalPair('inner');

    // The "opener" button for the inner modal sits inside the outer dialog.
    const innerOpener = outer.buttons[1]!;
    innerOpener.focus();
    expect(document.activeElement).toBe(innerOpener);

    const outerHost = new ModalHost();
    const innerHost = new ModalHost();

    outerHost.open({ mode: 'modal', element: outer.backdrop, dialog: outer.dialog });
    // Move the focus to the inner-opener for the inner host's restore target.
    innerOpener.focus();
    innerHost.open({ mode: 'modal', element: inner.backdrop, dialog: inner.dialog });

    // Both modals are open; inner has the higher z-index.
    const zOuterBefore = parseInt(outer.backdrop.style.zIndex, 10);
    const zInnerBefore = parseInt(inner.backdrop.style.zIndex, 10);
    expect(zInnerBefore).toBeGreaterThan(zOuterBefore);
    expect(outerHost.isOpen).toBe(true);
    expect(innerHost.isOpen).toBe(true);

    // Press Esc — the inner host's keydown listener fires first (the event
    // is dispatched on inner.dialog, which is its own listener target).
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    inner.dialog.dispatchEvent(esc);

    // Only inner is closed.
    expect(innerHost.isOpen).toBe(false);
    expect(outerHost.isOpen).toBe(true);
    // Outer's z-index is still set (it remains in the stack).
    expect(outer.backdrop.style.zIndex).not.toBe('');
    // Inner's z-index is cleared.
    expect(inner.backdrop.style.zIndex).toBe('');

    // Focus restored to the inner-opener button (which lives in outer dialog).
    expect(document.activeElement).toBe(innerOpener);

    outerHost.close();
  });

  it('outer modal remains responsive after the inner closes — Esc on outer closes outer', () => {
    const outer = makeModalPair('outer');
    const inner = makeModalPair('inner');

    const outerHost = new ModalHost();
    const innerHost = new ModalHost();
    outerHost.open({ mode: 'modal', element: outer.backdrop, dialog: outer.dialog });
    innerHost.open({ mode: 'modal', element: inner.backdrop, dialog: inner.dialog });

    inner.dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(innerHost.isOpen).toBe(false);
    expect(outerHost.isOpen).toBe(true);

    // Now Esc on the outer should close it.
    outer.dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(outerHost.isOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// destroy() without close()
// ---------------------------------------------------------------------------
describe('ModalHost — destroy() cleans up an open modal (Phase 3)', () => {
  it('calling destroy() while open removes document-level listeners and releases the stack reservation', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const a = makeModalPair('a');
    const ha = new ModalHost();
    ha.open({ mode: 'modal', element: a.backdrop, dialog: a.dialog });

    // Sanity check: open lock acquired wheel + touchmove listeners on document.
    // (We don't assert addEventListener calls because makeModalPair / focus may
    // also add listeners; instead we verify the symmetry on destroy.)
    expect(ha.isOpen).toBe(true);

    ha.destroy();

    // After destroy, both the wheel and touchmove listeners we installed
    // must have been torn down. Each was added with the same handler
    // function reference, so removeEventListener must have been called at
    // least once each for `wheel` and `touchmove`.
    const wheelRemovals = removeSpy.mock.calls.filter((args) => args[0] === 'wheel');
    const touchmoveRemovals = removeSpy.mock.calls.filter((args) => args[0] === 'touchmove');
    expect(wheelRemovals.length).toBeGreaterThanOrEqual(1);
    expect(touchmoveRemovals.length).toBeGreaterThanOrEqual(1);

    // Stack reservation cleared.
    expect(ha.isOpen).toBe(false);
    // z-index cleared as part of the close path that destroy() invoked.
    expect(a.backdrop.style.zIndex).toBe('');

    removeSpy.mockRestore();
  });

  it('destroy() is idempotent', () => {
    const a = makeModalPair('a');
    const ha = new ModalHost();
    ha.open({ mode: 'modal', element: a.backdrop, dialog: a.dialog });
    expect(() => {
      ha.destroy();
      ha.destroy();
    }).not.toThrow();
  });

  it('destroy() on a never-opened ModalHost is a no-op', () => {
    const ha = new ModalHost();
    expect(() => ha.destroy()).not.toThrow();
    expect(ha.isOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mixed inline panel + portalled modal stacking
// ---------------------------------------------------------------------------
describe('ModalHost — mixed panel + modal stacking (Phase 3)', () => {
  it('modal opened after panel sits above the panel (modal base 1000 > panel base 50)', () => {
    const panel = makePanel('p');
    const modal = makeModalPair('m');

    const hp = new ModalHost();
    const hm = new ModalHost();

    hp.open({ mode: 'panel', element: panel.panel });
    hm.open({ mode: 'modal', element: modal.backdrop, dialog: modal.dialog });

    const zp = parseInt(panel.panel.style.zIndex, 10);
    const zm = parseInt(modal.backdrop.style.zIndex, 10);
    expect(zp).toBeGreaterThanOrEqual(50);
    expect(zm).toBeGreaterThanOrEqual(1000);
    expect(zm).toBeGreaterThan(zp);

    hm.close();
    hp.close();
  });

  it('panel opened after modal still sits below the modal (different bases, panel never overtakes)', () => {
    const modal = makeModalPair('m');
    const panel = makePanel('p');

    const hm = new ModalHost();
    const hp = new ModalHost();

    hm.open({ mode: 'modal', element: modal.backdrop, dialog: modal.dialog });
    hp.open({ mode: 'panel', element: panel.panel });

    const zm = parseInt(modal.backdrop.style.zIndex, 10);
    const zp = parseInt(panel.panel.style.zIndex, 10);
    // The two have different bases. The panel's stack-position bonus is
    // small (DEFAULT_STACK_STEP = 2) and cannot bridge the 950 gap.
    expect(zm).toBeGreaterThan(zp);

    hp.close();
    hm.close();
  });
});
