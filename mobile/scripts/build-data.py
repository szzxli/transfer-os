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


def write_artic_gz(out_dir: Path, artic: list, chunk_kb: int = 100) -> tuple:
    """articulation 数据打包：紧凑 JSON -> gzip -> base64，切 N 块（每块 <= chunk_kb KB，
    避开推送工具单参数 128KB 限制）。
    输出 artic-gz-{1..N}.js（var ARTIC_GZ=... / ARTIC_GZ+=...）+ artic-boot.js（解压引导）。
    HTML 里按顺序引用；app 初始化需等 window.ARTIC_READY。
    旧的 artic-data*.js / artic-gz-*.js 如存在则删除。"""
    import gzip as _gzip, base64 as _b64

    def _default(o):
        if hasattr(o, "isoformat"):
            return o.isoformat()
        return str(o)

    for old in sorted(out_dir.glob("artic-data*.js")) + sorted(out_dir.glob("artic-gz-*.js")):
        old.unlink()
    raw = json.dumps(artic, ensure_ascii=False, separators=(",", ":"), default=_default).encode("utf-8")
    b64 = _b64.b64encode(_gzip.compress(raw, mtime=0)).decode()
    chunk = chunk_kb * 1024
    parts = [b64[i:i + chunk] for i in range(0, len(b64), chunk)]
    names = []
    for i, part in enumerate(parts, 1):
        body = ("var ARTIC_GZ=\"%s\";\n" if i == 1 else "ARTIC_GZ+=\"%s\";\n") % part
        (out_dir / f"artic-gz-{i}.js").write_text(
            "// 自动生成：mobile/scripts/build-data.py，请勿手改。\n" + body,
            encoding="utf-8")
        names.append(f"artic-gz-{i}.js")
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
    return names + ["artic-boot.js"], len(raw), len(b64)


def build_ge_data() -> dict:
    """20 所 CC 的 Cal-GETC 课程清单：{cc: {course_code: [areas]}}。"""
    data = {}
    for path in sorted(RAW_DIR.glob("calgetc_*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        r = payload.get("report") or {}
        cc = r.get("cc", "")
        if not cc or not r.get("courses"):
            continue
        idx = {}
        for c in r["courses"]:
            code = (c.get("code") or "").strip().upper()
            areas = [a for a in (c.get("areas") or []) if a]
            if code and areas:
                idx[code] = areas
        if idx:
            data[cc] = idx
    return data


def build_admit_data() -> dict:
    """UCLA Transfer Profile by Major（Fall 2025 + impacted 标记）。"""
    path = RAW_DIR / "ucla_admit_2025.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    r = payload.get("report") or {}
    majors = []
    for m in r.get("majors") or []:
        majors.append({
            "n": m.get("name", ""),
            "k": m.get("key", ""),
            "a": m.get("applicants"),
            "r": m.get("admit_rate"),
            "g1": m.get("gpa25"),
            "g2": m.get("gpa75"),
            "imp": bool(m.get("impacted")),
        })
    return {
        "campus": r.get("campus", "UCLA"),
        "cycle": r.get("cycle", ""),
        "source": r.get("source", ""),
        "majors": majors,
    }


def write_gz_bundle(out_dir: Path, base: str, var_name: str,
                    ready_name: str, data_name: str, data) -> tuple:
    """通用 gzip+base64 打包：小数据单文件，大数据切 2 块。
    输出 {base}-gz-1.js（var VAR=...）[+ {base}-gz-2.js（VAR+=...）]
    + {base}-boot.js（解压 -> DATA，Promise READY）。"""
    import gzip as _gzip, base64 as _b64

    def _default(o):
        if hasattr(o, "isoformat"):
            return o.isoformat()
        return str(o)

    for old in sorted(out_dir.glob(f"{base}-gz-*.js")) + \
            sorted(out_dir.glob(f"{base}-data*.js")):
        old.unlink()
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"),
                     default=_default).encode("utf-8")
    b64 = _b64.b64encode(_gzip.compress(raw, mtime=0)).decode()
    names = []
    if len(b64) < 400000:
        (out_dir / f"{base}-gz-1.js").write_text(
            "// 自动生成：mobile/scripts/build-data.py，请勿手改。\n"
            "var %s=\"%s\";\n" % (var_name, b64), encoding="utf-8")
        names.append(f"{base}-gz-1.js")
    else:
        half = (len(b64) + 1) // 2
        (out_dir / f"{base}-gz-1.js").write_text(
            "// 自动生成：mobile/scripts/build-data.py，请勿手改。\n"
            "var %s=\"%s\";\n" % (var_name, b64[:half]), encoding="utf-8")
        (out_dir / f"{base}-gz-2.js").write_text(
            "%s+=\"%s\";\n" % (var_name, b64[half:]), encoding="utf-8")
        names += [f"{base}-gz-1.js", f"{base}-gz-2.js"]
    (out_dir / f"{base}-boot.js").write_text(
        "/* 自动生成：mobile/scripts/build-data.py，请勿手改。\n"
        "   解压 %s(gzip+base64) -> %s。*/\n"
        "var %s = {};\n"
        "var %s = (function () {\n"
        "  function fail(e) { try { console.error(\"[%s] data load failed\", e); } catch (_) {} }\n"
        "  try {\n"
        "    if (typeof DecompressionStream === \"undefined\") throw new Error(\"no DecompressionStream\");\n"
        "    var bin = Uint8Array.from(atob(%s), function (c) { return c.charCodeAt(0); });\n"
        "    var stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream(\"gzip\"));\n"
        "    return new Response(stream).text().then(function (t) {\n"
        "      %s = JSON.parse(t);\n"
        "    }).catch(fail);\n"
        "  } catch (e) { fail(e); return Promise.resolve(); }\n"
        "})();\n" % (var_name, data_name, data_name, ready_name, base,
                     var_name, data_name),
        encoding="utf-8")
    names.append(f"{base}-boot.js")
    return names, len(raw), len(b64)


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
    ge = build_ge_data()
    if ge:
        gnames, graw, gb64 = write_gz_bundle(OUT_JS, "ge", "GE_GZ",
                                             "GE_READY", "GE_DATA", ge)
        n_cc = len(ge)
        n_pair = sum(len(v) for v in ge.values())
        print(f"GE: {n_cc} 所 CC, {n_pair} 门课 -> raw {graw/1024:.1f} KB, "
              f"gz+b64 {gb64/1024:.1f} KB: {', '.join(gnames)}")
    admit = build_admit_data()
    if admit.get("majors"):
        anames, araw, ab64 = write_gz_bundle(OUT_JS, "admit", "ADMIT_GZ",
                                             "ADMIT_READY", "ADMIT_DATA", admit)
        print(f"录取: {admit['campus']} {admit['cycle']}, "
              f"{len(admit['majors'])} 个专业 -> raw {araw/1024:.1f} KB, "
              f"gz+b64 {ab64/1024:.1f} KB: {', '.join(anames)}")


if __name__ == "__main__":
    main()
