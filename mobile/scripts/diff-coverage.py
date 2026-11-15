"""Compare two coverage.json files (previous release vs new) and print what changed.

    git show main:mobile/www/coverage.json > /tmp/coverage-old.json
    python3 mobile/scripts/diff-coverage.py /tmp/coverage-old.json mobile/www/coverage.json

Output is the "diff vs the previous year" that goes into the release PR description
(see UPDATING.md): colleges added/removed, UC majors added/removed, and data-year
changes per UC. Exit code is always 0; read the output.
"""
import json
import sys


def load(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    cols = d["colleges"]
    prog = {}
    for u in d["ucs"]:
        for m in u["majors"]:
            prog[(u["name"], m["name"])] = {y: {cols[i] for i in idx} for y, idx in m["years"].items()}
    return d, prog


def main(a, b):
    da, pa = load(a)
    db, pb = load(b)
    print(f"counts: {da['counts']} -> {db['counts']}")
    print(f"ASSIST pulled: {da['assist_pulled']} -> {db['assist_pulled']}")
    ca, cb = set(da["colleges"]), set(db["colleges"])
    print("colleges added:", sorted(cb - ca) or "none")
    print("colleges removed:", sorted(ca - cb) or "none")
    print("UC majors added:", sorted(set(pb) - set(pa)) or "none")
    print("UC majors removed:", sorted(set(pa) - set(pb)) or "none")
    ya = {u["name"]: u["years"] for u in da["ucs"]}
    yb = {u["name"]: u["years"] for u in db["ucs"]}
    for name in sorted(set(ya) | set(yb)):
        if ya.get(name) != yb.get(name):
            print(f"data years {name}: {ya.get(name)} -> {yb.get(name)}")
    lost = []
    for k in set(pa) & set(pb):
        for y, s in pa[k].items():
            gone = s - pb[k].get(y, set())
            if gone:
                lost.append((k, y, len(gone)))
    print("agreements no longer present (UC, major, year, #colleges):", sorted(lost) or "none")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
