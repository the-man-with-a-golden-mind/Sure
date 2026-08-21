#!/usr/bin/env -S node --stack-size=10000

var compiler = require("./compiler");
var kind = require("./sure.js");
(function alias_kind_ns(obj) {
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf("Kind.") === 0) {
      var s = "Sure." + k.slice(5);
      if (obj[s] == null) obj[s] = obj[k];
    } else if (k.indexOf("Sure.") === 0) {
      var s = "Kind." + k.slice(5);
      if (obj[s] == null) obj[s] = obj[k];
    }
  }
})(kind);
globalThis.__sureParserModules = !!(kind["Sure.Parser.file.mod"] || kind["Kind.Parser.file.mod"]);
function checker(name) {
  return kind["Sure." + name] || kind["Kind." + name];
}
var fs = require("fs");
var fsp = require("fs").promises;
var path = require("path");
var exec = require("child_process").execSync;
var spawnSync = require("child_process").spawnSync;

function run_spawn(cmd, args, opts) {
  var r = spawnSync(cmd, args || [], Object.assign({encoding: "utf8"}, opts || {}));
  if (r.error) throw r.error;
  if (r.status) {
    var err = new Error(String(r.stderr || r.stdout || "spawn failed"));
    err.status = r.status;
    throw err;
  }
  return r.stdout;
}
var formcore_path = path.join(__dirname, "../../../vendor/formcore-js");
var {fmc_to_js} = require(formcore_path);

var PKG = require("./../package.json");
var SURE_VERSION = PKG.version;
var KIND_LINEAGE = "1.0.121";
var ADD_PATH = "";
var ORIG_CWD = process.cwd();
var STDLIB_BASE = null;

// Bounded gates. Prove.all / Test.suite / Sure.*.all are Unit bundles and are not CI.
var BOUNDED_THEOREMS = [
  "Example.Spec.add2",
  "Stream.take.zero",
  "Host.decode.untagged",
  "Host.decode.empty",
  "IO.tagged.payload.ok",
  "IO.tagged.payload.err",
  "Sure.Synth.load.cached.roundtrip",
  "Sure.Synth.load.cached.decode.empty",
  "Sure.Synth.load.cached.decode.junk",
  "Html.ok_ident.junk",
  "DOM.render.junk_tag",
  "Sure.Mod.resolve.short",
  "Sure.Mod.resolve.imp",
  "Sure.Mod.resolve.imp_type",
  "Sure.Mod.from_imp.dotdot",
  "Sure.Mod.from_imp.open.miss",
  "Host.encode.all.fs_open",
  "Proc.pack.empty",
  "Proc.join_args.empty",
  "Proc.join_args.nl",
  "Sure.Synth.load.cached.file_ok.empty",
  "Sure.Synth.load.cached.file_ok.dotdot",
  "Sure.Synth.load.cached.file_ok.rel",
  "Sure.Synth.load.cached.file_ok.foreign",
  "Sure.Synth.load.cached.file_ok.under"
];
var BOUNDED_CHECKS = [
  "Nat.add",
  "List.map",
  "Bool.not",
  "Main",
  "Path.from_string",
  "File.bracket",
  "IO.bind"
];
// --lib uses the same bounded set. Prove.all is not a theorem and is unbounded.
var PRELUDE_TERMS = [
  "Nat.add",
  "List.map",
  "Equal.rewrite",
  "Bool.not",
  "Maybe.default",
  "IO.bind",
  "Main",
  "Host.perform",
  "Prove.all",
  "Test.suite",
  "File.read",
  "Http.request",
  "Path.from_string",
  "JSON.parse",
  "Task.both",
  "Word.from_bits.zero",
  "Sure.Term.bind.holes.ref",
  "Sure.Agent.Method.roundtrip",
  "Sure.name.def",
  "Http.Path.bound.user42",
  "Proc.decode.hi",
  "Http.App.hit.get_id",
  "Db.decode_text.ok",
  "Sure.Agent.fill.def",
  "Outcome.http.ok",
  "Http.Method.read.get",
  "Http.App.get.is_get",
  "Email.from_string.at",
  "Bytes.roundtrip.empty",
  "Proc.Signal.read_show.term",
  "Semver.parse.v123",
  "Stream.take.zero",
  "Example.Spec.add2",
  "Example.Spec.edge",
  "Sure.Prove.all",
  "Sure.Agent.uses.nat",
  "Sure.Agent.is_theorem_line.eq",
  "Sure.Agent.has_implement.no",
  "Sure.Doc.all",
  "Net.udp.all",
  "Crypto.all",
  "Sure.Agent.deps.all",
  "Sure.Agent.Edge.all",
  "Sure.Build.all",
  "Sure.Bench.all",
  "Sure.Qc.all",
  "Sure.Pipe.all",
  "Sure.Csv.all",
  "Sure.Agent.all",
  "Html.all",
  "Sure.Emit.all",
  "JSON.all",
  "Sure.How.all",
  "Ffi.all",
  "Sure.Total.all",
  "Sure.Mod.all",
  "Regex.all",
  "Parse.all",
  "Bytes.all",
  "F64.all",
  "Bits.to_string.all",
  "Nat.parse_decimal.all",
  "Parser.f64.all",
  "String.hex.decode.utf8.all",
  "String.ops.all",
  "Sure.Runtime.all",
  "Sure.Par.all",
  "Worker.all",
  "Db.all",
  "Sure.Debug.all",
  "Sure.Lsp.all",
  "Time.all",
  "Date.all",
  "Sure.Cli.all",
  "Sure.Log.all",
  "Sure.Repl.all",
  "Sure.Env.all",
  "Sure.Cfg.all",
  "Sure.Ssr.all",
  "Sure.Sse.all",
  "Db.Dsl.all",
  "Db.Mig.all",
  "Sure.Ui.all",
  "Sure.Sheet.all",
  "Sure.Tweeter.all",
  "Sure.Check.all",
  "Host.all",
];

function relative_inside(root, start) {
  var rel = path.relative(root, start);
  if (!rel || rel === ".") return "";
  if (rel.startsWith("..")) return "";
  return rel + "/";
}

function is_base_dir(dir) {
  try {
    var names = fs.readdirSync(dir);
    return names.indexOf("Nat.sure") !== -1 && names.indexOf("Sure") !== -1;
  } catch (e) {
    return false;
  }
}

function env_base() {
  return process.env.SURE_BASE || process.env.KIND_BASE;
}

function find_base_dir() {
  if (env_base()) {
    var kb = path.resolve(env_base());
    if (is_base_dir(kb)) {
      process.chdir(kb);
      STDLIB_BASE = kb;
      return;
    }
    var nested = path.join(kb, "base");
    if (is_base_dir(nested)) {
      process.chdir(nested);
      return;
    }
    console.error("SURE_BASE/KIND_BASE is not a Sure base directory: " + kb);
    process.exit(1);
  }

  var dir = path.resolve(process.cwd());
  var start = dir;
  while (true) {
    if (is_base_dir(dir)) {
      ADD_PATH = relative_inside(dir, start);
      process.chdir(dir);
      return;
    }
    var nested = path.join(dir, "base");
    if (is_base_dir(nested)) {
      ADD_PATH = relative_inside(nested, start);
      process.chdir(nested);
      return;
    }
    var parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  console.error("# Sure " + SURE_VERSION);
  console.error("Couldn't find Sure base directory.");
  console.error("Run from the repo (or its base/), or set SURE_BASE (KIND_BASE still works).");
  process.exit(1);
}
find_base_dir();
STDLIB_BASE = process.cwd();

function cache_blob_key() {
  var crypto = require("crypto");
  var h = crypto.createHash("sha256");
  h.update(String(SURE_VERSION || ""));
  try { h.update(fs.readFileSync(path.join(__dirname, "sure.js"))); } catch (e) { h.update("missing-blob"); }
  try { h.update("stdlib:" + fs.realpathSync(STDLIB_BASE || process.cwd())); } catch (e) { h.update("stdlib:" + String(STDLIB_BASE || "")); }
  try { h.update("cwd:" + fs.realpathSync(ORIG_CWD || process.cwd())); } catch (e) { h.update("cwd:" + String(ORIG_CWD || "")); }
  return h.digest("hex").slice(0, 16);
}
if (!process.env.SURE_CACHE_KEY) process.env.SURE_CACHE_KEY = cache_blob_key();

function patch_cache_off_fs() {
  if (process.env.SURE_CACHE !== "0") return;
  var orig = fs.readFileSync;
  fs.readFileSync = function(p, enc) {
    var s = String(p || "").replace(/\\/g, "/");
    if (/(^|\/)\.cache(\/|$)/.test(s)) {
      var err = new Error("ENOENT: cache off " + s);
      err.code = "ENOENT";
      throw err;
    }
    return orig.apply(this, arguments);
  };
}
patch_cache_off_fs();

async function find_kind_files(dir) {
  try {
    var files = await fsp.readdir(dir);
    var found = [];
    for (let file of files) {
      var name = path.join(dir, file);
      var stat = await fsp.stat(name);
      if (stat.isDirectory()) {
        var child_found = await find_kind_files(name);
        for (let child_name of child_found) {
          found.push(child_name);
        }
      } else if (name.slice(-5) === ".sure") {
        found.push(name);
      }
    }
  } catch (e) {
    console.log("Not a directory: " + dir);
    process.exit(1);
  }
  return found;
}

function array_to_list(arr) {
  var list = {_: "List.nil"};
  for (var i = arr.length - 1; i >= 0; --i) {
    list = {_: "List.cons", head: arr[i], tail: list};
  }
  return list;
}

function sure_help_topic(s) {
  s = String(s || "").trim();
  if (!s) return "start";
  if (s === "all" || s === "prove" || s === "json" || s === "html" || s === "emit" || s === "ffi" || s === "gen" || s === "pkg" || s === "bun" || s === "worker" || s === "db" || s === "debug" || s === "lsp" || s === "pipe" || s === "time" || s === "cli" || s === "log" || s === "repl" || s === "test" || s === "cover" || s === "env" || s === "cfg" || s === "ssr" || s === "ui" || s === "web") return s;
  return null;
}

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

function print_help() {
  print_help_topic("start");
}

function print_help_topic(topic) {
  var t = sure_help_topic(topic);
  if (!t) {
    console.error("unknown help topic: " + topic);
    console.error("try: sure help prove | json | html | emit | ffi | gen | pkg | bun | worker | db | debug | lsp | pipe | time | cli | log | repl | test | env | cfg | ssr | ui | web | all");
    process.exit(1);
  }
  if (t === "start") {
    console.log("# Sure " + SURE_VERSION);
    console.log("");
    console.log("Write .sure files. The type checker proves them. Then you emit JavaScript.");
    console.log("");
    console.log("  sure new myapp");
    console.log("  sure new --package ada/boxes");
    console.log("  cd myapp");
    console.log("  sure prove              # theorems must check");
    console.log("  sure gen JSON.dec.bool  # tests and proofs from the type");
    console.log("  sure build              # writes dist/Main.js");
    console.log("  sure run                # node; sure --bun run for Bun");
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
    console.log("Format, symbols, rename, references, highlight, and completion use");
    console.log("compiler.parse_document / compiler.idents (strings and comments skipped).");
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
    console.log("Run the prover, the runtime suite, and the prove-edge cases.");
    console.log("");
    console.log("  sure test");
    console.log("  sure --test");
    console.log("");
    console.log("A failing test or a false equality exits 1.");
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
  console.log("  sure run [Term]              # run dist/ or compile");
  console.log("  sure --bun run [Term]        # run emitted JS with Bun");
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

function is_file(name){
  return name.slice(-5) === ".sure"
}

function display_error(name, error){
  if(is_file(name)){
    console.log("Cannot compile a file (<main>.sure). Choose a term and try again.");
  } else {
    console.log("Compilation error.");
    console.log(error);
  }
}

function is_proof_type(t) {
  var s = String(t || "").replace(/\s+/g, " ").trim();
  if (!s) return false;
  if (/\s==\s/.test(s) || /==$/.test(s)) return true;
  if (/^Equal\b/.test(s) || s.indexOf("Equal(") >= 0) return true;
  if (/^Not\s*\(\s*Equal\b/.test(s) || s.indexOf("Not(Equal") >= 0) return true;
  return false;
}

function shown_has_hole(term) {
  var s = String(term || "");
  if (!s) return false;
  var stripped = "";
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch === "\"" || ch === "'") {
      var q = ch;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === "\\") i++;
        i++;
      }
      continue;
    }
    stripped += ch;
  }
  if (/(^|[^A-Za-z0-9._])_(|[^A-Za-z0-9._])/.test(stripped)) return true;
  if (/(^|[^A-Za-z0-9._])\?[A-Za-z0-9._-]*/.test(stripped)) return true;
  return false;
}

function src_explicit_hole(code) {
  var lines = String(code || "").split("\n");
  var body = [];
  var inBody = false;
  function is_hole_body(t) {
    t = String(t || "").trim();
    if (!t) return false;
    if (t === "_" || t === "admit") return true;
    if (t.charAt(0) === "?") return true;
    return false;
  }
  var hole = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var header = def_header(line);
    if (header && !/^\s/.test(line)) {
      if (inBody && is_hole_body(body.join("\n"))) hole = true;
      inBody = true;
      body = [];
      continue;
    }
    if (inBody) body.push(line);
  }
  if (inBody && is_hole_body(body.join("\n"))) hole = true;
  return hole;
}

function residual_hole_diag(name, type) {
  return {
    def: name || "",
    error: {
      code: "residual_hole",
      name: "_",
      goal: type || "",
      proof_obligation: true
    }
  };
}

function report_with_holes(report, name) {
  report = report || {};
  var ty = ((report.types || [])[0] || {}).type || "";
  var diags = (report.diagnostics || []).slice();
  diags.push(residual_hole_diag(name, ty));
  var types = (report.types || []).slice();
  return Object.assign({}, report, {ok: false, diagnostics: diags, types: types});
}

function src_looks_unsolved(src) {
  var s = String(src || "");
  if (!s) return false;
  if (src_explicit_hole(s)) return true;
  if (s.indexOf("?implement") >= 0) return true;
  if (/(^|[^A-Za-z0-9._])admit(?:$|[^A-Za-z0-9._])/.test(s)) return true;
  if (/(^|[^A-Za-z0-9._])_(|[^A-Za-z0-9._])/.test(s.replace(/"(?:\\.|[^"\\])*"/g, "\"\""))) return true;
  return false;
}

function named_def_source(name) {
  if (!name) return "";
  var f = file_of_name(name);
  if (!f || !fs.existsSync(f)) return "";
  var body;
  try { body = fs.readFileSync(f, "utf8"); } catch (e) { return ""; }
  var lines = body.split("\n");
  var start = -1;
  var short = name.split(".").pop();
  for (var i = 0; i < lines.length; i++) {
    var h = def_header(lines[i]);
    if (!h || /^\s/.test(lines[i])) continue;
    if (h[1] === name || h[1] === short) { start = i; break; }
  }
  if (start < 0) return body;
  var chunk = [lines[start]];
  for (var j = start + 1; j < lines.length; j++) {
    var h2 = def_header(lines[j]);
    if (h2 && !/^\s/.test(lines[j])) break;
    chunk.push(lines[j]);
  }
  return chunk.join("\n");
}

async function gate_residual_holes(name, report, code) {
  if (!report || report.ok === false) return report;
  if (code && src_explicit_hole(code)) return report_with_holes(report, name);
  var src = code || (name ? named_def_source(name) : "");
  if (src && src_explicit_hole(src)) return report_with_holes(report, name);
  var ty = ((report.types || [])[0] || {}).type || "";
  var need_show = !src || src_looks_unsolved(src) || is_proof_type(ty);
  if (name && need_show && (!src || src.length < 8000)) {
    try {
      var shown = await agent_show(name, false);
      if (shown && shown.ok && shown_has_hole(shown.term)) {
        return report_with_holes(report, name);
      }
    } catch (e) {}
  }
  return report;
}

function scan_src_theorems(dir) {
  var out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  var files = collect_kind_files(dir);
  for (var i = 0; i < files.length; i++) {
    var body;
    try { body = fs.readFileSync(files[i], "utf8"); } catch (e) { continue; }
    var parsed = compiler.parse_module_headers(body);
    var mod = parsed.mod && parsed.mod.name;
    var syms = compiler.symbols(body);
    for (var j = 0; j < syms.length; j++) {
      if (!syms[j].theorem) continue;
      var name = syms[j].name;
      if (mod && name.indexOf(".") < 0) name = mod + "." + name;
      out.push(name);
    }
  }
  return out;
}

function uniq_names(names) {
  var seen = {};
  var uniq = [];
  for (var i = 0; i < names.length; i++) {
    if (!seen[names[i]]) { seen[names[i]] = true; uniq.push(names[i]); }
  }
  return uniq;
}

function default_prove_names() {
  var manFile = find_manifest(ORIG_CWD);
  if (manFile) {
    var names = [];
    try {
      var man = read_manifest(manFile);
      if (man.theorems && man.theorems.length) names = names.concat(man.theorems);
      var src = path.join(path.dirname(manFile), man.src || "src");
      names = names.concat(scan_src_theorems(src));
    } catch (e) {}
    if (names.length) return uniq_names(names);
  }
  return ["Example.Spec.add2"];
}

