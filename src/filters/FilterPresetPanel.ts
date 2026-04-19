/**
 * FilterPresetPanel — floating dropdown panel for managing filter presets
 *
 * Provides save/load/delete/export/import controls for named filter presets.
 * Follows the same positioning and close-handler patterns as FilterPanel.
 */

import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import { ModalHost } from '../core/ModalHost';
import type { FilterPresetManager } from './FilterPresets';
import type { FilterPreset } from './FilterPresetTypes';

export interface FilterPresetPanelOptions {
  classPrefix?: string;
}

export class FilterPresetPanel {
  private element: HTMLElement;
  private nameInput!: HTMLInputElement;
  private descriptionInput!: HTMLTextAreaElement;
  private saveBtn!: HTMLButtonElement;
  private presetListEl!: HTMLElement;
  private exportBtn!: HTMLButtonElement;
  private importStatusEl!: HTMLElement;
  private fileInput!: HTMLInputElement;
  private readonly prefix: string;
  private isOpen = false;
  private destroyed = false;
  private modalHost = new ModalHost();
  private unsubPresets: (() => void) | null = null;
  private unsubFilters: (() => void) | null = null;

  constructor(
    private presetManager: FilterPresetManager,
    private state: TableState,
    private actions: StateActions,
    options?: FilterPresetPanelOptions
  ) {
    this.prefix = options?.classPrefix ?? 'dt';
    this.element = this.createElement();

    // Subscribe to presets signal for reactive list updates
    this.unsubPresets = this.presetManager.presets.subscribe(() => {
      if (!this.destroyed) {
        this.renderPresetList();
        this.updateExportButtonState();
      }
    });

    // Subscribe to filters signal to enable/disable save button
    this.unsubFilters = this.state.filters.subscribe(() => {
      if (!this.destroyed) {
        this.updateSaveButtonState();
      }
    });
  }

  // =========================================
  // DOM Creation
  // =========================================

