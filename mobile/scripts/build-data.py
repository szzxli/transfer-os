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
        # 紧凑映射：只保留对比器/校验器需要的字段（cu=cc_units，供浪费计数器用）
        mappings = []
        for m in r["mappings"]:
            mappings.append({
                "cc": m.get("cc_code") or "",
                "cc_t": m.get("cc_title") or "",
                "cu": m.get("cc_units") or "",
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


def write_artic_shards(out_dir: Path, artic: list, per_shard: int = 40) -> list:
    """按报告数分片写 artic-data-N.js（单片过大时推送/加载更友好）。
    第1片: var ARTIC_DATA=[...]; 后续片: ARTIC_DATA.push(...[...]);
    返回片文件名列表。旧的 artic-data.js 如存在则删除。"""
    for old in sorted(out_dir.glob("artic-data-*.js")) + [out_dir / "artic-data.js"]:
        if old.exists():
            old.unlink()
    shards = [artic[i:i + per_shard] for i in range(0, len(artic), per_shard)]

    def _default(o):
        if hasattr(o, "isoformat"):
            return o.isoformat()
        return str(o)

    names = []
    for idx, part in enumerate(shards, start=1):
        name = f"artic-data-{idx}.js"
        body = json.dumps(part, ensure_ascii=False, separators=(",", ":"), default=_default)
        if idx == 1:
            js = f"// 自动生成：mobile/scripts/build-data.py，请勿手改。\nvar ARTIC_DATA={body};\n"
        else:
            js = f"// 自动生成：mobile/scripts/build-data.py，请勿手改。\nARTIC_DATA.push(...{body});\n"
        (out_dir / name).write_text(js, encoding="utf-8")
        names.append(name)
    return names


def main():
    OUT_JS.mkdir(parents=True, exist_ok=True)
    tag = build_tag_data()
    artic = build_artic_data()
    n1 = write_js_module(OUT_JS / "tag-data.js", "TAG_DATA", tag)
    shards = write_artic_shards(OUT_JS, artic)
    total_kb = sum((OUT_JS / s).stat().st_size for s in shards) / 1024
    print(f"TAG 学校: {len(tag)} -> tag-data.js {n1/1024:.1f} KB")
    print(f"报告: {len(artic)} 份, mappings: {sum(len(r['mappings']) for r in artic)} "
          f"-> {len(shards)} 个分片共 {total_kb:.1f} KB: {', '.join(shards)}")
    print("HTML 引用: " + "".join(f'\n<script src="js/{s}"></script>' for s in shards))


if __name__ == "__main__":
    main()
