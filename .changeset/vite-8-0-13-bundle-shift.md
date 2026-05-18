---
'@jeyabbalas/data-table': patch
---

Build-toolchain bump: rebuild against Vite 8.0.13 (rolldown 1.0.1).

The published bundle is unchanged in API and behaviour, but rolldown 1.0.1 chunks the output slightly differently:

- The shared `ModalHost` lazy chunk is no longer emitted; its helpers are inlined into each modal consumer (`SQLFilterModal`, `DerivedColumnModal`, `DerivedColumnEditPanel`, `FilterPresetPanel`). Per-modal brotli sizes grow by ~10–30 bytes each.
- The `VisualizationRegistry` (lazy ExportDialog) chunk grows from ~63.3 kB to ~67.6 kB brotli as more helper code resolves into it. Initial-load bundles are unaffected; only consumers that open the export dialog incur the extra bytes.

Size-limit budgets in `.size-limit.cjs` are updated to match the new baseline.
