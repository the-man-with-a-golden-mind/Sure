//! `Sure.Term.bind` / `bind.holes`. Context is innermost-at-head.

use sure_syntax::{Bits, Name, Term, WithBinder};

/// Innermost binder at index 0 (`Sure.Context` during bind: name → value).
type Context = [(Name, Term)];

/// `Sure.Path.Builder` (`Bits -> Bits`) stored as wraps; first applied is outermost.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PathBuilder {
    /// `false` = `o`, `true` = `i`. Index 0 is applied first (outermost).
    ops: Vec<bool>,
}

impl PathBuilder {
    pub fn nil() -> Self {
        Self { ops: Vec::new() }
    }

    /// Parser/check term path: `(x) Bits.o(x)`.
    pub fn term() -> Self {
        Self::nil().o()
    }

    /// Parser/check type path: `(x) Bits.i(x)`.
    pub fn typ() -> Self {
        Self::nil().i()
    }

    pub fn o(&self) -> Self {
        let mut s = self.clone();
        s.ops.push(false);
        s
    }

    pub fn i(&self) -> Self {
        let mut s = self.clone();
        s.ops.push(true);
        s
    }

    /// `Sure.Path.Builder.nat`: `nat(0)=o`, `nat(succ)=i(nat(pred))`.
    pub fn nat(&self, n: u32) -> Self {
        let mut s = self.o();
        for _ in 0..n {
            s.ops.push(true);
        }
        s
    }

    pub fn to_bits(&self) -> Bits {
        let mut b = Bits::E;
        for &is_i in self.ops.iter().rev() {
            b = if is_i {
                Bits::I(Box::new(b))
            } else {
                Bits::O(Box::new(b))
            };
        }
        b
    }
}

/// `Sure.Term.bind` with empty context and the term-side path.
pub fn bind_term(term: &Term) -> Term {
    bind(&[], &PathBuilder::term(), term)
}

/// `Sure.Term.bind` with empty context and the type-side path.
pub fn bind_type(term: &Term) -> Term {
    bind(&[], &PathBuilder::typ(), term)
}

/// `Sure.Term.bind`. Converts leftover `Ref`s via `Context.find`, `Var` via
/// `List.at_last`. Records `bind_level = vars.len()` on binders.
pub fn bind(vars: &Context, path: &PathBuilder, term: &Term) -> Term {
    bind_go(vars, path, term, false)
}

/// `Sure.Term.bind.holes`: hole paths only; do not resolve refs (case branches).
pub fn bind_holes(vars: &Context, path: &PathBuilder, term: &Term) -> Term {
    bind_go(vars, path, term, true)
}

