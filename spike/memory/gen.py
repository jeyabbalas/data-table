"""Generate Parquet files for the memory-envelope spike.

Streams one row group at a time so generator memory is bounded by a single
row group, not the file. Every 20 columns cycle through a fixed type mix:

    0-11  DOUBLE     1% nulls
    12-14 INTEGER
    15-17 VARCHAR    categorical, 20 / 1,000 / 50,000 distinct values
    18    TIMESTAMP  microseconds, spread over ten years
    19    BOOLEAN

--entropy random   doubles in [0, 1000) at full precision; barely compressible
--entropy rounded  doubles rounded to 0.1, integers in [0, 1000); closer to
                   measured data, and dictionary-encodable

Usage: python3 gen.py --cols 1000 --rows 200000 --rg 122880 --out wide.parquet
"""

import argparse
import time

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

CYCLE = 20
CARDINALITIES = (20, 1_000, 50_000)
TS_START = np.datetime64("2015-01-01T00:00:00", "us").astype(np.int64)
TS_SPAN = 10 * 365 * 24 * 3600 * 1_000_000


def kind(c: int) -> str:
    k = c % CYCLE
    if k < 12:
        return "double"
    if k < 15:
        return "int"
    if k < 18:
        return "string"
    return "timestamp" if k == 18 else "bool"


def schema_for(cols: int) -> pa.Schema:
    types = {
        "double": pa.float64(),
        "int": pa.int32(),
        "string": pa.dictionary(pa.int32(), pa.string()),
        "timestamp": pa.timestamp("us"),
        "bool": pa.bool_(),
    }
    return pa.schema([pa.field(f"col_{c}", types[kind(c)]) for c in range(cols)])


def vocab(cardinality: int) -> pa.Array:
    return pa.array([f"v_{i:06d}" for i in range(cardinality)], pa.string())


def column(c: int, n: int, rng: np.random.Generator, entropy: str, vocabs) -> pa.Array:
    k = kind(c)
    if k == "double":
        values = rng.random(n) * 1000
        if entropy == "rounded":
            values = np.round(values, 1)
        return pa.array(values, pa.float64(), mask=rng.random(n) < 0.01)
    if k == "int":
        high = 1_000 if entropy == "rounded" else 1_000_000
        return pa.array(rng.integers(0, high, n, dtype=np.int32), pa.int32())
    if k == "string":
        card_index = (c % CYCLE) - 15
        idx = rng.integers(0, CARDINALITIES[card_index], n, dtype=np.int32)
        return pa.DictionaryArray.from_arrays(pa.array(idx, pa.int32()), vocabs[card_index])
    if k == "timestamp":
        ts = TS_START + rng.integers(0, TS_SPAN, n, dtype=np.int64)
        return pa.array(ts, pa.timestamp("us"))
    return pa.array(rng.random(n) < 0.5, pa.bool_())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cols", type=int, required=True)
    ap.add_argument("--rows", type=int, required=True)
    ap.add_argument("--rg", type=int, default=122_880, help="rows per row group")
    ap.add_argument("--entropy", choices=("random", "rounded"), default="random")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    vocabs = [vocab(k) for k in CARDINALITIES]
    schema = schema_for(args.cols)
    started = time.time()
    with pq.ParquetWriter(args.out, schema, compression="snappy") as writer:
        written = 0
        while written < args.rows:
            n = min(args.rg, args.rows - written)
            arrays = [column(c, n, rng, args.entropy, vocabs) for c in range(args.cols)]
            writer.write_table(pa.Table.from_arrays(arrays, schema=schema), row_group_size=n)
            written += n
    meta = pq.ParquetFile(args.out).metadata
    print(
        f"{args.out}: {meta.num_rows:,} rows x {meta.num_columns} cols, "
        f"{meta.num_row_groups} row groups, {time.time() - started:.1f}s"
    )


if __name__ == "__main__":
    main()
