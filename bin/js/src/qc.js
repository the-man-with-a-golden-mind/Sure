"use strict";
// QuickCheck sample generation. cmd_qc in main.js calls these.
function qc_nats(n) {
  var out = [0, 1, 2, 3];
  var s = 7;
  while (out.length < n) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out.push(s % 17);
  }
  return out.slice(0, n);
}

function split_ty_args(s) {
  var depth = 0, cur = "", out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (c === "<") depth++;
    else if (c === ">") depth--;
    else if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parse_qc_sort(s) {
  s = String(s || "").replace(/\s+/g, "").trim();
  if (s === "Nat") return {t: "nat"};
  if (s === "Bool") return {t: "bool"};
  if (s === "String") return {t: "string"};
  if (s === "Unit") return {t: "unit"};
  var m = /^List<(.+)>$/.exec(s);
  if (m) { var of = parse_qc_sort(m[1]); return of ? {t: "list", of: of} : null; }
  m = /^Maybe<(.+)>$/.exec(s);
  if (m) { var ofm = parse_qc_sort(m[1]); return ofm ? {t: "maybe", of: ofm} : null; }
  if (s.slice(0, 5) === "Pair<" && s.slice(-1) === ">") {
    var sp = split_ty_args(s.slice(5, -1));
    if (sp.length === 2) {
      var a = parse_qc_sort(sp[0]), b = parse_qc_sort(sp[1]);
      if (a && b) return {t: "pair", a: a, b: b};
    }
  }
  if (s.slice(0, 7) === "Either<" && s.slice(-1) === ">") {
    var se = split_ty_args(s.slice(7, -1));
    if (se.length === 2) {
      var l = parse_qc_sort(se[0]), r = parse_qc_sort(se[1]);
      if (l && r) return {t: "either", a: l, b: r};
    }
  }
  return null;
}

function parse_qc_binders(typeStr) {
  var rest = String(typeStr || "").replace(/\s+/g, " ").trim();
  var binders = [];
  while (binders.length < 4) {
    var m = /^\(([A-Za-z][A-Za-z0-9_]*)\s*:\s*([^)]+)\)\s*->\s*/.exec(rest);
    if (!m) break;
    var sort = parse_qc_sort(m[2]);
    if (!sort) break;
    binders.push(sort);
    rest = rest.slice(m[0].length);
  }
  return {binders: binders, rest: rest};
}

function type_after_nat_pis(typeStr) {
  return parse_qc_binders(typeStr).rest;
}

function leading_nat_arity(typeStr) {
  var b = parse_qc_binders(typeStr).binders;
  var n = 0;
  for (var i = 0; i < b.length; i++) if (b[i] && b[i].t === "nat") n += 1;
  return n;
}

function qc_arg_sum(args) {
  var s = 0;
  for (var i = 0; i < args.length; i++) s += args[i];
  return s;
}

function qc_shrink_candidates(args) {
  var seen = {};
  var out = [];
  function add(next) {
    var k = next.join(",");
    if (seen[k]) return;
    seen[k] = true;
    if (qc_arg_sum(next) > qc_arg_sum(args)) return;
    var smaller = qc_arg_sum(next) < qc_arg_sum(args);
    if (!smaller) {
      for (var i = 0; i < next.length; i++) {
        if (next[i] < args[i]) { smaller = true; break; }
        if (next[i] > args[i]) return;
      }
    }
    if (smaller) out.push(next);
  }
  for (var i = 0; i < args.length; i++) {
    var x = args[i];
    if (!(x > 0)) continue;
    var opts = (x === 1) ? [0] : [0, 1, Math.floor(x / 2), x - 1];
    for (var j = 0; j < opts.length; j++) {
      if (opts[j] < 0 || opts[j] >= x) continue;
      var next = args.slice();
      next[i] = opts[j];
      add(next);
    }
  }
  out.sort(function(a, b) {
    var d = qc_arg_sum(a) - qc_arg_sum(b);
    if (d) return d;
    return a.join(",").localeCompare(b.join(","));
  });
  return out;
}

