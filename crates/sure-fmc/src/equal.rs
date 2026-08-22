//! FormCore.js `serialize` / `equal`.

use std::collections::HashSet;

use crate::reduce::reduce;
use crate::subst::{open_all, open_lam};
use crate::term::{Defs, Term};

/// Serialize a term to a unique identity string (FormCore.js `serialize`).
pub fn serialize(term: &Term, dep: u32, ini: u32) -> String {
    match term {
        Term::Var { level, .. } => {
            if *level >= ini {
                // FormCore.js IEEE subtraction; `serialize(Var(_,0), 0, 0)` is `^-1`.
                format!("^-{}", (dep as i64) - (*level as i64) - 1)
            } else {
                format!("^+{level}")
            }
        }
        Term::Ref(name) => format!("${name}"),
        Term::Typ => "*".to_string(),
        Term::All {
            eras,
            self_name,
            xtyp,
            ..
        } => {
            let init = if *eras { "%" } else { "@" };
            let bind = serialize(xtyp, dep, ini);
            let body = open_all(term, &Term::var("", dep), &Term::var("", dep + 1));
            format!("{init}{self_name}{bind}{}", serialize(&body, dep + 2, ini))
        }
        Term::Lam {
            body, bind_level, ..
        } => {
            let opened = open_lam(body, *bind_level, &Term::var("", dep));
            format!("#{}", serialize(&opened, dep + 1, ini))
        }
        Term::App { func, argm } => {
            format!(
                "({} {})",
                serialize(func, dep, ini),
                serialize(argm, dep, ini)
            )
        }
        Term::Let {
            expr,
            body,
            bind_level,
            ..
        } => {
            let opened = open_lam(body, *bind_level, &Term::var("", dep));
            format!(
                "!{}{}",
                serialize(expr, dep, ini),
                serialize(&opened, dep + 1, ini)
            )
        }
        Term::Def {
            expr,
            body,
            bind_level,
            ..
        } => {
            let opened = open_lam(body, *bind_level, &Term::var("", dep));
            format!(
                "${}{}",
                serialize(expr, dep, ini),
                serialize(&opened, dep + 1, ini)
            )
        }
        Term::Ann { term, .. } => serialize(term, dep, ini),
        Term::Nat(n) => format!("+{n}"),
        Term::Chr(c) => format!("'{c}'"),
        Term::Str(s) => format!("\"{s}\""),
    }
}

/// Are two terms equal? (FormCore.js `equal`.)
pub fn equal(a: &Term, b: &Term, defs: &Defs) -> bool {
    equal_at(a, b, defs, 0)
}

pub(crate) fn equal_at(a: &Term, b: &Term, defs: &Defs, dep: u32) -> bool {
    equal_go(a, b, defs, dep, &mut HashSet::new())
}

fn equal_go(a: &Term, b: &Term, defs: &Defs, dep: u32, seen: &mut HashSet<String>) -> bool {
    let a1 = reduce(a, defs);
    let b1 = reduce(b, defs);
    let ah = serialize(&a1, dep, dep);
    let bh = serialize(&b1, dep, dep);
    let id = format!("{ah}=={bh}");
    if ah == bh || seen.contains(&id) {
        return true;
    }
    seen.insert(id);
    match (&a1, &b1) {
        (
            Term::All {
                eras: ae,
                self_name: aself,
                name: aname,
                xtyp: abind,
                ..
            },
            Term::All {
                eras: be,
                self_name: bself,
                xtyp: bbind,
                ..
            },
        ) => {
            // FormCore.js opens both bodies with *a1*'s self/name.
            let s = Term::var(aself.clone(), dep);
            let x = Term::var(aname.clone(), dep + 1);
            let a1_body = open_all(&a1, &s, &x);
            let b1_body = open_all(&b1, &s, &x);
            *ae == *be
                && aself == bself
                && equal_go(abind, bbind, defs, dep, seen)
                && equal_go(&a1_body, &b1_body, defs, dep + 2, seen)
        }
        (
            Term::Lam {
                name,
                body: abody,
                bind_level: alv,
            },
            Term::Lam {
                body: bbody,
                bind_level: blv,
                ..
            },
        ) => {
            let x = Term::var(name.clone(), dep);
            let a1_body = open_lam(abody, *alv, &x);
            let b1_body = open_lam(bbody, *blv, &x);
            equal_go(&a1_body, &b1_body, defs, dep + 1, seen)
        }
        (Term::App { func: af, argm: aa }, Term::App { func: bf, argm: ba }) => {
            equal_go(af, bf, defs, dep, seen) && equal_go(aa, ba, defs, dep, seen)
        }
        (
            Term::Let {
                name,
                expr: ae,
                body: ab,
                bind_level: alv,
            },
            Term::Let {
                expr: be,
                body: bb,
                bind_level: blv,
                ..
            },
        ) => {
            let x = Term::var(name.clone(), dep);
            equal_go(ae, be, defs, dep, seen)
                && equal_go(
                    &open_lam(ab, *alv, &x),
                    &open_lam(bb, *blv, &x),
                    defs,
                    dep + 1,
                    seen,
                )
        }
        (Term::Ann { term: ae, .. }, Term::Ann { term: be, .. }) => {
            equal_go(ae, be, defs, dep, seen)
        }
        _ => false,
    }
}
