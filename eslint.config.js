import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'demo-dist/**',
      'coverage/**',
      'docs/api/**',
      'tests/fixtures/datasets/**',
      '.changeset/**',
      '*.cjs',
      'tests/helpers/duckdbNodeWorkerBoot.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'import-x': importPlugin,
    },
    settings: {
      'import-x/resolver': {
        typescript: { alwaysTryTypes: true },
        node: true,
      },
    },
    rules: {
      // Correctness — these flag real bugs, not style.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // `no-unnecessary-type-assertion` proved unreliable for `querySelectorAll`
      // narrowings (TS lib's overload set returns `NodeListOf<Element>` for
      // attribute selectors, but the rule reports the cast as redundant). The
      // false-positives broke the build during Phase 0 — disabled until the
      // upstream rule catches up.
      // '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // The codebase has legitimate `type X = {...}` declarations that exist
      // specifically because TypeScript's `interface` form does NOT structurally
      // satisfy `Record<string, unknown>` (used as the EventEmitter generic
      // constraint). The `stylistic` preset's default of `'interface'` would
      // force a non-mechanical change; turn it off and let convention guide us.
      '@typescript-eslint/consistent-type-definitions': 'off',

      // The codebase uses a forward-declare-for-closure pattern (`let x: T | undefined;
      // ...; x = ...`) where the closure captures `x` before its single assignment.
      // `ignoreReadBeforeAssign` lets that pattern stay `let` without triggering
      // false-positives.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],

      // tsc already enforces these — let it own them.
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',

      // The codebase has only ~2 occurrences; keep them visible without blocking.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Match DEVELOPMENT.md "Coding conventions": library code emits warning/error
      // events, not console.log. Allow console.warn / console.error since those
      // surface install-time diagnostics (e.g., stylesheet detection).
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // Cycle detection across this codebase's dense cross-imports — Phase 0 reports
      // findings as Phase 3 follow-ups (core orchestrator hot zone).
      'import-x/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      // No `projectService` here — tests are not part of `tsconfig.json`'s
      // include list, and the type-aware rules below are disabled anyway.
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // Tests routinely use `as any`, `!`, and dynamic shapes; don't fight it.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      // Mock subclasses commonly stub every abstract method with `() => {}`.
      '@typescript-eslint/no-empty-function': 'off',
      // Test scratch variables and unused imports are noise — `tsc` already
      // catches the structurally-relevant ones in `src/`.
      '@typescript-eslint/no-unused-vars': 'off',
      // Tests freely use `Array<T>` and other stylistic forms; don't churn them.
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-generic-constructors': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      'no-console': 'off',
    },
  },

  {
    files: ['scripts/**/*.{js,mjs,cjs}', '*.config.{js,mjs,cjs,ts}', 'vite.*.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },

  {
    files: ['demo/**/*.{ts,js}', 'examples/**/*.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Examples often subclass `BaseVisualization` and need to declare empty
      // abstract-method overrides. Don't fight that.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/array-type': 'off',
    },
  },

  // Disable ESLint formatting rules that conflict with Prettier — keep this last.
  prettier,
);
