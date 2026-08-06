/**
 * Interactive Data Table — Demo App
 *
 * This demo shows a third-party consumer embedding the data-table library.
 * Almost all wiring is handled by `createDataTable()`; the demo only owns
 * the surrounding UI (file upload, URL input, info bar) and a tiny
 * persistence convention so that a single dataset's history survives
 * page refresh.
 *
 * Persistence convention (demo-only — the library itself is general):
 * - File uploads use a fresh per-click `tableName`
 *   (`dt_file_${ts36}_${counter}`). Re-uploading the same file is a
 *   deliberate user action and always starts a fresh session, even when
 *   the bytes are identical to the prior upload.
 * - URL loads use a SHA-256 of the fetched bytes (truncated to 16 hex
 *   chars) as the `tableName`. Same content → same tableName → snapshot
 *   restored (or no-op if the same hash is already loaded). Different
 *   content → different tableName → fresh state, previous snapshot
 *   evicted. This makes URL refresh fool-proof against URLs whose
 *   contents change between visits.
 * - Only the most recent dataset's session and Parquet cache are kept;
 *   loading a different dataset deletes the previous IDB rows.
 * - On boot, a one-shot migration prunes any orphan rows left behind by
 *   the legacy `table_${Date.now()}_${counter}` naming scheme.
 */

import '@jeyabbalas/data-table/styles';
import {
  VERSION,
  createDataTable,
  quoteIdentifier,
  SessionStore,
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

// ----- Shareable URL params (demo-only) -----
// `?url=…` lets a user copy the demo URL and have a friend open the same
// dataset on the deployed GitHub Pages site. We use replaceState so loading
// a dataset doesn't pollute the back/forward stack.
const URL_PARAM_KEY = 'url';

function getUrlParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(URL_PARAM_KEY);
  } catch {
    return null;
  }
}

