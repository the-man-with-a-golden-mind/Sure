"use strict";
// Prove, QC, gen, fmt, bench, doc, goal, fill.
module.exports = function make(deps) {
  var ORIG_CWD = deps.ORIG_CWD;
  var agent_check_code = deps.agent_check_code;
  var agent_check_name = deps.agent_check_name;
  var agent_dispatch = deps.agent_dispatch;
  var agent_show = deps.agent_show;
  var apply_project_env = deps.apply_project_env;
  var checker = deps.checker;
  var check_project_modules = deps.check_project_modules;
  var compiler = deps.compiler;
  var default_prove_names = deps.default_prove_names;
  var file_of_name = deps.file_of_name;
  var find_manifest = deps.find_manifest;
  var fs = deps.fs;
  var _fs_readFileSync = deps._fs_readFileSync || (fs && fs.readFileSync.bind(fs));
  var goal_trace = deps.goal_trace;
  var is_proof_type = deps.is_proof_type;
  var kind = deps.kind;
  var parse_qc_binders = deps.parse_qc_binders;
  var path = deps.path;
  var prove_result = deps.prove_result;
  var qc_arg_lists = deps.qc_arg_lists;
  var qc_arg_lists_for = deps.qc_arg_lists_for;
  var qc_format_call = deps.qc_format_call;
  var qc_nats = deps.qc_nats;
  var qc_shrink_candidates = deps.qc_shrink_candidates;
  var qc_shrink_vals = deps.qc_shrink_vals;
  var read_manifest = deps.read_manifest;
  var scan_dependencies = deps.scan_dependencies;
  var scan_docs = deps.scan_docs;
  var scan_graph = deps.scan_graph;
  var scan_impact = deps.scan_impact;
  var scan_src_theorems = deps.scan_src_theorems;
  var scan_theorems = deps.scan_theorems;
  var sure_debug_emit = deps.sure_debug_emit;
  var sure_debug_flags_read = deps.sure_debug_flags_read;
  var sure_debug_flags_show = deps.sure_debug_flags_show;
  var sure_debug_level_read = deps.sure_debug_level_read;
  var sure_debug_open = deps.sure_debug_open;

async function cmd_prove(names, as_json, no_exit, debug, opt) {
  apply_project_env();
  var list = names && names.length ? names : default_prove_names();
  var failed = 0;
  var check_failed = 0;
  var results = [];
  var lv = debug === true ? "trace" : (debug || "");
  var flags = sure_debug_flags_read(opt || "");
  if (!as_json) console.log("== prove (type checker is the prover) ==");
  for (var i = 0; i < list.length; i++) {
    var spec = list[i];
    var is_code = spec.indexOf("\n") >= 0 || (/\s/.test(spec) && /:/.test(spec));
    var report = is_code ? await agent_check_code(spec) : await agent_check_name(spec);
    var result = prove_result(is_code ? "" : spec, report);
    results.push(result);
    if (!result.ok) check_failed += 1;
    if (!result.ok || !result.proved) {
      if (!as_json) {
        if (result.ok && !result.proved) {
          console.log("checked " + result.name + (result.type ? " : " + result.type : "") + " (not a completed proof)");
        } else {
          console.log("unproved " + result.name);
        }
        if (result.proof_obligations.length) {
          console.log(JSON.stringify(result.proof_obligations, null, 2));
        } else if (result.diagnostics.length) {
          console.log(JSON.stringify(result.diagnostics, null, 2));
        }
        if (sure_debug_emit(lv, "error", flags, "holes") || sure_debug_emit(lv, "error", flags, "term")) {
          var tr = await goal_trace(result.name, report);
          var dump = {
            remaining: tr.remaining,
            traces: sure_debug_open(flags, "holes") ? tr.traces : [],
            goals: sure_debug_open(flags, "holes") ? tr.goals : [],
            relevant: sure_debug_open(flags, "term") ? tr.relevant : [],
            proof_obligations: tr.proof_obligations,
          };
          console.log(JSON.stringify(dump, null, 2));
        }
      }
      failed += 1;
    } else if (!as_json) {
      var tag = result.proved ? "proved  " : "checked ";
      console.log(tag + result.name + (result.type ? " : " + result.type : ""));
      if (sure_debug_emit(lv, "info", flags, "holes") && lv === "info") {
        var tr_info = await goal_trace(result.name, report);
        console.log("remaining " + tr_info.remaining);
      }
      if (sure_debug_emit(lv, "trace", flags, "holes") || sure_debug_emit(lv, "trace", flags, "term")) {
        var tr_ok = await goal_trace(result.name, report);
        var shown = null;
        if (sure_debug_emit(lv, "trace", flags, "term") && result.name) {
          try { shown = await agent_show(result.name, false); } catch (e) { shown = null; }
        }
        console.log(JSON.stringify({
          name: result.name,
          type: result.type,
          proof: result.proof,
          term: shown && shown.term ? shown.term : "",
          remaining: tr_ok.remaining,
          traces: sure_debug_open(flags, "holes") ? tr_ok.traces : [],
          diagnostics: result.diagnostics,
        }, null, 2));
      }
    }
  }
  var mods = check_project_modules(!!as_json);
  if (!mods.ok) {
    failed += 1;
    if (!as_json) (mods.errors || []).forEach(function(e) { console.log("unproved module: " + e); });
  }
  var all_ok = check_failed === 0 && mods.ok;
  var all_proved = true;
  for (var ri = 0; ri < results.length; ri++) {
    if (!results[ri].proved) all_proved = false;
  }
  if (!mods.ok) all_proved = false;
  if (as_json) {
    console.log(JSON.stringify({ok: all_ok, proved: all_proved && all_ok, results: results, modules: mods}, null, 2));
  }
  if (failed) {
    if (!as_json) console.log("prove failed: " + failed);
    if (!no_exit) process.exit(1);
  } else if (!as_json) {
    console.log("All listed theorems proved.");
  }
  return failed;
}


async function cmd_qc(law, n, debug) {
  apply_project_env();
  n = Number(n);
  if (!Number.isFinite(n) || n < 1) {
    return {ok: false, error: "need --n >= 1", law: law || "", n: n, passed: 0, failed: 1, samples: []};
  }
  if (!law) {
    var base = prove_result("Sure.Qc.all", await agent_check_name("Sure.Qc.all"));
    return {ok: !!base.ok, law: "Sure.Qc.all", n: n, passed: base.ok ? 1 : 0, failed: base.ok ? 0 : 1, samples: [], diagnostics: base.diagnostics};
  }
  var typed = prove_result(law, await agent_check_name(law));
  if (!typed.ok) {
    return {ok: false, error: "unproved law", law: law, type: typed.type, diagnostics: typed.diagnostics, samples: []};
  }
  var parsed = parse_qc_binders(typed.type);
  var binders = parsed.binders;
  var arity = binders.length;
  if (!is_proof_type(parsed.rest)) {
    return {ok: false, error: "not a proof law", law: law, type: typed.type, samples: []};
  }
  var nats = qc_nats(n);
  var arglists = qc_arg_lists_for(binders, nats);
  var samples = [];
  var failed = 0;
  async function try_args(args) {
    var call = qc_format_call(law, binders, args);
    var code = "QcSample: Unit\n  let p = " + call + "\n  unit\n";
    var report = await agent_check_code(code);
    var result = prove_result("QcSample", report);
    return {call: call, result: result, ok: !!result.ok};
  }
  async function shrink_args(args) {
    var cur = args.slice();
    for (var step = 0; step < 8; step++) {
      var cands = (cur[0] && typeof cur[0] === "object") ? qc_shrink_vals(cur) : qc_shrink_candidates(cur);
      var hit = null;
      for (var c = 0; c < cands.length; c++) {
        var t = await try_args(cands[c]);
        if (!t.ok) { hit = cands[c]; break; }
      }
      if (!hit) break;
      cur = hit;
    }
    return cur;
  }
  for (var i = 0; i < arglists.length; i++) {
    var args = arglists[i];
    var tried = await try_args(args);
    var row = {args: args, binders: binders, call: tried.call, ok: tried.ok, type: tried.result.type || typed.type};
    if (!row.ok) {
      row.debug = Sure_debug_row(tried.call, tried.result);
      var shrunk = await shrink_args(args);
      row.shrunk = shrunk;
      row.call_shrunk = qc_format_call(law, binders, shrunk);
      failed += 1;
    }
    samples.push(row);
  }
  return {ok: failed === 0, law: law, n: n, arity: arity, binders: binders, passed: samples.length - failed, failed: failed, samples: samples};
}

function type_shown_flat(t) {
  return String(t || "").replace(/\s+/g, "");
}

function type_is_json_decoder(t) {
  var s = type_shown_flat(t);
  return /JSON->Maybe/.test(s) || /:JSON\)->Maybe/.test(s);
}

