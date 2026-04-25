[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DefaultExpressionEditor

# Class: DefaultExpressionEditor

Defined in: [derived/DefaultExpressionEditor.ts:11](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DefaultExpressionEditor.ts#L11)

Interface that custom expression editors must implement.

The editor's root element must dispatch DOM `input` events (or let them
bubble from child elements) so the hosting panel can detect content changes.

## Implements

- [`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md)

## Constructors

### Constructor

> **new DefaultExpressionEditor**(`container`, `context`, `classPrefix?`): `DefaultExpressionEditor`

Defined in: [derived/DefaultExpressionEditor.ts:18](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DefaultExpressionEditor.ts#L18)

#### Parameters

##### container

`HTMLElement`

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

##### classPrefix?

`string` = `'dt'`

#### Returns

`DefaultExpressionEditor`

## Properties

### element

> `readonly` **element**: `HTMLElement`

Defined in: [derived/DefaultExpressionEditor.ts:12](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DefaultExpressionEditor.ts#L12)

The root DOM element to mount in the panel/modal

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`element`](../../index/interfaces/ExpressionEditor.md#element)

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [derived/DefaultExpressionEditor.ts:81](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DefaultExpressionEditor.ts#L81)

Clean up resources

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`destroy`](../../index/interfaces/ExpressionEditor.md#destroy)

***

### focus()

> **focus**(): `void`

Defined in: [derived/DefaultExpressionEditor.ts:61](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DefaultExpressionEditor.ts#L61)

Focus the editor

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`focus`](../../index/interfaces/ExpressionEditor.md#focus)

***

### getValue()

> **getValue**(): `string`

Defined in: [derived/DefaultExpressionEditor.ts:53](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DefaultExpressionEditor.ts#L53)

Get current editor content

#### Returns

`string`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`getValue`](../../index/interfaces/ExpressionEditor.md#getvalue)

***

### setError()

> **setError**(`error`): `void`

Defined in: [derived/DefaultExpressionEditor.ts:65](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DefaultExpressionEditor.ts#L65)

Display an error message inline (null clears the error)

#### Parameters

##### error

`string` \| `null`

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`setError`](../../index/interfaces/ExpressionEditor.md#seterror)

***

### setValue()

> **setValue**(`value`): `void`

Defined in: [derived/DefaultExpressionEditor.ts:57](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DefaultExpressionEditor.ts#L57)

Set editor content (for editing existing columns)

#### Parameters

##### value

`string`

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`setValue`](../../index/interfaces/ExpressionEditor.md#setvalue)

***

### updateCompletionContext()

> **updateCompletionContext**(`context`): `void`

Defined in: [derived/DefaultExpressionEditor.ts:77](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DefaultExpressionEditor.ts#L77)

Update completion context when schema changes

#### Parameters

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`updateCompletionContext`](../../index/interfaces/ExpressionEditor.md#updatecompletioncontext)
