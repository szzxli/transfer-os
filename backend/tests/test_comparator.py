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


def _report(mappings, major="Computer Science, B.A.",
            cc_name="Test CC", target_name="UC Berkeley"):
    return {"cc_name": cc_name, "target_name": target_name,
            "major": major, "academic_year": "2026-2027",
            "published_date": "2026-01-01", "mappings": mappings}


def _have(courses, cc="Test CC"):
    """带归属的已修课集合（单校）：_compare_one 的新 have 形态。"""
    return engine._make_have([{"cc_name": cc, "courses": list(courses)}])


def test_covered_when_student_has_course():
    r = _compare_one(_report([_mapping("CS A250", "COMPSCI 61B")]), _have({"CS A250"}))
    assert r["covered"] == 1 and r["coverage_pct"] == 100
    assert r["items"][0]["status"] == "covered"
    assert r["items"][0]["via"] == ["CS A250"]


def test_missing_when_student_lacks_course():
    r = _compare_one(_report([_mapping("CS A250", "COMPSCI 61B")]), _have({"MATH A180"}))
    assert r["items"][0]["status"] == "missing"
    assert r["items"][0]["options"] == ["CS A250"]
    assert len(r["missing"]) == 1


def test_and_group_needs_all_courses():
    mappings = [
        _mapping("CS A250", "COMPSCI 61B", section="group_0(And)"),
        _mapping("CS A200", "COMPSCI 61B", section="group_0(And)"),
    ]
    r = _compare_one(_report(mappings), _have({"CS A250"}))
    assert r["items"][0]["status"] == "missing"  # 只修一门不够
    r = _compare_one(_report(mappings), _have({"CS A250", "CS A200"}))
    assert r["items"][0]["status"] == "covered"  # 两门都修才覆盖


def test_or_group_needs_any_course():
    mappings = [
        _mapping("MATH A180", "MATH 1A", section="group_0(Or)"),
        _mapping("MATH A185", "MATH 1A", section="group_0(Or)"),
    ]
    r = _compare_one(_report(mappings), _have({"MATH A185"}))
    assert r["items"][0]["status"] == "covered"


def test_no_articulation_means_take_after_transfer():
    r = _compare_one(
        _report([_mapping("", "COMPSCI 70", status="no_articulation",
                          section="noArticulationReason: must be taken...")]),
        _have({"CS A250"}))
    assert r["items"][0]["status"] == "no_articulation"
    assert len(r["must_take_after_transfer"]) == 1


def test_denied_course_flags_wasted():
    r = _compare_one(
        _report([_mapping("CS A999", "COMPSCI 61B", status="denied",
                          section="deniedCourses")]),
        _have({"CS A999"}))
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


def test_find_report_major_separator_variants(monkeypatch):
    """专业写法差异必须命中同一份报告（SMC -> UCLA CS 的线上故障：
    数据 label 是 "Computer Science/B.S."，用户按 ASSIST 写法
    "Computer Science, B.S." / "Computer Science B.S." 查必须命中）。"""
    rep = _report([_mapping("CS 31", "COMPSCI 31")], major="Computer Science/B.S.")
    rep["target_name"] = "UCLA"
    monkeypatch.setattr(engine, "load_reports", lambda: [rep])
    for q in ("computer science", "Computer Science, B.S.",
              "Computer Science B.S.", "CSE: Computer Science B.S."):
        out = compare("Test CC", q, ["UCLA"], ["CS 31"])
        assert out["targets"][0]["status"] == "ok", q
        assert out["targets"][0]["major_label"] == "Computer Science/B.S."


def test_find_report_degree_mismatch_no_match(monkeypatch):
    """学位冲突不匹配：B.A. 查询不应命中 B.S. 报告。"""
    rep = _report([_mapping("CS 31", "COMPSCI 31")], major="Computer Science/B.S.")
    rep["target_name"] = "UCLA"
    monkeypatch.setattr(engine, "load_reports", lambda: [rep])
    out = compare("Test CC", "Computer Science, B.A.", ["UCLA"], ["CS 31"])
    assert out["targets"][0]["status"] == "no_agreement"


def test_find_report_ab_ba_same_degree(monkeypatch):
    """A.B.（伯克利写法）与 B.A. 是同一学位，必须互相命中。"""
    rep = _report([_mapping("ECON 1", "ECON 1")], major="Economics A.B.")
    rep["target_name"] = "UC Berkeley"
    monkeypatch.setattr(engine, "load_reports", lambda: [rep])
    out = compare("Test CC", "Economics, B.A.", ["UC Berkeley"], ["ECON 1"])
    assert out["targets"][0]["status"] == "ok"


