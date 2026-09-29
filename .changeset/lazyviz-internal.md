---
'@jeyabbalas/data-table': patch
---

### Fixed

- The published `dist/visualizations/LazyVizController.d.ts` type-checks again. It had lost its `ColumnSchema` import, because the build drops whatever an `@internal` tag is attached to and a tag in a file's opening comment is attached to the first import. No public entry point reaches that module, so only code that imported it directly saw the error. `npm run build` now type-checks every emitted declaration file.
