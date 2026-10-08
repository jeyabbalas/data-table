/**
 * Keeps the `@duckdb/duckdb-wasm` peer floor at the version the library is
 * built with: the one package-lock.json resolves.
 *
 * The library's worker bundles duckdb-wasm's JavaScript from the installed
 * devDependency and, by default, fetches that version's WASM and worker files
 * from jsDelivr, so any lockfile bump changes the DuckDB the library ships,
 * even one inside the peer range. Dependabot makes such bumps lockfile-only:
 * #56 moved 1.33.1-dev45.0 to 1.33.1-dev57.0 and left the floor behind. This
 * test fails until the floor moves with the lockfile, on purpose.
 *
 * It reads package.json and package-lock.json, not node_modules, so it holds
 * before an install, and compares strings, so it needs no semver.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = '@duckdb/duckdb-wasm';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file: string): unknown => JSON.parse(readFileSync(join(repoRoot, file), 'utf8'));

const pkg = readJson('package.json') as {
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lock = readJson('package-lock.json') as {
  packages?: Record<string, { version?: string }>;
};

const built = lock.packages?.[`node_modules/${NAME}`]?.version;
const peer = pkg.peerDependencies?.[NAME];
const dev = pkg.devDependencies?.[NAME];

/**
 * The failure message: what is wrong and how to move the floor. Its last line
 * names the field, which vitest follows with ": expected … to be …".
 */
function moveTheFloor(field: string): string {
  const floor = peer?.replace(/^\^/, '');
  const pin = floor && floor !== built ? `from ${floor} ` : '';
  return [
    `package-lock.json resolves ${NAME} to ${built}, the version the library's worker is ` +
      "built with, and package.json's peer floor must follow it.",
    'A lockfile bump changes the DuckDB the library ships, so move the floor with it on purpose:',
    `  1. Set peerDependencies and devDependencies "${NAME}" to "^${built}" in package.json, ` +
      'and refresh package-lock.json (npm install --package-lock-only).',
    `  2. Move the exact version the docs tell self-hosters to pin ${pin}to ${built}, in ` +
      'docs/guides/csp-and-offline.md and the integration guides under docs/integrations/.',
    `  3. Review src/worker/openFileFix.ts and openFileFixScript.js against ${built}'s worker: ` +
      'the fix is written for the version the worker is built with.',
    '  4. Add a changeset that raises the floor.',
    `package.json ${field}`,
  ].join('\n');
}

describe(`${NAME} peer floor`, () => {
  it('has a package-lock.json entry to follow', () => {
    expect(built, `package-lock.json has no "node_modules/${NAME}" entry`).toMatch(
      /^\d+\.\d+\.\d+/,
    );
  });

  it('is the version package-lock.json resolves', () => {
    expect(peer, moveTheFloor(`peerDependencies["${NAME}"]`)).toBe(`^${built}`);
  });

  it('is the devDependency range too', () => {
    expect(dev, moveTheFloor(`devDependencies["${NAME}"]`)).toBe(`^${built}`);
  });
});
