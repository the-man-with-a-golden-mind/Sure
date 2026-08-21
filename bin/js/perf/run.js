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

function sure(args, cwd, kind) {
  var r = harness.runCmd(node, ["--stack-size=10000", SURE].concat(args), {cwd: cwd || ROOT, timeout: 180000});
  r.command = "sure " + args.join(" ");
  r.kind = kind || "no-op-as-new-process";
  var st = cache_store.stats(cwd || ROOT, process.env.SURE_CACHE_KEY);
  r.cacheBytes = st.bytes;
  r.cacheFiles = st.files;
  r.filesWritten = 0;
  return r;
}

var rows = [];
function add(name, fn) {
  try { rows.push(harness.measure(name, fn, n)); }
  catch (e) { rows.push({name: name, error: String(e && e.message || e), timing: harness.summarize([])}); }
}

add("cli.version", function() { return sure(["--version"]); });
add("cli.help", function() { return sure(["help"]); });
add("cli.doc.Nat.add", function() { return sure(["doc", "Nat.add"]); });
add("check.Nat.add", function() { return sure(["check", "Nat.add"]); });
add("check.missing", function() { return sure(["check", "No.Such.Term"]); });

if (!quick) {
  add("check.hole", function() { return sure(["check", "Sure.Term.typ"]); });
  add("check.Excel.client", function() {
    return sure(["check", "Excel.client"], path.join(ROOT, "examples/excel"));
  });
  add("hello.prove", function() { return sure(["prove"], path.join(ROOT, "examples/hello")); });
  add("hello.build", function() { return sure(["build"], path.join(ROOT, "examples/hello")); });
  add("hello.build.noop", function() { return sure(["build"], path.join(ROOT, "examples/hello")); });
  add("hello.run", function() { return sure(["run"], path.join(ROOT, "examples/hello")); });
  add("excel.prove", function() { return sure(["prove"], path.join(ROOT, "examples/excel")); });
  add("suite.bounded", function() { return sure(["test"], ROOT); });
}

var ceil = {
  "cli.help": 350,
  "hello.run": 1200,
  "check.Excel.client": 46000,
  "suite.bounded": 130000
};
var breaches = [];
rows.forEach(function(r) {
  var limit = ceil[r.name];
  if (limit && r.timing && r.timing.p95 > limit) {
    breaches.push(r.name + " p95=" + r.timing.p95 + " > " + limit);
  }
});

var out = {
  ok: rows.every(function(r) { return !r.error; }) && breaches.length === 0,
  generatedAt: new Date().toISOString(),
  env: harness.envInfo(commit),
  quick: quick,
  results: rows,
  ceilings: ceil,
  breaches: breaches
};
var dest = path.join(__dirname, "last.json");
harness.writeJson(dest, out);
if (process.argv.indexOf("--baseline") >= 0) {
  harness.writeJson(path.join(__dirname, "baseline.json"), out);
}
process.stdout.write(JSON.stringify({ok: out.ok, file: dest, n: rows.length, commit: commit, breaches: breaches}, null, 2) + "\n");
process.exit(out.ok ? 0 : 1);
