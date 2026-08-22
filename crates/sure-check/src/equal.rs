//! `Sure.Term.equal.go` + `equal.hole` + serialize-hash shortcut.

use std::collections::HashSet;

use sure_syntax::{open_all, open_lam, Bits, Defs, Name, Term};

use crate::error::{Check, Error};
use crate::has_holes::has_holes;
use crate::reduce::{nat_lit, normalize, reduce};

/// `Sure.Term.equal`.
pub fn equal(a: &Term, b: &Term, defs: &Defs) -> bool {
    equal_go(a, b, defs, 0, &HashSet::new())
        .value
        .unwrap_or(false)
}

/// `Sure.Term.equal.go`.
pub fn equal_go(a: &Term, b: &Term, defs: &Defs, lv: u32, seen: &HashSet<String>) -> Check<bool> {
    let empty = Defs::new();
    let ah = serialize(&reduce(a, &empty), lv, false);
    let bh = serialize(&reduce(b, &empty), lv, true);
    if bits_eql(&ah, &bh) {
        return Check::pure(true);
    }
    let a1 = reduce(a, defs);
    let b1 = reduce(b, defs);
    let ah = serialize(&a1, lv, false);
    let bh = serialize(&b1, lv, true);
    if bits_eql(&ah, &bh) {
        return Check::pure(true);
    }
    let id = bits_key(&bits_concat(&ah, bh));
    if seen.contains(&id) {
        return extra_holes(a, b).map(|()| true);
    }
    match (&a1, &b1) {
        (Term::All { .. }, Term::Hol { path }) => equal_hole(path, a),
        (Term::Lam { .. }, Term::Hol { path }) => equal_hole(path, a),
        (Term::App { .. }, Term::Hol { path }) => equal_hole(path, a),
        (Term::Let { .. }, Term::Hol { path }) => equal_hole(path, a),
        (Term::Hol { path }, _) => equal_hole(path, b),
        (_, Term::Hol { path }) => equal_hole(path, a),
        (
            Term::All {
                eras: ae,
                self_name: aself,
                name: aname,
                xtyp: axtyp,
                body: abody,
                bind_level: ab,
            },
            Term::All {
                eras: be,
                self_name: bself,
                name: bname,
                xtyp: bxtyp,
                body: bbody,
                bind_level: bb,
            },
        ) => {
            if aself.as_ref() != bself.as_ref() || ae != be {
                return Check::pure(false);
            }
            let mut seen = seen.clone();
            seen.insert(id);
            let a_body = open_all(
                abody,
                *ab,
                &var(aself, lv),
                &var(aname, lv.saturating_add(1)),
            );
            let b_body = open_all(
                bbody,
                *bb,
                &var(bself, lv),
                &var(bname, lv.saturating_add(1)),
            );
            equal_go(axtyp, bxtyp, defs, lv, &seen).and_then(|eq_type| {
                equal_go(&a_body, &b_body, defs, lv.saturating_add(2), &seen)
                    .map(|eq_body| eq_type && eq_body)
            })
        }
        (
            Term::Lam {
                name: aname,
                body: abody,
                bind_level: ab,
            },
            Term::Lam {
                name: bname,
                body: bbody,
                bind_level: bb,
            },
        ) => {
            let mut seen = seen.clone();
            seen.insert(id);
            let a_body = open_lam(abody, *ab, &var(aname, lv));
            let b_body = open_lam(bbody, *bb, &var(bname, lv));
            equal_go(&a_body, &b_body, defs, lv.saturating_add(1), &seen)
        }
        (Term::App { func: af, argm: aa }, Term::App { func: bf, argm: ba }) => {
            let mut seen = seen.clone();
            seen.insert(id);
            equal_go(af, bf, defs, lv, &seen).and_then(|eq_func| {
                equal_go(aa, ba, defs, lv, &seen).map(|eq_argm| eq_func && eq_argm)
            })
        }
        (
            Term::Let {
                name: aname,
                expr: ae,
                body: abody,
                bind_level: ab,
            },
            Term::Let {
                name: bname,
                expr: be,
                body: bbody,
                bind_level: bb,
            },
        ) => {
            let mut seen = seen.clone();
            seen.insert(id);
            let a_body = open_lam(abody, *ab, &var(aname, lv));
            let b_body = open_lam(bbody, *bb, &var(bname, lv));
            equal_go(ae, be, defs, lv, &seen).and_then(|eq_expr| {
                equal_go(&a_body, &b_body, defs, lv.saturating_add(1), &seen)
                    .map(|eq_body| eq_expr && eq_body)
            })
        }
        _ => Check::pure(false),
    }
}

