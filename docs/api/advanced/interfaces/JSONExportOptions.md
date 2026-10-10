[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / JSONExportOptions

# Interface: JSONExportOptions

Defined in: [export/JSONExport.ts:45](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/export/JSONExport.ts#L45)

Options controlling JSON export behavior

## Properties

### columns

> **columns**: `"all"` \| `string`[]

Defined in: [export/JSONExport.ts:49](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/export/JSONExport.ts#L49)

Which columns to include

***

### format

> **format**: `"array"` \| `"ndjson"`

Defined in: [export/JSONExport.ts:51](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/export/JSONExport.ts#L51)

Output format: JSON array or newline-delimited JSON

***

### pretty

> **pretty**: `boolean`

Defined in: [export/JSONExport.ts:53](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/export/JSONExport.ts#L53)

Pretty-print the output (array format only)

***

### scope

> **scope**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [export/JSONExport.ts:47](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/export/JSONExport.ts#L47)

Which rows to export
