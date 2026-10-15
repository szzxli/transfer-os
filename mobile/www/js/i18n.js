/* 三语字典：中文（简体）/ English / Español。
 * 规范：
 * - 专有名词不翻译：学校名、课程代码、专业英文名、规则原文（YAML 里的英文要求文本）保持原样。
 * - 值为字符串：直接文案；值为函数：detail 模板，参数为对象。
 * - t(key, params)：取当前语言文案；缺失时回退 en，再回退 zh。
 */
"use strict";

var I18N = {
zh: {
/* ---------- 通用 ---------- */
app_tag_sub: "加州大学转学保证计划 · 规则引擎判定，仅供参考",
app_cmp_sub: "同一批课，在不同 UC 算数程度一目了然 · ASSIST 公开协议数据",
nav_tag: "TAG 检查", nav_compare: "课程对比",
loading_tag: "正在按官方规则检查…",
loading_cmp: "正在对比 {n} 所学校…",
err_prefix: "出错了：",
alert_no_targets: "请至少选择一所目标学校。",
alert_bad_gpa: "GPA 请输入 0–4.5 之间的数字。",
empty_result: "无结果",
disclaimer_tag: "本工具为开源免费的转学规划参考，不构成录取保证。规则依据各校官网整理（见每份结果的数据来源链接），unknown 项目请人工核对官网。TAG 申请窗口通常为每年 9 月 1–30 日，逾期不受理。",
disclaimer_compare: "数据来自 ASSIST 公开 articulation 协议（2026-2027 学年），仅供规划参考，以学校官网为准。标“无协议”表示该组合暂无抓取到的协议，不代表学校没有要求，请到 ASSIST 官网核实。",
/* ---------- TAG 表单 ---------- */
f_school: "目标学校",
f_gpa: "GPA",
f_units: "已完成学分", f_units_unit: "(semester)",
f_major: "目标专业", f_major_hint: "(英文，如 Computer Science)",
f_english: "英语 UC-E", f_english_unit: "(已完成门数)",
f_math: "数学 UC-M", f_math_unit: "(已完成门数)",
f_spring: "计划 Spring 学分", f_spring_opt: "(选填，检查学分上限)",
f_prep_done: "专业先修已完成",
f_has_bachelor: "已有学士学位",
btn_check: "检查 TAG 资格",
ph_gpa: "如 3.70", ph_units: "如 32", ph_major: "如 Computer Science / Psychology",
ph_english: "0–2", ph_math: "0–2", ph_spring: "如 15",
/* ---------- 对比表单 ---------- */
f_cc: "你的社区大学",
f_targets: "目标学校", f_targets_opt: "(可多选，点击切换)",
f_major2: "专业",
f_major2_hint: "当前试点数据为 CS 相关专业；更多专业陆续加入。",
f_courses: "已修 / 计划修课程", f_courses_opt: "(每行一门，如 CS A250)",
ph_major2: "如 computer science",
ph_courses: "CS A250\nMATH A180\nENGL A100",
btn_compare: "生成对比矩阵",
no_report_for_cc: "该 CC 暂无已抓取的协议数据",
/* ---------- TAG 结果 ---------- */
sec_checks: "逐项检查", sec_risks: "风险提示", sec_keydates: "关键时间",
score_note: "TAG 评分是启发式分数，仅供参考，不代表录取概率。",
fail_warn_count: p => `不通过 ${p.f} 项 · 需注意 ${p.w} 项`,
kd_tagwindow: "TAG 申请窗口：", kd_ucapp: "UC 申请：", kd_tau: "TAU 截止：",
st_pass: "通过", st_fail: "不通过", st_warn: "注意", st_skip: "未核实",
verdict_ok: "✅ 基本符合 TAG 条件",
verdict_bad: "❌ 存在硬伤，不符合 TAG",
/* ---------- 对比结果 ---------- */
sec_reqdetail: "要求明细",
sec_after_transfer: "转学后必修（本 CC 无对应课）",
cov_line: p => `已覆盖 ${p.c} / ${p.t} 项要求`,
wasted_warn: "白修预警",
published_line: p => `协议发布：${p.d}`,
st_covered: "已覆盖", st_missing: "缺失",
st_no_articulation: "转学后必修", st_no_agreement: "无协议",
/* ---------- TAG 引擎 detail 模板 ---------- */
label_gpa: "GPA 要求", label_units: "TAG 提交时学分",
label_english: "英语（UC-E）", label_math: "数学（UC-M）",
label_excluded: "专业可 TAG", label_bachelor: "学士学位",
label_prep: "专业先修", label_spring: "Spring 学分上限",
label_major_match: "专业一致性",
kind_english: "英语", kind_math: "数学",
d_gpa_skip_norule: "该校 GPA 规则未核实，请查官网。",
d_gpa_skip_nothreshold: "未能从规则中解析出适用于该学院/专业的 GPA 阈值，请人工核对官网。",
d_gpa_warn_nogpa: p => `未提供 GPA。规则要求 [${p.matched}] ≥ ${p.threshold}。`,
d_gpa_warn_badfmt: p => `GPA 格式无法解析。规则要求 [${p.matched}] ≥ ${p.threshold}。`,
d_gpa_pass: p => `你的 GPA ${p.gpa} ≥ 要求 ${p.threshold}（[${p.matched}]）。`,
d_gpa_fail: p => `你的 GPA ${p.gpa} < 要求 ${p.threshold}（[${p.matched}]），不满足 TAG。`,
d_units_skip: "学分规则文本无法解析，请人工核对官网。",
d_units_warn_nounits: p => `未提供已完成学分。规则要求 TAG 提交时完成 ${p.needed} semester 学分。`,
d_units_warn_badfmt: "学分格式无法解析。",
d_units_pass: p => `已完成 ${p.u} ≥ 要求 ${p.needed} semester 学分。`,
d_units_fail: p => `已完成 ${p.u} < 要求 ${p.needed} semester 学分，TAG 提交时学分不够。`,
d_em_skip: p => `该校${p.kind}要求未在规则中列出。`,
d_em_warn_nodone: p => `未提供已完成门数。要求：${p.timing}`,
d_em_pass: p => `已完成 ${p.done} 门 UC-${p.code}。要求：${p.timing}`,
d_em_warn_one: p => `已完成 1 门，还差 1 门。要求：${p.timing}`,
d_em_fail: p => `未完成${p.kind}要求。要求：${p.timing}`,
d_excl_warn_college: p => `你的学院 [${p.entry}] 整体可能不可 TAG，请到官网核实该专业。`,
d_excl_fail: p => `专业 [${p.entry}] 不可 TAG（规则键：${p.key}）。`,
d_excl_skip: "该校不可 TAG 专业名单未核实，请查官网。",
d_excl_warn_nomajor: "未提供目标专业，无法检查排除名单。",
d_excl_pass: "目标专业不在不可 TAG 名单中。",
d_excl_risk_unknown: "该校不可 TAG 专业名单尚未核实，提交前请到官网确认你的专业可否 TAG。",
d_ba_fail: "已有学士学位者不可申请 TAG。",
d_ba_warn: "你已有学士学位，多数学校 TAG 不接受，请核实该校官网。",
d_prep_pass: "自报专业先修已完成。",
d_prep_warn_no: p => `自报专业先修未完成，selective 专业要求先修达标。${p.text ? "规则：" + p.text : ""}`,
d_prep_skip: "未提供专业先修完成情况，selective 专业通常要求先修达标。",
d_spring_warn: p => `计划 Spring 修 ${p.planned} 学分，超过上限 ${p.limit}（超上限可能影响 TAG）。`,
d_spring_pass: p => `计划 Spring ${p.planned} 学分，未超上限 ${p.limit}。`,
d_mm_warn_must: "TAG 申请时填报的专业必须和之后 UC 申请的专业一致，否则 TAG 作废。请确保两个申请填同一个专业。",
d_mm_warn_unknown: "该校是否要求 TAG 专业与 UC 申请专业一致尚未核实，提交前请查官网。",
r_mm_must: p => `${p.school} 官方要求：TAG 申请专业必须与 UC 申请专业一致，否则 TAG 作废。`,
r_unknowns: p => `该校有 ${p.n} 项规则尚未核实（${p.list}${p.more}），提交前请对照官网。`,
r_unknowns_more: " 等",
src_line: p => `数据来源：${p.source}（核验 ${p.date}）`,
engine_disclaimer: "规则引擎判定，仅供参考；unknown 项请人工核对官网，不构成录取保证。",
/* ---------- 对比引擎 detail 模板 ---------- */
d_covered: "已覆盖",
d_missing: p => `缺失：需修 ${p.options}`,
d_noartic: "该 CC 无对应课程，需转学后在目标校修读。",
d_wasted: p => `被明确拒绝承认（${p.title}）`,
d_noagreement: "未找到该组合的 articulation 协议（可能无协议或未抓取），请查 ASSIST 官网。",
d_main_note: "基于 ASSIST 公开协议数据，仅供参考，以学校官网为准。",
d_via: p => `✓ 经 ${p.via}`,
d_fill_one: p => `修以下任一门可补上：${p.options}`,
/* ---------- 校验器 ---------- */
app_val_sub: "逐门审查你的选课计划 · 白修预警，ASSIST 公开协议数据",
nav_validate: "计划校验",
f_plan: "学期课程表", f_plan_opt: "(每学期一行标题，其下每行一门课)",
ph_plan: "Fall 2026:\nCS A250\nMATH A180\n\nSpring 2027:\nCS A200",
btn_validate: "审查课程计划",
disclaimer_validate: "数据来自 ASSIST 公开 articulation 协议（2026-2027 学年），仅供规划参考，以学校官网为准。标“存疑”的课程可能是 GE 课，请对照 Cal-GETC 清单核实后再决定是否退课。",
sec_waste: "浪费汇总",
sec_incomplete: "未完成的要求",
v_wasted_units_line: p => `实锤浪费 ${p.u} 学分 ≈ 多读 ${p.t} 学期`,
v_no_waste: "未发现实锤浪费课程 🎉",
v_at_risk_line: p => `存疑课程 ${p.n} 门（可能是 GE 课，请对照 Cal-GETC 清单核实）`,
v_unknown_units: "学分未知",
v_term_wasted: p => `本学期实锤浪费 ${p.u} 学分`,
v_note_ok: "可转学分",
v_note_ok_partial: "；部分要求需补同伴课程",
v_note_denied: "白修实锤：被目标校明确拒绝承认",
v_note_unknown: "未在专业 articulation 协议中找到——可能是 GE 课程，请对照 Cal-GETC 清单核实",
v_denied_noname: "被明确拒绝承认",
v_baseline_note: p => `以 60 semester 学分、每学期 15 学分为基准：实锤浪费 ${p.u} 学分 ≈ 多读 ${p.t} 学期`,
v_main_note: "基于 ASSIST 公开协议数据，仅供参考，以学校官网为准。标“存疑”的课程可能是 GE 课，请对照 Cal-GETC 清单核实后再决定是否退课。",
v_missing_partners: p => `还需修：${p.list}`,
v_satisfies: p => `满足 ${p.target} ${p.code}`,
v_and_incomplete: "（未完成，需补同伴课程）",
v_denied_at: p => `被 ${p.school} 拒绝`,
v_no_agreement_line: p => `以下学校无协议数据：${p.list}`,
v_st_ok: "可转学分", v_st_denied: "被拒", v_st_unknown: "存疑",
},

en: {
/* ---------- 通用 ---------- */
app_tag_sub: "UC Transfer Admission Guarantee · rule-engine based, for reference only",
app_cmp_sub: "See how the same courses count at different UCs · public ASSIST data",
nav_tag: "TAG Check", nav_compare: "Compare",
loading_tag: "Checking against official rules…",
loading_cmp: "Comparing {n} campuses…",
err_prefix: "Error: ",
alert_no_targets: "Please select at least one target campus.",
alert_bad_gpa: "Please enter a GPA between 0 and 4.5.",
empty_result: "No results",
disclaimer_tag: "This is a free open-source transfer planning reference, not an admission guarantee. Rules are compiled from official campus websites (see source links in each result); please verify 'unknown' items on official sites. The TAG filing window is usually Sept 1–30 each year — late filings are not accepted.",
disclaimer_compare: "Data comes from public ASSIST articulation agreements (2026–2027), for planning reference only — always verify on official websites. 'No agreement' means no agreement was found for that combination, not that the campus has no requirements; check ASSIST directly.",
/* ---------- TAG 表单 ---------- */
f_school: "Target campus",
f_gpa: "GPA",
f_units: "Completed units", f_units_unit: "(semester)",
f_major: "Intended major", f_major_hint: "(in English, e.g. Computer Science)",
f_english: "English UC-E", f_english_unit: "(courses completed)",
f_math: "Math UC-M", f_math_unit: "(courses completed)",
f_spring: "Planned Spring units", f_spring_opt: "(optional, checks unit cap)",
f_prep_done: "Major preparation completed",
f_has_bachelor: "Already hold a bachelor's degree",
btn_check: "Check TAG Eligibility",
ph_gpa: "e.g. 3.70", ph_units: "e.g. 32", ph_major: "e.g. Computer Science / Psychology",
ph_english: "0–2", ph_math: "0–2", ph_spring: "e.g. 15",
/* ---------- 对比表单 ---------- */
f_cc: "Your community college",
f_targets: "Target campuses", f_targets_opt: "(multi-select, tap to toggle)",
f_major2: "Major",
f_major2_hint: "Pilot data covers CS-related majors; more majors coming.",
f_courses: "Completed / planned courses", f_courses_opt: "(one per line, e.g. CS A250)",
ph_major2: "e.g. computer science",
ph_courses: "CS A250\nMATH A180\nENGL A100",
btn_compare: "Generate Comparison",
no_report_for_cc: "No agreement data fetched for this college yet",
/* ---------- TAG 结果 ---------- */
sec_checks: "Requirement Checks", sec_risks: "Risk Warnings", sec_keydates: "Key Dates",
score_note: "The TAG score is heuristic, for reference only — not admission odds.",
fail_warn_count: p => `${p.f} failed · ${p.w} warnings`,
kd_tagwindow: "TAG window: ", kd_ucapp: "UC application: ", kd_tau: "TAU deadline: ",
st_pass: "Pass", st_fail: "Fail", st_warn: "Warning", st_skip: "Unverified",
verdict_ok: "✅ Likely meets TAG requirements",
verdict_bad: "❌ Has disqualifying issues — does not meet TAG",
/* ---------- 对比结果 ---------- */
sec_reqdetail: "Requirement Details",
sec_after_transfer: "Must take after transfer (no equivalent at this CC)",
cov_line: p => `${p.c} of ${p.t} requirements covered`,
wasted_warn: "Wasted-unit warning",
published_line: p => `Agreement published: ${p.d}`,
st_covered: "Covered", st_missing: "Missing",
st_no_articulation: "After transfer", st_no_agreement: "No agreement",
/* ---------- TAG 引擎 detail 模板 ---------- */
label_gpa: "GPA Requirement", label_units: "Units at TAG Filing",
label_english: "English (UC-E)", label_math: "Math (UC-M)",
label_excluded: "Major TAG-Eligible", label_bachelor: "Bachelor's Degree",
label_prep: "Major Preparation", label_spring: "Spring Unit Cap",
label_major_match: "Major Consistency",
kind_english: "English", kind_math: "Math",
d_gpa_skip_norule: "GPA rule not verified for this campus. Check the official website.",
d_gpa_skip_nothreshold: "Could not determine the GPA threshold for your college/major. Verify on the official website.",
d_gpa_warn_nogpa: p => `No GPA provided. Rule requires [${p.matched}] ≥ ${p.threshold}.`,
d_gpa_warn_badfmt: p => `GPA format not recognized. Rule requires [${p.matched}] ≥ ${p.threshold}.`,
d_gpa_pass: p => `Your GPA ${p.gpa} ≥ required ${p.threshold} ([${p.matched}]).`,
d_gpa_fail: p => `Your GPA ${p.gpa} < required ${p.threshold} ([${p.matched}]). Does not meet TAG.`,
d_units_skip: "Unit rule text could not be parsed. Verify on the official website.",
d_units_warn_nounits: p => `No completed units provided. TAG filing requires ${p.needed} semester units completed.`,
d_units_warn_badfmt: "Unit format not recognized.",
d_units_pass: p => `Completed ${p.u} ≥ required ${p.needed} semester units.`,
d_units_fail: p => `Completed ${p.u} < required ${p.needed} semester units — not enough at TAG filing.`,
d_em_skip: p => `${p.kind} requirement not listed in the rules for this campus.`,
d_em_warn_nodone: p => `Courses completed not provided. Requirements: ${p.timing}`,
d_em_pass: p => `Completed ${p.done} UC-${p.code} course(s). Requirements: ${p.timing}`,
d_em_warn_one: p => `Completed 1, one more needed. Requirements: ${p.timing}`,
d_em_fail: p => `${p.kind} requirement not met. Requirements: ${p.timing}`,
d_excl_warn_college: p => `Your college [${p.entry}] may be entirely excluded from TAG. Verify your major on the official website.`,
d_excl_fail: p => `Major [${p.entry}] is not TAG-eligible (rule key: ${p.key}).`,
d_excl_skip: "Excluded-major list not verified for this campus. Check the official website.",
d_excl_warn_nomajor: "No intended major provided — cannot check the exclusion list.",
d_excl_pass: "Intended major is not on the TAG-excluded list.",
d_excl_risk_unknown: "The excluded-major list is not yet verified for this campus. Confirm your major's eligibility on the official website before filing.",
d_ba_fail: "Applicants who already hold a bachelor's degree cannot apply for TAG.",
d_ba_warn: "You already hold a bachelor's degree; most campuses do not accept TAG from degree holders. Verify on the campus website.",
d_prep_pass: "Self-reported major preparation completed.",
d_prep_warn_no: p => `Self-reported major preparation incomplete; selective majors require completed prep. ${p.text ? "Rule: " + p.text : ""}`,
d_prep_skip: "Major preparation status not provided; selective majors usually require completed prep.",
d_spring_warn: p => `Planning ${p.planned} Spring units exceeds the cap of ${p.limit} (exceeding it may affect TAG).`,
d_spring_pass: p => `Planning ${p.planned} Spring units — within the cap of ${p.limit}.`,
d_mm_warn_must: "The major on your TAG application must match the major on your UC application, or TAG is voided. Make sure both applications list the same major.",
d_mm_warn_unknown: "Whether this campus requires the TAG major to match the UC application major is unverified. Check the official website before filing.",
r_mm_must: p => `${p.school} official rule: the TAG major must match the UC application major, or TAG is voided.`,
r_unknowns: p => `${p.n} rule item(s) at this campus are unverified (${p.list}${p.more}). Verify against the official website before filing.`,
r_unknowns_more: ", etc.",
src_line: p => `Source: ${p.source} (verified ${p.date})`,
engine_disclaimer: "Determined by the rule engine, for reference only. Verify 'unknown' items on official websites. Not an admission guarantee.",
/* ---------- 对比引擎 detail 模板 ---------- */
d_covered: "Covered",
d_missing: p => `Missing: take ${p.options}`,
d_noartic: "No equivalent course at this CC — must be taken at the target campus after transfer.",
d_wasted: p => `Explicitly denied transfer credit (${p.title})`,
d_noagreement: "No articulation agreement found for this combination (may not exist or not yet fetched). Check ASSIST directly.",
d_main_note: "Based on public ASSIST agreement data, for reference only. Verify on official websites.",
d_via: p => `✓ via ${p.via}`,
d_fill_one: p => `Take any one of these: ${p.options}`,
/* ---------- 校验器 ---------- */
app_val_sub: "Review your course plan course by course · wasted-unit alerts, public ASSIST data",
nav_validate: "Plan Check",
f_plan: "Term-by-term course plan", f_plan_opt: "(one term title per line, then one course per line)",
ph_plan: "Fall 2026:\nCS A250\nMATH A180\n\nSpring 2027:\nCS A200",
btn_validate: "Review Course Plan",
disclaimer_validate: "Data comes from public ASSIST articulation agreements (2026–2027), for planning reference only — always verify on official websites. Courses marked 'unverified' may be GE courses; check them against the Cal-GETC list before dropping.",
sec_waste: "Waste Summary",
sec_incomplete: "Incomplete Requirements",
v_wasted_units_line: p => `Confirmed waste: ${p.u} units ≈ ${p.t} extra term(s)`,
v_no_waste: "No confirmed wasted courses 🎉",
v_at_risk_line: p => `${p.n} unverified course(s) (may be GE — check against the Cal-GETC list)`,
v_unknown_units: "units unknown",
v_term_wasted: p => `Confirmed waste this term: ${p.u} units`,
v_note_ok: "Transferable",
v_note_ok_partial: "; some requirements need companion courses",
v_note_denied: "Confirmed waste: explicitly denied by the target campus",
v_note_unknown: "Not found in the major articulation agreement — may be a GE course, verify against the Cal-GETC list",
v_denied_noname: "explicitly denied",
v_baseline_note: p => `Based on 60 semester units / 15 per term: confirmed waste of ${p.u} units ≈ ${p.t} extra term(s)`,
v_main_note: "Based on public ASSIST agreement data, for reference only. Verify on official websites. Courses marked 'unverified' may be GE courses — check the Cal-GETC list before dropping.",
v_missing_partners: p => `Still need: ${p.list}`,
v_satisfies: p => `Satisfies ${p.target} ${p.code}`,
v_and_incomplete: " (incomplete — companion courses needed)",
v_denied_at: p => `Denied by ${p.school}`,
v_no_agreement_line: p => `No agreement data for: ${p.list}`,
v_st_ok: "Transferable", v_st_denied: "Denied", v_st_unknown: "Unverified",
},

es: {
/* ---------- 通用 ---------- */
app_tag_sub: "Garantía de admisión por transferencia de UC · evaluado por motor de reglas, solo de referencia",
app_cmp_sub: "Ve cómo cuentan los mismos cursos en distintas UC · datos públicos de ASSIST",
nav_tag: "Verificar TAG", nav_compare: "Comparar",
loading_tag: "Verificando según las reglas oficiales…",
loading_cmp: "Comparando {n} universidades…",
err_prefix: "Error: ",
alert_no_targets: "Selecciona al menos una universidad de destino.",
alert_bad_gpa: "Ingresa un GPA entre 0 y 4.5.",
empty_result: "Sin resultados",
disclaimer_tag: "Esta es una referencia gratuita y de código abierto para planificar tu transferencia, no una garantía de admisión. Las reglas se compilan de los sitios web oficiales (ver enlaces de fuente en cada resultado); verifica los ítems 'unknown' en los sitios oficiales. La ventana de solicitud TAG suele ser del 1 al 30 de septiembre — no se aceptan solicitudes tardías.",
disclaimer_compare: "Datos de convenios de articulación públicos de ASSIST (2026–2027), solo de referencia — verifica siempre en los sitios oficiales. «Sin convenio» significa que no se encontró convenio para esa combinación, no que la universidad no tenga requisitos; consúltalo en ASSIST.",
/* ---------- TAG 表单 ---------- */
f_school: "Universidad de destino",
f_gpa: "GPA",
f_units: "Unidades completadas", f_units_unit: "(semestrales)",
f_major: "Carrera deseada", f_major_hint: "(en inglés, p. ej. Computer Science)",
f_english: "Inglés UC-E", f_english_unit: "(cursos completados)",
f_math: "Matemáticas UC-M", f_math_unit: "(cursos completados)",
f_spring: "Unidades planeadas de primavera", f_spring_opt: "(opcional, verifica el límite)",
f_prep_done: "Preparación de la carrera completada",
f_has_bachelor: "Ya tengo un título universitario",
btn_check: "Verificar elegibilidad TAG",
ph_gpa: "p. ej. 3.70", ph_units: "p. ej. 32", ph_major: "p. ej. Computer Science / Psychology",
ph_english: "0–2", ph_math: "0–2", ph_spring: "p. ej. 15",
/* ---------- 对比表单 ---------- */
f_cc: "Tu colegio comunitario",
f_targets: "Universidades de destino", f_targets_opt: "(selección múltiple, toca para cambiar)",
f_major2: "Carrera",
f_major2_hint: "Los datos piloto cubren carreras de CS; más carreras próximamente.",
f_courses: "Cursos completados / planeados", f_courses_opt: "(uno por línea, p. ej. CS A250)",
ph_major2: "p. ej. computer science",
ph_courses: "CS A250\nMATH A180\nENGL A100",
btn_compare: "Generar comparación",
no_report_for_cc: "Aún no hay convenios registrados para este colegio",
/* ---------- TAG 结果 ---------- */
sec_checks: "Revisión por requisitos", sec_risks: "Advertencias de riesgo", sec_keydates: "Fechas clave",
score_note: "La puntuación TAG es heurística, solo de referencia — no indica probabilidad de admisión.",
fail_warn_count: p => `${p.f} no aprobados · ${p.w} advertencias`,
kd_tagwindow: "Ventana TAG: ", kd_ucapp: "Solicitud UC: ", kd_tau: "Límite TAU: ",
st_pass: "Aprobado", st_fail: "No aprobado", st_warn: "Atención", st_skip: "Sin verificar",
verdict_ok: "✅ Cumple los requisitos de TAG",
verdict_bad: "❌ Tiene problemas descalificadores — no cumple TAG",
/* ---------- 对比结果 ---------- */
sec_reqdetail: "Detalle de requisitos",
sec_after_transfer: "Tomar después de la transferencia (sin equivalencia en este CC)",
cov_line: p => `${p.c} de ${p.t} requisitos cubiertos`,
wasted_warn: "Alerta de unidades desperdiciadas",
published_line: p => `Convenio publicado: ${p.d}`,
st_covered: "Cubierto", st_missing: "Faltante",
st_no_articulation: "Tras transferencia", st_no_agreement: "Sin convenio",
/* ---------- TAG 引擎 detail 模板 ---------- */
label_gpa: "Requisito de GPA", label_units: "Unidades al solicitar TAG",
label_english: "Inglés (UC-E)", label_math: "Matemáticas (UC-M)",
label_excluded: "Carrera elegible para TAG", label_bachelor: "Título universitario",
label_prep: "Preparación de la carrera", label_spring: "Límite de primavera",
label_major_match: "Consistencia de carrera",
kind_english: "inglés", kind_math: "matemáticas",
d_gpa_skip_norule: "Regla de GPA no verificada para este campus. Consulta el sitio web oficial.",
d_gpa_skip_nothreshold: "No se pudo determinar el umbral de GPA para tu facultad/carrera. Verifícalo en el sitio oficial.",
d_gpa_warn_nogpa: p => `GPA no proporcionado. La regla exige [${p.matched}] ≥ ${p.threshold}.`,
d_gpa_warn_badfmt: p => `Formato de GPA no reconocido. La regla exige [${p.matched}] ≥ ${p.threshold}.`,
d_gpa_pass: p => `Tu GPA ${p.gpa} ≥ requerido ${p.threshold} ([${p.matched}]).`,
d_gpa_fail: p => `Tu GPA ${p.gpa} < requerido ${p.threshold} ([${p.matched}]). No cumple TAG.`,
d_units_skip: "No se pudo interpretar el texto de la regla de unidades. Verifícalo en el sitio oficial.",
d_units_warn_nounits: p => `Unidades completadas no proporcionadas. TAG exige ${p.needed} unidades semestrales completadas.`,
d_units_warn_badfmt: "Formato de unidades no reconocido.",
d_units_pass: p => `Completadas ${p.u} ≥ requeridas ${p.needed} unidades semestrales.`,
d_units_fail: p => `Completadas ${p.u} < requeridas ${p.needed} unidades semestrales — insuficientes al solicitar TAG.`,
d_em_skip: p => `Requisito de ${p.kind} no listado en las reglas de este campus.`,
d_em_warn_nodone: p => `Cursos completados no proporcionados. Requisitos: ${p.timing}`,
d_em_pass: p => `Completados ${p.done} curso(s) de UC-${p.code}. Requisitos: ${p.timing}`,
d_em_warn_one: p => `Completado 1, falta 1. Requisitos: ${p.timing}`,
d_em_fail: p => `Requisito de ${p.kind} no cumplido. Requisitos: ${p.timing}`,
d_excl_warn_college: p => `Tu facultad [${p.entry}] podría estar totalmente excluida de TAG. Verifica tu carrera en el sitio oficial.`,
d_excl_fail: p => `La carrera [${p.entry}] no es elegible para TAG (clave de regla: ${p.key}).`,
d_excl_skip: "Lista de carreras excluidas no verificada para este campus. Consulta el sitio oficial.",
d_excl_warn_nomajor: "Carrera deseada no proporcionada — no se puede revisar la lista de exclusión.",
d_excl_pass: "La carrera deseada no está en la lista de exclusión de TAG.",
d_excl_risk_unknown: "La lista de carreras excluidas aún no está verificada para este campus. Confirma la elegibilidad de tu carrera en el sitio oficial antes de solicitar.",
d_ba_fail: "Quienes ya tienen un título universitario no pueden solicitar TAG.",
d_ba_warn: "Ya tienes un título universitario; la mayoría de los campus no aceptan TAG de titulados. Verifícalo en el sitio del campus.",
d_prep_pass: "Preparación de la carrera autodeclarada como completada.",
d_prep_warn_no: p => `Preparación de la carrera autodeclarada como incompleta; las carreras selectivas exigen preparación completa. ${p.text ? "Regla: " + p.text : ""}`,
d_prep_skip: "Estado de preparación no proporcionado; las carreras selectivas suelen exigir preparación completa.",
d_spring_warn: p => `Planear ${p.planned} unidades de primavera supera el límite de ${p.limit} (superarlo puede afectar TAG).`,
d_spring_pass: p => `Planeadas ${p.planned} unidades de primavera — dentro del límite de ${p.limit}.`,
d_mm_warn_must: "La carrera de tu solicitud TAG debe coincidir con la de tu solicitud UC, o el TAG se anula. Asegúrate de que ambas solicitudes indiquen la misma carrera.",
d_mm_warn_unknown: "No está verificado si este campus exige que la carrera TAG coincida con la de la solicitud UC. Consulta el sitio oficial antes de solicitar.",
r_mm_must: p => `Regla oficial de ${p.school}: la carrera TAG debe coincidir con la de la solicitud UC, o el TAG se anula.`,
r_unknowns: p => `${p.n} regla(s) de este campus sin verificar (${p.list}${p.more}). Verifícalas en el sitio oficial antes de solicitar.`,
r_unknowns_more: ", etc.",
src_line: p => `Fuente: ${p.source} (verificado ${p.date})`,
engine_disclaimer: "Determinado por el motor de reglas, solo de referencia. Verifica los ítems 'unknown' en los sitios oficiales. No es garantía de admisión.",
/* ---------- 对比引擎 detail 模板 ---------- */
d_covered: "Cubierto",
d_missing: p => `Faltante: tomar ${p.options}`,
d_noartic: "Sin curso equivalente en este CC — debe tomarse en la universidad de destino tras la transferencia.",
d_wasted: p => `Crédito de transferencia explícitamente denegado (${p.title})`,
d_noagreement: "No se encontró convenio de articulación para esta combinación (puede no existir o no haberse registrado). Consulta ASSIST directamente.",
d_main_note: "Basado en datos públicos de convenios ASSIST, solo de referencia. Verifica en los sitios oficiales.",
d_via: p => `✓ vía ${p.via}`,
d_fill_one: p => `Toma cualquiera de estos: ${p.options}`,
/* ---------- 校验器 ---------- */
app_val_sub: "Revisa tu plan de cursos curso por curso · alertas de unidades desperdiciadas, datos públicos de ASSIST",
nav_validate: "Revisar plan",
f_plan: "Plan de cursos por semestre", f_plan_opt: "(un título de semestre por línea, luego un curso por línea)",
ph_plan: "Fall 2026:\nCS A250\nMATH A180\n\nSpring 2027:\nCS A200",
btn_validate: "Revisar plan de cursos",
disclaimer_validate: "Datos de convenios públicos de articulación de ASSIST (2026–2027), solo de referencia — verifica siempre en los sitios oficiales. Los cursos marcados 'sin verificar' pueden ser de GE; consúltalos en la lista Cal-GETC antes de abandonarlos.",
sec_waste: "Resumen de desperdicio",
sec_incomplete: "Requisitos incompletos",
v_wasted_units_line: p => `Desperdicio confirmado: ${p.u} unidades ≈ ${p.t} semestre(s) extra`,
v_no_waste: "Sin cursos desperdiciados confirmados 🎉",
v_at_risk_line: p => `${p.n} curso(s) sin verificar (pueden ser de GE — consulta la lista Cal-GETC)`,
v_unknown_units: "unidades desconocidas",
v_term_wasted: p => `Desperdicio confirmado este semestre: ${p.u} unidades`,
v_note_ok: "Transferible",
v_note_ok_partial: "; algunos requisitos necesitan cursos complementarios",
v_note_denied: "Desperdicio confirmado: explícitamente denegado por la universidad de destino",
v_note_unknown: "No encontrado en el convenio de articulación de la carrera — puede ser un curso de GE, verifica en la lista Cal-GETC",
v_denied_noname: "explícitamente denegado",
v_baseline_note: p => `Basado en 60 unidades semestrales / 15 por semestre: desperdicio confirmado de ${p.u} unidades ≈ ${p.t} semestre(s) extra`,
v_main_note: "Basado en datos públicos de convenios ASSIST, solo de referencia. Verifica en los sitios oficiales. Los cursos 'sin verificar' pueden ser de GE — consulta la lista Cal-GETC antes de abandonarlos.",
v_missing_partners: p => `Aún necesitas: ${p.list}`,
v_satisfies: p => `Satisface ${p.target} ${p.code}`,
v_and_incomplete: " (incompleto — se necesitan cursos complementarios)",
v_denied_at: p => `Denegado por ${p.school}`,
v_no_agreement_line: p => `Sin datos de convenio para: ${p.list}`,
v_st_ok: "Transferible", v_st_denied: "Denegado", v_st_unknown: "Sin verificar",
}
};

