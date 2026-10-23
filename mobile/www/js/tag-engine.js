/* TAG 资格检查引擎（JS 移植版）。
 * 移植自 backend/tag_engine/checker.py，逻辑以 Python 版为准。
 * 文案全部走 i18n.js 的 t() 模板（需先加载 i18n.js；APP_LANG 决定语言）。
 * 设计原则：
 * 1. 所有判定只走规则引擎（TAG_DATA），不调用任何 LLM。
 * 2. 规则里标为 unknown 的字段一律跳过（status=skip），不判死刑。
 * 3. TAG 评分是启发式分数（100 起扣），仅供参考。
 */
"use strict";

const TE_PASS = "pass", TE_FAIL = "fail", TE_WARN = "warn", TE_SKIP = "skip";
const FAIL_PENALTY = 30, WARN_PENALTY = 8;

function te_norm(text) {
  if (!text) return "";
  return String(text).trim().toLowerCase()
    .replace(/ /g, "_").replace(/-/g, "_").replace(/\./g, "_")
    .replace(/_+/g, "_");
}

function te_isUnknown(v) {
  return typeof v === "string" && v.trim().toLowerCase() === "unknown";
}

function te_makeCheck(id, label, status, detail) {
  return { id, label, status, detail };
}

function te_gfmt(x) {
  // 对应 Python f"{x:g}"：去掉浮点 artifact（如 3.5999999046325684 → 3.6）
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (!isFinite(n)) return String(x);
  return String(Math.round(n * 1e6) / 1e6);
}

/* ---------------- 学校 ---------------- */
function te_normSchool(school) {
  let s = String(school).trim().toLowerCase().replace(/ /g, "-").replace(/_/g, "-");
  if (!s.startsWith("uc-")) s = "uc-" + s;
  return s;
}
function te_listSchools() {
  return Object.keys(TAG_DATA).sort();
}
function te_loadRule(school) {
  const sid = te_normSchool(school);
  const rule = TAG_DATA[sid];
  if (!rule) {
    const avail = te_listSchools().join(", ") || "（无）";
    throw new Error(`未找到学校 [${school}] 的 TAG 规则。可用学校：${avail}`);
  }
  return Object.assign({ _school_id: sid }, rule);
}

/* ---------------- GPA 阈值解析 ---------------- */
function te_resolveGpa(gpaRule, college, major) {
  // 返回 [threshold|null, matched|null]
  if (typeof gpaRule === "number") return [gpaRule, "统一要求"];
  if (!gpaRule || typeof gpaRule !== "object" || Array.isArray(gpaRule)) return [null, null];
  const collegeN = te_norm(college), majorN = te_norm(major);

  function pickFallback(block) {
    for (const k of Object.keys(block)) {
      if (k === "note") continue;
      const v = block[k];
      if (te_norm(k).startsWith("all_") && typeof v === "number") return [v, k];
    }
    return [null, null];
  }

  // 步骤 1：按学院定位
  if (collegeN) {
    for (const key of Object.keys(gpaRule)) {
      if (key === "note") continue;
      const val = gpaRule[key];
      const kn = te_norm(key);
      if (kn === collegeN || collegeN.includes(kn) || kn.includes(collegeN)) {
        if (val && typeof val === "object" && !Array.isArray(val)) {
          if (majorN) {
            for (const mk of Object.keys(val)) {
              if (mk === "note") continue;
              const mv = val[mk];
              if (te_norm(mk) === majorN && typeof mv === "number")
                return [mv, `${key} / ${mk}`];
            }
          }
          const [thr, matched] = pickFallback(val);
          if (thr !== null) return [thr, `${key} / ${matched}`];
          return [null, null];
        }
        if (typeof val === "number") return [val, key];
        return [null, null];
      }
    }
  }
  // 步骤 1.5：没给学院时，在所有学院块里按专业名全局搜索
  if (majorN) {
    for (const key of Object.keys(gpaRule)) {
      if (key === "note") continue;
      const val = gpaRule[key];
      if (!val || typeof val !== "object" || Array.isArray(val)) continue;
      for (const mk of Object.keys(val)) {
        if (mk === "note") continue;
        const mv = val[mk];
        if (te_norm(mk) === majorN && typeof mv === "number")
          return [mv, `${key} / ${mk}`];
      }
    }
  }
  // 步骤 2：顶层按专业精确匹配
  if (majorN) {
    for (const key of Object.keys(gpaRule)) {
      if (key === "note") continue;
      const val = gpaRule[key];
      if (te_norm(key) === majorN && typeof val === "number") return [val, key];
    }
  }
  // 步骤 3：顶层 all_majors 兜底
  for (const key of Object.keys(gpaRule)) {
    if (key === "note") continue;
    const val = gpaRule[key];
    if (te_norm(key) === "all_majors" && typeof val === "number") return [val, "all_majors"];
  }
  return [null, null];
}

