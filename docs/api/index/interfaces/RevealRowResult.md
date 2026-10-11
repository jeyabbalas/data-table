[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / RevealRowResult

# Interface: RevealRowResult

Defined in: [annotations/navigationTypes.ts:101](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L101)

Where `actions.revealRow` showed a row.

## Example

```ts
const shown = await table.actions.revealRow(1204, 'age');
if (shown === null) console.log('The filters hide that row');
```

## Properties

### column

> **column**: `string`

Defined in: [annotations/navigationTypes.ts:105](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L105)

The column brought into view, where the cursor is when it moved.

***

### row

> **row**: `number`

Defined in: [annotations/navigationTypes.ts:103](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/navigationTypes.ts#L103)

The row's 0-based position in the view, as filtered and sorted.
