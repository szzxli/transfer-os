"use strict";
/* Transfer OS 学期规划（#102 MVP）。
 * 入口：对比结果页待修清单卡片里的“按学期排课”按钮。
 * 数据只来自两处：① 本页读对比表单（transferos_cmp_form）后调 cp_compare() 重算；
 * ② 已选目标的原始报告映射（ARTIC_DATA），学分只取 articulated 行的 cu 字段——从不编造。
 * 贪心：每轮挑“能补最多未满足要求”的课（一课多用优先），再按 15 学分/学期装箱。
 * 依赖：i18n.js 的 t() / initLang()，comparator.js 的 cp_compare / cp_loadReports /
 * cp_findReport / cp_normCode / cp_parseGroup，artic-boot 注入的 ARTIC_DATA。
 */
var SEM_CAP = 15;                 /* 每学期学分上限 */
var SEM_LS_KEY = "transferos_semester_plan_v1";
var SEM_PLAN_LANG_KEY = "transferos_plan_lang";

/* 本页字符串自带 6 语字典（zh-CN / zh-TW / en / es / ko / ja），
 * 与共享 i18n.js 的 3 语分开，切换走本页的语言选择器。 */
var PLAN_I18N = {
  "zh-CN": {
    title: "Transfer OS · 按学期排课", h1: "按学期排课",
    sub: "把还没修的课排进剩下的学期。一课多用的课先排，每学期上限 15 学分。",
    back: "← 回对比页", plan_lang: "规划语言", sems_label: "剩余学期数",
    btn_rebuild: "重新排", saved: "已保存到本机 ✓",
    sem_title: "第 {n} 学期", sem_total: "共 {u} 学分",
    unplaced_title: "未排入",
    unplaced_hint: "学期排满了，或是被你移出来的课。增加学期数再重新排，或点「加回」移回去。",
    all_done: "全部要求都已覆盖，没有要排的课了。",
    no_data: "先去对比页选学校、专业和已修课，再回来排学期。",
    covers: "满足", cap_msg: "这学期已经 15 学分了，移不过去。",
    disclaimer: "非官方，以 ASSIST 和 counselor 为准。",
    summary: "共 {n} 门课，{u} 学分，分 {s} 个学期",
    move_up: "移到上一学期", move_down: "移到下一学期", remove: "移出本学期",
    add_back: "加回", no_units: "学分未注明",
    overflow_note: "学期数不够，剩下的课没排进去。增加学期数再重新排。",
    noagree_note: "以下目标没有协议，排不进去：{names}",
    after_transfer_title: "只能转学后修的课（社区大学没有对应课程）",
    unplannable_note: "以下要求在数据里没有可选课程，请到 ASSIST 核实：{list}"
  },
  "zh-TW": {
    title: "Transfer OS · 按學期排課", h1: "按學期排課",
    sub: "把還沒修的課排進剩下的學期。一課多用的課先排，每學期上限 15 學分。",
    back: "← 回對比頁", plan_lang: "規劃語言", sems_label: "剩餘學期數",
    btn_rebuild: "重新排", saved: "已儲存到本機 ✓",
    sem_title: "第 {n} 學期", sem_total: "共 {u} 學分",
    unplaced_title: "未排入",
    unplaced_hint: "學期排滿了，或是被你移出來的課。增加學期數再重新排，或點「加回」移回去。",
    all_done: "全部要求都已覆蓋，沒有要排的課了。",
    no_data: "先去對比頁選學校、專業和已修課，再回來排學期。",
    covers: "滿足", cap_msg: "這學期已經 15 學分了，移不過去。",
    disclaimer: "非官方，以 ASSIST 和 counselor 為準。",
    summary: "共 {n} 門課，{u} 學分，分 {s} 個學期",
    move_up: "移到上一學期", move_down: "移到下一學期", remove: "移出本學期",
    add_back: "加回", no_units: "學分未註明",
    overflow_note: "學期數不夠，剩下的課沒排進去。增加學期數再重新排。",
    noagree_note: "以下目標沒有協議，排不進去：{names}",
    after_transfer_title: "只能轉學後修的課（社區大學沒有對應課程）",
    unplannable_note: "以下要求在數據裡沒有可選課程，請到 ASSIST 核實：{list}"
  },
  "en": {
    title: "Transfer OS · Semester Planner", h1: "Semester Planner",
    sub: "Arrange the courses you still need into your remaining semesters. Courses that satisfy multiple campuses go first. 15 units max per semester.",
    back: "← Back to compare", plan_lang: "Planner language", sems_label: "Semesters left",
    btn_rebuild: "Re-plan", saved: "Saved on this device ✓",
    sem_title: "Semester {n}", sem_total: "{u} units total",
    unplaced_title: "Not placed",
    unplaced_hint: "Semesters are full, or courses you moved out. Add more semesters and re-plan, or tap “Add back”.",
    all_done: "All requirements are covered — nothing left to plan.",
    no_data: "Pick your college, major and completed courses on the compare page first, then come back to plan.",
    covers: "Satisfies", cap_msg: "This semester is already at 15 units — can't move it there.",
    disclaimer: "Unofficial — verify with ASSIST and your counselor.",
    summary: "{n} courses, {u} units, in {s} semesters",
    move_up: "Move to previous semester", move_down: "Move to next semester",
    remove: "Remove from this semester", add_back: "Add back", no_units: "units not listed",
    overflow_note: "Not enough semesters — the remaining courses did not fit. Add semesters and re-plan.",
    noagree_note: "No agreement for these targets — they can't be planned: {names}",
    after_transfer_title: "Courses you can only take after transfer (no community-college equivalent)",
    unplannable_note: "These requirements have no options in the data — check ASSIST: {list}"
  },
  "es": {
    title: "Transfer OS · Plan por semestre", h1: "Plan por semestre",
    sub: "Distribuye las materias que te faltan en tus semestres restantes. Las materias que sirven para varios campus van primero. Máximo 15 unidades por semestre.",
    back: "← Volver a comparar", plan_lang: "Idioma del plan", sems_label: "Semestres restantes",
    btn_rebuild: "Volver a planear", saved: "Guardado en este dispositivo ✓",
    sem_title: "Semestre {n}", sem_total: "{u} unidades en total",
    unplaced_title: "Sin asignar",
    unplaced_hint: "Los semestres están llenos, o son materias que moviste fuera. Agrega semestres y vuelve a planear, o toca «Volver a agregar».",
    all_done: "Todos los requisitos están cubiertos — no queda nada que planear.",
    no_data: "Primero elige tu universidad, carrera y materias completadas en la página de comparación, y vuelve a planear.",
    covers: "Satisface", cap_msg: "Este semestre ya tiene 15 unidades — no cabe.",
    disclaimer: "No oficial — verifica con ASSIST y tu consejero/a.",
    summary: "{n} materias, {u} unidades, en {s} semestres",
    move_up: "Mover al semestre anterior", move_down: "Mover al semestre siguiente",
    remove: "Quitar de este semestre", add_back: "Volver a agregar",
    no_units: "unidades no indicadas",
    overflow_note: "No alcanzan los semestres — las materias restantes no cupieron. Agrega semestres y vuelve a planear.",
    noagree_note: "No hay convenio con estos destinos — no se pueden planear: {names}",
    after_transfer_title: "Materias que solo se pueden cursar después de transferirse (sin equivalente en el community college)",
    unplannable_note: "Estos requisitos no tienen opciones en los datos — verifica en ASSIST: {list}"
  },
  "ko": {
    title: "Transfer OS · 학기 계획", h1: "학기 계획",
    sub: "아직 듣지 않은 과목을 남은 학기에 배치합니다. 여러 캠퍼스에 통용되는 과목부터 배치합니다. 학기당 최대 15학점.",
    back: "← 비교로 돌아가기", plan_lang: "계획 언어", sems_label: "남은 학기 수",
    btn_rebuild: "다시 배치", saved: "이 기기에 저장됨 ✓",
    sem_title: "제{n}학기", sem_total: "총 {u}학점",
    unplaced_title: "미배치",
    unplaced_hint: "학기가 가득 찼거나 직접 빼낸 과목입니다. 학기 수를 늘리고 다시 배치하거나 “다시 추가”를 누르세요.",
    all_done: "모든 요건을 충족했습니다 — 배치할 과목이 없습니다.",
    no_data: "먼저 비교 페이지에서 대학, 전공, 이수 과목을 선택한 뒤 돌아오세요.",
    covers: "충족", cap_msg: "이 학기는 이미 15학점입니다 — 옮길 수 없습니다.",
    disclaimer: "비공식 자료 — ASSIST와 카운슬러에게 확인하세요.",
    summary: "총 {n}과목, {u}학점, {s}학기",
    move_up: "이전 학기로 이동", move_down: "다음 학기로 이동",
    remove: "이 학기에서 빼내기", add_back: "다시 추가", no_units: "학점 미표기",
    overflow_note: "학기 수가 부족해 남은 과목이 배치되지 않았습니다. 학기 수를 늘리고 다시 배치하세요.",
    noagree_note: "다음 대학과는 협약이 없어 배치할 수 없습니다: {names}",
    after_transfer_title: "편입 후에야 들을 수 있는 과목(커뮤니티 칼리지 대응 과목 없음)",
    unplannable_note: "다음 요건은 데이터에 선택지가 없습니다 — ASSIST에서 확인하세요: {list}"
  },
  "ja": {
    title: "Transfer OS · 学期プラン", h1: "学期プラン",
    sub: "まだ履修していない科目を残りの学期に振り分けます。複数のキャンパスで使える科目を優先します。学期あたり最大15単位。",
    back: "← 比較に戻る", plan_lang: "プランの言語", sems_label: "残りの学期数",
    btn_rebuild: "振り分け直す", saved: "この端末に保存しました ✓",
    sem_title: "第{n}学期", sem_total: "合計 {u} 単位",
    unplaced_title: "未配置",
    unplaced_hint: "学期がいっぱいか、自分で外した科目です。学期数を増やして振り分け直すか、「戻す」を押してください。",
    all_done: "要件はすべて満たしています — 振り分ける科目はありません。",
    no_data: "先に比較ページで大学・専攻・履修済み科目を選んでから戻ってください。",
    covers: "満たす要件", cap_msg: "この学期はすでに15単位です — 移動できません。",
    disclaimer: "非公式 — ASSISTとカウンセラーに確認してください。",
    summary: "計 {n} 科目、{u} 単位、{s} 学期",
    move_up: "前の学期へ移動", move_down: "次の学期へ移動",
    remove: "この学期から外す", add_back: "戻す", no_units: "単位数不明",
    overflow_note: "学期数が足りず、残りの科目が入りませんでした。学期数を増やして振り分け直してください。",
    noagree_note: "次の大学とは協定がなく、配置できません：{names}",
    after_transfer_title: "編入後にしか履修できない科目（コミュニティカレッジに対応科目なし）",
    unplannable_note: "次の要件はデータに選択肢がありません — ASSISTで確認してください：{list}"
  }
};

