import { describe, it, expect, vi } from 'vitest';
import { SQLValidationError } from '@/core/errors';
import {
  filterToSQL,
  filtersToWhereClause,
  formatSQLValue,
  quoteIdentifier,
} from '@/filters/FilterSQL';
import type { Filter } from '@/filters/FilterTypes';

// =========================================
// filterToSQL Tests
// =========================================

describe('filterToSQL', () => {
  describe('range filter', () => {
    it('should generate SQL for numeric range', () => {
      const filter: Filter = { type: 'range', column: 'price', min: 10, max: 100 };
      expect(filterToSQL(filter)).toBe('("price" >= 10 AND "price" < 100)');
    });

    it('should use <= for maxInclusive range', () => {
      const filter: Filter = {
        type: 'range',
        column: 'price',
        min: 10,
        max: 100,
        maxInclusive: true,
      };
      expect(filterToSQL(filter)).toBe('("price" >= 10 AND "price" <= 100)');
    });

    it('should generate SQL for string (ISO date) range', () => {
      const filter: Filter = {
        type: 'range',
        column: 'date',
        min: '2024-01-01',
        max: '2024-12-31',
      };
      expect(filterToSQL(filter)).toBe('("date" >= \'2024-01-01\' AND "date" < \'2024-12-31\')');
    });

    it('should use <= for time range with maxInclusive', () => {
      const filter: Filter = {
        type: 'range',
        column: 'start_time',
        min: '10:00',
        max: '12:00',
        maxInclusive: true,
      };
      expect(filterToSQL(filter)).toBe('("start_time" >= \'10:00\' AND "start_time" <= \'12:00\')');
    });

    it('should generate SQL for Date object range', () => {
      const min = new Date('2024-01-01T00:00:00.000Z');
      const max = new Date('2024-12-31T00:00:00.000Z');
      const filter: Filter = { type: 'range', column: 'created', min, max };
      expect(filterToSQL(filter)).toBe(
        '("created" >= \'2024-01-01T00:00:00.000Z\' AND "created" < \'2024-12-31T00:00:00.000Z\')',
      );
    });

    it('should prefix values with INTERVAL keyword when valueType is interval', () => {
      const filter: Filter = {
        type: 'range',
        column: 'duration',
        min: '1 day 02:00:00',
        max: '3 days 08:00:00',
        valueType: 'interval',
      };
      expect(filterToSQL(filter)).toBe(
        '("duration" >= INTERVAL \'1 day 02:00:00\' AND "duration" < INTERVAL \'3 days 08:00:00\')',
      );
    });

    it('should handle interval range with maxInclusive', () => {
      const filter: Filter = {
        type: 'range',
        column: 'duration',
        min: '01:00:00',
        max: '05:00:00',
        valueType: 'interval',
        maxInclusive: true,
      };
      expect(filterToSQL(filter)).toBe(
        '("duration" >= INTERVAL \'01:00:00\' AND "duration" <= INTERVAL \'05:00:00\')',
      );
    });

    it('should handle interval range with open lower bound', () => {
      const filter: Filter = {
        type: 'range',
        column: 'duration',
        min: -Infinity,
        max: '02:00:00',
        valueType: 'interval',
      };
      expect(filterToSQL(filter)).toBe('"duration" < INTERVAL \'02:00:00\'');
    });

    it('should handle interval range with open upper bound', () => {
      const filter: Filter = {
        type: 'range',
        column: 'duration',
        min: '01:00:00',
        max: Infinity,
        valueType: 'interval',
      };
      expect(filterToSQL(filter)).toBe('"duration" >= INTERVAL \'01:00:00\'');
    });
  });

  describe('point filter', () => {
    it('should generate SQL for string value', () => {
      const filter: Filter = { type: 'point', column: 'status', value: 'active' };
      expect(filterToSQL(filter)).toBe('"status" = \'active\'');
    });

    it('should generate SQL for number value', () => {
      const filter: Filter = { type: 'point', column: 'id', value: 42 };
      expect(filterToSQL(filter)).toBe('"id" = 42');
    });

    it('should generate SQL for boolean value', () => {
      const filter: Filter = { type: 'point', column: 'active', value: true };
      expect(filterToSQL(filter)).toBe('"active" = TRUE');
    });

    it('should generate IS NULL for null value', () => {
      const filter: Filter = { type: 'point', column: 'notes', value: null };
      expect(filterToSQL(filter)).toBe('"notes" IS NULL');
    });
  });

  describe('set filter', () => {
    it('should generate SQL for multiple values', () => {
      const filter: Filter = { type: 'set', column: 'category', values: ['A', 'B', 'C'] };
      expect(filterToSQL(filter)).toBe("\"category\" IN ('A', 'B', 'C')");
    });

    it('should return FALSE for empty array', () => {
      const filter: Filter = { type: 'set', column: 'category', values: [] };
      expect(filterToSQL(filter)).toBe('FALSE');
    });

    it('should generate SQL for single value', () => {
      const filter: Filter = { type: 'set', column: 'category', values: ['X'] };
      expect(filterToSQL(filter)).toBe('"category" IN (\'X\')');
    });

    it('should generate (IN OR IS NULL) when includeNull is true', () => {
      const filter: Filter = {
        type: 'set',
        column: 'status',
        values: ['active'],
        includeNull: true,
      };
      expect(filterToSQL(filter)).toBe('("status" IN (\'active\') OR "status" IS NULL)');
    });

    it('should generate IS NULL for empty set with includeNull', () => {
      const filter: Filter = { type: 'set', column: 'x', values: [], includeNull: true };
      expect(filterToSQL(filter)).toBe('"x" IS NULL');
    });
  });

  describe('not-set filter', () => {
    it('should generate SQL for multiple values', () => {
      const filter: Filter = { type: 'not-set', column: 'category', values: ['A', 'B'] };
      expect(filterToSQL(filter)).toBe("\"category\" NOT IN ('A', 'B')");
    });

    it('should return TRUE for empty array', () => {
      const filter: Filter = { type: 'not-set', column: 'category', values: [] };
      expect(filterToSQL(filter)).toBe('TRUE');
    });

    it('should generate (NOT IN OR IS NULL) when includeNull is true', () => {
      const filter: Filter = {
        type: 'not-set',
        column: 'active',
        values: [false],
        includeNull: true,
      };
      expect(filterToSQL(filter)).toBe('("active" NOT IN (FALSE) OR "active" IS NULL)');
    });

    it('should generate TRUE for empty not-set with includeNull (nothing excluded = everything)', () => {
      const filter: Filter = { type: 'not-set', column: 'x', values: [], includeNull: true };
      expect(filterToSQL(filter)).toBe('TRUE');
    });

    it('should NOT add IS NULL when includeNull is absent', () => {
      const filter: Filter = { type: 'not-set', column: 'category', values: ['A'] };
      expect(filterToSQL(filter)).toBe('"category" NOT IN (\'A\')');
    });

    it('should include NULLs for numeric != with includeNull', () => {
      const filter: Filter = { type: 'not-set', column: 'score', values: [5], includeNull: true };
      expect(filterToSQL(filter)).toBe('("score" NOT IN (5) OR "score" IS NULL)');
    });
  });

  describe('null filter', () => {
    it('should generate IS NULL', () => {
      const filter: Filter = { type: 'null', column: 'notes' };
      expect(filterToSQL(filter)).toBe('"notes" IS NULL');
    });
  });

  describe('not-null filter', () => {
    it('should generate IS NOT NULL', () => {
      const filter: Filter = { type: 'not-null', column: 'notes' };
      expect(filterToSQL(filter)).toBe('"notes" IS NOT NULL');
    });
  });

  describe('pattern filter', () => {
    it('should generate ILIKE for contains mode', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'test', mode: 'contains' };
      expect(filterToSQL(filter)).toBe("CAST(\"name\" AS VARCHAR) ILIKE '%test%' ESCAPE '\\'");
    });

    it('should generate ILIKE for starts mode', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'test', mode: 'starts' };
      expect(filterToSQL(filter)).toBe("CAST(\"name\" AS VARCHAR) ILIKE 'test%' ESCAPE '\\'");
    });

    it('should generate ILIKE for ends mode', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'test', mode: 'ends' };
      expect(filterToSQL(filter)).toBe("CAST(\"name\" AS VARCHAR) ILIKE '%test' ESCAPE '\\'");
    });

    it('should generate regexp_matches for regex mode', () => {
      const filter: Filter = {
        type: 'pattern',
        column: 'name',
        pattern: '^test.*$',
        mode: 'regex',
      };
      expect(filterToSQL(filter)).toBe('regexp_matches(CAST("name" AS VARCHAR), \'^test.*$\')');
    });

    it('should use ILIKE for contains/starts/ends but regexp_matches for regex', () => {
      const contains: Filter = {
        type: 'pattern',
        column: 'name',
        pattern: 'Test',
        mode: 'contains',
      };
      expect(filterToSQL(contains)).toContain('ILIKE');

      const starts: Filter = { type: 'pattern', column: 'name', pattern: 'Test', mode: 'starts' };
      expect(filterToSQL(starts)).toContain('ILIKE');

      const ends: Filter = { type: 'pattern', column: 'name', pattern: 'Test', mode: 'ends' };
      expect(filterToSQL(ends)).toContain('ILIKE');

      const regex: Filter = { type: 'pattern', column: 'name', pattern: '^Test$', mode: 'regex' };
      expect(filterToSQL(regex)).toContain('regexp_matches');
      expect(filterToSQL(regex)).not.toContain('ILIKE');
    });

    describe('ILIKE wildcard escaping', () => {
      it('should escape % in pattern', () => {
        const filter: Filter = {
          type: 'pattern',
          column: 'name',
          pattern: '50%',
          mode: 'contains',
        };
        expect(filterToSQL(filter)).toBe("CAST(\"name\" AS VARCHAR) ILIKE '%50\\%%' ESCAPE '\\'");
      });

      it('should escape _ in pattern', () => {
        const filter: Filter = {
          type: 'pattern',
          column: 'name',
          pattern: 'foo_bar',
          mode: 'contains',
        };
        expect(filterToSQL(filter)).toBe(
          "CAST(\"name\" AS VARCHAR) ILIKE '%foo\\_bar%' ESCAPE '\\'",
        );
      });

      it('should escape \\ in pattern', () => {
        const filter: Filter = {
          type: 'pattern',
          column: 'path',
          pattern: 'C:\\Users',
          mode: 'starts',
        };
        expect(filterToSQL(filter)).toBe(
          "CAST(\"path\" AS VARCHAR) ILIKE 'C:\\\\Users%' ESCAPE '\\'",
        );
      });

      it('should escape single quotes in pattern', () => {
        const filter: Filter = {
          type: 'pattern',
          column: 'name',
          pattern: "O'Brien",
          mode: 'contains',
        };
        expect(filterToSQL(filter)).toBe(
          "CAST(\"name\" AS VARCHAR) ILIKE '%O''Brien%' ESCAPE '\\'",
        );
      });

      it('should escape multiple special characters together', () => {
        const filter: Filter = {
          type: 'pattern',
          column: 'val',
          pattern: '50%_off\\',
          mode: 'ends',
        };
        expect(filterToSQL(filter)).toBe(
          "CAST(\"val\" AS VARCHAR) ILIKE '%50\\%\\_off\\\\' ESCAPE '\\'",
        );
      });

      it('should NOT escape ILIKE characters in regex mode', () => {
        const filter: Filter = {
          type: 'pattern',
          column: 'name',
          pattern: '50%_test',
          mode: 'regex',
        };
        expect(filterToSQL(filter)).toBe('regexp_matches(CAST("name" AS VARCHAR), \'50%_test\')');
      });
    });
  });

  describe('unknown filter type', () => {
    it('should return FALSE and log error (fail closed)', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const filter = { type: 'unknown', column: 'x' } as unknown as Filter;
      expect(filterToSQL(filter)).toBe('FALSE');
      expect(errorSpy).toHaveBeenCalledWith('Unknown filter type: unknown');
      errorSpy.mockRestore();
    });
  });
});

