[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SeverityFilter

# Interface: SeverityFilter

Defined in: [annotations/types.ts:143](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/annotations/types.ts#L143)

Visual-only severity-filter flag set. Each flag controls whether tints for
that severity appear; annotations themselves remain in the store regardless.
When all three are enabled (the default), every annotation paints per the
`error > warning > info` hierarchy. Disabling a flag drops it from the
hierarchy at render time so the next-highest enabled severity shows
through.

## Properties

### error

> **error**: `boolean`

Defined in: [annotations/types.ts:144](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/annotations/types.ts#L144)

***

### info

> **info**: `boolean`

Defined in: [annotations/types.ts:146](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/annotations/types.ts#L146)

***

### warning

> **warning**: `boolean`

Defined in: [annotations/types.ts:145](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/annotations/types.ts#L145)
