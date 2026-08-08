/**
 * Dev-only scale harness for the demo page (`plans/scaling/` Phase 0).
 *
 * Opening the demo with `?gen=<tier>` hands the page to this module: it
 * mounts its own `DataTable`, generates one of the named tiers, drives it
 * through the **real** load path, and publishes a machine-readable readout
 * — `#dt-perf-panel` for a human or a browser-automation agent, and
 * `window.__dtPerf` for anything that wants raw numbers.
 *
 * ```
 * ?gen=wide|deep|grid|wide-ci|wide-csv|target|custom
 *   &rows=<int>&cols=<int>&seed=<int>
 *   &viz=on|off        (default off — 1,000 eager column charts is its own experiment)
 *   &mode=load|sql     (default load; `target` forces sql until Phase 10)
 *   &marks=on|off      (default on — off drops the dt:load:* readouts)
 * ```
 *
 * **Dev-only by construction.** `demo/main.ts` reaches this module through
 * a dynamic `import()` behind `import.meta.env.DEV`; `npm run build:demo`
 * runs in production mode, where that constant inlines to `false` and
 * Rollup drops the branch, this module, and the tier builders it imports
 * out of `demo-dist/`. Nothing here is inside `src/`, so the library
 * bundle never sees it either.
 *
 * The tier builders are imported from `tests/fixtures/tiers` rather than
 * copied: one `cellOracle` definition, three consumers (unit tests,
 * Playwright helpers, this harness). `vite.demo.config.ts`'s
 * `server.fs.allow` already covers the repo root.
 */
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

import {
  ORACLE_FN_SOURCE,
  TIERS,
  columnName,
  resolveTier,
  targetCopySQL,
  tierCSV,
  tierSelectSQL,
  type TierSpec,
} from '../tests/fixtures/tiers';

/** Lifecycle states the panel advertises via `data-state`. */
type PerfState = 'idle' | 'generating' | 'exporting' | 'loading' | 'ready' | 'error';

/** Every `data-metric` field the panel renders, in display order. */
const METRICS = [
  'tier',
  'rows',
  'cols',
  'bootMs',
  'genMs',
  'loadMs',
  'firstPaintMs',
  'vizReadyMs',
  'queryCount',
  'cacheHits',
  'domNodes',
  'heapMB',
  'error',
] as const;

type Metric = (typeof METRICS)[number];

/** What `window.__dtPerf.snapshot()` returns. */
interface PerfSnapshot {
  tier: string;
  rows: number | null;
  cols: number | null;
  mode: 'load' | 'sql';
  viz: boolean;
  state: PerfState;
  /** `createDataTable` — worker spawn + DuckDB WASM boot. */
  bootMs: number | null;
  /** Building the parquet source: generation and encoding, streamed as one. */
  genMs: number | null;
  loadMs: number | null;
  firstPaintMs: number | null;
  vizReadyMs: number | null;
  queryCount: number | null;
  cacheHits: number | null;
  maxInFlight: number | null;
  domNodes: number;
  heapMB: number | null;
  error: string | null;
  /** `mode=sql` only: what the `read_parquet` probes returned. */
  probe?: { rowCount: number; colCount: number; sample: Record<string, unknown>[] };
}

interface PerfApi {
  snapshot: () => PerfSnapshot;
  refresh: () => PerfSnapshot;
  marks: () => Record<string, number>;
  resetQueryStats: () => void;
  /** The oracle from `ORACLE_FN_SOURCE` — `(i, c, seed) => string | null`. */
  oracle: (i: number, c: number, seed: number) => string | null;
  table: DataTable | null;
}

declare global {
  interface Window {
    __dtPerf?: PerfApi;
  }
}

const TARGET_FILE = 'dt_target.parquet';

// --- panel ---------------------------------------------------------------

