//! FormCore kernel.
//!
//! Port of `vendor/formcore-js/FormCore.js`. No dependency on sure-syntax
//! or sure-check; subst is copied (keep in sync with `sure-syntax/subst.rs`).

#![forbid(unsafe_code)]

mod check;
mod equal;
mod parse;
mod reduce;
mod show;
mod subst;
mod term;

pub use check::{typecheck, typeinfer, CheckError, Ctx, CtxEntry};
pub use equal::{equal, serialize};
pub use parse::{parse, parse_defs, ParseError};
pub use reduce::{normalize, reduce};
pub use show::{show, show_defs, show_string};
pub use subst::{open_all, open_lam, subst_levels};
pub use term::{Def, Defs, Name, Term};

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXAMPLE: &str = include_str!("../../../vendor/formcore-js/example.fmc");

    fn parse_term(src: &str) -> Term {
        parse(src).unwrap_or_else(|e| panic!("parse {src:?}: {e}"))
    }

    fn parse_map(src: &str) -> Defs {
        parse_defs(src).unwrap_or_else(|e| panic!("parse_defs: {e}"))
    }

    #[test]
    fn version_is_workspace() {
        assert_eq!(version(), "0.2.0");
    }

    #[test]
    fn show_matches_formcore_js_constructors() {
        assert_eq!(show(&parse_term("*")), "*");
        assert_eq!(show(&parse_term("+0")), "0");
        assert_eq!(show(&parse_term("+42")), "42");
        assert_eq!(show(&parse_term("{* : *}")), "*");
        assert_eq!(show(&parse_term("{x : *}")), "x");
        assert_eq!(show(&parse_term("#x x")), "#x x");
        assert_eq!(show(&parse_term("@s(x:*) x")), "@s(x:*) x");
        assert_eq!(show(&parse_term("%s(x:*) x")), "%s(x:*) x");
        assert_eq!(show(&parse_term("(* *)")), "(* *)");
        assert_eq!(show(&parse_term("!a=* ; a")), "!a=*;a");
        assert_eq!(show(&parse_term("$a=* ; a")), "$a=*;a");
        assert_eq!(show(&parse_term(r#""a\"b""#)), r#""a\"b""#);
        assert_eq!(show(&parse_term("'A'")), "'A'");
        assert_eq!(show(&parse_term("'\\u{61}'")), "'a'");
        assert_eq!(show(&parse_term("'\\u{0a}'")), "'\\u{a}'");
        assert_eq!(show(&parse_term("Foo.bar")), "Foo.bar");
        assert_eq!(show(&parse_term("Foo/bar")), "Foo/bar");
    }

    #[test]
    fn show_defs_format_no_space_before_colon() {
        let defs = parse_map("id : @(A: *) @(x: A) A = #A #x x;");
        assert_eq!(show_defs(&defs), "id: @(A:*) @(x:A) A = #A #x x;\n");
        let defs = parse_map("n : Nat = +42;");
        assert_eq!(show_defs(&defs), "n: Nat = 42;\n");
        let defs = parse_map("l : * = !x=* ; x;");
        assert_eq!(show_defs(&defs), "l: * = !x=*;x;\n");
    }

    #[test]
    fn parse_accepts_core_show_spaces() {
        assert_eq!(show(&parse_term("!x = * ; x")), "!x=*;x");
        assert_eq!(show(&parse_term("$x = * ; x")), "$x=*;x");
        assert_eq!(show(&parse_term("{x : *}")), "x");
        let defs = parse_map("id : @(A: *) @(x: A) A = #A #x x;");
        assert!(defs.contains_key("id"));
    }

    #[test]
    fn example_fmc_parse_show_roundtrip_and_typecheck() {
        let defs = parse_map(EXAMPLE);
        let expected = [
            (
                "Bool",
                "*",
                "%self(P:@(self:Bool) *) @(true:(P true)) @(false:(P false)) (P self)",
            ),
            ("true", "Bool", "#P #t #f t"),
            ("false", "Bool", "#P #t #f f"),
            ("not", "@(x:Bool) Bool", "#x (((x #self Bool) false) true)"),
            (
                "Equal",
                "@(A:*) @(a:A) @(b:A) *",
                "#A #a #b %self(P:@(b:A) @(self:(((Equal A) a) b)) *) @(refl:((P a) ((refl A) a))) ((P b) self)",
            ),
            (
                "refl",
                "%(A:*) %(a:A) (((Equal A) a) a)",
                "#A #x #P #refl refl",
            ),
            (
                "double_negation_theorem",
                "@(b:Bool) (((Equal Bool) (not (not b))) b)",
                "#b (((b #self (((Equal Bool) (not (not self))) self)) ((refl Bool) true)) ((refl Bool) false))",
            ),
            ("main", "Bool", "(not false)"),
        ];
        for (name, typ, term) in expected {
            let def = defs.get(name).unwrap_or_else(|| panic!("missing {name}"));
            assert_eq!(show(&def.typ), typ, "type of {name}");
            assert_eq!(show(&def.term), term, "term of {name}");
        }

        let shown = show_defs(&defs);
        let again = parse_map(&shown);
        assert_eq!(show_defs(&again), shown);

        let ctx = Ctx::new();
        for (name, def) in &defs {
            typecheck(&def.typ, &Term::Typ, &defs, &ctx)
                .unwrap_or_else(|e| panic!("check type {name}: {e}"));
            typecheck(&def.term, &def.typ, &defs, &ctx)
                .unwrap_or_else(|e| panic!("check term {name}: {e}"));
        }
    }

    #[test]
    fn reduce_beta_let_def_ann_nat() {
        let empty = Defs::new();
        let app = parse_term("!id=#A #x x;((id *) True)");
        assert_eq!(show(&reduce(&app, &empty)), "True");
        assert_eq!(show(&normalize(&app, &empty)), "True");

        assert_eq!(show(&reduce(&parse_term("+2"), &empty)), "(Nat.succ 1)");
        assert_eq!(
            show(&normalize(&parse_term("+2"), &empty)),
            "(Nat.succ (Nat.succ Nat.zero))"
        );
        assert_eq!(show(&reduce(&parse_term("+0"), &empty)), "Nat.zero");
        assert_eq!(show(&reduce(&parse_term("!x=* ; x"), &empty)), "*");
        assert_eq!(show(&reduce(&parse_term("$x=* ; x"), &empty)), "*");
        assert_eq!(show(&reduce(&parse_term("{* : Foo}"), &empty)), "*");

        let defs = parse_map("a : * = *; b : * = a;");
        assert_eq!(show(&reduce(&defs["b"].term, &defs)), "*");
    }

    #[test]
    fn equal_alpha_and_self_names() {
        let empty = Defs::new();
        assert!(equal(&parse_term("*"), &parse_term("*"), &empty));
        assert!(equal(&parse_term("#x x"), &parse_term("#y y"), &empty));
        assert!(!equal(&parse_term("*"), &parse_term("#x x"), &empty));
        assert!(equal(
            &parse_term("@s(x:*) *"),
            &parse_term("@s(x:*) *"),
            &empty
        ));
        assert!(!equal(
            &parse_term("@s(x:*) *"),
            &parse_term("%s(x:*) *"),
            &empty
        ));
        assert!(!equal(
            &parse_term("@s(x:*) *"),
            &parse_term("@t(x:*) *"),
            &empty
        ));
        let defs = parse_map("a : * = *; b : * = a;");
        assert!(equal(&defs["a"].term, &defs["b"].term, &defs));
    }

    #[test]
    fn serialize_matches_formcore_js() {
        assert_eq!(serialize(&parse_term("@s(x:*) x"), 0, 0), "@s*^-0");
        assert_eq!(serialize(&parse_term("@s(x:*) s"), 0, 0), "@s*^-1");
        assert_eq!(serialize(&parse_term("#x x"), 0, 0), "#^-0");
        assert_eq!(serialize(&parse_term("+3"), 0, 0), "+3");
        assert_eq!(serialize(&parse_term("(* *)"), 0, 0), "(* *)");
        assert_eq!(serialize(&parse_term("!x=* ; x"), 0, 0), "!*^-0");
        assert_eq!(serialize(&parse_term("$x=* ; x"), 0, 0), "$*^-0");
        assert_eq!(serialize(&parse_term("{Foo : *}"), 0, 0), "$Foo");
        assert_eq!(serialize(&parse_term("'A'"), 0, 0), "'A'");
        assert_eq!(serialize(&parse_term("\"hi\""), 0, 0), "\"hi\"");
        assert_eq!(serialize(&parse_term("Foo.bar"), 0, 0), "$Foo.bar");
        assert_eq!(serialize(&parse_term("#x #y (x y)"), 0, 0), "##(^-1 ^-0)");
        assert_eq!(serialize(&parse_term("*"), 0, 0), "*");
        // FormCore.js `dep - lvl - 1` is signed (`"^-" + -1` → `^--1`).
        assert_eq!(serialize(&Term::var("x", 0), 0, 0), "^--1");
    }

    #[test]
    fn typecheck_id_and_mismatch() {
        let defs = parse_map("id : @(A: *) @(x: A) A = #A #x x;");
        let ctx = Ctx::new();
        typecheck(&defs["id"].typ, &Term::Typ, &defs, &ctx).unwrap();
        typecheck(&defs["id"].term, &defs["id"].typ, &defs, &ctx).unwrap();

        let err = typecheck(&parse_term("#x x"), &Term::Typ, &Defs::new(), &ctx).unwrap_err();
        assert_eq!(err.msg, "Lambda has a non-function type.");

        // Ill-typed identity vs `@(x:*) x` used to overflow in `serialize`.
        let err = typecheck(
            &parse_term("#x x"),
            &parse_term("@(x:*) x"),
            &Defs::new(),
            &ctx,
        )
        .unwrap_err();
        assert!(
            err.msg.contains("Found type:"),
            "expected type error, got: {}",
            err.msg
        );

        let err = typeinfer(&parse_term("Nope"), &Defs::new(), &ctx).unwrap_err();
        assert_eq!(err.msg, "Unbound reference: 'Nope'.");
    }

    #[test]
    fn comments_only_at_line_start() {
        let defs = parse_map("// hello\nid : * = *;\n");
        assert_eq!(show_defs(&defs), "id: * = *;\n");
    }

    #[test]
    fn caret_skip_binds_outer() {
        let empty = Defs::new();
        let with_caret = parse_term("!f=#x #x x^1; (f *)");
        assert_eq!(show(&reduce(&with_caret, &empty)), "#x *");
        let no_caret = parse_term("!f=#x #x x; (f *)");
        assert_eq!(show(&reduce(&no_caret, &empty)), "#x x");
    }

    #[test]
    fn infer_literals() {
        let empty = Defs::new();
        let ctx = Ctx::new();
        assert_eq!(
            show(&typeinfer(&parse_term("*"), &empty, &ctx).unwrap()),
            "*"
        );
        assert_eq!(
            show(&typeinfer(&parse_term("+1"), &empty, &ctx).unwrap()),
            "Nat"
        );
        assert_eq!(
            show(&typeinfer(&parse_term("'A'"), &empty, &ctx).unwrap()),
            "Char"
        );
        assert_eq!(
            show(&typeinfer(&parse_term("\"A\""), &empty, &ctx).unwrap()),
            "String"
        );
    }

    #[test]
    fn unroll_chr_bit_spine() {
        let empty = Defs::new();
        assert_eq!(
            show(&reduce(&parse_term("'A'"), &empty)),
            "((((((((((((((((Char.new Bit.0) Bit.0) Bit.0) Bit.0) Bit.0) Bit.0) Bit.0) Bit.0) Bit.0) Bit.1) Bit.0) Bit.0) Bit.0) Bit.0) Bit.0) Bit.1)"
        );
        assert_eq!(show(&reduce(&parse_term("\"\""), &empty)), "String.nil");
    }
}
