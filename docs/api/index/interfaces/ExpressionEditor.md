[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ExpressionEditor

# Interface: ExpressionEditor

Defined in: [derived/ExpressionEditorTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/derived/ExpressionEditorTypes.ts#L17)

Interface that custom expression editors must implement.

The editor's root element must dispatch DOM `input` events (or let them
bubble from child elements) so the hosting panel can detect content changes.

## Properties

### element

> `readonly` **element**: `HTMLElement`

Defined in: [derived/ExpressionEditorTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/derived/ExpressionEditorTypes.ts#L19)

The root DOM element to mount in the panel/modal

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [derived/ExpressionEditorTypes.ts:31](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/derived/ExpressionEditorTypes.ts#L31)

Clean up resources

#### Returns

`void`

***

### focus()

> **focus**(): `void`

Defined in: [derived/ExpressionEditorTypes.ts:25](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/derived/ExpressionEditorTypes.ts#L25)

Focus the editor

#### Returns

`void`

***

### getValue()

> **getValue**(): `string`

Defined in: [derived/ExpressionEditorTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/derived/ExpressionEditorTypes.ts#L21)

Get current editor content

#### Returns

`string`

***

### setError()

> **setError**(`error`): `void`

Defined in: [derived/ExpressionEditorTypes.ts:27](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/derived/ExpressionEditorTypes.ts#L27)

Display an error message inline (null clears the error)

#### Parameters

##### error

`string` \| `null`

#### Returns

`void`

***

### setValue()

> **setValue**(`value`): `void`

Defined in: [derived/ExpressionEditorTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/derived/ExpressionEditorTypes.ts#L23)

Set editor content (for editing existing columns)

#### Parameters

##### value

`string`

#### Returns

`void`

***

### updateCompletionContext()

> **updateCompletionContext**(`context`): `void`

Defined in: [derived/ExpressionEditorTypes.ts:29](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/derived/ExpressionEditorTypes.ts#L29)

Update completion context when schema changes

#### Parameters

##### context

[`CompletionContext`](CompletionContext.md)

#### Returns

`void`