// =========================================
// filtersToWhereClause Tests
// =========================================

describe('filtersToWhereClause', () => {
  it('should return empty string for empty array', () => {
    expect(filtersToWhereClause([])).toBe('');
  });

  it('should generate SQL for single filter', () => {
    const filters: Filter[] = [{ type: 'point', column: 'status', value: 'active' }];
    expect(filtersToWhereClause(filters)).toBe('"status" = \'active\'');
  });

  it('should AND-join multiple filters on different columns', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 100 },
      { type: 'point', column: 'active', value: true },
      { type: 'null', column: 'deleted_at' },
    ];
    const result = filtersToWhereClause(filters);
    expect(result).toBe(
      '("price" >= 10 AND "price" < 100) AND "active" = TRUE AND "deleted_at" IS NULL',
    );
  });

  it('should exclude specified column', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 100 },
      { type: 'point', column: 'status', value: 'active' },
    ];
    const result = filtersToWhereClause(filters, 'price');
    expect(result).toBe('"status" = \'active\'');
    expect(result).not.toContain('price');
  });

  it('should return empty string when excluding the only filter', () => {
    const filters: Filter[] = [{ type: 'range', column: 'price', min: 10, max: 100 }];
    expect(filtersToWhereClause(filters, 'price')).toBe('');
  });
});

