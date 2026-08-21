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

var project = require("./project")({
  fs: fs,
  path: path,
  ORIG_CWD: ORIG_CWD,
  spawnSync: spawnSync,
  mod_name_ok: compiler.mod_name_ok,
  mod_pkg_ok: compiler.mod_pkg_ok
});
var find_manifest = project.find_manifest;
var prepend_path_env = project.prepend_path_env;
var read_manifest = project.read_manifest;
var write_manifest = project.write_manifest;
var man_kind = project.man_kind;
var man_src_dirs = project.man_src_dirs;
var man_direct = project.man_direct;
var man_set_direct = project.man_set_direct;
var man_exposed = project.man_exposed;
var pkg_mod_name = project.pkg_mod_name;
var github_url_of = project.github_url_of;
var dep_root = project.dep_root;
var dep_src_paths = project.dep_src_paths;
var project_src_path = project.project_src_path;
var apply_project_env = project.apply_project_env;
var lock_path = project.lock_path;
var read_lock = project.read_lock;
var write_lock = project.write_lock;
var dep_tree_hash = project.dep_tree_hash;
var run_git = project.run_git;
var git_rev_parse = project.git_rev_parse;
var git_clone_pinned = project.git_clone_pinned;
var dep_version_of = project.dep_version_of;
var cmd_new = project.cmd_new;
var cmd_add = project.cmd_add;
var cmd_remove = project.cmd_remove;
var cmd_install = project.cmd_install;
var cmd_expose = project.cmd_expose;


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
  "Sure.Synth.load.cached.file_ok.under",
  "Outcome.map_err.ok",
  "Outcome.map_err.err",
  "Outcome.guard.ok",
  "Outcome.guard.err",
  "IO.from_outcome.def",
  "IO.bind_ok.err",
  "IO.bind_ok.ok",
  "Proc.env.pack.empty",
  "Proc.env.pack.one",
  "Cover.more.html_el",
  "Cover.more.html_on"
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
if (!process.env.SURE_NODE) process.env.SURE_NODE = process.execPath;

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
    path.join(__dirname, "lsp.js"),
    path.join(__dirname, "qc.js"),
    path.join(__dirname, "emit.js"),
    path.join(__dirname, "agent.js"),
    path.join(__dirname, "project.js"),
    path.join(__dirname, "commands.js"),
    path.join(__dirname, "selftest.js"),
    path.join(__dirname, "repl.js"),
    path.join(__dirname, "gen-host.js"),
    path.join(__dirname, "sure.js"),
    path.join(formcore_path, "FmcToJs.js"),
    path.join(formcore_path, "host-schema.js"),
    path.join(formcore_path, "host-abort.js"),
    path.join(formcore_path, "host-pack.js"),
    path.join(formcore_path, "host-io-gen.js"),
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

var emit = require("./emit");
var sure_emit_safe = emit.sure_emit_safe;
var sure_emit_file = emit.sure_emit_file;
var sure_emit_html_file = emit.sure_emit_html_file;
var SURE_DOM_EVENTS = emit.SURE_DOM_EVENTS;
var sure_dom_mount_src = emit.sure_dom_mount_src;
var sure_html_css = emit.sure_html_css;
var sure_html_wrap = emit.sure_html_wrap;


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


