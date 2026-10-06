#!/usr/bin/env python3
"""
Generate Nested Stress Test Dataset

This script generates a stress test dataset of nested values (LIST, STRUCT,
MAP and JSON, nested inside one another) for testing how the data-table
library loads, displays, sorts, filters, exports and inspects them.

Every value comes from a NumPy generator seeded by (SEED, column name), one
stream per column, so adding or reordering a column never changes the values
of another, and running the script twice writes byte-identical files.

Rows 0-11 are hand-written showcase rows; each holds the same kind of edge
case in every column that can express it (see SHOWCASE_ROWS). Rows 12-999
are seeded random values, about 10% NULL and, for lists and maps, about 10%
empty.

Outputs (paths relative to this script):
    parquet/nested-stress-tests.parquet    1,000 rows x 36 columns, 4 row groups
    json/nested-stress-tests.json          1,000 rows x 21 columns, an array of records
    nested-stress-tests.manifest.json      per column: Arrow type, the type DuckDB
                                           reports once loaded, null and empty counts,
                                           longest list; the purpose of each showcase row

No CSV: DuckDB's CSV reader never infers a nested type.

The expected DuckDB types are what DESCRIBE reports after the library's
loaders (src/worker/loaders/) load each file, recorded with DuckDB 1.5.4.
tests/worker/loaders/nestedStress.duckdb.test.ts checks them, and the
counts, against a real DuckDB.

Regenerate with:
    python3 tests/fixtures/datasets/generate-nested-stress-tests.py

Requires pyarrow (23.0.0 used) and numpy (1.26.4 used).
"""

import hashlib
import json
import math
import os
import uuid
import zlib
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

# Configuration
N_ROWS = 1000
SEED = 20261005
ROW_GROUP_SIZE = 250
DUCKDB_VERSION = 'v1.5.4'

# Output paths (relative to script location)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARQUET_PATH = os.path.join(SCRIPT_DIR, 'parquet', 'nested-stress-tests.parquet')
JSON_PATH = os.path.join(SCRIPT_DIR, 'json', 'nested-stress-tests.json')
MANIFEST_PATH = os.path.join(SCRIPT_DIR, 'nested-stress-tests.manifest.json')

# Showcase rows: the same row index holds the same kind of edge case in every
# column that can express it. tests/helpers/nestedFixture.ts mirrors the
# names as SHOWCASE.
ALL_NULL = 0
EMPTIES = 1
NULL_ELEMENTS = 2
NUMERIC_EXTREMES = 3
TEXT_ESCAPES = 4
LIST_1000 = 5
LIST_2500 = 6
LIST_10000 = 7
CAP_EDGE = 8
DATE_BINARY_EDGES = 9
DEMO = 10
NAME_COLLISIONS = 11

# Number of characters the grid caps a nested cell at (graphemes), and the
# position the ZWJ emoji of the CAP_EDGE row starts at in the cell text.
DISPLAY_CAP = 1000
CAP_EMOJI_START = 998

SHOWCASE_ROWS = {
    'ALL_NULL': {
        'row': ALL_NULL,
        'purpose': 'Every column is NULL except id, embedding (a fixed-size list '
                   'is never NULL: it holds 32 NULL elements instead) and '
                   'all_empty_list ([]).',
    },
    'EMPTIES': {
        'row': EMPTIES,
        'purpose': "Empty values: [] for lists, {} for maps, structs whose "
                   "fields are all NULL, '' and an empty blob for top-level "
                   'text and BLOB, {} for JSON documents, and an all-zero '
                   'embedding.',
    },
    'NULL_ELEMENTS': {
        'row': NULL_ELEMENTS,
        'purpose': 'NULL inside values: list elements ([4, NULL, 17]), map '
                   'values, struct fields, a NULL inner list, a NULL struct in '
                   'people, JSON null members, and SQL NULL next to the JSON '
                   'literal null in json_list.',
    },
    'NUMERIC_EXTREMES': {
        'row': NUMERIC_EXTREMES,
        'purpose': 'Numeric edges: 2^53-1 and 2^53+1, INT64 min and max, '
                   'UINT64 max, the decimals [1.25, 2.50, 3.75], DECIMAL(38,0) '
                   'max, and NaN, +-Infinity, -0.0 and 5e-324 in doubles; '
                   'INT8/INT16/INT32 bounds and float32 edges in the narrower '
                   'columns.',
    },
    'TEXT_ESCAPES': {
        'row': TEXT_ESCAPES,
        'purpose': "Text that needs quoting or escaping: it's, \"dq\", a, b, "
                   "[x], k=v, the text NULL, '', two single quotes, a "
                   'backslash, a newline, a tab, right-to-left text and '
                   'combining marks, as list elements, map keys, struct '
                   'fields and JSON strings.',
    },
    'LIST_1000': {
        'row': LIST_1000,
        'purpose': 'long_list and tags hold 1,000 items (long_list holds '
                   '1..1000), int_keys holds 600 entries, and doc is a '
                   '1,000-item JSON array; the JSON file\'s counts holds 1,000 '
                   'digits.',
    },
    'LIST_2500': {
        'row': LIST_2500,
        'purpose': 'long_list and tags hold 2,500 items (long_list holds '
                   '1..2500), as does the JSON file\'s counts; doc is the JSON '
                   'scalar 42.',
    },
    'LIST_10000': {
        'row': LIST_10000,
        'purpose': 'long_list and tags hold 10,000 items (long_list holds '
                   '1..10000), as does the JSON file\'s counts; doc is the JSON '
                   'literal null.',
    },
    'CAP_EDGE': {
        'row': CAP_EDGE,
        'purpose': 'The display cap: strings_edge (and the JSON file\'s words) '
                   'holds one 20,000-character element and tags holds three, '
                   'each placing the ZWJ family emoji (7 code points, 11 UTF-16 '
                   'units) at code points %d-%d of the DuckDB cell text, so a '
                   '%d-code-point or -UTF-16-unit cut would split it while a '
                   '%d-grapheme cut keeps it whole; raw_blob holds 300 bytes; '
                   'wide_struct renders past %d characters; doc holds the long '
                   'string.' % (CAP_EMOJI_START, CAP_EMOJI_START + 6, DISPLAY_CAP,
                                DISPLAY_CAP, DISPLAY_CAP),
    },
    'DATE_BINARY_EDGES': {
        'row': DATE_BINARY_EDGES,
        'purpose': 'Date and binary edges: 0001-01-01, 9999-12-31, 1970-01-01 '
                   'and a pre-1970 date (dates, timestamps, map keys, struct '
                   'leaves), the nil and all-ones UUIDs, and blobs that are '
                   'empty or hold \\x00, \\xff and quote/backslash bytes.',
    },
    'DEMO': {
        'row': DEMO,
        'purpose': 'Readable values for demos and docs: tags [red, green, '
                   'blue], point {x: 1.5, y: -0.5, tier: gold}, a contact '
                   'card in nested_struct, two people, and int_keys with '
                   'keys 2, 1, 10 in that order.',
    },
    'NAME_COLLISIONS': {
        'row': NAME_COLLISIONS,
        'purpose': 'Keys whose extracted default column names collide: doc '
                   'holds the JSON keys a.b, a_b and A_B, attrs (and the JSON '
                   "file's props) the map keys k=v, k_v and K_V next to size, "
                   'toJSON, constructor, __proto__, 2 and 1.',
    },
}

# The ZWJ family emoji: man, ZWJ, woman, ZWJ, girl, ZWJ, boy.
FAMILY = '\U0001F468\u200D\U0001F469\u200D\U0001F467\u200D\U0001F466'

# 20,000 characters, the family emoji at code points 998-1004 of the cell
# text "[...]" a one-element list of it renders as.
LONG_TEXT = ('a' * (CAP_EMOJI_START - 2) + FAMILY
             + 'b' * (20000 - (CAP_EMOJI_START - 2) - len(FAMILY)))

# Three tags whose cell text "[xxx, <family> family, more]" places the emoji
# at the same code points.
CAP_TAGS = ['x' * (CAP_EMOJI_START - 4), FAMILY + ' family', 'more']

# Text that needs quoting or escaping somewhere: in DuckDB's list text, a
# JSON string, a CSV cell or a SQL literal.
EDGE_STRINGS = [
    "it's",
    '"dq"',
    'a, b',
    '[x]',
    'k=v',
    'NULL',
    '',
    "''",
    '\\',
    'line\nbreak',
    'tab\there',
    '\u0645\u0631\u062D\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645',  # Arabic, right to left
    'e\u0301\u0302 combining',
    '{brace}',
    ' padded ',
]

WORDS = (
    'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod '
    'tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam '
    'quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo '
    'consequat data table column row filter sort query value sample signal'
).split()

NOTE_SENTENCES = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse.',
    'Excepteur sint occaecat cupidatat non proident.',
    'Sunt in culpa qui officia deserunt mollit anim id est laborum.',
    'Checked against the source on arrival; no discrepancies found.',
    'Follow up next quarter with the regional team.',
    'Values were rounded before upload, so totals may differ slightly.',
    'Flagged for review: the second reading looks out of range.',
    'Imported from the legacy system without changes.',
    'Shipment split across two containers at the customer\'s request.',
]

TAG_WORDS = ['red', 'green', 'blue', 'amber', 'teal', 'violet', 'urgent', 'later',
             'draft', 'final', 'alpha', 'beta', 'gamma', 'delta', 'north', 'south',
             'east', 'west', 'small', 'large', 'new', 'old', 'hot', 'cold']

ADJECTIVES = ['amber', 'brisk', 'calm', 'dusty', 'eager', 'fuzzy', 'gentle', 'hidden',
              'icy', 'jolly', 'keen', 'lucky', 'misty', 'noble', 'odd', 'proud',
              'quiet', 'rapid', 'shiny', 'tidy']
NOUNS = ['falcon', 'badger', 'otter', 'heron', 'lynx', 'marmot', 'newt', 'osprey',
         'panda', 'quail', 'raven', 'stoat', 'tapir', 'urchin', 'vole', 'walrus',
         'yak', 'zebra', 'gecko', 'ibis']

TIERS = ['bronze', 'silver', 'gold', 'platinum']

