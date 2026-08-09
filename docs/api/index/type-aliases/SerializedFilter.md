[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedFilter

# Type Alias: SerializedFilter

> **SerializedFilter** = [`SerializedRangeFilter`](../interfaces/SerializedRangeFilter.md) \| [`SerializedPointFilter`](../interfaces/SerializedPointFilter.md) \| [`SerializedSetFilter`](../interfaces/SerializedSetFilter.md) \| [`SerializedNotSetFilter`](../interfaces/SerializedNotSetFilter.md) \| [`NullFilter`](../interfaces/NullFilter.md) \| [`PatternFilter`](../interfaces/PatternFilter.md) \| [`RawSQLFilter`](../interfaces/RawSQLFilter.md)

Defined in: [persistence/types.ts:70](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/persistence/types.ts#L70)

Discriminated union of every [Filter](Filter.md) after JSON normalization. Used
by [SessionStore](../classes/SessionStore.md), [FilterPresetManager](../classes/FilterPresetManager.md), and any consumer
round-tripping filter state through their own storage (URL params, cloud
sync). Filters whose runtime form is already JSON-safe (`NullFilter`,
`PatternFilter`, `RawSQLFilter`) flow through unchanged.
