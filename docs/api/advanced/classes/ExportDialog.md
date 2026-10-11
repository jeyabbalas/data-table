[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ExportDialog

# Class: ExportDialog

Defined in: [export/ExportDialog.ts:104](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/export/ExportDialog.ts#L104)

Modal dialog for exporting data — CSV / JSON / Parquet, with row-scope
(filtered / all / selected) and column inclusion toggles. Composed by the
facade; reach for it directly when assembling a custom export pipeline.

## Constructors

### Constructor

> **new ExportDialog**(`state`, `bridge`, `options?`): `ExportDialog`

Defined in: [export/ExportDialog.ts:162](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/export/ExportDialog.ts#L162)

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

Defined in: [export/ExportDialog.ts:618](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/export/ExportDialog.ts#L618)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [export/ExportDialog.ts:916](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/export/ExportDialog.ts#L916)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [export/ExportDialog.ts:908](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/export/ExportDialog.ts#L908)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [export/ExportDialog.ts:912](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/export/ExportDialog.ts#L912)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [export/ExportDialog.ts:562](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/export/ExportDialog.ts#L562)

#### Returns

`void`

***

### setSourceName()

> **setSourceName**(`name`): `void`

Defined in: [export/ExportDialog.ts:901](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/export/ExportDialog.ts#L901)

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
