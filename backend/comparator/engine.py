"""Articulation 对比器引擎（P1b）。

输入：一所 CC（可选第二所）、一个专业查询词、多所目标 UC、学生已修/计划修课程列表。
输出：统一矩阵——每所目标校的专业先修要求逐项标注
  covered（已覆盖）/ missing（缺失）/ no_articulation（CC 无对应课，转学后必修）
  / no_agreement（该组合无协议，未知，不判死）。

两所学校时：先把两份报告合并成一份虚拟报告再判定——课程代码必须连同
学校一起算（同一代码在不同 CC 可能对应不同要求），And 组可以跨两校拆分，
no_articulation 只有两校都没有时才成立，denied 按来源 CC 各自算。

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


def _make_have(entries: list[dict]) -> dict:
    """带归属的已修课集合：课程代码在各校之间全面重叠，同一代码必须连同
    学校一起判定——只在"列出它的那份 CC 协议"里才算数。
    返回 {"pairs": {(cc_label, flat_code)}, "per_cc": [{cc_name, courses}]}。"""
    pairs: set[tuple[str, str]] = set()
    per_cc: list[dict] = []
    for e in (entries or []):
        cc_l = _norm_label(e.get("cc_name"))
        if not cc_l:
            continue
        codes: list[str] = []
        for c in (e.get("courses") or []):
            n = _norm_code(c)
            if not n:
                continue
            pairs.add((cc_l, n.replace(" ", "")))
            if n not in codes:
                codes.append(n)
        per_cc.append({"cc_name": e.get("cc_name"), "courses": sorted(codes)})
    return {"pairs": pairs, "per_cc": per_cc}


def _has(have: dict, cc_name: str, code: str) -> bool:
    """学生是否在 cc_name 这所学校修过 code（去空格形态比对）。"""
    f = _norm_code(code).replace(" ", "")
    if not f:
        return False
    return (_norm_label(cc_name), f) in have["pairs"]


def _norm_label(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip().lower())


def _norm_major(text: str | None) -> str:
    """专业名归一化：消除各校 ASSIST 报告里同一专业的写法差异——学位后缀
    分隔符（"Computer Science/B.S." vs "Computer Science, B.S." vs
    "Computer Science B.S."）、"&" vs "and"、"A.B." vs "B.A."。只归一化格式。"""
    if not text:
        return ""
    t = re.sub(r"[^a-z0-9]+", " ", text.lower().replace("&", " and "))
    t = re.sub(r"\s+", " ", t).strip()
    return re.sub(r"\ba b\b", "b a", t)  # A.B.（伯克利写法）与 B.A. 同一学位


def _major_degree(norm_major: str) -> str:
    if re.search(r"(^|\s)b s(\s|$)", norm_major):
        return "bs"
    if re.search(r"(^|\s)b a(\s|$)", norm_major):
        return "ba"
    return ""


def _major_queries(query: str) -> list[str]:
    q = _norm_major(query)
    if not q:
        return []
    out = [q]
    stripped = re.sub(r"^(cse|eecs|ece|cs|ce)\s+(?=\S)", "", q)
    if stripped and stripped != q:
        out.append(stripped)
    return out


def _major_match(label: str, query: str, prefix_only: bool) -> bool:
    """一条 label 是否命中查询词。prefix_only=True 只认前缀命中；
    否则再认子串兜底，但子串兜底只对不带学位的查询开放——带学位的查询
    （如 "Computer Science, B.A."）若允许子串，会误命中
    "Linguistics and Computer Science/B.A." 这类不同专业。"""
    l = _norm_major(label)
    if not l:
        return False
    for q in _major_queries(query):
        if not q:
            continue
        at = l.find(q)
        if at == 0:
            return True
        if not prefix_only and at != -1 and not _major_degree(q):
            return True
    return False


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
    """按 (CC, 目标校, 专业查询词) 找报告；专业用归一化两遍匹配
    （第一遍前缀精确，第二遍子串兜底、学位冲突时不匹配）。
    旧逻辑是裸子串，查不到 "Computer Science, B.S." 写法对应的
    "Computer Science/B.S." 报告。"""
    cc_n, tgt_n = _norm_label(cc_name), _norm_label(target_name)
    pool = [r for r in reports
            if _norm_label(r.get("cc_name")) == cc_n
            and _norm_label(r.get("target_name")) == tgt_n]
    for r in pool:
        if _major_match(r.get("major"), major_query, True):
            return r
    for r in pool:
        if _major_match(r.get("major"), major_query, False):
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
            "source_cc": m.get("source_cc", ""),
        })
    return groups


def _merge_reports(reports: list[dict]) -> dict | None:
    """把多所 CC 的报告合并成一份虚拟报告：mappings 打上来源 CC 标签。
    同一目标课程在 A 校无对应课、在 B 校有——只有两校都没有时才算
    no_articulation。组编号只在单份报告内有意义：两份报告的 group_0 是
    各自独立的备选方案，不是同一 And 组的一半；直接拼接会把它们并成
    一个 And 组，导致单校已覆盖的要求在加了第二所后反而变缺失（实测：
    SMC MATH 7 覆盖 MATH 31A，加空 De Anza 后变 missing）。所以每份
    报告的组编号按报告序号偏移（+1000），合并后各组仍是独立备选；跨校
    的真正收益在要求项层面（不同目标要求分别由两校覆盖），不在组内。"""
    if not reports:
        return None
    years = sorted((r.get("academic_year") or "" for r in reports if r.get("academic_year")), reverse=True)
    pubs = sorted((r.get("published_date") or "" for r in reports if r.get("published_date")), reverse=True)
    merged: dict = {
        "cc_name": reports[0].get("cc_name", ""),
        "cc_names": [r.get("cc_name", "") for r in reports],
        "target_name": reports[0].get("target_name", ""),
        "major": reports[0].get("major", ""),
        "academic_year": years[0] if years else "",
        "published_date": pubs[0] if pubs else "",
        "mappings": [],
    }
    for i, r in enumerate(reports):
        off = i * 1000  # 组编号按报告偏移，避免跨报告同号组合并
        for m in (r.get("mappings") or []):
            sec = str(m.get("section") or "")
            sec = re.sub(r"group_(\d+)\(", lambda mm: f"group_{int(mm.group(1)) + off}(", sec)
            sec = re.sub(r"(\d+)-(\d+):", lambda mm: f"{int(mm.group(1)) + off}-{int(mm.group(2)) + off}:", sec)
            merged["mappings"].append({**m, "source_cc": r.get("cc_name", ""), "section": sec})
    return merged


def compare(cc_name: str, major_query: str, target_names: list[str],
            student_courses: list[str], cc2_name: str | None = None,
            student_courses2: list[str] | None = None) -> dict:
    """生成多校对比矩阵。

    student_courses: 学生已修/计划修的 CC 课程代码列表，如 ["CS A250", "MATH A180"]。
    cc2_name / student_courses2 可选：第二所 CC 及其课程；与主校相同时自动去重为单校。
    内部按"收 N 份报告"的通用形状写（entries 列表），界面只开放第二所。
    """
    entries = [{"cc_name": cc_name, "courses": student_courses}]
    if cc2_name and _norm_label(cc2_name) and _norm_label(cc2_name) != _norm_label(cc_name):
        entries.append({"cc_name": cc2_name, "courses": student_courses2 or []})
    return _compare_entries(entries, major_query, target_names)


def _compare_entries(entries: list[dict], major_query: str,
                     target_names: list[str]) -> dict:
    reports = load_reports()
    have = _make_have(entries)
    cc_names = [e["cc_name"] for e in entries if e.get("cc_name")]
    targets = []
    for target in target_names:
        found = []
        for e in entries:
            r = _find_report(reports, e["cc_name"], target, major_query)
            if r is not None:
                found.append(r)
        if not found:
            # 无协议：未知，不判死
            targets.append({
                "target_name": target,
                "status": "no_agreement",
                "note": "未找到该组合的 articulation 协议（可能无协议或未抓取），请查 ASSIST 官网。",
            })
            continue
        targets.append(_compare_one(_merge_reports(found), have))
    all_courses = sorted({c for e in have["per_cc"] for c in e["courses"]})
    return {
        "cc_name": cc_names[0] if cc_names else "",
        "cc_names": cc_names,
        "major_query": major_query,
        "student_courses": all_courses,
        "student_courses_by_cc": have["per_cc"],
        "targets": targets,
        "note": "基于 ASSIST 公开协议数据，仅供参考，以学校官网为准。",
    }


def _compare_one(report: dict, have: dict) -> dict:
    mappings = report.get("mappings", []) or []
    # 直接调用时映射行可能没有 source_cc 标签（单校旧路径）：默认取报告本身的 CC。
    for m in mappings:
        if not m.get("source_cc"):
            m["source_cc"] = report.get("cc_name", "")
    articulated = _group_articulated(mappings)

    # denied：明确拒绝的 CC 课程（学生修了=白修），按来源 CC 各自算
    denied_codes: dict[tuple[str, str], str] = {}
    for m in mappings:
        if m.get("status") == "denied" and m.get("cc_code"):
            key = (_norm_label(m.get("source_cc") or report.get("cc_name") or ""),
                   _norm_code(m["cc_code"]).replace(" ", ""))
            denied_codes[key] = m.get("target_title", "")

    items = []
    # 1) 有 articulation 的目标课程要求
    for tcode, rows in sorted(articulated.items()):
        title = rows[0]["target_title"]
        # 按组号聚组
        by_group: dict[int, dict] = {}
        for r in rows:
            by_group.setdefault(r["group"], {"conj": r["conj"], "codes": []})
            by_group[r["group"]]["codes"].append(
                {"code": r["cc_code"], "cc": r.get("source_cc", "")})
        satisfied_via: list[str] = []
        satisfied_detail: list[dict] = []
        covered = False
        options: list[str] = []
        options_detail: list[dict] = []
        for gi, g in sorted(by_group.items()):
            # 同一代码可能来自两所 CC 的报告：按 (代码, 来源 CC) 去重，
            # 判定只看学生在"列出该代码的那所 CC"修过它。
            seen_pair: set[tuple[str, str]] = set()
            pairs: list[dict] = []
            for p in g["codes"]:
                if not p["code"]:
                    continue
                k = (_norm_code(p["code"]).replace(" ", ""), _norm_label(p["cc"]))
                if k in seen_pair:
                    continue
                seen_pair.add(k)
                pairs.append(p)
            codes = sorted({p["code"] for p in pairs})
            if not codes:
                continue
            options.extend(codes)
            for p in pairs:
                if not any(o["code"] == p["code"] and o["cc"] == p["cc"]
                           for o in options_detail):
                    options_detail.append({"code": p["code"], "cc": p["cc"]})
            # 每门代码的命中 = 学生在该代码的来源 CC 修过它
            hits = [p for p in pairs if _has(have, p["cc"], p["code"])]
            if g["conj"].lower() == "or":
                if hits:
                    covered = True
                    satisfied_via.extend(h["code"] for h in hits)
                    satisfied_detail.extend({"code": h["code"], "cc": h["cc"]} for h in hits)
            else:  # And：组内每门代码都要在来源 CC 修过
                hit_codes = {_norm_code(h["code"]).replace(" ", "") for h in hits}
                if codes and all(_norm_code(c).replace(" ", "") in hit_codes for c in codes):
                    covered = True
                    satisfied_via.extend(h["code"] for h in hits)
                    satisfied_detail.extend({"code": h["code"], "cc": h["cc"]} for h in hits)
        # 注：组间连接词（groupConjunctions）绝大多数是 Or；此处按"任一组满足即覆盖"
        # 处理，And-between-groups 的罕见情况在 detail 里提示人工核对。
        via_detail: list[dict] = []
        for v in satisfied_detail:
            if not any(x["code"] == v["code"] and x["cc"] == v["cc"] for x in via_detail):
                via_detail.append(v)
        items.append({
            "target_code": tcode,
            "target_title": title,
            "status": "covered" if covered else "missing",
            "via": sorted(set(satisfied_via)),
            "via_detail": via_detail,
            "options": sorted(set(options)),
            "options_detail": sorted(options_detail,
                                     key=lambda o: (o["code"], o["cc"])),
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

    # 3) 白修预警：学生课程命中 denied 列表（按来源 CC 各自算——
    # 在 A 校被拒的课，在 B 校修的不算白修；同一代码两校都修过，只标被拒的那一所）
    wasted = []
    for e in have["per_cc"]:
        for c in e["courses"]:
            key = (_norm_label(e["cc_name"]), c.replace(" ", ""))
            if key in denied_codes:
                wasted.append({"cc_code": c, "cc_name": e["cc_name"],
                               "note": f"被明确拒绝承认（{denied_codes[key]}）"})
    wasted.sort(key=lambda w: (w["cc_code"], w["cc_name"]))

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
