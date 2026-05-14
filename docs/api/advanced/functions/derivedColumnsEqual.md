[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / derivedColumnsEqual

# Function: derivedColumnsEqual()

> **derivedColumnsEqual**(`a`, `b`): `boolean`

Defined in: [core/UndoManager.ts:147](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/core/UndoManager.ts#L147)

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
