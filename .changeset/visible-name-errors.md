---
'@jeyabbalas/data-table': patch
---

The derived-column panels and the export dialog show the errors they set but the stylesheet hid.

- The derived-column panels show their name and vector-value errors and why creating a column failed, and the export dialog why an export or copy failed: each was set but hidden by the stylesheet. Validate with no expression says one is required, the name and values fields are labelled and described by their errors, and a failed create or export is announced.
