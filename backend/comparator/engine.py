"""Articulation 对比器引擎（P1b）。

输入：一所 CC、一个专业查询词、多所目标 UC、学生已修/计划修课程列表。
输出：统一矩阵——每所目标校的专业先修要求逐项标注
  covered（已覆盖）/ missing（缺失）/ no_articulation（CC 无对应课，转学后必修）
  / no_agreement（该组合无协议，未知，不判死）。

数据：data/raw/assist_*.json（batch_fetch.py 抓取，gitignored）。
判定逻辑：纯规则匹配，不调用 LLM。
"""
import json
import re
from pathlib import Path

DATA_RAW = Path(__file__).resolve().parent.parent.parent / "data" / "raw"


def _norm_code(code: str | None) -> str:
    """课程代码归一化：'cs a250' -> 'CS A250'。"""
    if not code:
        return ""
    return re.sub(r"\s+", " ", code.strip().upper())


def _norm_label(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip().lower())


def _parse_group(section: str) -> tuple[int, str]:
    """从 section 'group_0(And)...' 解析出 (组号, 组内连接词)。"""
    m = re.search(r"group_(\d+)\((\w+)\)", section or "")
    if m:
        return int(m.group(1)), m.group(2)
    return 0, "And"


# ---------------------------------------------------------------------------
# 数据加载
# ---------------------------------------------------------------------------

