"""对比器引擎测试：全部用合成数据，不依赖网络和 data/raw。"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from comparator import engine
from comparator.engine import _compare_one, compare


def _mapping(cc, target, status="articulated", section="group_0(And)",
             target_title="Target Course"):
    return {
        "cc_code": cc, "cc_title": "", "cc_units": "",
        "target_code": target, "target_title": target_title,
        "target_units": "", "status": status, "section": section,
    }


def _report(mappings, major="Computer Science, B.A."):
    return {"cc_name": "Test CC", "target_name": "UC Berkeley",
            "major": major, "academic_year": "2026-2027",
            "published_date": "2026-01-01", "mappings": mappings}


def test_covered_when_student_has_course():
    r = _compare_one(_report([_mapping("CS A250", "COMPSCI 61B")]), {"CS A250"})
    assert r["covered"] == 1 and r["coverage_pct"] == 100
    assert r["items"][0]["status"] == "covered"
    assert r["items"][0]["via"] == ["CS A250"]


def test_missing_when_student_lacks_course():
    r = _compare_one(_report([_mapping("CS A250", "COMPSCI 61B")]), {"MATH A180"})
    assert r["items"][0]["status"] == "missing"
    assert r["items"][0]["options"] == ["CS A250"]
    assert len(r["missing"]) == 1


def test_and_group_needs_all_courses():
    mappings = [
        _mapping("CS A250", "COMPSCI 61B", section="group_0(And)"),
        _mapping("CS A200", "COMPSCI 61B", section="group_0(And)"),
    ]
    r = _compare_one(_report(mappings), {"CS A250"})
    assert r["items"][0]["status"] == "missing"  # 只修一门不够
    r = _compare_one(_report(mappings), {"CS A250", "CS A200"})
    assert r["items"][0]["status"] == "covered"  # 两门都修才覆盖


def test_or_group_needs_any_course():
    mappings = [
        _mapping("MATH A180", "MATH 1A", section="group_0(Or)"),
        _mapping("MATH A185", "MATH 1A", section="group_0(Or)"),
    ]
    r = _compare_one(_report(mappings), {"MATH A185"})
    assert r["items"][0]["status"] == "covered"


def test_no_articulation_means_take_after_transfer():
    r = _compare_one(
        _report([_mapping("", "COMPSCI 70", status="no_articulation",
                          section="noArticulationReason: must be taken...")]),
        {"CS A250"})
    assert r["items"][0]["status"] == "no_articulation"
    assert len(r["must_take_after_transfer"]) == 1


def test_denied_course_flags_wasted():
    r = _compare_one(
        _report([_mapping("CS A999", "COMPSCI 61B", status="denied",
                          section="deniedCourses")]),
        {"CS A999"})
    assert len(r["wasted"]) == 1
    assert r["wasted"][0]["cc_code"] == "CS A999"


def test_course_code_case_insensitive(monkeypatch):
    monkeypatch.setattr(
        engine, "load_reports",
        lambda: [_report([_mapping("CS A250", "COMPSCI 61B")])])
    out = compare("Test CC", "computer science", ["UC Berkeley"], ["cs a250"])
    assert out["targets"][0]["items"][0]["status"] == "covered"


def test_no_agreement_is_unknown_not_fail(monkeypatch):
    monkeypatch.setattr(engine, "load_reports", lambda: [])
    out = compare("Test CC", "Computer Science", ["UCLA"], ["CS A250"])
    assert out["targets"][0]["status"] == "no_agreement"


def test_compare_multi_target_matrix(monkeypatch):
    rep_b = _report([_mapping("CS A250", "COMPSCI 61B")])
    rep_b["target_name"] = "UC Berkeley"
    rep_s = _report([_mapping("CS 31", "COMPSCI 32")])
    rep_s["target_name"] = "UC San Diego"
    monkeypatch.setattr(engine, "load_reports", lambda: [rep_b, rep_s])
    out = compare("Test CC", "computer science",
                  ["UC Berkeley", "UC San Diego"], ["CS A250"])
    assert len(out["targets"]) == 2
    assert out["targets"][0]["covered"] == 1   # UCB 覆盖
    assert out["targets"][1]["covered"] == 0   # UCSD 缺失
    assert out["targets"][1]["missing"][0]["options"] == ["CS 31"]
