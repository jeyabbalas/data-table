/**
 * DerivedColumnEditPanel — floating panel for editing existing derived columns.
 *
 * Opens when the f(x) icon in a derived column header is clicked.
 * Follows the same pattern as FilterPanel: lazy creation, absolute positioning
 * below an anchor, outside-click + Escape close handlers, toggle semantics.
 */

import type { StateActions } from '../core/Actions';
import { ModalHost } from '../core/ModalHost';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';
import { CodeMirrorExpressionEditor } from '../sql-editor/CodeMirrorExpressionEditor';
import type { ExpressionEditor, ExpressionEditorFactory } from './ExpressionEditorTypes';
import type { DerivedColumnDef } from './types';

/** Construction options for {@link DerivedColumnEditPanel}. */
export interface DerivedColumnEditPanelOptions {
  classPrefix?: string | undefined;
  /** Custom editor factory. If omitted, uses DefaultExpressionEditor. */
  editorFactory?: ExpressionEditorFactory | undefined;
  /** Element to mirror `data-dt-color-scheme` from (typically `.dt-root`). */
  colorSchemeSource?: HTMLElement | undefined;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings | undefined;
}

/**
 * Floating panel that hosts the rename / SQL-expression editor for an
 * existing derived column. Composed by the facade; reach for it directly
 * only when assembling a custom container shell.
 */
export class DerivedColumnEditPanel {
  private element: HTMLElement;
  private titleEl: HTMLElement;
  private nameInput: HTMLInputElement;
  private nameErrorEl: HTMLElement;
  private expressionSection: HTMLElement;
  private vectorInfoSection: HTMLElement;
  private vectorInfoText: HTMLElement;
  private editorContainer: HTMLElement;
  private validateBtn: HTMLButtonElement;
  private typePreview: HTMLElement;
  private updateBtn: HTMLButtonElement;
  private deleteBtn: HTMLButtonElement;
  private deleteConfirmDiv: HTMLElement;

  private prefix: string;
  private readonly messages: Strings;
  private editorFactory?: ExpressionEditorFactory | undefined;
  private colorSchemeSource?: HTMLElement | undefined;
  private currentEditor: ExpressionEditor | null = null;
  private currentColumn: string | null = null;
  private currentDef: DerivedColumnDef | null = null;
  private currentAnchor: HTMLElement | null = null;
  private isOpen = false;
  private destroyed = false;
  private expressionValidated = false;
  private validationVersion = 0;
  private updating = false;

