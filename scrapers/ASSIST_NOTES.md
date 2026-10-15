# ASSIST.org 爬虫调研笔记（P0，2026-10-15）

> 轻量结构查看结论：homepage ×1、robots.txt ×2（curl+browser）、API 探测 ×1。未做高频抓取。

## 一、网站结构

- **技术栈**：Angular 单页应用（`data-beasties-container`，Google Tag Manager）。**纯 `requests.get()` 拿不到渲染后的报告表格**——报告数据是 JS 渲染的，P0 必须走 JSON 接口或无头浏览器。
- **首页两种查询模式**（https://www.assist.org/）：
  1. **Articulation agreements**（我们要的）：按学年 + Institution（CCC/CSU/UC/Independent）+ Agreements with Other Institutions
  2. **Transferable courses**：按 CC 查可转课程列表（含 CSU GE-Breadth、CSU AI、**Cal-GETC**、IGETC、UC Transfer Admission Eligibility）
- **当前学年**：2026-2027（首页默认）。注意 Cal-GETC 已正式列为独立查询项，佐证"按 Cal-GETC 建模"的要求。
- 报告类型：`Major Articulation Agreement` / `Department Articulation Agreement` / GE agreements。

## 二、URL 规律（来自公开真实 URL）

### Articulation 报告页
```
https://www.assist.org/transfer/results
  ?year={YEAR_ID}
  &institution={SENDING_ID}
  &agreement={RECEIVING_ID}
  &agreementType=to
  &view=agreement
  &viewBy=major
  &viewSendingAgreements=false
  &viewByKey={YEAR_ID}%2F{SENDING_ID}%2Fto%2F{RECEIVING_ID}%2FMajor%2F{UUID}
```
- `viewByKey` 里的 **UUID 是站点搜索流程签发的，不能猜**——必须先走站内搜索（或其底层 lookup 接口）拿到 key，再拼报告 URL。
- 实例（公开 PDF 链接，Golden West → CSULB）：`year=75&institution=55&agreement=81`

### Transferable courses 列表页
```
https://www.assist.org/transfer/results?year={YEAR_ID}&institution={ID}&type={TYPE}&view=transferability
```

### JSON 接口（社区文档记录，参数待 P0 实测确认）
```
https://www.assist.org/api/transferability/courses?institutionId={ID}&academicYearId={YEAR}&listType={TYPE}
```
- 无 `listType` 时返回 HTTP 400（已验证）。`listType` 取值（csu/uc/calgetc 等）需实测。
- 返回字段（社区记录）：`identifier`（如 "ENGL A109"）、`prefixCode`、`courseNumber`、`courseTitle`、`departmentName`、`maxUnits`/`minUnits`、`isCsuTransferable`、`transferAreas[]`（如 UCTCA）。

### 学年 ID 映射
| year ID | 学年 | 状态 |
|---|---|---|
| 75 | 2024-2025 | 推断（公开 CSULB 协议 URL） |
| 76 | 2025-2026 | **已验证**（多份 2025-2026 公开协议 URL 均为 year=76） |
| 77 | 2026-2027 | 推断（首页当前学年），P0 实测确认 |

### 已知的学校 ID（社区记录，非官方，运行时必须复核）
CCC（sending）：Golden West 55、Orange Coast 74、Cypress 71、Fullerton 134、College of San Mateo 5、Cañada 68、Skyline 127、Laney 77、Merritt 13、Berkeley City 58、Alameda 111。
Receiving：CSU Long Beach 81（公开 URL 验证）。

## 三、报告页面结构（解析依据）

公开协议文本的稳定模式（多份 2025-2026 协议一致）：

