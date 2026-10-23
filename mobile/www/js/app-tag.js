/* TAG Guard 页面逻辑（纯静态，离线可用，三语） */
"use strict";

const LS_KEY = "transferos_tag_form";
let lastTagResult = null;

function tag_schoolName(sid) {
  const r = TAG_DATA[sid];
  return (r && r.school) || sid;
}

function tag_init() {
  initLang();
  const sel = document.getElementById("school");
  sel.innerHTML = te_listSchools()
    .map(sid => `<option value="${sid}">${escapeHtml(tag_schoolName(sid))}</option>`)
    .join("");
  let had = false;
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    had = Object.keys(saved).length > 0;
    for (const [k, v] of Object.entries(saved)) {
      const el = document.getElementById(k);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!v;
      else el.value = v;
    }
  } catch (e) { /* 忽略 */ }
  /* 首次打开（本机没存过表单）：预填示例数据，表单上方有示例提示条，可一键清空 */
  if (!had) tag_fillExample();
  applyI18n();
  tag_placeholder();
}

/* 示例数据：与提示条文案一致（UC Irvine / Psychology / GPA 3.6） */
function tag_fillExample() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set("school", "uc-irvine");
  set("gpa", "3.6");
  set("units", "45");
  set("major", "Psychology");
  set("english", "2");
  set("math", "1");
  set("spring", "12");
  const prep = document.getElementById("prep");
  if (prep) prep.checked = true;
  const ba = document.getElementById("bachelor");
  if (ba) ba.checked = false;
}

/* 清空：恢复空白表单，并清掉本机保存的表单与结果占位 */
function tag_clearForm() {
  for (const id of ["gpa", "units", "major", "english", "math", "spring"]) {
    const el = document.getElementById(id);
    if (el) el.value = "";
  }
  const sel = document.getElementById("school");
  if (sel) sel.selectedIndex = 0;
  for (const id of ["prep", "bachelor"]) {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  }
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* 忽略 */ }
  lastTagResult = null;
  tag_placeholder();
}

/* 收尾：把本次判定结果存到本机（沿用站内 localStorage 模式，只存本设备） */
function tag_saveResult(btn) {
  if (!lastTagResult) return;
  try {
    localStorage.setItem("transferos_tag_result", JSON.stringify({
      ts: Date.now(),
      school: lastTagResult.school,
      score: lastTagResult.score,
      eligible: lastTagResult.eligible,
    }));
  } catch (e) { /* 忽略 */ }
  if (btn) { btn.disabled = true; btn.textContent = t("fin_saved"); }
}

function tag_placeholder() {
  const box = document.getElementById("result");
  box.innerHTML = `<div class="ph-card"><div class="illus">${illus("cap")}</div>`
    + `<div class="ph-title">${escapeHtml(t("ph_ready_title"))}</div>`
    + `<div class="ph-tip">${escapeHtml(t("ph_tag_tip"))}</div></div>`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tag_collect() {
  const v = id => document.getElementById(id).value.trim();
  const num = id => { const x = v(id); return x === "" ? null : parseFloat(x); };
  const form = {
    school: v("school"),
    gpa: num("gpa"),
    units: num("units"),
    major: v("major"),
    english: v("english") === "" ? null : parseInt(v("english"), 10),
    math: v("math") === "" ? null : parseInt(v("math"), 10),
    spring: num("spring"),
    prep: document.getElementById("prep").checked,
    bachelor: document.getElementById("bachelor").checked,
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(form)); } catch (e) { /* 忽略 */ }
  return form;
}

function tag_run() {
  const box = document.getElementById("result");
  const btn = document.getElementById("go");
  const f = tag_collect();

  if (f.gpa !== null && (f.gpa < 0 || f.gpa > 4.5)) {
    box.innerHTML = `<div class="alert">${escapeHtml(t("alert_bad_gpa"))}</div>`;
    return;
  }
  btn.disabled = true;
  box.innerHTML = skelHTML();
  setTimeout(() => {
    try {
      const profile = {
        gpa: f.gpa,
        college: null,
        major: f.major || null,
        units_completed: f.units,
        english_done: f.english,
        math_done: f.math,
        major_prep_done: f.prep ? true : null,
        has_bachelor_degree: f.bachelor,
        spring_units_planned: f.spring,
      };
      const r = te_checkEligibility(f.school, profile);
      lastTagResult = r;
      tag_render(r);
    } catch (e) {
      box.innerHTML = `<div class="alert">${escapeHtml(t("err_prefix") + e.message)}</div>`;
    }
    btn.disabled = false;
  }, 60);
}

function tag_stName(s) {
  return { pass: t("st_pass"), fail: t("st_fail"), warn: t("st_warn"), skip: t("st_skip") }[s] || s;
}