var agent = require("./agent")({
  fs: fs,
  kind: kind,
  checker: checker,
  fmc_to_js: fmc_to_js,
  json_ok: json_ok,
  json_err: json_err,
  gate_residual_holes: function(a, b, c) { return gate_residual_holes(a, b, c); },
  when_expand_source: function(s) { return when_expand_source(s); },
  def_header: function(s) { return def_header(s); },
  check_output_ok: function(s) { return check_output_ok(s); },
  annotate_proof_report: function(r) { return annotate_proof_report(r); },
  prove_result: function(n, r) { return prove_result(n, r); },
  scan_project_holes: function() { return scan_project_holes(); },
  scan_symbols: function(p) { return scan_symbols(p); },
  scan_references: function(n) { return scan_references(n); },
  scan_impact: function(n) { return scan_impact(n); },
  scan_theorems: function(n) { return scan_theorems(n); },
  scan_docs: function(n) { return scan_docs(n); },
  scan_graph: function(n, d) { return scan_graph(n, d); },
  scan_dependencies: function(n) { return scan_dependencies(n); },
  cmd_qc: function(a, b, c) { return cmd_qc(a, b, c); },
  cmd_gen: function(n) { return cmd_gen(n); },
  bench_stats: function(s) { return bench_stats(s); },
  sure_debug_level_read: function(s) { return sure_debug_level_read(s); },
  sure_debug_flags_read: function(s) { return sure_debug_flags_read(s); },
  sure_debug_flags_show: function(f) { return sure_debug_flags_show(f); }
});
var capture_kind = agent.capture_kind;
var parse_json_loose = agent.parse_json_loose;
var agent_check_name = agent.agent_check_name;
var agent_check_code = agent.agent_check_code;
var agent_show = agent.agent_show;
var agent_type_names = agent.agent_type_names;
var agent_relevant = agent.agent_relevant;
var filter_goals = agent.filter_goals;
var hole_count_js = agent.hole_count_js;
var fill_src = agent.fill_src;
var extract_goal = agent.extract_goal;
var format_goal_line = agent.format_goal_line;
var goal_trace = agent.goal_trace;
var agent_dispatch = agent.agent_dispatch;
var cmd_agent_stdio = agent.cmd_agent_stdio;
var cmd_agent_client = agent.cmd_agent_client;

var lsp = require("./lsp")({
  compiler: compiler,
  kind: kind,
  fs: fs,
  path: path,
  json_err: json_err,
  SURE_VERSION: SURE_VERSION,
  agent_check_name: function(n) { return agent_check_name(n); },
  agent_check_code: function(c) { return agent_check_code(c); },
  scan_defs: function(d) { return scan_defs(d); },
  scan_symbols: function(p) { return scan_symbols(p); },
  scan_references: function(n) { return scan_references(n); },
  file_of_name: function(n) { return file_of_name(n); },
  line_col_offset: line_col_offset
});
var LSP_KEYWORDS = lsp.LSP_KEYWORDS;
var lsp_method_read = lsp.lsp_method_read;
var lsp_keyword = lsp.lsp_keyword;
var lsp_ext = lsp.lsp_ext;
var lsp_uri_ok = lsp.lsp_uri_ok;
var lsp_frame = lsp.lsp_frame;
var lsp_write = lsp.lsp_write;
var lsp_path_to_uri = lsp.lsp_path_to_uri;
var lsp_uri_to_path = lsp.lsp_uri_to_path;
var lsp_pos_at = lsp.lsp_pos_at;
var lsp_full_range = lsp.lsp_full_range;
var lsp_word_range = lsp.lsp_word_range;
var lsp_name_at = lsp.lsp_name_at;
var lsp_apply_changes = lsp.lsp_apply_changes;
var lsp_defs_in_text = lsp.lsp_defs_in_text;
var lsp_find_name_range = lsp.lsp_find_name_range;
var lsp_new_state = lsp.lsp_new_state;
var lsp_capabilities = lsp.lsp_capabilities;
var lsp_parse_frames = lsp.lsp_parse_frames;
var lsp_handle = lsp.lsp_handle;
var cmd_lsp = lsp.cmd_lsp;



