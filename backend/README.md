# Backend — 规则引擎服务

Python 实现。核心原则：**所有资格判定走规则引擎，不走 LLM**。

## 模块

- `tag_engine/` — TAG 资格检查（读 `rules/<学年>/tag/*.yaml`）
- `igetc_engine/` — IGETC 逐项检查
- `roadmap_engine/` — 学期排课路径规划
- `course_recommender/` — 选课推荐（难度评级、时间冲突、教授评价聚合）
- `api/` — REST API（给 frontend 调用）

## 开发

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest
```

(P0 阶段搭建，当前为骨架。)
