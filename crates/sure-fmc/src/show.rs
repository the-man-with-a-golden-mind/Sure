//! FormCore.js `show` / `show_defs`.
//!
//! Nats print **without** a leading `+`. `Ann` prints only the expr.
//! `show_defs` is `name: type = term;` (no space before `:`).

use crate::subst::{open_all, open_lam};
use crate::term::{Defs, Term};

/// Escape a string/char payload like FormCore.js `show_string`.
pub fn show_string(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        match c {
            '\\' | '"' | '\'' => {
                out.push('\\');
                out.push(c);
            }
            ' '..='~' => out.push(c),
            _ => {
                out.push_str("\\u{");
                out.push_str(&format!("{:x}", c as u32));
                out.push('}');
            }
        }
    }
    out
}

/// Pretty-print a term matching FormCore.js `show`.
pub fn show(term: &Term) -> String {
    match term {
        Term::Var { name, .. } | Term::Ref(name) => name.to_string(),
        Term::Typ => "*".to_string(),
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            ..
        } => {
            let bind = if *eras { "%" } else { "@" };
            let xtyp_s = show(xtyp);
            let body = open_all(
                term,
                &Term::var(self_name.clone(), 0),
                &Term::var(name.clone(), 0),
            );
            format!("{bind}{self_name}({name}:{xtyp_s}) {}", show(&body))
        }
        Term::Lam {
            name,
            body,
            bind_level,
        } => {
            let opened = open_lam(body, *bind_level, &Term::var(name.clone(), 0));
            format!("#{name} {}", show(&opened))
        }
        Term::App { func, argm } => format!("({} {})", show(func), show(argm)),
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let opened = open_lam(body, *bind_level, &Term::var(name.clone(), 0));
            format!("!{name}={};{}", show(expr), show(&opened))
        }
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => {
            let opened = open_lam(body, *bind_level, &Term::var(name.clone(), 0));
            format!("${name}={};{}", show(expr), show(&opened))
        }
        Term::Ann { term, .. } => show(term),
        Term::Nat(n) => n.to_string(),
        Term::Chr(c) => {
            let mut s = String::new();
            s.push(*c);
            format!("'{}'", show_string(&s))
        }
        Term::Str(s) => format!("\"{}\"", show_string(s)),
    }
}

/// Print defs as FormCore.js `show_defs`. Iteration is sorted by name.
pub fn show_defs(defs: &Defs) -> String {
    let mut out = String::new();
    for (name, def) in defs {
        out.push_str(name);
        out.push_str(": ");
        out.push_str(&show(&def.typ));
        out.push_str(" = ");
        out.push_str(&show(&def.term));
        out.push_str(";\n");
    }
    out
}

impl std::fmt::Display for Term {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&show(self))
    }
}