/**
 * Build the readout and append it to `document.body`.
 *
 * Appending rather than editing `index.html` keeps the demo's markup
 * byte-identical for every visitor who does not pass `?gen=`; the panel
 * borrows the demo's own `.card` / `.info-panel` / `.btn--secondary`
 * classes so it does not need a stylesheet of its own.
 */
function buildPanel(): { root: HTMLElement; set: (metric: Metric, value: unknown) => void } {
  const root = document.createElement('section');
  root.id = 'dt-perf-panel';
  root.className = 'card';
  root.dataset['state'] = 'idle';

  const heading = document.createElement('h2');
  heading.textContent = 'Perf harness';
  heading.style.fontSize = '1rem';
  heading.style.margin = '0 0 0.5rem';
  root.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'info-panel';
  list.style.display = 'flex';
  list.style.flexWrap = 'wrap';
  list.style.gap = '0.25rem 1rem';
  root.appendChild(list);

  const fields = new Map<Metric, HTMLElement>();
  for (const metric of METRICS) {
    const item = document.createElement('span');
    const value = document.createElement('strong');
    value.dataset['metric'] = metric;
    value.textContent = '—';
    item.append(`${metric}: `, value);
    // `error` only earns its line when there is one.
    if (metric === 'error') item.hidden = true;
    list.appendChild(item);
    fields.set(metric, value);
  }

  const refresh = document.createElement('button');
  refresh.className = 'btn--secondary';
  refresh.type = 'button';
  refresh.dataset['action'] = 'refresh';
  refresh.textContent = 'Refresh';
  refresh.style.marginTop = '0.5rem';
  refresh.addEventListener('click', () => window.__dtPerf?.refresh());
  root.appendChild(refresh);

  document.body.appendChild(root);

  const set = (metric: Metric, value: unknown): void => {
    const el = fields.get(metric);
    if (!el) return;
    el.textContent =
      value === null || value === undefined
        ? '—'
        : typeof value === 'number'
          ? String(Math.round(value * 100) / 100)
          : String(value);
    if (metric === 'error' && el.parentElement) {
      el.parentElement.hidden = value === null || value === undefined;
    }
  };

  return { root, set };
}

// --- metric sources ------------------------------------------------------

/** Duration of a `dt:load:*` measure, or `null` if it never landed. */
function measureMs(name: string): number | null {
  try {
    const entries = performance.getEntriesByName(`dt:load:${name}`, 'measure');
    const last = entries[entries.length - 1];
    return last ? last.duration : null;
  } catch {
    return null;
  }
}

function allMarks(): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    for (const entry of performance.getEntriesByType('mark')) {
      if (entry.name.startsWith('dt:load:')) out[entry.name] = entry.startTime;
    }
    for (const entry of performance.getEntriesByType('measure')) {
      if (entry.name.startsWith('dt:load:')) out[entry.name] = entry.duration;
    }
  } catch {
    /* User Timing unavailable — an empty map is the honest answer. */
  }
  return out;
}

/** Elements under the mounted table, matching `helpers/demo.ts`'s `settle`. */
function domNodeCount(): number {
  const root = document.querySelector('.dt-root');
  return root ? root.querySelectorAll('*').length : 0;
}

/** Chrome-only; `null` everywhere else rather than a fabricated number. */
function heapMB(): number | null {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? Math.round((mem.usedJSHeapSize / 1024 / 1024) * 10) / 10 : null;
}

// --- params --------------------------------------------------------------

interface PerfParams {
  spec: TierSpec;
  tier: string;
  mode: 'load' | 'sql';
  viz: boolean;
  marks: boolean;
}

function intParam(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`"${key}" must be an integer (got "${raw}").`);
  return value;
}

function flagParam(params: URLSearchParams, key: string, fallback: boolean): boolean {
  const raw = params.get(key);
  if (raw === null) return fallback;
  if (raw !== 'on' && raw !== 'off') throw new Error(`"${key}" must be on|off (got "${raw}").`);
  return raw === 'on';
}

