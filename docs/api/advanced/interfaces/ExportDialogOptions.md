[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ExportDialogOptions

# Interface: ExportDialogOptions

Defined in: [export/ExportDialog.ts:68](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/export/ExportDialog.ts#L68)

Construction options for [ExportDialog](../classes/ExportDialog.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [export/ExportDialog.ts:70](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/export/ExportDialog.ts#L70)

CSS class prefix (default: 'dt')

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [export/ExportDialog.ts:84](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/export/ExportDialog.ts#L84)

Element to mirror `data-dt-color-scheme` from. The dialog backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [export/ExportDialog.ts:78](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/export/ExportDialog.ts#L78)

Unique per-instance identifier mixed into element IDs and radio group
names, so two tables on the same page don't collide on
`aria-labelledby` targets or share a checked radio. Normally supplied
by `createDataTable()`; a dialog constructed without one generates its
own.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [export/ExportDialog.ts:86](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/export/ExportDialog.ts#L86)

Resolved i18n strings. Defaults to English.
