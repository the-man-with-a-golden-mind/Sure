use crate::name::Name;
use crate::term::{Bits, Defs, Term, WithBinder};

/// `Sure.Term.app`.
pub(crate) fn app(func: Term, argm: Term) -> Term {
    Term::App {
        func: Box::new(func),
        argm: Box::new(argm),
    }
}

pub(crate) fn apps(func: Term, args: impl IntoIterator<Item = Term>) -> Term {
    args.into_iter().fold(func, app)
}

/// `Sure.Term.hol(Bits.e)` — path is filled later by `Term.bind`.
pub(crate) fn hol() -> Term {
    Term::Hol { path: Bits::E }
}

pub(crate) fn r#ref(name: impl Into<Name>) -> Term {
    Term::Ref(name.into())
}

pub(crate) fn lam(name: impl Into<Name>, body: Term) -> Term {
    Term::Lam {
        name: name.into(),
        body: Box::new(body),
        bind_level: 0,
    }
}

/// `Sure.Parser.equality`: `a == b` → `Equal(_) a b`.
pub(crate) fn equal(left: Term, right: Term) -> Term {
    apps(r#ref("Equal"), [hol(), left, right])
}

/// `Sure.Parser.reference` `refl` → `Equal.refl(_)(_)`.
pub(crate) fn refl() -> Term {
    apps(r#ref("Equal.refl"), [hol(), hol()])
}

/// Host `admit` → `?admit` (`Sure.Term.gol`).
pub(crate) fn admit() -> Term {
    Term::Gol {
        name: Name::from("admit"),
        dref: Vec::new(),
        verb: false,
    }
}

pub(crate) fn goal(name: impl Into<Name>) -> Term {
    Term::Gol {
        name: name.into(),
        dref: Vec::new(),
        verb: false,
    }
}

/// `Monad.bind type monad _ _ expr (name) body` (`Sure.Parser.do.statements`).
pub(crate) fn monad_bind(ty: Term, monad: Term, expr: Term, name: Name, body: Term) -> Term {
    apps(
        r#ref("Monad.bind"),
        [ty, monad, hol(), hol(), expr, lam(name, body)],
    )
}

/// `Monad.pure type monad _ expr`.
pub(crate) fn monad_pure(ty: Term, monad: Term, expr: Term) -> Term {
    apps(r#ref("Monad.pure"), [ty, monad, hol(), expr])
}

/// `Sure.Mod.qual`. The module's own type stays `M`.
pub(crate) fn mod_qual(module: &str, name: &str) -> Name {
    if module.is_empty()
        || name.is_empty()
        || name == module
        || name.starts_with(&format!("{module}."))
    {
        Name::from(name)
    } else {
        Name::from(format!("{module}.{name}"))
    }
}

fn has_name(name: &str, xs: &[Name]) -> bool {
    xs.iter().any(|n| n.as_ref() == name)
}

/// `Sure.Mod.from_imp` — explicit exposing list, not `(..)`.
pub(crate) fn from_imp(imps: &[(String, Vec<String>)], name: &str) -> Option<Name> {
    for (mod_name, exposed) in imps {
        if exposed.iter().any(|n| n == "..") {
            continue;
        }
        if exposed.iter().any(|n| n == name) {
            if name == mod_name.as_str() {
                return Some(Name::from(name));
            }
            return Some(Name::from(format!("{mod_name}.{name}")));
        }
    }
    None
}

/// `Sure.Mod.from_imp.open` — `exposing (..)` looks the name up in `defs`.
fn from_imp_open(imps: &[(String, Vec<String>)], name: &str, defs: &Defs) -> Option<Name> {
    for (mod_name, exposed) in imps {
        if !exposed.iter().any(|n| n == "..") {
            continue;
        }
        if name.contains('.') {
            continue;
        }
        let q = if name == mod_name.as_str() {
            Name::from(name)
        } else {
            Name::from(format!("{mod_name}.{name}"))
        };
        if defs.contains_key(&q) {
            return Some(q);
        }
    }
    None
}

/// `Sure.Mod.resolve`.
pub(crate) fn resolve(
    module: &str,
    locals: &[Name],
    imps: &[(String, Vec<String>)],
    name: &str,
) -> Name {
    if has_name(name, locals) {
        return Name::from(name);
    }
    if !module.is_empty() {
        let q = format!("{module}.{name}");
        if has_name(&q, locals) {
            return Name::from(q);
        }
    }
    from_imp(imps, name).unwrap_or_else(|| Name::from(name))
}

/// `Sure.Mod.resolve.defs`.
pub(crate) fn resolve_defs(
    module: &str,
    locals: &[Name],
    imps: &[(String, Vec<String>)],
    name: &str,
    defs: &Defs,
) -> Name {
    let got = resolve(module, locals, imps, name);
    if got.as_ref() != name {
        got
    } else {
        from_imp_open(imps, name, defs).unwrap_or_else(|| Name::from(name))
    }
}

/// `Sure.Term.qualify` — rewrite free `Ref`s.
///
/// Sure runs `Term.bind` first, so bound names are already `Var`. Until bind
/// lands, skip `Ref`s that match an enclosing `All`/`Lam`/`Let`/`Def` binder
/// (do-notation `get x = …` must not become `M.x`).
pub(crate) fn qualify<F>(term: &Term, resolve: &F) -> Term
where
    F: Fn(&str) -> Name,
{
    qualify_go(term, resolve, &mut Vec::new())
}

fn push_binder(bound: &mut Vec<Name>, name: &Name) -> bool {
    if name.is_empty() {
        false
    } else {
        bound.push(name.clone());
        true
    }
}

fn qualify_go<F>(term: &Term, resolve: &F, bound: &mut Vec<Name>) -> Term
where
    F: Fn(&str) -> Name,
{
    match term {
        Term::Var { name, level } => Term::Var {
            name: name.clone(),
            level: *level,
        },
        Term::Ref(name) => {
            if bound.iter().any(|b| b == name) {
                Term::Ref(name.clone())
            } else {
                Term::Ref(resolve(name))
            }
        }
        Term::Typ => Term::Typ,
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        } => {
            let xtyp = qualify_go(xtyp, resolve, bound);
            let pushed_self = push_binder(bound, self_name);
            let pushed_name = push_binder(bound, name);
            let body = qualify_go(body, resolve, bound);
            if pushed_name {
                bound.pop();
            }
            if pushed_self {
                bound.pop();
            }
            Term::All {
                eras: *eras,
                self_name: self_name.clone(),
                name: name.clone(),
                xtyp: Box::new(xtyp),
                body: Box::new(body),
                bind_level: *bind_level,
            }
        }
        Term::Lam {
            name,
            body,
            bind_level,
        } => {
            let pushed = push_binder(bound, name);
            let body = qualify_go(body, resolve, bound);
            if pushed {
                bound.pop();
            }
            Term::Lam {
                name: name.clone(),
                body: Box::new(body),
                bind_level: *bind_level,
            }
        }
        Term::App { func, argm } => app(
            qualify_go(func, resolve, bound),
            qualify_go(argm, resolve, bound),
        ),
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr = qualify_go(expr, resolve, bound);
            let pushed = push_binder(bound, name);
            let body = qualify_go(body, resolve, bound);
            if pushed {
                bound.pop();
            }
            Term::Let {
                name: name.clone(),
                expr: Box::new(expr),
                body: Box::new(body),
                bind_level: *bind_level,
            }
        }
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr = qualify_go(expr, resolve, bound);
            let pushed = push_binder(bound, name);
            let body = qualify_go(body, resolve, bound);
            if pushed {
                bound.pop();
            }
            Term::Def {
                name: name.clone(),
                expr: Box::new(expr),
                body: Box::new(body),
                bind_level: *bind_level,
            }
        }
        Term::Ann { done, term, typ } => Term::Ann {
            done: *done,
            term: Box::new(qualify_go(term, resolve, bound)),
            typ: Box::new(qualify_go(typ, resolve, bound)),
        },
        Term::Gol { name, dref, verb } => Term::Gol {
            name: name.clone(),
            dref: dref.clone(),
            verb: *verb,
        },
        Term::Hol { path } => Term::Hol { path: path.clone() },
        Term::Nat(n) => Term::Nat(*n),
        Term::Chr(c) => Term::Chr(*c),
        Term::Str(s) => Term::Str(s.clone()),
        Term::Num { sign, numb, frac } => Term::Num {
            sign: *sign,
            numb: *numb,
            frac: *frac,
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
            expr: Box::new(qualify_go(expr, resolve, bound)),
            name: name.clone(),
            with: with
                .iter()
                .map(|w| WithBinder {
                    name: w.name.clone(),
                    term: qualify_go(&w.term, resolve, bound),
                    typ: w.typ.as_ref().map(|t| qualify_go(t, resolve, bound)),
                })
                .collect(),
            cses: cses
                .iter()
                .map(|(k, v)| (k.clone(), qualify_go(v, resolve, bound)))
                .collect(),
            moti: moti
                .as_deref()
                .map(|t| Box::new(qualify_go(t, resolve, bound))),
        },
        Term::New { args } => Term::New {
            args: args.iter().map(|t| qualify_go(t, resolve, bound)).collect(),
        },
        Term::Get { expr, fkey } => Term::Get {
            expr: Box::new(qualify_go(expr, resolve, bound)),
            fkey: fkey.clone(),
        },
        Term::Set { expr, fkey, fval } => Term::Set {
            expr: Box::new(qualify_go(expr, resolve, bound)),
            fkey: fkey.clone(),
            fval: Box::new(qualify_go(fval, resolve, bound)),
        },
        Term::Mut { expr, fkey, ffun } => Term::Mut {
            expr: Box::new(qualify_go(expr, resolve, bound)),
            fkey: fkey.clone(),
            ffun: Box::new(qualify_go(ffun, resolve, bound)),
        },
        Term::Ope { name, arg0, arg1 } => Term::Ope {
            name: name.clone(),
            arg0: Box::new(qualify_go(arg0, resolve, bound)),
            arg1: Box::new(qualify_go(arg1, resolve, bound)),
        },
        Term::Imp { expr } => Term::Imp {
            expr: Box::new(qualify_go(expr, resolve, bound)),
        },
        Term::Ori { orig, expr } => Term::Ori {
            orig: *orig,
            expr: Box::new(qualify_go(expr, resolve, bound)),
        },
    }
}

