/* Articulation 对比器引擎（JS 移植版）。
 * 移植自 backend/comparator/engine.py，逻辑以 Python 版为准。
 * 数据：ARTIC_DATA（mobile/scripts/build-data.py 生成的紧凑格式）。
 */
"use strict";

function cp_normCode(code) {
  if (!code) return "";
  return String(code).trim().toUpperCase().replace(/[-._]/g, " ").replace(/\s+/g, " ");
}

/* 无空格形态：ACCT1A <-> ACCT 1A 互认 */
function cp_flat(code) { return cp_normCode(code).replace(/ /g, ""); }

/* 带归属的已修课集合：课程代码在各校之间全面重叠（如 MATH 1A 几乎每所都有），
 * 同一代码必须连同学校一起判定——只在"列出它的那份 CC 协议"里才算数。
 * have = { pairs: Set<"ccLabel|flatCode">, perCc: [{cc_name, courses:[规范码]}] }。
 * 双向容错保留：ACCT1A <-> ACCT 1A 任一方向都能命中（flat 形态比对）。 */
function cp_makeHave(entries) {
  const pairs = new Set();
  const perCc = [];
  for (const e of (entries || [])) {
    const ccL = cp_normLabel(e.cc_name);
    if (!ccL) continue;
    const codes = [];
    for (const c of (e.courses || [])) {
      const n = cp_normCode(c);
      if (!n) continue;
      pairs.add(ccL + "|" + n.replace(/ /g, ""));
      if (!codes.includes(n)) codes.push(n);
    }
    perCc.push({ cc_name: e.cc_name, courses: codes.sort() });
  }
  return { pairs, perCc };
}
/* 学生是否在 ccName 这所学校修过 code（flat 形态比对，空格容错）。 */
function cp_has(have, ccName, code) {
  const f = cp_normCode(code).replace(/ /g, "");
  if (!f) return false;
  return have.pairs.has(cp_normLabel(ccName) + "|" + f);
}

function cp_normLabel(text) {
  if (!text) return "";
  return String(text).trim().toLowerCase().replace(/\s+/g, " ");
}

/* 专业名归一化：消除各校 ASSIST 报告里同一专业的写法差异——学位后缀
 * 分隔符（"Computer Science/B.S." vs "Computer Science, B.S." vs
 * "Computer Science B.S."）、"&" vs "and"、"A.B." vs "B.A."；
 * 只归一化格式，不改专业本身的词。 */
function cp_normMajor(text) {
  if (!text) return "";
  let t = String(text).toLowerCase().replace(/&/g, " and ");
  t = t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/\ba b\b/g, "b a"); /* A.B.（伯克利写法）与 B.A. 同一学位 */
  return t;
}

/* 归一化串里的学位：B.S. -> "bs"，B.A. -> "ba"，无学位 -> "" */
function cp_majorDegree(normMajor) {
  if (/(^|\s)b s(\s|$)/.test(normMajor)) return "bs";
  if (/(^|\s)b a(\s|$)/.test(normMajor)) return "ba";
  return "";
}

/* 查询词的归一化形态：原样 + 去掉开头的院系代号前缀
 *（"CSE: Computer Science B.S." 与 "Computer Science B.S." 同一专业）。*/
function cp_majorQueries(query) {
  const q = cp_normMajor(query);
  if (!q) return [];
  const out = [q];
  const stripped = q.replace(/^(cse|eecs|ece|cs|ce)\s+(?=\S)/, "");
  if (stripped && stripped !== q) out.push(stripped);
  return out;
}

/* 一条 label 是否命中查询词。
 * prefixOnly=true：只认前缀命中（"computer science" -> "Computer Science/B.S."）；
 * prefixOnly=false：再认子串兜底（"data science" -> "Statistics and Data Science/B.S."），
 * 但子串兜底只对不带学位的查询开放——带学位的查询（如 "Computer Science, B.A."）
 * 若允许子串，会误命中 "Linguistics and Computer Science/B.A." 这类不同专业。*/
