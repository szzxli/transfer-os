/* 课程计划校验器引擎（JS 移植版）。
 * 移植自 backend/validator/engine.py，逻辑以 Python 版为准。
 * 判定口径（诚实版，unknown 不判死）：
 * - transferable=true：至少在一所目标校协议中有 articulation
 * - denied=true：在某校协议里被明确拒绝承认 → 白修实锤（wasted, confidence=high）
 * - transferable="unknown"：协议里找不到该课 → 可能是 GE 课，不判死，
 *   记 wasted=true/confidence="low"（存疑），提示对照 Cal-GETC 清单核实
 * - satisfies：列出该课满足的目标要求；And 组缺同伴时 complete=false
 *   并给出 missing_partners（还需修哪几门才算满足）
 * 数据：ARTIC_DATA 紧凑格式（含 cu=cc_units 字段）。
 * 依赖：comparator.js 的 cp_normCode / cp_parseGroup / cp_findReport，i18n.js 的 t()。
 */
"use strict";

/* 学期制：全日制一学期约 15 semester 学分；转学基准 60 学分 */
var VA_UNITS_PER_TERM = 15;

function va_parseUnits(text) {
  if (text === null || text === undefined) return null;
  const v = parseFloat(String(text).trim());
  return (isNaN(v) || v <= 0) ? null : v;
}

/* 紧凑格式 → 校验器内部形状（含学分） */
function va_loadReports() {
  return (ARTIC_DATA || []).map(r => ({
    cc_name: r.cc,
    target_name: r.target,
    major: r.major,
    mappings: (r.mappings || []).map(m => ({
      cc_code: cp_normCode(m.cc),
      cc_units: m.cu || "",
      target_code: m.tc || "",
      target_title: m.tt || "",
      status: m.st || "",
      section: m.sec || "",
    })),
  }));
}

function va_indexByCcCode(mappings) {
  const idx = {};
  for (const m of mappings || []) {
    const code = m.cc_code;
    if (!code) continue;
    if (!idx[code]) idx[code] = [];
    idx[code].push(m);
  }
  return idx;
}

/* 把 articulated 行按 target_code 分组，保留组号/组内连接词/课程代码 */
function va_articulationGroups(mappings) {
  const groups = {};
  for (const m of mappings) {
    if (m.status !== "articulated" || !m.target_code) continue;
    const [gi, conj] = cp_parseGroup(m.section);
    const tcode = m.target_code;
    if (!groups[tcode]) groups[tcode] = [];
    const bucket = groups[tcode];
    const found = bucket.find(g => g.group === gi);
    if (found) {
      found.codes.push(m.cc_code);
    } else {
      bucket.push({
        group: gi, conj,
        codes: [m.cc_code],
        title: m.target_title || "",
      });
    }
  }
  return groups;
}

/* 审查计划中的一门课（code 已归一化），返回逐门课结论 */
function va_assessCourse(code, planSet, targetReports) {
  const satisfies = [];
  const deniedAt = [];
  let units = null;

  for (const [targetName, report] of targetReports) {
    const mappings = report.mappings || [];
    const idx = va_indexByCcCode(mappings);
    const hits = idx[code] || [];
    for (const m of hits) {
      const u = va_parseUnits(m.cc_units);
      if (u !== null && units === null) units = u;
      if (m.status === "denied") {
        deniedAt.push({
          target_name: targetName,
          note: m.target_title || t("v_denied_noname"),
        });
      }
    }
    /* articulation 满足情况：看该课参与的每个 (目标课程, 组) */
    const groups = va_articulationGroups(mappings);
    for (const tcode of Object.keys(groups)) {
      for (const g of groups[tcode]) {
        if (!g.codes.includes(code)) continue;
        const codes = g.codes.filter(Boolean);
        let complete, missing;
        if (g.conj.toLowerCase() === "or") {
          complete = true; missing = [];
        } else { /* And：组内课程要全在计划里才算满足 */
          missing = codes.filter(c => !planSet.has(c)).sort();
          complete = missing.length === 0;
        }
        satisfies.push({
          target_name: targetName,
          target_code: tcode,
          target_title: g.title,
          complete,
          missing_partners: missing,
        });
      }
    }
  }

  let transferable;
  if (satisfies.length) transferable = true;
  else if (deniedAt.length) transferable = false;
  else transferable = "unknown";

  const denied = deniedAt.length > 0;
  let wasted, confidence;
  if (denied && !satisfies.length) {
    wasted = true; confidence = "high";   /* 实锤：明确被拒且别处也用不上 */
  } else if (denied) {
    wasted = false; confidence = null;    /* 别处能用，不算白修，但标 denied */
  } else if (!satisfies.length) {
    wasted = true; confidence = "low";     /* 存疑：协议里找不到，可能是 GE 课 */
  } else {
    wasted = false; confidence = null;
  }

  let note;
  if (transferable === true) {
    note = t("v_note_ok") +
      (satisfies.some(s => !s.complete) ? t("v_note_ok_partial") : "");
  } else if (denied) {
    note = t("v_note_denied");
  } else {
    note = t("v_note_unknown");
  }

  return {
    cc_code: code,
    transferable,
    satisfies,
    wasted,
    wasted_confidence: confidence,
    denied,
    denied_at: deniedAt,
    units, /* null = unknown */
    note,
  };
}

