"use strict";
// Host cache index around .cache/. Schema version, atomic writes, no-op when
// identical, bounded cleanup. Never touches files outside the resolved cache dir.

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var path_safe = require("./path_safe");

var SCHEMA = 1;
var INDEX = "index.json";

function now() { return Date.now(); }

function resolveDir(root) {
  return path.resolve(root || process.cwd(), ".cache");
}

function emptyIndex(compiler) {
  return {schema: SCHEMA, compiler: String(compiler || ""), entries: {}, accessed: {}};
}

function decodeIndex(text, compiler) {
  if (text == null || text === "") return emptyIndex(compiler);
  try {
    var o = JSON.parse(String(text));
    if (!o || typeof o !== "object" || Array.isArray(o)) return emptyIndex(compiler);
    if (o.schema !== SCHEMA) return emptyIndex(compiler);
    return {
      schema: SCHEMA,
      compiler: String(o.compiler || compiler || ""),
      entries: o.entries && typeof o.entries === "object" ? o.entries : {},
      accessed: o.accessed && typeof o.accessed === "object" ? o.accessed : {}
    };
  } catch (e) {
    return emptyIndex(compiler);
  }
}

function load(dir, compiler) {
  dir = resolveDir(dir);
  try { return decodeIndex(fs.readFileSync(path.join(dir, INDEX), "utf8"), compiler); }
  catch (e) { return emptyIndex(compiler); }
}

function atomicWrite(dir, destName, body) {
  dir = resolveDir(dir);
  if (!path_safe.sureCacheInside(dir, path.join(dir, destName))) {
    return {ok: false, error: "outside", written: false};
  }
  fs.mkdirSync(dir, {recursive: true});
  var dest = path.join(dir, destName);
  var prev = null;
  try { prev = fs.readFileSync(dest); } catch (e) {}
  var buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body == null ? "" : body));
  if (prev && prev.equals(buf)) return {ok: true, written: false, bytes: buf.length, path: dest};
  var tmp = dest + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  return {ok: true, written: true, bytes: buf.length, path: dest};
}

function saveIndex(dir, idx) {
  return atomicWrite(dir, INDEX, JSON.stringify(idx) + "\n");
}

function remember(dir, compiler, name, file, hash, bytes) {
  var idx = load(dir, compiler);
  if (idx.compiler && compiler && idx.compiler !== compiler) {
    idx = emptyIndex(compiler);
  }
  idx.compiler = String(compiler || idx.compiler || "");
  idx.entries[name] = {file: String(file || ""), hash: String(hash || ""), bytes: bytes | 0};
  idx.accessed[name] = now();
  return saveIndex(dir, idx);
}

function skipIdentical(dir, compiler, name, hash) {
  var idx = load(dir, compiler);
  var e = idx.entries[name];
  if (!e || !hash || e.hash !== hash) return false;
  if (idx.compiler && compiler && idx.compiler !== compiler) return false;
  idx.accessed[name] = now();
  saveIndex(dir, idx);
  return true;
}

function stats(dir, compiler) {
  dir = resolveDir(dir);
  var idx = load(dir, compiler);
  var files = 0;
  var bytes = 0;
  try {
    var names = fs.readdirSync(dir);
    for (var i = 0; i < names.length; i++) {
      if (names[i].slice(-4) === ".tmp") continue;
      var st;
      try { st = fs.statSync(path.join(dir, names[i])); } catch (e) { continue; }
      if (!st.isFile()) continue;
      files += 1;
      bytes += st.size;
    }
  } catch (e2) {}
  return {
    ok: true,
    dir: dir,
    schema: SCHEMA,
    compiler: idx.compiler || String(compiler || ""),
    entries: Object.keys(idx.entries).length,
    files: files,
    bytes: bytes
  };
}

function clean(dir, opt) {
  opt = opt || {};
  dir = resolveDir(dir);
  var compiler = String(opt.compiler || "");
  var keepMs = opt.keepMs == null ? 7 * 24 * 3600 * 1000 : Number(opt.keepMs);
  var idx = load(dir, compiler);
  var removed = [];
  var nowMs = now();
  function rm(abs) {
    if (!path_safe.sureCacheInside(dir, abs)) return false;
    try { fs.unlinkSync(abs); removed.push(abs); return true; } catch (e) { return false; }
  }
  var names;
  try { names = fs.readdirSync(dir); } catch (e) { names = []; }
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    var abs = path.join(dir, n);
    if (!path_safe.sureCacheInside(dir, abs)) continue;
    if (/\.tmp-/.test(n) || n.slice(-4) === ".tmp") rm(abs);
  }
  if (opt.dropStale !== false) {
    Object.keys(idx.entries).forEach(function(name) {
      var e = idx.entries[name];
      var age = nowMs - (idx.accessed[name] || 0);
      var foreign = compiler && idx.compiler && idx.compiler !== compiler;
      if (foreign || (keepMs >= 0 && age > keepMs)) {
        if (e.file) rm(path.isAbsolute(e.file) ? e.file : path.join(dir, e.file));
        delete idx.entries[name];
        delete idx.accessed[name];
      }
    });
  }
  if (compiler) idx.compiler = compiler;
  saveIndex(dir, idx);
  return {ok: true, dir: dir, removed: removed.length, paths: removed};
}

function contentHash(body) {
  return crypto.createHash("sha256").update(body == null ? "" : body).digest("hex");
}

module.exports = {
  SCHEMA: SCHEMA,
  resolveDir: resolveDir,
  decodeIndex: decodeIndex,
  load: load,
  atomicWrite: atomicWrite,
  saveIndex: saveIndex,
  remember: remember,
  skipIdentical: skipIdentical,
  stats: stats,
  clean: clean,
  contentHash: contentHash
};
