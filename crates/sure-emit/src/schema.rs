//! Host schema (`vendor/formcore-js/host-schema.js` `OPS` / `queries`).

/// One host op from `host-schema.js`.
#[derive(Clone, Copy, Debug)]
pub struct HostOp {
    pub ctor: &'static str,
    pub query: &'static str,
    pub group: &'static str,
}

/// Full `OPS` table from `host-schema.js`.
pub const OPS: &[HostOp] = &[
    HostOp {
        ctor: "put_string",
        query: "put_string",
        group: "core",
    },
    HostOp {
        ctor: "get_line",
        query: "get_line",
        group: "core",
    },
    HostOp {
        ctor: "get_args",
        query: "get_args",
        group: "core",
    },
    HostOp {
        ctor: "cwd",
        query: "cwd",
        group: "core",
    },
    HostOp {
        ctor: "time_now",
        query: "get_time",
        group: "core",
    },
    HostOp {
        ctor: "sleep",
        query: "sleep",
        group: "core",
    },
    HostOp {
        ctor: "yield",
        query: "yield",
        group: "core",
    },
    HostOp {
        ctor: "exit",
        query: "exit",
        group: "core",
    },
    HostOp {
        ctor: "fs_read",
        query: "fs_read_ex",
        group: "file",
    },
    HostOp {
        ctor: "fs_write",
        query: "fs_write_ex",
        group: "file",
    },
    HostOp {
        ctor: "fs_del",
        query: "fs_del_ex",
        group: "file",
    },
    HostOp {
        ctor: "fs_mtime",
        query: "get_file_mtime",
        group: "file",
    },
    HostOp {
        ctor: "fs_dir",
        query: "get_dir_ex",
        group: "file",
    },
    HostOp {
        ctor: "fs_read_hex",
        query: "fs_read_hex",
        group: "file",
    },
    HostOp {
        ctor: "fs_write_hex",
        query: "fs_write_hex",
        group: "file",
    },
    HostOp {
        ctor: "file_hash",
        query: "file_hash",
        group: "file",
    },
    HostOp {
        ctor: "env_get",
        query: "get_env",
        group: "core",
    },
    HostOp {
        ctor: "env_set",
        query: "set_env",
        group: "core",
    },
    HostOp {
        ctor: "env_del",
        query: "del_env",
        group: "core",
    },
    HostOp {
        ctor: "env_keys",
        query: "env_keys",
        group: "core",
    },
    HostOp {
        ctor: "random",
        query: "get_random",
        group: "core",
    },
    HostOp {
        ctor: "sha256",
        query: "sha256_ex",
        group: "crypto",
    },
    HostOp {
        ctor: "hmac",
        query: "hmac_sha256",
        group: "crypto",
    },
    HostOp {
        ctor: "http",
        query: "http",
        group: "http",
    },
    HostOp {
        ctor: "http_listen",
        query: "http_listen",
        group: "server",
    },
    HostOp {
        ctor: "http_recv",
        query: "http_recv",
        group: "server",
    },
    HostOp {
        ctor: "http_reply",
        query: "http_reply",
        group: "server",
    },
    HostOp {
        ctor: "http_reply_ex",
        query: "http_reply_ex",
        group: "server",
    },
    HostOp {
        ctor: "http_stop",
        query: "http_stop",
        group: "server",
    },
    HostOp {
        ctor: "dns",
        query: "dns",
        group: "dns",
    },
    HostOp {
        ctor: "tcp_connect",
        query: "tcp_connect",
        group: "tcp",
    },
    HostOp {
        ctor: "tcp_send",
        query: "tcp_send",
        group: "tcp",
    },
    HostOp {
        ctor: "tcp_recv",
        query: "tcp_recv",
        group: "tcp",
    },
    HostOp {
        ctor: "tcp_close",
        query: "tcp_close",
        group: "tcp",
    },
    HostOp {
        ctor: "ws_connect",
        query: "ws_connect",
        group: "ws",
    },
    HostOp {
        ctor: "udp_bind",
        query: "udp_bind",
        group: "udp",
    },
    HostOp {
        ctor: "udp_send",
        query: "udp_send",
        group: "udp",
    },
    HostOp {
        ctor: "udp_recv",
        query: "udp_recv",
        group: "udp",
    },
    HostOp {
        ctor: "udp_close",
        query: "udp_close",
        group: "udp",
    },
    HostOp {
        ctor: "proc_exec",
        query: "proc_exec",
        group: "proc",
    },
    HostOp {
        ctor: "proc_spawn",
        query: "proc_spawn",
        group: "proc",
    },
    HostOp {
        ctor: "proc_run",
        query: "proc_run",
        group: "proc",
    },
    HostOp {
        ctor: "proc_spawn_ex",
        query: "proc_spawn_ex",
        group: "proc",
    },
    HostOp {
        ctor: "proc_unsafe_shell",
        query: "proc_unsafe_shell",
        group: "proc",
    },
    HostOp {
        ctor: "proc_wait",
        query: "proc_wait",
        group: "proc",
    },
    HostOp {
        ctor: "proc_kill",
        query: "proc_kill",
        group: "proc",
    },
    HostOp {
        ctor: "job_start",
        query: "job_start",
        group: "job",
    },
    HostOp {
        ctor: "job_await",
        query: "job_await",
        group: "job",
    },
    HostOp {
        ctor: "job_cancel",
        query: "job_cancel",
        group: "job",
    },
    HostOp {
        ctor: "job_all",
        query: "job_all",
        group: "job",
    },
    HostOp {
        ctor: "job_race",
        query: "job_race",
        group: "job",
    },
    HostOp {
        ctor: "gzip",
        query: "gzip",
        group: "zlib",
    },
    HostOp {
        ctor: "gunzip",
        query: "gunzip",
        group: "zlib",
    },
    HostOp {
        ctor: "state_get",
        query: "get_state",
        group: "core",
    },
    HostOp {
        ctor: "state_set",
        query: "set_state",
        group: "core",
    },
    HostOp {
        ctor: "ffi",
        query: "ffi",
        group: "ffi",
    },
    HostOp {
        ctor: "worker_run",
        query: "worker_run",
        group: "worker",
    },
    HostOp {
        ctor: "sse_open",
        query: "sse_open",
        group: "sse",
    },
    HostOp {
        ctor: "sse_send",
        query: "sse_send",
        group: "sse",
    },
    HostOp {
        ctor: "sse_close",
        query: "sse_close",
        group: "sse",
    },
    HostOp {
        ctor: "sse_count",
        query: "sse_count",
        group: "sse",
    },
    HostOp {
        ctor: "db_connect",
        query: "db_connect",
        group: "db",
    },
    HostOp {
        ctor: "db_set",
        query: "db_set",
        group: "db",
    },
    HostOp {
        ctor: "db_del",
        query: "db_del",
        group: "db",
    },
    HostOp {
        ctor: "db_query",
        query: "db_query",
        group: "db",
    },
    HostOp {
        ctor: "db_keys",
        query: "db_keys",
        group: "db",
    },
    HostOp {
        ctor: "db_clear",
        query: "db_clear",
        group: "db",
    },
    HostOp {
        ctor: "db_close",
        query: "db_close",
        group: "db",
    },
    HostOp {
        ctor: "fs_open",
        query: "fs_open",
        group: "file",
    },
    HostOp {
        ctor: "fs_read_fd",
        query: "fs_read_fd",
        group: "file",
    },
    HostOp {
        ctor: "fs_close",
        query: "fs_close",
        group: "file",
    },
    HostOp {
        ctor: "fs_temp_push",
        query: "fs_temp_push",
        group: "file",
    },
    HostOp {
        ctor: "fs_temp_pop",
        query: "fs_temp_pop",
        group: "file",
    },
    HostOp {
        ctor: "stream_open",
        query: "stream_open",
        group: "file",
    },
    HostOp {
        ctor: "stream_read",
        query: "stream_read",
        group: "file",
    },
    HostOp {
        ctor: "stream_close",
        query: "stream_close",
        group: "file",
    },
    HostOp {
        ctor: "ws_send",
        query: "ws_send",
        group: "ws",
    },
    HostOp {
        ctor: "ws_recv",
        query: "ws_recv",
        group: "ws",
    },
    HostOp {
        ctor: "ws_close",
        query: "ws_close",
        group: "ws",
    },
];

