import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import ts from 'typescript';

/**
 * Locks JSDoc presence on the public API surface.
 *
 * Walks every named export of `src/index.ts` and `src/advanced.ts` via the
 * TypeScript compiler API and asserts each exported symbol has a non-empty
 * JSDoc documentation comment. Catches the regression where a new export
 * lands without docs — typedoc's markdown output is the consumer-facing
 * reference for `docs/api/` and it is downgraded silently when JSDoc is
 * missing.
 *
 * Implementation notes:
 * - Uses `getDocumentationComment` to follow re-export chains transparently
 *   (most exports in `index.ts` / `advanced.ts` are re-exports of declarations
 *   that live elsewhere).
 * - Symbols flagged `@internal` would already be stripped by typedoc's
 *   `excludeInternal: true` and by `tsconfig.build.json#stripInternal: true`,
 *   but we keep them in the walk so a missing-doc + absent-`@internal`
 *   combination still fails — there should be no truly undocumented public
 *   symbol.
 */

const ROOT_ENTRY = resolve(__dirname, '..', 'src', 'index.ts');
const ADVANCED_ENTRY = resolve(__dirname, '..', 'src', 'advanced.ts');

interface ExportEntry {
  name: string;
  hasJSDoc: boolean;
}

function collectExportsWithDocs(entryPath: string): ExportEntry[] {
  const program = ts.createProgram({
    rootNames: [entryPath],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      isolatedModules: true,
    },
  });

  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entryPath);
  if (!sourceFile) {
    throw new Error(`Could not load source file: ${entryPath}`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    throw new Error(`Could not resolve module symbol for: ${entryPath}`);
  }

  const exports = checker.getExportsOfModule(moduleSymbol);
  return exports.map((symbol) => {
    // Resolve aliased exports (re-exports flow through aliases) so we read
    // JSDoc from the original declaration site, not the re-export line.
    const resolved =
      (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
    const docs = resolved.getDocumentationComment(checker);
    const text = ts.displayPartsToString(docs).trim();
    return { name: symbol.getName(), hasJSDoc: text.length > 0 };
  });
}

describe('Public API JSDoc presence — root entry (src/index.ts)', () => {
  const entries = collectExportsWithDocs(ROOT_ENTRY);
  for (const entry of entries) {
    it(`"${entry.name}" has a non-empty JSDoc comment`, () => {
      expect(entry.hasJSDoc, `Add JSDoc to root export "${entry.name}".`).toBe(true);
    });
  }
});

describe('Public API JSDoc presence — /advanced entry (src/advanced.ts)', () => {
  const entries = collectExportsWithDocs(ADVANCED_ENTRY);
  for (const entry of entries) {
    it(`"${entry.name}" has a non-empty JSDoc comment`, () => {
      expect(entry.hasJSDoc, `Add JSDoc to /advanced export "${entry.name}".`).toBe(true);
    });
  }
});
