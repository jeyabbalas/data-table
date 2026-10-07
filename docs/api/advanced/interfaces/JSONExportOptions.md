[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / JSONExportOptions

# Interface: JSONExportOptions

Defined in: [export/JSONExport.ts:33](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/JSONExport.ts#L33)

Options controlling JSON export behavior

## Properties

### columns

> **columns**: `"all"` \| `string`[]

Defined in: [export/JSONExport.ts:37](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/JSONExport.ts#L37)

Which columns to include

***

### format

> **format**: `"array"` \| `"ndjson"`

Defined in: [export/JSONExport.ts:39](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/JSONExport.ts#L39)

Output format: JSON array or newline-delimited JSON

***

### pretty

> **pretty**: `boolean`

Defined in: [export/JSONExport.ts:41](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/JSONExport.ts#L41)

Pretty-print the output (array format only)

***

### scope

> **scope**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [export/JSONExport.ts:35](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/JSONExport.ts#L35)

Which rows to export
