# Transfer OS（开源版）落地方案

> 融合：转学 App 架构图 × 融资 BP × Transfer OS 规则引擎架构 × UI mock × Noor 评审意见 × 痛点研究报告（2026-10-15）
> 定位修正：纯工具型开源软件，不做代办、不做保录、不碰钱。

## 一、产品定位（一句话）

开源免费的加州转学规划工具。CC 学生查"课能不能转、TAG 够不够格、怎么排学期"；UC 在读生智能选课。

**不做**：申请代办、自动递交、保录承诺、付费订阅、学费分成。

## 二、架构（融合修正版）

```
客户端层
  MVP: Web App (Vue 3 + Vite)          ← 先只做 Web，别一上来三端
  后期: PWA → uni-app x (iOS/Android/HarmonyOS)

接入层
  API 网关 (Kong/Nginx) → Auth(可插拔: Firebase Auth / Supabase) → RBAC → 限流/WAF → 审计日志

核心服务层（规则引擎为核心，零 Token，高可控）
  TAG 规则引擎      30 Units / GPA 门槛 / 课程匹配 / Final Semester 规则 / 优先级计算
  IGETC 规则引擎    A1–E 逐项检查 / 课程匹配 / 重复课程检测 / 完成度计算
  Roadmap 引擎      专业要求解析 / 先修关系图谱 / 学期负载规则 / 可行路径搜索
  选课推荐引擎      难度评级 / GPA 影响预测 / 时间冲突检测 / 教授评价聚合 / 推荐排序
  知识检索服务      FAQ + 政策文档 → 向量检索 (Qdrant / PGVector)
  AI 咨询服务       仅做解释与问答，不参与任何资格判定；LLM 适配层(默认 Gemini，可换) + Redis 缓存

数据层
  PostgreSQL(业务库) / 课程知识库(课程目录、先修关系、学分) /
  规则库(TAG/IGETC/专业要求，版本化：2026-27…) / 向量库 / 对象存储(成绩单等附件)

外部数据（诚实版，无"独家 API"话术）
  ASSIST.org   爬取 + 年度同步，页面注明"数据来源于公开 ASSIST，以官网为准"；记录协议新鲜度
  RMP 等第三方  聚合展示，注明来源；注意 ToS 风险，留切换开关
```

**相对原材料的修正**：
- 砍掉：申请代理自动递交、7 天 Offer、支付网关、"独家 ASSIST API"说法
- 降级：三大 AI 代理 → 规则引擎做判定，LLM 只做解释（Transfer OS 版是对的，采纳）
- 解耦：Firebase 不强绑定，Auth/DB 可插拔；README 注明 Google 服务国内被墙

## 三、MVP（按痛点研究校准优先级）

> 依据 `docs/pain-points.md`（2026-10-15 全网调研）：最高频且最可解的痛点是**跨校比对 ASSIST**和**选错课浪费学分**（平均 87 学分 vs 60 需求，多花 $36–38K）。

**P1 核心（先做，直接对 Rank 1–2 痛点）：**
1. **Articulation 对比器**——输入 CC + 多所目标校/专业，输出统一矩阵"哪门课在哪算数、还差什么"（ASSIST 自己不做，这是核心差异化）
2. **课程计划校验器**——录入计划修的课，提前标出"转不了/白修"，配学分浪费计数器
3. **TAG Guard**——TAG 评分、逐项检查、风险预警、deadline 提醒（9/1–9/30 窗口、TAU 1/31）

**P1 辅助屏：** Dashboard（学业总览）、Profile（目标学校/专业、成绩档案）

**P2：** Roadmap 学期排课生成器、**Cal-GETC/GE 路径规则引擎**（⚠️ Fall 2025 起 Cal-GETC 取代 IGETC，必须按 Cal-GETC 建模）、开源跨校选课器（UC 在读生：排课+成绩分布+教授评价三合一）、Advisor 问答

**P3：** 免费座位/waitlist 提醒（打掉 Coursicle $4.99/学期收费点）、ASSIST 新鲜度监控、audit 解说器、PWA/移动端、社区规则维护飞轮

**明确不承诺的**（写进 README）：counselor 编制、课程被砍、物理座位、UCLA/UCB/UCSD 无 TAG——软件解不了，不碰。

## 四、四阶段路线图

- **P0 数据地基**：爬 3–5 所 CCC 试点（别一上来 116 所）；编码 6 所 UC 的 TAG 规则（Davis/Irvine/Merced/Riverside/San Diego/Santa Cruz）+ **Cal-GETC 规则（Fall 2025+ 取代 IGETC）**；规则库版本化；记录每份 articulation 协议的更新鲜度
- **P1 MVP Web**：Articulation 对比器 + 课程计划校验器 + TAG Guard（Vue 3 + Vite，成绩手动录入）
- **P2 规划与选课**：Roadmap 生成器 + Cal-GETC/GE 路径引擎 + 开源跨校选课器（含 UC 在读生）
- **P3 咨询与社区**：RAG 问答 Advisor、免费座位提醒、PWA/移动端；**开源飞轮：规则库接受社区 PR**——每年 TAG 规则变更靠社区维护，这是开源版真正的护城河

**移动端路线**（P1 Web 跑通后执行）：**先 Android**——用 Capacitor 把 Web 版套壳出 APK，发文件直接安装试用；**iOS 延后**（以后再处理，届时评估 PWA / TestFlight）。

## 五、开源策略

- MIT 协议，独立仓库（`transfer-os`），与 soc-home-lab 分开（领域不同）
- 规则库与代码同仓库版本化，`rules/2026-27/` 这样的目录结构
- 免责声明（README 置顶）：规划参考工具，不构成录取保证；数据以学校官网为准
- 痛点研究报告：`docs/pain-points.md`（已完成），用于校准 P1–P2 优先级

## 六、工作量诚实评估

- 最重的活：规则编码（6 校 TAG × 专业先修）+ 数据爬取与年度维护
- 分工：Noor 搭框架/爬虫/规则引擎/文档；她负责规则验证、产品决策、在 CC/UC 学生里找内测用户
- 不画饼：P0–P1 是 2–4 周量级；P2–P3 看 P1 反馈再排
