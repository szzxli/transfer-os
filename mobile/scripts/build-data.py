"""构建 mobile/www 的静态数据包。

输入：
  rules/2026-27/tag/uc-*.yaml   6 所 UC 的 TAG 规则
  data/raw/assist_*.json         25 份 articulation 报告
输出：
  mobile/www/js/tag-data.js      TAG_DATA = {school_id: rule}
  mobile/www/js/artic-data.js    ARTIC_DATA = [report, ...]（紧凑格式）
"""
import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
TAG_DIR = ROOT / "rules" / "2026-27" / "tag"
RAW_DIR = ROOT / "data" / "raw"
OUT_JS = ROOT / "mobile" / "www" / "js"


def norm_school(school: str) -> str:
    s = school.strip().lower().replace(" ", "-").replace("_", "-")
    if not s.startswith("uc-"):
        s = "uc-" + s
    return s


def build_tag_data() -> dict:
    data = {}
    for path in sorted(TAG_DIR.glob("uc-*.yaml")):
        sid = path.stem
        with open(path, encoding="utf-8") as f:
            rule = yaml.safe_load(f)
        rule["_school_id"] = sid
        data[sid] = rule
    return data


def build_artic_data() -> list:
    reports = []
    for path in sorted(RAW_DIR.glob("assist_*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        r = payload.get("report") or {}
        if not r.get("mappings"):
            continue
        # 紧凑映射：只保留对比器需要的字段
        mappings = []
        for m in r["mappings"]:
            mappings.append({
                "cc": m.get("cc_code") or "",
                "cc_t": m.get("cc_title") or "",
                "tc": m.get("target_code") or "",
                "tt": m.get("target_title") or "",
                "st": m.get("status") or "",
                "sec": m.get("section") or "",
            })
        reports.append({
            "cc": r.get("cc_name", ""),
            "target": r.get("target_name", ""),
            "major": r.get("major", ""),
            "year": r.get("academic_year", ""),
            "published": r.get("published_date", ""),
            "mappings": mappings,
        })
    return reports


def write_js_module(path: Path, var_name: str, data) -> int:
    def _default(o):
        if hasattr(o, "isoformat"):
            return o.isoformat()
        return str(o)
    js = f"// 自动生成：mobile/scripts/build-data.py，请勿手改。\n"
    js += f"var {var_name} = {json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=_default)};\n"
    path.write_text(js, encoding="utf-8")
    return len(js)


def main():
    OUT_JS.mkdir(parents=True, exist_ok=True)
    tag = build_tag_data()
    artic = build_artic_data()
    n1 = write_js_module(OUT_JS / "tag-data.js", "TAG_DATA", tag)
    n2 = write_js_module(OUT_JS / "artic-data.js", "ARTIC_DATA", artic)
    print(f"TAG 学校: {len(tag)} -> tag-data.js {n1/1024:.1f} KB")
    print(f"报告: {len(artic)} 份, mappings: {sum(len(r['mappings']) for r in artic)} "
          f"-> artic-data.js {n2/1024:.1f} KB")


if __name__ == "__main__":
    main()
