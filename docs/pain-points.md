# 痛点研究报告（2026-10-15）

来源：deep research 全网调研（EdSource、Daily Bruin、DailyCal、ERIC 研究、2026 加州审计报告、学生论坛）。
完整报告：`~/workspace/research_notes/transfer-tool-pain-points-20261015-1538/report.md`

## CC 转学生痛点（按出现频率 × 软件可解性排序）

### 1. 跨校/跨专业比对 ASSIST，全靠手工（最高频 + 最可解）
ASSIST 一次只给一份报告（一所 CC × 一所目标校 × 一个专业）。申多所 UC 的学生要逐份人肉交叉比对。
- "cross-referencing each school, each class and even each credit"（EdSource 2022）
- 研究者实测结论："it is difficult to compare requirements if students are intending to apply to more than one campus and/or major"（ERIC ED574471）
→ **工具映射：多校 articulation 对比器**——输入 CC + 目标校/专业，输出统一矩阵"哪门课在哪所学校算数、还差什么"。**这是核心差异化功能，ASSIST 自己不做。**

### 2. 选错课 / 学分浪费（代价最大）
- 平均攒 87 学分 vs 实际需要 60（多 ~50%）
- CCC→UC 平均 6.5 年拿学士（CCC→CSU 7 年），多花 $36–38K
- 只有 2% 两年内转走；2026 州审计：transfer-intending 学生四年内转走的只有 ~21%
→ **工具映射：课程计划校验器**——录入计划修的课，提前标出"这门转不了/白修"，配学分浪费计数器。

### 3. 系统分散、deadline 散落
ASSIST + TAP + TAG + UC 申请 + TAU + FAFSA + 9 所 UC + 23 所 CSU，各管各。
- TAG 只在每年 9/1–9/30 经 TAP 提交（与 UC 申请是两套系统）；TAG 专业必须和 UC 申请专业一致否则作废；TAU 优先截止 1/31
→ **工具映射：transfer 时间线中心**——deadline 追踪 + 跨系统 checklist（"TAP 和 UC 申请都交了吗"这类防呆检查）。

### 4. IGETC vs 专业先修课 confusion ⚠️ 关键更新
- IGETC 不是录取要求，工程类甚至不建议修完（如 UCD 工程学院建议别修）
- **Cal-GETC 从 Fall 2025 起取代 IGETC/CSU GE**，成为单一 GE 路径——工具必须按 Cal-GETC 建模，不能只做 IGETC
→ **工具映射：GE 路径规则引擎**——按目标校+专业推荐 Cal-GETC / 校园 GE / 跳过 GE（如工程），并解释原因。

### 5. TAG 规则复杂
6 所 UC 有 TAG（Davis/Irvine/Merced/Riverside/Santa Barbara/Santa Cruz），UCLA/UCB/UCSD 没有；conditional，完不成作废。
→ **工具映射：TAG 资格检查器 + 追踪 + deadline 提醒**（即 TAG Guard）。

### 6. ASSIST 数据过期
有学生查到 UCSD 的 articulation 还是 2011 年的。
→ **工具映射：新鲜度监控**——"这份协议 N 年没更新 / 自你规划后有变更"预警（能预警，修不了， institution 的事）。

### 7. Counselor 极缺（软件解不了，明确标注）
全州平均 1:508（建议 1:370）；San Diego CCD 1:1700；有学校预约 1 分钟抢光、30 分钟面谈。
→ 工具只能做 self-serve 减负，不能替代真人顾问。**不要在宣传里暗示能替代 counselor。**

## UC 在读生选课痛点

### 1. 选课要在 4–5 个网站之间人肉交叉（最高频 + 最可解）
RMP + berkeleytime/BruinWalk + 官方 Academic Guide + CalCentral/MyUCLA。
- UCLA 学生自己写了浏览器插件把 BruinWalk 评分注入 MyUCLA——官方缺这功能的最硬证据
- berkeleytime（UCB）、BruinWalk（UCLA）都是学生自建、单校、闭源；其他 UC 没有同类工具
→ **工具映射：开源跨校选课器**——排课 + 成绩分布 + 教授评价三合一，所有 UC 通用。这是学生已经用脚投票证明的需求。

### 2. Waitlist 黑箱
排第 1 等一个多月动不了、waitlist 学分占 unit 上限、purge 时间不明。
→ **工具映射：免费座位提醒**（Coursicle 这功能收费 $4.99/学期，开源版直接打掉）+ 历史 waitlist 移动数据估算。

### 3. 排课机械性坑
final 考试撞期（三门同一天）、Phase I/II 选课策略、CalCentral UX 被广泛吐槽。
→ **工具映射：自动冲突检查（含 final 考试组）**。

## 现有工具格局（gap = 机会）

| 工具 | 强项 | 缺口 |
|---|---|---|
| ASSIST.org | 官方 articulation，权威 | 无跨校对比、无规划、数据会过期、只覆盖 CA 公立 |
| Transferology | 全国课程对等 | 不是 CA system of record，替代不了 ASSIST |
| UC TAP | 课程记录、4 校提前 TAG | 三步流程里的一步，TAG 后锁定 |
| berkeleytime / BruinWalk | 成绩分布、选课数据 | 单校、闭源、无官方集成 |
| RMP | 评价量大 | 广告多、偏见、无选课集成 |
| Coursicle | 座位提醒 | 免费版只追踪 1 门课，$4.99/学期；无成绩/要求数据 |
| CalCentral / MyUCLA | 官方记录 | UX 差、无教授/成绩上下文、waitlist 黑箱 |

**结论：每个缺口现在都是靠学生自建的单校闭源工具在补。加州公立系统没有开源跨校工具——这就是位置。**

## MVP 优先级（校准后）

1. **多校 articulation 对比器**（P1 核心，原 PLAN 里没有，提上来）
2. **课程计划校验器**（P1 核心，防学分浪费）
3. **TAG Guard**（资格检查+追踪+deadline，原 P1 保留）
4. **Transfer 时间线中心**（deadline+checklist，P1/P2）
5. **Cal-GETC/GE 路径规则引擎**（P2，注意是 Cal-GETC 不是 IGETC）
6. **开源跨校选课器**（P2，UC 在读生）
7. **免费座位/waitlist 提醒**（P3）
8. ASSIST 新鲜度监控、audit 解说器（P3）

## 不能用软件解决的（写进 README 免责）

counselor 编制、课程因人数不足被砍、院系重修学分的动机、热门课物理座位、UCLA/UCB/UCSD 无 TAG（政策）、GPA 硬线。