/// `Sure.Term.equal.hole`.
pub fn equal_hole(path: &Bits, term: &Term) -> Check<bool> {
    match term {
        Term::Hol { .. } => Check::pure(true),
        _ if has_holes(term) => Check::pure(true),
        _ => Check::result(
            Some(true),
            vec![Error::Patch {
                path: path.clone(),
                term: normalize(term, &Defs::new()),
            }],
        ),
    }
}

/// `Sure.Term.identical`: serialize-hash equality at level `lv`.
pub(crate) fn identical(a: &Term, b: &Term, lv: u32) -> bool {
    bits_eql(&serialize(a, lv, false), &serialize(b, lv, true))
}

fn var(name: &Name, level: u32) -> Term {
    Term::Var {
        name: name.clone(),
        level,
    }
}

fn extra_holes(a: &Term, b: &Term) -> Check<()> {
    match (funari(a, 0), funari(b, 0)) {
        (Some((af, aa)), Some((bf, ba))) if af == bf && aa == ba => filler(a, b),
        _ => Check::pure(()),
    }
}

fn funari(term: &Term, arity: u32) -> Option<(String, u32)> {
    match term {
        Term::App { func, .. } => funari(func, arity + 1),
        Term::Imp { expr } | Term::Ori { expr, .. } => funari(expr, arity),
        Term::Ref(name) | Term::Var { name, .. } => Some((name.to_string(), arity)),
        _ => None,
    }
}

fn filler(a: &Term, b: &Term) -> Check<()> {
    match (a, b) {
        (Term::App { func: af, argm: aa }, Term::App { func: bf, argm: ba }) => {
            filler(af, bf).and_then(|()| filler(aa, ba))
        }
        (_, Term::Imp { expr } | Term::Ori { expr, .. }) => filler(a, expr),
        (Term::Imp { expr } | Term::Ori { expr, .. }, _) => filler(expr, b),
        (_, Term::Hol { path }) => equal_hole(path, a).map(|_| ()),
        (Term::Hol { path }, _) => equal_hole(path, b).map(|_| ()),
        _ => Check::pure(()),
    }
}

fn bits_o(inner: Bits) -> Bits {
    Bits::O(Box::new(inner))
}

fn bits_i(inner: Bits) -> Bits {
    Bits::I(Box::new(inner))
}

fn bits_eql(a: &Bits, b: &Bits) -> bool {
    match (a, b) {
        (Bits::E, Bits::E) => true,
        (Bits::O(x), Bits::O(y)) | (Bits::I(x), Bits::I(y)) => bits_eql(x, y),
        _ => false,
    }
}

fn bits_concat(a: &Bits, b: Bits) -> Bits {
    match a {
        Bits::E => b,
        Bits::O(p) => bits_o(bits_concat(p, b)),
        Bits::I(p) => bits_i(bits_concat(p, b)),
    }
}

fn bits_key(b: &Bits) -> String {
    let mut s = String::new();
    fn go(b: &Bits, s: &mut String) {
        match b {
            Bits::E => {}
            Bits::O(p) => {
                s.push('0');
                go(p, s);
            }
            Bits::I(p) => {
                s.push('1');
                go(p, s);
            }
        }
    }
    go(b, &mut s);
    s
}

fn nat_to_bits(n: u64) -> Bits {
    if n == 0 {
        return bits_o(Bits::E);
    }
    let msb = 63 - n.leading_zeros();
    let mut b = Bits::E;
    for i in (0..=msb).rev() {
        let bit = (n >> i) & 1;
        b = if bit == 1 { bits_i(b) } else { bits_o(b) };
    }
    b
}

fn wrap6(pattern: &str, rest: Bits) -> Bits {
    let mut b = rest;
    for c in pattern.chars().rev() {
        b = if c == 'I' { bits_i(b) } else { bits_o(b) };
    }
    b
}

