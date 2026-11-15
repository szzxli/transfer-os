"""Build mobile/www/coverage.json: the public coverage lists (colleges, UC majors, data years).

Everything in the output is read from the shipped articulation shards
(mobile/www/js/artic-gz-*.js), i.e. the same data the tools load. Nothing is typed by hand.
Re-run after every data refresh (see UPDATING.md):

    python3 mobile/scripts/build-coverage.py            # writes mobile/www/coverage.json
    python3 mobile/scripts/build-coverage.py --check    # exit 1 if coverage.json is stale

The ucplan.org site keeps a synced copy (ucplan repo: scripts/sync_coverage.py).
"""
import base64
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
JS = ROOT / "mobile" / "www" / "js"
OUT = ROOT / "mobile" / "www" / "coverage.json"


def load_reports():
    shards = sorted(JS.glob("artic-gz-*.js"), key=lambda p: int(re.search(r"(\d+)", p.stem).group(1)))
    b64 = ""
    for p in shards:
        m = re.search(r'ARTIC_GZ\s*\+?=\s*"([^"]*)"', p.read_text(encoding="utf-8"))
        b64 += m.group(1)
    reports = json.loads(gzip.decompress(base64.b64decode(b64)))
    return reports, hashlib.sha256(b64.encode()).hexdigest()[:16], [p.name for p in shards]


def build():
    reports, digest, shards = load_reports()
    colleges = sorted({r["cc"] for r in reports})
    idx = {c: i for i, c in enumerate(colleges)}
    ucs = {}
    for r in reports:
        uc = ucs.setdefault(r["target"], {})
        major = uc.setdefault(r["major"], {})
        major.setdefault(r["year"], set()).add(idx[r["cc"]])
    boot = (JS / "artic-boot.js").read_text(encoding="utf-8")
    fetched = re.search(r'fetched:\s*"([^"]+)"', boot).group(1)
    out_ucs = []
    for name in sorted(ucs):
        majors = []
        for m in sorted(ucs[name]):
            years = {y: sorted(s) for y, s in sorted(ucs[name][m].items())}
            majors.append({"name": m, "years": years})
        years_all = sorted({y for m in ucs[name].values() for y in m})
        out_ucs.append({
            "name": name,
            "years": years_all,
            "colleges_by_year": {y: len({c for m in ucs[name].values() for c in m.get(y, ())}) for y in years_all},
            "majors": majors,
        })
    return {
        "source": "ASSIST public articulation agreements (assist.org)",
        "assist_pulled": fetched,
        "data_digest": digest,
        "shards": len(shards),
        "counts": {
            "colleges": len(colleges),
            "ucs": len(out_ucs),
            "uc_majors": sum(len(u["majors"]) for u in out_ucs),
            "reports": len(reports),
        },
        "colleges": colleges,
        "ucs": out_ucs,
    }


def main():
    data = build()
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print("coverage.json is stale: run mobile/scripts/build-coverage.py")
            sys.exit(1)
        print("coverage.json is up to date")
        return
    OUT.write_text(text, encoding="utf-8")
    c = data["counts"]
    print(f"coverage.json: {c['colleges']} colleges, {c['ucs']} UCs, {c['uc_majors']} UC majors, "
          f"{c['reports']} reports ({len(text)/1024:.1f} KB)")
    for u in data["ucs"]:
        print(f"  {u['name']}: {len(u['majors'])} majors, years {u['colleges_by_year']}")


if __name__ == "__main__":
    main()
