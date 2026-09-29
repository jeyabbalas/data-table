import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataLoader } from '@/data/DataLoader';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { LoadError } from '@/core/errors';

describe('DataLoader', () => {
  // Create a mock bridge for testing format detection methods
  const mockBridge = {} as WorkerBridge;

  describe('detectFormatFromFile', () => {
    it('should detect CSV from file extension', () => {
      const mockFile = new File([''], 'data.csv', { type: 'text/csv' });
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('csv');
    });

    it('should detect JSON from file extension', () => {
      const mockFile = new File([''], 'data.json', {
        type: 'application/json',
      });
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('json');
    });

    it('should detect Parquet from file extension', () => {
      const mockFile = new File([''], 'data.parquet');
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('parquet');
    });

    it('should default to CSV for unknown extension', () => {
      const mockFile = new File([''], 'data.txt');
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('csv');
    });

    it('should handle uppercase extensions', () => {
      const mockFile = new File([''], 'DATA.JSON');
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('json');
    });
  });

  describe('detectFormatFromURL', () => {
    it('should detect CSV from URL path', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromURL('https://example.com/data.csv')).toBe('csv');
    });

    it('should detect JSON from URL path', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromURL('https://example.com/data.json')).toBe('json');
    });

    it('should detect Parquet from URL path', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromURL('https://example.com/data.parquet')).toBe('parquet');
    });

    it('should handle URLs with query parameters', () => {
      const loader = new DataLoader(mockBridge);
      // URL.pathname correctly excludes query string
      expect(loader.detectFormatFromURL('https://example.com/path/file.json?token=abc')).toBe(
        'json',
      );
    });

    it('should handle raw GitHub URLs', () => {
      const loader = new DataLoader(mockBridge);
      expect(
        loader.detectFormatFromURL('https://raw.githubusercontent.com/user/repo/main/data.csv'),
      ).toBe('csv');
    });
  });

  describe('detectFormatFromContent', () => {
    it('should detect JSON array from content', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('[{"a": 1}]')).toBe('json');
    });

    it('should detect JSON object from content', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('{"a": 1}')).toBe('json');
    });

    it('should detect JSON with leading whitespace', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('  \n[{"a": 1}]')).toBe('json');
    });

    it('should detect CSV from content', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('a,b,c\n1,2,3')).toBe('csv');
    });

    it('should detect Parquet from ArrayBuffer', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent(new ArrayBuffer(10))).toBe('parquet');
    });

    it('should default to CSV for non-JSON text', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('some random text')).toBe('csv');
    });
  });

  describe('classifyStringSource', () => {
    const loader = new DataLoader(mockBridge);

    it.each([
      ['http URL', 'http://example.com/data.csv'],
      ['https URL', 'https://example.com/data.csv'],
      ['file URL', 'file:///tmp/data.csv'],
      ['data URL', 'data:text/csv,a,b\n1,2'],
      ['blob URL', 'blob:https://example.com/abc-123'],
      ['protocol-relative', '//cdn.example.com/data.csv'],
      ['root-relative path', '/sample.csv'],
      ['root-relative nested path', '/data/trips.csv'],
      ['./ relative path', './sample.csv'],
      ['../ relative path', '../parent/data.csv'],
    ])('classifies %s as "url"', (_label, source) => {
      expect(loader.classifyStringSource(source)).toBe('url');
    });

    it.each([
      ['multi-line CSV', 'a,b,c\n1,2,3'],
      ['multi-line CSV with CRLF', 'a,b\r\n1,2'],
      ['JSON array', '[{"a": 1}]'],
      ['JSON object', '{"a": 1}'],
      ['JSON with leading whitespace', '  \n[{"a": 1}]'],
    ])('classifies %s as "inline"', (_label, source) => {
      expect(loader.classifyStringSource(source)).toBe('inline');
    });

    it.each([
      ['bare filename', 'sample.csv'],
      ['filename without extension', 'sample'],
      ['unprefixed path-like string', 'data/sample.csv'],
      ['empty-ish string', 'foo'],
    ])('classifies %s as "ambiguous"', (_label, source) => {
      expect(loader.classifyStringSource(source)).toBe('ambiguous');
    });
  });

  describe('resolveUrlSource', () => {
    const loader = new DataLoader(mockBridge);
    const ORIGINAL_WINDOW = (globalThis as { window?: unknown }).window;

    beforeEach(() => {
      // Stub a minimal window.location for non-browser test environment.
      (globalThis as { window?: unknown }).window = {
        location: { href: 'https://app.example.com/dashboard/' },
      };
    });

    afterEach(() => {
      if (ORIGINAL_WINDOW === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = ORIGINAL_WINDOW;
      }
    });

    it('passes absolute http URLs through unchanged', () => {
      expect(loader.resolveUrlSource('https://example.com/data.csv')).toBe(
        'https://example.com/data.csv',
      );
    });

    it('passes data: URLs through unchanged', () => {
      expect(loader.resolveUrlSource('data:text/csv,a,b\n1,2')).toBe('data:text/csv,a,b\n1,2');
    });

    it('resolves root-relative paths against window.location origin', () => {
      expect(loader.resolveUrlSource('/sample.csv')).toBe('https://app.example.com/sample.csv');
    });

    it('resolves ./ paths against window.location pathname', () => {
      expect(loader.resolveUrlSource('./sample.csv')).toBe(
        'https://app.example.com/dashboard/sample.csv',
      );
    });

    it('resolves protocol-relative URLs against the page protocol', () => {
      expect(loader.resolveUrlSource('//cdn.example.com/data.csv')).toBe(
        'https://cdn.example.com/data.csv',
      );
    });
  });

  describe('load() URL handling', () => {
    const ORIGINAL_WINDOW = (globalThis as { window?: unknown }).window;
    const ORIGINAL_FETCH = globalThis.fetch;

    beforeEach(() => {
      (globalThis as { window?: unknown }).window = {
        location: { href: 'https://app.example.com/index.html' },
      };
    });

    afterEach(() => {
      if (ORIGINAL_WINDOW === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = ORIGINAL_WINDOW;
      }
      globalThis.fetch = ORIGINAL_FETCH;
    });

    it('throws LoadError with code SOURCE_AMBIGUOUS for "/sample.csv"-style strings missing leading slash', async () => {
      const bridge = { loadData: vi.fn() } as unknown as WorkerBridge;
      const loader = new DataLoader(bridge);

      await expect(loader.load('sample.csv')).rejects.toMatchObject({
        constructor: LoadError,
        code: 'SOURCE_AMBIGUOUS',
      });
    });

    it('resolves and fetches root-relative URLs against window.location', async () => {
      const fetchSpy = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('a,b\n1,2', { status: 200 }));
      globalThis.fetch = fetchSpy;
      const bridge = {
        loadData: vi.fn().mockResolvedValue({
          tableName: 't',
          rowCount: 1,
          columns: ['a', 'b'],
          schema: [],
        }),
      } as unknown as WorkerBridge;
      const loader = new DataLoader(bridge);

      await loader.load('/sample.csv');

      expect(fetchSpy).toHaveBeenCalledWith('https://app.example.com/sample.csv');
    });

    it('still treats multi-line strings as inline content', async () => {
      const bridge = {
        loadData: vi.fn().mockResolvedValue({
          tableName: 't',
          rowCount: 1,
          columns: ['a', 'b'],
          schema: [],
        }),
      } as unknown as WorkerBridge;
      const loader = new DataLoader(bridge);

      const result = await loader.load('a,b\n1,2');

      // Inline content path: bridge.loadData receives the literal string,
      // not a URL fetch result.
      expect(bridge.loadData).toHaveBeenCalledWith(
        'a,b\n1,2',
        expect.objectContaining({ format: 'csv' }),
      );
      expect(result.tableName).toBe('t');
    });
  });

  describe('load() source handoff', () => {
    const ORIGINAL_FETCH = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = ORIGINAL_FETCH;
    });

    function recordingBridge() {
      const loadData = vi.fn().mockResolvedValue({
        tableName: 't',
        rowCount: 0,
        columns: [],
        schema: [],
      });
      return { bridge: { loadData } as unknown as WorkerBridge, loadData };
    }

    // DuckDB reads a Blob from disk as it loads; reading the file into an
    // ArrayBuffer first would hold all of it in memory next to the table.
    it('hands a Parquet File to the worker without reading it', async () => {
      const { bridge, loadData } = recordingBridge();
      const file = new File([new Uint8Array([1, 2, 3])], 'data.parquet');
      const read = vi.spyOn(file, 'arrayBuffer');

      await new DataLoader(bridge).load(file);

      expect(loadData).toHaveBeenCalledWith(file, expect.objectContaining({ format: 'parquet' }));
      expect(read).not.toHaveBeenCalled();
    });

    it('hands an unnamed Blob over as Parquet', async () => {
      const { bridge, loadData } = recordingBridge();
      const blob = new Blob([new Uint8Array([1, 2, 3])]);

      await new DataLoader(bridge).load(blob);

      expect(loadData).toHaveBeenCalledWith(blob, expect.objectContaining({ format: 'parquet' }));
    });

    it('still reads CSV and JSON sources on the main thread', async () => {
      const { bridge, loadData } = recordingBridge();
      const loader = new DataLoader(bridge);

      await loader.load(new File(['a,b\n1,2'], 'data.csv'));
      await loader.load(new Blob(['[{"a":1}]']), { format: 'json' });

      expect(loadData).toHaveBeenNthCalledWith(
        1,
        'a,b\n1,2',
        expect.objectContaining({ format: 'csv' }),
      );
      const [jsonSource] = loadData.mock.calls[1]!;
      expect(jsonSource).toBeInstanceOf(ArrayBuffer);
    });

    it('fetches a Parquet URL as a Blob', async () => {
      globalThis.fetch = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
      const { bridge, loadData } = recordingBridge();

      await new DataLoader(bridge).load('https://example.com/data.parquet');

      const [source, options] = loadData.mock.calls[0]!;
      expect(source).toBeInstanceOf(Blob);
      expect((source as Blob).size).toBe(3);
      expect(options).toMatchObject({ format: 'parquet' });
    });
  });

  describe('load() source options', () => {
    const ORIGINAL_FETCH = globalThis.fetch;
    const SOURCE_OPTIONS = {
      timezone: 'Asia/Tokyo',
      csv: { delimiter: ';', header: false },
      json: { format: 'ndjson' as const },
      parquet: { columns: ['a'] },
    };

    afterEach(() => {
      globalThis.fetch = ORIGINAL_FETCH;
    });

    function recordingBridge() {
      const loadData = vi.fn().mockResolvedValue({
        tableName: 't',
        rowCount: 0,
        columns: [],
        schema: [],
      });
      return { bridge: { loadData } as unknown as WorkerBridge, loadData };
    }

    it.each<[string, () => File | Blob | string | ArrayBuffer]>([
      ['a CSV File', () => new File(['a;b\n1;2'], 'data.csv')],
      ['a Parquet File', () => new File([new Uint8Array([1])], 'data.parquet')],
      ['a Blob', () => new Blob([new Uint8Array([1])])],
      ['an ArrayBuffer', () => new ArrayBuffer(4)],
      ['inline text', () => 'a;b\n1;2'],
      ['a URL', () => 'https://example.com/data.parquet'],
    ])('hands the options to the bridge for %s', async (_label, source) => {
      globalThis.fetch = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
      const { bridge, loadData } = recordingBridge();

      await new DataLoader(bridge).load(source(), {
        tableName: 'people',
        sourceOptions: SOURCE_OPTIONS,
      });

      expect(loadData).toHaveBeenCalledTimes(1);
      expect(loadData.mock.calls[0]![1]).toMatchObject({
        tableName: 'people',
        ...SOURCE_OPTIONS,
      });
    });

    it('hands the bridge the progress callback, and none when there is none', async () => {
      const { bridge, loadData } = recordingBridge();
      const loader = new DataLoader(bridge);
      const onProgress = vi.fn();

      await loader.load('a,b\n1,2', { onProgress });
      await loader.load('a,b\n1,2');

      expect(loadData.mock.calls[0]).toHaveLength(3);
      expect(loadData.mock.calls[0]![2]).toBe(onProgress);
      expect(loadData.mock.calls[1]).toHaveLength(2);
    });

    it('rejects invalid options before reading or fetching the source', async () => {
      const fetchSpy = vi.fn<typeof fetch>();
      globalThis.fetch = fetchSpy;
      const { bridge, loadData } = recordingBridge();
      const loader = new DataLoader(bridge);
      const file = new File(['a,b\n1,2'], 'data.csv');
      const read = vi.spyOn(file, 'text');

      await expect(
        loader.load(file, { sourceOptions: { csv: { delimiter: 'ab' } } }),
      ).rejects.toMatchObject({
        constructor: LoadError,
        code: 'LOAD_INVALID_OPTIONS',
        details: { option: 'csv.delimiter' },
      });
      await expect(
        loader.load('https://example.com/data.csv', { sourceOptions: { timezone: 'x y' } }),
      ).rejects.toMatchObject({ code: 'LOAD_INVALID_TIMEZONE' });

      expect(read).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(loadData).not.toHaveBeenCalled();
    });
  });
});
