"use strict";
// One host protocol. Sure Host.encode and the JS runtime both come from `ops`.
var OPS = [
  {ctor:"put_string", query:"put_string", group:"core", param:"op.text"},
  {ctor:"get_line", query:"get_line", group:"core", param:"op.prompt"},
  {ctor:"get_args", query:"get_args", group:"core", param:"\"\""},
  {ctor:"cwd", query:"cwd", group:"core", param:"\"\""},
  {ctor:"time_now", query:"get_time", group:"core", param:"\"\""},
  {ctor:"sleep", query:"sleep", group:"core", param:"Nat.show(op.ms)"},
  {ctor:"yield", query:"yield", group:"core", param:"\"\""},
  {ctor:"exit", query:"exit", group:"core", param:"Nat.show(op.code)"},
  {ctor:"fs_read", query:"fs_read_ex", group:"file", param:"op.path"},
  {ctor:"fs_write", query:"fs_write_ex", group:"file", param:"op.path | \"\\n\" | op.body"},
  {ctor:"fs_del", query:"fs_del_ex", group:"file", param:"op.path"},
  {ctor:"fs_mtime", query:"get_file_mtime", group:"file", param:"op.path"},
  {ctor:"fs_dir", query:"get_dir_ex", group:"file", param:"op.path"},
  {ctor:"fs_read_hex", query:"fs_read_hex", group:"file", param:"op.path"},
  {ctor:"fs_write_hex", query:"fs_write_hex", group:"file", param:"op.path | \"\\n\" | op.hex"},
  {ctor:"file_hash", query:"file_hash", group:"file", param:"op.path"},
  {ctor:"env_get", query:"get_env", group:"core", param:"op.name"},
  {ctor:"env_set", query:"set_env", group:"core", param:"op.name | \"\\n\" | op.val"},
  {ctor:"env_del", query:"del_env", group:"core", param:"op.name"},
  {ctor:"env_keys", query:"env_keys", group:"core", param:"\"\""},
  {ctor:"random", query:"get_random", group:"core", param:"\"\""},
  {ctor:"sha256", query:"sha256_ex", group:"crypto", param:"op.text"},
  {ctor:"hmac", query:"hmac_sha256", group:"crypto", param:"op.key | \"\\n\" | op.msg"},
  {ctor:"http", query:"http", group:"http", param:"op.payload"},
  {ctor:"http_listen", query:"http_listen", group:"server", param:"Nat.show(op.port)"},
  {ctor:"http_recv", query:"http_recv", group:"server", param:"Nat.show(op.port)"},
  {ctor:"http_reply", query:"http_reply", group:"server", param:"op.id | \"\\n\" | Nat.show(op.status) | \"\\n\" | op.body"},
  {ctor:"http_reply_ex", query:"http_reply_ex", group:"server", param:"op.id | \"\\n\" | Nat.show(op.status) | \"\\n\" | op.ctype | \"\\n\" | op.body"},
  {ctor:"http_stop", query:"http_stop", group:"server", param:"Nat.show(op.port)"},
  {ctor:"dns", query:"dns", group:"dns", param:"op.host"},
  {ctor:"tcp_connect", query:"tcp_connect", group:"tcp", param:"op.host | \"\\n\" | Nat.show(op.port) | \"\\n\" | flag", prelude:"let flag = if op.tls then \"1\" else \"0\""},
  {ctor:"tcp_send", query:"tcp_send", group:"tcp", param:"op.id | \"\\n\" | op.data"},
  {ctor:"tcp_recv", query:"tcp_recv", group:"tcp", param:"op.id"},
  {ctor:"tcp_close", query:"tcp_close", group:"tcp", param:"op.id"},
  {ctor:"ws_connect", query:"ws_connect", group:"ws", param:"op.url"},
  {ctor:"udp_bind", query:"udp_bind", group:"udp", param:"Nat.show(op.port)"},
  {ctor:"udp_send", query:"udp_send", group:"udp", param:"Nat.show(op.from) | \"\\n\" | op.ip | \"\\n\" | Nat.show(op.to) | \"\\n\" | op.hex"},
  {ctor:"udp_recv", query:"udp_recv", group:"udp", param:"Nat.show(op.port)"},
  {ctor:"udp_close", query:"udp_close", group:"udp", param:"Nat.show(op.port)"},
  {ctor:"proc_exec", query:"proc_exec", group:"proc", param:"op.cmd"},
  {ctor:"proc_spawn", query:"proc_spawn", group:"proc", param:"op.cmd"},
  {ctor:"proc_run", query:"proc_run", group:"proc", param:"packed", prelude:"let packed = Proc.pack(op.file) | Proc.pack(op.workdir) | Proc.pack(op.environ) | op.args"},
  {ctor:"proc_spawn_ex", query:"proc_spawn_ex", group:"proc", param:"packed", prelude:"let packed = Proc.pack(op.file) | Proc.pack(op.workdir) | Proc.pack(op.environ) | op.args"},
  {ctor:"proc_unsafe_shell", query:"proc_unsafe_shell", group:"proc", param:"op.cmd"},
  {ctor:"proc_wait", query:"proc_wait", group:"proc", param:"Nat.show(op.pid)"},
  {ctor:"proc_kill", query:"proc_kill", group:"proc", param:"Nat.show(op.pid) | \"\\n\" | op.sig"},
  {ctor:"job_start", query:"job_start", group:"job", param:"op.spec"},
  {ctor:"job_await", query:"job_await", group:"job", param:"op.id"},
  {ctor:"job_cancel", query:"job_cancel", group:"job", param:"op.id"},
  {ctor:"job_all", query:"job_all", group:"job", param:"op.ids"},
  {ctor:"job_race", query:"job_race", group:"job", param:"op.ids"},
  {ctor:"gzip", query:"gzip", group:"zlib", param:"op.text"},
  {ctor:"gunzip", query:"gunzip", group:"zlib", param:"op.hex"},
  {ctor:"state_get", query:"get_state", group:"core", param:"op.key"},
  {ctor:"state_set", query:"set_state", group:"core", param:"op.key | \"\\n\" | op.val"},
  {ctor:"ffi", query:"ffi", group:"ffi", param:"op.name | \"\\n\" | op.json"},
  {ctor:"worker_run", query:"worker_run", group:"worker", param:"op.name | \"\\n\" | op.json"},
  {ctor:"sse_open", query:"sse_open", group:"sse", param:"op.id | \"\\n\" | op.bus"},
  {ctor:"sse_send", query:"sse_send", group:"sse", param:"op.bus | \"\\n\" | op.frame"},
  {ctor:"sse_close", query:"sse_close", group:"sse", param:"op.id"},
  {ctor:"sse_count", query:"sse_count", group:"sse", param:"op.bus"},
  {ctor:"db_connect", query:"db_connect", group:"db", param:"op.url"},
  {ctor:"db_set", query:"db_set", group:"db", param:"op.id | \"\\n\" | op.key | \"\\n\" | op.val"},
  {ctor:"db_del", query:"db_del", group:"db", param:"op.id | \"\\n\" | op.key"},
  {ctor:"db_query", query:"db_query", group:"db", param:"op.id | \"\\n\" | op.cmd"},
  {ctor:"db_keys", query:"db_keys", group:"db", param:"op.id"},
  {ctor:"db_clear", query:"db_clear", group:"db", param:"op.id"},
  {ctor:"db_close", query:"db_close", group:"db", param:"op.id"},
  {ctor:"fs_open", query:"fs_open", group:"file", param:"op.path"},
  {ctor:"fs_read_fd", query:"fs_read_fd", group:"file", param:"op.id"},
  {ctor:"fs_close", query:"fs_close", group:"file", param:"op.id"},
  {ctor:"fs_temp_push", query:"fs_temp_push", group:"file", param:"op.path"},
  {ctor:"fs_temp_pop", query:"fs_temp_pop", group:"file", param:"op.path"},
  {ctor:"stream_open", query:"stream_open", group:"file", param:"op.path"},
  {ctor:"stream_read", query:"stream_read", group:"file", param:"op.id"},
  {ctor:"stream_close", query:"stream_close", group:"file", param:"op.id"},
  {ctor:"ws_send", query:"ws_send", group:"ws", param:"op.id | \"\\n\" | op.data"},
  {ctor:"ws_recv", query:"ws_recv", group:"ws", param:"op.id"},
  {ctor:"ws_close", query:"ws_close", group:"ws", param:"op.id"}
];

