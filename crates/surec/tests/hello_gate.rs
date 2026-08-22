//! Hello v0.2.0 gate vs JS-oracle gold. Does not spawn the JS compiler.

#![forbid(unsafe_code)]

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::process::{Command, Output};

use sure_check::{check_names, core_show, Workspace};
use sure_syntax::{parse_file, Defs};

const GOLD_A: &str = include_str!("../../../tests/gold/fmc_a_hello.fmc");
const GOLD_B: &str = include_str!("../../../tests/gold/fmc_b_main.fmc");
const GOLD_PROVE: &str = include_str!("../../../tests/gold/prove_hello.txt");
const GOLD_RUN: &str = include_str!("../../../tests/gold/run_main.txt");
const GOLD_CLOSURE: &str = include_str!("../../../tests/gold/hello_closure.txt");
const GOLD_EDGES: &str = include_str!("../../../tests/gold/prove_edges.txt");

fn repo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn hello_dir() -> PathBuf {
    repo().join("examples/hello")
}

fn sure() -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_sure"));
    cmd.current_dir(hello_dir());
    cmd.env("SURE_BASE", repo().join("base"));
    cmd
}

fn run(args: &[&str]) -> Output {
    sure().args(args).output().unwrap_or_else(|e| {
        panic!("sure {args:?}: {e}");
    })
}

