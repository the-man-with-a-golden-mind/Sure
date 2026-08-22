//! Sure type checker: bind, reduce, equal, check, expand, synth fix.
//!
//! `subst_levels` / `open_all` / `open_lam` live in `sure-syntax` and are
//! **not** re-exported here (that would pull `sure-fmc` into a cycle later).

mod bind;
mod check;
mod context;
mod equal;
mod error;
mod expand;
mod fix;
mod has_holes;
mod reduce;
mod show;
mod status;

pub use bind::{bind, bind_holes, bind_term, bind_type, PathBuilder};
pub use check::{cant_infer, check, check_direct, check_patch};
pub use context::{at_last, find, Context};
pub use equal::{equal, equal_go, equal_hole};
pub use error::{Check, Error, TypeSide};
pub use expand::{expand_cse, expand_get, expand_new, get_name_of_self_type};
pub use fix::{patch_at, synth_fix, synth_one, Loader, StubLoader};
pub use has_holes::has_holes;
pub use reduce::{normalize, reduce};
pub use show::{show, shown_has_hole};

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;
    use sure_syntax::{parse_file, parse_term, Defs, Term};

    fn hello_defs() -> Defs {
        let mut defs = Defs::new();
        parse_file(
            "Hello.sure",
            include_str!("../../../examples/hello/src/Hello.sure"),
            &mut defs,
        )
        .expect("parse Hello.sure");
        defs
    }

    #[test]
    fn hello_greet_bind_reduce_equal() {
        let defs = hello_defs();
        let greet = defs.get("Hello.greet").unwrap();
        let term = bind_term(&greet.term);
        let typ = bind_type(&greet.typ);
        assert_eq!(show(&term), r#""Sure""#);
        assert_eq!(show(&typ), "String");
        assert!(!has_holes(&term));
        assert!(!shown_has_hole(&show(&term)));
        assert!(equal(&term, &Term::Str("Sure".into()), &Defs::new()));
    }

    #[test]
    fn hello_spec_has_holes_until_patch() {
        let defs = hello_defs();
        let spec = defs.get("Hello.Spec").unwrap();
        let term = bind_term(&spec.term);
        let typ = bind_type(&spec.typ);
        assert_eq!(show(&typ), r#"Hello.greet == "Sure""#);
        assert!(has_holes(&term));
        assert!(shown_has_hole(&show(&term)));
    }

    #[test]
    fn nat_add_parsed_reduces() {
        let mut defs = Defs::new();
        parse_file(
            "Nat/add.sure",
            include_str!("../../../base/Nat/add.sure"),
            &mut defs,
        )
        .expect("parse Nat.add");
        let add = defs.get("Nat.add").unwrap();
        let term = bind_term(&add.term);
        fn is_lam(t: &Term) -> bool {
            match t {
                Term::Lam { .. } => true,
                Term::Ori { expr, .. } => is_lam(expr),
                _ => false,
            }
        }
        assert!(is_lam(&term), "Nat.add body is a lambda, got {term:?}");
        let call = parse_term("Nat.add(2, 2)").unwrap();
        assert_eq!(reduce(&call, &defs), Term::Nat(4));
        assert!(equal(&call, &Term::Nat(4), &defs));
        assert!(!equal(&call, &Term::Nat(5), &defs));
    }
}