function type_is_bool_to_bool(t) {
  var s = type_shown_flat(t);
  return s === "Bool->Bool" || /:Bool\)->Bool$/.test(s);
}

async function gen_check_app(tests, call) {
  var code = "GenApp: Unit\n  let p = " + call + "\n  unit\n";
  var r = prove_result("GenApp", await agent_check_code(code));
  tests.push({kind: "app", label: call, ok: !!r.ok});
  return !!r.ok;
}

async function gen_try_eq(tests, call, rhs) {
  var code = "GenEq: " + call + " == " + rhs + "\n  refl\n";
  var pn = prove_result("GenEq", await agent_check_code(code));
  if (pn.ok && pn.proved) {
    tests.push({kind: "proof", label: call + " == " + rhs, ok: true, proof: true});
    return true;
  }
  return false;
}

async function cmd_gen(name) {
  apply_project_env();
  if (!name) return {ok: false, error: "need name", name: "", type: "", tests: []};
  var typed = prove_result(name, await agent_check_name(name));
  if (!typed.ok) {
    return {ok: false, error: "unproved", name: name, type: typed.type || "", tests: []};
  }
  var tests = [{kind: "check", label: name, ok: true, proof: !!typed.proved}];
  var failed = 0;
  var parsed = parse_qc_binders(typed.type);
  if (is_proof_type(parsed.rest) && parsed.binders.length) {
    var qc = await cmd_qc(name, 4, false);
    tests.push({kind: "qc", label: name, ok: !!qc.ok, passed: qc.passed || 0, failed: qc.failed || 0});
    if (!qc.ok) failed += 1;
  }
  if (type_is_json_decoder(typed.type)) {
    var apps = [
      "JSON.null",
      "JSON.string(\"\")",
      "JSON.array([])",
      "JSON.bool(true)",
      "JSON.bool(false)",
      "JSON.string(\"abc\")"
    ];
    for (var i = 0; i < apps.length; i++) {
      var call = name + "(" + apps[i] + ")";
      if (!(await gen_check_app(tests, call))) failed += 1;
      await gen_try_eq(tests, call, "none");
    }
  }
  if (type_is_bool_to_bool(typed.type)) {
    var bargs = ["true", "false"];
    for (var bi = 0; bi < bargs.length; bi++) {
      var bcall = name + "(" + bargs[bi] + ")";
      if (!(await gen_check_app(tests, bcall))) failed += 1;
      var hit = await gen_try_eq(tests, bcall, "true");
      if (!hit) await gen_try_eq(tests, bcall, "false");
    }
  }
  return {ok: failed === 0, name: name, type: typed.type, tests: tests, generated: tests.length};
}

