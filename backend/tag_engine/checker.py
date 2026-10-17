"""TAG 资格检查引擎。

设计原则：
1. 所有判定只走规则引擎（YAML 规则文件），不调用任何 LLM。
2. 规则文件里标为 unknown 的字段一律跳过（status=skip），不判死刑，
   同时记入 unknown_skipped 并给出 warn 提示用户人工核实。
3. TAG 评分是启发式分数（100 起扣），仅供参考，不代表录取概率。
"""

import re

from .loader import load_rule

# 检查项状态
PASS = "pass"  # 通过
FAIL = "fail"  # 不通过（硬伤）
WARN = "warn"  # 警告（需注意 / 信息缺失）
SKIP = "skip"  # 跳过（规则未核实）

_FAIL_PENALTY = 30  # 每个 fail 扣分
_WARN_PENALTY = 8  # 每个 warn 扣分


def _norm(text: str | None) -> str:
    """归一化文本用于模糊匹配：小写，空格/连横线/点转下划线，压缩连续下划线。"""
    if not text:
        return ""
    t = text.strip().lower().replace(" ", "_").replace("-", "_").replace(".", "_")
    return re.sub(r"_+", "_", t)


def _is_unknown(value) -> bool:
    """判断规则值是否为 unknown（字符串形式）。"""
    return isinstance(value, str) and value.strip().lower() == "unknown"


def _make_check(cid: str, label: str, status: str, detail: str) -> dict:
    return {"id": cid, "label": label, "status": status, "detail": detail}


# ---------------------------------------------------------------------------
# GPA 阈值解析
# ---------------------------------------------------------------------------
def _resolve_gpa_threshold(gpa_rule, college: str | None, major: str | None):
    """从 min_gpa / min_gpa_by_major 结构中解析出适用于该学生的 GPA 阈值。

    返回 (threshold: float | None, matched: str | None)。
    找不到或为 unknown 时返回 (None, None)，由调用方记为 skip。
    """
    if isinstance(gpa_rule, (int, float)):
        return float(gpa_rule), "统一要求"
    if not isinstance(gpa_rule, dict):
        return None, None
    college_n, major_n = _norm(college), _norm(major)

    def _pick_fallback(block: dict):
        """在 block 里找 all_majors / all_other_* 这类兜底阈值。"""
        for k, v in block.items():
            if k == "note":
                continue
            if _norm(k).startswith("all_") and isinstance(v, (int, float)):
                return float(v), k
        return None, None

    # 步骤 1：按学院定位
    if college_n:
        for key, val in gpa_rule.items():
            if key == "note":
                continue
            kn = _norm(key)
            if kn == college_n or college_n in kn or kn in college_n:
                if isinstance(val, dict):
                    # 学院下再按专业找精确匹配
                    if major_n:
                        for mk, mv in val.items():
                            if mk == "note":
                                continue
                            if _norm(mk) == major_n and isinstance(mv, (int, float)):
                                return float(mv), f"{key} / {mk}"
                    # 专业没匹配上 → 用学院兜底
                    thr, matched = _pick_fallback(val)
                    if thr is not None:
                        return thr, f"{key} / {matched}"
                    return None, None  # 学院对了但专业无对应规则，不猜
                if isinstance(val, (int, float)):
                    return float(val), key
                return None, None
    # 步骤 1.5：没给学院（或学院没对上）时，在所有学院块里按专业名全局搜索
    # —— 演示表单只让用户填专业不填学院，这是最常见的调用方式
    if major_n:
        for key, val in gpa_rule.items():
            if key == "note" or not isinstance(val, dict):
                continue
            for mk, mv in val.items():
                if mk == "note":
                    continue
                if _norm(mk) == major_n and isinstance(mv, (int, float)):
                    return float(mv), f"{key} / {mk}"
    # 步骤 2：顶层按专业精确匹配（防专业直接写在顶层，如 Merced 的 psychology）
    if major_n:
        for key, val in gpa_rule.items():
            if key == "note":
                continue
            if _norm(key) == major_n and isinstance(val, (int, float)):
                return float(val), key
    # 步骤 3：顶层 all_majors 兜底
    for key, val in gpa_rule.items():
        if key == "note":
            continue
        if _norm(key) == "all_majors" and isinstance(val, (int, float)):
            return float(val), "all_majors"
    return None, None