function cp_majorMatch(label, query, prefixOnly) {
  const l = cp_normMajor(label);
  if (!l) return false;
  for (const q of cp_majorQueries(query)) {
    if (!q) continue;
    const at = l.indexOf(q);
    if (at === 0) return true;
    if (!prefixOnly && at !== -1 && !cp_majorDegree(q)) return true;
  }
  return false;
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
      /* 学期规划用：CC 课程学分（articulated 行必有，为数字字符串）。 */
      cc_units: m.cu || "",
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

/* 两遍找报告：第一遍前缀精确命中，第二遍子串兜底。
 * 旧逻辑是裸子串（label.includes(query)），"Computer Science/B.S." 命中不了
 * "Computer Science, B.S."——各校同一专业的写法差异（/ 与 , 与空格）导致查无协议。*/
function cp_findReport(reports, ccName, targetName, majorQuery) {
  const ccN = cp_normLabel(ccName), tgtN = cp_normLabel(targetName);
  const pool = [];
  for (const r of reports) {
    if (cp_normLabel(r.cc_name) === ccN && cp_normLabel(r.target_name) === tgtN) pool.push(r);
  }
  for (const r of pool) {
    if (cp_majorMatch(r.major, majorQuery, true)) return r;
  }
  for (const r of pool) {
    if (cp_majorMatch(r.major, majorQuery, false)) return r;
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
      source_cc: m.source_cc || "",
    });
  }
  return groups;
}

/* 把多所 CC 的报告合并成一份虚拟报告：mappings 打上来源 CC 标签，再按组判定。
 * 同一目标课程在 A 校无对应课、在 B 校有——只有两校都没有时才算 no_articulation；
 * And 组可以跨两校拆分（A 校修一半、B 校修一半也算覆盖）。 */
/* 合并多份报告为一份虚拟报告：映射行原样拼接并打上 source_cc。
 * 关键：组编号只在单份报告内有意义——两份报告的 group_0 是各自独立的
 * 备选方案（不是同一 And 组的一半）。直接拼接会把它们并成一个 And 组，
 * 导致单校已覆盖的要求在加了第二所后反而变缺失（实测：SMC MATH 7 覆盖
 * MATH 31A，加空 De Anza 后变 missing）。所以每份报告的组编号按报告
 * 序号偏移（+1000），合并后各组仍是独立备选；跨校的真正收益在要求项
 * 层面（不同目标要求分别由两校覆盖），不在组内。 */
function cp_mergeReports(reports) {
  if (!reports.length) return null;
  const merged = {
    cc_name: reports[0].cc_name || "",
    cc_names: reports.map(r => r.cc_name || ""),
    target_name: reports[0].target_name || "",
    major: reports[0].major || "",
    academic_year: reports.map(r => r.academic_year || "").filter(Boolean).sort().reverse()[0] || "",
    published_date: reports.map(r => r.published_date || "").filter(Boolean).sort().reverse()[0] || "",
    mappings: [],
  };
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    const off = i * 1000; /* 组编号按报告偏移，避免跨报告同号组合并 */
    for (const m of (r.mappings || [])) {
      const sec = String(m.section || "")
        .replace(/group_(\d+)\(/g, (_, n) => `group_${parseInt(n, 10) + off}(`)
        .replace(/(\d+)-(\d+):/g, (_, a, b) => `${parseInt(a, 10) + off}-${parseInt(b, 10) + off}:`);
      merged.mappings.push(Object.assign({}, m, { source_cc: r.cc_name || "", section: sec }));
    }
  }
  return merged;
}

/* 对比入口：cc2Name / studentCourses2 可选；第二所与主校相同时自动去重为单校。
 * 内部按"收 N 份报告"的通用形状写（entries 数组），界面只开放第二所。 */
function cp_compare(ccName, majorQuery, targetNames, studentCourses, cc2Name, studentCourses2) {
  const entries = [{ cc_name: ccName, courses: studentCourses }];
  if (cc2Name && cp_normLabel(cc2Name) && cp_normLabel(cc2Name) !== cp_normLabel(ccName))
    entries.push({ cc_name: cc2Name, courses: studentCourses2 });
  return cp_compareEntries(entries, majorQuery, targetNames);
}

function cp_compareEntries(entries, majorQuery, targetNames) {
  const reports = cp_loadReports();
  const have = cp_makeHave(entries);
  const ccNames = entries.map(e => e.cc_name).filter(Boolean);
  const targets = [];
  for (const target of targetNames) {
    const found = [];
    for (const e of entries) {
      const r = cp_findReport(reports, e.cc_name, target, majorQuery);
      if (r) found.push(r);
    }
    if (!found.length) {
      targets.push({
        target_name: target,
        status: "no_agreement",
        note: t("d_noagreement"),
      });
      continue;
    }
    targets.push(cp_compareOne(cp_mergeReports(found), have));
  }
  const allCourses = [...new Set(have.perCc.flatMap(e => e.courses))].sort();
  return {
    cc_name: ccNames[0] || "",
    cc_names: ccNames,
    major_query: majorQuery,
    student_courses: allCourses,
    student_courses_by_cc: have.perCc,
    targets,
    note: t("d_main_note"),
  };
}