/* ---------------- 语言 ---------------- */
function sem_pickPlanLang() {
  try {
    var saved = localStorage.getItem(SEM_PLAN_LANG_KEY);
    if (saved && PLAN_I18N[saved]) return saved;
    var app = localStorage.getItem("transferos_lang") || "";
    if (app === "zh") return "zh-CN";
    if (PLAN_I18N[app]) return app;
  } catch (e) { /* 忽略 */ }
  var nav = (navigator.language || "").toLowerCase();
  if (nav.indexOf("zh-tw") === 0 || nav.indexOf("zh-hk") === 0 || nav.indexOf("zh-mo") === 0) return "zh-TW";
  if (nav.indexOf("ko") === 0) return "ko";
  if (nav.indexOf("ja") === 0) return "ja";
  if (nav.indexOf("es") === 0) return "es";
  if (nav.indexOf("en") === 0) return "en";
  return "zh-CN";
}
var SEM_LANG = sem_pickPlanLang();

function sem_t(key, vars) {
  var d = PLAN_I18N[SEM_LANG] || PLAN_I18N["en"];
  var s = d[key];
  if (s === undefined) s = PLAN_I18N["en"][key];
  if (s === undefined) s = PLAN_I18N["zh-CN"][key];
  if (s === undefined) return key;
  if (vars) for (var k in vars) s = s.split("{" + k + "}").join(String(vars[k]));
  return s;
}
function sem_esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function sem_applyDict() {
  document.querySelectorAll("[data-pi18n]").forEach(function (el) {
    el.textContent = sem_t(el.getAttribute("data-pi18n"));
  });
  document.title = sem_t("title");
}

