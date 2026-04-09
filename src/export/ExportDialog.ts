/**
 * ExportDialog - Modal dialog for exporting table data
 *
 * Provides a centered modal overlay with format selection (CSV/JSON/Parquet),
 * scope selection (all/filtered/selected), column selection, format-specific
 * options, download, and copy-to-clipboard functionality.
 */

import type { TableState } from '../core/State';
import type { WorkerBridge } from '../data/WorkerBridge';
import { exportFromState } from './CSVExport';
import { exportJSONFromState } from './JSONExport';
import { exportParquetFromState } from './ParquetExport';
import { copyToClipboard } from './Clipboard';

export type ExportFormat = 'csv' | 'json' | 'parquet';
export type ExportScope = 'all' | 'filtered' | 'selected';
export interface ExportDialogOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
}

export class ExportDialog {
  private element: HTMLElement;
  private destroyed = false;
  private isOpen = false;
  private readonly prefix: string;

  // Source file base name (without extension) for export filenames
  private sourceName: string | null = null;

  // Export execution
  private abortController: AbortController | null = null;
  private exporting = false;

  // Reactive subscriptions (created on open, cleaned on close)
  private unsubscribes: (() => void)[] = [];

  // DOM references for dynamic updates
  private allCountEl!: HTMLElement;
  private filteredCountEl!: HTMLElement;
  private selectedCountEl!: HTMLElement;
  private selectedOption!: HTMLLabelElement;
  private selectedRadio!: HTMLInputElement;
  private allRadio!: HTMLInputElement;
  private csvOptionsEl!: HTMLElement;
  private jsonOptionsEl!: HTMLElement;
  private copyBtn!: HTMLButtonElement;
  private exportBtn!: HTMLButtonElement;
  private errorEl!: HTMLElement;
  private dialogEl!: HTMLElement;

  // Format-specific inputs
  private delimiterSelect!: HTMLSelectElement;
  private headersCheckbox!: HTMLInputElement;
  private nullValueInput!: HTMLInputElement;
  private jsonFormatSelect!: HTMLSelectElement;
  private jsonPrettyCheckbox!: HTMLInputElement;

  // Close handler references
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

  // Body scroll lock
  private scrollLockHandler: ((e: Event) => void) | null = null;

  constructor(
    private state: TableState,
    private bridge: WorkerBridge,
    options: ExportDialogOptions = {}
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.element = this.createElement();
  }

  // =========================================
  // DOM Creation
  // =========================================