# tier_list cycles through these 8 values; their DuckDB texts pair up as
# look-alikes: [NULL] / ['NULL'], [] / [''], ['a, b'] / [a, b].
TIER_LISTS = [
    ['bronze'],
    ['silver', 'gold'],
    [None],
    ['NULL'],
    [],
    [''],
    ['a, b'],
    ['a', 'b'],
]

FIRST_NAMES = ['Ada', 'Alan', 'Barbara', 'Claude', 'Donald', 'Edsger', 'Frances',
               'Grace', 'Hedy', 'John', 'Katherine', 'Linus', 'Margaret', 'Niklaus',
               'Radia', 'Tim']
LAST_NAMES = ['Lovelace', 'Turing', 'Liskov', 'Shannon', 'Knuth', 'Dijkstra', 'Allen',
              'Hopper', 'Lamarr', 'McCarthy', 'Johnson', 'Torvalds', 'Hamilton', 'Wirth',
              'Perlman', 'Berners-Lee']
CITIES = ['Arlington', 'Boston', 'Cambridge', 'Denver', 'Edinburgh', 'Helsinki',
          'Kyoto', 'Lagos', 'Lyon', 'Oslo', 'Pune', 'Zurich']
LANGS = ['en', 'fr', 'de', 'es', 'fi', 'sv', 'ja', 'hi', 'ar', 'pt']
FRUITS = ['apple', 'banana', 'cherry', 'date', 'fig', 'grape', 'kiwi', 'lemon',
          'mango', 'pear']

# Map keys that break naive JavaScript objects (Map.size, toJSON, the
# prototype chain, integer-like keys that reorder) next to ordinary ones.
ATTR_KEYS = ['size', 'toJSON', 'constructor', '__proto__', '2', '1', 'k=v', 'length',
             'color', 'weight', 'height', 'width', 'depth', 'count', 'rank', 'level']

# Keys of the JSON documents in doc, and of the JSON file's odd_keys.
DOC_KEYS = ['k', 'score', 'kind', 'my field', 'a.b', 'q"k', '\u00FCn\u00EF']

# Field names of odd_names: JavaScript-hostile property names, names that
# need SQL quoting, integer-like names (JavaScript orders them first), and
# names that read like an interval ({months, days, nanoseconds}).
ODD_NAME_FIELDS = [
    ('label', pa.string()),
    ('name', pa.string()),
    ('type', pa.string()),
    ('data', pa.string()),
    ('size', pa.int32()),
    ('length', pa.int32()),
    ('toJSON', pa.string()),
    ('constructor', pa.string()),
    ('__proto__', pa.string()),
    ('hasOwnProperty', pa.bool_()),
    ('months', pa.int32()),
    ('days', pa.int32()),
    ('nanoseconds', pa.int64()),
    ('my field', pa.string()),
    ('x,y', pa.float64()),
    ('quote"d', pa.string()),
    ("it's", pa.string()),
    ('2', pa.int32()),
    ('1', pa.int32()),
    ('10', pa.int32()),
    ('\u00FCn\u00EF', pa.string()),
    ('emoji\U0001F600', pa.string()),
    ('order', pa.int32()),
    ('null', pa.string()),
    ('SELECT', pa.string()),
    ('ID', pa.int64()),
]

# wide_struct: 40 scalar fields f01..f40 cycling through these types.
WIDE_TYPES = [pa.int32(), pa.float64(), pa.string(), pa.bool_(), pa.date32(),
              pa.int64(), pa.float32(), pa.int16()]

INT8_MIN, INT8_MAX = -2**7, 2**7 - 1
INT16_MIN, INT16_MAX = -2**15, 2**15 - 1
INT32_MIN, INT32_MAX = -2**31, 2**31 - 1
INT64_MIN, INT64_MAX = -2**63, 2**63 - 1
UINT64_MAX = 2**64 - 1
MAX_SAFE = 2**53 - 1
FLOAT32_MAX = float(np.finfo(np.float32).max)
FLOAT32_MIN_NORMAL = float(np.finfo(np.float32).tiny)
FLOAT32_MIN_SUBNORMAL = float(np.float32(1e-45))
DOUBLE_MAX = 1.7976931348623157e308
DOUBLE_MIN_SUBNORMAL = 5e-324

UTC = timezone.utc
DATE_EDGES = [date(1, 1, 1), date(9999, 12, 31), date(1970, 1, 1), date(1969, 7, 20)]
NIL_UUID = uuid.UUID(int=0)
MAX_UUID = uuid.UUID(int=2**128 - 1)

# The types DESCRIBE reports once each file is loaded through the library's
# loaders, recorded with DuckDB 1.5.4 (the loaders add __rowid__ BIGINT
# first). nestedStress.duckdb.test.ts fails when a DuckDB upgrade changes one.
EXPECTED_PARQUET_TYPES = {
    'id': 'BIGINT',
    'label': 'VARCHAR',
    'notes': 'VARCHAR',
    'raw_blob': 'BLOB',
    'tags': 'VARCHAR[]',
    'scores': 'INTEGER[]',
    'long_list': 'INTEGER[]',
    'matrix': 'SMALLINT[][]',
    'deep_list': 'TINYINT[][][]',
    'embedding': 'FLOAT[]',
    'doubles': 'DOUBLE[]',
    'decimals': 'DECIMAL(10,2)[]',
    'big_ints': 'BIGINT[]',
    'ubig': 'UBIGINT[]',
    'dates': 'DATE[]',
    'timestamps_tz': 'TIMESTAMP WITH TIME ZONE[]',
    'times': 'TIME[]',
    'uuids': 'UUID[]',
    'blobs': 'BLOB[]',
    'bools': 'BOOLEAN[]',
    'strings_edge': 'VARCHAR[]',
    'tier_list': 'VARCHAR[]',
    'point': 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
    'odd_names': (
        'STRUCT("label" VARCHAR, "name" VARCHAR, "type" VARCHAR, "data" VARCHAR, '
        'size INTEGER, length INTEGER, toJSON VARCHAR, constructor VARCHAR, '
        '__proto__ VARCHAR, hasOwnProperty BOOLEAN, "months" INTEGER, "days" INTEGER, '
        'nanoseconds BIGINT, "my field" VARCHAR, "x,y" DOUBLE, "quote""d" VARCHAR, '
        '"it\'s" VARCHAR, "2" INTEGER, "1" INTEGER, "10" INTEGER, "\u00FCn\u00EF" VARCHAR, '
        '"emoji\U0001F600" VARCHAR, "order" INTEGER, "null" VARCHAR, "SELECT" VARCHAR, ID BIGINT)'
    ),
    'typed_leaves': (
        'STRUCT(dec38 DECIMAL(38,0), dec18_4 DECIMAL(18,4), uuid UUID, blob BLOB, '
        '"time" TIME, ts TIMESTAMP, tstz TIMESTAMP WITH TIME ZONE, date DATE, '
        'flag BOOLEAN, f32 FLOAT, i64 BIGINT)'
    ),
    'wide_struct': (
        'STRUCT(f01 INTEGER, f02 DOUBLE, f03 VARCHAR, f04 BOOLEAN, f05 DATE, f06 BIGINT, '
        'f07 FLOAT, f08 SMALLINT, f09 INTEGER, f10 DOUBLE, f11 VARCHAR, f12 BOOLEAN, '
        'f13 DATE, f14 BIGINT, f15 FLOAT, f16 SMALLINT, f17 INTEGER, f18 DOUBLE, '
        'f19 VARCHAR, f20 BOOLEAN, f21 DATE, f22 BIGINT, f23 FLOAT, f24 SMALLINT, '
        'f25 INTEGER, f26 DOUBLE, f27 VARCHAR, f28 BOOLEAN, f29 DATE, f30 BIGINT, '
        'f31 FLOAT, f32 SMALLINT, f33 INTEGER, f34 DOUBLE, f35 VARCHAR, f36 BOOLEAN, '
        'f37 DATE, f38 BIGINT, f39 FLOAT, f40 SMALLINT)'
    ),
    'nested_struct': (
        'STRUCT("owner" STRUCT("name" VARCHAR, contact STRUCT(email VARCHAR, '
        'phones VARCHAR[], address STRUCT(city VARCHAR, zip VARCHAR))), '
        '"version" INTEGER)'
    ),
    'people': 'STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]',
    'attrs': 'MAP(VARCHAR, INTEGER)',
    'int_keys': 'MAP(INTEGER, VARCHAR)',
    'date_keys': 'MAP(DATE, INTEGER[])',
    'map_of_structs': 'MAP(VARCHAR, STRUCT(qty INTEGER, price DECIMAL(10,2), note VARCHAR))',
    'doc': 'JSON',
    'json_list': 'JSON[]',
    'all_null_list': 'INTEGER[]',
    'all_empty_list': 'VARCHAR[]',
}

EXPECTED_JSON_TYPES = {
    'id': 'BIGINT',
    'label': 'VARCHAR',
    'counts': 'BIGINT[]',
    'signed': 'HUGEINT[]',
    'huge': 'HUGEINT[]',
    'floats': 'DOUBLE[]',
    'words': 'VARCHAR[]',
    'days': 'DATE[]',
    'ids': 'UUID[]',
    'point': 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
    'depth5': 'STRUCT(l2 STRUCT(l3 STRUCT(l4 STRUCT(l5 STRUCT(leaf BIGINT)))))',
    'props': 'MAP(VARCHAR, BIGINT)',
    'empty_list': 'JSON[]',
    'mixed_list': 'JSON[]',
    'shifty': 'JSON',
    'key_order': 'STRUCT("2" BIGINT, "1" BIGINT)',
    'people': 'STRUCT("name" VARCHAR, age BIGINT, langs VARCHAR[])[]',
    'odd_keys': (
        'STRUCT(k VARCHAR, score DOUBLE, kind VARCHAR, "my field" JSON, "a.b" BIGINT, '
        '"q""k" BOOLEAN, "\u00FCn\u00EF" VARCHAR)'
    ),
    'matrix': 'BIGINT[][]',
    'all_null': 'JSON',
    'empty_obj': 'MAP(VARCHAR, JSON)',
}


# ===========================================
# Helpers
# ===========================================

