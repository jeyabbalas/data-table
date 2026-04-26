# Migration: vX.Y → vX.Z

> Copy this file to `from-X.Y-to-X.Z.md` when preparing a release that contains
> breaking changes. Delete this blockquote and fill in each section; omit any
> section that does not apply.

**Released:** YYYY-MM-DD
**Affected versions:** from `vX.Y.*`
**Migration difficulty:** _trivial / mechanical / manual review required_

## Summary

_Three to five sentences. What broke, who is affected, how long the
migration typically takes, any automated tooling available._

## Breaking changes

### 1. <Short title — e.g. "Rename `onFilterChange` option to `onFiltersChanged`">

**What changed.** _One paragraph describing the change at the API level._

**Why.** _One paragraph on the motivation — the incident, limitation, or
design flaw that forced the break. Future-you (and future-readers) need this
to judge whether the break was worth it._

**Before**

```ts
// old code
```

**After**

```ts
// new code
```

**Automated migration.** _One of:_

- `None — mechanical replace-all on the symbol name.`
- _A `jscodeshift`, `ast-grep`, or regex snippet the reader can run._
- `N/A — manual review required because <reason>.`

### 2. <Next change>

_(Repeat the subsection for each breaking change.)_

## Non-breaking but recommended

_Deprecations slated for the next major release. Old API still works;
new API is preferred. Omit this section if empty._

## Verification checklist

- [ ] `npm install @jeyabbalas/data-table@X.Z` in the target project.
- [ ] All usages of renamed / removed symbols audited.
- [ ] `npm run build` passes.
- [ ] Relevant tests updated (event payload shapes, option names).
- [ ] Manual smoke test: _list the feature paths that depend on the changed APIs._

## See also

- [CHANGELOG entry for vX.Z](../../CHANGELOG.md)
- [Migration guides index](./README.md)
