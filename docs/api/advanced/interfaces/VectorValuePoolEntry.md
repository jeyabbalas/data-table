[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VectorValuePoolEntry

# Interface: VectorValuePoolEntry

Defined in: [persistence/types.ts:116](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/persistence/types.ts#L116)

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

Defined in: [persistence/types.ts:118](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/persistence/types.ts#L118)

***

### vectorType

> **vectorType**: `string`

Defined in: [persistence/types.ts:117](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/persistence/types.ts#L117)
