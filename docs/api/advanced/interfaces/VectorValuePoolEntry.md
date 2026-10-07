[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VectorValuePoolEntry

# Interface: VectorValuePoolEntry

Defined in: [persistence/types.ts:124](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L124)

Entry in the vector value pool.

**Dedup is reference-identity, not content-hash.** `snapshotFromState`
walks the undo/redo stacks once and groups entries by JS array reference
(`Map<ArrayLike, key>`); two entries that hold the same array literal
but different references each produce their own pool entry. This
intentionally trades a small storage redundancy on the rare
"structurally-identical-but-distinct" case for O(n) snapshot
serialisation — `captureSnapshot` (`src/core/UndoManager.ts`) reuses the
derived-column array ref across stack entries that didn't mutate the
vector, so reference identity covers the common case.

Consumers building their own undo stacks via the `/advanced` entry get
dedup only when they share array references explicitly.

## Properties

### values

> **values**: `unknown`[]

Defined in: [persistence/types.ts:126](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L126)

***

### vectorType

> **vectorType**: `string`

Defined in: [persistence/types.ts:125](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L125)