def _check_gpa(requirements: dict, profile: dict, school_name: str) -> dict:
    gpa_rule = requirements.get("min_gpa", requirements.get("min_gpa_by_major"))
    if gpa_rule is None or _is_unknown(gpa_rule):
        return _make_check("gpa", "GPA 要求", SKIP, "该校 GPA 规则未核实，请查官网。")
    threshold, matched = _resolve_gpa_threshold(
        gpa_rule, profile.get("college"), profile.get("major")
    )
    if threshold is None:
        return _make_check(
            "gpa", "GPA 要求", SKIP,
            "未能从规则中解析出适用于该学院/专业的 GPA 阈值，请人工核对官网。",
        )
    gpa = profile.get("gpa")
    if gpa is None:
        return _make_check("gpa", "GPA 要求", WARN, f"未提供 GPA。规则要求 [{matched}] ≥ {threshold}。")
    try:
        gpa_f = float(gpa)
    except (TypeError, ValueError):
        return _make_check("gpa", "GPA 要求", WARN, f"GPA 格式无法解析。规则要求 [{matched}] ≥ {threshold}。")
    if gpa_f >= threshold:
        return _make_check("gpa", "GPA 要求", PASS, f"你的 GPA {gpa_f} ≥ 要求 {threshold}（[{matched}]）。")
    return _make_check("gpa", "GPA 要求", FAIL, f"你的 GPA {gpa_f} < 要求 {threshold}（[{matched}]），不满足 TAG。")


# ---------------------------------------------------------------------------
# 学分检查
# ---------------------------------------------------------------------------
def _extract_semester_units(text: str) -> float | None:
    """从 '30 semester (45 quarter) units...' 这类文本中提取 semester 学分数。"""
    if not text or _is_unknown(text):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*semester", str(text))
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*quarter", str(text))
    if m:
        return float(m.group(1)) * 2 / 3  # quarter 换算成 semester
    return None


def _check_units(requirements: dict, profile: dict) -> dict:
    text = requirements.get("min_units_at_tag_submission")
    needed = _extract_semester_units(text) if isinstance(text, str) else None
    if needed is None:
        return _make_check("units", "TAG 提交时学分", SKIP, "学分规则文本无法解析，请人工核对官网。")
    units = profile.get("units_completed")
    if units is None:
        return _make_check("units", "TAG 提交时学分", WARN, f"未提供已完成学分。规则要求 TAG 提交时完成 {needed:g} semester 学分。")
    try:
        units_f = float(units)
    except (TypeError, ValueError):
        return _make_check("units", "TAG 提交时学分", WARN, "学分格式无法解析。")
    if units_f >= needed:
        return _make_check("units", "TAG 提交时学分", PASS, f"已完成 {units_f:g} ≥ 要求 {needed:g} semester 学分。")
    return _make_check(
        "units", "TAG 提交时学分", FAIL,
        f"已完成 {units_f:g} < 要求 {needed:g} semester 学分，TAG 提交时学分不够。",
    )


# ---------------------------------------------------------------------------
# 英语 / 数学
# ---------------------------------------------------------------------------
def _split_english_math(requirements: dict):
    """返回 (english_reqs: list, math_reqs: list)。UCSB 把两者合并写在一个键里，单独处理。"""
    english = requirements.get("english") or []
    math = requirements.get("math") or []
    combined = requirements.get("english_and_math") or []
    if not english and not math and combined:
        eng = [s for s in combined if re.search(r"UC-E|english", s, re.I)]
        mat = [s for s in combined if re.search(r"UC-M|math", s, re.I)]
        return eng or combined, mat or combined
    return english, math


