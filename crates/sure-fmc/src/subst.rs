//! Kernel copy of open/subst on `fmc::Term`.
//! Keep in sync with `sure-syntax/subst.rs`.

use crate::term::Term;

/// Replace every `Var { level }` in `term`:
///   level == a_lv  ⇒  clone `a`
///   level == b_lv  ⇒  clone `b`   (ignored if `b_lv` is None)
/// Do not substitute inside `a`/`b`. Walk nested binders; levels are
/// absolute, so a match is replaced even under nested All/Lam/Let/Def.
pub fn subst_levels(term: &Term, a_lv: u32, a: &Term, b_lv: Option<u32>, b: &Term) -> Term {
    match term {
        Term::Var { level, .. } if *level == a_lv => a.clone(),
        Term::Var { level, .. } if b_lv == Some(*level) => b.clone(),
        Term::Var { name, level } => Term::Var {
            name: name.clone(),
            level: *level,
        },
        Term::Ref(n) => Term::Ref(n.clone()),
        Term::Typ => Term::Typ,
        Term::All { bind_level, .. }
        | Term::Lam { bind_level, .. }
        | Term::Let { bind_level, .. }
        | Term::Def { bind_level, .. }
            if opaque_binder(*bind_level, a_lv, b_lv) =>
        {
            term.clone()
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
        // FormCore.js HOAS does not resubstitute into the terms it just
        // plugged in. Typecheck wraps those as `Ann { done: true, … }`;
        // walking them would rewrite inner Vars whose levels collide with
        // nested binders (`ctx.size+1` == next `bind_level`).
        Term::Ann { done: true, .. } => term.clone(),
        Term::Ann {
            done: false,
            term,
            typ,
        } => Term::Ann {
            done: false,
            term: Box::new(subst_levels(term, a_lv, a, b_lv, b)),
            typ: Box::new(subst_levels(typ, a_lv, a, b_lv, b)),
        },
        Term::Nat(n) => Term::Nat(*n),
        Term::Chr(c) => Term::Chr(*c),
        Term::Str(s) => Term::Str(s.clone()),
    }
}

fn opaque_binder(bind_level: u32, a_lv: u32, b_lv: Option<u32>) -> bool {
    let floor = b_lv.map(|b| a_lv.min(b)).unwrap_or(a_lv);
    bind_level < floor
}

/// `All.body(s, x)` — self occupies `bind_level`, name `bind_level + 1`.
pub fn open_all(all: &Term, s: &Term, x: &Term) -> Term {
    match all {
        Term::All {
            body, bind_level, ..
        } => subst_levels(body, *bind_level, s, Some(*bind_level + 1), x),
        _ => all.clone(),
    }
}

/// `Lam.body(x)` / `Let.body(x)` / `Def.body(x)`.
pub fn open_lam(body: &Term, bind_level: u32, x: &Term) -> Term {
    subst_levels(body, bind_level, x, None, x)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse;

    fn t(src: &str) -> Term {
        parse(src).expect(src)
    }

    #[test]
    fn open_all_parsed_at_depth_zero_uses_levels_0_1() {
        let all = t("@self(name:*) (self name)");
        match &all {
            Term::All { bind_level, .. } => assert_eq!(*bind_level, 0),
            _ => panic!("expected All"),
        }
        let body = open_all(&all, &Term::var("self", 0), &Term::var("name", 1));
        assert_eq!(body, Term::app(Term::var("self", 0), Term::var("name", 1)));
    }

    #[test]
    fn open_all_lam_vs_all_uses_lambda_as_self() {
        let typv = t("@s(x:*) *");
        let lam = t("#x x");
        let name = Term::var("x", 0);
        let opened = open_all(&typv, &lam, &name);
        // bind is Typ; body is Typ — no self/name occurrences. Check subst still runs.
        assert_eq!(opened, Term::Typ);
        let typv = t("@s(x:*) (s x)");
        let opened = open_all(&typv, &lam, &name);
        assert_eq!(opened, Term::app(lam, name));
    }

    #[test]
    fn open_lam_beta() {
        let lam = t("#x x");
        let arg = t("*");
        match &lam {
            Term::Lam {
                body, bind_level, ..
            } => {
                assert_eq!(open_lam(body, *bind_level, &arg), arg);
            }
            _ => panic!("expected Lam"),
        }
    }

    #[test]
    fn open_lam_let_and_def() {
        let let_ = t("!x=* ; x");
        match &let_ {
            Term::Let {
                expr,
                body,
                bind_level,
                ..
            } => {
                assert_eq!(open_lam(body, *bind_level, expr), Term::Typ);
            }
            _ => panic!("expected Let"),
        }
        let def = t("$x=* ; x");
        match &def {
            Term::Def {
                expr,
                body,
                bind_level,
                ..
            } => {
                assert_eq!(open_lam(body, *bind_level, expr), Term::Typ);
            }
            _ => panic!("expected Def"),
        }
    }

    #[test]
    fn open_all_dummy_level_zero_like_expand_cse() {
        let all = t("@self(name:*) (self name)");
        let opened = open_all(&all, &Term::var("self", 0), &Term::var("name", 0));
        assert_eq!(
            opened,
            Term::app(Term::var("self", 0), Term::var("name", 0))
        );
    }
}