fn stdout(out: &Output) -> String {
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn code(out: &Output) -> i32 {
    out.status.code().unwrap_or(1)
}

fn strip_time(s: &str) -> String {
    s.lines()
        .filter(|l| !l.starts_with("sure time "))
        .collect::<Vec<_>>()
        .join("\n")
}

fn def_map(shown: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for raw in shown.split(";\n") {
        let raw = raw.trim().trim_end_matches(';');
        if raw.is_empty() {
            continue;
        }
        let Some((name, rest)) = raw.split_once(':') else {
            panic!("fmc def without colon: {raw}");
        };
        out.insert(name.trim().to_string(), rest.trim().to_string());
    }
    out
}

fn assert_gold_defs(got: &str, gold: &str, label: &str) {
    let got_map = def_map(got);
    let gold_map = def_map(gold);
    let missing: Vec<&String> = gold_map
        .keys()
        .filter(|k| !got_map.contains_key(k.as_str()))
        .collect();
    assert!(
        missing.is_empty(),
        "{label}: rust missing gold defs {missing:?}"
    );
    let mut mismatches = Vec::new();
    for (name, want) in &gold_map {
        let got_body = got_map.get(name).unwrap();
        if got_body == want {
            continue;
        }
        let src_got = format!("{name}: {got_body};\n");
        let src_want = format!("{name}: {want};\n");
        let pg = sure_fmc::parse_defs(&src_got).unwrap_or_else(|e| {
            panic!("{label}: parse rust {name}: {e}\n{src_got}");
        });
        let pw = sure_fmc::parse_defs(&src_want).unwrap_or_else(|e| {
            panic!("{label}: parse gold {name}: {e}\n{src_want}");
        });
        let dg = pg.get(name.as_str()).expect(name);
        let dw = pw.get(name.as_str()).expect(name);
        if !sure_fmc::equal(&dg.term, &dw.term, &pg) || !sure_fmc::equal(&dg.typ, &dw.typ, &pg) {
            mismatches.push(name.clone());
        }
    }
    assert!(
        mismatches.is_empty(),
        "{label}: unequal defs {mismatches:?}\n rust {}\n gold {}",
        got_map
            .get(&mismatches[0])
            .map(|s| s.as_str())
            .unwrap_or(""),
        gold_map
            .get(&mismatches[0])
            .map(|s| s.as_str())
            .unwrap_or("")
    );
}

fn has_plus_nat(s: &str) -> bool {
    s.as_bytes()
        .windows(2)
        .any(|w| w[0] == b'+' && w[1].is_ascii_digit())
}

struct Edge {
    spec: String,
    ok: bool,
    proved: bool,
    obligation: bool,
}

fn parse_edges(src: &str) -> Vec<Edge> {
    let mut out = Vec::new();
    for line in src.lines() {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        assert_eq!(parts.len(), 4, "gold edge columns: {line}");
        out.push(Edge {
            spec: parts[0].replace("\\n", "\n"),
            ok: parts[1] == "true",
            proved: parts[2] == "true",
            obligation: parts[3] == "true",
        });
    }
    out
}

fn json_bool_first(text: &str, key: &str) -> Option<bool> {
    let true_pat = format!("\"{key}\": true");
    let false_pat = format!("\"{key}\": false");
    let t = text.find(&true_pat);
    let f = text.find(&false_pat);
    match (t, f) {
        (Some(ti), Some(fi)) if ti < fi => Some(true),
        (Some(_), None) => Some(true),
        (None, Some(_)) => Some(false),
        (Some(_), Some(_)) => Some(false),
        (None, None) => None,
    }
}

#[test]
fn parse_hello_qualified_names() {
    let src = std::fs::read_to_string(hello_dir().join("src/Hello.sure")).unwrap();
    let mut defs = Defs::new();
    parse_file("Hello.sure", &src, &mut defs).expect("parse Hello.sure");
    assert!(defs.contains_key("Hello.greet"));
    assert!(defs.contains_key("Hello.Spec"));
    assert!(defs.contains_key("Hello.demo"));
    assert!(!defs.contains_key("greet"));
}

#[test]
fn hello_closure_gold_lists_hello_and_word() {
    let names: Vec<&str> = GOLD_CLOSURE
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    for need in [
        "Hello.Spec",
        "Hello.greet",
        "Hello.demo",
        "Main",
        "Nat.add",
        "Unit",
        "Word.from_bits",
    ] {
        assert!(names.contains(&need), "hello_closure.txt missing {need}");
    }
}

#[test]
fn prove_hello_spec_matches_gold() {
    let out = run(&["prove", "Hello.Spec"]);
    assert_eq!(code(&out), 0, "{}", stdout(&out));
    let got = strip_time(&stdout(&out));
    assert_eq!(got.trim(), GOLD_PROVE.trim());
    assert!(got.contains("proved  Hello.Spec"));
}

#[test]
fn prove_default_uses_hello_spec_theorems() {
    let out = run(&["prove"]);
    assert_eq!(code(&out), 0, "{}", stdout(&out));
    assert!(stdout(&out).contains("proved  Hello.Spec"));
}

#[test]
fn prove_edges_from_js_selftest() {
    for edge in parse_edges(GOLD_EDGES) {
        let out = run(&["prove", "--json", &edge.spec]);
        let text = stdout(&out);
        let ok = json_bool_first(&text, "ok").unwrap_or(false);
        let proved = json_bool_first(&text, "proved").unwrap_or(false);
        assert_eq!(ok, edge.ok, "ok mismatch for {:?}: {text}", edge.spec);
        assert_eq!(
            proved, edge.proved,
            "proved mismatch for {:?}: {text}",
            edge.spec
        );
        if edge.ok && edge.proved {
            assert_eq!(code(&out), 0, "proved {:?} must exit 0\n{text}", edge.spec);
        } else {
            assert_ne!(
                code(&out),
                0,
                "unproved {:?} must not exit 0\n{text}",
                edge.spec
            );
        }
        if edge.obligation {
            assert!(
                text.contains("proof_obligation"),
                "expected proof obligation for {:?}: {text}",
                edge.spec
            );
        }
        if !edge.ok && edge.spec.contains("== 5") && edge.spec.contains("refl") {
            assert!(
                text.contains("proof_obligation") || text.contains("unproved"),
                "2+2==5 refl: {text}"
            );
        }
    }
}

#[test]
fn run_prints_sure() {
    let out = run(&["run", "--force"]);
    assert_eq!(
        code(&out),
        0,
        "stderr={}",
        String::from_utf8_lossy(&out.stderr)
    );
    let text = stdout(&out);
    let line = GOLD_RUN.trim();
    assert!(
        text.lines().any(|l| l == line),
        "expected a {line:?} line, got:\n{text}"
    );
}

#[test]
fn gold_a_and_b_are_different_printers() {
    assert!(
        GOLD_A.contains("Hello.greet : String"),
        "gold (a) is Core.show (space before colon)"
    );
    assert!(
        GOLD_B.contains("Hello.greet: String"),
        "gold (b) is FormCore.js show_defs"
    );
    assert!(!GOLD_B.contains("Hello.greet : String"));
    assert!(has_plus_nat(GOLD_A), "gold (a) nats are +N");
    assert!(!has_plus_nat(GOLD_B), "gold (b) nats have no +");
}

#[test]
fn gold_a_core_show_vs_term_to_core() {
    let mut ws = Workspace::open(repo().join("base"), hello_dir());
    let report = check_names(&["Hello.demo".into()], &mut ws);
    assert!(
        report.ok,
        "Hello.demo must check, diags={:?}",
        report.diagnostics
    );
    let shown = core_show(&report.defs);
    assert!(
        shown.contains("Hello.greet : String = \"Sure\";"),
        "core_show Hello.greet:\n{shown}"
    );
    assert!(
        shown.contains("Hello.demo : (IO Unit) = (IO.print Hello.greet);"),
        "core_show Hello.demo:\n{shown}"
    );
    assert!(shown.contains(" : "), "gold (a) space before colon");
    assert!(has_plus_nat(&shown), "gold (a) +N nats, got:\n{shown}");
    assert_gold_defs(&shown, GOLD_A, "gold (a) core_show vs JS term_to_core");
}

#[test]
fn gold_b_main_fmc_vs_js_cli() {
    let out = run(&["Main", "--fmc"]);
    assert_eq!(
        code(&out),
        0,
        "stderr={}",
        String::from_utf8_lossy(&out.stderr)
    );
    let shown = stdout(&out);
    assert!(
        shown.contains("Hello.greet: String = \"Sure\";"),
        "CLI --fmc is FormCore.js show_defs:\n{shown}"
    );
    assert!(!shown.contains("Hello.greet : String"));
    assert!(
        !has_plus_nat(&shown),
        "gold (b) must not print +N:\n{shown}"
    );
    assert!(shown.contains("put_string"));
    assert!(!shown.contains("http_listen"));
    assert_gold_defs(&shown, GOLD_B, "gold (b) sure Main --fmc vs JS CLI");
}

#[test]
fn host_slice_put_string_not_http_listen() {
    let out = run(&["build", "--force"]);
    assert_eq!(code(&out), 0, "{}", stdout(&out));
    let js_path = hello_dir().join("dist/Main.js");
    let js = std::fs::read_to_string(&js_path).unwrap_or_else(|e| {
        panic!("read {}: {e}", js_path.display());
    });
    assert!(js.contains("put_string"), "dist/Main.js missing put_string");
    assert!(
        !js.contains("http_listen"),
        "hello host slice must not include http_listen"
    );
}

#[test]
fn sure_test_hello_gate() {
    let out = run(&["test"]);
    let text = stdout(&out);
    assert_eq!(code(&out), 0, "{text}");
    assert!(text.contains("ok   Hello.Spec"), "{text}");
    assert!(text.contains("ok   2+2!=5"), "{text}");
    assert!(text.contains("ok   hole does not prove false"), "{text}");
    assert!(text.contains("ok   admit is not a proof"), "{text}");
    assert!(text.contains("ok   missing term"), "{text}");
    assert!(text.contains("ok   empty name"), "{text}");
    assert!(text.contains("ok   Unit is checked not proved"), "{text}");
    assert!(
        text.contains("ok   Nat.add is checked not proved"),
        "{text}"
    );
    assert!(text.contains("ok   sure run Main"), "{text}");
    assert!(text.contains(GOLD_RUN.trim()), "{text}");
}
