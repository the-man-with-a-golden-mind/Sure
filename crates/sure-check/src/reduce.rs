//! `Sure.Term.reduce` / `normalize` / unroll / prim.

use sure_syntax::{open_lam, Bits, Defs, Name, Term};

fn app(func: Term, argm: Term) -> Term {
    Term::App {
        func: Box::new(func),
        argm: Box::new(argm),
    }
}

fn apps(func: Term, args: impl IntoIterator<Item = Term>) -> Term {
    args.into_iter().fold(func, app)
}

fn r#ref(name: &str) -> Term {
    Term::Ref(Name::from(name))
}

/// `Sure.Term.reduce`. Does **not** reduce `cse`.
pub fn reduce(term: &Term, defs: &Defs) -> Term {
    match term {
        Term::Ref(name) => match defs.get(name) {
            Some(def) => reduce(&def.term, defs),
            None => term.clone(),
        },
        Term::App { func, argm } => {
            let (head, args) = spine(term);
            if let Some(p) = prim(&head, &args, defs) {
                return p;
            }
            match reduce(func, defs) {
                Term::Lam {
                    body, bind_level, ..
                } => reduce(&open_lam(&body, bind_level, argm), defs),
                _ => term.clone(),
            }
        }
        Term::Let {
            expr,
            body,
            bind_level,
            ..
        }
        | Term::Def {
            expr,
            body,
            bind_level,
            ..
        } => reduce(&open_lam(body, *bind_level, expr), defs),
        Term::Ann { term, .. } => reduce(term, defs),
        Term::Nat(n) => reduce(&unroll_nat(*n), defs),
        Term::Chr(c) => reduce(&unroll_chr(*c), defs),
        Term::Str(s) => reduce(&unroll_str(s), defs),
        Term::Imp { expr } | Term::Ori { expr, .. } => reduce(expr, defs),
        _ => term.clone(),
    }
}

/// `Sure.Term.normalize`.
pub fn normalize(term: &Term, defs: &Defs) -> Term {
    match reduce(term, defs) {
        Term::Ref(name) => Term::Ref(name),
        Term::Var { name, level } => Term::Var { name, level },
        Term::Typ => Term::Typ,
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        } => Term::All {
            eras,
            self_name,
            name,
            xtyp: Box::new(normalize(&xtyp, defs)),
            body: Box::new(normalize(&body, defs)),
            bind_level,
        },
        Term::Lam {
            name,
            body,
            bind_level,
        } => Term::Lam {
            name,
            body: Box::new(normalize(&body, defs)),
            bind_level,
        },
        Term::App { func, argm } => Term::App {
            func: Box::new(normalize(&func, defs)),
            argm: Box::new(normalize(&argm, defs)),
        },
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => Term::Let {
            name,
            expr: Box::new(normalize(&expr, defs)),
            body: Box::new(normalize(&body, defs)),
            bind_level,
        },
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => Term::Def {
            name,
            expr: Box::new(normalize(&expr, defs)),
            body: Box::new(normalize(&body, defs)),
            bind_level,
        },
        Term::Ann { done, term, typ } => Term::Ann {
            done,
            term: Box::new(normalize(&term, defs)),
            typ: Box::new(normalize(&typ, defs)),
        },
        Term::Gol { name, dref, verb } => Term::Gol { name, dref, verb },
        Term::Hol { path } => Term::Hol { path },
        Term::Nat(n) => Term::Nat(n),
        Term::Chr(c) => Term::Chr(c),
        Term::Str(s) => Term::Str(s),
        Term::Imp { expr } | Term::Ori { expr, .. } => normalize(&expr, defs),
        other => other,
    }
}

/// `Sure.Term.reduce.spine`.
fn spine(term: &Term) -> (Term, Vec<Term>) {
    let mut acc = Vec::new();
    let mut t = term;
    loop {
        match t {
            Term::App { func, argm } => {
                acc.push(argm.as_ref());
                t = func;
            }
            Term::Ori { expr, .. } | Term::Imp { expr } => t = expr,
            Term::Ann { term, .. } => t = term.as_ref(),
            _ => break,
        }
    }
    acc.reverse();
    (t.clone(), acc.into_iter().cloned().collect())
}

fn rest(term: Term, args: &[Term], n: usize, defs: &Defs) -> Term {
    let mut t = term;
    for arg in args.iter().skip(n) {
        t = reduce(&app(t, arg.clone()), defs);
    }
    t
}

fn reduce_bool(b: bool) -> Term {
    if b {
        r#ref("Bool.true")
    } else {
        r#ref("Bool.false")
    }
}

fn two_nats(args: &[Term], defs: &Defs) -> Option<(u64, u64)> {
    let a = args.first()?;
    let b = args.get(1)?;
    let a = nat_lit(&reduce(a, defs))?;
    let b = nat_lit(&reduce(b, defs))?;
    Some((a, b))
}

fn one_nat(args: &[Term], defs: &Defs) -> Option<u64> {
    nat_lit(&reduce(args.first()?, defs))
}