- 头部：`Major/Department Articulation Agreement` + 专业名 + `Effective during the YYYY-YYYY academic year` + `Date Published`
- 章节：`GENERAL INFORMATION` / `PREPARATION FOR THE MAJOR` / `FOREIGN LANGUAGE REQUIREMENT` / `LOWER DIVISION MAJOR REQUIREMENTS`
- 数据行（两列表格）：`| CC课程 代码 标题 学分 | 目标校课程 代码 标题 学分 |`
- 特殊标记：
  - `No Course Articulated`（常出现在下一行 `|  | No Course Articulated |`）→ 该课不转
  - `Course(s) Denied` → 明确拒绝
  - `END OF AGREEMENT` → 报告结束
- **数据导出功能**：未发现官方批量导出；单份报告可下载 PDF（有学校把 PDF 托管在自家网站，如 documents.cccd.edu 实例）。即：**没有 API 批量拿，只能逐份（CC × 目标校 × 专业）抓**——这就是 P0 只做 3–5 所试点的原因。

## 四、robots.txt / 频率与合规

- **无有效 robots.txt**：`https://www.assist.org/robots.txt` 返回 200 + `text/html`，内容是 SPA 首页（Angular shell）。即站点没有给出明确的爬虫指令。
- 无明确指令 ≠ 可随意抓。P0 执行以下保守策略（已写入 `assist.py`）：
  - 请求间隔 ≥ 2 秒；识别性 User-Agent（含项目 URL 和用途说明）
  - 只碰**公开**的 articulation 报告页；不碰任何登录后区域；不存学生个人数据（报告里本来就没有）
  - 每份报告页面注明来源与"以官网为准"；记录抓取时间和协议 `Date Published`
  - 年度同步为主（协议按学年发布）；P3 的新鲜度监控再做增量检查
- 法律面：ASSIST 数据是加州公立教育系统的公开 articulation 信息；我们做的是公开页面、合理频率的读取，且输出注明来源。RMP 等第三方另行评估（ToS 风险更高）。

## 五、推荐试点 CCC（3–5 所）

选择维度：**UC 转学量**（feeder 排名）× **地理覆盖**（南北加州）× **目标用户匹配**（华人/国际生集中）× **P0 工程摩擦**（ID 已知优先）。

| # | 学校 | 推荐理由 |
|---|---|---|
| 1 | **De Anza College** | UC 转学 feeder 常年全美前列；硅谷核心，国际生/华人学生高度集中——最匹配目标用户；与 Foothill 同属 FHDA 学区，后续可顺手扩展 |
| 2 | **Santa Monica College** | 多年加州 #1 UC 转学输送量；洛杉矶西区，南加覆盖；学生群体最多元，样本代表性强 |
| 3 | **Diablo Valley College** | 历史上 UC Berkeley 最大 feeder 之一；湾区东湾，与 De Anza 形成北加双点 |
| 4 | **Orange Coast College** | 转学量大的南加州 CCC；**institution ID=74 已知**，P0 工程摩擦最小，可作为第一个跑通的试点 |
| 5 | **Pasadena City College** | 洛杉矶地区转学大户；与 SMC 形成 LA 双点，验证"同城多校对比器"的价值 |

- **试点目标校建议**：UC Berkeley / UCLA / UC San Diego（三所转学热门，专业选 **Computer Science**——需求最大、major prep 最复杂，最能体现对比器价值）。
- **ID 缺口**：De Anza、SMC、DVC、PCC 的 institution ID 尚未在公开资料中找到——P0 第一步就是用站内搜索反查确认（`resolve_institution_id()` 已留好 live-lookup TODO）。

## 六、P0 落地 checklist（下一步）

1. 实测确认：`listType` 取值、77=2026-2027、viewByKey 获取流程（或确认 JSON 接口可直调）
2. 反查 5 所试点 CCC + 3 所目标校的 institution ID，写入 `KNOWN_CCC_IDS` 并标注验证日期
3. 若 JSON 接口走不通，上 Playwright 无头渲染报告页（只渲染 P0 的 5×3×1=15 份报告，低频）
4. 跑通后：`data/raw/` 落 JSON → 清洗进课程知识库 → 对比器原型

## 七、实测结论（2026-10-15，verified_date: 2026-10-15）

