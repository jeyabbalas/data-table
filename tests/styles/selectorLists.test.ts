/**
 * A browser drops a whole rule when it cannot parse one selector in its
 * list. `:has()` is the one the stylesheet uses that the documented browser
 * floor lacks (Chrome 98–104, Firefox 94–120): listed beside `:hover`, it
 * took the pointer reveal of a narrow column's action bar down with it, and
 * the buttons the bar clips became unreachable. Asserted against the CSS
 * source, which jsdom does not load and a current Chromium parses whole.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(__dirname, '..', '..', 'src', 'styles');

/** Every selector list in the stylesheets, innermost rules only, as written. */
function selectorLists(): { file: string; selectors: string[] }[] {
  const out: { file: string; selectors: string[] }[] = [];
  for (const file of readdirSync(STYLES).filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(resolve(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const prelude = match[1]!.trim();
      if (prelude.startsWith('@')) continue;
      out.push({ file, selectors: prelude.split(',').map((s) => s.trim()) });
    }
  }
  return out;
}

describe('selectors a browser may not know stand alone', () => {
  it('lists no :has() selector beside another', () => {
    const shared = selectorLists()
      .filter(({ selectors }) => selectors.length > 1 && selectors.some((s) => s.includes(':has(')))
      .map(({ file, selectors }) => `${file}: ${selectors.join(', ')}`);
    expect(shared).toEqual([]);
  });

  it('backs every :has() reveal of the action bar with a :focus-within one for browsers without it', () => {
    const css = readFileSync(resolve(STYLES, '03-columns.css'), 'utf8');
    const fallback =
      /@supports not selector\(:has\(\*\)\)\s*\{\s*\.dt-col-action-panel:focus-within\s*\{[^}]*min-width:\s*max-content/;
    expect(css).toMatch(fallback);
  });
});
