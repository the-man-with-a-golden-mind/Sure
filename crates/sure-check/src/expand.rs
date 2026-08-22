//! `Sure.Term.check.expand.*` plus SmartMotive. `cse` is expanded, not reduced.

use std::collections::BTreeMap;

use sure_syntax::{open_all, open_lam, Bits, Defs, Name, Term, WithBinder};

use crate::equal::identical;
use crate::reduce::{normalize, reduce};

pub(crate) fn app(func: Term, argm: Term) -> Term {
    Term::App {
        func: Box::new(func),
        argm: Box::new(argm),
    }
}

pub(crate) fn apps(func: Term, args: impl IntoIterator<Item = Term>) -> Term {
    args.into_iter().fold(func, app)
}

pub(crate) fn r#ref(name: impl Into<Name>) -> Term {
    Term::Ref(name.into())
}

pub(crate) fn hol() -> Term {
    Term::Hol { path: Bits::E }
}

pub(crate) fn var(name: impl Into<Name>, level: u32) -> Term {
    Term::Var {
        name: name.into(),
        level,
    }
}

pub(crate) fn lam(name: impl Into<Name>, body: Term) -> Term {
    Term::Lam {
        name: name.into(),
        body: Box::new(body),
        bind_level: 0,
    }
}

pub(crate) fn all(
    eras: bool,
    self_name: impl Into<Name>,
    name: impl Into<Name>,
    xtyp: Term,
    body: Term,
) -> Term {
    Term::All {
        eras,
        self_name: self_name.into(),
        name: name.into(),
        xtyp: Box::new(xtyp),
        body: Box::new(body),
        bind_level: 0,
    }
}

pub(crate) fn unori(term: &Term) -> &Term {
    match term {
        Term::Ori { expr, .. } => unori(expr),
        _ => term,
    }
}

fn open_all_typ(all_body: &Term, bind_level: u32) -> Term {
    open_all(all_body, bind_level, &Term::Typ, &Term::Typ)
}

/// Converts `"Foo.Self"` to `"Foo"`.
fn slice_self_name(self_name: &str) -> Option<String> {
    self_name.strip_suffix(".Self").map(|ini| ini.to_string())
}

/// `Sure.Term.check.get_name_of_self_type`.
pub fn get_name_of_self_type(typ: &Term, defs: &Defs) -> Option<String> {
    match reduce(typ, &Defs::new()) {
        Term::Ref(name) => Some(name.to_string()),
        _ => match reduce(typ, defs) {
            Term::All { self_name, .. } => slice_self_name(&self_name),
            Term::Ref(name) => Some(name.to_string()),
            _ => None,
        },
    }
}

/// `Sure.Term.get_bnds`.
pub fn get_bnds(term: &Term, depth: u32) -> (Vec<(Name, Term)>, Term) {
    match term {
        Term::All {
            self_name,
            name,
            xtyp,
            body,
            bind_level,
            ..
        } => {
            let b = open_all(
                body,
                *bind_level,
                &var(self_name.clone(), depth),
                &var(name.clone(), depth.saturating_add(1)),
            );
            let (mut vars, body) = get_bnds(&b, depth.saturating_add(2));
            let mut out = vec![(name.clone(), xtyp.as_ref().clone())];
            out.append(&mut vars);
            (out, body)
        }
        _ => (Vec::new(), term.clone()),
    }
}

/// `Sure.Term.get_args`.
pub fn get_args(term: &Term) -> (Term, Vec<Term>) {
    let mut acc = Vec::new();
    let mut t = term;
    loop {
        match t {
            Term::App { func, argm } => {
                acc.push(argm.as_ref());
                t = func;
            }
            Term::Imp { expr } | Term::Ori { expr, .. } => t = expr,
            _ => break,
        }
    }
    acc.reverse();
    (t.clone(), acc.into_iter().cloned().collect())
}

/// `Sure.Term.check.expand.mut.count_params`.
pub fn count_params(xtyp: &Term) -> usize {
    let (bnds, _) = get_bnds(xtyp, 0);
    let last_ty = bnds.last().map(|(_, t)| t.clone()).unwrap_or(Term::Typ);
    let (_, args) = get_args(&last_ty);
    let indexs = bnds.len().saturating_sub(1);
    args.len().saturating_sub(indexs)
}