/* ---------------- 纯逻辑（可在 Node 里用真实数据单测） ---------------- */
/* 课程键带学校归属（"学校|FLAT"）：同一代码在两所 CC 可能对应不同协议，
 * planner 内部一律用带归属的键，显示时再拆出课号与学校。 */
function sem_pairKey(cc, flat) { return cp_normLabel(cc || "") + "|" + (flat || ""); }
function sem_flatOf(key) { var i = (key || "").indexOf("|"); return i < 0 ? (key || "") : key.slice(i + 1); }
function sem_ccOf(key) { var i = (key || "").indexOf("|"); return i < 0 ? "" : key.slice(0, i); }
/* 从 cp_compare 结果重建带归属的已修课集合 */
function sem_takenSet(result) {
  var s = new Set();
  var perCc = (result && result.student_courses_by_cc) || [];
  for (var i = 0; i < perCc.length; i++)
    for (var j = 0; j < (perCc[i].courses || []).length; j++)
      s.add(sem_pairKey(perCc[i].cc_name, cp_normCode(perCc[i].courses[j]).replace(/ /g, "")));
  return s;
}
/* 把一份报告的 articulated 映射按“目标课程要求 → 课组”还原。
 * 与 cp_groupArticulated / cp_compareOne 相同的组语义：组之间任选其一（Or），
 * And 组内都要修，Or 组内任选其一。返回 {target_code: [{conj, codes[]}]}。
 * codes 里是带归属的键（"学校|FLAT"），同一代码在两所学校算两个候选。 */
