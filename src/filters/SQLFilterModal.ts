/**
 * SQLFilterModal — centered modal dialog for creating and editing SQL filter
 * expressions (raw WHERE conditions).
 *
 * Follows the DerivedColumnModal pattern: fixed backdrop, body scroll lock,
 * Escape/backdrop-click close, lazy CodeMirror editor lifecycle.
 */

import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { ExpressionEditor, ExpressionEditorFactory } from '../derived/ExpressionEditorTypes';
import { CodeMirrorExpressionEditor } from '../sql-editor/CodeMirrorExpressionEditor';
import type { RawSQLFilter } from './FilterTypes';

export interface SQLFilterModalOptions {
  classPrefix?: string;
  /** Custom editor factory. If omitted, uses CodeMirrorExpressionEditor. */
  editorFactory?: ExpressionEditorFactory;
}

export class SQLFilterModal {
  private element: HTMLElement;
  private dialogEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private labelInput!: HTMLInputElement;
  private editorContainer!: HTMLElement;
  private validateBtn!: HTMLButtonElement;
  private previewEl!: HTMLElement;
  private applyBtn!: HTMLButtonElement;
  private removeSection!: HTMLElement;
  private removeBtn!: HTMLButtonElement;
  private removeConfirmDiv!: HTMLElement;

  private readonly prefix: string;
  private editorFactory?: ExpressionEditorFactory;
  private currentEditor: ExpressionEditor | null = null;
  private editorInputHandler: (() => void) | null = null;
  private isOpen = false;
  private destroyed = false;
  private validated = false;
  private applying = false;
  private scrollLockHandler: ((e: Event) => void) | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

  /** null = create mode, string = edit mode (the filter id) */
  private currentFilterId: string | null = null;

  constructor(
    private state: TableState,
    private actions: StateActions,
    options?: SQLFilterModalOptions
  ) {
    this.prefix = options?.classPrefix ?? 'dt';
    this.editorFactory = options?.editorFactory;
    this.element = this.createElement();
  }

  // =========================================
  // DOM Creation
  // =========================================

