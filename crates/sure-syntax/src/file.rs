use crate::desugar::{mod_qual, qualify, resolve_defs};
use crate::lex::{Keyword, TokenKind};
use crate::name::Name;
use crate::parse::binder::forall_make;
use crate::parse::lambda::lambda_make;
use crate::parse::{ParseError, Parser};
use crate::span::Span;
use crate::term::{Def, Defs, Status};

impl Parser<'_> {
    /// `Sure.Parser.file`: optional `module` / `import`, then top-level defs, then qualify.
    pub(crate) fn file(
        &mut self,
        file: &str,
        code: &str,
        defs: &mut Defs,
    ) -> Result<(), ParseError> {
        let module = if self.at_keyword(Keyword::Module) {
            self.parse_mod()?
        } else {
            String::new()
        };
        let mut imps = Vec::new();
        while self.at_keyword(Keyword::Import) {
            imps.push(self.parse_imp()?);
        }
        let mut locals: Vec<Name> = Vec::new();
        while !self.at_eof() {
            let got = if self.at_keyword(Keyword::Type) {
                self.parse_adt(file, code, &module)?
            } else {
                vec![self.parse_def(file, code, &module)?]
            };
            for def in got {
                locals.push(def.name.clone());
                defs.entry(def.name.clone()).or_insert(def);
            }
        }
        rewrite(&module, &imps, &locals, defs);
        Ok(())
    }

    /// `Sure.Parser.file.mod`: `module Name exposing …` (exposing is consumed, not stored).
    fn parse_mod(&mut self) -> Result<String, ParseError> {
        if !self.at_keyword(Keyword::Module) {
            return Err(self.error("Expected 'module'."));
        }
        self.bump();
        let nam = self.name1()?;
        if self.at_keyword(Keyword::Exposing) {
            self.parse_exposing()?;
        }
        Ok(nam.to_string())
    }

    /// `Sure.Parser.file.imp`.
    fn parse_imp(&mut self) -> Result<(String, Vec<String>), ParseError> {
        if !self.at_keyword(Keyword::Import) {
            return Err(self.error("Expected 'import'."));
        }
        self.bump();
        let nam = self.name1()?;
        let names = if self.at_keyword(Keyword::Exposing) {
            self.parse_exposing()?
        } else {
            Vec::new()
        };
        Ok((nam.to_string(), names))
    }

    fn parse_exposing(&mut self) -> Result<Vec<String>, ParseError> {
        if !self.at_keyword(Keyword::Exposing) {
            return Err(self.error("Expected 'exposing'."));
        }
        self.bump();
        // `text("(..)")` before `items(name1)`.
        if matches!(self.peek_kind(), Some(TokenKind::LParen)) {
            let start = self.pos;
            self.bump();
            if self.at_ident("..") {
                self.bump();
                if matches!(self.peek_kind(), Some(TokenKind::RParen)) {
                    self.bump();
                    return Ok(vec!["..".into()]);
                }
            }
            self.pos = start;
        }
        self.items_names()
    }

    fn items_names(&mut self) -> Result<Vec<String>, ParseError> {
        if !matches!(self.peek_kind(), Some(TokenKind::LParen)) {
            return Err(self.error("Expected '('."));
        }
        self.bump();
        let mut names: Vec<String> = Vec::new();
        loop {
            if matches!(self.peek_kind(), Some(TokenKind::RParen)) {
                self.bump();
                return Ok(names);
            }
            if self.at_eof() {
                return Err(self.error("Expected ')'."));
            }
            names.push(self.name1()?.to_string());
            if matches!(self.peek_kind(), Some(TokenKind::Comma)) {
                self.bump();
            }
        }
    }

    /// `Sure.Parser.file.def`: `name(args): type \n body`.
    fn parse_def(&mut self, file: &str, code: &str, module: &str) -> Result<Def, ParseError> {
        let from = match self.peek() {
            Some(t) => t.span.from,
            None => {
                return Err(self.error("Expected a top-level definition or a type declaration."))
            }
        };
        let name0 = match self.name1() {
            Ok(n) => n,
            Err(_) => {
                return Err(self.error("Expected a top-level definition or a type declaration."))
            }
        };
        let args = self.binders_many(&TokenKind::Colon);
        if !matches!(self.peek_kind(), Some(TokenKind::Colon)) {
            return Err(self.error("Expected ':'."));
        }
        self.bump();
        let typ = self.term()?;
        let term = self.term()?;
        let upto = self.prev_upto();
        let name = mod_qual(module, &name0);
        let arit = args.len() as u32;
        let names: Vec<Name> = args.iter().map(|b| b.name.clone()).collect();
        let typ = forall_make(&args, typ);
        let term = lambda_make(names, term);
        Ok(Def {
            file: file.to_string(),
            code: code.to_string(),
            orig: Span::new(from, upto),
            name,
            term,
            typ,
            isct: false,
            arit,
            stat: Status::Init,
        })
    }
}

