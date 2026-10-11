[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / RevealRowOptions

# Interface: RevealRowOptions

Defined in: [annotations/navigationTypes.ts:77](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L77)

Options for `actions.revealRow`.

## Example

```ts
// Scroll the row to the top of the view, and leave the cursor where it is.
await table.actions.revealRow(1204, undefined, { align: 'start', focus: false });
```

## Properties

### align?

> `optional` **align?**: `"start"` \| `"center"` \| `"end"`

Defined in: [annotations/navigationTypes.ts:79](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L79)

Where in the view the row goes. Default: `'center'`.

***

### focus?

> `optional` **focus?**: `boolean`

Defined in: [annotations/navigationTypes.ts:85](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L85)

Put the cursor on the row too, closing the annotation popover and the
value inspector, which belong to the cell it leaves. Default: `true`.
With `false`, the cursor and those stay as they are.

***

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [annotations/navigationTypes.ts:91](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L91)

Aborts the reveal: the promise rejects with a `QueryError` coded
`QUERY_ABORTED`, and a query it was running is cancelled in the DuckDB
worker.