function sem_buildGroups(report) {
  var groups = {};
  var ms = (report && report.mappings) || [];
  for (var i = 0; i < ms.length; i++) {
    var m = ms[i];
    if (m.status !== "articulated" || !m.target_code) continue;
    var g = cp_parseGroup(m.section);
    var code = sem_pairKey(m.source_cc || (report && report.cc_name) || "", cp_normCode(m.cc_code).replace(/ /g, ""));
    if (!code) continue;
    if (!groups[m.target_code]) groups[m.target_code] = {};
    if (!groups[m.target_code][g[0]]) groups[m.target_code][g[0]] = { conj: g[1], codes: [] };
    if (groups[m.target_code][g[0]].codes.indexOf(code) === -1)
      groups[m.target_code][g[0]].codes.push(code);
  }
  return groups;
}
function sem_groupDone(g, have) {
  if ((g.conj || "And").toLowerCase() === "or")
    return g.codes.some(function (c) { return have.has(c); });
  return g.codes.length > 0 && g.codes.every(function (c) { return have.has(c); });
}
function sem_reqDone(req, have) {
  return req.groups.some(function (g) { return sem_groupDone(g, have); });
}
/* 从 cp_compare() 结果里收集所有 status=missing 的要求。 */
function sem_collectReqs(result, reportsByTarget) {
  var reqs = [], unplannable = [];
  var targets = (result && result.targets) || [];
  for (var t = 0; t < targets.length; t++) {
    var tt = targets[t];
    if (tt.status !== "ok") continue;
    var groups = sem_buildGroups(reportsByTarget[tt.target_name]);
    var items = tt.items || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.status !== "missing") continue;
      var byGi = groups[it.target_code] || {};
      var glist = Object.keys(byGi).map(Number).sort(function (a, b) { return a - b; })
        .map(function (k) { return byGi[k]; });
      if (!glist.length) { unplannable.push(tt.target_name + " " + it.target_code); continue; }
      reqs.push({ target: tt.target_name, code: it.target_code, title: it.target_title || "", groups: glist });
    }
  }
  return { reqs: reqs, unplannable: unplannable };
}
/* 贪心选课：每轮挑“出现在最多未满足要求里”的课（多用优先）；
 * 平局时学分小的先、再按课号字母序（保证确定性）。
 * 返回按挑选顺序排列的课号（均为规范化课号）。 */
