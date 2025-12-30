#!/usr/bin/env python3
"""
Generate DateTime Stress Test Dataset

This script generates a comprehensive datetime stress test dataset for testing
histogram visualizations and datetime string parsing in the data-table library.

Based on specification: docs/duckdb-datetime-stress-test.md

Output formats: CSV, JSON, Parquet
"""

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from datetime import datetime, date, time, timedelta, timezone
import numpy as np
import os

# Configuration
N_ROWS = 450
np.random.seed(42)  # For reproducibility

# Output directory (relative to script location)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def generate_datetime_stress_tests():
    """Generate the complete datetime stress test dataset."""

    # Initialize with row IDs
    data = {'id': list(range(1, N_ROWS + 1))}

    # ===========================================
    # Section 1: Core DuckDB DateTime Types
    # ===========================================

    # date_standard: Random dates spanning 50 years
    base_date = date(2000, 1, 1)
    data['date_standard'] = [
        base_date + timedelta(days=int(np.random.uniform(-10000, 10000)))
        for _ in range(N_ROWS)
    ]

    # time_standard: Random times throughout the day with microseconds
    data['time_standard'] = [
        time(
            hour=np.random.randint(0, 24),
            minute=np.random.randint(0, 60),
            second=np.random.randint(0, 60),
            microsecond=np.random.randint(0, 1000000)
        )
        for _ in range(N_ROWS)
    ]

    # timestamp_standard: Random timestamps spanning 50 years
    base_ts = datetime(2000, 1, 1, 0, 0, 0)
    data['timestamp_standard'] = [
        base_ts + timedelta(
            days=int(np.random.uniform(-10000, 10000)),
            seconds=np.random.randint(0, 86400),
            microseconds=np.random.randint(0, 1000000)
        )
        for _ in range(N_ROWS)
    ]

    # timestamp_tz: Timezone-aware timestamps with various offsets
    offsets = [
        timezone.utc,
        timezone(timedelta(hours=5, minutes=30)),   # IST
        timezone(timedelta(hours=-5)),              # EST
        timezone(timedelta(hours=-8)),              # PST
        timezone(timedelta(hours=1)),               # CET
        timezone(timedelta(hours=9)),               # JST
        timezone(timedelta(hours=-3)),              # BRT
        timezone(timedelta(hours=8)),               # SGT
    ]
    data['timestamp_tz'] = [
        (base_ts + timedelta(
            days=int(np.random.uniform(-10000, 10000)),
            seconds=np.random.randint(0, 86400)
        )).replace(tzinfo=offsets[i % len(offsets)])
        for i in range(N_ROWS)
    ]

    # ===========================================
    # Section 2: Time Range Coverage (for interval detection)
    # ===========================================

    # range_seconds: ~2 minutes of data (tests 'second' interval)
    base_sec = datetime(2025, 6, 15, 12, 0, 0)
    data['range_seconds'] = [
        base_sec + timedelta(seconds=np.random.uniform(0, 120))
        for _ in range(N_ROWS)
    ]

    # range_minutes: ~2 hours of data (tests 'minute' interval)
    base_min = datetime(2025, 6, 15, 10, 0, 0)
    data['range_minutes'] = [
        base_min + timedelta(minutes=np.random.uniform(0, 120))
        for _ in range(N_ROWS)
    ]

    # range_hours: ~2 days of data (tests 'hour' interval)
    base_hour = datetime(2025, 6, 15, 0, 0, 0)
    data['range_hours'] = [
        base_hour + timedelta(hours=np.random.uniform(0, 48))
        for _ in range(N_ROWS)
    ]

    # range_days: ~2 months of data (tests 'day' interval)
    base_day = datetime(2025, 1, 1, 0, 0, 0)
    data['range_days'] = [
        base_day + timedelta(days=np.random.uniform(0, 60))
        for _ in range(N_ROWS)
    ]

    # range_weeks: ~6 months of data (tests 'week' interval)
    base_week = datetime(2025, 1, 1, 0, 0, 0)
    data['range_weeks'] = [
        base_week + timedelta(days=np.random.uniform(0, 180))
        for _ in range(N_ROWS)
    ]

    # range_months: ~3 years of data (tests 'month' interval)
    base_month = datetime(2022, 1, 1, 0, 0, 0)
    data['range_months'] = [
        base_month + timedelta(days=np.random.uniform(0, 1095))
        for _ in range(N_ROWS)
    ]

    # range_years: ~20 years of data (tests 'year' interval)
    base_year = datetime(2005, 1, 1, 0, 0, 0)
    data['range_years'] = [
        base_year + timedelta(days=np.random.uniform(0, 7300))
        for _ in range(N_ROWS)
    ]

    # ===========================================
    # Section 3: Edge Cases
    # ===========================================

    # all_nulls: 100% null values
    data['all_nulls'] = [None] * N_ROWS

    # single_value: All identical timestamps
    single_ts = datetime(2025, 7, 4, 12, 0, 0)
    data['single_value'] = [single_ts] * N_ROWS

    # with_nulls: Mix of values and nulls (~20% null)
    data['with_nulls'] = [
        None if np.random.random() < 0.2 else
        base_ts + timedelta(
            days=int(np.random.uniform(-1000, 1000)),
            seconds=np.random.randint(1, 86400),
            microseconds=np.random.randint(0, 1000000)
        )
        for _ in range(N_ROWS)
    ]

    # epoch_boundary: Values around 1970-01-01
    epoch = datetime(1970, 1, 1, 0, 0, 0)
    data['epoch_boundary'] = [
        epoch + timedelta(
            days=int(np.random.uniform(-365, 365)),
            seconds=np.random.randint(1, 86400),
            microseconds=np.random.randint(0, 1000000)
        )
        for _ in range(N_ROWS)
    ]

    # y2k_boundary: Values around 2000-01-01
    y2k = datetime(2000, 1, 1, 0, 0, 0)
    data['y2k_boundary'] = [
        y2k + timedelta(
            days=int(np.random.uniform(-365, 365)),
            seconds=np.random.randint(1, 86400),
            microseconds=np.random.randint(0, 1000000)
        )
        for _ in range(N_ROWS)
    ]

    # leap_year_dates: Feb 28/29 in various years
    leap_years = [2000, 2004, 2008, 2012, 2016, 2020, 2024]
    non_leap_years = [2001, 2002, 2003, 2005, 2006, 2007, 2009]
    leap_dates = []
    for i in range(N_ROWS):
        if i % 3 == 0:
            # Feb 29 on leap year
            year = leap_years[i % len(leap_years)]
            leap_dates.append(date(year, 2, 29))
        elif i % 3 == 1:
            # Feb 28 on leap year
            year = leap_years[i % len(leap_years)]
            leap_dates.append(date(year, 2, 28))
        else:
            # Feb 28 on non-leap year
            year = non_leap_years[i % len(non_leap_years)]
            leap_dates.append(date(year, 2, 28))
    data['leap_year_dates'] = leap_dates

    # month_boundaries: End of months (28, 29, 30, 31 days)
    month_ends = [
        date(2025, 1, 31),   # 31 days
        date(2025, 2, 28),   # 28 days (non-leap)
        date(2024, 2, 29),   # 29 days (leap)
        date(2025, 3, 31),   # 31 days
        date(2025, 4, 30),   # 30 days
        date(2025, 5, 31),   # 31 days
        date(2025, 6, 30),   # 30 days
        date(2025, 7, 31),   # 31 days
        date(2025, 8, 31),   # 31 days
        date(2025, 9, 30),   # 30 days
        date(2025, 10, 31),  # 31 days
        date(2025, 11, 30),  # 30 days
        date(2025, 12, 31),  # 31 days
    ]
    data['month_boundaries'] = [month_ends[i % len(month_ends)] for i in range(N_ROWS)]

    # ===========================================
    # Section 4: Precision Variants
    # ===========================================

    # precision_whole_sec: Whole seconds only
    data['precision_whole_sec'] = [
        datetime(2025, 6, 15,
                 np.random.randint(0, 24),
                 np.random.randint(0, 60),
                 np.random.randint(0, 60),
                 0)  # No microseconds
        for _ in range(N_ROWS)
    ]

    # precision_milli: Millisecond precision (microseconds rounded to 1000s)
    data['precision_milli'] = [
        datetime(2025, 6, 15,
                 np.random.randint(0, 24),
                 np.random.randint(0, 60),
                 np.random.randint(0, 60),
                 np.random.randint(0, 1000) * 1000)
        for _ in range(N_ROWS)
    ]

    # precision_micro: Full microsecond precision
    data['precision_micro'] = [
        datetime(2025, 6, 15,
                 np.random.randint(0, 24),
                 np.random.randint(0, 60),
                 np.random.randint(0, 60),
                 np.random.randint(0, 1000000))
        for _ in range(N_ROWS)
    ]

    # ===========================================
    # Section 5: Special Cases
    # ===========================================

    # midnight_times: 00:00:00 values
    data['midnight_times'] = [
        time(0, 0, 0, np.random.randint(0, 1000000) if i % 2 == 0 else 0)
        for i in range(N_ROWS)
    ]

    # end_of_day: 23:59:59.999999 values
    data['end_of_day'] = [
        time(23, 59, 59, 999999 - np.random.randint(0, 1000) if i % 2 == 0 else 999999)
        for i in range(N_ROWS)
    ]

    # timezone_variety: Various UTC offsets
    tz_offsets = [
        (0, 0, 'UTC'),
        (5, 30, 'IST'),
        (-5, 0, 'EST'),
        (-8, 0, 'PST'),
        (1, 0, 'CET'),
        (9, 0, 'JST'),
        (-3, 0, 'BRT'),
        (8, 0, 'SGT'),
        (10, 0, 'AEST'),
        (-4, 0, 'EDT'),
        (2, 0, 'EET'),
        (-7, 0, 'MST'),
        (12, 0, 'NZST'),
        (-12, 0, 'AoE'),
        (14, 0, 'LINT'),
    ]
    data['timezone_variety'] = [
        (datetime(2025, 6, 15, 12, 0, 0) + timedelta(hours=i)).replace(
            tzinfo=timezone(timedelta(hours=tz_offsets[i % len(tz_offsets)][0],
                                       minutes=tz_offsets[i % len(tz_offsets)][1]))
        )
        for i in range(N_ROWS)
    ]

    # ===========================================
    # Section 6: String Format Columns
    # ===========================================

    # Generate base dates for string formatting
    base_dates = [
        base_date + timedelta(days=int(np.random.uniform(-10000, 10000)))
        for _ in range(N_ROWS)
    ]

    base_datetimes = [
        datetime.combine(d, time(
            np.random.randint(0, 24),
            np.random.randint(0, 60),
            np.random.randint(0, 60),
            np.random.randint(0, 1000000)
        ))
        for d in base_dates
    ]

    # str_date_iso: %Y-%m-%d
    data['str_date_iso'] = [d.strftime('%Y-%m-%d') for d in base_dates]

    # str_date_us: %m/%d/%Y
    data['str_date_us'] = [d.strftime('%m/%d/%Y') for d in base_dates]

    # str_date_eu: %d/%m/%Y
    data['str_date_eu'] = [d.strftime('%d/%m/%Y') for d in base_dates]

    # str_date_compact: %Y%m%d
    data['str_date_compact'] = [d.strftime('%Y%m%d') for d in base_dates]

    # str_date_long: %B %d, %Y
    data['str_date_long'] = [d.strftime('%B %d, %Y') for d in base_dates]

    # str_time_24h: %H:%M:%S
    data['str_time_24h'] = [dt.strftime('%H:%M:%S') for dt in base_datetimes]

    # str_time_12h: %I:%M:%S %p
    data['str_time_12h'] = [dt.strftime('%I:%M:%S %p') for dt in base_datetimes]

    # str_time_micro: %H:%M:%S.%f
    data['str_time_micro'] = [dt.strftime('%H:%M:%S.%f') for dt in base_datetimes]

    # str_datetime_iso: %Y-%m-%d %H:%M:%S
    data['str_datetime_iso'] = [dt.strftime('%Y-%m-%d %H:%M:%S') for dt in base_datetimes]

    # str_datetime_iso_t: %Y-%m-%dT%H:%M:%S
    data['str_datetime_iso_t'] = [dt.strftime('%Y-%m-%dT%H:%M:%S') for dt in base_datetimes]

    # str_datetime_us: %m/%d/%Y %I:%M:%S %p
    data['str_datetime_us'] = [dt.strftime('%m/%d/%Y %I:%M:%S %p') for dt in base_datetimes]

    # str_datetime_eu: %d/%m/%Y %H:%M:%S
    data['str_datetime_eu'] = [dt.strftime('%d/%m/%Y %H:%M:%S') for dt in base_datetimes]

    # ===========================================
    # Section 7: Ambiguous Format Test Cases
    # ===========================================

    # ambig_date: Could be MM/DD or DD/MM (using only values 01-12 for both)
    ambig_dates = []
    for i in range(N_ROWS):
        month = (i % 12) + 1
        day = (i % 12) + 1
        year = 2020 + (i % 6)
        ambig_dates.append(f'{month:02d}/{day:02d}/{year}')
    data['ambig_date'] = ambig_dates

    # str_date_short_year: 2-digit year ambiguity
    data['str_date_short_year'] = [d.strftime('%d/%m/%y') for d in base_dates]

    return pd.DataFrame(data)