def column_rng(name):
    """The column's own random stream: seeded by (SEED, a hash of its name)."""
    return np.random.default_rng([SEED, zlib.crc32(name.encode('utf-8'))])


def pick(rng, pool):
    """One item of `pool`."""
    return pool[int(rng.integers(len(pool)))]


def draw_column(name, draw, showcase, null_share=0.1, empty_share=0.0, empty=None):
    """
    Draw one value per row, then put the showcase values in place.

    Every row draws, showcase or not, so the stream does not depend on which
    showcase rows a column overrides. A row is NULL with probability
    `null_share`, `empty()` with probability `empty_share`, else `draw(rng, i)`.
    """
    rng = column_rng(name)
    values = []
    for i in range(N_ROWS):
        u = rng.random()
        if u < null_share:
            values.append(None)
        elif u < null_share + empty_share:
            values.append(empty())
        else:
            values.append(draw(rng, i))
    for row, value in showcase.items():
        values[row] = value
    return values


def random_words(rng, low, high, pool=WORDS):
    return [pick(rng, pool) for _ in range(int(rng.integers(low, high + 1)))]


def random_date(rng, start=date(1990, 1, 1), days=14610):
    return start + timedelta(days=int(rng.integers(days)))


def random_timestamp(rng):
    return datetime(1990, 1, 1, tzinfo=UTC) + timedelta(
        seconds=int(rng.integers(40 * 365 * 86400)), microseconds=int(rng.integers(1_000_000)))


def random_time(rng):
    return time(int(rng.integers(24)), int(rng.integers(60)), int(rng.integers(60)),
                int(rng.integers(1_000_000)))


def random_uuid(rng):
    """A version-4 UUID from the column's stream (uuid4() is not seeded)."""
    raw = bytes(int(b) for b in rng.integers(0, 256, 16))
    return uuid.UUID(bytes=raw, version=4)


def random_bytes(rng, low, high):
    return bytes(int(b) for b in rng.integers(0, 256, int(rng.integers(low, high + 1))))


def random_label(rng):
    return f'{pick(rng, ADJECTIVES)} {pick(rng, NOUNS)}'


def random_note(rng):
    """About 250 characters: sentences from NOTE_SENTENCES."""
    sentences = []
    while len(' '.join(sentences)) < 240:
        sentences.append(pick(rng, NOTE_SENTENCES))
    return ' '.join(sentences)


def unique_keys(rng, count, draw_key):
    """`count` distinct keys from `draw_key(rng)`, in draw order."""
    keys = []
    attempts = 0
    while len(keys) < count and attempts < count * 20:
        key = draw_key(rng)
        if key not in keys:
            keys.append(key)
        attempts += 1
    return keys


def storage_of(arrow_type):
    """`arrow_type` with every extension type replaced by its storage type."""
    if isinstance(arrow_type, pa.BaseExtensionType):
        return arrow_type.storage_type
    if pa.types.is_fixed_size_list(arrow_type):
        return pa.list_(storage_of(arrow_type.value_type), arrow_type.list_size)
    if pa.types.is_list(arrow_type):
        return pa.list_(storage_of(arrow_type.value_type))
    if pa.types.is_map(arrow_type):
        return pa.map_(storage_of(arrow_type.key_type), storage_of(arrow_type.item_type))
    if pa.types.is_struct(arrow_type):
        return pa.struct([pa.field(f.name, storage_of(f.type), f.nullable) for f in arrow_type])
    return arrow_type


def to_arrow(values, arrow_type):
    """
    Build an Arrow array of `arrow_type` from Python values.

    pyarrow cannot build extension types (UUID, JSON) from Python values, so
    the array is built with their storage types and then cast.
    """
    storage = storage_of(arrow_type)
    array = pa.array(values, type=storage)
    return array if storage == arrow_type else array.cast(arrow_type)


def uuid_bytes(value):
    return None if value is None else value.bytes


def json_text(value):
    """Standard JSON text: no NaN or Infinity, non-ASCII kept as is."""
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


# ===========================================
# Parquet columns
# ===========================================

class Column:
    """One output column: its values, Arrow type, kind and description."""

    def __init__(self, name, arrow_type, kind, description, values):
        self.name = name
        self.arrow_type = arrow_type
        self.kind = kind  # 'scalar' | 'list' | 'struct' | 'map' | 'json'
        self.description = description
        self.values = values


