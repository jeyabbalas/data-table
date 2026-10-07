[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / derivedColumnsEqual

# Function: derivedColumnsEqual()

> **derivedColumnsEqual**(`a`, `b`): `boolean`

Defined in: [core/UndoManager.ts:153](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/UndoManager.ts#L153)

Shallow equality check for derived column lists.
Compares by name, kind, expression (for expression cols), and
values.length (for vector cols). Does not deep-compare vector values
since the full reconciliation handles that.

## Parameters

### a

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]

### b

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]

## Returns

`boolean`