var APP_LANG = "zh";
var LANG_LABEL = { zh: "中文", en: "EN", es: "ES" };
var HTML_LANG = { zh: "zh-CN", en: "en", es: "es" };

/* 取文案：函数则调用并传参 */
function t(key, params) {
  var d = I18N[APP_LANG] || {};
  var v = d[key];
  if (v === undefined) v = I18N.en[key];
  if (v === undefined) v = I18N.zh[key];
  if (v === undefined) return key;
  return (typeof v === "function") ? v(params || {}) : v;
}

function setLang(l) {
  if (!I18N[l]) l = "zh";
  APP_LANG = l;
  try { localStorage.setItem("transferos_lang", l); } catch (e) {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = HTML_LANG[l] || "zh-CN";
  }
  if (typeof applyI18n === "function") applyI18n();
}

/* 静态文案：data-i18n="key" / data-i18n-ph="key" */
function applyI18n() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
  });
  document.querySelectorAll(".langswitch button").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-lang") === APP_LANG);
  });
  // 让各页面重渲染动态结果
  if (typeof window.__reRender === "function") window.__reRender();
}

/* 启动自检：检查必需 key 在三语中是否齐全，缺失则报错。
 * 用法：i18n_check(["nav_validate", "btn_validate", ...]) → 返回缺失列表。
 */
function i18n_check(requiredKeys) {
  const missing = [];
  for (const l of Object.keys(I18N)) {
    for (const k of requiredKeys || []) {
      if (!(k in I18N[l])) missing.push(l + ":" + k);
    }
  }
  if (missing.length && typeof console !== "undefined") {
    console.error("[i18n] 缺失 key (" + missing.length + ")：" + missing.join(", "));
  }
  return missing;
}

function initLang() {
  var l = "zh";
  try { l = localStorage.getItem("transferos_lang") || "zh"; } catch (e) {}
  if (!I18N[l]) l = "zh";
  APP_LANG = l;
  if (typeof document !== "undefined") {
    document.documentElement.lang = HTML_LANG[l] || "zh-CN";
  }
}
