/**
 * The table's horizontal scroll has one writer: `ColumnWindowController`.
 *
 * Scroll writers that did not know about each other undid each other's
 * scrolls: a filter change's hold undid the wheel, a late restore undid the
 * keyboard, and a header synced back into a smooth scroll stopped it short.
 * Each of those took a browser test to find. This one fails as soon as a new
 * writer appears anywhere else, before it has had the chance.
 *
 * It reads the syntax tree, so comments and strings cannot hide a write or
 * fake one. What it cannot see is a scroll the browser makes itself: focusing
 * a header button without `preventScroll`, as `ModalHost` does when a panel
 * closes, scrolls the header, and the controller follows it like any other
 * scroll.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
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

/** Methods that scroll the element they are called on. */
const SCROLL_METHODS = new Set([
  'scroll',
  'scrollTo',
  'scrollBy',
  'scrollIntoView',
  'scrollIntoViewIfNeeded',
]);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** The name a property access or element access reads, if it is a literal one. */
function accessedName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

/**
 * Every assignment to `scrollLeft`, increment or decrement of it, and call of
 * a scrolling method, as `line: text`.
 */
function scrollWrites(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const note = (node: ts.Node): void => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push(`${line + 1}: ${node.getText(source).split('\n')[0]}`);
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      accessedName(node.left) === 'scrollLeft'
    ) {
      note(node);
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      accessedName(node.operand) === 'scrollLeft'
    ) {
      note(node);
    } else if (
      ts.isCallExpression(node) &&
      SCROLL_METHODS.has(accessedName(node.expression) ?? '')
    ) {
      note(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const files = sources(SRC).map((path) => relative(SRC, path).split('\\').join('/'));
const writes = new Map(
  files.map((file) => [file, scrollWrites(file, readFileSync(join(SRC, file), 'utf8'))]),
);

describe('horizontal scroll writers', () => {
  it('are only the column window controller and the toolbars', () => {
    const elsewhere = [...writes].filter(([file, found]) => found.length > 0 && !ALLOWED.has(file));
    expect(Object.fromEntries(elsewhere)).toEqual({});
  });

  it('has no allowance left over for a file that no longer writes', () => {
    for (const file of ALLOWED.keys()) {
      expect(writes.get(file)?.length, file).toBeGreaterThan(0);
    }
  });

  it('sees writes however they are spelled, and none in comments or strings', () => {
    const found = scrollWrites(
      'probe.ts',
      [
        'el.scrollLeft = 1;',
        'el.scrollLeft += 1;',
        'el.scrollLeft ??= 1;',
        "el['scrollLeft'] = 1;",
        'el.scroll({ left: 1 });',
        'el.scrollIntoViewIfNeeded();',
        'el.scrollLeft++;',
        '--el.scrollLeft;',
        'const x = el.scrollLeft === 1;',
        'el.scrollToRow(1);',
        '// el.scrollLeft = 1;',
        "const s = 'el.scrollTo(0, 0)';",
      ].join('\n'),
    ).map((write) => Number(write.split(':')[0]));
    expect(found).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