/* 校验按学期分的课程计划。
 * plan: {"Fall 2026": ["CS A250", "MATH A180"], ...}。
 * optReports: 可选，测试时注入（与 va_loadReports() 同形状）。
 */
function va_validatePlan(ccName, targetNames, majorQuery, plan, optReports) {
  const reports = optReports || va_loadReports();

  /* 找每所目标校的报告；找不到的记 no_agreement（未知，不判死） */
  const targetReports = [];
  const noAgreement = [];
  for (const tname of targetNames || []) {
    const r = cp_findReport(reports, ccName, tname, majorQuery);
    if (!r) noAgreement.push(tname);
    else targetReports.push([tname, r]);
  }

  /* 计划全集（归一化），用于 And 组完整性判定 */
  const planSet = new Set();
  const normPlan = {};
  for (const term of Object.keys(plan || {})) {
    const codes = (plan[term] || []).map(cp_normCode).filter(Boolean);
    normPlan[term] = codes;
    codes.forEach(c => planSet.add(c));
  }

  const terms = [];
  let wastedHighUnits = 0;
  const unknownUnitCourses = [];
  const allVerdicts = [];
  for (const term of Object.keys(normPlan)) {
    const tcs = [];
    for (const code of normPlan[term]) {
      const v = va_assessCourse(code, planSet, targetReports);
      tcs.push(v);
      allVerdicts.push(v);
      if (v.wasted && v.wasted_confidence === "high") {
        if (v.units !== null) wastedHighUnits += v.units;
        else unknownUnitCourses.push(code);
      }
    }
    terms.push({
      term,
      courses: tcs,
      term_wasted_units: Math.round(
        tcs.reduce((s, c) => s + ((c.wasted && c.wasted_confidence === "high" && c.units !== null) ? c.units : 0), 0) * 10
      ) / 10,
    });
  }

  const wastedCourses = allVerdicts
    .filter(v => v.wasted && v.wasted_confidence === "high")
    .map(v => v.cc_code);
  const atRiskCourses = allVerdicts
    .filter(v => v.wasted && v.wasted_confidence === "low")
    .map(v => v.cc_code);

  /* 未完成的要求：计划里有部分 And 组课程但缺同伴 */
  const incomplete = [];
  const seen = new Set();
  for (const v of allVerdicts) {
    for (const s of v.satisfies) {
      if (!s.complete) {
        const key = s.target_name + "||" + s.target_code;
        if (!seen.has(key)) {
          seen.add(key);
          incomplete.push({
            target_name: s.target_name,
            target_code: s.target_code,
            target_title: s.target_title,
            missing_partners: s.missing_partners,
          });
        }
      }
    }
  }

  wastedHighUnits = Math.round(wastedHighUnits * 10) / 10;
  const extraTerms = Math.round(wastedHighUnits / VA_UNITS_PER_TERM * 10) / 10;
  return {
    cc_name: ccName,
    major_query: majorQuery,
    targets: targetReports.map(([tname]) => tname),
    no_agreement_targets: noAgreement,
    terms,
    summary: {
      total_courses: allVerdicts.length,
      transferable_n: allVerdicts.filter(v => v.transferable === true).length,
      denied_n: allVerdicts.filter(v => v.denied).length,
      wasted_courses: wastedCourses,       /* 实锤 */
      at_risk_courses: atRiskCourses,      /* 存疑（可能是 GE） */
      wasted_units: wastedHighUnits,
      unknown_unit_courses: unknownUnitCourses,
      extra_terms_estimate: extraTerms,
      baseline_note: t("v_baseline_note", { u: wastedHighUnits, t: extraTerms }),
      incomplete_requirements: incomplete,
    },
    note: t("v_main_note"),
  };
}
