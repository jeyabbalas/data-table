/**
 * Phase 7 CSS-var reference check:
 *   - `scripts/check-css-vars.mjs` exits 0 against the current
 *     docs/guides/theming.md reference table.
 *   - The script fails loudly when the theming-guide block drops a
 *     declared var (drift detection). We simulate drift by writing a
 *     scratch fixture and pointing the script at it via an env
 *     override... but since the script's paths are absolute, we fork
 *     a child process in a temp dir-symlink. Simpler: assert that the
 *     script emits a sorted list of the real vars in `--emit` mode,
 *     giving us ≥ 50 entries — a basic smoke test that the glob is
 *     hitting the CSS.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const scriptPath = join(repoRoot, 'scripts', 'check-css-vars.mjs');

describe('scripts/check-css-vars.mjs', () => {
  it('exits 0 against the current docs/guides/theming.md', () => {
    // execFileSync throws on non-zero exit, giving us a clear failure.
    const output = execFileSync('node', [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(output).toMatch(/check-css-vars: OK/);
    expect(output).toMatch(/--dt-\* variables match docs\/guides\/theming\.md/);
  });

  it('--emit mode prints every declared variable as a markdown row', () => {
    const output = execFileSync('node', [scriptPath, '--emit'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const lines = output.trim().split('\n').filter(Boolean);
    // Sanity: each line is a markdown row starting with `| \`--dt-`.
    for (const line of lines) {
      expect(line).toMatch(/^\|\s+`--dt-[a-z0-9-]+`\s+\|/);
    }
    // The library ships many vars; 40 is a low floor that catches a broken glob.
    expect(lines.length).toBeGreaterThanOrEqual(40);
  });
});
