/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModalHost, __resetModalHostForTests } from '@/core/ModalHost';

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
  it('sets body.padding-right on first modal open and restores on last close', () => {
    // Simulate scrollbar presence: innerWidth > clientWidth.
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
    ha.open({ mode: 'modal', element: a.backdrop, dialog: a.dialog });
    expect(document.body.style.paddingRight).toBe('15px');

    hb.open({ mode: 'modal', element: b.backdrop, dialog: b.dialog });
    // Second open does not re-set padding.
    expect(document.body.style.paddingRight).toBe('15px');

    hb.close();
    // Still locked — one modal remains.
    expect(document.body.style.paddingRight).toBe('15px');

    ha.close();
    // Last close restores.
    expect(document.body.style.paddingRight).toBe('');
  });

  it('does not apply scroll lock in panel mode', () => {
    const panel = makePanel();
    const host = new ModalHost();
    host.open({ mode: 'panel', element: panel });
    expect(document.body.style.paddingRight).toBe('');
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
