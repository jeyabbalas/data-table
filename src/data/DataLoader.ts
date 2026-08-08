/**
 * Unified data loader with format detection
 */

import { LoadError } from '../core/errors';
import type { ProgressCallback } from '../core/Progress';
import type { ColumnSchema } from '../core/types';
import type { WorkerBridge } from './WorkerBridge';

/** Recognized data formats for {@link createDataTable}'s `source` argument. */
export type DataFormat = 'csv' | 'json' | 'parquet';

/**
 * Outcome of a successful `DataLoader.load`: the DuckDB table name the
 * data landed in, the row count, the column-name list, and the resolved
 * schema. Surfaced on the `loadComplete` event payload.
 */
export interface LoadResult {
  tableName: string;
  rowCount: number;
  columns: string[];
  schema: ColumnSchema[];
}

export interface DataLoaderOptions {
  tableName?: string | undefined;
  format?: DataFormat | undefined; // Override auto-detection
}

/**
 * Matches strings that should be treated as URLs / paths to fetch. Accepts:
 *   - Absolute URLs:           http://…, https://…, file:…, data:…, blob:…
 *   - Protocol-relative:       //host/path
 *   - Root-relative paths:     /path/to/file
 *   - Dot-prefixed relatives:  ./file or ../file
 * Anything else (including plain `data.csv`) is either inline content or
 * ambiguous and is rejected loudly — see {@link DataLoader.classifyStringSource}.
 */
const URL_LIKE_RE = /^([a-z][a-z0-9+.-]*:|\/\/|\/|\.\.?\/)/i;

/**
 * Percent the main thread's `reading` stage spans.
 *
 * Getting the bytes is the only part of a load that happens before the
 * worker is involved, and the only part that is genuinely cancelable — no
 * DuckDB statement is running yet. The worker picks up from here; its bands
 * live in `worker/loaders/common.ts`.
 */
const READING_BAND_END = 15;

/**
 * Report `reading` progress. `total` is the source's real byte size where it
 * is known up front (`File.size`, `Content-Length`, `ArrayBuffer.byteLength`)
 * and the running count once the source has been read.
 */
function emitReading(
  onProgress: ProgressCallback | undefined,
  loaded: number,
  total: number | undefined,
): void {
  if (!onProgress) return;
  // A `Content-Length` under `Content-Encoding: gzip` counts compressed
  // bytes while the stream delivers decompressed ones, so `loaded` can pass
  // `total`. Clamping is cheaper and more robust than trying to detect it.
  const percent =
    total !== undefined && total > 0
      ? Math.min(READING_BAND_END, Math.round((READING_BAND_END * loaded) / total))
      : 0;
  onProgress({
    stage: 'reading',
    percent,
    loaded,
    ...(total === undefined ? {} : { total }),
    cancelable: true,
  });
}

/**
 * Read a response body, reporting bytes as they arrive.
 *
 * Streaming is what makes the `reading` band worth having: a large download
 * is where a progress bar earns its keep, and `Response.arrayBuffer()`
 * reports nothing until it is finished. Without a subscriber there is
 * nothing to report to, so the plain path is taken instead.
 */
async function readResponseBytes(
  response: Response,
  onProgress: ProgressCallback | undefined,
): Promise<ArrayBuffer> {
  const declared = Number(response.headers.get('content-length'));
  const total = Number.isFinite(declared) && declared > 0 ? declared : undefined;
  emitReading(onProgress, 0, total);

  const body = response.body;
  if (!onProgress || !body) {
    const bytes = await response.arrayBuffer();
    emitReading(onProgress, bytes.byteLength, bytes.byteLength);
    return bytes;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    emitReading(onProgress, loaded, total);
  }
  // Close the band on the count actually received, which is authoritative
  // where `Content-Length` was not.
  emitReading(onProgress, loaded, loaded);

  if (chunks.length === 1) return toArrayBuffer(chunks[0]!);
  const joined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer as ArrayBuffer;
}

/** Exact-fit `ArrayBuffer` for a view, without copying when it already is one. */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = view;
  return byteOffset === 0 && byteLength === buffer.byteLength
    ? (buffer as ArrayBuffer)
    : (buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer);
}