/// Extra aliases from `host-schema.js` `queries()`.
const QUERY_ALIASES: &[(&str, &str)] = &[
    ("print", "core"),
    ("request", "http"),
    ("get_file", "file"),
    ("set_file", "file"),
    ("del_file", "file"),
    ("get_dir", "file"),
    ("set_file2", "file"),
    ("sha256", "crypto"),
    ("job_all", "job"),
    ("init_udp", "udp"),
    ("send_udp", "udp"),
    ("recv_udp", "udp"),
    ("stop_udp", "udp"),
    ("db_get", "db"),
    ("db_has", "db"),
    ("http_reply_hdr", "server"),
];

/// Host slice flags (FmcToJs `hneed`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HostNeed {
    pub core: bool,
    pub file: bool,
    pub http: bool,
    pub job: bool,
    pub dns: bool,
    pub tcp: bool,
    pub ws: bool,
    pub zlib: bool,
    pub server: bool,
    pub sse: bool,
    pub ffi: bool,
    pub worker: bool,
    pub proc: bool,
    pub db: bool,
    pub udp: bool,
    pub crypto: bool,
}

impl HostNeed {
    pub fn all() -> Self {
        Self {
            core: true,
            file: true,
            http: true,
            job: true,
            dns: true,
            tcp: true,
            ws: true,
            zlib: true,
            server: true,
            sse: true,
            ffi: true,
            worker: true,
            proc: true,
            db: true,
            udp: true,
            crypto: true,
        }
    }

    pub fn core_only() -> Self {
        Self {
            core: true,
            ..Self::default()
        }
    }

    pub fn set_group(&mut self, group: &str) {
        match group {
            "core" => self.core = true,
            "file" => self.file = true,
            "http" => self.http = true,
            "job" => self.job = true,
            "dns" => self.dns = true,
            "tcp" => self.tcp = true,
            "ws" => self.ws = true,
            "zlib" => self.zlib = true,
            "server" => self.server = true,
            "sse" => self.sse = true,
            "ffi" => self.ffi = true,
            "worker" => self.worker = true,
            "proc" => self.proc = true,
            "db" => self.db = true,
            "udp" => self.udp = true,
            "crypto" => self.crypto = true,
            _ => {}
        }
    }
}

/// Query name → host group (`HOST_QUERY_GROUP`).
pub fn query_group(query: &str) -> Option<&'static str> {
    for (q, g) in QUERY_ALIASES {
        if *q == query {
            return Some(*g);
        }
    }
    OPS.iter().find(|op| op.query == query).map(|op| op.group)
}

/// FmcToJs `host_need_from_queries`.
pub fn host_need_from_queries(queries: &[&str], dynamic: bool) -> HostNeed {
    if dynamic {
        return HostNeed::all();
    }
    let mut n = HostNeed::core_only();
    for q in queries {
        if q.is_empty() {
            continue;
        }
        match query_group(q) {
            Some(g) => n.set_group(g),
            None => return HostNeed::all(),
        }
    }
    if n.sse {
        n.server = true;
    }
    if n.ws {
        n.tcp = true;
    }
    if n.job {
        n.http = true;
    }
    n
}
