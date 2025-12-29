# Dataset Schema Documentation

This directory contains three datasets in three formats each (CSV, JSON, Parquet) for testing JavaScript data processing libraries.

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

## File Formats

Each dataset is provided in three formats:

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
