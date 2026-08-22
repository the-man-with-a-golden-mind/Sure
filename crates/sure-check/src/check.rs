//! `Sure.Term.check`. Residual `Hol`/`Gol` after a clean check fail in `synth_one`.

use std::collections::HashSet;

use sure_syntax::{open_all, open_lam, Defs, Name, Span, Status, Term, WithBinder};

use crate::bind::PathBuilder;
use crate::context;
use crate::equal::equal_go;
use crate::error::{Check, Error, TypeSide};
use crate::expand::{
    self, app, expand_cse, expand_get, expand_mut, expand_new, expand_num, expand_ope, hol, r#ref,
    unori, var,
};
use crate::reduce::reduce;

/// `Sure.Term.check`.
#[allow(clippy::too_many_arguments)]
pub fn check(
    term: &Term,
    expected: Option<&Term>,
    defs: &Defs,
    ctx: &[(Name, Term)],
    path: &PathBuilder,
    orig: Option<Span>,
) -> Check<Term> {
    infer(term, expected, defs, ctx, path, orig).and_then(|infr| match expected {
        None => Check::pure(infr),
        Some(ty) => {
            let eqls = equal_go(ty, &infr, defs, ctx.len() as u32, &HashSet::new());
            eqls.and_then(|ok| {
                if ok {
                    Check::pure(ty.clone())
                } else {
                    Check::result(
                        Some(ty.clone()),
                        vec![Error::TypeMismatch {
                            origin: orig,
                            expected: TypeSide::Term(ty.clone()),
                            detected: TypeSide::Term(infr),
                            context: ctx.to_vec(),
                        }],
                    )
                }
            })
        }
    })
}

/// `Sure.Term.check.direct`.
pub fn check_direct(term: &Term, defs: &Defs) -> Check<Term> {
    check(term, None, defs, &[], &PathBuilder::nil(), None).then(|| Check::pure(term.clone()))
}

/// `Sure.Term.check.patch`.
pub fn check_patch(term: Term, expected: Option<&Term>, path: &PathBuilder) -> Check<Term> {
    Check::result(
        expected.cloned(),
        vec![Error::Patch {
            path: path.to_bits(),
            term,
        }],
    )
}

/// `Sure.Term.check.cant_infer`.
pub fn cant_infer(
    term: &Term,
    expected: Option<&Term>,
    ctx: &[(Name, Term)],
    orig: Option<Span>,
) -> Check<Term> {
    Check::result(
        expected.cloned(),
        vec![Error::CantInfer {
            origin: orig,
            term: term.clone(),
            context: ctx.to_vec(),
        }],
    )
}

