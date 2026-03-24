import { describe, it, expect, vi } from 'vitest';
import { filterToSQL, filtersToWhereClause, formatSQLValue } from '@/filters/FilterSQL';
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
      const filter: Filter = { type: 'range', column: 'price', min: 10, max: 100, maxInclusive: true };
      expect(filterToSQL(filter)).toBe('("price" >= 10 AND "price" <= 100)');
    });

    it('should generate SQL for string (ISO date) range', () => {
      const filter: Filter = { type: 'range', column: 'date', min: '2024-01-01', max: '2024-12-31' };
      expect(filterToSQL(filter)).toBe("(\"date\" >= '2024-01-01' AND \"date\" < '2024-12-31')");
    });

    it('should use <= for time range with maxInclusive', () => {
      const filter: Filter = { type: 'range', column: 'start_time', min: '10:00', max: '12:00', maxInclusive: true };
      expect(filterToSQL(filter)).toBe("(\"start_time\" >= '10:00' AND \"start_time\" <= '12:00')");
    });

    it('should generate SQL for Date object range', () => {
      const min = new Date('2024-01-01T00:00:00.000Z');
      const max = new Date('2024-12-31T00:00:00.000Z');
      const filter: Filter = { type: 'range', column: 'created', min, max };
      expect(filterToSQL(filter)).toBe(
        "(\"created\" >= '2024-01-01T00:00:00.000Z' AND \"created\" < '2024-12-31T00:00:00.000Z')"
      );
    });
  });

  describe('point filter', () => {
    it('should generate SQL for string value', () => {
      const filter: Filter = { type: 'point', column: 'status', value: 'active' };
      expect(filterToSQL(filter)).toBe("\"status\" = 'active'");
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
      expect(filterToSQL(filter)).toBe("\"category\" IN ('X')");
    });

    it('should generate (IN OR IS NULL) when includeNull is true', () => {
      const filter: Filter = { type: 'set', column: 'status', values: ['active'], includeNull: true };
      expect(filterToSQL(filter)).toBe("(\"status\" IN ('active') OR \"status\" IS NULL)");
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
      const filter: Filter = { type: 'not-set', column: 'active', values: [false], includeNull: true };
      expect(filterToSQL(filter)).toBe('("active" NOT IN (FALSE) OR "active" IS NULL)');
    });

    it('should generate IS NULL for empty not-set with includeNull', () => {
      const filter: Filter = { type: 'not-set', column: 'x', values: [], includeNull: true };
      expect(filterToSQL(filter)).toBe('"x" IS NULL');
    });

    it('should NOT add IS NULL when includeNull is absent', () => {
      const filter: Filter = { type: 'not-set', column: 'category', values: ['A'] };
      expect(filterToSQL(filter)).toBe("\"category\" NOT IN ('A')");
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
      const filter: Filter = { type: 'pattern', column: 'name', pattern: '^test.*$', mode: 'regex' };
      expect(filterToSQL(filter)).toBe("regexp_matches(CAST(\"name\" AS VARCHAR), '^test.*$')");
    });

    it('should use ILIKE for contains/starts/ends but regexp_matches for regex', () => {
      const contains: Filter = { type: 'pattern', column: 'name', pattern: 'Test', mode: 'contains' };
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
        const filter: Filter = { type: 'pattern', column: 'name', pattern: '50%', mode: 'contains' };
        expect(filterToSQL(filter)).toBe("CAST(\"name\" AS VARCHAR) ILIKE '%50\\%%' ESCAPE '\\'");
      });

      it('should escape _ in pattern', () => {
        const filter: Filter = { type: 'pattern', column: 'name', pattern: 'foo_bar', mode: 'contains' };
        expect(filterToSQL(filter)).toBe("CAST(\"name\" AS VARCHAR) ILIKE '%foo\\_bar%' ESCAPE '\\'");
      });

      it('should escape \\ in pattern', () => {
        const filter: Filter = { type: 'pattern', column: 'path', pattern: 'C:\\Users', mode: 'starts' };
        expect(filterToSQL(filter)).toBe("CAST(\"path\" AS VARCHAR) ILIKE 'C:\\\\Users%' ESCAPE '\\'");
      });

      it('should escape single quotes in pattern', () => {
        const filter: Filter = { type: 'pattern', column: 'name', pattern: "O'Brien", mode: 'contains' };
        expect(filterToSQL(filter)).toBe("CAST(\"name\" AS VARCHAR) ILIKE '%O''Brien%' ESCAPE '\\'");
      });

      it('should escape multiple special characters together', () => {
        const filter: Filter = { type: 'pattern', column: 'val', pattern: '50%_off\\', mode: 'ends' };
        expect(filterToSQL(filter)).toBe("CAST(\"val\" AS VARCHAR) ILIKE '%50\\%\\_off\\\\' ESCAPE '\\'");
      });

      it('should NOT escape ILIKE characters in regex mode', () => {
        const filter: Filter = { type: 'pattern', column: 'name', pattern: '50%_test', mode: 'regex' };
        expect(filterToSQL(filter)).toBe("regexp_matches(CAST(\"name\" AS VARCHAR), '50%_test')");
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
    expect(filtersToWhereClause(filters)).toBe("\"status\" = 'active'");
  });

  it('should AND-join multiple filters on different columns', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 100 },
      { type: 'point', column: 'active', value: true },
      { type: 'null', column: 'deleted_at' },
    ];
    const result = filtersToWhereClause(filters);
    expect(result).toBe(
      '("price" >= 10 AND "price" < 100) AND "active" = TRUE AND "deleted_at" IS NULL'
    );
  });

  it('should exclude specified column', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 100 },
      { type: 'point', column: 'status', value: 'active' },
    ];
    const result = filtersToWhereClause(filters, 'price');
    expect(result).toBe("\"status\" = 'active'");
    expect(result).not.toContain('price');
  });

  it('should return empty string when excluding the only filter', () => {
    const filters: Filter[] = [{ type: 'range', column: 'price', min: 10, max: 100 }];
    expect(filtersToWhereClause(filters, 'price')).toBe('');
  });
});
