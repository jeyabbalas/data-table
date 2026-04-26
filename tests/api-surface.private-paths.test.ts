import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Verifies no `.d.ts` declaration in `dist/` references a private filesystem
 * path or alias. Catches regressions where a refactor accidentally leaks
 * `from '@/internal/...'` (TS path alias) or an absolute path into the
 * published types.
 *
 * The test is gated on `dist/index.d.ts` existing — pre-build runs of
 * `npm test` skip it. CI (`npm run build && npm run test:coverage`) and
 * `prepublishOnly` always have a fresh `dist/`.
 */

const DIST_DIR = resolve(__dirname, '..', 'dist');
const ROOT_TYPES = join(DIST_DIR, 'index.d.ts');

function collectDtsFiles(dir: string, accumulator: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      collectDtsFiles(full, accumulator);
    } else if (entry.endsWith('.d.ts')) {
      accumulator.push(full);
    }
  }
  return accumulator;
}

const FORBIDDEN_PATH_PATTERNS = [
  // TypeScript path-alias leakage. The library's `tsconfig.json` defines
  // `paths: { "@/*": ["./src/*"] }` for editor convenience; aliases must
  // resolve to relative paths in emitted .d.ts.
  { name: '@/ alias', pattern: /from\s+['"]@\//u },
  // Absolute filesystem path leakage (rare but catastrophic — would tie the
  // tarball to the publishing user's machine layout).
  { name: 'absolute path', pattern: /from\s+['"](?:\/Users|\/home|[A-Z]:\\)/u },
  // Private-marker directories. The library doesn't currently use any of
  // these, but flagging them now means a future `src/internal/` or
  // `src/_private/` refactor is caught immediately.
  {
    name: 'private path segment',
    pattern: /from\s+['"][^'"]*\/(_private|internal|__private__)\//u,
  },
];

describe('Public .d.ts hygiene — no private paths leak through dist/', () => {
  if (!existsSync(ROOT_TYPES)) {
    it.skip('dist/ not built — skipping private-paths audit', () => {
      // Run `npm run build` first to populate dist/, or rely on CI / prepublishOnly.
    });
    return;
  }

  const files = collectDtsFiles(DIST_DIR);

  for (const { name, pattern } of FORBIDDEN_PATH_PATTERNS) {
    it(`no .d.ts file references a ${name}`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        if (pattern.test(content)) {
          offenders.push(file.slice(DIST_DIR.length + 1));
        }
      }
      expect(offenders, `Files leaking ${name} import:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });
  }

  it('every dist/.d.ts file imports only via relative or peer-package paths', () => {
    const importLine =
      /^\s*(?:import|export)\s+(?:type\s+)?(?:\*\s+as\s+\w+|\{[^}]*\}|\w+)\s+from\s+['"]([^'"]+)['"]/gmu;
    const offenders: { file: string; specifier: string }[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = importLine.exec(content)) !== null) {
        const specifier = match[1];
        if (!specifier) continue;
        const isRelative = specifier.startsWith('.');
        const isPeer = !specifier.startsWith('/') && !specifier.startsWith('@/') && !isRelative;
        if (!isRelative && !isPeer) {
          offenders.push({ file: file.slice(DIST_DIR.length + 1), specifier });
        }
      }
    }
    expect(
      offenders,
      `Non-relative / non-peer imports in published .d.ts:\n  ${offenders
        .map((o) => `${o.file}: ${o.specifier}`)
        .join('\n  ')}`,
    ).toEqual([]);
  });
});
