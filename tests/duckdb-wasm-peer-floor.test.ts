/**
 * Keeps the `@duckdb/duckdb-wasm` peer floor at the version the library is
 * built with: the one package-lock.json resolves. So does every exact version
 * the docs and JSDoc tell self-hosters to pin.
 *
 * The library's worker bundles duckdb-wasm's JavaScript from the installed
 * devDependency and, by default, fetches that version's WASM and worker files
 * from jsDelivr, so any lockfile bump changes the DuckDB the library ships,
 * even one inside the peer range. Dependabot makes such bumps lockfile-only:
 * #56 moved 1.33.1-dev45.0 to 1.33.1-dev57.0 and left the floor behind. This
 * test fails until the floor moves with the lockfile, on purpose.
 *
 * Self-hosting copies DuckDB-WASM's files from an exact version, which
 * README.md, AGENTS.md, the docs and the `duckdbBundles` JSDoc name. Each
 * such version must be the one the worker is built with, too.
 *
 * It reads package.json, package-lock.json and those files, not
 * node_modules, so it holds before an install, and compares strings, so it
 * needs no semver.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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
      "built with, and package.json's peer floor and the docs' pins must follow it.",
    'A lockfile bump changes the DuckDB the library ships, so move the floor with it on purpose:',
    `  1. Set peerDependencies and devDependencies "${NAME}" to "^${built}" in package.json, ` +
      'and refresh package-lock.json (npm install --package-lock-only).',
    `  2. Move the exact version self-hosters are told to pin ${pin}to ${built}: in ` +
      'README.md, AGENTS.md, docs/ (the CSP and offline guide, the integration guides, ' +
      "troubleshooting, the API reference, the migration guide) and WorkerBridgeOptions' " +
      'duckdbBundles JSDoc in src/data/WorkerBridge.ts. The pins test lists each one.',
    `  3. Review src/worker/openFileFix.ts and openFileFixScript.js against ${built}'s worker: ` +
      'the fix is written for the version the worker is built with.',
    '  4. Add a changeset that raises the floor.',
    field,
  ].join('\n');
}

/**
 * A duckdb-wasm version in the exact form a self-hoster pins, such as
 * `1.33.1-dev57.0`. A record of what was measured names one too, but is not a
 * pin: `docs/performance.md` and `docs/dev/` keep theirs through a bump. A
 * caret range such as `^1.33.1-dev45.0` is a range, not a pin; package.json's
 * peer range is checked by the tests below.
 */
const EXACT_VERSION = /(?<!\^)\b\d+\.\d+\.\d+-dev\d+\.\d+\b/g;
const RECORDS = /^docs\/(?:performance\.md$|dev\/)/;

/** The files under `dir`, as paths from the repository root. */
function filesUnder(dir: string): string[] {
  return readdirSync(join(repoRoot, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(repoRoot, path)).isDirectory() ? filesUnder(path) : [path];
  });
}

/** Every exact version README.md, AGENTS.md, docs/ and src/ name, with where. */
const pins = ['README.md', 'AGENTS.md', ...filesUnder('docs'), ...filesUnder('src')]
  .map((file) => relative(repoRoot, join(repoRoot, file)).split('\\').join('/'))
  .filter((file) => /\.(?:md|ts|js)$/.test(file) && !RECORDS.test(file))
  .flatMap((file) =>
    readFileSync(join(repoRoot, file), 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        [...line.matchAll(EXACT_VERSION)].map(([version]) => ({ file, line: index + 1, version })),
      ),
  );

describe(`${NAME} peer floor`, () => {
  it('has a package-lock.json entry to follow', () => {
    expect(built, `package-lock.json has no "node_modules/${NAME}" entry`).toMatch(
      /^\d+\.\d+\.\d+/,
    );
  });

  it('is the version package-lock.json resolves', () => {
    expect(peer, moveTheFloor(`package.json peerDependencies["${NAME}"]`)).toBe(`^${built}`);
  });

  it('is the devDependency range too', () => {
    expect(dev, moveTheFloor(`package.json devDependencies["${NAME}"]`)).toBe(`^${built}`);
  });

  it('is the exact version the docs and the duckdbBundles JSDoc pin', () => {
    const stale = pins
      .filter(({ version }) => version !== built)
      .map(({ file, line, version }) => `${file}:${line} pins ${version}`);
    expect(stale, moveTheFloor('pins not at the built version')).toEqual([]);
  });

  it('finds the pins it checks', () => {
    const files = new Set(pins.map(({ file }) => file));
    for (const file of [
      'src/data/WorkerBridge.ts',
      'docs/guides/csp-and-offline.md',
      'README.md',
    ]) {
      expect(files, `no ${NAME} version found in ${file}`).toContain(file);
    }
  });
});
