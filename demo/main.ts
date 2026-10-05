/**
 * Interactive Data Table — Demo App
 *
 * This demo shows a third-party consumer embedding the data-table library.
 * Almost all wiring is handled by `createDataTable()`; the demo only owns
 * the surrounding UI (file upload, URL input, info bar) and a tiny
 * persistence convention so that a single dataset's history survives
 * page refresh.
 *
 * The demo never reads a dataset itself. A file, or a URL's fetched bytes,
 * goes to the library as a File, so a large Parquet file takes the
 * library's large-file path: DuckDB reads it from disk as it loads, and
 * nothing copies it into the page.
 *
 * Persistence convention (demo-only — the library itself is general):
 * - File uploads use a fresh per-click `tableName`
 *   (`dt_file_${ts36}_${counter}`). Re-uploading the same file is a
 *   deliberate user action and always starts a fresh session, even when
 *   the bytes are identical to the prior upload.
 * - URL loads use a SHA-256 of the fetched bytes (truncated to 16 hex
 *   chars) as the `tableName`; see `fingerprint` for large ones. Same
 *   content → same tableName → snapshot restored (or no-op if the same
 *   hash is already loaded). Different content → different tableName →
 *   fresh state, previous snapshot evicted. This makes URL refresh
 *   fool-proof against URLs whose contents change between visits.
 * - The loaded dataset is cached in IndexedDB so a refresh restores it
 *   without a network round-trip or file picker prompt; see
 *   `cacheLoadedSource`.
 * - Only the most recent dataset's session and cache are kept; loading a
 *   different dataset deletes the previous IDB rows.
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
  isNestedType,
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

// ----- Example datasets -----
// The example chips load this repository's test fixtures from GitHub. The
// dev server serves the same files from the working tree at /fixtures/
// (vite.demo.config.ts), and a chip uses those in development: they work
// offline, and a fixture added on a branch works before it reaches main.
const FIXTURES_ON_GITHUB =
  /^https:\/\/raw\.githubusercontent\.com\/jeyabbalas\/data-table\/(?:refs\/heads\/)?main\/tests\/fixtures\/datasets\//;

/** The URL an example chip loads: its own, or in development the local copy. */
function exampleUrl(url: string): string {
  return import.meta.env.DEV ? url.replace(FIXTURES_ON_GITHUB, '/fixtures/') : url;
}

// ----- Dataset cache for the current dataset (demo-only) -----
// Stores the active dataset in IndexedDB so a refresh can restore it
// without re-fetching the URL or re-prompting for a file. Keyed by the same
// `tableName` the library uses for its session snapshot.
const DATA_CACHE_DB = 'dt-data-cache';
const DATA_CACHE_STORE = 'data';
const LAST_SESSION_KEY = 'dt-last-session';

/**
 * CSV and JSON up to this size are cached as a Parquet export of the
 * loaded table, which restores faster than parsing the text again. The
 * export copies the whole table out of DuckDB into the page, on top of the
 * text the load itself read, so a larger file is cached as it is.
 */
const TEXT_EXPORT_LIMIT = 256 * 1024 * 1024;

/**
 * A URL's identity hashes every byte up to this size. Hashing reads the
 * bytes into memory, so a larger one hashes a sample; see `fingerprint`.
 */
const FULL_HASH_LIMIT = 64 * 1024 * 1024;
const HASH_SAMPLE_BYTES = 4 * 1024 * 1024;

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

/** A cached dataset: what to hand the library on restore, and its format. */
interface CachedSource {
  tableName: string;
  /**
   * A Blob, which IndexedDB keeps on disk: storing or reading one copies
   * nothing into the page.
   */
  data: Blob;
  format: FileFormat;
  sourceName: string;
}

