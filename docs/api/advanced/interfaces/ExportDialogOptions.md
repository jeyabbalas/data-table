[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ExportDialogOptions

# Interface: ExportDialogOptions

Defined in: [export/ExportDialog.ts:32](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/export/ExportDialog.ts#L32)

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [export/ExportDialog.ts:34](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/export/ExportDialog.ts#L34)

CSS class prefix (default: 'dt')

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [export/ExportDialog.ts:47](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/export/ExportDialog.ts#L47)

Element to mirror `data-dt-color-scheme` from. The dialog backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [export/ExportDialog.ts:41](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/export/ExportDialog.ts#L41)

Unique per-instance identifier mixed into element IDs so two tables on
the same page don't collide on `aria-labelledby` targets. Normally
supplied by `createDataTable()`; defaults to `''` for standalone/test
construction.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [export/ExportDialog.ts:49](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/export/ExportDialog.ts#L49)

Resolved i18n strings. Defaults to English.