function tag_scoreRing(score) {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const C = 2 * Math.PI * 34;
  const color = score >= 80 ? "#1a7f37" : score >= 60 ? "#b7791f" : "#c62828";
  return `<div class="score-ring">
    <svg width="84" height="84" viewBox="0 0 84 84">
      <circle cx="42" cy="42" r="34" fill="none" stroke="#e5e7eb" stroke-width="9"/>
      <circle cx="42" cy="42" r="34" fill="none" stroke="${color}" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${(pct * C).toFixed(1)} ${C.toFixed(1)}"/>
    </svg>
    <div class="num">${score}</div>
  </div>`;
}

function tag_render(r) {
  const box = document.getElementById("result");
  const verdictCls = r.eligible ? "ok" : "bad";
  const verdictTxt = r.eligible ? t("verdict_ok") : t("verdict_bad");
  const checks = r.checks.map(c => `
    <div class="check ${c.status}">
      <span class="badge">${escapeHtml(tag_stName(c.status))}</span>
      <span class="t">${escapeHtml(c.label)}</span>
      <div class="d">${escapeHtml(c.detail)}</div>
    </div>`).join("");
  const fails = r.checks.filter(c => c.status === "fail").length;
  const warns = r.checks.filter(c => c.status === "warn").length;
  const risks = (r.risks || []).map(x => `<div class="risk">⚠️ ${escapeHtml(x)}</div>`).join("");
  const info = r.info || {};
  const srcLine = info.source
    ? t("tag_src_line", { source: `<a href="${escapeHtml(info.source)}" target="_blank" rel="noopener">${escapeHtml(info.source)}</a>`, date: escapeHtml(info.verified_date || "") })
    : "";
  /* UC 申请日期在数据里常只写 "November 30"，按学年补上年份（如 2026-27 学年 → 2026 年） */
  let ucApp = info.uc_application || "—";
  if (info.uc_application && !/\d{4}/.test(info.uc_application) && info.academic_year) {
    const y = String(info.academic_year).match(/\d{4}/);
    if (y) ucApp = info.uc_application + ", " + y[0];
  }

  box.innerHTML = `
    <div class="card">
      <div class="score-wrap">
        ${tag_scoreRing(r.score)}
        <div>
          <div class="verdict ${verdictCls}">${escapeHtml(verdictTxt)}</div>
          <div class="hint">${escapeHtml(r.school)}${info.admission_cycle ? " · " + escapeHtml(info.admission_cycle) : ""}</div>
          <div class="hint">${escapeHtml(t("fail_warn_count", { f: fails, w: warns }))}</div>
        </div>
      </div>
      <div class="verdict-note">${escapeHtml(t("score_note"))}</div>
      <div class="hint" style="margin-top:6px">${escapeHtml(t("result_based_on"))}</div>
    </div>
    <div class="card"><h3>${escapeHtml(t("sec_checks"))}</h3>${checks}</div>
    ${risks ? `<div class="card"><h3>${escapeHtml(t("sec_risks"))}</h3>${risks}</div>` : ""}
    <div class="card">
      <h3>${escapeHtml(t("sec_keydates"))}</h3>
      <div class="hint">${escapeHtml(t("kd_tagwindow"))}${escapeHtml(info.tag_window || "—")}</div>
      <div class="hint">${escapeHtml(t("kd_ucapp"))}${escapeHtml(ucApp)}</div>
      ${info.tau_deadline ? `<div class="hint">${escapeHtml(t("kd_tau"))}${escapeHtml(info.tau_deadline)}</div>` : ""}
      <div class="meta">${srcLine}<br>${escapeHtml(r._disclaimer || "")}</div>
    </div>
    <a class="next-card" href="compare.html">
      <div><div class="next-title">${escapeHtml(t("next_title"))} · ${escapeHtml(t("next_cmp"))}</div>
      <div class="next-tip">${escapeHtml(t("next_cmp_tip"))}</div></div>
      <div class="next-arrow">→</div>
    </a>
    <div class="card">
      <div class="btn-row">
        <button type="button" class="btn ghost" onclick="tag_saveResult(this)">${escapeHtml(t("fin_save_btn"))}</button>
        <a class="btn" style="text-align:center;text-decoration:none" href="https://zhuanuc.com" target="_blank" rel="noopener">${escapeHtml(t("fin_home"))}</a>
      </div>
      <div class="hint" style="margin-top:8px">${escapeHtml(t("fin_note"))}</div>
    </div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.__reRender = function () {
  if (lastTagResult) tag_render(lastTagResult);
  else tag_placeholder();
};

document.addEventListener("DOMContentLoaded", tag_init);