fn name_char_pattern(x: u32) -> &'static str {
    if x < 47 {
        "IIIIIO"
    } else if x < 58 {
        if x < 53 {
            if x < 50 {
                if x < 49 {
                    "IIOIOO"
                } else {
                    "IIOIOI"
                }
            } else if x < 51 {
                "IIOIIO"
            } else if x < 52 {
                "IIOIII"
            } else {
                "IIIOOO"
            }
        } else if x < 55 {
            if x < 54 {
                "IIIOOI"
            } else {
                "IIIOIO"
            }
        } else if x < 56 {
            "IIIOII"
        } else if x < 57 {
            "IIIIOO"
        } else {
            "IIIIOI"
        }
    } else if x < 91 {
        if x < 78 {
            if x < 71 {
                if x < 68 {
                    if x < 66 {
                        "OOOOOO"
                    } else if x < 67 {
                        "OOOOOI"
                    } else {
                        "OOOOIO"
                    }
                } else if x < 69 {
                    "OOOOII"
                } else if x < 70 {
                    "OOOIOO"
                } else {
                    "OOOIOI"
                }
            } else if x < 74 {
                if x < 72 {
                    "OOOIIO"
                } else if x < 73 {
                    "OOOIII"
                } else {
                    "OOIOOO"
                }
            } else if x < 76 {
                if x < 75 {
                    "OOIOOI"
                } else {
                    "OOIOIO"
                }
            } else if x < 77 {
                "OOIOII"
            } else {
                "OOIIOO"
            }
        } else if x < 84 {
            if x < 81 {
                if x < 79 {
                    "OOIIOI"
                } else if x < 80 {
                    "OOIIIO"
                } else {
                    "OOIIII"
                }
            } else if x < 82 {
                "IOOOOO"
            } else if x < 83 {
                "IOOOOI"
            } else {
                "IOOOIO"
            }
        } else if x < 87 {
            if x < 85 {
                "IOOOII"
            } else if x < 86 {
                "IOOIOO"
            } else {
                "IOOIOI"
            }
        } else if x < 89 {
            if x < 88 {
                "IOOIIO"
            } else {
                "IOOIII"
            }
        } else if x < 90 {
            "IOIOOO"
        } else {
            "IOIOOI"
        }
    } else if x < 96 {
        "IIIIII"
    } else if x < 110 {
        if x < 103 {
            if x < 100 {
                if x < 98 {
                    "OIIOIO"
                } else if x < 99 {
                    "OIIOII"
                } else {
                    "OIIIOO"
                }
            } else if x < 101 {
                "OIIIOI"
            } else if x < 102 {
                "OIIIIO"
            } else {
                "OIIIII"
            }
        } else if x < 106 {
            if x < 104 {
                "IOOOOO"
            } else if x < 105 {
                "IOOOOI"
            } else {
                "IOOOIO"
            }
        } else if x < 108 {
            if x < 107 {
                "IOOOII"
            } else {
                "IOOIOO"
            }
        } else if x < 109 {
            "IOOIOI"
        } else {
            "IOOIIO"
        }
    } else if x < 116 {
        if x < 113 {
            if x < 111 {
                "IOOIII"
            } else if x < 112 {
                "IOIOOO"
            } else {
                "IOIOOI"
            }
        } else if x < 114 {
            "IOIOIO"
        } else if x < 115 {
            "IOIOII"
        } else {
            "IOIIOO"
        }
    } else if x < 119 {
        if x < 117 {
            "IOIIOI"
        } else if x < 118 {
            "IOIIIO"
        } else {
            "IOIIII"
        }
    } else if x < 121 {
        if x < 120 {
            "IIOOOO"
        } else {
            "IIOOOI"
        }
    } else if x < 122 {
        "IIOOIO"
    } else {
        "IIOOII"
    }
}

fn name_to_bits(name: &str) -> Bits {
    fn go(s: &str) -> Bits {
        let mut chars = s.chars();
        match chars.next() {
            None => Bits::E,
            Some(c) => wrap6(name_char_pattern(c as u32), go(chars.as_str())),
        }
    }
    go(name)
}

fn serialize_compact(n: u64, x: Bits) -> Bits {
    bits_i(bits_i(bits_i(bits_i(bits_concat(&nat_to_bits(n), x)))))
}

/// `Sure.Term.serialize`.
fn serialize(term: &Term, depth: u32, side: bool) -> Bits {
    let diff = if side {
        bits_o as fn(Bits) -> Bits
    } else {
        bits_i
    };
    serialize_go(term, depth, depth, diff, Bits::E)
}

