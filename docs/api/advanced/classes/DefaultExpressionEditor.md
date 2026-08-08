[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DefaultExpressionEditor

# Class: DefaultExpressionEditor

Defined in: [derived/DefaultExpressionEditor.ts:24](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/derived/DefaultExpressionEditor.ts#L24)

Plain-textarea fallback that satisfies [ExpressionEditor](../../index/interfaces/ExpressionEditor.md) when no
custom factory is supplied. Renders a monospace textarea, an error slot,
and a column-hint slot. Apps that want SQL-aware autocompletion should
pass `editorFactory: () => new CodeMirrorExpressionEditor(...)` instead.

The optional 4th `messages` constructor argument lets custom factories
forward the table's i18n bundle so the placeholder text and the
"Available columns:" label localize alongside the rest of the UI.
When omitted (the bare-bones `new DefaultExpressionEditor(c, ctx)`
call), English defaults apply.

## Implements

- [`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md)

## Constructors

### Constructor

> **new DefaultExpressionEditor**(`container`, `context`, `classPrefix?`, `messages?`): `DefaultExpressionEditor`

Defined in: [derived/DefaultExpressionEditor.ts:32](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/derived/DefaultExpressionEditor.ts#L32)

#### Parameters

##### container

`HTMLElement`

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

##### classPrefix?

`string` = `'dt'`

##### messages?

[`Strings`](../../index/interfaces/Strings.md) = `defaultStrings`

#### Returns

`DefaultExpressionEditor`

## Properties

### element

> `readonly` **element**: `HTMLElement`

Defined in: [derived/DefaultExpressionEditor.ts:25](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/derived/DefaultExpressionEditor.ts#L25)

The root DOM element to mount in the panel/modal

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`element`](../../index/interfaces/ExpressionEditor.md#element)

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [derived/DefaultExpressionEditor.ts:97](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/derived/DefaultExpressionEditor.ts#L97)

Clean up resources

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`destroy`](../../index/interfaces/ExpressionEditor.md#destroy)

***

### focus()

> **focus**(): `void`

Defined in: [derived/DefaultExpressionEditor.ts:77](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/derived/DefaultExpressionEditor.ts#L77)

Focus the editor

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`focus`](../../index/interfaces/ExpressionEditor.md#focus)

***

### getValue()

> **getValue**(): `string`

Defined in: [derived/DefaultExpressionEditor.ts:69](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/derived/DefaultExpressionEditor.ts#L69)

Get current editor content

#### Returns

`string`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`getValue`](../../index/interfaces/ExpressionEditor.md#getvalue)

***

### setError()

> **setError**(`error`): `void`

Defined in: [derived/DefaultExpressionEditor.ts:81](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/derived/DefaultExpressionEditor.ts#L81)

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

Defined in: [derived/DefaultExpressionEditor.ts:73](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/derived/DefaultExpressionEditor.ts#L73)

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

Defined in: [derived/DefaultExpressionEditor.ts:93](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/derived/DefaultExpressionEditor.ts#L93)

Update completion context when schema changes

#### Parameters

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`updateCompletionContext`](../../index/interfaces/ExpressionEditor.md#updatecompletioncontext)