async function cacheSource(entry: CachedSource): Promise<void> {
  const db = await openDataCache();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DATA_CACHE_STORE, 'readwrite');
      tx.objectStore(DATA_CACHE_STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      // A dataset larger than the storage quota aborts the transaction.
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** A cache row as a {@link CachedSource}, including a row an older demo wrote. */
function toCachedSource(row: unknown): CachedSource | null {
  if (typeof row !== 'object' || row === null) return null;
  const { tableName, data, format, sourceName, buffer } = row as Record<string, unknown>;
  if (typeof tableName !== 'string') return null;
  const name = typeof sourceName === 'string' ? sourceName : tableName;
  if (data instanceof Blob && (format === 'csv' || format === 'json' || format === 'parquet')) {
    return { tableName, data, format, sourceName: name };
  }
  // Older demos cached every dataset as the bytes of a Parquet export.
  if (buffer instanceof Uint8Array) {
    return {
      tableName,
      data: new Blob([new Uint8Array(buffer)]),
      format: 'parquet',
      sourceName: name,
    };
  }
  return null;
}

async function loadCachedSource(tableName: string): Promise<CachedSource | null> {
  const db = await openDataCache();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(DATA_CACHE_STORE, 'readonly');
    const req = tx.objectStore(DATA_CACHE_STORE).get(tableName);
    req.onsuccess = () => {
      db.close();
      resolve(toCachedSource(req.result));
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
// caching layers. crypto.subtle.digest runs off the main thread. File
// uploads bypass this and get a per-click unique tableName — see
// `loadPrepared` for the policy split.
//
// Hashing reads the bytes into memory, all at once: crypto.subtle has no
// streaming digest. Above FULL_HASH_LIMIT the hash covers the size and the
// first and last HASH_SAMPLE_BYTES instead. A Parquet file ends with its
// footer (schema, row-group offsets and column statistics), so a change to
// its data almost always shows there; a same-size edit in the middle of a
// large CSV does not, and restores the old session over the new content.
async function fingerprint(blob: Blob): Promise<string> {
  const bytes =
    blob.size <= FULL_HASH_LIMIT
      ? await blob.arrayBuffer()
      : await new Blob([
          String(blob.size),
          blob.slice(0, HASH_SAMPLE_BYTES),
          blob.slice(blob.size - HASH_SAMPLE_BYTES),
        ]).arrayBuffer();
  const view = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
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
  /**
   * The dataset, handed to the library unread. As a File it takes the
   * library's File path: Parquet is read from disk as DuckDB loads it, CSV
   * and JSON as text.
   */
  file: File;
  format: FileFormat;
  sourceName: string;
}

async function prepareSource(source: File | string): Promise<PreparedSource> {
  if (source instanceof File) {
    return { file: source, format: detectFormatFromName(source.name), sourceName: source.name };
  }
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }
  // A Blob, not an ArrayBuffer: the browser keeps a large one on disk.
  const blob = await response.blob();
  // A web page is no dataset, though it would load as a CSV of its HTML: a
  // server that answers any path with its app's page sends one, as Vite's
  // dev server does for a relative `?url=` it has no file for.
  const head = (await blob.slice(0, 1024).text()).trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
    throw new Error('The URL returned a web page, not a data file');
  }
  // Relative to the page, as fetch reads it: an example chip's /fixtures/
  // path in development, or a relative `?url=`.
  const path = new URL(source, window.location.href).pathname;
  const fileSeg = path.split('/').pop() || '';
  return {
    file: new File([blob], fileSeg || 'data', { type: blob.type }),
    format: detectFormatFromName(fileSeg),
    sourceName: source.split('/').pop() || source,
  };
}

/** A cached dataset as a {@link PreparedSource}, to restore it. */
function preparedFromCache(cached: CachedSource): PreparedSource {
  const file =
    cached.data instanceof File ? cached.data : new File([cached.data], cached.sourceName);
  return { file, format: cached.format, sourceName: cached.sourceName };
}

// ----- Demo-owned SessionStore -----
// Owned by the demo (not by any single DataTable instance) so we can
// directly evict the previous tableName's row when the user switches
// datasets. createDataTable receives it via `persistence.sessionStore`.
const sessionStore = new SessionStore();

let table: DataTable | null = null;
// Development only: the current table as `window.__dtDemo.table`, for the
// browser tests and for poking at it from DevTools.
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__dtDemo', {
    value: Object.freeze({
      get table(): DataTable | null {
        return table;
      },
    }),
    configurable: true,
  });
}
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

