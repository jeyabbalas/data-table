---
'@jeyabbalas/data-table': minor
---

The `@duckdb/duckdb-wasm` peer floor is now 1.33.1-dev57.0, the version the library's DuckDB worker is built with: the range is `^1.33.1-dev57.0`, up from `^1.33.1-dev45.0`.

The worker carries duckdb-wasm's JavaScript from 1.33.1-dev57.0 and, unless `bridgeOptions.duckdbBundles` names other files, fetches that version's WASM and worker files from jsDelivr, so a table runs 1.33.1-dev57.0 whichever version the app installs. The library's fix for files opened once DuckDB's memory passes 2 GiB is written for that version's worker, and DuckDB files an app hosts itself must come from the same version. 0.9 is tested on 1.33.1-dev57.0 only, and the old floor let an app install 1.33.1-dev45.0 to 1.33.1-dev56.0 and copy their files.

**Migration**

- Install a version in range. npm picks the version duckdb-wasm's `latest` tag names, 1.33.1-dev57.0 at this release, for an app that does not list `@duckdb/duckdb-wasm`, and moves an app on `^1.33.1-dev45.0` to it. An app that pins an older version stops with `ERESOLVE` until the pin moves to 1.33.1-dev57.0 or later.
- When you self-host DuckDB's files through `bridgeOptions.duckdbBundles`, copy them from `@duckdb/duckdb-wasm@1.33.1-dev57.0` and pin that exact version in `package.json` (`"@duckdb/duckdb-wasm": "1.33.1-dev57.0"`, without `^`). The range also admits later releases, such as 1.33.1-dev65.0, and the worker is not built for their files.
