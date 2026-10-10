[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBListTypeNode

# Interface: DuckDBListTypeNode

Defined in: [core/duckdbType.ts:90](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/duckdbType.ts#L90)

A LIST: `INTEGER[]`.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('VARCHAR[]');
if (node.kind === 'list') node.element.sqlType; // 'VARCHAR'
```

## Properties

### element

> `readonly` **element**: [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:93](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/duckdbType.ts#L93)

***

### kind

> `readonly` **kind**: `"list"`

Defined in: [core/duckdbType.ts:91](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/duckdbType.ts#L91)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:92](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/duckdbType.ts#L92)