/**
 * Text for {@link updateInfo}'s HTML. A shared `?url=` link, a file name, a
 * column name or an error message is not the demo's to trust.
 */
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 2 ** 30) return `${(bytes / 2 ** 30).toFixed(1)} GB`;
  if (bytes >= 2 ** 20) return `${(bytes / 2 ** 20).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 2 ** 10)} KB`;
}

/** How long the last load took, for the info bar; null while one runs. */
let lastLoadSeconds: number | null = null;
/**
 * The info bar's text while a load runs. A load changes the table's state
 * as it goes, and the counts that `updateTableInfo` would show meanwhile are
 * the old dataset's or none.
 */
let loadingMessage: string | null = null;

function updateTableInfo(): void {
  if (loadingMessage !== null) {
    updateInfo(loadingMessage);
    return;
  }
  if (!table) return;
  const { state } = table;
  const tableName = state.tableName.get();
  if (!tableName) return;

  const totalRows = state.totalRows.get();
  const filteredRows = state.filteredRows.get();
  // The dataset's columns: the hidden `__rowid__` is the table's own.
  const schema = state.schema.get().filter((c) => !c.system);
  const filters = state.filters.get();

  const numericCols = schema.filter((c) => isNumericType(c.type)).length;
  const dateCols = schema.filter((c) => isDateType(c.type)).length;
  const timeCols = schema.filter((c) => isTimeType(c.type)).length;
  const categoricalCols = schema.filter((c) => isCategoricalType(c.type)).length;
  const nestedCols = schema.filter((c) => isNestedType(c.type)).length;

  let info =
    filters.length > 0
      ? `<strong>${filteredRows.toLocaleString()}</strong> / ${totalRows.toLocaleString()} rows, <strong>${schema.length}</strong> columns | <strong>${filters.length}</strong> filter${filters.length > 1 ? 's' : ''}`
      : `<strong>${totalRows.toLocaleString()}</strong> rows, <strong>${schema.length}</strong> columns`;
  info += ` (${numericCols} numeric, ${dateCols} date, ${timeCols} time, ${categoricalCols} categorical`;
  if (nestedCols > 0) info += `, ${nestedCols} nested`;
  info += ')';

  const derived = state.derivedColumns.get();
  if (derived.length > 0) info += ` | <strong>${derived.length}</strong> derived`;
  const pinned = state.pinnedColumns.get();
  if (pinned.length > 0) info += ` | <strong>${pinned.length}</strong> pinned`;
  const sort = state.sortColumns.get();
  if (sort.length > 0) {
    const desc = sort
      .map(
        (s, i) =>
          `${escapeHtml(s.column)} (${s.direction === 'asc' ? '▲' : '▼'}${sort.length > 1 ? ` #${i + 1}` : ''})`,
      )
      .join(', ');
    info += ` | <strong>Sort:</strong> ${desc}`;
  }
  if (lastLoadSeconds !== null) info += ` | loaded in ${lastLoadSeconds.toFixed(1)} s`;
  // Nested and JSON cells open in the value inspector.
  if (nestedCols > 0 || schema.some((c) => c.originalType.toUpperCase() === 'JSON')) {
    info += ' | F2 or double-click a nested cell to inspect it';
  }
  updateInfo(info);
}

interface LoadOptions {
  /** localStorage label + URL-param sync. */
  meta: { type: 'file' | 'url'; source: string };
  /** Skip re-hashing when the caller already knows the tableName (cache hit). */
  knownTableName?: string;
  /** Skip re-caching the dataset when restoring from the existing cache. */
  skipCache?: boolean;
  /** A load at startup, for the session: it offers a way to skip it. */
  restoring?: boolean;
}

/**
 * A link that abandons the load at startup and reloads without it. The
 * load controls are off meanwhile, and a load has no timeout (DuckDB's
 * start-up fetches included), so without it a stalled restore would hold
 * the page, and every reload would retry it.
 */
const SKIP_LINK = ' · <a href="#" data-action="skip">Skip</a>';

