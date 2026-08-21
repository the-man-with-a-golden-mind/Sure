"use strict";
// Safe output names and paths. Empty, traversal and mixed separators are rejected.

function sureEmitSafe(term) {
  var t = String(term || "");
  if (!t) return false;
  if (t.indexOf("/") >= 0 || t.indexOf("\\") >= 0 || t.indexOf("..") >= 0) return false;
  if (!/^[A-Za-z][A-Za-z0-9._]*$/.test(t)) return false;
  return true;
}

function sureRelSafe(rel) {
  var t = String(rel || "").replace(/\\/g, "/");
  if (!t) return false;
  if (t[0] === "/" || t.indexOf(":") >= 0) return false;
  var parts = t.split("/");
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i] || parts[i] === "." || parts[i] === "..") return false;
  }
  return true;
}

function sureCacheInside(root, target) {
  var path = require("path");
  var r = path.resolve(root);
  var t = path.resolve(target);
  if (t === r) return true;
  return t.indexOf(r + path.sep) === 0;
}

module.exports = {
  sureEmitSafe: sureEmitSafe,
  sureRelSafe: sureRelSafe,
  sureCacheInside: sureCacheInside
};
