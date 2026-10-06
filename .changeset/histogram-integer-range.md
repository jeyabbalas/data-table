---
'@jeyabbalas/data-table': patch
---

Histograms no longer fail on integer and `DECIMAL` columns whose values span more than the column's type can hold (#172).

Binning subtracted the column's minimum in the column's own type, so a `SMALLINT` column from −28,775 to 29,539 failed with `Out of Range Error: Overflow in subtraction of INT16` and its chart showed as failed, as did a `TINYINT`, `INTEGER` or `BIGINT` column spanning more than its type's maximum and a `DECIMAL` spanning most of its precision. Each value is now cast to `DOUBLE` before the minimum is subtracted, as the minimum and maximum already were.

That also fixes integers past 2^53, whose minimum can round above the smallest value: a `UBIGINT` column failed with `Overflow in subtraction of UINT64`, and a `BIGINT` column left its smallest values out of the bins.
