[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / CellAnnotation

# Interface: CellAnnotation

Defined in: [annotations/types.ts:84](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L84)

Cell-scope annotation — attached to a single `(rowId, column)` cell.

## Extends

- `AnnotationBase`

## Properties

### code?

> `optional` **code?**: `string`

Defined in: [annotations/types.ts:57](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L57)

App-defined error / rule code (e.g. `JSON_SCHEMA_MAXIMUM`). Rendered via
`.textContent` — HTML strings are NOT interpreted.

#### Inherited from

`AnnotationBase.code`

***

### column

> **column**: `string`

Defined in: [annotations/types.ts:87](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L87)

***

### createdAt?

> `optional` **createdAt?**: `string`

Defined in: [annotations/types.ts:66](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L66)

ISO 8601; set to `now()` by `add` when missing.

#### Inherited from

`AnnotationBase.createdAt`

***

### id

> **id**: `string`

Defined in: [annotations/types.ts:45](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L45)

Stable identifier. Auto-generated if omitted at `add` time.

#### Inherited from

`AnnotationBase.id`

***

### message

> **message**: `string`

Defined in: [annotations/types.ts:52](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L52)

Human-readable message. The library renders this via `.textContent` —
HTML strings are NOT interpreted. Pass any string safely.

#### Inherited from

`AnnotationBase.message`

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [annotations/types.ts:64](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L64)

App-defined structured metadata; round-tripped verbatim.

#### Inherited from

`AnnotationBase.metadata`

***

### rowId

> **rowId**: `number`

Defined in: [annotations/types.ts:86](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L86)

***

### scope

> **scope**: `"cell"`

Defined in: [annotations/types.ts:85](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L85)

***

### severity

> **severity**: [`AnnotationSeverity`](../type-aliases/AnnotationSeverity.md)

Defined in: [annotations/types.ts:47](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L47)

Severity level — drives CSS precedence and popover ordering in Phase 4.

#### Inherited from

`AnnotationBase.severity`

***

### source?

> `optional` **source?**: `string`

Defined in: [annotations/types.ts:62](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L62)

App-defined origin tag (e.g. `harmonization-validator`). Rendered via
`.textContent` — HTML strings are NOT interpreted.

#### Inherited from

`AnnotationBase.source`

***

### updatedAt?

> `optional` **updatedAt?**: `string`

Defined in: [annotations/types.ts:68](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/annotations/types.ts#L68)

ISO 8601; set on every successful `update`.

#### Inherited from

`AnnotationBase.updatedAt`