// =========================================
// quoteIdentifier Tests
// =========================================

describe('quoteIdentifier', () => {
  it('should wrap name in double quotes', () => {
    expect(quoteIdentifier('price')).toBe('"price"');
  });

  it('should escape embedded double quotes by doubling them', () => {
    expect(quoteIdentifier('col"name')).toBe('"col""name"');
  });

  it('should handle multiple embedded double quotes', () => {
    expect(quoteIdentifier('a"b"c')).toBe('"a""b""c"');
  });

  it('should handle name that is just a double quote', () => {
    expect(quoteIdentifier('"')).toBe('""""');
  });

  // ---- Phase 1 security hardening ----

  it('throws INVALID_IDENTIFIER on empty string', () => {
    expect(() => quoteIdentifier('')).toThrow(SQLValidationError);
    try {
      quoteIdentifier('');
    } catch (err) {
      expect(err).toBeInstanceOf(SQLValidationError);
      expect((err as SQLValidationError).code).toBe('INVALID_IDENTIFIER');
    }
  });

  it('throws INVALID_IDENTIFIER on embedded NUL byte', () => {
    expect(() => quoteIdentifier('col\0name')).toThrow(SQLValidationError);
    try {
      quoteIdentifier('col\0name');
    } catch (err) {
      expect((err as SQLValidationError).code).toBe('INVALID_IDENTIFIER');
    }
  });

  it('throws INVALID_IDENTIFIER on a NUL-only identifier', () => {
    expect(() => quoteIdentifier('\0')).toThrow(SQLValidationError);
  });

  it('preserves surrogate pairs (emoji) unchanged', () => {
    // 'a😀b' → "a😀b" — surrogate halves must not be split.
    const id = quoteIdentifier('a😀b');
    expect(id).toBe('"a😀b"');
  });

  it('preserves non-ASCII Unicode unchanged', () => {
    expect(quoteIdentifier('café')).toBe('"café"');
    expect(quoteIdentifier('значение')).toBe('"значение"');
  });

  it('preserves leading and trailing whitespace (DuckDB owns trimming)', () => {
    expect(quoteIdentifier('  col  ')).toBe('"  col  "');
  });

  it('preserves non-NUL ASCII control chars (DuckDB will reject if it dislikes them)', () => {
    // 0x01 SOH; we do not strip silently. DuckDB will throw at parse time.
    expect(quoteIdentifier('a\x01b')).toBe('"a\x01b"');
  });
});

