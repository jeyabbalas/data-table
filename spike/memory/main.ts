/**
 * Memory-envelope spike: how large a Parquet source can DuckDB-WASM hold,
 * and how fast does it answer the queries the table issues, under three
 * load strategies?
 *
 *   buffer  File → ArrayBuffer → registerFileBuffer → CREATE TABLE AS (today's path)
 *   handle  registerFileHandle (lazy reads from disk) → CREATE TABLE AS
 *   view    registerFileHandle → CREATE VIEW over read_parquet(file_row_number)
 *   handle-buffered  as `handle`, but registered with directIO = false
 *
 * Peak memory is the size of DuckDB's WebAssembly.Memory. Linear memory only
 * ever grows, so its size after a step is that step's high-water mark — the
 * number the 4 GiB wasm32 ceiling applies to. DuckDB does not expose it, so
 * its worker is wrapped: the wrapper captures the Memory when it is created
 * and answers a size query on a private MessageChannel DuckDB never sees.
 *
 * Driven by run.spec.ts through `window.spike.run(config)`.
 */
import * as duckdb from '@duckdb/duckdb-wasm';
import ehWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

type Strategy = 'buffer' | 'handle' | 'handle-buffered' | 'view';

interface RunConfig {
  strategy: Strategy;
  /** DuckDB `memory_limit`; omitted leaves DuckDB's default (what main ships). */
  memoryLimit?: string;
  interactions?: boolean;
  timeoutMs?: number;
}

interface Timed {
  ms: number;
  rows?: number;
  wasmMiB: number | null;
  error?: string;
}

interface RunResult {
  config: RunConfig;
  file: { name: string; mib: number };
  ok: boolean;
  failedAt?: string;
  error?: string;
  workerError?: string;
  memoryLimit?: string;
  rows?: number;
  cols?: number;
  rowGroups?: number;
  wasmMiB: {
    boot: number | null;
    afterRegister?: number | null;
    afterLoad?: number | null;
    end?: number | null;
  };
  duckdbMiB?: { total: number; byTag: Record<string, number> };
  timings: Record<string, Timed>;
}

const MiB = 2 ** 20;
const round = (n: number) => Math.round(n * 10) / 10;

// DuckDB's Emscripten runtime creates its memory in JS
// (`new WebAssembly.Memory({ initial, maximum: 65536 })` — 65,536 pages is
// the 4 GiB ceiling) and imports it, so wrapping the constructor captures it.
// Scanning the import object instead is not safe: its `GOT.*` namespaces are
// Proxies that create symbol stubs on property access and break linking.
const WRAPPER_SOURCE = (duckdbWorkerUrl: string) => `
let memory = null;
const NativeMemory = WebAssembly.Memory;
function Memory(descriptor) {
  const m = new NativeMemory(descriptor);
  memory = m;
  return m;
}
Memory.prototype = NativeMemory.prototype;
WebAssembly.Memory = Memory;
self.addEventListener('message', (event) => {
  if (event.data && event.data.__memprobe) {
    event.stopImmediatePropagation();
    event.data.port.postMessage(memory ? memory.buffer.byteLength : null);
  }
});
importScripts(${JSON.stringify(duckdbWorkerUrl)});
`;

let worker: Worker;
let db: duckdb.AsyncDuckDB;
let conn: duckdb.AsyncDuckDBConnection;
let workerError: string | undefined;

function wasmMiB(): Promise<number | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 5_000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(typeof event.data === 'number' ? round(event.data / MiB) : null);
    };
    worker.postMessage({ __memprobe: true, port: channel.port2 }, [channel.port2]);
  });
}

async function boot(): Promise<void> {
  const absoluteWorkerUrl = new URL(ehWorkerUrl, location.href).href;
  const source = new URLSearchParams(location.search).has('nowrap')
    ? `importScripts(${JSON.stringify(absoluteWorkerUrl)});`
    : WRAPPER_SOURCE(absoluteWorkerUrl);
  worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  worker.addEventListener('error', (event) => {
    workerError = event.message || 'worker error';
  });
  db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(new URL(ehWasmUrl, location.href).href);
  await db.open({ query: { castDecimalToDouble: true } });
  conn = await db.connect();
}

