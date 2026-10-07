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
import { escapeCSVField, exportToCSV } from './CSVExport';
import { resolveColumns, type ExportContext } from './ExportQuery';

/**
 * Copy a string to the clipboard.
 *
 * @param data   - The string to copy
 * @param format - `'text'` for plain text, `'html'` for rich HTML with plain-text fallback
 *
 * **Browser size limits.** This function does not pre-check `data.length`.
 * `navigator.clipboard.writeText` typically caps payloads at ~10 MB
 * (Chromium) or smaller (Safari, Firefox); `ClipboardItem` HTML payloads
 * can be even smaller. The browser rejects oversized payloads with a
 * `DOMException` (often `NotAllowedError` or `DataError`), which propagates
 * to the caller. Consumers exporting large datasets should size-check
 * upstream — for example, cap `copyRowsToClipboard` at the visible
 * selection rather than the full dataset.
 *
 * **HTML format.** When `format === 'html'`, the plain-text fallback is
 * computed by stripping `<...>` tags via regex. This is intentional and
 * lossy — embedded `<script>`/`<style>` content is removed wholesale, but
 * the trade-off keeps the function dependency-free.
 *
 * **Insecure contexts.** `navigator.clipboard` is only available on HTTPS
 * (and `http://localhost`). On `http://` outside localhost, this function
 * rejects with the browser's underlying `TypeError` /
 * `DOMException`.
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
 * includes a header row and the visible columns (`state.visibleColumns`)
 * in the order the grid shows them: a hidden column is left out, and
 * `__rowid__` is copied when the app has shown it. With nothing to copy (no
 * visible column the schema has, or no row of the view among `rows`), it
 * writes nothing, and the clipboard keeps what it holds.
 * Cells are written as {@link exportToCSV} writes them, so a nested value
 * (LIST, STRUCT, MAP, …) is standard JSON: `["a","b"]`, `{"x":1.25}`.
 * Dates and times are written as spreadsheets read them, with a space
 * between date and time: `2024-01-02 03:04:05`.
 *
 * @param rows   - 0-based row indices (into the sorted/filtered view) to
 *   copy; an index past the view's last row copies nothing
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

  // What the grid shows, of the columns the schema has: between a schema
  // write and the `visibleColumns` write after it (a derived rename, a
  // restore), a visible name can be one the schema no longer has. An
  // explicit list keeps the system columns that `'all'` leaves out.
  const columns = resolveColumns([...new Set(state.visibleColumns.get())], context);
  if (columns.length === 0) return;

  const tsv = await exportToCSV(
    tableName,
    {
      scope: 'selected',
      columns,
      includeHeaders: true,
      delimiter: '\t',
      nullValue: '',
    },
    context,
  );

  // The header alone, as `exportToCSV` writes it: no row of the view among
  // `rows`, which a filter change can leave a selection with.
  if (tsv === columns.map((name) => escapeCSVField(name, '\t')).join('\t')) return;

  await copyToClipboard(tsv, 'text');
}
