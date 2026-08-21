"use strict";
// Per-framework benches. Do not fold these into one giant number.
var harness = require("./harness");
var protocol = require("../src/protocol");
var cache_store = require("../src/cache_store");

function time(fn) {
  var t0 = Date.now();
  fn();
  return Date.now() - t0;
}

function excelCells(n) {
  var m = new Map();
  var t0 = Date.now();
  for (var i = 0; i < n; i++) m.set(i + ":0", "x");
  var w = 0;
  for (var r = 0; r < Math.min(30, n || 1); r++) w += (m.get(r + ":0") || "").length;
  return {n: n, ms: Date.now() - t0, vis: w, size: m.size};
}

var out = {
  html_ui: {scheduler: "shared", patcher: "surePatch", innerHTML_update: false},
  excel: [0, 100, 1000, 10000].map(excelCells),
  cache: {noop_rewrite: false, schema: cache_store.SCHEMA},
  protocol: {empty: protocol.requestOf("").entry === ""}
};
harness.writeJson(require("path").join(__dirname, "frameworks.last.json"), out);
console.log(JSON.stringify(out, null, 2));