async function rows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const table = await conn.query(sql);
  return table.toArray().map((r) => r.toJSON() as T);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms} ms: ${label}`)), ms),
    ),
  ]);
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Mirrors gen.py's 20-column type cycle. */
function kind(c: number): 'double' | 'int' | 'string' | 'timestamp' | 'bool' {
  const k = c % 20;
  if (k < 12) return 'double';
  if (k < 15) return 'int';
  if (k < 18) return 'string';
  return k === 18 ? 'timestamp' : 'bool';
}

async function run(config: RunConfig): Promise<RunResult> {
  const input = document.getElementById('file') as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) throw new Error('no file selected');
  const timeoutMs = config.timeoutMs ?? 15 * 60_000;

  const result: RunResult = {
    config,
    file: { name: file.name, mib: round(file.size / MiB) },
    ok: false,
    wasmMiB: { boot: await wasmMiB() },
    timings: {},
  };

  const step = async <T>(
    name: string,
    fn: () => Promise<T>,
    count?: (v: T) => number,
  ): Promise<T> => {
    const started = performance.now();
    try {
      const value = await withTimeout(fn(), timeoutMs, name);
      result.timings[name] = {
        ms: Math.round(performance.now() - started),
        wasmMiB: await wasmMiB(),
        ...(count ? { rows: count(value) } : {}),
      };
      return value;
    } catch (err) {
      result.timings[name] = {
        ms: Math.round(performance.now() - started),
        wasmMiB: await wasmMiB(),
        error: err instanceof Error ? err.message : String(err),
      };
      throw err;
    }
  };

  let phase = 'configure';
  try {
    if (config.memoryLimit) await rows(`SET memory_limit = '${config.memoryLimit}'`);
    result.memoryLimit = String(
      (await rows<{ m: string }>("SELECT current_setting('memory_limit') AS m"))[0]!.m,
    );

    phase = 'register';
    await step('register', async () => {
      if (config.strategy === 'buffer') {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await db.registerFileBuffer('src.parquet', bytes);
      } else {
        const directIO = config.strategy !== 'handle-buffered';
        await db.registerFileHandle(
          'src.parquet',
          file,
          duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
          directIO,
        );
      }
    });
    result.wasmMiB.afterRegister = await wasmMiB();

    phase = 'load';
    await step('load', async () => {
      if (config.strategy === 'view') {
        await conn.query(
          `CREATE VIEW t AS SELECT CAST(file_row_number AS BIGINT) AS "__rowid__", * EXCLUDE (file_row_number) ` +
            `FROM read_parquet('src.parquet', file_row_number = true)`,
        );
      } else {
        // The library's CTAS, verbatim in shape (src/worker/loaders/parquet.ts).
        await conn.query(
          `CREATE TABLE t AS SELECT CAST(row_number() OVER () - 1 AS BIGINT) AS "__rowid__", * FROM read_parquet('src.parquet')`,
        );
      }
    });
    if (config.strategy === 'buffer') await db.dropFile('src.parquet');
    result.wasmMiB.afterLoad = await wasmMiB();

    phase = 'describe';
    const count = await step('count', () => rows<{ n: bigint }>('SELECT COUNT(*) AS n FROM t'));
    result.rows = Number(count[0]!.n);
    const columns = (await rows<{ column_name: string }>('DESCRIBE t'))
      .map((r) => r.column_name)
      .filter((c) => c !== '__rowid__');
    result.cols = columns.length;
    result.rowGroups = Number(
      (
        await rows<{ n: bigint }>(
          "SELECT COUNT(DISTINCT row_group_id) AS n FROM parquet_metadata('src.parquet')",
        ).catch(() => [{ n: -1n }])
      )[0]!.n,
    );
    const mem = await rows<{ tag: string; b: bigint }>(
      'SELECT tag, memory_usage_bytes AS b FROM duckdb_memory() WHERE memory_usage_bytes > 0',
    );
    result.duckdbMiB = {
      total: round(mem.reduce((s, r) => s + Number(r.b), 0) / MiB),
      byTag: Object.fromEntries(mem.map((r) => [r.tag, round(Number(r.b) / MiB)])),
    };

    if (config.interactions !== false) {
      phase = 'interactions';
      // A 40-column window from the middle of the table, as the grid would show.
      const start = Math.max(0, Math.floor(columns.length / 2) - 20);
      const indexOf = (name: string) => Number(name.replace('col_', ''));
      const win = columns.slice(start, start + 40);
      const pick = (k: ReturnType<typeof kind>, nth = 0) =>
        win.filter((c) => kind(indexOf(c)) === k)[nth]!;
      const sortCol = pick('double', 0);
      const filterCol = pick('double', 1);
      const histCol = pick('double', 2);
      const catCol = pick('string', 1);
      const projection = ['"__rowid__"', ...win.map(q)].join(', ');
      const n = result.rows;
      const mid = Math.floor(n / 2);
      const filter = `${q(filterCol)} BETWEEN 200 AND 500`;
      const len = (r: unknown[]) => r.length;
      const probe = <T>(name: string, fn: () => Promise<T>, count?: (v: T) => number) =>
        step(name, fn, count).catch(() => undefined);

      await probe(
        'firstBlock',
        () => rows(`SELECT ${projection} FROM t WHERE "__rowid__" >= 0 AND "__rowid__" < 128`),
        len,
      );
      await probe(
        'midBlock',
        () =>
          rows(
            `SELECT ${projection} FROM t WHERE "__rowid__" >= ${mid} AND "__rowid__" < ${mid + 128}`,
          ),
        len,
      );
      const keyedSortedBlock = async (offset: number) => {
        const ids = await rows<{ id: bigint }>(
          `SELECT "__rowid__" AS id FROM t ORDER BY ${q(sortCol)}, "__rowid__" LIMIT 128 OFFSET ${offset}`,
        );
        const list = ids.map((r) => String(r.id)).join(', ');
        return list ? rows(`SELECT ${projection} FROM t WHERE "__rowid__" IN (${list})`) : [];
      };
      await probe('keyedSortedMidBlock', () => keyedSortedBlock(mid), len);
      await probe(
        'sortedFirstBlock',
        () => rows(`SELECT ${projection} FROM t ORDER BY ${q(sortCol)}, "__rowid__" LIMIT 128`),
        len,
      );
      await probe(
        'sortedMidBlock',
        () =>
          rows(
            `SELECT ${projection} FROM t ORDER BY ${q(sortCol)}, "__rowid__" LIMIT 128 OFFSET ${mid}`,
          ),
        len,
      );
      await probe('filterCount', () => rows(`SELECT COUNT(*) AS n FROM t WHERE ${filter}`), len);
      const histogram = async (where: string) => {
        const [s] = await rows<{ lo: number; hi: number }>(
          `SELECT MIN(${q(histCol)}) AS lo, MAX(${q(histCol)}) AS hi, COUNT(${q(histCol)}) AS n, approx_count_distinct(${q(histCol)}) AS d FROM t ${where}`,
        );
        const width = (Number(s!.hi) - Number(s!.lo)) / 30 || 1;
        return rows(
          `SELECT LEAST(FLOOR((${q(histCol)} - ${Number(s!.lo)}) / ${width}), 29) AS b, COUNT(*) AS n FROM t ` +
            `${where ? `${where} AND` : 'WHERE'} ${q(histCol)} IS NOT NULL GROUP BY b`,
        );
      };
      await probe('histogram', () => histogram(''), len);
      await probe('filteredHistogram', () => histogram(`WHERE ${filter}`), len);
      await probe(
        'valueCounts',
        () =>
          rows(
            `SELECT ${q(catCol)} AS v, COUNT(*) AS n FROM t GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
          ),
        len,
      );
      await probe(
        'filteredValueCounts',
        () =>
          rows(
            `SELECT ${q(catCol)} AS v, COUNT(*) AS n FROM t WHERE ${filter} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
          ),
        len,
      );
    }
    result.ok = true;
  } catch (err) {
    result.failedAt = phase;
    result.error = err instanceof Error ? err.message : String(err);
  }
  result.wasmMiB.end = await wasmMiB();
  if (workerError) result.workerError = workerError;
  return result;
}

declare global {
  interface Window {
    spike: { ready: boolean; run: (config: RunConfig) => Promise<RunResult> };
  }
}

window.spike = { ready: false, run };
boot().then(
  () => {
    window.spike.ready = true;
    document.getElementById('status')!.textContent = 'ready';
  },
  (err: unknown) => {
    document.getElementById('status')!.textContent = `boot failed: ${String(err)}`;
  },
);