def load_reports() -> list[dict]:
    """加载 data/raw 下所有抓取的报告（跳过 batch_fetch_log.json）。"""
    reports = []
    if not DATA_RAW.exists():
        return reports
    for path in sorted(DATA_RAW.glob("assist_*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        report = payload.get("report") or {}
        if report.get("mappings"):
            reports.append(report)
    return reports


def list_options() -> dict:
    """给演示页下拉框：可用的 CC -> 目标校 -> 专业 label 列表。"""
    by_cc: dict[str, dict[str, list[str]]] = {}
    for r in load_reports():
        cc = r.get("cc_name", "")
        target = r.get("target_name", "")
        major = r.get("major", "")
        by_cc.setdefault(cc, {}).setdefault(target, [])
        if major not in by_cc[cc][target]:
            by_cc[cc][target].append(major)
    return {"ccs": sorted(by_cc), "by_cc": by_cc}


def _find_report(reports: list[dict], cc_name: str,
                 target_name: str, major_query: str) -> dict | None:
    """按 (CC, 目标校, 专业查询词) 找报告；专业用归一化包含匹配。"""
    q = _norm_label(major_query)
    cc_n, tgt_n = _norm_label(cc_name), _norm_label(target_name)
    for r in reports:
        if (_norm_label(r.get("cc_name")) == cc_n
                and _norm_label(r.get("target_name")) == tgt_n
                and q in _norm_label(r.get("major"))):
            return r
    return None


# ---------------------------------------------------------------------------
# 对比
# ---------------------------------------------------------------------------

def _group_articulated(mappings: list[dict]) -> dict[str, list[dict]]:
    """把 articulated 行按 target_code 分组，每组是若干课程组。"""
    groups: dict[str, list[dict]] = {}
    for m in mappings:
        if m.get("status") != "articulated" or not m.get("target_code"):
            continue
        gi, conj = _parse_group(m.get("section", ""))
        groups.setdefault(m["target_code"], []).append({
            "group": gi,
            "conj": conj,
            "cc_code": _norm_code(m.get("cc_code")),
            "cc_title": m.get("cc_title", ""),
            "target_title": m.get("target_title", ""),
        })
    return groups


def compare(cc_name: str, major_query: str, target_names: list[str],
            student_courses: list[str]) -> dict:
    """生成多校对比矩阵。

    student_courses: 学生已修/计划修的 CC 课程代码列表，如 ["CS A250", "MATH A180"]。
    """
    reports = load_reports()
    have = {_norm_code(c) for c in student_courses if _norm_code(c)}
    targets = []
    for target in target_names:
        report = _find_report(reports, cc_name, target, major_query)
        if report is None:
            # 无协议：未知，不判死
            targets.append({
                "target_name": target,
                "status": "no_agreement",
                "note": "未找到该组合的 articulation 协议（可能无协议或未抓取），请查 ASSIST 官网。",
            })
            continue
        t = _compare_one(report, have)
        targets.append(t)
    return {
        "cc_name": cc_name,
        "major_query": major_query,
        "student_courses": sorted(have),
        "targets": targets,
        "note": "基于 ASSIST 公开协议数据，仅供参考，以学校官网为准。",
    }


def _compare_one(report: dict, have: set[str]) -> dict:
    mappings = report.get("mappings", []) or []
    articulated = _group_articulated(mappings)

    # denied：明确拒绝的 CC 课程（学生修了=白修）
    denied_codes: dict[str, str] = {}
    for m in mappings:
        if m.get("status") == "denied" and m.get("cc_code"):
            denied_codes[_norm_code(m["cc_code"])] = m.get("target_title", "")

    items = []
    # 1) 有 articulation 的目标课程要求
    for tcode, rows in sorted(articulated.items()):
        title = rows[0]["target_title"]
        # 按组号聚组
        by_group: dict[int, dict] = {}
        for r in rows:
            by_group.setdefault(r["group"], {"conj": r["conj"], "codes": []})
            by_group[r["group"]]["codes"].append(r["cc_code"])
        satisfied_via: list[str] = []
        covered = False
        options: list[str] = []
        for gi, g in sorted(by_group.items()):
            codes = [c for c in g["codes"] if c]
            options.extend(codes)
            if g["conj"].lower() == "or":
                hit = [c for c in codes if c in have]
                if hit:
                    covered = True
                    satisfied_via.extend(hit)
            else:  # And：组内课程要全修
                if codes and all(c in have for c in codes):
                    covered = True
                    satisfied_via.extend(codes)
        # 注：组间连接词（groupConjunctions）绝大多数是 Or；此处按"任一组满足即覆盖"
        # 处理，And-between-groups 的罕见情况在 detail 里提示人工核对。
        items.append({
            "target_code": tcode,
            "target_title": title,
            "status": "covered" if covered else "missing",
            "via": sorted(set(satisfied_via)),
            "options": sorted(set(options)),
            "detail": ("已覆盖" if covered
                       else f"缺失：需修 {', '.join(sorted(set(options)))}"),
        })

    # 2) 明确无 articulation 的目标课程：只能转学后修
    seen_noart = set()
    for m in mappings:
        if m.get("status") == "no_articulation" and m.get("target_code"):
            tcode = m["target_code"]
            if tcode in seen_noart or tcode in articulated:
                continue
            seen_noart.add(tcode)
            items.append({
                "target_code": tcode,
                "target_title": m.get("target_title", ""),
                "status": "no_articulation",
                "via": [],
                "options": [],
                "detail": "该 CC 无对应课程，需转学后在目标校修读。",
            })

    # 3) 白修预警：学生课程命中 denied 列表
    wasted = [{"cc_code": c, "note": f"被明确拒绝承认（{denied_codes[c]}）"}
              for c in sorted(have & set(denied_codes))]

    covered_n = sum(1 for i in items if i["status"] == "covered")
    missing = [i for i in items if i["status"] == "missing"]
    return {
        "target_name": report.get("target_name", ""),
        "major_label": report.get("major", ""),
        "academic_year": report.get("academic_year", ""),
        "published_date": report.get("published_date", ""),
        "status": "ok",
        "total_requirements": len(items),
        "covered": covered_n,
        "coverage_pct": round(covered_n / len(items) * 100) if items else 0,
        "items": items,
        "missing": [{"target_code": i["target_code"],
                     "target_title": i["target_title"],
                     "options": i["options"]} for i in missing],
        "must_take_after_transfer": [
            {"target_code": i["target_code"], "target_title": i["target_title"]}
            for i in items if i["status"] == "no_articulation"],
        "wasted": wasted,
    }
