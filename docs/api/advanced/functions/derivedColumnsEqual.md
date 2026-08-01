[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / derivedColumnsEqual

# Function: derivedColumnsEqual()

> **derivedColumnsEqual**(`a`, `b`): `boolean`

Defined in: [core/UndoManager.ts:147](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/core/UndoManager.ts#L147)

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
