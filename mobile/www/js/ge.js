/* Cal-GETC 通识检查。
   GE_DATA 由 ge-boot.js 解压得到：{cc_name: {course_code: [areas]}}。
   ge_checkPlan(planSet, ccName) -> {ok, areas:[{code,need,have,courses,done}], all_done}
   规则：一门课只算一个 area；Area 4 需 2 门；Area 5 需 5A+5B 且其中一门带实验(5C)。 */
var GE_AREA_DEFS = [
  { code: "1A", need: 1 },
  { code: "1B", need: 1 },
  { code: "1C", need: 1 },
  { code: "2", need: 1 },
  { code: "3A", need: 1 },
  { code: "3B", need: 1 },
  { code: "4", need: 2 },
  { code: "5A", need: 1 },
  { code: "5B", need: 1 },
  { code: "5C", need: 1, lab: true },
  { code: "6", need: 1 },
];

function ge_checkPlan(planSet, ccName) {
  var perCc = (typeof GE_DATA !== "undefined" && GE_DATA && GE_DATA[ccName]) || null;
  if (!perCc) return { ok: false, reason: "no_data" };
  var codes = [];
  try {
    planSet.forEach(function (c) { codes.push(c); });
  } catch (e) { return { ok: false, reason: "bad_plan" }; }

  var used = {};
  var areas = GE_AREA_DEFS.map(function (def) {
    return { code: def.code, need: def.need, lab: !!def.lab, courses: [], done: false };
  });
  function areaOf(code) { for (var i = 0; i < areas.length; i++) if (areas[i].code === code) return areas[i]; return null; }

  /* 按 area 顺序贪心分配（1A 这类课少的 area 优先） */
  GE_AREA_DEFS.forEach(function (def) {
    if (def.lab) return;
    var slot = areaOf(def.code);
    for (var i = 0; i < codes.length && slot.courses.length < def.need; i++) {
      var c = codes[i];
      if (used[c]) continue;
      var a = perCc[c];
      if (a && a.indexOf(def.code) >= 0) {
        slot.courses.push(c);
        used[c] = true;
      }
    }
    slot.done = slot.courses.length >= def.need;
  });

  /* 5C：已分到 5A/5B 的课里至少一门带实验 */
  var labOk = false, labCourse = null;
  ["5A", "5B"].forEach(function (ac) {
    areaOf(ac).courses.forEach(function (c) {
      var a = perCc[c] || [];
      if (a.indexOf("5C") >= 0 && !labOk) { labOk = true; labCourse = c; }
    });
  });
  var s5c = areaOf("5C");
  s5c.done = labOk;
  if (labCourse) s5c.courses.push(labCourse + " (lab)");

  var allDone = areas.every(function (s) { return s.done; });
  return { ok: true, areas: areas, all_done: allDone };
}