def export_csv(df, output_path):
    """Export DataFrame to CSV with proper datetime formatting."""
    # Create a copy to avoid modifying the original
    df_csv = df.copy()

    # Convert date/time/datetime objects to ISO format strings for CSV
    for col in df_csv.columns:
        if df_csv[col].dtype == 'object':
            # Check if it's a datetime-like column
            sample = df_csv[col].dropna().iloc[0] if len(df_csv[col].dropna()) > 0 else None
            if isinstance(sample, (date, time, datetime)):
                df_csv[col] = df_csv[col].apply(
                    lambda x: x.isoformat() if x is not None else None
                )

    df_csv.to_csv(output_path, index=False)
    print(f"CSV exported to: {output_path}")


def export_json(df, output_path):
    """Export DataFrame to JSON with proper datetime formatting."""
    # Create a copy to avoid modifying the original
    df_json = df.copy()

    # Convert date/time/datetime objects to ISO format strings for JSON
    for col in df_json.columns:
        if df_json[col].dtype == 'object':
            sample = df_json[col].dropna().iloc[0] if len(df_json[col].dropna()) > 0 else None
            if isinstance(sample, (date, time, datetime)):
                df_json[col] = df_json[col].apply(
                    lambda x: x.isoformat() if x is not None else None
                )

    df_json.to_json(output_path, orient='records', indent=2, date_format='iso')
    print(f"JSON exported to: {output_path}")


