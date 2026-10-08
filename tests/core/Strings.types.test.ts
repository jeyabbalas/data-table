import { basename, resolve } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The type of the `messages` option, `DeepPartial<Strings>`, as a
 * consumer's strict TypeScript checks it.
 *
 * `tsc --noEmit` checks `src/` only (`tsconfig.json`'s `include`), and
 * vitest strips types without checking them, so a test file's types are
 * never checked. This test builds a TypeScript program in memory instead,
 * with `tsconfig.json`'s compiler options (`strict`,
 * `exactOptionalPropertyTypes` and the rest), over snippets that import the
 * library by its package name, mapped to `src/index.ts`, and over the
 * French example, and asserts the diagnostics each file gets.
 *
 * It guards against `DeepPartial` testing function leaves against
 * `(...args: unknown[]) => unknown` again. Under `strictFunctionTypes`
 * parameters compare contravariantly, so no `(count: number) => string` is
 * assignable to that, and every callback leaf became `{}`: a leaf written
 * `(count) => …` failed with TS7006 (implicit any), and a value of the
 * wrong type was accepted where a callback goes.
 */

const REPO = resolve(__dirname, '..', '..');

/** Where the snippets sit. They live in memory only: nothing is written. */
const SNIPPET_DIR = resolve(__dirname, '__messages-types__');

/** `dist/styles.d.ts` as the build writes it, for `@jeyabbalas/data-table/styles`. */
const STYLES_STUB = resolve(SNIPPET_DIR, 'styles.d.ts');

const FRENCH_MAIN = resolve(REPO, 'examples', '07-i18n-french', 'main.ts');
const FRENCH_MESSAGES = resolve(REPO, 'examples', '07-i18n-french', 'fr.ts');

const SNIPPETS = {
  /** Callback leaves written as a translation writes them, without annotations. */
  callbacks: `
import { createDataTable, type DeepPartial, type Strings } from '@jeyabbalas/data-table';

declare const container: HTMLElement;

export const messages: DeepPartial<Strings> = {
  filters: {
    panelTitleForColumn: (column) => \`Filtre : \${column}\`,
    chipDescriptions: {
      inSet: (list, includeNull) => \`dans {\${list}}\${includeNull ? ' ou vide' : ''}\`,
    },
  },
  a11y: {
    sortedBy: (descriptions) => \`trié par \${descriptions.join(', puis ')}\`,
  },
  statistics: {
    rowCount: (count) => \`\${count.toLocaleString()} lignes\`,
    filteredRowCount: (filtered, total) => \`\${filtered} / \${total} lignes\`,
  },
};

export const table = createDataTable({
  container,
  messages: { statistics: { nullCount: (count) => \`\${count} vides\` } },
});
`,

  /** A value of the wrong type where a callback goes. */
  wrongTypes: `
import type { DeepPartial, Strings } from '@jeyabbalas/data-table';

export const messages: DeepPartial<Strings> = {
  filters: { panelTitleForColumn: 'oops' },
  statistics: {
    rowCount: 42,
    nullCount: (x: boolean) => x,
  },
};
`,

  /** No group and no leaf is required, however deep. */
  optional: `
import {
  createDataTable,
  defaultStrings,
  mergeStrings,
  type DeepPartial,
  type Strings,
} from '@jeyabbalas/data-table';

declare const container: HTMLElement;

export const none: DeepPartial<Strings> = {};
export const emptyGroup: DeepPartial<Strings> = { statistics: {} };
export const oneDeepLeaf: DeepPartial<Strings> = {
  filters: { chipDescriptions: { patternModes: { regex: 'correspond à' } } },
};
export const merged: Strings = mergeStrings(defaultStrings, {
  export: { csv: { delimiters: { tab: 'Tabulation' } } },
});
export const table = createDataTable({ container, messages: {} });
`,
};

type SnippetName = keyof typeof SNIPPETS;

const snippetPath = (name: SnippetName): string => resolve(SNIPPET_DIR, `${name}.ts`);

/** TypeScript names files with forward slashes, on Windows too. */
const normalize = (fileName: string): string => fileName.replace(/\\/g, '/');

/** `tsconfig.json`'s compiler options, less those that only shape emitted files. */
function projectCompilerOptions(): ts.CompilerOptions {
  const configPath = resolve(REPO, 'tsconfig.json');
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  const converted = ts.convertCompilerOptionsFromJson(read.config.compilerOptions, REPO);
  if (converted.errors.length > 0) {
    throw new Error(
      converted.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join('\n'),
    );
  }
  const options: ts.CompilerOptions = { ...converted.options, noEmit: true };
  // The snippets and the example lie outside `rootDir` (`src/`), and
  // nothing is emitted.
  for (const key of ['declaration', 'declarationMap', 'sourceMap', 'outDir', 'rootDir']) {
    delete options[key];
  }
  options.paths = {
    ...options.paths,
    '@jeyabbalas/data-table': ['./src/index.ts'],
    '@jeyabbalas/data-table/styles': [STYLES_STUB],
  };
  return options;
}

