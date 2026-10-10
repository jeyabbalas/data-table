[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ExpressionEditor

# Interface: ExpressionEditor

Defined in: [derived/ExpressionEditorTypes.ts:18](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/ExpressionEditorTypes.ts#L18)

Interface that custom expression editors must implement.

The editor's root element must dispatch DOM `input` events (or let them
bubble from child elements) so the hosting panel can detect content changes.

## Properties

### element

> `readonly` **element**: `HTMLElement`

Defined in: [derived/ExpressionEditorTypes.ts:20](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/ExpressionEditorTypes.ts#L20)

The root DOM element to mount in the panel/modal

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [derived/ExpressionEditorTypes.ts:32](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/ExpressionEditorTypes.ts#L32)

Clean up resources

#### Returns

`void`

***

### focus()

> **focus**(): `void`

Defined in: [derived/ExpressionEditorTypes.ts:26](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/ExpressionEditorTypes.ts#L26)

Focus the editor

#### Returns

`void`

***

### getValue()

> **getValue**(): `string`

Defined in: [derived/ExpressionEditorTypes.ts:22](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/ExpressionEditorTypes.ts#L22)

Get current editor content

#### Returns

`string`

***

### setError()

> **setError**(`error`): `void`

Defined in: [derived/ExpressionEditorTypes.ts:28](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/ExpressionEditorTypes.ts#L28)

Display an error message inline (null clears the error)

#### Parameters

##### error

`string` \| `null`

#### Returns

`void`

***

### setValue()

> **setValue**(`value`): `void`

Defined in: [derived/ExpressionEditorTypes.ts:24](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/ExpressionEditorTypes.ts#L24)

Set editor content (for editing existing columns)

#### Parameters

##### value

`string`

#### Returns

`void`

***

### updateCompletionContext()

> **updateCompletionContext**(`context`): `void`

Defined in: [derived/ExpressionEditorTypes.ts:30](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/ExpressionEditorTypes.ts#L30)

Update completion context when schema changes

#### Parameters

##### context

[`CompletionContext`](CompletionContext.md)

#### Returns

`void`
