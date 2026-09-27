/**
 * The table's horizontal scroll has one writer: `ColumnWindowController`.
 *
 * Scroll writers that did not know about each other undid each other's
 * scrolls: a filter change's hold undid the wheel, a late restore undid the
 * keyboard, and a header synced back into a smooth scroll stopped it short.
 * Each of those took a browser test to find. This one fails as soon as a new
 * writer appears anywhere else, before it has had the chance.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');

/**
 * Files allowed to scroll sideways, and why. The two outside `src/table`
 * scroll toolbars of their own, not the grid.
 */
const ALLOWED = new Map([
  ['table/ColumnWindowController.ts', 'the one writer for the grid'],
  ['core/RovingTabindex.ts', 'reveals a toolbar control in its own scroll box'],
  ['filters/FilterBar.ts', 'scrolls the filter chip strip to a new chip'],
]);

/** An assignment to `scrollLeft`, or a call that scrolls. */
const WRITE = /\.scrollLeft\s*[-+]?=(?!=)|\.scroll(?:To|By|IntoView)\s*\(/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** The source without its comments, whose examples may well scroll. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('horizontal scroll writers', () => {
  it('are only the column window controller and the toolbars', () => {
    const writers = sources(SRC)
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .filter((file) => WRITE.test(code(readFileSync(join(SRC, file), 'utf8'))));

    expect(writers.filter((file) => !ALLOWED.has(file))).toEqual([]);
  });

  it('has no allowance left over for a file that no longer writes', () => {
    for (const file of ALLOWED.keys()) {
      expect(WRITE.test(code(readFileSync(join(SRC, file), 'utf8'))), file).toBe(true);
    }
  });
});