#[allow(clippy::too_many_arguments)]
fn infer(
    term: &Term,
    expected: Option<&Term>,
    defs: &Defs,
    ctx: &[(Name, Term)],
    path: &PathBuilder,
    orig: Option<Span>,
) -> Check<Term> {
    match term {
        Term::Ref(name) => match defs.get(name) {
            None => Check::result(
                expected.cloned(),
                vec![Error::UndefinedReference {
                    origin: orig,
                    name: name.clone(),
                }],
            ),
            Some(got) => {
                let ref_type = got.typ.clone();
                match &got.stat {
                    Status::Init => Check::result(
                        Some(ref_type),
                        vec![Error::Waiting {
                            name: got.name.clone(),
                        }],
                    ),
                    Status::Wait | Status::Done { .. } => Check::pure(ref_type),
                    Status::Fail { .. } => Check::result(
                        Some(ref_type),
                        vec![Error::Indirect {
                            name: got.name.clone(),
                        }],
                    ),
                }
            }
        },
        Term::Var { name, level } => match context::at_last(*level, ctx) {
            None => Check::result(
                expected.cloned(),
                vec![Error::UndefinedReference {
                    origin: orig,
                    name: name.clone(),
                }],
            ),
            Some(ty) => Check::pure(ty.clone()),
        },
        Term::Typ => Check::pure(Term::Typ),
        Term::All {
            self_name,
            name,
            xtyp,
            body,
            bind_level,
            ..
        } => {
            let ctx_size = ctx.len() as u32;
            let self_var = var(self_name.clone(), ctx_size);
            let body_var = var(name.clone(), ctx_size.saturating_add(1));
            let body_ctx = context::cons(
                name.clone(),
                xtyp.as_ref().clone(),
                &context::cons(self_name.clone(), term.clone(), ctx),
            );
            let opened = open_all(body, *bind_level, &self_var, &body_var);
            check(xtyp, Some(&Term::Typ), defs, ctx, &path.o(), orig).then(move || {
                check(&opened, Some(&Term::Typ), defs, &body_ctx, &path.i(), orig)
                    .then(|| Check::pure(Term::Typ))
            })
        }
        Term::Lam {
            name,
            body,
            bind_level,
        } => match expected {
            None => {
                let lam_type = hol();
                let lam_term = Term::Ann {
                    done: false,
                    term: Box::new(term.clone()),
                    typ: Box::new(lam_type),
                };
                check_patch(lam_term, expected, path)
            }
            Some(ty) => {
                let typv = reduce(ty, defs);
                match typv {
                    Term::All {
                        name: _,
                        xtyp,
                        body: all_body,
                        bind_level: all_bl,
                        ..
                    } => {
                        let ctx_size = ctx.len() as u32;
                        let body_var = var(name.clone(), ctx_size);
                        let body_typ = open_all(&all_body, all_bl, term, &body_var);
                        let body_ctx = context::cons(name.clone(), xtyp.as_ref().clone(), ctx);
                        let opened = open_lam(body, *bind_level, &body_var);
                        check(&opened, Some(&body_typ), defs, &body_ctx, &path.o(), orig)
                            .then(|| Check::pure(ty.clone()))
                    }
                    _ => Check::result(
                        Some(ty.clone()),
                        vec![Error::TypeMismatch {
                            origin: orig,
                            expected: TypeSide::Text("function".into()),
                            detected: TypeSide::Term(ty.clone()),
                            context: ctx.to_vec(),
                        }],
                    ),
                }
            }
        },
        Term::App { func, argm } => {
            check(func, None, defs, ctx, &path.o(), orig).and_then(|func_typ| {
                let func_typ = reduce(&func_typ, defs);
                match func_typ {
                    Term::All {
                        xtyp,
                        body,
                        bind_level,
                        ..
                    } => {
                        let xtyp_u = unori(&xtyp);
                        let argm_u = unori(argm);
                        match xtyp_u {
                            Term::Imp { expr: xtyp_expr } => match argm_u {
                                Term::Imp { expr: argm_expr } => {
                                    check(argm_expr, Some(xtyp_expr), defs, ctx, &path.i(), orig)
                                        .then(|| {
                                            Check::pure(open_all(
                                                &body, bind_level, func, argm_expr,
                                            ))
                                        })
                                }
                                _ => {
                                    let patched = app(
                                        app(
                                            func.as_ref().clone(),
                                            Term::Imp {
                                                expr: Box::new(hol()),
                                            },
                                        ),
                                        argm.as_ref().clone(),
                                    );
                                    check_patch(patched, expected, path)
                                }
                            },
                            _ => check(argm, Some(&xtyp), defs, ctx, &path.i(), orig)
                                .then(|| Check::pure(open_all(&body, bind_level, func, argm))),
                        }
                    }
                    other => {
                        let orig = match func.as_ref() {
                            Term::Ori { orig, .. } => Some(*orig),
                            _ => orig,
                        };
                        Check::result(
                            expected.cloned(),
                            vec![Error::TypeMismatch {
                                origin: orig,
                                expected: TypeSide::Text("function".into()),
                                detected: TypeSide::Term(other),
                                context: ctx.to_vec(),
                            }],
                        )
                    }
                }
            })
        }
        Term::Ann { done, term, typ } => {
            if *done {
                Check::pure(typ.as_ref().clone())
            } else {
                check(term, Some(typ), defs, ctx, &path.o(), orig).then(|| {
                    check(typ, Some(&Term::Typ), defs, ctx, &path.i(), orig)
                        .then(|| Check::pure(typ.as_ref().clone()))
                })
            }
        }
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let ctx_size = ctx.len() as u32;
            check(expr, None, defs, ctx, &path.o(), orig).and_then(|expr_typ| {
                let body_val = open_lam(body, *bind_level, &var(name.clone(), ctx_size));
                let body_ctx = context::cons(name.clone(), expr_typ, ctx);
                check(&body_val, expected, defs, &body_ctx, &path.i(), orig)
            })
        }
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => check(expr, None, defs, ctx, &path.o(), orig).and_then(|expr_typ| {
            let body_val = open_lam(body, *bind_level, expr);
            let body_ctx = context::cons(name.clone(), expr_typ, ctx);
            check(&body_val, expected, defs, &body_ctx, &path.i(), orig)
        }),
        Term::Nat(_) => match expected {
            None => check_direct(&r#ref("Nat"), defs),
            Some(ty) => match expand::get_name_of_self_type(ty, defs) {
                None => check_direct(&r#ref("Nat"), defs),
                Some(tnam) if tnam == "Nat" => check_direct(&r#ref("Nat"), defs),
                Some(tnam) => {
                    let cast = app(r#ref(format!("{tnam}.from_nat")), term.clone());
                    check_patch(cast, expected, path)
                }
            },
        },
        Term::Chr(_) => check_direct(&r#ref("Word.from_bits"), defs)
            .then(|| check_direct(&r#ref("U16.new"), defs))
            .then(|| check_direct(&r#ref("Char"), defs)),
        Term::Str(_) => check_direct(&r#ref("Word.from_bits"), defs)
            .then(|| check_direct(&r#ref("U16.new"), defs))
            .then(|| check_direct(&r#ref("String"), defs)),
        Term::Num { sign, numb, frac } => {
            let dsug = expand_num(*sign, *numb, *frac, expected, defs);
            check_patch(dsug, expected, path)
        }
        Term::Cse {
            expr,
            name,
            with,
            cses,
            moti,
            ..
        } => check(expr, None, defs, ctx, &path.o(), orig).and_then(|etyp| {
            infer_types_of_with(with, defs, ctx, path, orig).and_then(|wyth| {
                match expand_cse(
                    expr,
                    name,
                    &wyth,
                    cses,
                    moti.as_deref(),
                    &etyp,
                    expected,
                    defs,
                    ctx,
                ) {
                    None => cant_infer(term, expected, ctx, orig),
                    Some(dsug) => check_patch(dsug, expected, path),
                }
            })
        }),
        Term::New { args } => match expand_new(args, expected, defs) {
            None => cant_infer(term, expected, ctx, orig),
            Some(dsug) => check_patch(dsug, expected, path),
        },
        Term::Get { expr, fkey } => {
            check(expr, None, defs, ctx, &path.o(), orig).and_then(|etyp| {
                match expand_get(expr, fkey, &etyp, defs) {
                    None => cant_infer(term, expected, ctx, orig),
                    Some(dsug) => check_patch(dsug, expected, path),
                }
            })
        }
        Term::Set { expr, fkey, fval } => {
            check(expr, None, defs, ctx, &path.o(), orig).and_then(|etyp| {
                match expand_mut(expr, fkey, |_| fval.as_ref().clone(), &etyp, defs) {
                    None => cant_infer(term, expected, ctx, orig),
                    Some(dsug) => check_patch(dsug, expected, path),
                }
            })
        }
        Term::Mut { expr, fkey, ffun } => {
            check(expr, None, defs, ctx, &path.o(), orig).and_then(|etyp| {
                match expand_mut(
                    expr,
                    fkey,
                    |x| app(ffun.as_ref().clone(), x.clone()),
                    &etyp,
                    defs,
                ) {
                    None => cant_infer(term, expected, ctx, orig),
                    Some(dsug) => check_patch(dsug, expected, path),
                }
            })
        }
        Term::Ope { name, arg0, arg1 } => {
            let otyp = expected.cloned().unwrap_or_else(hol);
            match expand_ope(true, name, arg0, arg1, &otyp, defs) {
                Some(dsug) => check_patch(dsug, expected, path),
                None => {
                    check(arg0, None, defs, ctx, &path.o(), orig).and_then(|otyp| match expand_ope(
                        false, name, arg0, arg1, &otyp, defs,
                    ) {
                        None => cant_infer(term, expected, ctx, orig),
                        Some(dsug) => check_patch(dsug, expected, path),
                    })
                }
            }
        }
        Term::Gol { name, dref, verb } => Check::result(
            expected.cloned(),
            vec![Error::ShowGoal {
                name: name.clone(),
                dref: dref.clone(),
                verb: *verb,
                goal: expected.cloned(),
                context: ctx.to_vec(),
            }],
        ),
        Term::Hol { .. } => Check::result(expected.cloned(), Vec::new()),
        Term::Imp { expr } => check(expr, expected, defs, ctx, path, orig),
        Term::Ori { orig: span, expr } => check(expr, expected, defs, ctx, path, Some(*span)),
    }
}

fn infer_types_of_with(
    vars: &[WithBinder],
    defs: &Defs,
    ctx: &[(Name, Term)],
    path: &PathBuilder,
    orig: Option<Span>,
) -> Check<Vec<WithBinder>> {
    match vars.split_first() {
        None => Check::pure(Vec::new()),
        Some((head, tail)) => {
            let type_of = match &head.typ {
                None => check(&head.term, None, defs, ctx, path, orig).map(Some),
                Some(t) => Check::pure(Some(t.clone())),
            };
            type_of.and_then(|typ| {
                infer_types_of_with(tail, defs, ctx, path, orig).map(|rest| {
                    let mut out = vec![WithBinder {
                        name: head.name.clone(),
                        term: head.term.clone(),
                        typ,
                    }];
                    out.extend(rest);
                    out
                })
            })
        }
    }
}

pub(crate) fn residual_goal(typ: &Term) -> Error {
    Error::ShowGoal {
        name: Name::from("_"),
        dref: Vec::new(),
        verb: false,
        goal: Some(typ.clone()),
        context: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bind::{bind, bind_term, bind_type};
    use crate::has_holes::has_holes;
    use sure_syntax::{parse_file, parse_term, Bits, Def, Span, Status};

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

    fn done(name: &str, term: Term, typ: Term) -> Def {
        stub(name, term, typ, Status::Done { cached: false })
    }

    fn empty() -> Defs {
        Defs::new()
    }

    fn parse(src: &str) -> Term {
        parse_term(src).unwrap_or_else(|e| panic!("parse {src:?}: {e}"))
    }

    fn strip(term: &Term) -> &Term {
        match term {
            Term::Ori { expr, .. } => strip(expr),
            _ => term,
        }
    }

    #[test]
    fn type_is_type() {
        let chk = check(
            &Term::Typ,
            Some(&Term::Typ),
            &empty(),
            &[],
            &PathBuilder::nil(),
            None,
        );
        assert!(chk.errors.is_empty(), "{:?}", chk.errors);
        assert_eq!(chk.value, Some(Term::Typ));
    }

    #[test]
    fn hol_checks_without_error() {
        let hol = Term::Hol { path: Bits::E };
        let chk = check(
            &hol,
            Some(&Term::Typ),
            &empty(),
            &[],
            &PathBuilder::nil(),
            None,
        );
        assert!(chk.errors.is_empty(), "{:?}", chk.errors);
        assert_eq!(chk.value, Some(Term::Typ));
        assert!(has_holes(&hol));
    }

    #[test]
    fn string_literal_check_direct() {
        let mut defs = empty();
        for name in ["Word.from_bits", "U16.new", "String"] {
            defs.insert(n(name), done(name, Term::Typ, Term::Typ));
        }
        let term = bind_term(&parse(r#""Sure""#));
        let ty = r#ref("String");
        let chk = check(&term, Some(&ty), &defs, &[], &PathBuilder::nil(), None);
        assert!(chk.errors.is_empty(), "{:?}", chk.errors);
        assert_eq!(chk.value.as_ref().map(strip), Some(&ty));
    }

    #[test]
    fn nat_literal_check_direct() {
        let mut defs = empty();
        defs.insert(n("Nat"), done("Nat", Term::Typ, Term::Typ));
        let term = bind_term(&parse("4"));
        let ty = r#ref("Nat");
        let chk = check(&term, Some(&ty), &defs, &[], &PathBuilder::nil(), None);
        assert!(chk.errors.is_empty(), "{:?}", chk.errors);
    }

    #[test]
    fn chr_literal_check_direct() {
        let mut defs = empty();
        for name in ["Word.from_bits", "U16.new", "Char"] {
            defs.insert(n(name), done(name, Term::Typ, Term::Typ));
        }
        let term = Term::Chr('S');
        let ty = r#ref("Char");
        let chk = check(&term, Some(&ty), &defs, &[], &PathBuilder::nil(), None);
        assert!(chk.errors.is_empty(), "{:?}", chk.errors);
    }

    #[test]
    fn string_without_stubs_is_undefined_reference() {
        let term = bind_term(&parse(r#""Sure""#));
        let ty = r#ref("String");
        let chk = check(&term, Some(&ty), &empty(), &[], &PathBuilder::nil(), None);
        assert!(
            chk.errors
                .iter()
                .any(|e| matches!(e, Error::UndefinedReference { name, .. } if name.as_ref() == "Word.from_bits")),
            "{:?}",
            chk.errors
        );
    }

    #[test]
    fn lam_checks_against_all() {
        let term = bind_term(&parse("(x) x"));
        let ty = bind_type(&parse("(x: Type) -> Type"));
        let chk = check(&term, Some(&ty), &empty(), &[], &PathBuilder::nil(), None);
        assert!(chk.errors.is_empty(), "{:?}", chk.errors);
    }

    #[test]
    fn app_of_stub_id() {
        let mut defs = empty();
        let id_term = bind_term(&parse("(x) x"));
        let id_ty = bind_type(&parse("(x: Type) -> Type"));
        defs.insert(n("id"), done("id", id_term, id_ty));
        let term = bind_term(&parse("id(Type)"));
        let chk = check(
            &term,
            Some(&Term::Typ),
            &defs,
            &[],
            &PathBuilder::nil(),
            None,
        );
        assert!(chk.errors.is_empty(), "{:?}", chk.errors);
    }

    #[test]
    fn cse_expands_via_patch_not_reduce() {
        let mut defs = empty();
        parse_file(
            "Nat.sure",
            include_str!("../../../base/Nat.sure"),
            &mut defs,
        )
        .expect("parse Nat");
        for def in defs.values_mut() {
            def.term = bind(&[], &PathBuilder::typ(), &def.term);
            def.typ = bind(&[], &PathBuilder::term(), &def.typ);
            def.stat = Status::Done { cached: false };
        }
        let src = "case n { zero: m, succ: m }";
        // Innermost-at-head: m at 1, n (outer) at 0.
        let bind_ctx = vec![(n("m"), var("m", 1)), (n("n"), var("n", 0))];
        let term = bind(&bind_ctx, &PathBuilder::term(), &parse(src));
        let nat = r#ref("Nat");
        let ctx = vec![(n("m"), nat.clone()), (n("n"), nat.clone())];
        let chk = check(&term, Some(&nat), &defs, &ctx, &PathBuilder::nil(), None);
        let patch = chk.errors.iter().find_map(|e| match e {
            Error::Patch { term, .. } => Some(term),
            _ => None,
        });
        let dsug = patch.unwrap_or_else(|| panic!("expected cse patch, got {:?}", chk.errors));
        assert!(
            !matches!(strip(dsug), Term::Cse { .. }),
            "cse must expand, got {dsug:?}"
        );
        assert!(
            matches!(strip(dsug), Term::App { .. }),
            "expanded cse is an application spine, got {dsug:?}"
        );
    }

    #[test]
    fn get_expands_via_patch() {
        let mut defs = empty();
        parse_file(
            "U16.sure",
            include_str!("../../../base/U16.sure"),
            &mut defs,
        )
        .expect("parse U16");
        for def in defs.values_mut() {
            def.term = bind(&[], &PathBuilder::typ(), &def.term);
            def.typ = bind(&[], &PathBuilder::term(), &def.typ);
            def.stat = Status::Done { cached: false };
        }
        let x = Term::Var {
            name: n("x"),
            level: 0,
        };
        let term = Term::Get {
            expr: Box::new(x),
            fkey: "value".into(),
        };
        let ctx = vec![(n("x"), r#ref("U16"))];
        let chk = check(&term, None, &defs, &ctx, &PathBuilder::nil(), None);
        let patch = chk.errors.iter().find_map(|e| match e {
            Error::Patch { term, .. } => Some(term),
            _ => None,
        });
        let dsug = patch.unwrap_or_else(|| panic!("expected get patch, got {:?}", chk.errors));
        assert!(
            !matches!(strip(dsug), Term::Get { .. }),
            "get must expand, got {dsug:?}"
        );
    }

    #[test]
    fn refl_fills_equal_holes() {
        let mut defs = empty();
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
        defs.insert(n("Nat"), done("Nat", Term::Typ, Term::Typ));
        let typ = bind_type(&parse("1 == 1"));
        let term = bind_term(&parse("refl"));
        let chk = check(&term, Some(&typ), &defs, &[], &PathBuilder::term(), None);
        assert!(
            chk.errors.iter().any(Error::is_patch),
            "refl should patch Equal holes, got {:?}",
            chk.errors
        );
    }

    #[test]
    fn word_from_bits_and_hello_spec_check() {
        use crate::workspace::Workspace;
        use std::path::PathBuf;
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut ws = Workspace::open(repo.join("base"), repo.join("examples/hello"));
        let w = crate::load::check_names(&["Word.from_bits".into()], &mut ws);
        assert!(w.ok, "Word.from_bits must check, diags={:?}", w.diagnostics);
        let spec = crate::load::check_names(&["Hello.Spec".into()], &mut ws);
        assert!(
            spec.ok && spec.proved,
            "Hello.Spec must prove, ok={} proved={} diags={:?}",
            spec.ok,
            spec.proved,
            spec.diagnostics
        );
    }

    #[test]
    fn gol_emits_show_goal() {
        let term = Term::Gol {
            name: n("admit"),
            dref: Vec::new(),
            verb: false,
        };
        let chk = check(
            &term,
            Some(&Term::Typ),
            &empty(),
            &[],
            &PathBuilder::nil(),
            None,
        );
        assert!(
            chk.errors
                .iter()
                .any(|e| matches!(e, Error::ShowGoal { name, .. } if name.as_ref() == "admit")),
            "{:?}",
            chk.errors
        );
    }
}