  private modalHost = new ModalHost();
  private editorInputHandler: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private state: TableState,
    private actions: StateActions,
    options?: DerivedColumnEditPanelOptions,
  ) {
    this.prefix = options?.classPrefix ?? 'dt';
    this.messages = options?.messages ?? defaultStrings;
    this.editorFactory = options?.editorFactory;
    this.colorSchemeSource = options?.colorSchemeSource;

    // Build DOM
    this.element = this.createElement();

    // Destructure key elements (set by createElement)
    this.titleEl = this.element.querySelector(`.${this.prefix}-derived-edit-title`) as HTMLElement;
    this.nameInput = this.element.querySelector(
      `.${this.prefix}-derived-edit-name-input`,
    ) as HTMLInputElement;
    this.nameErrorEl = this.element.querySelector(
      `.${this.prefix}-derived-edit-name-error`,
    ) as HTMLElement;
    this.expressionSection = this.element.querySelector(
      `.${this.prefix}-derived-edit-expr-section`,
    ) as HTMLElement;
    this.vectorInfoSection = this.element.querySelector(
      `.${this.prefix}-derived-edit-vector-section`,
    ) as HTMLElement;
    this.vectorInfoText = this.element.querySelector(
      `.${this.prefix}-derived-edit-vector-text`,
    ) as HTMLElement;
    this.editorContainer = this.element.querySelector(
      `.${this.prefix}-derived-edit-editor-container`,
    ) as HTMLElement;
    this.validateBtn = this.element.querySelector(
      `.${this.prefix}-derived-edit-validate`,
    ) as HTMLButtonElement;
    this.typePreview = this.element.querySelector(
      `.${this.prefix}-derived-edit-type-preview`,
    ) as HTMLElement;
    this.updateBtn = this.element.querySelector(
      `.${this.prefix}-derived-edit-update`,
    ) as HTMLButtonElement;
    this.deleteBtn = this.element.querySelector(
      `.${this.prefix}-derived-edit-delete`,
    ) as HTMLButtonElement;
    this.deleteConfirmDiv = this.element.querySelector(
      `.${this.prefix}-derived-edit-delete-confirm`,
    ) as HTMLElement;

    // Attach event listeners
    this.attachEventListeners();

    // Subscribe to derivedColumns for external changes
    this.unsubscribe = this.state.derivedColumns.subscribe(() => {
      if (!this.destroyed && this.isOpen && this.currentColumn) {
        const cols = this.state.derivedColumns.get();
        if (!cols.some((d) => d.name === this.currentColumn)) {
          this.close();
        }
      }
    });
  }

  // =========================================
  // DOM Creation
  // =========================================

  private createElement(): HTMLElement {
    const p = this.prefix;
    const el = document.createElement('div');
    el.className = `${p}-derived-edit-panel`;
    el.style.display = 'none';
    el.setAttribute('role', 'dialog');

    // Header
    const header = document.createElement('div');
    header.className = `${p}-derived-edit-header`;

    const title = document.createElement('span');
    title.className = `${p}-derived-edit-title`;
    title.textContent = this.messages.derived.editTitle;

    const closeBtn = document.createElement('button');
    closeBtn.className = `${p}-derived-edit-close`;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', this.messages.derived.closeEditLabel);
    closeBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
      </svg>
    `;

    header.appendChild(title);
    header.appendChild(closeBtn);
    el.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = `${p}-derived-edit-body`;

    // — Name section
    const nameSection = document.createElement('div');
    nameSection.className = `${p}-derived-edit-section`;

    const nameLabel = document.createElement('label');
    nameLabel.textContent = this.messages.derived.nameLabel;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = `${p}-filter-input ${p}-derived-edit-name-input`;
    nameInput.autocomplete = 'off';
    nameInput.spellcheck = false;

    const nameError = document.createElement('div');
    nameError.className = `${p}-derived-edit-name-error`;

    nameSection.appendChild(nameLabel);
    nameSection.appendChild(nameInput);
    nameSection.appendChild(nameError);
    body.appendChild(nameSection);

    // — Expression section (hidden for vector columns)
    const exprSection = document.createElement('div');
    exprSection.className = `${p}-derived-edit-section ${p}-derived-edit-expr-section`;

    const exprLabel = document.createElement('label');
    exprLabel.textContent = this.messages.derived.expressionLabel;

    const editorContainer = document.createElement('div');
    editorContainer.className = `${p}-derived-edit-editor-container`;

    exprSection.appendChild(exprLabel);
    exprSection.appendChild(editorContainer);
    body.appendChild(exprSection);

    // — Vector info section (hidden for expression columns)
    const vectorSection = document.createElement('div');
    vectorSection.className = `${p}-derived-edit-section ${p}-derived-edit-vector-section`;
    vectorSection.style.display = 'none';

    const vectorLabel = document.createElement('label');
    vectorLabel.textContent = this.messages.derived.infoLabel;

    const vectorText = document.createElement('div');
    vectorText.className = `${p}-derived-edit-vector-text`;

    vectorSection.appendChild(vectorLabel);
    vectorSection.appendChild(vectorText);
    body.appendChild(vectorSection);

    // — Actions row
    const actionsRow = document.createElement('div');
    actionsRow.className = `${p}-derived-edit-actions`;

    const validateBtn = document.createElement('button');
    validateBtn.className = `${p}-derived-edit-validate`;
    validateBtn.type = 'button';
    validateBtn.textContent = this.messages.common.validate;

    const typePreview = document.createElement('span');
    typePreview.className = `${p}-derived-edit-type-preview`;

    const updateBtn = document.createElement('button');
    updateBtn.className = `${p}-derived-edit-update`;
    updateBtn.type = 'button';
    updateBtn.textContent = this.messages.common.update;
    updateBtn.disabled = true;

    actionsRow.appendChild(validateBtn);
    actionsRow.appendChild(typePreview);
    actionsRow.appendChild(updateBtn);
    body.appendChild(actionsRow);

    // — Divider
    const divider = document.createElement('hr');
    divider.className = `${p}-derived-edit-divider`;
    body.appendChild(divider);

    // — Danger zone
    const dangerZone = document.createElement('div');
    dangerZone.className = `${p}-derived-edit-danger-zone`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = `${p}-derived-edit-delete`;
    deleteBtn.type = 'button';
    deleteBtn.textContent = this.messages.derived.deleteButton;

    const deleteConfirm = document.createElement('div');
    deleteConfirm.className = `${p}-derived-edit-delete-confirm`;

    const confirmText = document.createElement('span');
    confirmText.textContent = this.messages.common.deleteConfirm;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `${p}-derived-edit-delete-confirm-btn ${p}-derived-edit-delete-confirm-yes`;
    confirmBtn.type = 'button';
    confirmBtn.textContent = this.messages.common.confirm;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `${p}-derived-edit-delete-confirm-btn ${p}-derived-edit-delete-confirm-no`;
    cancelBtn.type = 'button';
    cancelBtn.textContent = this.messages.common.cancel;

    deleteConfirm.appendChild(confirmText);
    deleteConfirm.appendChild(confirmBtn);
    deleteConfirm.appendChild(cancelBtn);

    dangerZone.appendChild(deleteBtn);
    dangerZone.appendChild(deleteConfirm);
    body.appendChild(dangerZone);

    el.appendChild(body);
    return el;
  }

  // =========================================
  // Event Listeners
  // =========================================

  private attachEventListeners(): void {
    // Close button
    const closeBtn = this.element.querySelector(
      `.${this.prefix}-derived-edit-close`,
    ) as HTMLElement;
    closeBtn.addEventListener('click', () => this.close());

    // Name input — real-time validation
    this.nameInput.addEventListener('input', () => {
      this.validateName();
      this.updateButtonState();
    });

    // Validate button
    this.validateBtn.addEventListener('click', () => void this.handleValidate());

    // Update button
    this.updateBtn.addEventListener('click', () => void this.handleUpdate());

    // Delete button
    this.deleteBtn.addEventListener('click', () => {
      this.deleteBtn.style.display = 'none';
      this.deleteConfirmDiv.style.display = 'flex';
    });

    // Delete confirm
    const confirmBtn = this.deleteConfirmDiv.querySelector(
      `.${this.prefix}-derived-edit-delete-confirm-yes`,
    ) as HTMLElement;
    confirmBtn.addEventListener('click', () => void this.handleConfirmDelete());

    // Delete cancel
    const cancelBtn = this.deleteConfirmDiv.querySelector(
      `.${this.prefix}-derived-edit-delete-confirm-no`,
    ) as HTMLElement;
    cancelBtn.addEventListener('click', () => {
      this.deleteConfirmDiv.style.display = 'none';
      this.deleteBtn.style.display = '';
    });
  }

  // =========================================
  // Positioning
  // =========================================

  private position(anchorElement: HTMLElement): void {
    const rootEl = this.element.parentElement;
    if (!rootEl) return;

    const rootRect = rootEl.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();

    let left = anchorRect.left - rootRect.left;
    const top = anchorRect.bottom - rootRect.top + 4; // 4px gap

    // Read the live width after the panel is visible so CSS overrides drive
    // edge clamping. Falls back to 360 (CSS default) when offsetWidth is 0.
    const panelWidth = this.element.offsetWidth || 360;

    // Clamp left so panel doesn't overflow right edge
    if (left + panelWidth > rootRect.width) {
      left = Math.max(0, rootRect.width - panelWidth);
    }

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  // =========================================
  // Open / Close / Toggle
  // =========================================

  toggle(columnName: string, anchorElement: HTMLElement): void {
    if (this.isOpen && this.currentColumn === columnName) {
      this.close();
    } else {
      this.open(columnName, anchorElement);
    }
  }

  open(columnName: string, anchorElement: HTMLElement): void {
    if (this.destroyed) return;

    // Find the derived column definition
    const derivedCols = this.state.derivedColumns.get();
    const def = derivedCols.find((d) => d.name === columnName);
    if (!def) return;

    // Find schema entry for type info
    const schema = this.state.schema.get();
    const colSchema = schema.find((s) => s.name === columnName);

    // If switching columns, destroy old editor
    if (this.currentColumn !== columnName) {
      this.destroyEditor();
    }

    this.currentColumn = columnName;
    this.currentDef = def;

    // Toggle active state on icon button
    if (this.currentAnchor) {
      this.currentAnchor.classList.remove(`${this.prefix}-derived-icon-btn--active`);
    }
    this.currentAnchor = anchorElement;
    anchorElement.classList.add(`${this.prefix}-derived-icon-btn--active`);

    // Update title
    this.titleEl.textContent = this.messages.derived.editTitleForColumn(columnName);

    // Populate name input
    this.nameInput.value = def.name;
    this.nameErrorEl.textContent = '';
    this.nameErrorEl.style.display = 'none';

    // Clear type preview
    this.typePreview.textContent = '';
    this.typePreview.style.color = '';

    // Reset delete confirmation state
    this.deleteBtn.style.display = '';
    this.deleteConfirmDiv.style.display = 'none';

    if (def.kind === 'expression') {
      // Show expression section, hide vector section
      this.expressionSection.style.display = '';
      this.vectorInfoSection.style.display = 'none';
      this.validateBtn.style.display = '';

      // Create expression editor if needed
      if (!this.currentEditor) {
        const context = this.actions.getCompletionContext();
        if (this.editorFactory) {
          this.currentEditor = this.editorFactory(this.editorContainer, context);
        } else {
          this.currentEditor = new CodeMirrorExpressionEditor(
            this.editorContainer,
            context,
            this.prefix,
          );
        }
      }

      this.currentEditor.setValue(def.expression);
      this.currentEditor.setError(null);

      // Listen for expression changes to reset validation
      this.removeEditorInputListener();
      this.editorInputHandler = () => {
        this.validationVersion++;
        this.expressionValidated = false;
        this.typePreview.textContent = '';
        this.typePreview.style.color = '';
        this.updateButtonState();
      };
      this.currentEditor.element.addEventListener('input', this.editorInputHandler);

      this.expressionValidated = false;
    } else {
      // Vector column: show vector info, hide expression section
      this.expressionSection.style.display = 'none';
      this.vectorInfoSection.style.display = '';
      this.validateBtn.style.display = 'none';

      const vectorType = colSchema?.originalType ?? def.vectorType;
      this.vectorInfoText.textContent = this.messages.derived.vectorInfoText(
        vectorType,
        def.values.length,
      );

      // No expression validation needed for vector columns
      this.expressionValidated = true;
    }

    this.updateButtonState();

    // Show panel
    this.isOpen = true;
    this.element.style.display = '';

    // Position below anchor (reads offsetWidth — must run after the panel is
    // visible).
    this.position(anchorElement);

    this.modalHost.open({
      mode: 'panel',
      element: this.element,
      outsideClickIgnore: [`.${this.prefix}-derived-icon-btn`],
      // Let CodeMirror autocomplete consume Escape before we close.
      escapeGuard: () => !!document.querySelector('.cm-tooltip-autocomplete'),
      // Skip initial auto-focus so we don't steal focus from the CodeMirror
      // editor when editing a derived expression column.
      initialFocus: this.nameInput,
      onClose: () => this.handleHostClose(),
      colorSchemeSource: this.colorSchemeSource,
    });
  }

  close(overrides?: { readonly restoreFocus?: boolean }): void {
    if (!this.isOpen) return;
    this.modalHost.close(overrides);
  }

  private handleHostClose(): void {
    this.isOpen = false;

    // Remove active state from icon button
    if (this.currentAnchor) {
      this.currentAnchor.classList.remove(`${this.prefix}-derived-icon-btn--active`);
      this.currentAnchor = null;
    }

    this.element.style.display = 'none';
  }

  // =========================================
  // Validation & Actions
  // =========================================

  private validateName(): void {
    const name = this.nameInput.value.trim();

    if (!name) {
      this.nameErrorEl.textContent = this.messages.derived.nameRequired;
      this.nameErrorEl.style.display = '';
      return;
    }

    // Check uniqueness against schema (excluding current column)
    const schema = this.state.schema.get();
    const duplicate = schema.find((s) => s.name === name && s.name !== this.currentColumn);

    if (duplicate) {
      this.nameErrorEl.textContent = this.messages.derived.nameDuplicate(name);
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
    return !schema.some((s) => s.name === name && s.name !== this.currentColumn);
  }

  private updateButtonState(): void {
    if (this.currentDef?.kind === 'expression') {
      this.updateBtn.disabled = !this.isNameValid() || !this.expressionValidated || this.updating;
    } else {
      // Vector columns: only need valid name
      this.updateBtn.disabled = !this.isNameValid() || this.updating;
    }
  }

  private async handleValidate(): Promise<void> {
    if (!this.currentEditor) return;

    const expression = this.currentEditor.getValue().trim();
    if (!expression) {
      this.currentEditor.setError(this.messages.derived.expressionRequired);
      return;
    }

    // Capture version so we can detect stale results if the editor is
    // modified while the async validation is in-flight.
    const versionAtStart = ++this.validationVersion;

    this.validateBtn.disabled = true;
    this.validateBtn.textContent = this.messages.common.validating;

    try {
      const result = await this.actions.validateExpression(expression);
      if (this.validationVersion !== versionAtStart) return; // stale
      if (result.valid) {
        this.typePreview.textContent = this.messages.derived.typePreview(
          result.type!,
          result.originalType!,
        );
        this.typePreview.style.color = '';
        this.expressionValidated = true;
        this.currentEditor.setError(null);
      } else {
        this.typePreview.textContent = result.error ?? this.messages.derived.validationFailed;
        this.typePreview.style.color = 'var(--dt-error)';
        this.expressionValidated = false;
        this.currentEditor.setError(result.error ?? this.messages.derived.validationFailed);
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
        this.validateBtn.textContent = this.messages.common.validate;
        this.updateButtonState();
      }
    }
  }

  private async handleUpdate(): Promise<void> {
    if (!this.currentColumn || !this.currentDef || this.updating) return;

    const name = this.nameInput.value.trim();
    const oldName = this.currentColumn;

    let newDef: DerivedColumnDef;
    if (this.currentDef.kind === 'expression') {
      const expression = this.currentEditor?.getValue().trim() ?? '';
      newDef = { kind: 'expression', name, expression };
    } else {
      // Vector column: preserve vectorType and values, only rename
      newDef = {
        kind: 'vector',
        name,
        vectorType: this.currentDef.vectorType,
        values: this.currentDef.values,
      };
    }

    this.updating = true;
    this.updateBtn.disabled = true;
    this.updateBtn.textContent = this.messages.common.updating;

    try {
      const result = await this.actions.updateDerivedColumn(oldName, newDef);
      if (result.success) {
        this.close();
      } else {
        this.typePreview.textContent = result.error ?? this.messages.derived.updateFailed;
        this.typePreview.style.color = 'var(--dt-error)';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.typePreview.textContent = msg;
      this.typePreview.style.color = 'var(--dt-error)';
    } finally {
      this.updating = false;
      this.updateBtn.textContent = this.messages.common.update;
      this.updateButtonState();
    }
  }

  private async handleConfirmDelete(): Promise<void> {
    if (!this.currentColumn) return;

    try {
      await this.actions.removeDerivedColumn(this.currentColumn);
      this.close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.typePreview.textContent = this.messages.derived.deleteFailed(msg);
      this.typePreview.style.color = 'var(--dt-error)';
      // Reset delete confirmation back to button state
      this.deleteConfirmDiv.style.display = 'none';
      this.deleteBtn.style.display = '';
    }
  }

  // =========================================
  // Editor Lifecycle
  // =========================================

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
  // Public API
  // =========================================

  getElement(): HTMLElement {
    return this.element;
  }

  getIsOpen(): boolean {
    return this.isOpen;
  }

  getCurrentColumn(): string | null {
    return this.isOpen ? this.currentColumn : null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.close();
    this.modalHost.destroy();

    // Unsubscribe from state
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Destroy editor
    this.destroyEditor();

    // Remove from DOM
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
