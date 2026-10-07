/**
 * A declared size must be the size an element occupies.
 *
 * Header, body, pinned offsets, keyboard scroll-into-view and the scroll
 * extent all place columns by adding up `columnWidths`; the virtual scroller
 * places rows at multiples of `rowHeight`; the table root fills its container
 * with `height: 100%`. Those sums are only true when the elements are
 * `box-sizing: border-box`. Under content-box each column takes its padding
 * and border on top of its width, each row its bottom border on top of its
 * height, and the root its border on top of 100%. The library has to say so
 * itself, because a host page's global reset (the demo has one) is not
 * something it can count on. jsdom loads no stylesheet, so this is asserted
 * against the CSS source; `tests/browser/column-geometry.spec.ts` checks the
 * same thing in a real layout.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(__dirname, '..', '..', 'src', 'styles');

/** Every `selector { declarations }` rule in the stylesheets, comments stripped. */
function rules(): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = [];
  for (const file of readdirSync(STYLES).filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(resolve(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ selectors: match[1]!.split(',').map((s) => s.trim()), body: match[2]! });
    }
  }
  return out;
}

function boxSizing(body: string): string | null {
  return /(?:^|;)\s*box-sizing\s*:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? null;
}

const SIZED = ['.dt-cell', '.dt-col-header', '.dt-row', '.dt-root', '.dt-table-wrapper'];

describe('grid geometry', () => {
  it.each(SIZED)('%s declares box-sizing: border-box', (selector) => {
    const own = rules().filter((r) => r.selectors.includes(selector));
    expect(own.length, `no rule for ${selector}`).toBeGreaterThan(0);
    expect(own.map((r) => boxSizing(r.body)).filter(Boolean)).toContain('border-box');
  });

  it('no rule switches one of them back to content-box', () => {
    const offenders = rules()
      .filter((r) => boxSizing(r.body) === 'content-box')
      .flatMap((r) => r.selectors)
      .filter((s) => /\.dt-(cell|col-header|row|root|table-wrapper)\b/.test(s));
    expect(offenders).toEqual([]);
  });
});

describe('header action bar', () => {
  // Its controls are 22 px, under WCAG 2.2's 24 px target size, and pass
  // SC 2.5.8 on spacing: 2 px between neighbours puts their centres 24 px
  // apart. `space-between` alone packs them edge to edge once the bar is
  // too narrow, as a nested column's six were at 150 px, and whenever the
  // bar is revealed at `max-content`. `tests/browser/header-targets.spec.ts`
  // measures the centres in a real layout.
  it('keeps 2 px between its controls', () => {
    const gaps = rules()
      .filter((r) => r.selectors.includes('.dt-col-action-panel'))
      .map((r) => /(?:^|;)\s*column-gap\s*:\s*([^;]+)/.exec(r.body)?.[1]?.trim())
      .filter(Boolean);
    expect(gaps).toEqual(['2px']);
  });
});
