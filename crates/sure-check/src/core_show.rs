//! `Sure.Core.show` / `Sure.Defs.core` (gold (a), not FormCore.js `show_defs`).

use sure_syntax::{open_all, open_lam, Defs, Name, Status, Term};

use crate::inline::inline;

fn var(name: Name, level: u32) -> Term {
    Term::Var { name, level }
}

/// `Sure.Code.escape.char`.
fn escape_char(c: char) -> String {
    match c {
        '\\' | '"' | '\'' => format!("\\{c}"),
        ' '..='~' => c.to_string(),
        c => format!("\\u{{{:x}}}", u32::from(c)),
    }
}

fn escape_str(s: &str) -> String {
    s.chars().map(escape_char).collect()
}

/// `Sure.Core.var_name`. `vars` is innermost-at-end (List.cons order reversed).
fn var_name(indx: u32, name: &str, brui: u32, vars: &[Name]) -> String {
    if indx == 0 {
        if brui == 0 {
            name.to_string()
        } else {
            format!("{name}^{brui}")
        }
    } else {
        match vars.split_last() {
            None => String::from("unbound"),
            Some((head, rest)) => {
                let brui = if name == head.as_ref() {
                    brui + 1
                } else {
                    brui
                };
                var_name(indx - 1, name, brui, rest)
            }
        }
    }
}

/// `Sure.Core.show.go`.
fn show_go(term: &Term, indx: u32, vars: &mut Vec<Name>) -> String {
    match term {
        Term::Ref(name) => name.to_string(),
        Term::Var { name, level } => {
            let skip = indx.saturating_sub(*level).saturating_sub(1);
            var_name(skip, name, 0, vars)
        }
        Term::Typ => String::from("*"),
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        } => {
            let init = if *eras { "%" } else { "@" };
            let xtyp_s = show_go(xtyp, indx, vars);
            let s = var(self_name.clone(), indx);
            let x = var(name.clone(), indx.saturating_add(1));
            let opened = open_all(body, *bind_level, &s, &x);
            vars.push(self_name.clone());
            vars.push(name.clone());
            let body_s = show_go(&opened, indx.saturating_add(2), vars);
            vars.pop();
            vars.pop();
            format!("{init}{self_name}({name}:{xtyp_s}) {body_s}")
        }
        Term::Lam {
            name,
            body,
            bind_level,
        } => {
            let x = var(name.clone(), indx);
            let opened = open_lam(body, *bind_level, &x);
            vars.push(name.clone());
            let body_s = show_go(&opened, indx.saturating_add(1), vars);
            vars.pop();
            format!("#{name} {body_s}")
        }
        Term::App { func, argm } => {
            format!(
                "({} {})",
                show_go(func, indx, vars),
                show_go(argm, indx, vars)
            )
        }
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr_s = show_go(expr, indx, vars);
            let x = var(name.clone(), indx);
            let opened = open_lam(body, *bind_level, &x);
            vars.push(name.clone());
            let body_s = show_go(&opened, indx.saturating_add(1), vars);
            vars.pop();
            format!("!{name} = {expr_s}; {body_s}")
        }
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr_s = show_go(expr, indx, vars);
            let x = var(name.clone(), indx);
            let opened = open_lam(body, *bind_level, &x);
            vars.push(name.clone());
            let body_s = show_go(&opened, indx.saturating_add(1), vars);
            vars.pop();
            format!("${name} = {expr_s}; {body_s}")
        }
        Term::Ann { term, typ, .. } => {
            format!(
                "{{{}:{}}}",
                show_go(term, indx, vars),
                show_go(typ, indx, vars)
            )
        }
        Term::Nat(n) => format!("+{n}"),
        Term::Chr(c) => format!("'{}'", escape_char(*c)),
        Term::Str(s) => format!("\"{}\"", escape_str(s)),
        Term::Imp { expr } | Term::Ori { expr, .. } => show_go(expr, indx, vars),
        _ => String::from("*"),
    }
}

/// `Sure.Core.show`.
pub fn core_show_term(term: &Term) -> String {
    show_go(term, 0, &mut Vec::new())
}

