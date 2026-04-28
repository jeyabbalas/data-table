[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / JSONExportOptions

# Interface: JSONExportOptions

Defined in: [export/JSONExport.ts:21](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/export/JSONExport.ts#L21)

Options controlling JSON export behavior

## Properties

### columns

> **columns**: `"all"` \| `string`[]

Defined in: [export/JSONExport.ts:25](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/export/JSONExport.ts#L25)

Which columns to include

***

### format

> **format**: `"array"` \| `"ndjson"`

Defined in: [export/JSONExport.ts:27](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/export/JSONExport.ts#L27)

Output format: JSON array or newline-delimited JSON

***

### pretty

> **pretty**: `boolean`

Defined in: [export/JSONExport.ts:29](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/export/JSONExport.ts#L29)

Pretty-print the output (array format only)

***

### scope

> **scope**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [export/JSONExport.ts:23](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/export/JSONExport.ts#L23)

Which rows to export
