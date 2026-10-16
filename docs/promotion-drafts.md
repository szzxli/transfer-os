# Transfer OS 推广文案草稿（2026-10-15）

> 发布前检查：每个平台遵守其 self-promo 规则；不要同一天全平台轰炸，间隔 2-3 天。

---

## 1. Hacker News — Show HN

**Title:** Show HN: Transfer OS – open-source transfer planning for CA community college students

**Body:**

I built an open-source toolkit for California community college students navigating the transfer maze to UC schools.

The core frustration: ASSIST.org (the official articulation database) shows one report at a time — one CC × one university × one major. Applying to 3 UCs means hand-cross-referencing everything. Students routinely take courses that don't transfer (avg. transfer student accumulates ~87 units vs. the 60 needed).

What it does today:
- **TAG Guard** — item-by-item Transfer Admission Guarantee eligibility check against 2026-27 official UC rules (6 campuses), with risk flags
- **Articulation comparator** — one matrix across multiple UCs: what counts where, what's missing, which course fills each gap. Built on 25 real ASSIST agreements
- **Course plan validator** — enter planned courses by term, flags non-transferable/denied courses, estimates wasted units

Design decisions worth debating:
- Eligibility is computed by a deterministic rule engine, never by an LLM (LLMs only explain). No hallucinated "you qualify"
- Unknowns are labeled unknown, never silently guessed
- Trilingual UI (EN/中文/Español), fully offline Android app + PWA, no account, no tracking

Repo: https://github.com/szzxli/transfer-os · Live demo: https://szzxli.github.io/transfer-os/mobile/www/

Looking for feedback especially from: transfer counselors, anyone who's fought ASSIST by hand, and people who've maintained yearly-changing rule datasets (that's the hard part — TAG rules change every year).

---

## 2. Reddit — r/TransferStudents

**Title:** I built a free tool that compares what transfers where across UCs (TAG checker + course plan validator) — open source

**Body:**

Hey everyone — I got tired of cross-referencing ASSIST reports by hand (one CC × one UC × one major at a time), so I built Transfer OS and open-sourced it (MIT).

What it does:
- **TAG checker**: enter your GPA/units/major → checks you against the 2026-27 official TAG rules for all 6 TAG UCs, flags risks (e.g. your TAG major must match your UC app major)
- **Course comparator**: enter courses you've taken → one matrix showing what counts at each UC, what's missing, and which class fills the gap
- **Plan validator**: enter your planned schedule by term → warns you about courses that won't transfer before you waste the units

It's free, works offline, no account needed. Web version here: https://szzxli.github.io/transfer-os/mobile/www/ (also an Android APK in the repo).

Caveats, being honest: right now it's CS major only, 5 pilot community colleges (De Anza, SMC, DVC, Orange Coast, PCC) × UCB/UCSD/UCLA. Expanding based on feedback — tell me your CC + major and I'll prioritize the data.

Repo: https://github.com/szzxli/transfer-os

Happy to answer questions. And if you're a transfer counselor, I'd love to know what I got wrong.

---

## 3. V2EX — 分享创造节点

**标题：** 做了一个开源的加州转学规划工具：TAG 检查 + 跨校课程对比 + 白修预警

**正文：**

在加州 CC 读书想转 UC 的同学应该都懂 ASSIST.org 的痛：一次只能查一所 CC × 一所学校 × 一个专业，申 3 所 UC 就得手工 cross-reference，经常白修课（平均转学生攒了 ~87 学分，实际只要 60）。

做了个开源工具 Transfer OS（MIT），解决这个：

- **TAG Guard**：填 GPA/学分/专业，按 6 所 UC 2026-27 官方 TAG 规则逐项检查，标风险点
- **课程对比器**：填已修的课，一张矩阵告诉你每所 UC 认哪些、还缺哪门、补哪门课能填上（基于 25 份真实 ASSIST 协议）
- **计划校验器**：按学期输入计划修的课，提前预警白修，估算浪费多少学分

特点：判定走确定性规则引擎（LLM 只做解释，不判资格，不会有 AI 胡说你符合）；不知道就标 unknown 不瞎猜；三语界面（中/英/西）；离线能用，不用注册。

在线试用：https://szzxli.github.io/transfer-os/mobile/www/
仓库：https://github.com/szzxli/transfer-os

目前只有 CS 专业、5 所 CC 试点，根据反馈扩数据。欢迎提 issue / PR（最缺的是每年 TAG 规则更新的人手）。

---

## 发布顺序建议

1. **V2EX** 先发（中文社区，试水，收集第一波反馈修 bug）
2. **r/TransferStudents**（最精准的目标用户）
3. **Hacker News**（流量最大，放在产品最稳的时候；选美西时间周二-周四早上发）