def test_find_report_empty_query_no_match(monkeypatch):
    """空查询词不命中任何报告（旧逻辑里 "".includes 恒真，会误命中首条）。"""
    rep = _report([_mapping("CS 31", "COMPSCI 31")], major="Computer Science/B.S.")
    rep["target_name"] = "UCLA"
    monkeypatch.setattr(engine, "load_reports", lambda: [rep])
    out = compare("Test CC", "", ["UCLA"], ["CS 31"])
    assert out["targets"][0]["status"] == "no_agreement"


def test_find_report_degree_query_no_substring_fallback(monkeypatch):
    """带学位的查询不走子串兜底："Computer Science, B.A." 不应命中
    "Linguistics and Computer Science/B.A."（不同专业，只因名字里含 CS）。"""
    rep = _report([_mapping("LING 1", "LING 1")],
                  major="Linguistics and Computer Science/B.A.")
    rep["target_name"] = "UCLA"
    monkeypatch.setattr(engine, "load_reports", lambda: [rep])
    out = compare("Test CC", "Computer Science, B.A.", ["UCLA"], ["LING 1"])
    assert out["targets"][0]["status"] == "no_agreement"


# ---------------------------------------------------------------------------
# 第二所社区学院（#104 v1）：两份报告合并判定
# ---------------------------------------------------------------------------

def _smc_ucla(mappings):
    return _report(mappings, major="Computer Science/B.S.",
                   cc_name="Santa Monica College", target_name="UCLA")


def _deanza_ucla(mappings):
    return _report(mappings, major="Computer Science/B.S.",
                   cc_name="De Anza College", target_name="UCLA")


def test_two_cc_and_group_split_across_colleges(monkeypatch):
    """§5.1 用例 1（已修正）：跨校覆盖发生在要求项层面——MATH 31A 只在 SMC
    有对应课、MATH 31B 只在 De Anza 有对应课，两校各修一门后两项都覆盖；
    只跑一所时另一项缺失。另：组编号只在单份报告内有意义，两份报告的
    group_0 是独立备选、合并时按报告偏移（+1000），所以单校已覆盖的项
    在加了第二所（即使第二所没课）后仍覆盖，不回归。"""
    monkeypatch.setattr(engine, "load_reports", lambda: [
        _smc_ucla([_mapping("MATH 1A", "MATH 31A", section="group_0(And)")]),
        _deanza_ucla([_mapping("MATH 1B", "MATH 31B", section="group_0(And)")]),
    ])
    out = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                  ["MATH 1A"], "De Anza College", ["MATH 1B"])
    items = {i["target_code"]: i for i in out["targets"][0]["items"]}
    assert items["MATH 31A"]["status"] == "covered"
    assert items["MATH 31B"]["status"] == "covered"
    out1 = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                   ["MATH 1A"], "De Anza College", [])
    items1 = {i["target_code"]: i for i in out1["targets"][0]["items"]}
    assert items1["MATH 31A"]["status"] == "covered"  # 加空第二所不回归
    assert items1["MATH 31B"]["status"] == "missing"


def test_two_cc_same_group_index_is_alternative_not_and(monkeypatch):
    """组编号跨报告不合并：同一目标在两校各有一个 group_0 单码备选
    （SMC MATH 7、De Anza MATH 1A 都对应 MATH 31A），任一所修过即覆盖；
    绝不能要求两门都修。"""
    monkeypatch.setattr(engine, "load_reports", lambda: [
        _smc_ucla([_mapping("MATH 7", "MATH 31A", section="group_0(And)")]),
        _deanza_ucla([_mapping("MATH 1A", "MATH 31A", section="group_0(Or)")]),
    ])
    out = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                  ["MATH 7"], "De Anza College", [])
    assert out["targets"][0]["items"][0]["status"] == "covered"
    out2 = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                   [], "De Anza College", ["MATH 1A"])
    assert out2["targets"][0]["items"][0]["status"] == "covered"


def test_two_cc_same_code_wrong_college_does_not_cover(monkeypatch):
    """§5.1 用例 2：同码不同校——MATH 1A 只在 De Anza 修过，SMC 报告里也有
    MATH 1A 映射，SMC 那份要求不能被误判覆盖；缺失项的 options_detail
    只列出真正开这门课的学校。"""
    monkeypatch.setattr(engine, "load_reports", lambda: [
        _smc_ucla([_mapping("MATH 1A", "MATH 31A")]),
        _deanza_ucla([_mapping("MATH 1B", "MATH 31B")]),
    ])
    out = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                  [], "De Anza College", ["MATH 1A"])
    items = {i["target_code"]: i for i in out["targets"][0]["items"]}
    assert items["MATH 31A"]["status"] == "missing"
    assert items["MATH 31A"]["via"] == []
    assert items["MATH 31A"]["options_detail"] == [
        {"code": "MATH 1A", "cc": "Santa Monica College"}]


