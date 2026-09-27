/**
 * A column's declared width must be the width it occupies.
 *
 * Header, body, pinned offsets, keyboard scroll-into-view and the scroll
 * extent all place columns by adding up `columnWidths`. That sum is only true
 * when header cells and body cells are `box-sizing: border-box`; under
 * content-box each column takes its padding and border on top. The library
 * has to say so itself, because a host page's global reset (the demo has
 * one) is not something it can count on. jsdom loads no stylesheet, so this
 * is asserted against the CSS source; `tests/browser/column-geometry.spec.ts`
 * checks the same thing in a real layout.
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

describe('column geometry', () => {
  it.each(['.dt-cell', '.dt-col-header'])('%s declares box-sizing: border-box', (selector) => {
    const own = rules().filter((r) => r.selectors.includes(selector));
    expect(own.length, `no rule for ${selector}`).toBeGreaterThan(0);
    expect(own.map((r) => boxSizing(r.body)).filter(Boolean)).toContain('border-box');
  });

  it('no rule switches a header or body cell back to content-box', () => {
    const offenders = rules()
      .filter((r) => boxSizing(r.body) === 'content-box')
      .flatMap((r) => r.selectors)
      .filter((s) => /\.dt-(cell|col-header)\b/.test(s));
    expect(offenders).toEqual([]);
  });
});
