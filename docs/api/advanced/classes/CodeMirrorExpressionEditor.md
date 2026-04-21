[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CodeMirrorExpressionEditor

# Class: CodeMirrorExpressionEditor

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:34](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/sql-editor/CodeMirrorExpressionEditor.ts#L34)

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

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:41](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/sql-editor/CodeMirrorExpressionEditor.ts#L41)

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

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:35](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/sql-editor/CodeMirrorExpressionEditor.ts#L35)

The root DOM element to mount in the panel/modal

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`element`](../../index/interfaces/ExpressionEditor.md#element)

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:137](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/sql-editor/CodeMirrorExpressionEditor.ts#L137)

Clean up resources

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`destroy`](../../index/interfaces/ExpressionEditor.md#destroy)

***

### focus()

> **focus**(): `void`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:115](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/sql-editor/CodeMirrorExpressionEditor.ts#L115)

Focus the editor

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`focus`](../../index/interfaces/ExpressionEditor.md#focus)

***

### getValue()

> **getValue**(): `string`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:105](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/sql-editor/CodeMirrorExpressionEditor.ts#L105)

Get current editor content

#### Returns

`string`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`getValue`](../../index/interfaces/ExpressionEditor.md#getvalue)

***

### setError()

> **setError**(`error`): `void`

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:119](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/sql-editor/CodeMirrorExpressionEditor.ts#L119)

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

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:109](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/sql-editor/CodeMirrorExpressionEditor.ts#L109)

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

Defined in: [sql-editor/CodeMirrorExpressionEditor.ts:131](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/sql-editor/CodeMirrorExpressionEditor.ts#L131)

Update completion context when schema changes

#### Parameters

##### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

#### Returns

`void`

#### Implementation of

[`ExpressionEditor`](../../index/interfaces/ExpressionEditor.md).[`updateCompletionContext`](../../index/interfaces/ExpressionEditor.md#updatecompletioncontext)
