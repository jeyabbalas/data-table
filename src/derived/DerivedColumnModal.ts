/**
 * DerivedColumnModal — centered modal dialog for creating new derived columns.
 *
 * Supports two modes: "expression" (SQL evaluated by DuckDB) and "vector"
 * (pre-computed JS arrays). Follows the ExportDialog modal pattern:
 * fixed backdrop, body scroll lock, Escape/backdrop-click close.
 */

import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import { ModalHost } from '../core/ModalHost';
import type { ExpressionEditor, ExpressionEditorFactory } from './ExpressionEditorTypes';
import { CodeMirrorExpressionEditor } from '../sql-editor/CodeMirrorExpressionEditor';
import type { DerivedColumnDef, VectorDataType } from './types';

export interface DerivedColumnModalOptions {
  classPrefix?: string;
  /**
   * Unique per-instance identifier mixed into element IDs so two tables on
   * the same page don't collide on `aria-labelledby` targets. Normally
   * supplied by `TableContainer`/`createDataTable()`; defaults to `''`
   * for standalone/test construction.
   */
  instanceId?: string;
  /** Custom editor factory (e.g., CodeMirror). If omitted, uses DefaultExpressionEditor. */
  editorFactory?: ExpressionEditorFactory;
  /** Called after a derived column is successfully created. */
  onCreated?: () => void;
  /**
   * Element to mirror `data-dt-color-scheme` from. The modal backdrop
   * portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
   * pass the `.dt-root` element here to keep it theme-synced.
   */
  colorSchemeSource?: HTMLElement;
}

export class DerivedColumnModal {
  private element: HTMLElement;
  private dialogEl!: HTMLElement;
  private nameInput!: HTMLInputElement;
  private nameErrorEl!: HTMLElement;
  private expressionRadio!: HTMLInputElement;
  private vectorRadio!: HTMLInputElement;
  private expressionSection!: HTMLElement;
  private vectorSection!: HTMLElement;
  private editorContainer!: HTMLElement;
  private validateBtn!: HTMLButtonElement;
  private typePreview!: HTMLElement;
  private vectorTypeSelect!: HTMLSelectElement;
  private vectorTextarea!: HTMLTextAreaElement;
  private vectorInfoEl!: HTMLElement;
  private vectorErrorEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private createBtn!: HTMLButtonElement;

  private readonly prefix: string;
  private readonly instanceId: string;
  private editorFactory?: ExpressionEditorFactory;
  private onCreated?: () => void;
  private colorSchemeSource?: HTMLElement;
  private currentEditor: ExpressionEditor | null = null;
  private editorInputHandler: (() => void) | null = null;
  private isOpen = false;
  private destroyed = false;
  private expressionValidated = false;
  private validationVersion = 0;
  private creating = false;
  private modalHost = new ModalHost();

  constructor(
    private state: TableState,
    private actions: StateActions,
    options?: DerivedColumnModalOptions
  ) {
    this.prefix = options?.classPrefix ?? 'dt';
    this.instanceId = options?.instanceId ?? '';
    this.editorFactory = options?.editorFactory;
    this.onCreated = options?.onCreated;
    this.colorSchemeSource = options?.colorSchemeSource;
    this.element = this.createElement();
  }

  // =========================================
  // DOM Creation
  // =========================================

  private createElement(): HTMLElement {
    const p = this.prefix;

    // Backdrop (click-outside handled by ModalHost on open).
    const backdrop = document.createElement('div');
    backdrop.className = `${p}-derived-modal-backdrop`;

    // Dialog (role/aria-modal/aria-labelledby applied by ModalHost on open).
    const dialog = document.createElement('div');
    dialog.className = `${p}-derived-modal-dialog`;
    backdrop.appendChild(dialog);

    dialog.appendChild(this.createHeader());
    dialog.appendChild(this.createBody());
    dialog.appendChild(this.createFooter());

    this.dialogEl = dialog;
    return backdrop;
  }