/// `Sure.Term.reduce.prim`.
fn prim(head: &Term, args: &[Term], defs: &Defs) -> Option<Term> {
    let Term::Ref(name) = head else {
        return None;
    };
    match name.as_ref() {
        "Nat.read" => {
            let s = str_lit(args.first()?)?;
            let n = if s.is_empty() {
                0
            } else {
                parse_nat(&s).unwrap_or(0)
            };
            Some(rest(Term::Nat(n), args, 1, defs))
        }
        "Nat.add" => {
            let (a, b) = two_nats(args, defs)?;
            let n = a.checked_add(b)?;
            Some(rest(Term::Nat(n), args, 2, defs))
        }
        "Nat.mul" => {
            let (a, b) = two_nats(args, defs)?;
            let n = a.checked_mul(b)?;
            Some(rest(Term::Nat(n), args, 2, defs))
        }
        "Nat.sub" => {
            let (a, b) = two_nats(args, defs)?;
            Some(rest(Term::Nat(a.saturating_sub(b)), args, 2, defs))
        }
        "Nat.div" => {
            let (a, b) = two_nats(args, defs)?;
            let q = a.checked_div(b).unwrap_or(0);
            Some(rest(Term::Nat(q), args, 2, defs))
        }
        "Nat.mod" => {
            let (a, b) = two_nats(args, defs)?;
            let r = a.checked_rem(b).unwrap_or(a);
            Some(rest(Term::Nat(r), args, 2, defs))
        }
        "Nat.eql" => {
            let (a, b) = two_nats(args, defs)?;
            Some(rest(reduce_bool(a == b), args, 2, defs))
        }
        "Nat.ltn" => {
            let (a, b) = two_nats(args, defs)?;
            Some(rest(reduce_bool(a < b), args, 2, defs))
        }
        "Nat.gtn" => {
            let (a, b) = two_nats(args, defs)?;
            Some(rest(reduce_bool(a > b), args, 2, defs))
        }
        "Nat.lte" => {
            let (a, b) = two_nats(args, defs)?;
            Some(rest(reduce_bool(a <= b), args, 2, defs))
        }
        "Nat.gte" => {
            let (a, b) = two_nats(args, defs)?;
            Some(rest(reduce_bool(a >= b), args, 2, defs))
        }
        "Nat.show" => {
            let a = one_nat(args, defs)?;
            Some(rest(Term::Str(a.to_string()), args, 1, defs))
        }
        "Nat.is_zero" => {
            let a = one_nat(args, defs)?;
            Some(rest(reduce_bool(a == 0), args, 1, defs))
        }
        _ => None,
    }
}

fn parse_nat(s: &str) -> Option<u64> {
    if s.is_empty() {
        return None;
    }
    s.parse().ok()
}

/// `Sure.Term.reduce.nat_lit`.
pub fn nat_lit(term: &Term) -> Option<u64> {
    match term {
        Term::Nat(n) => Some(*n),
        Term::Ref(n) if n.as_ref() == "Nat.zero" => Some(0),
        Term::Ori { expr, .. } | Term::Imp { expr } => nat_lit(expr),
        Term::Ann { term, .. } => nat_lit(term),
        Term::App { func, argm } => match func.as_ref() {
            Term::Ref(n) if n.as_ref() == "Nat.succ" => nat_lit(argm)?.checked_add(1),
            Term::Ori { expr, .. } | Term::Imp { expr } => {
                nat_lit(&app((**expr).clone(), (**argm).clone()))
            }
            Term::Ann { term, .. } => nat_lit(&app((**term).clone(), (**argm).clone())),
            _ => None,
        },
        _ => None,
    }
}

/// `Sure.Term.reduce.str_lit`.
pub fn str_lit(term: &Term) -> Option<String> {
    match term {
        Term::Str(s) => Some(s.clone()),
        Term::Ref(n) if n.as_ref() == "String.nil" => Some(String::new()),
        Term::Ori { expr, .. } | Term::Imp { expr } => str_lit(expr),
        Term::Ann { term, .. } => str_lit(term),
        Term::App { .. } => {
            let (head, args) = spine(term);
            match head {
                Term::Ref(n) if n.as_ref() == "String.cons" && args.len() >= 2 => {
                    let Term::Chr(c) = args[0] else {
                        return None;
                    };
                    let rest = str_lit(&args[1])?;
                    let mut s = String::new();
                    s.push(c);
                    s.push_str(&rest);
                    Some(s)
                }
                _ => None,
            }
        }
        _ => None,
    }
}