  private createElement(): HTMLElement {
    const p = this.prefix;

    const el = document.createElement('div');
    el.className = `${p}-filter-preset-panel`;
    el.style.display = 'none';
    el.setAttribute('role', 'dialog');

    // --- Header ---
    const header = document.createElement('div');
    header.className = `${p}-filter-preset-header`;

    const title = document.createElement('span');
    title.className = `${p}-filter-preset-title`;
    title.textContent = 'Filter Presets';

    const closeBtn = document.createElement('button');
    closeBtn.className = `${p}-filter-preset-close`;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close presets panel');
    closeBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
      </svg>
    `;
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    el.appendChild(header);

    // --- Body ---
    const body = document.createElement('div');
    body.className = `${p}-filter-preset-body`;

    // Save section
    const saveSection = document.createElement('div');
    saveSection.className = `${p}-filter-preset-save-section`;

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.className = `${p}-filter-input`;
    this.nameInput.placeholder = 'Preset name';
    this.nameInput.addEventListener('input', () => this.updateSaveButtonState());
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.saveBtn.disabled) {
        this.handleSave();
      }
    });

    this.descriptionInput = document.createElement('textarea');
    this.descriptionInput.className = `${p}-filter-input`;
    this.descriptionInput.placeholder = 'Description (optional)';
    this.descriptionInput.rows = 2;

    this.saveBtn = document.createElement('button');
    this.saveBtn.className = `${p}-filter-preset-save-btn`;
    this.saveBtn.type = 'button';
    this.saveBtn.textContent = 'Save Current Filters';
    this.saveBtn.disabled = true;
    this.saveBtn.addEventListener('click', () => this.handleSave());

    saveSection.appendChild(this.nameInput);
    saveSection.appendChild(this.descriptionInput);
    saveSection.appendChild(this.saveBtn);
    body.appendChild(saveSection);

    // Divider
    body.appendChild(this.createDivider());

    // Preset list
    this.presetListEl = document.createElement('div');
    this.presetListEl.className = `${p}-filter-preset-list`;
    body.appendChild(this.presetListEl);

    // Divider
    body.appendChild(this.createDivider());

    // Import/Export section
    const ioSection = document.createElement('div');
    ioSection.className = `${p}-filter-preset-io`;

    this.exportBtn = document.createElement('button');
    this.exportBtn.className = `${p}-filter-preset-io-btn`;
    this.exportBtn.type = 'button';
    this.exportBtn.textContent = 'Export All';
    this.exportBtn.disabled = this.presetManager.getPresets().length === 0;
    this.exportBtn.addEventListener('click', () => this.handleExport());

    const importBtn = document.createElement('button');
    importBtn.className = `${p}-filter-preset-io-btn`;
    importBtn.type = 'button';
    importBtn.textContent = 'Import';
    importBtn.addEventListener('click', () => this.fileInput.click());

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => this.handleImport());

    this.importStatusEl = document.createElement('span');
    this.importStatusEl.className = `${p}-filter-preset-import-status`;

    ioSection.appendChild(this.exportBtn);
    ioSection.appendChild(importBtn);
    ioSection.appendChild(this.fileInput);
    ioSection.appendChild(this.importStatusEl);
    body.appendChild(ioSection);

    el.appendChild(body);
    return el;
  }

  private createDivider(): HTMLElement {
    const div = document.createElement('div');
    div.className = `${this.prefix}-filter-preset-divider`;
    return div;
  }

  // =========================================
  // Positioning (same algorithm as FilterPanel)
  // =========================================

  private position(anchorElement: HTMLElement): void {
    const rootEl = this.element.parentElement;
    if (!rootEl) return;

    const rootRect = rootEl.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();

    let left = anchorRect.left - rootRect.left;
    const top = anchorRect.bottom - rootRect.top + 4; // 4px gap

    // Read the live width after the panel is visible so --dt-panel-width
    // overrides drive edge clamping.
    const panelWidth = this.element.offsetWidth || 320;

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

  toggle(anchorElement: HTMLElement): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open(anchorElement);
    }
  }

  open(anchorElement: HTMLElement): void {
    if (this.destroyed) return;

    this.isOpen = true;
    this.element.style.display = '';

    this.updateSaveButtonState();
    this.updateExportButtonState();
    this.renderPresetList();
    this.position(anchorElement);

    this.modalHost.open({
      mode: 'panel',
      element: this.element,
      initialFocus: this.nameInput,
      outsideClickIgnore: [`.${this.prefix}-filter-presets-btn`],
      onClose: () => this.handleHostClose(),
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.modalHost.close();
  }

  private handleHostClose(): void {
    this.isOpen = false;
    this.element.style.display = 'none';
    this.clearImportStatus();
  }

  // =========================================
  // Save / Load / Delete
  // =========================================

  private handleSave(): void {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.nameInput.classList.add(`${this.prefix}-filter-input--error`);
      setTimeout(() => {
        this.nameInput.classList.remove(`${this.prefix}-filter-input--error`);
      }, 1500);
      return;
    }

    const filters = this.state.filters.get();
    if (filters.length === 0) return;

    const description = this.descriptionInput.value.trim() || undefined;
    const sortColumns = this.state.sortColumns.get();

    this.presetManager.save(
      name,
      filters,
      sortColumns.length > 0 ? sortColumns : undefined,
      description
    );

    // Clear inputs after successful save
    this.nameInput.value = '';
    this.descriptionInput.value = '';
    this.updateSaveButtonState();
  }

  private handleLoad(id: string): void {
    this.presetManager.load(id, this.actions);
    this.close();
  }

  private handleDelete(id: string): void {
    this.presetManager.delete(id);
  }

  // =========================================
  // Export / Import
  // =========================================

  private handleExport(): void {
    const json = this.presetManager.exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'filter-presets.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private handleImport(): void {
    const file = this.fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = this.presetManager.importFromJSON(reader.result as string);
      if (result.errors.length > 0) {
        this.showImportStatus(
          `Imported ${result.imported}, ${result.errors.length} error(s)`,
          'warning'
        );
      } else if (result.imported > 0) {
        this.showImportStatus(`Imported ${result.imported} preset(s)`, 'success');
      } else {
        this.showImportStatus('No presets found in file', 'warning');
      }
      this.fileInput.value = '';
    };
    reader.onerror = () => {
      this.showImportStatus('Failed to read file', 'warning');
      this.fileInput.value = '';
    };
    reader.readAsText(file);
  }

  private showImportStatus(text: string, type: 'success' | 'warning'): void {
    this.importStatusEl.textContent = text;
    this.importStatusEl.className = `${this.prefix}-filter-preset-import-status ${this.prefix}-filter-preset-import-status--${type}`;
    setTimeout(() => this.clearImportStatus(), 4000);
  }

  private clearImportStatus(): void {
    this.importStatusEl.textContent = '';
    this.importStatusEl.className = `${this.prefix}-filter-preset-import-status`;
  }

  // =========================================
  // Preset List Rendering
  // =========================================

  private renderPresetList(): void {
    const p = this.prefix;
    const presets = this.presetManager.getPresets();

    this.presetListEl.innerHTML = '';

    if (presets.length === 0) {
      const empty = document.createElement('div');
      empty.className = `${p}-filter-preset-empty`;
      empty.textContent = 'No saved presets';
      this.presetListEl.appendChild(empty);
      return;
    }

    for (const preset of presets) {
      this.presetListEl.appendChild(this.createPresetItem(preset));
    }
  }

  private createPresetItem(preset: FilterPreset): HTMLElement {
    const p = this.prefix;

    const item = document.createElement('div');
    item.className = `${p}-filter-preset-item`;

    // Header row: name + meta
    const headerRow = document.createElement('div');
    headerRow.className = `${p}-filter-preset-item-header`;

    const nameEl = document.createElement('div');
    nameEl.className = `${p}-filter-preset-item-name`;
    nameEl.textContent = preset.name;

    const metaEl = document.createElement('div');
    metaEl.className = `${p}-filter-preset-item-meta`;
    const filterCount = preset.filters.length;
    const dateStr = new Date(preset.updatedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    metaEl.textContent = `${filterCount} filter${filterCount !== 1 ? 's' : ''} · ${dateStr}`;

    headerRow.appendChild(nameEl);
    headerRow.appendChild(metaEl);
    item.appendChild(headerRow);

    // Description (if present)
    if (preset.description) {
      const descEl = document.createElement('div');
      descEl.className = `${p}-filter-preset-item-desc`;
      descEl.textContent = preset.description;
      item.appendChild(descEl);
    }

    // Action buttons
    const actionsEl = document.createElement('div');
    actionsEl.className = `${p}-filter-preset-item-actions`;

    const loadBtn = document.createElement('button');
    loadBtn.className = `${p}-filter-preset-action-btn ${p}-filter-preset-action-btn--load`;
    loadBtn.type = 'button';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => this.handleLoad(preset.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = `${p}-filter-preset-action-btn ${p}-filter-preset-action-btn--delete`;
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';

    // Inline confirmation for destructive delete action
    const deleteConfirmDiv = document.createElement('div');
    deleteConfirmDiv.className = `${p}-filter-preset-delete-confirm`;
    deleteConfirmDiv.style.display = 'none';

    const confirmText = document.createElement('span');
    confirmText.textContent = 'Delete?';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `${p}-filter-preset-action-btn ${p}-filter-preset-action-btn--delete`;
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Yes';
    confirmBtn.addEventListener('click', () => this.handleDelete(preset.id));

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `${p}-filter-preset-action-btn`;
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'No';
    cancelBtn.addEventListener('click', () => {
      deleteConfirmDiv.style.display = 'none';
      deleteBtn.style.display = '';
    });

    deleteConfirmDiv.appendChild(confirmText);
    deleteConfirmDiv.appendChild(confirmBtn);
    deleteConfirmDiv.appendChild(cancelBtn);

    deleteBtn.addEventListener('click', () => {
      deleteBtn.style.display = 'none';
      deleteConfirmDiv.style.display = 'flex';
    });

    actionsEl.appendChild(loadBtn);
    actionsEl.appendChild(deleteBtn);
    actionsEl.appendChild(deleteConfirmDiv);
    item.appendChild(actionsEl);

    return item;
  }

  // =========================================
  // Button State
  // =========================================

  private updateSaveButtonState(): void {
    const hasFilters = this.state.filters.get().length > 0;
    const hasName = this.nameInput.value.trim().length > 0;
    this.saveBtn.disabled = !hasFilters || !hasName;
  }

  private updateExportButtonState(): void {
    this.exportBtn.disabled = this.presetManager.getPresets().length === 0;
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

    if (this.unsubPresets) {
      this.unsubPresets();
      this.unsubPresets = null;
    }
    if (this.unsubFilters) {
      this.unsubFilters();
      this.unsubFilters = null;
    }

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
