/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModalHost, __resetModalHostForTests, onAnyModalOpened } from '@/core/ModalHost';

function makeModalPair(): { backdrop: HTMLElement; dialog: HTMLElement } {
  const backdrop = document.createElement('div');
  backdrop.className = 'bd';
  const dialog = document.createElement('div');
  dialog.className = 'dg';
  const btn1 = document.createElement('button');
  btn1.textContent = 'one';
  const btn2 = document.createElement('button');
  btn2.textContent = 'two';
  const btn3 = document.createElement('button');
  btn3.textContent = 'three';
  dialog.appendChild(btn1);
  dialog.appendChild(btn2);
  dialog.appendChild(btn3);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  return { backdrop, dialog };
}

function makePanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'pn';
  const input = document.createElement('input');
  input.type = 'text';
  panel.appendChild(input);
  document.body.appendChild(panel);
  return panel;
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

describe('ModalHost — ARIA', () => {
  it('sets role="dialog" and aria-modal on modal open; clears aria-modal on close', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({
      mode: 'modal',
      element: backdrop,
      dialog,
      labelledBy: 'title-id',
    });
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('title-id');

    host.close();
    expect(dialog.getAttribute('aria-modal')).toBeNull();
    // role persists — components set it once at construction.
  });

  it('omits aria-modal on panel open', () => {
    const panel = makePanel();
    const host = new ModalHost();
    host.open({ mode: 'panel', element: panel });
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBeNull();
    host.close();
  });
});

describe('ModalHost — stacking', () => {
  it('assigns increasing z-index to subsequently opened hosts', () => {
    const a = makeModalPair();
    const b = makeModalPair();
    const ha = new ModalHost();
    const hb = new ModalHost();
    ha.open({ mode: 'modal', element: a.backdrop, dialog: a.dialog });
    hb.open({ mode: 'modal', element: b.backdrop, dialog: b.dialog });
    const za = parseInt(a.backdrop.style.zIndex, 10);
    const zb = parseInt(b.backdrop.style.zIndex, 10);
    expect(za).toBeLessThan(zb);
  });

  it('clears inline z-index on close', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });
    expect(backdrop.style.zIndex).not.toBe('');
    host.close();
    expect(backdrop.style.zIndex).toBe('');
  });
});

describe('ModalHost — scroll lock', () => {
  // Dispatch a cancelable wheel event on `document` and report whether any
  // listener called preventDefault. We use dispatchEvent rather than trigger
  // helpers so we can inspect the `defaultPrevented` flag directly.
  function wheelWasBlocked(target: EventTarget): boolean {
    const ev = new Event('wheel', { bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  }

  it('does not mutate body.padding-right or body.overflow across modal open/close', () => {
    // Simulate scrollbar presence so any stale "compensation" code would trigger.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1009,
    });

    const a = makeModalPair();
    const b = makeModalPair();
    const ha = new ModalHost();
    const hb = new ModalHost();

    expect(document.body.style.paddingRight).toBe('');
    expect(document.body.style.overflow).toBe('');

    ha.open({ mode: 'modal', element: a.backdrop, dialog: a.dialog });
    expect(document.body.style.paddingRight).toBe('');
    expect(document.body.style.overflow).toBe('');

    hb.open({ mode: 'modal', element: b.backdrop, dialog: b.dialog });
    expect(document.body.style.paddingRight).toBe('');
    expect(document.body.style.overflow).toBe('');

    hb.close();
    ha.close();
    expect(document.body.style.paddingRight).toBe('');
    expect(document.body.style.overflow).toBe('');
  });

  it('installs wheel/touchmove scroll prevention on first modal open and removes on last close', () => {
    const a = makeModalPair();
    const b = makeModalPair();
    const ha = new ModalHost();
    const hb = new ModalHost();

    // Before any modal opens, a wheel event outside the dialog is not blocked.
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    expect(wheelWasBlocked(outside)).toBe(false);

    ha.open({ mode: 'modal', element: a.backdrop, dialog: a.dialog });
    // Wheel outside any open dialog is now blocked.
    expect(wheelWasBlocked(outside)).toBe(true);
    // Wheel inside the open dialog is allowed (not prevented).
    expect(wheelWasBlocked(a.dialog)).toBe(false);

    hb.open({ mode: 'modal', element: b.backdrop, dialog: b.dialog });
    expect(wheelWasBlocked(outside)).toBe(true);
    expect(wheelWasBlocked(b.dialog)).toBe(false);

    hb.close();
    // One modal still open — prevention stays installed.
    expect(wheelWasBlocked(outside)).toBe(true);

    ha.close();
    // Last close — prevention removed.
    expect(wheelWasBlocked(outside)).toBe(false);
  });

  it('does not apply scroll lock in panel mode', () => {
    const panel = makePanel();
    const host = new ModalHost();

    const outside = document.createElement('div');
    document.body.appendChild(outside);

    host.open({ mode: 'panel', element: panel });
    expect(document.body.style.paddingRight).toBe('');
    expect(wheelWasBlocked(outside)).toBe(false);
    host.close();
  });
});