def _check_english_math(requirements: dict, profile: dict) -> list[dict]:
    english_reqs, math_reqs = _split_english_math(requirements)
    checks = []
    timing = ""
    if english_reqs:
        timing = "；".join(s.strip() for s in english_reqs if isinstance(s, str))
    done = profile.get("english_done")
    if not english_reqs:
        checks.append(_make_check("english", "英语（UC-E）", SKIP, "该校英语要求未在规则中列出。"))
    elif done is None:
        checks.append(_make_check("english", "英语（UC-E）", WARN, f"未提供已完成门数。要求：{timing}"))
    elif done >= 2:
        checks.append(_make_check("english", "英语（UC-E）", PASS, f"已完成 {done} 门 UC-E。要求：{timing}"))
    elif done == 1:
        checks.append(_make_check("english", "英语（UC-E）", WARN, f"已完成 1 门，还差 1 门。要求：{timing}"))
    else:
        checks.append(_make_check("english", "英语（UC-E）", FAIL, f"未完成英语要求。要求：{timing}"))

    timing_m = ""
    if math_reqs:
        timing_m = "；".join(s.strip() for s in math_reqs if isinstance(s, str))
    mdone = profile.get("math_done")
    if not math_reqs:
        checks.append(_make_check("math", "数学（UC-M）", SKIP, "该校数学要求未在规则中列出。"))
    elif mdone is None:
        checks.append(_make_check("math", "数学（UC-M）", WARN, f"未提供已完成门数。要求：{timing_m}"))
    elif mdone >= 1:
        checks.append(_make_check("math", "数学（UC-M）", PASS, f"已完成 {mdone} 门 UC-M。要求：{timing_m}"))
    else:
        checks.append(_make_check("math", "数学（UC-M）", FAIL, f"未完成数学要求。要求：{timing_m}"))
    return checks


# ---------------------------------------------------------------------------
# 专业排除 / 学士学位 / 其他
# ---------------------------------------------------------------------------
def _iter_excluded_keys(requirements: dict):
    """收集 excluded_majors* 键，拆分为当前周期 / 未来周期。

    带 _additions 后缀的是未来周期（如 fall_2028）的新增排除名单，
    只做前瞻提示，不在当前周期执行。
    """
    current, future = [], []
    for key, val in requirements.items():
        if not key.startswith("excluded_majors"):
            continue
        (future if key.lower().endswith("additions") else current).append((key, val))
    return {"current": current, "future": future}


def _check_excluded_majors(requirements: dict, profile: dict):
    """检查目标专业是否在不可 TAG 名单里。返回 (check, risk_warn|None)。"""
    major_n = _norm(profile.get("major"))
    college_n = _norm(profile.get("college"))
    found_unknown = False
    keys = _iter_excluded_keys(requirements)
    for key, val in keys["current"]:
        if _is_unknown(val) or val is None:
            found_unknown = True
            continue
        entries = val if isinstance(val, list) else [val]
        for entry in entries:
            if not isinstance(entry, str):
                continue
            if entry.strip().lower().startswith("note:"):
                continue
            en = _norm(entry)
            # "all majors in X" 模式：匹配学院则警告（不能 100% 确定，warn）
            if "all_majors_in" in en:
                scope = en.split("all_majors_in", 1)[1].strip("_")
                if college_n and (scope in college_n or college_n in scope):
                    return (
                        _make_check("excluded_major", "专业可 TAG", WARN,
                                    f"你的学院 [{entry}] 整体可能不可 TAG，请到官网核实该专业。"),
                        None,
                    )
                continue
            if major_n and (major_n in en or en in major_n):
                return (
                    _make_check("excluded_major", "专业可 TAG", FAIL,
                                f"专业 [{entry}] 不可 TAG。"),
                    None,
                )
    future_notes = []
    for key, val in keys["future"]:
        entries = val if isinstance(val, list) else [val]
        for entry in entries:
            if not isinstance(entry, str):
                continue
            en = _norm(entry)
            if major_n and (major_n in en or en in major_n):
                future_notes.append(entry)
    future_note = ("注意：未来周期新增排除名单含 [%s]，若延迟申请请重新核实。"
                   % "；".join(future_notes)) if future_notes else None
    if found_unknown:
        risk = "该校不可 TAG 专业名单尚未核实，提交前请到官网确认你的专业可否 TAG。"
        if future_note:
            risk += " " + future_note
        return (
            _make_check("excluded_major", "专业可 TAG", SKIP, "该校不可 TAG 专业名单未核实，请查官网。"),
            risk,
        )
    if not major_n:
        return _make_check("excluded_major", "专业可 TAG", WARN, "未提供目标专业，无法检查排除名单。"), future_note
    detail = "目标专业不在不可 TAG 名单中。" + ((" " + future_note) if future_note else "")
    return _make_check("excluded_major", "专业可 TAG", PASS, detail), None


