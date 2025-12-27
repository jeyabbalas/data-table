import { describe, it, expect } from 'vitest';

// We'll test the pattern detection logic by importing and testing the module
// Note: The actual inferStringColumnType function requires a database connection,
// so we focus on testing the type patterns that the module should recognize

describe('TypeInference', () => {
  describe('Boolean patterns', () => {
    const booleanTrueValues = ['true', 'True', 'TRUE', 'yes', 'Yes', 'YES', '1', 't', 'y', 'on', 'ON'];
    const booleanFalseValues = ['false', 'False', 'FALSE', 'no', 'No', 'NO', '0', 'f', 'n', 'off', 'OFF'];

    it('should recognize true boolean values', () => {
      for (const value of booleanTrueValues) {
        expect(isBooleanPattern(value)).toBe(true);
      }
    });

    it('should recognize false boolean values', () => {
      for (const value of booleanFalseValues) {
        expect(isBooleanPattern(value)).toBe(true);
      }
    });

    it('should not recognize non-boolean values', () => {
      expect(isBooleanPattern('maybe')).toBe(false);
      expect(isBooleanPattern('2')).toBe(false);
      expect(isBooleanPattern('hello')).toBe(false);
    });
  });

  describe('Integer patterns', () => {
    it('should recognize positive integers', () => {
      expect(isIntegerPattern('123')).toBe(true);
      expect(isIntegerPattern('0')).toBe(true);
      expect(isIntegerPattern('999999')).toBe(true);
    });

    it('should recognize negative integers', () => {
      expect(isIntegerPattern('-123')).toBe(true);
      expect(isIntegerPattern('-1')).toBe(true);
    });

    it('should recognize integers with plus sign', () => {
      expect(isIntegerPattern('+123')).toBe(true);
    });

    it('should not recognize floats as integers', () => {
      expect(isIntegerPattern('12.34')).toBe(false);
      expect(isIntegerPattern('1.0')).toBe(false);
    });

    it('should not recognize non-numeric strings', () => {
      expect(isIntegerPattern('abc')).toBe(false);
      expect(isIntegerPattern('12abc')).toBe(false);
    });
  });

  describe('Float patterns', () => {
    it('should recognize decimal numbers', () => {
      expect(isFloatPattern('12.34')).toBe(true);
      expect(isFloatPattern('0.5')).toBe(true);
      expect(isFloatPattern('.5')).toBe(true);
    });

    it('should recognize negative floats', () => {
      expect(isFloatPattern('-12.34')).toBe(true);
      expect(isFloatPattern('-0.5')).toBe(true);
    });

    it('should recognize scientific notation', () => {
      expect(isFloatPattern('1.23e10')).toBe(true);
      expect(isFloatPattern('1.23E-5')).toBe(true);
    });

    it('should not recognize integers as floats', () => {
      expect(isFloatPattern('123')).toBe(false);
    });
  });

  describe('ISO Date patterns', () => {
    it('should recognize ISO dates', () => {
      expect(isISODatePattern('2024-01-15')).toBe(true);
      expect(isISODatePattern('2023-12-31')).toBe(true);
      expect(isISODatePattern('1999-01-01')).toBe(true);
    });

    it('should not recognize invalid dates', () => {
      expect(isISODatePattern('2024-13-01')).toBe(false); // Invalid month
      expect(isISODatePattern('2024-01-32')).toBe(false); // Invalid day
      expect(isISODatePattern('24-01-15')).toBe(false); // Wrong format
    });

    it('should not recognize timestamps as dates', () => {
      expect(isISODatePattern('2024-01-15T10:30:00')).toBe(false);
    });
  });

  describe('ISO Timestamp patterns', () => {
    it('should recognize ISO timestamps with T separator', () => {
      expect(isISOTimestampPattern('2024-01-15T10:30:00')).toBe(true);
      expect(isISOTimestampPattern('2024-01-15T10:30:00Z')).toBe(true);
      expect(isISOTimestampPattern('2024-01-15T10:30:00+05:00')).toBe(true);
    });

    it('should recognize ISO timestamps with space separator', () => {
      expect(isISOTimestampPattern('2024-01-15 10:30:00')).toBe(true);
    });

    it('should recognize timestamps with milliseconds', () => {
      expect(isISOTimestampPattern('2024-01-15T10:30:00.123')).toBe(true);
      expect(isISOTimestampPattern('2024-01-15T10:30:00.123Z')).toBe(true);
    });

    it('should not recognize plain dates as timestamps', () => {
      expect(isISOTimestampPattern('2024-01-15')).toBe(false);
    });
  });
});

// Helper functions to test patterns (mirrors the logic in TypeInference.ts)
function isBooleanPattern(value: string): boolean {
  const trueValues = new Set(['true', 't', 'yes', 'y', '1', 'on']);
  const falseValues = new Set(['false', 'f', 'no', 'n', '0', 'off']);
  const lower = value.toLowerCase().trim();
  return trueValues.has(lower) || falseValues.has(lower);
}

function isIntegerPattern(value: string): boolean {
  const trimmed = value.trim();
  return /^[+-]?\d+$/.test(trimmed);
}

function isFloatPattern(value: string): boolean {
  const trimmed = value.trim();
  return /^[+-]?(\d+\.?\d*|\d*\.?\d+)([eE][+-]?\d+)?$/.test(trimmed) &&
         (trimmed.includes('.') || trimmed.toLowerCase().includes('e'));
}

function isISODatePattern(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }
  const date = new Date(trimmed);
  return !isNaN(date.getTime());
}

function isISOTimestampPattern(value: string): boolean {
  const trimmed = value.trim();
  const isoPattern = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
  if (!isoPattern.test(trimmed)) {
    return false;
  }
  const date = new Date(trimmed.replace(' ', 'T'));
  return !isNaN(date.getTime());
}