/* 显示层人话化：规则键名（如 all_majors、college_of_engineering）不直接给用户看 */
function te_humanMatched(m) {
  if (m === null || m === undefined) return m;
  if (m === "统一要求") return t("gpa_scope_uniform");
  return String(m).split(" / ").map(part =>
    te_norm(part) === "all_majors" ? t("gpa_scope_all") : part.replace(/_/g, " ")
  ).join(" / ");
}

function te_humanUnknown(path) {
  const seg = String(path).split(".").pop() || "";
  if (seg === "tag_major_must_match_uc_app_major") return t("label_major_match");
  if (seg.indexOf("excluded_majors") === 0) return t("unk_excluded");
  if (seg === "unit_cap_senior_standing") return t("unk_unit_cap");
  return seg.replace(/_/g, " ");
}

function te_checkGpa(requirements, profile) {
  const L = t("label_gpa");
  const gpaRule = requirements.min_gpa !== undefined ? requirements.min_gpa : requirements.min_gpa_by_major;
  if (gpaRule === undefined || gpaRule === null || te_isUnknown(gpaRule))
    return te_makeCheck("gpa", L, TE_SKIP, t("d_gpa_skip_norule"));
  const [threshold, matchedRaw] = te_resolveGpa(gpaRule, profile.college, profile.major);
  const matched = te_humanMatched(matchedRaw);
  if (threshold === null)
    return te_makeCheck("gpa", L, TE_SKIP, t("d_gpa_skip_nothreshold"));
  const gpa = profile.gpa;
  if (gpa === null || gpa === undefined || gpa === "")
    return te_makeCheck("gpa", L, TE_WARN, t("d_gpa_warn_nogpa", { matched, threshold }));
  const gpaF = Number(gpa);
  if (!isFinite(gpaF))
    return te_makeCheck("gpa", L, TE_WARN, t("d_gpa_warn_badfmt", { matched, threshold }));
  if (gpaF >= threshold)
    return te_makeCheck("gpa", L, TE_PASS, t("d_gpa_pass", { gpa: te_gfmt(gpaF), threshold: te_gfmt(threshold), matched }));
  return te_makeCheck("gpa", L, TE_FAIL, t("d_gpa_fail", { gpa: te_gfmt(gpaF), threshold: te_gfmt(threshold), matched }));
}

/* ---------------- 学分 ---------------- */
function te_extractUnits(text) {
  if (!text || te_isUnknown(text)) return null;
  const s = String(text);
  let m = s.match(/(\d+(?:\.\d+)?)\s*semester/);
  if (m) return parseFloat(m[1]);
  m = s.match(/(\d+(?:\.\d+)?)\s*quarter/);
  if (m) return parseFloat(m[1]) * 2 / 3;
  return null;
}

function te_checkUnits(requirements, profile) {
  const L = t("label_units");
  const text = requirements.min_units_at_tag_submission;
  const needed = typeof text === "string" ? te_extractUnits(text) : null;
  if (needed === null)
    return te_makeCheck("units", L, TE_SKIP, t("d_units_skip"));
  const units = profile.units_completed;
  if (units === null || units === undefined || units === "")
    return te_makeCheck("units", L, TE_WARN,
      t("d_units_warn_nounits", { needed: te_gfmt(needed) }));
  const u = Number(units);
  if (!isFinite(u)) return te_makeCheck("units", L, TE_WARN, t("d_units_warn_badfmt"));
  if (u >= needed)
    return te_makeCheck("units", L, TE_PASS,
      t("d_units_pass", { u: te_gfmt(u), needed: te_gfmt(needed) }));
  return te_makeCheck("units", L, TE_FAIL,
    t("d_units_fail", { u: te_gfmt(u), needed: te_gfmt(needed) }));
}

/* ---------------- 英语 / 数学 ---------------- */
function te_splitEnglishMath(requirements) {
  const english = requirements.english || [];
  const math = requirements.math || [];
  const combined = requirements.english_and_math || [];
  if ((!english.length) && (!math.length) && combined.length) {
    const eng = combined.filter(s => /UC-E|english/i.test(s));
    const mat = combined.filter(s => /UC-M|math/i.test(s));
    return [eng.length ? eng : combined, mat.length ? mat : combined];
  }
  return [english, math];
}