let program: ts.Program;

beforeAll(() => {
  const memory = new Map<string, string>([
    ...(Object.keys(SNIPPETS) as SnippetName[]).map(
      (name) => [normalize(snippetPath(name)), SNIPPETS[name]] as const,
    ),
    [normalize(STYLES_STUB), 'export {};\n'],
  ]);
  const options = projectCompilerOptions();
  const host = ts.createCompilerHost(options, true);
  const disk = {
    fileExists: host.fileExists,
    readFile: host.readFile,
    getSourceFile: host.getSourceFile,
  };
  // With no `baseUrl` and no config file, `paths` resolve against the
  // current directory: the repository root, as `tsconfig.json`'s do.
  host.getCurrentDirectory = () => normalize(REPO);
  host.fileExists = (fileName) => memory.has(normalize(fileName)) || disk.fileExists(fileName);
  host.readFile = (fileName) => memory.get(normalize(fileName)) ?? disk.readFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const text = memory.get(normalize(fileName));
    return text === undefined
      ? disk.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
      : ts.createSourceFile(fileName, text, languageVersion, true);
  };
  program = ts.createProgram({
    rootNames: [
      ...(Object.keys(SNIPPETS) as SnippetName[]).map(snippetPath),
      FRENCH_MAIN,
      FRENCH_MESSAGES,
    ],
    options,
    host,
  });
  // The checker binds every file of the program when it is created, the
  // slow part: create it here, under this hook's timeout, not in the first
  // test, under the 5 s test timeout.
  program.getTypeChecker();
}, 60_000);

interface Reported {
  /** 2322 for TS2322. */
  code: number;
  /** The source text the diagnostic points at. */
  at: string;
  /** The message, then each message it elaborates into. */
  messages: string[];
  /** `file:line`, to find it from a failure. */
  where: string;
}

function messageChain(text: string | ts.DiagnosticMessageChain): string[] {
  if (typeof text === 'string') return [text];
  return [text.messageText, ...(text.next ?? []).flatMap(messageChain)];
}

function sourceFileOf(fileName: string): ts.SourceFile {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) throw new Error(`Not in the program: ${fileName}`);
  return sourceFile;
}

/** Every syntactic and semantic diagnostic of one file, in source order. */
function reported(fileName: string): Reported[] {
  const sourceFile = sourceFileOf(fileName);
  return [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ]
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    .map((diagnostic) => {
      const start = diagnostic.start ?? 0;
      const { line } = sourceFile.getLineAndCharacterOfPosition(start);
      return {
        code: diagnostic.code,
        at: sourceFile.text.slice(start, start + (diagnostic.length ?? 0)),
        messages: messageChain(diagnostic.messageText),
        where: `${basename(fileName)}:${line + 1}`,
      };
    });
}

/** `name: type` for each parameter of each arrow function in a file, in source order. */
function parameterTypes(fileName: string): string[] {
  const sourceFile = sourceFileOf(fileName);
  const checker = program.getTypeChecker();
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isArrowFunction(node)) {
      for (const parameter of node.parameters) {
        const type = checker.typeToString(checker.getTypeAtLocation(parameter.name));
        out.push(`${parameter.name.getText(sourceFile)}: ${type}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

describe('messages: DeepPartial<Strings>, under strict TypeScript', () => {
  it("checks with the project's strict compiler options", () => {
    expect(program.getCompilerOptions()).toMatchObject({
      strict: true,
      exactOptionalPropertyTypes: true,
    });
    const programWide = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()];
    expect(programWide.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual(
      [],
    );
  });

  it('types the parameters of a callback written without annotations', () => {
    expect(reported(snippetPath('callbacks'))).toEqual([]);
    expect(parameterTypes(snippetPath('callbacks'))).toEqual([
      'column: string',
      'list: string',
      'includeNull: boolean',
      'descriptions: string[]',
      'count: number',
      'filtered: number',
      'total: number',
      'count: number',
    ]);
  });

  it('rejects a value of the wrong type where a callback goes', () => {
    expect(reported(snippetPath('wrongTypes'))).toMatchObject([
      {
        code: 2322,
        at: 'panelTitleForColumn',
        messages: ["Type 'string' is not assignable to type '(column: string) => string'."],
      },
      {
        code: 2322,
        at: 'rowCount',
        messages: ["Type 'number' is not assignable to type '(count: number) => string'."],
      },
      {
        code: 2322,
        at: 'nullCount',
        messages: [
          "Type '(x: boolean) => boolean' is not assignable to type '(count: number) => string'.",
          "Types of parameters 'x' and 'count' are incompatible.",
          "Type 'number' is not assignable to type 'boolean'.",
        ],
      },
    ]);
  });

  it('leaves every group and leaf optional, however deep', () => {
    expect(reported(snippetPath('optional'))).toEqual([]);
  });

  it('type-checks the French example, and the page that passes it as messages', () => {
    expect(reported(FRENCH_MESSAGES)).toEqual([]);
    expect(reported(FRENCH_MAIN)).toEqual([]);
  });
});