def parquet_columns():
    """Build every Parquet column, in file order."""
    cols = []

    def add(name, arrow_type, kind, description, values):
        cols.append(Column(name, arrow_type, kind, description, values))

    # -------------------------------------------
    # Section 1: Scalars
    # -------------------------------------------

    add('id', pa.int64(), 'scalar',
        'Row number 0-999; equals the __rowid__ the loaders add.',
        list(range(N_ROWS)))

    labels = draw_column('label', lambda rng, i: random_label(rng), {}, null_share=0.0)
    labels[ALL_NULL] = None
    for name, info in SHOWCASE_ROWS.items():
        if info['row'] != ALL_NULL:
            labels[info['row']] = 'showcase: ' + name.lower().replace('_', ' ')
    add('label', pa.string(), 'scalar',
        'Showcase rows: their name; other rows: a random two-word label.', labels)

    add('notes', pa.string(), 'scalar',
        'About 250 characters of stock sentences.',
        draw_column('notes', lambda rng, i: random_note(rng), {
            ALL_NULL: None,
            EMPTIES: '',
        }))

    add('raw_blob', pa.binary(), 'scalar',
        'Top-level BLOB, 0-16 bytes; 300 bytes in the CAP_EDGE row.',
        draw_column('raw_blob', lambda rng, i: random_bytes(rng, 0, 16), {
            ALL_NULL: None,
            EMPTIES: b'',
            CAP_EDGE: bytes(range(256)) + bytes(range(44)),
            DATE_BINARY_EDGES: b'\x00\xff\x80\x7f\n\'"\\',
            DEMO: b'hello',
        }))

    # -------------------------------------------
    # Section 2: Lists
    # -------------------------------------------

    def list_column(name, arrow_type, description, draw, showcase, empty_share=0.1):
        values = draw_column(name, draw, {ALL_NULL: None, EMPTIES: [], **showcase},
                             null_share=0.1, empty_share=empty_share, empty=list)
        add(name, arrow_type, 'list', description, values)

    list_column(
        'tags', pa.list_(pa.string()),
        '1-8 short words; 1,000 / 2,500 / 10,000 words in rows 5-7.',
        lambda rng, i: random_words(rng, 1, 8, TAG_WORDS),
        {
            NULL_ELEMENTS: ['a', None, 'c'],
            TEXT_ESCAPES: EDGE_STRINGS[:8],
            LIST_1000: [TAG_WORDS[k % len(TAG_WORDS)] for k in range(1000)],
            LIST_2500: [TAG_WORDS[k % len(TAG_WORDS)] for k in range(2500)],
            LIST_10000: [TAG_WORDS[k % len(TAG_WORDS)] for k in range(10000)],
            CAP_EDGE: CAP_TAGS,
            DEMO: ['red', 'green', 'blue'],
        })

    list_column(
        'scores', pa.list_(pa.int32()),
        '1-10 integers 0-100.',
        lambda rng, i: [int(v) for v in rng.integers(0, 101, int(rng.integers(1, 11)))],
        {
            NULL_ELEMENTS: [4, None, 17],
            NUMERIC_EXTREMES: [INT32_MIN, INT32_MAX, 0],
            DEMO: [90, 85, 77],
        })

    list_column(
        'long_list', pa.list_(pa.int32()),
        '1-40 integers 0-99 (longer than the 32-item preview in a fifth of '
        'the rows); 1..1000, 1..2500 and 1..10000 in rows 5-7.',
        lambda rng, i: [int(v) for v in rng.integers(0, 100, int(rng.integers(1, 41)))],
        {
            NULL_ELEMENTS: [1, None, 3],
            NUMERIC_EXTREMES: [INT32_MIN, -1, 0, 1, INT32_MAX],
            LIST_1000: list(range(1, 1001)),
            LIST_2500: list(range(1, 2501)),
            LIST_10000: list(range(1, 10001)),
            DEMO: list(range(1, 41)),
        })

    def draw_matrix(rng, i):
        return [[int(v) for v in rng.integers(-100, 101, int(rng.integers(0, 5)))]
                for _ in range(int(rng.integers(1, 5)))]

    list_column(
        'matrix', pa.list_(pa.list_(pa.int16())),
        'A list of 1-4 lists of 0-4 SMALLINTs.',
        draw_matrix,
        {
            NULL_ELEMENTS: [[1, None], None, []],
            NUMERIC_EXTREMES: [[INT16_MIN, INT16_MAX], [0]],
            DEMO: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
        })

    def draw_deep(rng, i):
        return [[[int(v) for v in rng.integers(INT8_MIN, INT8_MAX + 1, int(rng.integers(0, 4)))]
                 for _ in range(int(rng.integers(0, 4)))]
                for _ in range(int(rng.integers(1, 4)))]

    list_column(
        'deep_list', pa.list_(pa.list_(pa.list_(pa.int8()))),
        'Three levels of lists of TINYINTs.',
        draw_deep,
        {
            NULL_ELEMENTS: [[[1, None]], [None], None],
            NUMERIC_EXTREMES: [[[INT8_MIN, INT8_MAX]], [[0]]],
            DEMO: [[[1, 2], [3]], [[4, 5, 6]]],
        })

    # A fixed-size list is never NULL and never empty: its showcase rows hold
    # 32 NULL elements (ALL_NULL) and 32 zeros (EMPTIES) instead.
    embedding_extremes = [math.nan, math.inf, -math.inf, -0.0, FLOAT32_MIN_SUBNORMAL,
                          FLOAT32_MIN_NORMAL, FLOAT32_MAX, -FLOAT32_MAX]
    embedding_null_elements = [None if k in (1, 30) else 0.25 for k in range(32)]
    embedding = draw_column(
        'embedding',
        lambda rng, i: [float(np.float32(round(float(v), 2)))
                        for v in np.clip(rng.normal(0, 0.25, 32), -1, 1)],
        {
            ALL_NULL: [None] * 32,
            EMPTIES: [0.0] * 32,
            NULL_ELEMENTS: embedding_null_elements,
            DEMO: [float(np.float32(round(math.sin(k / 5), 3))) for k in range(32)],
        },
        null_share=0.0)
    embedding[NUMERIC_EXTREMES] = embedding_extremes + embedding[NUMERIC_EXTREMES][8:]
    add('embedding', pa.list_(pa.float32(), 32), 'list',
        'A fixed-size list of 32 FLOATs with two decimals, -1 to 1 (DuckDB '
        'reads it as FLOAT[]); never NULL: 32 NULL elements in ALL_NULL, '
        'zeros in EMPTIES, float32 edges in NUMERIC_EXTREMES.',
        embedding)

    list_column(
        'doubles', pa.list_(pa.float64()),
        '1-4 DOUBLEs at full precision; NaN, +-Infinity, -0.0, 5e-324 and '
        '+-DOUBLE max in NUMERIC_EXTREMES.',
        lambda rng, i: [float(v) for v in rng.normal(0, 100, int(rng.integers(1, 5)))],
        {
            NULL_ELEMENTS: [1.5, None, 2.5],
            NUMERIC_EXTREMES: [math.nan, math.inf, -math.inf, -0.0, DOUBLE_MIN_SUBNORMAL,
                               DOUBLE_MAX, -DOUBLE_MAX, 0.1],
            DEMO: [0.5, 1.25, 2.0],
        })

    list_column(
        'decimals', pa.list_(pa.decimal128(10, 2)),
        '1-5 DECIMAL(10,2)s; [1.25, 2.50, 3.75] in NUMERIC_EXTREMES, which '
        'bridge.query used to return as [6.2e-322, 0, 1.235e-321].',
        lambda rng, i: [Decimal(int(v)).scaleb(-2) for v in
                        rng.integers(-1_000_000, 1_000_001, int(rng.integers(1, 6)))],
        {
            NULL_ELEMENTS: [Decimal('1.00'), None, Decimal('-2.50')],
            NUMERIC_EXTREMES: [Decimal('1.25'), Decimal('2.50'), Decimal('3.75')],
            DEMO: [Decimal('9.99'), Decimal('19.99')],
        })

    list_column(
        'big_ints', pa.list_(pa.int64()),
        '1-3 BIGINTs within +-2^62 (most beyond 2^53); 2^53+-1 and INT64 '
        'bounds in NUMERIC_EXTREMES.',
        lambda rng, i: [int(v) for v in rng.integers(-2**62, 2**62, int(rng.integers(1, 4)))],
        {
            NULL_ELEMENTS: [1, None, 3],
            NUMERIC_EXTREMES: [MAX_SAFE, MAX_SAFE + 2, INT64_MIN, INT64_MAX],
            DEMO: [1, 2, 3],
        })

    list_column(
        'ubig', pa.list_(pa.uint64()),
        '1-3 UBIGINTs over the whole range; UINT64 max in NUMERIC_EXTREMES.',
        lambda rng, i: [int(v) for v in rng.integers(0, UINT64_MAX, int(rng.integers(1, 4)),
                                                     dtype=np.uint64, endpoint=True)],
        {
            NULL_ELEMENTS: [1, None],
            NUMERIC_EXTREMES: [0, MAX_SAFE + 2, UINT64_MAX],
            DEMO: [1, 2, 3],
        })

    list_column(
        'dates', pa.list_(pa.date32()),
        '1-4 DATEs 1990-2029; 0001-01-01, 9999-12-31, 1970-01-01 and '
        '1969-07-20 in DATE_BINARY_EDGES.',
        lambda rng, i: [random_date(rng) for _ in range(int(rng.integers(1, 5)))],
        {
            NULL_ELEMENTS: [date(2020, 1, 1), None],
            DATE_BINARY_EDGES: DATE_EDGES,
            DEMO: [date(2024, 1, 1), date(2024, 2, 29)],
        })

    list_column(
        'timestamps_tz', pa.list_(pa.timestamp('us', tz='UTC')),
        '1-2 TIMESTAMPTZs 1990-2029 with microseconds; the range ends and the '
        'epoch in DATE_BINARY_EDGES.',
        lambda rng, i: [random_timestamp(rng) for _ in range(int(rng.integers(1, 3)))],
        {
            NULL_ELEMENTS: [datetime(2020, 1, 1, 12, tzinfo=UTC), None],
            DATE_BINARY_EDGES: [
                datetime(1, 1, 1, tzinfo=UTC),
                datetime(9999, 12, 31, 23, 59, 59, 999999, tzinfo=UTC),
                datetime(1970, 1, 1, tzinfo=UTC),
                datetime(1969, 12, 31, 23, 59, 59, 999999, tzinfo=UTC),
            ],
            DEMO: [datetime(2024, 1, 1, 9, 30, tzinfo=UTC)],
        })

    list_column(
        'times', pa.list_(pa.time64('us')),
        '1-2 TIMEs with microseconds.',
        lambda rng, i: [random_time(rng) for _ in range(int(rng.integers(1, 3)))],
        {
            NULL_ELEMENTS: [None, time(12)],
            DATE_BINARY_EDGES: [time(0), time(23, 59, 59, 999999), time(12, 0, 0, 1)],
            DEMO: [time(9, 30), time(17, 0)],
        })

    uuid_pool = [random_uuid(column_rng('uuids:pool')) for _ in range(32)]
    list_column(
        'uuids', pa.list_(pa.uuid()),
        '1-3 version-4 UUIDs from a pool of 32 (Parquet UUID logical type); '
        'the nil and all-ones UUIDs in DATE_BINARY_EDGES.',
        lambda rng, i: [pick(rng, uuid_pool) for _ in range(int(rng.integers(1, 4)))],
        {
            NULL_ELEMENTS: [uuid.UUID('12345678-1234-5678-1234-567812345678'), None],
            DATE_BINARY_EDGES: [NIL_UUID, MAX_UUID],
        })

    list_column(
        'blobs', pa.list_(pa.binary()),
        '1-3 BLOBs of 0-6 bytes.',
        lambda rng, i: [random_bytes(rng, 0, 6) for _ in range(int(rng.integers(1, 4)))],
        {
            NULL_ELEMENTS: [b'a', None, b''],
            DATE_BINARY_EDGES: [b'', b'\x00', b'\xff', b'\x00\xff\x80\x7f\n\'"\\'],
            DEMO: [b'hello', b'world'],
        })

    list_column(
        'bools', pa.list_(pa.bool_()),
        '1-6 BOOLEANs.',
        lambda rng, i: [bool(v) for v in rng.integers(0, 2, int(rng.integers(1, 7)))],
        {
            NULL_ELEMENTS: [True, None, False],
            DEMO: [True, False, True],
        })

    def draw_edge_strings(rng, i):
        return [pick(rng, EDGE_STRINGS) if rng.random() < 0.5 else pick(rng, WORDS)
                for _ in range(int(rng.integers(1, 6)))]

    list_column(
        'strings_edge', pa.list_(pa.string()),
        '1-5 strings, half of them needing quotes or escapes; every escape '
        'case in TEXT_ESCAPES; one 20,000-character element in CAP_EDGE.',
        draw_edge_strings,
        {
            NULL_ELEMENTS: ['x', None],
            TEXT_ESCAPES: EDGE_STRINGS,
            CAP_EDGE: [LONG_TEXT],
            DEMO: ['plain', 'it\'s quoted', 'a, b'],
        })

    tier_list = [TIER_LISTS[i % len(TIER_LISTS)] for i in range(N_ROWS)]
    tier_list[ALL_NULL] = None
    add('tier_list', pa.list_(pa.string()), 'list',
        'Cycles through 8 lists by row number (row % 8) whose texts pair up as '
        "look-alikes: [NULL] (a NULL element) and ['NULL'] (the text NULL), "
        "[] and [''], ['a, b'] and [a, b]; NULL in ALL_NULL.",
        tier_list)

    # -------------------------------------------
    # Section 3: Structs
    # -------------------------------------------

    def struct_column(name, arrow_type, description, draw, showcase):
        values = draw_column(name, draw, {ALL_NULL: None, **showcase}, null_share=0.1)
        add(name, arrow_type, 'struct', description, values)

    point_type = pa.struct([('x', pa.float64()), ('y', pa.float64()), ('tier', pa.string())])
    struct_column(
        'point', point_type,
        'STRUCT(x, y, tier): the shape of the wide test file\'s struct '
        'columns; x and y normal with two decimals, tier '
        'bronze/silver/gold/platinum.',
        lambda rng, i: {'x': round(float(rng.normal()), 2), 'y': round(float(rng.normal()), 2),
                        'tier': pick(rng, TIERS)},
        {
            EMPTIES: {'x': None, 'y': None, 'tier': None},
            NULL_ELEMENTS: {'x': 1.0, 'y': None, 'tier': None},
            NUMERIC_EXTREMES: {'x': -0.0, 'y': DOUBLE_MIN_SUBNORMAL, 'tier': 'gold'},
            TEXT_ESCAPES: {'x': 0.0, 'y': 0.0, 'tier': "it's"},
            DEMO: {'x': 1.5, 'y': -0.5, 'tier': 'gold'},
        })

    odd_type = pa.struct([pa.field(n, t) for n, t in ODD_NAME_FIELDS])

    def draw_odd(rng, i):
        value = {}
        for field_name, field_type in ODD_NAME_FIELDS:
            if pa.types.is_string(field_type):
                value[field_name] = pick(rng, TAG_WORDS)
            elif pa.types.is_boolean(field_type):
                value[field_name] = bool(rng.integers(2))
            elif pa.types.is_floating(field_type):
                value[field_name] = int(rng.integers(-20, 21)) / 4
            else:
                value[field_name] = int(rng.integers(0, 20))
        return value

    odd_base = draw_odd(column_rng('odd_names:nulls'), 0)
    odd_null_fields = {n: (None if k % 2 == 0 else odd_base[n])
                       for k, (n, _) in enumerate(ODD_NAME_FIELDS)}
    struct_column(
        'odd_names', odd_type,
        '26 fields named label, name, type, data, size, length, toJSON, '
        'constructor, __proto__, hasOwnProperty, months, days, nanoseconds, '
        '"my field", "x,y", quote"d, it\'s, 2, 1, 10, \u00FCn\u00EF, '
        'emoji\U0001F600, order, null, SELECT, ID: names that break '
        'JavaScript objects or need SQL quoting.',
        draw_odd,
        {
            EMPTIES: {n: None for n, _ in ODD_NAME_FIELDS},
            NULL_ELEMENTS: odd_null_fields,
            NUMERIC_EXTREMES: {
                **{n: None for n, _ in ODD_NAME_FIELDS},
                'size': INT32_MAX, 'length': INT32_MIN, 'months': INT32_MAX,
                'days': INT32_MIN, 'nanoseconds': INT64_MIN, 'x,y': DOUBLE_MAX,
                '2': 0, '1': -1, '10': 10, 'order': INT32_MAX, 'ID': INT64_MAX,
            },
            TEXT_ESCAPES: {
                **{n: None for n, _ in ODD_NAME_FIELDS},
                'label': "it's", 'name': '"dq"', 'type': 'a, b', 'data': '[x]',
                'toJSON': 'k=v', 'constructor': 'NULL', '__proto__': '',
                'my field': '\\', 'quote"d': 'line\nbreak', "it's": 'tab\there',
                '\u00FCn\u00EF': EDGE_STRINGS[11], 'emoji\U0001F600': EDGE_STRINGS[12],
                'null': "''", 'SELECT': 'DROP TABLE t;',
            },
            DEMO: {
                'label': 'a label field', 'name': 'Ada', 'type': 'demo', 'data': 'payload',
                'size': 3, 'length': 7, 'toJSON': 'not a function',
                'constructor': 'not a class', '__proto__': 'not a prototype',
                'hasOwnProperty': True, 'months': 14, 'days': 3, 'nanoseconds': 0,
                'my field': 'spaced', 'x,y': 2.5, 'quote"d': 'quoted',
                "it's": 'apostrophe', '2': 2, '1': 1, '10': 10,
                '\u00FCn\u00EF': 'unicode', 'emoji\U0001F600': '\U0001F600',
                'order': 1, 'null': 'not null', 'SELECT': 'not SQL', 'ID': 42,
            },
        })

    typed_type = pa.struct([
        ('dec38', pa.decimal128(38, 0)),
        ('dec18_4', pa.decimal128(18, 4)),
        ('uuid', pa.uuid()),
        ('blob', pa.binary()),
        ('time', pa.time64('us')),
        ('ts', pa.timestamp('us')),
        ('tstz', pa.timestamp('us', tz='UTC')),
        ('date', pa.date32()),
        ('flag', pa.bool_()),
        ('f32', pa.float32()),
        ('i64', pa.int64()),
    ])

    typed_uuids = [random_uuid(column_rng('typed_leaves:uuids')) for _ in range(16)]

    def draw_typed(rng, i):
        # Each leaf from a small pool of values, so the column stays small.
        return {
            'dec38': Decimal(int(rng.integers(-9, 10))) * Decimal(10**37) + 1,
            'dec18_4': Decimal(int(rng.integers(-50, 51))).scaleb(-4) * 12345,
            'uuid': pick(rng, typed_uuids),
            'blob': bytes([int(rng.integers(256))]) * int(rng.integers(0, 4)),
            'time': time(int(rng.integers(24)), 30 * int(rng.integers(2)), 0, 250000),
            'ts': datetime(2024, 1, 1, 12, 0, 0, 500000) + timedelta(days=int(rng.integers(32))),
            'tstz': datetime(2024, 1, 1, 6, 0, 0, 123456, tzinfo=UTC) + timedelta(
                hours=int(rng.integers(48))),
            'date': random_date(rng, date(2024, 1, 1), 32),
            'flag': bool(rng.integers(2)),
            'f32': float(np.float32(int(rng.integers(-20, 21)) / 10)),
            'i64': int(rng.integers(-7, 8)) * 2**60 + 1,
        }

    typed_names = [f.name for f in typed_type]
    typed = draw_column('typed_leaves', draw_typed, {
        ALL_NULL: None,
        EMPTIES: {n: None for n in typed_names},
        NUMERIC_EXTREMES: {
            'dec38': Decimal(10**38 - 1), 'dec18_4': Decimal('99999999999999.9999'),
            'uuid': MAX_UUID, 'blob': b'\xff' * 8, 'time': time(23, 59, 59, 999999),
            'ts': datetime(9999, 12, 31, 23, 59, 59, 999999),
            'tstz': datetime(9999, 12, 31, 23, 59, 59, 999999, tzinfo=UTC),
            'date': date(9999, 12, 31), 'flag': True, 'f32': FLOAT32_MAX, 'i64': INT64_MIN,
        },
        DATE_BINARY_EDGES: {
            'dec38': Decimal(-(10**38 - 1)), 'dec18_4': Decimal('-0.0001'),
            'uuid': NIL_UUID, 'blob': b'', 'time': time(0),
            'ts': datetime(1, 1, 1), 'tstz': datetime(1969, 12, 31, 23, 59, 59, tzinfo=UTC),
            'date': date(1, 1, 1), 'flag': False, 'f32': -0.0, 'i64': 0,
        },
        DEMO: {
            'dec38': Decimal(12345678901234567890), 'dec18_4': Decimal('1.2500'),
            'uuid': uuid.UUID('12345678-1234-5678-1234-567812345678'), 'blob': b'hello',
            'time': time(9, 30), 'ts': datetime(2024, 1, 1, 9, 30),
            'tstz': datetime(2024, 1, 1, 9, 30, tzinfo=UTC), 'date': date(2024, 1, 1),
            'flag': True, 'f32': 0.1, 'i64': 9007199254740993,
        },
    }, null_share=0.1)
    for value in typed:
        if value is not None:
            value['uuid'] = uuid_bytes(value['uuid'])
    add('typed_leaves', typed_type, 'struct',
        'One leaf of each type that has gone wrong inside a nested value: '
        'DECIMAL(38,0), DECIMAL(18,4), UUID, BLOB, TIME, TIMESTAMP, '
        'TIMESTAMPTZ, DATE, BOOLEAN, FLOAT, BIGINT.',
        typed)

    wide_fields = [(f'f{k + 1:02d}', WIDE_TYPES[k % len(WIDE_TYPES)]) for k in range(40)]
    wide_type = pa.struct([pa.field(n, t) for n, t in wide_fields])

    def wide_value(rng, field_type, long_text=False):
        # Few distinct values per field: 40 fields in 4 row groups are 160
        # column chunks, and dictionaries of distinct values would dominate.
        if pa.types.is_string(field_type):
            return 'x' * 150 if long_text else pick(rng, TAG_WORDS)
        if pa.types.is_boolean(field_type):
            return bool(rng.integers(2))
        if pa.types.is_date32(field_type):
            return random_date(rng, date(2024, 1, 1), 16)
        if pa.types.is_floating(field_type):
            return float(np.float32(int(rng.integers(-8, 9)) / 4))
        return int(rng.integers(-10, 11))

    wide_cap_rng = column_rng('wide_struct:cap')
    struct_column(
        'wide_struct', wide_type,
        '40 scalar fields f01-f40 cycling INTEGER, DOUBLE, VARCHAR, BOOLEAN, '
        'DATE, BIGINT, FLOAT, SMALLINT; its CAP_EDGE row (150-character '
        'strings) renders past 1,000 characters.',
        lambda rng, i: {n: wide_value(rng, t) for n, t in wide_fields},
        {
            EMPTIES: {n: None for n, _ in wide_fields},
            CAP_EDGE: {n: wide_value(wide_cap_rng, t, long_text=True) for n, t in wide_fields},
        })

    address_type = pa.struct([('city', pa.string()), ('zip', pa.string())])
    contact_type = pa.struct([('email', pa.string()), ('phones', pa.list_(pa.string())),
                              ('address', address_type)])
    owner_type = pa.struct([('name', pa.string()), ('contact', contact_type)])
    nested_type = pa.struct([('owner', owner_type), ('version', pa.int32())])

    def draw_nested(rng, i):
        first, last = pick(rng, FIRST_NAMES), pick(rng, LAST_NAMES)
        phones = [f'+1-555-01{int(rng.integers(100)):02d}' for _ in range(int(rng.integers(0, 4)))]
        address = None if rng.random() < 0.1 else {
            'city': pick(rng, CITIES), 'zip': f'{int(rng.integers(100000)):05d}'}
        contact = None if rng.random() < 0.1 else {
            'email': f'{first.lower()}.{last.lower()}@example.com', 'phones': phones,
            'address': address}
        return {'owner': {'name': f'{first} {last}', 'contact': contact},
                'version': int(rng.integers(1, 10))}

    struct_column(
        'nested_struct', nested_type,
        'Four levels deep: owner.contact.address.city, with '
        'owner.contact.email and the list owner.contact.phones.',
        draw_nested,
        {
            EMPTIES: {'owner': None, 'version': None},
            NULL_ELEMENTS: {'owner': {'name': None, 'contact': {
                'email': None, 'phones': [None, '+1-555-0100'], 'address': None}},
                'version': 1},
            TEXT_ESCAPES: {'owner': {'name': "O'Brien, \"Pat\"", 'contact': {
                'email': 'k=v@example.com', 'phones': ['[x]', ''],
                'address': {'city': 'line\nbreak', 'zip': 'NULL'}}}, 'version': 0},
            DEMO: {'owner': {'name': 'Grace Hopper', 'contact': {
                'email': 'grace.hopper@example.com', 'phones': ['+1-555-0100', '+1-555-0199'],
                'address': {'city': 'Arlington', 'zip': '22201'}}}, 'version': 2},
        })

    person_type = pa.struct([('name', pa.string()), ('age', pa.int32()),
                             ('langs', pa.list_(pa.string()))])

    def draw_people(rng, i):
        return [{'name': pick(rng, FIRST_NAMES), 'age': int(rng.integers(18, 90)),
                 'langs': random_words(rng, 0, 3, LANGS)}
                for _ in range(int(rng.integers(1, 5)))]

    list_column(
        'people', pa.list_(person_type),
        'A list of 1-4 STRUCT(name, age, langs VARCHAR[]).',
        draw_people,
        {
            NULL_ELEMENTS: [None, {'name': None, 'age': None, 'langs': None},
                            {'name': 'Ada', 'age': 36, 'langs': ['en', None]}],
            NUMERIC_EXTREMES: [{'name': 'max', 'age': INT32_MAX, 'langs': []},
                               {'name': 'min', 'age': INT32_MIN, 'langs': []}],
            TEXT_ESCAPES: [{'name': "it's", 'age': 0, 'langs': EDGE_STRINGS[:4]}],
            DEMO: [{'name': 'Ada', 'age': 36, 'langs': ['en', 'fr']},
                   {'name': 'Linus', 'age': 54, 'langs': ['fi', 'sv', 'en']}],
        })

    # -------------------------------------------
    # Section 4: Maps (as lists of (key, value) pairs, in order)
    # -------------------------------------------

    def map_column(name, arrow_type, description, draw, showcase):
        values = draw_column(name, draw, {ALL_NULL: None, EMPTIES: [], **showcase},
                             null_share=0.1, empty_share=0.1, empty=list)
        add(name, arrow_type, 'map', description, values)

    def draw_attrs(rng, i):
        keys = unique_keys(rng, int(rng.integers(1, 6)), lambda r: pick(r, ATTR_KEYS))
        return [(k, int(rng.integers(0, 1001))) for k in keys]

    map_column(
        'attrs', pa.map_(pa.string(), pa.int32()),
        '1-5 keys drawn from size, toJSON, constructor, __proto__, 2, 1, k=v, '
        'length and ordinary names; escape cases as keys in TEXT_ESCAPES.',
        draw_attrs,
        {
            NULL_ELEMENTS: [('a', None), ('b', 1)],
            NUMERIC_EXTREMES: [('min', INT32_MIN), ('max', INT32_MAX), ('zero', 0)],
            TEXT_ESCAPES: [(s, k) for k, s in enumerate(EDGE_STRINGS[:11])],
            DEMO: [('width', 12), ('height', 30), ('depth', 4)],
            NAME_COLLISIONS: [('size', 1), ('toJSON', 2), ('constructor', 3), ('__proto__', 4),
                              ('2', 5), ('1', 6), ('k=v', 7), ('k_v', 8), ('K_V', 9)],
        })

    def draw_int_keys(rng, i):
        keys = unique_keys(rng, int(rng.integers(1, 6)), lambda r: int(r.integers(-100, 101)))
        return [(k, pick(rng, WORDS)) for k in keys]

    map_column(
        'int_keys', pa.map_(pa.int32(), pa.string()),
        '1-5 INTEGER keys -100..100; 600 entries in LIST_1000; keys 2, 1, '
        '10 in that order in DEMO.',
        draw_int_keys,
        {
            NULL_ELEMENTS: [(1, None), (2, 'two')],
            NUMERIC_EXTREMES: [(INT32_MIN, 'min'), (0, 'zero'), (INT32_MAX, 'max')],
            LIST_1000: [(k, f'v{k}') for k in range(1, 601)],
            DEMO: [(2, 'two'), (1, 'one'), (10, 'ten')],
        })

    def draw_date_keys(rng, i):
        keys = unique_keys(rng, int(rng.integers(1, 4)),
                           lambda r: random_date(r, date(2020, 1, 1), 2192))
        return [(k, [int(v) for v in rng.integers(0, 100, int(rng.integers(0, 4)))])
                for k in keys]

    map_column(
        'date_keys', pa.map_(pa.date32(), pa.list_(pa.int32())),
        '1-3 DATE keys 2020-2025, each mapped to a list of 0-3 integers.',
        draw_date_keys,
        {
            NULL_ELEMENTS: [(date(2020, 1, 1), None), (date(2020, 1, 2), [1, None])],
            DATE_BINARY_EDGES: [(DATE_EDGES[0], [1]), (DATE_EDGES[1], [2, 3]),
                                (DATE_EDGES[2], []), (DATE_EDGES[3], None)],
            DEMO: [(date(2024, 1, 1), [1, 2]), (date(2024, 1, 2), [3])],
        })

    item_type = pa.struct([('qty', pa.int32()), ('price', pa.decimal128(10, 2)),
                           ('note', pa.string())])

    def draw_items(rng, i):
        keys = unique_keys(rng, int(rng.integers(1, 4)), lambda r: pick(r, FRUITS))
        return [(k, {'qty': int(rng.integers(0, 50)),
                     'price': Decimal(int(rng.integers(1, 40)) * 25).scaleb(-2),
                     'note': pick(rng, WORDS)}) for k in keys]

    map_column(
        'map_of_structs', pa.map_(pa.string(), item_type),
        '1-3 fruit keys mapped to STRUCT(qty INTEGER, price DECIMAL(10,2), '
        'note VARCHAR).',
        draw_items,
        {
            NULL_ELEMENTS: [('a', None), ('b', {'qty': None, 'price': None, 'note': None})],
            NUMERIC_EXTREMES: [
                ('max', {'qty': INT32_MAX, 'price': Decimal('99999999.99'), 'note': 'max'}),
                ('min', {'qty': INT32_MIN, 'price': Decimal('-99999999.99'), 'note': 'min'})],
            DEMO: [('apple', {'qty': 3, 'price': Decimal('1.25'), 'note': 'fresh'}),
                   ('pear', {'qty': 1, 'price': Decimal('0.80'), 'note': 'ripe'})],
        })

    # -------------------------------------------
    # Section 5: JSON
    # -------------------------------------------

    def draw_doc_value(rng):
        u = rng.random()
        if u < 0.02:
            return int(rng.integers(0, 100))  # a JSON scalar number
        if u < 0.04:
            return pick(rng, WORDS)  # a JSON scalar string
        if u < 0.06:
            return [int(v) for v in rng.integers(0, 10, int(rng.integers(0, 4)))]
        if u < 0.07:
            return None  # the JSON literal null
        doc = {}
        for key in unique_keys(rng, int(rng.integers(1, 6)), lambda r: pick(r, DOC_KEYS)):
            if key == 'k' or key == 'my field':
                doc[key] = pick(rng, WORDS)
            elif key == 'score':
                doc[key] = round(float(rng.random()), 3)
            elif key == 'kind':
                doc[key] = pick(rng, ['alpha', 'beta', 'gamma'])
            elif key == 'a.b':
                doc[key] = int(rng.integers(0, 1000))
            elif key == 'q"k':
                doc[key] = bool(rng.integers(2))
            else:
                doc[key] = {'n': int(rng.integers(0, 10)),
                            'list': [int(v) for v in rng.integers(0, 10, 3)]}
        return doc

    doc_showcase = {
        ALL_NULL: None,
        EMPTIES: '{}',
        NULL_ELEMENTS: json_text({'k': None, 'score': None, 'kind': 'nulls'}),
        NUMERIC_EXTREMES: json_text({
            'max_safe': MAX_SAFE, 'unsafe': MAX_SAFE + 2, 'i64_min': INT64_MIN,
            'i64_max': INT64_MAX, 'u64_max': UINT64_MAX, 'dec': 1.25, 'tiny': DOUBLE_MIN_SUBNORMAL,
            'neg_zero': -0.0, 'huge': DOUBLE_MAX}),
        TEXT_ESCAPES: json_text({
            'k': "it's", 'q"k': '"dq"', 'a.b': 'a, b', 'my field': '[x] k=v', 'kind': 'NULL',
            '\u00FCn\u00EF': EDGE_STRINGS[11], 'score': 'e\u0301 \\ line\nbreak tab\there',
            '': "''"}),
        LIST_1000: json_text(list(range(1, 1001))),
        LIST_2500: '42',
        LIST_10000: 'null',
        CAP_EDGE: json_text({'long': LONG_TEXT}),
        DATE_BINARY_EDGES: json_text({'first': '0001-01-01', 'last': '9999-12-31',
                                      'epoch': '1970-01-01', 'nul': '\x00'}),
        DEMO: json_text({'k': 'alpha', 'score': 0.92, 'kind': 'demo', 'my field': 'spaced key',
                         'a.b': 'dotted key', 'q"k': 'quoted key',
                         '\u00FCn\u00EF': 'unicode key'}),
        NAME_COLLISIONS: json_text({'a.b': 1, 'a_b': 2, 'A_B': 3}),
    }
    add('doc', pa.json_(), 'json',
        'JSON documents (Parquet JSON logical type) with keys k, score, kind, '
        '"my field", "a.b", q"k, \u00FCn\u00EF; some rows a JSON scalar, an '
        'array or the literal null (a 1,000-item array, 42 and null in rows '
        '5-7).',
        draw_column('doc', lambda rng, i: json_text(draw_doc_value(rng)), doc_showcase))

    def draw_json_list(rng, i):
        return [json_text(draw_doc_value(rng)) for _ in range(int(rng.integers(1, 3)))]

    list_column(
        'json_list', pa.list_(pa.json_()),
        'A list of 1-2 JSON values (objects, arrays, scalars, the literal '
        'null); SQL NULL next to the JSON literal null in NULL_ELEMENTS.',
        draw_json_list,
        {
            NULL_ELEMENTS: ['1', None, 'null'],
            NUMERIC_EXTREMES: [str(MAX_SAFE + 2), str(INT64_MIN), str(UINT64_MAX), '1.25',
                               '-0.0', '5e-324'],
            TEXT_ESCAPES: [json_text(s) for s in EDGE_STRINGS[:8]] + [json_text({'k=v': '[x]'})],
            DEMO: [json_text({'name': 'Ada'}), json_text([1, 2, 3]), json_text('text'),
                   'true'],
        })

    # -------------------------------------------
    # Section 6: All NULL, all empty
    # -------------------------------------------

    add('all_null_list', pa.list_(pa.int32()), 'list',
        'NULL in every row.', [None] * N_ROWS)
    add('all_empty_list', pa.list_(pa.string()), 'list',
        '[] in every row.', [[] for _ in range(N_ROWS)])

    return cols


