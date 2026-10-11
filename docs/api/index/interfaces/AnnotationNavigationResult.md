[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotationNavigationResult

# Interface: AnnotationNavigationResult

Defined in: [annotations/navigationTypes.ts:49](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L49)

Where `actions.nextAnnotation` or `actions.previousAnnotation` put the
cursor.

## Example

```ts
const landed = await table.actions.nextAnnotation();
if (landed) console.log(`row ${landed.row + 1}, ${landed.column}`, landed.annotations);
```

## Properties

### annotations

> **annotations**: [`Annotation`](../type-aliases/Annotation.md)[]

Defined in: [annotations/navigationTypes.ts:67](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L67)

The annotations there, of the severities the search was for: the row's
own, and the cell's (the hidden cell's, when the row's annotations are
in hidden columns), sorted as `getByCell` sorts them.

***

### column

> **column**: `string`

Defined in: [annotations/navigationTypes.ts:59](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L59)

The column the cursor is on: the annotated cell's, or, for a row whose
annotations are its own or in hidden columns, the column the cursor was
on before.

***

### row

> **row**: `number`

Defined in: [annotations/navigationTypes.ts:53](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L53)

The row's 0-based position in the view, as filtered and sorted.

***

### rowId

> **rowId**: `number`

Defined in: [annotations/navigationTypes.ts:51](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L51)

The row's `__rowid__`.

***

### wrapped

> **wrapped**: `boolean`

Defined in: [annotations/navigationTypes.ts:61](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L61)

Whether the search went round the end of the view to get there.