> 单份真实报告端到端跑通：Orange Coast College → UC Berkeley，Computer Science B.A.，2026-2027。
> 原始 JSON 已落 `data/raw/assist_Orange_Coast_College_UC_Berkeley_Computer_Science_B_A_2026_2027.json`。

### 7.1 关键发现：XSRF 认证绕行

- `/api/*` 直接调返回 `400 {"title":"Bad Request","code":400}`（复现了社区记录的现象）。
- 根因：站点是 ASP.NET + Angular，首页 Set-Cookie 下发 `XSRF-TOKEN` 和 `X-XSRF-TOKEN` 两个 cookie；**API 要求请求头 `X-XSRF-TOKEN` 携带的是 `X-XSRF-TOKEN` 这个 cookie 的值**——错拿 `XSRF-TOKEN` cookie 的值去填头同样 400。
- 解法已固化为 `assist.py::new_xsrf_session()`：先 GET 首页拿 cookie，再带头调 API。全程 requests 即可，不需要 Playwright。

### 7.2 已验证的接口链（全部 200）

| 接口 | 参数 | 结论 |
|---|---|---|
| `GET /api/AcademicYears` | 无 | 77 = fallYear 2026（即 2026-2027 学年）✅；76=2025-2026、75=2024-2025 与此前推断一致 |
| `GET /api/institutions` | 无 | 181 所学校；5 所试点 CCC 的 ID 全部反查确认 |
| `GET /api/agreements` | receivingInstitutionId=79, sendingInstitutionId=74, academicYearId=77, categoryCode=major | 返回 95 份报告，每份的 `key` 即 viewByKey（格式 `77/74/to/79/Major/<uuid>`，uuid 由站点签发、不可猜） |
| `GET /api/articulation/Agreements?Key=<urlencode(key)>` | 同源接口（注意不是旧文档里的 prod.assistng.org，那个已 401） | isSuccessful=true，66KB 完整报告 JSON |

### 7.3 报告 JSON 数据模型（已解析验证）

- `result.articulations`：JSON 字符串，解开后是 block 数组；每 block = `articulation.course`（目标校课程）+ `articulation.sendingArticulation`
- `sendingArticulation.items[]`：课程组，组内 `courseConjunction`（And/Or），组间 `courseGroupConjunctions[]`（如两组之间 Or）
- `noArticulationReason`：有值 = 不转（如 COMPSCI 70 "This course must be taken at the university after transfer"）
- `deniedCourses[]`：明确拒绝的课程；本份报告中 0 条（字段存在已确认），解析器已用合成数据验证 denied 路径
- 解析结果：12 mappings = 11 articulated + 1 no_articulation + 0 denied；`parse_agreement_json()` 已加入 `assist.py`

### 7.4 试点学校 ID（/api/institutions 实测确认）

| 学校 | ID | code |
|---|---|---|
| De Anza College | 113 | DAC |
| Santa Monica College | 137 | SMCC |
| Diablo Valley College | 114 | DIABLO |
| Orange Coast College | 74 | OCC |
| Pasadena City College | 49 | PASADENA |
| UC Berkeley | 79 | UCB |
| UCLA | 117 | UCLA |
| UC San Diego | 7 | UCSD |

### 7.5 listType 取值（transferability 接口用）

从站点 JS 枚举确认：`prefix`、`csuai`、`calgetcArea`（另有 igetcArea 等，枚举未取全）。
注意：articulation 报告流**不需要** listType，走 `/api/agreements` + `/api/articulation/Agreements` 即可。

### 7.6 合规记录

- 本次实测共约 15 个请求（含 2 次 400 试探、1 次 401 试探），间隔 ≥2.5 秒，仅 1 份报告，全程公开页面。
- `prod.assistng.org` 旧接口已返回 401（加锁），未再试探。
- 下一步批量抓取时保持：单进程、≥2 秒间隔、识别性 UA、只读公开报告页。
