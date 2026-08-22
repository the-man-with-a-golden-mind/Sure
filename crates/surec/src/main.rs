//! Trusted-path CLI for the hello load set.
//!
//! Never eval JS: emit `dist/<Term>.js` and spawn Node/Bun on the file.

mod build;
mod cli;
mod fmt;
mod prove;
mod run;

use std::collections::HashSet;
use std::env;
use std::io::{self, Write};
use std::process;

use sure_check::{check_names, defs_to_fmc};
use sure_fmc::{open_lam, Defs as FmcDefs, Term as FmcTerm};

use cli::Cmd;
use prove::{hello_workspace, open_workspace, prove_named, prove_one, ProveResult};

const VERSION: &str = concat!("Sure ", env!("CARGO_PKG_VERSION"), " (Legacy Kind 1.0.121)");

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let parsed = cli::parse(&args);
    let code = dispatch(parsed.cmd, parsed.bun);
    if code != 0 {
        process::exit(code);
    }
}

fn dispatch(cmd: Cmd, bun: bool) -> i32 {
    match cmd {
        Cmd::Version => {
            println!("{VERSION}");
            0
        }
        Cmd::Help { topic } => cmd_help(topic.as_deref()),
        Cmd::Check { names, json } => with_ws(|ws| prove::cmd_check(ws, &names, json)),
        Cmd::Prove { names, json } => with_ws(|ws| prove::cmd_prove(ws, &names, json)),
        Cmd::Build { term, force } => with_ws(|ws| build::cmd_build(ws, &term, force)),
        Cmd::Run { term, force, extra } => {
            with_ws(|ws| run::cmd_run(ws, &term, force, &extra, bun))
        }
        Cmd::Fmt { target } => match open_workspace() {
            Ok(ws) => fmt::cmd_fmt(Some(&ws), target.as_deref()),
            Err(e) => {
                if target
                    .as_deref()
                    .map(|t| t.ends_with(".sure"))
                    .unwrap_or(false)
                {
                    fmt::cmd_fmt(None, target.as_deref())
                } else {
                    eprintln!("{e}");
                    1
                }
            }
        },
        Cmd::Test => cmd_test(bun),
        Cmd::Fmc { term } => cmd_fmc(&term),
        Cmd::TermRun { term } => {
            eprintln!(
                "sure: {term} --run (tmp file) is not in the rust compiler yet; use: sure run {term}"
            );
            2
        }
        Cmd::Html => {
            eprintln!(
                "sure: --html is not in the rust compiler yet; SURE_COMPILER=js sure build --html"
            );
            2
        }
        Cmd::CheckTerm { term } => with_ws(|ws| prove::cmd_check(ws, &[term], false)),
        Cmd::Unsupported { cmd } => {
            eprintln!("sure: {cmd} is not in the rust compiler yet; SURE_COMPILER=js sure {cmd}");
            2
        }
    }
}

fn with_ws(f: impl FnOnce(&mut sure_check::Workspace) -> i32) -> i32 {
    match open_workspace() {
        Ok(mut ws) => f(&mut ws),
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}

fn cmd_help(topic: Option<&str>) -> i32 {
    match topic {
        None | Some("") | Some("help") | Some("start") => {
            print_start_help();
            0
        }
        Some("prove") => {
            println!("A well-typed `a == b` term is a proof. The type checker is the prover.");
            println!();
            println!("  Spec.add2: Nat.add(2, 2) == 4");
            println!("    refl");
            println!();
            println!("  sure prove              # listed theorems + src equalities");
            println!("  sure prove Spec.add2    # one theorem");
            0
        }
        Some(t) => {
            eprintln!("unknown help topic: {t}");
            eprintln!("try: sure help start");
            2
        }
    }
}

fn print_start_help() {
    let ver = env!("CARGO_PKG_VERSION");
    println!("# Sure {ver}");
    println!();
    println!("Write .sure files. The type checker proves them. Then you emit JavaScript.");
    println!();
    println!("Usage: sure <command> [Term...]");
    println!();
    println!("  sure prove                  # theorems must check");
    println!("  sure build                  # writes dist/Main.js");
    println!("  sure run                    # emit dist/ if needed, then spawn");
    println!();
    println!("  sure help prove         # equalities are proofs");
    println!("  sure help start         # this screen");
}

fn cmd_fmc(term: &str) -> i32 {
    let mut ws = match open_workspace() {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };
    let report = check_names(&[term.to_string()], &mut ws);
    if !report.ok {
        eprintln!("Couldn't find or compile term: '{term}'.");
        for d in &report.diagnostics {
            eprintln!("{d}");
        }
        return 1;
    }
    let fmc = match defs_to_fmc(&report.defs) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };
    let shaken = shake_defs(&fmc, term);
    print!("{}", sure_fmc::show_defs(&shaken));
    0
}

/// FmcToJs `shake_defs`: keep defs reachable from `main` (term walk, not All).
fn shake_defs(defs: &FmcDefs, main: &str) -> FmcDefs {
    let mut seen = HashSet::new();
    let mut refs = Vec::new();
    if let Some(d) = defs.get(main) {
        walk_refs(&d.term, defs, &mut seen, &mut refs);
    }
    if !refs.iter().any(|n| n == main) {
        refs.push(main.to_string());
    }
    let mut kept = FmcDefs::new();
    for n in refs {
        if let Some(d) = defs.get(n.as_str()) {
            kept.insert(n.into(), d.clone());
        }
    }
    kept
}

