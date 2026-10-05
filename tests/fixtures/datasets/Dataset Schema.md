# Dataset Schema Documentation

This directory contains the test datasets below, most of them in three formats (CSV, JSON, Parquet); see [File Formats](#file-formats) for which formats each one comes in.

## Titanic Dataset

**Source:** [Data Science Dojo / Kaggle Titanic Competition](https://github.com/datasciencedojo/datasets)

**Description:** Passenger manifest from the RMS Titanic, which sank on April 15, 1912. Contains demographic and ticket information along with survival outcomes.

**Size:** 891 rows × 12 columns

### Schema

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `PassengerId` | integer | No | Unique identifier for each passenger (1-891) |
| `Survived` | integer | No | Survival status: 0 = died, 1 = survived |
| `Pclass` | integer | No | Ticket class: 1 = first, 2 = second, 3 = third |
| `Name` | string | No | Full name of the passenger, including title |
| `Sex` | string | No | Gender: "male" or "female" |
| `Age` | float | Yes | Age in years (fractional for infants) |
| `SibSp` | integer | No | Number of siblings/spouses aboard |
| `Parch` | integer | No | Number of parents/children aboard |
| `Ticket` | string | No | Ticket number |
| `Fare` | float | No | Passenger fare in British pounds |
| `Cabin` | string | Yes | Cabin number (many missing values) |
| `Embarked` | string | Yes | Port of embarkation: C = Cherbourg, Q = Queenstown, S = Southampton |


---

## NYC Yellow Taxi Trip Dataset

**Source:** [NYC Taxi & Limousine Commission (TLC) Trip Record Data](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page)

**Description:** Yellow taxi trip records from New York City, January 2024. Each row represents a single taxi trip with pickup/dropoff information, fare breakdown, and payment details.

**Original Size:** ~3,000,000 rows × 19 columns

**Truncated Size:** 100,000 rows × 19 columns

### Data Truncation Method

The original January 2024 parquet file from the NYC TLC contains approximately 3 million trip records. To create a manageable file size while preserving data characteristics, the dataset was truncated using random sampling of 100,000 rows (~3% of original) without replacement. Due to JSON's verbose nature, the full 100,000 rows would produce a ~50 MB file. Therefore, the JSON file contains an additional 25% subsample (25,000 rows).

### Schema

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `VendorID` | integer | No | TPEP provider: 1 = Creative Mobile Technologies, 2 = VeriFone Inc. |
| `tpep_pickup_datetime` | datetime | No | Date and time when the meter was engaged |
| `tpep_dropoff_datetime` | datetime | No | Date and time when the meter was disengaged |
| `passenger_count` | float | Yes | Number of passengers (driver-reported) |
| `trip_distance` | float | No | Trip distance in miles from the taximeter |
| `RatecodeID` | float | Yes | Rate code in effect (see values below) |
| `store_and_fwd_flag` | string | Yes | "Y" = store and forward trip (no server connection), "N" = not |
| `PULocationID` | integer | No | TLC Taxi Zone ID for pickup location |
| `DOLocationID` | integer | No | TLC Taxi Zone ID for dropoff location |
| `payment_type` | integer | No | Payment method (see values below) |
| `fare_amount` | float | No | Time-and-distance fare calculated by the meter |
| `extra` | float | No | Miscellaneous extras and surcharges |
| `mta_tax` | float | No | $0.50 MTA tax triggered by metered rate |
| `tip_amount` | float | No | Tip amount (auto-populated for credit card, cash tips not included) |
| `tolls_amount` | float | No | Total amount of all tolls paid |
| `improvement_surcharge` | float | No | $0.30 improvement surcharge for trips at metered rate |
| `total_amount` | float | No | Total amount charged to passengers (excludes cash tips) |
| `congestion_surcharge` | float | Yes | $2.50 surcharge for trips in Manhattan congestion zone |
| `Airport_fee` | float | Yes | $1.25 for pickups at LaGuardia and JFK airports |

### Enumerated Values

**RatecodeID:**

| Value | Description |
|-------|-------------|
| 1 | Standard rate |
| 2 | JFK |
| 3 | Newark |
| 4 | Nassau or Westchester |
| 5 | Negotiated fare |
| 6 | Group ride |

**payment_type:**

| Value | Description |
|-------|-------------|
| 1 | Credit card |
| 2 | Cash |
| 3 | No charge |
| 4 | Dispute |
| 5 | Unknown |
| 6 | Voided trip |

---

## Numeric Stress Tests Dataset

**Source:** Synthetically generated for stress testing histogram visualization of numeric variables

**Description:** A dataset designed to test edge cases in numeric data visualization, particularly histogram rendering. Contains columns with extreme values, scientific notation, all-null columns, single-value columns, and mixed data types.

**Size:** 100 rows × 16 columns

### Schema

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `id` | integer | No | Row identifier (1-100) |
| `all_nulls` | null | Yes | 100% null values - tests empty column handling |
| `single_value` | integer | No | All values = 42 - tests single-bin histogram |
| `two_values` | integer | No | Only values 0 and 1 - tests binary distribution |
| `extreme_large` | float | No | Very large numbers (1e9 to 1e15) - tests axis label abbreviation |
| `tiny_values` | float | No | Very small numbers (0.0001 to 1e-10) - tests scientific notation display |
| `all_negative` | float | No | All negative numbers (-999 to -50.5) - tests negative axis rendering |
| `mixed_pos_neg` | float | No | Range from -100 to +98 - tests zero-crossing axis |
| `mixed_type` | string | No | Mix of numeric strings ("42", "100.5") and text ("N/A", "error", "12abc") |
| `numeric_1` | float | No | Normal-like distribution (~35-88) |
| `numeric_2` | integer | No | Uniform distribution (45-901) |
| `numeric_3` | float | No | Exponential-like growth (1.1 to 295M) |
| `numeric_4` | integer | No | Integers (12-91) |
| `numeric_5` | float | No | High-precision decimals (9 decimal places) |
| `scientific_notation` | float | No | Values in scientific notation (1.23e-60 to 9.87e60) |
| `category` | string | No | Categorical values: A, B, C, D |

---

## DateTime Stress Tests Dataset

**Source:** Synthetically generated for stress testing datetime histogram visualization

**Description:** A comprehensive dataset designed to test edge cases in datetime data visualization, particularly histogram rendering with automatic time interval detection. Contains columns covering all DuckDB datetime types, various time ranges for interval testing, edge cases, precision variants, and string format columns for parsing tests.

**Size:** 450 rows × 39 columns

**Specification:** See `docs/duckdb-datetime-stress-test.md` for detailed requirements.

### Schema

#### Core DateTime Types

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `id` | integer | No | Row identifier (1-450) |
| `date_standard` | DATE | No | Standard ISO dates spanning 50 years |
| `time_standard` | TIME | No | Random times with microsecond precision |
| `timestamp_standard` | TIMESTAMP | No | Timestamps spanning 50 years |
| `timestamp_tz` | TIMESTAMPTZ | No | Timezone-aware timestamps with various offsets |

#### Time Range Coverage (Interval Detection Testing)

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `range_seconds` | TIMESTAMP | No | ~2 minutes of data - tests 'second' interval |
| `range_minutes` | TIMESTAMP | No | ~2 hours of data - tests 'minute' interval |
| `range_hours` | TIMESTAMP | No | ~2 days of data - tests 'hour' interval |
| `range_days` | TIMESTAMP | No | ~2 months of data - tests 'day' interval |
| `range_weeks` | TIMESTAMP | No | ~6 months of data - tests 'week' interval |
| `range_months` | TIMESTAMP | No | ~3 years of data - tests 'month' interval |
| `range_years` | TIMESTAMP | No | ~20 years of data - tests 'year' interval |

#### Edge Cases

| Column | Data Type      | Nullable | Description |
|--------|----------------|----------|-------------|
| `all_nulls` | STRING/INTEGER | Yes | 100% null values - tests empty column handling |
| `single_value` | TIMESTAMP      | No | All identical timestamps - tests single-bin histogram |
| `with_nulls` | TIMESTAMP      | Yes | ~20% null values - tests mixed null handling |
| `epoch_boundary` | TIMESTAMP      | No | Values around Unix epoch (1970-01-01) |
| `y2k_boundary` | TIMESTAMP      | No | Values around Y2K (2000-01-01) |
| `leap_year_dates` | DATE           | No | Feb 28/29 across leap and non-leap years |
| `month_boundaries` | DATE           | No | End of months (28, 29, 30, 31 day variants) |

#### Precision Variants

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `precision_whole_sec` | TIMESTAMP | No | Whole seconds only (no fractional) |
| `precision_milli` | TIMESTAMP | No | Millisecond precision |
| `precision_micro` | TIMESTAMP | No | Full microsecond precision |

#### Special Cases

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `midnight_times` | TIME | No | 00:00:00 values with varying microseconds |
| `end_of_day` | TIME | No | 23:59:59.999999 values |
| `timezone_variety` | TIMESTAMPTZ | No | 15 different UTC offsets |

#### String Format Columns (`strptime` Parsing Tests)

| Column | Data Type | Format | Example |
|--------|-----------|--------|---------|
| `str_date_iso` | VARCHAR | `%Y-%m-%d` | `2025-12-30` |
| `str_date_us` | VARCHAR | `%m/%d/%Y` | `12/30/2025` |
| `str_date_eu` | VARCHAR | `%d/%m/%Y` | `30/12/2025` |
| `str_date_compact` | VARCHAR | `%Y%m%d` | `20251230` |
| `str_date_long` | VARCHAR | `%B %d, %Y` | `December 30, 2025` |
| `str_time_24h` | VARCHAR | `%H:%M:%S` | `14:30:45` |
| `str_time_12h` | VARCHAR | `%I:%M:%S %p` | `02:30:45 PM` |
| `str_time_micro` | VARCHAR | `%H:%M:%S.%f` | `14:30:45.123456` |
| `str_datetime_iso` | VARCHAR | `%Y-%m-%d %H:%M:%S` | `2025-12-30 14:30:45` |
| `str_datetime_iso_t` | VARCHAR | `%Y-%m-%dT%H:%M:%S` | `2025-12-30T14:30:45` |
| `str_datetime_us` | VARCHAR | `%m/%d/%Y %I:%M:%S %p` | `12/30/2025 02:30:45 PM` |
| `str_datetime_eu` | VARCHAR | `%d/%m/%Y %H:%M:%S` | `30/12/2025 14:30:45` |

#### Ambiguous Format Test Cases

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `ambig_date` | VARCHAR | No | Dates where MM and DD are both 01-12 (ambiguous format) |
| `str_date_short_year` | VARCHAR | No | 2-digit year format (`%d/%m/%y`) |

---

## Vins de France Dataset

**Source:** Hand-authored for the `07-i18n-french` example.

**Description:** A small French wine catalog used to demonstrate internationalization — column names, values, and the data's subject matter are all native French, so the i18n example pairs a French UI with a French-native dataset instead of translating chrome over English data.

**Size:** 40 rows × 8 columns

### Schema

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `region` | string | No | Wine-producing region (e.g. `Bourgogne`, `Bordeaux`, `Champagne`). |
| `appellation` | string | No | Protected appellation within the region (e.g. `Chablis`, `Saint-Émilion`). |
| `cepage` | string | No | Grape variety (e.g. `Chardonnay`, `Pinot Noir`, `Sauvignon Blanc`). |
| `couleur` | string | No | Wine color: `rouge`, `blanc`, or `rosé`. |
| `millesime` | integer | No | Vintage year (2016–2023). |
| `prix_eur` | float | No | Average bottle price in euros. |
| `production_hl` | integer | No | Annual production in hectolitres. |
| `bio` | boolean | No | Whether the producer carries organic certification. |

Provided as CSV + JSON. Parquet is not generated for this fixture because it is static and has no stress-testing role.

---

## US Customer Orders Dataset

**Source:** Synthetic (hand-generated with deterministic PRNG; see `examples/08-custom-visualization/`).

**Description:** Sample customer-order log used by the US-states choropleth example. 181 rows with a deliberately uneven per-state distribution (CA/TX/NY/FL heavy, Mountain West light, two null states) so the choropleth shows a clear gradient.

**Size:** 181 rows × 5 columns.

### Schema

| Column | Data Type | Nullable | Description |
|--------|-----------|----------|-------------|
| `order_id` | integer | No | Sequential identifier 1…181. |
| `state` | string | Yes | USPS 2-letter state code (`CA`, `NY`, `TX`, …). Empty for 2 rows. |
| `product_category` | string | No | One of `Electronics`, `Apparel`, `Home`, `Books`, `Grocery`. |
| `order_total_usd` | float | No | Order total in US dollars, $5–$2,500. |
| `order_date` | date | No | Order date in 2025 (`YYYY-MM-DD`). |

Provided as CSV only. This fixture is solely for the choropleth demo and has no stress-testing role.

---

## Nested Stress Tests Dataset

**Source:** Synthetically generated by `generate-nested-stress-tests.py` for stress testing nested values: LIST, STRUCT, MAP and JSON, nested inside one another.

**Description:** Columns of every nested shape a Parquet or JSON file can give DuckDB, with values chosen to break naive handling: JavaScript-hostile keys (`size`, `toJSON`, `__proto__`), names that need SQL quoting, NULL at every level, numeric and date edges, text that needs escaping, long lists, and a ZWJ emoji placed across the grid's 1,000-grapheme display cap. Rows 0-11 are showcase rows; rows 12-999 are seeded random values, about 10% NULL and, for lists and maps, about 10% empty.

**Size:** Parquet: 1,000 rows × 36 columns, 4 row groups of 250 rows (~650 KB). JSON: 1,000 rows × 21 columns (~570 KB).

**Files:**

| File | Contents |
|------|----------|
| `parquet/nested-stress-tests.parquet` | The Parquet columns below, Snappy-compressed |
| `json/nested-stress-tests.json` | The JSON columns below: an array of records, one per line |
| `nested-stress-tests.manifest.json` | Per column of each file: kind, Arrow type, the DuckDB type, NULL count, empty count, longest list or largest map; the purpose of each showcase row |

There is no CSV: DuckDB's CSV reader never infers a nested type.

The DuckDB types are what `DESCRIBE` reports after the library's loaders (`src/worker/loaders/`) load each file, recorded with DuckDB 1.5.4; the loaders add `__rowid__ BIGINT` first, and `id` equals it. `tests/worker/loaders/nestedStress.duckdb.test.ts` checks the types and counts against a real DuckDB, and `tests/helpers/nestedFixture.ts` loads the files and exposes the manifest and the showcase row ids.

### Regenerating

```bash
python3 tests/fixtures/datasets/generate-nested-stress-tests.py
```

Needs pyarrow (23.0.0 used) and numpy (1.26.4 used). Each column draws from its own random stream, seeded by (20261005, the column's name), so adding a column changes no other, and two runs write byte-identical files. Before writing, the script checks that every JSON value parses as standard JSON, that map keys are unique, that the fixed-size list is never NULL, and that the emoji sits across the cap; it writes the JSON file without NaN or Infinity and prints each file's sha256. If DuckDB starts reading a file differently, update `EXPECTED_PARQUET_TYPES` / `EXPECTED_JSON_TYPES` in the script and regenerate.

### Showcase Rows

The same row holds the same kind of edge case in every column that can express it; columns that cannot hold a random value there.

| Row | Name | Holds |
|-----|------|-------|
| 0 | `ALL_NULL` | NULL in every column except `id`, `embedding` (a fixed-size list is never NULL: 32 NULL elements) and `all_empty_list` |
| 1 | `EMPTIES` | `[]`, `{}` maps, structs whose fields are all NULL, `''`, an empty blob, the JSON document `{}`, an all-zero embedding |
| 2 | `NULL_ELEMENTS` | NULL inside values: `[4, NULL, 17]`, NULL map values and struct fields, a NULL inner list, a NULL struct in `people`, SQL NULL next to the JSON literal `null` in `json_list` |
| 3 | `NUMERIC_EXTREMES` | 2^53-1 and 2^53+1, INT64 min/max, UINT64 max, the decimals `[1.25, 2.50, 3.75]`, DECIMAL(38,0) max, NaN, ±Infinity, -0.0 and 5e-324 in `doubles`; INT8/INT16/INT32 bounds and float32 edges in the narrower columns |
| 4 | `TEXT_ESCAPES` | `it's`, `"dq"`, `a, b`, `[x]`, `k=v`, the text `NULL`, `''` (empty and two quotes), a backslash, a newline, a tab, right-to-left text and combining marks, as list elements, map keys, struct fields and JSON strings |
| 5 | `LIST_1000` | `long_list` holds 1..1000 and `tags` 1,000 words; `int_keys` holds 600 entries; `doc` is a 1,000-item JSON array; the JSON file's `counts` holds 1,000 digits |
| 6 | `LIST_2500` | 2,500 items in the same columns (`long_list` holds 1..2500); `doc` is the JSON scalar `42` |
| 7 | `LIST_10000` | 10,000 items in the same columns (`long_list` holds 1..10000); `doc` is the JSON literal `null` |
| 8 | `CAP_EDGE` | `strings_edge` (and the JSON file's `words`) holds one 20,000-character element and `tags` three; in each, the ZWJ family emoji 👨‍👩‍👧‍👦 (7 code points, 11 UTF-16 units) is at code points 998-1004 of the DuckDB cell text, across the 1,000 cap; `raw_blob` holds 300 bytes; `wide_struct` renders 1,244 characters |
| 9 | `DATE_BINARY_EDGES` | 0001-01-01, 9999-12-31, 1970-01-01 and 1969-07-20 (dates, timestamps, map keys, struct leaves); the nil and all-ones UUIDs; blobs that are empty or hold `\x00`, `\xff` and quote/backslash bytes |
| 10 | `DEMO` | Readable values: `tags` `[red, green, blue]`, `point` `{x: 1.5, y: -0.5, tier: gold}`, a contact card in `nested_struct`, two people, `int_keys` with keys 2, 1, 10 in that order |
| 11 | `NAME_COLLISIONS` | Keys whose extracted column names collide: `doc` holds the JSON keys `a.b`, `a_b`, `A_B`; `attrs` (and the JSON file's `props`) the map keys `k=v`, `k_v`, `K_V`, next to `size`, `toJSON`, `constructor`, `__proto__`, `2` and `1` |

### Parquet Schema

#### Scalars

| Column | DuckDB Type | Description |
|--------|-------------|-------------|
| `id` | `BIGINT` | Row number 0-999 |
| `label` | `VARCHAR` | The showcase row's name in rows 1-11, else a random two-word label |
| `notes` | `VARCHAR` | About 250 characters of stock sentences |
| `raw_blob` | `BLOB` | 0-16 random bytes; 300 bytes in `CAP_EDGE` (past a 256-byte preview) |

#### Lists

| Column | DuckDB Type | Description |
|--------|-------------|-------------|
| `tags` | `VARCHAR[]` | 1-8 short words; 1,000 / 2,500 / 10,000 words in rows 5-7 |
| `scores` | `INTEGER[]` | 1-10 integers 0-100 |
| `long_list` | `INTEGER[]` | 1-40 integers 0-99 (past a 32-item preview in a fifth of the rows); 1..1000, 1..2500 and 1..10000 in rows 5-7 |
| `matrix` | `SMALLINT[][]` | A list of 1-4 lists of 0-4 SMALLINTs |
| `deep_list` | `TINYINT[][][]` | Three levels of lists |
| `embedding` | `FLOAT[]` | A pyarrow fixed-size list of 32 float32s, -1 to 1 with two decimals; DuckDB reads it as a LIST. Never NULL |
| `doubles` | `DOUBLE[]` | 1-4 DOUBLEs at full precision; NaN, ±Infinity, -0.0, 5e-324 and ±DOUBLE max in `NUMERIC_EXTREMES` |
| `decimals` | `DECIMAL(10,2)[]` | 1-5 DECIMAL(10,2)s |
| `big_ints` | `BIGINT[]` | 1-3 BIGINTs within ±2^62, most past 2^53 |
| `ubig` | `UBIGINT[]` | 1-3 UBIGINTs over the whole range |
| `dates` | `DATE[]` | 1-4 dates 1990-2029 |
| `timestamps_tz` | `TIMESTAMP WITH TIME ZONE[]` | 1-2 timestamps 1990-2029 with microseconds |
| `times` | `TIME[]` | 1-2 times with microseconds |
| `uuids` | `UUID[]` | 1-3 version-4 UUIDs from a pool of 32 (pyarrow's `pa.uuid()`, the Parquet UUID logical type) |
| `blobs` | `BLOB[]` | 1-3 blobs of 0-6 bytes |
| `bools` | `BOOLEAN[]` | 1-6 booleans |
| `strings_edge` | `VARCHAR[]` | 1-5 strings, half of them needing quotes or escapes; the 20,000-character element in `CAP_EDGE` |
| `tier_list` | `VARCHAR[]` | Cycles through 8 lists by row number (row % 8) whose texts look alike: `[NULL]` (a NULL element) and `['NULL']` (the text), `[]` and `['']`, `['a, b']` and `[a, b]`; NULL in row 0 |

#### Structs

| Column | DuckDB Type | Description |
|--------|-------------|-------------|
| `point` | `STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)` | The shape of the wide test file's struct columns: x and y normal with two decimals, tier `bronze` / `silver` / `gold` / `platinum` |
| `odd_names` | `STRUCT("label" VARCHAR, "name" VARCHAR, "type" VARCHAR, "data" VARCHAR, size INTEGER, length INTEGER, toJSON VARCHAR, constructor VARCHAR, __proto__ VARCHAR, hasOwnProperty BOOLEAN, "months" INTEGER, "days" INTEGER, nanoseconds BIGINT, "my field" VARCHAR, "x,y" DOUBLE, "quote""d" VARCHAR, "it's" VARCHAR, "2" INTEGER, "1" INTEGER, "10" INTEGER, "ünï" VARCHAR, "emoji😀" VARCHAR, "order" INTEGER, "null" VARCHAR, "SELECT" VARCHAR, ID BIGINT)` | 26 fields whose names break JavaScript objects (`size`, `toJSON`, `__proto__`, integer-like names that reorder, `months`/`days`/`nanoseconds` that read as an interval) or need SQL quoting |
| `typed_leaves` | `STRUCT(dec38 DECIMAL(38,0), dec18_4 DECIMAL(18,4), uuid UUID, blob BLOB, "time" TIME, ts TIMESTAMP, tstz TIMESTAMP WITH TIME ZONE, date DATE, flag BOOLEAN, f32 FLOAT, i64 BIGINT)` | One leaf of each type that has gone wrong inside a nested value |
| `wide_struct` | `STRUCT(f01 INTEGER, f02 DOUBLE, f03 VARCHAR, f04 BOOLEAN, f05 DATE, f06 BIGINT, f07 FLOAT, f08 SMALLINT, …, f40 SMALLINT)` | 40 scalar fields cycling through those 8 types (the full type is in the manifest) |
| `nested_struct` | `STRUCT("owner" STRUCT("name" VARCHAR, contact STRUCT(email VARCHAR, phones VARCHAR[], address STRUCT(city VARCHAR, zip VARCHAR))), "version" INTEGER)` | Four levels deep: `owner.contact.email`, the list `owner.contact.phones`, `owner.contact.address.city` |
| `people` | `STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]` | A list of 1-4 structs |

#### Maps

| Column | DuckDB Type | Description |
|--------|-------------|-------------|
| `attrs` | `MAP(VARCHAR, INTEGER)` | 1-5 keys from `size`, `toJSON`, `constructor`, `__proto__`, `2`, `1`, `k=v`, `length` and ordinary names; the escape cases as keys in `TEXT_ESCAPES` |
| `int_keys` | `MAP(INTEGER, VARCHAR)` | 1-5 keys -100..100; 600 entries in `LIST_1000`; keys 2, 1, 10 in that order in `DEMO` |
| `date_keys` | `MAP(DATE, INTEGER[])` | 1-3 date keys 2020-2025, each mapped to a list |
| `map_of_structs` | `MAP(VARCHAR, STRUCT(qty INTEGER, price DECIMAL(10,2), note VARCHAR))` | 1-3 fruit keys mapped to structs |

#### JSON, All NULL, All Empty

| Column | DuckDB Type | Description |
|--------|-------------|-------------|
| `doc` | `JSON` | JSON documents (pyarrow's `pa.json_()`, the Parquet JSON logical type) with the keys `k`, `score`, `kind`, `my field`, `a.b`, `q"k`, `ünï`; some rows hold a JSON scalar, an array or the literal `null` |
| `json_list` | `JSON[]` | A list of 1-2 JSON values (objects, arrays, scalars, the literal `null`) |
| `all_null_list` | `INTEGER[]` | NULL in every row |
| `all_empty_list` | `VARCHAR[]` | `[]` in every row |

### JSON Schema

What DuckDB's `read_json` infers from the values, as the JSON loader reads the file.

| Column | DuckDB Type | Description |
|--------|-------------|-------------|
| `id` | `BIGINT` | Row number 0-999 |
| `label` | `VARCHAR` | As the Parquet file's `label` |
| `counts` | `BIGINT[]` | Non-negative integers; 1,000 / 2,500 / 10,000 single digits in rows 5-7 |
| `signed` | `HUGEINT[]` | Integers of both signs: `read_json` reads non-negative integers as unsigned, so mixing signs infers HUGEINT, not BIGINT |
| `huge` | `HUGEINT[]` | Non-negative integers, past INT64 max (2^63 and UINT64 max) in `NUMERIC_EXTREMES` |
| `floats` | `DOUBLE[]` | Three decimals; -0.0, 5e-324, ±DOUBLE max and 2^64 (an integer past UINT64, read as a DOUBLE) in `NUMERIC_EXTREMES` |
| `words` | `VARCHAR[]` | 1-2 words; the escape cases in `TEXT_ESCAPES`; the 20,000-character element in `CAP_EDGE` |
| `days` | `DATE[]` | ISO date strings, which `read_json` reads as dates |
| `ids` | `UUID[]` | UUID strings, which `read_json` reads as UUIDs |
| `point` | `STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)` | As the Parquet file's `point`; `{}` (all-NULL fields) in `EMPTIES` |
| `depth5` | `STRUCT(l2 STRUCT(l3 STRUCT(l4 STRUCT(l5 STRUCT(leaf BIGINT)))))` | A struct five levels deep |
| `props` | `MAP(VARCHAR, BIGINT)` | Objects whose keys vary from row to row (`key_000`-`key_499`), so `read_json` infers a MAP; the case-colliding keys of `NAME_COLLISIONS` live here because a STRUCT cannot hold them |
| `empty_list` | `JSON[]` | `[]` in every non-NULL row |
| `mixed_list` | `JSON[]` | Arrays mixing numbers, strings, booleans, null, objects and arrays |
| `shifty` | `JSON` | A field whose type changes from row to row |
| `key_order` | `STRUCT("2" BIGINT, "1" BIGINT)` | An object whose key `"2"` comes before `"1"` |
| `people` | `STRUCT("name" VARCHAR, age BIGINT, langs VARCHAR[])[]` | A list of 1-2 objects |
| `odd_keys` | `STRUCT(k VARCHAR, score DOUBLE, kind VARCHAR, "my field" JSON, "a.b" BIGINT, "q""k" BOOLEAN, "ünï" VARCHAR)` | Keys that need quoting; `my field` holds numbers in some rows and text in others, so it becomes a JSON field inside the struct |
| `matrix` | `BIGINT[][]` | Arrays of arrays of non-negative integers |
| `all_null` | `JSON` | `null` in every row |
| `empty_obj` | `MAP(VARCHAR, JSON)` | `{}` in every non-NULL row |

### Engine Notes (DuckDB 1.5.4)

- `read_json` infers HUGEINT for integers of both signs (it reads non-negative integers as UBIGINT), and DOUBLE for an integer past UINT64.
- `read_json` reads ISO date strings as DATE and UUID strings as UUID, inside lists too.
- A JSON object whose keys differ only in case fails to load as a STRUCT ("Duplicate name … in struct auto-detected"); as a MAP it loads.
- A STRUCT inferred from JSON lists its fields in the order the keys are first seen, and a field whose type varies becomes JSON. `odd_keys` shows every key in row 2 to fix that order.
- DESCRIBE quotes field names that are keywords, not only those that need it: `"label"`, `"name"`, `"type"`, `"data"`, `"months"`, `"days"`, `"order"`, `"null"`, `"SELECT"`, `"time"`, `"owner"`, `"version"`.
- pyarrow's fixed-size list reads as a LIST (`FLOAT[]`), not an ARRAY; `pa.uuid()` and `pa.json_()` read as UUID and JSON.

### SQL-Only Companions

ARRAY, UNION, INTERVAL inside a list, VARIANT, BIT, HUGEINT and UHUGEINT inside a struct, ENUM, maps with STRUCT or LIST keys and unnamed structs arise only from SQL. `tests/helpers/nestedSql.ts` defines one expression for each over a row-id expression, for scratch tables (`createSqlOnlyTable`) and for derived columns over this fixture. A DuckDB table cannot hold an unnamed STRUCT (a view can), and a CASE cannot return an ARRAY.

---

## File Formats

Each dataset is provided in three formats (except `vins_de_france` and `us_customer_orders`, CSV + JSON only and CSV only respectively, and the nested stress tests, Parquet + JSON only):

| Format | Extension | Description |
|--------|-----------|-------------|
| CSV | `.csv` | Comma-separated values, UTF-8 encoded |
| JSON | `.json` | Array of objects format with ISO date strings |
| Parquet | `.parquet` | Apache Parquet format via PyArrow |

### JSON Format Details

The JSON files use the "records" orientation (array of objects):

```json
[
  {"PassengerId": 1, "Survived": 0, "Pclass": 3, "Name": "Braund, Mr. Owen Harris", ...},
  {"PassengerId": 2, "Survived": 1, "Pclass": 1, "Name": "Cumings, Mrs. John Bradley", ...},
  ...
]
```

Datetime values are serialized as ISO 8601 strings (e.g., `"2024-01-15T08:30:00"`).