// =========================================
// formatSQLValue Edge Cases
// =========================================

describe('formatSQLValue', () => {
  it('should return NULL for Infinity', () => {
    expect(formatSQLValue(Infinity)).toBe('NULL');
  });

  it('should return NULL for -Infinity', () => {
    expect(formatSQLValue(-Infinity)).toBe('NULL');
  });

  it('should return NULL for NaN', () => {
    expect(formatSQLValue(NaN)).toBe('NULL');
  });

  it('should return NULL for null', () => {
    expect(formatSQLValue(null)).toBe('NULL');
  });

  it('should return NULL for undefined', () => {
    expect(formatSQLValue(undefined)).toBe('NULL');
  });

  it('should format finite numbers normally', () => {
    expect(formatSQLValue(42)).toBe('42');
    expect(formatSQLValue(3.14)).toBe('3.14');
    expect(formatSQLValue(0)).toBe('0');
    expect(formatSQLValue(-7)).toBe('-7');
  });

  it('should escape single quotes in strings', () => {
    expect(formatSQLValue("O'Brien")).toBe("'O''Brien'");
  });

  it('should format booleans', () => {
    expect(formatSQLValue(true)).toBe('TRUE');
    expect(formatSQLValue(false)).toBe('FALSE');
  });

  it('should format Date objects as ISO strings', () => {
    const d = new Date('2024-06-15T12:00:00.000Z');
    expect(formatSQLValue(d)).toBe("'2024-06-15T12:00:00.000Z'");
  });

  // Temporal string values (used in derived column vector insertion)
  it('should quote date strings for DuckDB DATE columns', () => {
    expect(formatSQLValue('2024-01-15')).toBe("'2024-01-15'");
    expect(formatSQLValue('1970-01-01')).toBe("'1970-01-01'");
    expect(formatSQLValue('2099-12-31')).toBe("'2099-12-31'");
  });

  it('should quote time strings for DuckDB TIME columns', () => {
    expect(formatSQLValue('14:30:00')).toBe("'14:30:00'");
    expect(formatSQLValue('00:00:00')).toBe("'00:00:00'");
    expect(formatSQLValue('23:59:59.999')).toBe("'23:59:59.999'");
  });

  it('should quote timestamp strings for DuckDB TIMESTAMP columns', () => {
    expect(formatSQLValue('2024-01-15 10:30:00')).toBe("'2024-01-15 10:30:00'");
    expect(formatSQLValue('2024-01-15T10:30:00')).toBe("'2024-01-15T10:30:00'");
    expect(formatSQLValue('2024-01-15 10:30:00.123')).toBe("'2024-01-15 10:30:00.123'");
  });

  it('should quote interval strings for DuckDB INTERVAL columns', () => {
    expect(formatSQLValue('1 day')).toBe("'1 day'");
    expect(formatSQLValue('2 hours 30 minutes')).toBe("'2 hours 30 minutes'");
    expect(formatSQLValue('1 year 6 months')).toBe("'1 year 6 months'");
  });

  it('should quote UUID strings for DuckDB UUID columns', () => {
    expect(formatSQLValue('550e8400-e29b-41d4-a716-446655440000')).toBe(
      "'550e8400-e29b-41d4-a716-446655440000'",
    );
  });

  it('should quote decimal strings for DuckDB DECIMAL columns', () => {
    expect(formatSQLValue('123.456')).toBe("'123.456'");
    expect(formatSQLValue('-0.5')).toBe("'-0.5'");
  });

  // ---- Phase 1 security hardening ----

  it('emits BIGINT as bare numeric literal (no quotes)', () => {
    expect(formatSQLValue(42n)).toBe('42');
    expect(formatSQLValue(0n)).toBe('0');
    expect(formatSQLValue(-1n)).toBe('-1');
    // BIGINT range bound — must not be quoted.
    expect(formatSQLValue(9223372036854775807n)).toBe('9223372036854775807');
  });

  it('keeps adversarial single-quote strings inside the literal', () => {
    const adversarial = "a' OR 1=1 --";
    expect(formatSQLValue(adversarial)).toBe("'a'' OR 1=1 --'");
  });

  it('keeps SQL-injection-shaped strings sandboxed', () => {
    expect(formatSQLValue("'); DROP TABLE x; --")).toBe("'''); DROP TABLE x; --'");
  });

  it('passes through HTML-shaped strings (SQL escaping does not touch HTML)', () => {
    // formatSQLValue's job is SQL-literal safety, not HTML safety. Confirms
    // the contract: payload is preserved, only single quotes are escaped.
    expect(formatSQLValue('<img src=x onerror=alert(1)>')).toBe("'<img src=x onerror=alert(1)>'");
  });
});