/** @throws Error with a message meant to be shown, never thrown at a dialog. */
function parseParams(params: URLSearchParams): PerfParams {
  const tier = params.get('gen') ?? '';
  const spec = resolveTier(tier, {
    rows: intParam(params, 'rows'),
    cols: intParam(params, 'cols'),
    seed: intParam(params, 'seed'),
  });

  const rawMode = params.get('mode') ?? 'load';
  if (rawMode !== 'load' && rawMode !== 'sql') {
    throw new Error(`"mode" must be load|sql (got "${rawMode}").`);
  }
  // TARGET is 1,000 x 5,000,000 — 40 GB if materialized. It exists as a
  // file only until Phase 10 teaches the library to scan one directly.
  const mode = tier === 'target' ? 'sql' : rawMode;

  return {
    spec,
    tier,
    mode,
    viz: flagParam(params, 'viz', false),
    marks: flagParam(params, 'marks', true),
  };
}

// --- harness -------------------------------------------------------------

/**
 * Take over the page: mount a table, build the requested tier, and publish
 * the readout. Resolves with the mounted `DataTable` (so `demo/main.ts`
 * can wire its Undo/Redo/Export buttons to it) or `null` if the params
 * were rejected before anything was mounted.
 *
 * Never throws and never opens a dialog — a failure lands in the panel as
 * `data-state="error"` plus a message in `[data-metric="error"]`, which is
 * what a browser-automation agent can actually assert on.
 */
export async function installPerfHarness(
  container: HTMLElement,
  params: URLSearchParams,
): Promise<DataTable | null> {
  const panel = buildPanel();
  const setState = (state: PerfState): void => {
    panel.root.dataset['state'] = state;
  };

  let config: PerfParams;
  try {
    config = parseParams(params);
  } catch (err) {
    setState('error');
    panel.set('tier', params.get('gen') ?? '(missing)');
    panel.set('error', err instanceof Error ? err.message : String(err));
    return null;
  }

  const { spec, tier, mode, viz, marks } = config;
  panel.set('tier', `${tier}${mode === 'sql' ? ' (sql)' : ''}`);
  panel.set('rows', spec.rows);
  panel.set('cols', spec.cols);

  let table: DataTable | null = null;
  let bootMs: number | null = null;
  let genMs: number | null = null;
  let loadMs: number | null = null;
  let probe: PerfSnapshot['probe'];
  let error: string | null = null;

  const snapshot = (): PerfSnapshot => {
    const stats = table?.bridge.__getStatsForTests();
    return {
      tier,
      rows: spec.rows,
      cols: spec.cols,
      mode,
      viz,
      state: (panel.root.dataset['state'] ?? 'idle') as PerfState,
      bootMs,
      genMs,
      loadMs,
      firstPaintMs: marks ? measureMs('paint') : null,
      vizReadyMs: marks ? measureMs('viz') : null,
      queryCount: stats ? stats.sent.query : null,
      cacheHits: stats ? stats.cacheHits : null,
      maxInFlight: stats ? stats.maxInFlight : null,
      domNodes: domNodeCount(),
      heapMB: heapMB(),
      error,
      ...(probe ? { probe } : {}),
    };
  };

  const render = (): PerfSnapshot => {
    const snap = snapshot();
    panel.set('bootMs', snap.bootMs);
    panel.set('genMs', snap.genMs);
    panel.set('loadMs', snap.loadMs);
    panel.set('firstPaintMs', snap.firstPaintMs);
    panel.set('vizReadyMs', snap.vizReadyMs);
    panel.set('queryCount', snap.queryCount);
    panel.set('cacheHits', snap.cacheHits);
    panel.set('domNodes', snap.domNodes);
    panel.set('heapMB', snap.heapMB ?? 'n/a');
    panel.set('error', snap.error);
    return snap;
  };

  // Published before the long work starts so an agent can poll `data-state`
  // and read partial numbers while a tier is still building.
  window.__dtPerf = {
    snapshot,
    refresh: render,
    marks: allMarks,
    resetQueryStats: () => table?.bridge.__resetStatsForTests(),
    oracle: new Function(ORACLE_FN_SOURCE)() as PerfApi['oracle'],
    table: null,
  };

  try {
    setState('generating');
    // Timed separately from `genMs`: spawning the worker and instantiating
    // DuckDB WASM is ~1 s that has nothing to do with the tier's size, and
    // folding it into generation would make every baseline's genMs a
    // measure of two unrelated things.
    const bootStart = performance.now();
    table = await createDataTable({
      container,
      // A restored session would quietly make this a different experiment,
      // and the tiers are far too large to snapshot into IndexedDB.
      persistence: false,
      visualizations: viz,
      presets: false,
      undoRedo: true,
      expressionFilter: false,
    });
    window.__dtPerf.table = table;
    bootMs = performance.now() - bootStart;

    if (mode === 'sql') {
      const t0 = performance.now();
      await table.bridge.query(targetCopySQL(spec, TARGET_FILE));
      // The `COPY` alone, not the probes that follow it: at 5 × 10⁹ cells
      // this is the whole cost, and a baseline that folded three cheap
      // `read_parquet` queries into it would drift for no reason.
      genMs = performance.now() - t0;
      probe = await probeTargetFile(table, spec);
    } else if (tier === 'wide-csv') {
      const t0 = performance.now();
      const csv = tierCSV(spec);
      genMs = performance.now() - t0;
      setState('loading');
      const t1 = performance.now();
      await table.loadData(csv, { sourceFormat: 'csv' });
      loadMs = performance.now() - t1;
    } else {
      setState('exporting');
      const t0 = performance.now();
      // Streamed straight from `range()` into the parquet writer:
      // `exportToBuffer` wraps this in `COPY (…) TO parquet`, so the tier
      // never exists as a table. Materializing it first — as this did
      // originally — leaves the whole tier resident while the writer needs
      // room of its own, which is what put WIDE and GRID over
      // DuckDB-WASM's ~3 GB ceiling.
      const buf = await table.bridge.exportToBuffer(tierSelectSQL(spec), 'parquet');
      genMs = performance.now() - t0;

      setState('loading');
      const t2 = performance.now();
      await table.loadData(buf.buffer as ArrayBuffer, { sourceFormat: 'parquet' });
      loadMs = performance.now() - t2;
    }

    setState('ready');
  } catch (err) {
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    setState('error');
  }

  render();
  return table;
}