fn bind_go(vars: &Context, path: &PathBuilder, term: &Term, holes_only: bool) -> Term {
    match term {
        Term::Ref(name) => {
            if holes_only {
                Term::Ref(name.clone())
            } else {
                match context_find(name, vars) {
                    Some(got) => got.clone(),
                    None => Term::Ref(name.clone()),
                }
            }
        }
        Term::Var { name, level } => {
            if holes_only {
                Term::Var {
                    name: name.clone(),
                    level: *level,
                }
            } else {
                match at_last(*level, vars) {
                    Some(got) => got.clone(),
                    None => Term::Var {
                        name: name.clone(),
                        level: *level,
                    },
                }
            }
        }
        Term::Typ => Term::Typ,
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            ..
        } => {
            let vlen = vars.len() as u32;
            let xtyp = Box::new(bind_go(vars, &path.o(), xtyp, holes_only));
            let body = if holes_only {
                Box::new(bind_go(vars, &path.i(), body, true))
            } else {
                let inner = extend_all(vars, self_name, name, vlen);
                Box::new(bind_go(&inner, &path.i(), body, false))
            };
            Term::All {
                eras: *eras,
                self_name: self_name.clone(),
                name: name.clone(),
                xtyp,
                body,
                bind_level: vlen,
            }
        }
        Term::Lam { name, body, .. } => {
            let vlen = vars.len() as u32;
            let body = if holes_only {
                Box::new(bind_go(vars, &path.o(), body, true))
            } else {
                let inner = extend_one(vars, name, vlen);
                Box::new(bind_go(&inner, &path.o(), body, false))
            };
            Term::Lam {
                name: name.clone(),
                body,
                bind_level: vlen,
            }
        }
        Term::App { func, argm } => Term::App {
            func: Box::new(bind_go(vars, &path.o(), func, holes_only)),
            argm: Box::new(bind_go(vars, &path.i(), argm, holes_only)),
        },
        Term::Let {
            name, expr, body, ..
        } => bind_let_like(true, vars, path, name, expr, body, holes_only),
        Term::Def {
            name, expr, body, ..
        } => bind_let_like(false, vars, path, name, expr, body, holes_only),
        Term::Ann { done, term, typ } => Term::Ann {
            done: *done,
            term: Box::new(bind_go(vars, &path.o(), term, holes_only)),
            typ: Box::new(bind_go(vars, &path.i(), typ, holes_only)),
        },
        Term::Gol { name, dref, verb } => Term::Gol {
            name: name.clone(),
            dref: dref.clone(),
            verb: *verb,
        },
        Term::Hol { .. } => Term::Hol {
            path: path.to_bits(),
        },
        Term::Nat(n) => Term::Nat(*n),
        Term::Chr(c) => Term::Chr(*c),
        Term::Str(s) => Term::Str(s.clone()),
        Term::Num { sign, numb, frac } => Term::Num {
            sign: *sign,
            numb: *numb,
            frac: *frac,
        },
        Term::Cse {
            expr,
            name,
            with,
            cses,
            moti,
            ..
        } => {
            let expr = Box::new(bind_go(vars, &path.o(), expr, holes_only));
            let with = with
                .iter()
                .map(|w| WithBinder {
                    name: w.name.clone(),
                    term: bind_go(vars, path, &w.term, holes_only),
                    typ: w.typ.as_ref().map(|t| bind_go(vars, path, t, holes_only)),
                })
                .collect();
            // Branches/motive: never resolve refs (`SmartMotive.replace` matches by name).
            let branch_path = path.i().i();
            let cses = cses
                .iter()
                .map(|(k, v)| (k.clone(), bind_holes(vars, &branch_path, v)))
                .collect();
            let moti_path = path.i().o();
            let moti = moti
                .as_deref()
                .map(|t| Box::new(bind_holes(vars, &moti_path, t)));
            Term::Cse {
                path: path.to_bits(),
                expr,
                name: name.clone(),
                with,
                cses,
                moti,
            }
        }
        Term::New { args } => Term::New {
            args: args
                .iter()
                .enumerate()
                .map(|(idx, arg)| bind_go(vars, &path.nat(idx as u32), arg, holes_only))
                .collect(),
        },
        Term::Get { expr, fkey } => Term::Get {
            expr: Box::new(bind_go(vars, &path.o(), expr, holes_only)),
            fkey: fkey.clone(),
        },
        Term::Set { expr, fkey, fval } => Term::Set {
            expr: Box::new(bind_go(vars, &path.o(), expr, holes_only)),
            fkey: fkey.clone(),
            fval: Box::new(bind_go(vars, &path.i(), fval, holes_only)),
        },
        Term::Mut { expr, fkey, ffun } => Term::Mut {
            expr: Box::new(bind_go(vars, &path.o(), expr, holes_only)),
            fkey: fkey.clone(),
            ffun: Box::new(bind_go(vars, &path.i(), ffun, holes_only)),
        },
        Term::Ope { name, arg0, arg1 } => Term::Ope {
            name: name.clone(),
            arg0: Box::new(bind_go(vars, &path.o(), arg0, holes_only)),
            arg1: Box::new(bind_go(vars, &path.i(), arg1, holes_only)),
        },
        Term::Imp { expr } => Term::Imp {
            expr: Box::new(bind_go(vars, path, expr, holes_only)),
        },
        Term::Ori { orig, expr } => Term::Ori {
            orig: *orig,
            expr: Box::new(bind_go(vars, path, expr, holes_only)),
        },
    }
}

