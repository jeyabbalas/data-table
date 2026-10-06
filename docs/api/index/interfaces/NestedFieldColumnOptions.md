[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / NestedFieldColumnOptions

# Interface: NestedFieldColumnOptions

Defined in: [core/Actions.ts:120](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L120)

Options for [StateActions.addNestedFieldColumn](../../advanced/classes/StateActions.md#addnestedfieldcolumn).

## Example

```ts
// tags: VARCHAR[]
await table.actions.addNestedFieldColumn('tags', [], { extract: 'length', name: 'tag_count' });
```

## Properties

### extract?

> `optional` **extract?**: `"value"` \| `"length"` \| `"tag"`

Defined in: [core/Actions.ts:147](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L147)

What the column reads at the end of the path:

- `'value'` (the default): the value there.
- `'length'`: how many elements a list or array has (`len`), how many
  entries a map has (`cardinality`, named `…_size`), or how many
  elements a JSON array has (0 for any other JSON value).
- `'tag'`: the tag of the member a union holds (`union_tag`).

#### Example

```ts
// attrs: MAP(VARCHAR, INTEGER)
await table.actions.addNestedFieldColumn('attrs', [], { extract: 'length' }); // attrs_size
```

***

### jsonLeaf?

> `optional` **jsonLeaf?**: `"string"` \| `"number"` \| `"boolean"` \| `"json"`

Defined in: [core/Actions.ts:166](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L166)

How the column reads a value inside a JSON or VARIANT value, whose type
differs from row to row. Ignored on a path that does not reach one.

- `'string'` (the default): a VARCHAR. A JSON string without its
  quotes, a number, boolean, object or array as its JSON text, JSON
  `null` as NULL.
- `'number'`: a DOUBLE, NULL where the value is not a number. A string
  holding a number counts.
- `'boolean'`: a BOOLEAN, NULL where the value does not read as one.
  DuckDB's text-to-boolean cast decides: besides `true` and `false`,
  `1` and `0` count, as do the strings `"true"`, `"yes"` and `"t"`.
- `'json'`: a JSON value, so objects and arrays stay inspectable.

#### Example

```ts
// doc: JSON such as {"score": 0.92}
await table.actions.addNestedFieldColumn('doc', ['score'], { jsonLeaf: 'number' });
```

***

### name?

> `optional` **name?**: `string`

Defined in: [core/Actions.ts:133](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L133)

The new column's name. Left out, one made of the column's name and the
path's steps, which needs no quoting in SQL: `point_x`,
`people_1_name`, `tags_length`, `attrs_size`, `doc_a_b_0`; with
`_2`, `_3`, … after it when another column has that name, ignoring the
case of its letters. Given, it is checked as `addDerivedColumn` checks a
name: one another column has, in any letter case, is refused.

#### Example

```ts
// point: STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)
await table.actions.addNestedFieldColumn('point', ['x'], { name: 'longitude' });
```
