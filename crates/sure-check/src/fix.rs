//! `Sure.Synth.fix` and a loader-stub `Synth.one` (file load is PR 9).

use sure_syntax::{Bits, Def, Defs, Name, Span, Status, Term};

use crate::bind::{bind, PathBuilder};
use crate::check::{check, residual_goal};
use crate::error::Error;
use crate::has_holes::has_holes;
use crate::status;

/// File loading is PR 9. Unit tests stub `Defs` and may inject missing names here.
pub trait Loader {
    fn load(&self, name: &str, defs: Defs) -> Option<Defs>;
}

/// No-op loader: missing names stay missing (`undefined_reference`).
pub struct StubLoader;

impl Loader for StubLoader {
    fn load(&self, _name: &str, _defs: Defs) -> Option<Defs> {
        None
    }
}

/// `Sure.Term.patch_at` with a constant replacement (`Synth.fix` patches).
pub fn patch_at(path: &Bits, term: &Term, repl: &Term) -> Term {
    match term {
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) => Term::All {
                eras: *eras,
                self_name: self_name.clone(),
                name: name.clone(),
                xtyp: Box::new(patch_at(p, xtyp, repl)),
                body: body.clone(),
                bind_level: *bind_level,
            },
            Bits::I(p) => Term::All {
                eras: *eras,
                self_name: self_name.clone(),
                name: name.clone(),
                xtyp: xtyp.clone(),
                body: Box::new(patch_at(p, body, repl)),
                bind_level: *bind_level,
            },
        },
        Term::Lam {
            name,
            body,
            bind_level,
        } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) | Bits::I(p) => Term::Lam {
                name: name.clone(),
                body: Box::new(patch_at(p, body, repl)),
                bind_level: *bind_level,
            },
        },
        Term::App { func, argm } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) => Term::App {
                func: Box::new(patch_at(p, func, repl)),
                argm: argm.clone(),
            },
            Bits::I(p) => Term::App {
                func: func.clone(),
                argm: Box::new(patch_at(p, argm, repl)),
            },
        },
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) => Term::Let {
                name: name.clone(),
                expr: Box::new(patch_at(p, expr, repl)),
                body: body.clone(),
                bind_level: *bind_level,
            },
            Bits::I(p) => Term::Let {
                name: name.clone(),
                expr: expr.clone(),
                body: Box::new(patch_at(p, body, repl)),
                bind_level: *bind_level,
            },
        },
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) => Term::Def {
                name: name.clone(),
                expr: Box::new(patch_at(p, expr, repl)),
                body: body.clone(),
                bind_level: *bind_level,
            },
            Bits::I(p) => Term::Def {
                name: name.clone(),
                expr: expr.clone(),
                body: Box::new(patch_at(p, body, repl)),
                bind_level: *bind_level,
            },
        },
        Term::Ann { done, term, typ } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) => Term::Ann {
                done: *done,
                term: Box::new(patch_at(p, term, repl)),
                typ: typ.clone(),
            },
            Bits::I(p) => Term::Ann {
                done: *done,
                term: term.clone(),
                typ: Box::new(patch_at(p, typ, repl)),
            },
        },
        Term::Cse {
            path: cse_path,
            expr,
            name,
            with,
            cses,
            moti,
        } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) => Term::Cse {
                path: cse_path.clone(),
                expr: Box::new(patch_at(p, expr, repl)),
                name: name.clone(),
                with: with.clone(),
                cses: cses.clone(),
                moti: moti.clone(),
            },
            Bits::I(_) => term.clone(),
        },
        Term::New { args } => match path {
            Bits::E => repl.clone(),
            other => Term::New {
                args: patch_list(other, args, repl),
            },
        },
        Term::Get { expr, fkey } => match path {
            Bits::E => repl.clone(),
            other => Term::Get {
                expr: Box::new(patch_at(bits_pred(other), expr, repl)),
                fkey: fkey.clone(),
            },
        },
        Term::Set { expr, fkey, fval } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) => Term::Set {
                expr: Box::new(patch_at(p, expr, repl)),
                fkey: fkey.clone(),
                fval: fval.clone(),
            },
            Bits::I(p) => Term::Set {
                expr: expr.clone(),
                fkey: fkey.clone(),
                fval: Box::new(patch_at(p, fval, repl)),
            },
        },
        Term::Mut { expr, fkey, ffun } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) => Term::Mut {
                expr: Box::new(patch_at(p, expr, repl)),
                fkey: fkey.clone(),
                ffun: ffun.clone(),
            },
            Bits::I(p) => Term::Mut {
                expr: expr.clone(),
                fkey: fkey.clone(),
                ffun: Box::new(patch_at(p, ffun, repl)),
            },
        },
        Term::Ope { name, arg0, arg1 } => match path {
            Bits::E => repl.clone(),
            Bits::O(p) => Term::Ope {
                name: name.clone(),
                arg0: Box::new(patch_at(p, arg0, repl)),
                arg1: arg1.clone(),
            },
            Bits::I(p) => Term::Ope {
                name: name.clone(),
                arg0: arg0.clone(),
                arg1: Box::new(patch_at(p, arg1, repl)),
            },
        },
        Term::Imp { expr } => Term::Imp {
            expr: Box::new(patch_at(path, expr, repl)),
        },
        Term::Ori { orig, expr } => Term::Ori {
            orig: *orig,
            expr: Box::new(patch_at(path, expr, repl)),
        },
        _ => match path {
            Bits::E => repl.clone(),
            Bits::O(_) | Bits::I(_) => term.clone(),
        },
    }
}

