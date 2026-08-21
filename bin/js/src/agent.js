"use strict";
// JSON-RPC compiler-as-tool (sure agent).
module.exports = function makeAgent(deps) {
  var fs = deps.fs;
  var kind = deps.kind;
  var checker = deps.checker;
  var fmc_to_js = deps.fmc_to_js;
  var json_ok = deps.json_ok;
  var json_err = deps.json_err;
  function gate_residual_holes(a, b, c) { return deps.gate_residual_holes(a, b, c); }
  function when_expand_source(s) { return deps.when_expand_source(s); }
  function def_header(s) { return deps.def_header(s); }
  function check_output_ok(s) { return deps.check_output_ok(s); }
  function annotate_proof_report(r) { return deps.annotate_proof_report(r); }
  function prove_result(n, r) { return deps.prove_result(n, r); }
  function scan_project_holes() { return deps.scan_project_holes(); }
  function scan_symbols(p) { return deps.scan_symbols(p); }
  function scan_references(n) { return deps.scan_references(n); }
  function scan_impact(n) { return deps.scan_impact(n); }
  function scan_theorems(n) { return deps.scan_theorems(n); }
  function scan_docs(n) { return deps.scan_docs(n); }
  function scan_graph(n, d) { return deps.scan_graph(n, d); }
  function scan_dependencies(n) { return deps.scan_dependencies(n); }
  function cmd_qc(a, b, c) { return deps.cmd_qc(a, b, c); }
  function cmd_gen(n) { return deps.cmd_gen(n); }
  function bench_stats(s) { return deps.bench_stats(s); }
  function sure_debug_level_read(s) { return deps.sure_debug_level_read(s); }
  function sure_debug_flags_read(s) { return deps.sure_debug_flags_read(s); }
  function sure_debug_flags_show(f) { return deps.sure_debug_flags_show(f); }

async function capture_kind(fn) {
  var chunks = [];
  var write = process.stdout.write;
  process.stdout.write = function(chunk, enc, cb) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    if (typeof enc === "function") return enc(null);
    if (typeof cb === "function") return cb(null);
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = write;
  }
  return chunks.join("");
}

function parse_json_loose(text) {
  var t = String(text || "").trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) {}
  var start = t.indexOf("{");
  var end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch (e2) {}
  }
  return null;
}

async function agent_check_name(name) {
  var report;
  if (checker("api.io.check_term_json")) {
    var text = await capture_kind(function() {
      return kind.run(checker("api.io.check_term_json")(name));
    });
    report = parse_json_loose(text) || {ok: false, raw: text};
  } else {
    var pretty = await capture_kind(function() {
      return kind.run(checker("api.io.check_term")(name));
    });
    report = {ok: check_output_ok(pretty), pretty: pretty};
  }
  return gate_residual_holes(name, report, null);
}

async function agent_check_code(code) {
  try { code = when_expand_source(String(code || "")); } catch (e) {}
  var report;
  if (checker("api.io.check_code_json")) {
    var text = await kind.run(checker("api.io.check_code_json")(code));
    report = typeof text === "string" ? (parse_json_loose(text) || {ok: false, raw: text}) : text;
  } else {
    var pretty = checker("api.check_code")
      ? checker("api.check_code")(code)
      : "";
    report = {ok: check_output_ok(String(pretty)), pretty: String(pretty)};
  }
  var nm = "";
  var lines = String(code || "").split("\n");
  for (var i = 0; i < lines.length; i++) {
    var h = def_header(lines[i]);
    if (h && !/^\s/.test(lines[i])) { nm = h[1]; break; }
  }
  return gate_residual_holes(nm, report, code);
}

async function agent_show(name, normal) {
  var fn = normal ? checker("api.io.show_term_normal") : checker("api.io.show_term");
  if (!fn) return {ok: false, error: "show_term not in this compiler blob"};
  var text = (await capture_kind(function() { return kind.run(fn(name)); })).trim();
  return {ok: true, name: name, term: text};
}

function agent_type_names(text) {
  var m = String(text || "").match(/[A-Z][A-Za-z0-9._]*/g);
  if (!m) return [];
  var seen = {};
  var out = [];
  for (var i = 0; i < m.length; i++) {
    if (!seen[m[i]]) { seen[m[i]] = true; out.push(m[i]); }
  }
  return out;
}

