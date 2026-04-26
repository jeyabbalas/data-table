# React

Mount `@jeyabbalas/data-table` in a `useEffect`, destroy it in the cleanup
function. Handle the async-mount race condition with a `cancelled` flag and
guard against React Strict Mode's double-invocation of effects in dev.

## Minimal example

```tsx
import { useEffect, useRef } from 'react';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

export function Table({ source }: { source: File | string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    let instance: DataTable | undefined;

    void createDataTable({ container: hostRef.current, source }).then((t) => {
      if (cancelled) {
        void t.destroy();
        return;
      }
      instance = t;
    });

    return () => {
      cancelled = true;
      if (instance && !instance.isDestroyed()) void instance.destroy();
    };
  }, [source]);

  return <div ref={hostRef} style={{ height: 600 }} />;
}
```

## Why the `cancelled` flag

`createDataTable` is async. If the effect re-runs (or Strict Mode
double-invokes it) before the Promise resolves, the cleanup function runs
first — there's no `instance` to destroy yet. When the Promise finally
resolves, `cancelled === true` tells us to destroy immediately so we don't
leak a table instance.

## Strict Mode

In React 18+ with `<StrictMode>` in development, effects are intentionally
invoked twice on every mount to help catch cleanup bugs. The pattern above
handles this correctly:

1. First effect starts creating the table, cleanup flags `cancelled=true`
2. Second effect starts creating another table
3. First Promise resolves → sees `cancelled=true` → destroys itself
4. Second Promise resolves → mounts successfully

In production builds, Strict Mode's double-invoke is off.

## Driving external UI from events

```tsx
const [count, setCount] = useState(0);

useEffect(() => {
  if (!instance) return;
  const unsub = instance.on('filterChange', ({ filteredRowCount }) => {
    setCount(filteredRowCount);
  });
  return unsub;
}, [instance]);
```

Place event subscriptions in a separate effect depending on the table
instance (stored in a ref or in state) rather than in the mount effect —
that keeps the lifecycle clean and makes the dependency array explicit.

## Route changes

React Router / Next.js App Router both unmount the component on route
change, which runs the cleanup function. That destroys the table and
releases the worker. On navigation back, a new table mounts.

If you want to preserve the table across route changes, hoist it into a
context or a ref outside the component tree — but that's rarely worth it;
session persistence restores filters/sort on re-mount.

## Key based on data source

If `source` changes (e.g., the user picks a new CSV), re-keying the
component is a clean way to force a full teardown + remount:

```tsx
<Table key={sourceKey} source={currentSource} />
```

Alternative: call `table.loadData(newSource)` inside an effect that depends
on `source`.

## Recipes

### Call an imperative method on the table

Expose it via a ref:

```tsx
const tableRef = useRef<DataTable | null>(null);

useEffect(() => {
  /* … same mount logic, assign to tableRef.current … */
}, [source]);

const onExportClick = () => tableRef.current?.openExportDialog();
```

### Memoize expensive props

```tsx
const options = useMemo(
  () => ({
    container: hostRef.current!,
    source,
    messages: myFrenchMessages, // stable reference
  }),
  [source],
);
```

Passing inline object literals to an effect dep list causes re-mounts; use
`useMemo`.

## Gotchas

- **Strict Mode double-invoke.** Without the `cancelled` guard you'll leak a table per mount in dev.
- **`source` as a dep.** If `source` is an object or inline string, the effect re-runs every render. Use a primitive (URL string) or memoize.
- **Don't throw in the cleanup.** `destroy()` is async and returns a Promise. `void instance.destroy()` silences lint; in modern React the Promise result is ignored.
- **SSR.** This library is browser-only. If you render this component in an SSR context (Next.js Pages Router getServerSideProps), the `useEffect` won't run server-side — but other browser-only usage in the same file could crash. Confine browser imports to client-only files.

## Related

- Next.js: [Next.js integration](./nextjs.md) for App Router / Pages Router SSR guards
- Events: [Events guide](../guides/events.md) for the full event catalog
- API reference: [`createDataTable`](../api-reference.md#createdatatable), [`DataTable` interface](../api-reference.md#datatable-interface)
