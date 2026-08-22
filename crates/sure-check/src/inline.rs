//! `Sure.Term.inline` / `inline.reduce` / `inline.names`.

use sure_syntax::{open_all, open_lam, Defs, Name, Term};

fn var(name: Name, level: u32) -> Term {
    Term::Var { name, level }
}

/// Names whose `Ref` unfolds during inline (`Sure.Term.inline.names`).
fn is_inline_name(name: &str) -> bool {
    matches!(
        name,
        "Monad.pure"
            | "Monad.bind"
            | "Monad.new"
            | "Parser.monad"
            | "Parser.bind"
            | "Parser.pure"
            | "Sure.Check.pure"
            | "Sure.Check.bind"
            | "Sure.Check.monad"
            | "Sure.Check.value"
            | "Sure.Check.none"
    )
}

/// `Sure.Term.inline.reduce`.
pub fn inline_reduce(term: &Term, defs: &Defs) -> Term {
    match term {
        Term::Ref(name) if is_inline_name(name) => match defs.get(name) {
            Some(def) => inline_reduce(&def.term, defs),
            None => term.clone(),
        },
        Term::App { func, argm } => {
            let func = inline_reduce(func, defs);
            match func {
                Term::Lam {
                    body, bind_level, ..
                } => inline_reduce(&open_lam(&body, bind_level, argm), defs),
                Term::Let {
                    name,
                    expr,
                    body,
                    bind_level,
                } => {
                    let x = Term::Var {
                        name: name.clone(),
                        level: bind_level,
                    };
                    let opened = open_lam(&body, bind_level, &x);
                    let app = Term::App {
                        func: Box::new(opened),
                        argm: argm.clone(),
                    };
                    Term::Let {
                        name,
                        expr,
                        body: Box::new(inline_reduce(&app, defs)),
                        bind_level,
                    }
                }
                _ => term.clone(),
            }
        }
        Term::Imp { expr } | Term::Ori { expr, .. } => inline_reduce(expr, defs),
        _ => term.clone(),
    }
}

/// `Sure.Term.inline`. Strips `Imp`/`Ori`. Does not walk leftover `Cse`/`Get`/….
pub fn inline(term: &Term, defs: &Defs) -> Term {
    match inline_reduce(term, defs) {
        Term::Ref(name) => Term::Ref(name),
        Term::Var { name, level } => Term::Var { name, level },
        Term::Typ => Term::Typ,
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        } => {
            let s = var(self_name.clone(), bind_level);
            let x = var(name.clone(), bind_level.saturating_add(1));
            Term::All {
                eras,
                self_name,
                name,
                xtyp: Box::new(inline(&xtyp, defs)),
                body: Box::new(inline(&open_all(&body, bind_level, &s, &x), defs)),
                bind_level,
            }
        }
        Term::Lam {
            name,
            body,
            bind_level,
        } => {
            let x = var(name.clone(), bind_level);
            Term::Lam {
                name,
                body: Box::new(inline(&open_lam(&body, bind_level, &x), defs)),
                bind_level,
            }
        }
        Term::App { func, argm } => Term::App {
            func: Box::new(inline(&func, defs)),
            argm: Box::new(inline(&argm, defs)),
        },
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let x = var(name.clone(), bind_level);
            Term::Let {
                name,
                expr: Box::new(inline(&expr, defs)),
                body: Box::new(inline(&open_lam(&body, bind_level, &x), defs)),
                bind_level,
            }
        }
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => {
            let x = var(name.clone(), bind_level);
            Term::Def {
                name,
                expr: Box::new(inline(&expr, defs)),
                body: Box::new(inline(&open_lam(&body, bind_level, &x), defs)),
                bind_level,
            }
        }
        Term::Ann { done, term, typ } => Term::Ann {
            done,
            term: Box::new(inline(&term, defs)),
            typ: Box::new(inline(&typ, defs)),
        },
        Term::Gol { name, dref, verb } => Term::Gol { name, dref, verb },
        Term::Hol { path } => Term::Hol { path },
        Term::Nat(n) => Term::Nat(n),
        Term::Chr(c) => Term::Chr(c),
        Term::Str(s) => Term::Str(s),
        Term::Ori { expr, .. } => inline(&expr, defs),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bind::bind_term;
    use sure_syntax::{parse_file, parse_term, Def, Name, Span, Status};

    fn n(s: &str) -> Name {
        Name::from(s)
    }

    fn stub(name: &str, term: Term) -> Def {
        Def {
            file: "<stub>".into(),
            code: String::new(),
            orig: Span::new(0, 0),
            name: n(name),
            term,
            typ: Term::Typ,
            isct: false,
            arit: 0,
            stat: Status::Done { cached: false },
        }
    }

    fn parse(src: &str) -> Term {
        bind_term(&parse_term(src).unwrap())
    }

    #[test]
    fn beta_reduces_app_of_lam() {
        let empty = Defs::new();
        let term = parse("((x) x)(4)");
        assert_eq!(inline(&term, &empty), Term::Nat(4));
    }

    #[test]
    fn strips_ori_and_imp() {
        let empty = Defs::new();
        let inner = Term::Str("Sure".into());
        let ori = Term::Ori {
            orig: Span::new(0, 1),
            expr: Box::new(inner.clone()),
        };
        let imp = Term::Imp {
            expr: Box::new(inner.clone()),
        };
        assert_eq!(inline(&ori, &empty), inner);
        assert_eq!(inline(&imp, &empty), inner);
    }

    #[test]
    fn inlinable_ref_unfolds_def_term() {
        let mut defs = Defs::new();
        defs.insert(n("Monad.bind"), stub("Monad.bind", Term::Nat(7)));
        let term = Term::Ref(n("Monad.bind"));
        assert_eq!(inline(&term, &defs), Term::Nat(7));
    }

    #[test]
    fn non_inlinable_ref_stays() {
        let mut defs = Defs::new();
        defs.insert(n("IO.print"), stub("IO.print", Term::Nat(1)));
        let term = Term::Ref(n("IO.print"));
        assert_eq!(inline(&term, &defs), term);
    }

    #[test]
    fn leftover_cse_is_not_walked() {
        let empty = Defs::new();
        let cse = Term::Cse {
            path: sure_syntax::Bits::E,
            expr: Box::new(Term::Ref(n("n"))),
            name: n("n"),
            with: Vec::new(),
            cses: [(n("zero"), Term::Nat(0)), (n("succ"), Term::Nat(1))]
                .into_iter()
                .collect(),
            moti: None,
        };
        assert!(matches!(cse, Term::Cse { .. }));
        assert!(matches!(inline(&cse, &empty), Term::Cse { .. }));
    }

    #[test]
    fn hello_greet_inline_keeps_str() {
        let mut defs = Defs::new();
        parse_file(
            "Hello.sure",
            include_str!("../../../examples/hello/src/Hello.sure"),
            &mut defs,
        )
        .unwrap();
        let greet = bind_term(&defs.get("Hello.greet").unwrap().term);
        assert_eq!(inline(&greet, &defs), Term::Str("Sure".into()));
    }
}
