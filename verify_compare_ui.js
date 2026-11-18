/* 对比页：下拉框回落后仍按用户看到的学校计算；引导只自动出现一次。
 * 用法：node verify_compare_ui.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const listeners = {};
const nodes = {};
const ctx = {
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame(fn) { return setTimeout(fn, 0); },
  localStorage: store(),
  sessionStorage: store(),
  location: { search: "" },
  navigator: { language: "en" },
  URLSearchParams,
};
ctx.window = ctx;
ctx.document = {
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  getElementById(id) { return nodes[id] || null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    const el = {
      id: "",
      style: {},
      dataset: {},
      innerHTML: "",
      isConnected: true,
      appendChild() {},
      remove() { this.isConnected = false; if (nodes[this.id] === this) delete nodes[this.id]; },
      addEventListener() {},
    };
    return el;
  },
  body: { appendChild(el) { if (el && el.id) nodes[el.id] = el; } },
};
function store() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
}

vm.runInNewContext(fs.readFileSync(path.join(__dirname, "mobile/www/js/app-compare.js"), "utf8"), ctx);

let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", msg); }
}

const FIRST = "Antelope Valley College";
const SMC = "Santa Monica College";
check(ctx.cmp_resolveCollege(FIRST, SMC, FIRST) === SMC,
  "fallback to first option must keep the remembered college");
check(ctx.cmp_resolveCollege(SMC, SMC, FIRST) === SMC, "matching live value stays");
check(ctx.cmp_resolveCollege("Berkeley City College", SMC, FIRST) === "Berkeley City College",
  "a real non-default selection wins over a stale memory");
check(ctx.cmp_resolveCollege(FIRST, "", FIRST) === FIRST, "no memory means the default stands");
check(ctx.cmp_resolveCollege("", "De Anza College", "") === "De Anza College",
  "empty second-college fallback restores the remembered campus");

function fakeSelect(values, index) {
  const options = values.map(v => ({ value: v, text: v, selected: false }));
  const sel = {
    options,
    dataset: {},
    _i: index,
    get selectedIndex() { return this._i; },
    set selectedIndex(i) {
      this._i = i;
      options.forEach((o, n) => { o.selected = n === i; });
    },
    get value() { return options[this._i] ? options[this._i].value : ""; },
  };
  sel.selectedIndex = index;
  return sel;
}
const sel = fakeSelect([FIRST, "Berkeley City College", SMC], 0);
sel.dataset.userSet = "1";
sel.dataset.chosen = SMC;
check(ctx.cmp_syncCollege(sel) === SMC, "sync rewrites a reverted dropdown to the remembered college");
check(sel.value === SMC && sel.selectedIndex === 2, "the control value matches what sync returns");

check(ctx.tour_shouldAutoShow(false, "") === true, "first visit auto-shows");
check(ctx.tour_shouldAutoShow(true, "") === false, "after skip/finish it does not auto-show");
check(ctx.tour_shouldAutoShow(false, "Computer Science") === false, "a saved major suppresses the auto tour");
check(ctx.tour_shouldAutoShow(true, "Computer Science") === false, "done and saved both suppress");

const before = ctx.document.getElementById("tourOverlay");
ctx.tour_start();
check(ctx.document.getElementById("tourOverlay") == null && before == null,
  "tour_start() with no reason does not open the tour");

ctx.tour_markDone();
check(ctx.tour_isDone() === true, "marking the tour done is visible to the next check");
check(ctx.tour_shouldAutoShow(ctx.tour_isDone(), "") === false,
  "once marked done, a reload would not schedule the tour");

console.log(pass + "/" + (pass + fail));
if (fail) process.exit(1);
