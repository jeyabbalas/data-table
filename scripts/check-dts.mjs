#!/usr/bin/env node
/**
 * check-dts.mjs
 *
 * Type-checks the declarations the build emits (`dist/**\/*.d.ts`), which
 * `tsc --noEmit` over `src/` never sees. They can differ: the build emits
 * with `stripInternal`, which drops whatever an `@internal` tag is attached
 * to, and a tag in a file's opening comment is attached to the file's first
 * statement, usually an import. `LazyVizController.d.ts` shipped without its
 * `ColumnSchema` import that way. Exits non-zero on any error in `dist/`, so
 * the build fails.
 *
 * Errors inside dependencies' declarations are not reported: consumers
 * compile with `skipLibCheck` or have those packages' own types installed,
 * and `@duckdb/duckdb-wasm`'s need `@types/emscripten`, which this package
 * does not depend on.
 *
 * Usage (after `tsc -p tsconfig.build.json`):
 *   node scripts/check-dts.mjs
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

function declarationFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...declarationFiles(path));
    else if (entry.name.endsWith('.d.ts')) files.push(path);
  }
  return files;
}

const files = existsSync(distDir) ? declarationFiles(distDir) : [];
if (files.length === 0) {
  console.error(`check-dts: no declarations under ${distDir}; build them first.`);
  process.exit(1);
}

const program = ts.createProgram(files, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
});

// Compare with TypeScript's own spelling of the path, forward slashes. A
// diagnostic with no file (a bad option, a missing lib) is kept: it means
// nothing was checked as intended.
const distPrefix = ts.sys.resolvePath(distDir).replace(/\\/g, '/') + '/';
const errors = ts
  .getPreEmitDiagnostics(program)
  .filter((d) => !d.file || d.file.fileName.replace(/\\/g, '/').startsWith(distPrefix));

if (errors.length > 0) {
  const host = {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  };
  console.error(ts.formatDiagnostics(errors, host));
  console.error(`check-dts: ${errors.length} error(s) in the emitted declarations.`);
  process.exit(1);
}
console.log(`check-dts: ${files.length} declaration files type-check.`);