function sem_pickOrder(reqs, takenSet, unitsMap) {
  var have = new Set(takenSet);
  /* 同一课号在两所学校只排一次：已修/已选按课号（不带学校）去重 */
  var haveFlat = new Set();
  have.forEach(function (k) { haveFlat.add(sem_flatOf(k)); });
  var uncovered = reqs.slice();
  var order = [], used = new Set();
  var guard = 0;
  while (uncovered.length && guard++ < 10000) {
    var score = {};
    for (var i = 0; i < uncovered.length; i++) {
      var seen = {};
      for (var g = 0; g < uncovered[i].groups.length; g++) {
        for (var c = 0; c < uncovered[i].groups[g].codes.length; c++) {
          var code = uncovered[i].groups[g].codes[c];
          if (!code || have.has(code) || used.has(code) || seen[code]) continue;
          if (haveFlat.has(sem_flatOf(code)) || used.has(sem_flatOf(code))) continue;
          seen[code] = 1;
          score[code] = (score[code] || 0) + 1;
        }
      }
    }
    var codes = Object.keys(score);
    if (!codes.length) break;
    codes.sort(function (a, b) {
      if (score[b] !== score[a]) return score[b] - score[a];
      var ua = (unitsMap[a] || 0), ub = (unitsMap[b] || 0);
      if (ua !== ub) return ua - ub;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    var pick = codes[0];
    order.push(pick);
    used.add(pick);
    used.add(sem_flatOf(pick));
    have.add(pick);
    haveFlat.add(sem_flatOf(pick));
    uncovered = uncovered.filter(function (r) { return !sem_reqDone(r, have); });
  }
  return order;
}
/* 按挑选顺序装箱：每学期上限 cap 学分，装不下的进未排入。 */
function sem_pack(order, unitsMap, nSem, cap) {
  var sems = [], i, s;
  for (i = 0; i < nSem; i++) sems.push([]);
  var unplaced = [];
  for (i = 0; i < order.length; i++) {
    var code = order[i], u = unitsMap[code] || 0, placed = false;
    for (s = 0; s < sems.length; s++) {
      var tot = 0;
      for (var j = 0; j < sems[s].length; j++) tot += unitsMap[sems[s][j]] || 0;
      if (tot + u <= cap) { sems[s].push(code); placed = true; break; }
    }
    if (!placed) unplaced.push(code);
  }
  return { sems: sems, unplaced: unplaced };
}

/* ---------------- 状态 ---------------- */
var S = {
  loaded: false, form: null, result: null, reqs: [], unplannable: [],
  noArt: [], noAgree: [], units: {}, titles: {}, covers: {},
  nSem: 4, order: [], sems: [], unplaced: [], fp: "", flash: ""
};
function sem_semUnits(i) {
  var tot = 0;
  for (var j = 0; j < (S.sems[i] || []).length; j++) tot += S.units[S.sems[i][j]] || 0;
  return tot;
}
function sem_fmtUnits(u) { return String(Math.round(u * 10) / 10); }
function sem_save() {
  try {
    localStorage.setItem(SEM_LS_KEY, JSON.stringify({
      fp: S.fp, nSem: S.nSem, order: S.order, sems: S.sems, unplaced: S.unplaced, ts: Date.now()
    }));
    S.flash = sem_t("saved");
  } catch (e) { /* 忽略 */ }
}
function sem_coversText(code) {
  var list = S.covers[code] || [];
  var shown = list.slice(0, 4).map(function (c) { return c.target + " " + c.code; });
  if (list.length > 4) shown.push("+" + (list.length - 4));
  return shown.join(" · ");
}

/* ---------------- 构建 ---------------- */
function sem_build() {
  var form = {};
  try { form = JSON.parse(localStorage.getItem("transferos_cmp_form") || "{}"); } catch (e) { form = {}; }
  S.form = form;
  S.noArt = []; S.noAgree = []; S.nSem = 4; S.flash = "";
  if (!form.cc_name || !(form.targets || []).length) { S.loaded = true; sem_render(); return; }
  var taken = (form.courses || "").split(/[\n,，;；]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  var taken2 = (form.courses2 || "").split(/[\n,，;；]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  var reports = cp_loadReports();
  var result = cp_compare(form.cc_name, form.major_query || "", form.targets, taken, form.cc2_name || "", taken2);
  S.result = result;
  var reportsByTarget = {}, units = {}, titles = {}, covers = {};
  for (var t = 0; t < result.targets.length; t++) {
    var tt = result.targets[t];
    if (tt.status !== "ok") { S.noAgree.push(tt.target_name); continue; }
    /* 两所学校的目标报告先合并（带 source_cc），再按组还原要求 */
    var reps = [];
    var rep1 = cp_findReport(reports, form.cc_name, tt.target_name, form.major_query || "");
    if (rep1) reps.push(rep1);
    if (form.cc2_name) {
      var rep2 = cp_findReport(reports, form.cc2_name, tt.target_name, form.major_query || "");
      if (rep2 && rep2 !== rep1) reps.push(rep2);
    }
    var rep = reps.length > 1 ? cp_mergeReports(reps) : (reps[0] || null);
    reportsByTarget[tt.target_name] = rep;
    if (!rep) continue;
    for (var m = 0; m < rep.mappings.length; m++) {
      var map = rep.mappings[m];
      if (map.status !== "articulated" || !map.cc_code) continue;
      var nc = sem_pairKey(map.source_cc || rep.cc_name || "", cp_normCode(map.cc_code).replace(/ /g, ""));
      var u = parseFloat(map.cc_units);
      if (!isNaN(u) && u > 0) units[nc] = Math.max(units[nc] || 0, u);
      if (!titles[nc]) titles[nc] = map.cc_title || "";
    }
    var items = tt.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].status === "no_articulation")
        S.noArt.push({ target: tt.target_name, code: items[i].target_code, title: items[i].target_title || "" });
    }
  }
  S.units = units; S.titles = titles;
  var collected = sem_collectReqs(result, reportsByTarget);
  S.reqs = collected.reqs; S.unplannable = collected.unplannable;
  for (var r = 0; r < S.reqs.length; r++) {
    var req = S.reqs[r], seen = {};
    for (var g = 0; g < req.groups.length; g++)
      for (var c = 0; c < req.groups[g].codes.length; c++) {
        var code = req.groups[g].codes[c];
        if (seen[code]) continue;
        seen[code] = 1;
        if (!covers[code]) covers[code] = [];
        covers[code].push({ target: req.target, code: req.code });
      }
  }
  S.covers = covers;
  S.fp = JSON.stringify({
    cc: form.cc_name, cc2: form.cc2_name || "", major: form.major_query || "",
    targets: (form.targets || []).slice().sort(), taken: result.student_courses
  });
  /* 恢复已存的手动调整；表单变了就重新排。 */
  var restored = false;
  try {
    var saved = JSON.parse(localStorage.getItem(SEM_LS_KEY) || "null");
    if (saved && saved.fp === S.fp && Array.isArray(saved.sems) && Array.isArray(saved.order)) {
      var order = sem_pickOrder(S.reqs, sem_takenSet(result), S.units);
      var flat = [];
      saved.sems.forEach(function (arr) { (arr || []).forEach(function (c) { flat.push(c); }); });
      (saved.unplaced || []).forEach(function (c) { flat.push(c); });
      var orderSet = {};
      order.forEach(function (c) { orderSet[c] = 1; });
      var ok = flat.length === order.length && flat.every(function (c) { return orderSet[c]; })
        && new Set(flat).size === flat.length;
      if (ok) {
        S.nSem = Math.max(1, Math.min(8, saved.nSem | 0 || 4));
        S.order = saved.order; S.sems = saved.sems; S.unplaced = saved.unplaced || [];
        restored = true;
      }
    }
  } catch (e) { /* 忽略，重新排 */ }
  if (!restored) {
    S.order = sem_pickOrder(S.reqs, sem_takenSet(result), S.units);
    var p = sem_pack(S.order, S.units, S.nSem, SEM_CAP);
    S.sems = p.sems; S.unplaced = p.unplaced;
    sem_save();
  }
  S.loaded = true;
  sem_render();
}

/* ---------------- 操作 ---------------- */
function sem_flash(msg) {
  S.flash = msg;
  sem_render();
  setTimeout(function () { S.flash = ""; sem_render(); }, 3000);
}
function sem_move(code, from, dir) {
  var to = from + dir;
  if (to < 0 || to >= S.sems.length) return;
  if (S.sems[from].indexOf(code) < 0) return;
  if (sem_semUnits(to) + (S.units[code] || 0) > SEM_CAP) { sem_flash(sem_t("cap_msg")); return; }
  S.sems[from].splice(S.sems[from].indexOf(code), 1);
  S.sems[to].push(code);
  sem_save(); sem_render();
}
function sem_remove(code, from) {
  var idx = S.sems[from].indexOf(code);
  if (idx < 0) return;
  S.sems[from].splice(idx, 1);
  if (S.unplaced.indexOf(code) < 0) S.unplaced.push(code);
  sem_save(); sem_render();
}
function sem_addBack(code) {
  var idx = S.unplaced.indexOf(code);
  if (idx < 0) return;
  var u = S.units[code] || 0;
  for (var i = 0; i < S.sems.length; i++) {
    if (sem_semUnits(i) + u <= SEM_CAP) {
      S.unplaced.splice(idx, 1);
      S.sems[i].push(code);
      sem_save(); sem_render();
      return;
    }
  }
  sem_flash(sem_t("cap_msg"));
}
function sem_rebuild() {
  var nEl = document.getElementById("semN");
  if (nEl) S.nSem = Math.max(1, Math.min(8, parseInt(nEl.value, 10) || 4));
  S.order = sem_pickOrder(S.reqs, sem_takenSet(S.result), S.units);
  var p = sem_pack(S.order, S.units, S.nSem, SEM_CAP);
  S.sems = p.sems; S.unplaced = p.unplaced;
  sem_save(); sem_render();
}
function sem_setN(n) {
  n = Math.max(1, Math.min(8, n | 0 || 4));
  if (n === S.nSem) return;
  S.nSem = n;
  var order = [];
  S.sems.forEach(function (arr) { order.push.apply(order, arr); });
  order.push.apply(order, S.unplaced);
  var p = sem_pack(order, S.units, S.nSem, SEM_CAP);
  S.sems = p.sems; S.unplaced = p.unplaced;
  sem_save(); sem_render();
}

/* ---------------- 渲染 ---------------- */
function sem_courseRow(code, semIdx) {
  var u = S.units[code];
  var unitLabel = (u === undefined) ? sem_t("no_units") : sem_fmtUnits(u) + "u";
  /* 带归属的键显示为“课号（学校）”，如 MATH 1A (De Anza College) */
  var disp = sem_flatOf(code).replace(/([A-Za-z]+)(\d)/, "$1 $2");
  var ccName = sem_ccOf(code);
  var h = '<div class="req"><span class="code">' + sem_esc(disp) + '</span>'
    + (ccName ? ' <span class="hint">(' + sem_esc(ccName) + ')</span>' : '')
    + ' <span class="ttl">' + sem_esc(S.titles[code] || "") + '</span>'
    + ' <span class="tag">' + sem_esc(unitLabel) + '</span>'
    + '<div class="hint">' + sem_esc(sem_t("covers")) + (/^zh|^ja/.test(SEM_LANG || "") ? '：' : ': ') + sem_esc(sem_coversText(code)) + '</div>'
    + '<div class="btn-row" style="margin-top:6px">';
  if (semIdx === -1) {
    h += '<button class="btn ghost sm" data-act="add" data-code="' + sem_esc(code) + '">' + sem_esc(sem_t("add_back")) + '</button>';
  } else {
    if (semIdx > 0) h += '<button class="btn ghost sm" title="' + sem_esc(sem_t("move_up")) + '" data-act="up" data-code="' + sem_esc(code) + '" data-from="' + semIdx + '">↑</button>';
    if (semIdx < S.sems.length - 1) h += '<button class="btn ghost sm" title="' + sem_esc(sem_t("move_down")) + '" data-act="down" data-code="' + sem_esc(code) + '" data-from="' + semIdx + '">↓</button>';
    h += '<button class="btn ghost sm" title="' + sem_esc(sem_t("remove")) + '" data-act="rm" data-code="' + sem_esc(code) + '" data-from="' + semIdx + '">✕</button>';
  }
  return h + '</div></div>';
}
function sem_render() {
  var box = document.getElementById("plan");
  if (!box) return;
  if (!S.loaded) { box.innerHTML = '<div class="hint">…</div>'; return; }
  if (!S.form || !S.form.cc_name || !(S.form.targets || []).length) {
    box.innerHTML = '<div class="card"><div class="hint">' + sem_esc(sem_t("no_data")) + '</div>'
      + '<div class="btn-row" style="margin-top:12px"><a class="btn" style="text-align:center;text-decoration:none" href="compare.html">' + sem_esc(sem_t("back")) + '</a></div></div>';
    return;
  }
  var h = '<div class="hint">' + sem_esc(S.form.cc_name)
    + (S.form.cc2_name ? ' + ' + sem_esc(S.form.cc2_name) : '')
    + ' → ' + sem_esc(S.form.major_query || "")
    + ' · ' + S.result.targets.map(function (x) { return sem_esc(x.target_name); }).join("、") + '</div>';
  if (S.noAgree.length)
    h += '<div class="hint" style="margin-top:6px">' + sem_esc(sem_t("noagree_note", { names: S.noAgree.join("、") })) + '</div>';
  if (!S.reqs.length) {
    h += '<div class="card" style="margin-top:12px"><div class="hint">✅ ' + sem_esc(sem_t("all_done")) + '</div></div>';
  } else {
    var totalUnits = 0;
    S.order.forEach(function (c) { totalUnits += S.units[c] || 0; });
    h += '<div class="hint" style="margin-top:6px">' + sem_esc(sem_t("summary", { n: S.order.length, u: sem_fmtUnits(totalUnits), s: S.nSem })) + '</div>';
    if (S.flash) h += '<div class="hint" style="margin-top:6px">' + sem_esc(S.flash) + '</div>';
    h += '<div class="f"><label for="semN">' + sem_esc(sem_t("sems_label")) + '</label>'
      + '<input type="number" id="semN" min="1" max="8" value="' + S.nSem + '"></div>'
      + '<div class="btn-row"><button class="btn" id="rebuildBtn">' + sem_esc(sem_t("btn_rebuild")) + '</button></div>';
    for (var i = 0; i < S.sems.length; i++) {
      h += '<div class="card"><div class="section-title">' + sem_esc(sem_t("sem_title", { n: i + 1 }))
        + ' <span class="hint">' + sem_esc(sem_t("sem_total", { u: sem_fmtUnits(sem_semUnits(i)) })) + '</span></div>';
      if (!S.sems[i].length) h += '<div class="hint">—</div>';
      for (var j = 0; j < S.sems[i].length; j++) h += sem_courseRow(S.sems[i][j], i);
      h += '</div>';
    }
    if (S.unplaced.length) {
      var roomForFirst = false;
      for (var k = 0; k < S.sems.length; k++)
        if (sem_semUnits(k) + (S.units[S.unplaced[0]] || 0) <= SEM_CAP) roomForFirst = true;
      h += '<div class="card"><div class="section-title">' + sem_esc(sem_t("unplaced_title")) + '</div>'
        + '<div class="hint">' + sem_esc(roomForFirst ? sem_t("unplaced_hint") : sem_t("overflow_note")) + '</div>';
      for (var u2 = 0; u2 < S.unplaced.length; u2++) h += sem_courseRow(S.unplaced[u2], -1);
      h += '</div>';
    }
  }
  if (S.noArt.length) {
    h += '<div class="card"><div class="section-title">' + sem_esc(sem_t("after_transfer_title")) + '</div>';
    S.noArt.forEach(function (x) {
      h += '<div class="req"><span class="code">' + sem_esc(x.code) + '</span>'
        + ' <span class="ttl">' + sem_esc(x.title) + '</span>'
        + '<div class="hint">' + sem_esc(x.target) + '</div></div>';
    });
    h += '</div>';
  }
  if (S.unplannable.length)
    h += '<div class="alert">' + sem_esc(sem_t("unplannable_note", { list: S.unplannable.join("、") })) + '</div>';
  box.innerHTML = h;
  var nEl = document.getElementById("semN");
  if (nEl) nEl.addEventListener("change", function () { sem_setN(parseInt(nEl.value, 10)); });
  var rb = document.getElementById("rebuildBtn");
  if (rb) rb.addEventListener("click", sem_rebuild);
}

/* ---------------- 启动 ---------------- */
document.addEventListener("DOMContentLoaded", function () {
  initLang();
  sem_applyDict();
  var sel = document.getElementById("planLang");
  if (sel) {
    sel.value = SEM_LANG;
    sel.addEventListener("change", function () {
      if (!PLAN_I18N[sel.value]) return;
      SEM_LANG = sel.value;
      try { localStorage.setItem(SEM_PLAN_LANG_KEY, SEM_LANG); } catch (e) { /* 忽略 */ }
      sem_applyDict();
      sem_render();
    });
  }
  var box = document.getElementById("plan");
  if (box) box.addEventListener("click", function (ev) {
    var btn = ev.target.closest ? ev.target.closest("button[data-act]") : null;
    if (!btn) return;
    var act = btn.getAttribute("data-act"), code = btn.getAttribute("data-code");
    var from = parseInt(btn.getAttribute("data-from") || "0", 10);
    if (act === "up") sem_move(code, from, -1);
    else if (act === "down") sem_move(code, from, 1);
    else if (act === "rm") sem_remove(code, from);
    else if (act === "add") sem_addBack(code);
  });
  /* ARTIC_READY 是 artic-boot 的解压 Promise：必须等它完成再算，否则 ARTIC_DATA 还是空数组。 */
  Promise.resolve(window.ARTIC_READY).then(sem_build, sem_build);
});
/* 共享语言切换器（zh/en/es）会调它：只重刷本页字典与渲染，规划语言选择不变。 */
window.__reRender = function () { sem_applyDict(); sem_render(); };