fn bind_let_like(
    is_let: bool,
    vars: &Context,
    path: &PathBuilder,
    name: &Name,
    expr: &Term,
    body: &Term,
    holes_only: bool,
) -> Term {
    let vlen = vars.len() as u32;
    let expr = Box::new(bind_go(vars, &path.o(), expr, holes_only));
    let body = if holes_only {
        Box::new(bind_go(vars, &path.i(), body, true))
    } else {
        let inner = extend_one(vars, name, vlen);
        Box::new(bind_go(&inner, &path.i(), body, false))
    };
    if is_let {
        Term::Let {
            name: name.clone(),
            expr,
            body,
            bind_level: vlen,
        }
    } else {
        Term::Def {
            name: name.clone(),
            expr,
            body,
            bind_level: vlen,
        }
    }
}

fn extend_all(vars: &Context, self_name: &Name, name: &Name, vlen: u32) -> Vec<(Name, Term)> {
    let self_tm = Term::Var {
        name: self_name.clone(),
        level: vlen,
    };
    let name_tm = Term::Var {
        name: name.clone(),
        level: vlen + 1,
    };
    let mut inner = Vec::with_capacity(vars.len() + 2);
    inner.push((name.clone(), name_tm));
    inner.push((self_name.clone(), self_tm));
    inner.extend(vars.iter().cloned());
    inner
}

fn extend_one(vars: &Context, name: &Name, vlen: u32) -> Vec<(Name, Term)> {
    let tm = Term::Var {
        name: name.clone(),
        level: vlen,
    };
    let mut inner = Vec::with_capacity(vars.len() + 1);
    inner.push((name.clone(), tm));
    inner.extend(vars.iter().cloned());
    inner
}

/// `List.at_last`: reverse then index. Outermost binder is level 0.
fn at_last(index: u32, vars: &Context) -> Option<&Term> {
    let len = vars.len() as u32;
    if index < len {
        Some(&vars[(len - 1 - index) as usize].1)
    } else {
        None
    }
}

/// `Sure.Context.get_name_skips`: every `^` is stripped and counted.
fn get_name_skips(name: &str) -> (String, u32) {
    let mut out = String::new();
    let mut skip = 0u32;
    for c in name.chars() {
        if c == '^' {
            skip += 1;
        } else {
            out.push(c);
        }
    }
    (out, skip)
}

