"use strict";
// Spawn compiled JS on Node or Bun.

module.exports = function make(deps) {
  var path = deps.path;
  var fs = deps.fs;
  var run_spawn = deps.run_spawn;
  var ORIG_CWD = deps.ORIG_CWD;






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
  try {
    if (want) {
      if (!bun_native() && !bun_available()) return {ok: false, error: "bun not found"};
      var bun_bin = bun_native() ? process.execPath : "bun";
      run_spawn(bun_bin, [abs].concat(extra), {stdio: "inherit"});
      return {ok: true, runtime: "bun", file: abs};
    }
    var node_bin = bun_native() ? (process.env.SURE_NODE || "node") : process.execPath;
    run_spawn(node_bin, ["--stack-size=10000", abs].concat(extra), {stdio: "inherit"});
    return {ok: true, runtime: "node", file: abs};
  } catch (e) {
    return {ok: false, error: String(e && e.message || e), runtime: want ? "bun" : "node", file: abs};
  }
}

function run_compiled_js(js_path, use_bun, extra) {
  var r = sure_run_js(js_path, use_bun, extra);
  if (!r.ok) {
    console.error(r.error || "run failed");
    process.exit(1);
  }
}

  return {
    sure_runtime_pick: sure_runtime_pick,
    bun_available: bun_available,
    bun_native: bun_native,
    sure_js_abs: sure_js_abs,
    restore_user_cwd: restore_user_cwd,
    sure_run_js: sure_run_js,
    run_compiled_js: run_compiled_js
  };
};
