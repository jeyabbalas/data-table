/**
 * Unified data loader with format detection
 */

import type { WorkerBridge } from './WorkerBridge';
import type { ColumnSchema } from '../core/types';

export type DataFormat = 'csv' | 'json' | 'parquet';

export interface LoadResult {
  tableName: string;
  rowCount: number;
  columns: string[];
  schema: ColumnSchema[];
}

export interface DataLoaderOptions {
  tableName?: string;
  format?: DataFormat; // Override auto-detection
}

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
    options: DataLoaderOptions = {}
  ): Promise<LoadResult> {
    let data: ArrayBuffer | string;
    let format: DataFormat;

    if (source instanceof File) {
      // File upload
      format = options.format || this.detectFormatFromFile(source);
      data =
        format === 'parquet'
          ? await source.arrayBuffer()
          : await source.text();
    } else if (typeof source === 'string' && source.startsWith('http')) {
      // URL fetch
      format = options.format || this.detectFormatFromURL(source);
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }
      data =
        format === 'parquet'
          ? await response.arrayBuffer()
          : await response.text();
    } else {
      // Raw data (string or ArrayBuffer)
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