# ===========================================
# JSON file columns
# ===========================================

def json_columns(parquet_cols):
    """
    Build every column of the JSON file, in record order.

    Where a column mirrors a Parquet column of the same name, it holds the
    same values. JSON integers are non-negative unless stated: DuckDB's
    read_json infers HUGEINT for integers that mix signs.
    """
    by_name = {c.name: c for c in parquet_cols}
    cols = []

    def add(name, kind, description, values):
        cols.append(Column(name, None, kind, description, values))

    add('id', 'scalar', 'Row number 0-999; equals the __rowid__ the loader adds.',
        list(range(N_ROWS)))
    add('label', 'scalar', 'As the Parquet file\'s label.', by_name['label'].values)

    def list_column(name, description, draw, showcase, empty_share=0.1):
        values = draw_column('json:' + name, draw, {ALL_NULL: None, EMPTIES: [], **showcase},
                             null_share=0.1, empty_share=empty_share, empty=list)
        add(name, 'list', description, values)

    list_column(
        'counts',
        'Non-negative integers (BIGINT[]); 1,000 / 2,500 / 10,000 single '
        'digits (position mod 10, to keep the file small) in rows 5-7.',
        lambda rng, i: [int(v) for v in rng.integers(0, 1000, int(rng.integers(1, 5)))],
        {
            NULL_ELEMENTS: [4, None, 17],
            NUMERIC_EXTREMES: [0, MAX_SAFE, MAX_SAFE + 2, INT64_MAX],
            LIST_1000: [k % 10 for k in range(1, 1001)],
            LIST_2500: [k % 10 for k in range(1, 2501)],
            LIST_10000: [k % 10 for k in range(1, 10001)],
            DEMO: [1, 2, 3],
        })

    list_column(
        'signed',
        'Integers of both signs: read_json infers HUGEINT[] for them, not '
        'BIGINT[] (it reads non-negative integers as unsigned).',
        lambda rng, i: [int(v) for v in rng.integers(-99, 100, int(rng.integers(1, 4)))],
        {
            NULL_ELEMENTS: [-4, None, 17],
            NUMERIC_EXTREMES: [INT64_MIN, -1, 0, INT64_MAX],
            DEMO: [-1, 0, 1],
        })

    list_column(
        'huge',
        'Non-negative integers, past INT64 max in NUMERIC_EXTREMES (2^63 and '
        'UINT64 max), which makes read_json infer HUGEINT[].',
        lambda rng, i: [int(v) for v in rng.integers(0, 1000, int(rng.integers(1, 3)))],
        {
            NULL_ELEMENTS: [1, None],
            NUMERIC_EXTREMES: [INT64_MAX + 1, UINT64_MAX],
            DEMO: [1, 2, 3],
        })

    list_column(
        'floats',
        'DOUBLE[] with three decimals; NUMERIC_EXTREMES holds -0.0, 5e-324, '
        '+-DOUBLE max and 2^64 (an integer past UINT64, which read_json reads '
        'as a DOUBLE).',
        lambda rng, i: [round(float(v), 3) for v in rng.normal(0, 100, int(rng.integers(1, 4)))],
        {
            NULL_ELEMENTS: [1.5, None, 2.5],
            NUMERIC_EXTREMES: [-0.0, DOUBLE_MIN_SUBNORMAL, DOUBLE_MAX, -DOUBLE_MAX, 2**64],
            DEMO: [0.5, 1.25, 2.0],
        })

    list_column(
        'words',
        'VARCHAR[]: 1-2 words; the escape cases in TEXT_ESCAPES; the '
        '20,000-character element in CAP_EDGE.',
        lambda rng, i: random_words(rng, 1, 2),
        {
            NULL_ELEMENTS: ['a', None, 'c'],
            TEXT_ESCAPES: EDGE_STRINGS,
            CAP_EDGE: [LONG_TEXT],
            DEMO: ['red', 'green', 'blue'],
        })

    list_column(
        'days',
        'ISO date strings, which read_json reads as DATE[].',
        lambda rng, i: [random_date(rng).isoformat()],
        {
            NULL_ELEMENTS: ['2020-01-01', None],
            DATE_BINARY_EDGES: [d.isoformat() for d in DATE_EDGES],
            DEMO: ['2024-01-01', '2024-02-29'],
        })

    list_column(
        'ids',
        'UUID strings, which read_json reads as UUID[].',
        lambda rng, i: [str(random_uuid(rng))],
        {
            NULL_ELEMENTS: ['12345678-1234-5678-1234-567812345678', None],
            DATE_BINARY_EDGES: [str(NIL_UUID), str(MAX_UUID)],
        })

    point = list(by_name['point'].values)
    point[EMPTIES] = {}
    add('point', 'struct',
        'As the Parquet file\'s point; {} (read as all-NULL fields) in EMPTIES.', point)

    def draw_depth5(rng, i):
        return {'l2': {'l3': {'l4': {'l5': {'leaf': int(rng.integers(0, 100))}}}}}

    add('depth5', 'struct',
        'A STRUCT five levels deep (the column, then l2, l3, l4, l5), with '
        'one leaf: depth5.l2.l3.l4.l5.leaf.',
        draw_column('json:depth5', draw_depth5, {
            ALL_NULL: None,
            EMPTIES: {},
            NULL_ELEMENTS: {'l2': {'l3': None}},
            DEMO: {'l2': {'l3': {'l4': {'l5': {'leaf': 42}}}}},
        }))

    def draw_props(rng, i):
        keys = unique_keys(rng, int(rng.integers(1, 3)),
                           lambda r: f'key_{int(r.integers(500)):03d}')
        if rng.random() < 0.05:
            keys.append(pick(rng, ['size', 'toJSON', 'constructor', '__proto__']))
        return {k: int(rng.integers(0, 1000)) for k in keys}

    add('props', 'map',
        'Objects whose keys vary from row to row (key_000-key_499, rarely '
        'size/toJSON/constructor/__proto__), which read_json reads as '
        'MAP(VARCHAR, BIGINT); a.b, a_b, A_B, k=v and k_v in NAME_COLLISIONS '
        '(case-colliding keys would fail as STRUCT fields).',
        draw_column('json:props', draw_props, {
            ALL_NULL: None,
            EMPTIES: {},
            NULL_ELEMENTS: {'a': None, 'b': 1},
            DEMO: {'width': 12, 'height': 30, 'depth': 4},
            NAME_COLLISIONS: {'a.b': 1, 'a_b': 2, 'A_B': 3, 'k=v': 4, 'k_v': 5, 'K_V': 6},
        }, empty_share=0.1, empty=dict))

    list_column(
        'empty_list',
        '[] in every non-NULL row, which read_json reads as JSON[].',
        lambda rng, i: [],
        {}, empty_share=0.0)

    def draw_mixed(rng, i):
        pool = [lambda: int(rng.integers(0, 100)), lambda: pick(rng, WORDS),
                lambda: bool(rng.integers(2)), lambda: None,
                lambda: {'k': int(rng.integers(0, 10))},
                lambda: [int(v) for v in rng.integers(0, 10, 2)]]
        return [pool[int(rng.integers(len(pool)))]() for _ in range(int(rng.integers(1, 4)))]

    list_column(
        'mixed_list',
        'Arrays mixing numbers, strings, booleans, null, objects and arrays, '
        'which read_json reads as JSON[] (a JSON null element is SQL NULL).',
        draw_mixed,
        {
            NULL_ELEMENTS: [1, None, 'x'],
            NUMERIC_EXTREMES: [MAX_SAFE + 2, INT64_MIN, UINT64_MAX, -0.0],
            DEMO: [1, 'two', True, {'k': 3}, [4]],
        })

    def draw_shifty(rng, i):
        kind = int(rng.integers(5))
        if kind == 0:
            return int(rng.integers(0, 1000))
        if kind == 1:
            return pick(rng, WORDS)
        if kind == 2:
            return bool(rng.integers(2))
        if kind == 3:
            return {'k': pick(rng, WORDS), 'n': int(rng.integers(0, 10))}
        return [int(v) for v in rng.integers(0, 10, int(rng.integers(0, 4)))]

    add('shifty', 'json',
        'A field whose type changes from row to row (number, string, boolean, '
        'object, array), which read_json reads as JSON.',
        draw_column('json:shifty', draw_shifty, {
            ALL_NULL: None,
            EMPTIES: {},
            NUMERIC_EXTREMES: MAX_SAFE + 2,
            TEXT_ESCAPES: "it's \"dq\" a, b [x] k=v",
            DEMO: {'k': 'demo', 'n': 1},
        }))

    add('key_order', 'struct',
        'An object whose key "2" comes before "1": STRUCT("2" BIGINT, "1" '
        'BIGINT), in that order.',
        draw_column('json:key_order',
                    lambda rng, i: {'2': int(rng.integers(10)), '1': int(rng.integers(10))},
                    {ALL_NULL: None, EMPTIES: {}, NULL_ELEMENTS: {'2': None, '1': 1},
                     DEMO: {'2': 2, '1': 1}}))

    def draw_people(rng, i):
        return [{'name': pick(rng, FIRST_NAMES), 'age': int(rng.integers(18, 90)),
                 'langs': random_words(rng, 0, 1, LANGS)}
                for _ in range(1 if rng.random() < 0.8 else 2)]

    list_column(
        'people', 'A list of 1-2 objects {name, age, langs}: STRUCT(...)[], with '
        '"name" quoted in the DESCRIBE text (a keyword).',
        draw_people,
        {
            NULL_ELEMENTS: [None, {'name': None, 'age': None, 'langs': None},
                            {'name': 'Ada', 'age': 36, 'langs': ['en', None]}],
            DEMO: [{'name': 'Ada', 'age': 36, 'langs': ['en', 'fr']},
                   {'name': 'Linus', 'age': 54, 'langs': ['fi', 'sv', 'en']}],
        })

    def draw_odd_keys(rng, i):
        # A random subset of the keys, always in this order.
        value = {'k': pick(rng, TAG_WORDS), 'score': round(float(rng.random()), 2),
                 'kind': pick(rng, ['alpha', 'beta', 'gamma']),
                 'my field': int(rng.integers(10)) if rng.random() < 0.5 else pick(rng, TAG_WORDS),
                 'a.b': int(rng.integers(0, 100)), 'q"k': bool(rng.integers(2)),
                 '\u00FCn\u00EF': pick(rng, TAG_WORDS)}
        return {k: v for k, v in value.items() if rng.random() < 0.45}

    add('odd_keys', 'struct',
        'Objects with the keys k, score, kind, "my field", "a.b", q"k and '
        '\u00FCn\u00EF (a random subset, in that order), read as a STRUCT whose '
        'field names need quoting; "my field" holds a number in some rows and '
        'text in others, so read_json types that field JSON.',
        draw_column('json:odd_keys', draw_odd_keys, {
            ALL_NULL: None,
            EMPTIES: {},
            # Every key, in order, before any random row: the order DuckDB
            # first sees the keys in is the order of the STRUCT's fields.
            NULL_ELEMENTS: {'k': None, 'score': None, 'kind': 'nulls', 'my field': None,
                            'a.b': None, 'q"k': None, '\u00FCn\u00EF': None},
            DEMO: {'k': 'alpha', 'score': 0.92, 'kind': 'demo', 'my field': 'spaced key',
                   'a.b': 7, 'q"k': True, '\u00FCn\u00EF': 'unicode key'},
        }))

    list_column(
        'matrix', 'Non-negative integer arrays of arrays (BIGINT[][]).',
        lambda rng, i: [[int(v) for v in rng.integers(0, 10, int(rng.integers(0, 4)))]
                        for _ in range(int(rng.integers(1, 3)))],
        {NULL_ELEMENTS: [[1, None], None, []], DEMO: [[1, 2, 3], [4, 5, 6]]})

    add('all_null', 'json', 'null in every row, which read_json reads as JSON.',
        [None] * N_ROWS)

    add('empty_obj', 'map',
        '{} in every non-NULL row, which read_json reads as MAP(VARCHAR, JSON).',
        draw_column('json:empty_obj', lambda rng, i: {}, {ALL_NULL: None}, null_share=0.1))

    return cols