function te_checkEnglishMath(requirements, profile) {
  const [englishReqs, mathReqs] = te_splitEnglishMath(requirements);
  const checks = [];
  function one(labelKey, kindKey, code, reqs, done) {
    const L = t(labelKey), kind = t(kindKey);
    const timing = reqs.filter(s => typeof s === "string").map(s => s.trim()).join("；");
    if (!reqs.length)
      return te_makeCheck(code === "E" ? "english" : "math", L, TE_SKIP,
        t("d_em_skip", { kind }));
    if (done === null || done === undefined || done === "")
      return te_makeCheck(code === "E" ? "english" : "math", L, TE_WARN,
        t("d_em_warn_nodone", { timing }));
    const need = code === "E" ? 2 : 1;
    if (done >= need)
      return te_makeCheck(code === "E" ? "english" : "math", L, TE_PASS,
        t("d_em_pass", { done, code, timing }));
    if (code === "E" && done === 1)
      return te_makeCheck("english", L, TE_WARN, t("d_em_warn_one", { timing }));
    return te_makeCheck(code === "E" ? "english" : "math", L, TE_FAIL,
      t("d_em_fail", { kind, timing }));
  }
  checks.push(one("label_english", "kind_english", "E", englishReqs, profile.english_done));
  checks.push(one("label_math", "kind_math", "M", mathReqs, profile.math_done));
  return checks;
}

/* ---------------- 专业排除 / 学士学位 / 其他 ---------------- */
function te_excludedKeys(requirements) {
  const current = [], future = [];
  for (const key of Object.keys(requirements)) {
    if (!key.startsWith("excluded_majors")) continue;
    /* 带 _additions 后缀的是未来周期（如 fall_2028）的新增排除名单，
     * 只做前瞻提示，不在当前周期执行——否则会把明年才排除的专业误判 */
    if (/additions$/i.test(key)) future.push([key, requirements[key]]);
    else current.push([key, requirements[key]]);
  }
  return { current, future };
}

function te_checkExcludedMajors(requirements, profile) {
  const L = t("label_excluded");
  const majorN = te_norm(profile.major);
  const collegeN = te_norm(profile.college);
  const keys = te_excludedKeys(requirements);
  let foundUnknown = false;
  for (const [key, val] of keys.current) {
    if (val === null || val === undefined || te_isUnknown(val)) { foundUnknown = true; continue; }
    const entries = Array.isArray(val) ? val : [val];
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      if (entry.trim().toLowerCase().startsWith("note:")) continue;
      const en = te_norm(entry);
      if (en.includes("all_majors_in")) {
        const scope = en.split("all_majors_in")[1].replace(/^_+|_+$/g, "");
        if (collegeN && (scope.includes(collegeN) || collegeN.includes(scope))) {
          return [te_makeCheck("excluded_major", L, TE_WARN,
            t("d_excl_warn_college", { entry })), null];
        }
        continue;
      }
      if (majorN && (majorN.includes(en) || en.includes(majorN))) {
        return [te_makeCheck("excluded_major", L, TE_FAIL,
          t("d_excl_fail", { entry })), null];
      }
    }
  }
  /* 未来周期的新增排除：只提示，不判死（周期从 key 名解析，如 fall_2028 → Fall 2028） */
  const futureNotes = [];
  for (const [key, val] of keys.future) {
    const cycle = key.replace(/^excluded_majors_/i, "").replace(/_additions$/i, "")
      .split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const entries = Array.isArray(val) ? val : [val];
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      if (entry.trim().toLowerCase().startsWith("note:")) continue;
      const en = te_norm(entry);
      if (majorN && (majorN.includes(en) || en.includes(majorN))) {
        futureNotes.push({ cycle, entry });
      }
    }
  }
  const futureNote = futureNotes.length ? t("d_excl_future_note", {
    cycle: [...new Set(futureNotes.map(n => n.cycle))].join(" / "),
    list: futureNotes.map(n => n.entry).join("；"),
  }) : null;
  if (foundUnknown)
    return [te_makeCheck("excluded_major", L, TE_SKIP, t("d_excl_skip")), 
      [t("d_excl_risk_unknown"), futureNote].filter(Boolean).join(" ") || null];
  if (!majorN)
    return [te_makeCheck("excluded_major", L, TE_WARN, t("d_excl_warn_nomajor")), futureNote];
  const passDetail = futureNote
    ? t("d_excl_pass") + " " + futureNote
    : t("d_excl_pass");
  return [te_makeCheck("excluded_major", L, TE_PASS, passDetail), null];
}

