import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { missingDist } from './helpers/missingDist';

/**
 * Every error class the built package exports reports its own name.
 *
 * The build renames classes: rolldown emits `var a = class extends e {…}`,
 * so a name read off a class is a letter in `dist/`, though never in
 * `src/`, which every other test runs. Up to 0.8.0, `new LoadError('x')`
 * from the package had the name `a`, and `String(error)`, `toJSON().name`
 * and stack headers had it too. This test imports the built entries, finds
 * every class they export whose instances are errors, and checks what each
 * one reports against its export name.
 *
 * Gated on `dist/` existing — bare `npm test` skips. CI builds first, so
 * the test always runs there; in CI a missing `dist/` fails it instead.
 */

const DIST = resolve(__dirname, '..', 'dist');
const ENTRIES = [
  ['root', resolve(DIST, 'data-table.js')],
  ['/advanced', resolve(DIST, 'advanced.js')],
] as const;

/** The error classes the root entry exports; finding fewer means the search broke. */
const ROOT_ERROR_CLASSES = [
  'AnnotationError',
  'ConfigurationError',
  'DataTableError',
  'DerivedColumnError',
  'DestroyedError',
  'ExportError',
  'LoadError',
  'PersistenceError',
  'QueryError',
  'SQLValidationError',
  'WorkerInitError',
  'WorkerTerminatedError',
];

type ErrorClass = (new (message: string) => Error) & { name: string };

const built = ENTRIES.every(([, path]) => existsSync(path));

/** Each entry's exports, imported from `dist/`. */
const modules: [entry: string, exports: Record<string, unknown>][] = built
  ? await Promise.all(
      ENTRIES.map(
        async ([entry, path]) =>
          [entry, (await import(pathToFileURL(path).href)) as Record<string, unknown>] as [
            string,
            Record<string, unknown>,
          ],
      ),
    )
  : [];

/** The classes `exports` holds whose instances are errors, by export name. */
function errorClasses(exports: Record<string, unknown>): [string, ErrorClass][] {
  return Object.entries(exports).filter(
    (entry): entry is [string, ErrorClass] =>
      typeof entry[1] === 'function' && entry[1].prototype instanceof Error,
  );
}

/**
 * `read` of an error of each class every entry exports, keyed by entry and
 * export name, beside what it should be for that export name.
 */
function reportedAndExpected<T>(
  read: (error: Error, ErrorClass: ErrorClass) => T,
  expected: (exportName: string) => T,
): { reported: Record<string, T>; expected: Record<string, T> } {
  const pairs = modules.flatMap(([entry, exports]) =>
    errorClasses(exports).map(([exportName, ErrorClass]) => ({
      key: `${entry} ${exportName}`,
      reported: read(new ErrorClass('m'), ErrorClass),
      expected: expected(exportName),
    })),
  );
  return {
    reported: Object.fromEntries(pairs.map((pair) => [pair.key, pair.reported])),
    expected: Object.fromEntries(pairs.map((pair) => [pair.key, pair.expected])),
  };
}

describe('Error classes in dist/ report their own names', () => {
  if (!built) {
    missingDist('error-name audit');
    return;
  }

  const root = modules.find(([entry]) => entry === 'root')![1];

  it('finds the error classes the root entry exports', () => {
    expect(errorClasses(root).map(([exportName]) => exportName)).toEqual(
      expect.arrayContaining(ROOT_ERROR_CLASSES),
    );
  });

  it('error.name is the export name', () => {
    const { reported, expected } = reportedAndExpected(
      (error) => error.name,
      (exportName) => exportName,
    );
    expect(reported).toEqual(expected);
  });

  it('the class is named after its export too, as error.constructor.name reads it', () => {
    const { reported, expected } = reportedAndExpected(
      (error, ErrorClass) => [ErrorClass.name, error.constructor.name],
      (exportName) => [exportName, exportName],
    );
    expect(reported).toEqual(expected);
  });

  it('String(error) starts with it', () => {
    const { reported, expected } = reportedAndExpected(
      (error) => String(error),
      (exportName) => `${exportName}: m`,
    );
    expect(reported).toEqual(expected);
  });

  it('toJSON().name is it', () => {
    const { reported, expected } = reportedAndExpected(
      (error) => (error as Error & { toJSON(): { name: string } }).toJSON().name,
      (exportName) => exportName,
    );
    expect(reported).toEqual(expected);
  });

  it('the stack header names it', () => {
    const { reported, expected } = reportedAndExpected(
      (error) => error.stack?.split('\n')[0],
      (exportName) => `${exportName}: m`,
    );
    expect(reported).toEqual(expected);
  });

  it('a subclass outside the package is named by its own class', () => {
    const DataTableError = root['DataTableError'] as ErrorClass;
    const LoadError = root['LoadError'] as ErrorClass;
    class AppError extends DataTableError {}
    class AppLoadError extends LoadError {}

    const appError = new AppError('m');
    const appLoadError = new AppLoadError('m');
    expect([appError.name, String(appError)]).toEqual(['AppError', 'AppError: m']);
    expect([appLoadError.name, String(appLoadError)]).toEqual(['AppLoadError', 'AppLoadError: m']);
    expect(appLoadError).toBeInstanceOf(LoadError);
    expect(appLoadError).toBeInstanceOf(DataTableError);
  });
});