fn serialize_go(term: &Term, depth: u32, init: u32, diff: fn(Bits) -> Bits, x: Bits) -> Bits {
    match term {
        Term::Ref(name) if name.as_ref() == "Nat.zero" => serialize_compact(0, x),
        Term::Ref(name) | Term::Gol { name, .. } => {
            bits_o(bits_o(bits_o(bits_concat(&name_to_bits(name), x))))
        }
        Term::Var { level, .. } => {
            if *level >= init {
                let rel = depth.saturating_sub(*level).saturating_sub(1);
                bits_o(bits_o(bits_i(bits_concat(&nat_to_bits(u64::from(rel)), x))))
            } else {
                bits_o(bits_i(bits_o(bits_concat(
                    &nat_to_bits(u64::from(*level)),
                    x,
                ))))
            }
        }
        Term::Typ => bits_o(bits_i(bits_i(x))),
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        } => {
            let eras_bit = if *eras { bits_i } else { bits_o };
            let body = open_all(
                body,
                *bind_level,
                &var(self_name, depth),
                &var(name, depth.saturating_add(1)),
            );
            let body_b = serialize_go(&body, depth.saturating_add(2), init, diff, x);
            let xtyp_b = serialize_go(xtyp, depth, init, diff, body_b);
            bits_i(bits_o(bits_o(eras_bit(bits_concat(
                &name_to_bits(self_name),
                xtyp_b,
            )))))
        }
        Term::Lam {
            name,
            body,
            bind_level,
        } => {
            let body = open_lam(body, *bind_level, &var(name, depth));
            let body_b = serialize_go(&body, depth.saturating_add(1), init, diff, x);
            bits_i(bits_o(bits_i(body_b)))
        }
        Term::App { func, argm } => {
            if let Some(n) = nat_lit(term) {
                serialize_compact(n, x)
            } else {
                let argm_b = serialize_go(argm, depth, init, diff, x);
                let func_b = serialize_go(func, depth, init, diff, argm_b);
                bits_i(bits_i(bits_o(func_b)))
            }
        }
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let body = open_lam(body, *bind_level, &var(name, depth));
            let body_b = serialize_go(&body, depth.saturating_add(1), init, diff, x);
            let expr_b = serialize_go(expr, depth, init, diff, body_b);
            bits_i(bits_i(bits_i(expr_b)))
        }
        Term::Def {
            expr,
            body,
            bind_level,
            ..
        } => serialize_go(&open_lam(body, *bind_level, expr), depth, init, diff, x),
        Term::Ann { term, .. } => serialize_go(term, depth, init, diff, x),
        Term::Hol { .. } => x,
        Term::Nat(n) => serialize_compact(*n, x),
        Term::Chr(c) => serialize_go(&crate::reduce::unroll_chr(*c), depth, init, diff, x),
        Term::Str(s) => serialize_go(&crate::reduce::unroll_str(s), depth, init, diff, x),
        Term::Imp { expr } | Term::Ori { expr, .. } => serialize_go(expr, depth, init, diff, x),
        _ => diff(x),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bind::bind_term;
    use crate::error::Error;
    use sure_syntax::parse_term;

    fn parse(src: &str) -> Term {
        parse_term(src).unwrap()
    }

    fn empty() -> Defs {
        Defs::new()
    }

    #[test]
    fn equal_identical_nats_and_strings() {
        assert!(equal(&Term::Nat(4), &Term::Nat(4), &empty()));
        assert!(equal(
            &Term::Str("Sure".into()),
            &Term::Str("Sure".into()),
            &empty()
        ));
        assert!(!equal(&Term::Nat(4), &Term::Nat(5), &empty()));
    }

    #[test]
    fn equal_nat_add_two_plus_two() {
        let four = parse("Nat.add(2, 2)");
        assert!(equal(&four, &Term::Nat(4), &empty()));
        assert!(!equal(&four, &Term::Nat(5), &empty()));
    }

    #[test]
    fn equal_alpha_lambdas() {
        let a = bind_term(&parse("(x) x"));
        let b = bind_term(&parse("(y) y"));
        assert!(equal(&a, &b, &empty()));
    }

    #[test]
    fn equal_hole_patches_nat() {
        let hol = Term::Hol { path: Bits::E };
        let chk = equal_go(&hol, &Term::Nat(4), &empty(), 0, &HashSet::new());
        assert_eq!(chk.value, Some(true));
        assert!(
            chk.errors
                .iter()
                .any(|e| matches!(e, Error::Patch { path: Bits::E, .. })),
            "expected patch, got {:?}",
            chk.errors
        );
    }

    #[test]
    fn equal_two_holes_no_patch() {
        let a = Term::Hol {
            path: Bits::O(Box::new(Bits::E)),
        };
        let b = Term::Hol {
            path: Bits::I(Box::new(Bits::E)),
        };
        let chk = equal_go(&a, &b, &empty(), 0, &HashSet::new());
        assert_eq!(chk.value, Some(true));
        assert!(chk.errors.is_empty());
    }

    #[test]
    fn equal_does_not_patch_term_with_holes() {
        let hol = Term::Hol { path: Bits::E };
        let refl = bind_term(&parse("refl"));
        let chk = equal_go(&hol, &refl, &empty(), 0, &HashSet::new());
        assert_eq!(chk.value, Some(true));
        assert!(chk.errors.is_empty());
    }
}
