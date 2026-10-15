# TAG 规则核验说明（2026-10-15）

> ⚠️ **任务偏差说明**：任务要求写 `uc-san-diego.yaml`，但 UC San Diego 不开设 TAG
> （多源确认：CollegeVine、EdSource、UC Davis 官方博客"six out of the nine UCs"）。
> 六所 TAG 校区实际为 Davis / Irvine / Merced / Riverside / Santa Cruz / **Santa Barbara**。
> 因此本目录含 `uc-santa-barbara.yaml` 而非 `uc-san-diego.yaml`。请确认后定夺。

## uc-davis.yaml
- 官方来源：https://aggiehero.ucdavis.edu/admissions/undergraduate/transfer/transfer-admission-guarantee/requirements（页面明确标注 "Deadlines listed are for students applying for fall 2027 enrollment"，即 2026-27 学年周期）
- 已确认：分学院 GPA（3.2 / 工程 3.5）、30/60 学分节点、UC-E/UC-M 时间线、19 学分 spring 上限、C 以下禁令、good standing、CCC 连续就读要求、Sept 1-30 窗口、CS/Data Science 不可 TAG
- 未找到：TAG 专业是否必须与 UC 申请专业一致（标 unknown）；senior standing 学分上限（2019 版 criteria 提过 80 semester，但现行 Fall 2027 页面未写，标 unknown）

## uc-irvine.yaml
- 官方来源：https://admissions.uci.edu/apply/transfer/guaranteed-admission.php；细则数字引自 De Anza 发布的 UCI Fall 2026 TAG sheet（http://bhes.deanza.edu/articulation/documents/tag-guide-dac-uci.pdf）
- 已确认：3.4 GPA、30/60 学分、UC-E/UC-M 时间线、19 学分上限、final year 2.0 且无 C 以下、CCC 两学期+last school 规则、Sept 1-30 窗口、Nov 30 UC 申请截止、Fall 2027 不可 TAG 专业名单（含 Bren ICS 全部专业）
- 未找到：现行 Fall 2027 完整官方 sheet（引用的是 Fall 2026 版，GPA/学分规则跨年稳定，但 fall-term GPA 截止年份随周期滚动）；TAG 专业与申请专业一致性（标 unknown）

## uc-merced.yaml
- 官方来源：https://admissions.ucmerced.edu/transfer/tag；细则交叉核验 Santa Rosa Transfer Center（http://transfer.santarosa.edu/uc-merced-tag-requirements）与 SMC 页面
- 已确认：分学院 GPA（工程 3.0 / 自然科学 2.9 / SSHA 2.8 / 心理与公共卫生 3.0）、Public Health 需 IGETC/Cal-GETC、30/60 学分、英语/数学时间线、成绩红线（无 unrepeated NP/C-/D/F、major prep 最多 2 次 withdrawal）、80 semester 上限、fall 2026 全日制要求、Sept 1-30 窗口、spring TAG 选项
- 未找到：TAG 专业与申请专业一致性（标 unknown）

## uc-riverside.yaml
- 官方来源：https://admissions.ucr.edu/transfer/transfer-admission-guarantee（UCR 招生办官方页，Fall 2027 周期）
- 已确认：分学院/分专业 GPA 表（BCOE CS 3.60 / CompE 3.30 / MechE 3.10 / 其他 3.00；CHASS 心理 3.30 等；CNAS 2.80；商学院 2.80；教育 2.70；公共政策 2.70）、30/60 学分、UC-M/UC-E 时间线、selective major 需 C 以上、至少一个 CCC regular term、Sept 1-30 窗口、Oct 1–Nov 30 UC 申请、**TAG 专业必须与申请专业一致（true）**、一校一 TAG、Winter 2027 不收 TAG、Art Studio 不可 TAG
- 未找到：无（本文件字段最完整）

## uc-santa-cruz.yaml
- 官方来源：https://admissions.ucsc.edu/transfer-admission-guarantee-tag
- 已确认：3.0 GPA、30/60 学分（至少 30 来自 CCC）、英语/数学 fall 完成、7-course pattern 其余 spring 完成、19 学分上限、good standing + C 以下禁令、last school 须为 CCC、80 semester senior standing 红线、前 UC/前 UCSC 不可
- 未找到：**excluded_majors（标 unknown）**——来源冲突：Fall 2026 材料称 CS B.A./B.S. 不可 TAG；近期 transfer-center 页面称"所有专业现已开放 TAG（含 CS）"。未在官方页核实到 2026-27 定论，需人工确认后再编码；TAG 专业与申请专业一致性（标 unknown）

## uc-santa-barbara.yaml
- 官方来源：https://admissions.sa.ucsb.edu/tag；细则交叉核验 SBCC（https://sbcc.edu/transferacademy/tag.php）与 SMC 页面
- 已确认：3.4 GPA（fall 2026 截止）、不可 TAG 专业（创意学院全部、工程学院全部含 CS、舞蹈/音乐/戏剧特定学位）、selective L&S 专业需 major prep（精算、生物、化学、经济、数学、物理、统计等 8 个方向）、30/60 学分、UC-E+UC-M fall 完成、19 学分上限、80 semester 上限、2.0 + 无 C 以下、**TAG 专业必须与申请专业一致（true）**、TAP 9/1–9/30、UC 申请 10/1–11/30、TAU 1/31/2027、pre-major 说明、AP 可计学分、senior standing 90 semester 红线
- 未找到：无（本文件字段完整）

## 通用说明
- 所有数字均来自上述来源的原文，未编造；凡来源未明确的字段一律标 `unknown`。
- 各校 "admission_cycle" 字段标注了数字所描述的入学周期（多为 Fall 2027，即 2026-27 学年 TAG）。
- 建议每年 8–9 月对照各校官方页复核后更新（见 rules/README.md 贡献约定）。
