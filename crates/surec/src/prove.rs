//! `sure prove` / `sure check`. Residual `_` / `admit` / `?hole` fail.
//! Completed `Equal`/`==` with no holes is proved; `Nat.add` only checks.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use sure_check::{
    check_names, has_holes, is_proof_type, show, shown_has_hole, synth_one, Workspace,
};
use sure_syntax::{parse_file, Defs, Status};

#[derive(Clone, Debug)]
pub struct ProveResult {
    pub ok: bool,
    pub proved: bool,
    pub checked: bool,
    pub name: String,
    pub typ: String,
    pub proof: bool,
    pub proof_obligations: usize,
    pub diagnostics: Vec<String>,
}

pub fn open_workspace() -> Result<Workspace, String> {
    Workspace::from_env().ok_or_else(|| {
        String::from("sure: cannot find stdlib base (set SURE_BASE to the repo base/ directory)")
    })
}

/// Prefer a tree that contains `src/Hello.sure` (hello gate).
pub fn hello_root(ws: &Workspace) -> PathBuf {
    let local = ws.project_root.join("src").join("Hello.sure");
    if local.is_file() {
        return ws.project_root.clone();
    }
    if let Some(parent) = ws.base.parent() {
        let via = parent.join("examples").join("hello");
        if via.join("src").join("Hello.sure").is_file() {
            return via;
        }
    }
    ws.project_root.clone()
}

pub fn hello_workspace() -> Result<Workspace, String> {
    let ws = open_workspace()?;
    let hello = hello_root(&ws);
    Ok(Workspace::open(&ws.base, hello))
}

pub fn cmd_prove(ws: &mut Workspace, names: &[String], json: bool) -> i32 {
    let list = if names.is_empty() {
        default_prove_names(ws)
    } else {
        names.to_vec()
    };
    if !json {
        println!("== prove (type checker is the prover) ==");
    }
    let mut results = Vec::new();
    let mut failed = 0;
    let mut check_failed = 0;
    for spec in &list {
        let r = prove_one(ws, spec);
        if !r.ok {
            check_failed += 1;
        }
        if !r.ok || !r.proved {
            failed += 1;
            if !json {
                print_one(&r);
            }
        } else if !json {
            print_one(&r);
        }
        results.push(r);
    }
    let all_ok = check_failed == 0;
    let all_proved = results.iter().all(|r| r.proved) && all_ok;
    if json {
        print_json(all_ok, all_proved, &results);
    } else if failed > 0 {
        println!("prove failed: {failed}");
    } else {
        println!("All listed theorems proved.");
    }
    if failed > 0 {
        1
    } else {
        0
    }
}

pub fn cmd_check(ws: &mut Workspace, names: &[String], json: bool) -> i32 {
    let term = if names.is_empty() {
        String::from("Main")
    } else {
        names[0].clone()
    };
    let r = prove_named(ws, &term);
    if json {
        print_json(r.ok, r.proved && r.ok, std::slice::from_ref(&r));
        return if r.ok { 0 } else { 1 };
    }
    if !r.ok {
        println!("prover fail: {term}");
        for d in &r.diagnostics {
            println!("{d}");
        }
        return 1;
    }
    println!(
        "checked {term}{}",
        if r.typ.is_empty() {
            String::new()
        } else {
            format!(" : {}", r.typ)
        }
    );
    let theorems = project_theorems(ws);
    if theorems.is_empty() || (theorems.len() == 1 && theorems[0] == term) {
        return 0;
    }
    cmd_prove(ws, &theorems, false)
}

/// One name or an inline snippet (`Name: T\\n  body`).
pub fn prove_one(ws: &mut Workspace, spec: &str) -> ProveResult {
    if is_snippet(spec) {
        prove_snippet(ws, spec)
    } else {
        prove_named(ws, spec)
    }
}

pub fn prove_named(ws: &mut Workspace, name: &str) -> ProveResult {
    if name.is_empty() {
        return empty_name();
    }
    let report = check_names(&[name.to_string()], ws);
    result_of(name, &report.defs, &report.diagnostics)
}