/**
 * Cache a loaded dataset for refresh. Parquet is cached as the file
 * itself: IndexedDB keeps the Blob on disk, and the restore reads it from
 * there as lazily as the first load read the original. CSV and JSON up to
 * TEXT_EXPORT_LIMIT are cached as a Parquet export of their source
 * columns, which leaves out `__rowid__` (the loader rejects a source that
 * has one) and derived columns; larger ones as the file itself.
 */
async function cacheLoadedSource(
  t: DataTable,
  tableName: string,
  prepared: PreparedSource,
): Promise<void> {
  const { file, format, sourceName } = prepared;
  if (format === 'parquet' || file.size > TEXT_EXPORT_LIMIT) {
    await cacheSource({ tableName, data: file, format, sourceName });
    return;
  }
  const baseTable = t.state.baseTableName.get() ?? t.state.tableName.get();
  const columns = t.state.schema
    .get()
    .filter((c) => !c.system && !c.isDerived)
    .map((c) => quoteIdentifier(c.name))
    .join(', ');
  if (!baseTable || !columns) return;
  const bytes = await t.bridge.exportToBuffer(
    `SELECT ${columns} FROM ${quoteIdentifier(baseTable)}`,
    'parquet',
  );
  await cacheSource({
    tableName,
    data: new Blob([bytes as Uint8Array<ArrayBuffer>]),
    format: 'parquet',
    sourceName,
  });
}

async function loadPrepared(prepared: PreparedSource, opts: LoadOptions): Promise<void> {
  lastLoadSeconds = null;
  loadingMessage =
    `Loading <strong>${escapeHtml(prepared.sourceName)}</strong> ` +
    `(${formatSize(prepared.file.size)})...` +
    (opts.restoring ? SKIP_LINK : '');
  updateInfo(loadingMessage);
  try {
    await loadPreparedNow(prepared, opts);
  } finally {
    loadingMessage = null;
  }
}

async function loadPreparedNow(prepared: PreparedSource, opts: LoadOptions): Promise<void> {
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
    tableName = `dt_${await fingerprint(prepared.file)}`;
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
      loadingMessage = null;
      updateTableInfo();
      return;
    }
  }

  try {
    if (!table) {
      // Mount first, then load. `createDataTable` with a `source` rejects
      // when that load fails and leaves its table and worker behind, and the
      // next load would mount a second one; a table mounted empty stays, and
      // takes the next load.
      table = await createDataTable({
        container: tableContainerEl,
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
    }
    // Timed from here: the first load's figure leaves out DuckDB's start-up.
    const started = performance.now();
    await table.loadData(prepared.file, {
      tableName,
      sourceFormat: prepared.format,
    });

    lastLoadSeconds = (performance.now() - started) / 1000;
    loadingMessage = null;
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

    // Evict the previous dataset's snapshot + cache only after the new load
    // has succeeded. If the hash matches, no eviction is needed (same
    // dataset, snapshot already restored).
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

    // Skipped when restoring from the cache: it holds this dataset already.
    if (!opts.skipCache) {
      cacheLoadedSource(table, tableName, prepared).catch(() => {
        /* caching is best-effort */
      });
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    // A restore from the cache can fail for a reason that passes (DuckDB not
    // starting, a network error, a busy machine), so the cached dataset and
    // its session stay: try again, or forget them.
    if (opts.skipCache) {
      updateInfo(
        `Could not restore <strong>${escapeHtml(prepared.sourceName)}</strong>: ` +
          `${escapeHtml(message)}. ` +
          `<a href="#" data-action="retry">Try again</a> · ` +
          `<a href="#" data-action="forget">Forget it</a>`,
      );
      return;
    }
    updateInfo(`Error: ${escapeHtml(message)}`);
  }
}

async function loadSource(source: File | string, { restoring = false } = {}): Promise<void> {
  try {
    const prepared = await prepareSource(source);
    const meta: LoadOptions['meta'] =
      source instanceof File ? { type: 'file', source: source.name } : { type: 'url', source };
    await loadPrepared(prepared, { meta, restoring });
    // Reset the file picker so the user can immediately re-select the same
    // file (browsers suppress the change event on identical reselection).
    if (source instanceof File) fileInput.value = '';
  } catch (error) {
    updateInfo(`Error: ${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}`);
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

// ----- One load at a time -----
// Two loads at once would mount two tables and DuckDB workers if the page
// has none yet, and hold two large tables in memory if it has.
const exampleChips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip[data-url]'));
let loadRunning = false;

function setLoadControlsDisabled(disabled: boolean): void {
  loadFileBtn.disabled = disabled;
  loadUrlBtn.disabled = disabled;
  for (const chip of exampleChips) chip.disabled = disabled;
}

/** Run `task` unless a load is running, with the load controls off meanwhile. */
async function exclusively(task: () => Promise<void>): Promise<void> {
  if (loadRunning) return;
  loadRunning = true;
  setLoadControlsDisabled(true);
  try {
    await task();
  } finally {
    loadRunning = false;
    setLoadControlsDisabled(false);
  }
}

// ----- Links in the info bar -----
// Put there by the startup restore and its failure: try it again, forget
// the last session and its cached dataset, or skip a restore in progress.
tableInfoEl.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest<HTMLElement>('a[data-action]');
  if (!link) return;
  event.preventDefault();
  const action = link.dataset.action;
  if (action === 'retry') {
    void exclusively(restoreSession);
    return;
  }
  const tableName = readPreviousTableName();
  try {
    localStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    /* ignore */
  }
  if (action === 'skip') {
    setUrlParam(null);
    window.location.reload();
    return;
  }
  if (action === 'forget') {
    if (tableName) {
      clearCachedData(tableName).catch(() => {
        /* best-effort */
      });
    }
    updateInfo('Load a file or URL to get started.');
  }
});

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
  if (file) void exclusively(() => loadSource(file));
});
loadUrlBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (url) void exclusively(() => loadSource(url));
});
// The URL input stays enabled while a load runs; `exclusively` turns Enter away.
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = urlInput.value.trim();
    if (url) void exclusively(() => loadSource(url));
  }
});

