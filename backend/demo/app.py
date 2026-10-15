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

app = FastAPI(title="TAG Guard 演示", version="0.1.0")


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
