/**
 * Error-code contract — lock the relationship between code strings thrown in
 * `src/` and the table in `docs/troubleshooting.md`.
 *
 * Why a separate test file: errors leak into consumer code (catch sites
 * branch on `err.code`). When a Phase 1 / Phase 3 / etc. landing introduces a
 * new code, the troubleshooting docs must be updated in the same change. This
 * test is the gate that fails CI if drift sneaks in.
 *
 * Captures three classes of code:
 *
 * 1. **Literal** codes — explicit `code: 'X'` keys at error construction
 *    (or warning-event payload) sites.
 * 2. **Default** codes — codes that come from a subclass constructor's
 *    `withDefault(options, 'X')` fallback when the caller did not supply
 *    one. These don't appear in literal grep but are still real.
 * 3. **Allowlisted** codes — annotation lifecycle codes are documented
 *    against `AnnotationError`'s JSDoc rather than per-row in the table to
 *    keep the table readable; a single consolidated row points readers at
 *    the JSDoc list.
 *
 * Drift detection: the union of (1) + (2) must equal the set of codes
 * documented in `docs/troubleshooting.md`'s error-code table modulo (3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const TROUBLESHOOTING_MD = join(REPO_ROOT, 'docs', 'troubleshooting.md');

// ---------------------------------------------------------------------------
// Default codes baked into each `*Error` subclass via withDefault(...).
// Mirrors src/core/errors.ts. Keep this list aligned by hand — the test
// asserts every entry shows up in the docs table.
// ---------------------------------------------------------------------------
const DEFAULT_CODES: Record<string, string> = {
  WorkerInitError: 'WORKER_CRASHED',
  WorkerTerminatedError: 'WORKER_TERMINATED',
  QueryError: 'QUERY_RUNTIME',
  LoadError: 'PARSE_FAILED',
  SQLValidationError: 'SQL_SYNTAX',
  DerivedColumnError: 'EXPRESSION_INVALID',
  PersistenceError: 'SAVE_FAILED',
  AnnotationError: 'ANNOTATION_FAILED',
  ExportError: 'EXPORT_FAILED',
  ConfigurationError: 'INVARIANT',
  DestroyedError: 'DESTROYED',
  DataTableError: 'UNKNOWN',
};

// ---------------------------------------------------------------------------
// Codes that the troubleshooting table consolidates under a single row
// pointing to the AnnotationError JSDoc. Adding a new ANNOTATION_* code does
// not require a new row in troubleshooting.md as long as it appears in the
// JSDoc list in src/core/errors.ts. Keep this prefix narrow.
// ---------------------------------------------------------------------------
const ALLOWLISTED_PREFIXES = ['ANNOTATION_'];

// ---------------------------------------------------------------------------
// Codes that exist in src/ but are intentionally not surfaced in the table.
// Phase 0+1 documented these as warning-only or as internal short-circuits.
// ---------------------------------------------------------------------------
const ALLOWLISTED_LITERAL_CODES = new Set<string>([
  // Warning-event codes are listed in the "Warning events" table below the
  // error-code table, not the error-code table itself.
  'STYLESHEET_MISSING',
  'PERSISTENCE_UNAVAILABLE',
]);

// ---------------------------------------------------------------------------
// Codes documented in the troubleshooting table but not currently thrown
// from any src/ throw site. Each entry must include a phase tag tracking
// when the wrapping is expected to land. Keep this list short — drift here
// becomes consumer-visible promises that the library does not keep.
// ---------------------------------------------------------------------------
const ALLOWLISTED_DOCUMENTED_BUT_UNWRAPPED = new Set<string>([
  // Phase 7 (export deep-dive) is expected to wrap navigator.clipboard
  // failures with code: 'CLIPBOARD_UNAVAILABLE'. Today the rejection bubbles
  // unwrapped from src/export/Clipboard.ts; the doc row is forward-looking.
  'CLIPBOARD_UNAVAILABLE',
]);

// ---------------------------------------------------------------------------
// Source walking & extraction.
// ---------------------------------------------------------------------------
function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTsFiles(full, acc);
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

// Codes returned indirectly via small helpers (e.g. classifyPersistenceFailure
// in AutoSave.ts which feeds `code: classifyPersistenceFailure(cause)`). These
// don't appear at literal `code: 'X'` construction sites but are real codes
// users will see. Add new entries here when introducing new code-classifier
// helpers — verify the helper actually feeds an error-construction path.
const INDIRECT_CODES: Record<string, string> = {
  PERSISTENCE_QUOTA_EXCEEDED: 'src/persistence/AutoSave.ts',
};

function extractLiteralCodes(): { codes: Set<string>; locations: Map<string, string[]> } {
  const codes = new Set<string>();
  const locations = new Map<string, string[]>();
  // Match: code: 'XXX' / code: "XXX" / code: `XXX`
  const pattern = /code:\s*['"`]([A-Z][A-Z0-9_]*)['"`]/gu;
  for (const file of walkTsFiles(SRC_DIR)) {
    const content = readFileSync(file, 'utf8');
    const rel = file.slice(REPO_ROOT.length + 1);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const code = match[1]!;
      codes.add(code);
      const list = locations.get(code) ?? [];
      list.push(rel);
      locations.set(code, list);
    }
  }
  // Merge in the indirect codes — verified by hand to be wired to error
  // construction in their declared file.
  for (const [code, src] of Object.entries(INDIRECT_CODES)) {
    codes.add(code);
    const list = locations.get(code) ?? [];
    list.push(src);
    locations.set(code, list);
  }
  return { codes, locations };
}

function extractDocCodes(): Set<string> {
  const md = readFileSync(TROUBLESHOOTING_MD, 'utf8');
  // The error-code table runs from the line after "## Error code reference"
  // until the next H2. Slice that section to avoid matching tokens elsewhere.
  const start = md.indexOf('## Error code reference');
  expect(start, 'expected an error-code reference section in troubleshooting.md').toBeGreaterThan(
    -1,
  );
  const restAfterStart = md.slice(start);
  const nextH2 = restAfterStart.indexOf('\n## ', 1);
  const section = nextH2 === -1 ? restAfterStart : restAfterStart.slice(0, nextH2);

  // Parse only the FIRST cell of each row to avoid catching descriptive
  // backtick tokens like `ANNOTATION_FILE_VERSION` that show up inside a
  // row's description column. Lines look like:
  //   | `CODE` | ClassName | description... |
  // or for consolidated annotation rows:
  //   | `CODE_A` / `CODE_B` / `CODE_C` | ClassName | ... |
  const codes = new Set<string>();
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue;
    // First cell: between the first and second pipe.
    const firstPipe = line.indexOf('|');
    const secondPipe = line.indexOf('|', firstPipe + 1);
    if (secondPipe === -1) continue;
    const firstCell = line.slice(firstPipe + 1, secondPipe);
    // Skip the table header / separator rows (no backticks).
    if (!firstCell.includes('`')) continue;
    const tokenPattern = /`([A-Z][A-Z0-9_]*(?:_\*)?)`/gu;
    let match: RegExpExecArray | null;
    while ((match = tokenPattern.exec(firstCell)) !== null) {
      codes.add(match[1]!);
    }
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Error-code contract: src/ ↔ docs/troubleshooting.md', () => {
  const { codes: literalCodes, locations } = extractLiteralCodes();
  const docCodes = extractDocCodes();

  it('every literal code thrown in src/ appears in troubleshooting.md (or is allowlisted)', () => {
    const missing: { code: string; sample: string }[] = [];
    for (const code of literalCodes) {
      if (docCodes.has(code)) continue;
      if (ALLOWLISTED_LITERAL_CODES.has(code)) continue;
      if (ALLOWLISTED_PREFIXES.some((p) => code.startsWith(p))) continue;
      const sample = (locations.get(code) ?? [''])[0]!;
      missing.push({ code, sample });
    }
    expect(
      missing,
      `Codes thrown in src/ but missing from docs/troubleshooting.md:\n  ${missing
        .map(({ code, sample }) => `${code}  (${sample})`)
        .join('\n  ')}`,
    ).toEqual([]);
  });

  it('every default subclass code appears in troubleshooting.md', () => {
    const missing: { subclass: string; code: string }[] = [];
    for (const [subclass, code] of Object.entries(DEFAULT_CODES)) {
      if (docCodes.has(code)) continue;
      if (ALLOWLISTED_PREFIXES.some((p) => code.startsWith(p))) continue;
      missing.push({ subclass, code });
    }
    expect(
      missing,
      `Subclass default codes missing from docs/troubleshooting.md:\n  ${missing
        .map(({ subclass, code }) => `${subclass} → ${code}`)
        .join('\n  ')}`,
    ).toEqual([]);
  });

  it('every code documented in troubleshooting.md is reachable from src/ (literal or default)', () => {
    const reachable = new Set<string>([...literalCodes, ...Object.values(DEFAULT_CODES)]);
    // The doc table consolidates annotation codes under a single row using
    // the "ANNOTATION_NOT_FOUND / ANNOTATION_*_IMMUTABLE / ..." pattern. The
    // wildcard tokens (suffix `_*`) are documentation shorthand, not real
    // codes; ignore them in reachability. ANNOTATION_-prefixed concrete codes
    // are reachable via the AnnotationStore literal `code:` keys.
    const stale: string[] = [];
    for (const code of docCodes) {
      if (code.endsWith('_*')) continue;
      if (reachable.has(code)) continue;
      if (ALLOWLISTED_DOCUMENTED_BUT_UNWRAPPED.has(code)) continue;
      stale.push(code);
    }
    expect(
      stale,
      `Codes in docs/troubleshooting.md that no longer appear in src/:\n  ${stale.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every literal code uses SCREAMING_SNAKE_CASE', () => {
    const wellFormed = /^[A-Z][A-Z0-9_]*$/u;
    const offenders = [...literalCodes].filter((c) => !wellFormed.test(c));
    expect(offenders).toEqual([]);
  });
});
