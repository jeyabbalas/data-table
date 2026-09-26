"""Summarize spike results (results/*.json) as Markdown tables on stdout."""

import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
QUERIES = [
    "firstBlock",
    "midBlock",
    "sortedFirstBlock",
    "sortedMidBlock",
    "keyedSortedMidBlock",
    "filterCount",
    "histogram",
    "filteredHistogram",
    "valueCounts",
    "filteredValueCounts",
]


def load():
    out = []
    for path in sorted(glob.glob(os.path.join(HERE, "results", "*.json"))):
        with open(path) as f:
            r = json.load(f)
        r["_name"] = os.path.basename(path)[: -len(".json")]
        out.append(r)
    return out


def fmt_s(ms):
    return "—" if ms is None else f"{ms / 1000:.1f}"


def error_of(r):
    if r.get("ok"):
        return ""
    msg = (r.get("error") or "").split("\n")[0]
    return f"{r.get('failedAt', '?')}: {msg[:90]}"


def main():
    results = load()
    print("| Case | File MiB | Rows | Peak wasm MiB | After register | Load s | DuckDB MiB | Result |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
    for r in results:
        w = r.get("wasmMiB") or {}
        load_t = (r.get("timings") or {}).get("load", {})
        print(
            f"| {r['_name']} | {(r.get('file') or {}).get('mib', '—')} | {r.get('rows', '—')} "
            f"| {w.get('end', '—')} | {w.get('afterRegister', '—')} | {fmt_s(load_t.get('ms'))} "
            f"| {(r.get('duckdbMiB') or {}).get('total', '—')} | {'OK' if r.get('ok') else error_of(r)} |"
        )
    print()
    print("Interaction latency (ms):")
    print()
    print("| Case | " + " | ".join(QUERIES) + " |")
    print("| --- |" + " ---: |" * len(QUERIES))
    for r in results:
        t = r.get("timings") or {}
        if "firstBlock" not in t:
            continue
        cells = [
            "—" if q not in t else ("OOM" if "Out of Memory" in t[q].get("error", "") else "err")
            if q not in t or "error" in t[q]
            else str(t[q]["ms"])
            for q in QUERIES
        ]
        print(f"| {r['_name']} | " + " | ".join(cells) + " |")


if __name__ == "__main__":
    main()
