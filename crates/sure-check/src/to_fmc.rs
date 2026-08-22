//! Lower checked Sure terms to FormCore. Keep `Nat`/`Chr`/`Str`; never `from_kind`.

use sure_syntax::{Defs, Name, Status, Term};

use crate::inline::inline;

/// Residual surface constructor after inline on an emitted def.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LowerError {
    ResidualSurface { name: Name, detail: String },
}

impl std::fmt::Display for LowerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LowerError::ResidualSurface { name, detail } => {
                write!(f, "{name}: {detail}")
            }
        }
    }
}

impl std::error::Error for LowerError {}

/// True for constructors FormCore does not have. Walking `Imp`/`Ori` so a
/// leftover hole under them still fails emit (inline already strips those).
pub fn has_residual_surface(term: &Term) -> bool {
    match term {
        Term::Hol { .. }
        | Term::Cse { .. }
        | Term::New { .. }
        | Term::Get { .. }
        | Term::Set { .. }
        | Term::Mut { .. }
        | Term::Ope { .. }
        | Term::Gol { .. }
        | Term::Num { .. } => true,
        Term::All { xtyp, body, .. } => has_residual_surface(xtyp) || has_residual_surface(body),
        Term::Lam { body, .. } => has_residual_surface(body),
        Term::App { func, argm } => has_residual_surface(func) || has_residual_surface(argm),
        Term::Let { expr, body, .. } | Term::Def { expr, body, .. } => {
            has_residual_surface(expr) || has_residual_surface(body)
        }
        Term::Ann { term, typ, .. } => has_residual_surface(term) || has_residual_surface(typ),
        Term::Imp { expr } | Term::Ori { expr, .. } => has_residual_surface(expr),
        Term::Var { .. }
        | Term::Ref(_)
        | Term::Typ
        | Term::Nat(_)
        | Term::Chr(_)
        | Term::Str(_) => false,
    }
}

/// Map a Sure term to FormCore. `Nat`/`Chr`/`Str` stay literals.
///
/// Leftover `Hol`/`Cse`/… become `Typ` here only so `to_fmc` stays total;
/// `defs_to_fmc` must reject them — release must not emit `Typ` for a hole.
pub fn to_fmc(term: &Term) -> sure_fmc::Term {
    match term {
        Term::Var { name, level } => sure_fmc::Term::Var {
            name: name.clone(),
            level: *level,
        },
        Term::Ref(name) => sure_fmc::Term::Ref(name.clone()),
        Term::Typ => sure_fmc::Term::Typ,
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        } => sure_fmc::Term::All {
            eras: *eras,
            self_name: self_name.clone(),
            name: name.clone(),
            xtyp: Box::new(to_fmc(xtyp)),
            body: Box::new(to_fmc(body)),
            bind_level: *bind_level,
        },
        Term::Lam {
            name,
            body,
            bind_level,
        } => sure_fmc::Term::Lam {
            name: name.clone(),
            body: Box::new(to_fmc(body)),
            bind_level: *bind_level,
        },
        Term::App { func, argm } => sure_fmc::Term::App {
            func: Box::new(to_fmc(func)),
            argm: Box::new(to_fmc(argm)),
        },
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => sure_fmc::Term::Let {
            name: name.clone(),
            expr: Box::new(to_fmc(expr)),
            body: Box::new(to_fmc(body)),
            bind_level: *bind_level,
        },
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => sure_fmc::Term::Def {
            name: name.clone(),
            expr: Box::new(to_fmc(expr)),
            body: Box::new(to_fmc(body)),
            bind_level: *bind_level,
        },
        Term::Ann { done, term, typ } => sure_fmc::Term::Ann {
            done: *done,
            term: Box::new(to_fmc(term)),
            typ: Box::new(to_fmc(typ)),
        },
        Term::Nat(n) => sure_fmc::Term::Nat(*n),
        Term::Chr(c) => sure_fmc::Term::Chr(*c),
        Term::Str(s) => sure_fmc::Term::Str(s.clone()),
        Term::Imp { expr } | Term::Ori { expr, .. } => to_fmc(expr),
        Term::Hol { .. }
        | Term::Cse { .. }
        | Term::New { .. }
        | Term::Get { .. }
        | Term::Set { .. }
        | Term::Mut { .. }
        | Term::Ope { .. }
        | Term::Gol { .. }
        | Term::Num { .. } => sure_fmc::Term::Typ,
    }
}