/// `Sure.Defs.core` after `Term.inline` of each done def.
///
/// Gold (a) vs JS `term_to_core`: nats `+N`, Ann `{term:type}`, `" : "`.
/// Iteration is sorted UTF-8 (`BTreeMap`), not JS `BitsMap` order.
pub fn core_show(defs: &Defs) -> String {
    let mut out = String::new();
    for (name, def) in defs {
        if !matches!(def.stat, Status::Done { .. }) {
            continue;
        }
        let term = inline(&def.term, defs);
        let typ = inline(&def.typ, defs);
        out.push_str(name);
        out.push_str(" : ");
        out.push_str(&core_show_term(&typ));
        out.push_str(" = ");
        out.push_str(&core_show_term(&term));
        out.push_str(";\n");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bind::{bind_term, bind_type};
    use sure_syntax::{parse_file, Def, Span};

    fn n(s: &str) -> Name {
        Name::from(s)
    }

    fn stub(name: &str, term: Term, typ: Term) -> Def {
        Def {
            file: "<stub>".into(),
            code: String::new(),
            orig: Span::new(0, 0),
            name: n(name),
            term,
            typ,
            isct: false,
            arit: 0,
            stat: Status::Done { cached: false },
        }
    }

    #[test]
    fn nats_plus_ann_braces_not_formcore_js() {
        assert_eq!(core_show_term(&Term::Nat(0)), "+0");
        assert_eq!(core_show_term(&Term::Nat(4)), "+4");
        let ann = Term::Ann {
            done: true,
            term: Box::new(Term::Ref(n("x"))),
            typ: Box::new(Term::Typ),
        };
        assert_eq!(core_show_term(&ann), "{x:*}");
        assert_eq!(core_show_term(&Term::Typ), "*");
        assert_eq!(core_show_term(&Term::Str("Sure".into())), "\"Sure\"");
        assert_eq!(core_show_term(&Term::Chr('A')), "'A'");
        assert_eq!(core_show_term(&Term::Chr('\n')), "'\\u{a}'");
    }

    #[test]
    fn all_lam_app_let_def_spaces() {
        let all = Term::All {
            eras: false,
            self_name: n(""),
            name: n("x"),
            xtyp: Box::new(Term::Typ),
            body: Box::new(Term::Var {
                name: n("x"),
                level: 1,
            }),
            bind_level: 0,
        };
        assert_eq!(core_show_term(&all), "@(x:*) x");
        let eras = Term::All {
            eras: true,
            self_name: n("s"),
            name: n("x"),
            xtyp: Box::new(Term::Typ),
            body: Box::new(Term::Var {
                name: n("s"),
                level: 0,
            }),
            bind_level: 0,
        };
        assert_eq!(core_show_term(&eras), "%s(x:*) s");
        let lam = Term::Lam {
            name: n("x"),
            body: Box::new(Term::Var {
                name: n("x"),
                level: 0,
            }),
            bind_level: 0,
        };
        assert_eq!(core_show_term(&lam), "#x x");
        let app = Term::App {
            func: Box::new(Term::Ref(n("f"))),
            argm: Box::new(Term::Ref(n("x"))),
        };
        assert_eq!(core_show_term(&app), "(f x)");
        let let_t = Term::Let {
            name: n("a"),
            expr: Box::new(Term::Typ),
            body: Box::new(Term::Var {
                name: n("a"),
                level: 0,
            }),
            bind_level: 0,
        };
        assert_eq!(core_show_term(&let_t), "!a = *; a");
        let def_t = Term::Def {
            name: n("a"),
            expr: Box::new(Term::Typ),
            body: Box::new(Term::Var {
                name: n("a"),
                level: 0,
            }),
            bind_level: 0,
        };
        assert_eq!(core_show_term(&def_t), "$a = *; a");
    }

    #[test]
    fn defs_core_space_before_colon() {
        let mut defs = Defs::new();
        defs.insert(n("n"), stub("n", Term::Nat(42), Term::Ref(n("Nat"))));
        assert_eq!(core_show(&defs), "n : Nat = +42;\n");
        let parsed = sure_fmc::parse_defs(&core_show(&defs)).unwrap();
        assert_eq!(parsed.get("n").unwrap().term, sure_fmc::Term::Nat(42));
    }

    #[test]
    fn hello_demo_core_show_gold_a() {
        let mut parsed = Defs::new();
        parse_file(
            "Hello.sure",
            include_str!("../../../examples/hello/src/Hello.sure"),
            &mut parsed,
        )
        .unwrap();
        let mut defs = Defs::new();
        for name in ["Hello.greet", "Hello.demo"] {
            let d = parsed.get(name).unwrap();
            defs.insert(n(name), stub(name, bind_term(&d.term), bind_type(&d.typ)));
        }
        let shown = core_show(&defs);
        assert_eq!(
            shown,
            "Hello.demo : (IO Unit) = (IO.print Hello.greet);\nHello.greet : String = \"Sure\";\n"
        );
        // Core.show, not FormCore.js `show_defs` (no space before `:`).
        assert!(!shown.contains("Hello.greet: "));
    }
}
