"use strict";
// Project scans: defs, refs, impact, docs, graph.

module.exports = function make(deps) {
  var fs = deps.fs;
  var path = deps.path;
  var compiler = deps.compiler;

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


  return {
    collect_kind_files: collect_kind_files,
    word_at: word_at,
    line_col_offset: line_col_offset,
    file_of_name: file_of_name,
    scan_references: scan_references,
    def_header: def_header,
    scan_defs: scan_defs,
    name_mentioned: name_mentioned,
    scan_impact: scan_impact,
    scan_theorems: scan_theorems,
    scan_docs: scan_docs,
    names_in: names_in,
    scan_dependencies: scan_dependencies,
    scan_graph: scan_graph,
    scan_project_holes: scan_project_holes,
    scan_symbols: scan_symbols
  };
};
