[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / deserializeFilter

# Function: deserializeFilter()

> **deserializeFilter**(`filter`): [`Filter`](../type-aliases/Filter.md) \| `null`

Defined in: [persistence/SessionStore.ts:102](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/persistence/SessionStore.ts#L102)

Convert a serialized filter back to a live Filter with Date objects restored.
 Returns null for unknown filter types (e.g. from a newer library version or
 corrupted data) — callers must filter out nulls.

## Parameters

### filter

[`SerializedFilter`](../type-aliases/SerializedFilter.md)

## Returns

[`Filter`](../type-aliases/Filter.md) \| `null`