async function agent_relevant(report) {
  var names = [];
  var types = (report && report.types) || [];
  var diags = (report && report.diagnostics) || [];
  for (var i = 0; i < types.length; i++) {
    names = names.concat(agent_type_names(types[i].type));
  }
  for (var j = 0; j < diags.length; j++) {
    var err = diags[j].error || diags[j];
    names = names.concat(agent_type_names(err.goal || ""));
    names = names.concat(agent_type_names(err.expected || ""));
    names = names.concat(agent_type_names(err.context || ""));
  }
  var seen = {};
  var uniq = [];
  for (var k = 0; k < names.length; k++) {
    if (!seen[names[k]]) { seen[names[k]] = true; uniq.push(names[k]); }
  }
  var relevant = [];
  for (var n = 0; n < uniq.length && relevant.length < 8; n++) {
    try {
      var shown = await agent_show(uniq[n], false);
      if (shown && shown.ok) relevant.push({name: uniq[n], term: shown.term});
    } catch (e) {}
  }
  return relevant;
}

function filter_goals(report) {
  var diags = (report && report.diagnostics) || [];
  var goals = [];
  for (var i = 0; i < diags.length; i++) {
    var err = diags[i].error || diags[i];
    if (err && (err.code === "show_goal" || err.code === "residual_hole" || err.name === "implement" || err.name === "_")) {
      goals.push(diags[i]);
    }
  }
  return goals;
}

function hole_count_js(src) {
  var s = String(src || "");
  if (!s) return 0;
  var n = 0;
  var i = 0;
  var hole = "?implement";
  while (true) {
    var j = s.indexOf(hole, i);
    if (j < 0) return n;
    n += 1;
    i = j + hole.length;
  }
}

function fill_src(src, term, first) {
  var s = src == null ? "" : String(src);
  var t = term == null ? "" : String(term);
  var hole = "?implement";
  if (s.indexOf(hole) < 0) {
    return {ok: false, error: "hole not found: " + hole, code: s, remaining: 0, first: !!first};
  }
  var next;
  if (first) {
    var i = s.indexOf(hole);
    next = s.slice(0, i) + t + s.slice(i + hole.length);
  } else {
    next = s.split(hole).join(t);
  }
  return {ok: true, code: next, remaining: hole_count_js(next), first: !!first};
}

function extract_goal(diag) {
  var err = (diag && (diag.error || diag)) || {};
  var ty = err.goal != null ? err.goal : (err.expected != null ? err.expected : "");
  var ctx = err.context != null ? err.context : "";
  var name = err.name != null ? String(err.name) : (err.code === "show_goal" ? "implement" : "");
  return {
    name: name,
    code: err.code || "",
    type: ty == null ? "" : String(ty),
    expected: err.expected != null ? String(err.expected) : "",
    detected: err.detected != null ? String(err.detected) : "",
    context: ctx == null ? "" : String(ctx),
    origin: err.origin || null,
    proof_obligation: !!err.proof_obligation,
  };
}

function format_goal_line(g) {
  g = g || {};
  return "Goal ?" + (g.name || "") + ":\nWith type: " + (g.type || "") + "\nWith context:\n" + (g.context || "");
}

async function goal_trace(name, report) {
  report = annotate_proof_report(report);
  var proved = prove_result(name, report);
  var raw = filter_goals(report);
  var goals = [];
  var traces = [];
  for (var i = 0; i < raw.length; i++) {
    var g = extract_goal(raw[i]);
    goals.push(g);
    traces.push(format_goal_line(g));
  }
  var relevant = await agent_relevant(report);
  var remaining = goals.length;
  var ok = !!(proved && proved.ok) && remaining === 0 && !(proved.proof_obligations && proved.proof_obligations.length);
  return {
    ok: ok,
    name: proved.name || name || "",
    type: proved.type || "",
    proved: !!proved.proved,
    remaining: remaining,
    goals: goals,
    traces: traces,
    relevant: relevant,
    proof_obligations: proved.proof_obligations || [],
    diagnostics: proved.diagnostics || [],
  };
}