  private createElement(): HTMLElement {
    const p = this.prefix;

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = `${p}-export-backdrop`;
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) this.close();
    });

    // Dialog
    const dialog = document.createElement('div');
    dialog.className = `${p}-export-dialog`;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', `${p}-export-title`);
    this.dialogEl = dialog;
    backdrop.appendChild(dialog);

    // Header
    const header = document.createElement('div');
    header.className = `${p}-export-header`;

    const title = document.createElement('span');
    title.className = `${p}-export-title`;
    title.id = `${p}-export-title`;
    title.textContent = 'Export Data';

    const closeBtn = document.createElement('button');
    closeBtn.className = `${p}-export-close`;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close export dialog');
    closeBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
      </svg>
    `;
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = `${p}-export-body`;

    body.appendChild(this.createFormatSection());
    body.appendChild(this.createScopeSection());
    body.appendChild(this.createCSVOptions());
    body.appendChild(this.createJSONOptions());

    // Error area
    this.errorEl = document.createElement('div');
    this.errorEl.className = `${p}-export-error`;
    body.appendChild(this.errorEl);

    dialog.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = `${p}-export-footer`;

    this.copyBtn = document.createElement('button');
    this.copyBtn.className = `${p}-export-copy-btn`;
    this.copyBtn.type = 'button';
    this.copyBtn.textContent = 'Copy to Clipboard';
    this.copyBtn.addEventListener('click', () => this.handleCopy());

    this.exportBtn = document.createElement('button');
    this.exportBtn.className = `${p}-export-btn`;
    this.exportBtn.type = 'button';
    this.exportBtn.textContent = 'Download';
    this.exportBtn.addEventListener('click', () => this.handleExport());

    footer.appendChild(this.copyBtn);
    footer.appendChild(this.exportBtn);
    dialog.appendChild(footer);

    return backdrop;
  }

  private createFormatSection(): HTMLFieldSetElement {
    const p = this.prefix;
    const fieldset = document.createElement('fieldset');
    fieldset.className = `${p}-export-section`;

    const legend = document.createElement('legend');
    legend.textContent = 'Format';
    fieldset.appendChild(legend);

    const formats: { value: ExportFormat; label: string }[] = [
      { value: 'csv', label: 'CSV' },
      { value: 'json', label: 'JSON' },
      { value: 'parquet', label: 'Parquet' },
    ];

    for (const fmt of formats) {
      const label = document.createElement('label');
      label.className = `${p}-export-option`;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `${p}-export-format`;
      radio.value = fmt.value;
      if (fmt.value === 'csv') radio.checked = true;

      radio.addEventListener('change', () => this.onFormatChange(fmt.value));

      label.appendChild(radio);
      label.appendChild(document.createTextNode(` ${fmt.label}`));
      fieldset.appendChild(label);
    }

    return fieldset;
  }

  private createScopeSection(): HTMLFieldSetElement {
    const p = this.prefix;
    const fieldset = document.createElement('fieldset');
    fieldset.className = `${p}-export-section`;

    const legend = document.createElement('legend');
    legend.textContent = 'Rows';
    fieldset.appendChild(legend);

    // All rows
    const allLabel = document.createElement('label');
    allLabel.className = `${p}-export-option`;
    this.allRadio = document.createElement('input');
    this.allRadio.type = 'radio';
    this.allRadio.name = `${p}-export-scope`;
    this.allRadio.value = 'all';
    this.allRadio.checked = true;
    this.allCountEl = document.createElement('span');
    this.allCountEl.className = `${p}-export-count`;
    allLabel.appendChild(this.allRadio);
    allLabel.appendChild(document.createTextNode(' All rows '));
    allLabel.appendChild(this.allCountEl);
    fieldset.appendChild(allLabel);

    // Filtered rows
    const filteredLabel = document.createElement('label');
    filteredLabel.className = `${p}-export-option`;
    const filteredRadio = document.createElement('input');
    filteredRadio.type = 'radio';
    filteredRadio.name = `${p}-export-scope`;
    filteredRadio.value = 'filtered';
    this.filteredCountEl = document.createElement('span');
    this.filteredCountEl.className = `${p}-export-count`;
    filteredLabel.appendChild(filteredRadio);
    filteredLabel.appendChild(document.createTextNode(' Filtered rows '));
    filteredLabel.appendChild(this.filteredCountEl);
    fieldset.appendChild(filteredLabel);

    // Selected rows
    this.selectedOption = document.createElement('label');
    this.selectedOption.className = `${p}-export-option`;
    this.selectedRadio = document.createElement('input');
    this.selectedRadio.type = 'radio';
    this.selectedRadio.name = `${p}-export-scope`;
    this.selectedRadio.value = 'selected';
    this.selectedCountEl = document.createElement('span');
    this.selectedCountEl.className = `${p}-export-count`;
    this.selectedOption.appendChild(this.selectedRadio);
    this.selectedOption.appendChild(document.createTextNode(' Selected rows '));
    this.selectedOption.appendChild(this.selectedCountEl);
    fieldset.appendChild(this.selectedOption);

    return fieldset;
  }

  private createCSVOptions(): HTMLElement {
    const p = this.prefix;
    const container = document.createElement('div');
    container.className = `${p}-export-format-options`;

    // Delimiter
    const delimField = document.createElement('div');
    delimField.className = `${p}-export-field`;
    const delimLabel = document.createElement('label');
    delimLabel.textContent = 'Delimiter';
    this.delimiterSelect = document.createElement('select');
    this.delimiterSelect.className = `${p}-filter-select`;
    const delimiters = [
      { value: ',', label: 'Comma (,)' },
      { value: '\t', label: 'Tab' },
      { value: ';', label: 'Semicolon (;)' },
      { value: '|', label: 'Pipe (|)' },
    ];
    for (const d of delimiters) {
      const option = document.createElement('option');
      option.value = d.value;
      option.textContent = d.label;
      this.delimiterSelect.appendChild(option);
    }
    delimField.appendChild(delimLabel);
    delimField.appendChild(this.delimiterSelect);
    container.appendChild(delimField);

    // Include headers
    const headersField = document.createElement('div');
    headersField.className = `${p}-export-field`;
    const headersLabel = document.createElement('label');
    headersLabel.textContent = 'Include headers';
    this.headersCheckbox = document.createElement('input');
    this.headersCheckbox.type = 'checkbox';
    this.headersCheckbox.checked = true;
    headersField.appendChild(headersLabel);
    headersField.appendChild(this.headersCheckbox);
    container.appendChild(headersField);

    // Null value
    const nullField = document.createElement('div');
    nullField.className = `${p}-export-field`;
    const nullLabel = document.createElement('label');
    nullLabel.textContent = 'Null value';
    this.nullValueInput = document.createElement('input');
    this.nullValueInput.type = 'text';
    this.nullValueInput.className = `${p}-filter-input`;
    this.nullValueInput.value = '';
    this.nullValueInput.placeholder = '(empty)';
    nullField.appendChild(nullLabel);
    nullField.appendChild(this.nullValueInput);
    container.appendChild(nullField);

    this.csvOptionsEl = container;
    return container;
  }

  private createJSONOptions(): HTMLElement {
    const p = this.prefix;
    const container = document.createElement('div');
    container.className = `${p}-export-format-options`;
    container.style.display = 'none';

    // Format
    const fmtField = document.createElement('div');
    fmtField.className = `${p}-export-field`;
    const fmtLabel = document.createElement('label');
    fmtLabel.textContent = 'Format';
    this.jsonFormatSelect = document.createElement('select');
    this.jsonFormatSelect.className = `${p}-filter-select`;
    const formats = [
      { value: 'array', label: 'JSON Array' },
      { value: 'ndjson', label: 'NDJSON (one object per line)' },
    ];
    for (const f of formats) {
      const option = document.createElement('option');
      option.value = f.value;
      option.textContent = f.label;
      this.jsonFormatSelect.appendChild(option);
    }
    fmtField.appendChild(fmtLabel);
    fmtField.appendChild(this.jsonFormatSelect);
    container.appendChild(fmtField);

    // Pretty-print
    const prettyField = document.createElement('div');
    prettyField.className = `${p}-export-field`;
    const prettyLabel = document.createElement('label');
    prettyLabel.textContent = 'Pretty-print';
    this.jsonPrettyCheckbox = document.createElement('input');
    this.jsonPrettyCheckbox.type = 'checkbox';
    this.jsonPrettyCheckbox.checked = false;
    prettyField.appendChild(prettyLabel);
    prettyField.appendChild(this.jsonPrettyCheckbox);
    container.appendChild(prettyField);

    this.jsonOptionsEl = container;
    return container;
  }

  // =========================================
  // Format Switching
  // =========================================

  private onFormatChange(format: ExportFormat): void {
    this.csvOptionsEl.style.display = format === 'csv' ? '' : 'none';
    this.jsonOptionsEl.style.display = format === 'json' ? '' : 'none';
    this.copyBtn.style.display = format === 'parquet' ? 'none' : '';
  }

  // =========================================
  // Scope Updates
  // =========================================

  private updateScopeCounts(): void {
    const total = this.state.totalRows.get();
    const filtered = this.state.filteredRows.get();
    const selected = this.state.selectedRows.get().size;

    this.allCountEl.textContent = `(${total.toLocaleString()})`;
    this.filteredCountEl.textContent = `(${filtered.toLocaleString()})`;
    this.selectedCountEl.textContent = `(${selected.toLocaleString()})`;

    const disabled = selected === 0;
    this.selectedRadio.disabled = disabled;
    this.selectedOption.classList.toggle(
      `${this.prefix}-export-option--disabled`,
      disabled
    );

    // Auto-fallback if selected scope is active but no rows are selected
    if (disabled && this.selectedRadio.checked) {
      this.selectedRadio.checked = false;
      this.allRadio.checked = true;
    }
  }

  // =========================================
  // Open / Close
  // =========================================

  open(): void {
    if (this.destroyed || this.isOpen) return;

    this.isOpen = true;
    this.element.classList.add(`${this.prefix}-export-backdrop--open`);

    // Prevent background scrolling without modifying body CSS (avoids layout shift).
    // Allow scroll events inside the dialog.
    this.scrollLockHandler = (e: Event) => {
      if (this.dialogEl.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener('wheel', this.scrollLockHandler, { passive: false });
    document.addEventListener('touchmove', this.scrollLockHandler, { passive: false });

    // Subscribe to state for live updates
    this.unsubscribes.push(
      this.state.totalRows.subscribe(() => {
        if (this.isOpen) this.updateScopeCounts();
      })
    );
    this.unsubscribes.push(
      this.state.filteredRows.subscribe(() => {
        if (this.isOpen) this.updateScopeCounts();
      })
    );
    this.unsubscribes.push(
      this.state.selectedRows.subscribe(() => {
        if (this.isOpen) this.updateScopeCounts();
      })
    );

    // Initial count update
    this.updateScopeCounts();

    // Clear any previous error
    this.errorEl.style.display = 'none';
    this.errorEl.textContent = '';

    // Register Escape handler
    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    };
    document.addEventListener('keydown', this.escapeHandler);

    // Focus the dialog
    const firstRadio = this.element.querySelector('input[type="radio"]') as HTMLInputElement | null;
    if (firstRadio) {
      requestAnimationFrame(() => firstRadio.focus());
    }
  }

  close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.element.classList.remove(`${this.prefix}-export-backdrop--open`);

    // Restore background scrolling
    if (this.scrollLockHandler) {
      document.removeEventListener('wheel', this.scrollLockHandler);
      document.removeEventListener('touchmove', this.scrollLockHandler);
      this.scrollLockHandler = null;
    }

    // Cancel any in-flight export
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.resetExportState();

    // Unsubscribe
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];

    // Remove Escape handler
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
  }

  // =========================================
  // Form State Reading
  // =========================================

  private getFormat(): ExportFormat {
    const checked = this.element.querySelector(
      `input[name="${this.prefix}-export-format"]:checked`
    ) as HTMLInputElement | null;
    return (checked?.value as ExportFormat) ?? 'csv';
  }

  private getScope(): ExportScope {
    const checked = this.element.querySelector(
      `input[name="${this.prefix}-export-scope"]:checked`
    ) as HTMLInputElement | null;
    return (checked?.value as ExportScope) ?? 'all';
  }

  // =========================================
  // Export Execution
  // =========================================

  private async handleExport(): Promise<void> {
    if (this.exporting) {
      // Cancel in-flight export
      this.abortController?.abort();
      return;
    }

    const tableName = this.state.tableName.get();
    if (!tableName) return;

    const format = this.getFormat();
    const scope = this.getScope();

    this.abortController = new AbortController();
    this.setExportingState(true);

    try {
      const signal = this.abortController.signal;

      if (format === 'csv') {
        const result = await exportFromState(this.state, this.bridge, {
          scope,
          columns: 'all',
          delimiter: this.delimiterSelect.value,
          includeHeaders: this.headersCheckbox.checked,
          nullValue: this.nullValueInput.value,
        }, signal);

        const blob = new Blob([result], { type: 'text/csv;charset=utf-8' });
        this.triggerDownload(blob, this.getExportFilename('csv'));
      } else if (format === 'json') {
        const jsonFormat = this.jsonFormatSelect.value as 'array' | 'ndjson';
        const result = await exportJSONFromState(this.state, this.bridge, {
          scope,
          columns: 'all',
          format: jsonFormat,
          pretty: this.jsonPrettyCheckbox.checked,
        }, signal);

        const mimeType = jsonFormat === 'ndjson' ? 'application/x-ndjson' : 'application/json';
        const ext = jsonFormat === 'ndjson' ? 'ndjson' : 'json';
        const blob = new Blob([result], { type: mimeType });
        this.triggerDownload(blob, this.getExportFilename(ext));
      } else {
        const result = await exportParquetFromState(this.state, this.bridge, {
          scope,
          columns: 'all',
        }, signal);

        const blob = new Blob([result.buffer as ArrayBuffer], { type: 'application/octet-stream' });
        this.triggerDownload(blob, this.getExportFilename('parquet'));
      }

      // Auto-close on successful download
      this.close();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Silently reset on cancel
      } else {
        this.showError(error instanceof Error ? error.message : 'Export failed');
      }
    } finally {
      this.abortController = null;
      this.setExportingState(false);
    }
  }

  private async handleCopy(): Promise<void> {
    if (this.exporting) return;

    const tableName = this.state.tableName.get();
    if (!tableName) return;

    const format = this.getFormat();
    if (format === 'parquet') return;

    const scope = this.getScope();

    this.abortController = new AbortController();
    this.setExportingState(true);

    try {
      const signal = this.abortController.signal;
      let result: string;

      if (format === 'csv') {
        result = await exportFromState(this.state, this.bridge, {
          scope,
          columns: 'all',
          delimiter: this.delimiterSelect.value,
          includeHeaders: this.headersCheckbox.checked,
          nullValue: this.nullValueInput.value,
        }, signal);
      } else {
        result = await exportJSONFromState(this.state, this.bridge, {
          scope,
          columns: 'all',
          format: this.jsonFormatSelect.value as 'array' | 'ndjson',
          pretty: this.jsonPrettyCheckbox.checked,
        }, signal);
      }

      await copyToClipboard(result, 'text');
      this.showCopiedFeedback();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Silently reset on cancel
      } else {
        this.showError(error instanceof Error ? error.message : 'Copy failed');
      }
    } finally {
      this.abortController = null;
      this.setExportingState(false);
    }
  }

  private getExportFilename(ext: string): string {
    const baseName = this.sourceName ?? this.state.tableName.get() ?? 'export';
    return `${baseName}_export.${ext}`;
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =========================================
  // UI State Helpers
  // =========================================

  private setExportingState(exporting: boolean): void {
    this.exporting = exporting;
    this.exportBtn.textContent = exporting ? 'Cancel' : 'Download';
    this.exportBtn.classList.toggle(`${this.prefix}-export-btn--loading`, exporting);
    this.copyBtn.disabled = exporting;
  }

  private resetExportState(): void {
    this.exporting = false;
    this.exportBtn.textContent = 'Download';
    this.exportBtn.classList.remove(`${this.prefix}-export-btn--loading`);
    this.copyBtn.disabled = false;
  }

  private showError(message: string): void {
    this.errorEl.textContent = message;
    this.errorEl.style.display = '';
  }

  private showCopiedFeedback(): void {
    const original = this.copyBtn.textContent;
    this.copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      if (!this.destroyed) {
        this.copyBtn.textContent = original;
      }
    }, 1500);
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Set the source file name used as the base for exported file names.
   * Pass the original filename (e.g. "sales_data.csv") — the extension
   * will be stripped and replaced with the chosen export format's extension.
   */
  setSourceName(name: string): void {
    // Strip extension to get base name
    const dotIndex = name.lastIndexOf('.');
    this.sourceName = dotIndex > 0 ? name.substring(0, dotIndex) : name;
  }

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
