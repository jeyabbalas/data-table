/**
 * @vitest-environment jsdom
 *
 * Phase 7 ModalHost color-scheme inheritance:
 *   - When `colorSchemeSource` is passed, the source's `data-dt-color-scheme`
 *     attribute is copied onto the modal element on open.
 *   - Changes to the source's attribute propagate to the modal via
 *     MutationObserver while the modal is open.
 *   - On close, the observer disconnects and further source changes are
 *     not reflected.
 *   - If the source has no attribute, the modal element is left untouched.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModalHost, __resetModalHostForTests } from '@/core/ModalHost';

function makeModal(): { backdrop: HTMLElement; dialog: HTMLElement } {
  const backdrop = document.createElement('div');
  const dialog = document.createElement('div');
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  return { backdrop, dialog };
}

function makeSource(scheme?: 'light' | 'dark'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dt-root';
  if (scheme) el.setAttribute('data-dt-color-scheme', scheme);
  document.body.appendChild(el);
  return el;
}

function flushMutations(): Promise<void> {
  // MutationObserver callbacks fire in a microtask.
  return Promise.resolve().then(() => Promise.resolve());
}

beforeEach(() => {
  document.body.innerHTML = '';
  __resetModalHostForTests();
});

afterEach(() => {
  __resetModalHostForTests();
  document.body.innerHTML = '';
});

describe('ModalHost — colorSchemeSource (Phase 7)', () => {
  it('copies the attribute from source to modal element on open', () => {
    const source = makeSource('dark');
    const { backdrop, dialog } = makeModal();
    const host = new ModalHost();
    host.open({
      mode: 'modal',
      element: backdrop,
      dialog,
      colorSchemeSource: source,
    });
    expect(backdrop.getAttribute('data-dt-color-scheme')).toBe('dark');
    host.close();
  });

  it('does not write an attribute when the source has none', () => {
    const source = makeSource();
    const { backdrop, dialog } = makeModal();
    const host = new ModalHost();
    host.open({
      mode: 'modal',
      element: backdrop,
      dialog,
      colorSchemeSource: source,
    });
    expect(backdrop.hasAttribute('data-dt-color-scheme')).toBe(false);
    host.close();
  });

  it('propagates source attribute changes to the modal while open', async () => {
    const source = makeSource('light');
    const { backdrop, dialog } = makeModal();
    const host = new ModalHost();
    host.open({
      mode: 'modal',
      element: backdrop,
      dialog,
      colorSchemeSource: source,
    });
    expect(backdrop.getAttribute('data-dt-color-scheme')).toBe('light');

    source.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();
    expect(backdrop.getAttribute('data-dt-color-scheme')).toBe('dark');

    source.removeAttribute('data-dt-color-scheme');
    await flushMutations();
    expect(backdrop.hasAttribute('data-dt-color-scheme')).toBe(false);

    host.close();
  });

  it('stops observing source changes after close', async () => {
    const source = makeSource('dark');
    const { backdrop, dialog } = makeModal();
    const host = new ModalHost();
    host.open({
      mode: 'modal',
      element: backdrop,
      dialog,
      colorSchemeSource: source,
    });
    host.close();

    source.setAttribute('data-dt-color-scheme', 'light');
    await flushMutations();
    // The modal attribute was cleared on close (since the modal didn't carry
    // the attribute before open); subsequent source changes must not mutate it.
    expect(backdrop.hasAttribute('data-dt-color-scheme')).toBe(false);
  });

  it('preserves a caller-set attribute on close (does not clobber)', () => {
    const source = makeSource('dark');
    const { backdrop, dialog } = makeModal();
    // Caller pre-sets the attribute before open (e.g. via a class).
    backdrop.setAttribute('data-dt-color-scheme', 'light');
    const host = new ModalHost();
    host.open({
      mode: 'modal',
      element: backdrop,
      dialog,
      colorSchemeSource: source,
    });
    // The source overrides during the open window.
    expect(backdrop.getAttribute('data-dt-color-scheme')).toBe('dark');
    host.close();
    // On close, the attribute remains (caller had it before open).
    expect(backdrop.getAttribute('data-dt-color-scheme')).toBe('dark');
  });

  it('works for panel mode as well', () => {
    const source = makeSource('dark');
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const host = new ModalHost();
    host.open({
      mode: 'panel',
      element: panel,
      colorSchemeSource: source,
    });
    expect(panel.getAttribute('data-dt-color-scheme')).toBe('dark');
    host.close();
  });
});
