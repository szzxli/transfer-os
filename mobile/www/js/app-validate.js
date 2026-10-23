/* 课程计划校验器页面逻辑（纯静态，离线可用，三语） */
"use strict";

const VA_LS_KEY = "transferos_val_form";
let VA_OPTS = null;
let lastValResult = null;

/* 校验器 i18n 必需 key：启动自检 */
const VA_KEYS = [
  "app_val_sub", "nav_validate",
  "f_plan", "f_plan_opt", "ph_plan", "btn_validate",
  "disclaimer_validate",
  "sec_waste", "sec_incomplete",
  "v_wasted_units_line", "v_no_waste", "v_at_risk_line",
  "v_unknown_units", "v_term_wasted",
  "v_note_ok", "v_note_ok_partial", "v_note_denied", "v_note_unknown",
  "v_denied_noname", "v_baseline_note", "v_main_note",
  "v_missing_partners", "v_satisfies", "v_partial_satisfies", "v_and_incomplete",
  "v_denied_at", "v_no_agreement_line",
  "v_st_ok", "v_st_denied", "v_st_unknown",
  "alert_no_cc", "fin_save_btn", "fin_saved", "fin_home", "fin_note",
  "calgetc_link", "assist_link",
];

function va_escape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function va_init() {
  initLang();
  VA_OPTS = cp_listOptions();
  const cc = document.getElementById("cc");
  cc.innerHTML = VA_OPTS.ccs.map(c => `<option>${va_escape(c)}</option>`).join("");
  cc.onchange = va_renderTargets;
  try {
    const saved = JSON.parse(localStorage.getItem(VA_LS_KEY) || "{}");
    if (saved.cc_name) cc.value = saved.cc_name;
    if (saved.major_query) document.getElementById("major").value = saved.major_query;
    if (saved.plan) document.getElementById("plan").value = saved.plan;
  } catch (e) { /* 忽略 */ }
  va_renderTargets();
  try {
    const saved = JSON.parse(localStorage.getItem(VA_LS_KEY) || "{}");
    if (Array.isArray(saved.targets)) {
      document.querySelectorAll("#targets .chip").forEach(ch => {
        ch.classList.toggle("on", saved.targets.includes(ch.dataset.v));
      });
    }
  } catch (e) { /* 忽略 */ }
  const missing = i18n_check(VA_KEYS);
  if (missing.length) {
    document.getElementById("result").innerHTML =
      `<div class="alert">[i18n] missing keys: ${va_escape(missing.join(", "))}</div>`;
  } else {
    va_placeholder();
  }
  applyI18n();
}

function va_placeholder() {
  const box = document.getElementById("result");
  box.innerHTML = `<div class="ph-card"><div class="illus">${illus("plan")}</div>`
    + `<div class="ph-title">${va_escape(t("ph_ready_title"))}</div>`
    + `<div class="ph-tip">${va_escape(t("ph_val_tip"))}</div></div>`;
}

function va_renderTargets() {
  const cc = document.getElementById("cc").value;
  const box = document.getElementById("targets");
  const tgts = Object.keys((VA_OPTS.by_cc[cc]) || {});
  box.innerHTML = tgts.map(t =>
    `<span class="chip on" data-v="${va_escape(t)}" onclick="this.classList.toggle('on')">${va_escape(t)}</span>`
  ).join("") || `<span class="hint">${va_escape(t("no_report_for_cc"))}</span>`;
}

/* 解析学期课程表文本：
 *   Fall 2026:
 *   CS A250
 *   MATH A180
 * （空行分隔学期；以冒号结尾的行是学期标题；"Fall 2026" 这类裸行也认，
 *   全文无标题时并入默认学期——不静默吞掉用户输入）
 */
const VA_TERM_RE = /^(?:(fall|winter|spring|summer)\s+\d{4}|\d{4}\s+(fall|winter|spring|summer))$/i;

function va_parsePlan(text) {
  const plan = {};
  const loose = [];
  let cur = null, seenTerm = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { cur = null; continue; }
    if (/:$/.test(line) || VA_TERM_RE.test(line)) {
      cur = line.replace(/:$/, "").trim() || line;
      if (!plan[cur]) plan[cur] = [];
      seenTerm = true;
    } else if (cur) {
      plan[cur].push(line);
    } else {
      loose.push(line);
    }
  }
  if (!seenTerm && loose.length) plan[t("v_default_term")] = loose;
  return plan;
}

function va_handoff() {
  /* 把本页的学校+课程+目标带到对比页，免重复录入 */
  const ccName = document.getElementById("cc").value;
  const targets = [...document.querySelectorAll("#targets .chip.on")].map(c => c.dataset.v);
  const plan = va_parsePlan(document.getElementById("plan").value);
  const courses = Object.values(plan).flat().join("\n");
  try {
    localStorage.setItem("transferos_handoff",
      JSON.stringify({ cc_name: ccName, courses, targets }));
  } catch (e) { /* 忽略 */ }
  location.href = "compare.html";
}

