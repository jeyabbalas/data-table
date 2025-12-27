/**
 * Unified data loader with format detection
 */

import type { WorkerBridge } from './WorkerBridge';

export type DataFormat = 'csv' | 'json' | 'parquet';

export interface LoadResult {
  tableName: string;
  rowCount: number;
  columns: string[];
}

export interface DataLoaderOptions {
  tableName?: string;
  format?: DataFormat; // Override auto-detection
}

export class DataLoader {
  constructor(private bridge: WorkerBridge) {}

  /**
   * Load data from File, URL, or raw data
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

    await this.bridge.loadData(data, {
      format,
      tableName: options.tableName,
    });

    // Query metadata
    const tableName = options.tableName || 'loaded_data';
    const countResult = await this.bridge.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );
    const columnsResult = await this.bridge.query<{
      column_name: string;
      data_type: string;
    }>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}'`
    );

    return {
      tableName,
      rowCount: countResult[0]?.count || 0,
      columns: columnsResult.map((r) => r.column_name),
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