function annotate_proof_report(report) {
  if (!report) return report;
  var types = report.types || [];
  for (var i = 0; i < types.length; i++) {
    types[i].proof = is_proof_type(types[i].type);
  }
  var diags = report.diagnostics || [];
  for (var j = 0; j < diags.length; j++) {
    var err = diags[j].error || diags[j];
    if (err && (is_proof_type(err.goal) || is_proof_type(err.expected))) {
      err.proof_obligation = true;
    }
  }
  return report;
}

function proof_obligations_of(report) {
  var diags = (report && report.diagnostics) || [];
  var out = [];
  for (var i = 0; i < diags.length; i++) {
    var err = diags[i].error || diags[i];
    if (err && err.proof_obligation) out.push(diags[i]);
  }
  return out;
}

function report_is_ok(report) {
  if (!report || report.ok === false) return false;
  var ty = (report.types && report.types[0]) || {};
  if (report.diagnostics && report.diagnostics.length && !ty.name) return false;
  return true;
}

function prove_result(name, report) {
  report = annotate_proof_report(report);
  var types = (report && report.types) || [];
  var ty = types[0] || {};
  var ok = report_is_ok(report);
  return {
    ok: ok,
    proved: !!(ok && ty.proof),
    checked: ok,
    name: ty.name || name || "",
    type: ty.type || "",
    proof: !!ty.proof,
    proof_obligations: proof_obligations_of(report),
    types: types,
    diagnostics: (report && report.diagnostics) || [],
  };
}

function report_failed(text) {
  return /Type mismatch|Undefined reference|Can't infer|Term not found|Compilation error|failed/i.test(text);
}

async function check_term(name, as_json) {
  var fn = as_json && checker("api.io.check_term_json")
    ? checker("api.io.check_term_json")
    : checker("api.io.check_term");
  if (as_json && !checker("api.io.check_term_json")) {
    await kind.run(checker("api.io.check_term")(name));
    console.error("# --json: structured API not in this compiler blob; pretty report printed.");
    return;
  }
  await kind.run(fn(name));
}

function check_output_ok(text) {
  return text.indexOf("All terms check.") !== -1 &&
    !/Type mismatch|Undefined reference|Can't infer|Expected |Goal \?|residual hole|Unsolved hole/.test(text);
}

async function check_term_ok(name) {
  var chunks = [];
  var write = process.stdout.write;
  process.stdout.write = function(chunk, enc, cb) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return write.call(process.stdout, chunk, enc, cb);
  };
  try {
    await kind.run(checker("api.io.check_term")(name));
  } finally {
    process.stdout.write = write;
  }
  var text = chunks.join("");
  if (!check_output_ok(text)) {
    console.log("prover fail: " + name);
    return 1;
  }
  var gated = await gate_residual_holes(name, {ok: true, types: [{name: name, type: ""}]}, null);
  if (gated && gated.ok === false) {
    console.log("prover fail: " + name + " (residual hole)");
    return 1;
  }
  return 0;
}

async function check_prelude() {
  var failed = 0;
  var terms = BOUNDED_CHECKS.concat(BOUNDED_THEOREMS);
  for (var i = 0; i < terms.length; i++) {
    try {
      failed += await check_term_ok(terms[i]);
    } catch (e) {
      console.log("prelude fail: " + terms[i]);
      console.log(e);
      failed += 1;
    }
  }
  return failed;
}

