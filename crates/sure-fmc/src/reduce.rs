//! FormCore.js `reduce` / `normalize` / unroll.

use crate::subst::open_lam;
use crate::term::{Defs, Term};

pub(crate) fn unroll_nat(n: u64) -> Term {
    if n == 0 {
        Term::ref_("Nat.zero")
    } else {
        Term::app(Term::ref_("Nat.succ"), Term::Nat(n - 1))
    }
}

/// Unroll a char to `Char.new` applied to 16 `Bit.0`/`Bit.1` (MSB first).
/// FormCore.js uses the first UTF-16 code unit (`charCodeAt(0)`).
pub(crate) fn unroll_chr(c: char) -> Term {
    let mut buf = [0u16; 2];
    let units = c.encode_utf16(&mut buf);
    let ccod = u32::from(units[0]);
    let mut done = Term::ref_("Char.new");
    for i in 0..16 {
        let bit = ((ccod >> (16 - i - 1)) & 1) != 0;
        let b = if bit { "Bit.1" } else { "Bit.0" };
        done = Term::app(done, Term::ref_(b));
    }
    done
}

/// FormCore.js indexes UTF-16 units; BMP/hello strings match `chars()`.
pub(crate) fn unroll_str(s: &str) -> Term {
    match s.chars().next() {
        None => Term::ref_("String.nil"),
        Some(c) => {
            let rest: String = s.chars().skip(1).collect();
            Term::app(
                Term::app(Term::ref_("String.cons"), unroll_chr(c)),
                Term::Str(rest),
            )
        }
    }
}

/// Weak-head reduction (FormCore.js `reduce`).
pub fn reduce(term: &Term, defs: &Defs) -> Term {
    match term {
        Term::Var { name, level } => Term::Var {
            name: name.clone(),
            level: *level,
        },
        Term::Ref(name) => {
            if let Some(got) = defs.get(name) {
                reduce(&got.term, defs)
            } else {
                Term::Ref(name.clone())
            }
        }
        Term::Typ => Term::Typ,
        Term::All { .. } => term.clone(),
        Term::Lam { .. } => term.clone(),
        Term::App { func, argm } => {
            let func = reduce(func, defs);
            match &func {
                Term::Lam {
                    body, bind_level, ..
                } => reduce(&open_lam(body, *bind_level, argm), defs),
                _ => Term::App {
                    func: Box::new(func),
                    argm: argm.clone(),
                },
            }
        }
        Term::Let {
            expr,
            body,
            bind_level,
            ..
        } => reduce(&open_lam(body, *bind_level, expr), defs),
        Term::Def {
            expr,
            body,
            bind_level,
            ..
        } => reduce(&open_lam(body, *bind_level, expr), defs),
        Term::Ann { term, .. } => reduce(term, defs),
        Term::Nat(n) => reduce(&unroll_nat(*n), defs),
        Term::Chr(c) => reduce(&unroll_chr(*c), defs),
        Term::Str(s) => reduce(&unroll_str(s), defs),
    }
}

/// Full normalize (FormCore.js `normalize`).
pub fn normalize(term: &Term, defs: &Defs) -> Term {
    let norm = reduce(term, defs);
    match &norm {
        Term::Var { .. } | Term::Ref(_) | Term::Typ => norm,
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
            xtyp: Box::new(normalize(xtyp, defs)),
            body: Box::new(normalize(body, defs)),
            bind_level: *bind_level,
        },
        Term::Lam {
            name,
            body,
            bind_level,
        } => Term::Lam {
            name: name.clone(),
            body: Box::new(normalize(body, defs)),
            bind_level: *bind_level,
        },
        Term::App { func, argm } => Term::App {
            func: Box::new(normalize(func, defs)),
            argm: Box::new(normalize(argm, defs)),
        },
        Term::Let {
            expr,
            body,
            bind_level,
            ..
        } => normalize(&open_lam(body, *bind_level, expr), defs),
        Term::Def {
            expr,
            body,
            bind_level,
            ..
        } => normalize(&open_lam(body, *bind_level, expr), defs),
        Term::Ann { term, .. } => normalize(term, defs),
        Term::Nat(_) | Term::Chr(_) | Term::Str(_) => norm,
    }
}