/**
 * Prepare text-source bytes for the byte path, or bail out to a string.
 *
 * Text sources used to be read with `.text()` and shipped to the worker as a
 * JS string, which `postMessage` copies and the worker then re-encodes.
 * Bytes can be transferred instead, so the source arrives with no copy at
 * all. `Blob.text()` and `Response.text()` are both defined as *UTF-8 decode*
 * — neither honours a `charset` parameter — so the only two things they did
 * that the raw bytes do not are handled here:
 *
 * - **The UTF-8 BOM**, which UTF-8 decode strips. `read_csv_auto` tolerates a
 *   leading BOM but `read_json_auto` does not, so it is dropped here rather
 *   than left to the reader. This is the one case that still copies, and only
 *   past the first three bytes.
 * - **Invalid sequences**, which UTF-8 decode replaced with U+FFFD. Raw bytes
 *   reach DuckDB intact, so a mis-encoded source (latin-1 text served as
 *   UTF-8) now fails the load loudly instead of silently loading mojibake.
 *   Validating up front would mean a full scan of exactly the bytes this
 *   change exists to stop copying, so the error is the contract.
 *
 * UTF-16 is handled beyond what `.text()` managed: a BOM'd UTF-16 document
 * used to reach DuckDB as UTF-8-decoded garbage either way, and decoding it
 * properly here costs one branch on two bytes.
 *
 * @returns The buffer to transfer, or a decoded string for UTF-16 sources
 */
