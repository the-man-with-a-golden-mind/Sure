use crate::term::{Term, WithBinder};

/// Replace every `Var { level }` in `term`:
///   `level == a_lv` ⇒ clone `a`
///   `level == b_lv` ⇒ clone `b` (ignored if `b_lv` is `None`)
///
/// Do not substitute inside `a`/`b`. Walk nested binders; Sure levels are
/// absolute, so a match is replaced even under nested `All`/`Lam`/`Let`/`Def`.
pub fn subst_levels(term: &Term, a_lv: u32, a: &Term, b_lv: Option<u32>, b: &Term) -> Term {
    match term {
        Term::Var { name, level } => {
            if *level == a_lv {
                a.clone()
            } else if b_lv == Some(*level) {
                b.clone()
            } else {
                Term::Var {
                    name: name.clone(),
                    level: *level,
                }
            }
        }
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        } => Term::All {
            eras: *eras,
            self_name: self_name.clone(),
            name: name.clone(),
            xtyp: Box::new(subst_levels(xtyp, a_lv, a, b_lv, b)),
            body: Box::new(subst_levels(body, a_lv, a, b_lv, b)),
            bind_level: *bind_level,
        },
        Term::Lam {
            name,
            body,
            bind_level,
        } => Term::Lam {
            name: name.clone(),
            body: Box::new(subst_levels(body, a_lv, a, b_lv, b)),
            bind_level: *bind_level,
        },
        Term::App { func, argm } => Term::App {
            func: Box::new(subst_levels(func, a_lv, a, b_lv, b)),
            argm: Box::new(subst_levels(argm, a_lv, a, b_lv, b)),
        },
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => Term::Let {
            name: name.clone(),
            expr: Box::new(subst_levels(expr, a_lv, a, b_lv, b)),
            body: Box::new(subst_levels(body, a_lv, a, b_lv, b)),
            bind_level: *bind_level,
        },
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => Term::Def {
            name: name.clone(),
            expr: Box::new(subst_levels(expr, a_lv, a, b_lv, b)),
            body: Box::new(subst_levels(body, a_lv, a, b_lv, b)),
            bind_level: *bind_level,
        },
        Term::Ann { done, term, typ } => Term::Ann {
            done: *done,
            term: Box::new(subst_levels(term, a_lv, a, b_lv, b)),
            typ: Box::new(subst_levels(typ, a_lv, a, b_lv, b)),
        },
        Term::Cse {
            path,
            expr,
            name,
            with,
            cses,
            moti,
        } => Term::Cse {
            path: path.clone(),
            expr: Box::new(subst_levels(expr, a_lv, a, b_lv, b)),
            name: name.clone(),
            with: with
                .iter()
                .map(|w| WithBinder {
                    name: w.name.clone(),
                    term: subst_levels(&w.term, a_lv, a, b_lv, b),
                    typ: w.typ.as_ref().map(|t| subst_levels(t, a_lv, a, b_lv, b)),
                })
                .collect(),
            cses: cses
                .iter()
                .map(|(k, v)| (k.clone(), subst_levels(v, a_lv, a, b_lv, b)))
                .collect(),
            moti: moti
                .as_deref()
                .map(|t| Box::new(subst_levels(t, a_lv, a, b_lv, b))),
        },
        Term::New { args } => Term::New {
            args: args
                .iter()
                .map(|t| subst_levels(t, a_lv, a, b_lv, b))
                .collect(),
        },
        Term::Get { expr, fkey } => Term::Get {
            expr: Box::new(subst_levels(expr, a_lv, a, b_lv, b)),
            fkey: fkey.clone(),
        },
        Term::Set { expr, fkey, fval } => Term::Set {
            expr: Box::new(subst_levels(expr, a_lv, a, b_lv, b)),
            fkey: fkey.clone(),
            fval: Box::new(subst_levels(fval, a_lv, a, b_lv, b)),
        },
        Term::Mut { expr, fkey, ffun } => Term::Mut {
            expr: Box::new(subst_levels(expr, a_lv, a, b_lv, b)),
            fkey: fkey.clone(),
            ffun: Box::new(subst_levels(ffun, a_lv, a, b_lv, b)),
        },
        Term::Ope { name, arg0, arg1 } => Term::Ope {
            name: name.clone(),
            arg0: Box::new(subst_levels(arg0, a_lv, a, b_lv, b)),
            arg1: Box::new(subst_levels(arg1, a_lv, a, b_lv, b)),
        },
        Term::Imp { expr } => Term::Imp {
            expr: Box::new(subst_levels(expr, a_lv, a, b_lv, b)),
        },
        Term::Ori { orig, expr } => Term::Ori {
            orig: *orig,
            expr: Box::new(subst_levels(expr, a_lv, a, b_lv, b)),
        },
        Term::Ref(_)
        | Term::Typ
        | Term::Gol { .. }
        | Term::Hol { .. }
        | Term::Nat(_)
        | Term::Chr(_)
        | Term::Str(_)
        | Term::Num { .. } => term.clone(),
    }
}

/// HOAS apply of `All.body(s, x)`: self at `bind_level`, name at `bind_level+1`.
pub fn open_all(body: &Term, bind_level: u32, s: &Term, x: &Term) -> Term {
    subst_levels(body, bind_level, s, Some(bind_level + 1), x)
}

