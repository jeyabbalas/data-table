[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / deserializeFilter

# Function: deserializeFilter()

> **deserializeFilter**(`filter`): [`Filter`](../type-aliases/Filter.md) \| `null`

Defined in: [persistence/SessionStore.ts:105](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/SessionStore.ts#L105)

Convert a serialized filter back to a live Filter with Date objects restored.
 Returns null for unknown filter types (e.g. from a newer library version or
 corrupted data) — callers must filter out nulls.

## Parameters

### filter

[`SerializedFilter`](../type-aliases/SerializedFilter.md)

## Returns

[`Filter`](../type-aliases/Filter.md) \| `null`