fn walk_refs(term: &FmcTerm, defs: &FmcDefs, seen: &mut HashSet<String>, refs: &mut Vec<String>) {
    match term {
        FmcTerm::Ref(name) => {
            if seen.insert(name.to_string()) {
                if let Some(d) = defs.get(name) {
                    walk_refs(&d.term, defs, seen, refs);
                    refs.push(name.to_string());
                }
            }
        }
        FmcTerm::Lam {
            name,
            body,
            bind_level,
        } => {
            let opened = open_lam(body, *bind_level, &FmcTerm::var(name.clone(), 0));
            walk_refs(&opened, defs, seen, refs);
        }
        FmcTerm::App { func, argm } => {
            walk_refs(func, defs, seen, refs);
            walk_refs(argm, defs, seen, refs);
        }
        FmcTerm::Let {
            name,
            expr,
            body,
            bind_level,
        }
        | FmcTerm::Def {
            name,
            expr,
            body,
            bind_level,
        } => {
            walk_refs(expr, defs, seen, refs);
            let opened = open_lam(body, *bind_level, &FmcTerm::var(name.clone(), 0));
            walk_refs(&opened, defs, seen, refs);
        }
        FmcTerm::Ann { term, .. } => walk_refs(term, defs, seen, refs),
        _ => {}
    }
}

fn cmd_test(bun: bool) -> i32 {
    let mut ws = match hello_workspace() {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };
    let mut failed = 0;
    println!("== prove (hello) ==");
    let spec = prove_named(&mut ws, "Hello.Spec");
    if spec.ok && spec.proved {
        println!("ok   Hello.Spec");
        print_one_line(&spec);
    } else {
        println!("fail Hello.Spec ok={} proved={}", spec.ok, spec.proved);
        for d in &spec.diagnostics {
            println!("{d}");
        }
        failed += 1;
    }

    println!("== prove edges ==");
    failed += run_prove_edges(&mut ws);

    println!("== run Main ==");
    failed += run_hello_main(&mut ws, bun);

    println!("== sure test done ==");
    if failed > 0 {
        1
    } else {
        0
    }
}

fn print_one_line(r: &ProveResult) {
    if !r.typ.is_empty() {
        println!("proved  {} : {}", r.name, r.typ);
    }
}

fn run_prove_edges(ws: &mut sure_check::Workspace) -> i32 {
    let mut failed = 0;
    // (label, spec-or-name, want_ok, want_proved, want_obligation, is_snippet)
    let edges: &[(&str, &str, bool, Option<bool>, bool)] = &[
        (
            "zero+zero-style 2+2==4",
            "Edge.add2: Nat.add(2, 2) == 4\n  refl",
            true,
            Some(true),
            false,
        ),
        (
            "false equality 0+0==1",
            "Edge.lie: Nat.add(0, 0) == 1\n  refl",
            false,
            Some(false),
            true,
        ),
        (
            "2+2!=5",
            "Edge.lie2: Nat.add(2, 2) == 5\n  refl",
            false,
            Some(false),
            true,
        ),
        (
            "hole does not prove false",
            "Edge.hole: Nat.add(2, 2) == 5\n  _",
            false,
            Some(false),
            false,
        ),
        (
            "admit is not a proof",
            "Edge.admit: Nat.add(2, 2) == 5\n  admit",
            false,
            Some(false),
            false,
        ),
        ("missing term", "Does.Not.Exist", false, Some(false), false),
        ("empty name", "", false, Some(false), false),
        (
            "Unit is checked not proved",
            "Unit",
            true,
            Some(false),
            false,
        ),
        (
            "Nat.add is checked not proved",
            "Nat.add",
            true,
            Some(false),
            false,
        ),
    ];
    for (label, spec, want_ok, want_proved, want_ob) in edges {
        let r = prove_one(ws, spec);
        let mut pass = r.ok == *want_ok;
        if let Some(wp) = want_proved {
            if r.proved != *wp {
                pass = false;
            }
        }
        if *want_ob && r.proof_obligations == 0 {
            pass = false;
        }
        if pass {
            println!("ok   {label}");
        } else {
            println!(
                "fail {label} ok={} proved={} obligations={}",
                r.ok, r.proved, r.proof_obligations
            );
            for d in &r.diagnostics {
                println!("{d}");
            }
            failed += 1;
        }
    }
    failed
}

fn run_hello_main(ws: &mut sure_check::Workspace, bun: bool) -> i32 {
    match build::compile_term(ws, "Main") {
        Ok(js) => match build::write_emit_js(ws, "Main", &js) {
            Ok(written) => {
                let cwd = env::current_dir().unwrap_or_else(|_| ws.project_root.clone());
                match run::spawn_js_capture(&written, bun, &[], &cwd) {
                    Ok(out) => {
                        let _ = io::stdout().write_all(&out.stdout);
                        let _ = io::stderr().write_all(&out.stderr);
                        let stdout = String::from_utf8_lossy(&out.stdout);
                        if out.status.success() && stdout.contains("Sure") {
                            println!("ok   sure run Main");
                            0
                        } else {
                            println!(
                                "fail sure run Main status={:?} stdout={stdout:?}",
                                out.status.code()
                            );
                            1
                        }
                    }
                    Err(e) => {
                        println!("fail sure run Main: {e}");
                        1
                    }
                }
            }
            Err(e) => {
                println!("fail emit Main: {e}");
                1
            }
        },
        Err(e) => {
            println!("fail compile Main: {e}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_line() {
        assert_eq!(VERSION, "Sure 0.2.0 (Legacy Kind 1.0.121)");
    }

    #[test]
    fn shake_keeps_entry() {
        let src = "id: @(A:*) @(x:A) A = #A #x x;\nMain: @(x:*) * = (id *);\nUnused: * = *;\n";
        let defs = sure_fmc::parse_defs(src).unwrap();
        let shaken = shake_defs(&defs, "Main");
        assert!(shaken.contains_key("Main"));
        assert!(shaken.contains_key("id"));
        assert!(!shaken.contains_key("Unused"));
    }
}