async function agent_dispatch(method, params) {
  params = params || {};
  method = String(method || "");
  if (method.indexOf("kind.") === 0) method = "sure." + method.slice(5);
  switch (method) {
    case "sure.parse":
    case "sure.check": {
      var checked = params.code != null
        ? await agent_check_code(String(params.code))
        : (params.name ? await agent_check_name(String(params.name)) : {ok: false, error: "need name or code"});
      return annotate_proof_report(checked);
    }
    case "sure.prove": {
      var checked = params.code != null
        ? await agent_check_code(String(params.code))
        : (params.name ? await agent_check_name(String(params.name)) : {ok: false, error: "need name or code"});
      return prove_result(params.name || "", checked);
    }
    case "sure.normalize":
      if (!params.name) return {ok: false, error: "need name"};
      return await agent_show(String(params.name), true);
    case "sure.infer":
    case "sure.definition":
      if (params.code != null) return await agent_check_code(String(params.code));
      if (!params.name) return {ok: false, error: "need name"};
      return await agent_check_name(String(params.name));
    case "sure.goal":
    case "sure.trace":
    case "sure.holes":
    case "sure.diagnostics": {
      if (method === "sure.holes" && params.code == null && !params.name && !params.file) {
        return scan_project_holes();
      }
      if ((method === "sure.goal" || method === "sure.trace") && params.code == null && !params.name && !params.file) {
        return {ok: false, error: "need name or code", remaining: 0, goals: [], traces: [], relevant: []};
      }
      var report = params.code != null
        ? await agent_check_code(String(params.code))
        : await agent_check_name(String(params.name || params.file || ""));
      if (method === "sure.diagnostics") return report;
      if (method === "sure.holes") {
        var goals = filter_goals(report);
        report = annotate_proof_report(report);
        return {ok: !!(report && report.ok), goals: goals, relevant: [], report: report};
      }
      var traced = await goal_trace(params.name || "", report);
      return traced;
    }
    case "sure.repair":
    case "sure.fill": {
      var src = params.code != null ? String(params.code)
        : (params.file && fs.existsSync(params.file) ? fs.readFileSync(params.file, "utf8") : "");
      if (!src) return {ok: false, error: "need code or file", remaining: 0};
      var term = params.term != null ? String(params.term) : "";
      if (method === "sure.repair" && !term) return {ok: false, error: "need term", remaining: hole_count_js(src)};
      var first = method === "sure.fill" ? !!params.first : false;
      var filled = fill_src(src, term, first);
      if (!filled.ok) return filled;
      if (params.file) fs.writeFileSync(params.file, filled.code);
      var checked = await agent_check_code(filled.code);
      var traced = await goal_trace("", checked);
      return {
        ok: !!(checked && checked.ok) && traced.remaining === 0,
        code: filled.code,
        remaining: traced.remaining,
        first: first,
        report: checked,
        trace: traced,
      };
    }
    case "sure.symbols":
      return {ok: true, symbols: scan_symbols(params.prefix || "")};
    case "sure.references":
      if (!params.name) return {ok: false, error: "need name"};
      return {ok: true, references: scan_references(String(params.name))};
    case "sure.impact":
      return scan_impact(params.name ? String(params.name) : "");
    case "sure.theorems":
      return scan_theorems(params.name ? String(params.name) : "");
    case "sure.docs":
      return scan_docs(params.name ? String(params.name) : "");
    case "sure.graph":
      return scan_graph(params.name ? String(params.name) : "", params.depth);
    case "sure.bench": {
      if (!params.name) return {ok: false, error: "need name"};
      var n = params.n == null ? 1 : Number(params.n);
      var samples = [];
      for (var bi = 0; bi < n && Number.isFinite(n) && n >= 1; bi++) {
        var t0 = Date.now();
        var report = await agent_check_name(String(params.name));
        var dt = Date.now() - t0;
        var pr = prove_result(params.name, report);
        if (!pr.ok) return {ok: false, error: "unproved", name: params.name, ms: dt, report: pr};
        samples.push(dt);
      }
      var st = bench_stats(samples);
      st.name = params.name;
      return st;
    }
    case "sure.qc": {
      var qn = params.n == null ? 8 : Number(params.n);
      return await cmd_qc(params.name || "", qn, !!params.debug);
    }
    case "sure.gen":
      return await cmd_gen(params.name ? String(params.name) : "");
    case "sure.dependencies":
      return scan_dependencies(params.name ? String(params.name) : "");
    case "sure.patch":
    case "sure.edit":
      if (params.file && params.text != null) {
        fs.writeFileSync(params.file, params.text);
        return {ok: true, file: params.file};
      }
      return {ok: false, error: "need file and text"};
    case "sure.compile":
      if (!params.name) return {ok: false, error: "need name"};
      var target = params.target || "fmc";
      if (target === "fmc" && checker("api.io.term_to_core")) {
        var fmc = await kind.run(checker("api.io.term_to_core")(params.name));
        try { fmc = fmc_to_js.shake_code(fmc, params.name); } catch (e) {}
        return {ok: true, target: "fmc", code: fmc};
      }
      return {ok: false, error: "unsupported target"};
    case "sure.debug": {
      if (params.code == null && !params.name) {
        return {ok: false, error: "need name or code", remaining: 0, traces: [], relevant: []};
      }
      var dbg_report = params.code != null
        ? await agent_check_code(String(params.code))
        : await agent_check_name(String(params.name || ""));
      var dbg_traced = await goal_trace(params.name || "", dbg_report);
      var dbg_lv = sure_debug_level_read(params.level || "trace") || "trace";
      var dbg_opt = params.opt == null ? "" : String(params.opt);
      var dbg_flags = sure_debug_flags_read(dbg_opt);
      var dbg_term = "";
      if (params.name) {
        try {
          var dbg_shown = await agent_show(String(params.name), !!params.norm);
          if (dbg_shown && dbg_shown.ok) dbg_term = dbg_shown.term || "";
        } catch (e) { dbg_term = ""; }
      }
      return {
        ok: !!dbg_traced.ok,
        level: dbg_lv,
        flags: sure_debug_flags_show(dbg_flags),
        name: dbg_traced.name || params.name || "",
        type: dbg_traced.type || "",
        term: dbg_term,
        remaining: dbg_traced.remaining,
        traces: dbg_traced.traces || [],
        relevant: dbg_traced.relevant || [],
        proof_obligations: dbg_traced.proof_obligations || [],
        diagnostics: dbg_traced.diagnostics || [],
      };
    }
    default:
      return {ok: false, error: "unknown method: " + method};
  }
}

