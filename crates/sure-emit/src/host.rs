//! Port of `vendor/formcore-js/host-io-gen.js` `emit_io_host`.
//!
//! Emitted op bodies stay the existing JS text. Snippets via `include_str!`.

use crate::schema::HostNeed;

const HOST_ABORT_JS: &str = include_str!("../../../vendor/formcore-js/host-abort.js");
const HOST_PACK_JS: &str = include_str!("../../../vendor/formcore-js/host-pack.js");
const WS_FRAMES_JS: &str = include_str!("../../../vendor/formcore-js/ws-frames.js");

/// Join `module.exports = [ "line", ... ]` snippet files.
fn joined_export_lines(src: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for raw in src.lines() {
        // Array entries are indented; skip the file's own `"use strict";`.
        if !raw.starts_with(' ') && !raw.starts_with('\t') {
            continue;
        }
        let t = raw.trim();
        if !t.starts_with('"') {
            continue;
        }
        if let Some(s) = parse_js_double_string(t) {
            lines.push(s);
        }
    }
    let mut out = lines.join("\n");
    out.push('\n');
    out
}

fn parse_js_double_string(t: &str) -> Option<String> {
    let mut chars = t.chars();
    if chars.next() != Some('"') {
        return None;
    }
    let mut out = String::new();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next()? {
                'n' => out.push('\n'),
                'r' => out.push('\r'),
                't' => out.push('\t'),
                '\\' => out.push('\\'),
                '"' => out.push('"'),
                '\'' => out.push('\''),
                other => out.push(other),
            }
        } else if c == '"' {
            return Some(out);
        } else {
            out.push(c);
        }
    }
    None
}

/// FmcToJs lines 5–9: drop `"use strict"` and `module.exports`.
fn ws_frames_src(src: &str) -> String {
    let mut s = src.to_string();
    // /^["']use strict["'];\s*/m
    if let Some(rest) = s.strip_prefix("\"use strict\";") {
        s = rest.trim_start_matches([' ', '\t', '\n', '\r']).to_string();
    } else if let Some(rest) = s.strip_prefix("'use strict';") {
        s = rest.trim_start_matches([' ', '\t', '\n', '\r']).to_string();
    }
    if let Some(i) = s.find("module.exports") {
        s.truncate(i);
    }
    s
}