/// `Sure.Parser.file.rewrite`.
fn rewrite(module: &str, imps: &[(String, Vec<String>)], locals: &[Name], defs: &mut Defs) {
    if module.is_empty() && imps.is_empty() {
        return;
    }
    for name in locals {
        let Some(old) = defs.get(name).cloned() else {
            continue;
        };
        let term = qualify(&old.term, &|n| resolve_defs(module, locals, imps, n, defs));
        let typ = qualify(&old.typ, &|n| resolve_defs(module, locals, imps, n, defs));
        if let Some(def) = defs.get_mut(name) {
            def.term = term;
            def.typ = typ;
        }
    }
}

/// Parse `code` as a `.sure` file and merge defs (`Sure.Map.def` / `set_if_empty`).
pub fn parse_file(file: &str, code: &str, defs: &mut Defs) -> Result<(), ParseError> {
    let mut p = Parser::from_src(code)?;
    p.file(file, code, defs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desugar::{admit, app, equal, hol, monad_bind, r#ref, refl, strip_ori};
    use crate::term::Term;

    const HELLO: &str = include_str!("../../../examples/hello/src/Hello.sure");
    const MAIN: &str = include_str!("../../../examples/hello/src/Main.sure");

    fn parse(file: &str, src: &str) -> Defs {
        let mut defs = Defs::new();
        parse_file(file, src, &mut defs).expect("parse");
        defs
    }

    fn collect_refs(term: &Term, out: &mut Vec<String>) {
        match term {
            Term::Ref(n) => out.push(n.to_string()),
            Term::Ori { expr, .. } => collect_refs(expr, out),
            Term::App { func, argm } => {
                collect_refs(func, out);
                collect_refs(argm, out);
            }
            Term::Lam { body, .. } | Term::Imp { expr: body } => collect_refs(body, out),
            Term::All { xtyp, body, .. } => {
                collect_refs(xtyp, out);
                collect_refs(body, out);
            }
            Term::Let { expr, body, .. } | Term::Def { expr, body, .. } => {
                collect_refs(expr, out);
                collect_refs(body, out);
            }
            Term::Ann { term, typ, .. } => {
                collect_refs(term, out);
                collect_refs(typ, out);
            }
            _ => {}
        }
    }

    #[test]
    fn hello_sure_qualified_names() {
        let defs = parse("Hello.sure", HELLO);
        let names: Vec<&str> = defs.keys().map(|n| n.as_ref()).collect();
        assert_eq!(names, ["Hello.Spec", "Hello.demo", "Hello.greet"]);
        assert!(!defs.contains_key("greet"));
        assert!(!defs.contains_key("Spec"));
        assert!(!defs.contains_key("demo"));
    }

    #[test]
    fn hello_sure_no_unqualified_greet_refs() {
        let defs = parse("Hello.sure", HELLO);
        let mut refs = Vec::new();
        for def in defs.values() {
            collect_refs(&def.typ, &mut refs);
            collect_refs(&def.term, &mut refs);
        }
        assert!(
            !refs.iter().any(|n| n == "greet"),
            "unqualified greet in refs: {refs:?}"
        );
        assert!(refs.iter().any(|n| n == "Hello.greet"));
    }

    #[test]
    fn hello_greet_string() {
        let defs = parse("Hello.sure", HELLO);
        let greet = defs.get("Hello.greet").unwrap();
        assert_eq!(strip_ori(&greet.typ), r#ref("String"));
        assert_eq!(strip_ori(&greet.term), Term::Str("Sure".into()));
        assert_eq!(greet.arit, 0);
        assert!(!greet.isct);
        assert!(matches!(greet.stat, Status::Init));
        assert!(greet.orig.upto > greet.orig.from);
        assert!((greet.orig.upto as usize) <= HELLO.len());
    }

    #[test]
    fn hello_spec_equal_and_refl() {
        let defs = parse("Hello.sure", HELLO);
        let spec = defs.get("Hello.Spec").unwrap();
        assert_eq!(
            strip_ori(&spec.typ),
            equal(r#ref("Hello.greet"), Term::Str("Sure".into()))
        );
        assert_eq!(strip_ori(&spec.term), refl());
    }

    #[test]
    fn hello_demo_type_app_and_do() {
        let defs = parse("Hello.sure", HELLO);
        let demo = defs.get("Hello.demo").unwrap();
        assert_eq!(strip_ori(&demo.typ), app(r#ref("IO"), r#ref("Unit")));
        assert_eq!(
            strip_ori(&demo.term),
            app(r#ref("IO.print"), r#ref("Hello.greet"))
        );
    }

    #[test]
    fn main_sure_import_exposing() {
        let defs = parse("Main.sure", MAIN);
        assert!(defs.contains_key("Main"));
        assert!(!defs.contains_key("demo"));
        let main = defs.get("Main").unwrap();
        assert_eq!(strip_ori(&main.typ), app(r#ref("IO"), r#ref("Unit")));
        assert_eq!(strip_ori(&main.term), r#ref("Hello.demo"));
    }

    #[test]
    fn do_bind_does_not_qualify_bound_greet() {
        let src = r#"module Hello exposing (greet, demo)

greet: String
  "Sure"

demo: IO<Unit>
  IO {
    get greet = greet
    IO.print(greet)
  }
"#;
        let defs = parse("Hello.sure", src);
        let demo = strip_ori(&defs.get("Hello.demo").unwrap().term);
        let expected = monad_bind(
            r#ref("IO"),
            r#ref("IO.monad"),
            r#ref("Hello.greet"),
            Name::from("greet"),
            app(r#ref("IO.print"), r#ref("greet")),
        );
        assert_eq!(demo, expected);
    }

    #[test]
    fn hole_admit_bodies() {
        let src = "module M exposing (p, q)\n\np: greet == \"Sure\"\n  _\n\nq: greet == \"Sure\"\n  admit\n";
        let defs = parse("M.sure", src);
        assert_eq!(strip_ori(&defs.get("M.p").unwrap().term), hol());
        assert_eq!(strip_ori(&defs.get("M.q").unwrap().term), admit());
    }

    #[test]
    fn nat_adt_and_add_binders() {
        let defs = parse("Nat.sure", include_str!("../../../base/Nat.sure"));
        assert!(defs.contains_key("Nat"));
        assert!(defs.contains_key("Nat.zero"));
        assert!(defs.contains_key("Nat.succ"));
        assert!(defs.get("Nat.succ").unwrap().isct);
        assert_eq!(defs.get("Nat.succ").unwrap().arit, 1);
        assert_eq!(defs.get("Nat").unwrap().arit, 0);

        let add = parse("Nat/add.sure", include_str!("../../../base/Nat/add.sure"));
        let def = add.get("Nat.add").unwrap();
        assert_eq!(def.arit, 2);
        match strip_ori(&def.term) {
            Term::Lam { name, .. } => assert_eq!(name.as_ref(), "n"),
            other => panic!("expected lambda, got {other:?}"),
        }
    }

    #[test]
    fn char_alias_and_indexed_word() {
        let char_defs = parse("Char.sure", include_str!("../../../base/Char.sure"));
        assert_eq!(strip_ori(&char_defs.get("Char").unwrap().typ), Term::Typ);
        assert_eq!(
            strip_ori(&char_defs.get("Char").unwrap().term),
            r#ref("U16")
        );

        let word = parse("Word.sure", include_str!("../../../base/Word.sure"));
        assert!(word.contains_key("Word"));
        assert!(word.contains_key("Word.e"));
        assert!(word.contains_key("Word.o"));
        assert!(word.contains_key("Word.i"));
        assert_eq!(word.get("Word").unwrap().arit, 1);
        assert_eq!(word.get("Word.o").unwrap().arit, 3);
    }

    #[test]
    fn hello_closure_gold_files_parse() {
        let repo = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let gold = include_str!("../../../tests/gold/hello_closure.txt");
        let mut files = Vec::new();
        for name in gold.lines().map(str::trim).filter(|s| !s.is_empty()) {
            let path = file_of_name(&repo, name)
                .unwrap_or_else(|| panic!("no .sure file for gold name {name}"));
            if !files.iter().any(|p| p == &path) {
                files.push(path);
            }
        }
        assert!(
            files.len() >= 16,
            "expected a stdlib closure, got {} files: {files:?}",
            files.len()
        );
        for path in &files {
            let code = std::fs::read_to_string(path)
                .unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
            let mut defs = Defs::new();
            let rel = path.strip_prefix(&repo).unwrap_or(path);
            parse_file(rel.to_str().unwrap_or("_.sure"), &code, &mut defs)
                .unwrap_or_else(|e| panic!("parse {} failed: {e}\n{}", rel.display(), code));
            assert!(!defs.is_empty(), "parse {} produced no defs", rel.display());
        }
    }

    fn file_of_name(repo: &std::path::Path, name: &str) -> Option<std::path::PathBuf> {
        let dotted = name.replace('.', "/") + ".sure";
        let parent = name
            .rsplit_once('.')
            .map(|(a, _)| a.replace('.', "/") + ".sure")
            .unwrap_or_default();
        let root = name.split('.').next().unwrap_or(name).to_string() + ".sure";
        let rels = [dotted.as_str(), parent.as_str(), root.as_str()];
        for dir in ["examples/hello/src", "base"] {
            for rel in rels {
                if rel.is_empty() {
                    continue;
                }
                let p = repo.join(dir).join(rel);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
        None
    }
}
