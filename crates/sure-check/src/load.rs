//! `Sure.Synth.load`: search, parse whole files, `exposing (..)` imports.

use std::fs;
use std::path::PathBuf;

use sure_syntax::{file_imps, parse_file, Defs, Status};

use crate::files::files_of;
use crate::fix::{synth_one, Loader};
use crate::show::show;
use crate::workspace::Workspace;

/// `sure prove --json` shape (subset). Empty/missing names are data, not panics.
#[derive(Clone, Debug)]
pub struct Report {
    pub ok: bool,
    pub proved: bool,
    pub defs: Defs,
    pub diagnostics: Vec<String>,
}

/// `Sure.Synth.many`. Empty names are skipped; missing names keep prior defs.
pub fn synth_many<N: AsRef<str>>(names: &[N], mut defs: Defs, loader: &dyn Loader) -> Defs {
    for name in names {
        let name = name.as_ref();
        if name.is_empty() {
            continue;
        }
        if let Some(next) = synth_one(name, defs.clone(), loader) {
            defs = next;
        }
    }
    defs
}

/// Load and check each name through the workspace loader.
pub fn check_names(names: &[String], ws: &mut Workspace) -> Report {
    let defs = synth_many(names, Defs::new(), ws);
    report_of(names, defs)
}

pub fn is_proof_type(shown_type: &str) -> bool {
    let t = shown_type.trim();
    t.contains("==") || t.contains("Equal(") || t.contains("Not(Equal")
}

fn report_of(names: &[String], defs: Defs) -> Report {
    let mut ok = true;
    let mut proved = true;
    let mut diagnostics = Vec::new();
    if names.is_empty() {
        ok = false;
        proved = false;
    }
    for name in names {
        if name.is_empty() {
            ok = false;
            proved = false;
            diagnostics.push(String::from("empty name"));
            continue;
        }
        match defs.get(name.as_str()) {
            None => {
                ok = false;
                proved = false;
                diagnostics.push(format!("missing {name}"));
            }
            Some(d) => match &d.stat {
                Status::Done { .. } => {
                    if !is_proof_type(&show(&d.typ)) {
                        proved = false;
                    }
                }
                Status::Fail { errors } => {
                    ok = false;
                    proved = false;
                    for e in errors {
                        diagnostics.push(e.message.clone());
                    }
                }
                _ => {
                    ok = false;
                    proved = false;
                }
            },
        }
    }
    Report {
        ok,
        proved: ok && proved,
        defs,
        diagnostics,
    }
}

impl Loader for Workspace {
    fn load(&self, name: &str, defs: Defs) -> Option<Defs> {
        self.load_with(name, defs, &[])
    }

    fn cache_put(&self, name: &str, def: &sure_syntax::Def) {
        let _ = self.cache.put(name, def);
    }
}

impl Workspace {
    /// Parse the first `files_of` hit that actually contains `name`.
    pub fn load(&self, name: &str, defs: Defs) -> Option<Defs> {
        self.load_with(name, defs, &[])
    }

    fn load_with(&self, name: &str, defs: Defs, stack: &[String]) -> Option<Defs> {
        if name.is_empty() {
            return None;
        }
        if stack.iter().any(|s| s == name) {
            return Some(defs);
        }
        // Schema 2 records without a term blob miss (`decode`). Source load
        // is the fallback; `SURE_CACHE=0` and SURE_PATH shadows skip get.
        if self.cache.enabled && !self.shadowed(name) {
            let _ = self.cache.get(name);
        }
        self.load_go(name, &files_of(name), defs, stack)
    }

    fn shadowed(&self, name: &str) -> bool {
        files_of(name)
            .iter()
            .any(|f| find_code(f, &self.path_roots()).is_some())
    }

    fn load_go(
        &self,
        name: &str,
        files: &[String],
        mut defs: Defs,
        stack: &[String],
    ) -> Option<Defs> {
        let mut next_stack = stack.to_vec();
        next_stack.push(name.to_string());
        for file in files {
            let Some((_, code)) = self.read_kind_file(file) else {
                continue;
            };
            defs = self.load_imports(&file_imps(&code), defs, &next_stack);
            let mut parsed = defs.clone();
            // `Sure.Defs.read` stores the `files_of` candidate (`Hello.sure`), not
            // the absolute path of the winning root.
            if parse_file(file, &code, &mut parsed).is_err() {
                continue;
            }
            defs = parsed;
            if defs.contains_key(name) {
                return Some(defs);
            }
        }
        None
    }

    fn load_imports(
        &self,
        imps: &[(String, Vec<String>)],
        mut defs: Defs,
        stack: &[String],
    ) -> Defs {
        for (mod_name, exposed) in imps {
            if exposed.iter().any(|n| n == "..") {
                if let Some(got) = self.load_with(mod_name, defs.clone(), stack) {
                    defs = got;
                }
            }
        }
        defs
    }

    fn read_kind_file(&self, file: &str) -> Option<(PathBuf, String)> {
        find_code(file, &self.path_roots())
            .or_else(|| find_code(file, std::slice::from_ref(&self.base)))
    }
}

