# SolidJS

Mount in a `createEffect` that depends on your source signal; destroy in
`onCleanup`. Solid's fine-grained reactivity means you can directly drive
external UI from `table.on(...)` subscriptions without any framework
glue.

## Minimal example

```tsx
import { createEffect, onCleanup, type Component } from 'solid-js';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

interface Props {
  source: File | string;
}

export const Table: Component<Props> = (props) => {
  let host: HTMLDivElement | undefined;
  let table: DataTable | undefined;

  createEffect(async () => {
    if (!host) return;
    // createEffect re-runs when props.source changes.
    // Destroy the previous instance before creating a new one.
    if (table && !table.isDestroyed()) await table.destroy();
    table = await createDataTable({ container: host, source: props.source });
  });

  onCleanup(async () => {
    if (table && !table.isDestroyed()) await table.destroy();
  });

  return <div ref={host} style={{ height: '600px' }} />;
};
```

The host element's height is a requirement, not styling. The table
virtualizes against the container's measured height and renders only the
rows that fit; an unbounded container silently defeats virtualization. See
[Sizing the container](../../README.md#sizing-the-container).

`createEffect` tracks `props.source` automatically — it re-runs when the
parent passes a new source. For most use cases, call `loadData()` on the
existing instance instead:

```tsx
createEffect(async () => {
  const source = props.source; // track
  if (!host) return;
  if (!table) {
    table = await createDataTable({ container: host, source });
  } else if (!table.isDestroyed()) {
    await table.loadData(source);
  }
});
```

## Event subscriptions drive Solid signals

Solid's `createSignal` makes event plumbing ergonomic:

```tsx
import { createSignal } from 'solid-js';

const [count, setCount] = createSignal(0);

createEffect(() => {
  if (!table) return;
  const unsub = table.on('filterChange', ({ filteredRowCount }) => {
    setCount(filteredRowCount);
  });
  onCleanup(unsub);
});

return <p>Matching: {count().toLocaleString()}</p>;
```

`onCleanup` inside `createEffect` cleans up on each re-run and on unmount.

## Gotchas

- **Async race.** Like React, creating + destroying in fast succession can race. If you observe it, add a `cancelled` ref flag in `createEffect`.
- **`table` ref should not be a Solid signal.** Making the table object reactive would trap every method call through the signal's get-accessor. Keep it in a plain `let`.
- **SSR.** Solid-Start / SolidStart-style SSR can't run this library server-side. Wrap in `<Show when={isServer === false}>` or defer with `clientOnly`.
- **`onCleanup` returning a Promise.** The Promise result is ignored; Solid doesn't await cleanup functions. If you need to ensure destroy completes before the next effect runs, chain through a shared ref.

## Related

- Events: [Events guide](../guides/events.md)
- API reference: [`createDataTable`](../api-reference.md#createdatatable), [`DataTable.loadData`](../api-reference.md#datatable-interface)