function queries() {
  var q = {};
  for (var i = 0; i < OPS.length; i++) q[OPS[i].query] = OPS[i].group;
  q.print = "core";
  q.request = "http";
  q.get_file = "file";
  q.set_file = "file";
  q.del_file = "file";
  q.get_dir = "file";
  q.set_file2 = "file";
  q.sha256 = "crypto";
  q.job_all = "job";
  q.init_udp = "udp";
  q.send_udp = "udp";
  q.recv_udp = "udp";
  q.stop_udp = "udp";
  q.db_get = "db";
  q.db_has = "db";
  q.http_reply_hdr = "server";
  return q;
}

function encodeSure() {
  var lines = ["Host.encode(op: Host.Op): Pair<String, String>", "  case op {"];
  for (var i = 0; i < OPS.length; i++) {
    var op = OPS[i];
    if (op.prelude) {
      lines.push("    " + op.ctor + ":");
      lines.push("      " + op.prelude);
      lines.push("      Pair.new<String, String>(" + JSON.stringify(op.query) + ", " + op.param + ")");
    } else {
      lines.push("    " + op.ctor + ": Pair.new<String, String>(" + JSON.stringify(op.query) + ", " + op.param + ")");
    }
  }
  lines.push("  }");
  lines.push("");
  return lines.join("\n");
}

var REPLY = {
  ok: "0\\n",
  err: "1\\n",
  empty: ["", "empty_name"],
  missing: ["missing", "not found", "ENOENT"]
};

function decodeSure() {
  var emptyEq = REPLY.empty.map(function(t) {
    return "String.eql(m, " + JSON.stringify(t) + ")";
  }).filter(function(s) { return s !== "String.eql(m, \"\")"; });
  var missEq = REPLY.missing.map(function(t) {
    return "String.eql(m, " + JSON.stringify(t) + ")";
  });
  var lines = [
    "Host.decode(raw: String): Host.Event",
    "  if String.starts_with(raw, \"0\\n\") then",
    "    Host.ok_string(String.drop(2, raw))",
    "  else if String.starts_with(raw, \"1\\n\") then",
    "    let m = String.drop(2, raw)",
    "    if String.is_empty(m) then Host.err(Host.Err.empty)"
  ];
  emptyEq.forEach(function(eq) {
    lines.push("    else if " + eq + " then Host.err(Host.Err.empty)");
  });
  missEq.forEach(function(eq) {
    lines.push("    else if " + eq + " then Host.err(Host.Err.missing)");
  });
  lines.push("    else Host.err(Host.Err.io(m))");
  lines.push("  else if String.is_empty(raw) then");
  lines.push("    Host.err(Host.Err.empty)");
  lines.push("  else");
  lines.push("    Host.err(Host.Err.bad_tag)");
  lines.push("");
  return lines.join("\n");
}

module.exports = {
  ops: OPS,
  queries: queries(),
  reply: REPLY,
  encodeSure: encodeSure,
  decodeSure: decodeSure
};