fn find_code(file: &str, roots: &[PathBuf]) -> Option<(PathBuf, String)> {
    for root in roots {
        if root.as_os_str().is_empty() {
            continue;
        }
        let path = root.join(file);
        match fs::read_to_string(&path) {
            Ok(code) if !code.is_empty() => return Some((path, code)),
            _ => continue,
        }
    }
    None
}

/// `main.js` `is_proof_type` / residual-hole policy stays on the shown type.
#[cfg(test)]
fn strip_ori(term: &sure_syntax::Term) -> &sure_syntax::Term {
    match term {
        sure_syntax::Term::Ori { expr, .. } => strip_ori(expr),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::is_base_dir;
    use std::fs;
    use std::path::{Path, PathBuf};
    use sure_syntax::Term;

    fn repo() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    fn hello_ws() -> Workspace {
        let repo = repo();
        Workspace::open(repo.join("base"), repo.join("examples/hello"))
    }

    fn write(dir: &Path, rel: &str, body: &str) {
        let path = dir.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, body).unwrap();
    }

    #[test]
    fn empty_and_missing_names_are_data() {
        let ws = hello_ws();
        assert!(ws.load("", Defs::new()).is_none());
        assert!(ws.load("NoSuchTerm.zzz", Defs::new()).is_none());
        let defs = synth_many(&[""], Defs::new(), &ws);
        assert!(defs.is_empty());
        let report = check_names(&[String::new()], &mut hello_ws());
        assert!(!report.ok);
        assert!(report.diagnostics.iter().any(|d| d.contains("empty")));
    }

    #[test]
    fn load_hello_spec_from_examples_hello() {
        let repo = repo();
        let base = repo.join("base");
        assert!(is_base_dir(&base), "SURE_BASE must be repo base/");
        let ws = Workspace::open(&base, repo.join("examples/hello"));
        let defs = ws.load("Hello.Spec", Defs::new()).expect("load Hello.Spec");
        assert!(defs.contains_key("Hello.Spec"));
        assert!(defs.contains_key("Hello.greet"));
        assert!(defs.contains_key("Hello.demo"));
        let file = &defs.get("Hello.Spec").unwrap().file;
        assert_eq!(
            file, "Hello.sure",
            "Def.file is the files_of name, not an absolute path, got {file}"
        );
    }

    #[test]
    fn synth_hello_spec_may_check() {
        let ws = hello_ws();
        let defs = ws.load("Hello.Spec", Defs::new()).unwrap();
        let defs = synth_one("Hello.Spec", defs, &ws).expect("synth Hello.Spec");
        assert!(defs.contains_key("Hello.Spec"));
        // Check may fail until later PRs; loading the name is this PR's gate.
        let _ = &defs.get("Hello.Spec").unwrap().stat;
    }

    #[test]
    fn first_file_that_parses_and_contains_name_wins() {
        let ws = hello_ws();
        let defs = ws.load("Nat.add", Defs::new()).expect("Nat.add");
        let file = &defs.get("Nat.add").unwrap().file;
        assert_eq!(
            file, "Nat/add.sure",
            "Nat.add lives in Nat/add.sure, got {file}"
        );
    }

    #[test]
    fn import_exposing_all_loads_module_then_resolves_short_names() {
        let dir = std::env::temp_dir().join(format!(
            "sure-load-open-{}-{}",
            std::process::id(),
            "exposing"
        ));
        let _ = fs::remove_dir_all(&dir);
        write(
            &dir,
            "src/M.sure",
            "module M exposing (M, x)\n\nM: Type\n  Type\n\nx: Type\n  Type\n",
        );
        write(
            &dir,
            "src/Use.sure",
            "module Use exposing (y)\nimport M exposing (..)\ny: Type\n  x\n",
        );
        write(&dir, "sure.json", r#"{"source-directories":["src"]}"#);
        let repo = repo();
        let ws = Workspace::open(repo.join("base"), &dir);
        let defs = ws.load("Use.y", Defs::new()).expect("Use.y");
        let y = defs.get("Use.y").unwrap();
        assert_eq!(strip_ori(&y.term), &Term::Ref("M.x".into()));
        assert!(defs.contains_key("M.x"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_boxes_exposing_boxes_stays_boxes() {
        let dir = std::env::temp_dir().join(format!(
            "sure-load-boxes-{}-{}",
            std::process::id(),
            "exposing"
        ));
        let _ = fs::remove_dir_all(&dir);
        write(
            &dir,
            "src/Boxes.sure",
            "module Boxes exposing (Boxes)\n\nBoxes: Type\n  Type\n",
        );
        write(
            &dir,
            "src/Use.sure",
            "module Use exposing (main)\nimport Boxes exposing (Boxes)\nmain: Type\n  Boxes\n",
        );
        write(&dir, "sure.json", r#"{"source-directories":["src"]}"#);
        let repo = repo();
        let ws = Workspace::open(repo.join("base"), &dir);
        let defs = ws.load("Use.main", Defs::new()).expect("Use.main");
        let main = defs.get("Use.main").unwrap();
        assert_eq!(
            strip_ori(&main.term),
            &Term::Ref("Boxes".into()),
            "import Boxes exposing (Boxes) stays Boxes, not Boxes.Boxes"
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
