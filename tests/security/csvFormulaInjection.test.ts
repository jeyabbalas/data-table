/**
 * Phase 1 — CSV formula-injection regression tests.
 *
 * Cells whose first character is `=`, `+`, `-`, `@`, `\t`, or `\r` execute
 * as formulas in Excel / LibreOffice / Google Sheets. The library
 * neutralises by prepending a single quote so the spreadsheet treats the
 * cell as literal text.
 */

import { describe, it, expect } from 'vitest';
import {
  escapeCSVField,
  formatCellValue,
  neutralizeFormulaPrefix,
  rowToCSVLine,
} from '@/export/CSVExport';

describe('neutralizeFormulaPrefix', () => {
  it('prepends a single quote to cells starting with =', () => {
    expect(neutralizeFormulaPrefix('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
  });

  it('prepends a single quote to cells starting with +', () => {
    expect(neutralizeFormulaPrefix('+1+1')).toBe("'+1+1");
  });

  it('prepends a single quote to cells starting with -', () => {
    expect(neutralizeFormulaPrefix('-CMD|/C calc')).toBe("'-CMD|/C calc");
  });

  it('prepends a single quote to cells starting with @', () => {
    expect(neutralizeFormulaPrefix("@SUM('A1':'A10')")).toBe("'@SUM('A1':'A10')");
  });

  it('prepends a single quote to cells starting with TAB', () => {
    expect(neutralizeFormulaPrefix('\t=cmd')).toBe("'\t=cmd");
  });

  it('prepends a single quote to cells starting with CR', () => {
    expect(neutralizeFormulaPrefix('\r=cmd')).toBe("'\r=cmd");
  });

  it('leaves benign cells unchanged', () => {
    expect(neutralizeFormulaPrefix('hello world')).toBe('hello world');
    expect(neutralizeFormulaPrefix('123')).toBe('123');
    expect(neutralizeFormulaPrefix('Equation: 1=1')).toBe('Equation: 1=1');
    expect(neutralizeFormulaPrefix(' =leading space')).toBe(' =leading space');
  });

  it('returns the empty string unchanged', () => {
    expect(neutralizeFormulaPrefix('')).toBe('');
  });

  it('is idempotent on already-escaped cells', () => {
    // First char is `'`, not a trigger — left alone.
    const escaped = "'=SUM(A1:A10)";
    expect(neutralizeFormulaPrefix(escaped)).toBe(escaped);
  });
});

describe('escapeCSVField — formula injection', () => {
  it('neutralises formula triggers without RFC-4180 wrapping when no other special chars', () => {
    expect(escapeCSVField('=SUM(A1:A10)', ',')).toBe("'=SUM(A1:A10)");
    expect(escapeCSVField('+1+1', ',')).toBe("'+1+1");
    expect(escapeCSVField('-foo', ',')).toBe("'-foo");
    expect(escapeCSVField('@bar', ',')).toBe("'@bar");
  });

  it('wraps + neutralises when both formula trigger and delimiter present', () => {
    // Cell `=A,B` after neutralisation `'=A,B` contains `,` → RFC-4180 wrap.
    expect(escapeCSVField('=A,B', ',')).toBe('"\'=A,B"');
  });

  it('preserves embedded double-quote doubling on neutralised cells', () => {
    // `="hi"` → `'="hi"` → wrapped because it contains `"`.
    expect(escapeCSVField('="hi"', ',')).toBe('"\'=""hi"""');
  });

  it('CR-prefixed cells get the wrap because of RFC-4180 too (CR + neutralised)', () => {
    expect(escapeCSVField('\r=cmd', ',')).toBe('"\'\r=cmd"');
  });
});

describe('rowToCSVLine — formula injection routes through escape', () => {
  it('neutralises cells in row context', () => {
    const row = { name: 'Alice', formula: '=cmd|/C calc', amount: 100 };
    const line = rowToCSVLine(row, ['name', 'formula', 'amount'], ',', '');
    expect(line).toBe("Alice,'=cmd|/C calc,100");
  });

  it('column-name (header row) values are also neutralised when escapeCSVField is invoked', () => {
    // Header row in exportToCSV is `columns.map((c) => escapeCSVField(c, delimiter))`.
    // A column literally named "=evil" is rare but possible — confirm escape runs.
    expect(escapeCSVField('=evil', ',')).toBe("'=evil");
  });
});

describe('formatCellValue — bigint / boolean preservation', () => {
  it('formats bigint as numeric string (escapeCSVField then handles formula prefix if any)', () => {
    expect(formatCellValue(42n, '')).toBe('42');
    // A bigint that stringifies starting with `-` is a formula trigger when
    // chained through escapeCSVField — confirm the chain.
    expect(escapeCSVField(formatCellValue(-7n, ''), ',')).toBe("'-7");
  });

  it('formats negative numbers as plain strings; escape adds the prefix downstream', () => {
    expect(formatCellValue(-7, '')).toBe('-7');
    expect(escapeCSVField(formatCellValue(-7, ''), ',')).toBe("'-7");
  });
});
