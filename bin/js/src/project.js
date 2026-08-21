"use strict";
// Package/project commands: manifests, lockfile, new/add/remove/install/expose.
module.exports = function makeProject(deps) {
  var fs = deps.fs;
  var path = deps.path;
  var ORIG_CWD = deps.ORIG_CWD;
  var spawnSync = deps.spawnSync;
  var mod_name_ok = deps.mod_name_ok;
  var mod_pkg_ok = deps.mod_pkg_ok;

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

  return {
    find_manifest: find_manifest,
    prepend_path_env: prepend_path_env,
    read_manifest: read_manifest,
    write_manifest: write_manifest,
    man_kind: man_kind,
    man_src_dirs: man_src_dirs,
    man_direct: man_direct,
    man_set_direct: man_set_direct,
    man_exposed: man_exposed,
    pkg_mod_name: pkg_mod_name,
    github_url_of: github_url_of,
    dep_root: dep_root,
    dep_src_paths: dep_src_paths,
    project_src_path: project_src_path,
    apply_project_env: apply_project_env,
    lock_path: lock_path,
    read_lock: read_lock,
    write_lock: write_lock,
    dep_tree_hash: dep_tree_hash,
    run_git: run_git,
    git_rev_parse: git_rev_parse,
    git_clone_pinned: git_clone_pinned,
    dep_version_of: dep_version_of,
    cmd_new: cmd_new,
    cmd_add: cmd_add,
    cmd_remove: cmd_remove,
    cmd_install: cmd_install,
    cmd_expose: cmd_expose
  };
};
