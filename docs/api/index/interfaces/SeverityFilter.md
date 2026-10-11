[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SeverityFilter

# Interface: SeverityFilter

Defined in: [annotations/types.ts:162](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/types.ts#L162)

Visual-only severity-filter flag set. Each flag controls whether tints for
that severity appear; annotations themselves remain in the store regardless.
When all three are enabled (the default), every annotation paints per the
`error > warning > info` hierarchy. Disabling a flag drops it from the
hierarchy at render time so the next-highest enabled severity shows
through.

## Properties

### error

> **error**: `boolean`

Defined in: [annotations/types.ts:163](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/types.ts#L163)

***

### info

> **info**: `boolean`

Defined in: [annotations/types.ts:165](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/types.ts#L165)

***

### warning

> **warning**: `boolean`

Defined in: [annotations/types.ts:164](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/types.ts#L164)
