"""TAG Guard 最小 Web 演示：FastAPI 服务。

运行：
    cd backend && .venv/bin/uvicorn demo.app:app --reload --port 8000
打开 http://localhost:8000
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from tag_engine import check_eligibility, list_schools
from comparator import compare as compare_articulation
from comparator import list_options as compare_options

app = FastAPI(title="Transfer OS 演示", version="0.2.0")


class Profile(BaseModel):
    """学生档案，所有字段可选；缺失字段会产生 warn 而非 fail。"""

    gpa: float | None = Field(default=None, description="UC-transferable GPA")
    college: str | None = Field(default=None, description="学院，如 bourns_college_of_engineering")
    major: str | None = Field(default=None, description="目标专业，如 computer_science")
    units_completed: float | None = Field(default=None, description="已完成 semester 学分")
    english_done: int | None = Field(default=None, description="已完成 UC-E 门数")
    math_done: int | None = Field(default=None, description="已完成 UC-M 门数")
    major_prep_done: bool | None = Field(default=None, description="专业先修是否完成")
    has_bachelor_degree: bool = Field(default=False, description="是否已有学士学位")
    spring_units_planned: float | None = Field(default=None, description="计划 Spring 学分")


class TagCheckRequest(BaseModel):
    school: str = Field(description="学校 id，如 uc-riverside")
    profile: Profile = Field(default_factory=Profile)


@app.get("/api/schools")
def api_schools():
    """返回可用学校列表（给前端下拉框）。"""
    return {"schools": list_schools()}


@app.post("/api/tag-check")
def api_tag_check(req: TagCheckRequest):
    """TAG 资格检查：纯规则引擎判定，不调用 LLM。"""
    try:
        return check_eligibility(req.school, req.profile.model_dump())
    except ValueError as e:
        return {"error": str(e)}


@app.get("/", response_class=HTMLResponse)
def index():
    html_path = Path(__file__).parent / "static" / "index.html"
    return html_path.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Articulation 对比器（P1b）
# ---------------------------------------------------------------------------

class CompareRequest(BaseModel):
    """对比请求：CC + 专业查询词 + 多所目标校 + 学生课程列表。"""
    cc_name: str = Field(description="社区大学，如 Orange Coast College")
    major_query: str = Field(default="computer science",
                             description="专业查询词，如 computer science")
    targets: list[str] = Field(default_factory=list,
                               description="目标校列表，如 ['UC Berkeley', 'UC San Diego']")
    courses: list[str] = Field(default_factory=list,
                               description="已修/计划修课程代码，如 ['CS A250', 'MATH A180']")


@app.get("/api/compare-options")
def api_compare_options():
    """返回对比器可用的 CC/目标校/专业选项（来自已抓取的报告）。"""
    return compare_options()


@app.post("/api/compare")
def api_compare(req: CompareRequest):
    """多校 articulation 对比：纯规则匹配，不调用 LLM。"""
    try:
        return compare_articulation(req.cc_name, req.major_query,
                                    req.targets, req.courses)
    except Exception as e:  # noqa: BLE001 -- 演示服务，错误直接返回
        return {"error": str(e)}


@app.get("/compare", response_class=HTMLResponse)
def compare_page():
    html_path = Path(__file__).parent / "static" / "compare.html"
    return html_path.read_text(encoding="utf-8")
