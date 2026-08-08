[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ExportDialogOptions

# Interface: ExportDialogOptions

Defined in: [export/ExportDialog.ts:67](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/export/ExportDialog.ts#L67)

Construction options for [ExportDialog](../classes/ExportDialog.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [export/ExportDialog.ts:69](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/export/ExportDialog.ts#L69)

CSS class prefix (default: 'dt')

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [export/ExportDialog.ts:82](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/export/ExportDialog.ts#L82)

Element to mirror `data-dt-color-scheme` from. The dialog backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [export/ExportDialog.ts:76](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/export/ExportDialog.ts#L76)

Unique per-instance identifier mixed into element IDs so two tables on
the same page don't collide on `aria-labelledby` targets. Normally
supplied by `createDataTable()`; defaults to `''` for standalone/test
construction.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [export/ExportDialog.ts:84](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/export/ExportDialog.ts#L84)

Resolved i18n strings. Defaults to English.