function Sure_debug_row(call, result) {
  var want = "proved " + call;
  var got = "unproved";
  if (result.diagnostics && result.diagnostics[0]) {
    var err = result.diagnostics[0].error || result.diagnostics[0];
    if (err.detected) got = String(err.detected);
    if (err.expected) want = String(err.expected);
  }
  return {call: call, got_want: "got " + got + " want " + want, diagnostics: result.diagnostics || []};
}

async function prove_one(spec) {
  var is_code = !spec ? false : (spec.indexOf("\n") >= 0 || (/\s/.test(spec) && /:/.test(spec)));
  var report = !spec
    ? {ok: false, error: "empty"}
    : (is_code ? await agent_check_code(spec) : await agent_check_name(spec));
  return prove_result(is_code ? "" : spec, report);
}


async function prove_project_theorems(as_json) {
  var manFile = find_manifest(ORIG_CWD);
  if (!manFile) return 0;
  var th = [];
  try { th = read_manifest(manFile).theorems || []; } catch (e) {}
  if (!th.length) {
    var man = {};
    try { man = read_manifest(manFile); } catch (e) {}
    var src = path.join(path.dirname(manFile), man.src || "src");
    th = scan_src_theorems(src);
  }
  if (th.length) return await cmd_prove(th, as_json, true);
  return 0;
}

function cmd_impact(name) {
  if (!name) { console.error("sure impact <Name>"); process.exit(1); }
  var r = scan_impact(name);
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(1);
}

function cmd_deps(name) {
  if (!name) { console.error("sure deps <Name>"); process.exit(1); }
  var r = scan_dependencies(name);
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(1);
}