function va_run() {
  const box = document.getElementById("result");
  const btn = document.getElementById("go");
  const ccName = document.getElementById("cc").value;
  const majorQuery = document.getElementById("major").value.trim() || "computer science";
  const targets = [...document.querySelectorAll("#targets .chip.on")].map(c => c.dataset.v);
  const planText = document.getElementById("plan").value;
  const plan = va_parsePlan(planText);

  try {
    localStorage.setItem(VA_LS_KEY, JSON.stringify(
      { cc_name: ccName, major_query: majorQuery, targets, plan: planText }));
  } catch (e) { /* 忽略 */ }

  if (!ccName) {
    box.innerHTML = `<div class="alert">${va_escape(t("alert_no_cc"))}</div>`;
    return;
  }
  if (!targets.length) {
    box.innerHTML = `<div class="alert">${va_escape(t("alert_no_targets"))}</div>`;
    return;
  }
  if (!Object.keys(plan).length) {
    box.innerHTML = `<div class="empty-card"><div class="illus">${illus("plan")}</div>`
      + `<div class="empty-title">${va_escape(t("empty_plan_title"))}</div>`
      + `<div class="empty-tip">${va_escape(t("empty_plan_tip"))}</div></div>`;
    return;
  }
  btn.disabled = true;
  box.innerHTML = skelHTML();
  setTimeout(() => {
    try {
      const d = va_validatePlan(ccName, targets, majorQuery, plan);
      lastValResult = d;
      va_render(d);
    } catch (e) {
      box.innerHTML = `<div class="alert">${va_escape(t("err_prefix") + e.message)}</div>`;
    }
    btn.disabled = false;
  }, 60);
}

/* 收尾：把本次校验结果摘要存到本机（只存本设备） */
function va_saveResult(btn) {
  if (!lastValResult) return;
  const s = lastValResult.summary || {};
  try {
    localStorage.setItem("transferos_val_result", JSON.stringify({
      ts: Date.now(),
      cc_name: document.getElementById("cc").value,
      major_query: document.getElementById("major").value.trim(),
      targets: lastValResult.targets || [],
      wasted_units: s.wasted_units,
      wasted_courses: s.wasted_courses || [],
    }));
  } catch (e) { /* 忽略 */ }
  if (btn) { btn.disabled = true; btn.textContent = t("fin_saved"); }
}

function va_badge(v) {
  if (v.denied) return `<span class="st fail">${va_escape(t("v_st_denied"))}</span>`;
  if (v.transferable === true) return `<span class="st pass">${va_escape(t("v_st_ok"))}</span>`;
  return `<span class="st warn">${va_escape(t("v_st_unknown"))}</span>`;
}

