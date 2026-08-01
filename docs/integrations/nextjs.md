# Next.js

The library is browser-only — no SSR support. Next.js patterns for
client-only components differ between the App Router (Next 13+) and the
Pages Router. Both are covered here.

## App Router — Next 13+

Mark your component with `'use client'`, then use the standard React
mount pattern:

```tsx
// app/components/DataTableView.tsx
'use client';

import { useEffect, useRef } from 'react';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

export function DataTableView({ source }: { source: string }) {
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

The host element's height is a requirement, not styling. The table
virtualizes against the container's measured height and renders only the
rows that fit; an unbounded container silently renders every row. If you
prefer `height: 100%` or `flex: 1` over a fixed height, every ancestor up
to `<html>` needs a resolved height too — including the `<body>` your root
layout renders. See
[Sizing the container](../../README.md#sizing-the-container).

Use it from a server component or another client component:

```tsx
// app/dashboard/page.tsx
import { DataTableView } from '@/components/DataTableView';

export default function Page() {
  return <DataTableView source="/data/trips.csv" />;
}
```

The server component renders the React tree on the server, but
`DataTableView` doesn't execute — it's deferred to the client because of
`'use client'`.

### Dynamic import for heavier isolation

If you want to guarantee no server-side evaluation even of the component's
module (e.g., if your bundler chains imports that pull in browser-only
code), use `next/dynamic`:

```tsx
// app/dashboard/page.tsx
import dynamic from 'next/dynamic';

const DataTableView = dynamic(
  () => import('@/components/DataTableView').then((m) => m.DataTableView),
  { ssr: false },
);

export default function Page() {
  return <DataTableView source="/data/trips.csv" />;
}
```

`ssr: false` tells Next.js never to render on the server. The first paint
shows `loading: …` (or your custom placeholder); the client hydrates and
renders the real component.

## Pages Router — Next ≤12 / 13 compat

```tsx
// pages/dashboard.tsx
import dynamic from 'next/dynamic';

const DataTableView = dynamic(() => import('../components/DataTableView'), { ssr: false });

export default function DashboardPage() {
  return <DataTableView source="/data/trips.csv" />;
}
```

The `DataTableView` component file itself uses the same React mount
pattern shown in the [React integration guide](./react.md).

## Asset serving

Place fixtures under `public/`:

```
public/
  data/
    trips.csv
    trips.parquet
```

Reference them with absolute paths (`/data/trips.csv`) — Next.js serves
everything under `public/` at the site root.

## Static WASM bundles

If you need offline / strict-CSP deployments with self-hosted DuckDB
bundles (see [CSP and offline](../guides/csp-and-offline.md)):

1. Copy the DuckDB-WASM `dist/` directory from `@duckdb/duckdb-wasm` into
   `public/duckdb/`.
2. Point `bridgeOptions.duckdbBundles` at those URLs:

```tsx
'use client';

const bundles = {
  mvp: {
    mainModule: '/duckdb/duckdb-mvp.wasm',
    mainWorker: '/duckdb/duckdb-browser-mvp.worker.js',
  },
  eh: {
    mainModule: '/duckdb/duckdb-eh.wasm',
    mainWorker: '/duckdb/duckdb-browser-eh.worker.js',
  },
};

await createDataTable({
  container,
  source,
  bridgeOptions: { duckdbBundles: bundles },
});
```

## CSP

Next.js sets permissive CSP by default. If you override it:

```
script-src 'self';
worker-src 'self';
```

Plus whatever your app needs. Avoid `'unsafe-inline'` and `'unsafe-eval'`
— the library doesn't need either.

## Route-change cleanup

Next.js unmounts route-component trees on navigation, which runs the
effect cleanup (`destroy()`). On navigation back, a fresh table mounts.
If session persistence is enabled (default), filters/columns restore.

## Gotchas

- **`'use client'` is non-inheritable.** Every component that touches browser-only APIs needs it or must be imported from one that has it.
- **Don't import the library in a server component.** Even a top-level `import` evaluates during SSR. Confine library imports to client components.
- **Worker URL across App Router.** Next.js can inline workers or serve them as separate chunks depending on your config. If you see `WORKER_CRASHED` errors in production but not dev, check your webpack/turbopack config for worker handling — see [Webpack integration](./webpack.md) for details.
- **`next/dynamic`'s loading state is your friend.** Render a skeleton or spinner during the client-only load instead of a blank area.
- **Streaming SSR and React 18.** The library's mounting happens in `useEffect`, which only runs after hydration. Streaming doesn't change that — the table appears after the component hydrates.

## Related

- React: [React integration](./react.md) for the underlying mount pattern
- CSP / offline: [CSP and offline guide](../guides/csp-and-offline.md)
- Webpack: [Webpack integration](./webpack.md) (Next.js uses webpack by default)
- Vite: [Vite integration](./vite.md) (if you're using Next with Turbopack, some details differ)
