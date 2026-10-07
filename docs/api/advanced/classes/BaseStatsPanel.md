[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / BaseStatsPanel

# Abstract Class: BaseStatsPanel

Defined in: [visualizations/BaseStatsPanel.ts:140](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L140)

Abstract base class for column stats panels.

Subclasses must implement [update](#update); everything else has a sensible
default. The library guarantees:

- The constructor is called with an empty `container` element (the
  `.dt-col-stats` slot inside a column header), when the column comes
  within about a viewport of the view and the columns there have held
  still for 150 ms: a scroll builds no panel for the columns it passes.
  Those near the view on load, new data or a derived-column change, and a
  column just shown, get theirs at once. A panel lives while its column is
  near the view, through hides, shows and moves of other columns.
- [update](#update) fires on mount, with the stats the column's chart last
  emitted if it has one, `null` otherwise; with `null` whenever the chart
  is removed; and with each `ColumnStatsData` the chart emits (and on data
  reload). Columns without a visualization receive `update(null)` only.
- [updateFilters](#updatefilters) fires every time the table's active filter array
  changes, before any subsequent `update(stats)` call from a viz refetch.
  While a derived-column change that can drop or rebuild the relation
  runs, it waits for the change to settle, then fires once, with the
  filters in force then; a change that succeeds replaces the panel instead.
- [setHoverStats](#sethoverstats) fires when a viz emits a hover snippet for this
  column (and again with `null` to clear), and as the panel is built, with
  the snippet its column's chart shows then, if any. Columns without a viz
  never trigger this.
- [destroy](#destroy) is called exactly once: when the column moves away from
  the view or is hidden, before the container is reused for a
  freshly-constructed panel (new data, a derived column changed), or when
  the table is destroyed. Subclasses are responsible for clearing any DOM
  nodes they appended.

## Constructors

### Constructor

> **new BaseStatsPanel**(`container`, `column`, `options`): `BaseStatsPanel`

Defined in: [visualizations/BaseStatsPanel.ts:146](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L146)

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### options

[`StatsPanelOptions`](../interfaces/StatsPanelOptions.md)

#### Returns

`BaseStatsPanel`

## Properties

### column

> `protected` `readonly` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseStatsPanel.ts:142](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L142)

***

### container

> `protected` `readonly` **container**: `HTMLElement`

Defined in: [visualizations/BaseStatsPanel.ts:141](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L141)

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseStatsPanel.ts:144](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L144)

***

### options

> `protected` **options**: [`StatsPanelOptions`](../interfaces/StatsPanelOptions.md)

Defined in: [visualizations/BaseStatsPanel.ts:143](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L143)

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseStatsPanel.ts:211](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L211)

Tear down the panel. Subclasses must clear any DOM nodes they appended
to `container` and any subscriptions or listeners they registered, then
call `super.destroy()`. The library does not clear the container for
the panel; that is the panel's responsibility.

The library calls `destroy()` exactly once on its own teardown path
(schema change, table destroy). Panels should **not** call `destroy()`
on themselves — the library tracks active panels in a name-keyed map
and a self-destroy leaves a dangling registration whose
`.dt-col-stats` slot is no longer eligible for fallback rendering.
Use `setHoverStats` / `update` to express resting / loading / empty
states instead, and let the library's lifecycle drive `destroy()`.

#### Returns

`void`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseStatsPanel.ts:221](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L221)

The column this panel renders stats for.

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [visualizations/BaseStatsPanel.ts:216](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L216)

True after [destroy](#destroy) has been called.

#### Returns

`boolean`

***

### setHoverStats()

> **setHoverStats**(`_html`): `void`

Defined in: [visualizations/BaseStatsPanel.ts:180](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L180)

Called when the user hovers a visualization bin / segment. `null`
clears the hover and signals the panel should restore its resting state.

The argument is an **HTML string**, not plain text — the same pre-
formatted markup the library's built-in panel briefly renders in place
of the second line (e.g.
`<span class="stats-label">Bin:</span><br>...`). The library's bundled
visualizations escape every user-derived value before producing this
string (see `escapeHTML` calls inside `Histogram` / `ValueCounts`); a
panel writing the value via `innerHTML` is trusting the visualization
to have done that escaping.

Custom visualizations that emit their own hover snippets are
responsible for escaping any user-derived text before passing it to
`onStatsChange`. Panels that only want plain text should write the
value via `textContent`, which strips the markup safely (line breaks
and label styling will be lost, but XSS-safe by construction).

Default implementation is a no-op so simple panels can ignore hover.

#### Parameters

##### \_html

`string` \| `null`

#### Returns

`void`

***

### update()

> `abstract` **update**(`stats`): `void`

Defined in: [visualizations/BaseStatsPanel.ts:157](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L157)

Called when default stats become available or change. Receives `null`
on the initial render before the visualization has fetched, when the
column's chart is removed, or when no visualization is registered.

#### Parameters

##### stats

[`ColumnStatsData`](../type-aliases/ColumnStatsData.md) \| `null`

#### Returns

`void`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseStatsPanel.ts:192](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseStatsPanel.ts#L192)

Called when the table's active filter array changes. The default
implementation only refreshes `this.options.filters`; subclasses that
compute their own statistics should override this to issue queries via
`this.options.bridge`. The visualization is guaranteed to call
[update](#update) with the refreshed `ColumnStatsData` separately, so
panels that only re-render existing stats need not override.

#### Parameters

##### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

#### Returns

`Promise`\<`void`\>
