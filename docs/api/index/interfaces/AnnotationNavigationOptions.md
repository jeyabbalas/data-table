[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotationNavigationOptions

# Interface: AnnotationNavigationOptions

Defined in: [annotations/navigationTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L19)

Options for `actions.nextAnnotation` and `actions.previousAnnotation`.

## Example

```ts
// Errors only, and stop at the last one rather than go round to the first.
await table.actions.nextAnnotation({ severities: ['error'], wrap: false });
```

## Properties

### severities?

> `optional` **severities?**: [`AnnotationSeverity`](../type-aliases/AnnotationSeverity.md)[]

Defined in: [annotations/navigationTypes.ts:26](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L26)

The severities to go to. Default: the ones the severity filter shows
(`table.annotations.setSeverityFilter`), so that the keys skip what the
table does not paint. Each must be `'error'`, `'warning'` or `'info'`;
an empty list goes nowhere.

***

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [annotations/navigationTypes.ts:38](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L38)

Aborts the search: the promise rejects with a `QueryError` coded
`QUERY_ABORTED`, and a query it was running is cancelled in the DuckDB
worker.

***

### wrap?

> `optional` **wrap?**: `boolean`

Defined in: [annotations/navigationTypes.ts:32](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L32)

Go round to the first annotation after the last one (the last before
the first, going back). Default: `true`. With `false`, the search stops
at the end of the view and resolves `null`.
