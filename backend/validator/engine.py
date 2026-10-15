"""课程计划校验器：逐门课审查 + 学分浪费计数。

判定口径（诚实版，unknown 不判死）：
- transferable=True：至少在一所目标校的协议中有 articulation
- denied=True：在某校协议里被明确拒绝承认 → 白修实锤（wasted，confidence=high）
- transferable="unknown"：协议里找不到该课 → 可能是 GE 课，不判死，
  记 wasted=True/confidence=low（存疑），提示对照 Cal-GETC 清单核实
- satisfies：列出该课满足的目标要求；And 组缺同伴时 complete=False
  并给出 missing_partners（还需修哪几门才算满足）

纯规则匹配，不调用 LLM。复用 comparator.engine 的数据加载与匹配工具。
"""
from comparator.engine import load_reports, _find_report, _norm_code, _parse_group

# 学期制：全日制一学期约 15 semester 学分；转学基准 60 学分
UNITS_PER_TERM = 15


def _parse_units(text) -> float | None:
    """解析 "4.0" 这类学分字符串；解析不出返回 None（记 unknown）。"""
    if text is None:
        return None
    try:
        v = float(str(text).strip())
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _index_by_cc_code(mappings: list[dict]) -> dict[str, list[dict]]:
    """按归一化 CC 课程代码建索引：code -> [mapping, ...]。"""
    idx: dict[str, list[dict]] = {}
    for m in mappings or []:
        code = _norm_code(m.get("cc_code"))
        if code:
            idx.setdefault(code, []).append(m)
    return idx


def _articulation_groups(mappings: list[dict]) -> dict[str, list[dict]]:
    """把 articulated 行按 (target_code) 分组，保留组号/组内连接词/课程代码。

    返回 {target_code: [{group, conj, codes:[...], title}]}
    """
    groups: dict[str, list[dict]] = {}
    for m in mappings:
        if m.get("status") != "articulated" or not m.get("target_code"):
            continue
        gi, conj = _parse_group(m.get("section", ""))
        tcode = m["target_code"]
        bucket = groups.setdefault(tcode, [])
        for g in bucket:
            if g["group"] == gi:
                g["codes"].append(_norm_code(m.get("cc_code")))
                break
        else:
            bucket.append({
                "group": gi,
                "conj": conj,
                "codes": [_norm_code(m.get("cc_code"))],
                "title": m.get("target_title", ""),
            })
    return groups


def _assess_course(code: str, plan_set: set[str],
                   target_reports: list[tuple[str, dict]]) -> dict:
    """审查计划中的一门课（code 已归一化），返回逐门课结论。"""
    satisfies: list[dict] = []
    denied_at: list[dict] = []
    units: float | None = None

    for target_name, report in target_reports:
        mappings = report.get("mappings", []) or []
        idx = _index_by_cc_code(mappings)
        hits = idx.get(code, [])
        for m in hits:
            u = _parse_units(m.get("cc_units"))
            if u is not None and units is None:
                units = u
            if m.get("status") == "denied":
                denied_at.append({
                    "target_name": target_name,
                    "note": m.get("target_title") or "被明确拒绝承认",
                })
        # articulation 满足情况：看该课参与的每个 (目标课程, 组)
        groups = _articulation_groups(mappings)
        for tcode, glist in groups.items():
            for g in glist:
                if code not in g["codes"]:
                    continue
                codes = [c for c in g["codes"] if c]
                if g["conj"].lower() == "or":
                    complete, missing = True, []
                else:  # And：组内课程要全在计划里才算满足
                    missing = [c for c in codes if c not in plan_set]
                    complete = not missing
                satisfies.append({
                    "target_name": target_name,
                    "target_code": tcode,
                    "target_title": g["title"],
                    "complete": complete,
                    "missing_partners": sorted(missing),
                })

    if satisfies:
        transferable = True
    elif denied_at:
        transferable = False
    else:
        transferable = "unknown"

    denied = bool(denied_at)
    if denied and not satisfies:
        wasted, confidence = True, "high"   # 实锤：明确被拒且别处也用不上
    elif denied:
        wasted, confidence = False, None     # 别处能用，不算白修，但标 denied
    elif not satisfies:
        wasted, confidence = True, "low"     # 存疑：协议里找不到，可能是 GE 课
    else:
        wasted, confidence = False, None

    if transferable is True:
        note = "可转学分" + ("；部分要求需补同伴课程" if any(
            not s["complete"] for s in satisfies) else "")
    elif denied:
        note = "白修实锤：被目标校明确拒绝承认"
    else:
        note = "未在专业 articulation 协议中找到——可能是 GE 课程，请对照 Cal-GETC 清单核实"

    return {
        "cc_code": code,
        "transferable": transferable,
        "satisfies": satisfies,
        "wasted": wasted,
        "wasted_confidence": confidence,
        "denied": denied,
        "denied_at": denied_at,
        "units": units,  # None = unknown
        "note": note,
    }


