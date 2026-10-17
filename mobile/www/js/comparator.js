/* Articulation 对比器引擎（JS 移植版）。
 * 移植自 backend/comparator/engine.py，逻辑以 Python 版为准。
 * 数据：ARTIC_DATA（mobile/scripts/build-data.py 生成的紧凑格式）。
 */
"use strict";

function cp_normCode(code) {
  if (!code) return "";
  return String(code).trim().toUpperCase().replace(/\s+/g, " ");
}

function cp_normLabel(text) {
  if (!text) return "";
  return String(text).trim().toLowerCase().replace(/\s+/g, " ");
}

function cp_parseGroup(section) {
  const m = /group_(\d+)\((\w+)\)/.exec(section || "");
  if (m) return [parseInt(m[1], 10), m[2]];
  return [0, "And"];
}

/* 把紧凑格式还原为 Python 版的 report 形状 */
function cp_loadReports() {
  return (ARTIC_DATA || []).map(r => ({
    cc_name: r.cc,
    target_name: r.target,
    major: r.major,
    academic_year: r.year,
    published_date: r.published,
    mappings: (r.mappings || []).map(m => ({
      cc_code: m.cc,
      cc_title: m.cc_t,
      target_code: m.tc,
      target_title: m.tt,
      status: m.st,
      section: m.sec,
    })),
  }));
}

function cp_listOptions() {
  const byCc = {};
  for (const r of cp_loadReports()) {
    const cc = r.cc_name || "", target = r.target_name || "", major = r.major || "";
    if (!byCc[cc]) byCc[cc] = {};
    if (!byCc[cc][target]) byCc[cc][target] = [];
    if (!byCc[cc][target].includes(major)) byCc[cc][target].push(major);
  }
  return { ccs: Object.keys(byCc).sort(), by_cc: byCc };
}

function cp_findReport(reports, ccName, targetName, majorQuery) {
  const q = cp_normLabel(majorQuery);
  const ccN = cp_normLabel(ccName), tgtN = cp_normLabel(targetName);
  for (const r of reports) {
    if (cp_normLabel(r.cc_name) === ccN &&
        cp_normLabel(r.target_name) === tgtN &&
        cp_normLabel(r.major).includes(q)) {
      return r;
    }
  }
  return null;
}

function cp_groupArticulated(mappings) {
  const groups = {};
  for (const m of mappings) {
    if (m.status !== "articulated" || !m.target_code) continue;
    const [gi, conj] = cp_parseGroup(m.section);
    if (!groups[m.target_code]) groups[m.target_code] = [];
    groups[m.target_code].push({
      group: gi,
      conj,
      cc_code: cp_normCode(m.cc_code),
      cc_title: m.cc_title || "",
      target_title: m.target_title || "",
    });
  }
  return groups;
}

function cp_compare(ccName, majorQuery, targetNames, studentCourses) {
  const reports = cp_loadReports();
  const have = new Set(
    (studentCourses || []).map(cp_normCode).filter(Boolean)
  );
  const targets = [];
  for (const target of targetNames) {
    const report = cp_findReport(reports, ccName, target, majorQuery);
    if (!report) {
      targets.push({
        target_name: target,
        status: "no_agreement",
        note: t("d_noagreement"),
      });
      continue;
    }
    targets.push(cp_compareOne(report, have));
  }
  return {
    cc_name: ccName,
    major_query: majorQuery,
    student_courses: [...have].sort(),
    targets,
    note: t("d_main_note"),
  };
}

function cp_compareOne(report, have) {
  const mappings = report.mappings || [];
  const articulated = cp_groupArticulated(mappings);

  const deniedCodes = {};
  for (const m of mappings) {
    if (m.status === "denied" && m.cc_code)
      deniedCodes[cp_normCode(m.cc_code)] = m.target_title || "";
  }

  const items = [];
  // 1) 有 articulation 的目标课程要求
  for (const tcode of Object.keys(articulated).sort()) {
    const rows = articulated[tcode];
    const title = rows[0].target_title;
    const byGroup = {};
    for (const r of rows) {
      if (!byGroup[r.group]) byGroup[r.group] = { conj: r.conj, codes: [] };
      byGroup[r.group].codes.push(r.cc_code);
    }
    const satisfiedVia = [];
    let covered = false;
    const options = [];
    const optionGroups = [];
    for (const gi of Object.keys(byGroup).map(Number).sort((a, b) => a - b)) {
      const g = byGroup[gi];
      const codes = [...new Set(g.codes.filter(Boolean))].sort();
      if (!codes.length) continue;
      options.push(...codes);
      /* And 组内是"都要修"，Or 组内是"任选其一"——显示必须区分，
       * 否则 "A / B" 会误导用户以为任选其一即可 */
      const conj = (g.conj || "And").toLowerCase();
      optionGroups.push(conj === "or" ? codes.join(" / ") : codes.join(" + "));
      if (conj === "or") {
        const hit = codes.filter(c => have.has(c));
        if (hit.length) { covered = true; satisfiedVia.push(...hit); }
      } else { // And：组内课程要全修
        if (codes.every(c => have.has(c))) {
          covered = true; satisfiedVia.push(...codes);
        }
      }
    }
    // 组间连接词绝大多数是 Or；按"任一组满足即覆盖"处理
    items.push({
      target_code: tcode,
      target_title: title,
      status: covered ? "covered" : "missing",
      via: [...new Set(satisfiedVia)].sort(),
      options: [...new Set(options)].sort(),
      options_display: optionGroups.join(t("d_opt_sep")),
      detail: covered ? t("d_covered")
        : t("d_missing", { options: optionGroups.join(t("d_opt_sep")) }),
    });
  }

  // 2) 明确无 articulation 的目标课程：只能转学后修
  const seenNoart = new Set();
  for (const m of mappings) {
    if (m.status === "no_articulation" && m.target_code) {
      const tcode = m.target_code;
      if (seenNoart.has(tcode) || articulated[tcode]) continue;
      seenNoart.add(tcode);
      items.push({
        target_code: tcode,
        target_title: m.target_title || "",
        status: "no_articulation",
        via: [],
        options: [],
        detail: t("d_noartic"),
      });
    }
  }

  // 3) 白修预警：学生课程命中 denied 列表
  const wasted = [...have].filter(c => deniedCodes[c]).sort()
    .map(c => ({ cc_code: c, note: t("d_wasted", { title: deniedCodes[c] }) }));

  const coveredN = items.filter(i => i.status === "covered").length;
  const missing = items.filter(i => i.status === "missing");
  return {
    target_name: report.target_name || "",
    major_label: report.major || "",
    academic_year: report.academic_year || "",
    published_date: report.published_date || "",
    status: "ok",
    total_requirements: items.length,
    covered: coveredN,
    coverage_pct: items.length ? Math.round(coveredN / items.length * 100) : 0,
    items,
    missing: missing.map(i => ({
      target_code: i.target_code, target_title: i.target_title, options: i.options,
    })),
    must_take_after_transfer: items
      .filter(i => i.status === "no_articulation")
      .map(i => ({ target_code: i.target_code, target_title: i.target_title })),
    wasted,
  };
}
