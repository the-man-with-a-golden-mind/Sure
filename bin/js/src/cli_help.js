"use strict";
// CLI help screens. Presentation only.

module.exports = function make(deps) {
  var SURE_VERSION = deps.SURE_VERSION;
  var KIND_LINEAGE = deps.KIND_LINEAGE;

function sure_help_topic(s) {
  s = String(s || "").trim();
  if (!s || s === "help") return "start";
  if (s === "start" || s === "all" || s === "prove" || s === "json" || s === "html" || s === "emit" || s === "ffi" || s === "gen" || s === "pkg" || s === "bun" || s === "worker" || s === "db" || s === "debug" || s === "lsp" || s === "pipe" || s === "time" || s === "cli" || s === "log" || s === "repl" || s === "test" || s === "cover" || s === "env" || s === "cfg" || s === "ssr" || s === "ui" || s === "web") return s;
  return null;
}
function print_help() {
  print_help_topic("start");
}

function print_help_topic(topic) {
  var t = sure_help_topic(topic);
  if (!t) {
    console.error("unknown help topic: " + topic);
    console.error("try: sure help start | prove | json | html | emit | ffi | gen | pkg | bun | worker | db | debug | lsp | pipe | time | cli | log | repl | test | cover | env | cfg | ssr | ui | web | all");
    process.exit(1);
  }
  if (t === "start") {
    console.log("# Sure " + SURE_VERSION);
    console.log("");
    console.log("Write .sure files. The type checker proves them. Then you emit JavaScript.");
    console.log("");
    console.log("Usage: sure <command> [Term...]");
    console.log("");
    console.log("  sure new myapp              # scaffold");
    console.log("  sure new --package ada/boxes");
    console.log("  cd myapp");
    console.log("  sure prove                  # theorems must check");
    console.log("  sure gen JSON.dec.bool      # tests and proofs from the type");
    console.log("  sure build                  # writes dist/Main.js");
    console.log("  sure run                    # emit dist/ if needed, then spawn");
    console.log("");
    console.log("  sure build --html Html.Counter.client");
    console.log("                          # open dist/Html.Counter.client.html");
    console.log("");
    console.log("  sure help prove         # equalities are proofs");
    console.log("  sure help json          # JSON.enc / JSON.dec");
    console.log("  sure help html          # pages in the browser");
    console.log("  sure help emit          # dist/ artifacts");
    console.log("  sure help ffi           # call JS/TS (JSON in, JSON out)");
    console.log("  sure help gen           # tests and proofs from types");
    console.log("  sure help pkg           # modules and packages");
    console.log("  sure help bun           # Node and Bun");
    console.log("  sure help worker        # off-thread JSON jobs");
    console.log("  sure help db            # memory and file stores");
    console.log("  sure help debug         # levels, channels, sure debug");
    console.log("  sure help lsp           # language server and VS Code");
    console.log("  sure help pipe          # list and CSV pipelines");
    console.log("  sure help time          # stamps, durations, ISO-8601");
    console.log("  sure help cli           # program flags");
    console.log("  sure help log           # application log lines");
    console.log("  sure help repl          # interactive checker");
    console.log("  sure help test          # sure test");
    console.log("  sure help env           # process environment");
    console.log("  sure help cfg           # JSON config");
    console.log("  sure help ssr           # HTML pages, SSE, Db.Dsl, migrations");
    console.log("  sure help ui            # Elm-like pages in the browser");
    console.log("  sure help web           # timed Html / Ui / Ssr / Sheet bench");
    console.log("  sure help all           # every flag");
    return;
  }
  if (t === "prove") {
    console.log("A well-typed `a == b` term is a proof. The type checker is the prover.");
    console.log("");
    console.log("  Spec.add2: Nat.add(2, 2) == 4");
    console.log("    refl");
    console.log("");
    console.log("  sure prove              # listed theorems + src equalities");
    console.log("  sure prove Spec.add2    # one theorem");
    console.log("  sure goal Term          # remaining ?implement holes");
    console.log("  sure qc Nat.add.comm    # sample a lemma at generated values");
    console.log("");
    console.log("when { pred: val ... } default rest  # first true predicate; not case");
    console.log("String.ok(s, [\" \", \"\\n\"])         # nonempty and none of those substrings");
    console.log("");
    console.log("Unproved equalities fail the build. They are not emitted.");
    return;
  }
  if (t === "json") {
    console.log("JSON.enc turns a value into JSON. JSON.dec reads it back (none on junk).");
    console.log("");
    console.log("  JSON.enc.bool(true)           JSON.dec.bool(j)");
    console.log("  JSON.enc.nat(0)               JSON.dec.nat(j)     # digit string only");
    console.log("  JSON.enc.string(\"hi\")         JSON.dec.string(j)");
    console.log("  JSON.enc.list(enc, xs)        JSON.dec.list(dec, j)");
    console.log("  JSON.get(j, \"name\")           # none if missing");
    console.log("");
    console.log("\"\", \"abc\", and \"12x\" are not nats. A bool is not a nat.");
    console.log("sure doc JSON.enc.bool");
    return;
  }
  if (t === "html") {
    console.log("Html.App is init / view / update. Html.Client is what the browser runs.");
    console.log("Sure.Ui is the Elm-like layer: sandbox (no effects) and element (Cmd + Sub).");
    console.log("");
    console.log("  Html.button(\"inc\", [Html.text(\"+1\")])");
    console.log("  Html.input(value, \"set\")");
    console.log("  Html.Counter.client   # click");
    console.log("  Html.Echo.client      # input + click");
    console.log("  Sure.Ui.Counter.client");
    console.log("  Sure.Ui.Tick.client   # Sub.every");
    console.log("  Sure.Ui.Probe.client  # Cmd + Sub edges");
    console.log("  Sure.Ui.Boot.client   # boot Cmd");
    console.log("  Sure.Sheet.client     # Excel grid, virtual scroll, 10000 SSE rows");
    console.log("  Sure.Tweeter.client   # login, session, tweets, file upload");
    console.log("");
    console.log("  sure build --html Html.Counter.client");
    console.log("  sure build --html Sure.Ui.Tick.client");
    console.log("  sure build --html Sure.Sheet.client");
    console.log("  sure run Sure.Sheet.serve");
    console.log("  sure build --html Sure.Tweeter.client");
    console.log("  sure run Sure.Tweeter.serve");
    console.log("  open dist/Html.Counter.client.html");
    console.log("");
    console.log("Html.el(tag, ...) and Html.on(ev, ...) take String names, not Html.Tag / Html.Event.");
    console.log("Every Html.Event is listened. Clicks/input call step in the page.");
    console.log("sure help ui");
    return;
  }
  if (t === "gen") {
    console.log("The compiler generates tests and proofs from types. case is exhaustive.");
    console.log("There is no null and no throw in Sure: Maybe, Outcome, Ffi.Err, Empty.");
    console.log("");
    console.log("  sure gen JSON.dec.bool     # junk JSON must type-check; none is a proof");
    console.log("  sure gen Bool.not          # true/false apps; == proofs");
    console.log("  sure gen Nat.add.comm      # QuickCheck the lemma");
    console.log("");
    console.log("Empty name and a missing term fail. A generated app that does not check fails.");
    return;
  }
  if (t === "pkg") {
    console.log("A .sure file is a module. Names inside are unqualified.");
    console.log("Outside they are Foo.bar. Lookup: Foo.sure, then Foo/bar.sure.");
    console.log("");
    console.log("  module Foo exposing (bar, Baz)   # only these names are public");
    console.log("  import Bar                       # use Bar.foo");
    console.log("  import Bar exposing (foo)        # use foo");
    console.log("  import Bar exposing (..)         # every name Bar exposes");
    console.log("");
    console.log("A library is a package with one or more modules under src/.");
    console.log("A package lists exposed-modules. Dependents cannot use the rest.");
    console.log("stdlib names (Nat.add) are always in scope. Empty names are not modules.");
    console.log("");
    console.log("  sure new myapp");
    console.log("  sure new --package ada/boxes");
    console.log("  sure add ../lib            # local path");
    console.log("  sure add ada/boxes         # git https://github.com/ada/boxes.git");
    console.log("  sure expose Boxes          # packages only");
    console.log("  sure install               # from sure.lock");
    console.log("");
    console.log("sure.json type is application or package. sure.lock pins versions.");
    return;
  }
  if (t === "bun") {
    console.log("The compiler defaults to Node. Emitted JS: Node, or Bun with --bun.");
    console.log("Emitted JS runs on Node or Bun. Empty and junk runtime names are node.");
    console.log("");
    console.log("  sure run Main");
    console.log("  sure --bun run Main");
    console.log("  SURE_RUNTIME=bun sure run Main");
    console.log("  bun bin/js/src/main.js run Main");
    console.log("");
    console.log("http_listen uses Bun.serve when Bun is defined, else Node http.");
    console.log("sure --bun with no bun on PATH fails.");
    return;
  }
  if (t === "worker") {
    console.log("Run a named JSON job off the main thread. Node uses worker_threads; Bun uses Worker.");
    console.log("");
    console.log("  Worker.run(\"Sure.ffi.add\", JSON.enc.list<Nat>(JSON.enc.nat, [2, 3]))");
    console.log("  Worker.run_nat(\"Sure.worker.double\", [21])");
    console.log("  Worker.map(\"Sure.worker.double\", [JSON.enc.nat(1), JSON.enc.nat(2)])");
    console.log("");
    console.log("The worker sees Math.* and Sure.ffi.add / Sure.worker.double, not main-thread objects.");
    console.log("Empty name, a/b, missing function, bad JSON, and throws are Worker.Err.");
    console.log("An empty map is ok([]) and does not spawn a thread.");
    console.log("sure doc Worker.run");
    return;
  }
  if (t === "db") {
    console.log("A store is a named map. Values are strings. Empty keys are not keys.");
    console.log("");
    console.log("  Db.connect(\"suremem:app\")     # process memory");
    console.log("  Db.connect(\"surefile:app.json\") # JSON file");
    console.log("  Db.set / get / has / del / keys / clear");
    console.log("  Db.with(\"suremem:t\", (c) ... ) # close after use");
    console.log("");
    console.log("Query text is GET/SET/DEL/HAS/KEYS/CLEAR. Empty and junk queries are none.");
    console.log("A key may not be empty or contain a newline. A corrupt JSON file is bad_file, not {}.");
    console.log("postgres:// is not a store (no partial backend).");
    console.log("sure doc Db.connect");
    return;
  }
  if (t === "debug") {
    console.log("Debug levels: off | error | info | trace. Empty and junk names are none.");
    console.log("Channels: host | term | holes | qc | all. Junk tokens are ignored.");
    console.log("An empty --debug-opt opens every channel. A set opt keeps only those channels.");
    console.log("");
    console.log("  sure debug Nat.add                 # type, holes, traces");
    console.log("  sure debug Nat.add --norm --json");
    console.log("  sure prove --debug                 # same as --debug=trace");
    console.log("  sure prove --debug=info --debug-opt=term,holes");
    console.log("  sure qc Nat.add.comm --debug --debug-opt=qc");
    console.log("  sure run --debug --debug-opt=host  # stderr host asks");
    console.log("  SURE_DEBUG=trace SURE_DEBUG_OPT=host,qc");
    console.log("");
    console.log("Host asks log to stderr. yield is logged only at trace.");
    console.log("Params and replies redact after 80 chars and after a newline.");
    console.log("sure debug with no name, a missing term, and --debug=junk all exit 1.");
    console.log("sure doc Sure.Debug.Level");
    return;
  }
  if (t === "lsp") {
    console.log("sure lsp is a stdio Language Server. Empty methods and empty URIs are none.");
    console.log("");
    console.log("  sure lsp");
    console.log("  VS Code: editors/vscode (language sure, files *.sure)");
    console.log("");
    console.log("initialize, hover, definition, completion, format, rename,");
    console.log("references, document symbols, highlight, workspace symbols, code actions.");
    console.log("Hover, definition, symbols, and rename walk Sure.Defs.read / Sure.Term");
    console.log("(ori/ref) and Sure.Term.show. Binders still use compiler.ident_bindings.");
    console.log("Strings and comments are not identifiers.");
    console.log("didOpen / didChange / didClose / didSave publish diagnostics.");
    console.log("Junk methods with an id are Method not found. Parse errors are -32700.");
    console.log("sure help debug");
    return;
  }
  if (t === "pipe") {
    console.log("Finite list pipelines and CSV tables. Empty input is empty output.");
    console.log("");
    console.log("  Sure.Pipe.map / filter / bind / take / drop / zip / scan");
    console.log("  Sure.Pipe.range / once / from_maybe / replicate");
    console.log("  Sure.Pipe.decode Parse.nat  # junk strings are dropped, never 0");
    console.log("  Sure.Pipe.chunks(0, xs) == []   Sure.Pipe.windows(0, xs) == []");
    console.log("  Sure.Csv.read / show / col / nats");
    console.log("");
    console.log("Empty CSV is no rows. Unclosed quotes still yield a field.");
    console.log("sure doc Sure.Pipe.map");
    return;
  }
  if (t === "time") {
    console.log("Unix-epoch milliseconds. Years before 1970 and impossible dates are none.");
    console.log("");
    console.log("  Time.now                         # IO Stamp");
    console.log("  Time.read(\"1970-01-01T00:00:00Z\")");
    console.log("  Time.Duration.read(\"1s\")          # empty and junk are none");
    console.log("  Time.from_parts / Time.to_parts / Time.iso");
    console.log("");
    console.log("Duration units: ms, s, m, h, d. A bare number is milliseconds.");
    console.log("Time.div(n, 0) is 0. Time.mod(n, 0) is n.");
    console.log("sure doc Time.now");
    return;
  }
  if (t === "cli") {
    console.log("Program flags after --run. `--name` and `--name=value`. Empty names are not flags.");
    console.log("");
    console.log("  Sure.Cli.load");
    console.log("  Sure.Cli.parse([\"--n=8\", \"file\"])");
    console.log("  Sure.Cli.flag(c, \"n\")   # present?");
    console.log("  Sure.Cli.get(c, \"n\")    # some(\"8\")");
    console.log("");
    console.log("`--` ends flags. A token that is not a flag is rest.");
    console.log("sure doc Sure.Cli.parse");
    return;
  }
  if (t === "log") {
    console.log("Application log lines. off emits nothing. Empty tag is allowed.");
    console.log("");
    console.log("  Sure.Log.put(have, Sure.Debug.Level.info, \"db\", \"ok\")");
    console.log("  Sure.Log.format(have, need, tag, msg)  # none when below need");
    console.log("");
    console.log("Levels are Sure.Debug.Level: off | error | info | trace.");
    console.log("sure doc Sure.Log.put");
    return;
  }
  if (t === "repl") {
    console.log("Interactive checker. Empty line is ignored. Junk commands are none.");
    console.log("");
    console.log("  sure repl");
    console.log("  :help :quit :check :prove :type :goal :fill :debug :norm :run :docs");
    console.log("");
    console.log(":check with no name fails. :xyz is not a command.");
    console.log("sure help test");
    return;
  }
  if (t === "test") {
    console.log("Bounded CI: prover list, checks, Main, Test.main, prove-edge cases.");
    console.log("");
    console.log("  sure test");
    console.log("  sure --test");
    console.log("  sure Test.main --run     # Test.ci.suite then Test.host");
    console.log("  sure Test.full --run     # unbounded Test.suite (not CI)");
    console.log("");
    console.log("A failing test or a false equality exits 1. Prove.all is not CI.");
    console.log("sure help cover");
    return;
  }
  if (t === "cover") {
    console.log("Public API coverage vs lemmas and Test.suite. Need 90%.");
    console.log("");
    console.log("  sure cover");
    console.log("  sure cover --fail");
    console.log("");
    console.log("Empty, junk, and missing cases count. Kind internals and parked numeric clones do not.");
    console.log("sure help test");
    return;
  }
  if (t === "env") {
    console.log("Process environment. Empty names are not names. Empty values are values.");
    console.log("");
    console.log("  Sure.Env.get(\"PATH\")");
    console.log("  Sure.Env.get_or(\"PORT\", \"80\")");
    console.log("  Sure.Env.nat(\"N\")     # junk is junk, not 0");
    console.log("  Sure.Env.bool(\"OK\")   # only true/false");
    console.log("  Sure.Env.flag(\"X\")    # missing/empty/0/false/off/no are false");
    console.log("  Sure.Env.set / del / has / keys");
    console.log("");
    console.log("An unset name is missing. \"\" as a value is some(\"\"), not missing.");
    console.log("sure doc Sure.Env.get");
    return;
  }
  if (t === "cfg") {
    console.log("JSON object config. Empty or whitespace is {}. Junk, leftover, and a non-object are none.");
    console.log("");
    console.log("  Sure.Cfg.read(\"{\\\"n\\\":\\\"8\\\"}\")");
    console.log("  Sure.Cfg.get / str / nat / bool / flag / has / set / del / overlay");
    console.log("  Sure.Cfg.get_or(c, \"PORT\", \"80\")");
    console.log("  Sure.Cfg.from_cli(c)     # --name is true; --name=value; last wins");
    console.log("  Sure.Cfg.from_env([\"PORT\"])");
    console.log("  Sure.Cfg.pick(file, env, cli)  # cli wins; objects merge deep");
    console.log("  Sure.Cfg.load(\"app.json\")     # empty path is empty_path");
    console.log("");
    console.log("Missing file is missing. load_or_empty turns only missing into {}.");
    console.log("nat accepts digit strings; bool accepts true/false/0/1. Empty keys are not keys.");
    console.log("sure doc Sure.Cfg.read");
    return;
  }
  if (t === "ssr") {
    console.log("Server HTML pages, SSE, a KV DSL, and migrations. Empty names are not names.");
    console.log("");
    console.log("  Sure.Ssr.ok(\"T\", Html.p([Html.text(\"hi\")]))");
    console.log("  Sure.Ssr.get(\"/\", (req, b) IO { return Sure.Ssr.from_page(Sure.Ssr.ok(\"T\", Html.p([]))) })");
    console.log("  Sure.Ssr.Reply.sse(\"ticks\")     # empty bus is empty_bus");
    console.log("  Sure.Sse.frame(\"\", \"hi\")        # empty event is message");
    console.log("  Db.Dsl.read(\"ROW SET user 1 {}\")");
    console.log("  Db.Mig.up(conn, [step])         # re-run applies 0");
    console.log("");
    console.log("Leftover JSON is not config. Missing mig log is no steps. No SSE clients is 0.");
    console.log("sure doc Sure.Ssr.run");
    return;
  }
  if (t === "ui") {
    console.log("Elm-like pages. sandbox has no effects. element has Cmd and Sub.");
    console.log("");
    console.log("  Sure.Ui.sandbox(init, view, update)");
    console.log("  Sure.Ui.element(init, boot, view, update, subs)");
    console.log("  Sure.Ui.Cmd.none | http url msg | post url body msg | tick ms msg | push msg | batch");
    console.log("  Sure.Ui.Sub.none | every ms msg | sse path msg | batch");
    console.log("");
    console.log("Empty Cmd text is none. Empty HTTP URL is not a request. every(0) is none.");
    console.log("Empty SSE path is none. Unknown messages leave the model.");
    console.log("  sure build --html Sure.Ui.Counter.client");
    console.log("  sure build --html Sure.Ui.Tick.client");
    console.log("  sure build --html Sure.Ui.Probe.client");
    console.log("  sure build --html Sure.Ui.Boot.client");
    console.log("  sure build --html Sure.Sheet.client");
    console.log("  sure run Sure.Sheet.serve          # :8765 HTML + SSE 10000 rows");
    console.log("  Column names and widths save to surefile:sheet-cols.json");
    console.log("  sure build --html Sure.Tweeter.client");
    console.log("  sure run Sure.Tweeter.serve        # :8766 login, tweets, upload");
    console.log("sure doc Sure.Ui.sandbox");
    return;
  }
  if (t === "web") {
    console.log("Timed Html.Client / Sure.Ui / Sure.Ssr / Http.App / Sheet.window bench.");
    console.log("Each line runs real draw/step/match work and prints a checksum (work=).");
    console.log("n=0 is no work. Junk match and unknown clicks keep the model.");
    console.log("");
    console.log("  sure Sure.Web.bench --run");
    console.log("");
    console.log("  html.draw / html.step / html.step.junk");
    console.log("  ui.draw / ui.step");
    console.log("  ssr.document / ssr.not_found / ssr.fire.nil");
    console.log("  app.match.hit / app.match.junk / app.fire.nil");
    console.log("  sheet.window.10k / html.escape.junk / html.escape.empty");
    console.log("");
    console.log("sure bench times type-check. This times the web runtime.");
    return;
  }
  if (t === "ffi") {
    console.log("Call JS/TS from Sure. Arguments and results are JSON, never a raw JS object.");
    console.log("");
    console.log("  Ffi.call(\"Math.abs\", JSON.array([JSON.enc.nat(2)]))");
    console.log("  Ffi.call_nat(\"Sure.ffi.add\", [2, 3])");
    console.log("");
    console.log("Register: globalThis.SURE_FFI[\"my.fn\"] = (a, b) => a + b");
    console.log("Dotted names walk globalThis (Math.max) without eval.");
    console.log("Empty name, missing function, bad JSON, and throws are Ffi.Err — not a Sure value.");
    console.log("sure doc Ffi.call");
    return;
  }
  if (t === "emit") {
    console.log("sure build writes JavaScript only after the program checks and theorems prove.");
    console.log("");
    console.log("  sure build              # dist/Main.js");
    console.log("  sure build --html T     # dist/T.html (self-contained page)");
    console.log("  sure run                # uses dist/ when it is fresh");
    console.log("");
    console.log("Compilation keeps definitions reachable from the entry term.");
    console.log("Unused module functions, proofs, stdlib, and IO host slices are dropped.");
    console.log("A computed IO.ask query keeps the full host.");
    console.log("");
    console.log("Term names look like Main or Html.Counter.client.");
    console.log("Paths like ../x are not files.");
    return;
  }
  print_help_all();
}

function print_help_all() {
  console.log("# Sure " + SURE_VERSION + " (Legacy Kind " + KIND_LINEAGE + ")");
  console.log("");
  console.log("  sure new <name>              # scaffold; prints the next commands");
  console.log("  sure prove [Term...]         # type-check theorems");
  console.log("  sure build [Term]            # prove + emit dist/<Term>.js (tree-shaken)");
  console.log("  sure build --html [Term]     # emit dist/<Term>.html (Html.Client)");
  console.log("  sure emit [Term]             # same as build");
  console.log("  sure run [Term]              # emit dist/ if needed, then spawn");
  console.log("  sure watch                   # re-check theorems on src change");
  console.log("  sure cache stats|clean       # cache index, atomic no-op writes");
  console.log("  sure --bun run [Term]        # spawn emitted JS with Bun");
  console.log("  sure check <Term>            # type-check");
  console.log("  sure doc <Term>              # comment + type");
  console.log("  sure goal <Term>             # remaining holes");
  console.log("  sure debug <Term>            # type + holes + traces");
  console.log("  sure prove --debug=trace     # off|error|info|trace");
  console.log("  sure run --debug-opt=host    # host|term|holes|qc|all");
  console.log("  sure fill code|||term        # replace ?implement and recheck");
  console.log("  sure qc <Law>                # sample a lemma");
  console.log("  sure gen <Term>              # generate tests and proofs from the type");
  console.log("  sure impact <Name>           # callers + proofs");
  console.log("  sure theorems [Name]         # specs about a name");
  console.log("  sure deps <Name>             # names this definition uses");
  console.log("  sure graph <Name>            # dependency graph");
  console.log("  sure bench <Term>            # time type-check");
  console.log("  sure fmt <Term>              # pretty-print");
  console.log("  sure test                    # prover + runtime + edges");
  console.log("  sure cover                   # public API coverage, need 90%");
  console.log("  sure repl                    # :help :check :prove :quit");
  console.log("  sure lsp                     # language server (VS Code: editors/vscode)");
  console.log("  sure agent                   # JSON-RPC compiler-as-tool");
  console.log("  sure add / remove            # dependencies");
  console.log("  sure install                 # materialize sure.lock");
  console.log("  sure expose <Module>         # package public modules");
  console.log("  sure Term --js / --run       # compile or run one term");
  console.log("");
  console.log("  sure help prove | json | html | emit | ffi | gen | pkg | bun | worker | db | debug | lsp | pipe | time | cli | log | repl | test | env | cfg | ssr | ui | web");
  console.log("  SURE_RUNTIME=bun             # same as --bun");
  console.log("");
  console.log("SURE_BASE  stdlib directory.  kind  is still accepted as a command name.");
}

  return {
    sure_help_topic: sure_help_topic,
    print_help: print_help,
    print_help_topic: print_help_topic,
    print_help_all: print_help_all
  };
};
