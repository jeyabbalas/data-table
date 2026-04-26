# Migration guides

Dedicated upgrade guides for breaking changes between versions of
`@jeyabbalas/data-table`. Purely additive releases are documented in
[CHANGELOG.md](../../CHANGELOG.md) only; any change that requires consumers to
edit their integration code gets a migration guide here.

## Rule of thumb

- **CHANGELOG entry only** — new options, new events, new exports, internal
  refactors, bug fixes, deprecation _warnings_ (old API still works).
- **Migration guide (here) plus CHANGELOG entry** — renamed or removed options,
  changed event payloads, removed exports, behavioural changes that break
  existing code.

## Naming convention

One file per minor-or-major upgrade, named `from-<from>-to-<to>.md`
(e.g. `from-0.1-to-0.2.md`, `from-0.x-to-1.0.md`). Patch releases don't get
their own guide — they're strictly backwards-compatible.

Start new guides by copying [`_TEMPLATE.md`](./_TEMPLATE.md).

## Available migrations

| From                                                          | To  | Released | Guide |
| ------------------------------------------------------------- | --- | -------- | ----- |
| _v0.1 is the first release — no predecessor to migrate from._ |     |          |       |

## See also

- [Documentation index](../README.md)
- [CHANGELOG](../../CHANGELOG.md)
