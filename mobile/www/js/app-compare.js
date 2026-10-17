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

function cmp_init() {
  initLang();
  CMP_OPTS = cp_listOptions();
  const cc = document.getElementById("cc");
  cc.innerHTML = CMP_OPTS.ccs.map(c => `<option>${cmp_escape(c)}</option>`).join("");
  cc.onchange = function () {
    cmp_renderMajors();
    if (!document.getElementById("step2").hidden) cmp_renderTargets();
  };
  try {
    CMP_SAVED = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch (e) { CMP_SAVED = {}; }
  if (CMP_SAVED.cc_name) cc.value = CMP_SAVED.cc_name;
  if (CMP_SAVED.major_query) document.getElementById("major").value = CMP_SAVED.major_query;
  if (CMP_SAVED.courses) document.getElementById("courses").value = CMP_SAVED.courses;
  cmp_renderMajors();
  cmp_showStep(CMP_SAVED.major_query ? 2 : 1);
  applyI18n();
  cmp_countCourses();
  cmp_placeholder();
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
function cmp_renderMajors() {
  const cc = document.getElementById("cc").value;
  const set = new Set();
  const byTgt = (CMP_OPTS.by_cc[cc]) || {};
  Object.keys(byTgt).forEach(tg => (byTgt[tg] || []).forEach(m => set.add(m)));
  document.getElementById("majorList").innerHTML =
    [...set].sort().map(m => `<option value="${cmp_escape(m)}">`).join("");
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
    `<span class="chip on" data-v="${cmp_escape(t)}" onclick="this.classList.toggle('on')">${cmp_escape(t)}</span>`
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
    CMP_SAVED = { cc_name: ccName, major_query: majorQuery, targets, courses: courses.join("\n") };
    localStorage.setItem(LS_KEY, JSON.stringify(CMP_SAVED));
  } catch (e) { /* 忽略 */ }

  if (!targets.length) {
    box.innerHTML = `<div class="alert">${cmp_escape(t("alert_no_targets"))}</div>`;
    return;
  }
  btn.disabled = true;
  box.innerHTML = skelHTML();
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

function cmp_summaryTable(d) {
  const rows = d.targets.map(tt => {
    if (tt.status === "no_agreement")
      return `<tr><td><b>${cmp_escape(tt.target_name)}</b></td><td colspan="4" class="hint">${cmp_escape(t("st_no_agreement"))}</td></tr>`;
    const missing = (tt.items || []).filter(i => i.status === "missing").length;
    const wasted = (tt.wasted || []).length;
    return `<tr>
      <td><b>${cmp_escape(tt.target_name)}</b>${tt.academic_year ? `<div class="hint">${cmp_escape(tt.academic_year)}</div>` : ""}</td>
      <td class="num"><b>${tt.coverage_pct}%</b></td>
      <td class="num">${cmp_escape(cmp_admitCompact(d, tt))}</td>
      <td class="num">${missing}</td>
      <td class="num">${wasted ? "⚠️ " + wasted : "—"}</td>
    </tr>`;
  }).join("");
  return `<div class="card"><div class="section-title">${cmp_escape(t("sum_title"))}</div>
    <div class="tbl-wrap"><table class="sum-table">
      <tr><th>${cmp_escape(t("sum_target"))}</th><th class="num">${cmp_escape(t("sum_coverage"))}</th><th class="num">${cmp_escape(t("sum_admit"))}</th><th class="num">${cmp_escape(t("sum_missing"))}</th><th class="num">${cmp_escape(t("sum_wasted"))}</th></tr>
      ${rows}
    </table></div>
    <div class="hint">${cmp_escape(t("sum_tip"))}</div>
  </div>`;
}

/* 🎯 待修清单：所有目标的缺失要求按 CC 课程聚合，
 * 按"一课多用"（能补上几个目标）排序——这就是工具的核心答案：
 * 选课（先修什么）、差异性（这门课哪个目标要、哪个不要）、少修白课。 */
function cmp_actionPlan(d) {
  const need = new Map();  /* normCode -> {code, targets:[]} */
  const waste = new Map(); /* normCode -> {code, targets:[]} */
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
    for (const w of (tt.wasted || [])) {
      const k = cp_normCode(w.cc_code);
      if (!k) continue;
      if (!waste.has(k)) waste.set(k, { code: String(w.cc_code).trim(), targets: [] });
      const e = waste.get(k);
      if (!e.targets.includes(tt.target_name)) e.targets.push(tt.target_name);
    }
  }
  const rows = [...need.values()]
    .sort((a, b) => b.targets.length - a.targets.length || (a.code < b.code ? -1 : 1))
    .map(e => `<div class="req"><span class="code">${cmp_escape(e.code)}</span>`
      + `<div class="hint">→ ${cmp_escape(e.targets.join("、"))} · ${cmp_escape(t("plan_need_n", { n: e.targets.length }))}</div></div>`)
    .join("");
  const wasteHtml = [...waste.values()].map(e =>
    `<div class="risk">⚠️ ${cmp_escape(e.code)}${cmp_escape(t("waste_at", { t: e.targets.join("、") }))}</div>`
  ).join("");
  const body = (rows || wasteHtml)
    ? (wasteHtml + (rows || `<div class="hint">${cmp_escape(t("plan_empty"))}</div>`))
    : `<div class="hint">✅ ${cmp_escape(t("plan_empty"))}</div>`;
  return `<div class="card"><div class="section-title">${cmp_escape(t("plan_title"))}</div>`
    + `<div class="hint">${cmp_escape(t("plan_tip"))}</div>${body}</div>`;
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

function cmp_render(d) {
  const box = document.getElementById("result");
  const newestYear = d.targets.map(x => x.academic_year).filter(Boolean).sort().reverse()[0] || "";
  let html = cmp_summaryTable(d) + cmp_actionPlan(d);
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
      return `<div class="req">
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

    html += `<div class="card" id="cmpcard${my}">
      <div class="cmp-head" onclick="cmp_toggle(${my})">
        <div><h3 style="margin:0">${cmp_escape(tt.target_name)}</h3>
        <div class="hint">${cmp_escape(d.cc_name || "")} → ${cmp_escape(tt.major_label || "")}${tt.academic_year ? " · " + cmp_escape(tt.academic_year) : ""}</div></div>
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
  if (lastCmpResult) cmp_render(lastCmpResult);
  else cmp_placeholder();
};

document.addEventListener("DOMContentLoaded", function () {
  Promise.all([
    window.ARTIC_READY || Promise.resolve(),
    window.ADMIT_READY || Promise.resolve(),
  ]).then(cmp_init);
});