function te_checkBachelor(requirements, profile) {
  const L = t("label_bachelor");
  if (!profile.has_bachelor_degree) return null;
  const blob = (requirements.not_eligible || []).map(x => String(x)).join(" ");
  if (/baccalaureate|bachelor/i.test(blob))
    return te_makeCheck("bachelor", L, TE_FAIL, t("d_ba_fail"));
  return te_makeCheck("bachelor", L, TE_WARN, t("d_ba_warn"));
}

function te_checkMajorPrep(requirements, profile) {
  const L = t("label_prep");
  const text = requirements.major_preparation || requirements.selective_major_preparation;
  const done = profile.major_prep_done;
  if (done === true) return te_makeCheck("major_prep", L, TE_PASS, t("d_prep_pass"));
  if (done === false) {
    const txt = typeof text === "string" ? text.trim() : "";
    return te_makeCheck("major_prep", L, TE_WARN, t("d_prep_warn_no", { text: txt }));
  }
  return te_makeCheck("major_prep", L, TE_SKIP, t("d_prep_skip"));
}

function te_checkSpringUnits(requirements, profile) {
  const L = t("label_spring");
  const text = requirements.max_spring_units;
  const planned = profile.spring_units_planned;
  if (planned === null || planned === undefined || planned === "" || typeof text !== "string") return null;
  const m = text.match(/no more than (\d+)/i);
  if (!m) return null;
  const limit = parseFloat(m[1]);
  if (Number(planned) > limit)
    return te_makeCheck("spring_units", L, TE_WARN,
      t("d_spring_warn", { planned, limit: te_gfmt(limit) }));
  return te_makeCheck("spring_units", L, TE_PASS,
    t("d_spring_pass", { planned, limit: te_gfmt(limit) }));
}

function te_collectUnknowns(requirements) {
  const unknowns = [];
  (function walk(obj, prefix) {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const k of Object.keys(obj)) {
        if (k === "note") continue;
        walk(obj[k], prefix + k + ".");
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((v, i) => walk(v, prefix + i + "."));
    } else if (te_isUnknown(obj)) {
      unknowns.push(prefix.replace(/\.$/, ""));
    }
  })(requirements, "");
  return unknowns;
}

/* ---------------- 主入口 ---------------- */
function te_checkEligibility(school, profile) {
  profile = profile || {};
  const rule = te_loadRule(school);
  const requirements = rule.requirements || {};
  const schoolName = rule.school || school;

  const checks = [];
  const risks = [];

  checks.push(te_checkGpa(requirements, profile));
  checks.push(te_checkUnits(requirements, profile));
  checks.push(...te_checkEnglishMath(requirements, profile));
  const [exclCheck, exclRisk] = te_checkExcludedMajors(requirements, profile);
  checks.push(exclCheck);
  if (exclRisk) risks.push(exclRisk);
  const b = te_checkBachelor(requirements, profile);
  if (b) checks.push(b);
  checks.push(te_checkMajorPrep(requirements, profile));
  const s = te_checkSpringUnits(requirements, profile);
  if (s) checks.push(s);

  const mm = requirements.tag_major_must_match_uc_app_major;
  if (mm === true) {
    risks.push(t("r_mm_must", { school: schoolName }));
    checks.push(te_makeCheck("major_match", t("label_major_match"), TE_WARN, t("d_mm_warn_must")));
  } else if (te_isUnknown(mm)) {
    checks.push(te_makeCheck("major_match", t("label_major_match"), TE_WARN, t("d_mm_warn_unknown")));
  }

  const unknownSkipped = te_collectUnknowns(requirements);
  if (unknownSkipped.length) {
    const shown = unknownSkipped.slice(0, 5).map(te_humanUnknown).join(", ");
    risks.push(t("r_unknowns", {
      n: unknownSkipped.length, list: shown,
      more: unknownSkipped.length > 5 ? t("r_unknowns_more") : "",
    }));
  }

  let score = 100;
  for (const c of checks) {
    if (c.status === TE_FAIL) score -= FAIL_PENALTY;
    else if (c.status === TE_WARN) score -= WARN_PENALTY;
  }
  score = Math.max(0, Math.min(100, score));
  const eligible = !checks.some(c => c.status === TE_FAIL);

  const info = {
    tag_window: requirements.tag_window ?? null,
    uc_application: requirements.uc_application_window || requirements.uc_application_deadline || null,
    tau_deadline: requirements.tau_deadline ?? null,
    admission_cycle: rule.admission_cycle ?? null,
    academic_year: rule.academic_year ?? null,
    source: rule.source ?? null,
    verified_date: rule.verified_date ?? null,
  };

  return {
    school: schoolName,
    school_id: rule._school_id,
    eligible,
    score,
    checks,
    risks,
    unknown_skipped: unknownSkipped,
    info,
    _disclaimer: t("engine_disclaimer"),
  };
}
