<!--
Thanks for contributing! Please fill out the sections below. See CONTRIBUTING.md for PR workflow details.
-->

## Summary

<!-- 1–3 sentences on why this change is needed and what it does. -->

## Related issue

<!-- e.g. Closes #123, Refs #45. Use "Closes" to auto-close on merge. -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (requires a changelog `### Migration` entry)
- [ ] Docs-only
- [ ] Internal / refactor (no user-visible change)

## Checklist

- [ ] Tests added or updated under `tests/`
- [ ] `npm test` passes locally
- [ ] `npm run build` passes locally
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`
- [ ] Public-API changes → `docs/api-reference.md` updated
- [ ] User-visible behavior changes → relevant guide in `docs/guides/` updated
- [ ] Breaking changes → migration notes added to `CHANGELOG.md` `### Migration`
- [ ] API-surface snapshot regenerated if exports changed (`npx vitest -u`)
- [ ] Screenshots / short clips attached for UI-visible changes
- [ ] JSDoc added on new public exports (at minimum a one-sentence description + `@example`)

## Testing notes

<!-- How should a reviewer verify this locally? Which scripts to run, which examples to exercise, which browsers to spot-check. -->
