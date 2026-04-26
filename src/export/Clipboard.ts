/**
 * Clipboard - Standalone clipboard utilities for copying table data
 *
 * Provides low-level clipboard access and a high-level function for
 * copying selected rows as TSV (tab-separated values), the standard
 * clipboard format for spreadsheet paste.
 */

import { ExportError } from '../core/errors';
import type { TableState } from '../core/State';
import type { WorkerBridge } from '../data/WorkerBridge';
import { exportToCSV } from './CSVExport';
import type { ExportContext } from './ExportQuery';

/**
 * Copy a string to the clipboard.
 *
 * @param data   - The string to copy
 * @param format - `'text'` for plain text, `'html'` for rich HTML with plain-text fallback
 */
export async function copyToClipboard(data: string, format: 'text' | 'html'): Promise<void> {
  if (format === 'html') {
    const htmlBlob = new Blob([data], { type: 'text/html' });
    // Strip HTML tags to produce a plain-text fallback
    const plainText = data.replace(/<[^>]*>/g, '');
    const textBlob = new Blob([plainText], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(data);
  }
}

/**
 * Copy specific rows from the table to the clipboard as TSV.
 *
 * TSV (tab-separated values) is the standard clipboard format understood
 * by Excel, Google Sheets, and other spreadsheet applications. The output
 * includes a header row and uses visible columns in their display order.
 *
 * @param rows   - 0-based row indices (into the sorted/filtered view) to copy
 * @param state  - Reactive table state (signals are read, not mutated)
 * @param bridge - WorkerBridge for querying DuckDB
 */
export async function copyRowsToClipboard(
  rows: number[],
  state: TableState,
  bridge: WorkerBridge,
): Promise<void> {
  if (rows.length === 0) return;

  const tableName = state.tableName.get();
  if (!tableName) {
    throw new ExportError('No table loaded', { code: 'NO_TABLE_LOADED' });
  }

  const context: ExportContext = {
    bridge,
    filters: state.filters.get(),
    sortColumns: state.sortColumns.get(),
    selectedRows: new Set(rows),
    columnOrder: state.columnOrder.get(),
    schema: state.schema.get(),
  };

  const tsv = await exportToCSV(
    tableName,
    {
      scope: 'selected',
      columns: 'all',
      includeHeaders: true,
      delimiter: '\t',
      nullValue: '',
    },
    context,
  );

  await copyToClipboard(tsv, 'text');
}