/// `Sure.Term.unroll_nat`.
pub fn unroll_nat(n: u64) -> Term {
    if n == 0 {
        r#ref("Nat.zero")
    } else {
        app(r#ref("Nat.succ"), Term::Nat(n - 1))
    }
}

/// `Sure.Term.unroll_str`.
pub fn unroll_str(s: &str) -> Term {
    match s.chars().next() {
        None => r#ref("String.nil"),
        Some(c) => {
            let rest: String = s.chars().skip(1).collect();
            apps(r#ref("String.cons"), [Term::Chr(c), Term::Str(rest)])
        }
    }
}

/// `Sure.Term.unroll_chr`.
pub fn unroll_chr(c: char) -> Term {
    let bits = unroll_chr_bits(&char_to_bits(c));
    let word = apps(r#ref("Word.from_bits"), [Term::Nat(16), bits]);
    app(r#ref("U16.new"), word)
}

fn unroll_chr_bits(bits: &Bits) -> Term {
    match bits {
        Bits::E => r#ref("Bits.e"),
        Bits::O(p) => app(r#ref("Bits.o"), unroll_chr_bits(p)),
        Bits::I(p) => app(r#ref("Bits.i"), unroll_chr_bits(p)),
    }
}

/// 16-bit Word, LSB = outermost `Bits` constructor (`Word.to_nat`).
fn char_to_bits(c: char) -> Bits {
    let n = c as u32;
    let n = if n > 0xFFFF { 0xFFFD } else { n };
    let mut b = Bits::E;
    for i in (0..16).rev() {
        let bit = (n >> i) & 1;
        b = if bit == 1 {
            Bits::I(Box::new(b))
        } else {
            Bits::O(Box::new(b))
        };
    }
    b
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bind::bind_term;
    use sure_syntax::parse_term;

    fn parse(src: &str) -> Term {
        parse_term(src).unwrap()
    }

    fn empty() -> Defs {
        Defs::new()
    }

    fn unori(term: &Term) -> &Term {
        match term {
            Term::Ori { expr, .. } => unori(expr),
            _ => term,
        }
    }

    #[test]
    fn beta_via_open_lam() {
        let t = bind_term(&parse("(x) x(x)"));
        let t = app(t, Term::Str("k".into()));
        match reduce(&t, &empty()) {
            Term::App { func, argm } => {
                assert_eq!(unori(&func), &Term::Str("k".into()));
                assert_eq!(unori(&argm), &Term::Str("k".into()));
            }
            other => panic!("expected App(\"k\",\"k\"), got {other:?}"),
        }
    }

    #[test]
    fn let_and_def_subst() {
        // `reduce` of nat/str unrolls; a leftover ref is a stable identity.
        let let_t = Term::Let {
            name: Name::from("x"),
            expr: Box::new(r#ref("Hello.greet")),
            body: Box::new(Term::Var {
                name: Name::from("x"),
                level: 0,
            }),
            bind_level: 0,
        };
        assert_eq!(reduce(&let_t, &empty()), r#ref("Hello.greet"));
        let def_t = Term::Def {
            name: Name::from("x"),
            expr: Box::new(r#ref("Hello.greet")),
            body: Box::new(Term::Var {
                name: Name::from("x"),
                level: 0,
            }),
            bind_level: 0,
        };
        assert_eq!(reduce(&def_t, &empty()), r#ref("Hello.greet"));
    }

    #[test]
    fn nat_add_prim_two_plus_two() {
        let t = parse("Nat.add(2, 2)");
        assert_eq!(reduce(&t, &empty()), Term::Nat(4));
        let t = parse("Nat.add(2, 2)");
        assert_ne!(reduce(&t, &empty()), Term::Nat(5));
    }

    #[test]
    fn nat_unroll_zero() {
        assert_eq!(reduce(&Term::Nat(0), &empty()), r#ref("Nat.zero"));
    }

    #[test]
    fn str_unroll_one_cons() {
        match reduce(&Term::Str("Sure".into()), &empty()) {
            Term::App { func, argm } => {
                assert_eq!(*argm, Term::Str("ure".into()));
                match *func {
                    Term::App { func, argm } => {
                        assert_eq!(*func, r#ref("String.cons"));
                        assert_eq!(*argm, Term::Chr('S'));
                    }
                    other => panic!("expected cons cell, got {other:?}"),
                }
            }
            other => panic!("expected App, got {other:?}"),
        }
    }

    #[test]
    fn cse_is_not_reduced() {
        let t = parse("case n { zero: m, succ: m }");
        let r = reduce(&t, &empty());
        fn is_cse(t: &Term) -> bool {
            match t {
                Term::Cse { .. } => true,
                Term::Ori { expr, .. } => is_cse(expr),
                _ => false,
            }
        }
        assert!(is_cse(&r), "reduce must not unfold cse, got {r:?}");
    }

    #[test]
    fn unfold_ref_to_def_term() {
        let mut defs = Defs::new();
        defs.insert(
            Name::from("Hello.greet"),
            sure_syntax::Def {
                file: String::new(),
                code: String::new(),
                orig: sure_syntax::Span::new(0, 0),
                name: Name::from("Hello.greet"),
                term: Term::Str("Sure".into()),
                typ: r#ref("String"),
                isct: false,
                arit: 0,
                stat: sure_syntax::Status::Init,
            },
        );
        assert_eq!(
            reduce(&r#ref("Hello.greet"), &defs),
            reduce(&Term::Str("Sure".into()), &empty())
        );
    }
}