/// Port of `emit_io_host(hneed)`.
pub fn emit_io_host(hneed: &HostNeed) -> String {
    let mut code = String::new();
    code.push_str("  var run = (p) => {\n");
    code.push_str("    if (typeof window === 'undefined') {");
    code.push_str("      var rl = eval(\"require('readline')\").createInterface({input:process.stdin,output:process.stdout,terminal:false});\n");
    code.push_str("      var fs = eval(\"require('fs')\");\n");
    code.push_str("      var pc = eval(\"process\");\n");
    code.push_str("      var ht = eval(\"require('http')\");\n");
    code.push_str("      var hs = eval(\"require('https')\");\n");
    code.push_str("      var dg = eval(\"require('dgram')\");\n");
    code.push_str("    } else {\n");
    code.push_str("      var rl = {question: (x,f) => f(''), close: () => {}};\n");
    code.push_str("      var fs = {readFileSync: () => ''};\n");
    code.push_str("      var pc = {exit: () => {}, argv: []};\n");
    code.push_str("      var ht = null;\n");
    code.push_str("      var hs = null;\n");
    code.push_str("      var dg = null;\n");
    code.push_str("    };\n");
    code.push_str("    var lib = {rl,fs,pc,ht,hs,dg};\n");
    code.push_str("    return run_io(lib,p)\n");
    code.push_str("      .then((x) => { host_release_all(lib); rl.close(); return x; })\n");
    code.push_str("      .catch((e) => { host_release_all(lib); rl.close(); try { var msg = String(e && (e.stack || e.message) || e); if (typeof console !== 'undefined') console.error(msg); } catch (e2) {} try { lib.pc.exit(1); } catch (e3) {} throw e; });\n");
    code.push_str("  };\n");
    if hneed.file {
        code.push_str("  var set_file = (lib, param) => {\n");
        code.push_str("    var path = '';\n");
        code.push_str("    for (var i = 0; i < param.length && param[i] !== '='; ++i) {\n");
        code.push_str("      path += param[i];\n");
        code.push_str("    };\n");
        code.push_str("    var data = param.slice(i+1);\n");
        code.push_str(
            "    lib.fs.mkdirSync(path.split('/').slice(0,-1).join('/'),{recursive:true});\n",
        );
        code.push_str("    lib.fs.writeFileSync(path,data);\n");
        code.push_str("    return host_ok('');\n");
        code.push_str("  };\n");
        code.push_str("  var del_file = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      lib.fs.unlinkSync(param);\n");
        code.push_str("      return host_ok('');\n");
        code.push_str("    } catch (e) {\n");
        code.push_str("      if (e.message.indexOf('EPERM') !== -1) {\n");
        code.push_str("        lib.fs.rmdirSync(param);\n");
        code.push_str("        return host_ok('');\n");
        code.push_str("      } else {\n");
        code.push_str("        return host_err(String(e && e.message || e));\n");
        code.push_str("      }\n");
        code.push_str("    }\n");
        code.push_str("  };\n");
        code.push_str("  var get_file = (lib, param) => {\n");
        code.push_str("    var p = String(param || '').replace(/\\\\/g, '/');\n");
        code.push_str("    if (typeof process !== 'undefined' && process.env && process.env.SURE_CACHE === '0') {\n");
        code.push_str("      if (p === '.cache' || p.indexOf('.cache/') === 0 || p.indexOf('/.cache/') >= 0) return host_ok('');\n");
        code.push_str("    }\n");
        code.push_str("    return host_ok(lib.fs.readFileSync(param, 'utf8'));\n");
        code.push_str("  }\n");
        code.push_str("  var get_dir = (lib, param) => {\n");
        code.push_str("    return host_ok(lib.fs.readdirSync(param).join(';'));\n");
        code.push_str("  };\n");
        code.push_str("  var get_file_mtime = (lib, param) => {\n");
        code.push_str("    return host_ok(String(lib.fs.statSync(param).mtime.getTime()));\n");
        code.push_str("  };\n");
    }
    code.push_str("  var HOST_STATE = {};\n");
    code.push_str("  var HOST_RES = []; var HOST_FD = {}; var HOST_FD_N = 0; var HOST_STREAM = {}; var HOST_STREAM_N = 0;\n");
    code.push_str("  var host_ok = function(s) { return '0\\n' + String(s == null ? '' : s); };\n");
    code.push_str(
        "  var host_err = function(s) { return '1\\n' + String(s == null ? '' : s); };\n",
    );
    code.push_str(&joined_export_lines(HOST_ABORT_JS));
    code.push_str("  var host_release_all = (lib) => {\n");
    code.push_str("    while (HOST_RES.length) {\n");
    code.push_str("      var r = HOST_RES.pop();\n");
    code.push_str("      try {\n");
    code.push_str(
        "        if (r.kind === 'temp' && r.path && lib && lib.fs) lib.fs.unlinkSync(r.path);\n",
    );
    code.push_str("        if (r.kind === 'fd' && r.id && HOST_FD[r.id]) { HOST_FD[r.id].fd.close(); delete HOST_FD[r.id]; }\n");
    code.push_str("        if (r.kind === 'stream' && r.id && HOST_STREAM[r.id]) { HOST_STREAM[r.id].fd.close(); delete HOST_STREAM[r.id]; }\n");
    code.push_str("        if (r.kind === 'ws' && r.id && typeof HOST_TCP !== 'undefined' && HOST_TCP[r.id]) {\n");
    code.push_str("          try { HOST_TCP[r.id].sock.end(); } catch (eW) {}\n");
    code.push_str("          delete HOST_TCP[r.id];\n");
    code.push_str("        }\n");
    code.push_str("      } catch (eR) {}\n");
    code.push_str("    }\n");
    code.push_str("  };\n");
    code.push_str("  var host_get_args = (lib) => {\n");
    code.push_str("    var argv = (lib.pc && lib.pc.argv) || (typeof process !== 'undefined' ? process.argv : []) || [];\n");
    code.push_str("    var flags = ['--run', '--test', '--json'];\n");
    code.push_str("    for (var i = 0; i < argv.length; i++) {\n");
    code.push_str("      if (flags.indexOf(argv[i]) !== -1) {\n");
    code.push_str("        return argv.slice(i + 1).join('\\n');\n");
    code.push_str("      }\n");
    code.push_str("    }\n");
    code.push_str("    return argv.slice(2).join('\\n');\n");
    code.push_str("  };\n");
    if hneed.http {
        code.push_str("  var host_http = (lib, param) => {\n");
        code.push_str("    var nl = param.indexOf('\\n');\n");
        code.push_str("    var line = nl === -1 ? param : param.slice(0, nl);\n");
        code.push_str("    var rest = nl === -1 ? '' : param.slice(nl + 1);\n");
        code.push_str("    var sp = line.indexOf(' ');\n");
        code.push_str(
            "    var method = (sp === -1 ? line : line.slice(0, sp)).toUpperCase() || 'GET';\n",
        );
        code.push_str("    var url = sp === -1 ? '' : line.slice(sp + 1);\n");
        code.push_str("    var headers = {};\n");
        code.push_str("    var body = rest;\n");
        code.push_str("    var hdr_end = rest.indexOf('\\n\\n');\n");
        code.push_str("    if (hdr_end >= 0) {\n");
        code.push_str("      rest.slice(0, hdr_end).split('\\n').forEach(function(hline) {\n");
        code.push_str("        var c = hline.indexOf(':');\n");
        code.push_str(
            "        if (c > 0) headers[hline.slice(0, c).trim()] = hline.slice(c + 1).trim();\n",
        );
        code.push_str("      });\n");
        code.push_str("      body = rest.slice(hdr_end + 2);\n");
        code.push_str("    } else {\n");
        code.push_str("      var hlines = rest.split('\\n');\n");
        code.push_str("      var hi = 0;\n");
        code.push_str("      if (hlines[0] === '') hi = 1;\n");
        code.push_str("      var hacc = [];\n");
        code.push_str("      while (hi < hlines.length) {\n");
        code.push_str("        var hline = hlines[hi];\n");
        code.push_str("        var c = hline.indexOf(':');\n");
        code.push_str("        if (c <= 0) break;\n");
        code.push_str("        headers[hline.slice(0, c).trim()] = hline.slice(c + 1).trim();\n");
        code.push_str("        hi++;\n");
        code.push_str("      }\n");
        code.push_str("      body = hlines.slice(hi).join('\\n');\n");
        code.push_str("    }\n");
        code.push_str("    if (!url) return Promise.resolve('1\\nbad url');\n");
        code.push_str("    return new Promise((res) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var mod = /^https:/.test(url) ? lib.hs : lib.ht;\n");
        code.push_str("        if (!mod) { res('1\\nno http module'); return; }\n");
        code.push_str("        var u = new URL(url);\n");
        code.push_str("        var req = mod.request({method: method, hostname: u.hostname, port: u.port || (/^https:/.test(url) ? 443 : 80), path: u.pathname + u.search, headers: headers}, (r) => {\n");
        code.push_str("          var data = '';\n");
        code.push_str("          r.on('data', (c) => { data += c; });\n");
        code.push_str("          r.on('end', () => res('0\\n' + r.statusCode + '\\n' + data));\n");
        code.push_str("        });\n");
        code.push_str("        req.on('error', (e) => res('1\\n' + String(e.message || e)));\n");
        code.push_str(
            "        if (method !== 'GET' && method !== 'HEAD' && body) req.write(body);\n",
        );
        code.push_str("        req.end();\n");
        code.push_str("      } catch (e) { res('1\\n' + String(e && e.message || e)); }\n");
        code.push_str("    });\n");
        code.push_str("  };\n");
    }
    if hneed.job || hneed.tcp || hneed.server || hneed.sse {
        code.push_str("  var HOST_JOBS = {}; var HOST_JOB_N = 0; var HOST_TCP = {}; var HOST_HTTP_SRV = {}; var HOST_TCP_N = 0; var HOST_SSE = Object.create(null);\n");
    }
    if hneed.tcp {
        code.push_str("  var host_tcp_connect = (lib, param) => {\n");
        code.push_str("    var p = String(param || '').split('\\n'); var host = p[0] || ''; var port = Number(p[1] || 0); var tlsOn = p[2] === '1';\n");
        code.push_str("    return new Promise((res) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var mod = tlsOn ? require('tls') : require('net');\n");
        code.push_str("        var sock = tlsOn ? mod.connect({host: host, port: port, servername: host}, onup) : mod.connect({host: host, port: port}, onup);\n");
        code.push_str("        var id = String(++HOST_TCP_N); var rec = {sock: sock, buf: Buffer.alloc(0), wait: null};\n");
        code.push_str("        function onup() { HOST_TCP[id] = rec; res('0\\n' + id); }\n");
        code.push_str("        sock.on('data', (c) => { rec.buf = Buffer.concat([rec.buf, c]); if (rec.wait) { var w = rec.wait; rec.wait = null; w(); } });\n");
        code.push_str(
            "        sock.on('error', (e) => res('1\\n' + String(e && e.message || e)));\n",
        );
        code.push_str("        sock.on('close', () => { delete HOST_TCP[id]; });\n");
        code.push_str("      } catch (e) { res('1\\n' + String(e && e.message || e)); }\n");
        code.push_str("    });\n");
        code.push_str("  };\n");
        code.push_str(&ws_frames_src(WS_FRAMES_JS));
        code.push_str("  var ws_take_frame_host = (rec) => {\n");
        code.push_str("    var frame = ws_take_frame(rec);\n");
        code.push_str("    if (frame && frame.ping) { try { rec.sock.write(Buffer.from([0x8A, 0x00])); } catch (eP) {} }\n");
        code.push_str("    return frame;\n");
        code.push_str("  };\n");
        code.push_str("  var host_tcp_send = (lib, param) => {\n");
        code.push_str("    var nl = param.indexOf('\\n'); var id = nl === -1 ? param : param.slice(0, nl); var data = nl === -1 ? '' : param.slice(nl + 1);\n");
        code.push_str(
            "    var rec = HOST_TCP[id]; if (!rec) return Promise.resolve('1\\nclosed');\n",
        );
        code.push_str("    if (rec.ws) rec.sock.write(ws_mask_frame(data));\n");
        code.push_str("    else rec.sock.write(data);\n");
        code.push_str("    return Promise.resolve('0\\n');\n");
        code.push_str("  };\n");
        code.push_str("  var host_tcp_recv = (lib, param) => {\n");
        code.push_str(
            "    var rec = HOST_TCP[param]; if (!rec) return Promise.resolve('1\\nclosed');\n",
        );
        code.push_str("    return host_abortable(lib, function(finish) {\n");
        code.push_str("      var take = () => {\n");
        code.push_str("        if (rec.ws) {\n");
        code.push_str("          var frame = ws_take_frame_host(rec);\n");
        code.push_str("          if (!frame) return false;\n");
        code.push_str("          if (frame.ping) return take();\n");
        code.push_str("          if (frame.close) { finish('1\\nclosed'); return true; }\n");
        code.push_str("          finish('0\\n' + frame.text); return true;\n");
        code.push_str("        }\n");
        code.push_str("        if (rec.buf.length) { var s = rec.buf.toString('utf8'); rec.buf = Buffer.alloc(0); finish('0\\n' + s); return true; }\n");
        code.push_str("        return false;\n");
        code.push_str("      };\n");
        code.push_str("      if (take()) return;\n");
        code.push_str("      rec.wait = () => { take() || finish('0\\n'); };\n");
        code.push_str("      var t = setTimeout(() => { if (rec.wait) { rec.wait = null; finish('0\\n'); } }, 3000);\n");
        code.push_str(
            "      host_on_abort(lib, function() { clearTimeout(t); rec.wait = null; });\n",
        );
        code.push_str("    });\n");
        code.push_str("  };\n");
    }
    if hneed.ws {
        code.push_str("  var host_ws_connect = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var u = new URL(param); var tlsOn = u.protocol === 'wss:'; var port = Number(u.port || (tlsOn ? 443 : 80));\n");
        code.push_str("      return host_tcp_connect(lib, u.hostname + '\\n' + port + '\\n' + (tlsOn ? '1' : '0')).then((raw) => {\n");
        code.push_str("        if (raw.indexOf('0\\n') !== 0) return raw;\n");
        code.push_str("        var id = raw.slice(2); var key = require('crypto').randomBytes(16).toString('base64');\n");
        code.push_str("        var req = ws_handshake_request(param, key);\n");
        code.push_str("        return host_tcp_send(lib, id + '\\n' + req).then(() => host_tcp_recv(lib, id)).then((r) => {\n");
        code.push_str("          if (ws_handshake_ok(r)) {\n");
        code.push_str("            if (HOST_TCP[id]) HOST_TCP[id].ws = true;\n");
        code.push_str("            HOST_RES.push({kind: 'ws', id: id});\n");
        code.push_str("            return '0\\n' + id;\n");
        code.push_str("          }\n");
        code.push_str("          return '1\\nws handshake';\n");
        code.push_str("        });\n");
        code.push_str("      });\n");
        code.push_str(
            "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n",
        );
        code.push_str("  };\n");
    }
    if hneed.server {
        code.push_str("  var host_http_cookie = (h) => {\n");
        code.push_str("    var cookie = '';\n");
        code.push_str("    try {\n");
        code.push_str("      if (!h) cookie = '';\n");
        code.push_str("      else if (typeof h.get === 'function') cookie = String(h.get('cookie') || h.get('Cookie') || '');\n");
        code.push_str("      else cookie = String(h.cookie || h.Cookie || '');\n");
        code.push_str("    } catch (eC) { cookie = ''; }\n");
        code.push_str(
            "    if (cookie.indexOf('\\n') >= 0 || cookie.indexOf('\\0') >= 0) cookie = '';\n",
        );
        code.push_str("    return cookie;\n");
        code.push_str("  };\n");
        code.push_str("  var host_http_payload = (ctype, body) => {\n");
        code.push_str("    var c = String(ctype == null ? '' : ctype);\n");
        code.push_str("    var b = String(body == null ? '' : body);\n");
        code.push_str("    if (c.indexOf('image/') === 0) {\n");
        code.push_str("      var raw = b;\n");
        code.push_str("      var ix = raw.indexOf('base64,');\n");
        code.push_str("      if (ix >= 0) raw = raw.slice(ix + 7);\n");
        code.push_str("      try {\n");
        code.push_str(
            "        if (typeof Buffer !== 'undefined') return Buffer.from(raw, 'base64');\n",
        );
        code.push_str("        if (typeof atob === 'function') {\n");
        code.push_str("          var bin = atob(raw);\n");
        code.push_str("          var u8 = new Uint8Array(bin.length);\n");
        code.push_str(
            "          for (var k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);\n",
        );
        code.push_str("          return u8;\n");
        code.push_str("        }\n");
        code.push_str("      } catch (eP) { return b; }\n");
        code.push_str("    }\n");
        code.push_str("    return b;\n");
        code.push_str("  };\n");
        code.push_str("  var host_http_listen = (lib, param) => {\n");
        code.push_str("    var port = Number(param);\n");
        code.push_str("    if (!Number.isFinite(port) || port < 0 || port > 65535) return Promise.resolve('1\\nbad port');\n");
        code.push_str("    if (HOST_HTTP_SRV[port] && HOST_HTTP_SRV[port].server) return Promise.resolve('0\\n');\n");
        code.push_str("    if (typeof Bun !== 'undefined' && Bun.serve) {\n");
        code.push_str("      var mailbox = []; var waiters = []; var replies = {}; var nid = 0;\n");
        code.push_str("      try {\n");
        code.push_str("        var server = Bun.serve({\n");
        code.push_str("          port: port, hostname: '127.0.0.1',\n");
        code.push_str("          async fetch(req) {\n");
        code.push_str("            var id = String(++nid);\n");
        code.push_str("            var u = new URL(req.url);\n");
        code.push_str("            var ck = host_http_cookie(req.headers);\n");
        code.push_str("            var rec = {id: id, method: req.method || 'GET', url: (u.pathname + u.search) || '/', cookie: ck, body: await req.text()};\n");
        code.push_str("            return new Promise((resolve) => {\n");
        code.push_str("              replies[id] = resolve;\n");
        code.push_str(
            "              if (waiters.length) waiters.shift()(rec); else mailbox.push(rec);\n",
        );
        code.push_str("            });\n");
        code.push_str("          }\n");
        code.push_str("        });\n");
        code.push_str("        HOST_HTTP_SRV[port] = {server: server, mailbox: mailbox, waiters: waiters, replies: replies, bun: true};\n");
        code.push_str("        return Promise.resolve('0\\n');\n");
        code.push_str("      } catch (e) {}\n");
        code.push_str("    }\n");
        code.push_str("    if (!lib.ht) return Promise.resolve('1\\nno http module');\n");
        code.push_str("    return new Promise((res) => {\n");
        code.push_str("      var mailbox = []; var waiters = []; var replies = {}; var nid = 0;\n");
        code.push_str("      var server = lib.ht.createServer((req, rres) => {\n");
        code.push_str("        var chunks = [];\n");
        code.push_str("        req.on('data', (c) => chunks.push(c));\n");
        code.push_str("        req.on('end', () => {\n");
        code.push_str("          var id = String(++nid);\n");
        code.push_str("          var ck = host_http_cookie(req.headers);\n");
        code.push_str("          var rec = {id: id, method: req.method || 'GET', url: req.url || '/', cookie: ck, body: Buffer.concat(chunks).toString('utf8')};\n");
        code.push_str("          replies[id] = rres;\n");
        code.push_str(
            "          if (waiters.length) waiters.shift()(rec); else mailbox.push(rec);\n",
        );
        code.push_str("        });\n");
        code.push_str("      });\n");
        code.push_str(
            "      server.on('error', (e) => res('1\\n' + String(e && e.message || e)));\n",
        );
        code.push_str("      server.listen(port, '127.0.0.1', () => {\n");
        code.push_str("        HOST_HTTP_SRV[port] = {server: server, mailbox: mailbox, waiters: waiters, replies: replies};\n");
        code.push_str("        res('0\\n');\n");
        code.push_str("      });\n");
        code.push_str("    });\n");
        code.push_str("  };\n");
        code.push_str("  var host_http_recv = (lib, param) => {\n");
        code.push_str("    var port = Number(param) || 0; var srv = HOST_HTTP_SRV[port];\n");
        code.push_str("    if (!srv) return Promise.resolve(host_err('closed'));\n");
        code.push_str("    return host_abortable(lib, function(finish) {\n");
        code.push_str("      var deliver = (rec) => finish('0\\n' + rec.id + '\\n' + rec.method + '\\n' + rec.url + '\\n' + (rec.cookie || '') + '\\n' + rec.body);\n");
        code.push_str("      if (srv.mailbox.length) deliver(srv.mailbox.shift());\n");
        code.push_str("      else {\n");
        code.push_str("        var fn = (rec) => deliver(rec);\n");
        code.push_str("        srv.waiters.push(fn);\n");
        code.push_str("        host_on_abort(lib, function() {\n");
        code.push_str("          var i = srv.waiters.indexOf(fn);\n");
        code.push_str("          if (i >= 0) srv.waiters.splice(i, 1);\n");
        code.push_str("        });\n");
        code.push_str("      }\n");
        code.push_str("    });\n");
        code.push_str("  };\n");
        code.push_str("  var host_http_reply = (lib, param) => {\n");
        code.push_str(
            "    var nl = param.indexOf('\\n'); var id = nl === -1 ? param : param.slice(0, nl);\n",
        );
        code.push_str("    var rest = nl === -1 ? '' : param.slice(nl + 1);\n");
        code.push_str("    var nl2 = rest.indexOf('\\n');\n");
        code.push_str("    var status = Number(nl2 === -1 ? rest : rest.slice(0, nl2)) || 200;\n");
        code.push_str("    var body = nl2 === -1 ? '' : rest.slice(nl2 + 1);\n");
        code.push_str("    for (var p in HOST_HTTP_SRV) {\n");
        code.push_str("      var r = HOST_HTTP_SRV[p].replies[id];\n");
        code.push_str("      if (r) {\n");
        code.push_str("        if (typeof r === 'function') { r(new Response(body, {status: status, headers: {'Content-Type': 'text/plain; charset=utf-8'}})); delete HOST_HTTP_SRV[p].replies[id]; return Promise.resolve('0\\n'); }\n");
        code.push_str("        r.statusCode = status; r.setHeader('Content-Type', 'text/plain; charset=utf-8'); r.end(body); delete HOST_HTTP_SRV[p].replies[id]; return Promise.resolve('0\\n');\n");
        code.push_str("      }\n");
        code.push_str("    }\n");
        code.push_str("    return Promise.resolve('1\\nno request');\n");
        code.push_str("  };\n");
        code.push_str("  var host_http_reply_ex = (lib, param) => {\n");
        code.push_str(
            "    var p1 = param.indexOf('\\n'); var id = p1 === -1 ? param : param.slice(0, p1);\n",
        );
        code.push_str("    var rest = p1 === -1 ? '' : param.slice(p1 + 1);\n");
        code.push_str("    var p2 = rest.indexOf('\\n'); var status = Number(p2 === -1 ? rest : rest.slice(0, p2)) || 200;\n");
        code.push_str("    var rest2 = p2 === -1 ? '' : rest.slice(p2 + 1);\n");
        code.push_str("    var p3 = rest2.indexOf('\\n'); var ctype = p3 === -1 ? rest2 : rest2.slice(0, p3);\n");
        code.push_str("    var body = p3 === -1 ? '' : rest2.slice(p3 + 1);\n");
        code.push_str("    if (!ctype) ctype = 'text/plain; charset=utf-8';\n");
        code.push_str("    var payload = host_http_payload(ctype, body);\n");
        code.push_str("    for (var p in HOST_HTTP_SRV) {\n");
        code.push_str("      var r = HOST_HTTP_SRV[p].replies[id];\n");
        code.push_str("      if (r) {\n");
        code.push_str("        if (typeof r === 'function') { r(new Response(payload, {status: status, headers: {'Content-Type': ctype}})); delete HOST_HTTP_SRV[p].replies[id]; return Promise.resolve('0\\n'); }\n");
        code.push_str("        r.statusCode = status; r.setHeader('Content-Type', ctype); r.end(payload); delete HOST_HTTP_SRV[p].replies[id]; return Promise.resolve('0\\n');\n");
        code.push_str("      }\n");
        code.push_str("    }\n");
        code.push_str("    return Promise.resolve('1\\nno request');\n");
        code.push_str("  };\n");
        code.push_str("  var host_http_stop = (lib, param) => {\n");
        code.push_str("    var port = Number(param) || 0; var srv = HOST_HTTP_SRV[port];\n");
        code.push_str("    if (!srv) return Promise.resolve('0\\n');\n");
        code.push_str("    if (srv.bun) { try { srv.server.stop(); } catch (e) {} delete HOST_HTTP_SRV[port]; return Promise.resolve('0\\n'); }\n");
        code.push_str("    return new Promise((res) => { srv.server.close(() => { delete HOST_HTTP_SRV[port]; res('0\\n'); }); });\n");
        code.push_str("  };\n");
        code.push_str("  var sse_drop = (bus, id) => {\n");
        code.push_str("    var b = HOST_SSE[bus]; if (!b) return;\n");
        code.push_str("    var c = b[id]; if (!c) return;\n");
        code.push_str("    try {\n");
        code.push_str(
            "      if (c.kind === 'node' && c.res) { try { c.res.end(); } catch (e0) {} }\n",
        );
        code.push_str("      if (c.kind === 'bun' && c.controller) { try { c.controller.close(); } catch (e1) {} }\n");
        code.push_str("    } catch (e2) {}\n");
        code.push_str("    delete b[id];\n");
        code.push_str("    if (!Object.keys(b).length) delete HOST_SSE[bus];\n");
        code.push_str("  };\n");
        code.push_str("  var sse_find_reply = (id) => {\n");
        code.push_str("    for (var p in HOST_HTTP_SRV) {\n");
        code.push_str("      var r = HOST_HTTP_SRV[p].replies[id];\n");
        code.push_str("      if (r) return { port: p, rec: r, srv: HOST_HTTP_SRV[p] };\n");
        code.push_str("    }\n");
        code.push_str("    return null;\n");
        code.push_str("  };\n");
        code.push_str("  var host_sse_open = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var p = String(param == null ? '' : param);\n");
        code.push_str("      var nl = p.indexOf('\\n');\n");
        code.push_str("      var id = nl < 0 ? p : p.slice(0, nl);\n");
        code.push_str("      var bus = nl < 0 ? '' : p.slice(nl + 1);\n");
        code.push_str(
            "      if (!id || id.indexOf('\\n') >= 0) return Promise.resolve('1\\nempty_id');\n",
        );
        code.push_str("      if (!bus || bus.indexOf('\\n') >= 0 || bus.indexOf('\\0') >= 0) return Promise.resolve('1\\nempty_bus');\n");
        code.push_str("      var found = sse_find_reply(id);\n");
        code.push_str("      if (!found) return Promise.resolve('1\\nmissing');\n");
        code.push_str("      if (!HOST_SSE[bus]) HOST_SSE[bus] = Object.create(null);\n");
        code.push_str("      var hdrs = {'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive'};\n");
        code.push_str("      var r = found.rec;\n");
        code.push_str("      delete found.srv.replies[id];\n");
        code.push_str("      if (typeof r === 'function') {\n");
        code.push_str("        var enc = new TextEncoder();\n");
        code.push_str("        var stream = new ReadableStream({\n");
        code.push_str("          start: function(controller) {\n");
        code.push_str("            HOST_SSE[bus][id] = {kind: 'bun', controller: controller, encoder: enc};\n");
        code.push_str(
            "            try { controller.enqueue(enc.encode(':ok\\n\\n')); } catch (e3) {}\n",
        );
        code.push_str("          },\n");
        code.push_str("          cancel: function() { sse_drop(bus, id); }\n");
        code.push_str("        });\n");
        code.push_str("        r(new Response(stream, {status: 200, headers: hdrs}));\n");
        code.push_str("        return Promise.resolve('0\\n');\n");
        code.push_str("      }\n");
        code.push_str("      r.statusCode = 200;\n");
        code.push_str("      r.setHeader('Content-Type', hdrs['Content-Type']);\n");
        code.push_str("      r.setHeader('Cache-Control', hdrs['Cache-Control']);\n");
        code.push_str("      r.setHeader('Connection', hdrs['Connection']);\n");
        code.push_str("      r.write(':ok\\n\\n');\n");
        code.push_str("      HOST_SSE[bus][id] = {kind: 'node', res: r};\n");
        code.push_str("      r.on('close', function() { sse_drop(bus, id); });\n");
        code.push_str("      r.on('error', function() { sse_drop(bus, id); });\n");
        code.push_str("      return Promise.resolve('0\\n');\n");
        code.push_str(
            "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n",
        );
        code.push_str("  };\n");
        code.push_str("  var host_sse_send = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var p = String(param == null ? '' : param);\n");
        code.push_str("      var nl = p.indexOf('\\n');\n");
        code.push_str("      var bus = nl < 0 ? p : p.slice(0, nl);\n");
        code.push_str("      var payload = nl < 0 ? '' : p.slice(nl + 1);\n");
        code.push_str("      if (!bus) return Promise.resolve('1\\nempty_bus');\n");
        code.push_str("      var b = HOST_SSE[bus] || Object.create(null);\n");
        code.push_str("      var n = 0;\n");
        code.push_str("      var ids = Object.keys(b);\n");
        code.push_str("      for (var i = 0; i < ids.length; i++) {\n");
        code.push_str("        var id = ids[i]; var c = b[id]; if (!c) continue;\n");
        code.push_str("        try {\n");
        code.push_str("          if (c.kind === 'node' && c.res) { if (payload) c.res.write(payload); n++; }\n");
        code.push_str("          else if (c.kind === 'bun' && c.controller && c.encoder) { if (payload) c.controller.enqueue(c.encoder.encode(payload)); n++; }\n");
        code.push_str("        } catch (e4) { sse_drop(bus, id); }\n");
        code.push_str("      }\n");
        code.push_str("      return Promise.resolve('0\\n' + String(n));\n");
        code.push_str(
            "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n",
        );
        code.push_str("  };\n");
        code.push_str("  var host_sse_close = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var id = String(param == null ? '' : param);\n");
        code.push_str("      if (!id) return Promise.resolve('1\\nempty_id');\n");
        code.push_str("      var buses = Object.keys(HOST_SSE);\n");
        code.push_str("      for (var i = 0; i < buses.length; i++) {\n");
        code.push_str(
            "        if (HOST_SSE[buses[i]] && HOST_SSE[buses[i]][id]) sse_drop(buses[i], id);\n",
        );
        code.push_str("      }\n");
        code.push_str("      return Promise.resolve('0\\n');\n");
        code.push_str(
            "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n",
        );
        code.push_str("  };\n");
        code.push_str("  var host_sse_count = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var bus = String(param == null ? '' : param);\n");
        code.push_str("      if (!bus) return Promise.resolve('1\\nempty_bus');\n");
        code.push_str("      var b = HOST_SSE[bus];\n");
        code.push_str(
            "      return Promise.resolve('0\\n' + String(b ? Object.keys(b).length : 0));\n",
        );
        code.push_str(
            "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n",
        );
        code.push_str("  };\n");
        code.push_str("  var host_http_reply_hdr = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var p = String(param == null ? '' : param);\n");
        code.push_str("      var i = p.indexOf('\\n'); var id = i < 0 ? p : p.slice(0, i); var rest = i < 0 ? '' : p.slice(i + 1);\n");
        code.push_str("      if (!id) return Promise.resolve('1\\nempty_id');\n");
        code.push_str("      var j = rest.indexOf('\\n'); var status = Number(j < 0 ? rest : rest.slice(0, j)) || 200; var rest2 = j < 0 ? '' : rest.slice(j + 1);\n");
        code.push_str("      var split = rest2.indexOf('\\n\\n'); var hdrs = split < 0 ? rest2 : rest2.slice(0, split); var body = split < 0 ? '' : rest2.slice(split + 2);\n");
        code.push_str("      var headers = {};\n");
        code.push_str("      var lines = hdrs.split('\\n');\n");
        code.push_str("      for (var hi = 0; hi < lines.length; hi++) {\n");
        code.push_str("        var line = lines[hi]; var c = line.indexOf(':');\n");
        code.push_str("        if (c <= 0) continue;\n");
        code.push_str("        var k = line.slice(0, c).replace(/^\\s+|\\s+$/g, ''); var v = line.slice(c + 1).replace(/^\\s+|\\s+$/g, '');\n");
        code.push_str("        if (k) headers[k] = v;\n");
        code.push_str("      }\n");
        code.push_str("      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'text/plain; charset=utf-8';\n");
        code.push_str("      var payload = host_http_payload(headers['Content-Type'] || headers['content-type'] || '', body);\n");
        code.push_str("      var found = sse_find_reply(id);\n");
        code.push_str("      if (!found) return Promise.resolve('1\\nmissing');\n");
        code.push_str("      var r = found.rec; delete found.srv.replies[id];\n");
        code.push_str("      if (typeof r === 'function') { r(new Response(payload, {status: status, headers: headers})); return Promise.resolve('0\\n'); }\n");
        code.push_str("      r.statusCode = status;\n");
        code.push_str("      var hk = Object.keys(headers);\n");
        code.push_str(
            "      for (var h = 0; h < hk.length; h++) r.setHeader(hk[h], headers[hk[h]]);\n",
        );
        code.push_str("      r.end(payload);\n");
        code.push_str("      return Promise.resolve('0\\n');\n");
        code.push_str(
            "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n",
        );
        code.push_str("  };\n");
    }
    if hneed.db {
        code.push_str("  var HOST_DB = {};\n");
        code.push_str(
            "  var db_ok = (m) => Promise.resolve('0\\n' + String(m == null ? '' : m));\n",
        );
        code.push_str(
            "  var db_err = (m) => Promise.resolve('1\\n' + String(m == null ? '' : m));\n",
        );
        code.push_str("  var db_safe_key = (k) => {\n");
        code.push_str("    if (!k) return 'empty key';\n");
        code.push_str(
            "    if (k.indexOf('\\n') >= 0 || k.indexOf('\\0') >= 0) return 'bad key';\n",
        );
        code.push_str("    return null;\n");
        code.push_str("  };\n");
        code.push_str("  var db_safe_file = (p) => {\n");
        code.push_str("    if (!p) return false;\n");
        code.push_str("    if (p.indexOf('..') >= 0 || p.charAt(0) === '/' || p.indexOf('\\\\') >= 0) return false;\n");
        code.push_str("    if (p.indexOf('\\0') >= 0) return false;\n");
        code.push_str("    return true;\n");
        code.push_str("  };\n");
        code.push_str("  var db_load_map = (j) => {\n");
        code.push_str("    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;\n");
        code.push_str("    var data = Object.create(null);\n");
        code.push_str("    var ks = Object.keys(j);\n");
        code.push_str("    for (var i = 0; i < ks.length; i++) {\n");
        code.push_str("      var k = ks[i];\n");
        code.push_str("      if (db_safe_key(k) || typeof j[k] !== 'string') return null;\n");
        code.push_str("      data[k] = j[k];\n");
        code.push_str("    }\n");
        code.push_str("    return data;\n");
        code.push_str("  };\n");
        code.push_str("  var db_persist = (lib, store) => {\n");
        code.push_str("    if (!store || store.kind !== 'file') return true;\n");
        code.push_str("    var tmp = store.path + '.tmp';\n");
        code.push_str("    try {\n");
        code.push_str(
            "      lib.fs.writeFileSync(tmp, JSON.stringify(store.data || Object.create(null)));\n",
        );
        code.push_str("      lib.fs.renameSync(tmp, store.path);\n");
        code.push_str("      return true;\n");
        code.push_str("    } catch (e) {\n");
        code.push_str("      try { lib.fs.unlinkSync(tmp); } catch (e2) {}\n");
        code.push_str("      store.last_err = String(e && e.message || e);\n");
        code.push_str("      return false;\n");
        code.push_str("    }\n");
        code.push_str("  };\n");
        code.push_str("  var db_split1 = (param) => {\n");
        code.push_str("    var p = String(param || ''); var nl = p.indexOf('\\n');\n");
        code.push_str("    return nl === -1 ? { id: p, rest: '' } : { id: p.slice(0, nl), rest: p.slice(nl + 1) };\n");
        code.push_str("  };\n");
        code.push_str("  var db_store = (id) => {\n");
        code.push_str("    var store = HOST_DB[id];\n");
        code.push_str("    if (!store || store.closed || !store.data) return null;\n");
        code.push_str("    return store;\n");
        code.push_str("  };\n");
        code.push_str("  var host_db_connect = (lib, param) => {\n");
        code.push_str("    var url = String(param || '');\n");
        code.push_str("    if (!url) return db_err('empty url');\n");
        code.push_str("    if (url.indexOf('suremem:') === 0) {\n");
        code.push_str("      if (!HOST_DB[url] || HOST_DB[url].kind !== 'mem') HOST_DB[url] = { kind: 'mem', data: Object.create(null) };\n");
        code.push_str("      HOST_DB[url].closed = false;\n");
        code.push_str("      return db_ok(url);\n");
        code.push_str("    }\n");
        code.push_str("    if (url.indexOf('surefile:') === 0) {\n");
        code.push_str("      var fpath = url.slice(9);\n");
        code.push_str("      if (!db_safe_file(fpath)) return db_err('bad db url');\n");
        code.push_str("      try {\n");
        code.push_str("        if (lib.fs.existsSync(fpath)) {\n");
        code.push_str("          var st = lib.fs.statSync(fpath);\n");
        code.push_str("          if (!st.isFile()) return db_err('bad db file');\n");
        code.push_str("          var t = lib.fs.readFileSync(fpath, 'utf8');\n");
        code.push_str("          var data = db_load_map(JSON.parse(t));\n");
        code.push_str("          if (!data) return db_err('bad db file');\n");
        code.push_str("          HOST_DB[url] = { kind: 'file', path: fpath, data: data };\n");
        code.push_str("          return db_ok(url);\n");
        code.push_str("        }\n");
        code.push_str("      } catch (e) { return db_err('bad db file'); }\n");
        code.push_str(
            "      HOST_DB[url] = { kind: 'file', path: fpath, data: Object.create(null) };\n",
        );
        code.push_str("      return db_ok(url);\n");
        code.push_str("    }\n");
        code.push_str("    return db_err('bad db url');\n");
        code.push_str("  };\n");
        code.push_str("  var host_db_get = (lib, param) => {\n");
        code.push_str("    var s = db_split1(param); var bad = db_safe_key(s.rest); if (bad) return db_err(bad);\n");
        code.push_str("    var store = db_store(s.id); if (!store) return db_err('closed');\n");
        code.push_str("    if (!Object.prototype.hasOwnProperty.call(store.data, s.rest)) return db_err('missing');\n");
        code.push_str("    return db_ok(String(store.data[s.rest]));\n");
        code.push_str("  };\n");
        code.push_str("  var host_db_set = (lib, param) => {\n");
        code.push_str("    var s = db_split1(param); var nl2 = s.rest.indexOf('\\n');\n");
        code.push_str("    var key = nl2 === -1 ? s.rest : s.rest.slice(0, nl2); var val = nl2 === -1 ? '' : s.rest.slice(nl2 + 1);\n");
        code.push_str("    var bad = db_safe_key(key); if (bad) return db_err(bad);\n");
        code.push_str("    var store = db_store(s.id); if (!store) return db_err('closed');\n");
        code.push_str("    store.data[key] = String(val);\n");
        code.push_str(
            "    if (!db_persist(lib, store)) return db_err(store.last_err || 'persist');\n",
        );
        code.push_str("    return db_ok('');\n");
        code.push_str("  };\n");
        code.push_str("  var host_db_del = (lib, param) => {\n");
        code.push_str("    var s = db_split1(param); var bad = db_safe_key(s.rest); if (bad) return db_err(bad);\n");
        code.push_str("    var store = db_store(s.id); if (!store) return db_err('closed');\n");
        code.push_str("    if (!Object.prototype.hasOwnProperty.call(store.data, s.rest)) return db_err('missing');\n");
        code.push_str("    delete store.data[s.rest];\n");
        code.push_str(
            "    if (!db_persist(lib, store)) return db_err(store.last_err || 'persist');\n",
        );
        code.push_str("    return db_ok('');\n");
        code.push_str("  };\n");
        code.push_str("  var host_db_has = (lib, param) => {\n");
        code.push_str("    var s = db_split1(param); var bad = db_safe_key(s.rest); if (bad) return db_err(bad);\n");
        code.push_str("    var store = db_store(s.id); if (!store) return db_err('closed');\n");
        code.push_str("    return db_ok(Object.prototype.hasOwnProperty.call(store.data, s.rest) ? '1' : '0');\n");
        code.push_str("  };\n");
        code.push_str("  var host_db_keys = (lib, param) => {\n");
        code.push_str(
            "    var store = db_store(String(param || '')); if (!store) return db_err('closed');\n",
        );
        code.push_str("    return db_ok(JSON.stringify(Object.keys(store.data)));\n");
        code.push_str("  };\n");
        code.push_str("  var host_db_clear = (lib, param) => {\n");
        code.push_str(
            "    var store = db_store(String(param || '')); if (!store) return db_err('closed');\n",
        );
        code.push_str("    store.data = Object.create(null);\n");
        code.push_str(
            "    if (!db_persist(lib, store)) return db_err(store.last_err || 'persist');\n",
        );
        code.push_str("    return db_ok('');\n");
        code.push_str("  };\n");
        code.push_str("  var host_db_query = async (lib, param) => {\n");
        code.push_str("    var s = db_split1(param); var t = String(s.rest || '').replace(/^\\s+|\\s+$/g, '');\n");
        code.push_str("    if (!t) return '1\\nbad query';\n");
        code.push_str("    if (t === 'KEYS') return host_db_keys(lib, s.id);\n");
        code.push_str("    if (t === 'CLEAR') return host_db_clear(lib, s.id);\n");
        code.push_str("    if (t.indexOf('GET ') === 0) return host_db_get(lib, s.id + '\\n' + t.slice(4).replace(/^\\s+|\\s+$/g, ''));\n");
        code.push_str("    if (t.indexOf('DEL ') === 0) return host_db_del(lib, s.id + '\\n' + t.slice(4).replace(/^\\s+|\\s+$/g, ''));\n");
        code.push_str("    if (t.indexOf('HAS ') === 0) return host_db_has(lib, s.id + '\\n' + t.slice(4).replace(/^\\s+|\\s+$/g, ''));\n");
        code.push_str("    if (t.indexOf('SET ') === 0) {\n");
        code.push_str(
            "      var rest = t.slice(4).replace(/^\\s+/, ''); var sp = rest.indexOf(' ');\n",
        );
        code.push_str("      var k = sp === -1 ? rest : rest.slice(0, sp); var v = sp === -1 ? '' : rest.slice(sp + 1);\n");
        code.push_str("      return host_db_set(lib, s.id + '\\n' + k + '\\n' + v);\n");
        code.push_str("    }\n");
        code.push_str("    return '1\\nbad query';\n");
        code.push_str("  };\n");
        code.push_str("  var host_db_close = (lib, param) => {\n");
        code.push_str("    var store = HOST_DB[String(param || '')];\n");
        code.push_str("    if (store) {\n");
        code.push_str("      if (store.kind === 'file') db_persist(lib, store);\n");
        code.push_str("      store.closed = true;\n");
        code.push_str("    }\n");
        code.push_str("    return Promise.resolve('0\\n');\n");
        code.push_str("  };\n");
    }
    if hneed.proc {
        code.push_str(&joined_export_lines(HOST_PACK_JS));
        code.push_str("  var host_proc_run = (lib, param) => {\n");
        code.push_str("    return new Promise((res) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var spec = host_parse_argv(param);\n");
        code.push_str("        if (spec.error) { res(host_err(spec.error)); return; }\n");
        code.push_str("        if (!spec.file) { res(host_err('empty_name')); return; }\n");
        code.push_str("        var child = require('child_process').spawn(spec.file, spec.args, {cwd: spec.cwd || undefined, env: spec.env, shell: false, timeout: 8000, stdio: ['ignore', 'pipe', 'pipe']});\n");
        code.push_str("        var out = ''; var done = false;\n");
        code.push_str(
            "        if (child.stdout) child.stdout.on('data', function(d) { out += d; });\n",
        );
        code.push_str("        var finish = function(code, err) {\n");
        code.push_str("          if (done) return; done = true;\n");
        code.push_str("          if (err) res(host_err(err));\n");
        code.push_str(
            "          else res(host_ok(String(code == null ? 1 : code) + '\\n' + out));\n",
        );
        code.push_str("        };\n");
        code.push_str(
            "        child.on('error', function(e) { finish(1, String(e && e.message || e)); });\n",
        );
        code.push_str("        child.on('close', function(c) { finish(c, null); });\n");
        code.push_str("        var ac = lib && lib.abort;\n");
        code.push_str("        if (ac && ac.signal) {\n");
        code.push_str("          var kill = function() { try { child.kill('SIGTERM'); } catch (eK) {} finish(1, 'cancelled'); };\n");
        code.push_str("          if (ac.signal.aborted) kill();\n");
        code.push_str("          else ac.signal.addEventListener('abort', kill, {once: true});\n");
        code.push_str("        }\n");
        code.push_str("      } catch (e) { res(host_err(String(e && e.message || e))); }\n");
        code.push_str("    });\n");
        code.push_str("  };\n");
        code.push_str("  var host_proc_unsafe_shell = (lib, param) => {\n");
        code.push_str("    return new Promise((res) => {\n");
        code.push_str("      try {\n");
        code.push_str("        require('child_process').exec(param, {timeout: 8000, maxBuffer: 1048576, encoding: 'utf8', shell: true}, (err, stdout) => {\n");
        code.push_str("          var code = 0;\n");
        code.push_str("          if (err && typeof err.code === 'number') code = err.code;\n");
        code.push_str("          else if (err) code = 1;\n");
        code.push_str("          res(host_ok(String(code) + '\\n' + String(stdout || '')));\n");
        code.push_str("        });\n");
        code.push_str("      } catch (e) { res(host_err(String(e && e.message || e))); }\n");
        code.push_str("    });\n");
        code.push_str("  };\n");
        code.push_str("  var host_proc_exec = host_proc_unsafe_shell;\n");
        code.push_str("  var HOST_PROCS = {};\n");
        code.push_str("  var host_proc_spawn_ex = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var spec = host_parse_argv(param);\n");
        code.push_str("      if (spec.error) return Promise.resolve(host_err(spec.error));\n");
        code.push_str("      if (!spec.file) return Promise.resolve(host_err('empty_name'));\n");
        code.push_str("      var child = require('child_process').spawn(spec.file, spec.args, {cwd: spec.cwd || undefined, env: spec.env, shell: false, stdio: 'ignore'});\n");
        code.push_str("      var rec = {child: child, code: null, done: null};\n");
        code.push_str("      rec.done = new Promise((res) => { child.on('exit', (c) => { rec.code = (c == null ? 1 : c); res(rec.code); }); });\n");
        code.push_str("      HOST_PROCS[String(child.pid)] = rec;\n");
        code.push_str("      return Promise.resolve(host_ok(String(child.pid)));\n");
        code.push_str(
            "    } catch (e) { return Promise.resolve(host_err(String(e && e.message || e))); }\n",
        );
        code.push_str("  };\n");
        code.push_str("  var host_proc_spawn = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var spec = host_parse_argv(param);\n");
        code.push_str("      if (spec.error) return Promise.resolve(host_err(spec.error));\n");
        code.push_str("      if (!spec.file) return Promise.resolve(host_err('empty_name'));\n");
        code.push_str("      var child = require('child_process').spawn(spec.file, spec.args, {cwd: spec.cwd || undefined, env: spec.env, shell: false, stdio: 'ignore'});\n");
        code.push_str("      var rec = {child: child, code: null, done: null};\n");
        code.push_str("      rec.done = new Promise((res) => { child.on('exit', (c) => { rec.code = (c == null ? 1 : c); res(rec.code); }); });\n");
        code.push_str("      HOST_PROCS[String(child.pid)] = rec;\n");
        code.push_str("      return Promise.resolve(host_ok(String(child.pid)));\n");
        code.push_str(
            "    } catch (e) { return Promise.resolve(host_err(String(e && e.message || e))); }\n",
        );
        code.push_str("  };\n");
        code.push_str("  var host_proc_kill = (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var nl = param.indexOf('\\n'); var pid = nl === -1 ? param : param.slice(0, nl); var sig = nl === -1 ? 'SIGTERM' : param.slice(nl + 1);\n");
        code.push_str("      process.kill(Number(pid), sig || 'SIGTERM');\n");
        code.push_str("      return Promise.resolve('0\\n');\n");
        code.push_str(
            "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n",
        );
        code.push_str("  };\n");
        code.push_str("  var host_proc_wait = async (lib, param) => {\n");
        code.push_str("    var rec = HOST_PROCS[param];\n");
        code.push_str("    if (!rec) return '1\\nno pid';\n");
        code.push_str("    return host_abortable(lib, function(finish) {\n");
        code.push_str("      rec.done.then(function(code) { finish('0\\n' + String(code)); });\n");
        code.push_str("    });\n");
        code.push_str("  };\n");
    }
    if hneed.job {
        code.push_str("  var host_job_start = (lib, spec) => {\n");
        code.push_str("    var nl = spec.indexOf('\\n'); var kind = nl === -1 ? spec : spec.slice(0, nl); var arg = nl === -1 ? '' : spec.slice(nl + 1);\n");
        code.push_str("    var id = String(++HOST_JOB_N); var ctrl = {}; var p;\n");
        code.push_str("    if (kind === 'sleep') { p = new Promise((res) => { var t = setTimeout(() => res('0\\n'), Number(arg) || 0); ctrl.cancel = () => { clearTimeout(t); res('1\\ncancelled'); }; }); }\n");
        code.push_str(
            "    else if (kind === 'http') { p = host_http(lib, arg); ctrl.cancel = () => {}; }\n",
        );
        code.push_str("    else if (kind === 'yield') { p = Promise.resolve('0\\n'); ctrl.cancel = () => {}; }\n");
        code.push_str("    else { p = Promise.resolve('1\\nbad job'); ctrl.cancel = () => {}; }\n");
        code.push_str("    HOST_JOBS[id] = { promise: p, ctrl: ctrl }; return id;\n");
        code.push_str("  };\n");
    }
    if hneed.http {
        code.push_str("  var request = (lib, param) => {\n");
        code.push_str("    if (/raw\\.githubusercontent\\.com\\/(HigherOrderCO|Kindelia)\\/Kind/i.test(param) &&\n");
        code.push_str("        !(typeof process !== 'undefined' && process.env && (process.env.SURE_FETCH_BASE === '1' || process.env.KIND_FETCH_BASE === '1'))) {\n");
        code.push_str("      return Promise.resolve('');\n");
        code.push_str("    }\n");
        code.push_str("    var ac = lib && lib.abort;\n");
        code.push_str("    if (typeof fetch === 'undefined') {\n");
        code.push_str("      return host_abortable(lib, function(finish) {\n");
        code.push_str("        var req = (/^https/.test(param)?lib.hs:lib.ht).get(param, r => {\n");
        code.push_str("          let data = '';\n");
        code.push_str("          r.on('data', chunk => { data += chunk; });\n");
        code.push_str("          r.on('end', () => finish(data));\n");
        code.push_str("        });\n");
        code.push_str("        req.on('error', e => finish(''));\n");
        code.push_str(
            "        host_on_abort(lib, function() { try { req.destroy(); } catch (eD) {} });\n",
        );
        code.push_str("      });\n");
        code.push_str("    } else {\n");
        code.push_str("      var opts = {};\n");
        code.push_str("      if (ac && ac.signal) opts.signal = ac.signal;\n");
        code.push_str("      return fetch(param, opts).then(res => res.text()).catch(e => '');\n");
        code.push_str("    }\n");
        code.push_str("  }\n");
    }
    if hneed.udp {
        code.push_str("  let PORTS = {};\n");
        code.push_str("  function init_udp(lib, port_num) {\n");
        code.push_str("    return new Promise((resolve, reject) => {\n");
        code.push_str("      if (!PORTS[port_num]) {\n");
        code.push_str(
            "        PORTS[port_num] = {socket: lib.dg.createSocket('udp4'), mailbox: []};\n",
        );
        code.push_str("        PORTS[port_num].socket.bind(port_num);\n");
        code.push_str(
            "        PORTS[port_num].socket.on('listening', () => resolve(PORTS[port_num]));\n",
        );
        code.push_str("        PORTS[port_num].socket.on('message', (data, peer) => {\n");
        code.push_str("          var ip = peer.address;\n");
        code.push_str("          var port = peer.port;\n");
        code.push_str("          PORTS[port_num].mailbox.push({ip: peer.address, port: peer.port, data: data.toString('hex')});\n");
        code.push_str("        })\n");
        code.push_str("        PORTS[port_num].socket.on('error', (err) => {\n");
        code.push_str("          console.log('err');\n");
        code.push_str("          reject('UDP init error.');\n");
        code.push_str("        });\n");
        code.push_str("      } else {\n");
        code.push_str("        resolve(PORTS[port_num]);\n");
        code.push_str("      }\n");
        code.push_str("    });\n");
        code.push_str("  }\n");
        code.push_str("  async function send_udp(lib, port_num, to_ip, to_port_num, data) {\n");
        code.push_str("    var port = await init_udp(lib, port_num);\n");
        code.push_str("    var buf = Buffer.from(data || '', 'hex');\n");
        code.push_str("    await new Promise((res, rej) => {\n");
        code.push_str(
            "      port.socket.send(buf, to_port_num, to_ip, (err) => err ? rej(err) : res());\n",
        );
        code.push_str("    });\n");
        code.push_str("    return null;\n");
        code.push_str("  }\n");
        code.push_str("  async function recv_udp(lib, port_num) {\n");
        code.push_str("    var port = await init_udp(lib, port_num);\n");
        code.push_str("    var mailbox = port.mailbox;\n");
        code.push_str("    port.mailbox = [];\n");
        code.push_str("    return mailbox;\n");
        code.push_str("  }\n");
        code.push_str("  async function stop_udp(lib, port_num) {\n");
        code.push_str("    var p = PORTS[port_num];\n");
        code.push_str("    if (!p) return;\n");
        code.push_str("    await new Promise((res) => { try { p.socket.close(() => res()); } catch (e) { res(); } });\n");
        code.push_str("    delete PORTS[port_num];\n");
        code.push_str("  }\n");
    }
    if hneed.file {
        code.push_str("  var file_error = e => {\n");
        code.push_str("    return host_err((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e));\n");
        code.push_str("  };\n");
    }
    if hneed.ffi {
        code.push_str("  var host_ffi = async (lib, param) => {\n");
        code.push_str("    var p = String(param == null ? '' : param);\n");
        code.push_str("    var nl = p.indexOf('\\n');\n");
        code.push_str("    var name = nl < 0 ? p : p.slice(0, nl);\n");
        code.push_str("    var body = nl < 0 ? '' : p.slice(nl + 1);\n");
        code.push_str("    if (!name) return '1\\nempty_name';\n");
        code.push_str("    if (/[\\n\\/\\\\]/.test(name) || name.indexOf('..') >= 0) return '1\\nbad_name';\n");
        code.push_str(
            "    if (!/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(name)) return '1\\nbad_name';\n",
        );
        code.push_str("    var g = (typeof globalThis !== 'undefined') ? globalThis : {};\n");
        code.push_str("    if (!g.SURE_FFI) g.SURE_FFI = {};\n");
        code.push_str("    if (typeof g.SURE_FFI['Sure.ffi.add'] !== 'function') {\n");
        code.push_str("      g.SURE_FFI['Sure.ffi.add'] = function(a, b) { return Number(a) + Number(b); };\n");
        code.push_str("    }\n");
        code.push_str("    if (typeof g.SURE_FFI['Sure.ffi.boom'] !== 'function') {\n");
        code.push_str(
            "      g.SURE_FFI['Sure.ffi.boom'] = function() { throw new Error('boom'); };\n",
        );
        code.push_str("    }\n");
        code.push_str("    var fn = g.SURE_FFI[name];\n");
        code.push_str("    if (typeof fn !== 'function') {\n");
        code.push_str("      var cur = g; var parts = name.split('.'); var okp = true;\n");
        code.push_str("      for (var i = 0; i < parts.length; i++) {\n");
        code.push_str("        if (cur == null || (typeof cur !== 'object' && typeof cur !== 'function')) { okp = false; break; }\n");
        code.push_str("        cur = cur[parts[i]];\n");
        code.push_str("      }\n");
        code.push_str("      fn = okp && typeof cur === 'function' ? cur : null;\n");
        code.push_str("    }\n");
        code.push_str("    if (typeof fn !== 'function') return '1\\nmissing';\n");
        code.push_str("    var jsarg;\n");
        code.push_str("    if (body === '') jsarg = undefined;\n");
        code.push_str(
            "    else { try { jsarg = JSON.parse(body); } catch (e) { return '1\\nbad_json'; } }\n",
        );
        code.push_str("    try {\n");
        code.push_str("      var result = await Promise.resolve(Array.isArray(jsarg) ? fn.apply(null, jsarg) : (jsarg === undefined ? fn() : fn(jsarg)));\n");
        code.push_str("      var out;\n");
        code.push_str(
            "      try { out = JSON.stringify(result === undefined ? null : result); }\n",
        );
        code.push_str("      catch (e2) { return '1\\ndecode'; }\n");
        code.push_str("      if (typeof out !== 'string') return '1\\ndecode';\n");
        code.push_str("      return '0\\n' + out;\n");
        code.push_str(
            "    } catch (e3) { return '1\\nthrow\\n' + String(e3 && e3.message || e3); }\n",
        );
        code.push_str("  };\n");
    }
    if hneed.worker {
        code.push_str("  var host_worker_apply_src = [\n");
        code.push_str("    'function applyName(name, jsarg) {',\n");
        code.push_str("    '  var fn = null;',\n");
        code.push_str("    \"  if (name === 'Sure.ffi.add') fn = function(a,b){ return Number(a)+Number(b); };\",\n");
        code.push_str("    \"  else if (name === 'Sure.ffi.boom') fn = function(){ throw new Error('boom'); };\",\n");
        code.push_str("    \"  else if (name === 'Sure.worker.double') fn = function(a){ return Number(a)*2; };\",\n");
        code.push_str("    \"  else if (name.slice(0,5) === 'Math.') { var m = Math[name.slice(5)]; if (typeof m === 'function') fn = m.bind(Math); }\",\n");
        code.push_str("    \"  if (typeof fn !== 'function') return '1\\\\nmissing';\",\n");
        code.push_str("    '  var result = Array.isArray(jsarg) ? fn.apply(null, jsarg) : (jsarg === undefined ? fn() : fn(jsarg));',\n");
        code.push_str(
            "    \"  var out = JSON.stringify(result === undefined ? null : result);\",\n",
        );
        code.push_str("    \"  if (typeof out !== 'string') return '1\\\\ndecode';\",\n");
        code.push_str("    \"  return '0\\\\n' + out;\",\n");
        code.push_str("    '}'\n");
        code.push_str("  ].join('\\n');\n");
        code.push_str("  var host_worker_run = async (lib, param) => {\n");
        code.push_str("    try {\n");
        code.push_str("      var p = String(param == null ? '' : param);\n");
        code.push_str("      var nl = p.indexOf('\\n');\n");
        code.push_str("      var name = nl < 0 ? p : p.slice(0, nl);\n");
        code.push_str("      var body = nl < 0 ? '' : p.slice(nl + 1);\n");
        code.push_str("      if (!name) return '1\\nempty_name';\n");
        code.push_str("      if (/[\\n\\/\\\\]/.test(name) || name.indexOf('..') >= 0) return '1\\nbad_name';\n");
        code.push_str(
            "      if (!/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(name)) return '1\\nbad_name';\n",
        );
        code.push_str("      if (body !== '') { try { JSON.parse(body); } catch (e0) { return '1\\nbad_json'; } }\n");
        code.push_str("      var data = { name: name, body: body };\n");
        code.push_str("      if (typeof Bun !== 'undefined' && typeof Worker !== 'undefined') {\n");
        code.push_str("        var bunSrc = host_worker_apply_src + '\\nself.onmessage = function(ev) {\\n' +\n");
        code.push_str("          '  try {\\n' +\n");
        code.push_str("          '    var name = ev.data.name; var body = ev.data.body;\\n' +\n");
        code.push_str("          \"    var jsarg; if (body === '') jsarg = undefined; else jsarg = JSON.parse(body);\\n\" +\n");
        code.push_str("          '    self.postMessage(applyName(name, jsarg));\\n' +\n");
        code.push_str("          '  } catch (e) {\\n' +\n");
        code.push_str("          \"    if (e && e.name === 'SyntaxError') self.postMessage('1\\\\nbad_json');\\n\" +\n");
        code.push_str("          \"    else self.postMessage('1\\\\nthrow\\\\n' + String(e && e.message || e));\\n\" +\n");
        code.push_str("          '  }\\n' +\n");
        code.push_str("          '};\\n';\n");
        code.push_str(
            "        var blob = new Blob([bunSrc], { type: 'application/javascript' });\n",
        );
        code.push_str("        var url = URL.createObjectURL(blob);\n");
        code.push_str("        return await new Promise((resolve) => {\n");
        code.push_str("          var done = false;\n");
        code.push_str("          var w = new Worker(url);\n");
        code.push_str("          var finish = (s) => { if (!done) { done = true; try { w.terminate(); } catch (e1) {} try { URL.revokeObjectURL(url); } catch (e2) {} resolve(s); } };\n");
        code.push_str("          w.onmessage = (ev) => finish(String(ev.data));\n");
        code.push_str("          w.onerror = (err) => finish('1\\nthrow\\n' + String(err && err.message || err));\n");
        code.push_str("          try { w.postMessage(data); } catch (e3) { finish('1\\nthrow\\n' + String(e3 && e3.message || e3)); }\n");
        code.push_str("        });\n");
        code.push_str("      }\n");
        code.push_str("      var wt;\n");
        code.push_str("      try { wt = require('worker_threads'); } catch (e4) { return '1\\nno_thread'; }\n");
        code.push_str(
            "      if (!wt || typeof wt.Worker !== 'function') return '1\\nno_thread';\n",
        );
        code.push_str("      var nodeSrc = host_worker_apply_src + '\\n' +\n");
        code.push_str(
            "        \"const { parentPort, workerData } = require('worker_threads');\\n\" +\n",
        );
        code.push_str("        'try {\\n' +\n");
        code.push_str("        '  var name = workerData.name; var body = workerData.body;\\n' +\n");
        code.push_str("        \"  var jsarg; if (body === '') jsarg = undefined; else jsarg = JSON.parse(body);\\n\" +\n");
        code.push_str("        '  parentPort.postMessage(applyName(name, jsarg));\\n' +\n");
        code.push_str("        '} catch (e) {\\n' +\n");
        code.push_str("        \"  if (e && e.name === 'SyntaxError') parentPort.postMessage('1\\\\nbad_json');\\n\" +\n");
        code.push_str("        \"  else parentPort.postMessage('1\\\\nthrow\\\\n' + String(e && e.message || e));\\n\" +\n");
        code.push_str("        '}\\n';\n");
        code.push_str("      return await new Promise((resolve) => {\n");
        code.push_str("        var done = false;\n");
        code.push_str("        var w;\n");
        code.push_str("        var finish = (s) => { if (!done) { done = true; try { if (w) w.terminate(); } catch (e5) {} resolve(s); } };\n");
        code.push_str("        try {\n");
        code.push_str("          w = new wt.Worker(nodeSrc, { eval: true, workerData: data });\n");
        code.push_str("        } catch (e6) { finish('1\\nno_thread'); return; }\n");
        code.push_str("        w.on('message', (msg) => finish(String(msg)));\n");
        code.push_str("        w.on('error', (err) => finish('1\\nthrow\\n' + String(err && err.message || err)));\n");
        code.push_str("        w.on('exit', (code) => { if (!done && code) finish('1\\nthrow\\nexit ' + String(code)); });\n");
        code.push_str("      });\n");
        code.push_str(
            "    } catch (e7) { return '1\\nthrow\\n' + String(e7 && e7.message || e7); }\n",
        );
        code.push_str("  };\n");
    }
    code.push_str("  var io_action = {\n");
    code.push_str("    print: async (lib, param) => {\n");
    code.push_str("      console.log(param);\n");
    code.push_str("      return host_ok('');\n");
    code.push_str("    },\n");
    code.push_str("    put_string: async (lib, param) => {\n");
    code.push_str("      process.stdout.write(param);\n");
    code.push_str("      return host_ok('');\n");
    code.push_str("    },\n");
    if hneed.file {
        code.push_str("    get_file: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        return get_file(lib, param);\n");
        code.push_str("      } catch (e) {\n");
        code.push_str("        return file_error(e);\n");
        code.push_str("      }\n");
        code.push_str("    },\n");
        code.push_str("    set_file: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        return set_file(lib, param)\n");
        code.push_str("      } catch (e) {\n");
        code.push_str("        return file_error(e);\n");
        code.push_str("      }\n");
        code.push_str("    },\n");
        code.push_str("    del_file: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        return del_file(lib, param);\n");
        code.push_str("      } catch (e) {\n");
        code.push_str("        return file_error(e);\n");
        code.push_str("      }\n");
        code.push_str("    },\n");
        code.push_str("    get_dir: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        return get_dir(lib, param);\n");
        code.push_str("      } catch (e) {\n");
        code.push_str("        return file_error(e);\n");
        code.push_str("      }\n");
        code.push_str("    },\n");
        code.push_str("    get_file_mtime: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        return get_file_mtime(lib, param);\n");
        code.push_str("      } catch (e) {\n");
        code.push_str("        return file_error(e);\n");
        code.push_str("      }\n");
        code.push_str("    },\n");
    }
    code.push_str("    get_time: async (lib, param) => {\n");
    code.push_str("      return host_ok(String(Date.now()));\n");
    code.push_str("    },\n");
    code.push_str("    exit: async (lib, param) => {\n");
    code.push_str("      var code = param === '' || param === undefined ? 0 : Number(param);\n");
    code.push_str("      if (!(code >= 0)) code = 1;\n");
    code.push_str("      lib.pc.exit(code);\n");
    code.push_str("      return host_ok('');\n");
    code.push_str("    },\n");
    if hneed.http {
        code.push_str("    request: async (lib, param) => {\n");
        code.push_str("      return request(lib, param);\n");
        code.push_str("    },\n");
    }
    code.push_str("    get_time: async (lib, param) => {\n");
    code.push_str("      return String(Date.now());\n");
    code.push_str("    },\n");
    code.push_str("    get_line: async (lib, param) => {\n");
    code.push_str("      return host_abortable(lib, function(finish) {\n");
    code.push_str("        lib.rl.question(param, function(line) { finish(host_ok(line)); });\n");
    code.push_str("      });\n");
    code.push_str("    },\n");
    code.push_str("    get_args: async (lib, param) => {\n");
    code.push_str("      return host_get_args(lib);\n");
    code.push_str("    },\n");
    code.push_str("    get_env: async (lib, param) => {\n");
    code.push_str("      try {\n");
    code.push_str("        var name = String(param == null ? '' : param);\n");
    code.push_str("        if (!name || name.indexOf('\\n') >= 0 || name.indexOf('=') >= 0) return '1\\nempty_name';\n");
    code.push_str(
        "        if (typeof process === 'undefined' || !process.env) return '1\\nmissing';\n",
    );
    code.push_str("        if (!Object.prototype.hasOwnProperty.call(process.env, name)) return '1\\nmissing';\n");
    code.push_str("        return '0\\n' + String(process.env[name]);\n");
    code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
    code.push_str("    },\n");
    code.push_str("    set_env: async (lib, param) => {\n");
    code.push_str("      try {\n");
    code.push_str("        var p = String(param == null ? '' : param);\n");
    code.push_str("        var nl = p.indexOf('\\n');\n");
    code.push_str("        var name = nl < 0 ? p : p.slice(0, nl);\n");
    code.push_str("        var val = nl < 0 ? '' : p.slice(nl + 1);\n");
    code.push_str("        if (!name || name.indexOf('=') >= 0) return '1\\nempty_name';\n");
    code.push_str(
        "        if (typeof process === 'undefined' || !process.env) return '1\\nmissing';\n",
    );
    code.push_str("        process.env[name] = val;\n");
    code.push_str("        return '0\\n';\n");
    code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
    code.push_str("    },\n");
    code.push_str("    del_env: async (lib, param) => {\n");
    code.push_str("      try {\n");
    code.push_str("        var name = String(param == null ? '' : param);\n");
    code.push_str("        if (!name || name.indexOf('\\n') >= 0 || name.indexOf('=') >= 0) return '1\\nempty_name';\n");
    code.push_str(
        "        if (typeof process === 'undefined' || !process.env) return '1\\nmissing';\n",
    );
    code.push_str("        delete process.env[name];\n");
    code.push_str("        return '0\\n';\n");
    code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
    code.push_str("    },\n");
    code.push_str("    env_keys: async (lib, param) => {\n");
    code.push_str("      try {\n");
    code.push_str("        if (typeof process === 'undefined' || !process.env) return '0\\n';\n");
    code.push_str("        var ks = Object.keys(process.env).filter(function(k) {\n");
    code.push_str("          return k && k.indexOf('\\n') < 0 && k.indexOf('=') < 0;\n");
    code.push_str("        });\n");
    code.push_str("        return '0\\n' + ks.join('\\n');\n");
    code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
    code.push_str("    },\n");
    code.push_str("    get_state: async (lib, param) => {\n");
    code.push_str("      return host_ok(Object.prototype.hasOwnProperty.call(HOST_STATE, param) ? HOST_STATE[param] : '');\n");
    code.push_str("    },\n");
    code.push_str("    set_state: async (lib, param) => {\n");
    code.push_str("      var nl = param.indexOf('\\n');\n");
    code.push_str("      if (nl === -1) { HOST_STATE[param] = ''; }\n");
    code.push_str("      else { HOST_STATE[param.slice(0, nl)] = param.slice(nl + 1); }\n");
    code.push_str("      return host_ok('');\n");
    code.push_str("    },\n");
    code.push_str("    get_random: async (lib, param) => {\n");
    code.push_str("      try {\n");
    code.push_str("        return host_ok(String(require('crypto').randomBytes(8).readUInt32BE(0) / 4294967296));\n");
    code.push_str("      } catch (e) {\n");
    code.push_str("        throw new Error('secure random unavailable');\n");
    code.push_str("      }\n");
    code.push_str("    },\n");
    if hneed.crypto {
        code.push_str("    sha256: async (lib, param) => {\n");
        code.push_str("      return host_ok(require('crypto').createHash('sha256').update(param, 'utf8').digest('hex'));\n");
        code.push_str("    },\n");
        code.push_str("    sha256_ex: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        return '0\\n' + require('crypto').createHash('sha256').update(param, 'utf8').digest('hex');\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
        code.push_str("    hmac_sha256: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var nl = String(param).indexOf('\\n');\n");
        code.push_str("        if (nl < 0) return '1\\nbad param';\n");
        code.push_str("        var key = param.slice(0, nl);\n");
        code.push_str("        var msg = param.slice(nl + 1);\n");
        code.push_str("        return '0\\n' + require('crypto').createHmac('sha256', key).update(msg, 'utf8').digest('hex');\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
    }
    if hneed.file {
        code.push_str("    file_hash: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var buf = lib.fs.readFileSync(param);\n");
        code.push_str("        return host_ok(require('crypto').createHash('sha256').update(buf).digest('hex'));\n");
        code.push_str("      } catch (e) {\n");
        code.push_str("        return host_err((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e));\n");
        code.push_str("      }\n");
        code.push_str("    },\n");
        code.push_str("    set_file2: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var nl = param.indexOf('\\n');\n");
        code.push_str("        var fpath = nl === -1 ? param : param.slice(0, nl);\n");
        code.push_str("        var data = nl === -1 ? '' : param.slice(nl + 1);\n");
        code.push_str("        lib.fs.mkdirSync(fpath.split('/').slice(0, -1).join('/'), {recursive: true});\n");
        code.push_str("        lib.fs.writeFileSync(fpath, data);\n");
        code.push_str("        return host_ok('');\n");
        code.push_str("      } catch (e) {\n");
        code.push_str("        return file_error(e);\n");
        code.push_str("      }\n");
        code.push_str("    },\n");
    }
    code.push_str("    cwd: async (lib, param) => {\n");
    code.push_str("      try { return host_ok(process.cwd()); } catch (e) { return host_err(String(e && e.message || e)); }\n");
    code.push_str("    },\n");
    if hneed.file {
        code.push_str("    fs_read_ex: async (lib, param) => {\n");
        code.push_str("      try { return '0\\n' + lib.fs.readFileSync(param, 'utf8'); }\n");
        code.push_str("      catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n");
        code.push_str("    },\n");
        code.push_str("    fs_write_ex: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var nl = param.indexOf('\\n');\n");
        code.push_str("        var fpath = nl === -1 ? param : param.slice(0, nl);\n");
        code.push_str("        var data = nl === -1 ? '' : param.slice(nl + 1);\n");
        code.push_str("        var dir = fpath.split('/').slice(0, -1).join('/');\n");
        code.push_str("        if (dir) lib.fs.mkdirSync(dir, {recursive: true});\n");
        code.push_str("        lib.fs.writeFileSync(fpath, data);\n");
        code.push_str("        return '0\\n';\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
        code.push_str("    fs_del_ex: async (lib, param) => {\n");
        code.push_str("      try { lib.fs.unlinkSync(param); return '0\\n'; }\n");
        code.push_str("      catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n");
        code.push_str("    },\n");
        code.push_str("    fs_open: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var fd = lib.fs.openSync(param, 'r');\n");
        code.push_str("        var id = String(++HOST_FD_N);\n");
        code.push_str("        HOST_FD[id] = {fd: fd, path: param};\n");
        code.push_str("        HOST_RES.push({kind: 'fd', id: id});\n");
        code.push_str("        return '0\\n' + id;\n");
        code.push_str("      } catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n");
        code.push_str("    },\n");
        code.push_str("    fs_read_fd: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var rec = HOST_FD[param]; if (!rec) return '1\\nclosed';\n");
        code.push_str("        var st = lib.fs.fstatSync(rec.fd);\n");
        code.push_str("        var buf = Buffer.alloc(st.size);\n");
        code.push_str("        lib.fs.readSync(rec.fd, buf, 0, buf.length, 0);\n");
        code.push_str("        return '0\\n' + buf.toString('utf8');\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
        code.push_str("    fs_close: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var rec = HOST_FD[param]; if (!rec) return '0\\n';\n");
        code.push_str("        lib.fs.closeSync(rec.fd); delete HOST_FD[param];\n");
        code.push_str("        HOST_RES = HOST_RES.filter(function(r) { return !(r.kind === 'fd' && r.id === param); });\n");
        code.push_str("        return '0\\n';\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
        code.push_str("    fs_temp_push: async (lib, param) => { HOST_RES.push({kind: 'temp', path: param}); return '0\\n'; },\n");
        code.push_str("    fs_temp_pop: async (lib, param) => {\n");
        code.push_str("      var path = param || '';\n");
        code.push_str("      HOST_RES = HOST_RES.filter(function(r) {\n");
        code.push_str("        if (r.kind === 'temp' && (!path || r.path === path)) {\n");
        code.push_str("          try { if (r.path) lib.fs.unlinkSync(r.path); } catch (eP) {}\n");
        code.push_str("          return false;\n");
        code.push_str("        }\n");
        code.push_str("        return true;\n");
        code.push_str("      });\n");
        code.push_str("      return '0\\n';\n");
        code.push_str("    },\n");
        code.push_str("    stream_open: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var fd = lib.fs.openSync(param, 'r');\n");
        code.push_str("        var id = String(++HOST_STREAM_N);\n");
        code.push_str("        HOST_STREAM[id] = {fd: fd, buf: '', done: false};\n");
        code.push_str("        HOST_RES.push({kind: 'stream', id: id});\n");
        code.push_str("        return '0\\n' + id;\n");
        code.push_str("      } catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n");
        code.push_str("    },\n");
        code.push_str("    stream_read: async (lib, param) => {\n");
        code.push_str("      var rec = HOST_STREAM[param]; if (!rec) return '1\\nclosed';\n");
        code.push_str("      if (rec.done) return '0\\n';\n");
        code.push_str("      var nl = rec.buf.indexOf('\\n');\n");
        code.push_str("      if (nl >= 0) { var line = rec.buf.slice(0, nl); rec.buf = rec.buf.slice(nl + 1); return '0\\n' + line; }\n");
        code.push_str("      var chunk = Buffer.alloc(4096);\n");
        code.push_str("      var n = lib.fs.readSync(rec.fd, chunk, 0, 4096, null);\n");
        code.push_str("      if (!n) { rec.done = true; var rest = rec.buf; rec.buf = ''; return rest ? ('0\\n' + rest) : '0\\n'; }\n");
        code.push_str("      rec.buf += chunk.slice(0, n).toString('utf8');\n");
        code.push_str("      nl = rec.buf.indexOf('\\n');\n");
        code.push_str("      if (nl >= 0) { var line2 = rec.buf.slice(0, nl); rec.buf = rec.buf.slice(nl + 1); return '0\\n' + line2; }\n");
        code.push_str("      return '0\\n' + rec.buf;\n");
        code.push_str("    },\n");
        code.push_str("    stream_close: async (lib, param) => {\n");
        code.push_str("      var rec = HOST_STREAM[param]; if (!rec) return '0\\n';\n");
        code.push_str("      try { lib.fs.closeSync(rec.fd); } catch (eC) {}\n");
        code.push_str("      delete HOST_STREAM[param];\n");
        code.push_str("      HOST_RES = HOST_RES.filter(function(r) { return !(r.kind === 'stream' && r.id === param); });\n");
        code.push_str("      return '0\\n';\n");
        code.push_str("    },\n");
    }
    if hneed.http {
        code.push_str("    http: async (lib, param) => { return host_http(lib, param); },\n");
    }
    if hneed.job {
        code.push_str("    job_start: async (lib, param) => host_job_start(lib, param),\n");
        code.push_str("    job_await: async (lib, param) => { var j = HOST_JOBS[param]; return j ? await j.promise : '1\\nno job'; },\n");
        code.push_str("    job_race: async (lib, param) => { var ids = param.split('\\n'); var a = HOST_JOBS[ids[0]], b = HOST_JOBS[ids[1]]; if (!a||!b) return '1'; return Promise.race([a.promise.then(()=> '0'), b.promise.then(()=> '1')]); },\n");
        code.push_str("    job_cancel: async (lib, param) => { var j = HOST_JOBS[param]; if (j && j.ctrl && j.ctrl.cancel) j.ctrl.cancel(); return host_ok(''); },\n");
    }
    if hneed.dns {
        code.push_str("    dns: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var host = String(param == null ? '' : param);\n");
        code.push_str("        if (!host || host.indexOf('\\n') >= 0) return '1\\nempty_name';\n");
        code.push_str("        var r = await require('dns').promises.lookup(host);\n");
        code.push_str("        return '0\\n' + r.address;\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
    }
    if hneed.tcp {
        code.push_str("    tcp_connect: async (lib, param) => host_tcp_connect(lib, param),\n");
        code.push_str("    tcp_send: async (lib, param) => host_tcp_send(lib, param),\n");
        code.push_str("    tcp_recv: async (lib, param) => host_tcp_recv(lib, param),\n");
        code.push_str("    tcp_close: async (lib, param) => { var s = HOST_TCP[param]; if (s && s.sock) s.sock.destroy(); delete HOST_TCP[param]; return '0\\n'; },\n");
    }
    if hneed.ws {
        code.push_str("    ws_connect: async (lib, param) => host_ws_connect(lib, param),\n");
        code.push_str("    ws_send: async (lib, param) => { var nl = param.indexOf('\\n'); return host_tcp_send(lib, param); },\n");
        code.push_str("    ws_recv: async (lib, param) => host_tcp_recv(lib, param),\n");
        code.push_str("    ws_close: async (lib, param) => {\n");
        code.push_str(
            "      var rec = (typeof HOST_TCP !== 'undefined') ? HOST_TCP[param] : null;\n",
        );
        code.push_str("      if (rec && rec.ws) {\n");
        code.push_str("        try { rec.sock.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); } catch (eC) {}\n");
        code.push_str("        try { rec.sock.end(); } catch (eE) {}\n");
        code.push_str("        delete HOST_TCP[param];\n");
        code.push_str("      }\n");
        code.push_str("      HOST_RES = HOST_RES.filter(function(r) { return !(r.kind === 'ws' && r.id === param); });\n");
        code.push_str("      return '0\\n';\n");
        code.push_str("    },\n");
    }
    if hneed.zlib {
        code.push_str("    gzip: async (lib, param) => { try { return '0\\n' + require('zlib').gzipSync(Buffer.from(param, 'utf8')).toString('hex'); } catch (e) { return '1\\n' + String(e && e.message || e); } },\n");
        code.push_str("    gunzip: async (lib, param) => { try { return '0\\n' + require('zlib').gunzipSync(Buffer.from(param, 'hex')).toString('utf8'); } catch (e) { return '1\\n' + String(e && e.message || e); } },\n");
    }
    if hneed.server {
        code.push_str("    http_listen: async (lib, param) => host_http_listen(lib, param),\n");
        code.push_str("    http_recv: async (lib, param) => host_http_recv(lib, param),\n");
        code.push_str("    http_reply: async (lib, param) => host_http_reply(lib, param),\n");
        code.push_str("    http_reply_ex: async (lib, param) => host_http_reply_ex(lib, param),\n");
        code.push_str("    http_stop: async (lib, param) => host_http_stop(lib, param),\n");
        code.push_str(
            "    http_reply_hdr: async (lib, param) => host_http_reply_hdr(lib, param),\n",
        );
    }
    if hneed.sse {
        code.push_str("    sse_open: async (lib, param) => host_sse_open(lib, param),\n");
        code.push_str("    sse_send: async (lib, param) => host_sse_send(lib, param),\n");
        code.push_str("    sse_close: async (lib, param) => host_sse_close(lib, param),\n");
        code.push_str("    sse_count: async (lib, param) => host_sse_count(lib, param),\n");
    }
    code.push_str(
        "    yield: async (lib, param) => { await Promise.resolve(); return host_ok(''); },\n",
    );
    if hneed.ffi {
        code.push_str("    ffi: async (lib, param) => host_ffi(lib, param),\n");
    }
    if hneed.worker {
        code.push_str("    worker_run: async (lib, param) => host_worker_run(lib, param),\n");
    }
    if hneed.job {
        code.push_str("    job_all: async (lib, param) => {\n");
        code.push_str("      var ids = String(param || '').split('\\n').filter(function(x) { return x.length; });\n");
        code.push_str("      var ps = ids.map(function(id) { return HOST_JOBS[id] ? HOST_JOBS[id].promise : Promise.resolve('1\\nno job'); });\n");
        code.push_str("      await Promise.all(ps); return '0\\n';\n");
        code.push_str("    },\n");
    }
    if hneed.proc {
        code.push_str("    proc_exec: async (lib, param) => host_proc_exec(lib, param),\n");
        code.push_str(
            "    proc_unsafe_shell: async (lib, param) => host_proc_unsafe_shell(lib, param),\n",
        );
        code.push_str("    proc_run: async (lib, param) => host_proc_run(lib, param),\n");
        code.push_str("    proc_spawn: async (lib, param) => host_proc_spawn(lib, param),\n");
        code.push_str("    proc_spawn_ex: async (lib, param) => host_proc_spawn_ex(lib, param),\n");
        code.push_str("    proc_kill: async (lib, param) => host_proc_kill(lib, param),\n");
        code.push_str("    proc_wait: async (lib, param) => host_proc_wait(lib, param),\n");
    }
    if hneed.file {
        code.push_str("    fs_read_hex: async (lib, param) => {\n");
        code.push_str("      try { return '0\\n' + Buffer.from(lib.fs.readFileSync(param)).toString('hex'); }\n");
        code.push_str("      catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n");
        code.push_str("    },\n");
        code.push_str("    fs_write_hex: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var nl = param.indexOf('\\n'); var fpath = nl === -1 ? param : param.slice(0, nl); var hex = nl === -1 ? '' : param.slice(nl + 1);\n");
        code.push_str("        var dir = fpath.split('/').slice(0, -1).join('/');\n");
        code.push_str("        if (dir) lib.fs.mkdirSync(dir, {recursive: true});\n");
        code.push_str("        lib.fs.writeFileSync(fpath, Buffer.from(hex, 'hex'));\n");
        code.push_str("        return '0\\n';\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
        code.push_str("    get_dir_ex: async (lib, param) => {\n");
        code.push_str("      try { return '0\\n' + lib.fs.readdirSync(param).join(';'); }\n");
        code.push_str("      catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n");
        code.push_str("    },\n");
    }
    if hneed.db {
        code.push_str("    db_connect: async (lib, param) => host_db_connect(lib, param),\n");
        code.push_str("    db_get: async (lib, param) => host_db_get(lib, param),\n");
        code.push_str("    db_set: async (lib, param) => host_db_set(lib, param),\n");
        code.push_str("    db_del: async (lib, param) => host_db_del(lib, param),\n");
        code.push_str("    db_has: async (lib, param) => host_db_has(lib, param),\n");
        code.push_str("    db_keys: async (lib, param) => host_db_keys(lib, param),\n");
        code.push_str("    db_clear: async (lib, param) => host_db_clear(lib, param),\n");
        code.push_str("    db_query: async (lib, param) => host_db_query(lib, param),\n");
        code.push_str("    db_close: async (lib, param) => host_db_close(lib, param),\n");
    }
    if hneed.udp {
        code.push_str("    init_udp: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        await init_udp(lib, Number(param));\n");
        code.push_str("        return host_ok('');\n");
        code.push_str("      } catch (e) {\n");
        code.push_str("        return host_err(String(e && e.message || e));\n");
        code.push_str("      }\n");
        code.push_str("    },\n");
        code.push_str("    send_udp: async (lib, param) => {\n");
        code.push_str("      let [port_num, to_ip, to_port_num, data] = param.split(';');\n");
        code.push_str(
            "      await send_udp(lib, Number(port_num), to_ip, Number(to_port_num), data);\n",
        );
        code.push_str("      return host_ok('');\n");
        code.push_str("    },\n");
        code.push_str("    recv_udp: async (lib, param) => {\n");
        code.push_str("      var mailbox = await recv_udp(lib, Number(param));\n");
        code.push_str(
            "      var reply = mailbox.map(x => x.ip + ',' + x.port + ',' + x.data).join(';');\n",
        );
        code.push_str("      return host_ok(reply);\n");
        code.push_str("    },\n");
        code.push_str("    stop_udp: async (lib, param) => {\n");
        code.push_str("      await stop_udp(lib, Number(param));\n");
        code.push_str("      return host_ok('');\n");
        code.push_str("    },\n");
        code.push_str("    udp_bind: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var n = Number(param);\n");
        code.push_str("        if (!lib.dg) return '1\\nbad host';\n");
        code.push_str(
            "        if (!Number.isFinite(n) || n < 0 || n > 65535) return '1\\nbad port';\n",
        );
        code.push_str("        await init_udp(lib, n);\n");
        code.push_str("        return '0\\n';\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
        code.push_str("    udp_send: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var parts = String(param).split('\\n');\n");
        code.push_str("        if (parts.length < 3) return '1\\nbad param';\n");
        code.push_str("        var from = Number(parts[0]); var ip = parts[1] || ''; var to = Number(parts[2]); var data = parts.slice(3).join('\\n');\n");
        code.push_str("        if (!ip) return '1\\nbad dest';\n");
        code.push_str("        if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || from > 65535 || to < 0 || to > 65535) return '1\\nbad port';\n");
        code.push_str("        if (!PORTS[from]) return '1\\nclosed';\n");
        code.push_str("        await send_udp(lib, from, ip, to, data);\n");
        code.push_str("        return '0\\n';\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
        code.push_str("    udp_recv: async (lib, param) => {\n");
        code.push_str("      try {\n");
        code.push_str("        var n = Number(param);\n");
        code.push_str(
            "        if (!Number.isFinite(n) || n < 0 || n > 65535) return '1\\nbad port';\n",
        );
        code.push_str("        if (!PORTS[n]) return '1\\nclosed';\n");
        code.push_str("        var mailbox = await recv_udp(lib, n);\n");
        code.push_str("        return '0\\n' + mailbox.map(x => x.ip + ',' + x.port + ',' + x.data).join(';');\n");
        code.push_str("      } catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
        code.push_str("    udp_close: async (lib, param) => {\n");
        code.push_str("      try { await stop_udp(lib, Number(param)); return '0\\n'; }\n");
        code.push_str("      catch (e) { return '1\\n' + String(e && e.message || e); }\n");
        code.push_str("    },\n");
    }
    code.push_str("    sleep: async (lib, param) => {\n");
    code.push_str("      var ac = lib && lib.abort;\n");
    code.push_str("      return await new Promise((resolve) => {\n");
    code.push_str("        var ms = Number(param);\n");
    code.push_str("        var t = setTimeout(function() { resolve(host_ok('')); }, Number.isFinite(ms) ? ms : 0);\n");
    code.push_str(
        "        var onAbort = function() { clearTimeout(t); resolve(host_err('cancelled')); };\n",
    );
    code.push_str("        if (ac && ac.signal) {\n");
    code.push_str("          if (ac.signal.aborted) { onAbort(); return; }\n");
    code.push_str("          ac.signal.addEventListener('abort', onAbort, {once: true});\n");
    code.push_str("        }\n");
    code.push_str("      });\n");
    code.push_str("    },\n");
    code.push_str("  };\n");
    code.push_str("  var run_io = async (lib, io, depth, ac) => {\n");
    code.push_str("    ac = ac || lib.abort || new AbortController();\n");
    code.push_str("    lib.abort = ac;\n");
    code.push_str("    try {\n");
    code.push_str("    if (ac.signal && ac.signal.aborted) throw new Error('cancelled');\n");
    code.push_str("    if (!io || !io._) throw new Error('empty IO');\n");
    code.push_str("    switch (io._) {\n");
    code.push_str("      case 'IO.end':\n");
    code.push_str("        return Promise.resolve(io.value);\n");
    code.push_str("      case 'IO.ask':\n");
    code.push_str("        var action = io_action[io.query];\n");
    code.push_str("        var answer;\n");
    code.push_str("        try {\n");
    code.push_str("          answer = action ? await action(lib, io.param) : '1\\nno action';\n");
    code.push_str("        } catch (e) {\n");
    code.push_str("          answer = '1\\n' + String(e && e.message || e);\n");
    code.push_str("        }\n");
    code.push_str("        if (answer == null) answer = '';\n");
    code.push_str("        try {\n");
    code.push_str("          var _sd = (typeof process !== 'undefined' && process.env && process.env.SURE_DEBUG) ? String(process.env.SURE_DEBUG) : '';\n");
    code.push_str("          var _so = (typeof process !== 'undefined' && process.env && process.env.SURE_DEBUG_OPT) ? String(process.env.SURE_DEBUG_OPT) : '';\n");
    code.push_str("          var _xs = String(_so).split(/[,\\s]+/).filter(Boolean);\n");
    code.push_str("          var _all = _xs.indexOf('all') >= 0;\n");
    code.push_str("          var _fh = _all || _xs.indexOf('host') >= 0;\n");
    code.push_str("          var _any = _fh || _xs.indexOf('term') >= 0 || _xs.indexOf('holes') >= 0 || _xs.indexOf('qc') >= 0;\n");
    code.push_str("          var _open = !_any || _fh;\n");
    code.push_str("          var _q = String(io.query || '');\n");
    code.push_str("          var _ask = false;\n");
    code.push_str("          if (_open) {\n");
    code.push_str("            if (_q === 'yield') _ask = _sd === 'trace';\n");
    code.push_str("            else _ask = _sd === 'info' || _sd === 'trace' || _fh;\n");
    code.push_str("          }\n");
    code.push_str("          if (_ask) {\n");
    code.push_str("            function _redact(s) {\n");
    code.push_str("              s = String(s == null ? '' : s);\n");
    code.push_str("              var nli = s.indexOf('\\n');\n");
    code.push_str("              var line = nli < 0 ? s : s.slice(0, nli);\n");
    code.push_str("              if (line.length > 80) return line.slice(0, 80) + '...';\n");
    code.push_str("              if (line.length < s.length) return line + '...';\n");
    code.push_str("              return line;\n");
    code.push_str("            }\n");
    code.push_str("            var _p = _redact(io.param == null ? '' : io.param);\n");
    code.push_str("            var _a = _redact(answer);\n");
    code.push_str("            console.error('sure debug ' + (_q ? ('host ' + _q + ' ' + _p + ' -> ' + _a) : ('host ? ' + _p + ' -> ' + _a)));\n");
    code.push_str("          }\n");
    code.push_str("        } catch (_de) {}\n");
    code.push_str(
        "        if (typeof io.then !== 'function') throw new Error('IO.ask missing then');\n",
    );
    code.push_str("        if (ac.signal && ac.signal.aborted) throw new Error('cancelled');\n");
    code.push_str("        if (depth > 64) return Promise.resolve().then(() => run_io(lib, io.then(answer), 0, ac));\n");
    code.push_str("        return await run_io(lib, io.then(answer), depth + 1, ac);\n");
    code.push_str("      case 'IO.par':\n");
    code.push_str("        try {\n");
    code.push_str("          var cL = new AbortController(); var cR = new AbortController();\n");
    code.push_str("          if (ac.signal) ac.signal.addEventListener('abort', function() { cL.abort(); cR.abort(); });\n");
    code.push_str("          var both = await Promise.all([run_io(Object.assign({}, lib, {abort: cL}), io.left, 0, cL), run_io(Object.assign({}, lib, {abort: cR}), io.right, 0, cR)]);\n");
    code.push_str(
        "          if (typeof io.join !== 'function') throw new Error('IO.par missing join');\n",
    );
    code.push_str("          return await run_io(lib, io.join({_: 'Pair.new', fst: both[0], snd: both[1]}), 0, ac);\n");
    code.push_str("        } catch (e) {\n");
    code.push_str("          host_release_all(lib); throw e;\n");
    code.push_str("        }\n");
    code.push_str("      case 'IO.race':\n");
    code.push_str("        try {\n");
    code.push_str("          var rL = new AbortController(); var rR = new AbortController();\n");
    code.push_str("          if (ac.signal) ac.signal.addEventListener('abort', function() { rL.abort(); rR.abort(); });\n");
    code.push_str("          var settle = function(p, side) {\n");
    code.push_str("            return p.then(function(v) { return {side: side, value: v}; }, function(e) { return {side: side, error: e}; });\n");
    code.push_str("          };\n");
    code.push_str("          var pL = settle(run_io(Object.assign({}, lib, {abort: rL}), io.left, 0, rL), 0);\n");
    code.push_str("          var pR = settle(run_io(Object.assign({}, lib, {abort: rR}), io.right, 0, rR), 1);\n");
    code.push_str("          var winner = await Promise.race([pL, pR]);\n");
    code.push_str("          if (winner.side === 0) rR.abort(); else rL.abort();\n");
    code.push_str("          await (winner.side === 0 ? pR : pL);\n");
    code.push_str("          if (winner.error) throw winner.error;\n");
    code.push_str(
        "          if (typeof io.join !== 'function') throw new Error('IO.race missing join');\n",
    );
    code.push_str("          var boxed = winner.side === 0\n");
    code.push_str("            ? {_:'Either.left', value: winner.value}\n");
    code.push_str("            : {_:'Either.right', value: winner.value};\n");
    code.push_str("          return await run_io(lib, io.join(boxed), 0, ac);\n");
    code.push_str("        } catch (e) {\n");
    code.push_str("          host_release_all(lib); throw e;\n");
    code.push_str("        }\n");
    code.push_str("      case 'IO.bracket':\n");
    code.push_str("        if (typeof io.use !== 'function' || typeof io.release !== 'function') throw new Error('IO.bracket missing use/release');\n");
    code.push_str("        var resource = await run_io(lib, io.acquire, 0, ac);\n");
    code.push_str("        var useErr = null; var useVal;\n");
    code.push_str("        try {\n");
    code.push_str("          useVal = await run_io(lib, io.use(resource), 0, ac);\n");
    code.push_str("        } catch (eUse) { useErr = eUse; }\n");
    code.push_str("        var relAc = new AbortController();\n");
    code.push_str("        var relLib = Object.assign({}, lib, {abort: relAc});\n");
    code.push_str("        try {\n");
    code.push_str("          await run_io(relLib, io.release(resource), 0, relAc);\n");
    code.push_str("        } catch (eRel) {\n");
    code.push_str("          if (!useErr) useErr = eRel;\n");
    code.push_str("        }\n");
    code.push_str("        if (useErr) throw useErr;\n");
    code.push_str("        return useVal;\n");
    code.push_str("      default:\n");
    code.push_str("        throw new Error('unknown IO ctor ' + (io && io._));\n");
    code.push_str("      }\n");
    code.push_str("    } catch (e) {\n");
    code.push_str("      host_release_all(lib); throw e;\n");
    code.push_str("    }\n");
    code.push_str("  };\n");
    code
}