pub fn prove_snippet(ws: &mut Workspace, code: &str) -> ProveResult {
    let name = snippet_name(code);
    if name.is_empty() {
        return empty_name();
    }
    let mut defs = Defs::new();
    if let Err(e) = parse_file("Edge.sure", code, &mut defs) {
        return ProveResult {
            ok: false,
            proved: false,
            checked: false,
            name,
            typ: String::new(),
            proof: false,
            proof_obligations: 0,
            diagnostics: vec![e.to_string()],
        };
    }
    let Some(defs) = synth_one(&name, defs, ws) else {
        return result_of(&name, &Defs::new(), &["missing".into()]);
    };
    result_of(&name, &defs, &[])
}

fn result_of(name: &str, defs: &Defs, extra_diags: &[String]) -> ProveResult {
    if name.is_empty() {
        return empty_name();
    }
    match defs.get(name) {
        None => ProveResult {
            ok: false,
            proved: false,
            checked: false,
            name: name.to_string(),
            typ: String::new(),
            proof: false,
            proof_obligations: 0,
            diagnostics: if extra_diags.is_empty() {
                vec![format!("missing {name}")]
            } else {
                extra_diags.to_vec()
            },
        },
        Some(d) => {
            let typ = show(&d.typ);
            let proof = is_proof_type(&typ);
            let term_s = show(&d.term);
            let residual = has_holes(&d.term) || shown_has_hole(&term_s);
            match &d.stat {
                Status::Done { .. } if !residual => ProveResult {
                    ok: true,
                    proved: proof,
                    checked: true,
                    name: name.to_string(),
                    typ,
                    proof,
                    proof_obligations: 0,
                    diagnostics: Vec::new(),
                },
                Status::Done { .. } => ProveResult {
                    ok: false,
                    proved: false,
                    checked: false,
                    name: name.to_string(),
                    typ,
                    proof,
                    proof_obligations: if proof { 1 } else { 0 },
                    diagnostics: vec![String::from("residual hole")],
                },
                Status::Fail { errors } => {
                    let mut diagnostics: Vec<String> =
                        errors.iter().map(|e| e.message.clone()).collect();
                    diagnostics.extend(extra_diags.iter().cloned());
                    ProveResult {
                        ok: false,
                        proved: false,
                        checked: false,
                        name: name.to_string(),
                        typ,
                        proof,
                        proof_obligations: if proof { 1 } else { 0 },
                        diagnostics,
                    }
                }
                _ => ProveResult {
                    ok: false,
                    proved: false,
                    checked: false,
                    name: name.to_string(),
                    typ,
                    proof,
                    proof_obligations: if proof { 1 } else { 0 },
                    diagnostics: extra_diags.to_vec(),
                },
            }
        }
    }
}

fn empty_name() -> ProveResult {
    ProveResult {
        ok: false,
        proved: false,
        checked: false,
        name: String::new(),
        typ: String::new(),
        proof: false,
        proof_obligations: 0,
        diagnostics: vec![String::from("empty name")],
    }
}

fn print_one(r: &ProveResult) {
    if r.ok && r.proved {
        let ty = if r.typ.is_empty() {
            String::new()
        } else {
            format!(" : {}", r.typ)
        };
        println!("proved  {}{ty}", r.name);
    } else if r.ok && !r.proved {
        let ty = if r.typ.is_empty() {
            String::new()
        } else {
            format!(" : {}", r.typ)
        };
        println!("checked {}{ty} (not a completed proof)", r.name);
    } else {
        println!("unproved {}", r.name);
        if !r.diagnostics.is_empty() {
            for d in &r.diagnostics {
                println!("{d}");
            }
        }
    }
}