function find_manifest(start) {
  var dir = path.resolve(start);
  while (true) {
    var sure = path.join(dir, "sure.json");
    if (fs.existsSync(sure)) return sure;
    var legacy = path.join(dir, "kind.json");
    if (fs.existsSync(legacy)) return legacy;
    var parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function prepend_path_env(extra) {
  if (!extra) return;
  var cur = process.env.SURE_PATH || process.env.KIND_PATH || "";
  var joined = extra + (cur ? ":" + cur : "");
  process.env.SURE_PATH = joined;
  process.env.KIND_PATH = joined;
}

function read_manifest(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function write_manifest(file, man) {
  fs.writeFileSync(file, JSON.stringify(man, null, 2) + "\n");
}

function man_kind(man) {
  return man && man.type === "package" ? "package" : "application";
}

function man_src_dirs(man, root) {
  var dirs = man && man["source-directories"];
  if (!Array.isArray(dirs) || !dirs.length) dirs = [man && man.src ? man.src : "src"];
  return dirs.map(function(d) { return path.resolve(root, String(d)); });
}

function man_direct(man) {
  var d = (man && man.dependencies) || {};
  if (d && typeof d === "object" && (d.direct || d.indirect) && !d.path && !d.git && !d.version) {
    var direct = d.direct || {};
    if (typeof direct === "object" && !Array.isArray(direct)) return direct;
  }
  var flat = {};
  Object.keys(d).forEach(function(k) {
    if (k !== "direct" && k !== "indirect") flat[k] = d[k];
  });
  return flat;
}

function man_set_direct(man, name, spec) {
  var cur = man_direct(man);
  cur[name] = spec;
  var ind = {};
  var d = man.dependencies || {};
  if (d && d.indirect && typeof d.indirect === "object") ind = d.indirect;
  man.dependencies = {direct: cur, indirect: ind};
  return man;
}

function man_exposed(man) {
  var xs = man && man["exposed-modules"];
  if (!Array.isArray(xs)) return [];
  return xs.map(String);
}

function pkg_mod_name(pkg) {
  var last = String(pkg || "").split("/").pop() || "";
  var parts = last.split("-").filter(Boolean);
  return parts.map(function(p) {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join("");
}

function github_url_of(spec) {
  if (!spec) return "";
  if (/^https?:\/\/|^git@/.test(spec)) return spec;
  if (mod_pkg_ok(spec)) return "https://github.com/" + spec + ".git";
  return "";
}

function dep_root(root, name, spec) {
  if (spec && spec.path) return path.resolve(root, spec.path);
  return path.join(root, "sure_modules", name);
}

function dep_src_paths(root, name, spec) {
  var dest = dep_root(root, name, spec);
  if (!fs.existsSync(dest)) return [];
  var depMan = path.join(dest, "sure.json");
  if (fs.existsSync(depMan)) {
    try {
      return man_src_dirs(read_manifest(depMan), dest).filter(function(p) { return fs.existsSync(p); });
    } catch (e) {}
  }
  var src = path.join(dest, "src");
  return fs.existsSync(src) ? [src] : [dest];
}

function project_src_path(manFile) {
  var root = path.dirname(manFile);
  var man = read_manifest(manFile);
  var extras = man_src_dirs(man, root);
  var deps = man_direct(man);
  Object.keys(deps).forEach(function(n) {
    dep_src_paths(root, n, deps[n]).forEach(function(p) { extras.push(p); });
  });
  return extras.filter(function(p) { return fs.existsSync(p); }).join(":");
}

function apply_project_env() {
  var man = find_manifest(ORIG_CWD);
  if (!man) return;
  prepend_path_env(project_src_path(man));
}

var _compiler_input_hash = null;

function hash_kind_tree(h, root) {
  if (!root || !fs.existsSync(root)) return;
  var files = collect_kind_files(root).sort();
  for (var i = 0; i < files.length; i++) {
    h.update(path.relative(root, files[i]));
    h.update("\0");
    try { h.update(fs.readFileSync(files[i])); } catch (e) { h.update("missing"); }
    h.update("\0");
  }
}

function file_fingerprint(p) {
  try {
    var st = fs.statSync(p);
    return p + ":" + st.size + ":" + st.mtimeMs;
  } catch (e) {
    return p + ":missing";
  }
}

function compiler_input_hash() {
  if (_compiler_input_hash) return _compiler_input_hash;
  var crypto = require("crypto");
  var h = crypto.createHash("sha256");
  h.update(String(SURE_VERSION || ""));
  h.update("\0");
  [
    path.join(__dirname, "main.js"),
    path.join(__dirname, "compiler.js"),
    path.join(__dirname, "gen-host.js"),
    path.join(__dirname, "sure.js"),
    path.join(formcore_path, "FmcToJs.js"),
    path.join(formcore_path, "host-schema.js"),
    path.join(formcore_path, "ws-frames.js")
  ].forEach(function(p) {
    h.update(file_fingerprint(p));
    h.update("\0");
    try { h.update(fs.readFileSync(p)); } catch (e) { h.update("missing:" + p); }
    h.update("\0");
  });
  hash_kind_tree(h, STDLIB_BASE || process.cwd());
  _compiler_input_hash = h.digest("hex");
  return _compiler_input_hash;
}

function project_src_hash(manFile, extra) {
  extra = extra || {};
  var crypto = require("crypto");
  var root = path.dirname(manFile);
  var man = read_manifest(manFile);
  var h = crypto.createHash("sha256");
  h.update(compiler_input_hash());
  h.update("\0");
  h.update(JSON.stringify({
    name: man.name,
    version: man.version || "",
    theorems: man.theorems || [],
    term: man.main || "",
    src: man.src || "",
    sourceDirectories: man["source-directories"] || [],
    dependencies: man.dependencies || {},
    html: !!extra.html,
    runtime: extra.runtime || process.env.SURE_RUNTIME || "node"
  }));
  h.update("\0");
  var lockp = lock_path(root, manFile);
  if (fs.existsSync(lockp)) {
    try { h.update(fs.readFileSync(lockp)); } catch (e) { h.update("lock-missing"); }
  } else {
    h.update("no-lock");
  }
  h.update("\0");
  var dirs = man_src_dirs(man, root);
  var seenDep = {};
  function walk_deps(atRoot, atMan) {
    var d = man_direct(atMan);
    var ind = (atMan.dependencies && atMan.dependencies.indirect) || {};
    var lock = {};
    try { lock = read_lock(atRoot, path.join(atRoot, "sure.json")); } catch (eL) {}
    Object.keys(d).concat(Object.keys(ind)).concat(Object.keys(lock)).forEach(function(n) {
      if (seenDep[n]) return;
      seenDep[n] = true;
      var spec = d[n] || ind[n] || {};
      dep_src_paths(atRoot, n, spec).forEach(function(p) { dirs.push(p); });
      var dest = dep_root(atRoot, n, spec);
      var depManFile = path.join(dest, "sure.json");
      if (fs.existsSync(depManFile)) {
        try { walk_deps(dest, read_manifest(depManFile)); } catch (eW) {}
      }
    });
  }
  walk_deps(root, man);
  String(process.env.SURE_PATH || "").split(":").forEach(function(p) {
    if (p) dirs.push(path.resolve(p));
  });
  var seen = {};
  var uniq = [];
  for (var d = 0; d < dirs.length; d++) {
    var abs = path.resolve(dirs[d]);
    if (!seen[abs] && fs.existsSync(abs)) { seen[abs] = true; uniq.push(abs); }
  }
  uniq.sort().forEach(function(dir) { hash_kind_tree(h, dir); });
  return h.digest("hex");
}

function build_stamp_path(root) {
  return path.join(root, ".sure", "build.json");
}

function read_build_stamp(root) {
  var p = build_stamp_path(root);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

function write_build_stamp(root, stamp) {
  fs.mkdirSync(path.join(root, ".sure"), {recursive: true});
  fs.writeFileSync(build_stamp_path(root), JSON.stringify(stamp, null, 2) + "\n");
}

function build_is_fresh(prev, hash, term) {
  return !!(prev && prev.ok && prev.term === term && prev.src_hash === hash);
}

function sure_emit_safe(term) {
  var t = String(term || "");
  if (!t) return false;
  if (t.indexOf("/") >= 0 || t.indexOf("\\") >= 0 || t.indexOf("..") >= 0) return false;
  if (!/^[A-Za-z][A-Za-z0-9._]*$/.test(t)) return false;
  return true;
}

function sure_emit_file(term) {
  if (!sure_emit_safe(term)) return "";
  return "dist/" + term + ".js";
}

function sure_emit_html_file(term) {
  if (!sure_emit_safe(term)) return "";
  return "dist/" + term + ".html";
}

var SURE_DOM_EVENTS = [
  "abort","afterprint","animationcancel","animationend","animationiteration","animationstart",
  "auxclick","beforeinput","beforeprint","beforeunload","blur","cancel","canplay","canplaythrough",
  "change","click","close","compositionend","compositionstart","compositionupdate","contextmenu",
  "copy","cuechange","cut","dblclick","drag","dragend","dragenter","dragleave","dragover",
  "dragstart","drop","durationchange","emptied","ended","error","focus","focusin","focusout",
  "formdata","fullscreenchange","fullscreenerror","gotpointercapture","hashchange","input",
  "invalid","keydown","keypress","keyup","languagechange","load","loadeddata","loadedmetadata",
  "loadstart","lostpointercapture","message","messageerror","mousedown","mouseenter","mouseleave",
  "mousemove","mouseout","mouseover","mouseup","offline","online","pagehide","pageshow","paste",
  "pause","play","playing","pointercancel","pointerdown","pointerenter","pointerleave","pointermove",
  "pointerout","pointerover","pointerup","popstate","progress","ratechange","reset","resize",
  "scroll","scrollend","securitypolicyviolation","seeked","seeking","select","selectionchange",
  "selectstart","slotchange","stalled","storage","submit","suspend","timeupdate","toggle",
  "touchcancel","touchend","touchmove","touchstart","transitioncancel","transitionend",
  "transitionrun","transitionstart","unhandledrejection","unload","volumechange","waiting","wheel",
  "beforematch","beforetoggle","command","open","pagereveal","pageswap","readystatechange",
  "rejectionhandled","visibilitychange"
];

function sure_dom_mount_src() {
  return "var SureDom={mount:function(app){"
    + "if(!app||typeof document==='undefined'||!document)return;"
    + "var root=null;try{root=document.getElementById?document.getElementById('sure-root'):null;}catch(_i){root=null;}"
    + "if(!root){try{if(!document.createElement)return;root=document.createElement('div');root.id='sure-root';if(!document.body||!document.body.appendChild)return;document.body.appendChild(root);}catch(_r){return;}}"
    + "if(!root)return;"
    + "if(root.__sureMounted)return;root.__sureMounted=1;"
    + "var ev=" + JSON.stringify(SURE_DOM_EVENTS) + ";"
    + "function targetOf(e){var t=e.target;while(t&&t!==document&&!(t.getAttribute&&t.getAttribute('data-sure-on-'+e.type)!=null)){t=t.parentElement;}return t;}"
    + "function wireOf(e,msg,t){if(e.type==='submit'||e.type==='mousedown')try{e.preventDefault();}catch(_p){}var val=t.value==null?'':String(t.value);if(e.type==='scroll'){try{val=String((t.scrollTop|0)||0);}catch(_s){val='0';}}return [e.type,msg,t.id||'',val,e.key||'',e.button||0,(e.clientX|0)||0,(e.clientY|0)||0,e.altKey?1:0,e.ctrlKey?1:0,e.metaKey?1:0,e.shiftKey?1:0,t.checked?1:0].join('\\n');}"
    + "function keepScroll(fn){var saved=[];try{var xs=root.querySelectorAll?root.querySelectorAll('[data-sure-scroll]'):[];for(var i=0;i<xs.length;i++)saved.push({k:(xs[i].getAttribute&&xs[i].getAttribute('data-sure-scroll'))||String(i),t:xs[i].scrollTop||0,l:xs[i].scrollLeft||0});}catch(_k){}try{fn();}catch(_d){}try{var ys=root.querySelectorAll?root.querySelectorAll('[data-sure-scroll]'):[];for(var j=0;j<ys.length;j++){var k=(ys[j].getAttribute&&ys[j].getAttribute('data-sure-scroll'))||String(j);for(var s=0;s<saved.length;s++){if(saved[s].k===k){ys[j].scrollTop=saved[s].t;ys[j].scrollLeft=saved[s].l;break;}}}}catch(_r){}}"
    + "if(app._==='Html.Client.new'){"
    + "var model=app.init;"
    + "function draw(){keepScroll(function(){root.innerHTML=app.draw(model);});}"
    + "function onEv(e){try{var t=targetOf(e);if(!t||!t.getAttribute)return;var msg=t.getAttribute('data-sure-on-'+e.type);if(msg==null)return;model=app.step(wireOf(e,msg,t))(model);draw();}catch(_e){}}"
    + "for(var i=0;i<ev.length;i++)document.addEventListener(ev[i],onEv,true);"
    + "draw();return;}"
    + "if(app._!=='Sure.Ui.Client.new')return;"
    + "var model=app.init;var bags=[];var lastSub=null;var depth=0;"
    + "function pairOf(p){if(p&&p._==='Pair.new')return p;return {_:'Pair.new',fst:p,snd:''};}"
    + "function draw(){keepScroll(function(){root.innerHTML=app.draw(model);});}"
    + "function applySub(text){text=String(text==null?'':text);if(text===lastSub)return;lastSub=text;"
    + "for(var i=0;i<bags.length;i++){try{if(bags[i].t)clearInterval(bags[i].t);if(bags[i].es)bags[i].es.close();}catch(_c){}}bags=[];"
    + "if(!text)return;var parts=text.split('\\n.\\n');"
    + "for(var i=0;i<parts.length;i++){var lines=parts[i].split('\\n');var k=lines[0]||'';"
    + "if(k==='E'){var ms=Number(lines[1])||0;var msg=lines[2]||'';if(ms>0){var t=setInterval((function(m){return function(){go('every',m,'');};})(msg),ms);bags.push({t:t});}}"
    + "else if(k==='S'){var path=lines[1]||'';var msg=lines[2]||'';if(path){try{var es=new EventSource(path);es.onmessage=(function(m){return function(ev){go('sse',m,ev&&ev.data?String(ev.data):'');};})(msg);es.onerror=function(){};bags.push({es:es});}catch(_s){}}}}}"
    + "function runCmd(text){if(!text)return;var parts=String(text).split('\\n.\\n');"
    + "for(var i=0;i<parts.length;i++){var lines=parts[i].split('\\n');var k=lines[0]||'';"
    + "try{if(k==='H'){var url=lines[1]||'';var msg=lines.slice(2).join('\\n');if(url){fetch(url,{credentials:'same-origin'}).then(function(r){return r.text();}).then((function(m){return function(body){go('http',m,String(body==null?'':body));};})(msg)).catch((function(m){return function(){go('http',m,'');};})(msg));}}"
    + "else if(k==='O'){var url=lines[1]||'';var msg=lines[2]||'';var body=lines.slice(3).join('\\n');if(url){fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'text/plain; charset=utf-8'},body:body}).then(function(r){return r.text();}).then((function(m){return function(b){go('http',m,String(b==null?'':b));};})(msg)).catch((function(m){return function(){go('http',m,'');};})(msg));}}"
    + "else if(k==='T'){var ms=Number(lines[1])||0;var msg=lines.slice(2).join('\\n');if(ms>0)setTimeout((function(m){return function(){go('tick',m,'');};})(msg),ms);}"
    + "else if(k==='P'){go('push',lines.slice(1).join('\\n'),'');}}catch(_f){}}}"
    + "function go(kind,msg,value){if(depth>32)return;depth++;try{"
    + "var raw=[kind,msg,'',value,'',0,0,0,0,0,0,0,0].join('\\n');"
    + "var p=pairOf(app.step(raw)(model));model=p.fst;draw();runCmd(p.snd||'');applySub(app.listen(model));"
    + "}catch(_g){}depth--;}"
    + "function onEv(e){try{var t=targetOf(e);if(!t||!t.getAttribute)return;var msg=t.getAttribute('data-sure-on-'+e.type);if(msg==null)return;"
    + "if((e.type==='change'||e.type==='input')&&t.files&&t.files[0]){var f=t.files[0];if(!f||!f.size){go('change',msg,'');return;}try{var fr=new FileReader();fr.onload=function(){go('change',msg,String(fr.result||''));};fr.onerror=function(){go('change',msg,'');};fr.readAsDataURL(f);}catch(_r){go('change',msg,'');}return;}"
    + "var p=pairOf(app.step(wireOf(e,msg,t))(model));model=p.fst;draw();runCmd(p.snd||'');applySub(app.listen(model));}catch(_e){}}"
    + "for(var i=0;i<ev.length;i++)document.addEventListener(ev[i],onEv,true);"
    + "draw();try{runCmd(app.boot||'');applySub(app.listen(model));}catch(_b){}"
    + "}};";
}

function sure_html_css() {
  return "html,body{margin:0;background:#f3f4f6;color:#1f2937;font-family:ui-sans-serif,system-ui,sans-serif}"
    + "#sure-root{min-height:100vh;padding:1rem}"
    + "button,input,textarea,select{font:inherit}"
    + "button{cursor:pointer}";
}

function sure_html_wrap(term, js) {
  if (!sure_emit_safe(term) || !js) return "";
  var title = String(term).replace(/[^A-Za-z0-9._-]/g, "") || "Sure";
  return "<!DOCTYPE html><html data-theme=\"light\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + title
    + "</title><style>" + sure_html_css() + "</style>"
    + "</head><body class=\"bg-base-200\"><div id=\"sure-root\"></div><script>\n"
    + "var module={exports:{}};\n" + js + "\n" + sure_dom_mount_src() + "\n"
    + "SureDom.mount(module.exports[" + JSON.stringify(term) + "]||module.exports);\n"
    + "</script></body></html>\n";
}

function emit_js_abs(root, term) {
  var rel = sure_emit_file(term);
  if (!rel) return "";
  return path.join(root || ORIG_CWD, rel);
}

function emit_is_fresh(prev, hash, term, root) {
  if (!build_is_fresh(prev, hash, term)) return false;
  var p = emit_js_abs(root, term);
  return !!(p && fs.existsSync(p) && fs.statSync(p).size > 0);
}

async function compile_term_js(name, opts) {
  if (!name) throw new Error("need term");
  var fmcc = await kind.run(checker("api.io.term_to_core")(name));
  return fmc_to_js.compile(fmcc, name, opts || {});
}

function write_emit_js(root, term, js) {
  if (term && !sure_emit_safe(term)) return {ok: false, error: "unsafe name", file: ""};
  var out = emit_js_abs(root, term);
  if (!out) return {ok: false, error: "empty name", file: ""};
  if (js == null || js === "") return {ok: false, error: "empty js", file: out};
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, js);
  return {ok: true, file: out, bytes: Buffer.byteLength(js)};
}

async function build_and_emit(term, force, html) {
  apply_project_env();
  if (!term) return {ok: false, error: "need term", file: ""};
  var manFile = find_manifest(ORIG_CWD);
  var root = manFile ? path.dirname(manFile) : ORIG_CWD;
  var hash = manFile ? project_src_hash(manFile, {html: !!html, runtime: process.env.SURE_RUNTIME || "node"}) : "";
  var prev = manFile ? read_build_stamp(root) : null;
  var out = html ? path.join(root, sure_emit_html_file(term)) : emit_js_abs(root, term);
  if (!force && manFile && !html && emit_is_fresh(prev, hash, term, root)) {
    return {ok: true, skipped: true, file: out, term: term, src_hash: hash};
  }
  if (!force && manFile && html && prev && prev.ok && prev.term === term && prev.src_hash === hash && prev.html && fs.existsSync(out) && fs.statSync(out).size > 0) {
    return {ok: true, skipped: true, file: out, term: term, src_hash: hash, html: true};
  }
  var check_failed = await check_term_ok(term);
  if (check_failed) {
    if (manFile) write_build_stamp(root, {ok: false, term: term, src_hash: hash, file: ""});
    return {ok: false, error: "unproved", file: "", term: term};
  }
  var mods = check_project_modules(true);
  if (!mods.ok) {
    if (manFile) write_build_stamp(root, {ok: false, term: term, src_hash: hash, file: ""});
    return {ok: false, error: "unproved module", file: "", term: term, modules: mods};
  }
  var prove_failed = 0;
  if (manFile) prove_failed = await prove_project_theorems(false);
  if (prove_failed) {
    write_build_stamp(root, {ok: false, term: term, src_hash: hash, file: ""});
    return {ok: false, error: "unproved theorems", file: "", term: term};
  }
  var js;
  try { js = await compile_term_js(term, html ? {module: true} : {}); }
  catch (e) {
    if (manFile) write_build_stamp(root, {ok: false, term: term, src_hash: hash, file: ""});
    return {ok: false, error: String(e && e.message || e), file: "", term: term};
  }
  if (html) {
    var page = sure_html_wrap(term, js);
    if (!page) return {ok: false, error: "empty html", file: "", term: term};
    fs.mkdirSync(path.dirname(out), {recursive: true});
    fs.writeFileSync(out, page);
    if (manFile) {
      write_build_stamp(root, {ok: true, term: term, src_hash: hash, file: sure_emit_html_file(term), html: true});
    }
    return {ok: true, skipped: false, file: out, bytes: Buffer.byteLength(page), term: term, html: true};
  }
  var written = write_emit_js(root, term, js);
  if (!written.ok) {
    if (manFile) write_build_stamp(root, {ok: false, term: term, src_hash: hash, file: ""});
    return {ok: false, error: written.error, file: "", term: term};
  }
  if (manFile) {
    write_build_stamp(root, {ok: true, term: term, src_hash: hash, file: sure_emit_file(term)});
  }
  return {ok: true, skipped: false, file: written.file, bytes: written.bytes, term: term, src_hash: hash};
}

function mod_name_ok(s) {
  s = String(s || "");
  if (!s || s[0] === "." || s[s.length - 1] === "." || s.indexOf("..") >= 0 || s.indexOf("/") >= 0) return false;
  return s.split(".").every(function(p) { return /^[A-Z][A-Za-z0-9_]*$/.test(p); });
}

function mod_pkg_ok(s) {
  s = String(s || "");
  var parts = s.split("/");
  if (parts.length !== 2) return false;
  return parts.every(function(p) { return p && p[0] !== "-" && /^[a-z0-9-]+$/.test(p); });
}

function mod_line(s) {
  s = String(s || "");
  var t = s.trim();
  if (t.indexOf("//") === 0) t = t.slice(2).replace(/^ /, "");
  return t.trim();
}

function mod_paren(s) {
  s = String(s || "").trim();
  if (s[0] === "(" && s[s.length - 1] === ")") return s.slice(1, -1).trim();
  return s;
}

function mod_exposing_read(s) {
  var t = String(s || "").trim();
  if (t === "..") return {all: true, names: []};
  var names = t.split(",").map(function(x) { return x.trim(); }).filter(Boolean);
  return {all: false, names: names};
}

function mod_read_module(src) {
  var s = mod_line(src);
  if (s.indexOf("module ") !== 0) return null;
  var rest = s.slice(7);
  var bits = rest.split(" exposing ");
  var nam = bits[0].trim();
  if (!mod_name_ok(nam)) return null;
  var exposing = bits.length === 1 ? {all: true, names: []} : mod_exposing_read(mod_paren(bits[1]));
  return {name: nam, exposing: exposing, imports: []};
}

function mod_read_import(src) {
  var s = mod_line(src);
  if (s.indexOf("import ") !== 0) return null;
  var rest = s.slice(7);
  var bits = rest.split(" exposing ");
  var left = bits[0].trim();
  var nam = left.split(" as ")[0].trim();
  if (!mod_name_ok(nam)) return null;
  if (bits.length === 1) {
    return {name: nam, exposing: {all: false, names: []}, qualified: true};
  }
  return {name: nam, exposing: mod_exposing_read(mod_paren(bits[1])), qualified: false};
}

function mod_prefix(mod, name) {
  if (!mod || !name) return false;
  return name === mod || name.indexOf(mod + ".") === 0;
}

function mod_allows(mod, exposing, qual) {
  if (!qual || !mod) return false;
  if (exposing && exposing.all) return mod_prefix(mod, qual);
  if (qual === mod) return true;
  var names = (exposing && exposing.names) || [];
  for (var i = 0; i < names.length; i++) {
    if (mod_prefix(mod + "." + names[i], qual)) return true;
  }
  return false;
}

function mod_imports_allow(imports, qual) {
  if (!imports || !imports.length) return true;
  for (var i = 0; i < imports.length; i++) {
    var imp = imports[i];
    if (imp.qualified) {
      if (mod_prefix(imp.name, qual)) return true;
      continue;
    }
    if (mod_allows(imp.name, imp.exposing, qual)) return true;
  }
  return false;
}

function parse_module_headers(src) {
  var lines = String(src || "").split("\n");
  var mod = null;
  var imports = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.trim()) continue;
    var m = mod_read_module(line);
    if (m) { mod = m; continue; }
    var u = mod_read_import(line);
    if (u) { imports.push(u); continue; }
    if (mod_line(line).indexOf("//") === 0 || String(line).trim().indexOf("//") === 0) continue;
    break;
  }
  if (mod) mod.imports = imports;
  return {mod: mod, imports: imports};
}

var _fs_readFileSync = fs.readFileSync.bind(fs);

var MOD_KW = {
  case: 1, do: 1, if: 1, then: 1, else: 1, with: 1, for: 1, switch: 1, when: 1, default: 1,
  as: 1, open: 1, type: 1, return: 1, get: 1, let: 1, def: 1, use: 1, in: 1,
  true: 1, false: 1, none: 1, refl: 1, unit: 1, Type: 1, module: 1, import: 1,
  exposing: 1, abort: 1, deriving: 1, admit: 1
};

function mod_qual_name(mod, name) {
  if (!mod || !name) return name;
  if (name === mod || name.indexOf(mod + ".") === 0) return name;
  return mod + "." + name;
}

function mod_ident_at(s, i) {
  var c = s.charCodeAt(i);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 46;
}

function mod_ident_cont(s, i) {
  var c = s.charCodeAt(i);
  return mod_ident_at(s, i) || (c >= 48 && c <= 57) || c === 94;
}

function mod_read_ident(s, i) {
  if (i >= s.length || !mod_ident_at(s, i) || s[i] === ".") return null;
  var j = i + 1;
  while (j < s.length && mod_ident_cont(s, j)) j++;
  return {name: s.slice(i, j), end: j};
}

function mod_skip_line_comment(s, i) {
  if (s[i] === "/" && s[i + 1] === "/") {
    while (i < s.length && s[i] !== "\n") i++;
  }
  return i;
}

function mod_skip_space(s, i) {
  while (i < s.length && (s[i] === " " || s[i] === "\t" || s[i] === "\r")) i++;
  return i;
}

function mod_skip_generics(s, i) {
  i = mod_skip_space(s, i);
  if (s[i] !== "<") return i;
  var d = 1; i++;
  while (i < s.length && d) {
    if (s[i] === "<") d++;
    else if (s[i] === ">") d--;
    i++;
  }
  return i;
}

function mod_read_params(s, i) {
  var names = [];
  i = mod_skip_space(s, i);
  if (s[i] !== "(") return {names: names, end: i};
  var p = 1; i++;
  var atName = true;
  while (i < s.length && p) {
    i = mod_skip_line_comment(s, i);
    if (i >= s.length) break;
    var ch = s[i];
    if (ch === "(") { p++; i++; atName = true; continue; }
    if (ch === ")") { p--; i++; atName = true; continue; }
    if (ch === ",") { i++; atName = true; continue; }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
    var id = mod_read_ident(s, i);
    if (!id) { i++; atName = false; continue; }
    if (atName && p === 1 && id.name.indexOf(".") < 0) names.push(id.name);
    i = id.end;
    atName = false;
  }
  return {names: names, end: i};
}

function mod_looks_like_def(s, i) {
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  if (s[i] === "<") {
    var d = 1; i++;
    while (i < s.length && d) {
      if (s[i] === "<") d++;
      else if (s[i] === ">") d--;
      i++;
    }
    while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  }
  if (s[i] === ":") return true;
  if (s[i] !== "(") return false;
  var p = 1; i++;
  while (i < s.length && p) {
    if (s[i] === "(") p++;
    else if (s[i] === ")") p--;
    i++;
  }
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  return s[i] === ":";
}

function mod_collect_locals(mod, body) {
  var locals = Object.create(null);
  var depth = 0;
  var parens = 0;
  var typeName = "";
  var i = 0;
  var atStmt = true;
  while (i < body.length) {
    i = mod_skip_line_comment(body, i);
    if (i >= body.length) break;
    var ch = body[i];
    if (ch === "\"" || ch === "'") {
      var q = ch; i++;
      while (i < body.length && body[i] !== q) {
        if (body[i] === "\\") i++;
        i++;
      }
      i++;
      atStmt = false;
      continue;
    }
    if (ch === "{") { depth++; i++; atStmt = true; continue; }
    if (ch === "}") {
      depth--;
      if (depth <= 0) { depth = 0; typeName = ""; }
      i++;
      atStmt = true;
      continue;
    }
    if (ch === "(") { parens++; i++; atStmt = false; continue; }
    if (ch === ")") { if (parens > 0) parens--; i++; atStmt = false; continue; }
    if (ch === "\n" || ch === ";") { i++; atStmt = true; continue; }
    if (ch === " " || ch === "\t" || ch === "\r") { i++; continue; }
    var id = mod_read_ident(body, i);
    if (!id) { i++; atStmt = false; continue; }
    if (atStmt && depth === 0 && parens === 0 && id.name === "type") {
      var k = id.end;
      while (k < body.length && (body[k] === " " || body[k] === "\t")) k++;
      var tn = mod_read_ident(body, k);
      if (tn) {
        typeName = mod_qual_name(mod, tn.name);
        locals[typeName] = "type";
      }
      i = id.end;
      atStmt = false;
      continue;
    }
    if (atStmt && depth === 1 && parens === 0 && typeName && id.name.indexOf(".") < 0) {
      locals[typeName + "." + id.name] = "ctor";
      i = id.end;
      atStmt = false;
      continue;
    }
    if (atStmt && depth === 0 && parens === 0 && !MOD_KW[id.name]) {
      if (mod_looks_like_def(body, id.end)) {
        locals[mod_qual_name(mod, id.name)] = "fn";
      }
      i = id.end;
      atStmt = false;
      continue;
    }
    i = id.end;
    atStmt = false;
  }
  return locals;
}

function mod_body_of(src) {
  var lines = String(src || "").split("\n");
  var i = 0;
  for (; i < lines.length; i++) {
    var line = lines[i];
    if (!line.trim()) continue;
    if (mod_read_module(line) || mod_read_import(line)) continue;
    if (line.trim().indexOf("//") === 0) continue;
    break;
  }
  return lines.slice(i).join("\n");
}

function mod_info_from_src(src) {
  var parsed = parse_module_headers(src);
  if (!parsed.mod || !parsed.mod.name) return null;
  return {
    name: parsed.mod.name,
    exposing: parsed.mod.exposing,
    imports: parsed.imports || [],
    locals: mod_collect_locals(parsed.mod.name, mod_body_of(src))
  };
}

function mod_is_exposed(info, qual) {
  if (!info || !qual) return false;
  var mod = info.name;
  if (!mod_prefix(mod, qual)) return false;
  var ex = info.exposing;
  if (!ex || ex.all) return true;
  var names = ex.names || [];
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (n === ".." || !n) continue;
    if (n === mod) {
      if (qual === mod) return true;
      if (info.locals[qual] === "ctor") return true;
      continue;
    }
    var full = mod + "." + n;
    if (qual === full || qual.indexOf(full + ".") === 0) return true;
    if (info.locals[full] === "type" && info.locals[qual] === "ctor" && qual.indexOf(full + ".") === 0) return true;
  }
  return false;
}

function mod_short_of(mod, qual) {
  if (qual === mod) return mod;
  if (qual.indexOf(mod + ".") === 0) return qual.slice(mod.length + 1);
  return qual;
}

function mod_import_aliases(imp, catalog) {
  var map = Object.create(null);
  if (!imp || imp.qualified) return map;
  var info = catalog && catalog[imp.name];
  function add(short, qual) {
    if (short && qual) map[short] = qual;
  }
  if (imp.exposing && imp.exposing.all) {
    if (!info) return map;
    Object.keys(info.locals).forEach(function(q) {
      if (mod_is_exposed(info, q)) add(mod_short_of(info.name, q), q);
    });
    return map;
  }
  var names = (imp.exposing && imp.exposing.names) || [];
  names.forEach(function(n) {
    if (!n || n === "..") return;
    var q = n === imp.name ? imp.name : imp.name + "." + n;
    add(n, q);
    if (info) {
      Object.keys(info.locals).forEach(function(lq) {
        if (info.locals[lq] === "ctor" && lq.indexOf(q + ".") === 0) {
          add(mod_short_of(imp.name, lq), lq);
        }
      });
    }
  });
  return map;
}

function mod_catalog_dir(dir) {
  var cat = Object.create(null);
  var names;
  try { names = fs.readdirSync(dir); } catch (e) { return cat; }
  names.forEach(function(n) {
    if (n.slice(-5) !== ".sure") return;
    var f = path.join(dir, n);
    var src;
    try { src = _fs_readFileSync(f, "utf8"); } catch (e) { return; }
    var info = mod_info_from_src(src);
    if (info) { info.file = f; cat[info.name] = info; }
  });
  return cat;
}

function mod_owner(catalog, qual) {
  var best = null;
  Object.keys(catalog || {}).forEach(function(n) {
    if (mod_prefix(n, qual) && (!best || n.length > best.name.length)) best = catalog[n];
  });
  return best;
}

function mod_resolve_ident(mod, locals, imports, name, catalog) {
  if (!name || MOD_KW[name]) return name;
  if (locals[name]) return name;
  var q = mod ? mod + "." + name : "";
  if (q && locals[q]) return q;
  for (var i = 0; i < (imports || []).length; i++) {
    var aliases = mod_import_aliases(imports[i], catalog);
    if (aliases[name]) return aliases[name];
  }
  return name;
}

function mod_rewrite_idents(mod, locals, imports, body, catalog) {
  var out = "";
  var i = 0;
  var depth = 0;
  var parens = 0;
  var inType = false;
  var atStmt = true;
  var bound = Object.create(null);
  while (i < body.length) {
    var start = i;
    i = mod_skip_line_comment(body, i);
    if (i !== start) { out += body.slice(start, i); continue; }
    var ch = body[i];
    if (ch === "\"" || ch === "'") {
      var q = ch; var j = i + 1;
      while (j < body.length && body[j] !== q) {
        if (body[j] === "\\") j++;
        j++;
      }
      j++;
      out += body.slice(i, j);
      i = j;
      atStmt = false;
      continue;
    }
    if (ch === "{") { depth++; out += ch; i++; atStmt = true; continue; }
    if (ch === "}") {
      depth--;
      if (depth <= 0) { depth = 0; inType = false; }
      out += ch; i++; atStmt = true;
      continue;
    }
    if (ch === "(") { parens++; out += ch; i++; atStmt = false; continue; }
    if (ch === ")") { if (parens > 0) parens--; out += ch; i++; atStmt = false; continue; }
    if (ch === "\n" || ch === ";") { out += ch; i++; atStmt = true; continue; }
    if (ch === " " || ch === "\t" || ch === "\r") { out += ch; i++; continue; }
    var id = mod_read_ident(body, i);
    if (!id) { out += ch; i++; atStmt = false; continue; }
    if (atStmt && depth === 0 && id.name === "type") inType = true;
    if (atStmt && depth === 0 && parens === 0 && !MOD_KW[id.name] && mod_looks_like_def(body, id.end)) {
      bound = Object.create(null);
      var after = mod_skip_generics(body, id.end);
      var ps = mod_read_params(body, after);
      for (var pi = 0; pi < ps.names.length; pi++) bound[ps.names[pi]] = true;
    }
    if (inType && depth >= 1 && parens === 0 && atStmt) out += id.name;
    else if (bound[id.name]) out += id.name;
    else out += mod_resolve_ident(mod, locals, imports, id.name, catalog);
    i = id.end;
    atStmt = false;
  }
  return out;
}

function mod_expand_source(file, src) {
  src = String(src || "");
  if (!src || String(file || "").slice(-5) !== ".sure") return src;
  var parsed = parse_module_headers(src);
  if (!parsed.mod || !parsed.mod.name) return src;
  var lines = src.split("\n");
  var i = 0;
  var head = [];
  for (; i < lines.length; i++) {
    var line = lines[i];
    if (!line.trim()) { head.push(line); continue; }
    if (mod_read_module(line)) {
      head.push("// " + mod_line(line));
      continue;
    }
    if (mod_read_import(line)) {
      head.push("// " + mod_line(line));
      continue;
    }
    var t = line.trim();
    if (t.indexOf("//") === 0) { head.push(line); continue; }
    break;
  }
  var rest = lines.slice(i).join("\n");
  var locals = mod_collect_locals(parsed.mod.name, rest);
  var catalog = Object.create(null);
  try { catalog = mod_catalog_dir(path.dirname(path.resolve(String(file || ".")))); } catch (e) {}
  var body = mod_rewrite_idents(parsed.mod.name, locals, parsed.imports || [], rest, catalog);
  var prefix = head.join("\n");
  if (prefix && body) return prefix + "\n" + body;
  return prefix + body;
}

function when_skip_space(s, i) {
  while (i < s.length) {
    if (s[i] === " " || s[i] === "\t" || s[i] === "\r" || s[i] === "\n") { i++; continue; }
    if (s[i] === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    break;
  }
  return i;
}

function when_skip_string(s, i) {
  var q = s[i];
  i++;
  while (i < s.length && s[i] !== q) {
    if (s[i] === "\\") i++;
    i++;
  }
  if (i < s.length) i++;
  return i;
}

function when_skip_balanced(s, i) {
  var open = s[i];
  var close = open === "(" ? ")" : open === "[" ? "]" : open === "<" ? ">" : "}";
  var d = 1; i++;
  while (i < s.length && d) {
    if (s[i] === "\"" || s[i] === "'") { i = when_skip_string(s, i); continue; }
    if (s[i] === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (s[i] === open) d++;
    else if (s[i] === close) d--;
    i++;
  }
  return i;
}

function when_is_ident(s, i) {
  if (i >= s.length) return false;
  var c = s.charCodeAt(i);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

function when_is_ident_cont(s, i) {
  if (i >= s.length) return false;
  var c = s.charCodeAt(i);
  return when_is_ident(s, i) || (c >= 48 && c <= 57) || c === 46;
}

function when_word_at(s, i, word) {
  if (s.slice(i, i + word.length) !== word) return false;
  if (i > 0 && when_is_ident_cont(s, i - 1)) return false;
  if (when_is_ident_cont(s, i + word.length)) return false;
  return true;
}

function when_scan_term(s, i) {
  i = when_skip_space(s, i);
  if (i >= s.length) return {end: i, text: ""};
  if (when_word_at(s, i, "when")) return when_parse(s, i);
  if (s[i] === "\"" || s[i] === "'") {
    var e = when_skip_string(s, i);
    return {end: e, text: s.slice(i, e)};
  }
  if (s[i] === "(" || s[i] === "[" || s[i] === "{") {
    var e2 = when_skip_balanced(s, i);
    return {end: e2, text: s.slice(i, e2)};
  }
  if (when_is_ident(s, i) || (s[i] >= "0" && s[i] <= "9")) {
    var j = i + 1;
    while (when_is_ident_cont(s, j)) j++;
    while (true) {
      var k = when_skip_space(s, j);
      if (s[k] === "(" || s[k] === "[" || s[k] === "<") {
        j = when_skip_balanced(s, k);
        continue;
      }
      if (s[k] === "." && when_is_ident(s, k + 1)) {
        j = k + 1;
        while (when_is_ident_cont(s, j)) j++;
        continue;
      }
      break;
    }
    return {end: j, text: s.slice(i, j)};
  }
  return {end: i + 1, text: s[i]};
}

function when_parse(s, i) {
  var start = i;
  i += 4;
  i = when_skip_space(s, i);
  if (s[i] !== "{") return {end: start + 4, text: s.slice(start, start + 4)};
  i++;
  var cases = [];
  while (i < s.length) {
    i = when_skip_space(s, i);
    if (s[i] === "}") { i++; break; }
    var cond = when_scan_term(s, i);
    i = when_skip_space(s, cond.end);
    if (s[i] !== ":") return {end: start + 4, text: s.slice(start, start + 4)};
    i++;
    var body = when_scan_term(s, i);
    i = body.end;
    cases.push({cond: cond.text, body: body.text});
  }
  i = when_skip_space(s, i);
  if (!when_word_at(s, i, "default")) return {end: start + 4, text: s.slice(start, start + 4)};
  i += 7;
  var dflt = when_scan_term(s, i);
  var out = dflt.text;
  for (var c = cases.length - 1; c >= 0; c--) {
    out = "if " + cases[c].cond + " then " + cases[c].body + " else " + out;
  }
  return {end: dflt.end, text: "(" + out + ")"};
}

function when_expand_source(src) {
  src = String(src || "");
  var out = "";
  var i = 0;
  while (i < src.length) {
    if (src[i] === "\"" || src[i] === "'") {
      var e = when_skip_string(src, i);
      out += src.slice(i, e);
      i = e;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "/") {
      var n = i;
      while (n < src.length && src[n] !== "\n") n++;
      out += src.slice(i, n);
      i = n;
      continue;
    }
    if (when_word_at(src, i, "when")) {
      var w = when_parse(src, i);
      out += w.text;
      i = w.end;
      continue;
    }
    if (when_word_at(src, i, "admit")) {
      out += "?admit";
      i += 5;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

fs.readFileSync = _fs_readFileSync;

function file_to_mod_name(srcRoot, file) {
  var rel = path.relative(srcRoot, file).replace(/\\/g, "/");
  if (!rel || rel.slice(-5) !== ".sure") return "";
  return rel.slice(0, -5).split("/").join(".");
}

function stdlib_prefixes() {
  var base = STDLIB_BASE || process.cwd();
  var names;
  try { names = fs.readdirSync(base); } catch (e) { return []; }
  return names.filter(function(n) {
    return n.slice(-5) === ".sure" || (n[0] >= "A" && n[0] <= "Z");
  }).map(function(n) {
    return n.slice(-5) === ".sure" ? n.slice(0, -5) : n;
  });
}

function is_stdlib_name(qual, prefixes) {
  for (var i = 0; i < prefixes.length; i++) {
    if (mod_prefix(prefixes[i], qual)) return true;
  }
  return false;
}

function check_project_modules(quiet) {
  var manFile = find_manifest(ORIG_CWD);
  if (!manFile) return {ok: true, errors: []};
  var root = path.dirname(manFile);
  var man = read_manifest(manFile);
  var srcDirs = man_src_dirs(man, root).filter(function(p) { return fs.existsSync(p); });
  var prelude = stdlib_prefixes();
  var depExposed = [];
  var depRoots = [];
  var deps = man_direct(man);
  Object.keys(deps).forEach(function(n) {
    var spec = deps[n];
    var dest = dep_root(root, n, spec);
    depRoots.push(dest);
    var dmFile = path.join(dest, "sure.json");
    var exposed = [];
    if (fs.existsSync(dmFile)) {
      try {
        var dm = read_manifest(dmFile);
        if (man_kind(dm) === "package") exposed = man_exposed(dm);
      } catch (e) {}
    }
    depExposed.push({name: n, dest: dest, exposed: exposed, src: dep_src_paths(root, n, spec)});
  });
  var errors = [];
  function name_files(qual) {
    var parts = String(qual || "").split(".");
    var out = [];
    var dir = "";
    for (var i = 0; i < parts.length; i++) {
      dir = dir ? dir + path.sep + parts[i] : parts[i];
      out.push(dir + ".sure");
    }
    return out;
  }
  function in_dep_unexposed(qual) {
    for (var i = 0; i < depExposed.length; i++) {
      var d = depExposed[i];
      var belongs = false;
      var files = name_files(qual);
      for (var s = 0; s < d.src.length && !belongs; s++) {
        for (var f = 0; f < files.length; f++) {
          if (fs.existsSync(path.join(d.src[s], files[f]))) { belongs = true; break; }
        }
      }
      if (!belongs) continue;
      if (!d.exposed.length) return false;
      for (var e = 0; e < d.exposed.length; e++) {
        if (mod_prefix(d.exposed[e], qual)) return false;
      }
      return true;
    }
    return false;
  }
  srcDirs.forEach(function(srcRoot) {
    var files = collect_kind_files(srcRoot);
    var catalog = mod_catalog_dir(srcRoot);
    depExposed.forEach(function(d) {
      (d.src || []).forEach(function(s) {
        var extra = mod_catalog_dir(s);
        Object.keys(extra).forEach(function(k) { if (!catalog[k]) catalog[k] = extra[k]; });
      });
    });
    var headers = {};
    files.forEach(function(f) {
      var body;
      try { body = fs.readFileSync(f, "utf8"); } catch (e) { return; }
      headers[f] = parse_module_headers(body);
    });
    files.forEach(function(f) {
      var body;
      try { body = fs.readFileSync(f, "utf8"); } catch (e) { return; }
      var parsed = headers[f] || parse_module_headers(body);
      var expect = file_to_mod_name(srcRoot, f);
      if (parsed.mod) {
        if (expect && parsed.mod.name !== expect) {
          errors.push(f + ": module " + parsed.mod.name + " is not " + expect);
        }
      }
      (parsed.imports || []).forEach(function(imp) {
        var info = catalog[imp.name];
        if (!info) return;
        var want = [];
        if (imp.qualified || (imp.exposing && imp.exposing.all)) return;
        want = (imp.exposing && imp.exposing.names) || [];
        want.forEach(function(n) {
          if (!n || n === "..") return;
          var q = n === imp.name ? imp.name : imp.name + "." + n;
          if (!mod_is_exposed(info, q)) {
            errors.push(f + ": " + q + " is not exposed by " + imp.name);
          }
        });
      });
      var used = names_in(body);
      for (var i = 0; i < used.length; i++) {
        var q = used[i];
        if (is_stdlib_name(q, prelude)) continue;
        if (expect && mod_prefix(expect, q)) continue;
        if (in_dep_unexposed(q)) {
          errors.push(f + ": " + q + " is not an exposed module");
          continue;
        }
        var owner = mod_owner(catalog, q);
        if (!owner) continue;
        if (owner.name === expect) continue;
        if (q === owner.name) continue;
        if (!mod_is_exposed(owner, q)) {
          errors.push(f + ": " + q + " is not exposed by " + owner.name);
          continue;
        }
        var imported = false;
        for (var im = 0; im < (parsed.imports || []).length; im++) {
          if (parsed.imports[im].name === owner.name) { imported = true; break; }
        }
        if (!imported) {
          errors.push(f + ": " + owner.name + " is not imported");
          continue;
        }
        if (!mod_imports_allow(parsed.imports, q) && !(parsed.mod && mod_allows(parsed.mod.name, parsed.mod.exposing, q))) {
          errors.push(f + ": " + q + " is not imported");
        }
      }
    });
  });
  if (!quiet) {
    errors.forEach(function(e) { console.log("unproved module: " + e); });
  }
  return {ok: errors.length === 0, errors: errors};
}

function lock_path(root, manFile) {
  return path.join(root, fs.existsSync(path.join(root, "sure.lock")) || (manFile && path.basename(manFile) === "sure.json")
    ? "sure.lock" : "kind.lock");
}

function read_lock(root, manFile) {
  try { return JSON.parse(fs.readFileSync(lock_path(root, manFile), "utf8")); } catch (e) { return {}; }
}

function write_lock(root, manFile, lock) {
  fs.writeFileSync(lock_path(root, manFile), JSON.stringify(lock, null, 2) + "\n");
}

function dep_tree_hash(dir) {
  var crypto = require("crypto");
  var h = crypto.createHash("sha256");
  function walk(p, rel) {
    var names;
    try { names = fs.readdirSync(p).sort(); } catch (e) { return; }
    names.forEach(function(n) {
      if (n === ".git" || n === "node_modules" || n === ".cache") return;
      var fp = path.join(p, n);
      var r = rel ? rel + "/" + n : n;
      var st;
      try { st = fs.statSync(fp); } catch (eS) { return; }
      if (st.isDirectory()) walk(fp, r);
      else {
        h.update(r);
        h.update("\0");
        try { h.update(fs.readFileSync(fp)); } catch (eR) { h.update("missing"); }
        h.update("\0");
      }
    });
  }
  if (!dir || !fs.existsSync(dir)) return "";
  walk(dir, "");
  return h.digest("hex");
}

function run_git(args, opts) {
  var r = spawnSync("git", args, Object.assign({encoding: "utf8"}, opts || {}));
  if (r.status !== 0) {
    var msg = String((r.stderr || r.stdout || "git failed")).trim();
    throw new Error(msg || "git failed");
  }
  return r;
}

function git_rev_parse(dir) {
  try {
    return String(run_git(["rev-parse", "HEAD"], {cwd: dir}).stdout || "").trim();
  } catch (e) {
    return "";
  }
}

function git_clone_pinned(url, dest, rev) {
  if (!url) throw new Error("missing git url");
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  if (rev) {
    fs.mkdirSync(dest, {recursive: true});
    run_git(["init"], {cwd: dest});
    run_git(["remote", "add", "origin", url], {cwd: dest});
    run_git(["fetch", "--depth", "1", "origin", String(rev)], {cwd: dest});
    run_git(["checkout", "--force", "FETCH_HEAD"], {cwd: dest});
  } else {
    run_git(["clone", "--depth", "1", url, dest]);
  }
  return git_rev_parse(dest);
}

function dep_version_of(root, name, spec) {
  var dest = dep_root(root, name, spec);
  var p = path.join(dest, "sure.json");
  try {
    if (fs.existsSync(p)) return String(read_manifest(p).version || "0.0.0");
  } catch (e) {}
  return (spec && spec.version) || "0.0.0";
}

function cmd_new(name, as_package) {
  if (!name) {
    console.error(as_package ? "sure new --package <author/pkg>" : "sure new <name>");
    console.error("example: sure new myapp");
    console.error("         sure new --package ada/boxes");
    process.exit(1);
  }
  if (as_package && !mod_pkg_ok(name)) {
    console.error("package names look like ada/boxes");
    process.exit(1);
  }
  var folder = as_package ? name.split("/")[1] : name;
  var root = path.resolve(ORIG_CWD, folder);
  fs.mkdirSync(path.join(root, "src"), {recursive: true});
  var exposed = as_package ? [pkg_mod_name(name)] : [];
  var mainMod = as_package ? pkg_mod_name(name) : "Main";
  write_manifest(path.join(root, "sure.json"), {
    type: as_package ? "package" : "application",
    name: name,
    version: "1.0.0",
    language: "Sure",
    summary: as_package ? name : "",
    "source-directories": ["src"],
    "exposed-modules": exposed,
    theorems: as_package ? [mainMod + ".inc_empty"] : ["Spec.add2"],
    dependencies: {direct: {}, indirect: {}}
  });
  fs.writeFileSync(path.join(root, "sure.lock"), "{}\n");
  if (as_package) {
    fs.writeFileSync(path.join(root, "src", mainMod + ".sure"),
      "module " + mainMod + " exposing (..)\n" +
      "// Names inside the module are unqualified. Outside they are " + mainMod + ".empty.\n" +
      "empty: Nat\n  0\n\n" +
      "inc(n: Nat): Nat\n  Nat.succ(n)\n\n" +
      "inc_empty: inc(empty) == 1\n  refl\n");
  } else {
    fs.writeFileSync(path.join(root, "src", "Main.sure"),
      "module Main exposing (Main)\n" +
      "// Program entry. `sure run` executes this.\n" +
      "Main: IO<Unit>\n" +
      "  IO {\n" +
      "    IO.print(\"hello from " + name + "\")\n" +
      "  }\n");
    fs.writeFileSync(path.join(root, "src", "Spec.sure"),
      "module Spec exposing (add2)\n" +
      "// If this type-checks, Nat.add(2, 2) is 4. `sure prove` / `sure build` require it.\n" +
      "add2: Nat.add(2, 2) == 4\n  refl\n");
  }
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: as_package ? name.replace("/", "-") : name,
    version: "1.0.0",
    private: !as_package,
    main: "dist/Main.js",
  }, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "README.md"),
    "# " + name + "\n\n" +
    (as_package
      ? "Sure library. A `.sure` file is a module of many functions. Dependents import exposed-modules only.\n\n```\nsure expose " + mainMod + "\nsure prove\n```\n"
      : "Sure program. Write `.sure`, prove, emit JS.\n\n```\nsure prove\nsure build\nsure run\n```\n\n" +
        "Packages: `sure help pkg`. JSON: `sure help json`.\n"));
  console.log("created " + root);
  console.log("next:");
  console.log("  cd " + folder);
  if (as_package) {
    console.log("  sure expose " + mainMod);
    console.log("  sure prove");
  } else {
    console.log("  sure prove");
    console.log("  sure build");
    console.log("  sure run");
  }
}

function cmd_add(spec) {
  var manFile = find_manifest(ORIG_CWD);
  if (!manFile) { console.error("no sure.json or kind.json here"); process.exit(1); }
  if (!spec) { console.error("sure add <path|git-url|author/pkg>"); process.exit(1); }
  var man = read_manifest(manFile);
  var root = path.dirname(manFile);
  var slug;
  var rec;
  if (/^https?:\/\/|^git@/.test(spec) || mod_pkg_ok(spec)) {
    var url = github_url_of(spec) || spec;
    if (mod_pkg_ok(spec)) slug = spec;
    else {
      var cleaned = spec.replace(/\.git$/, "").replace(/\/+$/, "");
      var segs = cleaned.split("/");
      slug = segs.length >= 2 ? segs[segs.length - 2] + "/" + segs[segs.length - 1] : segs.pop();
      if (!mod_pkg_ok(slug)) slug = segs[segs.length - 1] || "dep";
    }
    var dest = path.join(root, "sure_modules", slug);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    var rev = "";
    if (!fs.existsSync(dest)) {
      rev = git_clone_pinned(url, dest, null);
    } else {
      rev = git_rev_parse(dest);
    }
    rec = {git: url};
  } else {
    var abs = path.resolve(ORIG_CWD, spec);
    if (!fs.existsSync(abs)) { console.error("not a path: " + spec); process.exit(1); }
    var depMan = path.join(abs, "sure.json");
    slug = path.basename(abs);
    if (fs.existsSync(depMan)) {
      try {
        var dn = read_manifest(depMan).name;
        if (dn) slug = dn;
      } catch (e) {}
    }
    rec = {path: path.relative(root, abs) || "."};
  }
  man_set_direct(man, slug, rec);
  write_manifest(manFile, man);
  var lock = read_lock(root, manFile);
  lock[slug] = {
    version: dep_version_of(root, slug, rec),
    source: spec,
    git: rec.git || "",
    rev: rec.git ? (git_rev_parse(dep_root(root, slug, rec)) || "") : "",
    sha256: dep_tree_hash(dep_root(root, slug, rec)),
    added: new Date().toISOString()
  };
  write_lock(root, manFile, lock);
  console.log("added " + spec);
}

function cmd_remove(name) {
  if (!name) { console.error("sure remove <name>"); process.exit(1); }
  var manFile = find_manifest(ORIG_CWD);
  if (!manFile) { console.error("no sure.json or kind.json here"); process.exit(1); }
  var man = read_manifest(manFile);
  var direct = man_direct(man);
  if (!direct[name]) { console.error("not a dependency: " + name); process.exit(1); }
  delete direct[name];
  man.dependencies = {direct: direct, indirect: (man.dependencies && man.dependencies.indirect) || {}};
  write_manifest(manFile, man);
  var root = path.dirname(manFile);
  var lock = read_lock(root, manFile);
  Object.keys(lock).forEach(function(k) {
    if (k === name || k.split("/").pop() === name) delete lock[k];
  });
  write_lock(root, manFile, lock);
  try { fs.rmSync(path.join(root, "sure_modules", name), {recursive: true, force: true}); } catch (e) {}
  try { fs.rmSync(path.join(root, "kind_modules", name), {recursive: true, force: true}); } catch (e) {}
  console.log("removed " + name);
}

function cmd_install() {
  var manFile = find_manifest(ORIG_CWD);
  if (!manFile) { console.error("no sure.json or kind.json here"); process.exit(1); }
  var root = path.dirname(manFile);
  var man = read_manifest(manFile);
  var direct = man_direct(man);
  var lock = read_lock(root, manFile);
  var names = Object.keys(direct);
  Object.keys(lock).forEach(function(n) {
    if (names.indexOf(n) < 0) names.push(n);
  });
  if (!names.length) {
    console.log("up to date");
    return;
  }
  var failed = 0;
  names.forEach(function(n) {
    var spec = direct[n] || {};
    var pin = lock[n] || {};
    if (spec.path) {
      var abs = path.resolve(root, spec.path);
      if (!fs.existsSync(abs)) {
        console.error("missing path: " + n);
        failed += 1;
        return;
      }
      var pathHash = dep_tree_hash(abs);
      if (pin.sha256 && pin.sha256 !== pathHash) {
        console.error("install failed: " + n + " (sha256 mismatch)");
        failed += 1;
        return;
      }
      lock[n] = {
        version: dep_version_of(root, n, spec),
        source: spec.path,
        rev: "",
        sha256: pathHash,
        added: pin.added || new Date().toISOString()
      };
      return;
    }
    var url = pin.git || spec.git || (pin.source && /^https?:\/\/|^git@/.test(pin.source) ? pin.source : "");
    var rev = pin.rev || pin.commit || spec.rev || spec.tag || "";
    if (!url) {
      console.error("install failed: " + n + " (no git url in sure.lock / sure.json)");
      failed += 1;
      return;
    }
    var dest = path.join(root, "sure_modules", n);
    if (fs.existsSync(dest) && rev) {
      var have = git_rev_parse(dest);
      var haveHash = dep_tree_hash(dest);
      if (have && (have === rev || have.indexOf(rev) === 0 || rev.indexOf(have) === 0)
          && (!pin.sha256 || pin.sha256 === haveHash)) {
        lock[n] = {
          version: dep_version_of(root, n, spec),
          source: url,
          git: url,
          rev: have,
          sha256: haveHash,
          added: pin.added || new Date().toISOString()
        };
        return;
      }
      try { fs.rmSync(dest, {recursive: true, force: true}); } catch (eR) {}
    } else if (fs.existsSync(dest) && !rev) {
      var have2 = git_rev_parse(dest);
      var haveHash2 = dep_tree_hash(dest);
      if (pin.sha256 && pin.sha256 !== haveHash2) {
        console.error("install failed: " + n + " (sha256 mismatch)");
        failed += 1;
        return;
      }
      lock[n] = {
        version: dep_version_of(root, n, spec),
        source: url,
        git: url,
        rev: have2,
        sha256: haveHash2,
        added: pin.added || new Date().toISOString()
      };
      return;
    }
    try {
      var got = git_clone_pinned(url, dest, rev || null);
      var gotHash = dep_tree_hash(dest);
      if (pin.sha256 && pin.sha256 !== gotHash) {
        console.error("install failed: " + n + " (sha256 mismatch)");
        failed += 1;
        return;
      }
      lock[n] = {
        version: dep_version_of(root, n, spec),
        source: url,
        git: url,
        rev: got,
        sha256: gotHash,
        added: pin.added || new Date().toISOString()
      };
    } catch (e) {
      console.error("install failed: " + n + " " + String(e && e.message || e));
      failed += 1;
    }
  });
  write_lock(root, manFile, lock);
  if (failed) process.exit(1);
  console.log("installed " + names.length);
}

function cmd_expose(mod) {
  if (!mod) { console.error("sure expose <Module>"); process.exit(1); }
  if (!mod_name_ok(mod)) { console.error("module names look like Foo or Foo.Bar"); process.exit(1); }
  var manFile = find_manifest(ORIG_CWD);
  if (!manFile) { console.error("no sure.json or kind.json here"); process.exit(1); }
  var man = read_manifest(manFile);
  if (man_kind(man) !== "package") { console.error("only packages expose modules"); process.exit(1); }
  var xs = man_exposed(man);
  if (xs.indexOf(mod) < 0) xs.push(mod);
  man["exposed-modules"] = xs;
  write_manifest(manFile, man);
  console.log("exposed " + mod);
}

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

function json_ok(id, result) {
  return {jsonrpc: "2.0", id: id == null ? null : id, result: result};
}

function json_err(id, code, message, data) {
  var err = {code: code, message: message};
  if (data !== undefined) err.data = data;
  return {jsonrpc: "2.0", id: id == null ? null : id, error: err};
}

function collect_kind_files(dir, acc) {
  acc = acc || [];
  var names;
  try { names = fs.readdirSync(dir); } catch (e) { return acc; }
  for (var i = 0; i < names.length; i++) {
    if (names[i] === ".cache" || names[i] === ".sure" || names[i] === "App" || names[i] === "User" || names[i] === "node_modules" || names[i] === "sure_modules" || names[i] === "kind_modules") continue;
    var p = path.join(dir, names[i]);
    var st;
    try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) collect_kind_files(p, acc);
    else if (names[i].slice(-5) === ".sure") acc.push(p);
  }
  return acc;
}

function word_at(text, offset) {
  var i = offset;
  var j = offset;
  while (i > 0 && /[A-Za-z0-9._]/.test(text[i - 1])) i--;
  while (j < text.length && /[A-Za-z0-9._]/.test(text[j])) j++;
  return text.slice(i, j);
}

function line_col_offset(text, line, character) {
  var lines = String(text).split("\n");
  var off = 0;
  for (var i = 0; i < line && i < lines.length; i++) off += lines[i].length + 1;
  return off + (character || 0);
}

function file_of_name(name) {
  var candidates = [
    name.replace(/\./g, "/") + ".sure",
    name.split(".").slice(0, -1).join("/") + ".sure",
    name.split(".")[0] + ".sure",
  ];
  for (var i = 0; i < candidates.length; i++) {
    var p = path.join(process.cwd(), candidates[i]);
    if (fs.existsSync(p)) return p;
  }
  return path.join(process.cwd(), candidates[0]);
}

function scan_references(name) {
  var files = collect_kind_files(process.cwd());
  var hits = [];
  for (var i = 0; i < files.length && hits.length < 200; i++) {
    var body;
    try { body = fs.readFileSync(files[i], "utf8"); } catch (e) { continue; }
    var toks = compiler.idents(body);
    var hit = false;
    for (var t = 0; t < toks.length; t++) {
      if (toks[t].name === name) { hit = true; break; }
    }
    if (!hit) continue;
    var rel = path.relative(process.cwd(), files[i]);
    hits.push({file: rel, name: name});
  }
  return hits;
}

function def_header(line) {
  return /^([A-Za-z][A-Za-z0-9._]*)(?:<[^>]*>)?(?:\([^)]*\))?\s*[:](.*)$/.exec(line);
}

function scan_defs(dir) {
  var files = collect_kind_files(dir || process.cwd());
  var out = [];
  for (var i = 0; i < files.length; i++) {
    var body;
    try { body = fs.readFileSync(files[i], "utf8"); } catch (e) { continue; }
    var rel = path.relative(process.cwd(), files[i]);
    var parsed = compiler.parse_module_headers(body);
    var mod = parsed.mod && parsed.mod.name;
    var doc = compiler.parse_document(body);
    var blocks = {};
    var docs = {};
    var pendingDoc = [];
    for (var b = 0; b < doc.blocks.length; b++) {
      var blk = doc.blocks[b];
      if (blk.kind === "comment") {
        pendingDoc.push(String(blk.text || "").replace(/^\s*\/\/\s?/gm, ""));
        continue;
      }
      if (blk.kind === "def" || blk.kind === "type") {
        var first = String(blk.text || "").split("\n")[0] || "";
        var hm = /^type\s+([A-Za-z][A-Za-z0-9._]*)/.exec(first) || /^([A-Za-z][A-Za-z0-9._]*)/.exec(first);
        if (hm) {
          blocks[hm[1]] = blk.text;
          docs[hm[1]] = pendingDoc.join("\n");
        }
      }
      if (blk.kind !== "blank") pendingDoc = [];
    }
    var syms = compiler.symbols(body);
    for (var s = 0; s < syms.length; s++) {
      var name = syms[s].name;
      var text = blocks[name] || "";
      var qual = (mod && name.indexOf(".") < 0) ? mod + "." + name : name;
      out.push({
        name: qual,
        file: rel,
        line: syms[s].line,
        type: syms[s].type || "",
        theorem: !!syms[s].theorem,
        implement: /\?implement/.test(text),
        body: text,
        doc: docs[name] || ""
      });
    }
  }
  return out;
}

function name_mentioned(text, name) {
  if (!name) return false;
  var re = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
  return re.test(text || "");
}

function scan_impact(name) {
  if (!name) return {ok: false, error: "need name"};
  var defs = scan_defs();
  var callers = [];
  var proofs = [];
  var holes = [];
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    if (d.name === name) continue;
    if (!name_mentioned(d.body, name) && !name_mentioned(d.type, name)) continue;
    var hit = {name: d.name, file: d.file, line: d.line, theorem: !!d.theorem};
    if (d.theorem) {
      if (proofs.length < 100) proofs.push(hit);
    } else if (callers.length < 100) {
      callers.push(hit);
    }
    if (d.implement && holes.length < 50) holes.push(hit);
  }
  return {
    ok: true,
    name: name,
    callers: callers,
    proofs: proofs,
    holes: holes,
  };
}

function scan_theorems(name) {
  var defs = scan_defs();
  var out = [];
  for (var i = 0; i < defs.length && out.length < 200; i++) {
    var d = defs[i];
    if (!d.theorem) continue;
    if (name && d.name !== name && !name_mentioned(d.body, name) && !name_mentioned(d.type, name)) continue;
    out.push({name: d.name, file: d.file, line: d.line, type: d.type});
  }
  return {ok: true, name: name || "", theorems: out};
}

function scan_docs(name) {
  if (!name) return {ok: false, error: "need name"};
  var defs = scan_defs();
  var entries = [];
  for (var i = 0; i < defs.length && entries.length < 200; i++) {
    var d = defs[i];
    var hit = d.name === name || d.name.indexOf(name + ".") === 0 ||
      (name.slice(-1) === "." && d.name.indexOf(name) === 0);
    if (!hit) continue;
    entries.push({
      name: d.name,
      file: d.file,
      line: d.line,
      type: d.type,
      doc: d.doc || "",
      theorem: !!d.theorem,
      implement: !!d.implement,
    });
  }
  return {ok: entries.length > 0, name: name, entries: entries};
}

function names_in(text) {
  var out = [];
  var re = /[A-Z][A-Za-z0-9._]*/g;
  var m;
  while ((m = re.exec(String(text || "")))) {
    if (out.indexOf(m[0]) < 0) out.push(m[0]);
  }
  return out;
}

function scan_dependencies(name) {
  if (!name) return {ok: false, error: "need name"};
  var defs = scan_defs();
  var d = null;
  for (var i = 0; i < defs.length; i++) {
    if (defs[i].name === name) { d = defs[i]; break; }
  }
  if (!d) return {ok: false, error: "not found", name: name, dependencies: []};
  var raw = names_in(d.body);
  var dependencies = [];
  for (var j = 0; j < raw.length; j++) {
    if (raw[j] !== name) dependencies.push(raw[j]);
  }
  return {ok: true, name: name, file: d.file, theorem: !!d.theorem, dependencies: dependencies};
}

function scan_graph(name, depth) {
  if (!name) return {ok: false, error: "need name"};
  var dmax = depth == null || depth === "" ? 2 : Number(depth);
  if (!Number.isFinite(dmax) || dmax < 0) dmax = 0;
  var defs = scan_defs();
  var map = {};
  for (var i = 0; i < defs.length; i++) map[defs[i].name] = defs[i];
  if (!map[name]) return {ok: false, error: "not found", name: name, depth: dmax, nodes: [], edges: []};
  var nodes = [];
  var edges = [];
  var seen = {};
  var budget = 48;
  function walk(n, left) {
    if (seen[n] || nodes.length >= budget) return;
    seen[n] = true;
    var def = map[n];
    nodes.push({name: n, ok: !!def, theorem: !!(def && def.theorem), file: def ? def.file : ""});
    if (!def || left <= 0) return;
    var raw = names_in(def.body);
    for (var j = 0; j < raw.length; j++) {
      if (raw[j] === n) continue;
      edges.push({from: n, to: raw[j]});
      walk(raw[j], left - 1);
    }
  }
  walk(name, dmax);
  return {ok: true, name: name, depth: dmax, nodes: nodes, edges: edges};
}

function scan_project_holes() {
  var defs = scan_defs();
  var out = [];
  for (var i = 0; i < defs.length && out.length < 200; i++) {
    if (!defs[i].implement) continue;
    out.push({name: defs[i].name, file: defs[i].file, line: defs[i].line});
  }
  return {ok: true, holes: out};
}

function scan_symbols(prefix) {
  var files = collect_kind_files(process.cwd());
  var out = [];
  var pre = prefix || "";
  for (var i = 0; i < files.length && out.length < 400; i++) {
    var body;
    try { body = fs.readFileSync(files[i], "utf8"); } catch (e) { continue; }
    var rel = path.relative(process.cwd(), files[i]);
    var syms = compiler.symbols(body);
    for (var j = 0; j < syms.length && out.length < 400; j++) {
      if (syms[j].name.indexOf(pre) === 0) {
        out.push({name: syms[j].name, file: rel, line: syms[j].line, type: syms[j].type});
      }
    }
  }
  return out;
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

var LSP_KEYWORDS = ["type", "case", "let", "open", "as", "if", "then", "else", "some", "none", "true", "false", "refl", "unit", "with"];

function lsp_method_read(s) {
  s = String(s || "");
  var known = {
    "initialize": 1, "shutdown": 1, "exit": 1,
    "textDocument/didOpen": 1, "textDocument/didChange": 1, "textDocument/didClose": 1, "textDocument/didSave": 1,
    "textDocument/hover": 1, "textDocument/definition": 1, "textDocument/completion": 1,
    "textDocument/formatting": 1, "textDocument/rename": 1, "textDocument/references": 1,
    "textDocument/documentSymbol": 1, "textDocument/documentHighlight": 1, "textDocument/prepareRename": 1,
    "workspace/symbol": 1, "textDocument/codeAction": 1, "$/cancelRequest": 1, "initialized": 1
  };
  return known[s] ? s : "";
}

function lsp_keyword(s) {
  return LSP_KEYWORDS.indexOf(String(s || "")) >= 0;
}

function lsp_ext(p) {
  return String(p || "").slice(-5) === ".sure";
}

function lsp_uri_ok(s) {
  s = String(s || "");
  if (!s) return false;
  return s.indexOf("file:") === 0 || s.indexOf("untitled:") === 0;
}

function lsp_frame(body) {
  var b = String(body == null ? "" : body);
  return "Content-Length: " + Buffer.byteLength(b, "utf8") + "\r\n\r\n" + b;
}

function lsp_write(msg) {
  process.stdout.write(lsp_frame(JSON.stringify(msg)));
}

function lsp_path_to_uri(p) {
  var abs = path.resolve(String(p || ""));
  var parts = abs.split(path.sep);
  var joined = parts.map(function(seg) { return encodeURIComponent(seg); }).join("/");
  if (joined.charAt(0) !== "/") joined = "/" + joined;
  return "file://" + joined;
}

function lsp_uri_to_path(uri) {
  uri = String(uri || "");
  if (uri.indexOf("file://") !== 0) return "";
  var rest = uri.slice("file://".length);
  try { rest = decodeURIComponent(rest); } catch (e) {}
  if (/^\/[A-Za-z]:/.test(rest)) rest = rest.slice(1);
  return rest;
}

function lsp_pos_at(text, offset) {
  text = String(text || "");
  var n = offset;
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n > text.length) n = text.length;
  var line = 0, ch = 0;
  for (var i = 0; i < n; i++) {
    if (text.charAt(i) === "\n") { line += 1; ch = 0; }
    else ch += 1;
  }
  return {line: line, character: ch};
}

function lsp_full_range(text) {
  text = String(text || "");
  return {start: {line: 0, character: 0}, end: lsp_pos_at(text, text.length)};
}

function lsp_word_range(text, offset) {
  text = String(text || "");
  var tok = compiler.ident_at(text, offset);
  if (tok) {
    return {
      start: lsp_pos_at(text, tok.start),
      end: lsp_pos_at(text, tok.end),
      word: tok.name,
      from: tok.start,
      upto: tok.end
    };
  }
  var i = offset;
  if (!Number.isFinite(i) || i < 0) i = 0;
  if (i > text.length) i = text.length;
  return {start: lsp_pos_at(text, i), end: lsp_pos_at(text, i), word: "", from: i, upto: i};
}

function lsp_name_at(text, line, character) {
  var tok = compiler.ident_at(text, line_col_offset(text, line, character));
  return tok ? tok.name : "";
}

function lsp_apply_changes(text, changes) {
  var cur = String(text == null ? "" : text);
  if (!changes || !changes.length) return cur;
  for (var i = 0; i < changes.length; i++) {
    var ch = changes[i] || {};
    if (ch.range == null) {
      cur = ch.text == null ? "" : String(ch.text);
      continue;
    }
    var start = ch.range.start || {line: 0, character: 0};
    var end = ch.range.end || start;
    var a = line_col_offset(cur, start.line, start.character);
    var b = line_col_offset(cur, end.line, end.character);
    if (a < 0) a = 0;
    if (b < a) b = a;
    if (a > cur.length) a = cur.length;
    if (b > cur.length) b = cur.length;
    cur = cur.slice(0, a) + String(ch.text == null ? "" : ch.text) + cur.slice(b);
  }
  return cur;
}

function lsp_defs_in_text(text) {
  var parsed = compiler.parse_module_headers(text);
  var mod = parsed.mod && parsed.mod.name;
  return compiler.symbols(text).map(function(s) {
    var name = s.name;
    if (mod && name.indexOf(".") < 0) name = mod + "." + name;
    return {name: name, line: s.line, type: s.type, theorem: s.theorem};
  });
}

function lsp_find_name_range(text, name) {
  text = String(text || "");
  if (!name) {
    var end = Math.min(1, (text.split("\n")[0] || "").length);
    return {start: {line: 0, character: 0}, end: {line: 0, character: end}};
  }
  var toks = compiler.idents(text);
  for (var i = 0; i < toks.length; i++) {
    if (toks[i].name === name) {
      return {start: lsp_pos_at(text, toks[i].start), end: lsp_pos_at(text, toks[i].end)};
    }
  }
  var end0 = Math.min(1, (text.split("\n")[0] || "").length);
  return {start: {line: 0, character: 0}, end: {line: 0, character: end0}};
}

function lsp_range_from_origin(text, origin) {
  if (!origin || typeof origin.from !== "number" || typeof origin.upto !== "number") return null;
  var from = origin.from;
  var upto = origin.upto;
  if (from < 0) from = 0;
  if (upto < from) upto = from;
  return {start: lsp_pos_at(text, from), end: lsp_pos_at(text, upto)};
}

function lsp_diag(report, text, file) {
  text = String(text || "");
  var mapped = compiler.get_map(file || "");
  var raw = (report && report.diagnostics) || [];
  return raw.map(function(d) {
    var err = d.error || d;
    var code = err.code || "error";
    var sev = code === "show_goal" || code === "residual_hole" ? 2 : 1;
    var origin = err.origin;
    if (origin && mapped && mapped.map && typeof origin.from === "number") {
      origin = {
        from: compiler.map_offset(mapped.map, origin.from),
        upto: compiler.map_offset(mapped.map, origin.upto)
      };
    }
    var range = lsp_range_from_origin(text, origin) || lsp_find_name_range(text, err.name);
    var msg = code + (err.name ? " " + err.name : "");
    if (err.message) msg += ": " + err.message;
    return {message: msg, severity: sev, source: "sure", code: code, range: range};
  });
}

function lsp_highlights(text, word) {
  if (!word) return [];
  var toks = compiler.idents(text);
  var out = [];
  for (var i = 0; i < toks.length; i++) {
    if (toks[i].name !== word) continue;
    out.push({
      range: {start: lsp_pos_at(text, toks[i].start), end: lsp_pos_at(text, toks[i].end)},
      kind: 1
    });
  }
  return out;
}

function lsp_replace_word(text, oldN, newN) {
  if (!oldN || newN == null || newN === "") return null;
  var toks = compiler.idents(text);
  var next = "";
  var i = 0;
  for (var t = 0; t < toks.length; t++) {
    if (toks[t].name !== oldN) continue;
    next += String(text || "").slice(i, toks[t].start) + String(newN);
    i = toks[t].end;
  }
  next += String(text || "").slice(i);
  return next;
}

function lsp_new_state() {
  return {docs: {}, init: false, shutdown: false, exit: false};
}

function lsp_capabilities() {
  return {
    textDocumentSync: {openClose: true, change: 1, save: {includeText: true}},
    hoverProvider: true,
    definitionProvider: true,
    completionProvider: {triggerCharacters: ["."]},
    documentFormattingProvider: true,
    renameProvider: {prepareProvider: true},
    referencesProvider: true,
    documentSymbolProvider: true,
    documentHighlightProvider: true,
    workspaceSymbolProvider: true,
    codeActionProvider: true
  };
}

function lsp_parse_frames(buf) {
  var rest = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || "");
  var msgs = [];
  while (true) {
    var headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd < 0) return {msgs: msgs, rest: rest, error: null};
    var header = rest.slice(0, headerEnd).toString("utf8");
    var m = /Content-Length:\s*(\d+)/i.exec(header);
    if (!m) {
      rest = rest.slice(headerEnd + 4);
      continue;
    }
    var len = parseInt(m[1], 10);
    if (!Number.isFinite(len) || len < 0) {
      return {msgs: msgs, rest: rest.slice(headerEnd + 4), error: "bad content-length"};
    }
    var start = headerEnd + 4;
    if (rest.length < start + len) return {msgs: msgs, rest: rest, error: null};
    var body = rest.slice(start, start + len).toString("utf8");
    rest = rest.slice(start + len);
    try { msgs.push(JSON.parse(body)); }
    catch (e) { msgs.push({_parse_error: true, raw: body}); }
  }
}

