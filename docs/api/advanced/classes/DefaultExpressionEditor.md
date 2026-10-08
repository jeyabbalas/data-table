[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DefaultExpressionEditor

# Class: DefaultExpressionEditor

Defined in: [derived/DefaultExpressionEditor.ts:32](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DefaultExpressionEditor.ts#L32)

Plain-textarea implementation of [ExpressionEditor](../../index/interfaces/ExpressionEditor.md): a monospace
textarea, an error slot, and a column-hint slot, without SQL-aware
autocompletion. The built-in dialogs use `CodeMirrorExpressionEditor`;
pass `editorFactory: (c, ctx, config) => new DefaultExpressionEditor(c,
ctx, 'dt', undefined, config)` to `createDataTable()` to use this one
instead.

The optional 4th `messages` constructor argument lets custom factories
forward the table's i18n bundle so the placeholder text and the
"Available columns:" label localize alongside the rest of the UI.
When omitted (the bare-bones `new DefaultExpressionEditor(c, ctx)`
call), English defaults apply.

The optional 5th, the `config` a factory gets, sets the placeholder and
the textarea's accessible name (`aria-label`) for the dialog it opens in;
one left out, or an empty name, comes from `messages`
(`derived.expressionPlaceholder`, `derived.expressionLabel`).

## Implements

- [`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md)

## Constructors

### Constructor

> **new DefaultExpressionEditor**(`container`, `context`, `classPrefix?`, `messages?`, `config?`): `DefaultExpressionEditor`

Defined in: [derived/DefaultExpressionEditor.ts:40](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DefaultExpressionEditor.ts#L40)

#### Parameters

##### container

`HTMLElement`

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

##### classPrefix?

`string` = `'dt'`

##### messages?

[`Strings`](../../index/interfaces/Strings.md) = `defaultStrings`

##### config?

[`ExpressionEditorConfig`](../../index/interfaces/ExpressionEditorConfig.md)

#### Returns

`DefaultExpressionEditor`

## Properties

### element

> `readonly` **element**: `HTMLElement`

Defined in: [derived/DefaultExpressionEditor.ts:33](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DefaultExpressionEditor.ts#L33)

The root DOM element to mount in the panel/modal

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`element`](../../index/interfaces/ExpressionEditor.md#element)

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [derived/DefaultExpressionEditor.ts:113](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DefaultExpressionEditor.ts#L113)

Clean up resources

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`destroy`](../../index/interfaces/ExpressionEditor.md#destroy)

***

### focus()

> **focus**(): `void`

Defined in: [derived/DefaultExpressionEditor.ts:93](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DefaultExpressionEditor.ts#L93)

Focus the editor

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`focus`](../../index/interfaces/ExpressionEditor.md#focus)

***

### getValue()

> **getValue**(): `string`

Defined in: [derived/DefaultExpressionEditor.ts:85](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DefaultExpressionEditor.ts#L85)

Get current editor content

#### Returns

`string`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`getValue`](../../index/interfaces/ExpressionEditor.md#getvalue)

***

### setError()

> **setError**(`error`): `void`

Defined in: [derived/DefaultExpressionEditor.ts:97](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DefaultExpressionEditor.ts#L97)

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

Defined in: [derived/DefaultExpressionEditor.ts:89](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DefaultExpressionEditor.ts#L89)

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

Defined in: [derived/DefaultExpressionEditor.ts:109](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DefaultExpressionEditor.ts#L109)

Update completion context when schema changes

#### Parameters

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`updateCompletionContext`](../../index/interfaces/ExpressionEditor.md#updatecompletioncontext)
