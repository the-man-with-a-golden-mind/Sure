"use strict";
var path = require("path");
var fs = require("fs");
var rawRead = fs.readFileSync.bind(fs);
var SOURCE_MAPS = Object.create(null);

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

var rawRead = fs.readFileSync.bind(fs);

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
    try { src = rawRead(f, "utf8"); } catch (e) { return; }
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

function mod_has_name(name, xs) {
  if (!xs) return false;
  if (Array.isArray(xs)) return xs.indexOf(name) >= 0;
  return !!xs[name];
}

function mod_from_imp(imps, name) {
  for (var i = 0; i < (imps || []).length; i++) {
    var imp = imps[i];
    var modn = imp && (imp.mod || imp.fst || (imp.name));
    var names = imp && (imp.names || imp.snd || (imp.exposing && imp.exposing.names));
    if (!modn || !names) continue;
    if (mod_has_name(name, names)) return modn + "." + name;
  }
  return null;
}

// Same rule as Sure.Mod.resolve: locals, then module.qual, then import exposing, else leave.
function mod_resolve(mod, locals, imps, name) {
  if (!name) return name;
  var loc = locals;
  var locList = Array.isArray(locals) ? locals : Object.keys(locals || {});
  if (mod_has_name(name, loc) || mod_has_name(name, locList)) return name;
  if (mod) {
    var q = mod + "." + name;
    if (mod_has_name(q, loc) || mod_has_name(q, locList)) return q;
    var a = mod_from_imp(imps, name);
    return a || name;
  }
  return mod_from_imp(imps, name) || name;
}