async function lsp_publish(state, uri, text) {
  var report = {ok: true, diagnostics: []};
  var file = lsp_uri_to_path(uri) || "buffer.sure";
  if (text) {
    try {
      var expanded = compiler.prepare_source(file, text);
      report = await agent_check_code(expanded);
    } catch (e) { report = {ok: false, diagnostics: [{error: {code: "error", message: String(e && e.message || e)}}]}; }
  }
  return {
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {uri: uri, diagnostics: lsp_diag(report, text, file)}
  };
}

async function lsp_handle(state, msg) {
  state = state || lsp_new_state();
  var out = [];
  function result(r) { if (msg && msg.id !== undefined) out.push({jsonrpc: "2.0", id: msg.id, result: r}); }
  function error(code, message) { if (msg && msg.id !== undefined) out.push(json_err(msg.id, code, message)); }

  if (!msg || msg._parse_error) {
    out.push(json_err(null, -32700, "parse error"));
    return {state: state, out: out};
  }
  if (typeof msg !== "object") {
    out.push(json_err(null, -32600, "invalid request"));
    return {state: state, out: out};
  }
  var method = msg.method;
  var params = msg.params || {};
  var id = msg.id;

  if (method === "exit") {
    state.exit = true;
    return {state: state, out: out};
  }
  if (method === "initialize") {
    state.init = true;
    result({capabilities: lsp_capabilities(), serverInfo: {name: "sure", version: SURE_VERSION}});
    return {state: state, out: out};
  }
  if (!state.init) {
    if (id !== undefined) error(-32002, "ServerNotInitialized");
    return {state: state, out: out};
  }
  if (method === "initialized" || method === "$/cancelRequest") return {state: state, out: out};
  if (method === "shutdown") {
    state.shutdown = true;
    result(null);
    return {state: state, out: out};
  }
  if (state.shutdown) {
    if (id !== undefined) error(-32600, "invalid request");
    return {state: state, out: out};
  }

  var uri, text, pos, name, td;
  td = params.textDocument || {};
  uri = td.uri || params.uri || "";
  text = (uri && state.docs[uri] != null) ? state.docs[uri] : "";
  pos = params.position || {line: 0, character: 0};

  if (method === "textDocument/didOpen") {
    uri = td.uri || "";
    text = td.text == null ? "" : String(td.text);
    if (uri) {
      state.docs[uri] = text;
      out.push(await lsp_publish(state, uri, text));
    }
    return {state: state, out: out};
  }
  if (method === "textDocument/didChange") {
    uri = td.uri || "";
    if (uri) {
      state.docs[uri] = lsp_apply_changes(state.docs[uri] || "", params.contentChanges);
      out.push(await lsp_publish(state, uri, state.docs[uri]));
    }
    return {state: state, out: out};
  }
  if (method === "textDocument/didClose") {
    uri = td.uri || "";
    if (uri) {
      delete state.docs[uri];
      out.push({jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: {uri: uri, diagnostics: []}});
    }
    return {state: state, out: out};
  }
  if (method === "textDocument/didSave") {
    uri = td.uri || "";
    if (params.text != null) state.docs[uri] = String(params.text);
    text = state.docs[uri] || "";
    if (uri) out.push(await lsp_publish(state, uri, text));
    return {state: state, out: out};
  }

  if (method === "textDocument/hover") {
    name = lsp_name_at(text, pos.line, pos.character);
    if (!name) { result(null); return {state: state, out: out}; }
    var hover_rep = await agent_check_name(name);
    var types = (hover_rep && hover_rep.types) || [];
    var value = types[0] ? types[0].name + " : " + types[0].type : (name + (hover_rep && hover_rep.pretty ? "\n" + hover_rep.pretty : ""));
    var wr = lsp_word_range(text, line_col_offset(text, pos.line, pos.character));
    result({contents: {kind: "markdown", value: "```sure\n" + value + "\n```"}, range: {start: wr.start, end: wr.end}});
    return {state: state, out: out};
  }
  if (method === "textDocument/definition") {
    name = lsp_name_at(text, pos.line, pos.character);
    if (!name) { result(null); return {state: state, out: out}; }
    var defs = scan_defs();
    var hit = null;
    for (var di = 0; di < defs.length; di++) { if (defs[di].name === name) { hit = defs[di]; break; } }
    var file = hit ? path.resolve(process.cwd(), hit.file) : file_of_name(name);
    if (!file || !fs.existsSync(file)) { result(null); return {state: state, out: out}; }
    var line = hit ? hit.line : 0;
    result({uri: lsp_path_to_uri(file), range: {start: {line: line, character: 0}, end: {line: line, character: name.length}}});
    return {state: state, out: out};
  }
  if (method === "textDocument/completion") {
    var prefix = "";
    try { prefix = lsp_name_at(text, pos.line, pos.character) || ""; } catch (e) { prefix = ""; }
    var items = [];
    var seen = {};
    LSP_KEYWORDS.forEach(function(k) {
      if (k.indexOf(prefix) === 0 && !seen[k]) {
        seen[k] = true;
        items.push({label: k, kind: 14, detail: "keyword"});
      }
    });
    compiler.idents(text).forEach(function(tok) {
      if (!tok.name || tok.name.indexOf(prefix) !== 0 || seen[tok.name]) return;
      seen[tok.name] = true;
      items.push({label: tok.name, kind: 6, detail: "ident"});
    });
    scan_symbols(prefix).slice(0, 50).forEach(function(s) {
      if (seen[s.name]) return;
      seen[s.name] = true;
      items.push({label: s.name, kind: 6, detail: s.file});
    });
    result(items);
    return {state: state, out: out};
  }
  if (method === "textDocument/prepareRename") {
    name = lsp_name_at(text, pos.line, pos.character);
    if (!name) { result(null); return {state: state, out: out}; }
    var pr = lsp_word_range(text, line_col_offset(text, pos.line, pos.character));
    result({range: {start: pr.start, end: pr.end}, placeholder: name});
    return {state: state, out: out};
  }
  if (method === "textDocument/rename") {
    name = lsp_name_at(text, pos.line, pos.character);
    var newN = params.newName;
    if (!name || newN == null || String(newN) === "") { error(-32602, "need name"); return {state: state, out: out}; }
    var next = lsp_replace_word(text, name, String(newN));
    if (next == null) { error(-32602, "need name"); return {state: state, out: out}; }
    state.docs[uri] = next;
    result({documentChanges: [{
      textDocument: {uri: uri, version: td.version == null ? null : td.version},
      edits: [{range: lsp_full_range(text), newText: next}]
    }]});
    return {state: state, out: out};
  }
  if (method === "textDocument/formatting") {
    if (!text) { result([]); return {state: state, out: out}; }
    var formatted = compiler.format_source(text);
    result([{range: lsp_full_range(text), newText: formatted}]);
    return {state: state, out: out};
  }
  if (method === "textDocument/documentSymbol") {
    result(lsp_defs_in_text(text).map(function(d) {
      var rng = {start: {line: d.line, character: 0}, end: {line: d.line, character: (d.name || "").length}};
      return {name: d.name, kind: d.theorem ? 14 : 12, detail: d.type || "", range: rng, selectionRange: rng};
    }));
    return {state: state, out: out};
  }
  if (method === "textDocument/documentHighlight") {
    name = lsp_name_at(text, pos.line, pos.character);
    result(lsp_highlights(text, name));
    return {state: state, out: out};
  }
  if (method === "textDocument/references") {
    name = lsp_name_at(text, pos.line, pos.character);
    if (!name) { result([]); return {state: state, out: out}; }
    var locs = [];
    var refs = scan_references(name);
    for (var ri = 0; ri < refs.length; ri++) {
      var fp = path.resolve(process.cwd(), refs[ri].file);
      var body;
      try { body = fs.readFileSync(fp, "utf8"); } catch (e) { continue; }
      lsp_highlights(body, name).forEach(function(h) {
        locs.push({uri: lsp_path_to_uri(fp), range: h.range});
      });
    }
    result(locs);
    return {state: state, out: out};
  }
  if (method === "workspace/symbol") {
    var q = params.query == null ? "" : String(params.query);
    result(scan_symbols(q).slice(0, 50).map(function(s) {
      var fp = path.resolve(process.cwd(), s.file);
      var rng = {start: {line: s.line || 0, character: 0}, end: {line: s.line || 0, character: (s.name || "").length}};
      return {name: s.name, kind: 6, location: {uri: lsp_path_to_uri(fp), range: rng}};
    }));
    return {state: state, out: out};
  }
  if (method === "textDocument/codeAction") {
    var actions = [];
    name = "";
    try {
      var range = params.range || {start: pos, end: pos};
      name = lsp_name_at(text, range.start.line, range.start.character);
    } catch (e) { name = ""; }
    if (name) {
      actions.push({
        title: "Prove " + name,
        kind: "quickfix",
        command: {title: "Prove", command: "sure.prove", arguments: [name]}
      });
      actions.push({
        title: "Debug " + name,
        kind: "quickfix",
        command: {title: "Debug", command: "sure.debug", arguments: [name]}
      });
    }
    if (String(text).indexOf("?implement") >= 0) {
      actions.push({
        title: "Show remaining holes",
        kind: "quickfix",
        command: {title: "Goal", command: "sure.goal", arguments: [name || ""]}
      });
    }
    result(actions);
    return {state: state, out: out};
  }

  if (id !== undefined) error(-32601, "Method not found: " + method);
  return {state: state, out: out};
}

