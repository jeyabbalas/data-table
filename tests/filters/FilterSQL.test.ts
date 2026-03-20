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

    it('should generate SQL for string (ISO date) range', () => {
      const filter: Filter = { type: 'range', column: 'date', min: '2024-01-01', max: '2024-12-31' };
      expect(filterToSQL(filter)).toBe("(\"date\" >= '2024-01-01' AND \"date\" < '2024-12-31')");
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

    it('should generate SQL for null value', () => {
      const filter: Filter = { type: 'point', column: 'notes', value: null };
      expect(filterToSQL(filter)).toBe('"notes" = NULL');
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
    it('should generate LIKE for contains mode', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'test', mode: 'contains' };
      expect(filterToSQL(filter)).toBe("\"name\" LIKE '%test%' ESCAPE '\\'");
    });

    it('should generate LIKE for starts mode', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'test', mode: 'starts' };
      expect(filterToSQL(filter)).toBe("\"name\" LIKE 'test%' ESCAPE '\\'");
    });

    it('should generate LIKE for ends mode', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'test', mode: 'ends' };
      expect(filterToSQL(filter)).toBe("\"name\" LIKE '%test' ESCAPE '\\'");
    });

    it('should generate regexp_matches for regex mode', () => {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: '^test.*$', mode: 'regex' };
      expect(filterToSQL(filter)).toBe("regexp_matches(\"name\", '^test.*$')");
    });

    describe('LIKE wildcard escaping', () => {
      it('should escape % in pattern', () => {
        const filter: Filter = { type: 'pattern', column: 'name', pattern: '50%', mode: 'contains' };
        expect(filterToSQL(filter)).toBe("\"name\" LIKE '%50\\%%' ESCAPE '\\'");
      });

      it('should escape _ in pattern', () => {
        const filter: Filter = { type: 'pattern', column: 'name', pattern: 'foo_bar', mode: 'contains' };
        expect(filterToSQL(filter)).toBe("\"name\" LIKE '%foo\\_bar%' ESCAPE '\\'");
      });

      it('should escape \\ in pattern', () => {
        const filter: Filter = { type: 'pattern', column: 'path', pattern: 'C:\\Users', mode: 'starts' };
        expect(filterToSQL(filter)).toBe("\"path\" LIKE 'C:\\\\Users%' ESCAPE '\\'");
      });

      it('should escape single quotes in pattern', () => {
        const filter: Filter = { type: 'pattern', column: 'name', pattern: "O'Brien", mode: 'contains' };
        expect(filterToSQL(filter)).toBe("\"name\" LIKE '%O''Brien%' ESCAPE '\\'");
      });

      it('should escape multiple special characters together', () => {
        const filter: Filter = { type: 'pattern', column: 'val', pattern: '50%_off\\', mode: 'ends' };
        expect(filterToSQL(filter)).toBe("\"val\" LIKE '%50\\%\\_off\\\\' ESCAPE '\\'");
      });

      it('should NOT escape LIKE characters in regex mode', () => {
        const filter: Filter = { type: 'pattern', column: 'name', pattern: '50%_test', mode: 'regex' };
        expect(filterToSQL(filter)).toBe("regexp_matches(\"name\", '50%_test')");
      });
    });
  });

  describe('unknown filter type', () => {
    it('should return TRUE and warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const filter = { type: 'unknown', column: 'x' } as unknown as Filter;
      expect(filterToSQL(filter)).toBe('TRUE');
      expect(warnSpy).toHaveBeenCalledWith('Unknown filter type: unknown');
      warnSpy.mockRestore();
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