/// Drop `Ori` wrappers so tests can match `Parser.equality` / `reference` spines.
#[cfg(test)]
pub(crate) fn strip_ori(term: &Term) -> Term {
    match term {
        Term::Ori { expr, .. } => strip_ori(expr),
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
            xtyp: Box::new(strip_ori(xtyp)),
            body: Box::new(strip_ori(body)),
            bind_level: *bind_level,
        },
        Term::Lam {
            name,
            body,
            bind_level,
        } => Term::Lam {
            name: name.clone(),
            body: Box::new(strip_ori(body)),
            bind_level: *bind_level,
        },
        Term::App { func, argm } => app(strip_ori(func), strip_ori(argm)),
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => Term::Let {
            name: name.clone(),
            expr: Box::new(strip_ori(expr)),
            body: Box::new(strip_ori(body)),
            bind_level: *bind_level,
        },
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => Term::Def {
            name: name.clone(),
            expr: Box::new(strip_ori(expr)),
            body: Box::new(strip_ori(body)),
            bind_level: *bind_level,
        },
        Term::Ann { done, term, typ } => Term::Ann {
            done: *done,
            term: Box::new(strip_ori(term)),
            typ: Box::new(strip_ori(typ)),
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
            expr: Box::new(strip_ori(expr)),
            name: name.clone(),
            with: with
                .iter()
                .map(|w| WithBinder {
                    name: w.name.clone(),
                    term: strip_ori(&w.term),
                    typ: w.typ.as_ref().map(strip_ori),
                })
                .collect(),
            cses: cses
                .iter()
                .map(|(k, v)| (k.clone(), strip_ori(v)))
                .collect(),
            moti: moti.as_deref().map(|t| Box::new(strip_ori(t))),
        },
        Term::New { args } => Term::New {
            args: args.iter().map(strip_ori).collect(),
        },
        Term::Get { expr, fkey } => Term::Get {
            expr: Box::new(strip_ori(expr)),
            fkey: fkey.clone(),
        },
        Term::Set { expr, fkey, fval } => Term::Set {
            expr: Box::new(strip_ori(expr)),
            fkey: fkey.clone(),
            fval: Box::new(strip_ori(fval)),
        },
        Term::Mut { expr, fkey, ffun } => Term::Mut {
            expr: Box::new(strip_ori(expr)),
            fkey: fkey.clone(),
            ffun: Box::new(strip_ori(ffun)),
        },
        Term::Ope { name, arg0, arg1 } => Term::Ope {
            name: name.clone(),
            arg0: Box::new(strip_ori(arg0)),
            arg1: Box::new(strip_ori(arg1)),
        },
        Term::Imp { expr } => Term::Imp {
            expr: Box::new(strip_ori(expr)),
        },
        Term::Var { .. }
        | Term::Ref(_)
        | Term::Typ
        | Term::Gol { .. }
        | Term::Hol { .. }
        | Term::Nat(_)
        | Term::Chr(_)
        | Term::Str(_)
        | Term::Num { .. } => term.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_and_refl_spines() {
        let e = equal(r#ref("greet"), Term::Str("Sure".into()));
        assert_eq!(
            e,
            apps(
                r#ref("Equal"),
                [hol(), r#ref("greet"), Term::Str("Sure".into())]
            )
        );
        assert_eq!(refl(), apps(r#ref("Equal.refl"), [hol(), hol()]));
    }

    #[test]
    fn mod_qual_matches_sure_theorems() {
        assert_eq!(mod_qual("", "ok").as_ref(), "ok");
        assert_eq!(mod_qual("Tweeter", "ok").as_ref(), "Tweeter.ok");
        assert_eq!(mod_qual("Boxes", "Boxes").as_ref(), "Boxes");
        assert_eq!(mod_qual("Tweeter", "Tweeter.ok").as_ref(), "Tweeter.ok");
    }

    #[test]
    fn resolve_matches_sure_theorems() {
        let locals = vec![Name::from("Tweeter.ok")];
        assert_eq!(
            resolve("Tweeter", &locals, &[], "ok").as_ref(),
            "Tweeter.ok"
        );
        assert_eq!(
            resolve("Tweeter", &locals, &[], "Nat.add").as_ref(),
            "Nat.add"
        );
        let audit = vec![Name::from("Audit.report")];
        let imps = vec![("Boxes".into(), vec!["len".into()])];
        assert_eq!(resolve("Audit", &audit, &imps, "len").as_ref(), "Boxes.len");
        let imps = vec![(
            "Boxes".into(),
            vec!["Boxes".into(), "empty".into(), "len".into()],
        )];
        assert_eq!(resolve("Audit", &audit, &imps, "Boxes").as_ref(), "Boxes");
    }

    #[test]
    fn qualify_rewrites_free_refs_only() {
        let term = app(r#ref("greet"), r#ref("Nat.add"));
        let locals = vec![Name::from("Hello.greet")];
        let q = qualify(&term, &|n| resolve("Hello", &locals, &[], n));
        assert_eq!(q, app(r#ref("Hello.greet"), r#ref("Nat.add")));
    }

    #[test]
    fn qualify_skips_enclosing_lam_binder() {
        let locals = vec![Name::from("Hello.greet")];
        let resolve = |n: &str| resolve("Hello", &locals, &[], n);
        // Free `greet` in the expr, bound `greet` in the body.
        let term = lam("greet", app(r#ref("IO.print"), r#ref("greet")));
        let q = qualify(&term, &resolve);
        assert_eq!(q, lam("greet", app(r#ref("IO.print"), r#ref("greet"))));

        let term = app(r#ref("greet"), lam("greet", r#ref("greet")));
        let q = qualify(&term, &resolve);
        assert_eq!(q, app(r#ref("Hello.greet"), lam("greet", r#ref("greet"))));
    }
}
