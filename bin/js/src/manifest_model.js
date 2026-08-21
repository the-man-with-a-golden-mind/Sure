"use strict";
// Typed sure.json / build stamp. Missing, empty and junk are explicit results.

function fail(code, extra) {
  return {ok: false, error: code, value: extra || null};
}

function ok(value) {
  return {ok: true, error: "", value: value};
}

function readJson(text) {
  if (text == null || text === "") return fail("empty");
  try {
    var o = JSON.parse(String(text));
    if (!o || typeof o !== "object" || Array.isArray(o)) return fail("junk");
    return ok(o);
  } catch (e) {
    return fail("junk");
  }
}

function decodeManifest(text) {
  var j = readJson(text);
  if (!j.ok) return j;
  var o = j.value;
  var dirs = o["source-directories"];
  if (!Array.isArray(dirs) || !dirs.length) dirs = [o.src ? String(o.src) : "src"];
  var theorems = Array.isArray(o.theorems) ? o.theorems.map(String) : [];
  var exposed = Array.isArray(o["exposed-modules"]) ? o["exposed-modules"].map(String) : [];
  var kind = o.type === "package" ? "package" : "application";
  return ok({
    type: kind,
    name: String(o.name || ""),
    version: String(o.version || ""),
    language: String(o.language || "Sure"),
    summary: String(o.summary || ""),
    src: String(o.src || "src"),
    sourceDirectories: dirs.map(String),
    exposedModules: exposed,
    theorems: theorems,
    main: String(o.main || "Main"),
    dependencies: o.dependencies && typeof o.dependencies === "object" ? o.dependencies : {direct: {}, indirect: {}}
  });
}

function decodeStamp(text) {
  if (text == null || text === "") return ok(null);
  var j = readJson(text);
  if (!j.ok) return j;
  var o = j.value;
  return ok({
    ok: o.ok !== false,
    term: String(o.term || ""),
    srcHash: String(o.src_hash || o.srcHash || ""),
    file: String(o.file || ""),
    html: !!o.html,
    proved: o.proved !== false
  });
}

function encodeStamp(st) {
  st = st || {};
  return JSON.stringify({
    ok: st.ok !== false,
    term: String(st.term || ""),
    src_hash: String(st.srcHash || st.src_hash || ""),
    file: String(st.file || ""),
    html: !!st.html,
    proved: st.proved !== false
  }, null, 2) + "\n";
}

module.exports = {
  readJson: readJson,
  decodeManifest: decodeManifest,
  decodeStamp: decodeStamp,
  encodeStamp: encodeStamp
};
