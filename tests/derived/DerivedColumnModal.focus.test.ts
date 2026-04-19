/**
 * @vitest-environment jsdom
 *
 * Verifies DerivedColumnModal's ModalHost wiring: ARIA, focus restore, and
 * the CodeMirror autocomplete escape-guard.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { DerivedColumnModal } from '@/derived/DerivedColumnModal';
import { createTableState } from '@/core/State';
import type { TableState } from '@/core/State';
import type { StateActions } from '@/core/Actions';
import { __resetModalHostForTests } from '@/core/ModalHost';

beforeAll(() => {
  if (!document.createRange) {
    document.createRange = () =>
      ({
        setStart: () => {},
        setEnd: () => {},
        commonAncestorContainer: document.body,
        getClientRects: () => [],
        getBoundingClientRect: () => ({
          top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0,
          x: 0, y: 0, toJSON: () => {},
        }),
        createContextualFragment: (html: string) => {
          const template = document.createElement('template');
          template.innerHTML = html;
          return template.content;
        },
      } as unknown as Range);
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function createMockActions(): StateActions {
  return {
    validateDerivedExpression: vi
      .fn()
      .mockResolvedValue({ valid: true, resultType: 'INTEGER' }),
    addExpressionColumn: vi.fn(),
    addVectorColumn: vi.fn(),
    getCompletionContext: vi
      .fn()
      .mockReturnValue({ columns: [{ name: 'age', type: 'INTEGER' }], functions: [] }),
  } as unknown as StateActions;
}

describe('DerivedColumnModal — focus + escape-guard', () => {
  let state: TableState;
  let actions: StateActions;
  let modal: DerivedColumnModal;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    __resetModalHostForTests();
    state = createTableState();
    actions = createMockActions();

    opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    modal = new DerivedColumnModal(state, actions, { instanceId: 'd' });
    document.body.appendChild(modal.getElement());
  });

  afterEach(() => {
    modal.destroy();
    document.body.innerHTML = '';
    __resetModalHostForTests();
  });

  it('sets ARIA, closes on Escape, restores focus', () => {
    modal.open();
    const dialog = modal
      .getElement()
      .querySelector('.dt-derived-modal-dialog') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('dt-d-derived-modal-title');

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getIsOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('escape-guard blocks close while CodeMirror autocomplete is open', () => {
    modal.open();
    const tip = document.createElement('div');
    tip.className = 'cm-tooltip-autocomplete';
    document.body.appendChild(tip);

    const dialog = modal
      .getElement()
      .querySelector('.dt-derived-modal-dialog') as HTMLElement;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getIsOpen()).toBe(true);

    tip.remove();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getIsOpen()).toBe(false);
  });
});
