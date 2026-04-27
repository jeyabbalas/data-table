/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportDialog } from '@/export/ExportDialog';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

// Mock export functions
vi.mock('@/export/CSVExport', () => ({
  exportFromState: vi.fn().mockResolvedValue('col1,col2\na,b\n'),
}));
vi.mock('@/export/JSONExport', () => ({
  exportJSONFromState: vi.fn().mockResolvedValue('[{"col1":"a"}]'),
}));
vi.mock('@/export/ParquetExport', () => ({
  exportParquetFromState: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

import { exportFromState } from '@/export/CSVExport';
import { exportJSONFromState } from '@/export/JSONExport';
import { exportParquetFromState } from '@/export/ParquetExport';

// Mock WorkerBridge
const mockBridge = {
  query: vi.fn().mockResolvedValue([]),
  initialize: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
  exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  destroy: vi.fn(),
  clearQueryCache: vi.fn(),
} as any;

const testSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'price', type: 'float', nullable: true, originalType: 'DOUBLE' },
];

// Mock URL.createObjectURL / revokeObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
const mockRevokeObjectURL = vi.fn();

// Mock clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);

describe('ExportDialog', () => {
  let state: TableState;
  let actions: StateActions;
  let dialog: ExportDialog;

  beforeEach(() => {
    vi.clearAllMocks();

    state = createTableState();
    actions = new StateActions(state, mockBridge);
    initializeColumnsFromSchema(state, testSchema);
    state.tableName.set('test_table');
    state.totalRows.set(1000);
    state.filteredRows.set(500);

    // Setup global mocks
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText },
    });

    dialog = new ExportDialog(state, mockBridge);
    document.body.appendChild(dialog.getElement());
  });

  afterEach(() => {
    dialog.destroy();
    document.body.innerHTML = '';
  });

  // =========================================
  // Lifecycle
  // =========================================

  describe('lifecycle', () => {
    it('should create DOM element', () => {
      const el = dialog.getElement();
      expect(el).toBeDefined();
      expect(el.classList.contains('dt-export-backdrop')).toBe(true);
    });

    it('should start closed', () => {
      expect(dialog.getIsOpen()).toBe(false);
      expect(dialog.getElement().classList.contains('dt-export-backdrop--open')).toBe(false);
    });

    it('should open and close', () => {
      dialog.open();
      expect(dialog.getIsOpen()).toBe(true);
      expect(dialog.getElement().classList.contains('dt-export-backdrop--open')).toBe(true);

      dialog.close();
      expect(dialog.getIsOpen()).toBe(false);
      expect(dialog.getElement().classList.contains('dt-export-backdrop--open')).toBe(false);
    });

    it('should not open if already open', () => {
      dialog.open();
      dialog.open(); // no-op
      expect(dialog.getIsOpen()).toBe(true);
    });

    it('should not close if already closed', () => {
      dialog.close(); // no-op, should not throw
      expect(dialog.getIsOpen()).toBe(false);
    });

    it('should remove element from DOM on destroy', () => {
      expect(document.body.contains(dialog.getElement())).toBe(true);
      dialog.destroy();
      expect(document.body.contains(dialog.getElement())).toBe(false);
    });

    it('should not open after destroy', () => {
      dialog.destroy();
      dialog.open();
      expect(dialog.getIsOpen()).toBe(false);
    });

    it('should not destroy twice', () => {
      dialog.destroy();
      dialog.destroy(); // should not throw
    });
  });

  // =========================================
  // DOM Structure
  // =========================================

  describe('DOM structure', () => {
    it('should have dialog with role and aria attributes', () => {
      // ARIA attributes are applied by ModalHost on open().
      dialog.open();
      const dialogEl = dialog.getElement().querySelector('.dt-export-dialog');
      expect(dialogEl?.getAttribute('role')).toBe('dialog');
      expect(dialogEl?.getAttribute('aria-modal')).toBe('true');
      const labelledBy = dialogEl?.getAttribute('aria-labelledby');
      expect(labelledBy).toMatch(/-export-title$/);
      // Integrity: aria-labelledby must resolve to an element inside this dialog.
      expect(dialog.getElement().querySelector(`#${labelledBy}`)).not.toBeNull();
      dialog.close();
    });

    it('should have title', () => {
      const title = dialog.getElement().querySelector('.dt-export-title');
      expect(title?.textContent).toBe('Export Data');
    });

    it('should have format radio buttons', () => {
      const radios = dialog.getElement().querySelectorAll('input[name="dt-export-format"]');
      expect(radios.length).toBe(3);
    });

    it('should have scope radio buttons', () => {
      const radios = dialog.getElement().querySelectorAll('input[name="dt-export-scope"]');
      expect(radios.length).toBe(3);
    });

    it('should have Download and Copy buttons', () => {
      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn');
      const copyBtn = dialog.getElement().querySelector('.dt-export-copy-btn');
      expect(downloadBtn?.textContent).toBe('Download');
      expect(copyBtn?.textContent).toBe('Copy to Clipboard');
    });
  });

  // =========================================
  // Close Triggers
  // =========================================

  describe('close triggers', () => {
    it('should close on close button click', () => {
      dialog.open();
      const closeBtn = dialog.getElement().querySelector('.dt-export-close') as HTMLButtonElement;
      closeBtn.click();
      expect(dialog.getIsOpen()).toBe(false);
    });

    it('should close on Escape key', () => {
      dialog.open();
      // ModalHost scopes the keydown listener to the dialog element.
      const inner = dialog.getElement().querySelector('.dt-export-dialog') as HTMLElement;
      inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(dialog.getIsOpen()).toBe(false);
    });

    it('should close on backdrop click', () => {
      dialog.open();
      const backdrop = dialog.getElement();
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(dialog.getIsOpen()).toBe(false);
    });

    it('should NOT close when clicking inside dialog', () => {
      dialog.open();
      const dialogInner = dialog.getElement().querySelector('.dt-export-dialog') as HTMLElement;
      dialogInner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(dialog.getIsOpen()).toBe(true);
    });

    it('should remove Escape handler after close', () => {
      dialog.open();
      dialog.close();

      // Re-open and close via Escape should still work (listener is re-installed on open).
      dialog.open();
      const inner = dialog.getElement().querySelector('.dt-export-dialog') as HTMLElement;
      inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(dialog.getIsOpen()).toBe(false);
    });
  });

  // =========================================
  // Format Selection
  // =========================================

  describe('format selection', () => {
    it('should default to CSV with CSV options visible', () => {
      const csvRadio = dialog.getElement().querySelector('input[value="csv"]') as HTMLInputElement;
      expect(csvRadio.checked).toBe(true);

      const csvOptions = dialog.getElement().querySelectorAll('.dt-export-format-options');
      expect((csvOptions[0] as HTMLElement).style.display).toBe('');
      expect((csvOptions[1] as HTMLElement).style.display).toBe('none');
    });

    it('should show JSON options when JSON format selected', () => {
      const jsonRadio = dialog
        .getElement()
        .querySelector('input[value="json"]') as HTMLInputElement;
      jsonRadio.checked = true;
      jsonRadio.dispatchEvent(new Event('change'));

      const csvOptions = dialog.getElement().querySelectorAll('.dt-export-format-options');
      expect((csvOptions[0] as HTMLElement).style.display).toBe('none');
      expect((csvOptions[1] as HTMLElement).style.display).toBe('');
    });

    it('should hide both option panels and Copy button for Parquet', () => {
      const parquetRadio = dialog
        .getElement()
        .querySelector('input[value="parquet"]') as HTMLInputElement;
      parquetRadio.checked = true;
      parquetRadio.dispatchEvent(new Event('change'));

      const formatOptions = dialog.getElement().querySelectorAll('.dt-export-format-options');
      expect((formatOptions[0] as HTMLElement).style.display).toBe('none');
      expect((formatOptions[1] as HTMLElement).style.display).toBe('none');

      const copyBtn = dialog.getElement().querySelector('.dt-export-copy-btn') as HTMLElement;
      expect(copyBtn.style.display).toBe('none');
    });

    it('should show Copy button when switching back to CSV', () => {
      // Switch to Parquet
      const parquetRadio = dialog
        .getElement()
        .querySelector('input[value="parquet"]') as HTMLInputElement;
      parquetRadio.checked = true;
      parquetRadio.dispatchEvent(new Event('change'));

      // Switch back to CSV
      const csvRadio = dialog.getElement().querySelector('input[value="csv"]') as HTMLInputElement;
      csvRadio.checked = true;
      csvRadio.dispatchEvent(new Event('change'));

      const copyBtn = dialog.getElement().querySelector('.dt-export-copy-btn') as HTMLElement;
      expect(copyBtn.style.display).toBe('');
    });
  });

  // =========================================
  // Scope Selection
  // =========================================

  describe('scope selection', () => {
    it('should default to all', () => {
      const allRadio = dialog.getElement().querySelector('input[value="all"]') as HTMLInputElement;
      expect(allRadio.checked).toBe(true);
    });

    it('should show row counts when opened', () => {
      dialog.open();

      const counts = dialog.getElement().querySelectorAll('.dt-export-count');
      expect(counts[0].textContent).toContain('1,000'); // all
      expect(counts[1].textContent).toContain('500'); // filtered
      expect(counts[2].textContent).toContain('0'); // selected
    });

    it('should disable selected radio when no rows selected', () => {
      dialog.open();

      const selectedRadio = dialog
        .getElement()
        .querySelector('input[value="selected"]') as HTMLInputElement;
      expect(selectedRadio.disabled).toBe(true);

      const selectedLabel = selectedRadio.closest('.dt-export-option');
      expect(selectedLabel?.classList.contains('dt-export-option--disabled')).toBe(true);
    });

    it('should enable selected radio when rows are selected', () => {
      state.selectedRows.set(new Set([0, 1, 2]));
      dialog.open();

      const selectedRadio = dialog
        .getElement()
        .querySelector('input[value="selected"]') as HTMLInputElement;
      expect(selectedRadio.disabled).toBe(false);

      const counts = dialog.getElement().querySelectorAll('.dt-export-count');
      expect(counts[2].textContent).toContain('3');
    });

    it('should auto-fallback from selected to all when selection clears', () => {
      state.selectedRows.set(new Set([0, 1]));
      dialog.open();

      const selectedRadio = dialog
        .getElement()
        .querySelector('input[value="selected"]') as HTMLInputElement;
      const allRadio = dialog.getElement().querySelector('input[value="all"]') as HTMLInputElement;

      selectedRadio.checked = true;

      // Clear selection
      state.selectedRows.set(new Set());

      expect(selectedRadio.checked).toBe(false);
      expect(allRadio.checked).toBe(true);
    });
  });

  // =========================================
  // Reactive Updates
  // =========================================

  describe('reactive updates', () => {
    it('should update counts when state changes while open', () => {
      dialog.open();

      state.totalRows.set(2000);
      const counts = dialog.getElement().querySelectorAll('.dt-export-count');
      expect(counts[0].textContent).toContain('2,000');
    });

    it('should update filtered count reactively', () => {
      dialog.open();

      state.filteredRows.set(250);
      const counts = dialog.getElement().querySelectorAll('.dt-export-count');
      expect(counts[1].textContent).toContain('250');
    });

    it('should not update counts after close', () => {
      dialog.open();
      dialog.close();

      // Changing state after close should not cause errors
      state.totalRows.set(9999);
      // Just verify no exceptions thrown
    });
  });

  // =========================================
  // Export Execution
  // =========================================

  describe('export execution', () => {
    it('should call exportFromState for CSV format', async () => {
      dialog.open();

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      // Wait for async export
      await vi.waitFor(() => {
        expect(exportFromState).toHaveBeenCalledTimes(1);
      });

      expect(exportFromState).toHaveBeenCalledWith(
        state,
        mockBridge,
        expect.objectContaining({
          scope: 'all',
          columns: 'all',
          delimiter: ',',
          includeHeaders: true,
          nullValue: '',
        }),
        expect.any(AbortSignal),
      );
    });

    it('should call exportJSONFromState for JSON format', async () => {
      dialog.open();

      // Switch to JSON
      const jsonRadio = dialog
        .getElement()
        .querySelector('input[value="json"]') as HTMLInputElement;
      jsonRadio.checked = true;
      jsonRadio.dispatchEvent(new Event('change'));

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        expect(exportJSONFromState).toHaveBeenCalledTimes(1);
      });

      expect(exportJSONFromState).toHaveBeenCalledWith(
        state,
        mockBridge,
        expect.objectContaining({
          scope: 'all',
          columns: 'all',
          format: 'array',
          pretty: false,
        }),
        expect.any(AbortSignal),
      );
    });

    it('should call exportParquetFromState for Parquet format', async () => {
      dialog.open();

      const parquetRadio = dialog
        .getElement()
        .querySelector('input[value="parquet"]') as HTMLInputElement;
      parquetRadio.checked = true;
      parquetRadio.dispatchEvent(new Event('change'));

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        expect(exportParquetFromState).toHaveBeenCalledTimes(1);
      });
    });

    it('should trigger file download with correct filename', async () => {
      dialog.open();

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      });

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should pass scope option correctly', async () => {
      dialog.open();

      // Select filtered scope
      const filteredRadio = dialog
        .getElement()
        .querySelector('input[value="filtered"]') as HTMLInputElement;
      filteredRadio.checked = true;

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        expect(exportFromState).toHaveBeenCalledWith(
          state,
          mockBridge,
          expect.objectContaining({
            scope: 'filtered',
            columns: 'all',
          }),
          expect.any(AbortSignal),
        );
      });
    });

    it('should show loading state during export', async () => {
      // Make export slow
      (exportFromState as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('data'), 100)),
      );

      dialog.open();
      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      expect(downloadBtn.textContent).toBe('Cancel');
      expect(downloadBtn.classList.contains('dt-export-btn--loading')).toBe(true);
    });

    it('should auto-close on successful download', async () => {
      dialog.open();
      expect(dialog.getIsOpen()).toBe(true);

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        expect(dialog.getIsOpen()).toBe(false);
      });
    });

    it('should show error on export failure', async () => {
      (exportFromState as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Query failed'),
      );

      dialog.open();
      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        const errorEl = dialog.getElement().querySelector('.dt-export-error') as HTMLElement;
        expect(errorEl.textContent).toBe('Query failed');
        expect(errorEl.style.display).toBe('');
      });
    });

    it('should silently handle abort errors', async () => {
      (exportFromState as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new DOMException('Export aborted', 'AbortError'),
      );

      dialog.open();
      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        const errorEl = dialog.getElement().querySelector('.dt-export-error') as HTMLElement;
        // Error should NOT be shown for abort
        expect(errorEl.style.display).toBe('none');
      });
    });

    it('should pass CSV-specific options', async () => {
      dialog.open();

      // Change delimiter to tab
      const delimiterSelect = dialog.getElement().querySelector('select') as HTMLSelectElement;
      delimiterSelect.value = '\t';

      // Uncheck headers
      const headersCheckbox = dialog
        .getElement()
        .querySelector('.dt-export-format-options input[type="checkbox"]') as HTMLInputElement;
      headersCheckbox.checked = false;

      // Set null value
      const nullInput = dialog
        .getElement()
        .querySelector('.dt-export-format-options input[type="text"]') as HTMLInputElement;
      nullInput.value = 'N/A';

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        expect(exportFromState).toHaveBeenCalledWith(
          state,
          mockBridge,
          expect.objectContaining({
            delimiter: '\t',
            includeHeaders: false,
            nullValue: 'N/A',
          }),
          expect.any(AbortSignal),
        );
      });
    });

    it('should not export when no table is loaded', async () => {
      state.tableName.set(null);
      dialog.open();

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      // Should not call any export function
      await new Promise((r) => setTimeout(r, 50));
      expect(exportFromState).not.toHaveBeenCalled();
    });
  });

  // =========================================
  // Copy to Clipboard
  // =========================================

  describe('copy to clipboard', () => {
    it('should call clipboard writeText for CSV', async () => {
      // Ensure mock returns expected CSV string
      (exportFromState as ReturnType<typeof vi.fn>).mockResolvedValue('col1,col2\na,b\n');

      dialog.open();

      const copyBtn = dialog.getElement().querySelector('.dt-export-copy-btn') as HTMLButtonElement;
      copyBtn.click();

      await vi.waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith('col1,col2\na,b\n');
      });
    });

    it('should call clipboard writeText for JSON', async () => {
      dialog.open();

      const jsonRadio = dialog
        .getElement()
        .querySelector('input[value="json"]') as HTMLInputElement;
      jsonRadio.checked = true;
      jsonRadio.dispatchEvent(new Event('change'));

      const copyBtn = dialog.getElement().querySelector('.dt-export-copy-btn') as HTMLButtonElement;
      copyBtn.click();

      await vi.waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith('[{"col1":"a"}]');
      });
    });

    it('should show "Copied!" feedback', async () => {
      dialog.open();

      const copyBtn = dialog.getElement().querySelector('.dt-export-copy-btn') as HTMLButtonElement;
      copyBtn.click();

      await vi.waitFor(() => {
        expect(copyBtn.textContent).toBe('Copied!');
      });
    });

    it('should not copy for Parquet format', async () => {
      dialog.open();

      const parquetRadio = dialog
        .getElement()
        .querySelector('input[value="parquet"]') as HTMLInputElement;
      parquetRadio.checked = true;
      parquetRadio.dispatchEvent(new Event('change'));

      const copyBtn = dialog.getElement().querySelector('.dt-export-copy-btn') as HTMLButtonElement;
      copyBtn.click();

      await new Promise((r) => setTimeout(r, 50));
      expect(mockWriteText).not.toHaveBeenCalled();
    });

    it('should not close dialog after copy', async () => {
      dialog.open();

      const copyBtn = dialog.getElement().querySelector('.dt-export-copy-btn') as HTMLButtonElement;
      copyBtn.click();

      await vi.waitFor(() => {
        expect(mockWriteText).toHaveBeenCalled();
      });

      expect(dialog.getIsOpen()).toBe(true);
    });

    it('should show error on clipboard failure', async () => {
      mockWriteText.mockRejectedValueOnce(new Error('Clipboard blocked'));

      dialog.open();
      const copyBtn = dialog.getElement().querySelector('.dt-export-copy-btn') as HTMLButtonElement;
      copyBtn.click();

      await vi.waitFor(() => {
        const errorEl = dialog.getElement().querySelector('.dt-export-error') as HTMLElement;
        expect(errorEl.textContent).toBe('Clipboard blocked');
      });
    });
  });

  // =========================================
  // Body Scroll Lock
  // =========================================

  describe('body scroll lock', () => {
    it('should lock body scroll on open', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      dialog.open();
      expect(addSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
      expect(addSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
      addSpy.mockRestore();
    });

    it('should restore body scroll on close', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      dialog.open();
      dialog.close();
      expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  // =========================================
  // System columns toggle (Phase 7)
  // =========================================
  //
  // The "Include system columns" checkbox is hidden when the schema has no
  // system columns. When visible, default-unchecked excludes them; toggling
  // checked prepends them to the column order passed to the exporter.

  describe('system columns toggle', () => {
    function getSystemCheckbox(): HTMLInputElement | null {
      // Locate the system-columns checkbox by its accompanying label text.
      const labels = Array.from(
        dialog.getElement().querySelectorAll('label'),
      ) as HTMLLabelElement[];
      const match = labels.find((l) => l.textContent?.includes('Include system columns'));
      if (!match) return null;
      return match.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    }

    function getSystemCheckboxField(): HTMLElement | null {
      const cb = getSystemCheckbox();
      return cb ? (cb.closest('.dt-export-field') as HTMLElement | null) : null;
    }

    it('hides the system-columns checkbox when the schema has no system columns', () => {
      // testSchema has only id / name / price — no system columns.
      dialog.open();
      const field = getSystemCheckboxField();
      // The field exists in the DOM but display is 'none' — created at
      // build time, conditionally revealed in open().
      expect(field).not.toBeNull();
      expect(field!.style.display).toBe('none');
    });

    it('reveals the checkbox when the schema includes a system column', () => {
      // Re-initialise the schema with a system column. ExportDialog reads
      // schema in open(), so we set it before opening.
      const schemaWithSystem: ColumnSchema[] = [
        {
          name: '__rowid__',
          type: 'integer',
          nullable: false,
          originalType: 'BIGINT',
          system: true,
        },
        ...testSchema,
      ];
      initializeColumnsFromSchema(state, schemaWithSystem);
      dialog.open();

      const field = getSystemCheckboxField();
      expect(field).not.toBeNull();
      expect(field!.style.display).not.toBe('none');

      const cb = getSystemCheckbox()!;
      expect(cb.checked).toBe(false); // unchecked by default
    });

    it("default-unchecked → exporter receives columns: 'all' (which excludes system columns via resolveColumns)", async () => {
      const schemaWithSystem: ColumnSchema[] = [
        {
          name: '__rowid__',
          type: 'integer',
          nullable: false,
          originalType: 'BIGINT',
          system: true,
        },
        ...testSchema,
      ];
      initializeColumnsFromSchema(state, schemaWithSystem);
      dialog.open();

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        expect(exportFromState).toHaveBeenCalledTimes(1);
      });
      expect(exportFromState).toHaveBeenCalledWith(
        state,
        mockBridge,
        expect.objectContaining({ columns: 'all' }),
        expect.any(AbortSignal),
      );
    });

    it('checkbox toggled checked → exporter receives an explicit array prepending the system column', async () => {
      const schemaWithSystem: ColumnSchema[] = [
        {
          name: '__rowid__',
          type: 'integer',
          nullable: false,
          originalType: 'BIGINT',
          system: true,
        },
        ...testSchema,
      ];
      initializeColumnsFromSchema(state, schemaWithSystem);
      dialog.open();

      const cb = getSystemCheckbox()!;
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));

      const downloadBtn = dialog.getElement().querySelector('.dt-export-btn') as HTMLButtonElement;
      downloadBtn.click();

      await vi.waitFor(() => {
        expect(exportFromState).toHaveBeenCalledTimes(1);
      });

      const callArgs = (exportFromState as ReturnType<typeof vi.fn>).mock.calls[0];
      const opts = callArgs[2] as { columns: string[] };
      expect(Array.isArray(opts.columns)).toBe(true);
      expect(opts.columns[0]).toBe('__rowid__'); // prepended
      // Non-system columns from columnOrder follow.
      expect(opts.columns).toContain('id');
      expect(opts.columns).toContain('name');
      expect(opts.columns).toContain('price');
    });
  });
});