function cp_compareOne(report, have) {
  const mappings = report.mappings || [];
  /* 直接调用时映射行可能没有 source_cc 标签（单校旧路径）：默认取报告本身的 CC。 */
  for (const m of mappings) {
    if (!m.source_cc) m.source_cc = report.cc_name || "";
  }
  const articulated = cp_groupArticulated(mappings);

  const deniedCodes = {};
  for (const m of mappings) {
    if (m.status === "denied" && m.cc_code) {
      const key = cp_normLabel(m.source_cc || report.cc_name || "") + "|" + cp_normCode(m.cc_code).replace(/ /g, "");
      deniedCodes[key] = m.target_title || "";
    }
  }

  const items = [];
  // 1) 有 articulation 的目标课程要求
  for (const tcode of Object.keys(articulated).sort()) {
    const rows = articulated[tcode];
    const title = rows[0].target_title;
    const byGroup = {};
    for (const r of rows) {
      if (!byGroup[r.group]) byGroup[r.group] = { conj: r.conj, codes: [] };
      byGroup[r.group].codes.push({ code: r.cc_code, cc: r.source_cc || "" });
    }
    const satisfiedVia = [];
    const satisfiedDetail = [];
    let covered = false;
    const options = [];
    const optionsDetail = [];
    const optionGroups = [];
    for (const gi of Object.keys(byGroup).map(Number).sort((a, b) => a - b)) {
      const g = byGroup[gi];
      /* 同一代码可能来自两所 CC 的报告：按 (代码, 来源 CC) 去重，判定只看
       * 学生在"列出该代码的那所 CC"修过它。 */
      const seenPair = new Set();
      const pairs = [];
      for (const p of g.codes) {
        if (!p.code) continue;
        const k = cp_normCode(p.code).replace(/ /g, "") + "|" + cp_normLabel(p.cc);
        if (seenPair.has(k)) continue;
        seenPair.add(k);
        pairs.push(p);
      }
      const codes = [...new Set(pairs.map(p => p.code))].sort();
      if (!codes.length) continue;
      options.push(...codes);
      for (const p of pairs) {
        if (!optionsDetail.some(o => o.code === p.code && o.cc === p.cc))
          optionsDetail.push({ code: p.code, cc: p.cc });
      }
      /* And 组内是"都要修"，Or 组内是"任选其一"——显示必须区分，
       * 否则 "A / B" 会误导用户以为任选其一即可 */
      const conj = (g.conj || "And").toLowerCase();
      optionGroups.push(conj === "or" ? codes.join(" / ") : codes.join(" + "));
      /* 每门代码的命中 = 学生在该代码的来源 CC 修过它 */
      const hits = pairs.filter(p => cp_has(have, p.cc, p.code));
      if (conj === "or") {
        if (hits.length) {
          covered = true;
          for (const h of hits) {
            satisfiedVia.push(h.code);
            satisfiedDetail.push({ code: h.code, cc: h.cc });
          }
        }
      } else { // And：组内每门代码都要在来源 CC 修过
        const hitCodes = new Set(hits.map(h => cp_normCode(h.code).replace(/ /g, "")));
        if (codes.every(c => hitCodes.has(cp_normCode(c).replace(/ /g, "")))) {
          covered = true;
          for (const h of hits) {
            satisfiedVia.push(h.code);
            satisfiedDetail.push({ code: h.code, cc: h.cc });
          }
        }
      }
    }
    // 组间连接词绝大多数是 Or；按"任一组满足即覆盖"处理
    items.push({
      target_code: tcode,
      target_title: title,
      status: covered ? "covered" : "missing",
      via: [...new Set(satisfiedVia)].sort(),
      via_detail: satisfiedDetail.filter((v, i, a) =>
        a.findIndex(x => x.code === v.code && x.cc === v.cc) === i),
      options: [...new Set(options)].sort(),
      options_detail: optionsDetail.sort((a, b) =>
        (a.code < b.code ? -1 : a.code > b.code ? 1 : (a.cc < b.cc ? -1 : a.cc > b.cc ? 1 : 0))),
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

  // 3) 白修预警：学生课程命中 denied 列表（按来源 CC 各自算——
  // 在 A 校被拒的课，在 B 校修的不算白修；同一代码两校都修过，只标被拒的那一所）
  const wasted = [];
  for (const e of have.perCc) {
    for (const c of e.courses) {
      const key = cp_normLabel(e.cc_name) + "|" + c.replace(/ /g, "");
      if (deniedCodes[key])
        wasted.push({ cc_code: c, cc_name: e.cc_name, note: t("d_wasted", { title: deniedCodes[key] }) });
    }
  }
  wasted.sort((a, b) => (a.cc_code < b.cc_code ? -1 : a.cc_code > b.cc_code ? 1
    : (a.cc_name < b.cc_name ? -1 : a.cc_name > b.cc_name ? 1 : 0)));

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