describe('ModalHost — Escape', () => {
  it('closes on Escape by default', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    const onClose = vi.fn();
    host.open({ mode: 'modal', element: backdrop, dialog, onClose });
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(host.isOpen).toBe(false);
  });

  it('respects escapeGuard (returns true → skip close)', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    const onClose = vi.fn();
    host.open({
      mode: 'modal',
      element: backdrop,
      dialog,
      onClose,
      escapeGuard: () => true,
    });
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    expect(host.isOpen).toBe(true);
    host.close();
  });

  it('respects closeOnEscape: false', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog, closeOnEscape: false });
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.isOpen).toBe(true);
    host.close();
  });
});

describe('ModalHost — focus trap', () => {
  it('wraps Tab from last focusable to first', () => {
    const { backdrop, dialog } = makeModalPair();
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });

    buttons[2].focus();
    expect(document.activeElement).toBe(buttons[2]);

    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    dialog.dispatchEvent(ev);
    expect(document.activeElement).toBe(buttons[0]);
    host.close();
  });

  it('wraps Shift+Tab from first focusable to last', () => {
    const { backdrop, dialog } = makeModalPair();
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });

    buttons[0].focus();
    const ev = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });
    dialog.dispatchEvent(ev);
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    host.close();
  });
});

describe('ModalHost — focus restore', () => {
  it('restores focus to the opener on close', () => {
    const opener = document.createElement('button');
    opener.textContent = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });

    host.close();
    expect(document.activeElement).toBe(opener);
  });

  it('falls back gracefully when opener is removed from the DOM', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });

    opener.remove();
    // Must not throw.
    expect(() => host.close()).not.toThrow();
  });

  it('leaves focus alone when close overrides restoreFocus', () => {
    const opener = document.createElement('button');
    const elsewhere = document.createElement('button');
    document.body.append(opener, elsewhere);
    opener.focus();

    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });

    // The caller is about to detach `opener`, so the restore would focus a
    // doomed node — and `focus({ preventScroll: false })` would scroll it
    // into view on the way. It takes over parking focus itself.
    elsewhere.focus();
    host.close({ restoreFocus: false });

    expect(document.activeElement).toBe(elsewhere);
  });

  it('still restores by default when close is given no overrides', () => {
    const opener = document.createElement('button');
    const elsewhere = document.createElement('button');
    document.body.append(opener, elsewhere);
    opener.focus();

    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });

    elsewhere.focus();
    host.close({});

    expect(document.activeElement).toBe(opener);
  });
});

