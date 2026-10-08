import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { missingDist } from './helpers/missingDist';

/**
 * The built worker chunk, `dist/assets/worker-*.js`, must stand alone: no
 * `import` of another file, static or dynamic, and no file found through
 * `import.meta.url`. Two ways of serving the worker depend on it
 * (docs/guides/csp-and-offline.md): a copy of the file at a URL of your own
 * (`bridgeOptions.workerUrl`), and a `blob:` URL that imports it
 * (`bridgeOptions.workerFactory`). Neither has the library's other files
 * beside it, and a relative import from a `blob:` URL does not resolve.
 *
 * Like the api-surface tests that read `dist/`, this skips until
 * `npm run build` has run, and fails in CI without a build.
 */

const DIST = resolve(__dirname, '..', 'dist');
const ASSETS = join(DIST, 'assets');

/**
 * Every reference to another module or file in `source`: `import … from`,
 * `export … from`, `import()`, `importScripts()`, and `import.meta`, through
 * which `new URL('./x', import.meta.url)` finds a file. Text that merely
 * holds such words, as the worker's template for DuckDB's own worker does,
 * is not code and does not count.
 */
function moduleReferences(source: string): string[] {
  const file = ts.createSourceFile(
    'chunk.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) {
      found.push(`static ${node.moduleSpecifier!.getText(file)}`);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      found.push(`dynamic ${node.arguments[0]?.getText(file) ?? ''}`);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'importScripts'
    ) {
      found.push(`importScripts ${node.arguments[0]?.getText(file) ?? ''}`);
    } else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      found.push('import.meta');
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('moduleReferences', () => {
  it('finds each kind of reference, and nothing in text', () => {
    expect(
      moduleReferences(
        [
          "import a from './a.js';",
          "export { b } from './b.js';",
          "const c = import('./c.js');",
          "const d = new URL('./d.wasm', import.meta.url);",
          "importScripts('https://cdn.example/e.js');",
          'const text = `importScripts(${JSON.stringify(url)}); import f from "./f.js";`;',
          'const words = \'import("./g.js")\';',
        ].join('\n'),
      ),
    ).toEqual([
      "static './a.js'",
      "static './b.js'",
      "dynamic './c.js'",
      'import.meta',
      "importScripts 'https://cdn.example/e.js'",
    ]);
  });
});

describe('dist/assets/worker-*.js stands alone', () => {
  if (!existsSync(join(DIST, 'data-table.js'))) {
    missingDist('worker-chunk audit');
    return;
  }

  const chunks = existsSync(ASSETS)
    ? readdirSync(ASSETS).filter((name) => /^worker-[\w-]+\.js$/.test(name))
    : [];

  it('the build emits one worker chunk', () => {
    expect(chunks).toHaveLength(1);
  });

  it('imports nothing, statically or dynamically, and finds no file through import.meta', () => {
    const source = readFileSync(join(ASSETS, chunks[0]!), 'utf8');
    expect(moduleReferences(source)).toEqual([]);
    // DuckDB's own worker is a blob: script that imports its bundle, as text.
    expect(source).toContain('importScripts(');
  });
});
