/* Articulation 数据引导：解压 ARTIC_GZ(gzip+base64) -> ARTIC_DATA。
   自动生成流程见 mobile/scripts/build-data.py。*/
var ARTIC_DATA = [];
var ARTIC_META = { fetched: "2026-10-16" };
var ARTIC_READY = (function () {
  function fail(e) { try { console.error("[artic] data load failed", e); } catch (_) {} }
  try {
    if (typeof DecompressionStream === "undefined") throw new Error("no DecompressionStream");
    var bin = Uint8Array.from(atob(ARTIC_GZ), function (c) { return c.charCodeAt(0); });
    var stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text().then(function (t) {
      ARTIC_DATA = JSON.parse(t);
    }).catch(fail);
  } catch (e) { fail(e); return Promise.resolve(); }
})();
