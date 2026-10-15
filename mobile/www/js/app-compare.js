/* Articulation 对比器页面逻辑（纯静态，离线可用，三语） */
"use strict";

const LS_KEY = "transferos_cmp_form";
let CMP_OPTS = null;
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
  cc.onchange = cmp_renderTargets;
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    if (saved.cc_name) cc.value = saved.cc_name;
    if (saved.major_query) document.getElementById("major").value = saved.major_query;
    if (saved.courses) document.getElementById("courses").value = saved.courses;
  } catch (e) { /* 忽略 */ }
  cmp_renderTargets();
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    if (Array.isArray(saved.targets)) {
      document.querySelectorAll("#targets .chip").forEach(ch => {
        ch.classList.toggle("on", saved.targets.includes(ch.dataset.v));
      });
    }
  } catch (e) { /* 忽略 */ }
  applyI18n();
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
    localStorage.setItem(LS_KEY, JSON.stringify(
      { cc_name: ccName, major_query: majorQuery, targets, courses: courses.join("\n") }));
  } catch (e) { /* 忽略 */ }

  if (!targets.length) {
    box.innerHTML = `<div class="alert">${cmp_escape(t("alert_no_targets"))}</div>`;
    return;
  }
  btn.disabled = true;
  box.innerHTML = `<div class="loading"><div class="spinner"></div>${cmp_escape(t("loading_cmp", { n: targets.length }))}</div>`;
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

function cmp_render(d) {
  const box = document.getElementById("result");
  let html = "";
  for (const tt of d.targets) {
    if (tt.status === "no_agreement") {
      html += `<div class="card">
        <div class="cov-head"><h3 style="margin:0">${cmp_escape(tt.target_name)}</h3>${cmp_badge("no_agreement")}</div>
        <div class="hint">${cmp_escape(tt.note || "")}</div>
      </div>`;
      continue;
    }
    const reqs = tt.items.map(i => {
      let extra = "";
      if (i.status === "covered" && i.via.length)
        extra = `<div class="via">${cmp_escape(t("d_via", { via: i.via.join(" + ") }))}</div>`;
      else if (i.status === "missing" && i.options.length)
        extra = `<div class="opts">${cmp_escape(t("d_fill_one", { options: i.options.join(" / ") }))}</div>`;
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

    html += `<div class="card">
      <div class="cov-head">
        <div><h3 style="margin:0">${cmp_escape(tt.target_name)}</h3>
        <div class="hint">${cmp_escape(tt.major_label || "")}${tt.academic_year ? " · " + cmp_escape(tt.academic_year) : ""}</div></div>
        <div class="cov-num">${tt.coverage_pct}<span style="font-size:14px;color:#888">%</span></div>
      </div>
      <div class="cov-bar"><div style="width:${tt.coverage_pct}%"></div></div>
      <div class="hint">${cmp_escape(t("cov_line", { c: tt.covered, t: tt.total_requirements }))}</div>
      ${wasted}
      <div class="section-title">${cmp_escape(t("sec_reqdetail"))}</div>
      ${reqs}
      ${afterTransfer}
      <div class="meta">${cmp_escape(t("published_line", { d: tt.published_date || "?" }))}</div>
    </div>`;
  }
  box.innerHTML = html || `<div class="empty">${cmp_escape(t("empty_result"))}</div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.__reRender = function () {
  if (lastCmpResult) cmp_render(lastCmpResult);
};

document.addEventListener("DOMContentLoaded", cmp_init);
