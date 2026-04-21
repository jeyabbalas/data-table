# Contributing

Thanks for your interest in contributing to `@jeyabbalas/data-table`. This guide covers how to participate — filing bugs, proposing features, and submitting pull requests. For local setup, tests, and the release workflow, see [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## Ways to contribute

- **File a bug report** when something the library documents doesn't work, or when behavior surprises you.
- **Propose a feature** when a use case the library could reasonably support isn't covered.
- **Improve the docs** — fix typos, clarify a guide, add a missing pitfall, or add a new example under `examples/`.
- **Submit a PR** for a fix or feature. Small, focused PRs are easier to review and merge.

## Before you file an issue

1. **Search existing issues.** Someone may have already reported the same bug or feature request.
2. **Check [`docs/troubleshooting.md`](./docs/troubleshooting.md).** Common issues (stylesheet missing, WASM 404s, SSR blanks, React Strict Mode double-init, IndexedDB in private browsing) have documented fixes.
3. **If you're a coding agent**, read [`AGENTS.md`](./AGENTS.md) first — especially §"What this library is / is not". Several frequent "bug" reports are intentional non-features (no in-cell editing, no row-click event, no SSR rendering).
4. **Try the latest release.** The bug may already be fixed on `main`.

## Filing a bug

Use the **Bug report** issue template. Provide:

- The library version you're on.
- Browser and version; operating system.
- A minimal reproduction — the smallest snippet (or repo link) that triggers the bug. The `examples/01-minimal/` directory is the best starting point if you need a base to modify.
- Expected behavior vs. actual behavior.
- Console output, including any `DataTableError.code` that was thrown.

Issues without a reproduction are usually hard to act on and may be closed with a request for one.

## Proposing a feature

Use the **Feature request** issue template. Before proposing:

- Read [`AGENTS.md`](./AGENTS.md) §"What this library is / is not" — confirm the feature aligns with the library's stated scope (privacy-preserving, in-browser, analytics-oriented tables; not a general-purpose data grid, not server-paginated, not SSR-rendered).
- Check whether the existing `/advanced` entry already exposes what you need. Many advanced use cases are reachable via `VisualizationRegistry`, `WorkerBridge`, `FilterPresetManager`, or `SessionStore` without a new top-level API.
- For anything non-trivial (new option on `createDataTable`, new event, new filter type), **open an issue for discussion before starting a PR.** That avoids both of us doing work that won't land.

## Pull request workflow

1. Fork the repo and create a branch from `main`. Branch names like `fix-stylesheet-check` or `add-csv-progress-event` are fine.
2. `npm install`. All peer dependencies (`@codemirror/*`, `@duckdb/duckdb-wasm`, `@lezer/highlight`) are also listed under `devDependencies`, so no extra install is needed for local development.
3. Make your change.
   - Add or update tests under `tests/`, mirroring the `src/` layout.
   - Keep public-API changes minimal; extend rather than replace where possible.
4. Run the local checks — both must pass:
   - `npm test`
   - `npm run build`
5. Update the changelog. Add an entry under the `## [Unreleased]` block in [`CHANGELOG.md`](./CHANGELOG.md) using the existing `### Added` / `### Changed` / `### Fixed` / `### Changed (breaking)` / `### Migration` headings ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format).
6. Update documentation that is affected:
   - Public-API changes → [`docs/api-reference.md`](./docs/api-reference.md), and [`AGENTS.md`](./AGENTS.md) if the change alters agent-facing guidance.
   - User-visible behavior changes → the relevant guide under [`docs/guides/`](./docs/guides/).
   - New features that benefit from a worked example → add one under `examples/`.
7. Open a PR using the template and fill in the checklist.

### Commit messages

Match the existing project style (check `git log`):

- Imperative mood, sentence case.
- No `feat:` / `fix:` / `chore:` prefixes.
- Subject line under 72 characters.
- Optional body, wrapped near 72 columns, explaining *why* rather than *what*.
- One logical change per commit; rebase to tidy up before opening the PR.

Good examples, taken from the actual history:

```
Fix "+" button hover thickness
Add library depth content to documentation — guides, concepts, integrations, llms.txt
Remove redundant example 10
Develop typed error model
Support programmatic colorScheme and add CSS variable reference
```

Avoid:

```
feat: add stuff             # no type prefix
fixed the bug               # past tense, sentence-case-only subject needed
WIP                         # rebase or squash before opening a PR
```

### Review expectations

- Smaller PRs merge faster. If a change is large, consider splitting it into reviewable chunks.
- Expect a first response within about a week. The maintainer (`@jeyabbalas`) reviews in batches.
- Reviewers may ask for tests, docs updates, or API shape changes before merging.

## Licensing

This project is MIT-licensed (see [`LICENSE`](./LICENSE)). By submitting a pull request, you agree that your contribution will be released under the same license. There is no CLA.

## Scope

Intentional non-goals (documented in [`AGENTS.md`](./AGENTS.md)) include in-cell editing, row-click events, server-side pagination, and server-side rendering. Features that contradict these non-goals are unlikely to land; if you think the scope should change, open a discussion issue first.