function mod_resolve_ident(mod, locals, imports, name, catalog) {
  if (!name || MOD_KW[name]) return name;
  var imps = (imports || []).map(function(imp) {
    var aliases = mod_import_aliases(imp, catalog);
    return {mod: imp.name, names: Object.keys(aliases), exposing: imp.exposing};
  });
  var resolved = mod_resolve(mod, locals, imps, name);
  if (resolved !== name) return resolved;
  if (locals[name]) return name;
  var q = mod ? mod + "." + name : "";
  if (q && locals[q]) return q;
  for (var i = 0; i < (imports || []).length; i++) {
    var map = mod_import_aliases(imports[i], catalog);
    if (map[name]) return map[name];
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

var HTML_TAGS = {
  a:1, abbr:1, address:1, area:1, article:1, aside:1, audio:1, b:1, base:1, bdi:1, bdo:1,
  blockquote:1, body:1, br:1, button:1, canvas:1, caption:1, cite:1, code:1, col:1, colgroup:1,
  data:1, datalist:1, dd:1, del:1, details:1, dfn:1, dialog:1, div:1, dl:1, dt:1, em:1, embed:1,
  fencedframe:1, fieldset:1, figcaption:1, figure:1, footer:1, form:1, fragment:1,
  h1:1, h2:1, h3:1, h4:1, h5:1, h6:1, head:1, header:1, hgroup:1, hr:1, html:1, i:1, iframe:1,
  img:1, input:1, ins:1, kbd:1, label:1, legend:1, li:1, link:1, main:1, map:1, mark:1, menu:1,
  meta:1, meter:1, nav:1, noscript:1, object:1, ol:1, optgroup:1, option:1, output:1, p:1,
  picture:1, pre:1, progress:1, q:1, rp:1, rt:1, ruby:1, s:1, samp:1, script:1, search:1,
  section:1, select:1, selectedcontent:1, slot:1, small:1, source:1, span:1, strong:1, style:1,
  sub:1, summary:1, sup:1, table:1, tbody:1, td:1, template:1, textarea:1, tfoot:1, th:1,
  thead:1, time:1, title:1, tr:1, track:1, u:1, ul:1, var:1, video:1, wbr:1
};

function html_read_name(s, i) {
  if (i >= s.length) return "";
  var c = s.charCodeAt(i);
  if (c < 97 || c > 122) return "";
  var j = i + 1;
  while (j < s.length) {
    var d = s.charCodeAt(j);
    if ((d >= 97 && d <= 122) || (d >= 48 && d <= 57)) j++;
    else break;
  }
  return s.slice(i, j);
}

function html_expand_open(s, start, name) {
  var i = start + 1 + name.length;
  var mid = "<" + name;
  while (i < s.length) {
    if (s[i] === "\"" || s[i] === "'") {
      var e = when_skip_string(s, i);
      mid += s.slice(i, e);
      i = e;
      continue;
    }
    if (s[i] === "/" && s[i + 1] === ">") {
      mid += "></" + name + ">";
      return {text: mid, end: i + 2};
    }
    if (s[i] === ">") {
      mid += ">";
      return {text: mid, end: i + 1};
    }
    if (when_is_ident(s, i)) {
      var j = i + 1;
      while (when_is_ident_cont(s, j)) j++;
      var k = when_skip_space(s, j);
      if (s[k] === "=") {
        var v = when_skip_space(s, k + 1);
        if (s[v] === "{") {
          var close = when_skip_balanced(s, v);
          mid += s.slice(i, k + 1) + s.slice(v + 1, close - 1);
          i = close;
          continue;
        }
      }
    }
    mid += s[i];
    i++;
  }
  return {text: s.slice(start, i), end: i};
}

function html_expand_source(src) {
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
    if (src[i] === "<" && !(i > 0 && when_is_ident_cont(src, i - 1))) {
      var name = html_read_name(src, i + 1);
      if (name && HTML_TAGS[name]) {
        var tag = html_expand_open(src, i, name);
        out += tag.text;
        i = tag.end;
        continue;
      }
    }
    out += src[i];
    i++;
  }
  return out;
}


function push_map(map, orig, exp, olen, elen) {
  map.push({orig: orig, exp: exp, olen: olen, elen: elen});
}

function map_offset(map, expandedOffset) {
  if (!map || !map.length) return expandedOffset;
  var n = expandedOffset;
  if (n < 0) n = 0;
  for (var i = 0; i < map.length; i++) {
    var s = map[i];
    if (n >= s.exp && n < s.exp + s.elen) {
      var d = n - s.exp;
      if (d > s.olen) d = s.olen;
      return s.orig + d;
    }
    if (n < s.exp) {
      if (i === 0) return s.orig;
      var p = map[i - 1];
      return p.orig + p.olen;
    }
  }
  var last = map[map.length - 1];
  return last.orig + last.olen;
}

function parse_document(src) {
  src = String(src || "");
  var lines = src.split("\n");
  var blocks = [];
  var i = 0;
  function is_header(line) {
    return /^([A-Za-z][A-Za-z0-9._]*)(?:<[^>]*>)?(?:\([^)]*\))?\s*[:]/.test(line) && !/^\s/.test(line);
  }
  function is_type(line) {
    return /^type\s+[A-Za-z]/.test(line);
  }
  while (i < lines.length) {
    var line = lines[i];
    if (!line.trim()) { blocks.push({kind: "blank", text: ""}); i++; continue; }
    if (line.trim().indexOf("//") === 0) {
      var c = [line];
      i++;
      while (i < lines.length && lines[i].trim().indexOf("//") === 0) { c.push(lines[i]); i++; }
      blocks.push({kind: "comment", text: c.join("\n")});
      continue;
    }
    if (mod_read_module(line)) { blocks.push({kind: "module", text: line.replace(/\s+$/,"")}); i++; continue; }
    if (mod_read_import(line)) { blocks.push({kind: "import", text: line.replace(/\s+$/,"")}); i++; continue; }
    if (is_type(line) || is_header(line)) {
      var body = [line.replace(/\s+$/,"")];
      i++;
      while (i < lines.length) {
        var nx = lines[i];
        if (!nx.trim()) break;
        if (!/^\s/.test(nx) && (is_header(nx) || is_type(nx) || mod_read_module(nx) || mod_read_import(nx) || nx.trim().indexOf("//") === 0)) break;
        body.push(nx.replace(/\s+$/,""));
        i++;
      }
      blocks.push({kind: is_type(line) ? "type" : "def", text: body.join("\n")});
      continue;
    }
    blocks.push({kind: "text", text: line.replace(/\s+$/,"")});
    i++;
  }
  return {blocks: blocks};
}