/// HOAS apply of `Lam.body(x)` (also `let`/`def` subst).
pub fn open_lam(body: &Term, bind_level: u32, x: &Term) -> Term {
    subst_levels(body, bind_level, x, None, x)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::name::Name;

    fn n(s: &str) -> Name {
        Name::from(s)
    }

    fn var(name: &str, level: u32) -> Term {
        Term::Var {
            name: n(name),
            level,
        }
    }

    fn lam(name: &str, bind_level: u32, body: Term) -> Term {
        Term::Lam {
            name: n(name),
            body: Box::new(body),
            bind_level,
        }
    }

    fn app(func: Term, argm: Term) -> Term {
        Term::App {
            func: Box::new(func),
            argm: Box::new(argm),
        }
    }

    /// 1. `open_all` at `ctx_size=0` substitutes self/name at levels 0/1.
    #[test]
    fn open_all_ctx0_self_name_levels() {
        let body = app(var("s", 0), var("x", 1));
        let opened = open_all(&body, 0, &Term::Ref(n("Self")), &Term::Ref(n("Arg")));
        assert_eq!(opened, app(Term::Ref(n("Self")), Term::Ref(n("Arg"))));
    }

    /// 2. `lam` vs `all` at empty ctx: self becomes the lambda; name is level 0.
    #[test]
    fn open_all_lam_vs_all_self_is_lambda() {
        let typv_body = app(var("s", 0), var("x", 1));
        let lam_term = lam("x", 0, var("x", 0));
        let opened = open_all(&typv_body, 0, &lam_term, &var("x", 0));
        assert_eq!(opened, app(lam_term, var("x", 0)));
    }

    /// 3. `open_lam` is `App(Lam, arg)` beta (`reduce.sure` 15).
    #[test]
    fn open_lam_beta_app() {
        let body = var("x", 0);
        assert_eq!(open_lam(&body, 0, &Term::Nat(2)), Term::Nat(2));
        let twice = app(var("x", 0), var("x", 0));
        assert_eq!(
            open_lam(&twice, 0, &Term::Nat(2)),
            app(Term::Nat(2), Term::Nat(2))
        );
    }

    /// 4. `open_lam` is `let`/`def` subst (`reduce.sure` 19–22).
    #[test]
    fn open_lam_let_def() {
        let body = app(var("x", 0), Term::Str("k".into()));
        assert_eq!(
            open_lam(&body, 0, &Term::Nat(4)),
            app(Term::Nat(4), Term::Str("k".into()))
        );
    }

    /// 5. `expand.cse` dummy levels: both self and name become `Var(_, 0)`.
    #[test]
    fn open_all_expand_cse_dummy_levels() {
        let body = app(var("s", 0), var("x", 1));
        let opened = open_all(&body, 0, &var("s", 0), &var("x", 0));
        assert_eq!(opened, app(var("s", 0), var("x", 0)));

        let body = app(var("s", 5), var("x", 6));
        let opened = open_all(&body, 5, &var("s", 0), &var("x", 0));
        assert_eq!(opened, app(var("s", 0), var("x", 0)));
    }

    #[test]
    fn subst_does_not_walk_replacement() {
        let body = var("s", 0);
        // `a` itself has a var at `b_lv`; must not be rewritten after cloning.
        let a = var("x", 1);
        let b = Term::Nat(9);
        assert_eq!(subst_levels(&body, 0, &a, Some(1), &b), var("x", 1));
    }

    #[test]
    fn subst_walks_nested_binders_without_shift() {
        // Absolute levels: Var(0) under a nested Lam still matches outer self.
        let inner = lam("y", 2, var("s", 0));
        let opened = open_all(&inner, 0, &Term::Ref(n("S")), &Term::Ref(n("X")));
        assert_eq!(opened, lam("y", 2, Term::Ref(n("S"))));
    }

    #[test]
    fn subst_walks_cse_with_get() {
        let cse = Term::Cse {
            path: crate::term::Bits::E,
            expr: Box::new(var("n", 0)),
            name: n("n"),
            with: vec![WithBinder {
                name: n("w"),
                term: var("n", 0),
                typ: Some(var("n", 1)),
            }],
            cses: [(
                n("succ"),
                Term::Get {
                    expr: Box::new(var("n", 0)),
                    fkey: "pred".into(),
                },
            )]
            .into_iter()
            .collect(),
            moti: Some(Box::new(var("n", 1))),
        };
        let out = subst_levels(&cse, 0, &Term::Nat(1), Some(1), &Term::Nat(2));
        match out {
            Term::Cse {
                expr,
                with,
                cses,
                moti,
                ..
            } => {
                assert_eq!(*expr, Term::Nat(1));
                assert_eq!(with[0].term, Term::Nat(1));
                assert_eq!(with[0].typ.as_ref(), Some(&Term::Nat(2)));
                assert_eq!(
                    cses.get("succ"),
                    Some(&Term::Get {
                        expr: Box::new(Term::Nat(1)),
                        fkey: "pred".into(),
                    })
                );
                assert_eq!(moti.as_deref(), Some(&Term::Nat(2)));
            }
            _ => panic!("expected Cse"),
        }
    }
}