async function cmd_agent_stdio() {
  var buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", function(chunk) { buf += chunk; maybe(); });
  process.stdin.on("end", function() { maybe(true); });
  async function maybe(force) {
    while (true) {
      var nl = buf.indexOf("\n");
      if (nl < 0) {
        if (force && buf.trim()) {
          var line = buf; buf = "";
          await handle_line(line);
        }
        return;
      }
      var line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.trim()) await handle_line(line);
    }
  }
  async function handle_line(line) {
    var req;
    try { req = JSON.parse(line); } catch (e) {
      process.stdout.write(JSON.stringify(json_err(null, -32700, "parse error")) + "\n");
      return;
    }
    if (req.method && req.method.indexOf("kind.") === 0) {
      req.method = "sure." + req.method.slice(5);
    }
    if (req.method && req.method.indexOf("sure.") !== 0 && req.method !== "initialize") {
      if (req.method !== "shutdown" && req.method !== "exit") {
        req.method = "sure." + req.method.replace(/^sure\./, "");
      }
    }
    try {
      if (req.method === "shutdown" || req.method === "exit") {
        process.stdout.write(JSON.stringify(json_ok(req.id, {ok: true})) + "\n");
        if (req.method === "exit") process.exit(0);
        return;
      }
      var result = await agent_dispatch(req.method, req.params || {});
      process.stdout.write(JSON.stringify(json_ok(req.id, result)) + "\n");
    } catch (e) {
      process.stdout.write(JSON.stringify(json_err(req.id, -32603, String(e && e.message || e))) + "\n");
    }
  }
}

async function cmd_agent_client(method, arg) {
  if (!method) {
    console.error("sure agent --client <method> [name|code]");
    process.exit(1);
  }
  if (method.indexOf("kind.") === 0) method = "sure." + method.slice(5);
  if (method.indexOf("sure.") !== 0) method = "sure." + method;
  var params = {};
  if (arg && arg.indexOf("\n") >= 0) params.code = arg;
  else if (arg && /\s/.test(arg) && /:/.test(arg)) params.code = arg;
  else if (arg) params.name = arg;
  if (method === "sure.symbols") params.prefix = arg || "";
  if (method === "sure.repair" || method === "sure.fill") {
    var split = arg.indexOf("|||");
    if (split >= 0) {
      params.code = arg.slice(0, split);
      params.term = arg.slice(split + 3);
    } else {
      params.term = arg;
    }
  }
  var result = await agent_dispatch(method, params);
  console.log(JSON.stringify(result, null, 2));
  if (result && result.ok === false) process.exit(1);
}

  return {
    capture_kind: capture_kind,
    parse_json_loose: parse_json_loose,
    agent_check_name: agent_check_name,
    agent_check_code: agent_check_code,
    agent_show: agent_show,
    agent_type_names: agent_type_names,
    agent_relevant: agent_relevant,
    filter_goals: filter_goals,
    hole_count_js: hole_count_js,
    fill_src: fill_src,
    extract_goal: extract_goal,
    format_goal_line: format_goal_line,
    goal_trace: goal_trace,
    agent_dispatch: agent_dispatch,
    cmd_agent_stdio: cmd_agent_stdio,
    cmd_agent_client: cmd_agent_client
  };
};
