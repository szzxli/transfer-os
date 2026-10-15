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
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    for (const [k, v] of Object.entries(saved)) {
      const el = document.getElementById(k);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!v;
      else el.value = v;
    }
  } catch (e) { /* 忽略 */ }
  applyI18n();
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
  box.innerHTML = `<div class="loading"><div class="spinner"></div>${escapeHtml(t("loading_tag"))}</div>`;
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
    ? t("src_line", { source: `<a href="${escapeHtml(info.source)}" target="_blank" rel="noopener">${escapeHtml(info.source)}</a>`, date: escapeHtml(info.verified_date || "") })
    : "";

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
    </div>
    <div class="card"><h3>${escapeHtml(t("sec_checks"))}</h3>${checks}</div>
    ${risks ? `<div class="card"><h3>${escapeHtml(t("sec_risks"))}</h3>${risks}</div>` : ""}
    <div class="card">
      <h3>${escapeHtml(t("sec_keydates"))}</h3>
      <div class="hint">${escapeHtml(t("kd_tagwindow"))}${escapeHtml(info.tag_window || "—")}</div>
      <div class="hint">${escapeHtml(t("kd_ucapp"))}${escapeHtml(info.uc_application || "—")}</div>
      ${info.tau_deadline ? `<div class="hint">${escapeHtml(t("kd_tau"))}${escapeHtml(info.tau_deadline)}</div>` : ""}
      <div class="meta">${srcLine}<br>${escapeHtml(r._disclaimer || "")}</div>
    </div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.__reRender = function () {
  if (lastTagResult) tag_render(lastTagResult);
};

document.addEventListener("DOMContentLoaded", tag_init);