  private createElement(): HTMLElement {
    const p = this.prefix;

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = `${p}-sql-filter-modal-backdrop`;
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) this.close();
    });

    // Dialog
    const dialog = document.createElement('div');
    dialog.className = `${p}-sql-filter-modal-dialog`;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', `${p}-sql-filter-modal-title`);
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
    header.className = `${p}-sql-filter-modal-header`;

    this.titleEl = document.createElement('span');
    this.titleEl.className = `${p}-sql-filter-modal-title`;
    this.titleEl.id = `${p}-sql-filter-modal-title`;
    this.titleEl.textContent = 'New Expression Filter';

    const closeBtn = document.createElement('button');
    closeBtn.className = `${p}-sql-filter-modal-close`;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
      </svg>
    `;
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(this.titleEl);
    header.appendChild(closeBtn);
    return header;
  }

  private createBody(): HTMLElement {
    const p = this.prefix;

    const body = document.createElement('div');
    body.className = `${p}-sql-filter-modal-body`;

    // — Label section
    const labelSection = document.createElement('div');
    labelSection.className = `${p}-sql-filter-modal-section`;

    const labelLabel = document.createElement('label');
    labelLabel.textContent = 'Label (optional)';

    this.labelInput = document.createElement('input');
    this.labelInput.type = 'text';
    this.labelInput.className = `${p}-filter-input`;
    this.labelInput.placeholder = 'e.g., High-value orders';

    const hint = document.createElement('div');
    hint.className = `${p}-sql-filter-modal-hint`;
    hint.textContent = 'Shown on the filter chip instead of the SQL text';

    labelSection.appendChild(labelLabel);
    labelSection.appendChild(this.labelInput);
    labelSection.appendChild(hint);
    body.appendChild(labelSection);

    // — SQL section
    const sqlSection = document.createElement('div');
    sqlSection.className = `${p}-sql-filter-modal-section`;

    const sqlLabel = document.createElement('label');
    sqlLabel.textContent = 'SQL WHERE condition';

    this.editorContainer = document.createElement('div');
    this.editorContainer.className = `${p}-sql-filter-modal-editor-container`;

    sqlSection.appendChild(sqlLabel);
    sqlSection.appendChild(this.editorContainer);
    body.appendChild(sqlSection);

    // — Actions row
    const actionsRow = document.createElement('div');
    actionsRow.className = `${p}-sql-filter-modal-actions`;

    this.validateBtn = document.createElement('button');
    this.validateBtn.className = `${p}-sql-filter-modal-validate`;
    this.validateBtn.type = 'button';
    this.validateBtn.textContent = 'Validate';
    this.validateBtn.addEventListener('click', () => this.handleValidate());

    this.previewEl = document.createElement('span');
    this.previewEl.className = `${p}-sql-filter-modal-preview`;

    actionsRow.appendChild(this.validateBtn);
    actionsRow.appendChild(this.previewEl);
    body.appendChild(actionsRow);

    // — Remove section (visible only in edit mode)
    this.removeSection = document.createElement('div');
    this.removeSection.className = `${p}-sql-filter-modal-remove-section`;

    const divider = document.createElement('hr');
    divider.className = `${p}-sql-filter-modal-divider`;

    const dangerZone = document.createElement('div');
    dangerZone.className = `${p}-sql-filter-modal-danger-zone`;

    this.removeBtn = document.createElement('button');
    this.removeBtn.className = `${p}-sql-filter-modal-remove`;
    this.removeBtn.type = 'button';
    this.removeBtn.textContent = 'Remove Filter';
    this.removeBtn.addEventListener('click', () => {
      this.removeBtn.style.display = 'none';
      this.removeConfirmDiv.style.display = 'flex';
    });

    this.removeConfirmDiv = document.createElement('div');
    this.removeConfirmDiv.className = `${p}-sql-filter-modal-remove-confirm`;

    const confirmText = document.createElement('span');
    confirmText.textContent = 'Are you sure?';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `${p}-sql-filter-modal-remove-confirm-btn ${p}-sql-filter-modal-remove-confirm-yes`;
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', () => this.handleConfirmRemove());

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `${p}-sql-filter-modal-remove-confirm-btn ${p}-sql-filter-modal-remove-confirm-no`;
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      this.removeConfirmDiv.style.display = 'none';
      this.removeBtn.style.display = '';
    });

    this.removeConfirmDiv.appendChild(confirmText);
    this.removeConfirmDiv.appendChild(confirmBtn);
    this.removeConfirmDiv.appendChild(cancelBtn);

    dangerZone.appendChild(this.removeBtn);
    dangerZone.appendChild(this.removeConfirmDiv);

    this.removeSection.appendChild(divider);
    this.removeSection.appendChild(dangerZone);
    body.appendChild(this.removeSection);

    return body;
  }

  private createFooter(): HTMLElement {
    const p = this.prefix;

    const footer = document.createElement('div');
    footer.className = `${p}-sql-filter-modal-footer`;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `${p}-sql-filter-modal-cancel`;
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.close());
    footer.appendChild(cancelBtn);

    this.applyBtn = document.createElement('button');
    this.applyBtn.className = `${p}-sql-filter-modal-apply`;
    this.applyBtn.type = 'button';
    this.applyBtn.textContent = 'Apply';
    this.applyBtn.disabled = true;
    this.applyBtn.addEventListener('click', () => this.handleApply());
    footer.appendChild(this.applyBtn);

    return footer;
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
        this.prefix,
        { placeholder: "Enter WHERE condition, e.g. age > 18 AND status = 'active'" }
      );
    }

    // Listen for input changes to reset validation
    this.removeEditorInputListener();
    this.editorInputHandler = () => {
      this.validated = false;
      this.previewEl.textContent = '';
      this.previewEl.style.color = '';
      this.currentEditor?.setError(null);
      this.updateApplyButtonState();
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
  // Validation
  // =========================================

  private async handleValidate(): Promise<void> {
    if (!this.currentEditor) return;

    const sql = this.currentEditor.getValue().trim();
    if (!sql) return;

    this.validateBtn.disabled = true;
    this.validateBtn.textContent = 'Validating\u2026';
    this.currentEditor.setError(null);

    try {
      const result = await this.actions.validateSQLFilter(sql);
      if (result.valid) {
        this.previewEl.textContent = `${result.matchCount!.toLocaleString()} rows match`;
        this.previewEl.style.color = 'var(--dt-success)';
        this.validated = true;
      } else {
        this.previewEl.textContent = result.error!;
        this.previewEl.style.color = 'var(--dt-error)';
        this.currentEditor.setError(result.error!);
        this.validated = false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.previewEl.textContent = msg;
      this.previewEl.style.color = 'var(--dt-error)';
      this.currentEditor.setError(msg);
      this.validated = false;
    } finally {
      this.validateBtn.disabled = false;
      this.validateBtn.textContent = 'Validate';
      this.updateApplyButtonState();
    }
  }

  // =========================================
  // Apply / Update / Remove
  // =========================================

  private async handleApply(): Promise<void> {
    if (!this.currentEditor || this.applying) return;

    const sql = this.currentEditor.getValue().trim();
    if (!sql || !this.validated) return;

    const label = this.labelInput.value.trim() || undefined;

    this.applying = true;
    this.updateApplyButtonState();

    try {
      if (this.currentFilterId === null) {
        // Create mode
        this.actions.addRawSQLFilter(sql, label);
      } else {
        // Edit mode
        this.actions.updateRawSQLFilter(this.currentFilterId, sql, label);
      }
      this.close();
    } finally {
      this.applying = false;
    }
  }

  private handleConfirmRemove(): void {
    if (this.currentFilterId === null) return;

    this.actions.removeRawSQLFilter(this.currentFilterId);
    this.close();
  }

  private updateApplyButtonState(): void {
    const hasSQL = this.currentEditor ? this.currentEditor.getValue().trim() !== '' : false;
    this.applyBtn.disabled = !hasSQL || !this.validated || this.applying;
  }

  // =========================================
  // Open / Close
  // =========================================

  /** Open the modal in create mode (empty fields) */
  open(): void {
    if (this.destroyed || this.isOpen) return;

    this.currentFilterId = null;
    this.titleEl.textContent = 'New Expression Filter';
    this.applyBtn.textContent = 'Apply';
    this.removeSection.style.display = 'none';

    this.showModal();

    // Focus label input
    requestAnimationFrame(() => {
      this.labelInput.focus();
    });
  }

  /** Open the modal in edit mode (pre-populated from existing SQL filter) */
  openForEdit(filterId: string): void {
    if (this.destroyed || this.isOpen) return;

    // Find the filter
    const filters = this.state.filters.get();
    const syntheticKey = `__raw_sql_${filterId}__`;
    const filter = filters.find(
      (f): f is RawSQLFilter => f.type === 'raw-sql' && f.column === syntheticKey
    );
    if (!filter) return;

    this.currentFilterId = filterId;
    this.titleEl.textContent = 'Edit Expression Filter';
    this.applyBtn.textContent = 'Update';
    this.removeSection.style.display = '';

    // Reset remove confirmation state
    this.removeBtn.style.display = '';
    this.removeConfirmDiv.style.display = 'none';

    this.showModal();

    // Pre-populate fields
    this.labelInput.value = filter.label ?? '';
    if (this.currentEditor) {
      this.currentEditor.setValue(filter.sql);
    }

    // Focus editor
    requestAnimationFrame(() => {
      this.currentEditor?.focus();
    });
  }

  /** Shared open logic for both create and edit modes */
  private showModal(): void {
    this.isOpen = true;
    this.element.classList.add(`${this.prefix}-sql-filter-modal-backdrop--open`);

    // Prevent background scrolling (allow inside dialog)
    this.scrollLockHandler = (e: Event) => {
      if (this.dialogEl.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener('wheel', this.scrollLockHandler, { passive: false });
    document.addEventListener('touchmove', this.scrollLockHandler, { passive: false });

    // Reset form state
    this.resetForm();

    // Create editor
    this.ensureEditor();

    // Register Escape handler
    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If CodeMirror autocomplete is open, let it handle Escape first
        if (document.querySelector('.cm-tooltip-autocomplete')) return;
        e.stopPropagation();
        this.close();
      }
    };
    document.addEventListener('keydown', this.escapeHandler, true);
  }

  close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.element.classList.remove(`${this.prefix}-sql-filter-modal-backdrop--open`);

    // Restore background scrolling
    if (this.scrollLockHandler) {
      document.removeEventListener('wheel', this.scrollLockHandler);
      document.removeEventListener('touchmove', this.scrollLockHandler);
      this.scrollLockHandler = null;
    }

    // Unregister Escape handler
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler, true);
      this.escapeHandler = null;
    }

    // Destroy editor to free resources
    this.destroyEditor();

    this.currentFilterId = null;
  }

  private resetForm(): void {
    this.labelInput.value = '';
    this.validated = false;
    this.applying = false;
    this.previewEl.textContent = '';
    this.previewEl.style.color = '';
    this.applyBtn.disabled = true;

    // Destroy and recreate editor for clean state
    this.destroyEditor();
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

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
