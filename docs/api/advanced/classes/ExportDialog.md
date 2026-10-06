[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ExportDialog

# Class: ExportDialog

Defined in: [export/ExportDialog.ts:94](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/export/ExportDialog.ts#L94)

Modal dialog for exporting data — CSV / JSON / Parquet, with row-scope
(filtered / all / selected) and column inclusion toggles. Composed by the
facade; reach for it directly when assembling a custom export pipeline.

## Constructors

### Constructor

> **new ExportDialog**(`state`, `bridge`, `options?`): `ExportDialog`

Defined in: [export/ExportDialog.ts:144](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/export/ExportDialog.ts#L144)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

##### options?

[`ExportDialogOptions`](../interfaces/ExportDialogOptions.md) = `{}`

#### Returns

`ExportDialog`

## Methods

### close()

> **close**(): `void`

Defined in: [export/ExportDialog.ts:572](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/export/ExportDialog.ts#L572)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [export/ExportDialog.ts:847](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/export/ExportDialog.ts#L847)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [export/ExportDialog.ts:839](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/export/ExportDialog.ts#L839)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [export/ExportDialog.ts:843](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/export/ExportDialog.ts#L843)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [export/ExportDialog.ts:523](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/export/ExportDialog.ts#L523)

#### Returns

`void`

***

### setSourceName()

> **setSourceName**(`name`): `void`

Defined in: [export/ExportDialog.ts:832](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/export/ExportDialog.ts#L832)

Set the source file name used as the base for exported file names.
Pass the original filename (e.g. "sales_data.csv") — the extension
will be stripped and replaced with the chosen export format's extension.

The stem is sanitised to remove path separators, NUL/control characters,
leading dots, and runs of `..`, then capped at 100 characters so the
full `<stem>_export.<ext>` name comfortably fits the typical 255-char
filesystem limit.

#### Parameters

##### name

`string`

#### Returns

`void`
