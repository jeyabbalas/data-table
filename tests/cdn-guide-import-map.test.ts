/**
 * Keeps the CDN guide's import map (docs/integrations/cdn.md) at the
 * CodeMirror the library is built and tested with.
 *
 * The map sends each CodeMirror and Lezer package to an esm.sh `*` build at
 * an exact version: the seven the editor imports, and the six those import.
 * Each must be package-lock.json's version, the seven must fall inside
 * package.json's peer ranges, and the map must list every package the others
 * depend on, since a `*` build leaves its imports to the map. The guide's
 * policy names the map by its hash, which must be the hash of the map as
 * printed. tests/browser/self-hosted-bundles.spec.ts runs the page itself.
 *
 * A CodeMirror bump in package-lock.json fails this test until the guide
 * follows: move each pin, then put in the hash the failure names.
 *
 * It reads package.json, package-lock.json and the guide, not node_modules,
 * so it holds before an install, and compares versions itself, with no semver.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(repoRoot, file), 'utf8');

const pkg = JSON.parse(read('package.json')) as { peerDependencies: Record<string, string> };
const lock = JSON.parse(read('package-lock.json')) as {
  packages: Record<string, { version?: string; dependencies?: Record<string, string> }>;
};

const guide = read('docs/integrations/cdn.md');
const page = /^```html\n(<!doctype html>\n[\s\S]*?)^```$/m.exec(guide)?.[1] ?? '';
const importMap = /<script type="importmap">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? '';
const policy = /^```http\n(Content-Security-Policy:[\s\S]*?)^```$/m.exec(guide)?.[1] ?? '';

/** Each name the map sends to an esm.sh `*` build: the package built, and its version. */
const builds = Object.entries(
  (JSON.parse(importMap || '{"imports":{}}') as { imports: Record<string, string> }).imports,
).flatMap(([name, url]) => {
  const match = /^https:\/\/esm\.sh\/\*(.+)@([^@/]+)$/.exec(url);
  return match ? [{ name, built: match[1]!, version: match[2]! }] : [];
});

/** The version the map pins for each package. */
const pins = new Map(builds.map(({ name, version }) => [name, version]));

/** The version package-lock.json resolves `name` to. */
const locked = (name: string): string | undefined => lock.packages[`node_modules/${name}`]?.version;

/** Whether `version` satisfies `range`, a caret range (`^6.20.1`), the kind the peers use. */
function inCaretRange(version: string, range: string): boolean {
  const floor = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  const v = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!floor) throw new Error(`${range} is not a caret range`);
  if (!v) return false;
  const [major, minor, patch] = floor.slice(1).map(Number) as [number, number, number];
  const [x, y, z] = v.slice(1).map(Number) as [number, number, number];
  if (x !== major || (major === 0 && y !== minor) || (major === 0 && minor === 0 && z !== patch)) {
    return false;
  }
  return y > minor || (y === minor && z >= patch);
}

const CODEMIRROR_PEERS = Object.keys(pkg.peerDependencies).filter((name) =>
  /^@(codemirror|lezer)\//.test(name),
);

describe("the CDN guide's import map", () => {
  it('pins packages at esm.sh, and finds the page and the policy', () => {
    expect(page, 'docs/integrations/cdn.md has no ```html page').not.toBe('');
    expect(policy, 'docs/integrations/cdn.md has no ```http policy').not.toBe('');
    expect(pins.size).toBeGreaterThan(0);
  });

  it("sends each package name to that package's build", () => {
    const crossed = builds
      .filter(({ name, built }) => name !== built)
      .map(({ name, built }) => `${name} -> ${built}`);
    expect(crossed).toEqual([]);
  });

  it("pins every package at package-lock.json's version", () => {
    const stale = [...pins]
      .filter(([name, version]) => locked(name) !== version)
      .map(
        ([name, version]) =>
          `${name}: the guide pins ${version}, package-lock.json has ${locked(name)}`,
      );
    expect(stale, 'move these pins in docs/integrations/cdn.md, then its policy hash').toEqual([]);
  });

  it("maps each CodeMirror peer the editor imports, inside package.json's range", () => {
    const outside = CODEMIRROR_PEERS.filter((name) => {
      const version = pins.get(name);
      return version === undefined || !inCaretRange(version, pkg.peerDependencies[name]!);
    }).map((name) => `${name}@${pins.get(name)} for peer range ${pkg.peerDependencies[name]}`);
    expect(CODEMIRROR_PEERS.length).toBeGreaterThan(0);
    expect(outside).toEqual([]);
  });

  it('maps every package the pinned ones import, since the * builds leave them to it', () => {
    const missing = [...pins.keys()].flatMap((name) =>
      Object.keys(lock.packages[`node_modules/${name}`]?.dependencies ?? {})
        .filter((dependency) => !pins.has(dependency))
        .map((dependency) => `${name} imports ${dependency}`),
    );
    expect(missing).toEqual([]);
  });

  it('is named in the policy by the hash of its text as printed', () => {
    const hash = `'sha256-${createHash('sha256').update(importMap).digest('base64')}'`;
    expect(policy, `put ${hash} in the guide's policy, for the import map`).toContain(hash);
  });
});
