[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / CellAnnotation

# Interface: CellAnnotation

Defined in: [annotations/types.ts:80](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L80)

Cell-scope annotation — attached to a single `(rowId, column)` cell.

## Extends

- `AnnotationBase`

## Properties

### code?

> `optional` **code?**: `string`

Defined in: [annotations/types.ts:53](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L53)

App-defined error / rule code (e.g. `JSON_SCHEMA_MAXIMUM`). Rendered via
`.textContent` — HTML strings are NOT interpreted.

#### Inherited from

`AnnotationBase.code`

***

### column

> **column**: `string`

Defined in: [annotations/types.ts:83](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L83)

***

### createdAt?

> `optional` **createdAt?**: `string`

Defined in: [annotations/types.ts:62](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L62)

ISO 8601; set to `now()` by `add` when missing.

#### Inherited from

`AnnotationBase.createdAt`

***

### id

> **id**: `string`

Defined in: [annotations/types.ts:41](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L41)

Stable identifier. Auto-generated if omitted at `add` time.

#### Inherited from

`AnnotationBase.id`

***

### message

> **message**: `string`

Defined in: [annotations/types.ts:48](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L48)

Human-readable message. The library renders this via `.textContent` —
HTML strings are NOT interpreted. Pass any string safely.

#### Inherited from

`AnnotationBase.message`

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [annotations/types.ts:60](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L60)

App-defined structured metadata; round-tripped verbatim.

#### Inherited from

`AnnotationBase.metadata`

***

### rowId

> **rowId**: `number`

Defined in: [annotations/types.ts:82](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L82)

***

### scope

> **scope**: `"cell"`

Defined in: [annotations/types.ts:81](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L81)

***

### severity

> **severity**: [`AnnotationSeverity`](../type-aliases/AnnotationSeverity.md)

Defined in: [annotations/types.ts:43](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L43)

Severity level — drives CSS precedence and popover ordering in Phase 4.

#### Inherited from

`AnnotationBase.severity`

***

### source?

> `optional` **source?**: `string`

Defined in: [annotations/types.ts:58](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L58)

App-defined origin tag (e.g. `harmonization-validator`). Rendered via
`.textContent` — HTML strings are NOT interpreted.

#### Inherited from

`AnnotationBase.source`

***

### updatedAt?

> `optional` **updatedAt?**: `string`

Defined in: [annotations/types.ts:64](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L64)

ISO 8601; set on every successful `update`.

#### Inherited from

`AnnotationBase.updatedAt`