  private createHeader(): HTMLElement {
    const p = this.prefix;

    const header = document.createElement('div');
    header.className = `${p}-derived-modal-header`;

    const title = document.createElement('span');
    title.className = `${p}-derived-modal-title`;
    title.id = `${p}-${this.instanceId}-derived-modal-title`;
    title.textContent = 'New Derived Column';

    const closeBtn = document.createElement('button');
    closeBtn.className = `${p}-derived-modal-close`;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
      </svg>
    `;
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    return header;
  }

  private createBody(): HTMLElement {
    const p = this.prefix;

    const body = document.createElement('div');
    body.className = `${p}-derived-modal-body`;

    // Name section
    body.appendChild(this.createNameSection());

    // Mode toggle
    body.appendChild(this.createModeToggle());

    // Expression section (default visible)
    this.expressionSection = this.createExpressionSection();
    body.appendChild(this.expressionSection);

    // Vector section (hidden by default)
    this.vectorSection = this.createVectorSection();
    this.vectorSection.style.display = 'none';
    body.appendChild(this.vectorSection);

    // General error area
    this.errorEl = document.createElement('div');
    this.errorEl.className = `${p}-derived-modal-error`;
    this.errorEl.style.display = 'none';
    body.appendChild(this.errorEl);

    return body;
  }

  private createNameSection(): HTMLElement {
    const p = this.prefix;

    const section = document.createElement('div');
    section.className = `${p}-derived-modal-section`;

    const label = document.createElement('label');
    label.textContent = 'Column name';
    section.appendChild(label);

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.className = `${p}-filter-input`;
    this.nameInput.placeholder = 'e.g. total_price';
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.addEventListener('input', () => {
      this.validateName();
      this.updateCreateButtonState();
    });
    section.appendChild(this.nameInput);

    this.nameErrorEl = document.createElement('div');
    this.nameErrorEl.className = `${p}-derived-modal-name-error`;
    this.nameErrorEl.style.display = 'none';
    section.appendChild(this.nameErrorEl);

    return section;
  }

  private createModeToggle(): HTMLElement {
    const p = this.prefix;

    const fieldset = document.createElement('fieldset');
    fieldset.className = `${p}-derived-modal-mode-group`;

    const legend = document.createElement('legend');
    legend.textContent = 'Column type';
    fieldset.appendChild(legend);

    // Expression radio
    const exprLabel = document.createElement('label');
    exprLabel.className = `${p}-derived-modal-mode-option`;
    this.expressionRadio = document.createElement('input');
    this.expressionRadio.type = 'radio';
    this.expressionRadio.name = `${p}-derived-modal-mode`;
    this.expressionRadio.value = 'expression';
    this.expressionRadio.checked = true;
    this.expressionRadio.addEventListener('change', () => this.onModeChange('expression'));
    exprLabel.appendChild(this.expressionRadio);
    exprLabel.appendChild(document.createTextNode('SQL Expression'));
    fieldset.appendChild(exprLabel);

    // Vector radio
    const vecLabel = document.createElement('label');
    vecLabel.className = `${p}-derived-modal-mode-option`;
    this.vectorRadio = document.createElement('input');
    this.vectorRadio.type = 'radio';
    this.vectorRadio.name = `${p}-derived-modal-mode`;
    this.vectorRadio.value = 'vector';
    this.vectorRadio.addEventListener('change', () => this.onModeChange('vector'));
    vecLabel.appendChild(this.vectorRadio);
    vecLabel.appendChild(document.createTextNode('Manually Enter Values'));
    fieldset.appendChild(vecLabel);

    return fieldset;
  }

  private createExpressionSection(): HTMLElement {
    const p = this.prefix;

    const section = document.createElement('div');
    section.className = `${p}-derived-modal-section`;

    const label = document.createElement('label');
    label.textContent = 'SQL Expression';
    section.appendChild(label);

    this.editorContainer = document.createElement('div');
    this.editorContainer.className = `${p}-derived-modal-editor-container`;
    section.appendChild(this.editorContainer);

    // Actions row: Validate + type preview
    const actionsRow = document.createElement('div');
    actionsRow.className = `${p}-derived-modal-expr-actions`;

    this.validateBtn = document.createElement('button');
    this.validateBtn.className = `${p}-derived-modal-validate`;
    this.validateBtn.type = 'button';
    this.validateBtn.textContent = 'Validate';
    this.validateBtn.addEventListener('click', () => this.handleValidateExpression());
    actionsRow.appendChild(this.validateBtn);

    this.typePreview = document.createElement('span');
    this.typePreview.className = `${p}-derived-modal-type-preview`;
    actionsRow.appendChild(this.typePreview);

    section.appendChild(actionsRow);
    return section;
  }

  private createVectorSection(): HTMLElement {
    const p = this.prefix;

    const section = document.createElement('div');
    section.className = `${p}-derived-modal-section`;

    // Type selector
    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Data type';
    section.appendChild(typeLabel);

    this.vectorTypeSelect = document.createElement('select');
    this.vectorTypeSelect.className = `${p}-filter-select`;
    for (const vtype of ['integer', 'float', 'decimal', 'string', 'boolean', 'uuid', 'date', 'timestamp', 'time', 'interval'] as const) {
      const opt = document.createElement('option');
      opt.value = vtype;
      opt.textContent = vtype;
      this.vectorTypeSelect.appendChild(opt);
    }
    this.vectorTypeSelect.addEventListener('change', () => {
      this.validateVectorValues();
      this.updateCreateButtonState();
    });
    section.appendChild(this.vectorTypeSelect);

    // Values textarea
    const valLabel = document.createElement('label');
    valLabel.textContent = 'Values (one per line)';
    valLabel.style.marginTop = '0.5rem';
    section.appendChild(valLabel);

    this.vectorTextarea = document.createElement('textarea');
    this.vectorTextarea.className = `${p}-derived-modal-vector-textarea`;
    this.vectorTextarea.rows = 8;
    this.vectorTextarea.placeholder = 'Enter one value per line...';
    this.vectorTextarea.spellcheck = false;
    this.vectorTextarea.addEventListener('input', () => {
      this.updateVectorInfo();
      this.validateVectorValues();
      this.updateCreateButtonState();
    });
    section.appendChild(this.vectorTextarea);

    // Info text
    this.vectorInfoEl = document.createElement('div');
    this.vectorInfoEl.className = `${p}-derived-modal-vector-info`;
    section.appendChild(this.vectorInfoEl);

    // Count error
    this.vectorErrorEl = document.createElement('div');
    this.vectorErrorEl.className = `${p}-derived-modal-vector-error`;
    this.vectorErrorEl.style.display = 'none';
    section.appendChild(this.vectorErrorEl);

    return section;
  }

  private createFooter(): HTMLElement {
    const p = this.prefix;

    const footer = document.createElement('div');
    footer.className = `${p}-derived-modal-footer`;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `${p}-derived-modal-cancel`;
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.close());
    footer.appendChild(cancelBtn);

    this.createBtn = document.createElement('button');
    this.createBtn.className = `${p}-derived-modal-create`;
    this.createBtn.type = 'button';
    this.createBtn.textContent = 'Create';
    this.createBtn.disabled = true;
    this.createBtn.addEventListener('click', () => this.handleCreate());
    footer.appendChild(this.createBtn);

    return footer;
  }

  // =========================================
  // Mode Toggle
  // =========================================

  private onModeChange(mode: 'expression' | 'vector'): void {
    if (mode === 'expression') {
      this.expressionSection.style.display = '';
      this.vectorSection.style.display = 'none';
      this.ensureEditor();
    } else {
      this.expressionSection.style.display = 'none';
      this.vectorSection.style.display = '';
      this.updateVectorInfo();
    }

    // Reset validation
    this.expressionValidated = false;
    this.typePreview.textContent = '';
    this.typePreview.style.color = '';
    this.vectorErrorEl.style.display = 'none';
    this.vectorErrorEl.textContent = '';
    this.errorEl.style.display = 'none';

    this.updateCreateButtonState();
  }

  private getCurrentMode(): 'expression' | 'vector' {
    return this.vectorRadio.checked ? 'vector' : 'expression';
  }

  // =========================================
  // Validation
  // =========================================

  private validateName(): void {
    const name = this.nameInput.value.trim();

    if (!name) {
      this.nameErrorEl.textContent = 'Name is required';
      this.nameErrorEl.style.display = '';
      return;
    }

    // Check uniqueness against all existing columns
    const schema = this.state.schema.get();
    const duplicate = schema.find((s) => s.name === name);

    if (duplicate) {
      this.nameErrorEl.textContent = `A column named "${name}" already exists`;
      this.nameErrorEl.style.display = '';
    } else {
      this.nameErrorEl.textContent = '';
      this.nameErrorEl.style.display = 'none';
    }
  }

  private isNameValid(): boolean {
    const name = this.nameInput.value.trim();
    if (!name) return false;

    const schema = this.state.schema.get();
    return !schema.some((s) => s.name === name);
  }

  private updateVectorInfo(): void {
    const lines = this.getVectorLines();
    const count = lines.length;
    const totalRows = this.state.totalRows.get();
    this.vectorInfoEl.textContent = `${count} / ${totalRows} values entered`;
  }

  /** Run both count validation and type-specific validation */
  private validateVectorValues(): void {
    const lines = this.getVectorLines();
    if (lines.length === 0) {
      this.vectorErrorEl.style.display = 'none';
      return;
    }

    // Count check first
    const totalRows = this.state.totalRows.get();
    if (lines.length !== totalRows) {
      this.vectorErrorEl.textContent = `Expected ${totalRows} values, got ${lines.length}`;
      this.vectorErrorEl.style.display = '';
      return;
    }

    // Type-specific validation
    const vectorType = this.vectorTypeSelect.value as VectorDataType;
    const parseResult = this.parseVectorValues(lines, vectorType);
    if (!parseResult.success) {
      this.vectorErrorEl.textContent = parseResult.error!;
      this.vectorErrorEl.style.display = '';
    } else {
      this.vectorErrorEl.textContent = '';
      this.vectorErrorEl.style.display = 'none';
    }
  }

  private isVectorValid(): boolean {
    const lines = this.getVectorLines();
    const totalRows = this.state.totalRows.get();
    if (lines.length !== totalRows || totalRows === 0) return false;
    const vectorType = this.vectorTypeSelect.value as VectorDataType;
    return this.parseVectorValues(lines, vectorType).success;
  }

  private getVectorLines(): string[] {
    const text = this.vectorTextarea.value;
    if (!text.trim()) return [];

    // Split by newlines, trim each, filter empty
    const lines = text.split('\n');
    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    return lines.map((l) => l.trim());
  }

  private updateCreateButtonState(): void {
    const nameValid = this.isNameValid();

    if (this.getCurrentMode() === 'expression') {
      this.createBtn.disabled =
        !nameValid || !this.expressionValidated || this.creating;
    } else {
      this.createBtn.disabled =
        !nameValid || !this.isVectorValid() || this.creating;
    }
  }

  // =========================================
  // Expression Validation
  // =========================================

  private async handleValidateExpression(): Promise<void> {
    if (!this.currentEditor) return;

    const expression = this.currentEditor.getValue().trim();
    if (!expression) {
      this.currentEditor.setError('Expression is required');
      return;
    }

    // Capture version so we can detect stale results if the editor is
    // modified while the async validation is in-flight.
    const versionAtStart = ++this.validationVersion;

    this.validateBtn.disabled = true;
    this.validateBtn.textContent = 'Validating\u2026';

    try {
      const result = await this.actions.validateExpression(expression);
      if (this.validationVersion !== versionAtStart) return; // stale
      if (result.valid) {
        this.typePreview.textContent = `Type: ${result.type} (${result.originalType})`;
        this.typePreview.style.color = 'var(--dt-success)';
        this.expressionValidated = true;
        this.currentEditor.setError(null);
      } else {
        this.typePreview.textContent = result.error ?? 'Validation failed';
        this.typePreview.style.color = 'var(--dt-error)';
        this.expressionValidated = false;
        this.currentEditor.setError(result.error ?? 'Validation failed');
      }
    } catch (err) {
      if (this.validationVersion !== versionAtStart) return; // stale
      const msg = err instanceof Error ? err.message : String(err);
      this.typePreview.textContent = msg;
      this.typePreview.style.color = 'var(--dt-error)';
      this.expressionValidated = false;
      this.currentEditor.setError(msg);
    } finally {
      if (this.validationVersion === versionAtStart) {
        this.validateBtn.disabled = false;
        this.validateBtn.textContent = 'Validate';
        this.updateCreateButtonState();
      }
    }
  }

  // =========================================
  // Create Action
  // =========================================

  private async handleCreate(): Promise<void> {
    if (this.creating) return;

    const name = this.nameInput.value.trim();
    if (!name) return;

    let def: DerivedColumnDef;

    if (this.getCurrentMode() === 'expression') {
      const expression = this.currentEditor?.getValue().trim() ?? '';
      if (!expression) return;
      def = { kind: 'expression', name, expression };
    } else {
      const vectorType = this.vectorTypeSelect.value as VectorDataType;
      const lines = this.getVectorLines();
      const parseResult = this.parseVectorValues(lines, vectorType);
      if (!parseResult.success) {
        this.vectorErrorEl.textContent = parseResult.error!;
        this.vectorErrorEl.style.display = '';
        return;
      }
      def = { kind: 'vector', name, vectorType, values: parseResult.values! };
    }

    this.creating = true;
    this.createBtn.disabled = true;
    this.createBtn.textContent = 'Creating\u2026';
    this.errorEl.style.display = 'none';

    try {
      const result = await this.actions.addDerivedColumn(def);
      if (result.success) {
        this.close();
        this.onCreated?.();
      } else {
        this.errorEl.textContent = result.error ?? 'Failed to create column';
        this.errorEl.style.display = '';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorEl.textContent = msg;
      this.errorEl.style.display = '';
    } finally {
      this.creating = false;
      this.createBtn.textContent = 'Create';
      this.updateCreateButtonState();
    }
  }

  private parseVectorValues(
    lines: string[],
    vectorType: VectorDataType
  ): { success: boolean; values?: number[] | string[] | boolean[]; error?: string } {
    if (vectorType === 'string') {
      return { success: true, values: lines };
    }

    if (vectorType === 'boolean') {
      const values: boolean[] = [];
      for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].toLowerCase();
        if (lower === 'true' || lower === '1') {
          values.push(true);
        } else if (lower === 'false' || lower === '0') {
          values.push(false);
        } else {
          return {
            success: false,
            error: `Line ${i + 1}: "${lines[i]}" is not a valid boolean (use true/false/1/0)`,
          };
        }
      }
      return { success: true, values };
    }

    // Temporal, decimal, and UUID types — validate as strings, DuckDB casts on INSERT
    if (vectorType === 'date') {
      const re = /^\d{4}-\d{2}-\d{2}$/;
      const values: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) {
          return { success: false, error: `Line ${i + 1}: "${lines[i]}" is not a valid date (use YYYY-MM-DD)` };
        }
        values.push(lines[i]);
      }
      return { success: true, values };
    }

    if (vectorType === 'timestamp') {
      const re = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
      const values: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) {
          return { success: false, error: `Line ${i + 1}: "${lines[i]}" is not a valid timestamp (use YYYY-MM-DD HH:MM:SS)` };
        }
        values.push(lines[i]);
      }
      return { success: true, values };
    }

    if (vectorType === 'time') {
      const re = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
      const values: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) {
          return { success: false, error: `Line ${i + 1}: "${lines[i]}" is not a valid time (use HH:MM:SS)` };
        }
        values.push(lines[i]);
      }
      return { success: true, values };
    }

    if (vectorType === 'interval') {
      const values: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().length === 0) {
          return { success: false, error: `Line ${i + 1}: interval cannot be empty (e.g. "1 day 2 hours")` };
        }
        values.push(lines[i]);
      }
      return { success: true, values };
    }

    if (vectorType === 'decimal') {
      const re = /^-?\d+(\.\d+)?$/;
      const values: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) {
          return { success: false, error: `Line ${i + 1}: "${lines[i]}" is not a valid decimal (use a numeric value)` };
        }
        values.push(lines[i]);
      }
      return { success: true, values };
    }

    if (vectorType === 'uuid') {
      const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const values: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) {
          return { success: false, error: `Line ${i + 1}: "${lines[i]}" is not a valid UUID (use xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx format)` };
        }
        values.push(lines[i]);
      }
      return { success: true, values };
    }

    // integer or float
    const values: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (vectorType === 'integer') {
        if (!/^-?\d+$/.test(lines[i])) {
          return {
            success: false,
            error: `Line ${i + 1}: "${lines[i]}" is not a valid integer (use whole numbers only)`,
          };
        }
        const num = parseInt(lines[i], 10);
        if (isNaN(num)) {
          return {
            success: false,
            error: `Line ${i + 1}: "${lines[i]}" is not a valid integer`,
          };
        }
        values.push(num);
      } else {
        const num = parseFloat(lines[i]);
        if (isNaN(num) || !Number.isFinite(num)) {
          return {
            success: false,
            error: `Line ${i + 1}: "${lines[i]}" is not a valid float`,
          };
        }
        values.push(num);
      }
    }
    return { success: true, values };
  }

  // =========================================
  // Editor Lifecycle
  // =========================================

  private ensureEditor(): void {
    if (this.currentEditor) return;

    const context = this.actions.getCompletionContext();
    if (this.editorFactory) {
      this.currentEditor = this.editorFactory(this.editorContainer, context);
    } else {
      this.currentEditor = new CodeMirrorExpressionEditor(
        this.editorContainer,
        context,
        this.prefix
      );
    }

    // Listen for input changes to reset validation
    this.removeEditorInputListener();
    this.editorInputHandler = () => {
      this.validationVersion++;
      this.expressionValidated = false;
      this.typePreview.textContent = '';
      this.typePreview.style.color = '';
      this.updateCreateButtonState();
    };
    this.currentEditor.element.addEventListener('input', this.editorInputHandler);
  }

  private removeEditorInputListener(): void {
    if (this.editorInputHandler && this.currentEditor) {
      this.currentEditor.element.removeEventListener(
        'input',
        this.editorInputHandler
      );
      this.editorInputHandler = null;
    }
  }

  private destroyEditor(): void {
    this.removeEditorInputListener();
    if (this.currentEditor) {
      this.currentEditor.destroy();
      this.currentEditor = null;
    }
    this.editorContainer.innerHTML = '';
  }

  // =========================================
  // Open / Close
  // =========================================

  open(): void {
    if (this.destroyed || this.isOpen) return;

    this.isOpen = true;
    this.element.classList.add(`${this.prefix}-derived-modal-backdrop--open`);

    // Reset form and create expression editor before ModalHost probes focus.
    this.resetForm();
    this.ensureEditor();

    this.modalHost.open({
      mode: 'modal',
      element: this.element,
      dialog: this.dialogEl,
      labelledBy: `${this.prefix}-${this.instanceId}-derived-modal-title`,
      initialFocus: this.nameInput,
      // CodeMirror autocomplete owns its own Escape — let it close first.
      escapeGuard: () => !!document.querySelector('.cm-tooltip-autocomplete'),
      onClose: () => this.handleHostClose(),
      colorSchemeSource: this.colorSchemeSource,
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.modalHost.close();
  }

  private handleHostClose(): void {
    this.isOpen = false;
    this.element.classList.remove(`${this.prefix}-derived-modal-backdrop--open`);

    // Destroy editor to free resources
    this.destroyEditor();
  }

  private resetForm(): void {
    // Name
    this.nameInput.value = '';
    this.nameErrorEl.textContent = '';
    this.nameErrorEl.style.display = 'none';

    // Mode — reset to expression
    this.expressionRadio.checked = true;
    this.vectorRadio.checked = false;
    this.expressionSection.style.display = '';
    this.vectorSection.style.display = 'none';

    // Expression
    this.destroyEditor();
    this.expressionValidated = false;
    this.typePreview.textContent = '';
    this.typePreview.style.color = '';

    // Vector
    this.vectorTypeSelect.value = 'integer';
    this.vectorTextarea.value = '';
    this.vectorErrorEl.textContent = '';
    this.vectorErrorEl.style.display = 'none';
    this.updateVectorInfo();

    // General
    this.errorEl.textContent = '';
    this.errorEl.style.display = 'none';
    this.creating = false;
    this.createBtn.textContent = 'Create';
    this.createBtn.disabled = true;
  }

  // =========================================
  // Public API
  // =========================================

  getElement(): HTMLElement {
    return this.element;
  }

  getIsOpen(): boolean {
    return this.isOpen;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.close();
    this.modalHost.destroy();
    this.destroyEditor();

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
