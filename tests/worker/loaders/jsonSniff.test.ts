/**
 * Unit tests for the bounded NDJSON format sniff (`isNDJSON`).
 *
 * Pure string/ArrayBuffer assertions — no DuckDB. The end-to-end format
 * behavior lives in `json.integration.test.ts`; this file pins the sniff's
 * classification rule and its byte budget.
 */
import { describe, it, expect, vi } from 'vitest';
import { isNDJSON, SNIFF_WINDOW_BYTES } from '@/worker/loaders/json';

/** Encode text as a standalone, exactly-sized ArrayBuffer. */
function toBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/**
 * The pre-M5 implementation, kept verbatim so the CRLF and parity tests can
 * assert against the behavior this milestone replaced.
 */
function legacyIsNDJSON(data: string): boolean {
  const lines = data.trim().split('\n');
  if (lines.length < 2) return false;
  try {
    const first: unknown = JSON.parse(lines[0]!);
    return typeof first === 'object' && !Array.isArray(first);
  } catch {
    return false;
  }
}

describe('isNDJSON — bounded format sniff', () => {
  describe('classification', () => {
    it('classifies a single-line JSON array as array', () => {
      expect(isNDJSON('[{"a":1},{"a":2}]')).toBe(false);
      // A trailing newline puts a `\n` in the window, but line 1 parses to an
      // array, so it is still an array document.
      expect(isNDJSON('[{"a":1},{"a":2}]\n')).toBe(false);
    });

    it('classifies a pretty-printed multi-line JSON array as array', () => {
      const pretty = '[\n  {"a": 1},\n  {"a": 2}\n]\n';
      // Line 1 is a bare `[`, which is not parseable JSON on its own.
      expect(isNDJSON(pretty)).toBe(false);
    });

    it('detects LF-delimited NDJSON', () => {
      expect(isNDJSON('{"a":1}\n{"a":2}\n{"a":3}\n')).toBe(true);
      expect(isNDJSON('{"a":1}\n{"a":2}')).toBe(true);
    });

    it('detects CRLF-delimited NDJSON', () => {
      const crlf = '{"a":1}\r\n{"a":2}\r\n{"a":3}\r\n';
      expect(isNDJSON(crlf)).toBe(true);
      expect(isNDJSON(toBuffer(crlf))).toBe(true);

      // Note for future readers: CRLF was *not* broken before this milestone.
      // The old sniff split on '\n' only, leaving a trailing '\r' on line 1 —
      // but a trailing CR is JSON whitespace, so `JSON.parse` accepted it and
      // the detection happened to work. The new sniff strips the CR
      // explicitly rather than depending on that quirk.
      expect(legacyIsNDJSON(crlf)).toBe(true);
      expect(JSON.parse('{"a":1}\r')).toEqual({ a: 1 });
    });

    it('reads an ArrayBuffer source with the same result as its string form', () => {
      expect(isNDJSON(toBuffer('{"a":1}\n{"a":2}\n'))).toBe(true);
      expect(isNDJSON(toBuffer('[{"a":1},{"a":2}]'))).toBe(false);
      expect(isNDJSON(toBuffer('[\n  {"a": 1}\n]\n'))).toBe(false);
    });

    it('skips leading whitespace, blank lines, and a BOM before line 1', () => {
      // The old implementation trimmed the whole document before splitting;
      // that leading-whitespace tolerance is preserved for the first line.
      expect(isNDJSON('\n\n{"a":1}\n{"a":2}\n')).toBe(true);
      expect(isNDJSON('   {"a":1}\n{"a":2}\n')).toBe(true);
      expect(isNDJSON('\uFEFF{"a":1}\n{"a":2}\n')).toBe(true);
    });

    it('matches the previous implementation on sources whose first line fits the window', () => {
      const shapes = [
        '[{"a":1},{"a":2}]',
        '[{"a":1},{"a":2}]\n',
        '[\n  {"a": 1},\n  {"a": 2}\n]\n',
        '{"a":1}\n{"a":2}\n',
        '{"a":1}\r\n{"a":2}\r\n',
        '{"a":1}',
        '{"a":1}\n',
        '\n{"a":1}\n{"a":2}\n',
        'not json at all\nsecond line\n',
        '"just a string"\n"another"\n',
      ];
      for (const shape of shapes) {
        expect([shape, isNDJSON(shape)]).toEqual([shape, legacyIsNDJSON(shape)]);
      }
    });
  });

  describe('line-count rule (there must be a record after the first newline)', () => {
    it('treats a lone object followed only by whitespace as array', () => {
      // Preserves the old `lines.length < 2` rule without counting lines.
      expect(isNDJSON('{"a":1}\n')).toBe(false);
      expect(isNDJSON('{"a":1}\r\n')).toBe(false);
      expect(isNDJSON('{"a":1}\n   \n\t\n')).toBe(false);
      expect(isNDJSON(toBuffer('{"a":1}\n'))).toBe(false);
    });

    it('treats two records with no trailing newline as NDJSON', () => {
      expect(isNDJSON('{"a":1}\n{"a":2}')).toBe(true);
    });

    it('returns false when the window contains no newline at all', () => {
      expect(isNDJSON('{"a":1}')).toBe(false);
      expect(isNDJSON('{"a":1} {"a":2}')).toBe(false);
      expect(isNDJSON(toBuffer('{"a":1}'))).toBe(false);
      expect(isNDJSON('')).toBe(false);
    });
  });

  describe('byte budget', () => {
    it('misdetects a first line longer than the sniff window as array (documented)', () => {
      // No `\n` inside the first SNIFF_WINDOW_BYTES, so the source falls back
      // to 'array'. The escape hatch is an explicit `options.format`.
      const hugeFirstLine = `{"a":"${'x'.repeat(SNIFF_WINDOW_BYTES)}"}\n{"a":1}\n`;
      expect(hugeFirstLine.indexOf('\n')).toBeGreaterThan(SNIFF_WINDOW_BYTES);
      expect(isNDJSON(hugeFirstLine)).toBe(false);
      expect(isNDJSON(toBuffer(hugeFirstLine))).toBe(false);
    });

    it('never decodes more than SNIFF_WINDOW_BYTES of an ArrayBuffer source', () => {
      const line = `{"a":1,"pad":"${'x'.repeat(200)}"}\n`;
      const text = line.repeat(Math.ceil((4 * 1024 * 1024) / line.length));
      const buffer = toBuffer(text);
      expect(buffer.byteLength).toBeGreaterThan(SNIFF_WINDOW_BYTES);

      const decodeSpy = vi.spyOn(TextDecoder.prototype, 'decode');
      try {
        expect(isNDJSON(buffer)).toBe(true);
        expect(decodeSpy).toHaveBeenCalled();
        const decodedBytes = decodeSpy.mock.calls.map(
          ([input]) => (input as ArrayBufferView | undefined)?.byteLength ?? 0,
        );
        // Mechanical guard: a regression to a full decode fails here.
        for (const byteLength of decodedBytes) {
          expect(byteLength).toBeLessThanOrEqual(SNIFF_WINDOW_BYTES);
        }
        expect(Math.max(...decodedBytes)).toBeLessThan(buffer.byteLength);
      } finally {
        decodeSpy.mockRestore();
      }
    });

    it('tolerates a multi-byte character straddling the window boundary', () => {
      const encoder = new TextEncoder();
      const emoji = encoder.encode('\u{1F600}'); // 4 bytes: F0 9F 98 80
      // Straddle the cut: 2 of the emoji's bytes inside the window, 2 outside.
      const emojiStart = SNIFF_WINDOW_BYTES - 2;
      const tail = encoder.encode('"}\n');
      const bytes = new Uint8Array(emojiStart + emoji.byteLength + tail.byteLength);
      bytes.fill(0x78); // 'x' padding inside the second record's string value
      bytes.set(encoder.encode('{"a":1}\n{"pad":"'), 0);
      bytes.set(emoji, emojiStart);
      bytes.set(tail, emojiStart + emoji.byteLength);
      // The byte at the cut is a UTF-8 continuation byte (10xxxxxx).
      expect(bytes[SNIFF_WINDOW_BYTES - 1]! & 0xc0).toBe(0x80);

      const buffer = bytes.buffer as ArrayBuffer;
      // The non-fatal TextDecoder substitutes U+FFFD for the split sequence
      // instead of throwing, and the truncation cannot affect line 1.
      expect(() => isNDJSON(buffer)).not.toThrow();
      expect(isNDJSON(buffer)).toBe(true);
    });
  });
});
