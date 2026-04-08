/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { DerivedColumnEditPanel } from '@/derived/DerivedColumnEditPanel';
import { createTableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { DerivedColumnDef } from '@/derived/types';
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

/** Helper: get expression editor content via CodeMirror EditorView */
function getEditorValue(root: HTMLElement): string {
  const cmEditor = root.querySelector('.cm-editor') as HTMLElement;
  const view = EditorView.findFromDOM(cmEditor)!;
  return view.state.doc.toString();
}

// Mock WorkerBridge
const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
} as unknown as WorkerBridge;

describe('DerivedColumnEditPanel', () => {
  let state: TableState;
  let actions: StateActions;
  let rootEl: HTMLElement;
  let anchorEl: HTMLElement;

  const baseSchema: ColumnSchema[] = [
    { name: 'price', type: 'float', nullable: false, originalType: 'DOUBLE' },
    { name: 'quantity', type: 'integer', nullable: false, originalType: 'INTEGER' },
    {
      name: 'total',
      type: 'float',
      nullable: false,
      originalType: 'DOUBLE',
      isDerived: true,
      expression: 'price * quantity',
    },
  ];

  const derivedDefs: DerivedColumnDef[] = [
    { kind: 'expression', name: 'total', expression: 'price * quantity' },
  ];

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);

    // Set up state
    state.schema.set(baseSchema);
    state.derivedColumns.set(derivedDefs);

    // Create root container with bounding rect
    rootEl = document.createElement('div');
    Object.defineProperty(rootEl, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        left: 0,
        bottom: 600,
        right: 800,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    });
    document.body.appendChild(rootEl);

    // Create anchor element
    anchorEl = document.createElement('button');
    Object.defineProperty(anchorEl, 'getBoundingClientRect', {
      value: () => ({
        top: 50,
        left: 100,
        bottom: 70,
        right: 120,
        width: 20,
        height: 20,
        x: 100,
        y: 50,
        toJSON: () => {},
      }),
    });
    rootEl.appendChild(anchorEl);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  function createPanel(): DerivedColumnEditPanel {
    const panel = new DerivedColumnEditPanel(state, actions);
    rootEl.appendChild(panel.getElement());
    return panel;
  }

  describe('Lifecycle', () => {
    it('should start closed with display none', () => {
      const panel = createPanel();

      expect(panel.getIsOpen()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');
      expect(panel.getCurrentColumn()).toBeNull();

      panel.destroy();
    });

    it('should open and show panel below anchor', () => {
      const panel = createPanel();

      panel.open('total', anchorEl);

      expect(panel.getIsOpen()).toBe(true);
      expect(panel.getElement().style.display).toBe('');
      expect(panel.getCurrentColumn()).toBe('total');

      panel.destroy();
    });

    it('should close and hide panel', () => {
      const panel = createPanel();

      panel.open('total', anchorEl);
      panel.close();

      expect(panel.getIsOpen()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');

      panel.destroy();
    });

    it('should toggle: close if same column', () => {
      const panel = createPanel();

      panel.toggle('total', anchorEl);
      expect(panel.getIsOpen()).toBe(true);

      panel.toggle('total', anchorEl);
      expect(panel.getIsOpen()).toBe(false);

      panel.destroy();
    });

    it('should toggle: switch if different column', () => {
      // Add a second derived column
      const secondDef: DerivedColumnDef = {
        kind: 'expression',
        name: 'doubled',
        expression: 'price * 2',
      };
      state.derivedColumns.set([...derivedDefs, secondDef]);
      state.schema.set([
        ...baseSchema,
        {
          name: 'doubled',
          type: 'float',
          nullable: false,
          originalType: 'DOUBLE',
          isDerived: true,
          expression: 'price * 2',
        },
      ]);

      const panel = createPanel();

      panel.toggle('total', anchorEl);
      expect(panel.getCurrentColumn()).toBe('total');

      panel.toggle('doubled', anchorEl);
      expect(panel.getIsOpen()).toBe(true);
      expect(panel.getCurrentColumn()).toBe('doubled');

      panel.destroy();
    });

    it('should remove element from DOM on destroy', () => {
      const panel = createPanel();
      expect(rootEl.contains(panel.getElement())).toBe(true);

      panel.destroy();
      expect(rootEl.contains(panel.getElement())).toBe(false);
    });
  });

  describe('Pre-population', () => {
    it('should pre-populate name input with column name', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const nameInput = panel.getElement().querySelector('.dt-derived-edit-name-input') as HTMLInputElement;
      expect(nameInput.value).toBe('total');

      panel.destroy();
    });

    it('should pre-populate expression editor for expression columns', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const cmEditor = panel.getElement().querySelector('.cm-editor');
      expect(cmEditor).toBeTruthy();
      expect(getEditorValue(panel.getElement())).toBe('price * quantity');

      // Expression section should be visible
      const exprSection = panel.getElement().querySelector('.dt-derived-edit-expr-section') as HTMLElement;
      expect(exprSection.style.display).not.toBe('none');

      // Vector section should be hidden
      const vectorSection = panel.getElement().querySelector('.dt-derived-edit-vector-section') as HTMLElement;
      expect(vectorSection.style.display).toBe('none');

      panel.destroy();
    });

    it('should show vector info for vector columns', () => {
      // Set up a vector column
      const vectorDef: DerivedColumnDef = {
        kind: 'vector',
        name: 'flags',
        vectorType: 'boolean',
        values: [true, false, true],
      };
      state.derivedColumns.set([vectorDef]);
      state.schema.set([
        ...baseSchema.filter((s) => !s.isDerived),
        {
          name: 'flags',
          type: 'boolean',
          nullable: false,
          originalType: 'BOOLEAN',
          isDerived: true,
        },
      ]);

      const panel = createPanel();
      panel.open('flags', anchorEl);

      // Expression section should be hidden
      const exprSection = panel.getElement().querySelector('.dt-derived-edit-expr-section') as HTMLElement;
      expect(exprSection.style.display).toBe('none');

      // Vector section should be visible
      const vectorSection = panel.getElement().querySelector('.dt-derived-edit-vector-section') as HTMLElement;
      expect(vectorSection.style.display).toBe('');

      // Vector text should show info
      const vectorText = panel.getElement().querySelector('.dt-derived-edit-vector-text') as HTMLElement;
      expect(vectorText.textContent).toContain('Vector column');
      expect(vectorText.textContent).toContain('3 values');

      // Validate button should be hidden
      const validateBtn = panel.getElement().querySelector('.dt-derived-edit-validate') as HTMLElement;
      expect(validateBtn.style.display).toBe('none');

      panel.destroy();
    });

    it('should update title with column name', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const title = panel.getElement().querySelector('.dt-derived-edit-title') as HTMLElement;
      expect(title.textContent).toBe('Edit: total');

      panel.destroy();
    });
  });

  describe('Name validation', () => {
    it('should show error when name is empty', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const nameInput = panel.getElement().querySelector('.dt-derived-edit-name-input') as HTMLInputElement;
      nameInput.value = '';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));

      const nameError = panel.getElement().querySelector('.dt-derived-edit-name-error') as HTMLElement;
      expect(nameError.style.display).not.toBe('none');
      expect(nameError.textContent).toContain('required');

      panel.destroy();
    });

    it('should show error when name duplicates existing column', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const nameInput = panel.getElement().querySelector('.dt-derived-edit-name-input') as HTMLInputElement;
      nameInput.value = 'price';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));

      const nameError = panel.getElement().querySelector('.dt-derived-edit-name-error') as HTMLElement;
      expect(nameError.style.display).not.toBe('none');
      expect(nameError.textContent).toContain('already exists');

      panel.destroy();
    });

    it('should clear error when name is unique', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const nameInput = panel.getElement().querySelector('.dt-derived-edit-name-input') as HTMLInputElement;

      // First set a duplicate
      nameInput.value = 'price';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Then set a unique name
      nameInput.value = 'total_new';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));

      const nameError = panel.getElement().querySelector('.dt-derived-edit-name-error') as HTMLElement;
      expect(nameError.style.display).toBe('none');

      panel.destroy();
    });

    it('should allow keeping the same name (not flag self as duplicate)', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const nameInput = panel.getElement().querySelector('.dt-derived-edit-name-input') as HTMLInputElement;
      // Name is already 'total' — re-enter it
      nameInput.value = 'total';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));

      const nameError = panel.getElement().querySelector('.dt-derived-edit-name-error') as HTMLElement;
      expect(nameError.style.display).toBe('none');

      panel.destroy();
    });
  });

  describe('Update button state', () => {
    it('should start with update button disabled (expression not validated)', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const updateBtn = panel.getElement().querySelector('.dt-derived-edit-update') as HTMLButtonElement;
      expect(updateBtn.disabled).toBe(true);

      panel.destroy();
    });

    it('should enable update button for vector columns when name is valid', () => {
      const vectorDef: DerivedColumnDef = {
        kind: 'vector',
        name: 'flags',
        vectorType: 'boolean',
        values: [true, false],
      };
      state.derivedColumns.set([vectorDef]);
      state.schema.set([
        ...baseSchema.filter((s) => !s.isDerived),
        {
          name: 'flags',
          type: 'boolean',
          nullable: false,
          originalType: 'BOOLEAN',
          isDerived: true,
        },
      ]);

      const panel = createPanel();
      panel.open('flags', anchorEl);

      // Vector columns don't need expression validation
      const updateBtn = panel.getElement().querySelector('.dt-derived-edit-update') as HTMLButtonElement;
      expect(updateBtn.disabled).toBe(false);

      panel.destroy();
    });
  });

  describe('Validate button', () => {
    it('should call actions.validateExpression on click', async () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      // Mock validateExpression
      const validateSpy = vi.spyOn(actions, 'validateExpression').mockResolvedValue({
        valid: true,
        type: 'float',
        originalType: 'DOUBLE',
      });

      const validateBtn = panel.getElement().querySelector('.dt-derived-edit-validate') as HTMLButtonElement;
      validateBtn.click();

      // Wait for async
      await vi.waitFor(() => {
        expect(validateSpy).toHaveBeenCalledWith('price * quantity');
      });

      // Type preview should show result
      const typePreview = panel.getElement().querySelector('.dt-derived-edit-type-preview') as HTMLElement;
      expect(typePreview.textContent).toContain('float');

      // Update button should now be enabled
      const updateBtn = panel.getElement().querySelector('.dt-derived-edit-update') as HTMLButtonElement;
      expect(updateBtn.disabled).toBe(false);

      panel.destroy();
    });

    it('should show error when validation fails', async () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      vi.spyOn(actions, 'validateExpression').mockResolvedValue({
        valid: false,
        error: 'Column "nonexistent" not found',
      });

      const validateBtn = panel.getElement().querySelector('.dt-derived-edit-validate') as HTMLButtonElement;
      validateBtn.click();

      await vi.waitFor(() => {
        const typePreview = panel.getElement().querySelector('.dt-derived-edit-type-preview') as HTMLElement;
        expect(typePreview.textContent).toContain('not found');
      });

      // Update button should remain disabled
      const updateBtn = panel.getElement().querySelector('.dt-derived-edit-update') as HTMLButtonElement;
      expect(updateBtn.disabled).toBe(true);

      panel.destroy();
    });
  });

  describe('Update action', () => {
    it('should call updateDerivedColumn with correct arguments', async () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      // First validate
      vi.spyOn(actions, 'validateExpression').mockResolvedValue({
        valid: true,
        type: 'float',
        originalType: 'DOUBLE',
      });

      const validateBtn = panel.getElement().querySelector('.dt-derived-edit-validate') as HTMLButtonElement;
      validateBtn.click();

      await vi.waitFor(() => {
        const updateBtn = panel.getElement().querySelector('.dt-derived-edit-update') as HTMLButtonElement;
        expect(updateBtn.disabled).toBe(false);
      });

      // Mock update
      const updateSpy = vi.spyOn(actions, 'updateDerivedColumn').mockResolvedValue({
        success: true,
      });

      // Change expression before updating
      setEditorValue(panel.getElement(), 'price * 2');

      // Re-validate since expression changed
      validateBtn.click();
      await vi.waitFor(() => {
        const updateBtn = panel.getElement().querySelector('.dt-derived-edit-update') as HTMLButtonElement;
        expect(updateBtn.disabled).toBe(false);
      });

      const updateBtn = panel.getElement().querySelector('.dt-derived-edit-update') as HTMLButtonElement;
      updateBtn.click();

      await vi.waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith('total', {
          kind: 'expression',
          name: 'total',
          expression: 'price * 2',
        });
      });

      // Panel should close on success
      expect(panel.getIsOpen()).toBe(false);

      panel.destroy();
    });
  });

  describe('Delete flow', () => {
    it('should show inline confirmation on delete click', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const deleteBtn = panel.getElement().querySelector('.dt-derived-edit-delete') as HTMLElement;
      const confirmDiv = panel.getElement().querySelector('.dt-derived-edit-delete-confirm') as HTMLElement;

      expect(confirmDiv.style.display).toBe('none');

      deleteBtn.click();

      expect(deleteBtn.style.display).toBe('none');
      expect(confirmDiv.style.display).toBe('flex');

      panel.destroy();
    });

    it('should call removeDerivedColumn on confirm', async () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const removeSpy = vi.spyOn(actions, 'removeDerivedColumn').mockResolvedValue();

      // Click delete
      const deleteBtn = panel.getElement().querySelector('.dt-derived-edit-delete') as HTMLElement;
      deleteBtn.click();

      // Click confirm
      const confirmBtn = panel.getElement().querySelector('.dt-derived-edit-delete-confirm-yes') as HTMLElement;
      confirmBtn.click();

      await vi.waitFor(() => {
        expect(removeSpy).toHaveBeenCalledWith('total');
      });

      panel.destroy();
    });

    it('should hide confirmation on cancel', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      // Click delete
      const deleteBtn = panel.getElement().querySelector('.dt-derived-edit-delete') as HTMLElement;
      deleteBtn.click();

      // Click cancel
      const cancelBtn = panel.getElement().querySelector('.dt-derived-edit-delete-confirm-no') as HTMLElement;
      cancelBtn.click();

      const confirmDiv = panel.getElement().querySelector('.dt-derived-edit-delete-confirm') as HTMLElement;
      expect(confirmDiv.style.display).toBe('none');
      expect(deleteBtn.style.display).toBe('');

      panel.destroy();
    });
  });

  describe('Close handlers', () => {
    it('should close on Escape key', async () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      // Wait for rAF to register close handlers
      await new Promise((r) => requestAnimationFrame(r));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(panel.getIsOpen()).toBe(false);

      panel.destroy();
    });

    it('should close on outside click (mousedown)', async () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      // Wait for rAF to register close handlers
      await new Promise((r) => requestAnimationFrame(r));

      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(panel.getIsOpen()).toBe(false);

      panel.destroy();
    });

    it('should NOT close when clicking inside panel', async () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      // Wait for rAF
      await new Promise((r) => requestAnimationFrame(r));

      const panelEl = panel.getElement();
      panelEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(panel.getIsOpen()).toBe(true);

      panel.destroy();
    });

    it('should close on close button click', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      const closeBtn = panel.getElement().querySelector('.dt-derived-edit-close') as HTMLElement;
      closeBtn.click();

      expect(panel.getIsOpen()).toBe(false);

      panel.destroy();
    });
  });

  describe('External state changes', () => {
    it('should close panel when current column is removed externally', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      expect(panel.getIsOpen()).toBe(true);

      // Simulate external removal (e.g., undo)
      state.derivedColumns.set([]);

      expect(panel.getIsOpen()).toBe(false);

      panel.destroy();
    });

    it('should remain open if a different column is removed', () => {
      // Add second derived column
      const secondDef: DerivedColumnDef = {
        kind: 'expression',
        name: 'doubled',
        expression: 'price * 2',
      };
      state.derivedColumns.set([...derivedDefs, secondDef]);

      const panel = createPanel();
      panel.open('total', anchorEl);

      // Remove the other column
      state.derivedColumns.set(derivedDefs);

      expect(panel.getIsOpen()).toBe(true);
      expect(panel.getCurrentColumn()).toBe('total');

      panel.destroy();
    });
  });

  describe('Delete confirmation reset', () => {
    it('should reset delete confirmation state when reopening', () => {
      const panel = createPanel();
      panel.open('total', anchorEl);

      // Show delete confirmation
      const deleteBtn = panel.getElement().querySelector('.dt-derived-edit-delete') as HTMLElement;
      deleteBtn.click();

      // Close and reopen
      panel.close();
      panel.open('total', anchorEl);

      // Confirm div should be hidden again
      const confirmDiv = panel.getElement().querySelector('.dt-derived-edit-delete-confirm') as HTMLElement;
      expect(confirmDiv.style.display).toBe('none');
      expect(deleteBtn.style.display).toBe('');

      panel.destroy();
    });
  });
});
