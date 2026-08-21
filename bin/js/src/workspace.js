"use strict";
// Dependency-aware workspace. One Synth.many load; cache only requested names.
// Leaf edits drop checked flags for affected names only.

var path = require("path");
var protocol = require("./protocol");
var cache_store = require("./cache_store");

module.exports = function make(deps) {
  var kind = deps.kind;
  var array_to_list = deps.array_to_list;
  var shown_has_hole = deps.shown_has_hole;
  var cache_key = deps.cache_key || process.env.SURE_CACHE_KEY || "";
  var cache_root = deps.cache_root || process.cwd();
  var scan_impact = deps.scan_impact;
  var file_of_name = deps.file_of_name;

  var defs = null;
  var checked = Object.create(null);
  var owner = Object.create(null);
  var loads = 0;
  var lastRequest = null;

  function k(name) { return kind["Sure." + name] || kind["Kind." + name]; }

  function empty_defs() {
    var n = k("Map.new");
    return typeof n === "function" ? n : n;
  }

  function time(label, t0) {
    var dt = Date.now() - t0;
    if (process.env.SURE_TIME === "0") return dt;
    if (process.env.SURE_TIME === "1" || dt >= 200) {
      console.error("sure time " + label + " " + dt + "ms");
    }
    return dt;
  }

  function map_get(name, ds) {
    var get = k("Map.get");
    if (!get || !ds) return null;
    try { return get(name)(ds); } catch (e) { return null; }
  }

  function term_show(ds, name) {
    var got = map_get(name, ds);
    if (!got || got._ !== "Maybe.some") return "";
    var defn = got.value;
    var show = k("Term.show");
    if (!show || !defn) return "";
    try { return String(show(defn.term)); } catch (e) { return ""; }
  }

  function report_json(ds, names) {
    var fn = k("Defs.report_json");
    if (fn && ds) {
      try { return JSON.parse(fn(ds)(array_to_list(names))); } catch (e) {}
    }
    var pretty = k("Defs.report");
    var text = pretty && ds ? String(pretty(ds)(array_to_list(names))) : "";
    var ok = text.indexOf("All terms check.") >= 0 &&
      !/Type mismatch|Undefined reference|Can't infer/.test(text);
    return {ok: ok, types: names.map(function(n) { return {name: n, type: ""}; }), diagnostics: [], pretty: text};
  }

  async function cache_names(ds, names) {
    var put = k("Synth.load.cached.put");
    if (!put || !ds) return {wrote: 0, skipped: 0};
    var wrote = 0;
    var skipped = 0;
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var got = map_get(name, ds);
      if (!got || got._ !== "Maybe.some") continue;
      var defn = got.value;
      if (!defn || !defn.stat || defn.stat._ !== "Sure.Status.done") continue;
      var shown = "";
      try { shown = term_show(ds, name); } catch (eS) {}
      var hash = cache_store.contentHash(name + "\0" + shown + "\0" + cache_key);
      if (cache_store.skipIdentical(cache_root, cache_key, name, hash)) {
        skipped += 1;
        continue;
      }
      try { await kind.run(put(name)(defn)); wrote += 1; } catch (e) {}
      try { cache_store.remember(cache_root, cache_key, name, "", hash, Buffer.byteLength(shown || "")); } catch (eR) {}
    }
    return {wrote: wrote, skipped: skipped};
  }

  async function synth_many(names) {
    var many = k("Synth.many");
    if (!many) throw new Error("Sure.Synth.many not in compiler blob");
    var t0 = Date.now();
    var acc = defs || empty_defs();
    var need = [];
    for (var i = 0; i < names.length; i++) {
      if (!checked[names[i]]) need.push(names[i]);
    }
    if (!need.length) {
      time("synth-hit " + names.length, t0);
      return defs;
    }
    loads += 1;
    var next = await kind.run(many(array_to_list(need))(acc));
    defs = next || acc;
    for (var j = 0; j < need.length; j++) {
      checked[need[j]] = true;
      if (file_of_name) {
        try { owner[need[j]] = file_of_name(need[j]); } catch (eO) {}
      }
    }
    time("synth " + need.join(","), t0);
    return defs;
  }

  async function check_names(names, opt) {
    opt = opt || {};
    names = (names || []).filter(Boolean);
    if (!names.length) return {ok: true, types: [], diagnostics: [], holes: [], cache: {wrote: 0, skipped: 0}};
    var t0 = Date.now();
    var ds = await synth_many(names);
    var t1 = Date.now();
    var report = report_json(ds, names);
    time("report", t1);
    var t2 = Date.now();
    var found = {};
    (report.types || []).forEach(function(t) { if (t && t.name) found[t.name] = t; });
    for (var i = 0; i < names.length; i++) {
      var shown = term_show(ds, names[i]);
      if (!found[names[i]]) {
        report.ok = false;
        report.diagnostics = (report.diagnostics || []).concat([{error: {code: "undefined_reference", name: names[i]}}]);
      }
      if (shown && shown_has_hole(shown)) {
        report.ok = false;
        report.holes = (report.holes || []).concat([names[i]]);
      }
      if (found[names[i]] && shown) found[names[i]].term = shown;
    }
    time("holes", t2);
    var cacheInfo = {wrote: 0, skipped: 0};
    if (opt.cache !== false) {
      var t3 = Date.now();
      cacheInfo = await cache_names(ds, names);
      time("cache-write", t3);
    }
    report.cache = cacheInfo;
    report.names = names;
    time("check_names", t0);
    if (report.pretty && opt.print) process.stdout.write(report.pretty.charAt(report.pretty.length - 1) === "\n" ? report.pretty : report.pretty + "\n");
    return report;
  }

  async function build(req) {
    var request = protocol.requestOf(req);
    lastRequest = request;
    var names = protocol.namesOf(request);
    var report = await check_names(names, {cache: true, print: !!req && req.print});
    var wrapped = protocol.reportOf(report);
    wrapped.types = report.types;
    wrapped.pretty = report.pretty;
    wrapped.cache = report.cache;
    wrapped.request = request;
    wrapped.loads = loads;
    if (request.holes && report.holes && report.holes.length) wrapped.ok = false;
    return wrapped;
  }

  function invalidate(names) {
    names = names || [];
    var n = 0;
    for (var i = 0; i < names.length; i++) {
      if (checked[names[i]]) {
        delete checked[names[i]];
        n += 1;
      }
    }
    return n;
  }

  function sameFile(a, b) {
    if (!a || !b) return false;
    var as = String(a);
    var bs = String(b);
    if (as === bs) return true;
    try { if (path.resolve(as) === path.resolve(bs)) return true; } catch (e) {}
    var ba = path.basename(as);
    var bb = path.basename(bs);
    return !!ba && ba === bb && (as.slice(-bs.length) === bs || bs.slice(-as.length) === as);
  }

  function invalidateFile(file) {
    var hit = [];
    Object.keys(owner).forEach(function(name) {
      if (sameFile(owner[name], file)) hit.push(name);
    });
    if (scan_impact) {
      hit.slice().forEach(function(name) {
        try {
          var r = scan_impact(name);
          (r.callers || []).concat(r.proofs || []).forEach(function(c) {
            if (c && c.name && hit.indexOf(c.name) < 0) hit.push(c.name);
          });
        } catch (e) {}
      });
    }
    return {names: hit, dropped: invalidate(hit)};
  }

  function reset() {
    defs = null;
    checked = Object.create(null);
    owner = Object.create(null);
    loads = 0;
  }

  return {
    check_names: check_names,
    build: build,
    reset: reset,
    invalidate: invalidate,
    invalidateFile: invalidateFile,
    time: time,
    term_show: function(name) { return term_show(defs, name); },
    has: function(name) { return !!checked[name]; },
    loads: function() { return loads; },
    lastRequest: function() { return lastRequest; }
  };
};