fn bits_pred(path: &Bits) -> &Bits {
    match path {
        Bits::E => path,
        Bits::O(p) | Bits::I(p) => p,
    }
}

fn patch_list(path: &Bits, list: &[Term], repl: &Term) -> Vec<Term> {
    match path {
        Bits::E => Vec::new(),
        Bits::O(p) => match list.split_first() {
            None => Vec::new(),
            Some((head, tail)) => {
                let mut out = vec![patch_at(p, head, repl)];
                out.extend(tail.iter().cloned());
                out
            }
        },
        Bits::I(p) => match list.split_first() {
            None => Vec::new(),
            Some((head, tail)) => {
                let mut out = vec![head.clone()];
                out.extend(patch_list(p, tail, repl));
                out
            }
        },
    }
}

/// `Sure.Synth.fix`. `undefined_reference` is treated like `waiting`.
#[allow(clippy::too_many_arguments)]
pub fn synth_fix(
    file: &str,
    code: &str,
    orig: Span,
    name: &Name,
    mut term: Term,
    mut typ: Term,
    isct: bool,
    arit: u32,
    mut defs: Defs,
    errs: &[Error],
    mut fixd: bool,
    loader: &dyn Loader,
) -> Option<Defs> {
    for err in errs {
        match err {
            Error::Waiting { name: wait } | Error::UndefinedReference { name: wait, .. } => {
                let before_stat = defs.get(wait).map(|d| std::mem::discriminant(&d.stat));
                let before_len = defs.len();
                match synth_one(wait, defs.clone(), loader) {
                    None => {}
                    Some(new_defs) => {
                        let after_stat =
                            new_defs.get(wait).map(|d| std::mem::discriminant(&d.stat));
                        if after_stat != before_stat || new_defs.len() != before_len {
                            fixd = true;
                        }
                        defs = new_defs;
                    }
                }
            }
            Error::Patch { path, term: repl } => match path {
                Bits::E => return None,
                Bits::O(p) => {
                    term = patch_at(p, &term, repl);
                    fixd = true;
                }
                Bits::I(p) => {
                    typ = patch_at(p, &typ, repl);
                    fixd = true;
                }
            },
            _ => {}
        }
    }
    if fixd {
        let typ = bind(&[], &PathBuilder::typ(), &typ);
        let term = bind(&[], &PathBuilder::term(), &term);
        defs.insert(
            name.clone(),
            Def {
                file: file.to_string(),
                code: code.to_string(),
                orig,
                name: name.clone(),
                term,
                typ,
                isct,
                arit,
                stat: Status::Init,
            },
        );
        Some(defs)
    } else {
        None
    }
}