function va_render(d) {
  const box = document.getElementById("result");
  const s = d.summary;
  let html = "";

  /* ---- 浪费汇总卡 ---- */
  const wasteLine = s.wasted_courses.length
    ? `<div class="cov-num" style="color:#e11d48">${s.wasted_units}<span style="font-size:14px;color:#888"> units</span></div>
       <div class="hint">${va_escape(t("v_wasted_units_line", { u: s.wasted_units, t: s.extra_terms_estimate }))}</div>
       <div class="risk">⚠️ ${va_escape(s.wasted_courses.join("、"))}</div>`
    : `<div class="hint">${va_escape(t("v_no_waste"))}</div>`;
  const atRisk = s.at_risk_courses.length
    ? `<div class="hint">❓ ${va_escape(t("v_at_risk_line", { n: s.at_risk_courses.length }))}：${va_escape(s.at_risk_courses.join("、"))}</div>`
    : "";
  const noAg = (d.no_agreement_targets || []).length
    ? `<div class="hint">ℹ️ ${va_escape(t("v_no_agreement_line", { list: d.no_agreement_targets.join("、") }))}</div>`
    : "";
  const geLine = (s.ge_courses || []).length
    ? `<div class="hint">${va_escape(t("v_ge_line", {
        n: s.ge_courses.length,
        list: s.ge_courses.map(g => `${g.code}(${g.areas.join("、")})`).join("、"),
      }))}</div>`
    : "";
  html += `<div class="card">
    <div class="cov-head"><h3 style="margin:0">${va_escape(t("sec_waste"))}</h3></div>
    ${wasteLine}${atRisk}${geLine}${noAg}
    <div class="hint">${va_escape(s.baseline_note)}</div>
  </div>`;

  /* ---- Cal-GETC 通识进度 ---- */
  const ge = s.ge;
  if (ge && ge.ok) {
    const rows = ge.areas.map(a => {
      const nm = t("ge_area_" + a.code) || a.code;
      const st = a.done
        ? `<span class="st ok">${va_escape(t("ge_done"))}</span>`
        : `<span class="st warn">${va_escape(t("ge_missing", { n: a.need - a.courses.length }))}</span>`;
      const used = a.courses.length
        ? `<div class="hint">${va_escape(a.courses.join("、"))}</div>` : "";
      return `<div class="req"><span class="code">${va_escape(a.code)}</span> ${va_escape(nm)} ${st}${used}</div>`;
    }).join("");
    const banner = ge.all_done ? `<div class="hint">${va_escape(t("ge_all_done"))}</div>` : "";
    const ucsdWarn = [...(d.targets || []), ...(d.no_agreement_targets || [])]
      .some(n => /san diego/i.test(n || ""))
      ? `<div class="risk">${va_escape(t("ge_ucsd_warn"))}</div>` : "";
    html += `<div class="card">
      <div class="cov-head"><h3 style="margin:0">${va_escape(t("sec_ge"))}</h3></div>
      ${banner}${rows}${ucsdWarn}
      <div class="hint">${va_escape(t("ge_note"))}</div>
      <div class="hint" style="margin-top:6px"><a href="https://icas-ca.org/cal-getc/" target="_blank" rel="noopener">${va_escape(t("calgetc_link"))}</a></div>
    </div>`;
  }

  /* ---- 未完成的要求 ---- */
  if ((s.incomplete_requirements || []).length) {
    html += `<div class="card">
      <div class="section-title">${va_escape(t("sec_incomplete"))}</div>` +
      s.incomplete_requirements.map(x =>
        `<div class="req"><span class="code">${va_escape(x.target_code)}</span>
         <span class="st warn">${va_escape(t("st_warn"))}</span>
         <div class="ttl">${va_escape(x.target_title || "")}</div>
         <div class="opts">${va_escape(t("v_missing_partners", { list: x.missing_partners.join(" / ") }))}</div>
         <div class="hint">${va_escape(x.target_name)}</div></div>`
      ).join("") + `</div>`;
  }

  /* ---- 逐学期审查表 ---- */
  for (const term of d.terms) {
    const rows = term.courses.map(v => {
      const sat = (v.satisfies || []).map(x =>
        x.complete
          ? `<div class="via">✓ ${va_escape(t("v_satisfies", { target: x.target_name, code: x.target_code }))}</div>`
          : `<div class="via">◐ ${va_escape(t("v_partial_satisfies", { target: x.target_name, code: x.target_code }))} — ${va_escape(t("v_missing_partners", { list: x.missing_partners.join(" / ") }))}</div>`
      ).join("");
      const deniedAt = (v.denied_at || []).map(x =>
        `<div class="risk">⛔ ${va_escape(t("v_denied_at", { school: x.target_name }))} — ${va_escape(x.note)}</div>`
      ).join("");
      const units = v.units !== null ? v.units : va_escape(t("v_unknown_units"));
      return `<div class="req">
        <span class="code">${va_escape(v.cc_code)}</span>${va_badge(v)}
        <div class="ttl">${va_escape(v.note)}</div>
        ${sat}${deniedAt}
        <div class="hint">${va_escape(String(units))} units</div>
      </div>`;
    }).join("");
    const tw = term.term_wasted_units > 0
      ? `<div class="risk">${va_escape(t("v_term_wasted", { u: term.term_wasted_units }))}</div>` : "";
    html += `<div class="card">
      <div class="cov-head"><h3 style="margin:0">${va_escape(term.term)}</h3></div>
      ${rows}${tw}
    </div>`;
  }

  html += `<div class="disclaimer">${va_escape(d.note)}</div>`;

  if (html) {
    html += `<a class="next-card" href="index.html">`
      + `<div><div class="next-title">${va_escape(t("next_title"))} · ${va_escape(t("next_tag"))}</div>`
      + `<div class="next-tip">${va_escape(t("next_tag_tip"))}</div></div>`
      + `<div class="next-arrow">→</div></a>`;
    html += `<div class="card">
      <div class="btn-row">
        <button type="button" class="btn ghost" onclick="va_saveResult(this)">${va_escape(t("fin_save_btn"))}</button>
        <a class="btn" style="text-align:center;text-decoration:none" href="https://zhuanuc.com" target="_blank" rel="noopener">${va_escape(t("fin_home"))}</a>
      </div>
      <div class="hint" style="margin-top:8px">${va_escape(t("fin_note"))}</div>
    </div>`;
  }
  box.innerHTML = html || (`<div class="empty-card"><div class="illus">${illus("search")}</div>`
    + `<div class="empty-title">${va_escape(t("empty_title"))}</div>`
    + `<div class="empty-tip">${va_escape(t("empty_cmp_tip"))}</div></div>`);
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.__reRender = function () {
  if (lastValResult) va_render(lastValResult);
  else if (!document.querySelector("#result .alert")) va_placeholder();
};

document.addEventListener("DOMContentLoaded", function () {
  Promise.all([
    window.ARTIC_READY || Promise.resolve(),
    window.GE_READY || Promise.resolve(),
  ]).then(va_init);
});
