"use strict";
// In-memory checked defs. Synth.many loads the project once; we cache only
// requested names. Survives prove / test / LSP in this process.

module.exports = function make(deps) {
  var kind = deps.kind;
  var array_to_list = deps.array_to_list;
  var shown_has_hole = deps.shown_has_hole;

  var defs = null;
  var checked = Object.create(null);

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
    if (!put || !ds) return;
    for (var i = 0; i < names.length; i++) {
      var got = map_get(names[i], ds);
      if (!got || got._ !== "Maybe.some") continue;
      var defn = got.value;
      if (!defn || !defn.stat || defn.stat._ !== "Sure.Status.done") continue;
      try { await kind.run(put(names[i])(defn)); } catch (e) {}
    }
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
    var next = await kind.run(many(array_to_list(need))(acc));
    defs = next || acc;
    for (var j = 0; j < need.length; j++) checked[need[j]] = true;
    time("synth " + need.join(","), t0);
    return defs;
  }

  async function check_names(names, opt) {
    opt = opt || {};
    names = (names || []).filter(Boolean);
    if (!names.length) return {ok: true, types: [], diagnostics: []};
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
    if (opt.cache !== false) {
      var t3 = Date.now();
      await cache_names(ds, names);
      time("cache-write", t3);
    }
    time("check_names", t0);
    if (report.pretty && opt.print) process.stdout.write(report.pretty.charAt(report.pretty.length - 1) === "\n" ? report.pretty : report.pretty + "\n");
    return report;
  }

  function reset() {
    defs = null;
    checked = Object.create(null);
  }

  return {
    check_names: check_names,
    reset: reset,
    time: time,
    term_show: function(name) { return term_show(defs, name); },
    has: function(name) { return !!checked[name]; }
  };
};