// Example dataset chips — clicking loads the URL through the same path as the
// URL input, so format auto-detection and `?url=` syncing both happen for free.
for (const chip of exampleChips) {
  chip.addEventListener('click', () => {
    const url = chip.dataset.url && exampleUrl(chip.dataset.url);
    if (!url || loadRunning) return;
    urlInput.value = url;
    void exclusively(() => loadSource(url));
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
  await exclusively(restoreSession);
})();

/** Load what the page was opened for: a shared `?url=`, or the last session. */
async function restoreSession(): Promise<void> {
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
    updateInfo(`Loading shared dataset: <strong>${escapeHtml(sharedUrl)}</strong>...${SKIP_LINK}`);
    let prepared: PreparedSource;
    try {
      prepared = await prepareSource(sharedUrl);
    } catch (err) {
      updateInfo(`Error: ${escapeHtml(err instanceof Error ? err.message : 'Unknown error')}`);
      return;
    }
    const tableName = `dt_${await fingerprint(prepared.file)}`;
    await pruneOrphans(tableName);
    await loadPrepared(prepared, {
      meta: { type: 'url', source: sharedUrl },
      knownTableName: tableName,
      restoring: true,
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
    const cached = await loadCachedSource(session.tableName);
    if (cached) {
      updateInfo(
        `Restoring session: <strong>${escapeHtml(cached.sourceName)}</strong>...${SKIP_LINK}`,
      );
      await loadPrepared(preparedFromCache(cached), {
        meta: { type: session.type, source: session.source },
        knownTableName: session.tableName,
        // Cache hit — what we have IS the cache, no need to re-write.
        skipCache: true,
        restoring: true,
      });
    } else if (session.type === 'url') {
      urlInput.value = session.source;
      updateInfo(`Loading <strong>${escapeHtml(session.source)}</strong>...${SKIP_LINK}`);
      // No cache — re-fetch the URL. Hashing the fresh bytes lets us
      // detect content changes vs. the previous session.
      await loadSource(session.source, { restoring: true });
    } else {
      updateInfo(
        `Previous session: <strong>${escapeHtml(session.source)}</strong> — ` +
          `load the same file to restore your state, or ` +
          `<a href="#" data-action="forget">dismiss</a>.`,
      );
    }
  } catch {
    /* localStorage unavailable */
  }
}
