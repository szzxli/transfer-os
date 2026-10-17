/* 自动生成：mobile/scripts/build-data.py，请勿手改。
   解压 ADMIT_GZ(gzip+base64) -> ADMIT_DATA。*/
var ADMIT_DATA = {};
var ADMIT_READY = (function () {
  function fail(e) { try { console.error("[admit] data load failed", e); } catch (_) {} }
  try {
    if (typeof DecompressionStream === "undefined") throw new Error("no DecompressionStream");
    var bin = Uint8Array.from(atob(ADMIT_GZ), function (c) { return c.charCodeAt(0); });
    var stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text().then(function (t) {
      ADMIT_DATA = JSON.parse(t);
    }).catch(fail);
  } catch (e) { fail(e); return Promise.resolve(); }
})();
