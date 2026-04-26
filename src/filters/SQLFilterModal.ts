/**
 * SQLFilterModal — centered modal dialog for creating and editing SQL filter
 * expressions (raw WHERE conditions).
 *
 * Follows the DerivedColumnModal pattern: fixed backdrop, body scroll lock,
 * Escape/backdrop-click close, lazy CodeMirror editor lifecycle.
 */

import type { StateActions } from '../core/Actions';
import { ModalHost } from '../core/ModalHost';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';
import type { ExpressionEditor, ExpressionEditorFactory } from '../derived/ExpressionEditorTypes';
import { CodeMirrorExpressionEditor } from '../sql-editor/CodeMirrorExpressionEditor';
import type { RawSQLFilter } from './FilterTypes';

export interface SQLFilterModalOptions {
  classPrefix?: string;
  /**
   * Unique per-instance identifier mixed into element IDs so two tables on
   * the same page don't collide on `aria-labelledby` targets. Normally
   * supplied by `TableContainer`/`createDataTable()`; defaults to `''`
   * for standalone/test construction.
   */
  instanceId?: string;
  /** Custom editor factory. If omitted, uses CodeMirrorExpressionEditor. */
  editorFactory?: ExpressionEditorFactory;
  /**
   * Element to mirror `data-dt-color-scheme` from. The modal backdrop
   * portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
   * pass the `.dt-root` element here to keep it theme-synced.
   */
  colorSchemeSource?: HTMLElement;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings;
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
  private readonly instanceId: string;
  private readonly messages: Strings;
  private editorFactory?: ExpressionEditorFactory;
  private colorSchemeSource?: HTMLElement;
  private currentEditor: ExpressionEditor | null = null;
  private editorInputHandler: (() => void) | null = null;
  private isOpen = false;
  private destroyed = false;
  private validated = false;
  private applying = false;
  private validationVersion = 0;
  private modalHost = new ModalHost();
  private validationAbortController: AbortController | null = null;

  /** null = create mode, string = edit mode (the filter id) */
  private currentFilterId: string | null = null;