function prepareTextBytes(buffer: ArrayBuffer): ArrayBuffer | string {
  const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 3));
  if (head[0] === 0xff && head[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (head[0] === 0xfe && head[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
    return buffer.slice(3) as ArrayBuffer;
  }
  return buffer;
}

export class DataLoader {
  constructor(private bridge: WorkerBridge) {}

  /**
   * Load data from File, URL, or raw data
   *
   * All metadata (row count, schema) is retrieved in the worker to avoid
   * blocking the main thread with sequential queries.
   *
   * Every source is normalized to bytes and **transferred** to the worker
   * rather than copied. A caller-supplied `ArrayBuffer` is therefore detached
   * once the load starts and is unusable afterwards — pass `buffer.slice(0)`
   * to keep your own copy. Sources this method reads itself (a `File`, a
   * fetched URL, an inline string) produce a buffer nobody else holds, so
   * detaching it is unobservable.
   *
   * @param onProgress - Receives the `reading` stage from here and every
   *   later stage forwarded from the worker. Passing it also switches a URL
   *   source to a streaming read, since there is otherwise nothing to report
   *   byte counts to.
   */
  async load(
    source: File | string | ArrayBuffer,
    options: DataLoaderOptions = {},
    onProgress?: ProgressCallback,
  ): Promise<LoadResult> {
    let data: ArrayBuffer | string;
    let format: DataFormat;

    if (source instanceof File) {
      // File upload
      format = options.format || this.detectFormatFromFile(source);
      emitReading(onProgress, 0, source.size);
      const bytes = await source.arrayBuffer();
      emitReading(onProgress, bytes.byteLength, bytes.byteLength);
      data = format === 'parquet' ? bytes : prepareTextBytes(bytes);
    } else if (typeof source === 'string') {
      const kind = this.classifyStringSource(source);
      if (kind === 'url') {
        const resolved = this.resolveUrlSource(source);
        format = options.format || this.detectFormatFromURL(resolved);
        const response = await fetch(resolved);
        if (!response.ok) {
          throw new LoadError(`Failed to fetch URL: ${response.status} ${response.statusText}`, {
            code: 'FETCH_FAILED',
            details: {
              status: response.status,
              statusText: response.statusText,
              url: resolved,
            },
          });
        }
        const bytes = await readResponseBytes(response, onProgress);
        data = format === 'parquet' ? bytes : prepareTextBytes(bytes);
      } else if (kind === 'ambiguous') {
        const preview = source.length > 60 ? `${source.slice(0, 60)}…` : source;
        throw new LoadError(
          `Source string ${JSON.stringify(preview)} is ambiguous — it is neither a recognized URL ` +
            `(must start with "http://", "https://", "//", "/", "./", or "../") nor inline ` +
            `CSV/JSON/Parquet content (multi-line, or starting with "[" / "{"). ` +
            `If this is a path, prefix it with "/" or "./" so it resolves against window.location, ` +
            `or pass an absolute URL. If this is inline data, ensure it has the expected shape.`,
          {
            code: 'SOURCE_AMBIGUOUS',
            details: { source: source.slice(0, 200) },
          },
        );
      } else {
        // Inline raw data (multi-line CSV, JSON, etc.). Encoded here rather
        // than in the worker so the bytes can be transferred: a string
        // payload is copied by `postMessage` and then encoded on arrival,
        // which is two passes over the same content.
        format = options.format || this.detectFormatFromContent(source);
        data = toArrayBuffer(new TextEncoder().encode(source));
        // No latency to narrate for an in-memory source — one report, with
        // the real byte count, so the band still closes.
        emitReading(onProgress, data.byteLength, data.byteLength);
      }
    } else {
      // ArrayBuffer (binary inline data, typically Parquet)
      format = options.format || this.detectFormatFromContent(source);
      data = source;
      emitReading(onProgress, data.byteLength, data.byteLength);
    }

    // Load data and get metadata in a single worker call
    // No more blocking queries on the main thread!
    const result = await this.bridge.loadData(
      data,
      { format, tableName: options.tableName },
      onProgress,
    );

    return {
      tableName: result.tableName,
      rowCount: result.rowCount,
      columns: result.columns,
      schema: result.schema,
    };
  }

  /**
   * Decide whether a string source is a URL/path to fetch, inline data
   * to parse directly, or ambiguous (likely a typoed path that the
   * previous "starts with http" check silently treated as inline content).
   *
   * - **`'url'`** — anything matching {@link URL_LIKE_RE}.
   * - **`'inline'`** — multi-line text, or single-line text starting with
   *   a JSON delimiter (`[` / `{`), or any leading whitespace before such.
   * - **`'ambiguous'`** — a single-line string with no URL prefix and no
   *   JSON delimiter (e.g. `"sample.csv"`, `"foo"`). Throws `LoadError`
   *   with code `SOURCE_AMBIGUOUS` rather than letting DuckDB silently
   *   parse the literal text as a CSV header.
   */
  classifyStringSource(s: string): 'url' | 'inline' | 'ambiguous' {
    if (URL_LIKE_RE.test(s)) return 'url';
    if (s.includes('\n') || s.includes('\r')) return 'inline';
    const trimmed = s.trimStart();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'inline';
    return 'ambiguous';
  }

  /**
   * Resolve a URL-like string to an absolute URL. Absolute URLs (with a
   * scheme) pass through unchanged; protocol-relative, root-relative,
   * and dot-prefixed paths are anchored to `window.location.href` so
   * they behave like every other web API (`<img src>`, `fetch`).
   *
   * In non-browser environments (`window` undefined) we leave the URL
   * untouched — `fetch` itself will produce a clearer error than we can.
   */
  resolveUrlSource(s: string): string {
    // Already absolute (has a scheme like http:/https:/file:/data:/blob:).
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    if (typeof window !== 'undefined' && window.location?.href) {
      return new URL(s, window.location.href).href;
    }
    return s;
  }

  /**
   * Detect format from File
   */
  detectFormatFromFile(file: File): DataFormat {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return this.extToFormat(ext);
  }

  /**
   * Detect format from URL
   */
  detectFormatFromURL(url: string): DataFormat {
    const path = new URL(url).pathname;
    const ext = path.split('.').pop()?.toLowerCase();
    return this.extToFormat(ext);
  }

  /**
   * Detect format from content
   */
  detectFormatFromContent(data: string | ArrayBuffer): DataFormat {
    if (data instanceof ArrayBuffer) {
      return 'parquet'; // Binary data assumed to be parquet
    }
    const trimmed = data.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      return 'json';
    }
    return 'csv';
  }

  private extToFormat(ext?: string): DataFormat {
    switch (ext) {
      case 'json':
        return 'json';
      case 'parquet':
        return 'parquet';
      default:
        return 'csv';
    }
  }
}