function format_source(src) {
  var doc = parse_document(src);
  var out = [];
  for (var i = 0; i < doc.blocks.length; i++) {
    var b = doc.blocks[i];
    if (b.kind === "blank") { out.push(""); continue; }
    if (b.kind === "comment" || b.kind === "module" || b.kind === "import" || b.kind === "text") {
      out.push(b.text);
      continue;
    }
    var parts = b.text.split("\n");
    out.push(parts[0]);
    var min = null;
    for (var j = 1; j < parts.length; j++) {
      if (!String(parts[j]).trim()) continue;
      var lead = /^(\s*)/.exec(parts[j]);
      var n = lead ? lead[1].length : 0;
      if (min == null || n < min) min = n;
    }
    if (min == null) min = 0;
    for (var j = 1; j < parts.length; j++) {
      if (!String(parts[j]).trim()) continue;
      var body = String(parts[j]).slice(min);
      out.push("  " + body);
    }
  }
  var s = out.join("\n");
  if (s && s.charAt(s.length - 1) !== "\n") s += "\n";
  return s;
}

function expand_module(file, src) {
  src = String(src || "");
  var code = mod_expand_source(file, src);
  var map = [{orig: 0, exp: 0, olen: src.length, elen: code.length}];
  SOURCE_MAPS[path.resolve(String(file || "."))] = {original: src, expanded: code, map: map};
  return {code: code, map: map, original: src};
}

