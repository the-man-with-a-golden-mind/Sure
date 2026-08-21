"use strict";
// Interactive sure repl.
module.exports = function make(deps) {
  var ORIG_CWD = deps.ORIG_CWD;
  var SURE_VERSION = deps.SURE_VERSION;
  var agent_check_name = deps.agent_check_name;
  var agent_dispatch = deps.agent_dispatch;
  var agent_show = deps.agent_show;
  var checker = deps.checker;
  var fmc_to_js = deps.fmc_to_js;
  var fs = deps.fs;
  var kind = deps.kind;
  var path = deps.path;
  var run_compiled_js = deps.run_compiled_js;
  var scan_docs = deps.scan_docs;
  var scan_impact = deps.scan_impact;
  var scan_theorems = deps.scan_theorems;

var REPL_CMDS = {
  help: 1, h: 1, "?": 1, quit: 1, q: 1, check: 1, prove: 1, type: 1, goal: 1,
  fill: 1, impact: 1, theorems: 1, docs: 1, debug: 1, norm: 1, run: 1, test: 1
};

function repl_parse(line) {
  line = String(line == null ? "" : line).replace(/^\s+|\s+$/g, "");
  if (!line) return {ok: true, empty: true, cmd: "", arg: ""};
  var body = line.charAt(0) === ":" ? line.slice(1) : line;
  body = body.replace(/^\s+/, "");
  if (!body) return {ok: false, error: "need command", cmd: "", arg: ""};
  var sp = body.indexOf(" ");
  var cmd = (sp < 0 ? body : body.slice(0, sp)).toLowerCase();
  var arg = sp < 0 ? "" : body.slice(sp + 1).replace(/^\s+|\s+$/g, "");
  if (!REPL_CMDS[cmd]) return {ok: false, error: "unknown command: " + cmd, cmd: cmd, arg: arg};
  if (cmd === "h" || cmd === "?") cmd = "help";
  if (cmd === "q") cmd = "quit";
  return {ok: true, empty: false, cmd: cmd, arg: arg};
}

function repl_help() {
  return [
    ":help              this text",
    ":quit              leave",
    ":check <Term>      type-check",
    ":prove <Term>      prove (the type checker)",
    ":type <Term>       inferred type",
    ":goal <Term>       remaining holes",
    ":debug <Term>      type + holes + traces",
    ":norm <Term>       normal form",
    ":run <Term>        compile and run",
    ":docs <Term>       comment + type",
    ":fill code|||term  replace ?implement",
    ":impact <Name>     callers + proofs",
    ":theorems [Name]   specs",
    ":test              the suite is: sure test"
  ].join("\n");
}

function repl_need_name(cmd) {
  return cmd === "check" || cmd === "prove" || cmd === "type" || cmd === "goal" || cmd === "debug" || cmd === "norm" || cmd === "run" || cmd === "fill" || cmd === "impact" || cmd === "docs";
}

function repl_print_prove(r) {
  if (!r) { console.log("unproved"); return; }
  if (r.ok) console.log((r.proved ? "proved  " : "checked ") + (r.name || "") + (r.type ? " : " + r.type : ""));
  else {
    console.log("unproved " + (r.name || ""));
    if (r.diagnostics && r.diagnostics.length) console.log(JSON.stringify(r.diagnostics, null, 2));
  }
}

async function cmd_repl() {
  var readline = require("readline");
  var rl = readline.createInterface({input: process.stdin, output: process.stdout});
  console.log("# Sure " + SURE_VERSION + " repl. :help :quit. Empty line is ignored.");
  function ask() {
    rl.question("sure> ", async function(line) {
      var p = repl_parse(line);
      if (p.empty) return ask();
      if (!p.ok) { console.log(p.error); console.log("try: :help"); return ask(); }
      if (p.cmd === "quit") { rl.close(); return; }
      if (p.cmd === "help") { console.log(repl_help()); return ask(); }
      if (p.cmd === "test") { console.log("the suite is: sure test"); return ask(); }
      if (repl_need_name(p.cmd) && !p.arg) { console.log("need name"); console.log("try: :help"); return ask(); }
      try {
        if (p.cmd === "check" || p.cmd === "prove") {
          var rp = await agent_dispatch("kind.prove", {name: p.arg});
          repl_print_prove(rp);
        } else if (p.cmd === "type") {
          var r2 = await agent_check_name(p.arg);
          var ty = (r2.types && r2.types[0] && r2.types[0].type) || "";
          if (ty) console.log(p.arg + " : " + ty);
          else console.log(JSON.stringify(r2.types || r2, null, 2));
        } else if (p.cmd === "goal") {
          var rg = await agent_dispatch("kind.trace", {name: p.arg});
          console.log("remaining " + (rg && rg.remaining != null ? rg.remaining : "?"));
          if (rg && rg.traces && rg.traces.length) console.log(rg.traces.join("\n"));
        } else if (p.cmd === "debug") {
          var rd = await agent_dispatch("kind.debug", {name: p.arg});
          console.log("remaining " + (rd && rd.remaining != null ? rd.remaining : "?"));
          if (rd && rd.type) console.log(rd.name + " : " + rd.type);
        } else if (p.cmd === "docs") {
          console.log(JSON.stringify(scan_docs(p.arg), null, 2));
        } else if (p.cmd === "fill") {
          var sp = p.arg.indexOf("|||");
          var rf = await agent_dispatch("kind.fill", sp >= 0
            ? {code: p.arg.slice(0, sp), term: p.arg.slice(sp + 3)}
            : {term: p.arg});
          console.log(JSON.stringify(rf, null, 2));
        } else if (p.cmd === "impact") {
          console.log(JSON.stringify(scan_impact(p.arg), null, 2));
        } else if (p.cmd === "theorems") {
          console.log(JSON.stringify(scan_theorems(p.arg), null, 2));
        } else if (p.cmd === "norm") {
          var r3 = await agent_show(p.arg, true);
          console.log(r3.term || JSON.stringify(r3));
        } else if (p.cmd === "run") {
          var fmcc = await kind.run(checker("api.io.term_to_core")(p.arg));
          var asjs = fmc_to_js.compile(fmcc, p.arg, {});
          var js_path = path.join(ORIG_CWD, ".sure.tmp.js");
          fs.writeFileSync(js_path, asjs);
          try { run_compiled_js(js_path, false, []); }
          finally { try { fs.unlinkSync(js_path); } catch (e) {} }
        }
      } catch (e) {
        console.log(String(e && e.message || e));
      }
      ask();
    });
  }
  ask();
}


  return {
    REPL_CMDS: REPL_CMDS,
    repl_parse: repl_parse,
    repl_help: repl_help,
    repl_need_name: repl_need_name,
    repl_print_prove: repl_print_prove,
    cmd_repl: cmd_repl
  };
};