var qc = require("./qc");
var qc_nats = qc.qc_nats;
var split_ty_args = qc.split_ty_args;
var parse_qc_sort = qc.parse_qc_sort;
var parse_qc_binders = qc.parse_qc_binders;
var type_after_nat_pis = qc.type_after_nat_pis;
var leading_nat_arity = qc.leading_nat_arity;
var qc_arg_sum = qc.qc_arg_sum;
var qc_shrink_candidates = qc.qc_shrink_candidates;
var qc_val_unit = qc.qc_val_unit;
var qc_val_bool = qc.qc_val_bool;
var qc_val_nat = qc.qc_val_nat;
var qc_val_string = qc.qc_val_string;
var qc_val_list = qc.qc_val_list;
var qc_val_pair = qc.qc_val_pair;
var qc_val_none = qc.qc_val_none;
var qc_val_some = qc.qc_val_some;
var qc_val_left = qc.qc_val_left;
var qc_val_right = qc.qc_val_right;
var qc_gen = qc.qc_gen;
var qc_format_val = qc.qc_format_val;
var qc_val_size = qc.qc_val_size;
var qc_domain = qc.qc_domain;
var qc_format_arg = qc.qc_format_arg;
var qc_format_call = qc.qc_format_call;
var qc_arg_lists_for = qc.qc_arg_lists_for;
var qc_shrink_vals = qc.qc_shrink_vals;
var qc_arg_lists = qc.qc_arg_lists;


var commands = require("./commands")({
  ORIG_CWD: ORIG_CWD,
  agent_check_code: function(a) { return agent_check_code(a); },
  agent_check_name: function(a) { return agent_check_name(a); },
  agent_dispatch: function(a, b) { return agent_dispatch(a, b); },
  agent_show: function(a, b) { return agent_show(a, b); },
  checker: checker,
  check_project_modules: function(a) { return check_project_modules(a); },
  compiler: compiler,
  default_prove_names: function() { return default_prove_names(); },
  file_of_name: function(a) { return file_of_name(a); },
  find_manifest: function(a) { return find_manifest(a); },
  fs: fs,
  _fs_readFileSync: _fs_readFileSync,
  goal_trace: function(a, b) { return goal_trace(a, b); },
  is_proof_type: function(a) { return is_proof_type(a); },
  kind: kind,
  parse_qc_binders: function(a) { return parse_qc_binders(a); },
  path: path,
  prove_result: function(a, b) { return prove_result(a, b); },
  read_manifest: function(a) { return read_manifest(a); },
  scan_dependencies: function(a) { return scan_dependencies(a); },
  scan_docs: function(a) { return scan_docs(a); },
  scan_graph: function(a, b) { return scan_graph(a, b); },
  scan_impact: function(a) { return scan_impact(a); },
  scan_src_theorems: function(a) { return scan_src_theorems(a); },
  scan_theorems: function(a) { return scan_theorems(a); },
  sure_debug_emit: function(a, b, c, d) { return sure_debug_emit(a, b, c, d); },
  sure_debug_flags_read: function(a) { return sure_debug_flags_read(a); },
  sure_debug_flags_show: function(a) { return sure_debug_flags_show(a); },
  sure_debug_level_read: function(a) { return sure_debug_level_read(a); },
  sure_debug_open: function(a, b) { return sure_debug_open(a, b); },
  apply_project_env: function() { return apply_project_env(); },
  qc_nats: qc_nats,
  split_ty_args: split_ty_args,
  parse_qc_sort: parse_qc_sort,
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
});
var cmd_prove = commands.cmd_prove;
var cmd_qc = commands.cmd_qc;
var cmd_gen = commands.cmd_gen;
var prove_one = commands.prove_one;
var prove_project_theorems = commands.prove_project_theorems;
var cmd_impact = commands.cmd_impact;
var cmd_deps = commands.cmd_deps;
var bench_stats = commands.bench_stats;
var cmd_bench = commands.cmd_bench;
var cmd_graph = commands.cmd_graph;
var cmd_theorems = commands.cmd_theorems;
var cmd_debug = commands.cmd_debug;
var cmd_goal = commands.cmd_goal;
var cmd_fill = commands.cmd_fill;
var cmd_doc = commands.cmd_doc;
var cmd_fmt = commands.cmd_fmt;