# ===========================================
# Self-checks and statistics
# ===========================================

def reject_constant(name):
    raise ValueError(f'non-standard JSON constant {name}')


def check_json_text(text, where):
    """A JSON value must be standard JSON: parse it strictly."""
    try:
        json.loads(text, parse_constant=reject_constant)
    except ValueError as err:
        raise AssertionError(f'{where}: not standard JSON: {text[:80]!r}: {err}')


def walk_json_types(arrow_type, value, where):
    """Parse every JSON text inside `value`, which has type `arrow_type`."""
    if value is None:
        return
    if isinstance(arrow_type, pa.JsonType):
        check_json_text(value, where)
    elif pa.types.is_list(arrow_type) or pa.types.is_fixed_size_list(arrow_type):
        for item in value:
            walk_json_types(arrow_type.value_type, item, where)
    elif pa.types.is_map(arrow_type):
        for k, v in value:
            walk_json_types(arrow_type.item_type, v, where)
    elif pa.types.is_struct(arrow_type):
        for field in arrow_type:
            walk_json_types(field.type, value.get(field.name), where)


def walk_maps(arrow_type, value, where):
    """Every map inside `value` must have unique, non-NULL keys."""
    if value is None:
        return
    if pa.types.is_map(arrow_type):
        keys = [k for k, _ in value]
        assert None not in keys, f'{where}: NULL map key'
        assert len(set(keys)) == len(keys), f'{where}: duplicate map keys {keys}'
        for _, v in value:
            walk_maps(arrow_type.item_type, v, where)
    elif pa.types.is_list(arrow_type) or pa.types.is_fixed_size_list(arrow_type):
        for item in value:
            walk_maps(arrow_type.value_type, item, where)
    elif pa.types.is_struct(arrow_type):
        for field in arrow_type:
            walk_maps(field.type, value.get(field.name), where)


