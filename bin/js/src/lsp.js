"use strict";
// Language server protocol. Rename/highlight/format use compiler.parse_document
// and compiler.ident_bindings (not regex-over-the-file).
module.exports = function makeLsp(deps) {
  var compiler = deps.compiler;
  var fs = deps.fs;
  var path = deps.path;
  var json_err = deps.json_err;
  var SURE_VERSION = deps.SURE_VERSION;
  var agent_check_name = deps.agent_check_name;
  var agent_check_code = deps.agent_check_code;
  var scan_defs = deps.scan_defs;
  var scan_symbols = deps.scan_symbols;
  var scan_references = deps.scan_references;
  var file_of_name = deps.file_of_name;
  var line_col_offset = deps.line_col_offset;
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
  var doc = compiler.parse_document(text);
  var ends = Object.create(null);
  var line = 0;
  for (var b = 0; b < doc.blocks.length; b++) {
    var blk = doc.blocks[b];
    var nlines = blk.kind === "blank" ? 1 : String(blk.text || "").split("\n").length;
    if (blk.kind === "def" || blk.kind === "type") {
      var first = String(blk.text || "").split("\n")[0] || "";
      var hm = /^type\s+([A-Za-z][A-Za-z0-9._]*)/.exec(first) || /^([A-Za-z][A-Za-z0-9._]*)/.exec(first);
      if (hm) ends[hm[1]] = {start: line, end: line + nlines - 1};
    }
    line += nlines;
  }
  return compiler.symbols(text).map(function(s) {
    var name = s.name;
    if (mod && name.indexOf(".") < 0) name = mod + "." + name;
    var span = ends[s.name] || {start: s.line, end: s.line};
    return {name: name, line: s.line, endLine: span.end, type: s.type, theorem: s.theorem, kind: s.kind};
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

function lsp_highlights(text, offset) {
  var at = compiler.ident_at(text, offset);
  if (!at) return [];
  var info = compiler.ident_bindings(text);
  var idx = -1;
  for (var i = 0; i < info.toks.length; i++) {
    if (info.toks[i].start === at.start) { idx = i; break; }
  }
  if (idx < 0) return [];
  var bind = info.bind_of[idx];
  var out = [];
  for (var i = 0; i < info.toks.length; i++) {
    var same = bind === -1
      ? (info.toks[i].name === at.name && info.bind_of[i] === -1)
      : (info.bind_of[i] === bind);
    if (!same) continue;
    out.push({
      range: {start: lsp_pos_at(text, info.toks[i].start), end: lsp_pos_at(text, info.toks[i].end)},
      kind: 1
    });
  }
  return out;
}

function lsp_replace_word(text, offset, newN) {
  return compiler.rename_ident(text, offset, newN);
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
    var off = line_col_offset(text, pos.line, pos.character);
    name = lsp_name_at(text, pos.line, pos.character);
    var newN = params.newName;
    if (!name || newN == null || String(newN) === "") { error(-32602, "need name"); return {state: state, out: out}; }
    var next = lsp_replace_word(text, off, String(newN));
    if (next == null) { error(-32602, "need name"); return {state: state, out: out}; }
    state.docs[uri] = next;
    var changes = [{
      textDocument: {uri: uri, version: td.version == null ? null : td.version},
      edits: [{range: lsp_full_range(text), newText: next}]
    }];
    var infoR0 = compiler.ident_bindings(text);
    var atR0 = compiler.ident_at(text, off);
    var isGlobal = false;
    if (atR0) {
      for (var gi = 0; gi < infoR0.toks.length; gi++) {
        if (infoR0.toks[gi].start === atR0.start && infoR0.bind_of[gi] === -1) { isGlobal = true; break; }
      }
    }
    if (isGlobal) {
      var parsedM = compiler.parse_module_headers(text);
      var qual = (parsedM.mod && parsedM.mod.name && name.indexOf(".") < 0)
        ? parsedM.mod.name + "." + name : name;
      var names = [name];
      if (qual !== name) names.push(qual);
      var seenF = {};
      seenF[uri] = true;
      for (var ni = 0; ni < names.length; ni++) {
        var refs = scan_references(names[ni]);
        for (var ri = 0; ri < refs.length; ri++) {
          var fp = path.resolve(process.cwd(), refs[ri].file);
          var u2 = lsp_path_to_uri(fp);
          if (seenF[u2]) continue;
          seenF[u2] = true;
          var body;
          try { body = fs.readFileSync(fp, "utf8"); } catch (e) { continue; }
          var edited = body;
          edited = compiler.rename_global(edited, name, String(newN));
          if (qual !== name) edited = compiler.rename_global(edited, qual, parsedM.mod.name + "." + String(newN));
          if (edited === body) continue;
          changes.push({
            textDocument: {uri: u2, version: null},
            edits: [{range: lsp_full_range(body), newText: edited}]
          });
        }
      }
    }
    result({documentChanges: changes});
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
      var sel = {start: {line: d.line, character: 0}, end: {line: d.line, character: (d.name || "").length}};
      var rng = {start: {line: d.line, character: 0}, end: {line: d.endLine == null ? d.line : d.endLine, character: 0}};
      return {name: d.name, kind: d.theorem ? 14 : 12, detail: d.type || "", range: rng, selectionRange: sel};
    }));
    return {state: state, out: out};
  }
  if (method === "textDocument/documentHighlight") {
    result(lsp_highlights(text, line_col_offset(text, pos.line, pos.character)));
    return {state: state, out: out};
  }
  if (method === "textDocument/references") {
    var offR = line_col_offset(text, pos.line, pos.character);
    name = lsp_name_at(text, pos.line, pos.character);
    if (!name) { result([]); return {state: state, out: out}; }
    var locs = [];
    lsp_highlights(text, offR).forEach(function(h) {
      locs.push({uri: uri, range: h.range});
    });
    var infoR = compiler.ident_bindings(text);
    var atR = compiler.ident_at(text, offR);
    var global = false;
    if (atR) {
      for (var bi = 0; bi < infoR.toks.length; bi++) {
        if (infoR.toks[bi].start === atR.start && infoR.bind_of[bi] === -1) { global = true; break; }
      }
    }
    if (global) {
      var refs = scan_references(name);
      for (var ri = 0; ri < refs.length; ri++) {
        var fp = path.resolve(process.cwd(), refs[ri].file);
        if (uri && lsp_path_to_uri(fp) === uri) continue;
        var body;
        try { body = fs.readFileSync(fp, "utf8"); } catch (e) { continue; }
        var other = compiler.ident_bindings(body);
        for (var oi = 0; oi < other.toks.length; oi++) {
          if (other.toks[oi].name !== name || other.bind_of[oi] !== -1) continue;
          locs.push({
            uri: lsp_path_to_uri(fp),
            range: {start: lsp_pos_at(body, other.toks[oi].start), end: lsp_pos_at(body, other.toks[oi].end)}
          });
        }
      }
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

  return {
    LSP_KEYWORDS: LSP_KEYWORDS,
    lsp_method_read: lsp_method_read,
    lsp_keyword: lsp_keyword,
    lsp_ext: lsp_ext,
    lsp_uri_ok: lsp_uri_ok,
    lsp_frame: lsp_frame,
    lsp_write: lsp_write,
    lsp_path_to_uri: lsp_path_to_uri,
    lsp_uri_to_path: lsp_uri_to_path,
    lsp_pos_at: lsp_pos_at,
    lsp_full_range: lsp_full_range,
    lsp_word_range: lsp_word_range,
    lsp_name_at: lsp_name_at,
    lsp_apply_changes: lsp_apply_changes,
    lsp_defs_in_text: lsp_defs_in_text,
    lsp_find_name_range: lsp_find_name_range,
    lsp_new_state: lsp_new_state,
    lsp_capabilities: lsp_capabilities,
    lsp_parse_frames: lsp_parse_frames,
    lsp_handle: lsp_handle,
    cmd_lsp: cmd_lsp
  };
};