/// `Sure.Synth.one` without file IO. Missing names go through `Loader`.
pub fn synth_one(name: &str, mut defs: Defs, loader: &dyn Loader) -> Option<Defs> {
    let key = Name::from(name);
    let def = match defs.get(&key) {
        Some(d) => d.clone(),
        None => {
            let loaded = loader.load(name, defs)?;
            return synth_one(name, loaded, loader);
        }
    };
    match def.stat {
        Status::Wait | Status::Done { .. } | Status::Fail { .. } => Some(defs),
        Status::Init => {
            let typ = bind(&[], &PathBuilder::typ(), &def.typ);
            let term = bind(&[], &PathBuilder::term(), &def.term);
            if let Some(slot) = defs.get_mut(&key) {
                slot.stat = Status::Wait;
                slot.term = term.clone();
                slot.typ = typ.clone();
            }
            let checked = check(
                &typ,
                Some(&Term::Typ),
                &defs,
                &[],
                &PathBuilder::typ(),
                None,
            )
            .then(|| check(&term, Some(&typ), &defs, &[], &PathBuilder::term(), None));
            if checked.errors.is_empty() {
                if has_holes(&term) {
                    let err = residual_goal(&typ);
                    let mut def = def;
                    def.term = term;
                    def.typ = typ;
                    status::put_def(&mut defs, def, status::fail(&[err]));
                    Some(defs)
                } else {
                    let mut def = def;
                    def.term = term;
                    def.typ = typ;
                    status::put_def(&mut defs, def, status::done(false));
                    Some(defs)
                }
            } else {
                match synth_fix(
                    &def.file,
                    &def.code,
                    def.orig,
                    &key,
                    term,
                    typ,
                    def.isct,
                    def.arit,
                    defs.clone(),
                    &checked.errors,
                    false,
                    loader,
                ) {
                    None => {
                        status::put_def(&mut defs, def, status::fail(&checked.errors));
                        Some(defs)
                    }
                    Some(fixed) => synth_one(name, fixed, loader),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sure_syntax::{parse_file, parse_term, Bits};

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
    fn residual_hol_after_clean_check_fails() {
        let mut defs = Defs::new();
        defs.insert(
            n("Bad"),
            stub("Bad", Term::Hol { path: Bits::E }, Term::Typ, Status::Init),
        );
        let defs = synth_one("Bad", defs, &StubLoader).unwrap();
        assert!(
            matches!(defs.get("Bad").unwrap().stat, Status::Fail { .. }),
            "residual Hol must fail, got {:?}",
            defs.get("Bad").unwrap().stat
        );
    }

    #[test]
    fn residual_gol_fails() {
        let mut defs = Defs::new();
        defs.insert(
            n("Adm"),
            stub(
                "Adm",
                Term::Gol {
                    name: n("admit"),
                    dref: Vec::new(),
                    verb: false,
                },
                Term::Typ,
                Status::Init,
            ),
        );
        let defs = synth_one("Adm", defs, &StubLoader).unwrap();
        assert!(matches!(defs.get("Adm").unwrap().stat, Status::Fail { .. }));
    }

    #[test]
    fn type_type_synth_done() {
        let mut defs = Defs::new();
        defs.insert(n("U"), stub("U", Term::Typ, Term::Typ, Status::Init));
        let defs = synth_one("U", defs, &StubLoader).unwrap();
        assert!(matches!(defs.get("U").unwrap().stat, Status::Done { .. }));
    }

    #[test]
    fn waiting_loads_init_def() {
        let mut defs = Defs::new();
        defs.insert(n("B"), stub("B", Term::Typ, Term::Typ, Status::Init));
        defs.insert(
            n("A"),
            stub("A", Term::Ref(n("B")), Term::Typ, Status::Init),
        );
        let defs = synth_one("A", defs, &StubLoader).unwrap();
        assert!(matches!(defs.get("A").unwrap().stat, Status::Done { .. }));
        assert!(matches!(defs.get("B").unwrap().stat, Status::Done { .. }));
    }

    struct OneShotLoader {
        name: String,
        def: Def,
    }

    impl Loader for OneShotLoader {
        fn load(&self, name: &str, mut defs: Defs) -> Option<Defs> {
            if name == self.name {
                defs.insert(n(&self.name), self.def.clone());
                Some(defs)
            } else {
                None
            }
        }
    }

    #[test]
    fn undefined_reference_loads() {
        let mut defs = Defs::new();
        defs.insert(
            n("A"),
            stub("A", Term::Ref(n("B")), Term::Typ, Status::Init),
        );
        let loader = OneShotLoader {
            name: "B".into(),
            def: stub("B", Term::Typ, Term::Typ, Status::Init),
        };
        let defs = synth_one("A", defs, &loader).unwrap();
        assert!(matches!(defs.get("A").unwrap().stat, Status::Done { .. }));
        assert!(matches!(defs.get("B").unwrap().stat, Status::Done { .. }));
    }

    #[test]
    fn synth_fix_applies_equal_hole_patch() {
        let mut defs = Defs::new();
        defs.insert(
            n("Fill"),
            stub("Fill", Term::Typ, Term::Hol { path: Bits::E }, Status::Init),
        );
        let defs = synth_one("Fill", defs, &StubLoader).unwrap();
        assert!(
            matches!(defs.get("Fill").unwrap().stat, Status::Done { .. }),
            "hole in type should be patched to Type, got {:?}",
            defs.get("Fill").unwrap().stat
        );
        assert_eq!(defs.get("Fill").unwrap().typ, Term::Typ);
    }

    #[test]
    fn patch_at_replaces_term_side_hole() {
        let hol = Term::Hol {
            path: Bits::O(Box::new(Bits::E)),
        };
        let term = Term::App {
            func: Box::new(hol),
            argm: Box::new(Term::Typ),
        };
        let out = patch_at(&Bits::O(Box::new(Bits::E)), &term, &Term::Nat(4));
        match out {
            Term::App { func, argm } => {
                assert_eq!(*func, Term::Nat(4));
                assert_eq!(*argm, Term::Typ);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn refl_fills_equal_holes_via_synth_fix() {
        let mut defs = Defs::new();
        parse_file(
            "Equal.sure",
            include_str!("../../../base/Equal.sure"),
            &mut defs,
        )
        .expect("parse Equal");
        for def in defs.values_mut() {
            def.term = bind(&[], &PathBuilder::typ(), &def.term);
            def.typ = bind(&[], &PathBuilder::term(), &def.typ);
            def.stat = Status::Done { cached: false };
        }
        let typ = parse_term("Type == Type").unwrap();
        let term = parse_term("refl").unwrap();
        defs.insert(n("Spec"), stub("Spec", term, typ, Status::Init));
        let defs = synth_one("Spec", defs, &StubLoader).unwrap();
        let spec = defs.get("Spec").unwrap();
        assert!(
            matches!(spec.stat, Status::Done { .. }),
            "refl should fill Equal holes, got {:?}",
            spec.stat
        );
        assert!(!crate::has_holes::has_holes(&spec.term));
    }
}