/// `Sure.Context.find`.
fn context_find<'a>(name: &str, ctx: &'a Context) -> Option<&'a Term> {
    let (name, mut skip) = get_name_skips(name);
    for (n, t) in ctx {
        if n.as_ref() == name {
            if skip == 0 {
                return Some(t);
            }
            skip -= 1;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use sure_syntax::{parse_term, subst_levels};

    fn n(s: &str) -> Name {
        Name::from(s)
    }

    fn unori(term: &Term) -> &Term {
        match term {
            Term::Ori { expr, .. } => unori(expr),
            _ => term,
        }
    }

    fn parse(src: &str) -> Term {
        parse_term(src).unwrap_or_else(|e| panic!("parse {src:?}: {e}"))
    }

    #[test]
    fn bind_lambda_var_via_at_last() {
        let bound = bind_term(&parse("(x) x"));
        match unori(&bound) {
            Term::Lam {
                name,
                body,
                bind_level,
            } => {
                assert_eq!(name.as_ref(), "x");
                assert_eq!(*bind_level, 0);
                match unori(body) {
                    Term::Var { name, level } => {
                        assert_eq!(name.as_ref(), "x");
                        assert_eq!(*level, 0);
                    }
                    other => panic!("expected Var, got {other:?}"),
                }
            }
            other => panic!("expected Lam, got {other:?}"),
        }
    }

    #[test]
    fn bind_leftover_ref_stays_ref() {
        let bound = bind_term(&parse("(x) Nat.add"));
        match unori(&bound) {
            Term::Lam { body, .. } => match unori(body) {
                Term::Ref(name) => assert_eq!(name.as_ref(), "Nat.add"),
                other => panic!("expected leftover Ref, got {other:?}"),
            },
            other => panic!("expected Lam, got {other:?}"),
        }
    }

    #[test]
    fn bind_all_self_at_vlen_name_at_plus_one() {
        let bound = bind_type(&parse("(x: Type) -> x"));
        match unori(&bound) {
            Term::All {
                name,
                body,
                bind_level,
                ..
            } => {
                assert_eq!(name.as_ref(), "x");
                assert_eq!(*bind_level, 0);
                match unori(body) {
                    Term::Var { name, level } => {
                        assert_eq!(name.as_ref(), "x");
                        assert_eq!(*level, 1);
                    }
                    other => panic!("expected Var at 1, got {other:?}"),
                }
            }
            other => panic!("expected All, got {other:?}"),
        }
    }

    #[test]
    fn bind_nested_lam_levels() {
        let bound = bind_term(&parse("(x) (y) x"));
        match unori(&bound) {
            Term::Lam {
                bind_level: 0,
                body,
                ..
            } => match unori(body) {
                Term::Lam {
                    bind_level: 1,
                    body,
                    ..
                } => match unori(body) {
                    Term::Var { level: 0, .. } => {}
                    other => panic!("expected Var(0), got {other:?}"),
                },
                other => panic!("expected inner Lam, got {other:?}"),
            },
            other => panic!("expected outer Lam, got {other:?}"),
        }
    }

    #[test]
    fn bind_assigns_hole_paths() {
        let bound = bind_term(&parse("(x) _"));
        match unori(&bound) {
            Term::Lam { body, .. } => match unori(body) {
                Term::Hol { path } => {
                    assert_eq!(*path, Bits::O(Box::new(Bits::O(Box::new(Bits::E)))));
                }
                other => panic!("expected Hol, got {other:?}"),
            },
            other => panic!("expected Lam, got {other:?}"),
        }
    }

    #[test]
    fn bind_holes_keeps_refs_in_case_branches() {
        let src = "case n { zero: size, succ: size }";
        let bound = bind_term(&parse(src));
        match unori(&bound) {
            Term::Cse { cses, .. } => {
                for branch in cses.values() {
                    fn has_ref(term: &Term, want: &str) -> bool {
                        match term {
                            Term::Ref(n) => n.as_ref() == want,
                            Term::Ori { expr, .. } => has_ref(expr, want),
                            Term::App { func, argm } => has_ref(func, want) || has_ref(argm, want),
                            _ => false,
                        }
                    }
                    assert!(
                        has_ref(branch, "size"),
                        "case branch should keep Ref(size), got {branch:?}"
                    );
                }
            }
            other => panic!("expected Cse, got {other:?}"),
        }
    }

    #[test]
    fn bind_then_open_lam_is_beta() {
        let bound = bind_term(&parse("(x) x"));
        match unori(&bound) {
            Term::Lam {
                body, bind_level, ..
            } => {
                let opened = subst_levels(body, *bind_level, &Term::Nat(2), None, &Term::Nat(2));
                assert_eq!(unori(&opened), &Term::Nat(2));
            }
            other => panic!("expected Lam, got {other:?}"),
        }
    }

    #[test]
    fn caret_skip_finds_outer_binder() {
        let x0 = Term::Var {
            name: n("x"),
            level: 0,
        };
        let x1 = Term::Var {
            name: n("x"),
            level: 1,
        };
        let ctx = vec![(n("x"), x1.clone()), (n("x"), x0.clone())];
        assert_eq!(context_find("x", &ctx), Some(&x1));
        assert_eq!(context_find("x^", &ctx), Some(&x0));
        assert_eq!(context_find("y", &ctx), None);
    }
}