/// Inline done defs, then lower. Hard error if `Hol`/`Cse`/… remain (all profiles).
pub fn defs_to_fmc(defs: &Defs) -> Result<sure_fmc::Defs, LowerError> {
    let mut out = sure_fmc::Defs::new();
    for (name, def) in defs {
        if !matches!(def.stat, Status::Done { .. }) {
            continue;
        }
        let term = inline(&def.term, defs);
        let typ = inline(&def.typ, defs);
        if has_residual_surface(&term) || has_residual_surface(&typ) {
            return Err(LowerError::ResidualSurface {
                name: name.clone(),
                detail: String::from("Hol/Cse/New/Get left after inline; refusing to emit Typ"),
            });
        }
        out.insert(
            name.clone(),
            sure_fmc::Def {
                typ: to_fmc(&typ),
                term: to_fmc(&term),
            },
        );
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bind::{bind_term, bind_type};
    use crate::core_show::core_show;
    use sure_syntax::{parse_file, Bits, Def, Span};

    fn n(s: &str) -> Name {
        Name::from(s)
    }

    fn stub(name: &str, term: Term, typ: Term, stat: Status) -> Def {
        Def {
            file: "<stub>".into(),
            code: String::new(),
            orig: Span::new(0, 0),
            name: n(name),
            term,
            typ,
            isct: false,
            arit: 0,
            stat,
        }
    }

    #[test]
    fn keeps_nat_chr_str_not_typ() {
        assert_eq!(to_fmc(&Term::Nat(2)), sure_fmc::Term::Nat(2));
        assert_eq!(to_fmc(&Term::Chr('S')), sure_fmc::Term::Chr('S'));
        assert_eq!(
            to_fmc(&Term::Str("Sure".into())),
            sure_fmc::Term::Str("Sure".into())
        );
        assert_ne!(to_fmc(&Term::Nat(2)), sure_fmc::Term::Typ);
        assert_ne!(to_fmc(&Term::Str("Sure".into())), sure_fmc::Term::Typ);
    }

    #[test]
    fn strips_imp_and_ori() {
        let inner = Term::Nat(4);
        let ori = Term::Ori {
            orig: Span::new(0, 1),
            expr: Box::new(inner.clone()),
        };
        let imp = Term::Imp {
            expr: Box::new(Term::Str("x".into())),
        };
        assert_eq!(to_fmc(&ori), sure_fmc::Term::Nat(4));
        assert_eq!(to_fmc(&imp), sure_fmc::Term::Str("x".into()));
    }

    #[test]
    fn hol_cse_after_inline_is_hard_error() {
        let mut defs = Defs::new();
        defs.insert(
            n("Hole"),
            stub(
                "Hole",
                Term::Hol { path: Bits::E },
                Term::Typ,
                Status::Done { cached: false },
            ),
        );
        let err = defs_to_fmc(&defs).unwrap_err();
        match err {
            LowerError::ResidualSurface { name, detail } => {
                assert_eq!(name.as_ref(), "Hole");
                assert!(detail.contains("Hol/Cse"));
            }
        }

        let mut defs = Defs::new();
        defs.insert(
            n("Case"),
            stub(
                "Case",
                Term::Cse {
                    path: Bits::E,
                    expr: Box::new(Term::Ref(n("n"))),
                    name: n("n"),
                    with: Vec::new(),
                    cses: Default::default(),
                    moti: None,
                },
                Term::Typ,
                Status::Done { cached: false },
            ),
        );
        assert!(defs_to_fmc(&defs).is_err());
    }

    #[test]
    fn skips_non_done_defs() {
        let mut defs = Defs::new();
        defs.insert(n("Init"), stub("Init", Term::Typ, Term::Typ, Status::Init));
        let out = defs_to_fmc(&defs).unwrap();
        assert!(out.is_empty());
    }

    #[test]
    fn hello_greet_str_survives_defs_to_fmc() {
        let mut defs = Defs::new();
        parse_file(
            "Hello.sure",
            include_str!("../../../examples/hello/src/Hello.sure"),
            &mut defs,
        )
        .unwrap();
        let greet = defs.get("Hello.greet").unwrap();
        let mut one = Defs::new();
        one.insert(
            n("Hello.greet"),
            stub(
                "Hello.greet",
                bind_term(&greet.term),
                bind_type(&greet.typ),
                Status::Done { cached: false },
            ),
        );
        let fmc = defs_to_fmc(&one).expect("Hello.greet has no Hol/Cse");
        assert_eq!(
            fmc.get("Hello.greet").unwrap().term,
            sure_fmc::Term::Str("Sure".into())
        );
        assert_eq!(
            fmc.get("Hello.greet").unwrap().typ,
            sure_fmc::Term::Ref(n("String"))
        );
        let shown = core_show(&one);
        assert_eq!(shown, "Hello.greet : String = \"Sure\";\n");
        let parsed = sure_fmc::parse_defs(&shown).unwrap();
        assert_eq!(
            parsed.get("Hello.greet").unwrap().term,
            sure_fmc::Term::Str("Sure".into())
        );
    }

    #[test]
    fn sorted_btreemap_order() {
        let mut defs = Defs::new();
        defs.insert(
            n("Z.last"),
            stub(
                "Z.last",
                Term::Typ,
                Term::Typ,
                Status::Done { cached: false },
            ),
        );
        defs.insert(
            n("A.first"),
            stub(
                "A.first",
                Term::Nat(1),
                Term::Ref(n("Nat")),
                Status::Done { cached: false },
            ),
        );
        let fmc = defs_to_fmc(&defs).unwrap();
        let names: Vec<&str> = fmc.keys().map(|k| k.as_ref()).collect();
        assert_eq!(names, ["A.first", "Z.last"]);
        let shown = core_show(&defs);
        assert!(shown.starts_with("A.first :"));
        assert!(shown.find("A.first").unwrap() < shown.find("Z.last").unwrap());
    }
}
