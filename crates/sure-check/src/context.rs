//! `Sure.Context`: innermost-at-head `(name, type)` pairs.

use sure_syntax::{Name, Term};

use crate::reduce::normalize;

/// Innermost binder at index 0 (`Sure.Context`).
pub type Context = Vec<(Name, Term)>;

/// `List.at_last`: reverse then index. Outermost binder is level 0.
pub fn at_last(index: u32, ctx: &[(Name, Term)]) -> Option<&Term> {
    let len = ctx.len() as u32;
    if index < len {
        Some(&ctx[(len - 1 - index) as usize].1)
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
pub fn find<'a>(name: &str, ctx: &'a [(Name, Term)]) -> Option<&'a Term> {
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

/// `Sure.Context.show`. Prints outer binders first.
pub fn show(ctx: &[(Name, Term)]) -> String {
    let mut s = String::new();
    for (name, typ) in ctx.iter().rev() {
        s.push_str("- ");
        s.push_str(name);
        s.push_str(": ");
        s.push_str(&crate::show::show(&normalize(
            typ,
            &sure_syntax::Defs::new(),
        )));
        s.push('\n');
    }
    s
}

/// Cons a binder (innermost).
pub fn cons(name: Name, typ: Term, ctx: &[(Name, Term)]) -> Context {
    let mut out = Vec::with_capacity(ctx.len() + 1);
    out.push((name, typ));
    out.extend(ctx.iter().cloned());
    out
}
