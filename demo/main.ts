/**
 * Interactive Data Table — Demo App
 *
 * This demo shows a third-party consumer embedding the data-table library.
 * Almost all wiring is handled by `createDataTable()`; the demo only owns
 * the surrounding UI (file upload, URL input, info bar, session cache for
 * auto-restore across page refreshes).
 */

import '@jeyabbalas/data-table/styles';
import {
  VERSION,
  createDataTable,
  quoteIdentifier,
  type ColorScheme,
  type DataTable,
} from '@jeyabbalas/data-table';
import {
  isNumericType,
  isDateType,
  isTimeType,
  isCategoricalType,
} from '@jeyabbalas/data-table/advanced';

// ----- DOM refs -----
const versionEl = document.getElementById('version')!;
const initStatusEl = document.getElementById('init-status')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const loadFileBtn = document.getElementById('load-file-btn') as HTMLButtonElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const loadUrlBtn = document.getElementById('load-url-btn') as HTMLButtonElement;
const tableContainerEl = document.getElementById('table-container')!;
const tableInfoEl = document.getElementById('table-info')!;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const clearSessionBtn = document.getElementById('clear-session-btn') as HTMLButtonElement;
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const themeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="theme"]'));

versionEl.textContent = VERSION;

// Theme toggle: forwards to table.setColorScheme when the table exists,
// otherwise seeds the initial colorScheme option for createDataTable.
let currentScheme: ColorScheme = 'auto';
for (const radio of themeRadios) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    currentScheme = radio.value as ColorScheme;
    table?.setColorScheme(currentScheme);
  });
}

// ----- Session cache (demo-only; not a library responsibility) -----
// Keeps a Parquet snapshot of the loaded table in IndexedDB so a page refresh
// can auto-restore without re-prompting for the file.
const DATA_CACHE_DB = 'dt-data-cache';
const DATA_CACHE_STORE = 'data';
const LAST_SESSION_KEY = 'dt-last-session';
interface LastSession {
  type: 'url' | 'file';
  source: string;
  tableName: string;
}