var selftest = require("./selftest")({
  ORIG_CWD: ORIG_CWD,
  get_ORIG_CWD: function() { return ORIG_CWD; },
  set_ORIG_CWD: function(v) { ORIG_CWD = v; },
  SURE_DOM_EVENTS: SURE_DOM_EVENTS,
  agent_check_code: function(a) { return agent_check_code(a); },
  agent_dispatch: function(a, b) { return agent_dispatch(a, b); },
  bench_stats: function(a) { return bench_stats(a); },
  build_is_fresh: function(a, b, c) { return build_is_fresh(a, b, c); },
  bun_available: function() { return bun_available(); },
  check_project_modules: function(a) { return check_project_modules(a); },
  cmd_gen: function(a) { return cmd_gen(a); },
  cmd_qc: function(a, b, c) { return cmd_qc(a, b, c); },
  compile_term_js: function(a, b) { return compile_term_js(a, b); },
  compiler: compiler,
  compiler_input_hash: function() { return compiler_input_hash(); },
  dep_tree_hash: function(a) { return dep_tree_hash(a); },
  emit_is_fresh: function(a, b, c, d) { return emit_is_fresh(a, b, c, d); },
  fill_src: function(a, b, c) { return fill_src(a, b, c); },
  format_goal_line: function(a) { return format_goal_line(a); },
  formcore_path: formcore_path,
  fs: fs,
  github_url_of: function(a) { return github_url_of(a); },
  hole_count_js: function(a) { return hole_count_js(a); },
  kind: kind,
  line_col_offset: function(a, b, c) { return line_col_offset(a, b, c); },
  lsp_apply_changes: function(a, b) { return lsp_apply_changes(a, b); },
  lsp_ext: function(a) { return lsp_ext(a); },
  lsp_frame: function(a) { return lsp_frame(a); },
  lsp_handle: function(a, b) { return lsp_handle(a, b); },
  lsp_keyword: function(a) { return lsp_keyword(a); },
  lsp_method_read: function(a) { return lsp_method_read(a); },
  lsp_new_state: function() { return lsp_new_state(); },
  lsp_parse_frames: function(a) { return lsp_parse_frames(a); },
  lsp_uri_ok: function(a) { return lsp_uri_ok(a); },
  man_kind: function(a) { return man_kind(a); },
  mod_allows: function(a, b, c) { return mod_allows(a, b, c); },
  mod_expand_source: function(a, b) { return mod_expand_source(a, b); },
  mod_imports_allow: function(a, b) { return mod_imports_allow(a, b); },
  mod_name_ok: function(a) { return mod_name_ok(a); },
  mod_pkg_ok: function(a) { return mod_pkg_ok(a); },
  mod_read_import: function(a) { return mod_read_import(a); },
  mod_read_module: function(a) { return mod_read_module(a); },
  parse_debug_arg: function(a) { return parse_debug_arg(a); },
  parse_qc_binders: function(a) { return parse_qc_binders(a); },
  parse_qc_sort: function(a) { return parse_qc_sort(a); },
  qc_shrink_vals: function(a) { return qc_shrink_vals(a); },
  qc_val_nat: function(a) { return qc_val_nat(a); },
  qc_format_val: function(a) { return qc_format_val(a); },
  qc_gen: function(a, b) { return qc_gen(a, b); },
  qc_shrink_candidates: function(a) { return qc_shrink_candidates(a); },
  path: path,
  pkg_mod_name: function(a) { return pkg_mod_name(a); },
  project_src_hash: function(a, b) { return project_src_hash(a, b); },
  prove_one: function(a) { return prove_one(a); },
  prove_result: function(a, b) { return prove_result(a, b); },
  read_build_stamp: function(a) { return read_build_stamp(a); },
  read_manifest: function(a) { return read_manifest(a); },
  repl_need_name: function(a) { return repl_need_name(a); },
  repl_parse: function(a) { return repl_parse(a); },
  run_spawn: function(a, b, c) { return run_spawn(a, b, c); },
  scan_dependencies: function(a) { return scan_dependencies(a); },
  scan_docs: function(a) { return scan_docs(a); },
  scan_graph: function(a, b) { return scan_graph(a, b); },
  scan_impact: function(a) { return scan_impact(a); },
  scan_project_holes: function() { return scan_project_holes(); },
  scan_theorems: function(a) { return scan_theorems(a); },
  shown_has_hole: function(a) { return shown_has_hole(a); },
  src_explicit_hole: function(a) { return src_explicit_hole(a); },
  sure_debug_emit: function(a, b, c, d) { return sure_debug_emit(a, b, c, d); },
  sure_debug_flags_any: function(a) { return sure_debug_flags_any(a); },
  sure_debug_flags_host: function(a) { return sure_debug_flags_host(a); },
  sure_debug_flags_read: function(a) { return sure_debug_flags_read(a); },
  sure_debug_flags_show: function(a) { return sure_debug_flags_show(a); },
  sure_debug_host_ask: function(a, b, c) { return sure_debug_host_ask(a, b, c); },
  sure_debug_host_line: function(a, b, c) { return sure_debug_host_line(a, b, c); },
  sure_debug_level_read: function(a) { return sure_debug_level_read(a); },
  sure_debug_open: function(a, b) { return sure_debug_open(a, b); },
  sure_debug_redact: function(a) { return sure_debug_redact(a); },
  sure_emit_file: function(a) { return sure_emit_file(a); },
  sure_emit_html_file: function(a) { return sure_emit_html_file(a); },
  sure_help_topic: function(a) { return sure_help_topic(a); },
  sure_html_wrap: function(a, b) { return sure_html_wrap(a, b); },
  sure_run_js: function(a, b, c) { return sure_run_js(a, b, c); },
  sure_runtime_pick: function(a, b, c) { return sure_runtime_pick(a, b, c); },
  when_expand_source: function(a) { return when_expand_source(a); },
  word_at: function(a, b) { return word_at(a, b); },
  write_build_stamp: function(a, b) { return write_build_stamp(a, b); },
  write_emit_js: function(a, b, c) { return write_emit_js(a, b, c); },
  write_manifest: function(a, b) { return write_manifest(a, b); },
  sure_dom_mount_src: function() { return sure_dom_mount_src(); },
  man_src_dirs: function(a, b) { return man_src_dirs(a, b); },
  man_direct: function(a) { return man_direct(a); }
});
var run_prove_edges = selftest.run_prove_edges;

