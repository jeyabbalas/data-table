[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CodeMirrorExpressionEditor

# Class: CodeMirrorExpressionEditor

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:38](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/sql-editor/CodeMirrorExpressionEditor.ts#L38)

Default `ExpressionEditor` implementation built on CodeMirror 6 with
DuckDB SQL grammar, schema-aware autocompletion, and light/dark theming.

Consumers who want a different editor (e.g., Monaco, a bespoke DSL) can
implement the `ExpressionEditor` interface themselves and pass it via
`createDataTable({ editorFactory })`.

The fourth argument sets the placeholder and the accessible name. One left
out, or an empty name, is the English default of
`derived.expressionPlaceholder` or `derived.expressionLabel`; the built-in
dialogs pass the table's `messages`.

## Example

```ts
import { CodeMirrorExpressionEditor } from '@jeyabbalas/data-table/advanced';

const editor = new CodeMirrorExpressionEditor(
  hostEl,
  { columns: [{ name: 'age', type: 'integer', isDerived: false }] },
  'dt',
  { placeholder: 'e.g. age * 2', ariaLabel: 'Age expression' }
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

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:45](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/sql-editor/CodeMirrorExpressionEditor.ts#L45)

#### Parameters

##### container

`HTMLElement`

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

##### classPrefix?

`string` = `'dt'`

##### config?

[`ExpressionEditorConfig`](../../index/interfaces/ExpressionEditorConfig.md)

#### Returns

`CodeMirrorExpressionEditor`

## Properties

### element

> `readonly` **element**: `HTMLElement`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:39](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/sql-editor/CodeMirrorExpressionEditor.ts#L39)

The root DOM element to mount in the panel/modal

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`element`](../../index/interfaces/ExpressionEditor.md#element)

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:149](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/sql-editor/CodeMirrorExpressionEditor.ts#L149)

Clean up resources

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`destroy`](../../index/interfaces/ExpressionEditor.md#destroy)

***

### focus()

> **focus**(): `void`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:127](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/sql-editor/CodeMirrorExpressionEditor.ts#L127)

Focus the editor

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`focus`](../../index/interfaces/ExpressionEditor.md#focus)

***

### getValue()

> **getValue**(): `string`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:117](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/sql-editor/CodeMirrorExpressionEditor.ts#L117)

Get current editor content

#### Returns

`string`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`getValue`](../../index/interfaces/ExpressionEditor.md#getvalue)

***

### setError()

> **setError**(`error`): `void`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:131](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/sql-editor/CodeMirrorExpressionEditor.ts#L131)

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

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:121](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/sql-editor/CodeMirrorExpressionEditor.ts#L121)

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

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:143](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/sql-editor/CodeMirrorExpressionEditor.ts#L143)

Update completion context when schema changes

#### Parameters

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`updateCompletionContext`](../../index/interfaces/ExpressionEditor.md#updatecompletioncontext)
