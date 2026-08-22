//! `Sure.Term.show` (enough that `shown_has_hole` agrees) and the CLI hole regex.

use sure_syntax::{Term, WithBinder};

/// `Sure.Term.show`.
pub fn show(term: &Term) -> String {
    show_go(term)
}

/// CLI `shown_has_hole` (`main.js`): `_` / `?…` outside strings and chars.
pub fn shown_has_hole(shown: &str) -> bool {
    if shown.is_empty() {
        return false;
    }
    let stripped = strip_quoted(shown);
    has_underscore_hole(&stripped) || has_question_hole(&stripped)
}

fn strip_quoted(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if ch == '"' || ch == '\'' {
            let q = ch;
            i += 1;
            while i < chars.len() && chars[i] != q {
                if chars[i] == '\\' {
                    i += 1;
                }
                i += 1;
            }
            i += 1;
            continue;
        }
        out.push(ch);
        i += 1;
    }
    out
}

fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '.' || c == '_'
}

fn has_underscore_hole(s: &str) -> bool {
    let chars: Vec<char> = s.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if c != '_' {
            continue;
        }
        let prev_ok = i == 0 || !is_ident_char(chars[i - 1]);
        if prev_ok {
            return true;
        }
    }
    false
}

fn has_question_hole(s: &str) -> bool {
    let chars: Vec<char> = s.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if c != '?' {
            continue;
        }
        let prev_ok = i == 0 || !is_ident_char(chars[i - 1]);
        if prev_ok {
            return true;
        }
    }
    false
}

fn show_go(term: &Term) -> String {
    if let Some(n) = as_nat(term) {
        return n.to_string();
    }
    match term {
        Term::Ref(name) | Term::Var { name, .. } => name.to_string(),
        Term::Typ => "Type".into(),
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            ..
        } => {
            let open = if *eras { "<" } else { "(" };
            let clos = if *eras { ">" } else { ")" };
            format!(
                "{self_name}{open}{name}:{}{clos} -> {}",
                show_go(xtyp),
                show_go(body)
            )
        }
        Term::Lam { name, body, .. } => format!("({name}) {}", show_go(body)),
        Term::App { .. } => show_app(term, Vec::new()),
        Term::Let {
            name, expr, body, ..
        } => format!("let {name} = {}; {}", show_go(expr), show_go(body)),
        Term::Def {
            name, expr, body, ..
        } => format!("def {name} = {}; {}", show_go(expr), show_go(body)),
        Term::Ann { term, typ, .. } => format!("{}::{}", show_go(term), show_go(typ)),
        Term::Gol { name, .. } => format!("?{name}"),
        Term::Hol { .. } => "_".into(),
        Term::Nat(n) => n.to_string(),
        Term::Chr(c) => format!("'{}'", escape_char(*c)),
        Term::Str(s) => format!("\"{}\"", escape_str(s)),
        Term::Num { sign, numb, frac } => {
            let mut s = String::new();
            match sign {
                Some(true) => s.push('+'),
                Some(false) => s.push('-'),
                None => {}
            }
            s.push_str(&numb.to_string());
            if let Some(f) = frac {
                s.push('.');
                s.push_str(&f.to_string());
            }
            s
        }
        Term::Cse {
            expr,
            name,
            with,
            cses,
            moti,
            ..
        } => {
            let wyth = show_with(with);
            let mut cases = String::new();
            for (cname, branch) in cses {
                cases.push_str(cname);
                cases.push_str(": ");
                cases.push_str(&show_go(branch));
                cases.push_str(", ");
            }
            let moti = match moti {
                Some(m) => format!(": {}", show_go(m)),
                None => String::new(),
            };
            format!("case {} as {name}{wyth} {{ {cases}}}{moti}", show_go(expr))
        }
        Term::New { args } => {
            let inner: Vec<String> = args.iter().map(show_go).collect();
            format!("{{{}}}", inner.join(","))
        }
        Term::Get { expr, fkey } => format!("{}@{fkey}", show_go(expr)),
        Term::Set { expr, fkey, fval } => {
            format!("{}@{fkey} <- {}", show_go(expr), show_go(fval))
        }
        Term::Mut { expr, fkey, ffun } => {
            format!("{}@{fkey} <= {}", show_go(expr), show_go(ffun))
        }
        Term::Ope { name, arg0, arg1 } => {
            format!("({} {name} {})", show_go(arg0), show_go(arg1))
        }
        Term::Imp { expr } => format!("${}", show_go(expr)),
        Term::Ori { expr, .. } => show_go(expr),
    }
}

fn show_with(with: &[WithBinder]) -> String {
    let parts: Vec<String> = with
        .iter()
        .map(|w| match &w.typ {
            None => w.name.to_string(),
            Some(t) => format!("{}: {}", w.name, show_go(t)),
        })
        .collect();
    parts.join("; ")
}

