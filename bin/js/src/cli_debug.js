"use strict";
// Debug level/flags. Empty and junk strings are off/none.

function sure_debug_level_read(s) {
  s = String(s == null ? "" : s);
  if (s === "off") return "off";
  if (s === "error") return "error";
  if (s === "info") return "info";
  if (s === "trace" || s === "debug" || s === "1" || s === "true") return "trace";
  return "";
}

function sure_debug_flags_read(s) {
  var xs = String(s == null ? "" : s).split(/[,\s]+/).filter(Boolean);
  var all = xs.indexOf("all") >= 0;
  return {
    host: all || xs.indexOf("host") >= 0,
    term: all || xs.indexOf("term") >= 0,
    holes: all || xs.indexOf("holes") >= 0,
    qc: all || xs.indexOf("qc") >= 0
  };
}

function sure_debug_flags_any(f) {
  return !!(f && (f.host || f.term || f.holes || f.qc));
}

function sure_debug_flags_show(f) {
  f = f || sure_debug_flags_read("");
  if (f.host && f.term && f.holes && f.qc) return "all";
  var xs = [];
  if (f.host) xs.push("host");
  if (f.term) xs.push("term");
  if (f.holes) xs.push("holes");
  if (f.qc) xs.push("qc");
  return xs.join(" ");
}

function sure_debug_flags_host(s) {
  return sure_debug_flags_read(s).host;
}

function sure_debug_open(opt, ch) {
  var f = typeof opt === "string" ? sure_debug_flags_read(opt) : (opt || sure_debug_flags_read(""));
  if (!sure_debug_flags_any(f)) return true;
  return !!f[ch];
}

function sure_debug_level_rank(l) {
  if (l === "error") return 1;
  if (l === "info") return 2;
  if (l === "trace") return 3;
  return 0;
}

function sure_debug_at_least(have, need) {
  return sure_debug_level_rank(have) >= sure_debug_level_rank(need);
}

function sure_debug_emit(have, need, opt, ch) {
  return sure_debug_at_least(have, need) && sure_debug_open(opt, ch);
}

function sure_debug_host_ask(level, opt, query) {
  if (!sure_debug_open(opt, "host")) return false;
  if (String(query) === "yield") return sure_debug_at_least(level, "trace");
  return sure_debug_at_least(level, "info") || sure_debug_flags_read(opt).host;
}

function sure_debug_redact(s) {
  s = String(s == null ? "" : s);
  var nl = s.indexOf("\n");
  var line = nl < 0 ? s : s.slice(0, nl);
  if (line.length > 80) return line.slice(0, 80) + "...";
  if (line.length < s.length) return line + "...";
  return line;
}

function sure_debug_host_line(query, param, reply) {
  var q = String(query || "");
  var p = sure_debug_redact(param == null ? "" : param);
  var r = sure_debug_redact(reply == null ? "" : reply);
  if (!q) return "host ? " + p + " -> " + r;
  return "host " + q + " " + p + " -> " + r;
}

function parse_debug_arg(raw) {
  if (raw === undefined || raw === true) return "trace";
  var lv = sure_debug_level_read(String(raw));
  return lv || null;
}

module.exports = {
  sure_debug_level_read: sure_debug_level_read,
  sure_debug_flags_read: sure_debug_flags_read,
  sure_debug_flags_any: sure_debug_flags_any,
  sure_debug_flags_show: sure_debug_flags_show,
  sure_debug_flags_host: sure_debug_flags_host,
  sure_debug_open: sure_debug_open,
  sure_debug_level_rank: sure_debug_level_rank,
  sure_debug_at_least: sure_debug_at_least,
  sure_debug_emit: sure_debug_emit,
  sure_debug_host_ask: sure_debug_host_ask,
  sure_debug_redact: sure_debug_redact,
  sure_debug_host_line: sure_debug_host_line,
  parse_debug_arg: parse_debug_arg
};