fn print_json(ok: bool, proved: bool, results: &[ProveResult]) {
    let mut out = String::from("{\n");
    out.push_str(&format!(
        "  \"ok\": {},\n",
        if ok { "true" } else { "false" }
    ));
    out.push_str(&format!(
        "  \"proved\": {},\n",
        if proved { "true" } else { "false" }
    ));
    out.push_str("  \"results\": [\n");
    for (i, r) in results.iter().enumerate() {
        if i > 0 {
            out.push_str(",\n");
        }
        out.push_str("    {\n");
        out.push_str(&format!(
            "      \"ok\": {},\n",
            if r.ok { "true" } else { "false" }
        ));
        out.push_str(&format!(
            "      \"proved\": {},\n",
            if r.proved { "true" } else { "false" }
        ));
        out.push_str(&format!(
            "      \"checked\": {},\n",
            if r.checked { "true" } else { "false" }
        ));
        out.push_str(&format!("      \"name\": {},\n", json_escape(&r.name)));
        out.push_str(&format!("      \"type\": {},\n", json_escape(&r.typ)));
        out.push_str(&format!(
            "      \"proof\": {},\n",
            if r.proof { "true" } else { "false" }
        ));
        out.push_str("      \"proof_obligations\": [");
        if r.proof_obligations > 0 {
            out.push_str("{\"proof_obligation\": true}");
        }
        out.push_str("],\n");
        out.push_str("      \"diagnostics\": [");
        for (j, d) in r.diagnostics.iter().enumerate() {
            if j > 0 {
                out.push_str(", ");
            }
            out.push_str(&json_escape(d));
        }
        out.push_str("]\n    }");
    }
    out.push_str("\n  ]\n}\n");
    let _ = io::stdout().write_all(out.as_bytes());
}

pub fn default_prove_names(ws: &Workspace) -> Vec<String> {
    let mut names = project_theorems(ws);
    for n in scan_src_theorems(ws) {
        if !names.iter().any(|x| x == &n) {
            names.push(n);
        }
    }
    if names.is_empty() {
        vec![String::from("Example.Spec.add2")]
    } else {
        names
    }
}

pub fn project_theorems(ws: &Workspace) -> Vec<String> {
    match manifest_text(ws) {
        Some(text) => json_string_array_field(&text, "theorems").unwrap_or_default(),
        None => Vec::new(),
    }
}

fn scan_src_theorems(ws: &Workspace) -> Vec<String> {
    let mut out = Vec::new();
    for dir in source_dirs(ws) {
        let mut files = Vec::new();
        collect_sure_files(&dir, &mut files);
        for file in files {
            let Ok(body) = fs::read_to_string(&file) else {
                continue;
            };
            let module = module_name_of(&body);
            for (name, typ) in def_headers(&body) {
                if !typ.contains("==") {
                    continue;
                }
                let q = if name.contains('.') || module.is_empty() {
                    name
                } else {
                    format!("{module}.{name}")
                };
                if !out.iter().any(|x| x == &q) {
                    out.push(q);
                }
            }
        }
    }
    out
}

pub fn source_dirs(ws: &Workspace) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(text) = manifest_text(ws) {
        if let Some(listed) = json_string_array_field(&text, "source-directories") {
            for d in listed {
                let p = ws.project_root.join(d);
                if p.is_dir() {
                    dirs.push(p);
                }
            }
        }
        if dirs.is_empty() {
            let src = json_string_field(&text, "src").unwrap_or_else(|| "src".into());
            let p = ws.project_root.join(src);
            if p.is_dir() {
                dirs.push(p);
            }
        }
    }
    if dirs.is_empty() {
        let src = ws.project_root.join("src");
        if src.is_dir() {
            dirs.push(src);
        }
    }
    dirs
}

pub fn manifest_path(ws: &Workspace) -> Option<PathBuf> {
    let sure = ws.project_root.join("sure.json");
    if sure.is_file() {
        return Some(sure);
    }
    let kind = ws.project_root.join("kind.json");
    if kind.is_file() {
        return Some(kind);
    }
    None
}

fn manifest_text(ws: &Workspace) -> Option<String> {
    fs::read_to_string(manifest_path(ws)?).ok()
}

fn collect_sure_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else {
        return;
    };
    for ent in rd.flatten() {
        let p = ent.path();
        if p.is_dir() {
            collect_sure_files(&p, out);
        } else if p.extension().and_then(|e| e.to_str()) == Some("sure") {
            out.push(p);
        }
    }
}

fn module_name_of(src: &str) -> String {
    for line in src.lines() {
        let t = line.trim();
        let t = t.strip_prefix("//").map(str::trim).unwrap_or(t);
        if let Some(rest) = t.strip_prefix("module ") {
            let nam = rest.split(" exposing ").next().unwrap_or(rest).trim();
            return nam.to_string();
        }
    }
    String::new()
}

fn def_headers(src: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for line in src.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }
        if let Some((name, typ)) = split_def_header(line) {
            out.push((name, typ));
        }
    }
    out
}