function bench_stats(samples) {
  if (!samples || !samples.length) return {ok: false, error: "no samples", n: 0, best: null, mean: 0, samples: []};
  var sum = 0;
  var best = samples[0];
  for (var i = 0; i < samples.length; i++) {
    var x = samples[i];
    if (typeof x !== "number" || x < 0) return {ok: false, error: "bad sample", n: 0, best: null, mean: 0, samples: samples};
    sum += x;
    if (x < best) best = x;
  }
  return {
    ok: true,
    n: samples.length,
    best: best,
    mean: Math.floor(sum / samples.length),
    samples: samples,
  };
}

async function cmd_bench(name, n, as_json) {
  if (!name) { console.error("sure bench <Term>"); process.exit(1); }
  var runs = n == null ? 3 : Number(n);
  if (!Number.isFinite(runs) || runs < 1) {
    console.error("sure bench: --n must be >= 1");
    process.exit(1);
  }
  var samples = [];
  var last = null;
  for (var i = 0; i < runs; i++) {
    var t0 = Date.now();
    var report = await agent_check_name(name);
    var dt = Date.now() - t0;
    last = prove_result(name, report);
    if (!last.ok) {
      if (as_json) console.log(JSON.stringify({ok: false, name: name, error: "unproved", ms: dt, report: last}, null, 2));
      else {
        console.log("unproved " + name + " (" + dt + "ms)");
        if (last.diagnostics.length) console.log(JSON.stringify(last.diagnostics, null, 2));
      }
      process.exit(1);
    }
    samples.push(dt);
  }
  var stats = bench_stats(samples);
  stats.name = name;
  stats.proved = !!last.proved;
  stats.type = last.type || "";
  if (as_json) console.log(JSON.stringify(stats, null, 2));
  else {
    console.log(name + (stats.type ? " : " + stats.type : ""));
    console.log("n=" + stats.n + " best=" + stats.best + "ms mean=" + stats.mean + "ms");
  }
}

function cmd_graph(name, depth) {
  if (!name) { console.error("sure graph <Name>"); process.exit(1); }
  var r = scan_graph(name, depth);
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(1);
}

function cmd_theorems(name) {
  var r = scan_theorems(name || "");
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(1);
}

async function cmd_debug(name, as_json, level, opt, norm) {
  if (!name) {
    console.error("sure debug <Term>");
    console.error("try: sure help debug");
    process.exit(1);
  }
  var lv = sure_debug_level_read(level || "trace") || "trace";
  var flags = sure_debug_flags_read(opt || "");
  var is_code = name.indexOf("\n") >= 0 || (/\s/.test(name) && /:/.test(name));
  var report = is_code ? await agent_check_code(name) : await agent_check_name(name);
  var traced = await goal_trace(is_code ? "" : name, report);
  var shown = null;
  if (!is_code && (as_json || sure_debug_emit(lv, "info", flags, "term") || norm)) {
    try { shown = await agent_show(name, !!norm); } catch (e) { shown = null; }
  }
  var term_txt = shown && shown.ok ? (shown.term || "") : "";
  if (as_json) {
    console.log(JSON.stringify({
      ok: !!traced.ok,
      level: lv,
      flags: sure_debug_flags_show(flags),
      name: traced.name || name,
      type: traced.type || "",
      term: term_txt,
      remaining: traced.remaining,
      traces: traced.traces || [],
      relevant: traced.relevant || [],
      proof_obligations: traced.proof_obligations || [],
      diagnostics: traced.diagnostics || [],
    }, null, 2));
  } else {
    console.log("== debug " + lv + " " + (traced.name || name) + (traced.type ? " : " + traced.type : "") + " ==");
    if (lv !== "off") console.log("remaining " + traced.remaining);
    if (term_txt && sure_debug_open(flags, "term")) console.log(term_txt);
    if (sure_debug_emit(lv, "info", flags, "holes") && traced.traces && traced.traces.length) {
      if (lv === "trace" || lv === "info" || lv === "error") console.log(traced.traces.join("\n"));
    }
    if (lv === "trace" && sure_debug_open(flags, "term") && traced.relevant && traced.relevant.length) {
      var rnames = traced.relevant.map(function(r) { return (r && r.name) ? r.name : String(r); });
      console.log("relevant " + rnames.join(" "));
    }
    if (traced.proof_obligations && traced.proof_obligations.length) {
      console.log(JSON.stringify(traced.proof_obligations, null, 2));
    }
    if (!traced.ok && traced.diagnostics && traced.diagnostics.length) {
      console.log(JSON.stringify(traced.diagnostics, null, 2));
    }
  }
  if (!traced.ok) process.exit(1);
}

