---
'@jeyabbalas/data-table': patch
---

`CrossfilterCoordinatorOptions` is now exported from `@jeyabbalas/data-table/advanced`, beside `CrossfilterCoordinator`.

It types the constructor's last argument, `{ onFilterCycleComplete? }`, which code could pass but not import by name.