// =========================================
// filterToSQL Edge Cases
// =========================================

describe('filterToSQL edge cases', () => {
  describe('open-bound range filters', () => {
    it('should generate upper-bound only for open lower bound', () => {
      const filter: Filter = { type: 'range', column: 'x', min: -Infinity, max: 50 };
      expect(filterToSQL(filter)).toBe('"x" < 50');
    });

    it('should generate upper-bound with <= for maxInclusive', () => {
      const filter: Filter = {
        type: 'range',
        column: 'x',
        min: -Infinity,
        max: 50,
        maxInclusive: true,
      };
      expect(filterToSQL(filter)).toBe('"x" <= 50');
    });

    it('should generate lower-bound only for open upper bound', () => {
      const filter: Filter = { type: 'range', column: 'x', min: 10, max: Infinity };
      expect(filterToSQL(filter)).toBe('"x" >= 10');
    });

    it('should generate > for minExclusive with open upper bound', () => {
      const filter: Filter = {
        type: 'range',
        column: 'x',
        min: 10,
        max: Infinity,
        minExclusive: true,
      };
      expect(filterToSQL(filter)).toBe('"x" > 10');
    });

    it('should generate TRUE for fully open range', () => {
      const filter: Filter = { type: 'range', column: 'x', min: -Infinity, max: Infinity };
      expect(filterToSQL(filter)).toBe('TRUE');
    });
  });

  describe('regex with special characters', () => {
    it('should escape single quotes in regex pattern', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: "O'Brien", mode: 'regex' };
      expect(filterToSQL(filter)).toBe("regexp_matches(CAST(\"name\" AS VARCHAR), 'O''Brien')");
    });

    it('should handle regex with multiple single quotes', () => {
      const filter: Filter = {
        type: 'pattern',
        column: 'x',
        pattern: "it's a 'test'",
        mode: 'regex',
      };
      expect(filterToSQL(filter)).toBe(
        "regexp_matches(CAST(\"x\" AS VARCHAR), 'it''s a ''test''')",
      );
    });
  });

  describe('not-set edge cases', () => {
    it('should return TRUE for empty not-set without includeNull', () => {
      const filter: Filter = { type: 'not-set', column: 'x', values: [] };
      expect(filterToSQL(filter)).toBe('TRUE');
    });

    it('should return TRUE for empty not-set with includeNull explicitly false', () => {
      const filter: Filter = { type: 'not-set', column: 'x', values: [], includeNull: false };
      expect(filterToSQL(filter)).toBe('TRUE');
    });
  });

  describe('column names with special characters', () => {
    it('should safely handle column names with double quotes', () => {
      const filter: Filter = { type: 'point', column: 'col"name', value: 42 };
      expect(filterToSQL(filter)).toBe('"col""name" = 42');
    });

    it('should safely handle column names with double quotes in range filter', () => {
      const filter: Filter = { type: 'range', column: 'a"b', min: 1, max: 10 };
      expect(filterToSQL(filter)).toBe('("a""b" >= 1 AND "a""b" < 10)');
    });

    it('should safely handle column names with double quotes in set filter', () => {
      const filter: Filter = { type: 'set', column: 'col"', values: ['x'] };
      expect(filterToSQL(filter)).toBe('"col""" IN (\'x\')');
    });

    it('should safely handle column names with double quotes in pattern filter', () => {
      const filter: Filter = {
        type: 'pattern',
        column: 'col"name',
        pattern: 'test',
        mode: 'contains',
      };
      expect(filterToSQL(filter)).toBe(
        'CAST("col""name" AS VARCHAR) ILIKE \'%test%\' ESCAPE \'\\\'',
      );
    });

    it('should safely handle column names with double quotes in null filter', () => {
      const filter: Filter = { type: 'null', column: 'col"name' };
      expect(filterToSQL(filter)).toBe('"col""name" IS NULL');
    });
  });

  describe('raw-sql filter', () => {
    it('should wrap raw SQL in parentheses', () => {
      const filter: Filter = {
        type: 'raw-sql',
        column: '__raw_sql_abc__',
        sql: 'age > 30',
        id: 'abc',
      };
      expect(filterToSQL(filter)).toBe('(age > 30)');
    });

    it('should handle complex SQL with OR clauses', () => {
      const filter: Filter = {
        type: 'raw-sql',
        column: '__raw_sql_def__',
        sql: "sex = 'male' OR age <= 18",
        id: 'def',
      };
      expect(filterToSQL(filter)).toBe("(sex = 'male' OR age <= 18)");
    });

    it('should pass through SQL as-is without escaping', () => {
      const filter: Filter = {
        type: 'raw-sql',
        column: '__raw_sql_ghi__',
        sql: '"height" IS NULL OR "height" < 140',
        id: 'ghi',
      };
      expect(filterToSQL(filter)).toBe('("height" IS NULL OR "height" < 140)');
    });
  });

  describe('filtersToWhereClause with raw-sql', () => {
    it('should never exclude raw-sql filters when excludeColumn is set', () => {
      const filters: Filter[] = [
        { type: 'range', column: 'price', min: 10, max: 100 },
        { type: 'raw-sql', column: '__raw_sql_abc__', sql: 'age > 30', id: 'abc' },
      ];
      // Excluding 'price' should keep the raw-sql filter
      const result = filtersToWhereClause(filters, 'price');
      expect(result).toBe('(age > 30)');
    });

    it('should include raw-sql filters alongside other filters', () => {
      const filters: Filter[] = [
        { type: 'range', column: 'price', min: 10, max: 100 },
        { type: 'raw-sql', column: '__raw_sql_abc__', sql: 'age > 30', id: 'abc' },
      ];
      const result = filtersToWhereClause(filters);
      expect(result).toBe('("price" >= 10 AND "price" < 100) AND (age > 30)');
    });

    it('should AND multiple raw-sql filters together', () => {
      const filters: Filter[] = [
        { type: 'raw-sql', column: '__raw_sql_a__', sql: 'age > 30', id: 'a' },
        { type: 'raw-sql', column: '__raw_sql_b__', sql: 'status = 1', id: 'b' },
      ];
      const result = filtersToWhereClause(filters);
      expect(result).toBe('(age > 30) AND (status = 1)');
    });
  });
});
