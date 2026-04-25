[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ExportDialog

# Class: ExportDialog

Defined in: [export/ExportDialog.ts:52](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/ExportDialog.ts#L52)

## Constructors

### Constructor

> **new ExportDialog**(`state`, `bridge`, `options?`): `ExportDialog`

Defined in: [export/ExportDialog.ts:100](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/ExportDialog.ts#L100)

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

Defined in: [export/ExportDialog.ts:512](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/ExportDialog.ts#L512)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [export/ExportDialog.ts:751](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/ExportDialog.ts#L751)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [export/ExportDialog.ts:743](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/ExportDialog.ts#L743)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [export/ExportDialog.ts:747](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/ExportDialog.ts#L747)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [export/ExportDialog.ts:463](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/ExportDialog.ts#L463)

#### Returns

`void`

***

### setSourceName()

> **setSourceName**(`name`): `void`

Defined in: [export/ExportDialog.ts:737](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/ExportDialog.ts#L737)

Set the source file name used as the base for exported file names.
Pass the original filename (e.g. "sales_data.csv") — the extension
will be stripped and replaced with the chosen export format's extension.

#### Parameters

##### name

`string`

#### Returns

`void`
