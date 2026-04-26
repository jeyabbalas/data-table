/**
 * @vitest-environment jsdom
 *
 * Verifies SQLFilterModal's ModalHost wiring: ARIA, focus restore, and the
 * CodeMirror autocomplete escape-guard (Escape must NOT close the modal
 * while `.cm-tooltip-autocomplete` is present in the DOM).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { SQLFilterModal } from '@/filters/SQLFilterModal';
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
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => {},
        }),
        createContextualFragment: (html: string) => {
          const template = document.createElement('template');
          template.innerHTML = html;
          return template.content;
        },
      }) as unknown as Range;
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
    validateSQLFilter: vi.fn().mockResolvedValue({ valid: true, matchCount: 0 }),
    addRawSQLFilter: vi.fn().mockReturnValue('id'),
    updateRawSQLFilter: vi.fn(),
    removeRawSQLFilter: vi.fn(),
    getCompletionContext: vi
      .fn()
      .mockReturnValue({ columns: [{ name: 'age', type: 'INTEGER' }], functions: [] }),
  } as unknown as StateActions;
}

describe('SQLFilterModal — focus + escape-guard', () => {
  let state: TableState;
  let actions: StateActions;
  let modal: SQLFilterModal;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    __resetModalHostForTests();
    state = createTableState();
    actions = createMockActions();

    opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    modal = new SQLFilterModal(state, actions, { instanceId: 'q' });
    document.body.appendChild(modal.getElement());
  });

  afterEach(() => {
    modal.destroy();
    document.body.innerHTML = '';
    __resetModalHostForTests();
  });

  it('applies ARIA on open and restores focus on Escape', () => {
    modal.open();
    const dialog = modal.getElement().querySelector('.dt-sql-filter-modal-dialog') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('dt-q-sql-filter-modal-title');

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getIsOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('does not close on Escape while CodeMirror autocomplete is open', () => {
    modal.open();

    // Simulate CodeMirror's autocomplete tooltip in the DOM.
    const tip = document.createElement('div');
    tip.className = 'cm-tooltip-autocomplete';
    document.body.appendChild(tip);

    const dialog = modal.getElement().querySelector('.dt-sql-filter-modal-dialog') as HTMLElement;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(modal.getIsOpen()).toBe(true);

    // Remove the tooltip, Escape now closes.
    tip.remove();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getIsOpen()).toBe(false);
  });
});
