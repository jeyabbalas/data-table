[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / parseDuckDBType

# Function: parseDuckDBType()

> **parseDuckDBType**(`text`): [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:477](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L477)

Parse a DuckDB type name into a tree.

Reads the types `DESCRIBE` and `typeof()` print: scalars with their
arguments (`DECIMAL(18,4)`, `ENUM('a', 'b')`, `TIMESTAMP WITH TIME ZONE`),
`JSON`, `VARIANT`, lists and arrays (`INTEGER[]`, `FLOAT[768]`, stacked as
in `INTEGER[2][]`, a list of 2-integer arrays), `STRUCT(…)` with quoted,
unquoted or no field names (a field named with the empty string, which
DuckDB writes as nothing, is named `''`), `MAP(K, V)`, `UNION(tag T, …)`
and `LIST(T)`. Keywords are matched in any case.

Never throws: text it cannot read, and types nested deeper than
`MAX_TYPE_DEPTH` (256) levels, come back as an `unknown` node. Results are
memoized, so the same text gives back the same (frozen) node.

## Parameters

### text

`string`

## Returns

[`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

parseDuckDBType('INTEGER[]');
// { kind: 'list', sqlType: 'INTEGER[]',
//   element: { kind: 'scalar', sqlType: 'INTEGER', name: 'INTEGER', args: [], dataType: 'integer' } }
parseDuckDBType('MAP(VARCHAR, DOUBLE)').kind; // 'map'
```
