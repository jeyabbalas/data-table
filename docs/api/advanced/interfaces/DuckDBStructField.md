[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBStructField

# Interface: DuckDBStructField

Defined in: [core/duckdbType.ts:130](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/duckdbType.ts#L130)

One field of a STRUCT.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const named = parseDuckDBType('STRUCT(x DOUBLE, "my field" VARCHAR)');
if (named.kind === 'struct') named.fields.map((f) => f.name); // ['x', 'my field']
const unnamed = parseDuckDBType('STRUCT(INTEGER, VARCHAR)');
if (unnamed.kind === 'struct') unnamed.fields.map((f) => f.name); // [null, null]
```

## Properties

### name

> `readonly` **name**: `string` \| `null`

Defined in: [core/duckdbType.ts:138](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/duckdbType.ts#L138)

The field's name: `null` for a field of an unnamed struct
(`STRUCT(INTEGER, VARCHAR)`, what `row(1, 'a')` makes), `''` for a
field named with the empty string, which DuckDB writes as nothing in a
struct whose first field has a name: `STRUCT(b BIGINT,  BIGINT)`, from
the JSON `{"b": 2, "": 1}`.

***

### type

> `readonly` **type**: [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:139](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/duckdbType.ts#L139)