function openDataCache(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DATA_CACHE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DATA_CACHE_STORE)) {
          db.createObjectStore(DATA_CACHE_STORE, { keyPath: 'tableName' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function cacheTableData(
  tableName: string,
  buffer: Uint8Array,
  sourceName: string,
): Promise<void> {
  const db = await openDataCache();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(DATA_CACHE_STORE, 'readwrite');
    tx.objectStore(DATA_CACHE_STORE).put({ tableName, buffer, sourceName });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

async function loadCachedData(
  tableName: string,
): Promise<{ buffer: Uint8Array; sourceName: string } | null> {
  const db = await openDataCache();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(DATA_CACHE_STORE, 'readonly');
    const req = tx.objectStore(DATA_CACHE_STORE).get(tableName);
    req.onsuccess = () => {
      db.close();
      resolve(req.result ? { buffer: req.result.buffer, sourceName: req.result.sourceName } : null);
    };
    req.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

async function clearCachedData(tableName: string): Promise<void> {
  const db = await openDataCache();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(DATA_CACHE_STORE, 'readwrite');
    tx.objectStore(DATA_CACHE_STORE).delete(tableName);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

// ----- Wire the data table via the facade -----
let table: DataTable | null = null;
let tableCounter = 0;

function updateInfo(message: string): void {
  tableInfoEl.innerHTML = message;
}

function updateTableInfo(): void {
  if (!table) return;
  const { state } = table;
  const tableName = state.tableName.get();
  if (!tableName) return;

  const totalRows = state.totalRows.get();
  const filteredRows = state.filteredRows.get();
  const schema = state.schema.get();
  const filters = state.filters.get();

  const numericCols = schema.filter((c) => isNumericType(c.type)).length;
  const dateCols = schema.filter((c) => isDateType(c.type)).length;
  const timeCols = schema.filter((c) => isTimeType(c.type)).length;
  const categoricalCols = schema.filter((c) => isCategoricalType(c.type)).length;

  let info =
    filters.length > 0
      ? `<strong>${filteredRows.toLocaleString()}</strong> / ${totalRows.toLocaleString()} rows, <strong>${schema.length}</strong> columns | <strong>${filters.length}</strong> filter${filters.length > 1 ? 's' : ''}`
      : `<strong>${totalRows.toLocaleString()}</strong> rows, <strong>${schema.length}</strong> columns`;
  info += ` (${numericCols} numeric, ${dateCols} date, ${timeCols} time, ${categoricalCols} categorical)`;

  const derived = state.derivedColumns.get();
  if (derived.length > 0) info += ` | <strong>${derived.length}</strong> derived`;
  const pinned = state.pinnedColumns.get();
  if (pinned.length > 0) info += ` | <strong>${pinned.length}</strong> pinned`;
  const sort = state.sortColumns.get();
  if (sort.length > 0) {
    const desc = sort
      .map(
        (s, i) =>
          `${s.column} (${s.direction === 'asc' ? '\u25B2' : '\u25BC'}${sort.length > 1 ? ` #${i + 1}` : ''})`,
      )
      .join(', ');
    info += ` | <strong>Sort:</strong> ${desc}`;
  }
  updateInfo(info);
}

async function loadSource(source: File | string, overrideTableName?: string): Promise<void> {
  // Unique-per-load tableName: Date.now keeps it monotonic across page reloads
  // (so a fresh load can never collide with a previous session's persistence
  // key), and the counter suffix disambiguates loads within the same ms.
  const tableName = overrideTableName || `table_${Date.now()}_${++tableCounter}`;
  updateInfo('Loading data...');

  try {
    // Create the table on first load; reuse afterwards.
    if (!table) {
      table = await createDataTable({
        container: tableContainerEl,
        source,
        tableName,
        persistence: true,
        presets: true,
        undoRedo: true,
        expressionFilter: true,
        visualizations: true,
        colorScheme: currentScheme,
      });
      wireTableEvents(table);
    } else {
      await table.loadData(source, { tableName });
    }

    updateTableInfo();

    // Update export filename source label.
    const sourceName =
      source instanceof File
        ? source.name
        : source.substring(source.lastIndexOf('/') + 1) || tableName;

    // Persist last session pointer so a refresh can auto-restore.
    try {
      const session: LastSession =
        source instanceof File
          ? { type: 'file', source: source.name, tableName }
          : { type: 'url', source: source as string, tableName };
      localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
    } catch {
      /* unavailable in some browsers */
    }

    // Cache the loaded table as Parquet so a refresh restores without a prompt.
    // Export only original source columns — excluding system columns
    // (e.g. `__rowid__`) and derived columns — so the round-tripped cache
    // doesn't feed the loader's `__rowid__` back in on the next load.
    const currentTableName = table.state.tableName.get();
    const baseTable = table.state.baseTableName.get() ?? currentTableName;
    if (currentTableName && baseTable) {
      const cacheCols = table.state.schema
        .get()
        .filter((c) => !c.system && !c.isDerived)
        .map((c) => quoteIdentifier(c.name))
        .join(', ');
      if (cacheCols) {
        table.bridge
          .exportToBuffer(`SELECT ${cacheCols} FROM ${quoteIdentifier(baseTable)}`, 'parquet')
          .then((buffer) => cacheTableData(currentTableName, buffer, sourceName))
          .catch(() => {
            /* caching is best-effort */
          });
      }
    }

    // Reset the file picker so the user can immediately re-select the same
    // file (browsers suppress the change event on identical reselection).
    if (source instanceof File) fileInput.value = '';
  } catch (error) {
    // One-time migration for users who have an older cache that still
    // contains a leaked `__rowid__` column: clear it and prompt for a
    // fresh load instead of repeating the failing restore.
    const code = (error as { code?: string }).code;
    if (code === 'LOAD_RESERVED_COLUMN_NAME') {
      try {
        await clearCachedData(tableName);
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem(LAST_SESSION_KEY);
      } catch {
        /* ignore */
      }
      updateInfo('Cached session was stale and has been cleared. Load a file or URL to continue.');
      return;
    }
    updateInfo(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function wireTableEvents(t: DataTable): void {
  // Info bar refresh on any state change.
  t.on('filterChange', updateTableInfo);
  t.on('sortChange', updateTableInfo);
  t.on('columnChange', updateTableInfo);
  t.on('derivedChange', updateTableInfo);

  // Undo/redo/reset button state.
  t.on('undoChange', ({ canUndo, canRedo }) => {
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
    resetBtn.disabled = !canUndo;
  });

  // Export and Clear Session are enabled whenever a table is loaded.
  // Signal.subscribe doesn't replay the current value, so sync once manually.
  const syncDataDependentBtns = (name: string | null): void => {
    exportBtn.disabled = !name;
    clearSessionBtn.disabled = !name;
  };
  t.state.tableName.subscribe(syncDataDependentBtns);
  syncDataDependentBtns(t.state.tableName.get());
}

// ----- UI wiring -----
exportBtn.addEventListener('click', () => table?.openExportDialog());
undoBtn.addEventListener('click', () => table?.actions.undo());
redoBtn.addEventListener('click', () => table?.actions.redo());
resetBtn.addEventListener('click', () => table?.actions.resetToInitial());

clearSessionBtn.addEventListener('click', async () => {
  const tableName = table?.state.baseTableName.get() ?? table?.state.tableName.get() ?? null;
  if (table) await table.clearSession();
  if (tableName) await clearCachedData(tableName);
  try {
    localStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    /* ignore */
  }
  fileInput.value = '';
  urlInput.value = '';
  updateInfo('Session cleared. Load a file or URL to start fresh.');
});

loadFileBtn.addEventListener('click', () => {
  const file = fileInput.files?.[0];
  if (file) void loadSource(file);
});
loadUrlBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (url) void loadSource(url);
});
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !loadUrlBtn.disabled) {
    const url = urlInput.value.trim();
    if (url) void loadSource(url);
  }
});

// ----- Init + auto-restore -----
(async () => {
  initStatusEl.textContent = 'DuckDB Ready';
  initStatusEl.classList.add('init-status--success');
  loadFileBtn.disabled = false;
  loadUrlBtn.disabled = false;
  updateInfo('Load a file or URL to get started.');

  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return;
    const session: LastSession = JSON.parse(raw);
    const cached = await loadCachedData(session.tableName);
    if (cached) {
      updateInfo(`Restoring session: <strong>${cached.sourceName}</strong>...`);
      const bytesArray = new Uint8Array(cached.buffer as unknown as ArrayBufferLike);
      const blob = new Blob([bytesArray as unknown as BlobPart]);
      const file = new File([blob], cached.sourceName + '.parquet');
      void loadSource(file, session.tableName);
    } else if (session.type === 'url') {
      urlInput.value = session.source;
      void loadSource(session.source, session.tableName);
    } else {
      updateInfo(
        `Previous session: <strong>${session.source}</strong> — ` +
          `load the same file to restore your state, or ` +
          `<a href="#" id="dismiss-session">dismiss</a>.`,
      );
      document.getElementById('dismiss-session')?.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          localStorage.removeItem(LAST_SESSION_KEY);
        } catch {
          /* ignore */
        }
        updateInfo('Load a file or URL to get started.');
      });
    }
  } catch {
    /* localStorage unavailable */
  }
})();
