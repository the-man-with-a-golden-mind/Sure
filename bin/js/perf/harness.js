"use strict";
var os = require("os");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var {spawnSync} = require("child_process");

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  var i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function summarize(samples) {
  var xs = (samples || []).slice().sort(function(a, b) { return a - b; });
  var sum = xs.reduce(function(a, b) { return a + b; }, 0);
  return {
    n: xs.length,
    min: xs[0] || 0,
    max: xs[xs.length - 1] || 0,
    median: percentile(xs, 50),
    p95: percentile(xs, 95),
    mean: xs.length ? sum / xs.length : 0,
    samples: xs
  };
}

function rssKb() {
  try { return process.memoryUsage().rss; } catch (e) { return 0; }
}

function envInfo(commit) {
  return {
    commit: String(commit || process.env.SURE_COMMIT || ""),
    os: os.platform(),
    arch: os.arch(),
    node: process.version,
    bun: process.env.SURE_BUN_VERSION || "",
    cpu: (os.cpus()[0] && os.cpus()[0].model) || "",
    cpus: os.cpus().length
  };
}

function digest(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex").slice(0, 16);
}

function runCmd(cmd, args, opt) {
  opt = opt || {};
  var t0 = Date.now();
  var r = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: opt.cwd || process.cwd(),
    env: Object.assign({}, process.env, opt.env || {}),
    timeout: opt.timeout || 120000,
    maxBuffer: 8 * 1024 * 1024
  });
  return {
    ms: Date.now() - t0,
    status: r.status == null ? 1 : r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    rss: rssKb()
  };
}

function measure(name, fn, n) {
  n = n || 3;
  var samples = [];
  var last = null;
  for (var i = 0; i < n; i++) {
    last = fn();
    samples.push(last.ms);
  }
  var s = summarize(samples);
  return {
    name: name,
    command: last && last.command || name,
    kind: last && last.kind || "warm-in-process",
    status: last ? last.status : 1,
    digest: last ? digest(last.stdout) : "",
    rss: last ? last.rss : 0,
    cacheBytes: last && last.cacheBytes || 0,
    cacheFiles: last && last.cacheFiles || 0,
    filesWritten: last && last.filesWritten || 0,
    timing: s
  };
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

module.exports = {
  summarize: summarize,
  envInfo: envInfo,
  digest: digest,
  runCmd: runCmd,
  measure: measure,
  writeJson: writeJson,
  rssKb: rssKb
};
