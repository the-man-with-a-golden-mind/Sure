//! `sure build`: prove theorems, then emit `dist/<Term>.js`. Stamp `proved: true`.

use std::fs;
use std::path::{Path, PathBuf};

use sure_check::{check_names, defs_to_fmc, Workspace};
use sure_emit::{compile_defs, emit_safe, EmitOpts};

use crate::prove::{
    json_bool_field, json_escape, json_string_field, manifest_path, project_theorems, prove_named,
    source_dirs,
};

#[derive(Clone, Debug)]
pub struct Stamp {
    pub ok: bool,
    pub src_hash: String,
    pub file: String,
    pub proved: Option<bool>,
    pub term: String,
}

pub fn cmd_build(ws: &mut Workspace, term: &str, force: bool) -> i32 {
    if term.is_empty() {
        eprintln!("sure build <Term>");
        return 1;
    }
    if !emit_safe(term) {
        eprintln!("build failed: unsafe name");
        eprintln!("term names look like Main or Html.Counter.client, not paths");
        return 1;
    }
    let hash = src_hash(ws, term);
    let prev = read_stamp(ws);
    let out = emit_js_path(ws, term);
    if !force && stamp_fresh(&prev, &hash, term, &out) && !stamp_unproved(&prev, term) {
        println!("unchanged {term} ({})", out.display());
        return 0;
    }
    let theorems = project_theorems(ws);
    for th in &theorems {
        let r = prove_named(ws, th);
        if !r.ok || !r.proved {
            write_stamp(
                ws,
                &Stamp {
                    ok: false,
                    src_hash: hash,
                    file: String::new(),
                    proved: Some(false),
                    term: term.to_string(),
                },
            );
            eprintln!("build failed: unproved");
            eprintln!("the type checker is the prover. try: sure prove");
            return 1;
        }
    }
    match compile_term(ws, term) {
        Ok(js) => match write_emit_js(ws, term, &js) {
            Ok(written) => {
                write_stamp(
                    ws,
                    &Stamp {
                        ok: true,
                        src_hash: hash,
                        file: format!("dist/{term}.js"),
                        proved: Some(true),
                        term: term.to_string(),
                    },
                );
                println!("emitted {} ({} bytes)", written.display(), js.len());
                println!("next: sure run");
                0
            }
            Err(e) => {
                eprintln!("build failed: {e}");
                1
            }
        },
        Err(e) => {
            eprintln!("build failed: {e}");
            1
        }
    }
}

pub fn compile_term(ws: &mut Workspace, term: &str) -> Result<String, String> {
    if !emit_safe(term) {
        return Err(String::from("unsafe name"));
    }
    let report = check_names(&[term.to_string()], ws);
    if !report.ok {
        let d = report.diagnostics.join("; ");
        return Err(if d.is_empty() {
            format!("check failed: {term}")
        } else {
            format!("check failed: {d}")
        });
    }
    let fmc = defs_to_fmc(&report.defs).map_err(|e| e.to_string())?;
    compile_defs(&fmc, term, &EmitOpts::default()).map_err(|e| e.message)
}

pub fn write_emit_js(ws: &Workspace, term: &str, js: &str) -> Result<PathBuf, String> {
    if js.is_empty() {
        return Err(String::from("empty js"));
    }
    let out = emit_js_path(ws, term);
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&out, js).map_err(|e| e.to_string())?;
    Ok(out)
}

pub fn emit_js_path(ws: &Workspace, term: &str) -> PathBuf {
    ws.project_root.join("dist").join(format!("{term}.js"))
}

pub fn src_hash(ws: &Workspace, term: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    fn feed(h: &mut u64, bytes: &[u8]) {
        for b in bytes {
            *h ^= u64::from(*b);
            *h = h.wrapping_mul(0x100000001b3);
        }
        *h ^= 0xff;
        *h = h.wrapping_mul(0x100000001b3);
    }
    feed(&mut h, env!("CARGO_PKG_VERSION").as_bytes());
    feed(&mut h, b"surec");
    feed(&mut h, term.as_bytes());
    if let Some(p) = manifest_path(ws) {
        if let Ok(t) = fs::read(&p) {
            feed(&mut h, &t);
        }
    }
    let mut files = Vec::new();
    for dir in source_dirs(ws) {
        collect_files(&dir, &mut files);
    }
    files.sort();
    for f in files {
        feed(&mut h, f.to_string_lossy().as_bytes());
        if let Ok(t) = fs::read(&f) {
            feed(&mut h, &t);
        }
    }
    format!("{h:016x}")
}

fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else {
        return;
    };
    for ent in rd.flatten() {
        let p = ent.path();
        if p.is_dir() {
            collect_files(&p, out);
        } else if p.extension().and_then(|e| e.to_str()) == Some("sure") {
            out.push(p);
        }
    }
}

pub fn stamp_path(ws: &Workspace) -> PathBuf {
    ws.project_root.join(".sure").join("build.json")
}

pub fn read_stamp(ws: &Workspace) -> Option<Stamp> {
    let text = fs::read_to_string(stamp_path(ws)).ok()?;
    Some(Stamp {
        ok: json_bool_field(&text, "ok").unwrap_or(false),
        src_hash: json_string_field(&text, "src_hash").unwrap_or_default(),
        file: json_string_field(&text, "file").unwrap_or_default(),
        proved: json_bool_field(&text, "proved"),
        term: json_string_field(&text, "term").unwrap_or_default(),
    })
}

pub fn write_stamp(ws: &Workspace, stamp: &Stamp) {
    let dir = ws.project_root.join(".sure");
    let _ = fs::create_dir_all(&dir);
    let proved = match stamp.proved {
        Some(true) => "true",
        Some(false) => "false",
        None => "null",
    };
    let body = format!(
        "{{\n  \"ok\": {},\n  \"src_hash\": {},\n  \"file\": {},\n  \"proved\": {proved},\n  \"term\": {}\n}}\n",
        if stamp.ok { "true" } else { "false" },
        json_escape(&stamp.src_hash),
        json_escape(&stamp.file),
        json_escape(&stamp.term),
    );
    let _ = fs::write(stamp_path(ws), body);
}

pub fn stamp_fresh(prev: &Option<Stamp>, hash: &str, term: &str, out: &Path) -> bool {
    let Some(one) = prev else {
        return false;
    };
    if !one.ok || one.term != term || one.src_hash != hash {
        return false;
    }
    let listed = if one.file.is_empty() {
        out.to_path_buf()
    } else {
        let p = PathBuf::from(&one.file);
        if p.is_absolute() {
            p
        } else {
            out.parent()
                .and_then(Path::parent)
                .unwrap_or_else(|| Path::new("."))
                .join(&one.file)
        }
    };
    let path = if listed.exists() {
        listed
    } else {
        out.to_path_buf()
    };
    path.is_file() && fs::metadata(&path).map(|m| m.len() > 0).unwrap_or(false)
}

pub fn stamp_unproved(prev: &Option<Stamp>, term: &str) -> bool {
    match prev {
        Some(s) if s.term == term => s.proved == Some(false),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emit_path_is_dist_term_js() {
        assert!(emit_safe("Main"));
        assert!(!emit_safe("foo/bar"));
    }
}
