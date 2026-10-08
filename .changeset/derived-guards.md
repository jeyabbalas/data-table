---
'@jeyabbalas/data-table': patch
---

A derived column whose expression does not give one value per row, such as `unnest(tags)` or a bare `sum(price)`, is refused, and a derived-column change that fails leaves everything as it was.

- A derived column whose expression does not give one value per row is refused with `EXPRESSION_INVALID`, and the message says what to write instead.
  - **Before:** validation bound the expression alone, which takes both kinds. `unnest("tags")`, and a macro over it such as `generate_subscripts`, gave the VIEW a row for each element and none for an empty list, with `__rowid__` repeated: the grid's blocks stayed placeholders and a filtered count read `3 / 2 rows`. A bare aggregate such as `sum(price)` passed validation but not the VIEW build, and stayed in the list of derived columns, so every later add, extract and removal failed until an undo, a redo or a new load.
  - **Now:** validation binds the expression as the VIEW will. An `unnest` asks for a list function such as `list_transform`, or a subquery; an aggregate asks for a window, `sum(x) OVER ()`. Window functions, list comprehensions, lambdas and an `unnest` inside a subquery still work. A saved session, an undo or a redo that holds such a column leaves it out, with a console warning.
- Every derived-column change is all or nothing. When an add, an edit, a replacement or a removal fails, the derived columns and the VIEW are as they were.
- Editing a vector column no longer breaks the VIEW. An update dropped the column's helper table before it checked the new definition, so values of the wrong length, or any edit of a vector column into an expression, left the VIEW reading a table that was gone, and every query failed. An update or a replacement now makes its new helper table beside the old one, and drops the one no column reads once the VIEW is built.