var repl = require("./repl")({
  ORIG_CWD: ORIG_CWD,
  SURE_VERSION: SURE_VERSION,
  agent_check_name: function(a) { return agent_check_name(a); },
  agent_dispatch: function(a, b) { return agent_dispatch(a, b); },
  agent_show: function(a, b) { return agent_show(a, b); },
  checker: checker,
  fmc_to_js: fmc_to_js,
  fs: fs,
  kind: kind,
  path: path,
  run_compiled_js: function(a, b, c) { return run_compiled_js(a, b, c); },
  scan_docs: function(a) { return scan_docs(a); },
  scan_impact: function(a) { return scan_impact(a); },
  scan_theorems: function(a) { return scan_theorems(a); }
});
var REPL_CMDS = repl.REPL_CMDS;
var repl_parse = repl.repl_parse;
var repl_help = repl.repl_help;
var repl_need_name = repl.repl_need_name;
var repl_print_prove = repl.repl_print_prove;
var cmd_repl = repl.cmd_repl;







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
    test_log("== Test.main (Test.ci.suite + Test.host) ==");
    try {
      var host_out = await run_term_capture("Test.main");
      if (host_out.indexOf("ok   nat empty") < 0) {
        console.log("fail Test.main missing CI unit");
        failed += 1;
      } else console.log("ok   Test.main CI unit");
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
      if (host_out.indexOf("Test.host line FAST") < 0) {
        console.log("fail Test.host get_line race");
        failed += 1;
      } else console.log("ok   Test.host get_line race");
      if (host_out.indexOf("Test.host http FAST") < 0) {
        console.log("fail Test.host http race");
        failed += 1;
      } else console.log("ok   Test.host http race");
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
    console.error("Scheme/Chez is not a host. Emit JavaScript: sure " + name + " --js");
    process.exit(1);

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