def validate_plan(cc_name: str, target_names: list[str], major_query: str,
                  plan: dict[str, list[str]], reports: list[dict] | None = None) -> dict:
    """校验按学期分的课程计划。

    plan: {"Fall 2026": ["CS A250", "MATH A180"], "Spring 2027": [...]}。
    reports: 可选，测试时注入合成报告；缺省从 data/raw/ 加载。
    """
    if reports is None:
        reports = load_reports()

    # 找每所目标校的报告；找不到的记 no_agreement（未知，不判死）
    target_reports: list[tuple[str, dict]] = []
    no_agreement: list[str] = []
    for t in target_names or []:
        r = _find_report(reports, cc_name, t, major_query)
        if r is None:
            no_agreement.append(t)
        else:
            target_reports.append((t, r))

    # 计划全集（归一化），用于 And 组完整性判定
    plan_set: set[str] = set()
    norm_plan: dict[str, list[str]] = {}
    for term, courses in (plan or {}).items():
        codes = [_norm_code(c) for c in (courses or [])]
        codes = [c for c in codes if c]
        norm_plan[term] = codes
        plan_set.update(codes)

    terms = []
    wasted_high_units = 0.0
    unknown_unit_courses: list[str] = []
    all_verdicts: list[dict] = []
    for term, codes in norm_plan.items():
        tcs = []
        for code in codes:
            v = _assess_course(code, plan_set, target_reports)
            tcs.append(v)
            all_verdicts.append(v)
            if v["wasted"] and v["wasted_confidence"] == "high":
                if v["units"] is not None:
                    wasted_high_units += v["units"]
                else:
                    unknown_unit_courses.append(code)
        terms.append({
            "term": term,
            "courses": tcs,
            "term_wasted_units": round(sum(
                (c["units"] or 0) for c in tcs
                if c["wasted"] and c["wasted_confidence"] == "high"), 1),
        })

    wasted_courses = [v["cc_code"] for v in all_verdicts
                      if v["wasted"] and v["wasted_confidence"] == "high"]
    at_risk_courses = [v["cc_code"] for v in all_verdicts
                       if v["wasted"] and v["wasted_confidence"] == "low"]
    # 未完成的要求：计划里有部分 And 组课程但缺同伴
    incomplete = []
    seen = set()
    for v in all_verdicts:
        for s in v["satisfies"]:
            if not s["complete"]:
                key = (s["target_name"], s["target_code"])
                if key not in seen:
                    seen.add(key)
                    incomplete.append({
                        "target_name": s["target_name"],
                        "target_code": s["target_code"],
                        "target_title": s["target_title"],
                        "missing_partners": s["missing_partners"],
                    })

    extra_terms = round(wasted_high_units / UNITS_PER_TERM, 1)
    return {
        "cc_name": cc_name,
        "major_query": major_query,
        "targets": [t for t, _ in target_reports],
        "no_agreement_targets": no_agreement,
        "terms": terms,
        "summary": {
            "total_courses": len(all_verdicts),
            "transferable_n": sum(1 for v in all_verdicts
                                  if v["transferable"] is True),
            "denied_n": sum(1 for v in all_verdicts if v["denied"]),
            "wasted_courses": wasted_courses,       # 实锤
            "at_risk_courses": at_risk_courses,     # 存疑（可能是 GE）
            "wasted_units": round(wasted_high_units, 1),
            "unknown_unit_courses": unknown_unit_courses,
            "extra_terms_estimate": extra_terms,
            "baseline_note": ("以 60 semester 学分、每学期 15 学分为基准："
                              f"实锤浪费 {round(wasted_high_units, 1)} 学分"
                              f" ≈ 多读 {extra_terms} 学期"),
            "incomplete_requirements": incomplete,
        },
        "note": "基于 ASSIST 公开协议数据，仅供参考，以学校官网为准。"
                "标“存疑”的课程可能是 GE 课，请对照 Cal-GETC 清单核实后再决定是否退课。",
    }
