/**
 * The keyboard cursor ring must survive every tint that can land on the same
 * element.
 *
 * `.dt-col-header--focused` and `.dt-cell--focused` set `box-shadow`, and so
 * do the annotation and active-filter classes — at equal specificity, later in
 * the file. Whichever comes last wins outright, so a cursor sitting on an
 * annotated column silently loses its only visual indicator (WCAG 2.4.7)
 * unless every combination is explicitly re-composed. That is invisible to
 * jsdom, which loads no stylesheet, and invisible to axe, which cannot know a
 * ring was expected — so it is asserted against the CSS source instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(__dirname, '..', '..', 'src', 'styles');

function selectorsSetting(file: string, property: string): string[] {
  const css = readFileSync(resolve(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (new RegExp(`(^|;)\\s*${property}\\s*:`).test(match[2]!)) {
      out.push(...match[1]!.split(',').map((s) => s.trim()));
    }
  }
  return out;
}

const SEVERITIES = ['error', 'warning', 'info'] as const;

describe('cursor ring survives competing box-shadow tints', () => {
  const headerSelectors = selectorsSetting('03-columns.css', 'box-shadow');
  const cellSelectors = selectorsSetting('05-data-grid.css', 'box-shadow');

  function composed(selectors: string[], focusClass: string, ...required: string[]): boolean {
    return selectors.some(
      (sel) => sel.includes(focusClass) && required.every((r) => sel.includes(r)),
    );
  }

  it.each(SEVERITIES)('column header keeps its ring when annotated (%s)', (severity) => {
    expect(
      composed(
        headerSelectors,
        '.dt-col-header--focused',
        `.dt-col-header--annotation-${severity}`,
      ),
      `.dt-col-header--annotation-${severity} sets box-shadow after .dt-col-header--focused and would erase the cursor ring`,
    ).toBe(true);
  });

  it.each(SEVERITIES)(
    'column header keeps its ring when filtered AND annotated (%s)',
    (severity) => {
      expect(
        composed(
          headerSelectors,
          '.dt-col-header--focused',
          '.dt-col-header--filtered',
          `.dt-col-header--annotation-${severity}`,
        ),
      ).toBe(true);
    },
  );

  it('column header keeps its ring when filtered', () => {
    expect(composed(headerSelectors, '.dt-col-header--focused', '.dt-col-header--filtered')).toBe(
      true,
    );
  });

  it.each(SEVERITIES)('body cell keeps its ring when annotated (%s)', (severity) => {
    // The body already did this correctly; lock it in alongside the header so
    // the two indicators cannot drift apart again.
    expect(composed(cellSelectors, '.dt-cell--focused', `.dt-cell--annotation-${severity}`)).toBe(
      true,
    );
  });
});
