---
'@jeyabbalas/data-table': minor
---

`VisualizationFactory`, deprecated since 0.3.1, is removed from `/advanced`: register custom charts on a `VisualizationRegistry`, or on the shared `defaultVisualizationRegistry`.

### Changed (breaking)

- `@jeyabbalas/data-table/advanced` no longer exports `VisualizationFactory`. Its static methods forwarded to `defaultVisualizationRegistry`, a root export that has every one of them: `register`, `unregister`, `create`, `isApplicable`, `getRegisteredTypes` and `resetToDefaults`. The type predicates (`isNumericType`, `isDateType`, `isTimeType`, `isCategoricalType`, `isIntervalType`, `isNestedType`, `needsVisualization`) stay on `/advanced`, and `VisualizationRegistry`, `defaultVisualizationRegistry` and the `VisualizationRegistration` and `VisualizationConstructor` types at the root.

### Migration

- Calls to `VisualizationFactory.*`: replace `VisualizationFactory.` with `defaultVisualizationRegistry.` and import it from `@jeyabbalas/data-table`; see [`VisualizationFactory` is removed](./docs/migration-guides/from-0.8-to-0.9.md#5-visualizationfactory-is-removed).