/// `Sure.Term.check.expand.num`.
pub fn expand_num(
    sign: Option<bool>,
    numb: u64,
    frac: Option<u64>,
    typ: Option<&Term>,
    defs: &Defs,
) -> Term {
    let got = typ
        .and_then(|t| get_name_of_self_type(t, defs))
        .map(|self_name| match self_name.as_str() {
            "Nat" => expand_num_nat(numb),
            "Int" => expand_num_int(sign, numb),
            _ => expand_num_other(&self_name, sign, numb, frac),
        });
    match got {
        Some(t) => t,
        None => match frac {
            None => match sign {
                None => expand_num_nat(numb),
                Some(_) => expand_num_int(sign, numb),
            },
            Some(_) => expand_num_other("F64", sign, numb, frac),
        },
    }
}

fn expand_num_nat(numb: u64) -> Term {
    Term::Nat(numb)
}

fn expand_num_int(sign: Option<bool>, numb: u64) -> Term {
    let term = app(r#ref("Int.from_nat"), Term::Nat(numb));
    match sign {
        Some(false) => app(r#ref("Int.neg"), term),
        _ => term,
    }
}

fn expand_num_other(name: &str, sign: Option<bool>, numb: u64, frac: Option<u64>) -> Term {
    let mut text = String::new();
    match sign {
        Some(true) => text.push('+'),
        Some(false) => text.push('-'),
        None => {}
    }
    text.push_str(&numb.to_string());
    if let Some(frac) = frac {
        text.push('.');
        text.push_str(&frac.to_string());
    }
    app(r#ref(format!("{name}.read")), Term::Str(text))
}

/// `Sure.Term.check.expand.ope`.
pub fn expand_ope(
    skip_cmp: bool,
    oper: &str,
    arg0: &Term,
    arg1: &Term,
    otyp: &Term,
    defs: &Defs,
) -> Option<Term> {
    let last = oper.chars().last().unwrap_or('x');
    if last == '?' && skip_cmp {
        return None;
    }
    let type_name = get_name_of_self_type(otyp, defs)?;
    let oper_name = match oper {
        "+" => "add",
        "-" => "sub",
        "*" => "mul",
        "/" => "div",
        "**" => "pow",
        "%" => "mod",
        "<?" => "ltn",
        "<=?" => "lte",
        "=?" => "eql",
        ">=?" => "gte",
        ">?" => "gtn",
        "&&" => "and",
        "||" => "or",
        _ => return None,
    };
    Some(apps(
        r#ref(format!("{type_name}.{oper_name}")),
        [arg0.clone(), arg1.clone()],
    ))
}

/// `Sure.Term.check.expand.new`.
pub fn expand_new(args: &[Term], typ: Option<&Term>, defs: &Defs) -> Option<Term> {
    let got = typ.and_then(|t| match reduce(t, defs) {
        Term::All {
            self_name,
            body,
            bind_level,
            xtyp,
            ..
        } => match reduce(&open_all_typ(&body, bind_level), defs) {
            Term::All {
                name: ctor_name, ..
            } => {
                let tnam = slice_self_name(&self_name).unwrap_or_default();
                let mut term = r#ref(format!("{tnam}.{ctor_name}"));
                let pars = count_params(&xtyp);
                for _ in 0..pars {
                    term = app(term, hol());
                }
                for arg in args {
                    term = app(term, arg.clone());
                }
                Some(term)
            }
            _ => None,
        },
        _ => None,
    });
    match got {
        Some(t) => Some(t),
        None => expand_new_pair(args, typ, defs),
    }
}

fn expand_new_pair(args: &[Term], _typ: Option<&Term>, _defs: &Defs) -> Option<Term> {
    if args.len() == 2 {
        Some(apps(
            r#ref("Pair.new"),
            [hol(), hol(), args[0].clone(), args[1].clone()],
        ))
    } else {
        None
    }
}

/// `Sure.Term.check.expand.get`.
pub fn expand_get(expr: &Term, fkey: &str, etyp: &Term, defs: &Defs) -> Option<Term> {
    match reduce(etyp, defs) {
        Term::All {
            body, bind_level, ..
        } => match reduce(&open_all_typ(&body, bind_level), defs) {
            Term::All { xtyp, .. } => {
                let term = app(expr.clone(), lam("", hol()));
                let rett = r#ref(format!("{fkey}_field"));
                let sele = expand_get_selector(fkey, &xtyp, defs, rett);
                Some(app(term, sele))
            }
            _ => None,
        },
        _ => None,
    }
}

fn expand_get_selector(fkey: &str, ctor: &Term, defs: &Defs, rett: Term) -> Term {
    match reduce(ctor, defs) {
        Term::All {
            name,
            body,
            bind_level,
            ..
        } => {
            let opened = open_all_typ(&body, bind_level);
            let next_rett = if name.as_ref() == fkey {
                r#ref(name.clone())
            } else {
                rett
            };
            let body = expand_get_selector(fkey, &opened, defs, next_rett);
            lam(name, body)
        }
        _ => rett,
    }
}

/// `Sure.Term.check.expand.mut` (`ffun` is `Term -> Term` encoded as apply-to-field).
pub fn expand_mut(
    expr: &Term,
    fkey: &str,
    ffun: impl Fn(&Term) -> Term,
    etyp: &Term,
    defs: &Defs,
) -> Option<Term> {
    match reduce(etyp, defs) {
        Term::All {
            self_name,
            body,
            bind_level,
            xtyp,
            ..
        } => match reduce(&open_all_typ(&body, bind_level), defs) {
            Term::All {
                name: ctor_name,
                xtyp: ctor_xtyp,
                ..
            } => {
                let term = app(expr.clone(), lam("", hol()));
                let tnam = slice_self_name(&self_name).unwrap_or_default();
                let mut rett = r#ref(format!("{tnam}.{ctor_name}"));
                let pars = count_params(&xtyp);
                for _ in 0..pars {
                    rett = app(rett, hol());
                }
                let sele = expand_mut_selector(fkey, &ffun, &ctor_xtyp, defs, rett);
                Some(app(term, sele))
            }
            _ => None,
        },
        _ => None,
    }
}

fn expand_mut_selector(
    fkey: &str,
    ffun: &impl Fn(&Term) -> Term,
    ctor: &Term,
    defs: &Defs,
    rett: Term,
) -> Term {
    match reduce(ctor, defs) {
        Term::All {
            name,
            body,
            bind_level,
            ..
        } => {
            let opened = open_all_typ(&body, bind_level);
            let field = r#ref(name.clone());
            let arg = if name.as_ref() == fkey {
                expand_mut_selector_apply(&ffun(&field))
            } else {
                field
            };
            let rett = app(rett, arg);
            let body = expand_mut_selector(fkey, ffun, &opened, defs, rett);
            lam(name, body)
        }
        _ => rett,
    }
}

fn expand_mut_selector_apply(term: &Term) -> Term {
    match term {
        Term::App { func, argm } => match func.as_ref() {
            Term::Lam {
                body, bind_level, ..
            } => open_lam(body, *bind_level, argm),
            _ => term.clone(),
        },
        _ => term.clone(),
    }
}

/// `Sure.Term.check.expand.cse`.
#[allow(clippy::too_many_arguments)]
pub fn expand_cse(
    expr: &Term,
    name: &Name,
    wyth: &[WithBinder],
    cses: &BTreeMap<Name, Term>,
    moti: Option<&Term>,
    etyp: &Term,
    rtyp: Option<&Term>,
    defs: &Defs,
    ctxt: &[(Name, Term)],
) -> Option<Term> {
    match reduce(etyp, defs) {
        Term::All {
            self_name,
            name: all_name,
            xtyp,
            body,
            bind_level,
            ..
        } => {
            let moti_tm =
                expand_cse_motive(wyth, moti, name, expr, etyp, rtyp, defs, ctxt.len() as u32);
            let argm = expand_cse_argument(name, &[], &xtyp, &moti_tm, defs);
            let expr = app(expr.clone(), argm);
            let typ = open_all(&body, bind_level, &var(self_name, 0), &var(all_name, 0));
            Some(expand_cse_cases(&expr, name, wyth, cses, &typ, defs))
        }
        _ => None,
    }
}

fn expand_cse_argument(
    name: &Name,
    wyth: &[WithBinder],
    typ: &Term,
    body: &Term,
    defs: &Defs,
) -> Term {
    match reduce(typ, defs) {
        Term::All {
            self_name,
            name: all_name,
            body: all_body,
            bind_level,
            ..
        } => {
            let lam_name = if all_name.is_empty() {
                name.clone()
            } else {
                Name::from(format!("{name}.{all_name}"))
            };
            let opened = open_all(&all_body, bind_level, &var(self_name, 0), &var(all_name, 0));
            let lam_body = expand_cse_argument(name, wyth, &opened, body, defs);
            lam(lam_name, lam_body)
        }
        _ => match wyth.split_first() {
            Some((head, tail)) => {
                let lam_body = expand_cse_argument(name, tail, typ, body, defs);
                lam(head.name.clone(), lam_body)
            }
            None => body.clone(),
        },
    }
}

fn expand_cse_cases(
    expr: &Term,
    name: &Name,
    wyth: &[WithBinder],
    cses: &BTreeMap<Name, Term>,
    typ: &Term,
    defs: &Defs,
) -> Term {
    match reduce(typ, defs) {
        Term::All {
            self_name,
            name: ctor_name,
            xtyp,
            body,
            bind_level,
            ..
        } => {
            let argm = cses
                .get(&ctor_name)
                .cloned()
                .or_else(|| cses.get("_").cloned())
                .unwrap_or_else(|| r#ref(format!("{name}_{ctor_name}_case")));
            let argm = expand_cse_argument(name, wyth, &xtyp, &argm, defs);
            let expr = app(expr.clone(), argm);
            let typ = open_all(&body, bind_level, &var(self_name, 0), &var(ctor_name, 0));
            expand_cse_cases(&expr, name, wyth, cses, &typ, defs)
        }
        _ => {
            let mut expr = expr.clone();
            for defn in wyth {
                expr = app(expr, defn.term.clone());
            }
            expr
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn expand_cse_motive_go(
    wyth: &[WithBinder],
    moti: Option<&Term>,
    name: &Name,
    expr: &Term,
    etyp: &Term,
    rtyp: Option<&Term>,
    defs: &Defs,
    size: u32,
) -> Term {
    match wyth.split_first() {
        Some((head, tail)) => {
            let all_xtyp = head.typ.clone().unwrap_or_else(hol);
            let all_body = expand_cse_motive(
                tail,
                moti,
                name,
                expr,
                etyp,
                rtyp,
                defs,
                size.saturating_add(2),
            );
            all(false, "", head.name.clone(), all_xtyp, all_body)
        }
        None => match moti {
            None => match rtyp {
                None => hol(),
                Some(t) => normalize(t, &Defs::new()),
            },
            Some(t) => t.clone(),
        },
    }
}

#[allow(clippy::too_many_arguments)]
fn expand_cse_motive(
    wyth: &[WithBinder],
    moti: Option<&Term>,
    name: &Name,
    expr: &Term,
    etyp: &Term,
    rtyp: Option<&Term>,
    defs: &Defs,
    size: u32,
) -> Term {
    let done = expand_cse_motive_go(wyth, moti, name, expr, etyp, rtyp, defs, size);
    match moti {
        None => smart_motive_make(name, expr, etyp, &done, size, defs),
        Some(_) => done,
    }
}

fn smart_motive_vals(expr: &Term, typ: &Term, defs: &Defs) -> Vec<Term> {
    match reduce(typ, defs) {
        Term::All {
            body, bind_level, ..
        } => smart_motive_vals(expr, &open_all_typ(&body, bind_level), defs),
        other => smart_motive_vals_cont(expr, &other, Vec::new(), defs),
    }
}

fn smart_motive_vals_cont(expr: &Term, term: &Term, mut args: Vec<Term>, defs: &Defs) -> Vec<Term> {
    match reduce(term, defs) {
        Term::App { func, argm } => {
            args.insert(0, argm.as_ref().clone());
            smart_motive_vals_cont(expr, &func, args, defs)
        }
        _ => {
            // `cons(expr, tail(reverse(args)))`
            let mut rev: Vec<Term> = args.into_iter().rev().collect();
            if !rev.is_empty() {
                rev.remove(0);
            }
            let mut out = vec![expr.clone()];
            out.append(&mut rev);
            out
        }
    }
}

fn smart_motive_nams(name: &Name, typ: &Term, defs: &Defs) -> Vec<Name> {
    match reduce(typ, defs) {
        Term::All { xtyp, .. } => smart_motive_nams_cont(name, &xtyp, Vec::new(), defs),
        _ => Vec::new(),
    }
}

fn smart_motive_nams_cont(
    name: &Name,
    term: &Term,
    mut binds: Vec<Name>,
    defs: &Defs,
) -> Vec<Name> {
    match reduce(term, defs) {
        Term::All {
            self_name,
            name: all_name,
            body,
            bind_level,
            ..
        } => {
            binds.insert(0, Name::from(format!("{name}.{all_name}")));
            let opened = open_all(&body, bind_level, &r#ref(self_name), &r#ref(all_name));
            smart_motive_nams_cont(name, &opened, binds, defs)
        }
        _ => {
            if !binds.is_empty() {
                binds.remove(0);
            }
            let mut out = vec![name.clone()];
            out.append(&mut binds);
            out
        }
    }
}

fn smart_motive_replace(term: &Term, from: &Term, to: &Term, lv: u32) -> Term {
    if identical(term, from, lv) {
        return to.clone();
    }
    match term {
        Term::Ref(name) => Term::Ref(name.clone()),
        Term::Var { name, level } => Term::Var {
            name: name.clone(),
            level: *level,
        },
        Term::Typ => Term::Typ,
        Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        } => {
            let xtyp = smart_motive_replace(xtyp, from, to, lv);
            let body = open_all(
                body,
                *bind_level,
                &r#ref(self_name.clone()),
                &r#ref(name.clone()),
            );
            let body = smart_motive_replace(&body, from, to, lv.saturating_add(2));
            Term::All {
                eras: *eras,
                self_name: self_name.clone(),
                name: name.clone(),
                xtyp: Box::new(xtyp),
                body: Box::new(body),
                bind_level: *bind_level,
            }
        }
        Term::Lam {
            name,
            body,
            bind_level,
        } => {
            let body = open_lam(body, *bind_level, &r#ref(name.clone()));
            let body = smart_motive_replace(&body, from, to, lv.saturating_add(1));
            Term::Lam {
                name: name.clone(),
                body: Box::new(body),
                bind_level: *bind_level,
            }
        }
        Term::App { func, argm } => Term::App {
            func: Box::new(smart_motive_replace(func, from, to, lv)),
            argm: Box::new(smart_motive_replace(argm, from, to, lv)),
        },
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr = smart_motive_replace(expr, from, to, lv);
            let body = open_lam(body, *bind_level, &r#ref(name.clone()));
            let body = smart_motive_replace(&body, from, to, lv.saturating_add(1));
            Term::Let {
                name: name.clone(),
                expr: Box::new(expr),
                body: Box::new(body),
                bind_level: *bind_level,
            }
        }
        Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr = smart_motive_replace(expr, from, to, lv);
            let body = open_lam(body, *bind_level, &r#ref(name.clone()));
            let body = smart_motive_replace(&body, from, to, lv.saturating_add(1));
            Term::Def {
                name: name.clone(),
                expr: Box::new(expr),
                body: Box::new(body),
                bind_level: *bind_level,
            }
        }
        Term::Ann { done, term, typ } => Term::Ann {
            done: *done,
            term: Box::new(smart_motive_replace(term, from, to, lv)),
            typ: Box::new(smart_motive_replace(typ, from, to, lv)),
        },
        Term::Get { expr, fkey } => Term::Get {
            expr: Box::new(smart_motive_replace(expr, from, to, lv)),
            fkey: fkey.clone(),
        },
        Term::Set { expr, fkey, fval } => Term::Set {
            expr: Box::new(smart_motive_replace(expr, from, to, lv)),
            fkey: fkey.clone(),
            fval: Box::new(smart_motive_replace(fval, from, to, lv)),
        },
        Term::Mut { expr, fkey, ffun } => Term::Mut {
            expr: Box::new(smart_motive_replace(expr, from, to, lv)),
            fkey: fkey.clone(),
            ffun: Box::new(smart_motive_replace(ffun, from, to, lv)),
        },
        Term::Ope { name, arg0, arg1 } => Term::Ope {
            name: name.clone(),
            arg0: Box::new(smart_motive_replace(arg0, from, to, lv)),
            arg1: Box::new(smart_motive_replace(arg1, from, to, lv)),
        },
        Term::Imp { expr } | Term::Ori { expr, .. } => smart_motive_replace(expr, from, to, lv),
        other => other.clone(),
    }
}

fn smart_motive_make(
    name: &Name,
    expr: &Term,
    typ: &Term,
    moti: &Term,
    size: u32,
    defs: &Defs,
) -> Term {
    let vals = smart_motive_vals(expr, typ, defs);
    let nams = smart_motive_nams(name, typ, defs);
    let mut term = moti.clone();
    for (nam, val) in nams.into_iter().zip(vals) {
        term = smart_motive_replace(&term, &val, &r#ref(nam), size);
    }
    term
}
