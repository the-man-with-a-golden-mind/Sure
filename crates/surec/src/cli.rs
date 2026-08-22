//! argv → command. `--bun` / `--node` are stripped here; bun is child-only.

use std::env;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Cmd {
    Version,
    Help {
        topic: Option<String>,
    },
    Check {
        names: Vec<String>,
        json: bool,
    },
    Prove {
        names: Vec<String>,
        json: bool,
    },
    Build {
        term: String,
        force: bool,
    },
    Run {
        term: String,
        force: bool,
        extra: Vec<String>,
    },
    Fmt {
        target: Option<String>,
    },
    Test,
    Fmc {
        term: String,
    },
    /// `sure Term --run` tmp-file path is not in v0.2.0.
    TermRun {
        term: String,
    },
    Html,
    /// Bare `sure Term` typechecks like JS.
    CheckTerm {
        term: String,
    },
    Unsupported {
        cmd: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Parsed {
    pub bun: bool,
    pub cmd: Cmd,
}

const UNSUPPORTED: &[&str] = &[
    "new", "add", "remove", "install", "expose", "lsp", "agent", "doc", "impact", "theorems",
    "deps", "bench", "graph", "debug", "goal", "fill", "qc", "gen", "repl", "watch", "cache",
    "cover", "--cover", "--lib",
];

/// Parse CLI args (not including argv[0]). Reads `SURE_RUNTIME` for child bun.
pub fn parse(args: &[String]) -> Parsed {
    let node_flag = args.iter().any(|a| a == "--node");
    let bun_flag = args.iter().any(|a| a == "--bun");
    let runtime = env::var("SURE_RUNTIME").unwrap_or_default();
    let bun = if node_flag || runtime == "node" {
        false
    } else {
        bun_flag || runtime == "bun"
    };
    let argv: Vec<&str> = args
        .iter()
        .map(String::as_str)
        .filter(|a| *a != "--bun" && *a != "--node")
        .collect();

    if argv.contains(&"--html") {
        return Parsed {
            bun,
            cmd: Cmd::Html,
        };
    }

    let cmd = match argv.first().copied() {
        None | Some("--help") | Some("-h") => Cmd::Help { topic: None },
        Some("--version") | Some("-v") => Cmd::Version,
        Some("help") => Cmd::Help {
            topic: argv.get(1).map(|s| (*s).to_string()),
        },
        Some("check") => parse_check(&argv[1..]),
        Some("prove") => parse_prove(&argv[1..]),
        Some("build") | Some("emit") => parse_build(&argv[1..]),
        Some("run") => parse_run(&argv[1..]),
        Some("fmt") => Cmd::Fmt {
            target: argv.get(1).map(|s| (*s).to_string()),
        },
        Some("test") | Some("--test") => Cmd::Test,
        Some(name) if UNSUPPORTED.contains(&name) => Cmd::Unsupported {
            cmd: name.to_string(),
        },
        Some(name) => parse_term_form(name, &argv[1..]),
    };

    Parsed { bun, cmd }
}

fn parse_check(rest: &[&str]) -> Cmd {
    let mut json = false;
    let mut names = Vec::new();
    for a in rest {
        if *a == "--json" {
            json = true;
        } else if a.starts_with("--debug") {
            continue;
        } else {
            names.push((*a).to_string());
        }
    }
    Cmd::Check { names, json }
}

fn parse_prove(rest: &[&str]) -> Cmd {
    let mut json = false;
    let mut names = Vec::new();
    for a in rest {
        if *a == "--json" {
            json = true;
        } else if a.starts_with("--debug") {
            continue;
        } else {
            names.push((*a).to_string());
        }
    }
    Cmd::Prove { names, json }
}

fn parse_build(rest: &[&str]) -> Cmd {
    let mut force = false;
    let mut term = None;
    for a in rest {
        if *a == "--force" {
            force = true;
        } else if a.starts_with("--debug") {
            continue;
        } else if term.is_none() {
            term = Some((*a).to_string());
        }
    }
    Cmd::Build {
        term: term.unwrap_or_else(|| "Main".to_string()),
        force,
    }
}

fn parse_run(rest: &[&str]) -> Cmd {
    let mut force = false;
    let mut term = None;
    let mut extra = Vec::new();
    for a in rest {
        if *a == "--force" {
            force = true;
        } else if a.starts_with("--debug") {
            continue;
        } else if term.is_none() {
            term = Some((*a).to_string());
        } else {
            extra.push((*a).to_string());
        }
    }
    Cmd::Run {
        term: term.unwrap_or_else(|| "Main".to_string()),
        force,
        extra,
    }
}

fn parse_term_form(name: &str, rest: &[&str]) -> Cmd {
    match rest.first().copied() {
        Some("--fmc") => Cmd::Fmc {
            term: name.to_string(),
        },
        Some("--run") => Cmd::TermRun {
            term: name.to_string(),
        },
        Some("--html") => Cmd::Html,
        Some("--js") | Some("--scm") | Some("--show") | Some("--norm") => Cmd::Unsupported {
            cmd: rest[0].to_string(),
        },
        Some("--json") => Cmd::Check {
            names: vec![name.to_string()],
            json: true,
        },
        _ => Cmd::CheckTerm {
            term: name.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(args: &[&str]) -> Cmd {
        parse(&args.iter().map(|s| (*s).to_string()).collect::<Vec<_>>()).cmd
    }

    #[test]
    fn version_and_help() {
        assert_eq!(p(&["--version"]), Cmd::Version);
        assert_eq!(p(&["-v"]), Cmd::Version);
        assert_eq!(p(&[]), Cmd::Help { topic: None });
        assert_eq!(
            p(&["help", "start"]),
            Cmd::Help {
                topic: Some("start".into())
            }
        );
    }

    #[test]
    fn prove_build_run_defaults() {
        assert_eq!(
            p(&["prove", "Hello.Spec"]),
            Cmd::Prove {
                names: vec!["Hello.Spec".into()],
                json: false
            }
        );
        assert_eq!(
            p(&["build"]),
            Cmd::Build {
                term: "Main".into(),
                force: false
            }
        );
        assert_eq!(
            p(&["run", "Main", "a", "b"]),
            Cmd::Run {
                term: "Main".into(),
                force: false,
                extra: vec!["a".into(), "b".into()]
            }
        );
        assert_eq!(
            p(&["Main", "--fmc"]),
            Cmd::Fmc {
                term: "Main".into()
            }
        );
        assert_eq!(
            p(&["Main", "--run"]),
            Cmd::TermRun {
                term: "Main".into()
            }
        );
        assert_eq!(p(&["build", "--html"]), Cmd::Html);
        assert_eq!(p(&["lsp"]), Cmd::Unsupported { cmd: "lsp".into() });
    }

    #[test]
    fn bun_is_stripped() {
        let parsed = parse(&["--bun".into(), "run".into(), "Main".into()]);
        assert!(parsed.bun);
        assert_eq!(
            parsed.cmd,
            Cmd::Run {
                term: "Main".into(),
                force: false,
                extra: vec![]
            }
        );
    }
}
