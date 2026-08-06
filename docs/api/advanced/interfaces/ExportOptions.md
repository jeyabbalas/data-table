[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ExportOptions

# Interface: ExportOptions

Defined in: [export/CSVExport.ts:37](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/export/CSVExport.ts#L37)

Options controlling CSV export behavior

## Properties

### columns

> **columns**: `"all"` \| `string`[]

Defined in: [export/CSVExport.ts:41](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/export/CSVExport.ts#L41)

Which columns to include

***

### delimiter

> **delimiter**: `string`

Defined in: [export/CSVExport.ts:45](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/export/CSVExport.ts#L45)

Field delimiter character

***

### includeHeaders

> **includeHeaders**: `boolean`

Defined in: [export/CSVExport.ts:43](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/export/CSVExport.ts#L43)

Whether to include a header row

***

### nullValue

> **nullValue**: `string`

Defined in: [export/CSVExport.ts:47](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/export/CSVExport.ts#L47)

String to use for NULL values

***

### scope

> **scope**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [export/CSVExport.ts:39](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/export/CSVExport.ts#L39)

Which rows to export
