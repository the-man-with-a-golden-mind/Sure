//! `sure run`: compile if dist is stale, spawn Node/Bun. Does **not** prove.
//! Stamp `proved: false`. Restore cwd, inherit stdio, argv array (not a shell).

use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use sure_check::Workspace;
use sure_emit::emit_safe;

use crate::build::{
    compile_term, emit_js_path, read_stamp, src_hash, stamp_fresh, write_emit_js, write_stamp,
    Stamp,
};

pub fn cmd_run(ws: &mut Workspace, term: &str, force: bool, extra: &[String], bun: bool) -> i32 {
    if term.is_empty() {
        eprintln!("sure run <Term>");
        return 1;
    }
    if !emit_safe(term) {
        eprintln!("emit failed: unsafe name");
        eprintln!("term names look like Main or Html.Counter.client, not paths");
        return 1;
    }
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let hash = src_hash(ws, term);
    let prev = read_stamp(ws);
    let dist = emit_js_path(ws, term);
    if !force && dist.is_file() && stamp_fresh(&prev, &hash, term, &dist) {
        return spawn_js(&dist, bun, extra, &cwd);
    }
    println!("compile {term} (no fresh dist/{term}.js)");
    match compile_term(ws, term) {
        Ok(js) => match write_emit_js(ws, term, &js) {
            Ok(written) => {
                write_stamp(
                    ws,
                    &Stamp {
                        ok: true,
                        src_hash: hash,
                        file: format!("dist/{term}.js"),
                        proved: Some(false),
                        term: term.to_string(),
                    },
                );
                println!("emitted {} ({} bytes)", written.display(), js.len());
                spawn_js(&written, bun, extra, &cwd)
            }
            Err(e) => {
                eprintln!("emit failed: {e}");
                1
            }
        },
        Err(e) => {
            eprintln!("Compilation error.");
            eprintln!("{e}");
            1
        }
    }
}

/// Spawn Node/Bun on `js_path`. Restores `cwd`. Exit code is the child's.
pub fn spawn_js(js_path: &Path, bun: bool, extra: &[String], cwd: &Path) -> i32 {
    match spawn_js_status(js_path, bun, extra, cwd) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}

pub fn spawn_js_capture(
    js_path: &Path,
    bun: bool,
    extra: &[String],
    cwd: &Path,
) -> Result<Output, String> {
    let abs = abs_js(js_path, cwd)?;
    let _ = env::set_current_dir(cwd);
    if bun {
        if !bun_available() {
            return Err(String::from("bun not found"));
        }
        Command::new("bun")
            .arg(&abs)
            .args(extra)
            .current_dir(cwd)
            .output()
            .map_err(|e| e.to_string())
    } else {
        let node = node_bin();
        Command::new(&node)
            .arg("--stack-size=10000")
            .arg(&abs)
            .args(extra)
            .current_dir(cwd)
            .output()
            .map_err(|e| e.to_string())
    }
}

fn spawn_js_status(js_path: &Path, bun: bool, extra: &[String], cwd: &Path) -> Result<i32, String> {
    let abs = abs_js(js_path, cwd)?;
    let _ = env::set_current_dir(cwd);
    if bun {
        if !bun_available() {
            return Err(String::from("bun not found"));
        }
        let mut cmd = Command::new("bun");
        cmd.arg(&abs).args(extra).current_dir(cwd);
        run_child(&mut cmd)
    } else {
        let node = node_bin();
        let mut cmd = Command::new(&node);
        cmd.arg("--stack-size=10000")
            .arg(&abs)
            .args(extra)
            .current_dir(cwd);
        run_child(&mut cmd)
    }
}

fn run_child(cmd: &mut Command) -> Result<i32, String> {
    cmd.stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    let st = cmd.status().map_err(|e| e.to_string())?;
    Ok(st.code().unwrap_or(1))
}

fn abs_js(js_path: &Path, cwd: &Path) -> Result<PathBuf, String> {
    let abs = if js_path.is_absolute() {
        js_path.to_path_buf()
    } else {
        cwd.join(js_path)
    };
    if !abs.is_file() {
        return Err(String::from("missing js"));
    }
    Ok(abs)
}

fn node_bin() -> String {
    match env::var("SURE_NODE") {
        Ok(s) if !s.is_empty() => s,
        _ => String::from("node"),
    }
}

fn bun_available() -> bool {
    Command::new("bun")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_bin_defaults() {
        // SURE_NODE may be set in the environment; empty/unset → node.
        let b = node_bin();
        assert!(!b.is_empty());
    }
}
