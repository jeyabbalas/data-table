/**
 * ExportDialog - Modal dialog for exporting table data
 *
 * Provides a centered modal overlay with format selection (CSV/JSON/Parquet),
 * scope selection (all/filtered/selected), column selection, format-specific
 * options, download, and copy-to-clipboard functionality.
 *
 * Normally the facade wires `table.openExportDialog()` for you; use this class
 * directly only when embedding the dialog inside a custom shell.
 *
 * @example
 * import { ExportDialog } from '@jeyabbalas/data-table/advanced';
 *
 * const dialog = new ExportDialog(table.state, table.bridge, {
 *   classPrefix: 'dt',
 *   instanceId: table.instanceId,
 * });
 * dialog.open();
 */

import { ModalHost } from '../core/ModalHost';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';
import type { WorkerBridge } from '../data/WorkerBridge';
import { copyToClipboard } from './Clipboard';
import { exportFromState } from './CSVExport';
import { exportJSONFromState } from './JSONExport';
import { exportParquetFromState } from './ParquetExport';

export type ExportFormat = 'csv' | 'json' | 'parquet';
export type ExportScope = 'all' | 'filtered' | 'selected';

const FILENAME_STEM_MAX_LENGTH = 100;

/**
 * Sanitise a user-provided filename stem (no extension) for safe use as a
 * `<a download>` filename. Strips:
 *
 *  - NUL bytes and ASCII control characters (`\x00–\x1f`, `\x7f`)
 *  - Path separators `/` and `\\`
 *  - Leading dots (so `.htaccess` becomes `htaccess`)
 *
 * Replaces every `..` run with `__` to defang parent-dir traversal hints,
 * and caps the final length at {@link FILENAME_STEM_MAX_LENGTH} to leave
 * room for the `_export.<ext>` suffix under the typical 255-char filesystem
 * limit.
 *
 * Returns an empty string if every character was sanitised away — callers
 * are responsible for falling back to `'export'` (or similar) in that case.
 */
export function sanitizeFilenameStem(name: string): string {
  // Strip control chars, path separators in one pass; keep ordinary text.
  // eslint-disable-next-line no-control-regex
  let cleaned = name.replace(/[\x00-\x1f\x7f/\\]/g, '');
  // Drop leading dots BEFORE defanging so `.htaccess` becomes `htaccess`
  // and `....hidden` becomes `hidden`. Internal `..` runs are still defanged
  // below to defuse parent-directory hints embedded in the middle of a name.
  cleaned = cleaned.replace(/^\.+/, '');
  cleaned = cleaned.replace(/\.{2,}/g, (match) => '_'.repeat(match.length));
  if (cleaned.length > FILENAME_STEM_MAX_LENGTH) {
    cleaned = cleaned.slice(0, FILENAME_STEM_MAX_LENGTH);
  }
  return cleaned;
}

/** Construction options for {@link ExportDialog}. */
export interface ExportDialogOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
  /**
   * Unique per-instance identifier mixed into element IDs so two tables on
   * the same page don't collide on `aria-labelledby` targets. Normally
   * supplied by `createDataTable()`; defaults to `''` for standalone/test
   * construction.
   */
  instanceId?: string;
  /**
   * Element to mirror `data-dt-color-scheme` from. The dialog backdrop
   * portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
   * pass the `.dt-root` element here to keep it theme-synced.
   */
  colorSchemeSource?: HTMLElement;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings;
}

/**
 * Modal dialog for exporting data — CSV / JSON / Parquet, with row-scope
 * (filtered / all / selected) and column inclusion toggles. Composed by the
 * facade; reach for it directly when assembling a custom export pipeline.
 */
export class ExportDialog {
  private element: HTMLElement;
  private destroyed = false;
  private isOpen = false;
  private readonly prefix: string;
  private readonly instanceId: string;
  private readonly colorSchemeSource?: HTMLElement;
  private readonly messages: Strings;

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

  // System-column opt-in (visible only when the schema has any `system: true`
  // columns, e.g. the synthetic `__rowid__`).
  private systemColumnsSection!: HTMLElement;
  private systemColumnsCheckbox!: HTMLInputElement;

