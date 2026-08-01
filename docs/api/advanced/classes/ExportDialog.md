[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ExportDialog

# Class: ExportDialog

Defined in: [export/ExportDialog.ts:92](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/export/ExportDialog.ts#L92)

Modal dialog for exporting data — CSV / JSON / Parquet, with row-scope
(filtered / all / selected) and column inclusion toggles. Composed by the
facade; reach for it directly when assembling a custom export pipeline.

## Constructors

### Constructor

> **new ExportDialog**(`state`, `bridge`, `options?`): `ExportDialog`

Defined in: [export/ExportDialog.ts:140](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/export/ExportDialog.ts#L140)

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

Defined in: [export/ExportDialog.ts:562](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/export/ExportDialog.ts#L562)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [export/ExportDialog.ts:841](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/export/ExportDialog.ts#L841)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [export/ExportDialog.ts:833](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/export/ExportDialog.ts#L833)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [export/ExportDialog.ts:837](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/export/ExportDialog.ts#L837)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [export/ExportDialog.ts:513](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/export/ExportDialog.ts#L513)

#### Returns

`void`

***

### setSourceName()

> **setSourceName**(`name`): `void`

Defined in: [export/ExportDialog.ts:826](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/export/ExportDialog.ts#L826)

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
