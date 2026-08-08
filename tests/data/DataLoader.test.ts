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

      // Inline content path: the string is the data, not a URL to fetch. It
      // reaches the bridge as its UTF-8 bytes — see the normalization suite
      // below for why.
      expect(bridge.loadData).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        expect.objectContaining({ format: 'csv' }),
      );
      const sent = (bridge.loadData as unknown as { mock: { calls: [ArrayBuffer][] } }).mock
        .calls[0]![0];
      expect(new TextDecoder().decode(sent)).toBe('a,b\n1,2');
      expect(result.tableName).toBe('t');
    });
  });

  /**
   * Phase 1 — every source is normalized to bytes so the worker call can
   * *transfer* rather than clone it. What is asserted here is the payload the
   * bridge is handed; the transfer itself belongs to `WorkerBridge`, and real
   * detachment is only observable against a real `Worker` (see
   * `tests/browser/`).
   *
   * The interesting cases are all the ones where `.text()` used to do
   * something besides decode.
   */
  describe('load() source normalization', () => {
    const ORIGINAL_FETCH = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = ORIGINAL_FETCH;
    });

    function makeBridge(): WorkerBridge {
      return {
        loadData: vi.fn().mockResolvedValue({
          tableName: 't',
          rowCount: 1,
          columns: ['a'],
          schema: [],
        }),
      } as unknown as WorkerBridge;
    }

    /** What the bridge actually received as `data`. */
    function payloadOf(bridge: WorkerBridge): ArrayBuffer | string {
      const mock = bridge.loadData as unknown as { mock: { calls: [ArrayBuffer | string][] } };
      return mock.mock.calls[0]![0];
    }

    function textOf(payload: ArrayBuffer | string): string {
      return typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
    }

    it('sends a File as bytes rather than decoded text', async () => {
      const bridge = makeBridge();
      const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });

      await new DataLoader(bridge).load(file);

      const payload = payloadOf(bridge);
      expect(payload).toBeInstanceOf(ArrayBuffer);
      expect(textOf(payload)).toBe('a,b\n1,2');
    });

    it('strips a UTF-8 BOM, which .text() used to swallow', async () => {
      const bridge = makeBridge();
      // read_json_auto rejects a leading BOM outright, so this is not
      // cosmetic — forwarding the raw bytes would break BOM'd JSON.
      const file = new File([new Uint8Array([0xef, 0xbb, 0xbf]), 'a,b\n1,2'], 'data.csv');

      await new DataLoader(bridge).load(file);

      const payload = payloadOf(bridge);
      expect(payload).toBeInstanceOf(ArrayBuffer);
      expect(textOf(payload)).toBe('a,b\n1,2');
    });

    /** BOM-prefixed UTF-16 bytes for `text`. */
    function utf16(text: string, endian: 'le' | 'be'): Uint8Array {
      const out = new Uint8Array(2 + text.length * 2);
      out.set(endian === 'le' ? [0xff, 0xfe] : [0xfe, 0xff]);
      const view = new DataView(out.buffer);
      for (let i = 0; i < text.length; i++) {
        view.setUint16(2 + i * 2, text.charCodeAt(i), endian === 'le');
      }
      return out;
    }

    // The byte path is a UTF-8 path — DuckDB's readers have no other mode.
    // UTF-16 keeps the decode-and-copy route it always had.
    it.each(['le', 'be'] as const)('decodes UTF-16%s rather than forwarding it', async (endian) => {
      const bridge = makeBridge();
      const file = new File([utf16('a,b\n1,2', endian)], 'data.csv');

      await new DataLoader(bridge).load(file);

      expect(payloadOf(bridge)).toBe('a,b\n1,2');
    });

    it('takes the byte path for a fetched source regardless of declared charset', async () => {
      // `Response.text()` is defined as UTF-8 decode and ignores the
      // `charset` parameter, so there is nothing here for the byte path to
      // lose — a declared `iso-8859-1` body was already being mangled.
      for (const contentType of ['text/csv; charset=utf-8', 'text/csv; charset=iso-8859-1']) {
        globalThis.fetch = vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response('a,b\n1,2', { status: 200, headers: { 'content-type': contentType } }),
          );
        const bridge = makeBridge();

        await new DataLoader(bridge).load('https://example.com/data.csv');

        expect(payloadOf(bridge), contentType).toBeInstanceOf(ArrayBuffer);
        expect(textOf(payloadOf(bridge))).toBe('a,b\n1,2');
      }
    });

    it('forwards invalid UTF-8 intact instead of substituting U+FFFD', async () => {
      const bridge = makeBridge();
      // 0xE9 is é in latin-1 and an invalid UTF-8 sequence. `.text()` turned
      // it into a replacement character and DuckDB loaded the mojibake; the
      // bytes now reach the reader, which rejects them.
      const file = new File([new Uint8Array([0x61, 0x0a, 0xe9])], 'data.csv');

      await new DataLoader(bridge).load(file);

      expect(new Uint8Array(payloadOf(bridge) as ArrayBuffer)).toEqual(
        new Uint8Array([0x61, 0x0a, 0xe9]),
      );
    });

    it('passes a caller-supplied ArrayBuffer straight through', async () => {
      const bridge = makeBridge();
      const source = new Uint8Array([1, 2, 3]).buffer;

      await new DataLoader(bridge).load(source);

      expect(payloadOf(bridge)).toBe(source);
    });
  });
});