async function cmd_goal(name, as_json) {
  if (!name) {
    console.error("sure goal <Term>");
    process.exit(1);
  }
  var is_code = name.indexOf("\n") >= 0 || (/\s/.test(name) && /:/.test(name));
  var report = is_code ? await agent_check_code(name) : await agent_check_name(name);
  var traced = await goal_trace(is_code ? "" : name, report);
  if (as_json) {
    console.log(JSON.stringify(traced, null, 2));
  } else {
    console.log("== goal " + (traced.name || name) + (traced.type ? " : " + traced.type : "") + " ==");
    console.log("remaining " + traced.remaining);
    if (traced.traces && traced.traces.length) {
      console.log(traced.traces.join("\n"));
    }
    if (traced.proof_obligations && traced.proof_obligations.length) {
      console.log(JSON.stringify(traced.proof_obligations, null, 2));
    }
    if (!traced.ok && !traced.remaining && traced.diagnostics && traced.diagnostics.length) {
      console.log(JSON.stringify(traced.diagnostics, null, 2));
    }
  }
  if (!traced.ok) process.exit(1);
}

async function cmd_fill(src, term, first, as_json) {
  var result = await agent_dispatch("kind.fill", {code: src || "", term: term, first: !!first});
  if (as_json) console.log(JSON.stringify(result, null, 2));
  else {
    if (!result.ok) {
      console.log("fill failed: " + (result.error || ("remaining " + result.remaining)));
      if (result.code != null) console.log(result.code);
      if (result.trace && result.trace.traces && result.trace.traces.length) {
        console.log(result.trace.traces.join("\n"));
      }
    } else {
      console.log("filled remaining " + result.remaining);
      console.log(result.code);
    }
  }
  if (!result.ok) process.exit(1);
}

async function cmd_doc(name, as_json) {
  if (!name) { console.error("sure doc <Term>"); process.exit(1); }
  var docs = scan_docs(name);
  if (docs.ok && docs.entries.length === 1) {
    var report = await agent_check_name(docs.entries[0].name);
    var ty = (report && report.types && report.types[0]) || {};
    if (ty.type) docs.entries[0].type = ty.type;
    docs.checked = !!(report && report.ok);
  }
  if (as_json) {
    console.log(JSON.stringify(docs, null, 2));
    process.exit(docs.ok ? 0 : 1);
  }
  if (!docs.ok || !docs.entries.length) {
    console.error("no docs for " + name);
    process.exit(1);
  }
  for (var i = 0; i < docs.entries.length; i++) {
    var e = docs.entries[i];
    if (e.doc) {
      e.doc.split("\n").forEach(function(line) { console.log("// " + line); });
    }
    console.log(e.name + " : " + (e.type || ""));
    if (e.theorem) console.log("(theorem)");
    if (e.implement) console.log("(hole ?implement)");
    if (i + 1 < docs.entries.length) console.log("");
  }
  process.exit(0);
}

async function cmd_fmt(target) {
  if (!target) { console.error("sure fmt <Term|file.sure>"); process.exit(1); }
  if (target.slice(-5) === ".sure") {
    var file = path.resolve(ORIG_CWD, target);
    if (!fs.existsSync(file)) { console.error("no such file: " + file); process.exit(1); }
    var body = _fs_readFileSync(file, "utf8");
    process.stdout.write(compiler.format_source(body));
    return;
  }
  var file = file_of_name(target);
  if (!file || !fs.existsSync(file)) { console.error("sure fmt: no source file for " + target); process.exit(1); }
  var body = _fs_readFileSync(file, "utf8");
  process.stdout.write(compiler.format_source(body));
}


  return {
    cmd_prove: cmd_prove,
    cmd_qc: cmd_qc,
    cmd_gen: cmd_gen,
    prove_one: prove_one,
    prove_project_theorems: prove_project_theorems,
    cmd_impact: cmd_impact,
    cmd_deps: cmd_deps,
    bench_stats: bench_stats,
    cmd_bench: cmd_bench,
    cmd_graph: cmd_graph,
    cmd_theorems: cmd_theorems,
    cmd_debug: cmd_debug,
    cmd_goal: cmd_goal,
    cmd_fill: cmd_fill,
    cmd_doc: cmd_doc,
    cmd_fmt: cmd_fmt
  };
};