def export_parquet(df, output_path):
    """Export DataFrame to Parquet with proper type preservation."""
    # Create a copy to avoid modifying the original
    df_parquet = df.copy()

    # Convert Python date/time objects to pandas datetime types for Parquet
    for col in df_parquet.columns:
        if df_parquet[col].dtype == 'object':
            sample = df_parquet[col].dropna().iloc[0] if len(df_parquet[col].dropna()) > 0 else None
            if sample is None:
                continue
            if isinstance(sample, datetime):
                # Check if timezone-aware
                if sample.tzinfo is not None:
                    # Convert tz-aware datetimes to UTC for Parquet
                    df_parquet[col] = pd.to_datetime(df_parquet[col], utc=True)
                else:
                    # Keep as naive datetime (will become TIMESTAMP in Parquet)
                    df_parquet[col] = pd.to_datetime(df_parquet[col])
            # DATE columns: PyArrow handles Python date objects natively
            # No conversion needed - they will be serialized as Parquet DATE type

            # TIME columns: PyArrow handles Python time objects natively
            # No conversion needed - they will be serialized as Parquet TIME type

    # Write to Parquet
    df_parquet.to_parquet(output_path, index=False, engine='pyarrow')
    print(f"Parquet exported to: {output_path}")


def main():
    """Main entry point."""
    print("Generating DateTime Stress Test Dataset...")
    print(f"Target rows: {N_ROWS}")

    # Generate the dataset
    df = generate_datetime_stress_tests()

    print(f"Generated {len(df)} rows with {len(df.columns)} columns")
    print(f"Columns: {list(df.columns)}")

    # Export to all formats
    csv_path = os.path.join(SCRIPT_DIR, 'csv', 'datetime-stress-tests.csv')
    json_path = os.path.join(SCRIPT_DIR, 'json', 'datetime-stress-tests.json')
    parquet_path = os.path.join(SCRIPT_DIR, 'parquet', 'datetime-stress-tests.parquet')

    export_csv(df, csv_path)
    export_json(df, json_path)
    export_parquet(df, parquet_path)

    print("\nDataset generation complete!")
    print("\nColumn summary:")
    for col in df.columns:
        non_null = df[col].notna().sum()
        sample = df[col].dropna().iloc[0] if non_null > 0 else None
        sample_type = type(sample).__name__ if sample is not None else 'NoneType'
        print(f"  {col}: {non_null}/{len(df)} non-null, sample type: {sample_type}")


if __name__ == '__main__':
    main()
