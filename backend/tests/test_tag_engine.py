"""TAG 规则引擎测试：覆盖 Riverside（字段最全）与 unknown 字段场景。"""

import pytest

from tag_engine import check_eligibility, list_schools, load_rule


def riverside_profile(**overrides):
    """Riverside BCOE 计算机科学，一个基本合格的档案。"""
    p = {
        "gpa": 3.7,
        "college": "bourns_college_of_engineering",
        "major": "computer_science",
        "units_completed": 32,
        "english_done": 2,
        "math_done": 1,
        "major_prep_done": True,
    }
    p.update(overrides)
    return p


def get_check(result, cid):
    for c in result["checks"]:
        if c["id"] == cid:
            return c
    raise AssertionError(f"找不到检查项 {cid}")


# ---------------- 学校与加载 ----------------

def test_list_schools_has_six():
    schools = list_schools()
    assert len(schools) == 6
    assert "uc-riverside" in schools
    assert "uc-davis" in schools


def test_unknown_school_raises():
    with pytest.raises(ValueError):
        check_eligibility("uc-nowhere", {})


def test_school_name_variants():
    r1 = check_eligibility("uc-riverside", riverside_profile())
    r2 = check_eligibility("UC Riverside", riverside_profile())
    assert r1["eligible"] == r2["eligible"] == True


# ---------------- Riverside：字段最全 ----------------

def test_riverside_eligible():
    r = check_eligibility("uc-riverside", riverside_profile())
    assert r["eligible"] is True
    assert get_check(r, "gpa")["status"] == "pass"  # CS 要求 3.6，3.7 通过
    assert get_check(r, "units")["status"] == "pass"
    assert get_check(r, "english")["status"] == "pass"
    assert get_check(r, "math")["status"] == "pass"
    assert get_check(r, "excluded_major")["status"] == "pass"
    # TAG 专业必须与 UC 申请专业一致 → 风险提示
    assert any("必须与 UC 申请专业一致" in x for x in r["risks"])
    assert 0 <= r["score"] <= 100


def test_riverside_gpa_below_threshold_fails():
    r = check_eligibility("uc-riverside", riverside_profile(gpa=3.5))
    assert get_check(r, "gpa")["status"] == "fail"  # CS 要求 3.6
    assert r["eligible"] is False


def test_riverside_gpa_uses_college_fallback():
    # CHASS 非心理/戏剧专业 → 兜底 2.8
    p = riverside_profile(
        gpa=2.9,
        college="college_of_humanities_arts_and_social_sciences",
        major="history",
    )
    r = check_eligibility("uc-riverside", p)
    assert get_check(r, "gpa")["status"] == "pass"


def test_riverside_excluded_major_fails():
    r = check_eligibility("uc-riverside", riverside_profile(major="Art Studio"))
    assert get_check(r, "excluded_major")["status"] == "fail"
    assert r["eligible"] is False


def test_riverside_units_below_30_fails():
    r = check_eligibility("uc-riverside", riverside_profile(units_completed=24))
    assert get_check(r, "units")["status"] == "fail"
    assert r["eligible"] is False


def test_bachelor_degree_fails():
    r = check_eligibility("uc-riverside", riverside_profile(has_bachelor_degree=True))
    assert get_check(r, "bachelor")["status"] == "fail"
    assert r["eligible"] is False


def test_english_none_done_fails():
    r = check_eligibility("uc-riverside", riverside_profile(english_done=0))
    assert get_check(r, "english")["status"] == "fail"


def test_english_one_done_warns():
    r = check_eligibility("uc-riverside", riverside_profile(english_done=1))
    assert get_check(r, "english")["status"] == "warn"
    assert r["eligible"] is True  # warn 不阻断资格


# ---------------- unknown 字段场景 ----------------

def test_davis_unknown_major_match_skipped():
    # Davis 的 tag_major_must_match_uc_app_major 为 unknown → 跳过并提示
    p = {
        "gpa": 3.6,
        "college": "college_of_engineering",
        "major": "mechanical_engineering",
        "units_completed": 32,
        "english_done": 2,
        "math_done": 1,
    }
    r = check_eligibility("uc-davis", p)
    assert "tag_major_must_match_uc_app_major" in r["unknown_skipped"]
    mm = get_check(r, "major_match")
    assert mm["status"] == "warn"
    assert "尚未核实" in mm["detail"]
    # unknown 不判死刑：其他项通过则整体仍 eligible
    assert r["eligible"] is True


def test_santa_cruz_unknown_excluded_majors_skipped():
    # Santa Cruz 的 excluded_majors 为 unknown → skip，不判 fail
    p = {
        "gpa": 3.2,
        "major": "computer_science",
        "units_completed": 35,
        "english_done": 2,
        "math_done": 1,
    }
    r = check_eligibility("uc-santa-cruz", p)
    assert get_check(r, "excluded_major")["status"] == "skip"
    assert r["eligible"] is True
    assert any("不可 TAG 专业名单尚未核实" in x for x in r["risks"])


def test_irvine_excluded_majors_multi_keys():
    # Irvine 有 excluded_majors_fall_2027 / _fall_2028_additions 两个键，都要检查
    r = check_eligibility(
        "uc-irvine",
        {"gpa": 3.8, "major": "Business Administration",
         "units_completed": 40, "english_done": 2, "math_done": 1},
    )
    assert get_check(r, "excluded_major")["status"] == "fail"


def test_missing_gpa_warns_not_fails():
    r = check_eligibility("uc-riverside", riverside_profile(gpa=None))
    assert get_check(r, "gpa")["status"] == "warn"
    # 其他项通过时整体仍 eligible（缺信息≠硬伤）
    assert r["eligible"] is True


# ---------------- 评分与边界 ----------------

def test_score_clamped_zero():
    r = check_eligibility(
        "uc-riverside",
        {"gpa": 1.0, "college": "bourns_college_of_engineering",
         "major": "Art Studio", "units_completed": 0,
         "english_done": 0, "math_done": 0, "has_bachelor_degree": True},
    )
    assert r["score"] == 0
    assert r["eligible"] is False


def test_result_shape():
    r = check_eligibility("uc-merced", {"gpa": 3.0})
    assert set(["school", "eligible", "score", "checks", "risks",
                "unknown_skipped", "info"]) <= set(r.keys())
    assert r["info"]["source"].startswith("http")
    assert r["info"]["verified_date"]


def test_spring_units_over_limit_warns():
    r = check_eligibility(
        "uc-davis",
        {"gpa": 3.6, "college": "college_of_letters_and_science",
         "major": "economics", "units_completed": 40,
         "english_done": 2, "math_done": 1, "spring_units_planned": 21},
    )
    assert get_check(r, "spring_units")["status"] == "warn"
