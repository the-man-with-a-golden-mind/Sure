"use strict";
// Versioned source index. Size+mtime accelerate; content identity is correctness.
// Empty path is missing. Junk index is rebuilt.

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var path_safe = require("./path_safe");

var INDEX_VERSION = 1;
var INDEX_NAME = "src.index.json";

function sha(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function metaLine(rel, size, mtime) {
  return String(rel || "") + "\t" + String(size | 0) + "\t" + String(mtime | 0);
}

function joinParts(parts) {
  return (parts || []).map(function(p) { return String(p == null ? "" : p); }).join("\n");
}

function emptyIndex() {
  return {version: INDEX_VERSION, files: {}, digest: "", meta: ""};
}

function decodeIndex(text) {
  if (text == null || text === "") return emptyIndex();
  try {
    var o = JSON.parse(String(text));
    if (!o || typeof o !== "object" || Array.isArray(o)) return emptyIndex();
    if (o.version !== INDEX_VERSION) return emptyIndex();
    return {
      version: INDEX_VERSION,
      files: o.files && typeof o.files === "object" ? o.files : {},
      digest: String(o.digest || ""),
      meta: String(o.meta || "")
    };
  } catch (e) {
    return emptyIndex();
  }
}

function indexPath(root) {
  return path.join(root, ".cache", INDEX_NAME);
}

function loadIndex(root) {
  try { return decodeIndex(fs.readFileSync(indexPath(root), "utf8")); }
  catch (e) { return emptyIndex(); }
}

function saveIndex(root, idx) {
  var dir = path.join(root, ".cache");
  fs.mkdirSync(dir, {recursive: true});
  var dest = indexPath(root);
  var tmp = dest + ".tmp-" + process.pid + "-" + Date.now();
  var body = JSON.stringify(idx) + "\n";
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, dest);
}

function listSureFiles(root) {
  var acc = [];
  function walk(dir, rel) {
    var names;
    try { names = fs.readdirSync(dir); } catch (e) { return; }
    names.sort();
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (n === ".cache" || n === ".sure" || n === ".git" || n === "node_modules" || n === "sure_modules" || n === "kind_modules") continue;
      var r = rel ? rel + "/" + n : n;
      if (!path_safe.sureRelSafe(r) && n.slice(-5) !== ".sure") {
        var p0 = path.join(dir, n);
        var st0;
        try { st0 = fs.statSync(p0); } catch (e0) { continue; }
        if (st0.isDirectory()) walk(p0, r);
        continue;
      }
      var p = path.join(dir, n);
      var st;
      try { st = fs.statSync(p); } catch (e1) { continue; }
      if (st.isDirectory()) walk(p, r);
      else if (n.slice(-5) === ".sure") acc.push({abs: p, rel: r, size: st.size, mtime: Math.floor(st.mtimeMs || st.mtime.getTime())});
    }
  }
  if (root && fs.existsSync(root)) walk(root, "");
  return acc;
}

function digestTree(root, opt) {
  opt = opt || {};
  var t0 = Date.now();
  var files = listSureFiles(root);
  var meta = files.map(function(f) { return metaLine(f.rel, f.size, f.mtime); }).join("\n");
  var metaKey = sha(meta);
  var prev = opt.verify ? emptyIndex() : loadIndex(root);
  if (!opt.verify && prev.meta === metaKey && prev.digest) {
    return {digest: prev.digest, meta: metaKey, files: files.length, ms: Date.now() - t0, hit: true};
  }
  var inner = crypto.createHash("sha256");
  for (var i = 0; i < files.length; i++) {
    inner.update(files[i].rel);
    inner.update("\0");
    try { inner.update(fs.readFileSync(files[i].abs)); } catch (e) { inner.update("missing"); }
    inner.update("\0");
  }
  var digest = inner.digest("hex");
  try { saveIndex(root, {version: INDEX_VERSION, files: {}, digest: digest, meta: metaKey}); } catch (e2) {}
  return {digest: digest, meta: metaKey, files: files.length, ms: Date.now() - t0, hit: false};
}

function updateChanged(root, absPath) {
  return digestTree(root, {verify: false});
}

module.exports = {
  INDEX_VERSION: INDEX_VERSION,
  sha: sha,
  metaLine: metaLine,
  joinParts: joinParts,
  decodeIndex: decodeIndex,
  digestTree: digestTree,
  updateChanged: updateChanged,
  listSureFiles: listSureFiles,
  loadIndex: loadIndex
};
