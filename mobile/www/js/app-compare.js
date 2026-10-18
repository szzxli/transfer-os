/* Articulation 对比器页面逻辑（纯静态，离线可用，三语） */
"use strict";

const LS_KEY = "transferos_cmp_form";
let CMP_OPTS = null;
let CMP_SAVED = {};
let lastCmpResult = null;

function cmp_escape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* 我的规划：命名保存多套方案（localStorage，最多 20 套） */
const PLANS_KEY = "transferos_cmp_plans";
function cmp_getPlans() {
  try { return JSON.parse(localStorage.getItem(PLANS_KEY) || "[]"); }
  catch (e) { return []; }
}
function cmp_setPlans(plans) {
  try { localStorage.setItem(PLANS_KEY, JSON.stringify(plans.slice(0, 20))); } catch (e) { /* 忽略 */ }
}
function cmp_planData() {
  return {
    cc_name: document.getElementById("cc").value,
    major_query: document.getElementById("major").value.trim(),
    targets: [...document.querySelectorAll("#targets .chip.on")].map(c => c.dataset.v),
    courses: document.getElementById("courses").value,
    gpa: document.getElementById("gpa").value.trim(),
  };
}
function cmp_savePlan() {
  const nameEl = document.getElementById("planName");
  const name = (nameEl.value || "").trim() || t("plan_untitled");
  const plans = cmp_getPlans();
  plans.unshift({ id: Date.now(), name, ts: Date.now(), data: cmp_planData() });
  cmp_setPlans(plans);
  nameEl.value = "";
  cmp_renderPlans();
}
function cmp_loadPlan(id) {
  const p = cmp_getPlans().find(x => x.id === id);
  if (!p) return;
  const d = p.data || {};
  const cc = document.getElementById("cc");
  if (d.cc_name) cc.value = d.cc_name;
  document.getElementById("major").value = d.major_query || "";
  document.getElementById("courses").value = d.courses || "";
  document.getElementById("gpa").value = d.gpa || "";
  try {
    CMP_SAVED = Object.assign(CMP_SAVED || {}, { cc_name: d.cc_name, major_query: d.major_query, courses: d.courses, gpa: d.gpa, targets: d.targets });
  } catch (e) { /* 忽略 */ }
  cmp_renderMajors();
  cmp_buildCourseIndex();
  cmp_showStep(d.major_query ? 2 : 1);
  cmp_countCourses();
}
function cmp_delPlan(id) {
  cmp_setPlans(cmp_getPlans().filter(x => x.id !== id));
  cmp_renderPlans();
}
/* 方案对比：存档方案 vs 当前表单，diff 课程增减 + 表单字段变化 */
function cmp_diffPlan(id) {
  const p = cmp_getPlans().find(x => x.id === id);
  if (!p) return;
  const cur = cmp_planData(), old = p.data || {};
  const splitC = s => String(s || "").split(/[\n,，;；]+/).map(x => x.trim()).filter(Boolean);
  const key = s => s.toUpperCase().replace(/\s+/g, " ");
  const curC = splitC(cur.courses), oldC = splitC(old.courses);
  const curSet = new Set(curC.map(key)), oldSet = new Set(oldC.map(key));
  const added = curC.filter(c => !oldSet.has(key(c)));
  const removed = oldC.filter(c => !curSet.has(key(c)));
  const meta = [];
  const fld = (label, a, b) => {
    a = String(a == null ? "" : a).trim(); b = String(b == null ? "" : b).trim();
    if (a !== b) meta.push(t("diff_change", { f: label, a: a || "—", b: b || "—" }));
  };
  fld(t("f_cc"), old.cc_name, cur.cc_name);
  fld(t("f_major2"), old.major_query, cur.major_query);
  fld(t("f_targets"), (old.targets || []).join("、"), (cur.targets || []).join("、"));
  fld(t("f_gpa"), old.gpa, cur.gpa);
  let html = `<div class="card"><div class="section-title">${cmp_escape(t("diff_title", { name: p.name }))}</div>`;
  if (meta.length) html += meta.map(m => `<div class="req"><div class="hint">${cmp_escape(m)}</div></div>`).join("");
  html += `<div class="hint" style="margin-top:6px">${cmp_escape(t("diff_course_sec"))}</div>`;
  const cl = [];
  if (added.length) cl.push(`<div class="diff-add">+ ${cmp_escape(added.join("、"))}</div>`);
  if (removed.length) cl.push(`<div class="diff-del">− ${cmp_escape(removed.join("、"))}</div>`);
  html += cl.join("") || `<div class="hint">${cmp_escape(t("diff_same"))}</div>`;
  html += `</div>`;
  const box = document.getElementById("planDiff");
  box.innerHTML = html;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function cmp_renderPlans() {
  const box = document.getElementById("planList");
  if (!box) return;
  const plans = cmp_getPlans();
  box.innerHTML = plans.map(p =>
    `<div class="plan-item"><div><div class="plan-name">${cmp_escape(p.name)}</div>`
    + `<div class="hint">${cmp_escape(new Date(p.ts).toLocaleDateString())} · ${cmp_escape((p.data && p.data.major_query) || "")}</div></div>`
    + `<div class="plan-ops"><button type="button" class="linkbtn" onclick="cmp_loadPlan(${p.id})">${cmp_escape(t("plan_load"))}</button>`
    + `<button type="button" class="linkbtn" onclick="cmp_diffPlan(${p.id})">${cmp_escape(t("plan_diff"))}</button>`
    + `<button type="button" class="linkbtn danger" onclick="cmp_delPlan(${p.id})">${cmp_escape(t("plan_del"))}</button></div></div>`
  ).join("") || `<div class="hint">${cmp_escape(t("plans_empty"))}</div>`;
}

/* ---------- 新手引导巡游：coach-mark，一步步带点 ---------- */
const TOUR_KEY = "transferos_tour_done";
let TOUR_IDX = -1;
function tour_steps() {
  return [
    { sel: "#cc", tk: "tour1_t", bk: "tour1_b" },
    { sel: "#major", tk: "tour2_t", bk: "tour2_b" },
    { before: () => cmp_showStep(2), sel: "#targets", tk: "tour3_t", bk: "tour3_b" },
    { sel: "#courseSearch", tk: "tour4_t", bk: "tour4_b" },
    { sel: "#courses", tk: "tour5_t", bk: "tour5_b" },
    { sel: "#go", tk: "tour6_t", bk: "tour6_b" },
    { center: true, tk: "tour7_t", bk: "tour7_b" },
  ];
}
function tour_start() {
  if (document.getElementById("tourOverlay")) return;
  const ov = document.createElement("div");
  ov.id = "tourOverlay";
  ov.style.display = "none";
  ov.innerHTML = `<div class="tour-hole" id="tourHole"></div>
    <div class="tour-tip" id="tourTip">
      <div class="tour-title" id="tourTitle"></div>
      <div class="tour-body" id="tourBody"></div>
      <div class="tour-foot">
        <span class="hint" id="tourCount"></span>
        <span class="tour-btns">
          <button type="button" class="linkbtn" id="tourPrev"></button><button type="button" class="linkbtn" id="tourNext"></button><button type="button" class="linkbtn" id="tourSkip"></button>
        </span>
      </div>
    </div>`;
  document.body.appendChild(ov);
  document.getElementById("tourPrev").onclick = () => tour_show(TOUR_IDX - 1);
  document.getElementById("tourNext").onclick = () => tour_show(TOUR_IDX + 1);
  document.getElementById("tourSkip").onclick = tour_end;
  tour_show(0);
}
function tour_show(i) {
  const steps = tour_steps();
  if (i >= steps.length) { tour_end(); return; }
  if (i < 0) i = 0;
  TOUR_IDX = i;
  const st = steps[i];
  if (st.before) { try { st.before(); } catch (e) { /* 忽略 */ } }
  document.getElementById("tourTitle").textContent = t(st.tk);
  document.getElementById("tourBody").textContent = t(st.bk);
  document.getElementById("tourCount").textContent = (i + 1) + "/" + steps.length;
  const prev = document.getElementById("tourPrev"), next = document.getElementById("tourNext");
  prev.textContent = t("tour_prev");
  prev.style.visibility = i === 0 ? "hidden" : "visible";
  next.textContent = (i === steps.length - 1) ? t("tour_done") : t("tour_next");
  document.getElementById("tourSkip").textContent = t("tour_skip");
  const ov = document.getElementById("tourOverlay");
  const hole = document.getElementById("tourHole");
  const tip = document.getElementById("tourTip");
  if (st.center) {
    hole.style.display = "none";
    tip.style.top = "50%"; tip.style.bottom = "auto";
    tip.style.left = "16px"; tip.style.right = "16px";
    tip.style.transform = "translateY(-50%)";
    ov.style.display = "block";
    return;
  }
  const el = document.querySelector(st.sel);
  if (!el) { tour_show(i + 1); return; }
  ov.style.display = "none";
  try { el.scrollIntoView({ block: "center" }); } catch (e) { /* 忽略 */ }
  setTimeout(() => {
    if (TOUR_IDX !== i) return;
    const r = el.getBoundingClientRect();
    hole.style.display = "block";
    hole.style.top = Math.max(4, r.top - 8) + "px";
    hole.style.left = Math.max(4, r.left - 8) + "px";
    hole.style.width = (r.width + 16) + "px";
    hole.style.height = (r.height + 16) + "px";
    tip.style.transform = "none";
    tip.style.left = "16px"; tip.style.right = "16px";
    if (window.innerHeight - r.bottom > 230) {
      tip.style.top = (r.bottom + 16) + "px"; tip.style.bottom = "auto";
    } else {
      tip.style.bottom = (window.innerHeight - r.top + 16) + "px"; tip.style.top = "auto";
    }
    ov.style.display = "block";
  }, 450);
}
function tour_end() {
  const ov = document.getElementById("tourOverlay");
  if (ov) ov.remove();
  try { localStorage.setItem(TOUR_KEY, "1"); } catch (e) { /* 忽略 */ }
  TOUR_IDX = -1;
}

function cmp_init() {
  initLang();
  CMP_OPTS = cp_listOptions();
  const cc = document.getElementById("cc");
  cc.innerHTML = CMP_OPTS.ccs.map(c => `<option>${cmp_escape(c)}</option>`).join("");
  cc.onchange = function () {
    cmp_renderMajors();
    cmp_buildCourseIndex();
    if (!document.getElementById("step2").hidden) cmp_renderTargets();
  };
  try {
    CMP_SAVED = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch (e) { CMP_SAVED = {}; }
  /* 跨页打通：validate 页"去对比页分析"带过来的学校+课程+目标 */
  try {
    const ho = JSON.parse(localStorage.getItem("transferos_handoff") || "null");
    if (ho && (ho.cc_name || ho.courses)) {
      localStorage.removeItem("transferos_handoff");
      if (ho.cc_name) CMP_SAVED.cc_name = ho.cc_name;
      if (ho.major_query) CMP_SAVED.major_query = ho.major_query;
      if (ho.courses) CMP_SAVED.courses = ho.courses;
      if (Array.isArray(ho.targets) && ho.targets.length) CMP_SAVED.targets = ho.targets;
    }
  } catch (e) { /* 忽略 */ }
  if (CMP_SAVED.cc_name) cc.value = CMP_SAVED.cc_name;
  if (CMP_SAVED.major_query) document.getElementById("major").value = CMP_SAVED.major_query;
  if (CMP_SAVED.courses) document.getElementById("courses").value = CMP_SAVED.courses;
  if (CMP_SAVED.gpa) document.getElementById("gpa").value = CMP_SAVED.gpa;
  cmp_renderMajors();
  cmp_buildCourseIndex();
  cmp_renderPlans();
  cmp_showStep(CMP_SAVED.major_query ? 2 : 1);
  applyI18n();
  cmp_countCourses();
  cmp_placeholder();
  /* 首访自动巡游：没用过且没存过表单的新手 */
  try {
    if (!localStorage.getItem(TOUR_KEY) && !CMP_SAVED.major_query) {
      setTimeout(tour_start, 900);
    }
  } catch (e) { /* 忽略 */ }
  /* 首页断点恢复 / Demo 一键直达：带 autorun 参数自动跑一次对比 */
  try {
    if (new URLSearchParams(location.search).get("autorun") === "1"
        && CMP_SAVED.cc_name && (CMP_SAVED.targets || []).length) {
      setTimeout(function () { cmp_run(); }, 400);
    }
  } catch (e) { /* 忽略 */ }
}

/* 两步输入：1=学校+专业，2=目标+课程 */
function cmp_showStep(n) {
  document.getElementById("step1").hidden = n !== 1;
  document.getElementById("step2").hidden = n !== 2;
  if (n === 2) {
    cmp_renderTargets();
    if (Array.isArray(CMP_SAVED.targets)) {
      document.querySelectorAll("#targets .chip").forEach(ch => {
        ch.classList.toggle("on", CMP_SAVED.targets.includes(ch.dataset.v));
      });
    }
    cmp_countCourses();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cmp_toStep1() { cmp_showStep(1); }

function cmp_toStep2() {
  const mq = document.getElementById("major").value.trim();
  if (!mq) { document.getElementById("major").focus(); return; }
  cmp_showStep(2);
}

/* 专业自动补全：该 CC 所有目标下的专业去重 */
let CMP_MAJORS = [];
let CMP_SUGG_LIST = [];
let CMP_SUGG_IDX = -1;

function cmp_renderMajors() {
  const cc = document.getElementById("cc").value;
  const set = new Set();
  const byTgt = (CMP_OPTS.by_cc[cc]) || {};
  Object.keys(byTgt).forEach(tg => (byTgt[tg] || []).forEach(m => set.add(m)));
  CMP_MAJORS = [...set].sort();
}

/* 自定义专业自动补全：原生 datalist 在移动端体验差，自绘下拉并支持键盘 */
function cmp_suggest() {
  const inp = document.getElementById("major");
  const box = document.getElementById("majorSugg");
  const q = inp.value.trim().toLowerCase();
  CMP_SUGG_LIST = (q ? CMP_MAJORS.filter(m => m.toLowerCase().includes(q)) : CMP_MAJORS).slice(0, 8);
  CMP_SUGG_IDX = -1;
  if (!CMP_SUGG_LIST.length) { box.hidden = true; return; }
  box.innerHTML = CMP_SUGG_LIST.map((m, i) =>
    `<div class="sugg-item" data-i="${i}">${cmp_escape(m)}</div>`).join("");
  box.hidden = false;
  box.querySelectorAll(".sugg-item").forEach(el => {
    el.addEventListener("mousedown", e => {
      e.preventDefault();
      inp.value = CMP_SUGG_LIST[+el.dataset.i];
      box.hidden = true;
      inp.focus();
    });
  });
}

function cmp_suggestPaint() {
  document.querySelectorAll("#majorSugg .sugg-item").forEach((el, i) =>
    el.classList.toggle("active", i === CMP_SUGG_IDX));
}

function cmp_suggestKey(e) {
  const box = document.getElementById("majorSugg");
  if (box.hidden) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    CMP_SUGG_IDX = e.key === "ArrowDown"
      ? Math.min(CMP_SUGG_IDX + 1, CMP_SUGG_LIST.length - 1)
      : Math.max(CMP_SUGG_IDX - 1, 0);
    cmp_suggestPaint();
  } else if (e.key === "Enter" && CMP_SUGG_IDX >= 0) {
    e.preventDefault();
    document.getElementById("major").value = CMP_SUGG_LIST[CMP_SUGG_IDX];
    box.hidden = true;
  } else if (e.key === "Escape") {
    box.hidden = true;
  }
}

function cmp_suggestHide() {
  setTimeout(() => { document.getElementById("majorSugg").hidden = true; }, 150);
}

/* 按课程名找课：从 articulation 报告里建本校课程 {code, title} 索引，
 * 大一新生不用背课程代码，搜 "accounting" 也能找到 ACCT 1B */
let CMP_COURSES = [];
const CMP_COURSE_CACHE = {};
function cmp_buildCourseIndex() {
  const cc = document.getElementById("cc").value;
  if (CMP_COURSE_CACHE[cc]) { CMP_COURSES = CMP_COURSE_CACHE[cc]; return; }
  const seen = new Map();
  for (const r of cp_loadReports()) {
    if (r.cc_name !== cc) continue;
    for (const m of (r.mappings || [])) {
      if (m.cc_code && !seen.has(m.cc_code)) seen.set(m.cc_code, m.cc_title || "");
    }
  }
  CMP_COURSES = [...seen.entries()]
    .map(([code, title]) => ({ code, title }))
    .sort((a, b) => a.code < b.code ? -1 : 1);
  CMP_COURSE_CACHE[cc] = CMP_COURSES;
}
let CMP_COURSE_LIST = [], CMP_COURSE_IDX = -1;
function cmp_courseSearch() {
  const inp = document.getElementById("courseSearch");
  const box = document.getElementById("courseSugg");
  const q = inp.value.trim().toLowerCase();
  CMP_COURSE_LIST = q ? CMP_COURSES.filter(c =>
    c.code.toLowerCase().includes(q) || (c.title || "").toLowerCase().includes(q)).slice(0, 8) : [];
  CMP_COURSE_IDX = -1;
  if (!CMP_COURSE_LIST.length) { box.hidden = true; return; }
  box.innerHTML = CMP_COURSE_LIST.map((c, i) =>
    `<div class="sugg-item" data-i="${i}"><b>${cmp_escape(c.code)}</b>`
    + (c.title ? ` <span class="hint">— ${cmp_escape(c.title)}</span>` : "") + `</div>`).join("");
  box.hidden = false;
  box.querySelectorAll(".sugg-item").forEach(el => {
    el.addEventListener("mousedown", e => {
      e.preventDefault();
      cmp_addCourse(CMP_COURSE_LIST[+el.dataset.i].code);
      inp.focus();
    });
  });
}
function cmp_courseSearchPaint() {
  document.querySelectorAll("#courseSugg .sugg-item").forEach((el, i) =>
    el.classList.toggle("active", i === CMP_COURSE_IDX));
}
function cmp_courseSearchKey(e) {
  const box = document.getElementById("courseSugg");
  if (box.hidden) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    CMP_COURSE_IDX = e.key === "ArrowDown"
      ? Math.min(CMP_COURSE_IDX + 1, CMP_COURSE_LIST.length - 1)
      : Math.max(CMP_COURSE_IDX - 1, 0);
    cmp_courseSearchPaint();
  } else if (e.key === "Enter" && CMP_COURSE_IDX >= 0) {
    e.preventDefault();
    cmp_addCourse(CMP_COURSE_LIST[CMP_COURSE_IDX].code);
  } else if (e.key === "Escape") {
    box.hidden = true;
  }
}
function cmp_courseSearchHide() {
  setTimeout(() => { document.getElementById("courseSugg").hidden = true; }, 150);
}
/* 搜到的课一键加入课程框（去重） */
function cmp_addCourse(code) {
  const ta = document.getElementById("courses");
  const cur = ta.value.split(/[\n,，;；]+/).map(s => s.trim()).filter(Boolean);
  const k = code.toUpperCase().replace(/\s+/g, " ");
  if (!cur.some(c => c.toUpperCase().replace(/\s+/g, " ") === k)) {
    ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + code;
    cmp_countCourses();
  }
  document.getElementById("courseSearch").value = "";
  document.getElementById("courseSugg").hidden = true;
}

/* 课程实时识别计数 */
function cmp_countCourses() {
  const n = document.getElementById("courses").value
    .split(/[\n,，;；]+/).map(s => s.trim()).filter(Boolean).length;
  document.getElementById("courseCount").textContent = t("course_count", { n });
}

function cmp_placeholder() {
  const box = document.getElementById("result");
  box.innerHTML = `<div class="ph-card"><div class="illus">${illus("search")}</div>`
    + `<div class="ph-title">${cmp_escape(t("ph_ready_title"))}</div>`
    + `<div class="ph-tip">${cmp_escape(t("ph_cmp_tip"))}</div></div>`;
}

function cmp_renderTargets() {
  const cc = document.getElementById("cc").value;
  const box = document.getElementById("targets");
  const tgts = Object.keys((CMP_OPTS.by_cc[cc]) || {});
  box.innerHTML = tgts.map(t =>
    `<button type="button" class="chip on" data-v="${cmp_escape(t)}" onclick="this.classList.toggle('on')">${cmp_escape(t)}</button>`
  ).join("") || `<span class="hint">${cmp_escape(t("no_report_for_cc"))}</span>`;
}

function cmp_run() {
  const box = document.getElementById("result");
  const btn = document.getElementById("go");
  const ccName = document.getElementById("cc").value;
  const majorQuery = document.getElementById("major").value.trim() || "computer science";
  const targets = [...document.querySelectorAll("#targets .chip.on")].map(c => c.dataset.v);
  const courses = document.getElementById("courses").value
    .split(/[\n,，;；]+/).map(s => s.trim()).filter(Boolean);

  try {
    CMP_SAVED = { cc_name: ccName, major_query: majorQuery, targets, courses: courses.join("\n"), gpa: document.getElementById("gpa").value.trim() };
    localStorage.setItem(LS_KEY, JSON.stringify(CMP_SAVED));
  } catch (e) { /* 忽略 */ }

  if (!targets.length) {
    box.innerHTML = `<div class="alert">${cmp_escape(t("alert_no_targets"))}</div>`;
    return;
  }
  btn.disabled = true;
  box.innerHTML = skelHTML();
  _cmpExcluded = new Set();
  _cmpFullCourses = courses.map(c => cp_normCode(c)).filter(Boolean);
  setTimeout(() => {
    try {
      const d = cp_compare(ccName, majorQuery, targets, courses);
      lastCmpResult = d;
      cmp_render(d);
    } catch (e) {
      box.innerHTML = `<div class="alert">${cmp_escape(t("err_prefix") + e.message)}</div>`;
    }
    btn.disabled = false;
  }, 60);
}

function cmp_badge(s) {
  const m = {
    covered: t("st_covered"), missing: t("st_missing"),
    no_articulation: t("st_no_articulation"), no_agreement: t("st_no_agreement"),
  };
  return `<span class="st ${s}">${cmp_escape(m[s] || s)}</span>`;
}

function cmp_admitBadge(d, tt) {
  if (!/ucla/i.test(tt.target_name || "")) return "";
  if (typeof admit_findUcla !== "function") return "";
  const m = admit_findUcla(d.major_query || tt.major_label || "");
  if (!m) return "";
  const rate = (m.r === null || m.r === undefined) ? "?" : Math.round(m.r * 100) + "%";
  const gpa = (m.g1 !== null && m.g2 !== null) ? `${m.g1}–${m.g2}` : "?";
  const imp = m.imp
    ? `<div class="risk">⚠️ ${cmp_escape(t("admit_impacted"))}</div>
       <div class="hint">💡 ${cmp_escape(t("admit_tip"))}</div>` : "";
  return `<div class="section-title">${cmp_escape(t("admit_title"))} · UCLA Transfer Profile ${cmp_escape((typeof ADMIT_DATA !== "undefined" && ADMIT_DATA.cycle) || "")}</div>
    <div class="req"><span class="code">${cmp_escape(m.n)}</span>
      <div class="ttl">${cmp_escape(t("admit_rate"))}：${cmp_escape(rate)} · ${cmp_escape(t("admit_applicants", { n: m.a === null ? "?" : m.a }))}</div>
      <div class="hint">${cmp_escape(t("admit_gpa"))}：${cmp_escape(gpa)}</div>
    </div>${imp}`;
}

/* 汇总表用的录取率简写（仅 UCLA 有官方数据） */
function cmp_admitCompact(d, tt) {
  if (!/ucla/i.test(tt.target_name || "")) return "—";
  if (typeof admit_findUcla !== "function") return "—";
  const m = admit_findUcla(d.major_query || tt.major_label || "");
  if (!m || m.r === null || m.r === undefined) return "—";
  return Math.round(m.r * 100) + "%";
}

function cmp_summaryTable(d, chanceArr) {
  const rows = d.targets.map((tt, i) => {
    if (tt.status === "no_agreement")
      return `<tr><td><b>${cmp_escape(tt.target_name)}</b></td><td colspan="5" class="hint">${cmp_escape(t("st_no_agreement"))}</td></tr>`;
    const missing = (tt.items || []).filter(i => i.status === "missing").length;
    const wasted = (tt.wasted || []).length;
    return `<tr>
      <td><b>${cmp_escape(tt.target_name)}</b>${tt.academic_year ? `<div class="hint">${cmp_escape(tt.academic_year)}</div>` : ""}</td>
      <td class="num"><b>${tt.coverage_pct}%</b></td>
      <td class="num">${cmp_escape(cmp_admitCompact(d, tt))}</td>
      <td class="num">${cmp_chanceCell(chanceArr[i])}</td>
      <td class="num">${missing}</td>
      <td class="num">${wasted ? "⚠️ " + wasted : "—"}</td>
    </tr>`;
  }).join("");
  return `<div class="card"><div class="section-title">${cmp_escape(t("sum_title"))}</div>
    <div class="tbl-wrap"><table class="sum-table">
      <tr><th>${cmp_escape(t("sum_target"))}</th><th class=\"num\">${cmp_escape(t("sum_coverage"))}</th><th class="num">${cmp_escape(t("sum_admit"))}</th><th class="num">${cmp_escape(t("sum_chance"))}</th><th class="num">${cmp_escape(t("sum_missing"))}</th><th class="num">${cmp_escape(t("sum_wasted"))}</th></tr>
      ${rows}
    </table></div>
    <div class="hint">${cmp_escape(t("sum_tip"))}</div>
  </div>`;
}

/* 待修聚合：所有目标的缺失要求按 CC 课程聚合，按"一课多用"排序 */
function cmp_needList(d) {
  const need = new Map();  /* normCode -> {code, targets:[]} */
  for (const tt of d.targets) {
    if (tt.status === "no_agreement") continue;
    for (const it of (tt.items || [])) {
      if (it.status !== "missing") continue;
      for (const c of (it.options || [])) {
        const k = cp_normCode(c);
        if (!k) continue;
        if (!need.has(k)) need.set(k, { code: String(c).trim(), targets: [] });
        const e = need.get(k);
        if (!e.targets.includes(tt.target_name)) e.targets.push(tt.target_name);
      }
    }
  }
  return [...need.values()]
    .sort((a, b) => b.targets.length - a.targets.length || (a.code < b.code ? -1 : 1));
}

/* TAG 保底计数：GPA 达标且不在排除名单的校区数 */
function cmp_tagOkCount(gpa, majorQuery) {
  if (gpa == null || typeof TAG_CHANCE === "undefined" || !TAG_CHANCE.campuses) return 0;
  const q = String(majorQuery || "").toLowerCase().trim();
  return TAG_CHANCE.campuses.filter(c => {
    const hit = q && (c.excluded || []).find(e => {
      const el = String(e).toLowerCase();
      return el.includes(q) || q.includes(el);
    });
    return !hit && c.gpa[1] > 0 && gpa >= c.gpa[1];
  }).length;
}

/* 💡 策略型结论：冲刺 / 主攻 / 保底三档 + 先补哪门课。
 * 有 GPA 时按录取概率分档（UCLA band=1 → 冲刺；其余按覆盖率排主攻；TAG 达标为保底）；
 * 无 GPA 时退化为覆盖率最高 + 提示填 GPA。 */
function cmp_verdict(d, chanceArr, gpa) {
  const ok = d.targets.filter(tt => tt.status !== "no_agreement");
  if (!ok.length)
    return `<div class="card verdict"><div class="verdict-text">💡 ${cmp_escape(t("verdict_no_target"))}</div></div>`;
  const need = cmp_needList(d);
  /* n=1 时单复数（EN/ES） */
  const coursePart = need.length
    ? (need[0].targets.length === 1
        ? t("verdict_course_1", { code: need[0].code })
        : t("verdict_course", { code: need[0].code, n: need[0].targets.length }))
    : t("verdict_course_done");
  const tagN = cmp_tagOkCount(gpa, d.major_query);
  const safetyPart = tagN ? t("verdict_safety", { n: tagN }) : "";

  const label = (tt) => {
    const ch = chanceArr[d.targets.indexOf(tt)];
    const band = ch && ch.band;
    if (/ucla/i.test(tt.target_name || "") && band)
      return t("verdict_item_chance", { name: tt.target_name, level: t(band === 3 ? "ch_high" : band === 2 ? "ch_mid" : "ch_low") });
    return t("verdict_item_cov", { name: tt.target_name, pct: tt.coverage_pct });
  };

  let head;
  if (gpa == null) {
    /* 无 GPA：退化为覆盖率最高 + 提示填 GPA（不用录取概率口径，避免误导） */
    const best = [...ok].sort((a, b) => b.coverage_pct - a.coverage_pct)[0];
    head = t("verdict_target", { list: t("verdict_item_cov", { name: best.target_name, pct: best.coverage_pct }) })
      + t("verdict_sep1") + t("verdict_need_gpa");
  } else {
    const reachItems = [], mainTargets = [];
    for (const tt of ok) {
      const ch = chanceArr[d.targets.indexOf(tt)];
      if (/ucla/i.test(tt.target_name || "") && ch && ch.band === 1) reachItems.push(tt);
      else mainTargets.push(tt);
    }
    mainTargets.sort((a, b) => b.coverage_pct - a.coverage_pct);
    const parts = [];
    if (reachItems.length) parts.push(t("verdict_reach", { list: reachItems.map(label).join(t("verdict_list_sep")) }));
    if (mainTargets.length) parts.push(t("verdict_target", { list: mainTargets.map(label).join(t("verdict_list_sep")) }));
    if (safetyPart) parts.push(safetyPart);
    head = parts.join(t("verdict_sep2"));
  }
  const text = head + t("verdict_sep1") + coursePart + t("verdict_end");
  return `<div class="card verdict"><div class="verdict-text">💡 ${cmp_escape(text)}</div></div>`;
}

/* 🎯 待修清单：所有目标的缺失要求按 CC 课程聚合，
 * 按"一课多用"（能补上几个目标）排序——这就是工具的核心答案：
 * 选课（先修什么）、差异性（这门课哪个目标要、哪个不要）、少修白课。 */
function cmp_actionPlan(d) {
  const rows = cmp_needList(d)
    .map(e => `<div class="req"><span class="code">${cmp_escape(e.code)}</span>`
      + `<div class="hint">→ ${cmp_escape(e.targets.join("、"))} · ${cmp_escape(t("plan_need_n", { n: e.targets.length }))}</div></div>`)
    .join("");
  const waste = new Map(); /* normCode -> {code, targets:[]} */
  for (const tt of d.targets) {
    if (tt.status === "no_agreement") continue;
    for (const w of (tt.wasted || [])) {
      const k = cp_normCode(w.cc_code);
      if (!k) continue;
      if (!waste.has(k)) waste.set(k, { code: String(w.cc_code).trim(), targets: [] });
      const e = waste.get(k);
      if (!e.targets.includes(tt.target_name)) e.targets.push(tt.target_name);
    }
  }
  const wasteHtml = [...waste.values()].map(e =>
    `<div class="risk">⚠️ ${cmp_escape(e.code)}${cmp_escape(t("waste_at", { t: e.targets.join("、") }))}</div>`
  ).join("");
  const body = (rows || wasteHtml)
    ? (wasteHtml + (rows || `<div class="hint">${cmp_escape(t("plan_empty"))}</div>`))
    : `<div class="hint">✅ ${cmp_escape(t("plan_empty"))}</div>`;
  return `<div class="card"><div class="section-title">${cmp_escape(t("plan_title"))}</div>`
    + `<div class="hint">${cmp_escape(t("plan_tip"))}</div>${body}</div>`;
}

function cmp_gpa() {
  const el = document.getElementById("gpa");
  const v = el ? parseFloat(el.value) : NaN;
  return (v >= 0 && v <= 5) ? Math.round(v * 100) / 100 : null;
}

/* 录取概率档位：历史录取率 + GPA 对位(25th/75th) + impacted + 申请趋势(2024→2025)。
 * 输出档位 3=高/2=中/1=低 + 依据列表；只做参考评估，不做录取保证。 */
function cmp_chanceUcla(m, gpa) {
  if (!m || m.r == null) return null;
  let s = m.r >= 0.35 ? 3 : m.r >= 0.15 ? 2 : 1;
  const factors = [t("ch_f_rate", { r: Math.round(m.r * 100) })];
  if (gpa != null && m.g1 != null && m.g2 != null) {
    if (gpa >= m.g2) { s += 1; factors.push(t("ch_f_gpa_high", { g: m.g2 })); }
    else if (gpa < m.g1) { s -= 1; factors.push(t("ch_f_gpa_low", { g: m.g1 })); }
    else factors.push(t("ch_f_gpa_mid"));
  }
  if (m.imp) {
    factors.push(t("ch_f_impacted"));
    if (!(gpa != null && m.g2 != null && gpa >= m.g2)) s -= 1;
  }
  if (m.a24 && m.a) {
    const tr = (m.a - m.a24) / m.a24;
    const pct = Math.round(tr * 100);
    if (tr >= 0.2) { s -= 1; factors.push(t("ch_f_trend_up", { p: pct })); }
    else if (tr <= -0.1) { s += 1; factors.push(t("ch_f_trend_down", { p: pct })); }
    else factors.push(t("ch_f_trend_flat", { p: (pct >= 0 ? "+" : "") + pct }));
  }
  s = Math.max(1, Math.min(3, s));
  return { band: s, factors: factors };
}

function cmp_bandChip(band) {
  if (band === 3) return `<span class="st pass">${cmp_escape(t("ch_high"))}</span>`;
  if (band === 2) return `<span class="st warn">${cmp_escape(t("ch_mid"))}</span>`;
  if (band === 1) return `<span class="st fail">${cmp_escape(t("ch_low"))}</span>`;
  return `<span class="st no_agreement">${cmp_escape(t("ch_na"))}</span>`;
}

/* 单个目标的概率评估：UCLA 有分专业官方数据；其他 UC 无分专业数据→诚实标注 */
function cmp_chanceFor(tt, d, gpa) {
  if (tt.status === "no_agreement") return null;
  if (!/ucla/i.test(tt.target_name || "")) return { na: true };
  const m = (typeof admit_findUcla === "function")
    ? admit_findUcla(d.major_query || tt.major_label || "") : null;
  if (!m) return { naMajor: true };
  return cmp_chanceUcla(m, gpa);
}

function cmp_chanceCell(ch) {
  if (!ch || ch.na || ch.naMajor) return `<span class="hint">—</span>`;
  return cmp_bandChip(ch.band);
}

/* TAG 一致性：六校 TAG 的 GPA 门槛 vs 用户 GPA + 专业排除名单关键词核对 */
function cmp_tagStrip(majorQuery, gpa) {
  const campuses = (typeof TAG_CHANCE !== "undefined" && TAG_CHANCE.campuses) || [];
  if (!campuses.length) return "";
  const q = String(majorQuery || "").toLowerCase().trim();
  const rows = campuses.map(c => {
    const exclHit = q && (c.excluded || []).find(e => {
      const el = String(e).toLowerCase();
      return el.includes(q) || q.includes(el);
    });
    const glo = c.gpa[0], ghi = c.gpa[1];
    const gpaTxt = glo === ghi ? String(glo) : `${glo}–${ghi}`;
    let badge, note = "";
    if (exclHit) {
      badge = `<span class="st fail">${cmp_escape(t("tag_no"))}</span>`;
      note = t("tag_excluded_note");
    } else if (gpa != null && glo > 0) {
      if (gpa >= ghi) badge = `<span class="st pass">✅</span>`;
      else if (gpa >= glo) { badge = `<span class="st warn">⚠️</span>`; note = t("tag_partial_note"); }
      else { badge = `<span class="st warn">⚠️</span>`; note = t("tag_below_note", { g: glo }); }
    } else {
      badge = `<span class="st no_agreement">—</span>`;
    }
    if (!exclHit && (c.excluded || []).length) note += (note ? " " : "") + t("tag_check_excl");
    return `<div class="req"><span class="code">${cmp_escape(c.name)}</span> ${badge}`
      + `<div class="hint">TAG GPA ${cmp_escape(gpaTxt)}${note ? " · " + cmp_escape(note) : ""}</div></div>`;
  }).join("");
  return `<div class="section-title">${cmp_escape(t("tag_strip_title"))}</div>`
    + `<div class="hint">${cmp_escape(t("tag_strip_tip"))}</div>` + rows;
}

function cmp_chanceCard(d, chanceArr, gpa) {
  const perTarget = d.targets.map((tt, i) => {
    if (tt.status === "no_agreement") return "";
    const ch = chanceArr[i];
    const inner = (!ch || ch.na || ch.naMajor)
      ? `<span class="st no_agreement">—</span><div class="hint">${cmp_escape(t(ch && ch.naMajor ? "ch_no_major" : "ch_no_data"))}</div>`
      : `${cmp_bandChip(ch.band)}<div class="hint">${ch.factors.map(f => cmp_escape(f)).join(" · ")}</div>`;
    return `<div class="req"><span class="code">${cmp_escape(tt.target_name)}</span> ${inner}</div>`;
  }).join("");
  return `<div class="card"><div class="section-title">${cmp_escape(t("chance_title"))}</div>`
    + `<div class="hint">${cmp_escape(t("chance_tip"))}</div>`
    + (gpa != null ? "" : `<div class="hint">💡 ${cmp_escape(t("chance_need_gpa"))}</div>`)
    + perTarget + cmp_tagStrip(d.major_query, gpa)
    + `<div class="hint">${cmp_escape(t("chance_disc"))}</div></div>`;
}

function cmp_toggle(i) {
  const card = document.getElementById("cmpcard" + i);
  if (!card) return;
  const body = card.querySelector(".cmp-body");
  const tg = card.querySelector(".exp-toggle");
  const open = body.hidden;
  body.hidden = !open;
  if (tg) tg.textContent = t(open ? "collapse_detail" : "expand_detail");
}

/* ---- 课程输入容错：未识别课程 + "你是不是指"模糊提示 ---- */
function cmp_lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[n];
}

function cmp_suggestCourse(raw) {
  const flat = cp_flat(raw);
  if (!flat || !CMP_COURSES || !CMP_COURSES.length) return null;
  const known = new Set(CMP_COURSES.map(e => cp_flat(e.code)));
  if (known.has(flat)) return null; /* 已识别：不需要建议 */
  let best = null, bestD = 3; /* 最多容忍 2 个编辑 */
  for (const e of CMP_COURSES) {
    const f = cp_flat(e.code);
    if (f === flat) continue;
    const dd = cmp_lev(flat, f);
    if (dd >= bestD) continue;
    if (dd > 1 && f.slice(0, 2) !== flat.slice(0, 2)) continue; /* 前缀不同且距离>1：大概率不是 */
    bestD = dd; best = e.code;
  }
  return best;
}

function cmp_unrecognized() {
  if (!CMP_COURSES || !CMP_COURSES.length) cmp_buildCourseIndex();
  const raws = document.getElementById("courses").value
    .split(/[\n,，;；]+/).map(s => s.trim()).filter(Boolean);
  const known = new Set((CMP_COURSES || []).map(e => cp_flat(e.code)));
  return raws.filter(r => {
    const f = cp_flat(r);
    return f && !known.has(f);
  });
}

function cmp_unrecCard() {
  const unrec = cmp_unrecognized();
  if (!unrec.length) return "";
  const rows = unrec.map((r, i) => {
    const sug = cmp_suggestCourse(r);
    return `<div class="unrec-row"><span>“${cmp_escape(r)}”</span>` +
      (sug
        ? `<span class="hint">${cmp_escape(t("did_you_mean"))}</span><button type="button" class="chip sug" onclick="cmp_fixCourse(${i})">${cmp_escape(sug)}</button>`
        : `<span class="hint">${cmp_escape(t("no_suggestion"))}</span>`) +
      `</div>`;
  }).join("");
  return `<div class="card"><div class="section-title">⚠️ ${cmp_escape(t("unrec_title"))}</div>${rows}</div>`;
}

/* 点击建议：一键替换该行并重跑 */
function cmp_fixCourse(i) {
  const raw = cmp_unrecognized()[i];
  const sug = raw && cmp_suggestCourse(raw);
  if (!sug) return;
  const ta = document.getElementById("courses");
  const k = cp_flat(raw);
  ta.value = ta.value.split(/[\n,，;；]+/).map(l => cp_flat(l.trim()) === k ? sug : l).join("\n");
  cmp_countCourses();
  cmp_run();
}

/* 课程雷达：点一门 CC 课，高亮所有靠它覆盖的 UC 要求 */
function cmp_coursePool(d) {
  const seen = new Set();
  const courses = (d.student_courses || []).filter(c => {
    if (!c || !c.includes(" ")) return false;  // 只留带空格的规范形，去重扁平形
    const flat = c.replace(/ /g, "");
    if (seen.has(flat)) return false;
    seen.add(flat);
    return true;
  });
  if (!courses.length) return "";
  const chips = courses.map(c =>
    `<button type="button" class="cp-chip" data-code="${cmp_escape(c)}"`
    + ` onmouseenter="cmp_highlight(this.dataset.code)"`
    + ` onmouseleave="cmp_highlight(null)"`
    + ` onclick="cmp_toggleHl(this.dataset.code)">${cmp_escape(c)}</button>`
  ).join("");
  return `<div class="card"><div class="section-title">📡 ${cmp_escape(t("pool_title"))}</div>`
    + `<div class="hint" style="margin-bottom:8px">${cmp_escape(t("pool_hint"))}</div>`
    + `<div class="course-pool">${chips}</div></div>`;
}

let _cmpHl = null;
function cmp_highlight(code) {
  _cmpHl = code;
  const flat = code ? code.replace(/ /g, "") : null;
  const box = document.getElementById("result");
  box.classList.toggle("filtering", !!code);
  box.querySelectorAll(".req[data-via]").forEach(el => {
    const hit = !!flat && el.dataset.via.split("|").some(v => v.replace(/ /g, "") === flat);
    el.classList.toggle("lit", hit);
  });
  document.querySelectorAll(".cp-chip").forEach(ch => {
    ch.classList.toggle("active", !!code && ch.dataset.code === code);
  });
}
function cmp_toggleHl(code) {
  cmp_highlight(_cmpHl === code ? null : code);  // 手机上点按切换
}

/* What-If 模拟器：勾掉课程，实时看覆盖率变化（只谈覆盖率，不编概率） */
let _cmpExcluded = new Set();
let _cmpFullCourses = [];
function cmp_whatifCard() {
  const seen = new Set();
  const courses = _cmpFullCourses.filter(c => {
    if (!c || !c.includes(" ")) return false;
    const f = c.replace(/ /g, "");
    if (seen.has(f)) return false;
    seen.add(f); return true;
  });
  if (!courses.length) return "";
  const rows = courses.map(c => {
    const off = _cmpExcluded.has(c);
    return `<label class="wi-row"><input type="checkbox" data-wi="${cmp_escape(c)}"${off ? " checked" : ""} onchange="cmp_whatifToggle(this)">`
      + `<span class="code">${cmp_escape(c)}</span>`
      + (off ? `<span class="tag off">excluded</span>` : "") + `</label>`;
  }).join("");
  return `<div class="card"><div class="section-title">🔬 ${cmp_escape(t("wi_title"))}</div>`
    + `<div class="hint" style="margin-bottom:8px">${cmp_escape(t("wi_hint"))}</div>`
    + `<div class="wi-list">${rows}</div></div>`;
}
function cmp_whatifToggle(el) {
  const code = el.dataset.wi;
  if (el.checked) _cmpExcluded.add(code); else _cmpExcluded.delete(code);
  const ccName = document.getElementById("cc").value;
  const majorQuery = document.getElementById("major").value.trim() || "computer science";
  const targets = [...document.querySelectorAll("#targets .chip.on")].map(c => c.dataset.v);
  const courses = _cmpFullCourses.filter(c => !_cmpExcluded.has(c));
  try {
    const d = cp_compare(ccName, majorQuery, targets, courses);
    lastCmpResult = d;
    cmp_render(d);
  } catch (e) { /* 保持旧结果 */ }
}

/* 黄金路径：贪心集合覆盖，最少 CC 课覆盖最多 UC 要求 */
function cmp_goldenPath(d) {
  const reqs = [];
  for (const tt of d.targets) {
    if (tt.status === "no_agreement") continue;
    for (const it of (tt.items || [])) {
      if (it.status === "no_articulation") continue;
      const cands = it.status === "covered" ? it.via : it.options;
      if (!cands || !cands.length) continue;
      reqs.push({
        key: tt.target_name + "|" + it.target_code,
        target: tt.target_name, code: it.target_code,
        cands: [...new Set(cands.map(c => cp_normCode(c)).filter(Boolean))],
      });
    }
  }
  if (!reqs.length) return "";
  const byKey = Object.fromEntries(reqs.map(r => [r.key, r]));
  const uncovered = new Set(reqs.map(r => r.key));
  const used = new Set();
  const path = [];
  while (uncovered.size) {
    const cov = {};
    for (const r of reqs) {
      if (!uncovered.has(r.key)) continue;
      for (const c of r.cands) (cov[c] = cov[c] || []).push(r.key);
    }
    let best = null, bestKeys = [];
    for (const c of Object.keys(cov)) {
      if (used.has(c)) continue;
      if (cov[c].length > bestKeys.length) { best = c; bestKeys = cov[c]; }
    }
    if (!best) break;
    used.add(best);
    bestKeys.forEach(k => uncovered.delete(k));
    path.push({ course: best, covers: bestKeys.map(k => byKey[k]) });
  }
  if (!path.length) return "";
  const haveFlat = new Set(_cmpFullCourses.map(c => c.replace(/ /g, "")));
  const rows = path.map((p, i) => {
    const has = haveFlat.has(p.course.replace(/ /g, ""));
    const covList = p.covers.map(r => `${cmp_escape(r.target)} ${cmp_escape(r.code)}`).join("、");
    return `<div class="gp-row"><span class="gp-num">${i + 1}</span>`
      + `<span class="code">${cmp_escape(p.course)}</span>`
      + (has ? `<span class="tag have">✓</span>` : `<span class="tag need">+${p.covers.length}</span>`)
      + `<div class="hint">${covList}</div></div>`;
  }).join("");
  return `<div class="card"><div class="section-title">🏆 ${cmp_escape(t("gp_title"))}</div>`
    + `<div class="hint" style="margin-bottom:8px">${cmp_escape(t("gp_hint"))}</div>${rows}</div>`;
}

function cmp_render(d) {
  const box = document.getElementById("result");
  const newestYear = d.targets.map(x => x.academic_year).filter(Boolean).sort().reverse()[0] || "";
  const gpa = cmp_gpa();
  const chanceArr = d.targets.map(tt => cmp_chanceFor(tt, d, gpa));
  let html = cmp_verdict(d, chanceArr, gpa) + cmp_unrecCard() + cmp_summaryTable(d, chanceArr) + cmp_actionPlan(d) + cmp_chanceCard(d, chanceArr, gpa);
  html += cmp_coursePool(d) + cmp_whatifCard() + cmp_goldenPath(d);
  let idx = 0;
  for (const tt of d.targets) {
    if (tt.status === "no_agreement") {
      html += `<div class="card noagree">
        <div class="illus sm">${illus("search")}</div>
        <div><div class="cov-head"><h3 style="margin:0">${cmp_escape(tt.target_name)}</h3>${cmp_badge("no_agreement")}</div>
        <div class="hint">${cmp_escape(tt.note || "")}</div></div>
      </div>`;
      continue;
    }
    const my = idx++;
    const reqs = tt.items.map(i => {      let extra = "";
      if (i.status === "covered" && i.via.length)
        extra = `<div class="via">${cmp_escape(t("d_via", { via: i.via.join(" + ") }))}</div>`;
      else if (i.status === "missing" && i.options.length)
        extra = `<div class="opts">${cmp_escape(t("d_fill", { options: i.options_display || i.options.join(" / ") }))}</div>`;
      else if (i.status === "no_articulation")
        extra = `<div class="opts">${cmp_escape(i.detail)}</div>`;
      const viaAttr = (i.via && i.via.length)
        ? ` data-via="${cmp_escape(i.via.map(v => cp_normCode(v)).join("|"))}"` : "";
      return `<div class="req"${viaAttr}>
        <span class="code">${cmp_escape(i.target_code)}</span>${cmp_badge(i.status)}
        <div class="ttl">${cmp_escape(i.target_title || "")}</div>${extra}
      </div>`;
    }).join("");

    const wasted = (tt.wasted || []).length
      ? `<div class="risk">⚠️ ${cmp_escape(t("wasted_warn"))}：${tt.wasted.map(w => cmp_escape(w.cc_code)).join("、")} —— ${cmp_escape(tt.wasted[0].note)}</div>`
      : "";
    const afterTransfer = (tt.must_take_after_transfer || []).length
      ? `<div class="section-title">${cmp_escape(t("sec_after_transfer"))}</div>` +
        tt.must_take_after_transfer.map(x =>
          `<div class="hint">· ${cmp_escape(x.target_code)} ${cmp_escape(x.target_title)}</div>`).join("")
      : "";
    const yearNote = (tt.academic_year && newestYear && tt.academic_year < newestYear)
      ? `<div class="risk">${cmp_escape(t("old_year_note", { y: tt.academic_year, n: newestYear }))}</div>` : "";
    const freshBadge = tt.academic_year
      ? `<span class="fresh-badge">${cmp_escape(t("fresh_badge", { y: tt.academic_year, d: (typeof ARTIC_META !== "undefined" && ARTIC_META.fetched) || "?" }))}</span>`
      : "";

    html += `<div class="card" id="cmpcard${my}">
      <div class="cmp-head" onclick="cmp_toggle(${my})">
        <div><h3 style="margin:0">${cmp_escape(tt.target_name)}</h3>
        <div class="hint">${cmp_escape(d.cc_name || "")} → ${cmp_escape(tt.major_label || "")} ${freshBadge}</div></div>
        <div class="cov-num">${tt.coverage_pct}<span style="font-size:14px;color:#888">%</span></div>
        <span class="exp-toggle">${cmp_escape(t("expand_detail"))}</span>
      </div>
      ${yearNote}
      <div class="cmp-body" hidden>
        <div class="cov-bar"><div style="width:${tt.coverage_pct}%"></div></div>
        <div class="hint">${cmp_escape(t("cov_line", { c: tt.covered, t: tt.total_requirements }))}</div>
        ${cmp_admitBadge(d, tt)}
        ${wasted}
        <div class="section-title">${cmp_escape(t("sec_reqdetail"))}</div>
        ${reqs}
        ${afterTransfer}
        <div class="meta">${cmp_escape(t("published_line", { d: tt.published_date || "?" }))}</div>
      </div>
    </div>`;
  }
  if (html) {
    html += `<a class="next-card" href="validate.html">`
      + `<div><div class="next-title">${cmp_escape(t("next_title"))} · ${cmp_escape(t("next_val"))}</div>`
      + `<div class="next-tip">${cmp_escape(t("next_val_tip"))}</div></div>`
      + `<div class="next-arrow">→</div></a>`;
  }
  box.innerHTML = html || (`<div class="empty-card"><div class="illus">${illus("search")}</div>`
    + `<div class="empty-title">${cmp_escape(t("empty_title"))}</div>`
    + `<div class="empty-tip">${cmp_escape(t("empty_cmp_tip"))}</div></div>`);
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.__reRender = function () {
  cmp_countCourses();
  cmp_renderPlans();
  const pd = document.getElementById("planDiff");
  if (pd) pd.innerHTML = "";
  if (typeof TOUR_IDX !== "undefined" && TOUR_IDX >= 0) { tour_show(TOUR_IDX); return; }
  if (lastCmpResult) cmp_render(lastCmpResult);
  else cmp_placeholder();
};

document.addEventListener("DOMContentLoaded", function () {
  Promise.all([
    window.ARTIC_READY || Promise.resolve(),
    window.ADMIT_READY || Promise.resolve(),
  ]).then(cmp_init);
});
