[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SeverityFilter

# Interface: SeverityFilter

Defined in: [annotations/types.ts:139](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L139)

Visual-only severity-filter flag set. Each flag controls whether tints for
that severity appear; annotations themselves remain in the store regardless.
When all three are enabled (the default), every annotation paints per the
`error > warning > info` hierarchy. Disabling a flag drops it from the
hierarchy at render time so the next-highest enabled severity shows
through.

## Properties

### error

> **error**: `boolean`

Defined in: [annotations/types.ts:140](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L140)

***

### info

> **info**: `boolean`

Defined in: [annotations/types.ts:142](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L142)

***

### warning

> **warning**: `boolean`

Defined in: [annotations/types.ts:141](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L141)
