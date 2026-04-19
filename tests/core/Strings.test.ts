import { describe, it, expect } from 'vitest';
import {
  defaultStrings,
  mergeStrings,
  type Strings,
  type DeepPartial,
} from '@/core/Strings';

describe('Strings', () => {
  describe('defaultStrings', () => {
    it('ships English defaults for every leaf', () => {
      expect(defaultStrings.common.apply).toBe('Apply');
      expect(defaultStrings.common.cancel).toBe('Cancel');
      expect(defaultStrings.filters.panelTitle).toBe('Filter');
      expect(defaultStrings.export.title).toBe('Export Data');
      expect(defaultStrings.presets.title).toBe('Filter Presets');
      expect(defaultStrings.derived.newColumnTitle).toBe('New Derived Column');
      expect(defaultStrings.a11y.ascending).toBe('ascending');
      expect(defaultStrings.statistics.allNull).toBe('all null');
      expect(defaultStrings.errors.stylesheetMissing).toMatch(
        /Stylesheet missing/,
      );
    });

    it('templates accept runtime args and return sensible English', () => {
      expect(defaultStrings.a11y.filtersActive(3, 10, 100)).toBe(
        '3 filters active, showing 10 of 100 rows',
      );
      expect(defaultStrings.a11y.filtersActive(1, 5, 10)).toBe(
        '1 filter active, showing 5 of 10 rows',
      );
      expect(defaultStrings.a11y.noFilters(1234)).toBe('Showing all 1,234 rows');
      expect(
        defaultStrings.a11y.sortedBy(['Price ascending', 'Name descending']),
      ).toBe('sorted by Price ascending, then Name descending');
      expect(defaultStrings.statistics.rowCount(1234)).toBe('1,234 rows');
      expect(defaultStrings.statistics.rowCount(1)).toBe('1 row');
      expect(defaultStrings.filters.panelTitleForColumn('price')).toBe(
        'Filter: price',
      );
      expect(defaultStrings.derived.vectorInfoText('integer', 42)).toBe(
        'Vector column (integer), 42 values',
      );
    });

    it('chip description templates build in/not-in strings', () => {
      const d = defaultStrings.filters.chipDescriptions;
      expect(d.inSet('a, b', false)).toBe('in {a, b}');
      expect(d.inSet('a, b', true)).toBe('in {a, b} or null');
      expect(d.notInSet('x', false)).toBe('not in {x}');
      expect(d.valueListMore(3)).toBe('+3 more');
    });
  });

  describe('mergeStrings', () => {
    it('returns defaults unchanged when overrides is undefined', () => {
      const merged = mergeStrings(defaultStrings, undefined);
      expect(merged).toEqual(defaultStrings);
    });

    it('returns deep-equal copy for empty overrides', () => {
      const merged = mergeStrings(defaultStrings, {});
      expect(merged.common.apply).toBe(defaultStrings.common.apply);
      expect(merged.filters.panelTitle).toBe(defaultStrings.filters.panelTitle);
    });

    it('overrides a leaf string without touching siblings', () => {
      const merged = mergeStrings(defaultStrings, {
        export: { title: 'Exporter' },
      });
      expect(merged.export.title).toBe('Exporter');
      expect(merged.export.formatLabel).toBe(defaultStrings.export.formatLabel);
      expect(merged.common.apply).toBe(defaultStrings.common.apply);
    });

    it('overrides a deeply nested leaf', () => {
      const merged = mergeStrings(defaultStrings, {
        export: { csv: { delimiters: { tab: 'Tabulator' } } },
      });
      expect(merged.export.csv.delimiters.tab).toBe('Tabulator');
      expect(merged.export.csv.delimiters.comma).toBe('Comma (,)');
      expect(merged.export.csv.headersLabel).toBe(
        defaultStrings.export.csv.headersLabel,
      );
    });

    it('replaces function-valued templates wholesale', () => {
      const custom = (n: number, shown: number, total: number) =>
        `fr: ${n} filtres, ${shown}/${total}`;
      const merged = mergeStrings(defaultStrings, {
        a11y: { filtersActive: custom },
      });
      expect(merged.a11y.filtersActive(2, 5, 10)).toBe('fr: 2 filtres, 5/10');
      // Other a11y leaves unchanged
      expect(merged.a11y.ascending).toBe(defaultStrings.a11y.ascending);
    });

    it('empty string override wins over the default (explicit intent)', () => {
      const merged = mergeStrings(defaultStrings, {
        common: { apply: '' },
      });
      expect(merged.common.apply).toBe('');
    });

    it('ignores undefined values in overrides (falls back to base)', () => {
      const merged = mergeStrings(defaultStrings, {
        common: { apply: undefined },
      } as DeepPartial<Strings>);
      expect(merged.common.apply).toBe(defaultStrings.common.apply);
    });

    it('does not mutate the base object', () => {
      // Capture a single leaf and a function reference; mergeStrings should
      // not touch `defaultStrings` itself.
      const originalTitle = defaultStrings.export.title;
      const originalFn = defaultStrings.a11y.filtersActive;
      mergeStrings(defaultStrings, {
        export: { title: 'Mutated' },
        a11y: { filtersActive: () => 'custom' },
      });
      expect(defaultStrings.export.title).toBe(originalTitle);
      expect(defaultStrings.a11y.filtersActive).toBe(originalFn);
    });
  });
});
