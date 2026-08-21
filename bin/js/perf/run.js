#!/usr/bin/env node
"use strict";
var fs = require("fs");
var path = require("path");
var harness = require("./harness");
var cache_store = require("../src/cache_store");

var ROOT = path.resolve(__dirname, "../../..");
var SURE = path.join(ROOT, "bin/js/src/main.js");
var node = process.execPath;
var quick = process.argv.indexOf("--quick") >= 0 || process.env.SURE_PERF_QUICK === "1";
var n = quick ? 1 : 3;
var commit = "";
try { commit = require("child_process").execSync("git rev-parse --short HEAD", {cwd: ROOT, encoding: "utf8"}).trim(); } catch (e) {}

function sure(args, cwd) {
  var r = harness.runCmd(node, ["--stack-size=10000", SURE].concat(args), {cwd: cwd || ROOT, timeout: 180000});
  r.command = "sure " + args.join(" ");
  r.kind = "no-op-as-new-process";
  var st = cache_store.stats(ROOT, process.env.SURE_CACHE_KEY);
  r.cacheBytes = st.bytes;
  r.cacheFiles = st.files;
  return r;
}

var rows = [];
function add(name, fn) {
  try { rows.push(harness.measure(name, fn, n)); }
  catch (e) { rows.push({name: name, error: String(e && e.message || e), timing: harness.summarize([])}); }
}

add("cli.version", function() { var r = sure(["--version"]); r.kind = "no-op-as-new-process"; return r; });
add("cli.help", function() { return sure(["help"]); });
add("cli.doc.Nat.add", function() { return sure(["doc", "Nat.add"]); });
add("check.Nat.add", function() { return sure(["check", "Nat.add"]); });
add("check.missing", function() { return sure(["check", "No.Such.Term"]); });

if (!quick) {
  add("check.Excel.client", function() {
    return sure(["check", "Excel.client"], path.join(ROOT, "examples/excel"));
  });
  add("hello.prove", function() { return sure(["prove"], path.join(ROOT, "examples/hello")); });
}

var out = {
  ok: rows.every(function(r) { return !r.error; }),
  generatedAt: new Date().toISOString(),
  env: harness.envInfo(commit),
  quick: quick,
  results: rows,
  ceilings: {
    "cli.help.p95_ms": 350,
    "hello.warm_run_ms": 1200,
    "Excel.client.check_ms": 46000,
    "suite_ms": 130000
  }
};
var dest = path.join(__dirname, "last.json");
harness.writeJson(dest, out);
if (process.argv.indexOf("--baseline") >= 0) {
  harness.writeJson(path.join(__dirname, "baseline.json"), out);
}
process.stdout.write(JSON.stringify({ok: out.ok, file: dest, n: rows.length, commit: commit}, null, 2) + "\n");
process.exit(0);