function qc_val_unit() { return {t: "unit"}; }
function qc_val_bool(b) { return {t: "bool", b: !!b}; }
function qc_val_nat(n) { return {t: "nat", n: n}; }
function qc_val_string(s) { return {t: "string", s: String(s)}; }
function qc_val_list(xs) { return {t: "list", xs: xs}; }
function qc_val_pair(a, b) { return {t: "pair", a: a, b: b}; }
function qc_val_none() { return {t: "none"}; }
function qc_val_some(v) { return {t: "some", v: v}; }
function qc_val_left(v) { return {t: "left", v: v}; }
function qc_val_right(v) { return {t: "right", v: v}; }

function qc_gen(sort, i) {
  if (!sort) return qc_val_nat(0);
  if (sort.t === "unit") return qc_val_unit();
  if (sort.t === "bool") return qc_val_bool(i > 0);
  if (sort.t === "nat") return qc_val_nat(i);
  if (sort.t === "string") return qc_val_string("abcdefgh".slice(0, i));
  if (sort.t === "list") {
    if (!(i > 0)) return qc_val_list([]);
    return qc_val_list([qc_gen(sort.of, i - 1)]);
  }
  if (sort.t === "pair") return qc_val_pair(qc_gen(sort.a, i), qc_gen(sort.b, i));
  if (sort.t === "maybe") return i > 0 ? qc_val_some(qc_gen(sort.of, i)) : qc_val_none();
  if (sort.t === "either") return i > 0 ? qc_val_right(qc_gen(sort.b, i)) : qc_val_left(qc_gen(sort.a, i));
  return qc_val_nat(0);
}

function qc_format_val(v) {
  if (!v || typeof v !== "object") return String(v);
  if (v.t === "unit") return "unit";
  if (v.t === "bool") return v.b ? "true" : "false";
  if (v.t === "nat") return String(v.n);
  if (v.t === "string") return JSON.stringify(v.s);
  if (v.t === "list") return "[" + (v.xs || []).map(qc_format_val).join(", ") + "]";
  if (v.t === "pair") return "Pair.new!(" + qc_format_val(v.a) + ", " + qc_format_val(v.b) + ")";
  if (v.t === "none") return "none";
  if (v.t === "some") return "some(" + qc_format_val(v.v) + ")";
  if (v.t === "left") return "Either.left!(" + qc_format_val(v.v) + ")";
  if (v.t === "right") return "Either.right!(" + qc_format_val(v.v) + ")";
  return String(v);
}

function qc_val_size(v) {
  if (typeof v === "number") return v;
  if (!v || typeof v !== "object") return 0;
  if (v.t === "bool") return v.b ? 1 : 0;
  if (v.t === "nat") return v.n || 0;
  if (v.t === "string") return (v.s || "").length;
  if (v.t === "list") {
    var n = (v.xs || []).length;
    for (var i = 0; i < (v.xs || []).length; i++) n += qc_val_size(v.xs[i]);
    return n;
  }
  if (v.t === "pair") return qc_val_size(v.a) + qc_val_size(v.b);
  if (v.t === "some" || v.t === "left" || v.t === "right") return 1 + qc_val_size(v.v);
  return 0;
}

function qc_domain(sort, nats) {
  if (sort && sort.t) {
    if (sort.t === "bool") return [qc_val_bool(false), qc_val_bool(true)];
    if (sort.t === "unit") return [qc_val_unit()];
    var out = [];
    for (var i = 0; i < nats.length; i++) out.push(qc_gen(sort, nats[i]));
    return out;
  }
  if (sort === "Bool") return [0, 1];
  return nats;
}

function qc_format_arg(sort, v) {
  if (v && typeof v === "object" && v.t) return qc_format_val(v);
  if (sort && sort.t === "bool") return v ? "true" : "false";
  if (sort === "Bool") return v ? "true" : "false";
  return String(v);
}

function qc_format_call(law, binders, args) {
  if (!args.length) return law;
  var bits = [];
  for (var i = 0; i < args.length; i++) bits.push(qc_format_arg(binders[i] || {t: "nat"}, args[i]));
  return law + "(" + bits.join(", ") + ")";
}