def check_parquet_columns(cols):
    """JSON parses, map keys are unique, the fixed-size list is never NULL,
    and the showcase rows hold what SHOWCASE_ROWS says."""
    names = [c.name for c in cols]
    assert len(set(names)) == len(names), 'duplicate column names'
    for col in cols:
        assert len(col.values) == N_ROWS, f'{col.name}: {len(col.values)} rows'
        for i, value in enumerate(col.values):
            where = f'{col.name} row {i}'
            walk_json_types(col.arrow_type, value, where)
            walk_maps(col.arrow_type, value, where)
            if pa.types.is_fixed_size_list(col.arrow_type):
                assert value is not None, f'{where}: NULL row in a fixed-size list'
                assert len(value) == col.arrow_type.list_size, f'{where}: wrong length'
    by_name = {c.name: c for c in cols}
    never_null = {'id', 'embedding', 'all_empty_list'}
    for col in cols:
        if col.name not in never_null:
            assert col.values[ALL_NULL] is None, f'{col.name}: ALL_NULL row is not NULL'
    long_list = by_name['long_list'].values
    assert [len(long_list[r]) for r in (LIST_1000, LIST_2500, LIST_10000)] == [1000, 2500, 10000]
    assert len(by_name['int_keys'].values[LIST_1000]) == 600
    # The ZWJ emoji straddles the display cap in the cell text: one element
    # renders as "[<element>]", three as "[a, b, c]" (neither needs quotes).
    for text in ('[' + LONG_TEXT + ']', '[' + ', '.join(CAP_TAGS) + ']'):
        start = text.index(FAMILY) + 1  # 1-based code point
        assert start == CAP_EMOJI_START, f'emoji at {start}'
        assert start <= DISPLAY_CAP < start + len(FAMILY) - 1
    assert len(LONG_TEXT) == 20000


