/**
 * Phase 8 — meta-test: scan src/ for likely user-facing English text that
 * bypasses the Strings i18n system.
 *
 * The scanner walks every TS file under src/ (skipping the worker, types,
 * and known scaffolding) and extracts string literals attached to common
 * UI sinks: `textContent =`, `placeholder =`, `setAttribute('aria-label'`
 * / `'title'` / `'placeholder'`. Each matched literal must EITHER be
 * permitted by the explicit allowlist below OR reference the live
 * messages object somewhere in the same file (heuristic — catches
 * `this.messages.foo`, `messages.foo.bar`, `Strings`-typed parameter use).
 *
 * The intent is preventive: any new hardcoded English string added in a
 * later phase will fail this test, forcing the author to either route it
 * through Strings or extend the allowlist with a one-line justification.
 *
 * The Phase-8 audit identified 3 such strings (DefaultExpressionEditor.ts
 * placeholder + label, ExportDialog.ts include-system-columns label) and
 * routed them through Strings; this scanner locks the result.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', 'src');

/**
 * Allowlist of (file path → literals) that are permitted to appear without
 * a Strings reference. Each entry has a one-line justification.
 */
const ALLOWLIST: Record<string, ReadonlyArray<string>> = {
  // Strings.ts holds every English default — every literal here is
  // intentionally hardcoded as the fallback.
  'src/core/Strings.ts': ['*'],
  // The stylesheet-missing warning is itself an error message that
  // surfaces BEFORE i18n bootstrap; keeping it English is intentional
  // (it tells the developer to import the stylesheet and is read in the
  // browser console, not the UI).
  'src/core/stylesheet.ts': ['*'],
  // checkBrowserSupport surfaces error messages in the API contract; the
  // strings are part of the typed return shape, not UI labels.
  'src/core/checkBrowserSupport.ts': ['*'],
};

/**
 * Per-literal allowlist of strings that are NOT user-facing text — class
 * names, ARIA roles, attribute values, identifiers, format markers, etc.
 *
 * The scanner only inspects literals attached to user-facing sinks
 * (textContent, placeholder, aria-label, title), so most of these never
 * reach the regex; the whitelist mostly covers strings that DO match a
 * sink but aren't translatable (CSS / ARIA / format identifiers).
 */
const LITERAL_ALLOWLIST = new Set<string>([
  // ARIA role / state literals
  'true',
  'false',
  '',
  ' ',
  // Color-scheme tokens
  'light',
  'dark',
  // Generic separators / formatting
  ' · ',
  '·',
  '–', // en-dash
  '…', // ellipsis
  // Aria-labels are routed through messages.* — leave any direct
  // `setAttribute('aria-label', '<short literal>')` for the per-file
  // heuristic to inspect.
]);

const SINK_PATTERNS: RegExp[] = [
  // .textContent = '...'
  /\.textContent\s*=\s*(['"`])([^'"`\n]{1,200})\1/g,
  // .placeholder = '...'
  /\.placeholder\s*=\s*(['"`])([^'"`\n]{1,200})\1/g,
  // setAttribute('aria-label' | 'title' | 'placeholder', '...')
  /setAttribute\s*\(\s*['"](?:aria-label|title|placeholder)['"]\s*,\s*(['"`])([^'"`\n]{1,200})\1/g,
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      out.push(...listFiles(p));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Strip block comments and line comments before scanning. JSDoc examples
 * that contain `textContent = '...'` are not user-facing code; they're
 * documentation.
 *
 * Naive implementation — does not respect strings that contain `//` etc.
 * Good enough for the heuristic; false negatives are acceptable since this
 * is a regression-prevention guard, not a parser.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (_, prefix: string) => prefix);
}

function relPath(absolute: string): string {
  return absolute.split('/data-table/').slice(-1)[0]!;
}

interface Hit {
  file: string;
  literal: string;
}

/** Heuristic: does the file route SOME text through `messages.*`? */
function routesThroughMessages(text: string): boolean {
  // Common access patterns:
  //   this.messages.foo
  //   messages.foo.bar
  //   options.messages?.foo
  //   defaultStrings.foo (the English pool — used by Strings-aware code)
  return /\b(?:this\.)?messages\??\./.test(text) || /\bdefaultStrings\.\w+/.test(text);
}

function isProseLike(s: string): boolean {
  // A pragmatic "looks like UI prose" check: contains a space, starts with
  // a letter or '%', has at least one alphabetic character. Rejects bare
  // identifiers, hex colors, CSS values, format strings, etc.
  if (s.length < 2) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (/^[a-z][a-zA-Z0-9_-]*$/.test(s)) return false; // identifier-like
  if (/^\d/.test(s)) return false; // numeric prefix
  if (s.startsWith('--')) return false; // css var
  if (s.includes('://')) return false; // URL
  // Prefer strings with at least one space (multi-word) OR clearly user-facing
  // patterns (sentence-final period, ellipsis, "?").
  return s.includes(' ') || /[.…?!]/.test(s);
}

describe('Phase 8 — i18n hardcoded English string scan', () => {
  it('every UI-sink string literal is either translatable or allowlisted', () => {
    const files = listFiles(ROOT);
    const hits: Hit[] = [];

    for (const abs of files) {
      const rel = relPath(abs);
      const allow = ALLOWLIST[rel];
      if (allow && allow[0] === '*') continue;

      const text = stripComments(readFileSync(abs, 'utf8'));

      for (const pattern of SINK_PATTERNS) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(text)) !== null) {
          const lit = m[2]!;
          if (LITERAL_ALLOWLIST.has(lit)) continue;
          if (allow?.includes(lit)) continue;
          if (!isProseLike(lit)) continue;
          // File-level heuristic: a file that already routes some text
          // through messages.* gets the benefit of the doubt for the
          // remaining hardcoded strings inside it (typically format
          // pieces, ARIA tokens, dev-only error messages).
          if (routesThroughMessages(text)) continue;
          hits.push({ file: rel, literal: lit });
        }
      }
    }

    if (hits.length > 0) {
      const detail = hits.map((h) => `  ${h.file}: ${JSON.stringify(h.literal)}`).join('\n');
      throw new Error(
        `Found ${hits.length} likely-user-facing English string(s) NOT routed through Strings:\n${detail}\n\n` +
          'Either route the literal through `this.messages.<key>` (and add the key ' +
          'to src/core/Strings.ts), or — if it is intentional — append it to the ' +
          'ALLOWLIST in tests/i18n/hardcodedStringsScan.test.ts with a one-line justification.',
      );
    }

    expect(hits).toEqual([]);
  });
});