fn show_app(term: &Term, mut args: Vec<String>) -> String {
    match term {
        Term::App { func, argm } => {
            args.insert(0, show_go(argm));
            show_app(func, args)
        }
        Term::Ori { expr, .. } => show_app(expr, args),
        _ => show_app_done(term, args),
    }
}

fn show_app_done(term: &Term, args: Vec<String>) -> String {
    if is_ref(term, "Equal") && args.len() == 3 {
        let lft = args.get(1).map(String::as_str).unwrap_or("?");
        let rgt = args.get(2).map(String::as_str).unwrap_or("?");
        return format!("{lft} == {rgt}");
    }
    let func = show_go(term);
    let wrap = func.starts_with('(');
    let args_s = args.join(",");
    if wrap {
        format!("({func})({args_s})")
    } else {
        format!("{func}({args_s})")
    }
}

fn is_ref(term: &Term, name: &str) -> bool {
    match term {
        Term::Ref(n) => n.as_ref() == name,
        Term::Ori { expr, .. } => is_ref(expr, name),
        _ => false,
    }
}

fn as_nat(term: &Term) -> Option<u64> {
    match term {
        Term::App { func, argm } => match func.as_ref() {
            Term::Ref(n) if n.as_ref() == "Nat.succ" => as_nat(argm)?.checked_add(1),
            Term::Ori { expr, .. } => match expr.as_ref() {
                Term::Ref(n) if n.as_ref() == "Nat.succ" => as_nat(argm)?.checked_add(1),
                _ => None,
            },
            _ => None,
        },
        Term::Ref(n) if n.as_ref() == "Nat.zero" => Some(0),
        Term::Ori { expr, .. } => as_nat(expr),
        _ => None,
    }
}

fn escape_str(s: &str) -> String {
    s.chars().map(escape_char).collect()
}

fn escape_char(c: char) -> String {
    match c {
        '\\' => "\\\\".into(),
        '"' => "\\\"".into(),
        '\'' => "\\'".into(),
        c if (' '..='~').contains(&c) => c.to_string(),
        c => format!("\\u{{{:x}}}", u32::from(c)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bind::{bind_term, bind_type};
    use crate::has_holes::has_holes;
    use sure_syntax::{parse_file, parse_term, Defs};

    fn parse(src: &str) -> Term {
        parse_term(src).unwrap()
    }

    #[test]
    fn shown_has_hole_matches_js() {
        assert!(shown_has_hole("_"));
        assert!(shown_has_hole("?admit"));
        assert!(!shown_has_hole("Equal.refl(Nat,4)"));
        assert!(!shown_has_hole(r#""foo_bar""#));
        assert!(!shown_has_hole(r#""Sure""#));
        assert!(shown_has_hole("Equal.refl(_,_)"));
    }

    #[test]
    fn show_hol_gol_agree_with_shown_has_hole() {
        assert!(shown_has_hole(&show(&Term::Hol {
            path: sure_syntax::Bits::E
        })));
        assert!(shown_has_hole(&show(&Term::Gol {
            name: sure_syntax::Name::from("admit"),
            dref: Vec::new(),
            verb: false,
        })));
        assert!(!shown_has_hole(&show(&Term::Nat(4))));
        assert!(!shown_has_hole(&show(&Term::Str("Sure".into()))));
    }

    #[test]
    fn hello_greet_spec_demo_show() {
        let mut defs = Defs::new();
        parse_file(
            "Hello.sure",
            include_str!("../../../examples/hello/src/Hello.sure"),
            &mut defs,
        )
        .unwrap();
        let greet = defs.get("Hello.greet").unwrap();
        assert_eq!(show(&bind_term(&greet.term)), r#""Sure""#);
        assert!(!shown_has_hole(&show(&bind_term(&greet.term))));
        assert!(!has_holes(&bind_term(&greet.term)));

        let spec = defs.get("Hello.Spec").unwrap();
        assert_eq!(show(&bind_type(&spec.typ)), r#"Hello.greet == "Sure""#);
        let spec_term = show(&bind_term(&spec.term));
        assert!(
            spec_term.contains("Equal.refl"),
            "spec term show: {spec_term}"
        );
        assert!(shown_has_hole(&spec_term));
        assert!(has_holes(&bind_term(&spec.term)));

        let demo = defs.get("Hello.demo").unwrap();
        assert_eq!(show(&bind_term(&demo.term)), "IO.print(Hello.greet)");
        assert!(!shown_has_hole(&show(&bind_term(&demo.term))));
    }

    #[test]
    fn show_lambda_and_nat() {
        assert_eq!(show(&bind_term(&parse("(x) x"))), "(x) x");
        assert_eq!(show(&Term::Nat(4)), "4");
        assert_eq!(show(&crate::reduce::unroll_nat(0)), "0");
    }
}