/**
 * `mode=sql`: read the streamed TARGET parquet file back through
 * `read_parquet` without ever materializing a table. Until Phase 10, the
 * table area stays empty — this is a probe, not a load.
 *
 * The `COPY` that writes the file is timed by the caller, so `genMs`
 * measures the write and nothing else.
 */
async function probeTargetFile(table: DataTable, spec: TierSpec): Promise<PerfSnapshot['probe']> {
  const file = TARGET_FILE;

  const [counted] = await table.bridge.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM read_parquet('${file}')`,
  );
  const described = await table.bridge.query<Record<string, unknown>>(
    `DESCRIBE SELECT * FROM read_parquet('${file}')`,
  );
  // A deep window: the last 128 rows of a 5,000,000-row file, projected to
  // the oracle-checkable probe columns.
  const deepFrom = Math.max(0, spec.rows - 1000);
  const sample = await table.bridge.query<Record<string, unknown>>(
    `SELECT "${columnName(0)}", "${columnName(10)}", "${columnName(12)}" ` +
      `FROM read_parquet('${file}') ` +
      `WHERE "${columnName(0)}" >= ${deepFrom} ORDER BY "${columnName(0)}" LIMIT 128`,
  );

  return { rowCount: Number(counted?.n ?? 0), colCount: described.length, sample };
}

/** Tier names accepted by `?gen=`, for the demo's error message. */
export const PERF_TIER_NAMES = [...Object.keys(TIERS), 'custom'];
