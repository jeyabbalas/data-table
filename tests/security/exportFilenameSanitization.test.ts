/**
 * Phase 1 — export filename sanitisation regression tests.
 *
 * The `<a download="...">` attribute tells the browser the suggested
 * save name. The OS may further sanitise, but defence-in-depth at the
 * library boundary blocks path traversal hints, control-character
 * injection, leading-dot dotfiles, and absurdly long names.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeFilenameStem } from '@/export/ExportDialog';

describe('sanitizeFilenameStem', () => {
  it('passes ordinary filenames through unchanged', () => {
    expect(sanitizeFilenameStem('sales_data')).toBe('sales_data');
    expect(sanitizeFilenameStem('q1-2026 report')).toBe('q1-2026 report');
    expect(sanitizeFilenameStem('café')).toBe('café');
  });

  it('strips forward and back slashes', () => {
    expect(sanitizeFilenameStem('a/b/c')).toBe('abc');
    expect(sanitizeFilenameStem('a\\b\\c')).toBe('abc');
    // Path separators stripped → leading dots stripped → no internal `..` left.
    expect(sanitizeFilenameStem('../../etc/passwd')).toBe('etcpasswd');
  });

  it('strips NUL bytes', () => {
    expect(sanitizeFilenameStem('report\0name')).toBe('reportname');
  });

  it('strips ASCII control characters', () => {
    expect(sanitizeFilenameStem('a\x01b\x1fc\x7fd')).toBe('abcd');
  });

  it('defangs runs of `..` to underscores', () => {
    expect(sanitizeFilenameStem('a..b')).toBe('a__b');
    expect(sanitizeFilenameStem('a...b')).toBe('a___b');
    expect(sanitizeFilenameStem('a....b')).toBe('a____b');
  });

  it('strips leading dots so `.htaccess` becomes `htaccess`', () => {
    expect(sanitizeFilenameStem('.htaccess')).toBe('htaccess');
    expect(sanitizeFilenameStem('....hidden')).toBe('hidden');
  });

  it('preserves dots in the middle of the name', () => {
    expect(sanitizeFilenameStem('foo.bar')).toBe('foo.bar');
  });

  it('caps length at 100 characters', () => {
    const long = 'a'.repeat(500);
    const sanitised = sanitizeFilenameStem(long);
    expect(sanitised.length).toBe(100);
    expect(sanitised).toBe('a'.repeat(100));
  });

  it('returns the empty string when every character is sanitised away', () => {
    expect(sanitizeFilenameStem('')).toBe('');
    expect(sanitizeFilenameStem('////')).toBe('');
    expect(sanitizeFilenameStem('\x00\x01\x02')).toBe('');
    expect(sanitizeFilenameStem('....')).toBe('');
  });

  it('blocks combined attack patterns', () => {
    // Path traversal + leading dot + control chars. After stripping
    // separators (5 backslashes + NUL + SOH) and leading dots, only the
    // suffix remains.
    expect(sanitizeFilenameStem('..\\..\\..\\..\\.htaccess\0\x01')).toBe('htaccess');
  });
});
