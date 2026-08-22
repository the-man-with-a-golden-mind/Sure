//! `Sure.Term.has_holes`, plus residual `Gol` (`admit` / `?name`).

use sure_syntax::{open_all, open_lam, Term};

/// Residual hole: `Hol` (unification metavar) or `Gol` (`_` / `admit` / `?name`).
/// Walks every constructor so a hole under `cse`/`get` still fails the gate.
pub fn has_holes(term: &Term) -> bool {
    match term {
        Term::Hol { .. } | Term::Gol { .. } => true,
        Term::All {
            xtyp,
            body,
            bind_level,
            ..
        } => has_holes(xtyp) || has_holes(&open_all(body, *bind_level, &Term::Typ, &Term::Typ)),
        Term::Lam {
            body, bind_level, ..
        } => has_holes(&open_lam(body, *bind_level, &Term::Typ)),
        Term::App { func, argm } => has_holes(func) || has_holes(argm),
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
        } => has_holes(expr) || has_holes(&open_lam(body, *bind_level, &Term::Typ)),
        Term::Ann { term, typ, .. } => has_holes(term) || has_holes(typ),
        Term::Ori { expr, .. } | Term::Imp { expr } => has_holes(expr),
        Term::Cse {
            expr,
            with,
            cses,
            moti,
            ..
        } => {
            has_holes(expr)
                || with
                    .iter()
                    .any(|w| has_holes(&w.term) || w.typ.as_ref().is_some_and(has_holes))
                || cses.values().any(has_holes)
                || moti.as_deref().is_some_and(has_holes)
        }
        Term::New { args } => args.iter().any(has_holes),
        Term::Get { expr, .. } => has_holes(expr),
        Term::Set { expr, fval, .. } => has_holes(expr) || has_holes(fval),
        Term::Mut { expr, ffun, .. } => has_holes(expr) || has_holes(ffun),
        Term::Ope { arg0, arg1, .. } => has_holes(arg0) || has_holes(arg1),
        Term::Var { .. }
        | Term::Ref(_)
        | Term::Typ
        | Term::Nat(_)
        | Term::Chr(_)
        | Term::Str(_)
        | Term::Num { .. } => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bind::bind_term;
    use sure_syntax::{parse_term, Bits, Name};

    fn parse(src: &str) -> Term {
        parse_term(src).unwrap()
    }

    #[test]
    fn hol_and_gol_are_holes() {
        assert!(has_holes(&Term::Hol { path: Bits::E }));
        assert!(has_holes(&Term::Gol {
            name: Name::from("admit"),
            dref: Vec::new(),
            verb: false,
        }));
        assert!(!has_holes(&Term::Nat(4)));
        assert!(!has_holes(&Term::Str("Sure".into())));
    }

    #[test]
    fn refl_has_holes_until_patched() {
        let t = bind_term(&parse("refl"));
        assert!(has_holes(&t));
    }

    #[test]
    fn string_and_nat_have_no_holes() {
        assert!(!has_holes(&bind_term(&parse(r#""Sure""#))));
        assert!(!has_holes(&bind_term(&parse("4"))));
    }
}
