/**
 * Unified data loader with format detection
 */

import { LoadError } from '../core/errors';
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

export class DataLoader {
  constructor(private bridge: WorkerBridge) {}

  /**
   * Load data from File, URL, or raw data
   *
   * All metadata (row count, schema) is retrieved in the worker to avoid
   * blocking the main thread with sequential queries.
   */
  async load(
    source: File | string | ArrayBuffer,
    options: DataLoaderOptions = {},
  ): Promise<LoadResult> {
    let data: ArrayBuffer | string;
    let format: DataFormat;

    if (source instanceof File) {
      // File upload
      format = options.format || this.detectFormatFromFile(source);
      data = format === 'parquet' ? await source.arrayBuffer() : await source.text();
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
        data = format === 'parquet' ? await response.arrayBuffer() : await response.text();
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
        // inline raw data (multi-line CSV, JSON, etc.)
        format = options.format || this.detectFormatFromContent(source);
        data = source;
      }
    } else {
      // ArrayBuffer (binary inline data, typically Parquet)
      format = options.format || this.detectFormatFromContent(source);
      data = source;
    }

    // Load data and get metadata in a single worker call
    // No more blocking queries on the main thread!
    const result = await this.bridge.loadData(data, {
      format,
      tableName: options.tableName,
    });

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