def check_json_records(records):
    """The records are standard JSON, and ALL_NULL is null but for id."""
    text = json.dumps(records, ensure_ascii=False, allow_nan=False)
    assert json.loads(text, parse_constant=reject_constant) == records
    for name, value in records[ALL_NULL].items():
        assert name == 'id' or value is None, f'{name}: ALL_NULL row is not null'


def kind_stats(kind, values):
    """Null count, empty count and longest list (or largest map) of a column."""
    nulls = sum(1 for v in values if v is None)
    if kind not in ('list', 'map'):
        return nulls, None, None
    present = [v for v in values if v is not None]
    empties = sum(1 for v in present if len(v) == 0)
    longest = max((len(v) for v in present), default=None)
    return nulls, empties, longest


def column_entry(col, expected_types):
    nulls, empties, longest = kind_stats(col.kind, col.values)
    return {
        'name': col.name,
        'kind': col.kind,
        'arrowType': None if col.arrow_type is None else str(col.arrow_type),
        'duckdbType': expected_types[col.name],
        'nullCount': nulls,
        'emptyCount': empties,
        'maxLength': longest,
        'description': col.description,
    }


# ===========================================
# Export
# ===========================================

def to_parquet_value(col, value):
    """The value pyarrow takes for the column (UUIDs as bytes)."""
    if col.name == 'uuids' and value is not None:
        return [uuid_bytes(u) for u in value]
    return value


def export_parquet(cols, output_path):
    """Write the Parquet file: 4 row groups of 250 rows, Snappy-compressed."""
    arrays = [to_arrow([to_parquet_value(c, v) for v in c.values], c.arrow_type) for c in cols]
    table = pa.table(arrays, names=[c.name for c in cols])
    pq.write_table(table, output_path, row_group_size=ROW_GROUP_SIZE, compression='snappy')
    metadata = pq.ParquetFile(output_path).metadata
    assert metadata.num_row_groups == N_ROWS // ROW_GROUP_SIZE
    assert metadata.num_rows == N_ROWS
    print(f"Parquet exported to: {output_path}")


def json_record_value(value):
    """The value as JSON (JSON values are Python values already); finite."""
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError('NaN or Infinity in the JSON file')
    return value


def export_json(cols, output_path):
    """Write the JSON file: an array of records, one per line."""
    records = []
    for i in range(N_ROWS):
        records.append({c.name: json_record_value(c.values[i]) for c in cols})
    check_json_records(records)
    lines = [json.dumps(r, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
             for r in records]
    with open(output_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('[\n' + ',\n'.join(lines) + '\n]\n')
    print(f"JSON exported to: {output_path}")


def export_manifest(parquet_cols, json_cols, output_path):
    manifest = {
        'generator': 'generate-nested-stress-tests.py',
        'seed': SEED,
        'rowCount': N_ROWS,
        'duckdbVersion': DUCKDB_VERSION,
        'displayCap': DISPLAY_CAP,
        'capEmojiStart': CAP_EMOJI_START,
        'showcaseRows': SHOWCASE_ROWS,
        'parquet': {
            'file': 'parquet/nested-stress-tests.parquet',
            'rowGroups': N_ROWS // ROW_GROUP_SIZE,
            'columns': [column_entry(c, EXPECTED_PARQUET_TYPES) for c in parquet_cols],
        },
        'json': {
            'file': 'json/nested-stress-tests.json',
            'columns': [column_entry(c, EXPECTED_JSON_TYPES) for c in json_cols],
        },
    }
    with open(output_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(f"Manifest exported to: {output_path}")


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    """Main entry point."""
    print("Generating Nested Stress Test Dataset...")
    print(f"Target rows: {N_ROWS}, seed: {SEED}")

    parquet_cols = parquet_columns()
    json_cols = json_columns(parquet_cols)
    check_parquet_columns(parquet_cols)

    for cols, expected, label in ((parquet_cols, EXPECTED_PARQUET_TYPES, 'Parquet'),
                                  (json_cols, EXPECTED_JSON_TYPES, 'JSON')):
        names = [c.name for c in cols]
        assert list(expected) == names, f'{label}: expected types list {list(expected)}, not {names}'

    print(f"Parquet: {len(parquet_cols)} columns; JSON: {len(json_cols)} columns")

    export_parquet(parquet_cols, PARQUET_PATH)
    export_json(json_cols, JSON_PATH)
    export_manifest(parquet_cols, json_cols, MANIFEST_PATH)

    print("\nDataset generation complete!")
    for path in (PARQUET_PATH, JSON_PATH, MANIFEST_PATH):
        print(f"  {os.path.relpath(path, SCRIPT_DIR)}: {os.path.getsize(path):,} bytes, "
              f"sha256 {sha256(path)}")


if __name__ == '__main__':
    main()
