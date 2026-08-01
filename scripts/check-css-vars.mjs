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
 * Two things are validated:
 *   1. NAMES — every `--dt-*` declared in CSS appears in the guide's table,
 *      and vice versa.
 *   2. VALUES — the guide's "Light default" / "Dark default" columns match
 *      what the CSS actually declares.
 *
 * (2) exists because names-only checking let the guide drift: three of four
 * token values in the text-colour table went stale when a contrast fix
 * darkened them, and nothing caught it. A reference table that documents
 * the wrong value is worse than one that documents nothing.
 *
 * Notes:
 *   - Counts only DECLARATIONS (`--dt-foo: value;`), not `var(--dt-foo)` uses.
 *   - Dedups across files.
 *   - The theming-guide table section is delimited by the markers
 *       <!-- dt-vars:start --> ... <!-- dt-vars:end -->
 *     so the script knows exactly what block to scan.
 *   - Value checking covers only tokens declared in the top-level `:root`
 *     block of `01-variables.css` (the theme palette). Tokens computed from
 *     others, or declared per-component, are documented as `—` and skipped.
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
  return [...set]
    .sort()
    .map((n) => `  ${n}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Value checking
// ---------------------------------------------------------------------------

const VARIABLES_FILE = join(stylesDir, '01-variables.css');

/** Remove `/* … *\/` comments so their braces never confuse the scanner. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extract the body of the first top-level rule whose selector matches
 * `selectorRe`.
 *
 * Top-level matters: `:root` appears twice — once at the top level holding
 * the light palette, and once nested inside
 * `@media (prefers-color-scheme: dark)` holding the dark one. Tracking brace
 * depth is what keeps those apart.
 */
function topLevelBlock(source, selectorRe) {
  const css = stripComments(source);
  let depth = 0;
  let selectorStart = 0;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0 && selectorRe.test(css.slice(selectorStart, i).trim())) {
        let level = 1;
        for (let j = i + 1; j < css.length; j++) {
          if (css[j] === '{') level++;
          else if (css[j] === '}' && --level === 0) return css.slice(i + 1, j);
        }
        return null;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      selectorStart = i + 1;
    } else if (ch === ';' && depth === 0) {
      selectorStart = i + 1;
    }
  }
  return null;
}

/** `--dt-foo: value;` pairs from a rule body, ignoring nested rules. */
function declarationsIn(body) {
  const map = new Map();
  if (!body) return map;
  for (const match of body.matchAll(/(--dt-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

/** Normalise a colour/length for comparison: case, spacing, short hex. */
function normalizeValue(raw) {
  let v = raw.trim().toLowerCase().replace(/\s+/g, '');
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (shortHex)
    v = `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`;
  return v;
}

/**
 * Parse the guide's variable tables into
 * `name -> { light, dark, line }`, skipping `—` (derived / not a literal).
 */
function collectDocValues() {
  const doc = readFileSync(docPath, 'utf8');
  const rows = new Map();
  const lines = doc.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // | `--dt-name` | Role | `#light` | `#dark` |
    const match = /^\|\s*`(--dt-[a-z0-9-]+)`\s*\|[^|]*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(
      lines[i],
    );
    if (!match) continue;
    const strip = (cell) => cell.replace(/`/g, '').trim();
    const light = strip(match[2]);
    const dark = strip(match[3]);
    if (light === '—' || dark === '—') continue;
    rows.set(match[1], { light, dark, line: i + 1 });
  }
  return rows;
}

/**
 * Compare documented values against the palette.
 *
 * A token with no dark override inherits its light value, so that is what
 * the dark column is expected to say.
 */
function checkValues() {
  const source = readFileSync(VARIABLES_FILE, 'utf8');
  const light = declarationsIn(topLevelBlock(source, /^:root$/));
  const dark = declarationsIn(topLevelBlock(source, /^\[data-dt-color-scheme='dark'\]$/));

  if (light.size === 0) {
    throw new Error(
      `check-css-vars: could not find the top-level \`:root\` block in ${VARIABLES_FILE}. ` +
        'The value check needs it — update this script if the palette moved.',
    );
  }

  const problems = [];
  for (const [name, documented] of collectDocValues()) {
    const declaredLight = light.get(name);
    // Only the palette is value-checked; component-local tokens are not.
    if (declaredLight === undefined) continue;
    const declaredDark = dark.get(name) ?? declaredLight;

    for (const [theme, docValue, cssValue] of [
      ['light', documented.light, declaredLight],
      ['dark', documented.dark, declaredDark],
    ]) {
      if (normalizeValue(docValue) !== normalizeValue(cssValue)) {
        problems.push(
          `  ${name} (${theme}, ${docRelPath}:${documented.line})\n` +
            `      documented: ${docValue}\n` +
            `      declared:   ${cssValue}`,
        );
      }
    }
  }
  return problems;
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
  const valueProblems = checkValues();

  if (missing.length === 0 && extra.length === 0 && valueProblems.length === 0) {
    console.log(
      `check-css-vars: OK — ${declared.size} --dt-* variables match ${docRelPath}, ` +
        'names and documented values.',
    );
    return;
  }

  console.error(`check-css-vars: ${docRelPath} is out of sync with src/styles/*.css\n`);
  if (valueProblems.length > 0) {
    console.error('Documented value does not match the declaration:');
    console.error(valueProblems.join('\n'));
    console.error('');
  }
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
  console.error(
    `Fix: update the table under the \`<!-- dt-vars:start -->\` ... \`<!-- dt-vars:end -->\` block in ${docRelPath}.`,
  );
  console.error('     Run `node scripts/check-css-vars.mjs --emit` to seed a fresh list.');
  process.exit(1);
}

main();
