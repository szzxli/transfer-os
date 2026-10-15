# Backend — 规则引擎服务

Python 实现。核心原则：**所有资格判定走规则引擎（YAML 规则文件），不调用 LLM**。

## 目录

- `tag_engine/` — TAG 资格检查引擎
  - `loader.py`：加载 `rules/2026-27/tag/*.yaml`
  - `checker.py`：`check_eligibility(school, profile)`，输出逐项 pass/fail/warn/skip、TAG 评分、风险提示
  - 规则中标为 `unknown` 的字段一律跳过（skip），不判死刑，并提示人工核对官网
- `demo/` — FastAPI 最小 Web 演示（`POST /api/tag-check` + 单页表单）
- `tests/` — pytest 测试

## 快速开始

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 跑测试
pytest tests/ -v

# 启动演示服务
uvicorn demo.app:app --reload --port 8000
# 打开 http://localhost:8000
```

## API

- `GET /api/schools` — 可用学校列表
- `POST /api/tag-check` — TAG 资格检查

请求示例：

```json
{
  "school": "uc-riverside",
  "profile": {
    "gpa": 3.7,
    "college": "bourns_college_of_engineering",
    "major": "computer_science",
    "units_completed": 32,
    "english_done": 2,
    "math_done": 1,
    "major_prep_done": true,
    "has_bachelor_degree": false,
    "spring_units_planned": 15
  }
}
```

profile 所有字段可选；缺失字段产生 warn 而非 fail。
TAG 评分为启发式分数（100 起扣，fail −30 / warn −8），仅供参考。

## 设计说明

详见 `tag_engine/checker.py` 头部注释。判定逻辑：
GPA 阈值按学院→专业→兜底（all_majors）三级解析；学分从规则文本提取 semester 数；
英语需 2 门 UC-E、数学需 1 门 UC-M；专业排除名单支持 "all majors in X" 模式；
`tag_major_must_match_uc_app_major=true` 的学校会给出"专业必须一致"的风险提示。
