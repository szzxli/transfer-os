"""TAG 规则加载器：从 rules/2026-27/tag/*.yaml 读取各校规则。"""

from pathlib import Path

import yaml

# 规则目录：backend/tag_engine/../../rules/2026-27/tag
RULES_DIR = Path(__file__).resolve().parent.parent.parent / "rules" / "2026-27" / "tag"


def _norm_school(school: str) -> str:
    """归一化学校标识：'UC Riverside' / 'riverside' / 'uc-riverside' → 'uc-riverside'。"""
    s = school.strip().lower().replace(" ", "-").replace("_", "-")
    if not s.startswith("uc-"):
        s = "uc-" + s
    return s


def list_schools() -> list[str]:
    """返回所有有规则文件的学校 id（不含扩展名），排序后返回。"""
    if not RULES_DIR.is_dir():
        return []
    return sorted(p.stem for p in RULES_DIR.glob("uc-*.yaml"))


def load_rule(school: str) -> dict:
    """加载指定学校的 TAG 规则。找不到时抛 ValueError。"""
    sid = _norm_school(school)
    path = RULES_DIR / f"{sid}.yaml"
    if not path.is_file():
        available = ", ".join(list_schools()) or "（无）"
        raise ValueError(f"未找到学校 [{school}] 的 TAG 规则。可用学校：{available}")
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    data["_school_id"] = sid
    return data