function setUrlParam(url: string | null): void {
  try {
    const params = new URLSearchParams(window.location.search);
    if (url) params.set(URL_PARAM_KEY, url);
    else params.delete(URL_PARAM_KEY);
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`;
    window.history.replaceState(null, '', next);
  } catch {
    /* history API unavailable */
  }
}

// ----- Parquet cache for the current dataset (demo-only) -----
// Stores a Parquet snapshot of the active table in IndexedDB so a refresh
// can restore the bytes without re-fetching the URL or re-prompting for a
// file. Keyed by the same hash-based `tableName` the library uses for its
// session snapshot.
const DATA_CACHE_DB = 'dt-data-cache';
const DATA_CACHE_STORE = 'data';
const LAST_SESSION_KEY = 'dt-last-session';

interface LastSession {
  type: 'url' | 'file';
  /** Display label — URL or file name. Not used for identity. */
  source: string;
  /** Identity: `dt_${sha256_16hex}` of the loaded bytes. */
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

async function listCachedTableNames(): Promise<string[]> {
  const db = await openDataCache();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(DATA_CACHE_STORE, 'readonly');
    const req = tx.objectStore(DATA_CACHE_STORE).getAllKeys();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as string[]) ?? []);
    };
    req.onerror = () => {
      db.close();
      resolve([]);
    };
  });
}

// ----- Content-hash dataset identity (URL loads only) -----
// SHA-256 (first 64 bits, 16 hex chars) over the fetched URL bytes. Same
// content → same tableName regardless of URL, modification times, or
// caching layers. ~50–200ms for a 100MB dataset via crypto.subtle.digest
// (off main thread). File uploads bypass this and get a per-click unique
// tableName — see `loadBytes` for the policy split.
async function hashBytes(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

type FileFormat = 'csv' | 'json' | 'parquet';

function detectFormatFromName(name: string): FileFormat {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'parquet' || ext === 'pq') return 'parquet';
  if (ext === 'json' || ext === 'ndjson' || ext === 'jsonl') return 'json';
  return 'csv';
}

interface PreparedSource {
  bytes: Uint8Array;
  format: FileFormat;
  sourceName: string;
}

async function prepareSource(source: File | string): Promise<PreparedSource> {
  if (source instanceof File) {
    const buf = await source.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      format: detectFormatFromName(source.name),
      sourceName: source.name,
    };
  }
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }
  const buf = await response.arrayBuffer();
  const path = new URL(source).pathname;
  const fileSeg = path.split('/').pop() || '';
  return {
    bytes: new Uint8Array(buf),
    format: detectFormatFromName(fileSeg),
    sourceName: source.split('/').pop() || source,
  };
}

// ----- Demo-owned SessionStore -----
// Owned by the demo (not by any single DataTable instance) so we can
// directly evict the previous tableName's row when the user switches
// datasets. createDataTable receives it via `persistence.sessionStore`.
const sessionStore = new SessionStore();

let table: DataTable | null = null;
// Per-page counter that ensures every file upload yields a unique
// `tableName` even when two uploads share a millisecond timestamp.
let fileUploadCounter = 0;

function readPreviousTableName(): string | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as LastSession;
    return typeof session.tableName === 'string' ? session.tableName : null;
  } catch {
    return null;
  }
}

async function pruneOrphans(currentTableName: string | null): Promise<void> {
  // Keep only the row for currentTableName (if any); drop all other entries
  // in both stores. This handles legacy `table_${Date.now()}_${counter}`
  // snapshots from before the hash-based identity refactor.
  try {
    const sessionNames = await sessionStore.list();
    for (const name of sessionNames) {
      if (name !== currentTableName) await sessionStore.delete(name);
    }
  } catch {
    /* IDB unavailable */
  }
  try {
    const cacheKeys = await listCachedTableNames();
    for (const name of cacheKeys) {
      if (name !== currentTableName) await clearCachedData(name);
    }
  } catch {
    /* IDB unavailable */
  }
}

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
          `${s.column} (${s.direction === 'asc' ? '▲' : '▼'}${sort.length > 1 ? ` #${i + 1}` : ''})`,
      )
      .join(', ');
    info += ` | <strong>Sort:</strong> ${desc}`;
  }
  updateInfo(info);
}

interface LoadBytesOptions {
  /** localStorage label + URL-param sync. */
  meta: { type: 'file' | 'url'; source: string };
  /** Skip re-hashing when the caller already knows the tableName (cache hit). */
  knownTableName?: string;
  /** Skip re-caching the Parquet bytes when restoring from the existing cache. */
  skipParquetCache?: boolean;
}

async function loadBytes(prepared: PreparedSource, opts: LoadBytesOptions): Promise<void> {
  updateInfo('Loading data...');

  // tableName policy:
  // - knownTableName wins (boot-time restore paths pass the stored ID).
  // - File upload → unique per-click ID, so re-uploading the same file
  //   always starts a fresh session.
  // - URL load → SHA-256 of the fetched bytes, so the same URL with
  //   unchanged content reuses its snapshot, while changed content
  //   produces a new tableName and evicts the previous snapshot.
  let tableName: string;
  if (opts.knownTableName) {
    tableName = opts.knownTableName;
  } else if (opts.meta.type === 'file') {
    tableName = `dt_file_${Date.now().toString(36)}_${++fileUploadCounter}`;
  } else {
    tableName = `dt_${await hashBytes(prepared.bytes)}`;
  }
  const previousTableName = readPreviousTableName();

  // Skip-if-current guard: when the user clicks Load URL with content
  // whose hash matches the live table, there's nothing to do at the
  // DuckDB layer (the snapshot is already in memory). Refreshing the
  // user-visible labels is enough — and it sidesteps any underlying
  // worker-level cost from re-registering identical bytes. Only
  // reachable for URL loads in practice; file uploads always have a
  // fresh tableName.
  if (table) {
    const currentBaseTable = table.state.baseTableName.get() ?? table.state.tableName.get();
    if (currentBaseTable === tableName) {
      try {
        const session: LastSession = {
          type: opts.meta.type,
          source: opts.meta.source,
          tableName,
        };
        localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
      } catch {
        /* localStorage unavailable */
      }
      setUrlParam(opts.meta.type === 'url' ? opts.meta.source : null);
      updateTableInfo();
      return;
    }
  }

  // The library's loader expects ArrayBuffer for Parquet and string for
  // text formats. We already have the fetched / file-read bytes in hand,
  // so passing them back to the library doesn't add I/O cost.
  const librarySource: ArrayBuffer | string =
    prepared.format === 'parquet'
      ? prepared.bytes.buffer.slice(
          prepared.bytes.byteOffset,
          prepared.bytes.byteOffset + prepared.bytes.byteLength,
        )
      : new TextDecoder('utf-8').decode(prepared.bytes);

  try {
    if (!table) {
      table = await createDataTable({
        container: tableContainerEl,
        source: librarySource,
        sourceFormat: prepared.format,
        tableName,
        persistence: { sessionStore },
        presets: true,
        undoRedo: true,
        expressionFilter: true,
        visualizations: true,
        colorScheme: currentScheme,
      });
      wireTableEvents(table);
      // Re-apply the scheme the radios show right now: a toggle clicked
      // while createDataTable was pending hit `table?.setColorScheme` when
      // `table` was still undefined and silently no-oped. Idempotent when
      // nothing changed mid-flight.
      table.setColorScheme(currentScheme);
    } else {
      await table.loadData(librarySource, {
        tableName,
        sourceFormat: prepared.format,
      });
    }

    updateTableInfo();

    // Persist the localStorage pointer AFTER the load resolves — a failed
    // load should leave the previous session pointer intact.
    try {
      const session: LastSession = {
        type: opts.meta.type,
        source: opts.meta.source,
        tableName,
      };
      localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
    } catch {
      /* localStorage unavailable */
    }

    // Evict the previous dataset's snapshot + Parquet cache only after the
    // new load has succeeded. If the hash matches, no eviction is needed
    // (same dataset, snapshot already restored).
    if (previousTableName && previousTableName !== tableName) {
      try {
        await sessionStore.delete(previousTableName);
      } catch {
        /* best-effort */
      }
      try {
        await clearCachedData(previousTableName);
      } catch {
        /* best-effort */
      }
    }

    // Keep the shareable `?url=` param in sync with what was just loaded.
    // File loads aren't shareable, so wipe any stale param the page was
    // opened with — otherwise a refresh would load the (no longer relevant)
    // shared dataset on top of the user's local data.
    setUrlParam(opts.meta.type === 'url' ? opts.meta.source : null);

    // Cache the loaded table as Parquet so a refresh restores without a
    // network round-trip or file picker prompt. Skipped when restoring
    // from the existing cache (we already have those bytes). Export only
    // original source columns — system columns (`__rowid__`) and derived
    // columns are excluded so the round-tripped cache doesn't feed the
    // loader's `__rowid__` back in on the next load.
    if (!opts.skipParquetCache) {
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
            .then((buffer) => cacheTableData(currentTableName, buffer, prepared.sourceName))
            .catch(() => {
              /* caching is best-effort */
            });
        }
      }
    }
  } catch (error) {
    // One-time recovery for users who have an older cache that still
    // contains a leaked `__rowid__` column: clear it and prompt for a
    // fresh load instead of repeating the failing restore.
    const code = (error as { code?: string }).code;
    if (code === 'LOAD_RESERVED_COLUMN_NAME') {
      try {
        await sessionStore.delete(tableName);
      } catch {
        /* ignore */
      }
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

async function loadSource(source: File | string): Promise<void> {
  try {
    const prepared = await prepareSource(source);
    const meta: LoadBytesOptions['meta'] =
      source instanceof File ? { type: 'file', source: source.name } : { type: 'url', source };
    await loadBytes(prepared, { meta });
    // Reset the file picker so the user can immediately re-select the same
    // file (browsers suppress the change event on identical reselection).
    if (source instanceof File) fileInput.value = '';
  } catch (error) {
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
  setUrlParam(null);
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

// Example dataset chips — clicking loads the URL through the same path as the
// URL input, so format auto-detection and `?url=` syncing both happen for free.
for (const chip of document.querySelectorAll<HTMLButtonElement>('.chip[data-url]')) {
  chip.addEventListener('click', () => {
    const url = chip.dataset.url;
    if (!url || loadUrlBtn.disabled) return;
    urlInput.value = url;
    void loadSource(url);
  });
}

// ----- Init + auto-restore -----
(async () => {
  initStatusEl.textContent = 'DuckDB Ready';
  initStatusEl.classList.add('init-status--success');
  loadFileBtn.disabled = false;
  loadUrlBtn.disabled = false;
  updateInfo('Load a file or URL to get started.');

  await sessionStore.open();

  // Shared `?url=` deep links take precedence over the localStorage
  // session-restore. A friend opening the link expects to see the dataset
  // referenced by the URL, not whatever happened to be in this browser's
  // last session. Hashing the fetched bytes detects URL content changes
  // since the last visit — the new hash differs from `previousTableName`,
  // the previous snapshot is evicted, and the user gets a fresh state on
  // the new content.
  const sharedUrl = getUrlParam();
  if (sharedUrl) {
    urlInput.value = sharedUrl;
    updateInfo(`Loading shared dataset: <strong>${sharedUrl}</strong>...`);
    let prepared: PreparedSource;
    try {
      prepared = await prepareSource(sharedUrl);
    } catch (err) {
      updateInfo(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }
    const tableName = `dt_${await hashBytes(prepared.bytes)}`;
    await pruneOrphans(tableName);
    await loadBytes(prepared, {
      meta: { type: 'url', source: sharedUrl },
      knownTableName: tableName,
    });
    return;
  }

  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) {
      // Either first-ever load or the session was cleared. Still prune any
      // legacy `table_${Date.now()}_${counter}` orphans from earlier
      // versions so storage doesn't grow without bound.
      await pruneOrphans(null);
      return;
    }
    const session: LastSession = JSON.parse(raw);
    await pruneOrphans(session.tableName);
    const cached = await loadCachedData(session.tableName);
    if (cached) {
      updateInfo(`Restoring session: <strong>${cached.sourceName}</strong>...`);
      const bytes = new Uint8Array(cached.buffer as unknown as ArrayBufferLike);
      await loadBytes(
        { bytes, format: 'parquet', sourceName: cached.sourceName },
        {
          meta: { type: session.type, source: session.source },
          knownTableName: session.tableName,
          // Cache hit — the bytes we have ARE the cache, no need to re-write.
          skipParquetCache: true,
        },
      );
    } else if (session.type === 'url') {
      urlInput.value = session.source;
      // No cache — re-fetch the URL. Hashing the fresh bytes lets us
      // detect content changes vs. the previous session.
      void loadSource(session.source);
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
