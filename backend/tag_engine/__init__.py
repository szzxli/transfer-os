"""TAG Guard 规则引擎：基于 YAML 规则文件的 TAG 资格检查。"""

from .checker import check_eligibility
from .loader import list_schools, load_rule

__all__ = ["check_eligibility", "list_schools", "load_rule"]