function expand_open_imports(file, src) {
  src = String(src || "");
  if (!src || String(file || "").slice(-5) !== ".sure") return src;
  var parsed = parse_module_headers(src);
  if (!parsed.imports || !parsed.imports.length) return src;
  var need = false;
  for (var pi = 0; pi < parsed.imports.length; pi++) {
    if (parsed.imports[pi] && parsed.imports[pi].exposing && parsed.imports[pi].exposing.all) {
      need = true;
      break;
    }
  }
  if (!need) return src;
  var catalog = Object.create(null);
  try { catalog = mod_catalog_dir(path.dirname(path.resolve(String(file || ".")))); } catch (e) {}
  var lines = src.split("\n");
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var imp = mod_read_import(line);
    if (imp && imp.exposing && imp.exposing.all) {
      var aliases = mod_import_aliases(imp, catalog);
      var names = Object.keys(aliases);
      if (names.length) {
        out.push("import " + imp.name + " exposing (" + names.join(", ") + ")");
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

function prepare_source(file, src) {
  src = String(src || "");
  var with_html = html_expand_source(src);
  var with_when = when_expand_source(with_html);
  // Parser.file elaborates `module` / `import`, including `exposing (..)`.
  SOURCE_MAPS[path.resolve(String(file || "."))] = {
    original: src,
    expanded: with_when,
    map: [{orig: 0, exp: 0, olen: src.length, elen: with_when.length}]
  };
  return with_when;
}

function get_map(file) {
  return SOURCE_MAPS[path.resolve(String(file || "."))] || null;
}

function symbols(src) {
  var doc = parse_document(src);
  var out = [];
  var line = 0;
  var parts = String(src || "").split("\n");
  for (var i = 0; i < parts.length; i++) {
    var m = /^([A-Za-z][A-Za-z0-9._]*)(?:<[^>]*>)?(?:\([^)]*\))?\s*[:](.*)$/.exec(parts[i]);
    if (m && !/^\s/.test(parts[i])) {
      out.push({name: m[1], line: i, type: (m[2] || "").trim(), theorem: /==/.test(m[2] || ""), kind: "def"});
    }
    var t = /^type\s+([A-Za-z][A-Za-z0-9._]*)/.exec(parts[i]);
    if (t) out.push({name: t[1], line: i, type: "Type", theorem: false, kind: "type"});
  }
  return out;
}

function ident_bindings(src) {
  src = String(src || "");
  var toks = idents(src);
  var fileScope = Object.create(null);
  var stack = [fileScope];
  var bind_of = new Array(toks.length);
  var i = 0;
  var t = 0;
  var expectBinder = false;
  var paren = 0;
  var lastParen = -1;
  var parenIdent = [];
  function push() { stack.push(Object.create(stack[stack.length - 1])); }
  function pop() { if (stack.length > 1) stack.pop(); }
  function reset_def() {
    stack.length = 1;
    stack[0] = fileScope;
    push();
  }
  function bind(name, tokIndex) {
    var sc = Object.create(stack[stack.length - 1]);
    sc[name] = tokIndex;
    stack[stack.length - 1] = sc;
  }
  function prev_nonspace(idx) {
    var k = idx - 1;
    while (k >= 0 && (src[k] === " " || src[k] === "\t" || src[k] === "\n" || src[k] === "\r")) k--;
    return k;
  }
  function ident_before(idx) {
    var k = prev_nonspace(idx);
    return k >= 0 && /[A-Za-z0-9._]/.test(src[k]);
  }
  function looks_param(tok) {
    var k = tok.end;
    while (k < src.length && (src[k] === " " || src[k] === "\t")) k++;
    if (src[k] === ":") return true;
    if ((src[k] === ")" || src[k] === ",") && lastParen >= 0 && !ident_before(lastParen)) return true;
    return false;
  }
  function at_col0_ident(idx) {
    if (idx > 0 && src[idx - 1] !== "\n") return false;
    return true;
  }
  reset_def();
  while (i <= src.length && t < toks.length) {
    if (i >= src.length) break;
    if (src[i] === "\"" || src[i] === "'") {
      expectBinder = false;
      var e = when_skip_string(src, i);
      i = e > i ? e : i + 1;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "/") {
      expectBinder = false;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (src[i] === "{") { push(); expectBinder = false; i++; continue; }
    if (src[i] === "}") { pop(); expectBinder = false; i++; continue; }
    if (src[i] === "(") {
      paren++;
      lastParen = i;
      parenIdent.push(ident_before(i));
      expectBinder = false;
      i++;
      continue;
    }
    if (src[i] === ")") {
      if (paren > 0) paren--;
      parenIdent.pop();
      lastParen = -1;
      for (var p = i - 1; p >= 0; p--) {
        if (src[p] === "(") { lastParen = p; break; }
        if (src[p] === ")") break;
      }
      expectBinder = false;
      i++;
      continue;
    }
    if (toks[t].start === i) {
      var name = toks[t].name;
      if (at_col0_ident(i) && name !== "get" && name !== "let") {
        reset_def();
        expectBinder = false;
        bind_of[t] = -1;
        i = toks[t].end;
        t++;
        continue;
      }
      if (name === "get" || name === "let") {
        expectBinder = true;
        bind_of[t] = -1;
      } else if (expectBinder) {
        bind(name, t);
        bind_of[t] = t;
        expectBinder = false;
      } else if (paren > 0 && name.indexOf(".") < 0 && looks_param(toks[t])) {
        bind(name, t);
        bind_of[t] = t;
        expectBinder = false;
      } else if (Object.prototype.hasOwnProperty.call(stack[stack.length - 1], name)) {
        bind_of[t] = stack[stack.length - 1][name];
      } else {
        bind_of[t] = -1;
      }
      i = toks[t].end;
      t++;
      continue;
    }
    expectBinder = false;
    i++;
  }
  while (t < toks.length) {
    bind_of[t] = -1;
    t++;
  }
  return {toks: toks, bind_of: bind_of};
}

function rename_ident(src, offset, newName) {
  src = String(src || "");
  newName = String(newName || "");
  if (!newName) return null;
  var at = ident_at(src, offset);
  if (!at) return null;
  var info = ident_bindings(src);
  var idx = -1;
  for (var i = 0; i < info.toks.length; i++) {
    if (info.toks[i].start === at.start && info.toks[i].end === at.end) { idx = i; break; }
  }
  if (idx < 0) return null;
  var bind = info.bind_of[idx];
  var next = "";
  var p = 0;
  for (var i = 0; i < info.toks.length; i++) {
    var same = bind === -1
      ? (info.toks[i].name === at.name && info.bind_of[i] === -1)
      : (info.bind_of[i] === bind);
    if (!same) continue;
    next += src.slice(p, info.toks[i].start) + newName;
    p = info.toks[i].end;
  }
  next += src.slice(p);
  return next;
}

function rename_global(src, oldName, newName) {
  src = String(src || "");
  oldName = String(oldName || "");
  newName = String(newName || "");
  if (!oldName || !newName) return src;
  var info = ident_bindings(src);
  var next = "";
  var p = 0;
  var hit = false;
  for (var i = 0; i < info.toks.length; i++) {
    if (info.toks[i].name !== oldName || info.bind_of[i] !== -1) continue;
    next += src.slice(p, info.toks[i].start) + newName;
    p = info.toks[i].end;
    hit = true;
  }
  if (!hit) return src;
  return next + src.slice(p);
}

function file_locals(src, mod) {
  var loc = Object.create(null);
  var xs = symbols(src);
  for (var i = 0; i < xs.length; i++) {
    var n = xs[i].name;
    loc[n] = true;
    if (mod && n.indexOf(".") < 0) loc[mod + "." + n] = true;
  }
  return loc;
}

function import_imps(imports) {
  return (imports || []).map(function(imp) {
    var names = (imp.exposing && imp.exposing.names) || [];
    if (imp.exposing && imp.exposing.all) names = names.slice();
    return {mod: imp.name, names: names, exposing: imp.exposing || {all: false, names: []}, qualified: !!imp.qualified};
  });
}

function resolve_at(src, offset, pre) {
  src = String(src || "");
  var at = ident_at(src, offset);
  if (!at) return null;
  var info = (pre && pre.info) || ident_bindings(src);
  var idx = -1;
  for (var i = 0; i < info.toks.length; i++) {
    if (info.toks[i].start === at.start) { idx = i; break; }
  }
  if (idx < 0) return null;
  var bind = info.bind_of[idx];
  var parsed = (pre && pre.parsed) || parse_module_headers(src);
  var mod = (parsed.mod && parsed.mod.name) || "";
  var imports = (parsed.mod && parsed.mod.imports) || parsed.imports || [];
  var short = at.name.indexOf(".") >= 0 ? at.name.split(".").pop() : at.name;
  var local = bind !== -1;
  var qual = at.name;
  if (!local) {
    if (at.name.indexOf(".") >= 0) {
      qual = at.name;
    } else {
      var locals = (pre && pre.locals) || file_locals(src, mod);
      var imps = import_imps(imports);
      qual = mod_resolve(mod, locals, imps, at.name);
      if (qual === at.name && mod && (locals[mod + "." + at.name] || locals[at.name])) {
        qual = mod + "." + at.name;
      }
    }
  }
  return {
    token: at,
    idx: idx,
    binder: bind,
    local: local,
    name: at.name,
    short: short,
    qual: local ? null : qual,
    module: mod,
    imports: imports
  };
}

function same_def(a, b) {
  if (!a || !b) return false;
  if (a.local || b.local) return a.local && b.local && a.binder === b.binder && a.idx != null && b.idx != null
    ? a.binder === b.binder
    : false;
  return !!(a.qual && a.qual === b.qual);
}

function rename_qual(src, qual, newShort) {
  src = String(src || "");
  qual = String(qual || "");
  newShort = String(newShort || "");
  if (!qual || !newShort) return src;
  var info = ident_bindings(src);
  var parsed = parse_module_headers(src);
  var locals = file_locals(src, parsed.mod && parsed.mod.name);
  var pre = {info: info, parsed: parsed, locals: locals};
  var next = "";
  var p = 0;
  var hit = false;
  for (var i = 0; i < info.toks.length; i++) {
    if (info.bind_of[i] !== -1) continue;
    var rr = resolve_at(src, info.toks[i].start, pre);
    if (!rr || rr.qual !== qual) continue;
    var tok = info.toks[i].name;
    var repl = tok.indexOf(".") >= 0 ? tok.slice(0, tok.lastIndexOf(".") + 1) + newShort : newShort;
    next += src.slice(p, info.toks[i].start) + repl;
    p = info.toks[i].end;
    hit = true;
  }
  if (!hit) return src;
  return next + src.slice(p);
}

function rename_resolved(src, offset, newName) {
  src = String(src || "");
  newName = String(newName || "");
  if (!newName) return null;
  var info = ident_bindings(src);
  var parsed = parse_module_headers(src);
  var locals = file_locals(src, parsed.mod && parsed.mod.name);
  var pre = {info: info, parsed: parsed, locals: locals};
  var r = resolve_at(src, offset, pre);
  if (!r) return null;
  if (r.local) return rename_ident(src, offset, newName);
  var next = "";
  var p = 0;
  var hit = false;
  for (var i = 0; i < info.toks.length; i++) {
    if (info.bind_of[i] !== -1) continue;
    var rr = resolve_at(src, info.toks[i].start, pre);
    if (!rr || rr.qual !== r.qual) continue;
    var tok = info.toks[i].name;
    var repl = tok.indexOf(".") >= 0 ? tok.slice(0, tok.lastIndexOf(".") + 1) + newName : newName;
    next += src.slice(p, info.toks[i].start) + repl;
    p = info.toks[i].end;
    hit = true;
  }
  if (!hit) return null;
  return next + src.slice(p);
}

function ident_at(src, offset) {
  src = String(src || "");
  offset = Number(offset) || 0;
  if (offset < 0) offset = 0;
  var toks = idents(src);
  for (var i = 0; i < toks.length; i++) {
    if (offset >= toks[i].start && offset <= toks[i].end) return toks[i];
  }
  return null;
}

function idents(src) {
  src = String(src || "");
  var out = [];
  var i = 0;
  var line = 0;
  var col = 0;
  function bump(n) {
    var j = 0;
    while (j < n && i + j < src.length) {
      if (src[i + j] === "\n") { line++; col = 0; }
      else col++;
      j++;
    }
    i += n;
  }
  while (i < src.length) {
    if (src[i] === "\"" || src[i] === "'") {
      var e = when_skip_string(src, i);
      bump(e - i);
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "/") {
      var n = i;
      while (n < src.length && src[n] !== "\n") n++;
      bump(n - i);
      continue;
    }
    if (when_is_ident(src, i)) {
      var start = i;
      var sl = line;
      var sc = col;
      var j = i + 1;
      while (when_is_ident_cont(src, j)) j++;
      var name = src.slice(start, j);
      out.push({name: name, start: start, end: j, line: sl, character: sc});
      bump(j - i);
      continue;
    }
    bump(1);
  }
  return out;
}

globalThis.__surePrepare = function(file, code) {
  return prepare_source(String(file || ""), String(code || ""));
};

module.exports = {
  prepare_source: prepare_source,
  expand_module: expand_module,
  when_expand_source: when_expand_source,
  html_expand_source: html_expand_source,
  expand_open_imports: expand_open_imports,
  mod_expand_source: mod_expand_source,
  parse_module_headers: parse_module_headers,
  format_source: format_source,
  parse_document: parse_document,
  symbols: symbols,
  idents: idents,
  ident_at: ident_at,
  ident_bindings: ident_bindings,
  resolve_at: resolve_at,
  same_def: same_def,
  rename_ident: rename_ident,
  rename_resolved: rename_resolved,
  rename_qual: rename_qual,
  rename_global: rename_global,
  get_map: get_map,
  map_offset: map_offset,
  mod_resolve: mod_resolve,
  mod_name_ok: mod_name_ok,
  mod_pkg_ok: mod_pkg_ok,
  mod_read_module: mod_read_module,
  mod_read_import: mod_read_import,
  mod_prefix: mod_prefix,
  mod_allows: mod_allows,
  mod_imports_allow: mod_imports_allow,
  mod_is_exposed: mod_is_exposed,
  mod_catalog_dir: mod_catalog_dir,
  mod_owner: mod_owner
};