function qc_arg_lists_for(binders, nats) {
  if (!binders.length) return [[]];
  var cap = nats.length;
  var out = [];
  function rec(prefix, i) {
    if (out.length >= cap) return;
    if (i === binders.length) { out.push(prefix.slice()); return; }
    var dom = qc_domain(binders[i], nats);
    for (var k = 0; k < dom.length && out.length < cap; k++) {
      prefix.push(dom[k]);
      rec(prefix, i + 1);
      prefix.pop();
    }
  }
  rec([], 0);
  return out.length ? out : [binders.map(function(s) { return qc_gen(s, 0); })];
}

function qc_shrink_vals(args) {
  var seen = {};
  var out = [];
  function add(next) {
    var k = next.map(qc_format_val).join(",");
    if (seen[k]) return;
    seen[k] = true;
    var sa = 0, sb = 0;
    for (var i = 0; i < next.length; i++) { sa += qc_val_size(next[i]); sb += qc_val_size(args[i]); }
    if (sa < sb) out.push(next);
  }
  function shrink_one(v) {
    if (!v || typeof v !== "object") return [];
    if (v.t === "bool" && v.b) return [qc_val_bool(false)];
    if (v.t === "nat" && v.n > 0) {
      var o = [qc_val_nat(0)];
      if (v.n > 1) o.push(qc_val_nat(Math.floor(v.n / 2)), qc_val_nat(v.n - 1));
      return o;
    }
    if (v.t === "string" && v.s) return [qc_val_string(""), qc_val_string(v.s.slice(1))];
    if (v.t === "list" && v.xs && v.xs.length) return [qc_val_list([]), qc_val_list(v.xs.slice(1))];
    if (v.t === "some") return [qc_val_none()].concat(shrink_one(v.v).map(qc_val_some));
    if (v.t === "pair") {
      var r = [];
      shrink_one(v.a).forEach(function(a) { r.push(qc_val_pair(a, v.b)); });
      shrink_one(v.b).forEach(function(b) { r.push(qc_val_pair(v.a, b)); });
      return r;
    }
    if (v.t === "left") return shrink_one(v.v).map(qc_val_left);
    if (v.t === "right") return shrink_one(v.v).map(qc_val_right);
    return [];
  }
  for (var i = 0; i < args.length; i++) {
    var opts = shrink_one(args[i]);
    for (var j = 0; j < opts.length; j++) {
      var next = args.slice();
      next[i] = opts[j];
      add(next);
    }
  }
  out.sort(function(a, b) {
    var da = 0, db = 0;
    for (var i = 0; i < a.length; i++) da += qc_val_size(a[i]);
    for (var j = 0; j < b.length; j++) db += qc_val_size(b[j]);
    return da - db;
  });
  return out;
}

function qc_arg_lists(arity, nats) {
  var binders = [];
  for (var i = 0; i < arity; i++) binders.push("Nat");
  return qc_arg_lists_for(binders, nats);
}

module.exports = {
    qc_nats: qc_nats,
    split_ty_args: split_ty_args,
    parse_qc_sort: parse_qc_sort,
    parse_qc_binders: parse_qc_binders,
    type_after_nat_pis: type_after_nat_pis,
    leading_nat_arity: leading_nat_arity,
    qc_arg_sum: qc_arg_sum,
    qc_shrink_candidates: qc_shrink_candidates,
    qc_val_unit: qc_val_unit,
    qc_val_bool: qc_val_bool,
    qc_val_nat: qc_val_nat,
    qc_val_string: qc_val_string,
    qc_val_list: qc_val_list,
    qc_val_pair: qc_val_pair,
    qc_val_none: qc_val_none,
    qc_val_some: qc_val_some,
    qc_val_left: qc_val_left,
    qc_val_right: qc_val_right,
    qc_gen: qc_gen,
    qc_format_val: qc_format_val,
    qc_val_size: qc_val_size,
    qc_domain: qc_domain,
    qc_format_arg: qc_format_arg,
    qc_format_call: qc_format_call,
    qc_arg_lists_for: qc_arg_lists_for,
    qc_shrink_vals: qc_shrink_vals,
    qc_arg_lists: qc_arg_lists
};