fn split_def_header(line: &str) -> Option<(String, String)> {
    let colon = line.find(':')?;
    let left = line[..colon].trim();
    if left.is_empty() {
        return None;
    }
    let name = left
        .split('(')
        .next()
        .unwrap_or(left)
        .split('<')
        .next()
        .unwrap_or(left)
        .trim();
    if name.is_empty()
        || !name
            .chars()
            .next()
            .map(|c| c.is_ascii_alphabetic())
            .unwrap_or(false)
    {
        return None;
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
    {
        return None;
    }
    Some((name.to_string(), line[colon + 1..].to_string()))
}

pub fn is_snippet(spec: &str) -> bool {
    spec.contains('\n') || (spec.contains(' ') && spec.contains(':'))
}

pub fn snippet_name(code: &str) -> String {
    for line in code.lines() {
        if line.is_empty() || line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }
        if let Some((name, _)) = split_def_header(line) {
            return name;
        }
    }
    String::new()
}

pub(crate) fn json_escape(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub(crate) fn json_string_field(text: &str, key: &str) -> Option<String> {
    let rest = json_field_after(text, key)?;
    parse_json_string(rest).map(|(s, _)| s)
}

pub(crate) fn json_string_array_field(text: &str, key: &str) -> Option<Vec<String>> {
    let rest = json_field_after(text, key)?;
    parse_json_string_array(rest)
}

pub(crate) fn json_bool_field(text: &str, key: &str) -> Option<bool> {
    let rest = json_field_after(text, key)?;
    let rest = rest.trim_start();
    if rest.starts_with("true") {
        Some(true)
    } else if rest.starts_with("false") {
        Some(false)
    } else {
        None
    }
}

fn json_field_after<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\"{key}\"");
    let mut from = 0;
    while let Some(pos) = text[from..].find(&needle) {
        let abs = from + pos + needle.len();
        let rest = text[abs..].trim_start();
        if let Some(rest) = rest.strip_prefix(':') {
            return Some(rest.trim_start());
        }
        from = abs;
    }
    None
}

fn parse_json_string_array(text: &str) -> Option<Vec<String>> {
    let rest = text.strip_prefix('[')?.trim_start();
    let mut rest = rest;
    let mut out = Vec::new();
    loop {
        rest = rest.trim_start();
        if rest.starts_with(']') {
            return Some(out);
        }
        if rest.starts_with(',') {
            rest = rest[1..].trim_start();
            continue;
        }
        let (s, next) = parse_json_string(rest)?;
        out.push(s);
        rest = next.trim_start();
        if rest.starts_with(',') {
            rest = rest[1..].trim_start();
        } else if rest.starts_with(']') {
            return Some(out);
        } else {
            return None;
        }
    }
}

fn parse_json_string(text: &str) -> Option<(String, &str)> {
    let rest = text.strip_prefix('"')?;
    let mut out = String::new();
    let mut chars = rest.char_indices();
    while let Some((i, c)) = chars.next() {
        match c {
            '"' => return Some((out, &rest[i + 1..])),
            '\\' => match chars.next() {
                Some((_, 'n')) => out.push('\n'),
                Some((_, 't')) => out.push('\t'),
                Some((_, 'r')) => out.push('\r'),
                Some((_, '"')) => out.push('"'),
                Some((_, '\\')) => out.push('\\'),
                Some((_, c)) => out.push(c),
                None => return None,
            },
            c => out.push(c),
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snippet_detects_inline_spec() {
        assert!(is_snippet("Edge.lie2: Nat.add(2, 2) == 5\n  refl"));
        assert!(!is_snippet("Hello.Spec"));
        assert_eq!(
            snippet_name("Edge.lie2: Nat.add(2, 2) == 5\n  refl"),
            "Edge.lie2"
        );
    }

    #[test]
    fn json_roundtrip_fields() {
        let t = r#"{"theorems": ["Hello.Spec"], "ok": true, "src": "src"}"#;
        assert_eq!(
            json_string_array_field(t, "theorems"),
            Some(vec!["Hello.Spec".into()])
        );
        assert_eq!(json_bool_field(t, "ok"), Some(true));
        assert_eq!(json_string_field(t, "src"), Some("src".into()));
    }
}
