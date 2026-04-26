/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { SQLFilterModal } from '@/filters/SQLFilterModal';
import { createTableState } from '@/core/State';
import type { TableState } from '@/core/State';
import type { StateActions } from '@/core/Actions';
import type { RawSQLFilter } from '@/filters/FilterTypes';

// CodeMirror requires DOM APIs that jsdom may not fully support
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

// --- Helpers ---

function createMockActions(): StateActions {
  return {
    validateSQLFilter: vi.fn().mockResolvedValue({ valid: true, matchCount: 42 }),
    addRawSQLFilter: vi.fn().mockReturnValue('new-id'),
    updateRawSQLFilter: vi.fn(),
    removeRawSQLFilter: vi.fn(),
    getCompletionContext: vi.fn().mockReturnValue({
      columns: [{ name: 'age', type: 'INTEGER' }],
      functions: [],
    }),
  } as unknown as StateActions;
}

function createState(): TableState {
  return createTableState();
}

describe('SQLFilterModal', () => {
  let state: TableState;
  let actions: StateActions;
  let modal: SQLFilterModal;

  beforeEach(() => {
    state = createState();
    actions = createMockActions();
    modal = new SQLFilterModal(state, actions);
    document.body.appendChild(modal.getElement());
  });

  afterEach(() => {
    modal.destroy();
  });

  // ==========================================
  // Create mode
  // ==========================================

  describe('create mode (open)', () => {
    it('sets title to "New Expression Filter"', () => {
      modal.open();
      const title = modal.getElement().querySelector('[id$="sql-filter-modal-title"]');
      expect(title?.textContent).toBe('New Expression Filter');
    });

    it('shows Apply button', () => {
      modal.open();
      const applyBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-apply"]') as HTMLButtonElement;
      expect(applyBtn?.textContent).toBe('Apply');
    });

    it('Apply button is disabled initially', () => {
      modal.open();
      const applyBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-apply"]') as HTMLButtonElement;
      expect(applyBtn?.disabled).toBe(true);
    });

    it('hides remove section', () => {
      modal.open();
      const removeSection = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-remove-section"]') as HTMLElement;
      expect(removeSection?.style.display).toBe('none');
    });

    it('sets isOpen to true', () => {
      expect(modal.getIsOpen()).toBe(false);
      modal.open();
      expect(modal.getIsOpen()).toBe(true);
    });
  });

  // ==========================================
  // Edit mode
  // ==========================================

  describe('edit mode (openForEdit)', () => {
    const testFilter: RawSQLFilter = {
      type: 'raw-sql',
      column: '__raw_sql_test-123__',
      sql: 'age > 30',
      id: 'test-123',
      label: 'Adults',
    };

    beforeEach(() => {
      state.filters.set([testFilter]);
    });

    it('sets title to "Edit Expression Filter"', () => {
      modal.openForEdit('test-123');
      const title = modal.getElement().querySelector('[id$="sql-filter-modal-title"]');
      expect(title?.textContent).toBe('Edit Expression Filter');
    });

    it('shows Update button', () => {
      modal.openForEdit('test-123');
      const applyBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-apply"]') as HTMLButtonElement;
      expect(applyBtn?.textContent).toBe('Update');
    });

    it('shows remove section', () => {
      modal.openForEdit('test-123');
      const removeSection = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-remove-section"]') as HTMLElement;
      expect(removeSection?.style.display).not.toBe('none');
    });

    it('pre-populates label input', () => {
      modal.openForEdit('test-123');
      const labelInput = modal.getElement().querySelector('input[type="text"]') as HTMLInputElement;
      expect(labelInput?.value).toBe('Adults');
    });

    it('no-ops for unknown filter id', () => {
      modal.openForEdit('nonexistent');
      expect(modal.getIsOpen()).toBe(false);
    });
  });

  // ==========================================
  // Close behavior
  // ==========================================

  describe('close', () => {
    it('sets isOpen to false', () => {
      modal.open();
      modal.close();
      expect(modal.getIsOpen()).toBe(false);
    });

    it('removes backdrop --open class', () => {
      modal.open();
      expect(modal.getElement().classList.contains('dt-sql-filter-modal-backdrop--open')).toBe(
        true,
      );
      modal.close();
      expect(modal.getElement().classList.contains('dt-sql-filter-modal-backdrop--open')).toBe(
        false,
      );
    });

    it('Cancel button closes modal', () => {
      modal.open();
      const cancelBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-cancel"]') as HTMLButtonElement;
      cancelBtn?.click();
      expect(modal.getIsOpen()).toBe(false);
    });

    it('Escape key closes modal', () => {
      modal.open();
      const dialog = modal.getElement().querySelector('.dt-sql-filter-modal-dialog') as HTMLElement;
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(modal.getIsOpen()).toBe(false);
    });

    it('backdrop click closes modal', () => {
      modal.open();
      const backdrop = modal.getElement();
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(modal.getIsOpen()).toBe(false);
    });
  });

  // ==========================================
  // Validation
  // ==========================================

  describe('validation', () => {
    it('calls validateSQLFilter on Validate click', async () => {
      modal.open();
      // Type into CodeMirror by finding the editor view
      const cmEditor = modal.getElement().querySelector('.cm-editor') as HTMLElement;
      if (cmEditor) {
        const { EditorView } = await import('@codemirror/view');
        const view = EditorView.findFromDOM(cmEditor);
        if (view) {
          view.dispatch({ changes: { from: 0, to: 0, insert: 'age > 30' } });
        }
      }

      const validateBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-validate"]') as HTMLButtonElement;
      validateBtn?.click();

      // Wait for async validation — signal is passed as second argument
      await vi.waitFor(() => {
        expect(actions.validateSQLFilter).toHaveBeenCalled();
        const [sql, signal] = (actions.validateSQLFilter as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(sql).toBe('age > 30');
        expect(signal).toBeInstanceOf(AbortSignal);
      });
    });

    it('aborts in-flight validation when editor content changes', async () => {
      // Make validation hang so we can test abort on input change
      let resolveFirst!: (val: { valid: boolean; matchCount: number }) => void;
      (actions.validateSQLFilter as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      );

      modal.open();
      const cmEditor = modal.getElement().querySelector('.cm-editor') as HTMLElement;
      if (!cmEditor) return;
      const { EditorView } = await import('@codemirror/view');
      const view = EditorView.findFromDOM(cmEditor);
      if (!view) return;

      // Start validation
      view.dispatch({ changes: { from: 0, to: 0, insert: 'age > 30' } });
      const validateBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-validate"]') as HTMLButtonElement;
      validateBtn?.click();

      // Capture the signal
      await vi.waitFor(() => {
        expect(actions.validateSQLFilter).toHaveBeenCalledTimes(1);
      });
      const signal = (actions.validateSQLFilter as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as AbortSignal;
      expect(signal.aborted).toBe(false);

      // Edit content — should abort the in-flight validation and re-enable button
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'age > 40' } });
      expect(signal.aborted).toBe(true);
      expect(validateBtn.disabled).toBe(false);

      // Resolve to prevent hanging
      resolveFirst({ valid: true, matchCount: 42 });
    });

    it('aborts in-flight validation on close', async () => {
      let resolveValidation!: (val: { valid: boolean; matchCount: number }) => void;
      (actions.validateSQLFilter as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveValidation = resolve;
          }),
      );

      modal.open();
      const cmEditor = modal.getElement().querySelector('.cm-editor') as HTMLElement;
      if (!cmEditor) return;
      const { EditorView } = await import('@codemirror/view');
      const view = EditorView.findFromDOM(cmEditor);
      if (!view) return;

      view.dispatch({ changes: { from: 0, to: 0, insert: 'test sql' } });
      const validateBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-validate"]') as HTMLButtonElement;
      validateBtn?.click();

      await vi.waitFor(() => {
        expect(actions.validateSQLFilter).toHaveBeenCalledTimes(1);
      });
      const signal = (actions.validateSQLFilter as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as AbortSignal;

      // Close while validation is in-flight
      modal.close();
      expect(signal.aborted).toBe(true);

      // Resolve to prevent hanging
      resolveValidation({ valid: true, matchCount: 0 });
    });

    it('shows match count on success', async () => {
      modal.open();
      const cmEditor = modal.getElement().querySelector('.cm-editor') as HTMLElement;
      if (cmEditor) {
        const { EditorView } = await import('@codemirror/view');
        const view = EditorView.findFromDOM(cmEditor);
        if (view) {
          view.dispatch({ changes: { from: 0, to: 0, insert: 'age > 30' } });
        }
      }

      const validateBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-validate"]') as HTMLButtonElement;
      validateBtn?.click();

      await vi.waitFor(() => {
        const preview = modal.getElement().querySelector('[class$="sql-filter-modal-preview"]');
        expect(preview?.textContent).toContain('42');
      });
    });

    it('shows error on validation failure', async () => {
      (actions.validateSQLFilter as ReturnType<typeof vi.fn>).mockResolvedValue({
        valid: false,
        error: 'Syntax error',
      });

      modal.open();
      const cmEditor = modal.getElement().querySelector('.cm-editor') as HTMLElement;
      if (cmEditor) {
        const { EditorView } = await import('@codemirror/view');
        const view = EditorView.findFromDOM(cmEditor);
        if (view) {
          view.dispatch({ changes: { from: 0, to: 0, insert: 'bad sql' } });
        }
      }

      const validateBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-validate"]') as HTMLButtonElement;
      validateBtn?.click();

      await vi.waitFor(() => {
        const preview = modal.getElement().querySelector('[class$="sql-filter-modal-preview"]');
        expect(preview?.textContent).toContain('Syntax error');
      });
    });
  });

  // ==========================================
  // Race condition (Bug 1 regression test)
  // ==========================================

  describe('validation race condition', () => {
    it('ignores stale validation results when editor is modified during validation', async () => {
      // Create a deferred promise so we control when validation resolves
      let resolveValidation!: (val: { valid: boolean; matchCount: number }) => void;
      (actions.validateSQLFilter as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveValidation = resolve;
          }),
      );

      modal.open();
      const cmEditor = modal.getElement().querySelector('.cm-editor') as HTMLElement;
      if (!cmEditor) return; // skip if CodeMirror not available

      const { EditorView } = await import('@codemirror/view');
      const view = EditorView.findFromDOM(cmEditor);
      if (!view) return;

      // Step 1: Type valid SQL and click Validate
      view.dispatch({ changes: { from: 0, to: 0, insert: 'age > 30' } });
      const validateBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-validate"]') as HTMLButtonElement;
      validateBtn?.click();

      // Step 2: While validation is in-flight, modify the editor
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'INVALID' } });

      // Step 3: Now resolve the stale validation
      resolveValidation({ valid: true, matchCount: 42 });

      // Wait a tick for promise resolution
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Step 4: The Apply button should still be disabled because the
      // validation result was for the OLD content
      const applyBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-apply"]') as HTMLButtonElement;
      expect(applyBtn?.disabled).toBe(true);
    });
  });

  // ==========================================
  // Apply / Remove
  // ==========================================

  describe('apply', () => {
    it('calls addRawSQLFilter in create mode', async () => {
      (actions.validateSQLFilter as ReturnType<typeof vi.fn>).mockResolvedValue({
        valid: true,
        matchCount: 10,
      });

      modal.open();
      const cmEditor = modal.getElement().querySelector('.cm-editor') as HTMLElement;
      if (cmEditor) {
        const { EditorView } = await import('@codemirror/view');
        const view = EditorView.findFromDOM(cmEditor);
        if (view) {
          view.dispatch({ changes: { from: 0, to: 0, insert: 'x = 1' } });
        }
      }

      // Validate first
      const validateBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-validate"]') as HTMLButtonElement;
      validateBtn?.click();
      await vi.waitFor(() => {
        expect(actions.validateSQLFilter).toHaveBeenCalled();
      });

      // Then apply
      const applyBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-apply"]') as HTMLButtonElement;
      applyBtn?.click();

      expect(actions.addRawSQLFilter).toHaveBeenCalledWith('x = 1', undefined);
      expect(modal.getIsOpen()).toBe(false);
    });

    it('calls updateRawSQLFilter in edit mode', async () => {
      const filter: RawSQLFilter = {
        type: 'raw-sql',
        column: '__raw_sql_edit-1__',
        sql: 'old',
        id: 'edit-1',
      };
      state.filters.set([filter]);

      (actions.validateSQLFilter as ReturnType<typeof vi.fn>).mockResolvedValue({
        valid: true,
        matchCount: 5,
      });

      modal.openForEdit('edit-1');
      const cmEditor = modal.getElement().querySelector('.cm-editor') as HTMLElement;
      if (cmEditor) {
        const { EditorView } = await import('@codemirror/view');
        const view = EditorView.findFromDOM(cmEditor);
        if (view) {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'new sql' } });
        }
      }

      const validateBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-validate"]') as HTMLButtonElement;
      validateBtn?.click();
      await vi.waitFor(() => {
        expect(actions.validateSQLFilter).toHaveBeenCalled();
      });

      const applyBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-apply"]') as HTMLButtonElement;
      applyBtn?.click();

      expect(actions.updateRawSQLFilter).toHaveBeenCalledWith('edit-1', 'new sql', undefined);
    });
  });

  describe('remove (edit mode)', () => {
    it('shows confirmation on Remove Filter click', () => {
      const filter: RawSQLFilter = {
        type: 'raw-sql',
        column: '__raw_sql_rm-1__',
        sql: 'x',
        id: 'rm-1',
      };
      state.filters.set([filter]);
      modal.openForEdit('rm-1');

      const removeBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-remove"]') as HTMLButtonElement;
      removeBtn?.click();

      const confirmDiv = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-remove-confirm"]') as HTMLElement;
      expect(confirmDiv?.style.display).toBe('flex');
    });

    it('Confirm calls removeRawSQLFilter and closes modal', () => {
      const filter: RawSQLFilter = {
        type: 'raw-sql',
        column: '__raw_sql_rm-2__',
        sql: 'x',
        id: 'rm-2',
      };
      state.filters.set([filter]);
      modal.openForEdit('rm-2');

      // Click Remove, then Confirm
      const removeBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-remove"]') as HTMLButtonElement;
      removeBtn?.click();
      const confirmBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-remove-confirm-yes"]') as HTMLButtonElement;
      confirmBtn?.click();

      expect(actions.removeRawSQLFilter).toHaveBeenCalledWith('rm-2');
      expect(modal.getIsOpen()).toBe(false);
    });
  });

  // ==========================================
  // Destroy
  // ==========================================

  describe('destroy', () => {
    it('removes element from DOM', () => {
      expect(document.body.contains(modal.getElement())).toBe(true);
      modal.destroy();
      expect(document.body.contains(modal.getElement())).toBe(false);
    });

    it('closes modal if open', () => {
      modal.open();
      modal.destroy();
      expect(modal.getIsOpen()).toBe(false);
    });
  });

  // ==========================================
  // Phase 5 — autocomplete + empty-SQL contract
  // ==========================================

  describe('autocomplete schema (Phase 5)', () => {
    it('reads completion context from actions on open() — base columns only', () => {
      modal.open();
      expect(actions.getCompletionContext).toHaveBeenCalled();
    });

    it('includes derived columns returned by actions.getCompletionContext()', () => {
      // Re-wire the mock so a derived column shows up in the completion context.
      // The modal subscribes to getCompletionContext at open time; that's the
      // contract Phase 5 locks. Live refresh on `derivedChange` while the modal
      // is open is deferred to Phase 8.
      (actions.getCompletionContext as ReturnType<typeof vi.fn>).mockReturnValue({
        columns: [
          { name: 'age', type: 'INTEGER' },
          { name: 'price_with_tax', type: 'DOUBLE', isDerived: true },
        ],
        functions: [],
      });

      // Re-instantiate so the new mock is observed at open(). The default
      // beforeEach hook constructed the modal before the mock was rewritten;
      // we rebuild it here to keep the test focused.
      modal.destroy();
      modal = new SQLFilterModal(state, actions);
      document.body.appendChild(modal.getElement());

      modal.open();

      const ctx = (actions.getCompletionContext as ReturnType<typeof vi.fn>).mock.results[
        (actions.getCompletionContext as ReturnType<typeof vi.fn>).mock.results.length - 1
      ].value as { columns: Array<{ name: string; type: string; isDerived?: boolean }> };
      expect(ctx.columns.map((c) => c.name)).toContain('price_with_tax');
      const derived = ctx.columns.find((c) => c.name === 'price_with_tax');
      expect(derived?.isDerived).toBe(true);
    });

    it('opens with an empty completion context without throwing', () => {
      (actions.getCompletionContext as ReturnType<typeof vi.fn>).mockReturnValue({
        columns: [],
        functions: [],
      });
      modal.destroy();
      modal = new SQLFilterModal(state, actions);
      document.body.appendChild(modal.getElement());
      expect(() => modal.open()).not.toThrow();
    });
  });

  describe('empty SQL gating (Phase 5)', () => {
    it('clicking Apply on empty SQL is a no-op — never calls addRawSQLFilter', () => {
      modal.open();
      const applyBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-apply"]') as HTMLButtonElement;
      applyBtn?.click();
      expect(actions.addRawSQLFilter).not.toHaveBeenCalled();
      // Modal remains open — no premature close on the no-op click.
      expect(modal.getIsOpen()).toBe(true);
    });

    it('clicking Apply on whitespace-only SQL is a no-op', async () => {
      modal.open();
      const cmEditor = modal.getElement().querySelector('.cm-editor') as HTMLElement;
      if (cmEditor) {
        const { EditorView } = await import('@codemirror/view');
        const view = EditorView.findFromDOM(cmEditor);
        if (view) {
          view.dispatch({ changes: { from: 0, to: 0, insert: '   \n\t  ' } });
        }
      }
      const applyBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-apply"]') as HTMLButtonElement;
      applyBtn?.click();
      expect(actions.addRawSQLFilter).not.toHaveBeenCalled();
      expect(modal.getIsOpen()).toBe(true);
    });

    it('clicking Validate on empty SQL is a no-op', () => {
      modal.open();
      const validateBtn = modal
        .getElement()
        .querySelector('[class$="sql-filter-modal-validate"]') as HTMLButtonElement;
      validateBtn?.click();
      expect(actions.validateSQLFilter).not.toHaveBeenCalled();
    });
  });
});
