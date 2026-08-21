"use strict";
// Workspace request / report / diagnostic. Empty and junk JSON are data.

var EMPTY_REQ = {
  entry: "",
  theorems: [],
  modules: false,
  html: false,
  proofs: true,
  holes: true,
  emit: "none"
};

function asBool(v, d) {
  if (v === true || v === false) return v;
  return d;
}

function asList(v) {
  if (!Array.isArray(v)) return [];
  return v.map(function(x) { return String(x || ""); }).filter(Boolean);
}

function requestOf(raw) {
  if (raw == null || raw === "") return Object.assign({}, EMPTY_REQ);
  var o = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); } catch (e) { return Object.assign({}, EMPTY_REQ, {entry: "", emit: "none", _junk: true}); }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) {
    return Object.assign({}, EMPTY_REQ, {_junk: true});
  }
  var emit = String(o.emit || "none");
  if (emit !== "js" && emit !== "html" && emit !== "none") emit = "none";
  return {
    entry: String(o.entry || ""),
    theorems: asList(o.theorems),
    modules: asBool(o.modules, false),
    html: asBool(o.html, emit === "html"),
    proofs: asBool(o.proofs, true),
    holes: asBool(o.holes, true),
    emit: emit
  };
}

function namesOf(req) {
  req = requestOf(req);
  var xs = [];
  if (req.entry) xs.push(req.entry);
  for (var i = 0; i < req.theorems.length; i++) {
    if (xs.indexOf(req.theorems[i]) < 0) xs.push(req.theorems[i]);
  }
  return xs;
}

function diagnosticOf(raw) {
  if (!raw || typeof raw !== "object") return {code: "junk", name: "", message: ""};
  var err = raw.error && typeof raw.error === "object" ? raw.error : raw;
  return {
    code: String(err.code || raw.code || "error"),
    name: String(err.name || raw.name || raw.def || ""),
    message: String(err.message || err.goal || "")
  };
}

function reportOf(raw) {
  if (raw == null || raw === "") {
    return {ok: true, proved: true, types: [], diagnostics: [], holes: [], names: [], skipped: false};
  }
  var o = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); } catch (e) {
      return {ok: false, proved: false, types: [], diagnostics: [diagnosticOf({code: "junk"})], holes: [], names: [], skipped: false};
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) {
    return {ok: false, proved: false, types: [], diagnostics: [diagnosticOf({code: "junk"})], holes: [], names: [], skipped: false};
  }
  var diags = Array.isArray(o.diagnostics) ? o.diagnostics.map(diagnosticOf) : [];
  var holes = asList(o.holes);
  var ok = o.ok !== false && diags.length === 0 && holes.length === 0;
  return {
    ok: ok,
    proved: o.proved !== false && ok,
    types: Array.isArray(o.types) ? o.types : [],
    diagnostics: diags,
    holes: holes,
    names: asList(o.names),
    skipped: !!o.skipped,
    pretty: String(o.pretty || "")
  };
}

module.exports = {
  EMPTY_REQ: EMPTY_REQ,
  requestOf: requestOf,
  namesOf: namesOf,
  diagnosticOf: diagnosticOf,
  reportOf: reportOf
};
