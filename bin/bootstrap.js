#!/usr/bin/env node
// Rebuild bin/js/src/sure.js from Sure.api.export via the current CLI + vendored FormCore.
// Atomic write. Stage-two loads Defs.read on a module snippet (Parser.file, not flatten).
// Full compile-twice of Sure.api.export is unbounded and is not CI.

var {spawnSync} = require("child_process");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var sure_path = path.join(__dirname, "js/src/sure.js");
var cli = path.join(__dirname, "js/src/main.js");
var node = process.execPath;

function inject_prepare(js) {
  js = String(js || "");
  if (js.indexOf("__surePrepare") >= 0) return js;
  var hook = "if(typeof globalThis.__surePrepare==='function'){_code$2=globalThis.__surePrepare(_file$1,_code$2);}";
  var re = /function (?:Kind|Sure)\$Defs\$read\$\([^)]*\)\{/;
  var m = re.exec(js);
  if (!m) return js;
  return js.slice(0, m.index + m[0].length) + hook + js.slice(m.index + m[0].length);
}

function list_to_array(xs) {
  var out = [];
  while (xs && xs._ === "List.cons") {
    out.push(xs.head);
    xs = xs.tail;
  }
  return out;
}

function check_parser_file(blob_path) {
  var abs = path.resolve(blob_path);
  delete require.cache[abs];
  var kind = require(abs);
  var read = kind["Sure.Defs.read"] || kind["Kind.Defs.read"];
  var empty = kind["Sure.Map.new"] || kind["Kind.Map.new"];
  var keysFn = kind["BitsMap.keys"];
  var fromBits = kind["Sure.Name.from_bits"] || kind["Kind.Name.from_bits"];
  if (typeof read !== "function" || !empty || typeof keysFn !== "function" || typeof fromBits !== "function") {
    throw new Error("blob missing Defs.read / Map");
  }
  var code = "module Hello exposing (greet, Spec)\ngreet: String\n  \"Sure\"\nSpec: greet == \"Sure\"\n  refl\n";
  var parsed = read("Hello.sure")(code)(empty);
  if (!parsed || parsed._ !== "Either.right") {
    var err = parsed && parsed._ === "Either.left" ? String(parsed.value || "").slice(0, 300) : "not Either";
    throw new Error("Parser.file rejected module source: " + err);
  }
  var names = list_to_array(keysFn(parsed.value)).map(function(bits) {
    return fromBits(bits);
  });
  if (names.indexOf("Hello.greet") < 0 || names.indexOf("Hello.Spec") < 0) {
    throw new Error("Parser.file did not qualify module names: " + names.join(","));
  }
  if (names.indexOf("greet") >= 0) {
    throw new Error("Parser.file left unqualified greet");
  }
}

function check_blob_text(src) {
  if (src.length < 1000) {
    throw new Error("sure.js too small");
  }
  if (src.indexOf("__surePrepare") < 0) {
    throw new Error("missing prepare hook in Defs.read");
  }
  var once = inject_prepare(src);
  var twice = inject_prepare(once);
  if (once !== twice || once !== src) {
    throw new Error("prepare hook is not a fixed point");
  }
  if (src.indexOf("Parser$file$mod") < 0 && src.indexOf("Parser.file.mod") < 0) {
    throw new Error("blob missing Parser.file.mod");
  }
}

function check_only() {
  var src = fs.readFileSync(sure_path, "utf8");
  try { check_blob_text(src); }
  catch (e) {
    console.error("bootstrap --check: " + e.message);
    process.exit(1);
  }
  var self = fs.readFileSync(__filename, "utf8");
  if (self.indexOf("spawnSync(node, [") < 0) {
    console.error("bootstrap --check: must spawn argv via spawnSync(node, [...])");
    process.exit(1);
  }
  if (self.indexOf("process.execPath") < 0) {
    console.error("bootstrap --check: must use process.execPath");
    process.exit(1);
  }
  try { check_parser_file(sure_path); }
  catch (e) {
    console.error("bootstrap --check: " + e.message);
    process.exit(1);
  }
  console.log("bootstrap ok (hook, Parser.file.mod, module qualify, " + src.length + " bytes)");
}

if (process.argv.indexOf("--check") >= 0) {
  check_only();
  process.exit(0);
}

console.log("Generating sure.js from Sure.api.export");
var r = spawnSync(node, ["--stack-size=10000", cli, "Sure.api.export", "--js", "--module"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
  env: (function () {
    var env = Object.assign({}, process.env, {
      SURE_BASE: path.join(root, "base"),
      KIND_BASE: path.join(root, "base"),
      SURE_CACHE: "0",
    });
    delete env.SURE_PATH;
    delete env.KIND_PATH;
    return env;
  })(),
});
if (r.error) {
  console.error("bootstrap failed to spawn: " + r.error.message);
  process.exit(1);
}
if (r.status) {
  console.error("bootstrap failed; leaving existing sure.js in place");
  console.error(String(r.stderr || r.stdout || "").slice(0, 500));
  process.exit(r.status);
}
var js = String(r.stdout || "");
if (js.indexOf("Compilation error") === 0 || js.length < 1000) {
  console.error("bootstrap failed; leaving existing sure.js in place");
  console.error(js.slice(0, 500));
  process.exit(1);
}

var with_hook = inject_prepare(js);
var again = inject_prepare(with_hook);
if (with_hook !== again) {
  console.error("bootstrap: prepare hook is not a fixed point");
  process.exit(1);
}

var dir = path.dirname(sure_path);
var tmp = path.join(dir, "sure." + process.pid + ".tmp.js");
fs.writeFileSync(tmp, with_hook);
try {
  check_blob_text(with_hook);
  check_parser_file(tmp);
} catch (e) {
  try { fs.unlinkSync(tmp); } catch (e2) {}
  console.error("bootstrap stage-two failed; leaving existing sure.js in place");
  console.error(e.message || e);
  process.exit(1);
}
fs.renameSync(tmp, sure_path);
console.log("wrote " + sure_path + " (" + with_hook.length + " bytes)");
