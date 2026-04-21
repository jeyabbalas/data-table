#!/usr/bin/env node
/**
 * check-css-vars.mjs
 *
 * Validates that the `--dt-*` CSS custom property reference table in
 * docs/guides/theming.md stays in sync with the variables actually declared
 * in `src/styles/*.css`. Exits non-zero on drift so the build fails fast.
 *
 * Usage:
 *   node scripts/check-css-vars.mjs           # validate
 *   node scripts/check-css-vars.mjs --emit    # print the expected table body
 *
 * Notes:
 *   - Counts only DECLARATIONS (`--dt-foo: value;`), not `var(--dt-foo)` uses.
 *   - Dedups across files.
 *   - The theming-guide table section is delimited by the markers
 *       <!-- dt-vars:start --> ... <!-- dt-vars:end -->
 *     so the script knows exactly what block to scan.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const stylesDir = join(repoRoot, 'src', 'styles');
const docPath = join(repoRoot, 'docs', 'guides', 'theming.md');
const docRelPath = 'docs/guides/theming.md';

const DECL_RE = /(--dt-[a-z0-9-]+)\s*:/g;

/** Collect all `--dt-*` declarations from CSS files. */
function collectDeclarations() {
  const files = readdirSync(stylesDir).filter((f) => f.endsWith('.css'));
  const declared = new Set();
  for (const file of files) {
    const source = readFileSync(join(stylesDir, file), 'utf8');
    for (const match of source.matchAll(DECL_RE)) {
      declared.add(match[1]);
    }
  }
  return declared;
}

/** Extract the `--dt-*` names referenced by the theming-guide table. */
function collectDocVars() {
  const doc = readFileSync(docPath, 'utf8');
  const start = doc.indexOf('<!-- dt-vars:start -->');
  const end = doc.indexOf('<!-- dt-vars:end -->');
  if (start === -1 || end === -1) {
    throw new Error(
      `${docRelPath} is missing the \`<!-- dt-vars:start -->\` / \`<!-- dt-vars:end -->\` markers. ` +
        'Add them around the `--dt-*` reference table so this check knows where to look.',
    );
  }
  const block = doc.slice(start, end);
  const names = new Set();
  // Match backtick-quoted `--dt-*` references within the block.
  for (const match of block.matchAll(/`(--dt-[a-z0-9-]+)`/g)) {
    names.add(match[1]);
  }
  return names;
}

function formatSet(set) {
  return [...set].sort().map((n) => `  ${n}`).join('\n');
}

function main() {
  const emitMode = process.argv.includes('--emit');

  const declared = collectDeclarations();

  if (emitMode) {
    // Emit a stub table body with names only — the human fills in descriptions.
    const sorted = [...declared].sort();
    for (const name of sorted) console.log(`| \`${name}\` | TODO |`);
    return;
  }

  const documented = collectDocVars();

  const missing = [...declared].filter((n) => !documented.has(n)).sort();
  const extra = [...documented].filter((n) => !declared.has(n)).sort();

  if (missing.length === 0 && extra.length === 0) {
    console.log(`check-css-vars: OK — ${declared.size} --dt-* variables match ${docRelPath}.`);
    return;
  }

  console.error(`check-css-vars: ${docRelPath} is out of sync with src/styles/*.css\n`);
  if (missing.length > 0) {
    console.error(`Declared in CSS but missing from ${docRelPath}:`);
    console.error(formatSet(new Set(missing)));
    console.error('');
  }
  if (extra.length > 0) {
    console.error(`Listed in ${docRelPath} but not declared in any CSS file:`);
    console.error(formatSet(new Set(extra)));
    console.error('');
  }
  console.error(`Fix: update the table under the \`<!-- dt-vars:start -->\` ... \`<!-- dt-vars:end -->\` block in ${docRelPath}.`);
  console.error('     Run `node scripts/check-css-vars.mjs --emit` to seed a fresh list.');
  process.exit(1);
}

main();