  constructor(
    private state: TableState,
    private actions: StateActions,
    options?: SQLFilterModalOptions,
  ) {
    this.prefix = options?.classPrefix ?? 'dt';
    this.instanceId = options?.instanceId ?? '';
    this.messages = options?.messages ?? defaultStrings;
    this.editorFactory = options?.editorFactory;
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
    backdrop.className = `${p}-sql-filter-modal-backdrop`;

    // Dialog (role/aria-modal/aria-labelledby applied by ModalHost on open).
    const dialog = document.createElement('div');
    dialog.className = `${p}-sql-filter-modal-dialog`;
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
    this.titleEl.id = `${p}-${this.instanceId}-sql-filter-modal-title`;
    this.titleEl.textContent = this.messages.filters.sqlFilter.createTitle;

    const closeBtn = document.createElement('button');
    closeBtn.className = `${p}-sql-filter-modal-close`;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', this.messages.filters.sqlFilter.closeLabel);
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
    labelLabel.textContent = this.messages.filters.sqlFilter.labelFieldLabel;

    this.labelInput = document.createElement('input');
    this.labelInput.type = 'text';
    this.labelInput.className = `${p}-filter-input`;
    this.labelInput.placeholder = this.messages.filters.sqlFilter.labelPlaceholder;

    const hint = document.createElement('div');
    hint.className = `${p}-sql-filter-modal-hint`;
    hint.textContent = this.messages.filters.sqlFilter.labelHint;

    labelSection.appendChild(labelLabel);
    labelSection.appendChild(this.labelInput);
    labelSection.appendChild(hint);
    body.appendChild(labelSection);

    // — SQL section
    const sqlSection = document.createElement('div');
    sqlSection.className = `${p}-sql-filter-modal-section`;

    const sqlLabel = document.createElement('label');
    sqlLabel.textContent = this.messages.filters.sqlFilter.conditionLabel;

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
    this.validateBtn.textContent = this.messages.common.validate;
    this.validateBtn.addEventListener('click', () => void this.handleValidate());

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
    this.removeBtn.textContent = this.messages.filters.sqlFilter.removeButton;
    this.removeBtn.addEventListener('click', () => {
      this.removeBtn.style.display = 'none';
      this.removeConfirmDiv.style.display = 'flex';
    });

    this.removeConfirmDiv = document.createElement('div');
    this.removeConfirmDiv.className = `${p}-sql-filter-modal-remove-confirm`;

    const confirmText = document.createElement('span');
    confirmText.textContent = this.messages.filters.sqlFilter.removeConfirmText;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `${p}-sql-filter-modal-remove-confirm-btn ${p}-sql-filter-modal-remove-confirm-yes`;
    confirmBtn.type = 'button';
    confirmBtn.textContent = this.messages.common.confirm;
    confirmBtn.addEventListener('click', () => this.handleConfirmRemove());

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `${p}-sql-filter-modal-remove-confirm-btn ${p}-sql-filter-modal-remove-confirm-no`;
    cancelBtn.type = 'button';
    cancelBtn.textContent = this.messages.common.cancel;
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
    cancelBtn.textContent = this.messages.common.cancel;
    cancelBtn.addEventListener('click', () => this.close());
    footer.appendChild(cancelBtn);

    this.applyBtn = document.createElement('button');
    this.applyBtn.className = `${p}-sql-filter-modal-apply`;
    this.applyBtn.type = 'button';
    this.applyBtn.textContent = this.messages.filters.sqlFilter.applyButton;
    this.applyBtn.disabled = true;
    this.applyBtn.addEventListener('click', () => void this.handleApply());
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
        { placeholder: this.messages.filters.sqlFilter.editorPlaceholder },
      );
    }

    // Listen for input changes to reset validation
    this.removeEditorInputListener();
    this.editorInputHandler = () => {
      this.validationVersion++;
      this.validated = false;
      this.previewEl.textContent = '';
      this.previewEl.style.color = '';
      this.currentEditor?.setError(null);
      // Abort any in-flight validation — the SQL has changed so the result is stale
      this.validationAbortController?.abort();
      this.validationAbortController = null;
      this.validateBtn.disabled = false;
      this.validateBtn.textContent = this.messages.common.validate;
      this.updateApplyButtonState();
    };
    this.currentEditor.element.addEventListener('input', this.editorInputHandler);
  }

  private removeEditorInputListener(): void {
    if (this.editorInputHandler && this.currentEditor) {
      this.currentEditor.element.removeEventListener('input', this.editorInputHandler);
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

    // Abort any in-flight validation query to free the DuckDB worker
    this.validationAbortController?.abort();
    this.validationAbortController = new AbortController();

    // Capture version so we can detect stale results if the editor is
    // modified while the async validation is in-flight.
    const versionAtStart = ++this.validationVersion;

    this.validateBtn.disabled = true;
    this.validateBtn.textContent = this.messages.common.validating;
    this.currentEditor.setError(null);

    try {
      const result = await this.actions.validateSQLFilter(
        sql,
        this.validationAbortController.signal,
      );
      if (this.validationVersion !== versionAtStart) return; // stale
      if (result.valid) {
        this.previewEl.textContent = this.messages.filters.sqlFilter.validationResult(
          result.matchCount!,
        );
        this.previewEl.style.color = 'var(--dt-success)';
        this.validated = true;
      } else {
        this.previewEl.textContent = result.error!;
        this.previewEl.style.color = 'var(--dt-error)';
        this.currentEditor.setError(result.error!);
        this.validated = false;
      }
    } catch (err) {
      if (this.validationVersion !== versionAtStart) return; // stale
      const msg = err instanceof Error ? err.message : String(err);
      this.previewEl.textContent = msg;
      this.previewEl.style.color = 'var(--dt-error)';
      this.currentEditor.setError(msg);
      this.validated = false;
    } finally {
      if (this.validationVersion === versionAtStart) {
        this.validateBtn.disabled = false;
        this.validateBtn.textContent = this.messages.common.validate;
        this.updateApplyButtonState();
      }
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
    this.titleEl.textContent = this.messages.filters.sqlFilter.createTitle;
    this.applyBtn.textContent = this.messages.filters.sqlFilter.applyButton;
    this.removeSection.style.display = 'none';

    this.showModal(this.labelInput);
  }

  /** Open the modal in edit mode (pre-populated from existing SQL filter) */
  openForEdit(filterId: string): void {
    if (this.destroyed || this.isOpen) return;

    // Find the filter
    const filters = this.state.filters.get();
    const syntheticKey = `__raw_sql_${filterId}__`;
    const filter = filters.find(
      (f): f is RawSQLFilter => f.type === 'raw-sql' && f.column === syntheticKey,
    );
    if (!filter) return;

    this.currentFilterId = filterId;
    this.titleEl.textContent = this.messages.filters.sqlFilter.editTitle;
    this.applyBtn.textContent = this.messages.filters.sqlFilter.updateButton;
    this.removeSection.style.display = '';

    // Reset remove confirmation state
    this.removeBtn.style.display = '';
    this.removeConfirmDiv.style.display = 'none';

    // ensureEditor runs inside showModal; set the value and focus it.
    this.showModal(null, () => {
      this.labelInput.value = filter.label ?? '';
      if (this.currentEditor) {
        this.currentEditor.setValue(filter.sql);
        this.currentEditor.focus();
      }
    });
  }

  /** Shared open logic for both create and edit modes */
  private showModal(initialFocus: HTMLElement | null, afterOpen?: () => void): void {
    this.isOpen = true;
    this.element.classList.add(`${this.prefix}-sql-filter-modal-backdrop--open`);

    // Reset form state + create editor before ModalHost probes for focusables.
    this.resetForm();
    this.ensureEditor();

    this.modalHost.open({
      mode: 'modal',
      element: this.element,
      dialog: this.dialogEl,
      labelledBy: `${this.prefix}-${this.instanceId}-sql-filter-modal-title`,
      initialFocus,
      // CodeMirror autocomplete handles its own Escape — don't let ModalHost
      // close the dialog when autocomplete is consuming the key.
      escapeGuard: () => !!document.querySelector('.cm-tooltip-autocomplete'),
      onClose: () => this.handleHostClose(),
      colorSchemeSource: this.colorSchemeSource,
    });

    if (afterOpen) afterOpen();
  }

  close(): void {
    if (!this.isOpen) return;
    this.modalHost.close();
  }

  private handleHostClose(): void {
    this.isOpen = false;
    this.element.classList.remove(`${this.prefix}-sql-filter-modal-backdrop--open`);

    // Abort any in-flight validation query
    this.validationAbortController?.abort();
    this.validationAbortController = null;

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
    this.modalHost.destroy();

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