def _check_bachelor(requirements: dict, profile: dict):
    """有学士学位者不可 TAG（几乎所有学校都有这条）。"""
    if not profile.get("has_bachelor_degree"):
        return None
    blob = " ".join(str(x) for x in (requirements.get("not_eligible") or []))
    if "baccalaureate" in blob.lower() or "bachelor" in blob.lower():
        return _make_check("bachelor", "学士学位", FAIL, "已有学士学位者不可申请 TAG。")
    return _make_check("bachelor", "学士学位", WARN, "你已有学士学位，多数学校 TAG 不接受，请核实该校官网。")


def _check_major_prep(requirements: dict, profile: dict):
    """专业先修完成情况（profile 自报，规则只给文本要求）。"""
    text = requirements.get("major_preparation") or requirements.get("selective_major_preparation")
    done = profile.get("major_prep_done")
    if done is True:
        return _make_check("major_prep", "专业先修", PASS, "自报专业先修已完成。")
    if done is False:
        detail = "自报专业先修未完成，selective 专业要求先修达标。"
        if isinstance(text, str):
            detail += f"规则：{text.strip()}"
        return _make_check("major_prep", "专业先修", WARN, detail)
    return _make_check("major_prep", "专业先修", SKIP, "未提供专业先修完成情况，selective 专业通常要求先修达标。")


def _check_spring_units(requirements: dict, profile: dict):
    """Spring 学期学分上限（多为 19），仅当用户填写了计划学分数才检查。"""
    text = requirements.get("max_spring_units")
    planned = profile.get("spring_units_planned")
    if planned is None or not isinstance(text, str):
        return None
    m = re.search(r"no more than (\d+)", text, re.I)
    if not m:
        return None
    limit = float(m.group(1))
    if float(planned) > limit:
        return _make_check(
            "spring_units", "Spring 学分上限", WARN,
            f"计划 Spring 修 {planned} 学分，超过上限 {limit:g}（超上限可能影响 TAG）。",
        )
    return _make_check("spring_units", "Spring 学分上限", PASS, f"计划 Spring {planned} 学分，未超上限 {limit:g}。")


