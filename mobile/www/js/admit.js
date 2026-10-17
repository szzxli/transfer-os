/* UCLA 录取参考（Transfer Profile by Major，Fall 2025）。
   ADMIT_DATA 由 admit-boot.js 解压得到。
   admit_findUcla(majorQuery) -> {name, applicants, admit_rate, gpa25, gpa75, impacted} | null */
function admit_normMajor(s) {
  var n = String(s || "").toLowerCase().trim();
  n = n.replace(/,?\s*pre\s*$/, "");
  n = n.replace(/\b(b\.a\.|b\.s\.|bs|ba)\b/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

function admit_findUcla(majorQuery) {
  var data = (typeof ADMIT_DATA !== "undefined" && ADMIT_DATA) || null;
  if (!data || !data.majors || !data.majors.length) return null;
  var q = admit_normMajor(majorQuery);
  if (!q) return null;
  var best = null, bestScore = -1;
  for (var i = 0; i < data.majors.length; i++) {
    var m = data.majors[i];
    var k = m.k || admit_normMajor(m.n);
    var score = -1;
    if (k === q) score = 100;
    else if (k && q.indexOf(k) >= 0) score = 50 + k.length;
    else if (k && k.indexOf(q) >= 0) score = 40 + q.length;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return bestScore > 0 ? best : null;
}