def test_two_cc_denied_is_per_college(monkeypatch):
    """§5.1 用例 3：denied 按校算——某课在 SMC 被拒、在 De Anza 可用，
    在 De Anza 修的不算白修；在 SMC 修的算白修，且要求仍缺失。"""
    monkeypatch.setattr(engine, "load_reports", lambda: [
        _smc_ucla([_mapping("MATH 1A", "MATH 31A", status="denied",
                            section="deniedCourses")]),
        _deanza_ucla([_mapping("MATH 1A", "MATH 31A")]),
    ])
    out_ok = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                     [], "De Anza College", ["MATH 1A"])
    assert out_ok["targets"][0]["items"][0]["status"] == "covered"
    assert out_ok["targets"][0]["wasted"] == []
    out_bad = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                      ["MATH 1A"], "De Anza College", [])
    assert out_bad["targets"][0]["items"][0]["status"] == "missing"
    assert len(out_bad["targets"][0]["wasted"]) == 1
    assert out_bad["targets"][0]["wasted"][0]["cc_code"] == "MATH 1A"
    assert out_bad["targets"][0]["wasted"][0]["cc_name"] == "Santa Monica College"


def test_two_cc_no_articulation_only_when_both_lack(monkeypatch):
    """§5.1 用例 4：no_articulation 合并——某 UC 课在 SMC 无对应、在 De Anza 有，
    不进「转学后必修」；两所都没有时才进。"""
    monkeypatch.setattr(engine, "load_reports", lambda: [
        _smc_ucla([_mapping("", "COMPSCI 70", status="no_articulation",
                            section="noArticulationReason: x")]),
        _deanza_ucla([_mapping("CS 1A", "COMPSCI 70")]),
    ])
    out = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                  [], "De Anza College", ["CS 1A"])
    assert out["targets"][0]["items"][0]["status"] == "covered"
    assert out["targets"][0]["must_take_after_transfer"] == []
    monkeypatch.setattr(engine, "load_reports", lambda: [
        _smc_ucla([_mapping("", "COMPSCI 70", status="no_articulation",
                            section="noArticulationReason: x")]),
        _deanza_ucla([_mapping("", "COMPSCI 70", status="no_articulation",
                               section="noArticulationReason: x")]),
    ])
    out2 = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                   [], "De Anza College", [])
    assert out2["targets"][0]["items"][0]["status"] == "no_articulation"
    assert len(out2["targets"][0]["must_take_after_transfer"]) == 1


def test_two_cc_both_no_agreement_is_unknown(monkeypatch):
    """§5.1 用例 5：两校都无协议——诚实显示无协议，不判死。"""
    monkeypatch.setattr(engine, "load_reports", lambda: [
        _smc_ucla([_mapping("MATH 1A", "MATH 31A")]),
        _deanza_ucla([_mapping("MATH 1B", "MATH 31B")]),
    ])
    out = compare("Santa Monica College", "Computer Science/B.S.", ["UC Davis"],
                  ["MATH 1A"], "De Anza College", ["MATH 1B"])
    assert out["targets"][0]["status"] == "no_agreement"


def test_two_cc_same_as_home_dedupes(monkeypatch):
    """§5.1 用例 6：第二所 = 主校——自动去重为单校，不产生幻影覆盖。"""
    monkeypatch.setattr(engine, "load_reports", lambda: [
        _smc_ucla([_mapping("MATH 1A", "MATH 31A")]),
    ])
    out = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                  ["MATH 1A"], "Santa Monica College", ["MATH 1B"])
    assert out["cc_names"] == ["Santa Monica College"]
    assert out["student_courses"] == ["MATH 1A"]
    assert out["targets"][0]["items"][0]["status"] == "covered"


def test_two_cc_same_course_both_colleges_counts_once(monkeypatch):
    """§6 问题 4：同一门课两校都修过——覆盖只算一次，via 里列出两所学校。"""
    monkeypatch.setattr(engine, "load_reports", lambda: [
        _smc_ucla([_mapping("MATH 1A", "MATH 31A")]),
        _deanza_ucla([_mapping("MATH 1A", "MATH 31A")]),
    ])
    out = compare("Santa Monica College", "Computer Science/B.S.", ["UCLA"],
                  ["MATH 1A"], "De Anza College", ["MATH 1A"])
    item = out["targets"][0]["items"][0]
    assert item["status"] == "covered"
    assert item["via"] == ["MATH 1A"]  # 只算一次
    assert item["via_detail"] == [
        {"code": "MATH 1A", "cc": "Santa Monica College"},
        {"code": "MATH 1A", "cc": "De Anza College"}]