  // Modal infrastructure (focus trap, Escape, scroll lock, ARIA).
  private modalHost = new ModalHost();

  constructor(
    private state: TableState,
    private bridge: WorkerBridge,
    options: ExportDialogOptions = {},
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.instanceId = options.instanceId ?? '';
    this.colorSchemeSource = options.colorSchemeSource;
    this.messages = options.messages ?? defaultStrings;
    this.element = this.createElement();
  }

  // =========================================
  // DOM Creation
  // =========================================

  private createElement(): HTMLElement {
    const p = this.prefix;

    // Backdrop (click-outside handled by ModalHost on open).
    const backdrop = document.createElement('div');
    backdrop.className = `${p}-export-backdrop`;

    // Dialog (role/aria-modal/aria-labelledby applied by ModalHost on open).
    const dialog = document.createElement('div');
    dialog.className = `${p}-export-dialog`;
    this.dialogEl = dialog;
    backdrop.appendChild(dialog);

    // Header
    const header = document.createElement('div');
    header.className = `${p}-export-header`;

    const title = document.createElement('span');
    title.className = `${p}-export-title`;
    title.id = `${p}-${this.instanceId}-export-title`;
    title.textContent = this.messages.export.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = `${p}-export-close`;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', this.messages.export.closeLabel);
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
    body.appendChild(this.createSystemColumnsSection());
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
    this.copyBtn.textContent = this.messages.export.copyButton;
    this.copyBtn.addEventListener('click', () => void this.handleCopy());

    this.exportBtn = document.createElement('button');
    this.exportBtn.className = `${p}-export-btn`;
    this.exportBtn.type = 'button';
    this.exportBtn.textContent = this.messages.export.downloadButton;
    this.exportBtn.addEventListener('click', () => void this.handleExport());

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
    legend.textContent = this.messages.export.formatLabel;
    fieldset.appendChild(legend);

    const formats: { value: ExportFormat; label: string }[] = [
      { value: 'csv', label: this.messages.export.formats.csv },
      { value: 'json', label: this.messages.export.formats.json },
      { value: 'parquet', label: this.messages.export.formats.parquet },
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
    legend.textContent = this.messages.export.scopeLabel;
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
    allLabel.appendChild(document.createTextNode(` ${this.messages.export.scopes.all} `));
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
    filteredLabel.appendChild(document.createTextNode(` ${this.messages.export.scopes.filtered} `));
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
    this.selectedOption.appendChild(
      document.createTextNode(` ${this.messages.export.scopes.selected} `),
    );
    this.selectedOption.appendChild(this.selectedCountEl);
    fieldset.appendChild(this.selectedOption);

    return fieldset;
  }

  private createSystemColumnsSection(): HTMLElement {
    const p = this.prefix;
    const container = document.createElement('div');
    container.className = `${p}-export-field`;
    // Hidden by default; `open()` reveals it only when the schema has any
    // system columns. Avoids leaking an irrelevant control to plain datasets.
    container.style.display = 'none';

    const label = document.createElement('label');
    this.systemColumnsCheckbox = document.createElement('input');
    this.systemColumnsCheckbox.type = 'checkbox';
    this.systemColumnsCheckbox.checked = false;
    label.appendChild(this.systemColumnsCheckbox);
    label.appendChild(document.createTextNode(' Include system columns (e.g. __rowid__)'));

    container.appendChild(label);
    this.systemColumnsSection = container;
    return container;
  }

  /**
   * Return the columns option to pass to exporters: 'all' when no system
   * columns exist or the user has not opted in; otherwise an explicit array
   * that prepends system columns to the default column order.
   */
  private getColumnsForExport(): 'all' | string[] {
    const schema = this.state.schema.get();
    const systemNames = schema.filter((c) => c.system === true).map((c) => c.name);
    if (systemNames.length === 0 || !this.systemColumnsCheckbox?.checked) {
      return 'all';
    }
    const order = this.state.columnOrder.get();
    const nonSystem = order.filter((n) => !systemNames.includes(n));
    return [...systemNames, ...nonSystem];
  }

  private createCSVOptions(): HTMLElement {
    const p = this.prefix;
    const container = document.createElement('div');
    container.className = `${p}-export-format-options`;

    // Delimiter
    const delimField = document.createElement('div');
    delimField.className = `${p}-export-field`;
    const delimLabel = document.createElement('label');
    delimLabel.textContent = this.messages.export.csv.delimiterLabel;
    this.delimiterSelect = document.createElement('select');
    this.delimiterSelect.className = `${p}-filter-select`;
    const delimiters = [
      { value: ',', label: this.messages.export.csv.delimiters.comma },
      { value: '\t', label: this.messages.export.csv.delimiters.tab },
      { value: ';', label: this.messages.export.csv.delimiters.semicolon },
      { value: '|', label: this.messages.export.csv.delimiters.pipe },
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
    headersLabel.textContent = this.messages.export.csv.headersLabel;
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
    nullLabel.textContent = this.messages.export.csv.nullValueLabel;
    this.nullValueInput = document.createElement('input');
    this.nullValueInput.type = 'text';
    this.nullValueInput.className = `${p}-filter-input`;
    this.nullValueInput.value = '';
    this.nullValueInput.placeholder = this.messages.export.csv.nullValuePlaceholder;
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
    fmtLabel.textContent = this.messages.export.json.formatLabel;
    this.jsonFormatSelect = document.createElement('select');
    this.jsonFormatSelect.className = `${p}-filter-select`;
    const formats = [
      { value: 'array', label: this.messages.export.json.formats.array },
      { value: 'ndjson', label: this.messages.export.json.formats.ndjson },
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
    prettyLabel.textContent = this.messages.export.json.prettyLabel;
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
    this.selectedOption.classList.toggle(`${this.prefix}-export-option--disabled`, disabled);

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

    // Subscribe to state for live updates
    this.unsubscribes.push(
      this.state.totalRows.subscribe(() => {
        if (this.isOpen) this.updateScopeCounts();
      }),
    );
    this.unsubscribes.push(
      this.state.filteredRows.subscribe(() => {
        if (this.isOpen) this.updateScopeCounts();
      }),
    );
    this.unsubscribes.push(
      this.state.selectedRows.subscribe(() => {
        if (this.isOpen) this.updateScopeCounts();
      }),
    );

    // Initial count update
    this.updateScopeCounts();

    // Reveal the system-columns checkbox only if the current schema has any
    // system columns. Reset the checkbox each time the dialog opens so the
    // default remains exclusion.
    const hasSystem = this.state.schema.get().some((c) => c.system === true);
    this.systemColumnsSection.style.display = hasSystem ? '' : 'none';
    this.systemColumnsCheckbox.checked = false;

    // Clear any previous error
    this.errorEl.style.display = 'none';
    this.errorEl.textContent = '';

    const firstRadio = this.element.querySelector('input[type="radio"]') as HTMLInputElement | null;
    this.modalHost.open({
      mode: 'modal',
      element: this.element,
      dialog: this.dialogEl,
      labelledBy: `${this.prefix}-${this.instanceId}-export-title`,
      initialFocus: firstRadio,
      onClose: () => this.handleHostClose(),
      colorSchemeSource: this.colorSchemeSource,
    });
  }

  close(): void {
    if (!this.isOpen) return;
    // ModalHost.close() calls back into handleHostClose() which performs the
    // component-local cleanup (subscriptions, abort controller, DOM class).
    this.modalHost.close();
  }

  private handleHostClose(): void {
    this.isOpen = false;
    this.element.classList.remove(`${this.prefix}-export-backdrop--open`);

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
  }

  // =========================================
  // Form State Reading
  // =========================================

  private getFormat(): ExportFormat {
    const checked = this.element.querySelector(
      `input[name="${this.prefix}-export-format"]:checked`,
    ) as HTMLInputElement | null;
    return (checked?.value as ExportFormat) ?? 'csv';
  }

  private getScope(): ExportScope {
    const checked = this.element.querySelector(
      `input[name="${this.prefix}-export-scope"]:checked`,
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

      const columns = this.getColumnsForExport();

      if (format === 'csv') {
        const result = await exportFromState(
          this.state,
          this.bridge,
          {
            scope,
            columns,
            delimiter: this.delimiterSelect.value,
            includeHeaders: this.headersCheckbox.checked,
            nullValue: this.nullValueInput.value,
          },
          signal,
        );

        const blob = new Blob([result], { type: 'text/csv;charset=utf-8' });
        this.triggerDownload(blob, this.getExportFilename('csv'));
      } else if (format === 'json') {
        const jsonFormat = this.jsonFormatSelect.value as 'array' | 'ndjson';
        const result = await exportJSONFromState(
          this.state,
          this.bridge,
          {
            scope,
            columns,
            format: jsonFormat,
            pretty: this.jsonPrettyCheckbox.checked,
          },
          signal,
        );

        const mimeType = jsonFormat === 'ndjson' ? 'application/x-ndjson' : 'application/json';
        const ext = jsonFormat === 'ndjson' ? 'ndjson' : 'json';
        const blob = new Blob([result], { type: mimeType });
        this.triggerDownload(blob, this.getExportFilename(ext));
      } else {
        const result = await exportParquetFromState(
          this.state,
          this.bridge,
          {
            scope,
            columns,
          },
          signal,
        );

        const blob = new Blob([result.buffer as ArrayBuffer], { type: 'application/octet-stream' });
        this.triggerDownload(blob, this.getExportFilename('parquet'));
      }

      // Auto-close on successful download
      this.close();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Silently reset on cancel
      } else {
        this.showError(
          error instanceof Error ? error.message : this.messages.export.exportFailedFallback,
        );
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

      const columns = this.getColumnsForExport();

      if (format === 'csv') {
        result = await exportFromState(
          this.state,
          this.bridge,
          {
            scope,
            columns,
            delimiter: this.delimiterSelect.value,
            includeHeaders: this.headersCheckbox.checked,
            nullValue: this.nullValueInput.value,
          },
          signal,
        );
      } else {
        result = await exportJSONFromState(
          this.state,
          this.bridge,
          {
            scope,
            columns,
            format: this.jsonFormatSelect.value as 'array' | 'ndjson',
            pretty: this.jsonPrettyCheckbox.checked,
          },
          signal,
        );
      }

      await copyToClipboard(result, 'text');
      this.showCopiedFeedback();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Silently reset on cancel
      } else {
        this.showError(
          error instanceof Error ? error.message : this.messages.export.copyFailedFallback,
        );
      }
    } finally {
      this.abortController = null;
      this.setExportingState(false);
    }
  }

  private getExportFilename(ext: string): string {
    // sourceName is already sanitised in setSourceName(); tableName comes from
    // data loading and may reflect the source filename, so re-sanitise here.
    const raw = this.sourceName ?? this.state.tableName.get() ?? 'export';
    const baseName = sanitizeFilenameStem(raw) || 'export';
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
    this.exportBtn.textContent = exporting
      ? this.messages.export.cancelButton
      : this.messages.export.downloadButton;
    this.exportBtn.classList.toggle(`${this.prefix}-export-btn--loading`, exporting);
    this.copyBtn.disabled = exporting;
  }

  private resetExportState(): void {
    this.exporting = false;
    this.exportBtn.textContent = this.messages.export.downloadButton;
    this.exportBtn.classList.remove(`${this.prefix}-export-btn--loading`);
    this.copyBtn.disabled = false;
  }

  private showError(message: string): void {
    this.errorEl.textContent = message;
    this.errorEl.style.display = '';
  }

  private showCopiedFeedback(): void {
    const original = this.copyBtn.textContent;
    this.copyBtn.textContent = this.messages.export.copiedFeedback;
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
   *
   * The stem is sanitised to remove path separators, NUL/control characters,
   * leading dots, and runs of `..`, then capped at 100 characters so the
   * full `<stem>_export.<ext>` name comfortably fits the typical 255-char
   * filesystem limit.
   */
  setSourceName(name: string): void {
    // Strip extension to get base name
    const dotIndex = name.lastIndexOf('.');
    const stem = dotIndex > 0 ? name.substring(0, dotIndex) : name;
    this.sourceName = sanitizeFilenameStem(stem);
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
    this.modalHost.destroy();

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
