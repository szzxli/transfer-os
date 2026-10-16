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


def write_artic_gz(out_dir: Path, artic: list) -> tuple:
    """articulation 数据打包：紧凑 JSON -> gzip -> base64，切 2 块。
    输出 artic-gz-1.js / artic-gz-2.js（var ARTIC_GZ=...）+ artic-boot.js（解压引导）。
    HTML 里按顺序引用三件套；app 初始化需等 window.ARTIC_READY。
    旧的 artic-data*.js 如存在则删除。"""
    import gzip as _gzip, base64 as _b64

    def _default(o):
        if hasattr(o, "isoformat"):
            return o.isoformat()
        return str(o)

    for old in sorted(out_dir.glob("artic-data*.js")):
        old.unlink()
    raw = json.dumps(artic, ensure_ascii=False, separators=(",", ":"), default=_default).encode("utf-8")
    b64 = _b64.b64encode(_gzip.compress(raw, mtime=0)).decode()
    half = (len(b64) + 1) // 2
    (out_dir / "artic-gz-1.js").write_text(
        "// 自动生成：mobile/scripts/build-data.py，请勿手改。\nvar ARTIC_GZ=\"%s\";\n" % b64[:half],
        encoding="utf-8")
    (out_dir / "artic-gz-2.js").write_text(
        "// 自动生成：mobile/scripts/build-data.py，请勿手改。\nARTIC_GZ+=\"%s\";\n" % b64[half:],
        encoding="utf-8")
    (out_dir / "artic-boot.js").write_text(
        "/* Articulation 数据引导：解压 ARTIC_GZ(gzip+base64) -> ARTIC_DATA。\n"
        "   自动生成流程见 mobile/scripts/build-data.py。*/\n"
        "var ARTIC_DATA = [];\n"
        "var ARTIC_READY = (function () {\n"
        "  function fail(e) { try { console.error(\"[artic] data load failed\", e); } catch (_) {} }\n"
        "  try {\n"
        "    if (typeof DecompressionStream === \"undefined\") throw new Error(\"no DecompressionStream\");\n"
        "    var bin = Uint8Array.from(atob(ARTIC_GZ), function (c) { return c.charCodeAt(0); });\n"
        "    var stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream(\"gzip\"));\n"
        "    return new Response(stream).text().then(function (t) {\n"
        "      ARTIC_DATA = JSON.parse(t);\n"
        "    }).catch(fail);\n"
        "  } catch (e) { fail(e); return Promise.resolve(); }\n"
        "})();\n",
        encoding="utf-8")
    return ["artic-gz-1.js", "artic-gz-2.js", "artic-boot.js"], len(raw), len(b64)


def main():
    OUT_JS.mkdir(parents=True, exist_ok=True)
    tag = build_tag_data()
    artic = build_artic_data()
    n1 = write_js_module(OUT_JS / "tag-data.js", "TAG_DATA", tag)
    names, raw_len, b64_len = write_artic_gz(OUT_JS, artic)
    print(f"TAG 学校: {len(tag)} -> tag-data.js {n1/1024:.1f} KB")
    print(f"报告: {len(artic)} 份, mappings: {sum(len(r['mappings']) for r in artic)} "
          f"-> raw {raw_len/1048576:.2f} MB, gz+b64 {b64_len/1024:.1f} KB: {', '.join(names)}")
    print("HTML 引用: " + "".join(f'\n<script src="js/{s}"></script>' for s in names))


if __name__ == "__main__":
    main()