describe('ModalHost — outsideClickIgnore (panel mode)', () => {
  it('ignores clicks matching a selector', () => {
    const panel = makePanel();
    const anchor = document.createElement('button');
    anchor.className = 'my-anchor';
    document.body.appendChild(anchor);
    const host = new ModalHost();
    const onClose = vi.fn();
    host.open({
      mode: 'panel',
      element: panel,
      onClose,
      outsideClickIgnore: ['.my-anchor'],
    });

    // Flush the deferred-register so the outside-click listener is active.
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        anchor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(onClose).not.toHaveBeenCalled();

        // A click truly outside both the panel and the anchor closes the panel.
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(onClose).toHaveBeenCalledOnce();
        resolve();
      });
    });
  });

  it('ignores clicks matching an element ref', () => {
    const panel = makePanel();
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const host = new ModalHost();
    const onClose = vi.fn();
    host.open({
      mode: 'panel',
      element: panel,
      onClose,
      outsideClickIgnore: [anchor],
    });
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        anchor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(onClose).not.toHaveBeenCalled();
        host.close();
        resolve();
      });
    });
  });
});

describe('ModalHost — backdrop click (modal mode)', () => {
  it('closes when the backdrop element itself is clicked', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    const onClose = vi.fn();
    host.open({ mode: 'modal', element: backdrop, dialog, onClose });

    // Synthesize an event whose target is the backdrop (not the dialog).
    const ev = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(ev, 'target', { value: backdrop });
    backdrop.dispatchEvent(ev);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when a child of the dialog is clicked', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    const onClose = vi.fn();
    host.open({ mode: 'modal', element: backdrop, dialog, onClose });

    const inner = dialog.querySelector('button')!;
    const ev = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(ev, 'target', { value: inner });
    backdrop.dispatchEvent(ev);
    expect(onClose).not.toHaveBeenCalled();
    host.close();
  });
});

describe('ModalHost — destroy', () => {
  it('no-ops on open/close after destroy', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.destroy();
    expect(() => host.open({ mode: 'modal', element: backdrop, dialog })).not.toThrow();
    expect(host.isOpen).toBe(false);
    expect(() => host.close()).not.toThrow();
  });

  it('closing while open is safe', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });
    expect(() => host.destroy()).not.toThrow();
    expect(host.isOpen).toBe(false);
  });
});

describe('ModalHost — events', () => {
  it('emits opened and closed with correct payloads', () => {
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    const opened = vi.fn();
    const closed = vi.fn();
    host.events.on('opened', opened);
    host.events.on('closed', closed);
    host.open({ mode: 'modal', element: backdrop, dialog });
    expect(opened).toHaveBeenCalledWith({ stackIndex: 0 });
    host.close();
    expect(closed).toHaveBeenCalledOnce();
    expect(closed.mock.calls[0][0]).toHaveProperty('restoredFocus');
  });
});

describe('ModalHost — onAnyModalOpened', () => {
  it('fires the handler when any host opens (modal mode)', () => {
    const handler = vi.fn();
    const unsubscribe = onAnyModalOpened(handler);
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });
    expect(handler).toHaveBeenCalledOnce();
    host.close();
    unsubscribe();
  });

  it('fires the handler for panel mode opens too', () => {
    const handler = vi.fn();
    const unsubscribe = onAnyModalOpened(handler);
    const panel = makePanel();
    const host = new ModalHost();
    host.open({ mode: 'panel', element: panel });
    expect(handler).toHaveBeenCalledOnce();
    host.close();
    unsubscribe();
  });

  it('fires every subscribed handler on each open', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unA = onAnyModalOpened(a);
    const unB = onAnyModalOpened(b);
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    host.close();
    unA();
    unB();
  });

  it('unsubscribed handler does not fire on subsequent opens', () => {
    const handler = vi.fn();
    const unsubscribe = onAnyModalOpened(handler);
    unsubscribe();
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });
    expect(handler).not.toHaveBeenCalled();
    host.close();
  });

  it('a throwing handler does not block other handlers', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const thrower = vi.fn(() => {
      throw new Error('boom');
    });
    const ok = vi.fn();
    const unA = onAnyModalOpened(thrower);
    const unB = onAnyModalOpened(ok);
    const { backdrop, dialog } = makeModalPair();
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });
    expect(thrower).toHaveBeenCalledOnce();
    expect(ok).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalled();
    host.close();
    unA();
    unB();
    errorSpy.mockRestore();
  });
});
