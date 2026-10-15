"""课程计划校验器测试（P1c）。

合成报告覆盖 denied / And 组等真实数据里没有的分支；
真实数据做集成验证。
"""
import pytest

from validator import validate_plan
from comparator.engine import load_reports


# ---------------------------------------------------------------------------
# 合成报告：覆盖 denied / And 组缺同伴 / 学分加总等分支
# ---------------------------------------------------------------------------

def _syn_reports():
    """一所假 CC -> 假 UC 的合成报告。"""
    return [{
        "cc_name": "Test College",
        "target_name": "Test UC",
        "major": "Computer Science, B.S.",
        "academic_year": "2026-2027",
        "mappings": [
            # And 组：CS 101 + CS 102 -> CS 10（缺一门不算满足）
            {"cc_code": "CS 101", "cc_title": "Intro CS", "cc_units": "4.0",
             "target_code": "CS 10", "target_title": "Intro",
             "status": "articulated", "section": "group_0(And)"},
            {"cc_code": "CS 102", "cc_title": "Data Struct", "cc_units": "4.0",
             "target_code": "CS 10", "target_title": "Intro",
             "status": "articulated", "section": "group_0(And)"},
            # Or 组：MATH 1 任一门 -> MATH 20
            {"cc_code": "MATH 1A", "cc_title": "Calc I", "cc_units": "5.0",
             "target_code": "MATH 20", "target_title": "Calculus",
             "status": "articulated", "section": "group_0(Or)"},
            # denied：明确拒绝
            {"cc_code": "BAD 99", "cc_title": "Useless", "cc_units": "3.0",
             "target_code": "", "target_title": "Not accepted",
             "status": "denied", "section": "deniedCourses"},
            {"cc_code": "BAD 88", "cc_title": "Useless 2", "cc_units": "2.0",
             "target_code": "", "target_title": "Not accepted",
             "status": "denied", "section": "deniedCourses"},
            # 学分缺失的 denied：units 记 unknown
            {"cc_code": "BAD 77", "cc_title": "Useless 3", "cc_units": "",
             "target_code": "", "target_title": "Not accepted",
             "status": "denied", "section": "deniedCourses"},
        ],
    }]


def _get(reports, code):
    r = validate_plan("Test College", ["Test UC"], "computer science",
                      {"Fall 2026": [code]}, reports=reports)
    return r["terms"][0]["courses"][0]


def test_denied_flagged_wasted_high():
    """denied 命中 → wasted 实锤，confidence=high。"""
    v = _get(_syn_reports(), "BAD 99")
    assert v["denied"] is True
    assert v["wasted"] is True
    assert v["wasted_confidence"] == "high"
    assert v["transferable"] is False


def test_wasted_units_sum():
    """浪费学分加总：3.0 + 2.0 = 5.0；学分缺失的记 unknown。"""
    r = validate_plan("Test College", ["Test UC"], "computer science",
                      {"Fall 2026": ["BAD 99", "BAD 88", "BAD 77"]},
                      reports=_syn_reports())
    s = r["summary"]
    assert s["wasted_units"] == 5.0
    assert s["unknown_unit_courses"] == ["BAD 77"]
    assert s["extra_terms_estimate"] == round(5.0 / 15, 1)


def test_and_group_missing_partner():
    """And 组缺一门：satisfies complete=False，missing_partners 指出同伴。"""
    v = _get(_syn_reports(), "CS 101")
    assert v["transferable"] is True
    assert v["wasted"] is False
    s = v["satisfies"][0]
    assert s["complete"] is False
    assert s["missing_partners"] == ["CS 102"]
    # 补上同伴后 complete
    r = validate_plan("Test College", ["Test UC"], "computer science",
                      {"Fall 2026": ["CS 101", "CS 102"]},
                      reports=_syn_reports())
    v2 = r["terms"][0]["courses"][0]
    assert v2["satisfies"][0]["complete"] is True


def test_unknown_not_condemned():
    """协议里找不到的课：unknown，不判 wasted 死刑（可能是 GE）。"""
    v = _get(_syn_reports(), "ENGL 1A")
    assert v["transferable"] == "unknown"
    assert v["denied"] is False
    # 存疑：wasted=True 但 confidence=low，提示核对 GE
    assert v["wasted"] is True
    assert v["wasted_confidence"] == "low"
    assert "GE" in v["note"] or "Cal-GETC" in v["note"]


def test_extra_terms_estimate():
    """30 实锤浪费学分 ≈ 多读 2.0 学期（60 学分基准，每学期 15）。"""
    reps = _syn_reports()
    reps[0]["mappings"] = [
        {"cc_code": f"BAD {i}", "cc_title": "X", "cc_units": "3.0",
         "target_code": "", "target_title": "No",
         "status": "denied", "section": "deniedCourses"}
        for i in range(10)
    ]
    r = validate_plan("Test College", ["Test UC"], "computer science",
                      {"Fall 2026": [f"BAD {i}" for i in range(10)]},
                      reports=reps)
    assert r["summary"]["wasted_units"] == 30.0
    assert r["summary"]["extra_terms_estimate"] == 2.0


def test_or_group_single_suffices():
    """Or 组修一门就算满足。"""
    v = _get(_syn_reports(), "MATH 1A")
    assert v["satisfies"][0]["complete"] is True
    assert v["wasted"] is False


# ---------------------------------------------------------------------------
# 真实数据集成
# ---------------------------------------------------------------------------

def test_real_data_occ_cs():
    """OCC 计划：CS A250+CS A200 满足 61B；MATH A180 转 MATH 51。"""
    reports = load_reports()
    assert reports, "data/raw 下没有报告，集成测试跳过"
    r = validate_plan(
        "Orange Coast College", ["UC Berkeley"], "computer science",
        {"Fall 2026": ["CS A250", "CS A200", "MATH A180",
                       "ENGL A100"]},  # ENGL A100 不在协议里 -> 存疑
        reports=reports)
    by_code = {c["cc_code"]: c for c in r["terms"][0]["courses"]}
    v250 = by_code["CS A250"]
    assert v250["transferable"] is True
    assert any(s["target_code"] == "COMPSCI 61B" and s["complete"]
               for s in v250["satisfies"])
    assert by_code["MATH A180"]["transferable"] is True
    engl = by_code["ENGL A100"]
    assert engl["transferable"] == "unknown"
    assert engl["wasted_confidence"] == "low"
    # ENGL 不在协议里，学分未知，不进实锤浪费
    assert r["summary"]["wasted_units"] == 0
    assert r["summary"]["at_risk_courses"] == ["ENGL A100"]


def test_no_agreement_target():
    """无协议目标校：记 no_agreement，不判死。"""
    reports = load_reports()
    r = validate_plan("Orange Coast College", ["UCLA"], "computer science",
                      {"Fall 2026": ["CS A250"]}, reports=reports)
    assert r["no_agreement_targets"] == ["UCLA"]
    v = r["terms"][0]["courses"][0]
    assert v["transferable"] == "unknown"