def _collect_unknowns(requirements: dict) -> list[str]:
    """收集值为 unknown 的字段名。"""
    unknowns = []

    def _walk(obj, prefix=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k == "note":
                    continue
                _walk(v, f"{prefix}{k}.")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                _walk(v, f"{prefix}{i}.")
        elif _is_unknown(obj):
            unknowns.append(prefix.rstrip("."))

    _walk(requirements)
    return unknowns


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def check_eligibility(school: str, profile: dict | None = None, rules_dir=None) -> dict:
    """检查 TAG 资格。

    参数：
        school: 学校 id，如 'uc-riverside'（也接受 'UC Riverside'）。
        profile: 学生档案 dict，字段均为可选：
            gpa / college / major / units_completed /
            english_done / math_done / major_prep_done /
            has_bachelor_degree / spring_units_planned
    返回：
        {school, eligible, score, checks[], risks[], unknown_skipped[], info{}}
    """
    profile = profile or {}
    rule = load_rule(school) if rules_dir is None else _load_from(rules_dir, school)
    requirements = rule.get("requirements", {}) or {}
    school_name = rule.get("school", school)

    checks: list[dict] = []
    risks: list[str] = []

    # 逐项检查
    checks.append(_check_gpa(requirements, profile, school_name))
    checks.append(_check_units(requirements, profile))
    checks.extend(_check_english_math(requirements, profile))
    excl_check, excl_risk = _check_excluded_majors(requirements, profile)
    checks.append(excl_check)
    if excl_risk:
        risks.append(excl_risk)
    b = _check_bachelor(requirements, profile)
    if b:
        checks.append(b)
    checks.append(_check_major_prep(requirements, profile))
    s = _check_spring_units(requirements, profile)
    if s:
        checks.append(s)

    # TAG 专业必须与 UC 申请专业一致
    mm = requirements.get("tag_major_must_match_uc_app_major")
    if mm is True:
        risks.append(f"{school_name} 官方要求：TAG 申请专业必须与 UC 申请专业一致，否则 TAG 作废。")
        checks.append(_make_check(
            "major_match", "专业一致性", WARN,
            "TAG 申请时填报的专业必须和之后 UC 申请的专业一致，否则 TAG 作废。请确保两个申请填同一个专业。",
        ))
    elif _is_unknown(mm):
        checks.append(_make_check(
            "major_match", "专业一致性", WARN,
            "该校是否要求 TAG 专业与 UC 申请专业一致尚未核实，提交前请查官网。",
        ))

    # unknown 字段：跳过 + 汇总提示
    unknown_skipped = _collect_unknowns(requirements)
    if unknown_skipped:
        risks.append(
            f"该校有 {len(unknown_skipped)} 项规则尚未核实（{', '.join(unknown_skipped[:5])}"
            f"{' 等' if len(unknown_skipped) > 5 else ''}），提交前请对照官网。"
        )

    # 评分：fail 每个扣 30，warn 每个扣 8，skip 不扣分
    score = 100
    for c in checks:
        if c["status"] == FAIL:
            score -= _FAIL_PENALTY
        elif c["status"] == WARN:
            score -= _WARN_PENALTY
    score = max(0, min(100, score))

    eligible = not any(c["status"] == FAIL for c in checks)

    info = {
        "tag_window": requirements.get("tag_window"),
        "uc_application": requirements.get("uc_application_window") or requirements.get("uc_application_deadline"),
        "tau_deadline": requirements.get("tau_deadline"),
        "admission_cycle": rule.get("admission_cycle"),
        "source": rule.get("source"),
        "verified_date": rule.get("verified_date"),
    }

    return {
        "school": school_name,
        "school_id": rule.get("_school_id"),
        "eligible": eligible,
        "score": score,
        "checks": checks,
        "risks": risks,
        "unknown_skipped": unknown_skipped,
        "info": info,
        "_disclaimer": "规则引擎判定，仅供参考；unknown 项请人工核对官网，不构成录取保证。",
    }


def _load_from(rules_dir, school):
    """测试用：从指定目录加载规则。"""
    import yaml as _yaml
    from pathlib import Path as _Path
    from .loader import _norm_school as _ns
    sid = _ns(school)
    path = _Path(rules_dir) / f"{sid}.yaml"
    if not path.is_file():
        raise ValueError(f"未找到学校 [{school}] 的 TAG 规则。")
    with open(path, encoding="utf-8") as f:
        data = _yaml.safe_load(f)
    data["_school_id"] = sid
    return data