async function cmd_lsp() {
  var buf = Buffer.alloc(0);
  var state = lsp_new_state();
  var busy = Promise.resolve();
  process.stdin.on("data", function(chunk) {
    buf = Buffer.concat([buf, chunk]);
    busy = busy.then(pump).catch(function() {});
  });
  process.stdin.on("end", function() { busy = busy.then(pump).then(function() { process.exit(state.exit || state.shutdown ? 0 : 0); }); });
  async function pump() {
    while (true) {
      var parsed = lsp_parse_frames(buf);
      buf = parsed.rest;
      if (!parsed.msgs.length) return;
      for (var i = 0; i < parsed.msgs.length; i++) {
        var handled = await lsp_handle(state, parsed.msgs[i]);
        state = handled.state;
        (handled.out || []).forEach(lsp_write);
        if (state.exit) process.exit(0);
      }
    }
  }
}

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
  if (mount.indexOf("parentElement") < 0 || mount.indexOf("catch") < 0 || mount.indexOf("Sure.Ui.Client.new") < 0 || mount.indexOf("EventSource") < 0 || mount.indexOf("__sureMounted") < 0 || mount.indexOf("data-sure-scroll") < 0 || mount.indexOf("scrollTop") < 0 || mount.indexOf("FileReader") < 0 || mount.indexOf("POST") < 0 || mount.indexOf("same-origin") < 0) {
    console.log("fail mount harden"); failed += 1;
  } else console.log("ok   mount harden");
  if (sure_emit_file("../etc") !== "" || sure_emit_file("a/b") !== "" || sure_emit_html_file("..") !== "") {
    console.log("fail emit path traversal"); failed += 1;
  } else console.log("ok   emit path traversal");
  var page = sure_html_wrap("Main", "module.exports={};");
  if (!page || page.indexOf("sure-root") < 0 || page.indexOf("SureDom.mount") < 0 || page.indexOf("\"click\"") < 0 || page.indexOf("\"wheel\"") < 0 || page.indexOf("<style>") < 0 || page.indexOf("cdn.tailwindcss.com") >= 0 || page.indexOf("daisyui") >= 0) {
    console.log("fail html wrap events"); failed += 1;
  } else console.log("ok   html wrap events");
  if (SURE_DOM_EVENTS.length !== 122) {
    console.log("fail event count " + SURE_DOM_EVENTS.length); failed += 1;
  } else console.log("ok   event count 122");
  var stub_js = "module.exports={view:function(){return {tag:'button',kids:[]};}};";
  var page_c = sure_html_wrap("Html.Counter.client", stub_js);
  if (!page_c || page_c.indexOf("SureDom.mount") < 0 || page_c.indexOf("visibilitychange") < 0 || page_c.indexOf("\"click\"") < 0) {
    console.log("fail html counter page"); failed += 1;
  } else console.log("ok   html counter page");
  if (sure_emit_html_file("") !== "" || sure_emit_html_file("Main") !== "dist/Main.html") {
    console.log("fail emit html file"); failed += 1;
  } else console.log("ok   emit html file");
  if (sure_help_topic("") !== "start" || sure_help_topic("json") !== "json" || sure_help_topic("ffi") !== "ffi" || sure_help_topic("gen") !== "gen" || sure_help_topic("pkg") !== "pkg" || sure_help_topic("bun") !== "bun" || sure_help_topic("debug") !== "debug" || sure_help_topic("lsp") !== "lsp" || sure_help_topic("pipe") !== "pipe" || sure_help_topic("time") !== "time" || sure_help_topic("cli") !== "cli" || sure_help_topic("log") !== "log" || sure_help_topic("repl") !== "repl" || sure_help_topic("test") !== "test" || sure_help_topic("cover") !== "cover" || sure_help_topic("env") !== "env" || sure_help_topic("cfg") !== "cfg" || sure_help_topic("ssr") !== "ssr" || sure_help_topic("ui") !== "ui" || sure_help_topic("web") !== "web" || sure_help_topic("xyz") !== null) {
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
    var child = cp.spawn(process.execPath, ["--stack-size=10000", __filename, "lsp"], {
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
  var prev_cwd = ORIG_CWD;
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
    ORIG_CWD = path.join(tmpm, "app");
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
    ORIG_CWD = path.join(tmpm, "pkg");
    var hide = check_project_modules(true);
    if (hide.ok) { console.log("fail module hide " + JSON.stringify(hide)); failed += 1; }
    else console.log("ok   module hide");
  } catch (e) {
    console.log("fail module project " + e); failed += 1;
  } finally {
    ORIG_CWD = prev_cwd;
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

function sure_runtime_pick(flag, env, native) {
  if (flag) return "bun";
  if (String(env || "") === "bun") return "bun";
  if (native) return "bun";
  return "node";
}

function bun_available() {
  try {
    run_spawn("bun", ["--version"], {stdio: "pipe", timeout: 5000});
    return true;
  } catch (e) {
    return false;
  }
}

function bun_native() {
  return typeof Bun !== "undefined";
}

function sure_js_abs(js_path) {
  if (!js_path) return "";
  return path.isAbsolute(js_path) ? js_path : path.join(process.cwd(), js_path);
}

function restore_user_cwd() {
  try { if (ORIG_CWD) process.chdir(ORIG_CWD); } catch (e) {}
}

function sure_run_js(js_path, use_bun, extra) {
  extra = extra || [];
  restore_user_cwd();
  if (!js_path) return {ok: false, error: "need js file"};
  var abs = sure_js_abs(js_path);
  if (!abs || !fs.existsSync(abs)) return {ok: false, error: "missing js"};
  var want = sure_runtime_pick(!!use_bun, process.env.SURE_RUNTIME, bun_native()) === "bun";
  var more = extra.map(function(a) { return " " + JSON.stringify(a); }).join("");
  if (want && !bun_native()) {
    if (!bun_available()) return {ok: false, error: "bun not found"};
    try {
      run_spawn("bun", [abs].concat(extra), {stdio: "inherit"});
      return {ok: true, runtime: "bun", file: abs};
    } catch (e) {
      return {ok: false, error: String(e && e.message || e), runtime: "bun", file: abs};
    }
  }
  var prev = process.argv;
  process.argv = [process.execPath, abs, "--run"].concat(extra);
  try {
    require(abs);
    return {ok: true, runtime: bun_native() ? "bun" : "node", file: abs};
  } catch (e) {
    return {ok: false, error: String(e && e.message || e), runtime: bun_native() ? "bun" : "node", file: abs};
  } finally {
    process.argv = prev;
  }
}

function run_compiled_js(js_path, use_bun, extra) {
  var r = sure_run_js(js_path, use_bun, extra);
  if (!r.ok) {
    console.error(r.error || "run failed");
    process.exit(1);
  }
}

async function run_term_inprocess(term) {
  var prev_sure = process.env.SURE_PATH;
  var prev_kind = process.env.KIND_PATH;
  var prev_cwd = process.cwd();
  var js_path = path.join(require("os").tmpdir(), "sure-run-" + process.pid + "-" + String(term).replace(/\W/g, "_") + "-" + Date.now() + ".js");
  var abs = path.resolve(js_path);
  try {
    delete process.env.SURE_PATH;
    delete process.env.KIND_PATH;
    process.env.SURE_BASE = STDLIB_BASE;
    process.env.KIND_BASE = STDLIB_BASE;
    process.chdir(STDLIB_BASE);
    console.log("compile " + term + "  [" + new Date().toISOString() + "]");
    var fmcc = await kind.run(checker("api.io.term_to_core")(term));
    console.log("emit " + term + "  [" + new Date().toISOString() + "]");
    var asjs = fmc_to_js.compile(fmcc, term, {module: true});
    fs.writeFileSync(js_path, asjs);
    console.log("run " + term + "  [" + new Date().toISOString() + "]");
    delete require.cache[abs];
    var mod = require(abs);
    if (!mod || typeof mod.$main$ !== "function") {
      throw new Error("compiled " + term + " has no $main$");
    }
    await Promise.resolve(mod.$main$());
  } finally {
    try { delete require.cache[abs]; } catch (e1) {}
    try { fs.unlinkSync(js_path); } catch (e2) {}
    try { process.chdir(prev_cwd); } catch (e3) {}
    if (prev_sure == null) delete process.env.SURE_PATH;
    else process.env.SURE_PATH = prev_sure;
    if (prev_kind == null) delete process.env.KIND_PATH;
    else process.env.KIND_PATH = prev_kind;
  }
}

async function run_term_capture(term) {
  var chunks = [];
  var orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = function(chunk, enc, cb) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    if (typeof enc === "function") return orig(chunk, enc);
    if (typeof cb === "function") return orig(chunk, enc, cb);
    return orig(chunk, enc);
  };
  try {
    await run_term_inprocess(term);
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

function spawn_term_run(term) {
  var main_js = path.join(__dirname, "main.js");
  var root = path.join(__dirname, "../../..");
  var base = path.join(root, "base");
  var env = Object.assign({}, process.env, {
    SURE_BASE: base,
    KIND_BASE: base
  });
  delete env.SURE_PATH;
  delete env.KIND_PATH;
  var want = sure_runtime_pick(false, process.env.SURE_RUNTIME, bun_native()) === "bun"
    || process.argv.indexOf("--bun") >= 0;
  if (want) {
    if (!bun_native() && !bun_available()) throw new Error("bun not found");
    var bun_bin = bun_native() ? process.execPath : "bun";
    run_spawn(bun_bin, [main_js, term, "--run"], {stdio: "inherit", env: env, cwd: base});
    return;
  }
  run_spawn(process.execPath, ["--stack-size=10000", main_js, term, "--run"], {stdio: "inherit", env: env, cwd: base});
}

(async () => {
  var argv = process.argv.slice(2).filter(function(a) { return a !== "--bun"; });
  var use_bun = process.argv.indexOf("--bun") >= 0 || process.env.SURE_RUNTIME === "bun";
  var name = argv[0];
  var flag = argv[1];

  if (name === "new") {
    var new_pkg = false;
    var new_name = "";
    for (var ni = 1; ni < argv.length; ni++) {
      if (argv[ni] === "--package") new_pkg = true;
      else if (!new_name) new_name = argv[ni];
    }
    cmd_new(new_name, new_pkg);
    process.exit(0);
  }
  if (name === "add") { cmd_add(argv[1]); process.exit(0); }
  if (name === "remove") { cmd_remove(argv[1]); process.exit(0); }
  if (name === "install") { cmd_install(); process.exit(0); }
  if (name === "expose") { cmd_expose(argv[1]); process.exit(0); }
  if (name === "lsp") { await cmd_lsp(); return; }
  if (name === "agent") {
    if (argv[1] === "--client") {
      await cmd_agent_client(argv[2], argv.slice(3).join(" "));
      process.exit(0);
    }
    await cmd_agent_stdio();
    return;
  }
  if (name === "fmt") { await cmd_fmt(argv[1]); process.exit(0); }
  if (name === "doc") {
    var doc_json = false;
    var doc_name = "";
    for (var di = 1; di < argv.length; di++) {
      if (argv[di] === "--json") doc_json = true;
      else if (!doc_name) doc_name = argv[di];
    }
    await cmd_doc(doc_name, doc_json);
    return;
  }
  if (name === "check") {
    apply_project_env();
    var check_failed = await check_term_ok(argv[1] || "Main");
    if (check_failed) process.exit(1);
    var prove_failed = await prove_project_theorems(false);
    process.exit(prove_failed ? 1 : 0);
  }
  if (name === "impact") {
    cmd_impact(argv[1]);
    process.exit(0);
  }
  if (name === "theorems") {
    cmd_theorems(argv[1]);
    process.exit(0);
  }
  if (name === "deps") {
    cmd_deps(argv[1]);
    process.exit(0);
  }
  if (name === "bench") {
    var bench_json = false;
    var bench_n = 3;
    var bench_name = "";
    for (var bni = 1; bni < argv.length; bni++) {
      if (argv[bni] === "--json") bench_json = true;
      else if (argv[bni] === "--n" && argv[bni + 1] != null) bench_n = argv[++bni];
      else if (!bench_name) bench_name = argv[bni];
    }
    await cmd_bench(bench_name, bench_n, bench_json);
    process.exit(0);
  }
  if (name === "graph") {
    var gname = "";
    var gdepth = 2;
    for (var gi = 1; gi < argv.length; gi++) {
      if (argv[gi] === "--depth" && argv[gi + 1] != null) { gdepth = argv[++gi]; }
      else if (!gname) gname = argv[gi];
    }
    cmd_graph(gname, gdepth);
    process.exit(0);
  }
  if (name === "debug") {
    var dbg_json = false;
    var dbg_level = "trace";
    var dbg_opt = "";
    var dbg_norm = false;
    var dbg_name = "";
    for (var dgi = 1; dgi < argv.length; dgi++) {
      if (argv[dgi] === "--json") dbg_json = true;
      else if (argv[dgi] === "--norm") dbg_norm = true;
      else if (argv[dgi].indexOf("--debug=") === 0) {
        var dlv = parse_debug_arg(argv[dgi].slice(8));
        if (!dlv) { console.error("sure: bad --debug=" + argv[dgi].slice(8)); process.exit(1); }
        dbg_level = dlv;
      } else if (argv[dgi].indexOf("--debug-opt=") === 0) {
        dbg_opt = argv[dgi].slice(12);
      }
      else if (!dbg_name) dbg_name = argv[dgi];
    }
    await cmd_debug(dbg_name, dbg_json, dbg_level, dbg_opt, dbg_norm);
    return;
  }
  if (name === "goal") {
    var goal_json = false;
    var goal_name = "";
    for (var gi2 = 1; gi2 < argv.length; gi2++) {
      if (argv[gi2] === "--json") goal_json = true;
      else if (!goal_name) goal_name = argv[gi2];
    }
    if (!goal_name && argv.length > 1) goal_name = argv.slice(1).filter(function(a) { return a !== "--json"; }).join(" ");
    await cmd_goal(goal_name, goal_json);
    return;
  }
  if (name === "fill") {
    var fill_json = false;
    var fill_first = false;
    var fill_bits = [];
    for (var fi = 1; fi < argv.length; fi++) {
      if (argv[fi] === "--json") fill_json = true;
      else if (argv[fi] === "--first") fill_first = true;
      else fill_bits.push(argv[fi]);
    }
    var fill_arg = fill_bits.join(" ");
    var fill_src_arg = "";
    var fill_term = "";
    var fill_split = fill_arg.indexOf("|||");
    if (fill_split >= 0) {
      fill_src_arg = fill_arg.slice(0, fill_split);
      fill_term = fill_arg.slice(fill_split + 3);
    } else {
      fill_term = fill_arg;
    }
    await cmd_fill(fill_src_arg, fill_term, fill_first, fill_json);
    return;
  }
  if (name === "prove") {
    var prove_json = false;
    var prove_debug = false;
    var prove_opt = "";
    var prove_names = [];
    for (var pi = 1; pi < argv.length; pi++) {
      if (argv[pi] === "--json") prove_json = true;
      else if (argv[pi] === "--debug") prove_debug = "trace";
      else if (argv[pi].indexOf("--debug=") === 0) {
        prove_debug = parse_debug_arg(argv[pi].slice(8));
        if (!prove_debug) { console.error("sure: bad --debug=" + argv[pi].slice(8)); process.exit(1); }
      } else if (argv[pi].indexOf("--debug-opt=") === 0) {
        prove_opt = argv[pi].slice(12);
      }
      else prove_names.push(argv[pi]);
    }
    var prove_failed = await cmd_prove(prove_names, prove_json, false, prove_debug, prove_opt);
    process.exit(prove_failed ? 1 : 0);
  }
  if (name === "qc") {
    var qc_json = false;
    var qc_debug = false;
    var qc_opt = "";
    var qc_n = 8;
    var qc_law = "";
    for (var qi = 1; qi < argv.length; qi++) {
      if (argv[qi] === "--json") qc_json = true;
      else if (argv[qi] === "--debug") qc_debug = true;
      else if (argv[qi].indexOf("--debug=") === 0) {
        var qlv = parse_debug_arg(argv[qi].slice(8));
        if (!qlv) { console.error("sure: bad --debug=" + argv[qi].slice(8)); process.exit(1); }
        qc_debug = qlv !== "off";
      } else if (argv[qi].indexOf("--debug-opt=") === 0) {
        qc_opt = argv[qi].slice(12);
      }
      else if (argv[qi] === "--n" && argv[qi + 1] != null) qc_n = argv[++qi];
      else if (!qc_law) qc_law = argv[qi];
    }
    if (qc_debug && !sure_debug_open(qc_opt, "qc")) qc_debug = false;
    var qc_out = await cmd_qc(qc_law, qc_n, qc_debug);
    if (qc_json) console.log(JSON.stringify(qc_out, null, 2));
    else if (!qc_out.ok) {
      console.log("qc failed: " + (qc_out.error || (qc_out.failed + " samples")));
      if (qc_out.diagnostics && qc_out.diagnostics.length) console.log(JSON.stringify(qc_out.diagnostics, null, 2));
      (qc_out.samples || []).forEach(function(s) {
        if (!s.ok) {
          console.log("fail " + s.call);
          if (s.debug && s.debug.got_want) console.log("     " + s.debug.got_want);
          if (s.call_shrunk && s.call_shrunk !== s.call) console.log("     shrunk " + s.call_shrunk);
        } else if (qc_debug) console.log("ok   " + s.call);
      });
    } else if (qc_out.law === "Sure.Qc.all") {
      console.log("qc passed: Sure.Qc.all");
    } else {
      if (qc_debug) (qc_out.samples || []).forEach(function(s) { console.log("ok   " + s.call); });
      console.log("qc passed: " + qc_out.passed + " samples of " + qc_out.law);
    }
    process.exit(qc_out.ok ? 0 : 1);
  }
  if (name === "gen") {
    var gen_json = false;
    var gen_name = "";
    for (var gi = 1; gi < argv.length; gi++) {
      if (argv[gi] === "--json") gen_json = true;
      else if (!gen_name) gen_name = argv[gi];
    }
    var gen_out = await cmd_gen(gen_name);
    if (gen_json) console.log(JSON.stringify(gen_out, null, 2));
    else if (!gen_out.ok) {
      console.log("gen failed: " + (gen_out.error || gen_out.name));
      (gen_out.tests || []).forEach(function(t) {
        if (!t.ok) console.log("fail " + t.kind + " " + t.label);
      });
    } else {
      (gen_out.tests || []).forEach(function(t) {
        if (t.kind === "proof") console.log("proved " + t.label);
        else if (t.kind === "qc") console.log("qc     " + t.label + " " + t.passed);
        else console.log("ok     " + t.kind + " " + t.label);
      });
      console.log("gen passed: " + gen_out.generated + " tests of " + gen_out.name);
    }
    process.exit(gen_out.ok ? 0 : 1);
  }
  if (name === "repl") { await cmd_repl(); return; }
  if (name === "build" || name === "emit" || name === "run") {
    apply_project_env();
    var force = false;
    var html = false;
    var term = "Main";
    var term_set = false;
    var run_extra = [];
    var run_debug = sure_debug_level_read(process.env.SURE_DEBUG || "");
    var run_debug_opt = process.env.SURE_DEBUG_OPT || "";
    for (var bi = 1; bi < argv.length; bi++) {
      if (argv[bi] === "--force") force = true;
      else if (argv[bi] === "--html") html = true;
      else if (argv[bi] === "--debug") run_debug = "trace";
      else if (argv[bi].indexOf("--debug=") === 0) {
        run_debug = parse_debug_arg(argv[bi].slice(8));
        if (!run_debug) { console.error("sure: bad --debug=" + argv[bi].slice(8)); process.exit(1); }
      } else if (argv[bi].indexOf("--debug-opt=") === 0) {
        run_debug_opt = argv[bi].slice(12);
      } else if (!term_set) { term = argv[bi]; term_set = true; }
      else run_extra.push(argv[bi]);
    }
    if (!term) {
      console.error("sure " + name + " <Term>");
      process.exit(1);
    }
    if (name === "build" || name === "emit") {
      var built = await build_and_emit(term, force, html);
      if (built.skipped) {
        console.log("unchanged " + term + " (" + built.file + ")");
        process.exit(0);
      }
      if (!built.ok) {
        console.error("build failed: " + (built.error || term));
        if (/unproved/.test(built.error || "")) {
          console.error("the type checker is the prover. try: sure prove");
        }
        if (/empty name|unsafe/.test(built.error || "")) {
          console.error("term names look like Main or Html.Counter.client, not paths");
        }
        process.exit(1);
      }
      console.log("emitted " + built.file + (built.bytes != null ? " (" + built.bytes + " bytes)" : ""));
      if (built.html) console.log("open that file in a browser");
      else console.log("next: sure run");
      process.exit(0);
    }
    if (name === "run") {
      if (run_debug && run_debug !== "off") process.env.SURE_DEBUG = run_debug;
      if (run_debug_opt) process.env.SURE_DEBUG_OPT = run_debug_opt;
    }
    var manRun = find_manifest(ORIG_CWD);
    var rootRun = manRun ? path.dirname(manRun) : ORIG_CWD;
    var distRun = emit_js_abs(rootRun, term);
    var stampRun = manRun ? read_build_stamp(rootRun) : null;
    var hashRun = manRun ? project_src_hash(manRun, {runtime: process.env.SURE_RUNTIME || "node"}) : "";
    if (distRun && fs.existsSync(distRun) && manRun && emit_is_fresh(stampRun, hashRun, term, rootRun)) {
      run_compiled_js(distRun, use_bun, run_extra);
      return;
    }
    process.argv = [process.argv[0], process.argv[1], term, "--run"].concat(run_extra);
    flag = "--run";
    name = term;
  }

  if (name === "help") {
    print_help_topic(argv[1] || "start");
    process.exit(0);
  }
  if (!name || name === "--help" || name === "-h") {
    print_help();
    process.exit(0);
  }

  if (name === "--version" || name === "-v") {
    console.log("Sure " + SURE_VERSION + " (Legacy Kind " + KIND_LINEAGE + ")");
    process.exit(0);
  }

  if (name === "--lib") {
    var failed = await check_prelude();
    process.exit(failed ? 1 : 0);
  }

  if (name === "cover" || name === "--cover") {
    var cover_fail = argv.indexOf("--fail") >= 0 || argv.indexOf("--check") >= 0;
    var cover_js = path.join(__dirname, "cover.js");
    try {
      run_spawn(process.execPath, cover_fail ? [cover_js, "--fail"] : [cover_js], {
        stdio: "inherit",
        cwd: path.join(__dirname, "../../..")
      });
      process.exit(0);
    } catch (e) {
      process.exit((e && e.status) || 1);
    }
  }

  if (name === "test" || name === "--test") {
    function test_log(msg) {
      console.log(msg + "  [" + new Date().toISOString() + "]");
    }
    test_log("== prove (bounded) ==");
    var failed = await cmd_prove(BOUNDED_THEOREMS, false, true);
    test_log("== check (bounded) ==");
    for (var ti = 0; ti < BOUNDED_CHECKS.length; ti++) {
      test_log("check " + BOUNDED_CHECKS[ti]);
      try { failed += await check_term_ok(BOUNDED_CHECKS[ti]); }
      catch (e) {
        console.log("check fail: " + BOUNDED_CHECKS[ti]);
        console.log(e);
        failed += 1;
      }
    }
    test_log("== runtime Main (in-process) ==");
    try {
      await run_term_inprocess("Main");
    } catch (e) {
      console.log(e);
      failed += 1;
    }
    test_log("== host runtime Test.host (Proc.exec argv + IO.bracket race) ==");
    try {
      var host_out = await run_term_capture("Test.host");
      if (host_out.indexOf("RELEASED") < 0) {
        console.log("fail Test.host missing RELEASED");
        failed += 1;
      } else console.log("ok   Test.host RELEASED");
      if (host_out.indexOf("DONE") < 0) {
        console.log("fail Test.host missing DONE");
        failed += 1;
      } else console.log("ok   Test.host DONE");
      if (host_out.indexOf("Test.host ok") < 0) {
        console.log("fail Test.host missing ok");
        failed += 1;
      } else console.log("ok   Test.host proc");
      if (host_out.indexOf("Test.host nl a\nb") < 0 && host_out.indexOf("Test.host nl a\\nb") < 0) {
        if (host_out.indexOf("a\nb") < 0) {
          console.log("fail Test.host newline argv");
          failed += 1;
        } else console.log("ok   Test.host newline argv");
      } else console.log("ok   Test.host newline argv");
    } catch (e) {
      console.log(e);
      failed += 1;
    }
    test_log("== prove edges (must fail when false) ==");
    failed += await run_prove_edges();
    test_log("== sure test done ==");
    process.exit(failed ? 1 : 0);
  }

  apply_project_env();

  if (flag === "--fmc") {
    var fmcc0 = await kind.run(checker("api.io.term_to_core")(name));
    try { console.log(fmc_to_js.shake_code(fmcc0, name)); }
    catch (e) { console.log(fmcc0); }

  } else if (flag === "--js") {
    var module = argv[2] === "--module";
    try {
      var fmcc = await kind.run(checker("api.io.term_to_core")(name));
      try {
        console.log(fmc_to_js.compile(fmcc, name, {module}));
      } catch (e) {
        throw "Couldn't find or compile term: '" + name + "'.";
      }
    } catch (e) {
      display_error(name, e);
      process.exit(1);
    }

  } else if (flag === "--scm") {
    try {
      var scm = await kind.run(checker("api.io.term_to_scheme")(name));
      console.log(scm);
    } catch (e) {
      display_error(name, e);
      process.exit(1);
    }

  } else if (flag === "--run") {
    try {
      var fmcc = await kind.run(checker("api.io.term_to_core")(name));
      try {
        var asjs = fmc_to_js.compile(fmcc, name, {});
      } catch (e) {
        throw "Couldn't find or compile term: '" + name + "'.";
      }
      var js_path = path.join(ORIG_CWD, ".sure.tmp.js");
      try { fs.unlinkSync(js_path); } catch (e) {};
      fs.writeFileSync(js_path, asjs);
      var run_i = process.argv.indexOf("--run");
      var run_extra2 = run_i >= 0 ? process.argv.slice(run_i + 1) : [];
      run_compiled_js(js_path, use_bun, run_extra2);
      try { fs.unlinkSync(js_path); } catch (e2) {}
    } catch (e) {
      display_error(name, e);
      process.exit(1);
    }

  } else if (flag === "--show") {
    try {
      await kind.run(checker("api.io.show_term")(name));
    } catch (e) {
      display_error(name, e);
      process.exit(1);
    }

  } else if (flag === "--norm") {
    try {
      await kind.run(checker("api.io.show_term_normal")(name));
    } catch (e) {
      display_error(name, e);
      process.exit(1);
    }

  } else if (flag === "--json") {
    try {
      var jrep = annotate_proof_report(await agent_check_name(name));
      console.log(JSON.stringify(jrep));
      if (!report_is_ok(jrep)) process.exit(1);
    } catch (e) {
      display_error(name, e);
      process.exit(1);
    }

  } else {
    try {
      if (name[name.length - 1] === "/") {
        var files = await find_kind_files(path.join(process.cwd(), name));
        await kind.run(checker("api.io.check_files")(array_to_list(files)));
      } else if (name.slice(-5) !== ".sure") {
        var term_failed = await check_term_ok(name);
        if (term_failed) process.exit(1);
      } else if (name) {
        await kind.run(checker("api.io.check_file")(ADD_PATH + name));
      }
    } catch (e) {
      console.log("Sure couldn't handle that input.");
      console.log(e);
      process.exit(1);
    }
  }
})();
