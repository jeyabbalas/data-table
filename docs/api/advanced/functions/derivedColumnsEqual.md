[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / derivedColumnsEqual

# Function: derivedColumnsEqual()

> **derivedColumnsEqual**(`a`, `b`): `boolean`

Defined in: [core/UndoManager.ts:153](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/UndoManager.ts#L153)

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
