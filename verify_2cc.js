/* 第二所社区学院：用随包 articulation 快照（2026-11-02）核对覆盖率。
 * 用法：node verify_2cc.js
 * 断言：
 *   - merge(r1, r2) 且学生在 r2 没有课 → 六校覆盖率、要求项与只跑 r1 相同
 *   - 选了第二所但课程框为空 → cp_compare 结果与单校相同
 *   - 第二所有课 → 每校覆盖率不低于单校（UCLA/Davis/Irvine 以及其余三校）
 */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const vm = require("vm");

const jsDir = path.join(__dirname, "mobile", "www", "js");
const ctx = { console, ARTIC_GZ: "" };
for (let i = 1; i <= 13; i++) {
  vm.runInNewContext(fs.readFileSync(path.join(jsDir, `artic-gz-${i}.js`), "utf8"), ctx);
}
ctx.ARTIC_DATA = JSON.parse(zlib.gunzipSync(Buffer.from(ctx.ARTIC_GZ, "base64")).toString("utf8"));
ctx.t = function (key, params) {
  if (key === "d_opt_sep") return " OR ";
  if (key === "d_covered") return "covered";
  if (key === "d_missing") return "missing";
  if (key === "d_noartic") return "noartic";
  if (key === "d_wasted") return "wasted " + ((params && params.title) || "");
  if (key === "d_noagreement") return "noagr";
  if (key === "d_main_note") return "note";
  return key;
};
vm.runInNewContext(fs.readFileSync(path.join(jsDir, "comparator.js"), "utf8"), ctx);

const SMC = "Santa Monica College";
const DEANZA = "De Anza College";
const MAJOR = "Computer Science";
const COURSES = ["MATH 7", "MATH 8"];
const CAMPUSES = ["UC Davis", "UC Irvine", "UCLA", "UC Berkeley", "UC San Diego", "UC Santa Cruz"];
const ACCEPT = {
  "UC Davis": 20,
  "UC Irvine": 40,
  UCLA: 17,
  "UC Berkeley": 33,
  "UC San Diego": 13,
  "UC Santa Cruz": 29,
};

let pass = 0;
let fail = 0;
function check(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    console.error("FAIL:", msg);
  }
}
function sig(target) {
  return (target.items || []).map(i => i.target_code + ":" + i.status).join("|");
}
function pcts(out) {
  const m = {};
  for (const t of out.targets) m[t.target_name] = t.coverage_pct;
  return m;
}
function line(out) {
  return CAMPUSES.map(c => c.replace("UC ", "") + " " + pcts(out)[c] + "%").join(", ");
}

const single = ctx.cp_compare(SMC, MAJOR, CAMPUSES, COURSES);
const empty = ctx.cp_compare(SMC, MAJOR, CAMPUSES, COURSES, DEANZA, []);
const blank = ctx.cp_compare(SMC, MAJOR, CAMPUSES, COURSES, DEANZA, ["", "  "]);
const both = ctx.cp_compare(SMC, MAJOR, CAMPUSES, COURSES, DEANZA, ["MATH 1A", "CIS 22A"]);
const only2 = ctx.cp_compare(SMC, MAJOR, CAMPUSES, [], DEANZA, ["MATH 1A"]);

console.log("single ", line(single));
console.log("empty  ", line(empty));
console.log("both   ", line(both));
console.log("only2  ", line(only2));

check(JSON.stringify(pcts(single)) === JSON.stringify(ACCEPT),
  "single-college percentages " + JSON.stringify(pcts(single)));
check(JSON.stringify(pcts(empty)) === JSON.stringify(ACCEPT),
  "empty second college percentages " + JSON.stringify(pcts(empty)));
check(JSON.stringify(pcts(blank)) === JSON.stringify(ACCEPT),
  "whitespace-only second box percentages " + JSON.stringify(pcts(blank)));
check(JSON.stringify(empty.cc_names) === JSON.stringify([SMC]),
  "empty second college does not change cc_names " + JSON.stringify(empty.cc_names));

for (let i = 0; i < CAMPUSES.length; i++) {
  const a = single.targets[i], b = empty.targets[i];
  check(a.covered === b.covered && a.total_requirements === b.total_requirements && sig(a) === sig(b),
    CAMPUSES[i] + " empty-merge items differ from single");
}

for (const name of CAMPUSES) {
  check(pcts(both)[name] >= ACCEPT[name],
    name + " with De Anza courses dropped below single: " + pcts(both)[name] + " < " + ACCEPT[name]);
}
for (let i = 0; i < CAMPUSES.length; i++) {
  const a = single.targets[i], b = both.targets[i];
  const kept = {};
  for (const it of b.items || []) kept[it.target_code] = it.status;
  for (const it of a.items || []) {
    if (it.status === "covered") {
      check(kept[it.target_code] === "covered",
        a.target_name + " lost covered " + it.target_code + " after adding De Anza courses");
    }
  }
}

const ucla = both.targets.find(t => t.target_name === "UCLA");
check(ucla.coverage_pct === 25, "UCLA with MATH 1A + CIS 22A is " + ucla.coverage_pct + "% not 25%");
check(ucla.items.filter(i => i.status === "missing").length === 9,
  "UCLA missing count " + ucla.items.filter(i => i.status === "missing").length + " not 9");
check(ucla.items.some(i => i.status === "covered" && (i.via_detail || []).some(v =>
  v.code === "MATH 7" && v.cc === SMC) && (i.via_detail || []).some(v =>
  v.code === "MATH 1A" && v.cc === DEANZA)),
  "UCLA covered item should cite MATH 7 at SMC and MATH 1A at De Anza");
check(ucla.items.some(i => i.status === "covered" && (i.via_detail || []).some(v =>
  v.code === "CIS 22A" && v.cc === DEANZA)),
  "UCLA should cover a requirement via CIS 22A at De Anza");

check(pcts(only2).UCLA === 8, "main empty + De Anza MATH 1A UCLA is " + pcts(only2).UCLA + "% not 8%");
check(pcts(only2)["UC Berkeley"] === 0,
  "main empty + De Anza MATH 1A Berkeley is " + pcts(only2)["UC Berkeley"] + "% not 0%");

const reports = ctx.cp_loadReports();
const have = ctx.cp_makeHave([{ cc_name: SMC, courses: COURSES }]);
for (const campus of CAMPUSES) {
  const r1 = ctx.cp_findReport(reports, SMC, campus, MAJOR);
  const r2 = ctx.cp_findReport(reports, DEANZA, campus, MAJOR);
  check(!!r1 && !!r2, campus + " missing a report");
  if (!r1 || !r2) continue;
  const one = ctx.cp_compareOne(r1, have);
  const merged = ctx.cp_compareOne(ctx.cp_mergeReports([r1, r2]), have);
  check(merged.coverage_pct === one.coverage_pct && merged.coverage_pct === ACCEPT[campus],
    "cp_mergeReports " + campus + " " + merged.coverage_pct + "% != " + one.coverage_pct + "%");
  check(sig(merged) === sig(one),
    "cp_mergeReports " + campus + " item list differs from r1");
}

console.log(pass + "/" + (pass + fail));
if (fail) process.exit(1);
