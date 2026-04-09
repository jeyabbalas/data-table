/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { DerivedColumnModal } from '@/derived/DerivedColumnModal';
import { createTableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { EditorView } from '@codemirror/view';

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

/** Helper: set expression editor content via CodeMirror EditorView */
function setEditorValue(root: HTMLElement, value: string): void {
  const cmEditor = root.querySelector('.cm-editor') as HTMLElement;
  const view = EditorView.findFromDOM(cmEditor)!;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
  });
}

// Mock WorkerBridge
const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
} as unknown as WorkerBridge;

describe('DerivedColumnModal', () => {
  let state: TableState;
  let actions: StateActions;
  let modal: DerivedColumnModal;

  const baseSchema: ColumnSchema[] = [
    { name: 'price', type: 'float', nullable: false, originalType: 'DOUBLE' },
    { name: 'quantity', type: 'integer', nullable: false, originalType: 'INTEGER' },
  ];

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);

    // Set up state
    state.schema.set(baseSchema);
    state.totalRows.set(3);
    state.tableName.set('test_table');

    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
  });

  afterEach(() => {
    modal.destroy();
    vi.restoreAllMocks();
  });

  // =========================================
  // Lifecycle
  // =========================================

  it('starts hidden', () => {
    expect(modal.getIsOpen()).toBe(false);
    expect(modal.getElement().classList.contains('dt-derived-modal-backdrop--open')).toBe(false);
  });

  it('open() makes modal visible and locks body scroll', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    modal.open();
    expect(modal.getIsOpen()).toBe(true);
    expect(modal.getElement().classList.contains('dt-derived-modal-backdrop--open')).toBe(true);
    expect(addSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    expect(addSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
    addSpy.mockRestore();
  });

  it('close() hides modal and restores body scroll', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    modal.open();
    modal.close();
    expect(modal.getIsOpen()).toBe(false);
    expect(modal.getElement().classList.contains('dt-derived-modal-backdrop--open')).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('open() is a no-op if already open', () => {
    modal.open();
    modal.open(); // should not throw or change state
    expect(modal.getIsOpen()).toBe(true);
  });

  it('close() is a no-op if already closed', () => {
    modal.close(); // should not throw
    expect(modal.getIsOpen()).toBe(false);
  });

  it('destroy() while open restores body scroll', () => {
    document.body.style.overflow = 'auto';
    modal.open();
    modal.destroy();
    expect(document.body.style.overflow).toBe('auto');
  });

  // =========================================
  // Close Handlers
  // =========================================

  it('Escape key closes modal', () => {
    modal.open();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(event);
    expect(modal.getIsOpen()).toBe(false);
  });

  it('backdrop click closes modal', () => {
    modal.open();
    const event = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(event, 'target', { value: modal.getElement() });
    modal.getElement().dispatchEvent(event);
    expect(modal.getIsOpen()).toBe(false);
  });

  it('clicking inside dialog does not close modal', () => {
    modal.open();
    const dialog = modal.getElement().querySelector('[role="dialog"]')!;
    const event = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(event, 'target', { value: dialog });
    modal.getElement().dispatchEvent(event);
    expect(modal.getIsOpen()).toBe(true);
  });

  it('close button click closes modal', () => {
    modal.open();
    const closeBtn = modal.getElement().querySelector('.dt-derived-modal-close') as HTMLButtonElement;
    closeBtn.click();
    expect(modal.getIsOpen()).toBe(false);
  });

  it('cancel button click closes modal', () => {
    modal.open();
    const cancelBtn = modal.getElement().querySelector('.dt-derived-modal-cancel') as HTMLButtonElement;
    cancelBtn.click();
    expect(modal.getIsOpen()).toBe(false);
  });

  // =========================================
  // DOM Structure
  // =========================================

  it('has dialog with correct role and aria attributes', () => {
    const dialog = modal.getElement().querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(dialog!.getAttribute('aria-labelledby')).toBe('dt-derived-modal-title');
  });

  it('has title "New Derived Column"', () => {
    const title = modal.getElement().querySelector('.dt-derived-modal-title');
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe('New Derived Column');
  });

  it('has name input', () => {
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.type).toBe('text');
  });

  it('has mode radio buttons defaulting to expression', () => {
    const radios = modal.getElement().querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
    expect((radios[0] as HTMLInputElement).checked).toBe(true); // expression
    expect((radios[1] as HTMLInputElement).checked).toBe(false); // vector
  });

  it('has Create button that starts disabled', () => {
    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
    expect(createBtn).not.toBeNull();
    expect(createBtn.disabled).toBe(true);
  });

  // =========================================
  // Name Validation
  // =========================================

  it('shows error for empty name', () => {
    modal.open();
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    const errorEl = modal.getElement().querySelector('.dt-derived-modal-name-error') as HTMLElement;

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(errorEl.textContent).toBe('Name is required');
    expect(errorEl.style.display).not.toBe('none');
  });

  it('shows error for duplicate column name', () => {
    modal.open();
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    const errorEl = modal.getElement().querySelector('.dt-derived-modal-name-error') as HTMLElement;

    input.value = 'price';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(errorEl.textContent).toContain('already exists');
    expect(errorEl.style.display).not.toBe('none');
  });

  it('clears error for unique name', () => {
    modal.open();
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    const errorEl = modal.getElement().querySelector('.dt-derived-modal-name-error') as HTMLElement;

    input.value = 'total';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(errorEl.style.display).toBe('none');
  });

  // =========================================
  // Mode Toggle
  // =========================================

  it('switching to vector mode shows vector section and hides expression', () => {
    modal.open();
    const radios = modal.getElement().querySelectorAll('input[type="radio"]');
    const vectorRadio = radios[1] as HTMLInputElement;

    vectorRadio.checked = true;
    vectorRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const exprSection = modal.getElement().querySelector('.dt-derived-modal-editor-container')!.parentElement!;
    const vecSection = modal.getElement().querySelector('.dt-derived-modal-vector-textarea')!.parentElement!;

    expect(exprSection.style.display).toBe('none');
    expect(vecSection.style.display).not.toBe('none');
  });

  it('switching back to expression mode restores expression section', () => {
    modal.open();
    const radios = modal.getElement().querySelectorAll('input[type="radio"]');
    const exprRadio = radios[0] as HTMLInputElement;
    const vectorRadio = radios[1] as HTMLInputElement;

    // Switch to vector
    vectorRadio.checked = true;
    vectorRadio.dispatchEvent(new Event('change', { bubbles: true }));

    // Switch back
    exprRadio.checked = true;
    exprRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const exprSection = modal.getElement().querySelector('.dt-derived-modal-editor-container')!.parentElement!;
    expect(exprSection.style.display).not.toBe('none');
  });

  // =========================================
  // Expression Validation
  // =========================================

  it('Validate button calls actions.validateExpression', async () => {
    const validateSpy = vi.spyOn(actions, 'validateExpression').mockResolvedValue({
      valid: true,
      type: 'float',
      originalType: 'DOUBLE',
    });

    modal.open();

    // Set expression in the editor
    setEditorValue(modal.getElement(), 'price * 2');

    const validateBtn = modal.getElement().querySelector('.dt-derived-modal-validate') as HTMLButtonElement;
    validateBtn.click();

    // Wait for async
    await vi.waitFor(() => {
      expect(validateSpy).toHaveBeenCalledWith('price * 2');
    });
  });

  it('shows type preview on successful validation', async () => {
    vi.spyOn(actions, 'validateExpression').mockResolvedValue({
      valid: true,
      type: 'float',
      originalType: 'DOUBLE',
    });

    modal.open();

    setEditorValue(modal.getElement(), 'price * 2');

    const validateBtn = modal.getElement().querySelector('.dt-derived-modal-validate') as HTMLButtonElement;
    validateBtn.click();

    const preview = modal.getElement().querySelector('.dt-derived-modal-type-preview') as HTMLElement;

    await vi.waitFor(() => {
      expect(preview.textContent).toContain('float');
    });
  });

  it('shows error on failed validation', async () => {
    vi.spyOn(actions, 'validateExpression').mockResolvedValue({
      valid: false,
      error: 'Syntax error',
    });

    modal.open();

    setEditorValue(modal.getElement(), 'bad syntax!!!');

    const validateBtn = modal.getElement().querySelector('.dt-derived-modal-validate') as HTMLButtonElement;
    validateBtn.click();

    const preview = modal.getElement().querySelector('.dt-derived-modal-type-preview') as HTMLElement;

    await vi.waitFor(() => {
      expect(preview.textContent).toContain('Syntax error');
      expect(preview.style.color).toBe('rgb(239, 68, 68)');
    });
  });

  // =========================================
  // Create Button State
  // =========================================

  it('Create disabled with name only (expression not validated)', () => {
    modal.open();
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    input.value = 'total';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
  });

  it('Create enabled after name + expression validated', async () => {
    vi.spyOn(actions, 'validateExpression').mockResolvedValue({
      valid: true,
      type: 'float',
      originalType: 'DOUBLE',
    });

    modal.open();

    // Set name
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    input.value = 'total';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Set expression and validate
    setEditorValue(modal.getElement(), 'price * quantity');

    const validateBtn = modal.getElement().querySelector('.dt-derived-modal-validate') as HTMLButtonElement;
    validateBtn.click();

    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;

    await vi.waitFor(() => {
      expect(createBtn.disabled).toBe(false);
    });
  });

  it('editing expression after validation disables Create', async () => {
    vi.spyOn(actions, 'validateExpression').mockResolvedValue({
      valid: true,
      type: 'float',
      originalType: 'DOUBLE',
    });

    modal.open();

    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    input.value = 'total';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    setEditorValue(modal.getElement(), 'price * 2');

    const validateBtn = modal.getElement().querySelector('.dt-derived-modal-validate') as HTMLButtonElement;
    validateBtn.click();

    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;

    await vi.waitFor(() => {
      expect(createBtn.disabled).toBe(false);
    });

    // Now edit the expression — should reset validation
    setEditorValue(modal.getElement(), 'price * 3');

    expect(createBtn.disabled).toBe(true);
  });

  // =========================================
  // Vector Mode
  // =========================================

  it('vector count mismatch shows error', () => {
    modal.open();

    // Switch to vector mode
    const radios = modal.getElement().querySelectorAll('input[type="radio"]');
    const vectorRadio = radios[1] as HTMLInputElement;
    vectorRadio.checked = true;
    vectorRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const textarea = modal.getElement().querySelector('.dt-derived-modal-vector-textarea') as HTMLTextAreaElement;
    textarea.value = '1\n2'; // 2 lines, but totalRows is 3
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const errorEl = modal.getElement().querySelector('.dt-derived-modal-vector-error') as HTMLElement;
    expect(errorEl.textContent).toContain('Expected 3 values, got 2');
    expect(errorEl.style.display).not.toBe('none');
  });

  it('vector correct count enables Create with valid name', () => {
    modal.open();

    // Set name
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    input.value = 'computed';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Switch to vector mode
    const radios = modal.getElement().querySelectorAll('input[type="radio"]');
    const vectorRadio = radios[1] as HTMLInputElement;
    vectorRadio.checked = true;
    vectorRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const textarea = modal.getElement().querySelector('.dt-derived-modal-vector-textarea') as HTMLTextAreaElement;
    textarea.value = '1\n2\n3'; // 3 lines, matching totalRows
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
    expect(createBtn.disabled).toBe(false);
  });

  it('vector info shows expected row count', () => {
    modal.open();

    // Switch to vector mode
    const radios = modal.getElement().querySelectorAll('input[type="radio"]');
    const vectorRadio = radios[1] as HTMLInputElement;
    vectorRadio.checked = true;
    vectorRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const infoEl = modal.getElement().querySelector('.dt-derived-modal-vector-info') as HTMLElement;
    expect(infoEl.textContent).toContain('3');
  });

  // =========================================
  // Create Action
  // =========================================

  it('Create calls addDerivedColumn for expression mode', async () => {
    const addSpy = vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({ success: true });
    vi.spyOn(actions, 'validateExpression').mockResolvedValue({
      valid: true,
      type: 'float',
      originalType: 'DOUBLE',
    });

    modal.open();

    // Set name
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    input.value = 'total';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Set and validate expression
    setEditorValue(modal.getElement(), 'price * quantity');

    const validateBtn = modal.getElement().querySelector('.dt-derived-modal-validate') as HTMLButtonElement;
    validateBtn.click();

    await vi.waitFor(() => {
      const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
      expect(createBtn.disabled).toBe(false);
    });

    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
    createBtn.click();

    await vi.waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
    });
  });

  it('Create closes modal on success', async () => {
    vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({ success: true });
    vi.spyOn(actions, 'validateExpression').mockResolvedValue({
      valid: true,
      type: 'float',
      originalType: 'DOUBLE',
    });

    modal.open();

    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    input.value = 'total';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    setEditorValue(modal.getElement(), 'price * quantity');

    const validateBtn = modal.getElement().querySelector('.dt-derived-modal-validate') as HTMLButtonElement;
    validateBtn.click();

    await vi.waitFor(() => {
      const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
      expect(createBtn.disabled).toBe(false);
    });

    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
    createBtn.click();

    await vi.waitFor(() => {
      expect(modal.getIsOpen()).toBe(false);
    });
  });

  it('Create shows error on failure', async () => {
    vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({
      success: false,
      error: 'Expression error',
    });
    vi.spyOn(actions, 'validateExpression').mockResolvedValue({
      valid: true,
      type: 'float',
      originalType: 'DOUBLE',
    });

    modal.open();

    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    input.value = 'total';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    setEditorValue(modal.getElement(), 'bad_expr');

    const validateBtn = modal.getElement().querySelector('.dt-derived-modal-validate') as HTMLButtonElement;
    validateBtn.click();

    await vi.waitFor(() => {
      const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
      expect(createBtn.disabled).toBe(false);
    });

    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
    createBtn.click();

    const errorEl = modal.getElement().querySelector('.dt-derived-modal-error') as HTMLElement;

    await vi.waitFor(() => {
      expect(errorEl.textContent).toContain('Expression error');
      expect(errorEl.style.display).not.toBe('none');
    });
  });

  it('Create calls addDerivedColumn for vector mode', async () => {
    const addSpy = vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({ success: true });

    modal.open();

    // Set name
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    input.value = 'flags';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Switch to vector mode
    const radios = modal.getElement().querySelectorAll('input[type="radio"]');
    const vectorRadio = radios[1] as HTMLInputElement;
    vectorRadio.checked = true;
    vectorRadio.dispatchEvent(new Event('change', { bubbles: true }));

    // Set type to boolean
    const select = modal.getElement().querySelector('.dt-filter-select') as HTMLSelectElement;
    select.value = 'boolean';

    // Enter values
    const textarea = modal.getElement().querySelector('.dt-derived-modal-vector-textarea') as HTMLTextAreaElement;
    textarea.value = 'true\nfalse\ntrue';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
    expect(createBtn.disabled).toBe(false);
    createBtn.click();

    await vi.waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith({
        kind: 'vector',
        name: 'flags',
        vectorType: 'boolean',
        values: [true, false, true],
      });
    });
  });

  // =========================================
  // Vector mode — all data types
  // =========================================

  describe('vector mode — extended types', () => {
    /** Helper to create a vector column via the modal and verify the addDerivedColumn call */
    async function createVectorColumn(
      modalEl: HTMLElement,
      modalInstance: DerivedColumnModal,
      addSpy: ReturnType<typeof vi.fn>,
      opts: { name: string; vectorType: string; textareaValue: string; expectedValues: unknown[]; expectedVectorType: string },
    ) {
      modalInstance.open();

      // Set name
      const input = modalEl.querySelector('.dt-filter-input') as HTMLInputElement;
      input.value = opts.name;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Switch to vector mode
      const radios = modalEl.querySelectorAll('input[type="radio"]');
      const vectorRadio = radios[1] as HTMLInputElement;
      vectorRadio.checked = true;
      vectorRadio.dispatchEvent(new Event('change', { bubbles: true }));

      // Set type
      const select = modalEl.querySelector('.dt-filter-select') as HTMLSelectElement;
      select.value = opts.vectorType;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Enter values
      const textarea = modalEl.querySelector('.dt-derived-modal-vector-textarea') as HTMLTextAreaElement;
      textarea.value = opts.textareaValue;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = modalEl.querySelector('.dt-derived-modal-create') as HTMLButtonElement;
      expect(createBtn.disabled).toBe(false);
      createBtn.click();

      await vi.waitFor(() => {
        expect(addSpy).toHaveBeenCalledWith({
          kind: 'vector',
          name: opts.name,
          vectorType: opts.expectedVectorType,
          values: opts.expectedValues,
        });
      });

      modalInstance.close();
      addSpy.mockClear();
    }

    it('creates a date vector column', async () => {
      const addSpy = vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({ success: true });
      await createVectorColumn(modal.getElement(), modal, addSpy, {
        name: 'dates',
        vectorType: 'date',
        textareaValue: '2024-01-15\n2024-06-30\n2025-12-01',
        expectedValues: ['2024-01-15', '2024-06-30', '2025-12-01'],
        expectedVectorType: 'date',
      });
    });

    it('creates a timestamp vector column', async () => {
      const addSpy = vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({ success: true });
      await createVectorColumn(modal.getElement(), modal, addSpy, {
        name: 'timestamps',
        vectorType: 'timestamp',
        textareaValue: '2024-01-15 10:30:00\n2024-06-30 23:59:59\n2025-12-01 00:00:00',
        expectedValues: ['2024-01-15 10:30:00', '2024-06-30 23:59:59', '2025-12-01 00:00:00'],
        expectedVectorType: 'timestamp',
      });
    });

    it('creates a time vector column', async () => {
      const addSpy = vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({ success: true });
      await createVectorColumn(modal.getElement(), modal, addSpy, {
        name: 'times',
        vectorType: 'time',
        textareaValue: '14:30:00\n09:15:30\n23:59:59',
        expectedValues: ['14:30:00', '09:15:30', '23:59:59'],
        expectedVectorType: 'time',
      });
    });

    it('creates an interval vector column', async () => {
      const addSpy = vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({ success: true });
      await createVectorColumn(modal.getElement(), modal, addSpy, {
        name: 'durations',
        vectorType: 'interval',
        textareaValue: '1 day\n2 hours 30 minutes\n1 year 6 months',
        expectedValues: ['1 day', '2 hours 30 minutes', '1 year 6 months'],
        expectedVectorType: 'interval',
      });
    });

    it('creates a decimal vector column', async () => {
      const addSpy = vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({ success: true });
      await createVectorColumn(modal.getElement(), modal, addSpy, {
        name: 'precise',
        vectorType: 'decimal',
        textareaValue: '123.456789\n-42.5\n0.001',
        expectedValues: ['123.456789', '-42.5', '0.001'],
        expectedVectorType: 'decimal',
      });
    });

    it('creates a uuid vector column', async () => {
      const addSpy = vi.spyOn(actions, 'addDerivedColumn').mockResolvedValue({ success: true });
      await createVectorColumn(modal.getElement(), modal, addSpy, {
        name: 'ids',
        vectorType: 'uuid',
        textareaValue: '550e8400-e29b-41d4-a716-446655440000\na1b2c3d4-e5f6-7890-abcd-ef1234567890\n00000000-0000-0000-0000-000000000001',
        expectedValues: ['550e8400-e29b-41d4-a716-446655440000', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0000-000000000001'],
        expectedVectorType: 'uuid',
      });
    });

    // --- Invalid value tests ---

    it('shows error for invalid date values', () => {
      modal.open();
      const radios = modal.getElement().querySelectorAll('input[type="radio"]');
      (radios[1] as HTMLInputElement).checked = true;
      (radios[1] as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));

      const select = modal.getElement().querySelector('.dt-filter-select') as HTMLSelectElement;
      select.value = 'date';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
      input.value = 'bad_dates';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const textarea = modal.getElement().querySelector('.dt-derived-modal-vector-textarea') as HTMLTextAreaElement;
      textarea.value = '2024-01-15\nnot-a-date\n2024-06-30';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
      createBtn.click();

      const errorEl = modal.getElement().querySelector('.dt-derived-modal-vector-error') as HTMLElement;
      expect(errorEl.style.display).not.toBe('none');
      expect(errorEl.textContent).toContain('Line 2');
      expect(errorEl.textContent).toContain('not a valid date');
    });

    it('shows error for invalid timestamp values', () => {
      modal.open();
      const radios = modal.getElement().querySelectorAll('input[type="radio"]');
      (radios[1] as HTMLInputElement).checked = true;
      (radios[1] as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));

      const select = modal.getElement().querySelector('.dt-filter-select') as HTMLSelectElement;
      select.value = 'timestamp';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
      input.value = 'bad_ts';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const textarea = modal.getElement().querySelector('.dt-derived-modal-vector-textarea') as HTMLTextAreaElement;
      textarea.value = '2024-01-15 10:30:00\njust-a-date\n2024-06-30 12:00:00';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
      createBtn.click();

      const errorEl = modal.getElement().querySelector('.dt-derived-modal-vector-error') as HTMLElement;
      expect(errorEl.style.display).not.toBe('none');
      expect(errorEl.textContent).toContain('Line 2');
      expect(errorEl.textContent).toContain('not a valid timestamp');
    });

    it('shows error for invalid time values', () => {
      modal.open();
      const radios = modal.getElement().querySelectorAll('input[type="radio"]');
      (radios[1] as HTMLInputElement).checked = true;
      (radios[1] as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));

      const select = modal.getElement().querySelector('.dt-filter-select') as HTMLSelectElement;
      select.value = 'time';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
      input.value = 'bad_time';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const textarea = modal.getElement().querySelector('.dt-derived-modal-vector-textarea') as HTMLTextAreaElement;
      textarea.value = '14:30:00\nnoon\n23:59:59';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
      createBtn.click();

      const errorEl = modal.getElement().querySelector('.dt-derived-modal-vector-error') as HTMLElement;
      expect(errorEl.style.display).not.toBe('none');
      expect(errorEl.textContent).toContain('Line 2');
      expect(errorEl.textContent).toContain('not a valid time');
    });

    it('shows error for invalid decimal values', () => {
      modal.open();
      const radios = modal.getElement().querySelectorAll('input[type="radio"]');
      (radios[1] as HTMLInputElement).checked = true;
      (radios[1] as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));

      const select = modal.getElement().querySelector('.dt-filter-select') as HTMLSelectElement;
      select.value = 'decimal';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
      input.value = 'bad_dec';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const textarea = modal.getElement().querySelector('.dt-derived-modal-vector-textarea') as HTMLTextAreaElement;
      textarea.value = '123.45\nabc\n0.001';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
      createBtn.click();

      const errorEl = modal.getElement().querySelector('.dt-derived-modal-vector-error') as HTMLElement;
      expect(errorEl.style.display).not.toBe('none');
      expect(errorEl.textContent).toContain('Line 2');
      expect(errorEl.textContent).toContain('not a valid decimal');
    });

    it('shows error for invalid uuid values', () => {
      modal.open();
      const radios = modal.getElement().querySelectorAll('input[type="radio"]');
      (radios[1] as HTMLInputElement).checked = true;
      (radios[1] as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));

      const select = modal.getElement().querySelector('.dt-filter-select') as HTMLSelectElement;
      select.value = 'uuid';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
      input.value = 'bad_uuid';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const textarea = modal.getElement().querySelector('.dt-derived-modal-vector-textarea') as HTMLTextAreaElement;
      textarea.value = '550e8400-e29b-41d4-a716-446655440000\nnot-a-uuid\n00000000-0000-0000-0000-000000000001';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
      createBtn.click();

      const errorEl = modal.getElement().querySelector('.dt-derived-modal-vector-error') as HTMLElement;
      expect(errorEl.style.display).not.toBe('none');
      expect(errorEl.textContent).toContain('Line 2');
      expect(errorEl.textContent).toContain('not a valid UUID');
    });
  });

  // =========================================
  // Form Reset
  // =========================================

  it('form resets when reopened', async () => {
    vi.spyOn(actions, 'validateExpression').mockResolvedValue({
      valid: true,
      type: 'float',
      originalType: 'DOUBLE',
    });

    modal.open();

    // Set name and validate expression
    const input = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    input.value = 'total';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    setEditorValue(modal.getElement(), 'price * 2');

    modal.close();
    modal.open();

    // Name should be empty
    const input2 = modal.getElement().querySelector('.dt-filter-input') as HTMLInputElement;
    expect(input2.value).toBe('');

    // Create should be disabled
    const createBtn = modal.getElement().querySelector('.dt-derived-modal-create') as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
  });
});
