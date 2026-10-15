# Transfer OS（开源版）

开源免费的加州转学规划工具。CC 学生查"课能不能转、TAG 够不够格、怎么排学期"；UC 在读生智能选课。

> ⚠️ **免责声明**：本工具为规划参考，不构成录取保证；课程与录取数据以学校官网（ASSIST.org、各 UC 官网）为准。

## 定位：纯工具，不做中介

- ✅ 课程对等查询（ASSIST 数据本地化）
- ✅ TAG 资格检查与风险预警（规则引擎，确定性计算）
- ✅ 学期排课路线图（Roadmap）
- ✅ 智能选课（难度、教授评价、时间冲突、毕业要求追踪）
- ✅ 政策问答（RAG，不参与资格判定）
- ❌ 不做申请代办、不自动递交、不做保录承诺、不收订阅费

## 架构原则

1. **规则引擎为核心**：TAG / IGETC / Roadmap / 选课推荐全部确定性规则计算，零 Token、高可控、可解释
2. **LLM 只做解释与咨询**：绝不让大模型判定"你够不够格"
3. **数据诚实**：ASSIST 数据来自公开爬取 + 年度同步，无"独家 API"；第三方数据注明来源
4. **后端可插拔**：Auth / DB 不强绑定 Firebase（Google 服务国内被墙，README 会注明）

## MVP（五个屏）

1. Dashboard — 学业总览
2. TAG Guard — TAG 评分、逐项检查、风险预警（杀手功能）
3. Roadmap — 学期排课规划
4. Advisor — 政策问答
5. Profile — 目标学校/专业、成绩档案

## 路线图

- **P0 数据地基**：3–5 所 CCC 试点爬取；6 所 UC 的 TAG 规则编码（Davis/Irvine/Merced/Riverside/Santa Barbara/Santa Cruz）；规则库版本化
- **P1 MVP Web**：Dashboard + TAG Guard（Vue 3 + Vite，成绩手动录入）
- **P2 规划与选课**：Roadmap 生成器 + 选课推荐引擎（含 UC 在读生）
- **P3 咨询与社区**：RAG 问答、PWA/移动端、社区规则维护飞轮

## 仓库结构

```
rules/        规则库（版本化：rules/2026-27/tag/*.yaml）
backend/      规则引擎服务（Python）
frontend/     Web 客户端（Vue 3 + Vite）
scrapers/     数据爬取（ASSIST 等公开来源）
docs/         文档（含痛点研究报告）
PLAN.md       完整落地方案
```

## 贡献

最欢迎的贡献是**规则库 PR**：每年 TAG / IGETC 规则变更，靠社区一起维护。
详见 `rules/README.md`。

## License

MIT
