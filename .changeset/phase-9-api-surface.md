---
'@jeyabbalas/data-table': patch
---

Surface `AnnotationError` in the `MUST_EXIST_AT_ROOT` API gate (`tests/api-surface.exports.test.ts`). The class was already exported from `src/index.ts` and tracked by `tests/api-surface.snapshot.test.ts`; this aligns the explicit gate manifest with the runtime exports so future drift surfaces immediately.
