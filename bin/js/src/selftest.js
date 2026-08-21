"use strict";
// Bounded CLI self-test (prove edges + host/compiler checks).
module.exports = function make(deps) {
  var ORIG_CWD = deps.ORIG_CWD;
  var get_ORIG_CWD = deps.get_ORIG_CWD || function() { return ORIG_CWD; };
  var set_ORIG_CWD = deps.set_ORIG_CWD || function(v) { ORIG_CWD = v; };
  var SURE_DOM_EVENTS = deps.SURE_DOM_EVENTS;
  var agent_check_code = deps.agent_check_code;
  var agent_dispatch = deps.agent_dispatch;
  var bench_stats = deps.bench_stats;
  var build_is_fresh = deps.build_is_fresh;
  var bun_available = deps.bun_available;
  var check_project_modules = deps.check_project_modules;
  var cmd_gen = deps.cmd_gen;
  var cmd_qc = deps.cmd_qc;
  var compile_term_js = deps.compile_term_js;
  var compiler = deps.compiler;
  var compiler_input_hash = deps.compiler_input_hash;
  var dep_tree_hash = deps.dep_tree_hash;
  var emit_is_fresh = deps.emit_is_fresh;
  var fill_src = deps.fill_src;
  var format_goal_line = deps.format_goal_line;
  var write_manifest = deps.write_manifest;
  var sure_dom_mount_src = deps.sure_dom_mount_src;
  var man_src_dirs = deps.man_src_dirs;
  var man_direct = deps.man_direct;
  var formcore_path = deps.formcore_path;
  var fs = deps.fs;
  var github_url_of = deps.github_url_of;
  var hole_count_js = deps.hole_count_js;
  var kind = deps.kind;
  var line_col_offset = deps.line_col_offset;
  var lsp_apply_changes = deps.lsp_apply_changes;
  var lsp_ext = deps.lsp_ext;
  var lsp_frame = deps.lsp_frame;
  var lsp_handle = deps.lsp_handle;
  var lsp_keyword = deps.lsp_keyword;
  var lsp_method_read = deps.lsp_method_read;
  var lsp_new_state = deps.lsp_new_state;
  var lsp_parse_frames = deps.lsp_parse_frames;
  var lsp_uri_ok = deps.lsp_uri_ok;
  var man_kind = deps.man_kind;
  var mod_allows = deps.mod_allows;
  var mod_expand_source = deps.mod_expand_source;
  var mod_imports_allow = deps.mod_imports_allow;
  var mod_name_ok = deps.mod_name_ok;
  var mod_pkg_ok = deps.mod_pkg_ok;
  var mod_read_import = deps.mod_read_import;
  var mod_read_module = deps.mod_read_module;
  var parse_debug_arg = deps.parse_debug_arg;
  var parse_qc_binders = deps.parse_qc_binders;
  var parse_qc_sort = deps.parse_qc_sort;
  var qc_shrink_vals = deps.qc_shrink_vals;
  var qc_val_nat = deps.qc_val_nat;
  var qc_format_val = deps.qc_format_val;
  var qc_gen = deps.qc_gen;
  var qc_shrink_candidates = deps.qc_shrink_candidates;
  var path = deps.path;
  var pkg_mod_name = deps.pkg_mod_name;
  var project_src_hash = deps.project_src_hash;
  var prove_one = deps.prove_one;
  var prove_result = deps.prove_result;
  var read_build_stamp = deps.read_build_stamp;
  var read_manifest = deps.read_manifest;
  var repl_need_name = deps.repl_need_name;
  var repl_parse = deps.repl_parse;
  var run_spawn = deps.run_spawn;
  var scan_dependencies = deps.scan_dependencies;
  var scan_docs = deps.scan_docs;
  var scan_graph = deps.scan_graph;
  var scan_impact = deps.scan_impact;
  var scan_project_holes = deps.scan_project_holes;
  var scan_theorems = deps.scan_theorems;
  var shown_has_hole = deps.shown_has_hole;
  var src_explicit_hole = deps.src_explicit_hole;
  var sure_debug_emit = deps.sure_debug_emit;
  var sure_debug_flags_any = deps.sure_debug_flags_any;
  var sure_debug_flags_host = deps.sure_debug_flags_host;
  var sure_debug_flags_read = deps.sure_debug_flags_read;
  var sure_debug_flags_show = deps.sure_debug_flags_show;
  var sure_debug_host_ask = deps.sure_debug_host_ask;
  var sure_debug_host_line = deps.sure_debug_host_line;
  var sure_debug_level_read = deps.sure_debug_level_read;
  var sure_debug_open = deps.sure_debug_open;
  var sure_debug_redact = deps.sure_debug_redact;
  var sure_emit_file = deps.sure_emit_file;
  var sure_emit_html_file = deps.sure_emit_html_file;
  var sure_help_topic = deps.sure_help_topic;
  var sure_html_wrap = deps.sure_html_wrap;
  var sure_run_js = deps.sure_run_js;
  var sure_runtime_pick = deps.sure_runtime_pick;
  var when_expand_source = deps.when_expand_source;
  var word_at = deps.word_at;
  var write_build_stamp = deps.write_build_stamp;
  var write_emit_js = deps.write_emit_js;

async function run_prove_edges() {
  var failed = 0;
  async function want(ok, spec, label, extra) {
    extra = extra || {};
    var r = await prove_one(spec);
    var pass = !!r.ok === !!ok;
    if (pass && extra.proved === true && !r.proved) pass = false;
    if (pass && extra.proved === false && r.proved) pass = false;
    if (pass && extra.obligation && r.proof_obligations.length === 0) pass = false;
    if (!pass) {
      console.log("fail " + label + " ok=" + r.ok + " proved=" + r.proved);
      failed += 1;
    } else {
      console.log("ok   " + label);
    }
  }
  await want(true, "Edge.add0: Nat.add(0, 0) == 0\n  refl", "zero+zero", {proved: true});
  await want(true, "Edge.add0r: Nat.add(0, 7) == 7\n  refl", "zero+n", {proved: true});
  await want(true, "Edge.nil: List.length<Nat>([]) == 0\n  refl", "empty list", {proved: true});
  await want(true, "Edge.email_empty: Email.raw_of(\"\") == \"\"\n  refl", "email empty rejected", {proved: true});
  await want(false, "Edge.lie: Nat.add(0, 0) == 1\n  refl", "false equality", {obligation: true});
  await want(false, "Edge.lie2: Nat.add(2, 2) == 5\n  refl", "2+2!=5", {obligation: true});
  await want(false, "Edge.hole: Nat.add(2, 2) == 5\n  _", "hole does not prove false");
  await want(false, "Edge.admit: Nat.add(2, 2) == 5\n  admit", "admit is not a proof");
  await want(false, "Does.Not.Exist", "missing term");
  await want(false, "", "empty name");
  await want(true, "Unit", "Unit is checked not proved", {proved: false});
  await want(true, "Nat.add", "Nat.add is checked not proved", {proved: false});
  await want(true, "Example.Spec.edge.add0", "named zero lemma", {proved: true});
  await want(true, "Example.Spec.edge.email_empty", "named email reject", {proved: true});
  await want(false, "Example.Spec.edge.does_not", "missing edge lemma");
  var agent_bad = await agent_dispatch("kind.prove", {
    code: "Bad: Nat.add(1, 0) == 2\n  refl"
  });
  if (!agent_bad || agent_bad.ok || !agent_bad.proof_obligations || !agent_bad.proof_obligations.length) {
    console.log("fail agent prove false spec");
    failed += 1;
  } else {
    console.log("ok   agent prove false spec");
  }
  var agent_good = await agent_dispatch("kind.prove", {name: "Example.Spec.edge.add0"});
  if (!agent_good || !agent_good.ok || !agent_good.proved) {
    console.log("fail agent prove named");
    failed += 1;
  } else {
    console.log("ok   agent prove named");
  }
  var agent_sure = await agent_dispatch("sure.prove", {name: "Example.Spec.edge.add0"});
  if (!agent_sure || !agent_sure.ok || !agent_sure.proved) {
    console.log("fail agent sure.prove alias");
    failed += 1;
  } else {
    console.log("ok   agent sure.prove alias");
  }
  if (shown_has_hole("_") !== true || shown_has_hole("?admit") !== true || shown_has_hole("Equal.refl(Nat,4)") !== false) {
    console.log("fail shown_has_hole"); failed += 1;
  } else console.log("ok   shown_has_hole");
  if (!src_explicit_hole("Bad: Nat.add(2,2) == 5\n  _") || src_explicit_hole("Ok: Nat.add(2,2) == 4\n  refl")) {
    console.log("fail src_explicit_hole"); failed += 1;
  } else console.log("ok   src_explicit_hole");
  if (hole_count_js("") !== 0 || hole_count_js("no hole") !== 0) {
    console.log("fail hole_count empty/none"); failed += 1;
  } else console.log("ok   hole_count empty/none");
  if (hole_count_js("?implement") !== 1) {
    console.log("fail hole_count one"); failed += 1;
  } else console.log("ok   hole_count one");
  if (hole_count_js("a?implementb?implementc") !== 2) {
    console.log("fail hole_count two"); failed += 1;
  } else console.log("ok   hole_count two");
  var fnone = fill_src("no hole", "0", false);
  if (fnone.ok) { console.log("fail fill no hole"); failed += 1; }
  else console.log("ok   fill no hole");
  var fempty = fill_src("", "0", false);
  if (fempty.ok) { console.log("fail fill empty src"); failed += 1; }
  else console.log("ok   fill empty src");
  var ftwo = fill_src("a?implementb?implementc", "0", false);
  if (!ftwo.ok || ftwo.code !== "a0b0c" || ftwo.remaining !== 0) {
    console.log("fail fill two " + JSON.stringify(ftwo)); failed += 1;
  } else console.log("ok   fill two");
  var ffirst = fill_src("x?implementy?implementz", "0", true);
  if (!ffirst.ok || ffirst.code !== "x0y?implementz" || ffirst.remaining !== 1) {
    console.log("fail fill first " + JSON.stringify(ffirst)); failed += 1;
  } else console.log("ok   fill first");
  var femptyt = fill_src("?implement", "", false);
  if (!femptyt.ok || femptyt.code !== "") {
    console.log("fail fill empty term"); failed += 1;
  } else console.log("ok   fill empty term");
  var tr_empty = format_goal_line({name: "", type: "", context: ""});
  if (tr_empty !== "Goal ?:\nWith type: \nWith context:\n") {
    console.log("fail trace empty format"); failed += 1;
  } else console.log("ok   trace empty format");
  var tr_nat = format_goal_line({name: "implement", type: "Nat", context: ""});
  if (tr_nat !== "Goal ?implement:\nWith type: Nat\nWith context:\n") {
    console.log("fail trace nat format"); failed += 1;
  } else console.log("ok   trace nat format");
  var g_empty = await agent_dispatch("kind.trace", {});
  if (g_empty && g_empty.ok) { console.log("fail trace empty name"); failed += 1; }
  else console.log("ok   trace empty name");
  var g_miss = await agent_dispatch("kind.trace", {name: "Sure.NoSuch.Name.ZZ"});
  if (g_miss && g_miss.ok) { console.log("fail trace missing"); failed += 1; }
  else console.log("ok   trace missing");
  var g_ok = await agent_dispatch("kind.trace", {name: "Example.Spec.add2"});
  if (!g_ok || !g_ok.ok || g_ok.remaining !== 0) {
    console.log("fail trace proved spec"); failed += 1;
  } else console.log("ok   trace proved spec");
  var hole_code = "HoleEx: Nat\n  ?implement\n";
  var g_hole = await agent_dispatch("kind.trace", {code: hole_code});
  if (!g_hole || g_hole.ok || g_hole.remaining < 1) {
    console.log("fail trace implement remaining=" + (g_hole && g_hole.remaining)); failed += 1;
  } else console.log("ok   trace implement");
  var fill_need = await agent_dispatch("kind.fill", {term: "0"});
  if (fill_need && fill_need.ok) { console.log("fail fill need code"); failed += 1; }
  else console.log("ok   fill need code");
  var fill_nh = await agent_dispatch("kind.fill", {code: "n: Nat\n  0\n", term: "0"});
  if (fill_nh && fill_nh.ok) { console.log("fail fill hole not found"); failed += 1; }
  else console.log("ok   fill hole not found");
  var fill_ok = await agent_dispatch("kind.fill", {code: hole_code, term: "0"});
  if (!fill_ok || !fill_ok.ok || fill_ok.remaining !== 0 || fill_ok.code.indexOf("?implement") >= 0) {
    console.log("fail fill implement " + JSON.stringify(fill_ok && {ok: fill_ok.ok, remaining: fill_ok.remaining, code: fill_ok.code})); failed += 1;
  } else console.log("ok   fill implement");
  var two_code = "TwoH: Nat\n  Nat.add(?implement, ?implement)\n";
  var fill_keep = await agent_dispatch("kind.fill", {code: two_code, term: "0", first: true});
  if (!fill_keep || (fill_keep.code.match(/\?implement/g) || []).length !== 1) {
    console.log("fail fill first remaining " + JSON.stringify(fill_keep && {ok: fill_keep.ok, remaining: fill_keep.remaining, code: fill_keep.code})); failed += 1;
  } else console.log("ok   fill first remaining");
  var repair_empty = await agent_dispatch("kind.repair", {code: hole_code, term: ""});
  if (repair_empty && repair_empty.ok) { console.log("fail repair empty term"); failed += 1; }
  else console.log("ok   repair empty term");
  var sure_tr = await agent_dispatch("sure.trace", {name: "Example.Spec.add2"});
  if (!sure_tr || !sure_tr.ok || sure_tr.remaining !== 0) {
    console.log("fail sure.trace alias"); failed += 1;
  } else console.log("ok   sure.trace alias");
  var dbg_empty = await agent_dispatch("kind.debug", {});
  if (dbg_empty && dbg_empty.ok) { console.log("fail debug empty name"); failed += 1; }
  else console.log("ok   debug empty name");
  var dbg_miss = await agent_dispatch("kind.debug", {name: "Sure.NoSuch.Name.ZZ"});
  if (dbg_miss && dbg_miss.ok) { console.log("fail debug missing"); failed += 1; }
  else console.log("ok   debug missing");
  var dbg_ok = await agent_dispatch("kind.debug", {name: "Nat.add"});
  if (!dbg_ok || !dbg_ok.ok || dbg_ok.remaining !== 0 || !dbg_ok.type) {
    console.log("fail debug Nat.add"); failed += 1;
  } else console.log("ok   debug Nat.add");
  var dbg_sure = await agent_dispatch("sure.debug", {name: "Nat.add", opt: "term,holes"});
  if (!dbg_sure || !dbg_sure.ok || dbg_sure.flags !== "term holes") {
    console.log("fail sure.debug alias flags=" + (dbg_sure && dbg_sure.flags)); failed += 1;
  } else console.log("ok   sure.debug alias");
  var dbg_junk_lv = sure_debug_level_read("loud");
  if (dbg_junk_lv !== "") { console.log("fail debug junk level"); failed += 1; }
  else console.log("ok   debug junk level");
  var sure_fl = await agent_dispatch("sure.fill", {code: hole_code, term: "0"});
  if (!sure_fl || !sure_fl.ok || sure_fl.remaining !== 0) {
    console.log("fail sure.fill alias"); failed += 1;
  } else console.log("ok   sure.fill alias");
  var qc_empty = await cmd_qc("Nat.add.comm", 0, false);
  if (qc_empty.ok) { console.log("fail qc n=0"); failed += 1; }
  else console.log("ok   qc n=0");
  var qc_miss = await cmd_qc("Sure.NoSuch.Law", 2, false);
  if (qc_miss.ok) { console.log("fail qc missing law"); failed += 1; }
  else console.log("ok   qc missing law");
  var qc_ok = await cmd_qc("Nat.add.comm", 3, false);
  if (!qc_ok.ok || !qc_ok.passed) { console.log("fail qc Nat.add.comm"); failed += 1; }
  else console.log("ok   qc Nat.add.comm");
  var qc_false = await cmd_qc("Nat.add", 2, false);
  if (qc_false.ok) { console.log("fail qc non-lemma"); failed += 1; }
  else console.log("ok   qc non-lemma");
  var qc_list = await cmd_qc("Sure.Qc.List.concat_nil", 2, false);
  if (!qc_list.ok || !qc_list.passed) { console.log("fail qc list concat_nil"); failed += 1; }
  else console.log("ok   qc list concat_nil");
  var qc_str = await cmd_qc("Sure.Qc.String.take_nil", 2, false);
  if (!qc_str.ok || !qc_str.passed) { console.log("fail qc string take_nil"); failed += 1; }
  else console.log("ok   qc string take_nil");
  var qc_bool = await cmd_qc("Sure.Qc.Bool.not_inv", 2, false);
  if (!qc_bool.ok || !qc_bool.passed) { console.log("fail qc bool not_inv"); failed += 1; }
  else console.log("ok   qc bool not_inv");
  var qc_pipe = await cmd_qc("Sure.Pipe.map_sing", 2, false);
  if (!qc_pipe.ok || !qc_pipe.passed) { console.log("fail qc pipe map_sing"); failed += 1; }
  else console.log("ok   qc pipe map_sing");
  var ge = await cmd_gen("");
  if (ge.ok) { console.log("fail gen empty"); failed += 1; }
  else console.log("ok   gen empty");
  var gm = await cmd_gen("Sure.NoSuch.Gen");
  if (gm.ok) { console.log("fail gen missing"); failed += 1; }
  else console.log("ok   gen missing");
  var gd = await cmd_gen("JSON.dec.bool");
  var gproofs = (gd.tests || []).filter(function(t) { return t.kind === "proof"; });
  var gapps = (gd.tests || []).filter(function(t) { return t.kind === "app"; });
  if (!gd.ok || gapps.length < 4 || gproofs.length < 1) {
    console.log("fail gen decoder " + JSON.stringify(gd && {ok: gd.ok, tests: gd.tests})); failed += 1;
  } else console.log("ok   gen decoder");
  var gq = await cmd_gen("Nat.add.comm");
  var gqc = (gq.tests || []).filter(function(t) { return t.kind === "qc"; });
  if (!gq.ok || !gqc.length) { console.log("fail gen law"); failed += 1; }
  else console.log("ok   gen law");
  var gb = await cmd_gen("Bool.not");
  var gbproofs = (gb.tests || []).filter(function(t) { return t.kind === "proof"; });
  var gbapps = (gb.tests || []).filter(function(t) { return t.kind === "app"; });
  if (!gb.ok || gbapps.length < 2 || gbproofs.length < 2) {
    console.log("fail gen bool " + JSON.stringify(gb && {ok: gb.ok, type: gb.type, tests: gb.tests})); failed += 1;
  } else console.log("ok   gen bool");
  var sure_gn = await agent_dispatch("sure.gen", {name: "Unit"});
  if (!sure_gn || !sure_gn.ok) { console.log("fail sure.gen alias"); failed += 1; }
  else console.log("ok   sure.gen alias");
  await want(false, "NoEmpty: Empty\n  unit", "empty has no value");
  await want(false, "BadCase(b: Bool): Nat\n  case b {\n    true: 1\n  }", "incomplete case");
  await want(true, "OkCase(b: Bool): Nat\n  case b {\n    true: 1\n    false: 0\n  }", "exhaustive case");
  var qc_list_b = parse_qc_binders("(xs: List<Nat>) -> xs == xs");
  if (!qc_list_b.binders.length || qc_list_b.binders[0].t !== "list" || qc_list_b.binders[0].of.t !== "nat") {
    console.log("fail qc parse List<Nat>"); failed += 1;
  } else console.log("ok   qc parse List<Nat>");
  var qc_pair_b = parse_qc_binders("(p: Pair<Bool, String>) -> p == p");
  if (!qc_pair_b.binders.length || qc_pair_b.binders[0].t !== "pair") {
    console.log("fail qc parse Pair"); failed += 1;
  } else console.log("ok   qc parse Pair");
  var qc_maybe_b = parse_qc_sort("Maybe<Either<Nat, Bool>>");
  if (!qc_maybe_b || qc_maybe_b.t !== "maybe" || qc_maybe_b.of.t !== "either") {
    console.log("fail qc parse nested"); failed += 1;
  } else console.log("ok   qc parse nested");
  var shs = qc_shrink_vals([qc_val_nat(8)]).map(function(a) { return qc_format_val(a[0]); });
  if (shs.indexOf("0") < 0 || shs.indexOf("4") < 0) {
    console.log("fail shrink val 8 " + shs); failed += 1;
  } else console.log("ok   shrink val 8");
  if (qc_format_val(qc_gen(parse_qc_sort("List<Nat>"), 0)) !== "[]") {
    console.log("fail qc gen list empty"); failed += 1;
  } else console.log("ok   qc gen list empty");
  var tag_div = await prove_one("Html.Tag.show.div");
  if (!tag_div.ok || !tag_div.proved) { console.log("fail prove tag div"); failed += 1; }
  else console.log("ok   prove tag div");
  var ev_click = await prove_one("Html.Event.show.click");
  if (!ev_click.ok || !ev_click.proved) { console.log("fail prove event click"); failed += 1; }
  else console.log("ok   prove event click");
  var sh0 = qc_shrink_candidates([0]);
  if (sh0.length) { console.log("fail shrink zero"); failed += 1; }
  else console.log("ok   shrink zero");
  var sh8 = qc_shrink_candidates([8]).map(function(a) { return a.join(","); });
  if (sh8.indexOf("0") < 0 || sh8.indexOf("4") < 0 || sh8.indexOf("7") < 0) {
    console.log("fail shrink 8 " + sh8);
    failed += 1;
  } else console.log("ok   shrink 8");
  async function lie_at(n) {
    var code = "QcLie: Nat.add(" + n + ", 0) == 1\n  refl\n";
    var r = prove_result("QcLie", await agent_check_code(code));
    return !!(r.ok && r.proved);
  }
  if (await lie_at(1)) { /* 1+0==1 holds */ }
  else { console.log("fail lie_at 1 should prove"); failed += 1; }
  if (await lie_at(0) || await lie_at(8)) {
    console.log("fail lie_at 0/8 should not prove");
    failed += 1;
  } else console.log("ok   lie counterexample");
  var cur = [8];
  for (var si = 0; si < 8; si++) {
    var cands = qc_shrink_candidates(cur);
    var hit = null;
    for (var ci = 0; ci < cands.length; ci++) {
      if (!(await lie_at(cands[ci][0]))) { hit = cands[ci]; break; }
    }
    if (!hit) break;
    cur = hit;
  }
  if (cur[0] !== 0) { console.log("fail shrink lie to 0 got " + cur); failed += 1; }
  else console.log("ok   shrink lie to 0");
  var no_impact = scan_impact("");
  if (no_impact.ok) {
    console.log("fail impact empty name");
    failed += 1;
  } else {
    console.log("ok   impact empty name");
  }
  var miss_impact = scan_impact("Sure.NoSuch.Name.ZZ");
  if (!miss_impact.ok || miss_impact.proofs.length || miss_impact.callers.length) {
    console.log("fail impact missing");
    failed += 1;
  } else {
    console.log("ok   impact missing");
  }
  var email_imp = scan_impact("Email.from_string");
  var email_proofs = (email_imp.proofs || []).map(function(p) { return p.name; });
  if (!email_imp.ok || email_proofs.indexOf("Email.from_string.empty") < 0 || email_proofs.indexOf("Email.from_string.no") < 0) {
    console.log("fail impact Email.from_string proofs");
    failed += 1;
  } else {
    console.log("ok   impact Email.from_string proofs");
  }
  var none_th = scan_theorems("Sure.NoSuch.Name.ZZ");
  if (!none_th.ok || none_th.theorems.length) {
    console.log("fail theorems missing");
    failed += 1;
  } else {
    console.log("ok   theorems missing");
  }
  var add_th = scan_theorems("Nat.add");
  var add_names = (add_th.theorems || []).map(function(t) { return t.name; });
  if (!add_th.ok || add_names.indexOf("Example.Spec.add2") < 0 || add_names.indexOf("Example.Spec.edge.add0") < 0) {
    console.log("fail theorems Nat.add");
    failed += 1;
  } else {
    console.log("ok   theorems Nat.add");
  }
  var no_holes = scan_project_holes();
  var impl_hit = (no_holes.holes || []).filter(function(h) { return h.name === "Example.Spec.add2"; });
  if (!no_holes.ok || impl_hit.length) {
    console.log("fail holes on proved spec");
    failed += 1;
  } else {
    console.log("ok   holes on proved spec");
  }
  var no_docs = scan_docs("");
  if (no_docs.ok) {
    console.log("fail docs empty name");
    failed += 1;
  } else {
    console.log("ok   docs empty name");
  }
  var miss_docs = scan_docs("Sure.NoSuch.Name.ZZ");
  if (miss_docs.ok || (miss_docs.entries && miss_docs.entries.length)) {
    console.log("fail docs missing");
    failed += 1;
  } else {
    console.log("ok   docs missing");
  }
  var doc_is = scan_docs("Sure.Doc.is_comment");
  var is_names = (doc_is.entries || []).map(function(e) { return e.name; });
  var yes = (doc_is.entries || []).filter(function(e) { return e.name === "Sure.Doc.is_comment.yes"; })[0];
  if (!doc_is.ok || is_names.indexOf("Sure.Doc.is_comment.yes") < 0 || is_names.indexOf("Sure.Doc.is_comment.no") < 0) {
    console.log("fail docs Sure.Doc.is_comment");
    failed += 1;
  } else if (yes && yes.doc) {
    console.log("fail docs theorem should have no attached file-header");
    failed += 1;
  } else {
    console.log("ok   docs Sure.Doc.is_comment");
  }
  var doc_lead = scan_docs("Sure.Doc.leading.after");
  var after = (doc_lead.entries || [])[0];
  if (!doc_lead.ok || !after || after.doc.indexOf("A comment after a definition is not a leading doc.") < 0 || !after.theorem) {
    console.log("fail docs leading.after");
    failed += 1;
  } else {
    console.log("ok   docs leading.after");
  }
  var agent_docs = await agent_dispatch("kind.docs", {name: "Sure.Doc.body.not"});
  if (!agent_docs || !agent_docs.ok || !agent_docs.entries || !agent_docs.entries.length) {
    console.log("fail agent docs");
    failed += 1;
  } else {
    console.log("ok   agent docs");
  }
  var no_deps = scan_dependencies("");
  if (no_deps.ok) {
    console.log("fail deps empty name");
    failed += 1;
  } else {
    console.log("ok   deps empty name");
  }
  var miss_deps = scan_dependencies("Sure.NoSuch.Name.ZZ");
  if (miss_deps.ok || (miss_deps.dependencies && miss_deps.dependencies.length)) {
    console.log("fail deps missing");
    failed += 1;
  } else {
    console.log("ok   deps missing");
  }
  var email_deps = scan_dependencies("Email.from_string");
  var ed = email_deps.dependencies || [];
  if (!email_deps.ok || ed.indexOf("Outcome") < 0 || ed.indexOf("Email") < 0) {
    console.log("fail deps Email.from_string");
    failed += 1;
  } else if (ed.indexOf("Email.from_string") >= 0) {
    console.log("fail deps includes self");
    failed += 1;
  } else {
    console.log("ok   deps Email.from_string");
  }
  var no_g = scan_graph("");
  if (no_g.ok) {
    console.log("fail graph empty name");
    failed += 1;
  } else {
    console.log("ok   graph empty name");
  }
  var miss_g = scan_graph("Sure.NoSuch.Name.ZZ");
  if (miss_g.ok || (miss_g.nodes && miss_g.nodes.length) || (miss_g.edges && miss_g.edges.length)) {
    console.log("fail graph missing");
    failed += 1;
  } else {
    console.log("ok   graph missing");
  }
  var z = scan_graph("Email.from_string", 0);
  if (!z.ok || z.nodes.length !== 1 || z.edges.length !== 0 || z.nodes[0].name !== "Email.from_string") {
    console.log("fail graph depth 0");
    failed += 1;
  } else {
    console.log("ok   graph depth 0");
  }
  var g = scan_graph("Email.from_string", 1);
  var gnodes = (g.nodes || []).map(function(n) { return n.name; });
  var gto = (g.edges || []).map(function(e) { return e.to; });
  var gfrom = (g.edges || []).map(function(e) { return e.from; });
  if (!g.ok || gnodes.indexOf("Email.from_string") < 0 || gto.indexOf("Outcome") < 0) {
    console.log("fail graph Email.from_string");
    failed += 1;
  } else if (gfrom.indexOf("Email.from_string") < 0) {
    console.log("fail graph missing root edges");
    failed += 1;
  } else {
    console.log("ok   graph Email.from_string");
  }
  var tmp = path.join(require("os").tmpdir(), "sure-build-edge-" + process.pid);
  try {
    try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (eRm) {}
    fs.mkdirSync(path.join(tmp, "src"), {recursive: true});
    write_manifest(path.join(tmp, "sure.json"), {
      name: "edge", version: "0.1.0", src: "src", theorems: ["Spec.add2"], dependencies: {}
    });
    fs.writeFileSync(path.join(tmp, "src", "Main.sure"), "Main: Nat\n  0\n");
    fs.writeFileSync(path.join(tmp, "src", "Spec.sure"), "Spec.add2: Nat.add(2, 2) == 4\n  refl\n");
    var man = path.join(tmp, "sure.json");
    var h1 = project_src_hash(man);
    var h2 = project_src_hash(man);
    if (h1 !== h2) { console.log("fail src hash unstable"); failed += 1; }
    else console.log("ok   src hash stable");
    fs.appendFileSync(path.join(tmp, "src", "Spec.sure"), "\n");
    var h3 = project_src_hash(man);
    if (h3 === h1) { console.log("fail src hash not dirty"); failed += 1; }
    else console.log("ok   src hash dirty");
    fs.mkdirSync(path.join(tmp, "extra"), {recursive: true});
    fs.writeFileSync(path.join(tmp, "sure.lock"), JSON.stringify({pin: {rev: "aaa"}}, null, 2));
    var hLock = project_src_hash(man);
    if (hLock === h3) { console.log("fail src hash ignores lock"); failed += 1; }
    else console.log("ok   src hash lock");
    var manObj = read_manifest(man);
    manObj["source-directories"] = ["src", "extra"];
    write_manifest(man, manObj);
    fs.writeFileSync(path.join(tmp, "extra", "Z.sure"), "Z: Nat\n  0\n");
    var hExtra = project_src_hash(man);
    if (hExtra === hLock) { console.log("fail src hash ignores extra dir"); failed += 1; }
    else console.log("ok   src hash extra dir");
    if (!compiler_input_hash() || compiler_input_hash() !== compiler_input_hash()) {
      console.log("fail compiler hash"); failed += 1;
    } else console.log("ok   compiler hash");
    write_build_stamp(tmp, {ok: true, term: "Main", src_hash: h1});
    if (!build_is_fresh(read_build_stamp(tmp), h1, "Main")) { console.log("fail stamp fresh"); failed += 1; }
    else console.log("ok   stamp fresh");
    if (build_is_fresh(read_build_stamp(tmp), h3, "Main")) { console.log("fail stamp stale"); failed += 1; }
    else console.log("ok   stamp stale");
    if (build_is_fresh({ok: false, term: "Main", src_hash: h1}, h1, "Main")) {
      console.log("fail failed stamp treated fresh"); failed += 1;
    } else console.log("ok   failed stamp dirty");
    if (build_is_fresh(null, h1, "Main")) { console.log("fail missing stamp fresh"); failed += 1; }
    else console.log("ok   missing stamp dirty");
    if (sure_emit_file("") !== "" || sure_emit_file("Main") !== "dist/Main.js" || sure_emit_file("Foo.Bar") !== "dist/Foo.Bar.js") {
      console.log("fail emit file name"); failed += 1;
    } else console.log("ok   emit file name");
    var no_js = write_emit_js(tmp, "", "module.exports={}");
    if (no_js.ok) { console.log("fail emit empty name"); failed += 1; }
    else console.log("ok   emit empty name");
    var empty_js = write_emit_js(tmp, "Main", "");
    if (empty_js.ok) { console.log("fail emit empty js"); failed += 1; }
    else console.log("ok   emit empty js");
    write_build_stamp(tmp, {ok: true, term: "Main", src_hash: h3});
    if (emit_is_fresh(read_build_stamp(tmp), h3, "Main", tmp)) {
      console.log("fail emit fresh without dist"); failed += 1;
    } else console.log("ok   emit fresh without dist");
    var wjs = write_emit_js(tmp, "Main", "module.exports={ok:1};");
    if (!wjs.ok || !fs.existsSync(wjs.file) || fs.readFileSync(wjs.file, "utf8").indexOf("module.exports") < 0) {
      console.log("fail emit write"); failed += 1;
    } else console.log("ok   emit write");
    if (!emit_is_fresh(read_build_stamp(tmp), h3, "Main", tmp)) {
      console.log("fail emit fresh with dist"); failed += 1;
    } else console.log("ok   emit fresh with dist");
  } catch (e) {
    console.log("fail build stamp edges " + e);
    failed += 1;
  }
  try {
    console.log("compile js add2  [" + new Date().toISOString() + "]");
    var js_add = await compile_term_js("Example.Spec.add2");
    if (!js_add || js_add.indexOf("module.exports") < 0) {
      console.log("fail compile js add2"); failed += 1;
    } else console.log("ok   compile js add2");
  } catch (e) {
    console.log("fail compile js add2 " + e); failed += 1;
  }
  try {
    console.log("compile js Main  [" + new Date().toISOString() + "]");
    var js_main = await compile_term_js("Main");
    if (!js_main || js_main.indexOf("put_string") < 0 || js_main.indexOf("run_io") < 0) {
      console.log("fail shake keep print"); failed += 1;
    } else if (js_main.indexOf("host_http_listen") >= 0 || js_main.indexOf("db_connect") >= 0 || js_main.indexOf("host_worker_run") >= 0 || js_main.indexOf("init_udp") >= 0 || js_main.indexOf("word_to_u16") >= 0) {
      console.log("fail shake drop unused host"); failed += 1;
    } else console.log("ok   shake drop unused host");
  } catch (e) {
    console.log("fail shake Main " + e); failed += 1;
  }
  try {
    console.log("compile js Nat.add  [" + new Date().toISOString() + "]");
    var js_nat = await compile_term_js("Nat.add");
    if (!js_nat || js_nat.indexOf("Nat.add") < 0 || js_nat.indexOf("run_io") >= 0 || js_nat.indexOf("word_to_u16") >= 0) {
      console.log("fail shake Nat.add"); failed += 1;
    } else console.log("ok   shake Nat.add");
  } catch (e) {
    console.log("fail shake Nat.add " + e); failed += 1;
  }
  try {
    await compile_term_js("");
    console.log("fail compile empty"); failed += 1;
  } catch (e) {
    console.log("ok   compile empty term");
  }
  if (sure_html_wrap("", "module.exports={}") || sure_html_wrap("Main", "") || sure_html_wrap("../x", "module.exports={}") || sure_html_wrap("a/b", "js")) {
    console.log("fail html wrap empty"); failed += 1;
  } else console.log("ok   html wrap empty");
  var mount = sure_dom_mount_src();
  if (mount.indexOf("parentElement") < 0 || mount.indexOf("catch") < 0 || mount.indexOf("Sure.Ui.Client.new") < 0 || mount.indexOf("EventSource") < 0 || mount.indexOf("__sureMounted") < 0 || mount.indexOf("data-sure-scroll") < 0 || mount.indexOf("scrollTop") < 0 || mount.indexOf("FileReader") < 0 || mount.indexOf("POST") < 0 || mount.indexOf("same-origin") < 0 || mount.indexOf("applyPx") < 0 || mount.indexOf("minWidth") < 0) {
    console.log("fail mount harden"); failed += 1;
  } else console.log("ok   mount harden");
  if (sure_emit_file("../etc") !== "" || sure_emit_file("a/b") !== "" || sure_emit_html_file("..") !== "") {
    console.log("fail emit path traversal"); failed += 1;
  } else console.log("ok   emit path traversal");
  var page = sure_html_wrap("Main", "module.exports={};");
  if (!page || page.indexOf("sure-root") < 0 || page.indexOf("SureDom.mount") < 0 || page.indexOf("\"click\"") < 0 || page.indexOf("\"wheel\"") < 0 || page.indexOf("<style>") < 0 || page.indexOf("display:flex") < 0 || page.indexOf("cdn.tailwindcss.com") >= 0 || page.indexOf("daisyui") >= 0) {
    console.log("fail html wrap events"); failed += 1;
  } else console.log("ok   html wrap events");
  if (SURE_DOM_EVENTS.length !== 122) {
    console.log("fail event count " + SURE_DOM_EVENTS.length); failed += 1;
  } else console.log("ok   event count 122");
  try {
    console.log("compile js Html.Counter.client  [" + new Date().toISOString() + "]");
    await compile_term_js("Html.Counter.client");
    var t0 = Date.now();
    var js_c = await compile_term_js("Html.Counter.client");
    var dt = Date.now() - t0;
    console.log("emit Html.Counter.client " + dt + "ms");
    if (!js_c || js_c.indexOf("module.exports") < 0) {
      console.log("fail compile Html.Counter.client"); failed += 1;
    } else if (js_c.indexOf("Html$Event$read$") >= 0 || js_c.indexOf("Html$Tag$read$") >= 0) {
      console.log("fail Counter pulls event/tag tables"); failed += 1;
    } else if (dt > 15000) {
      console.log("fail Counter emit too slow " + dt + "ms"); failed += 1;
    } else console.log("ok   compile Html.Counter.client");
    var page_c = sure_html_wrap("Html.Counter.client", js_c);
    if (!page_c || page_c.indexOf("SureDom.mount") < 0 || page_c.indexOf("visibilitychange") < 0 || page_c.indexOf("\"click\"") < 0) {
      console.log("fail html counter page"); failed += 1;
    } else console.log("ok   html counter page");
  } catch (e) {
    console.log("fail Html.Counter.client " + e); failed += 1;
  }
  try {
    console.log("compile js Html.Echo.client  [" + new Date().toISOString() + "]");
    await compile_term_js("Html.Echo.client");
    var t1 = Date.now();
    var js_e = await compile_term_js("Html.Echo.client");
    var dt_e = Date.now() - t1;
    console.log("emit Html.Echo.client " + dt_e + "ms");
    if (!js_e || js_e.indexOf("module.exports") < 0) {
      console.log("fail compile Html.Echo.client"); failed += 1;
    } else if (js_e.indexOf("Html$Event$read$") >= 0 || js_e.indexOf("Html$Tag$read$") >= 0 || js_e.indexOf("Html$Tag$show$") >= 0 || js_e.indexOf("Html$Event$show$") >= 0) {
      console.log("fail Echo pulls tag/event tables"); failed += 1;
    } else if (dt_e > 15000) {
      console.log("fail Echo emit too slow " + dt_e + "ms"); failed += 1;
    } else console.log("ok   compile Html.Echo.client");
  } catch (e) {
    console.log("fail Html.Echo.client " + e); failed += 1;
  }
  if (sure_emit_html_file("") !== "" || sure_emit_html_file("Main") !== "dist/Main.html") {
    console.log("fail emit html file"); failed += 1;
  } else console.log("ok   emit html file");
  if (sure_help_topic("") !== "start" || sure_help_topic("start") !== "start" || sure_help_topic("help") !== "start" || sure_help_topic("json") !== "json" || sure_help_topic("ffi") !== "ffi" || sure_help_topic("gen") !== "gen" || sure_help_topic("pkg") !== "pkg" || sure_help_topic("bun") !== "bun" || sure_help_topic("debug") !== "debug" || sure_help_topic("lsp") !== "lsp" || sure_help_topic("pipe") !== "pipe" || sure_help_topic("time") !== "time" || sure_help_topic("cli") !== "cli" || sure_help_topic("log") !== "log" || sure_help_topic("repl") !== "repl" || sure_help_topic("test") !== "test" || sure_help_topic("cover") !== "cover" || sure_help_topic("env") !== "env" || sure_help_topic("cfg") !== "cfg" || sure_help_topic("ssr") !== "ssr" || sure_help_topic("ui") !== "ui" || sure_help_topic("web") !== "web" || sure_help_topic("xyz") !== null) {
    console.log("fail help topic"); failed += 1;
  } else console.log("ok   help topic");
  if (sure_debug_level_read("") !== "" || sure_debug_level_read("loud") !== "" || sure_debug_level_read("trace") !== "trace" || sure_debug_level_read("debug") !== "trace") {
    console.log("fail debug level"); failed += 1;
  } else console.log("ok   debug level");
  if (parse_debug_arg(undefined) !== "trace" || parse_debug_arg("info") !== "info" || parse_debug_arg("junk") !== null || parse_debug_arg("") !== null) {
    console.log("fail debug parse"); failed += 1;
  } else console.log("ok   debug parse");
  if (sure_debug_flags_host("") || sure_debug_flags_host("qc") || !sure_debug_flags_host("host") || !sure_debug_flags_host("all")) {
    console.log("fail debug flags"); failed += 1;
  } else console.log("ok   debug flags");
  var fterm = sure_debug_flags_read("term");
  var fmix = sure_debug_flags_read("qc,host");
  var fall = sure_debug_flags_read("all");
  var fjunk = sure_debug_flags_read("loud");
  var fupper = sure_debug_flags_read("HOST");
  if (!fterm.term || fterm.host || sure_debug_flags_show(fmix) !== "host qc" || sure_debug_flags_show(fall) !== "all" || sure_debug_flags_any(fjunk) || fupper.host) {
    console.log("fail debug flags channels"); failed += 1;
  } else console.log("ok   debug flags channels");
  if (sure_debug_open("", "host") !== true || sure_debug_open("qc", "host") !== false || sure_debug_open("qc", "qc") !== true || sure_debug_open("all", "term") !== true || sure_debug_open("loud", "holes") !== true) {
    console.log("fail debug open"); failed += 1;
  } else console.log("ok   debug open");
  if (sure_debug_emit("off", "info", "", "host") || !sure_debug_emit("info", "info", "", "host") || sure_debug_emit("info", "info", "qc", "host") || !sure_debug_emit("info", "info", "qc", "qc")) {
    console.log("fail debug emit"); failed += 1;
  } else console.log("ok   debug emit");
  if (sure_debug_host_ask("off", "", "db_get") || !sure_debug_host_ask("info", "", "db_get") || sure_debug_host_ask("info", "", "yield") || !sure_debug_host_ask("trace", "", "yield") || !sure_debug_host_ask("off", "host", "db_get") || sure_debug_host_ask("trace", "qc", "db_get")) {
    console.log("fail debug host_ask"); failed += 1;
  } else console.log("ok   debug host_ask");
  if (sure_debug_redact("") !== "" || sure_debug_redact("hi") !== "hi" || sure_debug_redact("hi\nthere") !== "hi..." || sure_debug_redact("a".repeat(81)) !== "a".repeat(80) + "...") {
    console.log("fail debug redact"); failed += 1;
  } else console.log("ok   debug redact");
  if (sure_debug_host_line("", "", "") !== "host ?  -> " || sure_debug_host_line("db_get", "id\nk", "0\nv") !== "host db_get id... -> 0...") {
    console.log("fail debug host_line"); failed += 1;
  } else console.log("ok   debug host_line");
  if (!repl_parse("").empty || repl_parse(":").ok || repl_parse(":xyz").ok || repl_parse("help").cmd !== "help" || repl_parse(":check Nat.add").arg !== "Nat.add" || repl_parse(":check").arg !== "") {
    console.log("fail repl parse"); failed += 1;
  } else console.log("ok   repl parse");
  if (!repl_need_name("check") || repl_need_name("help") || repl_need_name("quit") || repl_need_name("test")) {
    console.log("fail repl need name"); failed += 1;
  } else console.log("ok   repl need name");
  if (lsp_method_read("") !== "" || lsp_method_read("hover") !== "" || lsp_method_read("textDocument/hover") !== "textDocument/hover") {
    console.log("fail lsp method"); failed += 1;
  } else console.log("ok   lsp method");
  if (lsp_keyword("") || lsp_keyword("TYPE") || !lsp_keyword("type") || !lsp_keyword("refl")) {
    console.log("fail lsp keyword"); failed += 1;
  } else console.log("ok   lsp keyword");
  if (lsp_ext("") || lsp_ext("Nat.kind") || !lsp_ext("Nat.sure")) {
    console.log("fail lsp ext"); failed += 1;
  } else console.log("ok   lsp ext");
  if (lsp_uri_ok("") || lsp_uri_ok("http://x") || !lsp_uri_ok("file:///tmp/x.sure") || !lsp_uri_ok("untitled:Foo")) {
    console.log("fail lsp uri"); failed += 1;
  } else console.log("ok   lsp uri");
  if (lsp_frame("") !== "Content-Length: 0\r\n\r\n" || lsp_frame("{}") !== "Content-Length: 2\r\n\r\n{}") {
    console.log("fail lsp frame"); failed += 1;
  } else console.log("ok   lsp frame");
  if (word_at("", 0) !== "" || word_at("Nat.add", 0) !== "Nat.add" || word_at("+", 0) !== "" || word_at("a+b", 1) !== "a") {
    console.log("fail lsp word"); failed += 1;
  } else console.log("ok   lsp word");
  if (line_col_offset("", 0, 0) !== 0 || line_col_offset("a\nb", 1, 0) !== 2 || line_col_offset("ab", 0, 2) !== 2) {
    console.log("fail lsp offset"); failed += 1;
  } else console.log("ok   lsp offset");
  var parsed0 = lsp_parse_frames(Buffer.from(""));
  if (parsed0.msgs.length !== 0) { console.log("fail lsp parse empty"); failed += 1; }
  else console.log("ok   lsp parse empty");
  var parsed_bad = lsp_parse_frames(Buffer.from(lsp_frame("{")));
  if (!parsed_bad.msgs.length || !parsed_bad.msgs[0]._parse_error) { console.log("fail lsp parse junk"); failed += 1; }
  else console.log("ok   lsp parse junk");
  var parsed_ok = lsp_parse_frames(Buffer.from(lsp_frame("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"shutdown\"}")));
  if (!parsed_ok.msgs[0] || parsed_ok.msgs[0].method !== "shutdown") { console.log("fail lsp parse msg"); failed += 1; }
  else console.log("ok   lsp parse msg");
  var lsp_st = lsp_new_state();
  var lsp_uninit = await lsp_handle(lsp_st, {jsonrpc: "2.0", id: 1, method: "textDocument/hover", params: {}});
  if (!lsp_uninit.out[0] || !lsp_uninit.out[0].error || lsp_uninit.out[0].error.code !== -32002) {
    console.log("fail lsp uninit"); failed += 1;
  } else console.log("ok   lsp uninit");
  var lsp_init = await lsp_handle(lsp_new_state(), {jsonrpc: "2.0", id: 1, method: "initialize", params: {capabilities: {}}});
  if (!lsp_init.state.init || !lsp_init.out[0] || !lsp_init.out[0].result || !lsp_init.out[0].result.capabilities || !lsp_init.out[0].result.serverInfo || lsp_init.out[0].result.serverInfo.name !== "sure") {
    console.log("fail lsp initialize"); failed += 1;
  } else console.log("ok   lsp initialize");
  var st2l = lsp_init.state;
  var lsp_unknown = await lsp_handle(st2l, {jsonrpc: "2.0", id: 2, method: "textDocument/nope", params: {}});
  if (!lsp_unknown.out[0] || !lsp_unknown.out[0].error || lsp_unknown.out[0].error.code !== -32601) {
    console.log("fail lsp unknown"); failed += 1;
  } else console.log("ok   lsp unknown");
  var lsp_parse_err = await lsp_handle(st2l, {_parse_error: true});
  if (!lsp_parse_err.out[0] || !lsp_parse_err.out[0].error || lsp_parse_err.out[0].error.code !== -32700) {
    console.log("fail lsp parse err"); failed += 1;
  } else console.log("ok   lsp parse err");
  var lsp_open = await lsp_handle(st2l, {jsonrpc: "2.0", method: "textDocument/didOpen", params: {textDocument: {uri: "file:///tmp/empty.sure", text: ""}}});
  if (!lsp_open.state.docs["file:///tmp/empty.sure"] && lsp_open.state.docs["file:///tmp/empty.sure"] !== "") {
    console.log("fail lsp open empty"); failed += 1;
  } else if (!lsp_open.out.length || lsp_open.out[0].method !== "textDocument/publishDiagnostics") {
    console.log("fail lsp open diags"); failed += 1;
  } else console.log("ok   lsp open empty");
  st2l = lsp_open.state;
  var lsp_hov = await lsp_handle(st2l, {jsonrpc: "2.0", id: 3, method: "textDocument/hover", params: {textDocument: {uri: "file:///tmp/empty.sure"}, position: {line: 0, character: 0}}});
  if (!lsp_hov.out[0] || lsp_hov.out[0].result !== null) { console.log("fail lsp hover empty"); failed += 1; }
  else console.log("ok   lsp hover empty");
  var lsp_def = await lsp_handle(st2l, {jsonrpc: "2.0", id: 4, method: "textDocument/definition", params: {textDocument: {uri: "file:///tmp/empty.sure"}, position: {line: 0, character: 0}}});
  if (!lsp_def.out[0] || lsp_def.out[0].result !== null) { console.log("fail lsp def empty"); failed += 1; }
  else console.log("ok   lsp def empty");
  var lsp_comp = await lsp_handle(st2l, {jsonrpc: "2.0", id: 5, method: "textDocument/completion", params: {textDocument: {uri: "file:///tmp/empty.sure"}, position: {line: 0, character: 0}}});
  if (!lsp_comp.out[0] || !Array.isArray(lsp_comp.out[0].result) || lsp_comp.out[0].result.filter(function(x) { return x.label === "type"; }).length < 1) {
    console.log("fail lsp completion"); failed += 1;
  } else console.log("ok   lsp completion");
  var lsp_ren = await lsp_handle(st2l, {jsonrpc: "2.0", id: 6, method: "textDocument/rename", params: {textDocument: {uri: "file:///tmp/empty.sure"}, position: {line: 0, character: 0}, newName: ""}});
  if (!lsp_ren.out[0] || !lsp_ren.out[0].error || lsp_ren.out[0].error.code !== -32602) {
    console.log("fail lsp rename empty"); failed += 1;
  } else console.log("ok   lsp rename empty");
  var lsp_fmt = await lsp_handle(st2l, {jsonrpc: "2.0", id: 7, method: "textDocument/formatting", params: {textDocument: {uri: "file:///tmp/empty.sure"}}});
  if (!lsp_fmt.out[0] || !Array.isArray(lsp_fmt.out[0].result) || lsp_fmt.out[0].result.length !== 0) {
    console.log("fail lsp format empty"); failed += 1;
  } else console.log("ok   lsp format empty");
  var lsp_sym = await lsp_handle(st2l, {jsonrpc: "2.0", id: 8, method: "textDocument/documentSymbol", params: {textDocument: {uri: "file:///tmp/empty.sure"}}});
  if (!lsp_sym.out[0] || !Array.isArray(lsp_sym.out[0].result) || lsp_sym.out[0].result.length !== 0) {
    console.log("fail lsp symbols empty"); failed += 1;
  } else console.log("ok   lsp symbols empty");
  var lsp_hl = await lsp_handle(st2l, {jsonrpc: "2.0", id: 9, method: "textDocument/documentHighlight", params: {textDocument: {uri: "file:///tmp/empty.sure"}, position: {line: 0, character: 0}}});
  if (!lsp_hl.out[0] || !Array.isArray(lsp_hl.out[0].result) || lsp_hl.out[0].result.length !== 0) {
    console.log("fail lsp highlight empty"); failed += 1;
  } else console.log("ok   lsp highlight empty");
  var lsp_ref = await lsp_handle(st2l, {jsonrpc: "2.0", id: 10, method: "textDocument/references", params: {textDocument: {uri: "file:///tmp/empty.sure"}, position: {line: 0, character: 0}}});
  if (!lsp_ref.out[0] || !Array.isArray(lsp_ref.out[0].result) || lsp_ref.out[0].result.length !== 0) {
    console.log("fail lsp refs empty"); failed += 1;
  } else console.log("ok   lsp refs empty");
  var lsp_ws = await lsp_handle(st2l, {jsonrpc: "2.0", id: 11, method: "workspace/symbol", params: {query: ""}});
  if (!lsp_ws.out[0] || !Array.isArray(lsp_ws.out[0].result)) {
    console.log("fail lsp workspace empty query"); failed += 1;
  } else console.log("ok   lsp workspace empty query");
  var lsp_act = await lsp_handle(st2l, {jsonrpc: "2.0", id: 12, method: "textDocument/codeAction", params: {textDocument: {uri: "file:///tmp/empty.sure"}, range: {start: {line: 0, character: 0}, end: {line: 0, character: 0}}}});
  if (!lsp_act.out[0] || !Array.isArray(lsp_act.out[0].result) || lsp_act.out[0].result.length !== 0) {
    console.log("fail lsp actions empty"); failed += 1;
  } else console.log("ok   lsp actions empty");
  var lsp_close = await lsp_handle(st2l, {jsonrpc: "2.0", method: "textDocument/didClose", params: {textDocument: {uri: "file:///tmp/empty.sure"}}});
  if (lsp_close.state.docs["file:///tmp/empty.sure"] != null) { console.log("fail lsp close"); failed += 1; }
  else console.log("ok   lsp close");
  var ch0 = lsp_apply_changes("ab", []);
  var ch1 = lsp_apply_changes("ab", [{text: "cd"}]);
  var ch2 = lsp_apply_changes("ab", [{range: {start: {line: 0, character: 1}, end: {line: 0, character: 2}}, text: "X"}]);
  if (ch0 !== "ab" || ch1 !== "cd" || ch2 !== "aX") { console.log("fail lsp apply " + ch0 + ch1 + ch2); failed += 1; }
  else console.log("ok   lsp apply");
  var hsrc = "inc: Nat -> Nat\n  (n) Nat.succ(n)\n";
  var stTerm = lsp_new_state();
  stTerm.init = true;
  stTerm.docs["file:///tmp/inc.sure"] = hsrc;
  var lsp_hov_t = await lsp_handle(stTerm, {jsonrpc: "2.0", id: 30, method: "textDocument/hover", params: {textDocument: {uri: "file:///tmp/inc.sure"}, position: {line: 0, character: 1}}});
  var hv = (lsp_hov_t.out || []).filter(function(m) { return m.id === 30; })[0];
  var hv_txt = hv && hv.result && hv.result.contents ? String(hv.result.contents.value || "") : "";
  if (!hv || hv_txt.indexOf("inc") < 0 || hv_txt.indexOf("Nat") < 0) {
    console.log("fail lsp hover term " + hv_txt); failed += 1;
  } else console.log("ok   lsp hover term");
  var lsp_sym_t = await lsp_handle(stTerm, {jsonrpc: "2.0", id: 31, method: "textDocument/documentSymbol", params: {textDocument: {uri: "file:///tmp/inc.sure"}}});
  var syms = lsp_sym_t.out && lsp_sym_t.out[0] && lsp_sym_t.out[0].result;
  if (!Array.isArray(syms) || !syms.some(function(s) { return s && String(s.name).indexOf("inc") >= 0; })) {
    console.log("fail lsp symbols term " + JSON.stringify(syms)); failed += 1;
  } else console.log("ok   lsp symbols term");
  var lsp_ren_t = await lsp_handle(stTerm, {jsonrpc: "2.0", id: 32, method: "textDocument/rename", params: {textDocument: {uri: "file:///tmp/inc.sure"}, position: {line: 0, character: 1}, newName: "dec"}});
  var ren = lsp_ren_t.out && lsp_ren_t.out[0] && lsp_ren_t.out[0].result;
  var ren_txt = ren && ren.documentChanges && ren.documentChanges[0] && ren.documentChanges[0].edits && ren.documentChanges[0].edits[0] ? String(ren.documentChanges[0].edits[0].newText || "") : "";
  if (!ren_txt || ren_txt.indexOf("dec:") < 0) {
    console.log("fail lsp rename term " + ren_txt); failed += 1;
  } else console.log("ok   lsp rename term");
  var leakDoc = "x: Nat\n  0\n\nf(x: Nat): Nat\n  x\n\ng: Nat\n  x\n";
  var stLeak = lsp_new_state();
  stLeak.init = true;
  stLeak.docs["file:///tmp/leak.sure"] = leakDoc;
  var leakPos = {line: 3, character: 2};
  var lsp_ren_leak = await lsp_handle(stLeak, {jsonrpc: "2.0", id: 33, method: "textDocument/rename", params: {textDocument: {uri: "file:///tmp/leak.sure"}, position: leakPos, newName: "k"}});
  var leak_ren = lsp_ren_leak.out && lsp_ren_leak.out[0] && lsp_ren_leak.out[0].result;
  var leak_txt = leak_ren && leak_ren.documentChanges && leak_ren.documentChanges[0] && leak_ren.documentChanges[0].edits && leak_ren.documentChanges[0].edits[0] ? String(leak_ren.documentChanges[0].edits[0].newText || "") : "";
  if (!leak_txt || leak_txt.indexOf("f(k: Nat)") < 0 || leak_txt.indexOf("x: Nat\n  0") < 0 || !/g: Nat\n  x\n/.test(leak_txt)) {
    console.log("fail lsp rename param scope " + JSON.stringify(leak_txt)); failed += 1;
  } else console.log("ok   lsp rename param scope");
  var ext_dir = path.join(__dirname, "../../../editors/vscode");
  try {
    var ext_pkg = JSON.parse(fs.readFileSync(path.join(ext_dir, "package.json"), "utf8"));
    var gram = JSON.parse(fs.readFileSync(path.join(ext_dir, "syntaxes", "sure.tmLanguage.json"), "utf8"));
    var langc = JSON.parse(fs.readFileSync(path.join(ext_dir, "language-configuration.json"), "utf8"));
    var extjs = fs.readFileSync(path.join(ext_dir, "extension.js"), "utf8");
    if (ext_pkg.name !== "sure" || ext_pkg.engines.vscode == null || !ext_pkg.contributes || !ext_pkg.contributes.languages) {
      console.log("fail vscode package"); failed += 1;
    } else if (gram.scopeName !== "source.sure" || (gram.fileTypes || []).indexOf("sure") < 0) {
      console.log("fail vscode grammar"); failed += 1;
    } else if (!langc.comments || langc.comments.lineComment !== "//") {
      console.log("fail vscode lang config"); failed += 1;
    } else if (extjs.indexOf("sure lsp") < 0 || extjs.indexOf("createDiagnosticCollection") < 0) {
      console.log("fail vscode extension.js"); failed += 1;
    } else console.log("ok   vscode extension");
  } catch (e) {
    console.log("fail vscode extension " + e); failed += 1;
  }
  try {
    var cp = require("child_process");
    var child = cp.spawn(process.execPath, ["--stack-size=10000", path.join(__dirname, "main.js"), "lsp"], {
      cwd: process.cwd(),
      env: Object.assign({}, process.env, {SURE_BASE: process.cwd()}),
      stdio: ["pipe", "pipe", "pipe"]
    });
    var got = Buffer.alloc(0);
    var rpc_ok = await new Promise(function(resolve) {
      var t = setTimeout(function() { try { child.kill(); } catch (e) {} resolve(false); }, 8000);
      child.stdout.on("data", function(c) {
        got = Buffer.concat([got, c]);
        var frames = lsp_parse_frames(got);
        for (var i = 0; i < frames.msgs.length; i++) {
          if (frames.msgs[i] && frames.msgs[i].id === 1 && frames.msgs[i].result && frames.msgs[i].result.capabilities) {
            clearTimeout(t);
            child.stdin.write(lsp_frame(JSON.stringify({jsonrpc: "2.0", id: 2, method: "shutdown", params: null})));
            child.stdin.write(lsp_frame(JSON.stringify({jsonrpc: "2.0", method: "exit"})));
            resolve(true);
            return;
          }
        }
      });
      child.on("error", function() { clearTimeout(t); resolve(false); });
      child.stdin.write(lsp_frame(JSON.stringify({jsonrpc: "2.0", id: 1, method: "initialize", params: {processId: null, capabilities: {}, rootUri: null}})));
    });
    try { child.kill(); } catch (e) {}
    if (!rpc_ok) { console.log("fail lsp stdio initialize"); failed += 1; }
    else console.log("ok   lsp stdio initialize");
  } catch (e) {
    console.log("fail lsp stdio " + e); failed += 1;
  }
  var wbad = write_emit_js("/tmp", "../x", "module.exports=1");
  if (wbad.ok || wbad.error !== "unsafe name") {
    console.log("fail emit unsafe write"); failed += 1;
  } else console.log("ok   emit unsafe write");
  var st0 = bench_stats([]);
  if (st0.ok) { console.log("fail bench empty samples"); failed += 1; }
  else console.log("ok   bench empty samples");
  var st1 = bench_stats([-1]);
  if (st1.ok) { console.log("fail bench neg sample"); failed += 1; }
  else console.log("ok   bench neg sample");
  var st2 = bench_stats([4, 2, 6]);
  if (!st2.ok || st2.best !== 2 || st2.mean !== 4 || st2.n !== 3) {
    console.log("fail bench stats"); failed += 1;
  } else console.log("ok   bench stats");
  var br = await agent_dispatch("kind.bench", {});
  if (br.ok) { console.log("fail bench empty name"); failed += 1; }
  else console.log("ok   bench empty name");
  var bm = await agent_dispatch("kind.bench", {name: "Sure.NoSuch.Name.ZZ"});
  if (bm.ok) { console.log("fail bench missing"); failed += 1; }
  else console.log("ok   bench missing");
  if (mod_name_ok("") || mod_name_ok("foo") || mod_name_ok("Foo.") || !mod_name_ok("Foo.Bar")) {
    console.log("fail mod name"); failed += 1;
  } else console.log("ok   mod name");
  if (mod_pkg_ok("") || mod_pkg_ok("ada") || mod_pkg_ok("Ada/boxes") || !mod_pkg_ok("ada/boxes")) {
    console.log("fail mod pkg"); failed += 1;
  } else console.log("ok   mod pkg");
  if (mod_read_module("") || mod_read_module("import Foo") || !mod_read_module("module Foo exposing (bar)") || mod_read_module("module Foo exposing (bar)").name !== "Foo" || !mod_read_module("module Foo") || mod_read_module("module Foo").name !== "Foo") {
    console.error("mod_read_module failed"); process.exit(1);
  }
  var exp = mod_expand_source("Hello.sure", "module Hello exposing (..)\ngreet: String\n  \"Sure\"\nSpec: greet == \"Sure\"\n  refl\n");
  if (exp.indexOf("Hello.greet") < 0 || exp.indexOf("Hello.Spec") < 0 || !/Hello\.greet ==/.test(exp)) {
    console.log("fail read module"); failed += 1;
  } else console.log("ok   read module");
  var prev_mod = globalThis.__sureParserModules;
  globalThis.__sureParserModules = true;
  var prep = compiler.prepare_source("Hello.sure", "module Hello exposing (..)\ngreet: String\n  \"Sure\"\n");
  globalThis.__sureParserModules = prev_mod;
  if (prep.indexOf("module Hello") < 0 || prep.indexOf("// module Hello") >= 0) {
    console.log("fail parser-owned module " + prep); failed += 1;
  } else console.log("ok   parser-owned module");
  var openimp = compiler.prepare_source("Audit.sure", "module Audit exposing (..)\nimport Boxes exposing (..)\nreport: Nat\n  empty\n");
  if (openimp.indexOf("import Boxes exposing (..)") < 0 || openimp.indexOf("Boxes.empty") >= 0) {
    console.log("fail open import host " + openimp); failed += 1;
  } else console.log("ok   open import host");
  var impsrc = mod_expand_source("Audit.sure", "module Audit exposing (..)\nimport Boxes exposing (empty)\nreport: Nat\n  empty\n");
  if (impsrc.indexOf("Boxes.empty") < 0) {
    console.log("fail import exposing " + impsrc); failed += 1;
  } else console.log("ok   import exposing");
  var wh = when_expand_source("ok(s: String): Bool\n  when {\n    String.is_empty(s): false\n    String.includes(s, \" \"): false\n  } default true\n");
  if (wh.indexOf("if String.is_empty(s) then false") < 0 || wh.indexOf("if String.includes(s, \" \") then false") < 0 || /\bwhen\s*\{/.test(wh)) {
    console.log("fail when expand " + wh); failed += 1;
  } else console.log("ok   when expand");
  var hx = compiler.html_expand_source("<input type={kind} class=\"x\" />\nList<Nat>\nn < m\n");
  if (hx.indexOf("<input type=kind class=\"x\"") < 0 || hx.indexOf("</input>") < 0 || hx.indexOf("List<Nat>") < 0 || hx.indexOf("n < m") < 0 || hx.indexOf("type={kind}") >= 0) {
    console.log("fail html expand " + hx); failed += 1;
  } else console.log("ok   html expand");
  var fmt_io = compiler.format_source("demo: IO<Unit>\n  IO {\n    IO.print(greet)\n  }\n");
  if (fmt_io.indexOf("    IO.print(greet)") < 0 || /IO \{\n  IO\.print/.test(fmt_io)) {
    console.log("fail format nest " + JSON.stringify(fmt_io)); failed += 1;
  } else console.log("ok   format nest");
  var ren_src = "f: Nat\n  let x = 1\n  let y = x\n  x\n";
  var ren_x = compiler.ident_at(ren_src, ren_src.indexOf("x ="));
  var ren_out = ren_x ? compiler.rename_ident(ren_src, ren_x.start, "z") : "";
  if (!ren_out || ren_out.indexOf("let z = 1") < 0 || ren_out.indexOf("let y = z") < 0 || (ren_out.match(/\bz\b/g) || []).length < 2) {
    console.log("fail rename bind " + ren_out); failed += 1;
  } else console.log("ok   rename bind");
  var psrc = "add(n: Nat): Nat\n  n\n";
  var pat = compiler.ident_at(psrc, psrc.indexOf("n:"));
  var pout = pat ? compiler.rename_ident(psrc, pat.start, "k") : "";
  if (!pout || pout.indexOf("add(k: Nat)") < 0 || !/\n  k\n/.test(pout) || pout.indexOf("Nat") < 0) {
    console.log("fail rename param " + JSON.stringify(pout)); failed += 1;
  } else console.log("ok   rename param");
  var lsrc = "g: Nat -> Nat\n  (x) x\n";
  var lat = compiler.ident_at(lsrc, lsrc.lastIndexOf("x"));
  var lout = lat ? compiler.rename_ident(lsrc, lat.start, "y") : "";
  if (!lout || lout.indexOf("(y) y") < 0 || lout.indexOf("(x)") >= 0) {
    console.log("fail rename lambda " + JSON.stringify(lout)); failed += 1;
  } else console.log("ok   rename lambda");
  var leak = "x: Nat\n  0\n\nf(x: Nat): Nat\n  x\n\ng: Nat\n  x\n";
  var leak_at = compiler.ident_at(leak, leak.indexOf("f(x") + 2);
  var leak_out = leak_at ? compiler.rename_ident(leak, leak_at.start, "k") : "";
  if (!leak_out || leak_out.indexOf("f(k: Nat)") < 0 || leak_out.indexOf("\n  k\n") < 0
      || leak_out.indexOf("x: Nat\n  0") < 0 || !/g: Nat\n  x\n/.test(leak_out)
      || (leak_out.match(/\bk\b/g) || []).length !== 2) {
    console.log("fail rename param scope " + JSON.stringify(leak_out)); failed += 1;
  } else console.log("ok   rename param scope");
  if (compiler.mod_resolve("Tweeter", ["Tweeter.ok"], [], "ok") !== "Tweeter.ok"
    || compiler.mod_resolve("Tweeter", ["Tweeter.ok"], [], "Nat.add") !== "Nat.add"
    || compiler.mod_resolve("Audit", ["Audit.report"], [{mod: "Boxes", names: ["len"]}], "len") !== "Boxes.len") {
    console.log("fail mod resolve"); failed += 1;
  } else console.log("ok   mod resolve");
  var shad = mod_expand_source("Routes.sure", "module Routes exposing (..)\nreq(method: String): String\n  method\necho(req: String): String\n  open req\n  req\n");
  if (shad.indexOf("open Routes.req") >= 0 || shad.indexOf("echo(Routes.req") >= 0 || shad.indexOf("Routes.echo") < 0 || shad.indexOf("Routes.req") < 0) {
    console.log("fail binder shadow " + shad); failed += 1;
  } else console.log("ok   binder shadow");
  var impq = mod_read_import("import Boxes");
  if (!impq || !impq.qualified || impq.exposing.all) {
    console.log("fail import qualified"); failed += 1;
  } else console.log("ok   import qualified");
  if (mod_read_module("// module Foo exposing (..)").name !== "Foo") {
    console.log("fail read module comment"); failed += 1;
  } else console.log("ok   read module comment");
  if (mod_read_import("") || mod_read_import("module Foo exposing (a)") || mod_read_import("import Nat exposing (add)").name !== "Nat") {
    console.log("fail read import"); failed += 1;
  } else console.log("ok   read import");
  if (mod_allows("Foo", {all: false, names: ["bar"]}, "") || mod_allows("Foo", {all: false, names: ["bar"]}, "Foo.secret") || !mod_allows("Foo", {all: false, names: ["bar"]}, "Foo.bar") || !mod_allows("Foo", {all: true, names: []}, "Foo.bar")) {
    console.log("fail mod allows"); failed += 1;
  } else console.log("ok   mod allows");
  if (!mod_imports_allow([], "Foo.secret") || mod_imports_allow([mod_read_import("import Nat exposing (add)")], "Nat.sub") || !mod_imports_allow([mod_read_import("import Nat exposing (add)")], "Nat.add")) {
    console.log("fail mod imports"); failed += 1;
  } else console.log("ok   mod imports");
  if (github_url_of("") || github_url_of("ada/boxes") !== "https://github.com/ada/boxes.git" || pkg_mod_name("ada/boxes") !== "Boxes") {
    console.log("fail pkg url"); failed += 1;
  } else console.log("ok   pkg url");
  var hasht = path.join(require("os").tmpdir(), "sure-lock-hash-" + process.pid);
  fs.mkdirSync(path.join(hasht, "src"), {recursive: true});
  fs.writeFileSync(path.join(hasht, "src", "A.sure"), "A: Nat\n  0\n");
  var ha = dep_tree_hash(hasht);
  var hb = dep_tree_hash(hasht);
  if (!ha || ha !== hb) { console.log("fail lock hash stable"); failed += 1; }
  else console.log("ok   lock hash stable");
  fs.appendFileSync(path.join(hasht, "src", "A.sure"), "\n");
  if (dep_tree_hash(hasht) === ha) { console.log("fail lock hash dirty"); failed += 1; }
  else console.log("ok   lock hash dirty");
  if (dep_tree_hash("") || dep_tree_hash(path.join(hasht, "missing"))) { console.log("fail lock hash missing"); failed += 1; }
  else console.log("ok   lock hash missing");
  var ws = require(path.join(formcore_path, "ws-frames.js"));
  var mask = Buffer.from([1, 2, 3, 4]);
  var framed = ws.ws_mask_frame("hi", mask);
  if (!framed || framed[0] !== 0x81 || (framed[1] & 0x80) === 0) {
    console.log("fail ws mask header"); failed += 1;
  } else console.log("ok   ws mask header");
  var rec = {buf: framed};
  var got = ws.ws_take_frame(rec);
  if (!got || got.text !== "hi") { console.log("fail ws roundtrip " + (got && got.text)); failed += 1; }
  else console.log("ok   ws roundtrip");
  var emptyF = ws.ws_mask_frame("", mask);
  var emptyG = ws.ws_take_frame({buf: emptyF});
  if (!emptyG || emptyG.text !== "") { console.log("fail ws empty payload"); failed += 1; }
  else console.log("ok   ws empty payload");
  var junkF = ws.ws_take_frame({buf: Buffer.alloc(0)});
  if (junkF !== null) { console.log("fail ws short frame"); failed += 1; }
  else console.log("ok   ws short frame");
  var closeBuf = Buffer.from([0x88, 0x00]);
  var closeG = ws.ws_take_frame({buf: closeBuf});
  if (!closeG || !closeG.close) { console.log("fail ws close opcode"); failed += 1; }
  else console.log("ok   ws close opcode");
  var hs = ws.ws_handshake_request("ws://example.com/chat", "dGhlIHNhbXBsZSBub25jZQ==");
  if (!hs || hs.indexOf("Upgrade: websocket") < 0 || hs.indexOf("Sec-WebSocket-Version: 13") < 0 || hs.indexOf("Host: example.com") < 0) {
    console.log("fail ws handshake request"); failed += 1;
  } else console.log("ok   ws handshake request");
  if (ws.ws_handshake_request("not a url", "x") !== "" ) { console.log("fail ws handshake junk url"); failed += 1; }
  else console.log("ok   ws handshake junk url");
  if (ws.ws_handshake_ok("") || ws.ws_handshake_ok("HTTP/1.1 200 OK") || !ws.ws_handshake_ok("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n")) {
    console.log("fail ws handshake ok"); failed += 1;
  } else console.log("ok   ws handshake ok");
  var mk = {type: "package", "source-directories": ["lib"], dependencies: {direct: {a: {path: "../a"}}, indirect: {}}};
  if (man_kind(mk) !== "package" || man_src_dirs(mk, "/p")[0] !== path.resolve("/p", "lib") || !man_direct(mk).a) {
    console.log("fail man shape"); failed += 1;
  } else console.log("ok   man shape");
  var tmpm = path.join(require("os").tmpdir(), "sure-mod-edge-" + process.pid);
  var prev_cwd = get_ORIG_CWD();
  try {
    fs.mkdirSync(path.join(tmpm, "pkg", "src"), {recursive: true});
    fs.mkdirSync(path.join(tmpm, "app", "src"), {recursive: true});
    write_manifest(path.join(tmpm, "pkg", "sure.json"), {
      type: "package", name: "ada/boxes", version: "1.0.0",
      "source-directories": ["src"], "exposed-modules": ["Boxes"],
      dependencies: {direct: {}, indirect: {}}
    });
    fs.writeFileSync(path.join(tmpm, "pkg", "src", "Boxes.sure"),
      "// module Boxes exposing (ok)\nBoxes.ok: Bool\n  true\nBoxes.secret: Bool\n  false\n");
    fs.writeFileSync(path.join(tmpm, "pkg", "src", "Secret.sure"),
      "// module Secret exposing (hidden)\nSecret.hidden: Bool\n  false\n");
    write_manifest(path.join(tmpm, "app", "sure.json"), {
      type: "application", name: "app", version: "1.0.0",
      "source-directories": ["src"], "exposed-modules": [],
      dependencies: {direct: {"ada/boxes": {path: "../pkg"}}, indirect: {}}
    });
    fs.writeFileSync(path.join(tmpm, "app", "src", "Main.sure"),
      "// module Main exposing (Main)\nMain: Bool\n  Secret.hidden\n");
    set_ORIG_CWD(path.join(tmpm, "app"));
    var badm = check_project_modules(true);
    if (badm.ok) { console.log("fail module unexposed " + JSON.stringify(badm)); failed += 1; }
    else console.log("ok   module unexposed");
    fs.writeFileSync(path.join(tmpm, "app", "src", "Main.sure"),
      "module Main exposing (Main)\nimport Boxes\nMain: Bool\n  Boxes.ok\n");
    var okm = check_project_modules(true);
    if (!okm.ok) { console.log("fail module exposed " + JSON.stringify(okm)); failed += 1; }
    else console.log("ok   module exposed");
    fs.writeFileSync(path.join(tmpm, "app", "src", "Main.sure"),
      "module Main exposing (Main)\nimport Boxes exposing (ok)\nMain: Bool\n  Boxes.secret\n");
    var impi = check_project_modules(true);
    if (impi.ok) { console.log("fail module import " + JSON.stringify(impi)); failed += 1; }
    else console.log("ok   module import");
    fs.writeFileSync(path.join(tmpm, "pkg", "src", "Boxes.sure"),
      "module Boxes exposing (ok)\nok: Bool\n  true\nsecret: Bool\n  false\n");
    fs.writeFileSync(path.join(tmpm, "pkg", "src", "Spy.sure"),
      "module Spy exposing (..)\nimport Boxes exposing (ok)\nleak: Bool\n  Boxes.secret\n");
    set_ORIG_CWD(path.join(tmpm, "pkg"));
    var hide = check_project_modules(true);
    if (hide.ok) { console.log("fail module hide " + JSON.stringify(hide)); failed += 1; }
    else console.log("ok   module hide");
  } catch (e) {
    console.log("fail module project " + e); failed += 1;
  } finally {
    set_ORIG_CWD(prev_cwd);
    try { fs.rmSync(tmpm, {recursive: true, force: true}); } catch (e2) {}
  }
  if (sure_runtime_pick(true, "", false) !== "bun" || sure_runtime_pick(false, "bun", false) !== "bun" || sure_runtime_pick(false, "", true) !== "bun") {
    console.log("fail runtime pick bun"); failed += 1;
  } else console.log("ok   runtime pick bun");
  if (sure_runtime_pick(false, "", false) !== "node" || sure_runtime_pick(false, "xyz", false) !== "node" || sure_runtime_pick(false, "", false) !== "node") {
    console.log("fail runtime pick node"); failed += 1;
  } else console.log("ok   runtime pick node");
  var miss_js = sure_run_js("", false);
  if (miss_js.ok || miss_js.error !== "need js file") {
    console.log("fail run empty js"); failed += 1;
  } else console.log("ok   run empty js");
  var no_js = sure_run_js("Sure.NoSuch.Run.js", false);
  if (no_js.ok || no_js.error !== "missing js") {
    console.log("fail run missing js"); failed += 1;
  } else console.log("ok   run missing js");
  var has_bun = bun_available();
  if (typeof has_bun !== "boolean") {
    console.log("fail bun available type"); failed += 1;
  } else console.log("ok   bun available " + has_bun);
  if (has_bun) {
    var tmpb = path.join(require("os").tmpdir(), "sure-bun-edge-" + process.pid + ".js");
    try {
      fs.writeFileSync(tmpb, "console.log('sure-bun-ok');\n");
      var bout = run_spawn("bun", [tmpb], {timeout: 10000});
      if (String(bout).indexOf("sure-bun-ok") < 0) {
        console.log("fail bun smoke " + bout); failed += 1;
      } else console.log("ok   bun smoke");
    } catch (e) {
      console.log("fail bun smoke " + e); failed += 1;
    } finally {
      try { fs.unlinkSync(tmpb); } catch (e2) {}
    }
  } else {
    var tmpn = path.join(require("os").tmpdir(), "sure-nobun-" + process.pid + ".js");
    fs.writeFileSync(tmpn, "module.exports=1;\n");
    var nob = sure_run_js(tmpn, true);
    try { fs.unlinkSync(tmpn); } catch (e3) {}
    if (nob.ok || nob.error !== "bun not found") {
      console.log("fail bun missing " + JSON.stringify(nob)); failed += 1;
    } else console.log("ok   bun missing");
  }
  return failed;
}


  return {
    run_prove_edges: run_prove_edges
  };
};
