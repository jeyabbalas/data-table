[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CodeMirrorExpressionEditor

# Class: CodeMirrorExpressionEditor

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:32](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/sql-editor/CodeMirrorExpressionEditor.ts#L32)

Default `ExpressionEditor` implementation built on CodeMirror 6 with
DuckDB SQL grammar, schema-aware autocompletion, and light/dark theming.

Consumers who want a different editor (e.g., Monaco, a bespoke DSL) can
implement the `ExpressionEditor` interface themselves and pass it via
`createDataTable({ editorFactory })`.

## Example

```ts
import { CodeMirrorExpressionEditor } from '@jeyabbalas/data-table/advanced';

const editor = new CodeMirrorExpressionEditor(
  hostEl,
  { columns: [{ name: 'age', type: 'integer', isDerived: false }] },
  'dt',
  { placeholder: 'e.g. age * 2' }
);
// later:
const expr = editor.getValue();
```

## See

DUCKDB_FUNCTIONS — the built-in function list surfaced by autocomplete.

## Implements

- [`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md)

## Constructors

### Constructor

> **new CodeMirrorExpressionEditor**(`container`, `context`, `classPrefix?`, `config?`): `CodeMirrorExpressionEditor`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:39](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/sql-editor/CodeMirrorExpressionEditor.ts#L39)

#### Parameters

##### container

`HTMLElement`

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

##### classPrefix?

`string` = `'dt'`

##### config?

###### placeholder?

`string`

#### Returns

`CodeMirrorExpressionEditor`

## Properties

### element

> `readonly` **element**: `HTMLElement`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:33](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/sql-editor/CodeMirrorExpressionEditor.ts#L33)

The root DOM element to mount in the panel/modal

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`element`](../../index/interfaces/ExpressionEditor.md#element)

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:140](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/sql-editor/CodeMirrorExpressionEditor.ts#L140)

Clean up resources

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`destroy`](../../index/interfaces/ExpressionEditor.md#destroy)

***

### focus()

> **focus**(): `void`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:118](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/sql-editor/CodeMirrorExpressionEditor.ts#L118)

Focus the editor

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`focus`](../../index/interfaces/ExpressionEditor.md#focus)

***

### getValue()

> **getValue**(): `string`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:108](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/sql-editor/CodeMirrorExpressionEditor.ts#L108)

Get current editor content

#### Returns

`string`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`getValue`](../../index/interfaces/ExpressionEditor.md#getvalue)

***

### setError()

> **setError**(`error`): `void`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:122](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/sql-editor/CodeMirrorExpressionEditor.ts#L122)

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

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:112](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/sql-editor/CodeMirrorExpressionEditor.ts#L112)

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

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:134](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/sql-editor/CodeMirrorExpressionEditor.ts#L134)

Update completion context when schema changes

#### Parameters

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`updateCompletionContext`](../../index/interfaces/ExpressionEditor.md#updatecompletioncontext)
