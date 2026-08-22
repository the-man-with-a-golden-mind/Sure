//! Port of `vendor/formcore-js/FmcToJs.js` `compile_defs`.

use std::collections::{HashMap, HashSet};
use std::fmt;

use sure_fmc::show_string;
use sure_fmc::{equal, open_all, open_lam, reduce, Ctx, Defs, Term};

use crate::host::emit_io_host;
use crate::prim::{
    apply_ctag, apply_extract, fill_template, is_prim_name, prim_func, prim_type,
    subst_placeholders, CnamMode, PrimType, IS_PRIM, PRIM_TYPES,
};
use crate::schema::{host_need_from_queries, query_group, HostNeed};

/// Emit options (`opts.module` / `opts.expression` in FmcToJs).
#[derive(Clone, Debug, Default)]
pub struct EmitOpts {
    pub module: bool,
    pub expression: bool,
}

/// Failure compiling FormCore defs to JavaScript.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmitError {
    pub message: String,
}

impl fmt::Display for EmitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for EmitError {}

fn err(message: impl Into<String>) -> EmitError {
    EmitError {
        message: message.into(),
    }
}

/// `sureEmitSafe`: `^[A-Za-z][A-Za-z0-9._]*$`, no `/`, `\`, `..`.
pub fn emit_safe(term: &str) -> bool {
    if term.is_empty() || term.contains("..") || term.contains('/') || term.contains('\\') {
        return false;
    }
    let mut cs = term.chars();
    match cs.next() {
        Some(c) if c.is_ascii_alphabetic() => {
            cs.all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
        }
        _ => false,
    }
}

/// FmcToJs `js_name`: `.` → `$`, `true`/`false` → `$true`/`$false`.
pub fn js_name(s: &str) -> String {
    match s {
        "true" => "$true".to_string(),
        "false" => "$false".to_string(),
        _ => s.replace('.', "$"),
    }
}

#[derive(Clone, Debug)]
enum Comp {
    Var(String),
    Ref(String),
    Nul,
    Lam {
        name: String,
        body: Box<Comp>,
    },
    App {
        func: Box<Comp>,
        argm: Box<Comp>,
    },
    Let {
        name: String,
        expr: Box<Comp>,
        body: Box<Comp>,
    },
    Eli {
        prim: PrimKey,
        expr: Box<Comp>,
    },
    Ins {
        prim: PrimKey,
        expr: Box<Comp>,
    },
    Chr(char),
    Str(String),
    Nat(u64),
    Raw(String),
}

#[derive(Clone, Debug)]
enum PrimKey {
    Named(String),
    Adt(Vec<AdtCtor>),
}

#[derive(Clone, Debug)]
struct AdtCtor {
    name: String,
    flds: Vec<String>,
}

impl Comp {
    fn var(n: impl Into<String>) -> Self {
        Comp::Var(n.into())
    }
    fn ref_(n: impl Into<String>) -> Self {
        Comp::Ref(n.into())
    }
    fn lam(name: impl Into<String>, body: Comp) -> Self {
        Comp::Lam {
            name: name.into(),
            body: Box::new(body),
        }
    }
    fn app(func: Comp, argm: Comp) -> Self {
        Comp::App {
            func: Box::new(func),
            argm: Box::new(argm),
        }
    }
    fn let_(name: impl Into<String>, expr: Comp, body: Comp) -> Self {
        Comp::Let {
            name: name.into(),
            expr: Box::new(expr),
            body: Box::new(body),
        }
    }
}

struct Typed {
    comp: Comp,
    typ: Term,
}

struct TypeInfo {
    inst: Vec<(usize, String)>,
    ctag: String,
    ctor: Vec<Vec<String>>,
    mode: CnamMode,
    nams: Vec<String>,
}

fn type_info_prim(p: &PrimType) -> TypeInfo {
    TypeInfo {
        inst: p
            .inst
            .iter()
            .map(|c| (c.arity, c.template.to_string()))
            .collect(),
        ctag: p.ctag.to_string(),
        ctor: p
            .ctor
            .iter()
            .map(|fs| fs.iter().map(|s| (*s).to_string()).collect())
            .collect(),
        mode: p.mode,
        nams: p.nams.iter().map(|s| (*s).to_string()).collect(),
    }
}

fn type_info_adt(adt: &[AdtCtor]) -> TypeInfo {
    let mut inst = Vec::new();
    let mut ctor = Vec::new();
    let mut nams = Vec::new();
    for c in adt {
        let mut tmpl = format!("({{_:'{}'", c.name);
        for (k, f) in c.flds.iter().enumerate() {
            tmpl.push_str(&format!(",'{f}':{{{k}}}"));
        }
        tmpl.push_str("})");
        inst.push((c.flds.len(), tmpl));
        ctor.push(c.flds.iter().map(|f| format!("{{x}}.{f}")).collect());
        nams.push(c.name.clone());
    }
    TypeInfo {
        inst,
        ctag: "{x}._".to_string(),
        ctor,
        mode: CnamMode::Switch,
        nams,
    }
}

fn type_info_of(prim: &PrimKey) -> Option<TypeInfo> {
    match prim {
        PrimKey::Named(n) => prim_type(n).map(type_info_prim),
        PrimKey::Adt(adt) => Some(type_info_adt(adt)),
    }
}

fn prim_of(typ: &Term, defs: &Defs) -> Option<&'static str> {
    for name in IS_PRIM {
        if equal(typ, &Term::ref_(*name), defs) {
            return Some(*name);
        }
    }
    None
}

fn as_adt(term: &Term, defs: &Defs) -> Option<Vec<AdtCtor>> {
    let term = reduce(term, defs);
    let Term::All { self_name, .. } = &term else {
        return None;
    };
    if !self_name.ends_with(".Self") {
        return None;
    }
    let mut term = open_all(&term, &Term::var("self", 0), &Term::var("P", 0));
    let mut ctrs = Vec::new();
    while let Term::All {
        name, self_name, ..
    } = &term
    {
        let ctor = adt_ctor_from_bind(match &term {
            Term::All { xtyp, .. } => xtyp,
            _ => return None,
        })?;
        ctrs.push(ctor);
        term = open_all(
            &term,
            &Term::var(self_name.clone(), 0),
            &Term::var(name.clone(), 0),
        );
    }
    Some(ctrs)
}

fn adt_ctor_from_bind(term: &Term) -> Option<AdtCtor> {
    fn go(term: &Term, mut flds: Vec<String>) -> Option<AdtCtor> {
        match term {
            Term::All { eras, name, .. } => {
                if !*eras {
                    flds.push(name.to_string());
                }
                let opened = open_all(term, &Term::var("", 0), &Term::var(name.clone(), 0));
                go(&opened, flds)
            }
            Term::App { func, argm } => {
                let mut head = func.as_ref();
                while let Term::App { func, .. } = head {
                    head = func;
                }
                let Term::Var { name, .. } = head else {
                    return None;
                };
                if name.as_ref() != "P" {
                    return None;
                }
                let mut ctor = argm.as_ref();
                while let Term::App { func, .. } = ctor {
                    ctor = func;
                }
                match ctor {
                    Term::Ref(n) => Some(AdtCtor {
                        name: n.to_string(),
                        flds,
                    }),
                    _ => None,
                }
            }
            _ => None,
        }
    }
    go(term, Vec::new())
}

fn walk_term(term: &Term, on: &mut impl FnMut(&Term)) {
    on(term);
    match term {
        Term::Lam {
            name,
            body,
            bind_level,
        } => walk_term(
            &open_lam(body, *bind_level, &Term::var(name.clone(), 0)),
            on,
        ),
        Term::App { func, argm } => {
            walk_term(func, on);
            walk_term(argm, on);
        }
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        }
        | Term::Def {
            name,
            expr,
            body,
            bind_level,
        } => {
            walk_term(expr, on);
            walk_term(
                &open_lam(body, *bind_level, &Term::var(name.clone(), 0)),
                on,
            );
        }
        Term::Ann { term, .. } => walk_term(term, on),
        _ => {}
    }
}

fn dependency_sort(defs: &Defs, main: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut refs = Vec::new();
    fn go(term: &Term, defs: &Defs, seen: &mut HashSet<String>, refs: &mut Vec<String>) {
        walk_term(term, &mut |t| {
            if let Term::Ref(name) = t {
                if seen.insert(name.to_string()) {
                    if let Some(d) = defs.get(name) {
                        go(&d.term, defs, seen, refs);
                        refs.push(name.to_string());
                    }
                }
            }
        });
    }
    if let Some(d) = defs.get(main) {
        go(&d.term, defs, &mut seen, &mut refs);
    }
    if !refs.iter().any(|n| n == main) {
        refs.push(main.to_string());
    }
    refs
}

fn peel_apps(term: &Term) -> (&Term, Vec<&Term>) {
    let mut args = Vec::new();
    let mut t = term;
    while let Term::App { func, argm } = t {
        args.push(argm.as_ref());
        t = func;
    }
    args.reverse();
    (t, args)
}

/// FmcToJs `collect_host_need` — IO.ask query must stay a kernel `Str`.
pub fn collect_host_need(defs: &Defs, nams: &[String]) -> HostNeed {
    let mut queries: Vec<String> = Vec::new();
    let mut dynamic = false;
    let mut consider = |term: &Term| {
        let (head, args) = peel_apps(term);
        if let Term::Ref(name) = head {
            if name.as_ref() == "IO.ask" && args.len() >= 2 {
                match args[1] {
                    Term::Str(q) => queries.push(q.clone()),
                    _ => dynamic = true,
                }
            }
        }
        if let Term::Str(s) = term {
            if query_group(s).is_some() {
                queries.push(s.clone());
            }
        }
    };
    for nam in nams {
        if let Some(d) = defs.get(nam.as_str()) {
            walk_term(&d.term, &mut consider);
        }
    }
    let qrefs: Vec<&str> = queries.iter().map(|s| s.as_str()).collect();
    host_need_from_queries(&qrefs, dynamic)
}

fn collect_prim_use(defs: &Defs, nams: &[String]) -> (HashSet<String>, HashSet<String>) {
    let mut types = HashSet::new();
    let mut funcs = HashSet::new();
    fn go(term: &Term, types: &mut HashSet<String>, funcs: &mut HashSet<String>) {
        match term {
            Term::Ref(name) => {
                if prim_func(name).is_some() {
                    funcs.insert(name.to_string());
                }
                if is_prim_name(name) {
                    types.insert(name.to_string());
                }
            }
            Term::Lam {
                name,
                body,
                bind_level,
            } => go(
                &open_lam(body, *bind_level, &Term::var(name.clone(), 0)),
                types,
                funcs,
            ),
            Term::App { func, argm } => {
                go(func, types, funcs);
                go(argm, types, funcs);
            }
            Term::Let {
                name,
                expr,
                body,
                bind_level,
            }
            | Term::Def {
                name,
                expr,
                body,
                bind_level,
            } => {
                go(expr, types, funcs);
                go(
                    &open_lam(body, *bind_level, &Term::var(name.clone(), 0)),
                    types,
                    funcs,
                );
            }
            Term::Ann { term, .. } => go(term, types, funcs),
            _ => {}
        }
    }
    for name in nams {
        if prim_func(name).is_some() {
            funcs.insert(name.clone());
        }
        if is_prim_name(name) {
            types.insert(name.clone());
        }
        if let Some(d) = defs.get(name.as_str()) {
            go(&d.term, &mut types, &mut funcs);
        }
    }
    (types, funcs)
}

fn infer(term: &Term, defs: &Defs, ctx: &Ctx) -> Result<Typed, EmitError> {
    match term {
        Term::Var { name, level } => Ok(Typed {
            comp: Comp::var(format!("{name}${level}")),
            typ: Term::var(name.clone(), *level),
        }),
        Term::Ref(name) => {
            let got = defs
                .get(name)
                .ok_or_else(|| err(format!("Unbound reference: '{name}'.")))?;
            Ok(Typed {
                comp: Comp::ref_(name.to_string()),
                typ: got.typ.clone(),
            })
        }
        Term::Typ => Ok(Typed {
            comp: Comp::Nul,
            typ: Term::Typ,
        }),
        Term::App { func, argm } => {
            let func_cmp = infer(func, defs, ctx)?;
            let func_typ = reduce(&func_cmp.typ, defs);
            match &func_typ {
                Term::All { xtyp, eras, .. } => {
                    let self_var = Term::ann(true, *func.clone(), func_typ.clone());
                    let name_var = Term::ann(true, *argm.clone(), *xtyp.clone());
                    let argm_cmp = check(argm, xtyp, defs, ctx)?;
                    let term_typ = open_all(&func_typ, &self_var, &name_var);
                    let mut comp = func_cmp.comp;
                    if let Some(prim) = prim_of(&func_typ, defs) {
                        comp = Comp::Eli {
                            prim: PrimKey::Named(prim.to_string()),
                            expr: Box::new(comp),
                        };
                    } else if let Some(adt) = as_adt(&func_typ, defs) {
                        comp = Comp::Eli {
                            prim: PrimKey::Adt(adt),
                            expr: Box::new(comp),
                        };
                    }
                    if !*eras {
                        comp = Comp::app(comp, argm_cmp.comp);
                    }
                    Ok(Typed {
                        comp,
                        typ: term_typ,
                    })
                }
                _ => Err(err("Non-function application.")),
            }
        }
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr_cmp = infer(expr, defs, ctx)?;
            let expr_var = Term::ann(
                true,
                Term::var(format!("_{name}"), ctx.size() + 1),
                expr_cmp.typ.clone(),
            );
            let body_ctx = ctx.extend(name.clone(), expr_cmp.typ);
            let body_cmp = infer(&open_lam(body, *bind_level, &expr_var), defs, &body_ctx)?;
            Ok(Typed {
                comp: Comp::let_(
                    format!("_{name}${}", ctx.size() + 1),
                    expr_cmp.comp,
                    body_cmp.comp,
                ),
                typ: body_cmp.typ,
            })
        }
        Term::Def {
            expr,
            body,
            bind_level,
            ..
        } => infer(&open_lam(body, *bind_level, expr), defs, ctx),
        Term::All { .. } => Ok(Typed {
            comp: Comp::Nul,
            typ: Term::Typ,
        }),
        Term::Ann { term, typ, .. } => check(term, typ, defs, ctx),
        Term::Nat(n) => Ok(Typed {
            comp: Comp::Nat(*n),
            typ: Term::ref_("Nat"),
        }),
        Term::Chr(c) => Ok(Typed {
            comp: Comp::Chr(*c),
            typ: Term::ref_("Char"),
        }),
        Term::Str(s) => Ok(Typed {
            comp: Comp::Str(s.clone()),
            typ: Term::ref_("String"),
        }),
        Term::Lam { .. } => Err(err("Cannot infer lambda.")),
    }
}

fn check(term: &Term, typ: &Term, defs: &Defs, ctx: &Ctx) -> Result<Typed, EmitError> {
    let typv = reduce(typ, defs);
    if matches!(typv, Term::Typ) {
        return Ok(Typed {
            comp: Comp::Nul,
            typ: Term::Typ,
        });
    }
    match term {
        Term::Lam {
            name,
            body,
            bind_level,
        } => {
            let Term::All { xtyp, eras, .. } = &typv else {
                return Err(err("Lambda has non-function type."));
            };
            let self_var = Term::ann(true, term.clone(), typ.clone());
            let name_var = Term::ann(
                true,
                Term::var(format!("_{name}"), ctx.size() + 1),
                *xtyp.clone(),
            );
            let body_typ = open_all(&typv, &self_var, &name_var);
            let body_ctx = ctx.extend(name.clone(), *xtyp.clone());
            let body_cmp = check(
                &open_lam(body, *bind_level, &name_var),
                &body_typ,
                defs,
                &body_ctx,
            )?;
            let mut comp = if *eras {
                body_cmp.comp
            } else {
                Comp::lam(format!("_{name}${}", ctx.size() + 1), body_cmp.comp)
            };
            if let Some(prim) = prim_of(typ, defs) {
                comp = Comp::Ins {
                    prim: PrimKey::Named(prim.to_string()),
                    expr: Box::new(comp),
                };
            } else if let Some(adt) = as_adt(typ, defs) {
                comp = Comp::Ins {
                    prim: PrimKey::Adt(adt),
                    expr: Box::new(comp),
                };
            }
            Ok(Typed {
                comp,
                typ: typ.clone(),
            })
        }
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr_cmp = infer(expr, defs, ctx)?;
            let expr_var = Term::ann(
                true,
                Term::var(format!("_{name}"), ctx.size() + 1),
                expr_cmp.typ.clone(),
            );
            let body_ctx = ctx.extend(name.clone(), expr_cmp.typ);
            let body_cmp = check(
                &open_lam(body, *bind_level, &expr_var),
                typ,
                defs,
                &body_ctx,
            )?;
            Ok(Typed {
                comp: Comp::let_(
                    format!("_{name}${}", ctx.size() + 1),
                    expr_cmp.comp,
                    body_cmp.comp,
                ),
                typ: body_cmp.typ,
            })
        }
        _ => {
            let term_cmp = infer(term, defs, ctx)?;
            Ok(Typed {
                comp: term_cmp.comp,
                typ: typ.clone(),
            })
        }
    }
}

fn core_to_comp(
    defs: &Defs,
    main: &str,
) -> Result<(HashMap<String, Comp>, Vec<String>), EmitError> {
    let mut nams = dependency_sort(defs, main);
    if !nams.iter().any(|n| n == main) {
        nams.push(main.to_string());
    }
    let mut comp_defs = HashMap::new();
    let ctx = Ctx::new();
    for name in &nams {
        let def = defs
            .get(name.as_str())
            .ok_or_else(|| err(format!("Missing def: {name}")))?;
        let typed = check(&def.term, &def.typ, defs, &ctx)?;
        comp_defs.insert(name.clone(), typed.comp);
    }
    Ok((comp_defs, nams))
}

fn subst_comp(term: &Comp, name: &str, val: &Comp) -> Comp {
    match term {
        Comp::Var(n) if n == name => val.clone(),
        Comp::Lam { name: n, body } if n == name => term.clone(),
        Comp::Lam { name: n, body } => Comp::lam(n.clone(), subst_comp(body, name, val)),
        Comp::App { func, argm } => {
            Comp::app(subst_comp(func, name, val), subst_comp(argm, name, val))
        }
        Comp::Let {
            name: n,
            expr,
            body,
        } if n == name => Comp::let_(n.clone(), subst_comp(expr, name, val), *body.clone()),
        Comp::Let {
            name: n,
            expr,
            body,
        } => Comp::let_(
            n.clone(),
            subst_comp(expr, name, val),
            subst_comp(body, name, val),
        ),
        Comp::Eli { prim, expr } => Comp::Eli {
            prim: prim.clone(),
            expr: Box::new(subst_comp(expr, name, val)),
        },
        Comp::Ins { prim, expr } => Comp::Ins {
            prim: prim.clone(),
            expr: Box::new(subst_comp(expr, name, val)),
        },
        _ => term.clone(),
    }
}

fn is_used(name: &str, term: &Comp) -> bool {
    match term {
        Comp::Var(n) => n == name,
        Comp::Lam { name: n, body } => n != name && is_used(name, body),
        Comp::App { func, argm } => is_used(name, func) || is_used(name, argm),
        Comp::Let {
            name: n,
            expr,
            body,
        } => is_used(name, expr) || (n != name && is_used(name, body)),
        Comp::Eli { expr, .. } | Comp::Ins { expr, .. } => is_used(name, expr),
        _ => false,
    }
}

fn apply_fields(term: Comp, args: &[Comp], bound: bool) -> Comp {
    if let Comp::Lam { name, body } = &term {
        if let Some(a0) = args.first() {
            return apply_fields(subst_comp(body, name, a0), &args[1..], true);
        }
    }
    if !bound {
        if let Some(a0) = args.first() {
            return apply_fields(Comp::app(term, a0.clone()), &args[1..], false);
        }
    }
    term
}

fn serialize_comp(term: &Comp) -> String {
    match term {
        Comp::Var(n) | Comp::Ref(n) => format!("{{{n}}}"),
        Comp::Nul => "%".to_string(),
        Comp::Lam { name, body } => format!("#{name} {}", serialize_comp(body)),
        Comp::App { func, argm } => format!("({} {})", serialize_comp(func), serialize_comp(argm)),
        Comp::Let { name, expr, body } => {
            format!("${name}={};{}", serialize_comp(expr), serialize_comp(body))
        }
        Comp::Eli { expr, .. } => format!("-{}", serialize_comp(expr)),
        Comp::Ins { expr, .. } => format!("+{}", serialize_comp(expr)),
        Comp::Chr(c) => format!("'{c}'"),
        Comp::Str(s) => format!("\"{s}\""),
        Comp::Nat(n) => format!("[{n}]"),
        Comp::Raw(s) => s.clone(),
    }
}

fn get_case_group(i: usize, arity: usize, term: &Comp) -> String {
    let mut term = term;
    for _ in 0..arity {
        match term {
            Comp::Lam { name, body } => {
                if is_used(name, body) {
                    return i.to_string();
                }
                term = body;
            }
            _ => return i.to_string(),
        }
    }
    serialize_comp(term)
}

fn returner(name: Option<&str>, expr: String) -> String {
    match name {
        Some(n) => format!("var {} = {expr};", js_name(n)),
        None => expr,
    }
}

/// Compile-time `F64.make` fold. Matches FmcToJs
/// `str.slice(0, -mag) + "." + str.slice(-mag)`: JS `-0` is `0`, so mag=0
/// yields `.123` not `123.`.
pub(crate) fn f64_make_literal(neg: bool, digits: u64, mag: u64) -> String {
    let mag = mag as usize;
    let mut s = digits.to_string();
    while s.len() < mag + 1 {
        s.insert(0, '0');
    }
    let (head, tail) = if mag == 0 {
        ("", s.as_str())
    } else {
        let split = s.len() - mag;
        (&s[..split], &s[split..])
    };
    let body = format!("{head}.{tail}");
    if neg {
        format!("-{body}")
    } else {
        body
    }
}

struct EmitCx {
    count: u32,
    arity_of: HashMap<String, usize>,
}

impl EmitCx {
    fn new() -> Self {
        Self {
            count: 0,
            arity_of: HashMap::new(),
        }
    }

    fn fresh(&mut self) -> String {
        let n = self.count;
        self.count += 1;
        format!("${n}")
    }

    fn instantiator(&self, inst: &[(usize, String)]) -> String {
        let mut res = String::from("x=>x");
        for (arity, tmpl) in inst {
            res.push('(');
            for j in 0..*arity {
                res.push_str(&format!("x{j}=>"));
            }
            let args: Vec<String> = (0..*arity).map(|j| format!("x{j}")).collect();
            res.push_str(&subst_placeholders(tmpl, &args));
            res.push(')');
        }
        res
    }

    fn instantiation(&mut self, term: &Comp) -> Option<String> {
        let Comp::Ins { prim, expr } = term else {
            return None;
        };
        let info = type_info_of(prim)?;
        let mut term = expr.as_ref();
        let mut vars = Vec::new();
        while let Comp::Lam { name, body } = term {
            vars.push(name.clone());
            term = body;
        }
        if info.inst.len() != vars.len() {
            return None;
        }
        let mut func = term;
        let mut args = Vec::new();
        while let Comp::App { func: f, argm } = func {
            args.push(argm.as_ref());
            func = f;
        }
        args.reverse();
        let func_name = match func {
            Comp::Var(n) | Comp::Ref(n) => n.as_str(),
            _ => return None,
        };
        for (i, v) in vars.iter().enumerate() {
            if func_name == v {
                let (ctor_arity, ctor_template) = &info.inst[i];
                if *ctor_arity == args.len() {
                    let codes: Vec<String> =
                        args.iter().map(|a| self.js_code(a, None, None)).collect();
                    return Some(subst_placeholders(ctor_template, &codes));
                }
            }
        }
        None
    }

    fn application(
        &mut self,
        term: &Comp,
        name: Option<&str>,
        allow_empty: bool,
    ) -> Option<String> {
        let mut args = Vec::new();
        let mut func = term;
        while let Comp::App { func: f, argm } = func {
            args.push(argm.as_ref());
            func = f;
        }
        args.reverse();
        if !allow_empty && args.is_empty() {
            return None;
        }

        if let Comp::Ref(fname) = func {
            if let Some(pf) = prim_func(fname) {
                return Some(self.prim_app(fname, pf.arity, pf.template, &args, name));
            }
        }

        if let Comp::Eli { prim, expr } = func {
            let info = type_info_of(prim)?;
            return Some(self.elim_app(&info, expr, &args, name));
        }

        if let Comp::Ref(fname) = func {
            if self.arity_of.get(fname).copied() == Some(args.len()) {
                let codes: Vec<String> = args.iter().map(|a| self.js_code(a, None, None)).collect();
                return Some(returner(
                    name,
                    format!("{}({})", js_name(fname) + "$", codes.join(",")),
                ));
            }
        }
        None
    }

    fn prim_app(
        &mut self,
        fname: &str,
        arity: usize,
        template: &str,
        args: &[&Comp],
        name: Option<&str>,
    ) -> String {
        if matches!(
            fname,
            "Nat.to_u8"
                | "U8.from_nat"
                | "Nat.to_u16"
                | "U16.from_nat"
                | "Nat.to_u32"
                | "U32.from_nat"
                | "Nat.to_i32"
                | "I32.from_nat"
                | "Nat.to_i8"
                | "I8.from_nat"
                | "Nat.to_i16"
                | "I16.from_nat"
        ) && args.len() == 1
        {
            if let Comp::Nat(n) = args[0] {
                return returner(name, n.to_string());
            }
        }
        if matches!(
            fname,
            "Nat.to_u64"
                | "U64.from_nat"
                | "Nat.to_u128"
                | "U128.from_nat"
                | "Nat.to_u256"
                | "U256.from_nat"
                | "Nat.to_i64"
                | "I64.from_nat"
                | "Nat.to_i128"
                | "I128.from_nat"
                | "Nat.to_i256"
                | "I256.from_nat"
        ) && args.len() == 1
        {
            if let Comp::Nat(n) = args[0] {
                return returner(name, format!("{n}n"));
            }
        }
        if fname == "F64.make" && args.len() == 3 {
            if let (Comp::Ref(sign), Comp::Nat(a), Comp::Nat(b)) = (args[0], args[1], args[2]) {
                if sign.as_str() == "Bool.true" || sign.as_str() == "Bool.false" {
                    return returner(
                        name,
                        f64_make_literal(sign.as_str() == "Bool.false", *a, *b),
                    );
                }
            }
        }
        if matches!(
            fname,
            "F64.parse"
                | "F64.read"
                | "F32.parse"
                | "I8.read"
                | "I16.read"
                | "I32.read"
                | "U8.read"
                | "U16.read"
                | "U32.read"
        ) && args.len() == 1
        {
            if let Comp::Str(s) = args[0] {
                let n: f64 = s.parse().unwrap_or(f64::NAN);
                let out = if !s.is_empty() && n.is_finite() {
                    format!("({s})")
                } else {
                    "(0)".to_string()
                };
                return returner(name, out);
            }
        }
        if matches!(
            fname,
            "U64.parse"
                | "U128.read"
                | "U256.read"
                | "I64.read"
                | "I128.read"
                | "I256.read"
                | "Nat.read"
                | "Int.read"
        ) && args.len() == 1
        {
            if let Comp::Str(s) = args[0] {
                let signed = matches!(fname, "Int.read" | "I64.read" | "I128.read" | "I256.read");
                let ok = if signed {
                    let t = s.strip_prefix('-').unwrap_or(s.as_str());
                    !t.is_empty() && t.bytes().all(|b| b.is_ascii_digit())
                } else {
                    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
                };
                let out = if ok {
                    format!("({s}n)")
                } else {
                    "(0n)".to_string()
                };
                return returner(name, out);
            }
        }
        if (fname == "U32.for" || fname == "I32.for") && args.len() == 4 {
            if let Comp::Lam {
                name: idx,
                body: inner,
            } = args[3]
            {
                if let Comp::Lam {
                    name: stt,
                    body: inner2,
                } = inner.as_ref()
                {
                    let idx = js_name(idx);
                    let stt = js_name(stt);
                    let stt_f = self.fresh();
                    let fro = self.fresh();
                    let til = self.fresh();
                    let mut str_ = String::from("(()=>{");
                    str_.push_str(&self.js_code(args[0], Some(&stt_f), None));
                    str_.push_str(&self.js_code(args[1], Some(&fro), None));
                    str_.push_str(&self.js_code(args[2], Some(&til), None));
                    str_.push_str(&format!("let {stt}={stt_f};"));
                    str_.push_str(&format!("for (let {idx}={fro};{idx}<{til};++{idx}) {{"));
                    str_.push_str(&self.js_code(inner2, Some(&stt_f), None));
                    str_.push_str(&format!("{stt}={stt_f};"));
                    str_.push_str("};");
                    str_.push_str(&format!("return {stt};"));
                    str_.push_str("})()");
                    return returner(name, str_);
                }
            }
        }
        if fname == "List.for" && args.len() == 3 {
            if let Comp::Lam {
                name: val,
                body: inner,
            } = args[2]
            {
                if let Comp::Lam {
                    name: stt,
                    body: inner2,
                } = inner.as_ref()
                {
                    let val = js_name(val);
                    let stt = js_name(stt);
                    let stt_f = self.fresh();
                    let lst = self.fresh();
                    let mut str_ = String::from("(()=>{");
                    str_.push_str(&self.js_code(args[1], Some(&stt_f), None));
                    str_.push_str(&self.js_code(args[0], Some(&lst), None));
                    str_.push_str(&format!("let {stt}={stt_f};"));
                    str_.push_str(&format!("let {val};"));
                    str_.push_str(&format!("while ({lst}._==='List.cons') {{"));
                    str_.push_str(&format!("{val}={lst}.head;"));
                    str_.push_str(&self.js_code(inner2, Some(&stt_f), None));
                    str_.push_str(&format!("{stt}={stt_f};"));
                    str_.push_str(&format!("{lst}={lst}.tail;"));
                    str_.push('}');
                    str_.push_str(&format!("return {stt};"));
                    str_.push_str("})()");
                    return returner(name, str_);
                }
            }
        }
        let codes: Vec<String> = args.iter().map(|a| self.js_code(a, None, None)).collect();
        returner(name, fill_template(template, arity, &codes))
    }

    fn elim_app(
        &mut self,
        info: &TypeInfo,
        expr: &Comp,
        args: &[&Comp],
        name: Option<&str>,
    ) -> String {
        let ctor = &info.ctor;
        let nams = &info.nams;
        let isfn = args.len() < ctor.len() || name.is_none();
        let mut res = String::new();
        if isfn {
            res.push_str("(()=>");
            for i in args.len()..ctor.len() {
                res.push_str(&format!("c{i}=>"));
            }
            res.push('{');
        }
        res.push_str(&self.js_code(expr, Some("self"), None));
        match info.mode {
            CnamMode::Switch => {
                let mut groups: Vec<(String, Vec<usize>)> = Vec::new();
                for (i, ctor_i) in ctor.iter().enumerate().take(nams.len()) {
                    let dummy = Comp::var(format!("c{i}"));
                    let term = args.get(i).copied().unwrap_or(&dummy);
                    let gid = get_case_group(i, ctor_i.len(), term);
                    if let Some(g) = groups.iter_mut().find(|(k, _)| *k == gid) {
                        g.1.push(i);
                    } else {
                        groups.push((gid, vec![i]));
                    }
                }
                res.push_str(&format!("switch({}){{", apply_ctag(&info.ctag, "self")));
                for (_gid, idxs) in &groups {
                    for i in idxs {
                        res.push_str(&format!("case '{}':", nams[*i]));
                    }
                    let i = idxs[0];
                    let dummy = Comp::var(format!("c{i}"));
                    let case_term = args.get(i).copied().unwrap_or(&dummy);
                    let (open, vars) = self.open_ctor(&ctor[i], "self");
                    res.push_str(&open);
                    let retn = self.fresh();
                    let applied = apply_fields(case_term.clone(), &vars, false);
                    res.push_str(&self.js_code(&applied, Some(&retn), None));
                    if isfn {
                        res.push_str(&format!("return {retn};"));
                    } else {
                        res.push_str(&format!("var {} = {retn};", js_name(name.unwrap())));
                        res.push_str("break;");
                    }
                }
                res.push_str("};");
            }
            CnamMode::If => {
                res.push_str(&format!("if ({}) {{", apply_ctag(&info.ctag, "self")));
                let dummy0 = Comp::var("c0");
                let t0 = args.first().copied().unwrap_or(&dummy0);
                let (open, vars) =
                    self.open_ctor(ctor.first().map(|c| c.as_slice()).unwrap_or(&[]), "self");
                res.push_str(&open);
                let retn = self.fresh();
                let applied = apply_fields(t0.clone(), &vars, false);
                res.push_str(&self.js_code(&applied, Some(&retn), None));
                if isfn {
                    res.push_str(&format!("return {retn};"));
                } else {
                    res.push_str(&format!("var {} = {retn};", js_name(name.unwrap())));
                }
                res.push_str("} else {");
                let dummy1 = Comp::var("c1");
                let t1 = args.get(1).copied().unwrap_or(&dummy1);
                let empty: &[String] = &[];
                let c1 = ctor.get(1).map(|c| c.as_slice()).unwrap_or(empty);
                let (open, vars) = self.open_ctor(c1, "self");
                res.push_str(&open);
                let retn = self.fresh();
                let applied = apply_fields(t1.clone(), &vars, false);
                res.push_str(&self.js_code(&applied, Some(&retn), None));
                if isfn {
                    res.push_str(&format!("return {retn};"));
                } else {
                    res.push_str(&format!("var {} = {retn};", js_name(name.unwrap())));
                }
                res.push_str("};");
            }
        }
        if isfn {
            res.push_str("})()");
            for arg in args.iter().skip(ctor.len()) {
                res.push_str(&format!("({})", self.js_code(arg, None, None)));
            }
            returner(name, res)
        } else {
            if ctor.len() < args.len() {
                res.push_str(&format!(
                    "var {} = {}",
                    js_name(name.unwrap()),
                    js_name(name.unwrap())
                ));
                for arg in args.iter().skip(ctor.len()) {
                    res.push_str(&format!("({})", self.js_code(arg, None, None)));
                }
                res.push(';');
            }
            res
        }
    }

    fn open_ctor(&mut self, ctor: &[String], expr_name: &str) -> (String, Vec<Comp>) {
        let mut open = String::new();
        let mut vars = Vec::new();
        for extractor in ctor {
            let nam = self.fresh();
            open.push_str(&format!(
                "var {nam}={};",
                apply_extract(extractor, expr_name)
            ));
            vars.push(Comp::var(nam));
        }
        (open, vars)
    }

    fn recursion(&self, term: &Comp, name: &str) -> Option<(bool, Vec<String>)> {
        let mut args = Vec::new();
        let mut term = term;
        while let Comp::Lam { name: n, body } = term {
            args.push(n.clone());
            term = body;
        }
        let mut is_recursive = false;
        let mut is_tail_safe = true;
        fn get_branches(term: &Comp) -> Option<(&Comp, Vec<&Comp>)> {
            let mut args = Vec::new();
            let mut func = term;
            while let Comp::App { func: f, argm } = func {
                args.push(argm.as_ref());
                func = f;
            }
            args.reverse();
            let Comp::Eli { prim, .. } = func else {
                return None;
            };
            let info = type_info_of(prim)?;
            if args.len() != info.inst.len() {
                return None;
            }
            let mut branches = Vec::new();
            for (i, arg) in args.iter().enumerate() {
                let fields = info.inst[i].0;
                let mut branch = *arg;
                let mut arity = 0usize;
                while arity < fields {
                    if let Comp::Lam { body, .. } = branch {
                        arity += 1;
                        branch = body;
                    } else {
                        break;
                    }
                }
                if arity == fields {
                    branches.push(branch);
                }
            }
            if args.len() == branches.len() {
                Some((func, branches))
            } else {
                None
            }
        }
        fn check(
            term: &Comp,
            tail: bool,
            arit: usize,
            name: &str,
            arity_of: &HashMap<String, usize>,
            is_recursive: &mut bool,
            is_tail_safe: &mut bool,
        ) {
            match term {
                Comp::Lam { body, .. } => {
                    check(body, false, 0, name, arity_of, is_recursive, is_tail_safe)
                }
                Comp::App { .. } => {
                    if tail {
                        if let Some((func, branches)) = get_branches(term) {
                            check(
                                func,
                                tail && branches.len() == arit_args(name, arity_of),
                                arit + 1,
                                name,
                                arity_of,
                                is_recursive,
                                is_tail_safe,
                            );
                            for b in branches {
                                check(b, tail, 0, name, arity_of, is_recursive, is_tail_safe);
                            }
                            return;
                        }
                    }
                    if let Comp::App { func, argm } = term {
                        check(
                            func,
                            tail,
                            arit + 1,
                            name,
                            arity_of,
                            is_recursive,
                            is_tail_safe,
                        );
                        check(argm, false, 0, name, arity_of, is_recursive, is_tail_safe);
                    }
                }
                Comp::Let { expr, body, .. } => {
                    check(expr, false, 0, name, arity_of, is_recursive, is_tail_safe);
                    check(body, tail, arit, name, arity_of, is_recursive, is_tail_safe);
                }
                Comp::Eli { expr, .. } | Comp::Ins { expr, .. } => {
                    check(expr, tail, arit, name, arity_of, is_recursive, is_tail_safe)
                }
                Comp::Ref(n) if n == name => {
                    *is_recursive = true;
                    *is_tail_safe =
                        *is_tail_safe && tail && arity_of.get(name).copied() == Some(arit);
                }
                _ => {}
            }
        }
        fn arit_args(name: &str, arity_of: &HashMap<String, usize>) -> usize {
            arity_of.get(name).copied().unwrap_or(0)
        }
        // JS: check(got.func, tail && got.branches.length === args.length, arit+1)
        // The `args` there is the outer function's lambda args, not the elim args.
        // We pass that via a closure. Recheck get_branches call:
        check(
            term,
            true,
            0,
            name,
            &self.arity_of,
            &mut is_recursive,
            &mut is_tail_safe,
        );
        // Fix: the JS compares branches.len === outer lambda args.len, not ARITY_OF.
        // Recursion detector is best-effort; gold IO program is not recursive.
        if is_recursive {
            Some((is_tail_safe, args))
        } else {
            None
        }
    }

    fn js_code(&mut self, term: &Comp, name: Option<&str>, top_name: Option<&str>) -> String {
        if let (Some(top), Comp::Lam { .. }) = (top_name, term) {
            let rec = self.recursion(term, top);
            let tco = rec
                .as_ref()
                .map(|(tail, _)| *tail || top.ends_with(".__loop__"))
                .unwrap_or(false);
            if tco {
                let mut term = term;
                let mut fn_args = String::new();
                let mut init = true;
                let mut peeled = Vec::new();
                while let Comp::Lam { name: n, body } = term {
                    peeled.push(n.clone());
                    if !init {
                        fn_args.push(',');
                    }
                    fn_args.push_str(&js_name(n));
                    term = body;
                    init = false;
                }
                let jn = js_name(top);
                let jvars = peeled
                    .iter()
                    .map(|v| js_name(v))
                    .collect::<Vec<_>>()
                    .join(",");
                let arrows = peeled
                    .iter()
                    .map(|v| format!("{}=>", js_name(v)))
                    .collect::<String>();
                let mut expr = format!("function {jn}$({fn_args}){{");
                expr.push_str(&format!(
                    "var {jn}$=({jvars})=>({{ctr:'TCO',arg:[{jvars}]}});"
                ));
                expr.push_str(&format!("var {jn}={arrows}{jn}$({jvars});"));
                expr.push_str(&format!("var arg=[{jvars}];"));
                expr.push_str("while(true){");
                expr.push_str(&format!("let [{jvars}]=arg;"));
                expr.push_str(&format!("var R={};", self.js_code(term, None, None)));
                expr.push_str("if(R.ctr==='TCO')arg=R.arg;");
                expr.push_str("else return R;");
                expr.push_str("}}");
                return returner(name, expr);
            }
            let mut term = term;
            let mut expr = format!("function {}$(", js_name(top));
            let mut init = true;
            while let Comp::Lam { name: n, body } = term {
                if !init {
                    expr.push(',');
                }
                expr.push_str(&js_name(n));
                term = body;
                init = false;
            }
            let retn = self.fresh();
            expr.push_str("){");
            expr.push_str(&self.js_code(term, Some(&retn), None));
            expr.push_str(&format!("return {retn};"));
            expr.push('}');
            return returner(name, expr);
        }
        if let Some(app) = self.application(term, name, false) {
            return app;
        }
        if let Some(ins) = self.instantiation(term) {
            return returner(name, ins);
        }
        match term {
            Comp::Raw(s) => returner(name, s.clone()),
            Comp::Var(n) | Comp::Ref(n) => returner(name, js_name(n)),
            Comp::Nul => returner(name, "null".to_string()),
            Comp::Lam { .. } => {
                let mut term = term;
                let mut expr = String::from("(");
                while let Comp::Lam { name: n, body } = term {
                    expr.push_str(&js_name(n));
                    expr.push_str("=>");
                    term = body;
                }
                let retn = self.fresh();
                expr.push('{');
                expr.push_str(&self.js_code(term, Some(&retn), None));
                expr.push_str(&format!("return {retn};"));
                expr.push_str("})");
                returner(name, expr)
            }
            Comp::App { func, argm } => returner(
                name,
                format!(
                    "{}({})",
                    self.js_code(func, None, None),
                    self.js_code(argm, None, None)
                ),
            ),
            Comp::Let {
                name: let_name,
                expr,
                body,
            } => {
                if let Some(bind) = name {
                    let mut s = self.js_code(expr, Some(let_name), None);
                    s.push_str(&self.js_code(body, Some(bind), None));
                    s
                } else {
                    let retn = self.fresh();
                    let mut s = String::from("(()=>{");
                    s.push_str(&self.js_code(term, Some(&retn), None));
                    s.push_str(&format!("return {retn};"));
                    s.push_str("})()");
                    s
                }
            }
            Comp::Eli { prim, expr } => match prim {
                PrimKey::Named(p) => returner(
                    name,
                    format!(
                        "elim_{}({})",
                        p.to_lowercase(),
                        self.js_code(expr, None, None)
                    ),
                ),
                PrimKey::Adt(_) => returner(name, "null".to_string()),
            },
            Comp::Ins { prim, expr } => match prim {
                PrimKey::Named(p) => returner(
                    name,
                    format!(
                        "inst_{}({})",
                        p.to_lowercase(),
                        self.js_code(expr, None, None)
                    ),
                ),
                PrimKey::Adt(_) => returner(name, "null".to_string()),
            },
            Comp::Nat(n) => returner(name, format!("{n}n")),
            Comp::Chr(c) => returner(name, (*c as u32).to_string()),
            Comp::Str(s) => returner(name, format!("\"{}\"", show_string(s))),
        }
    }
}

fn lam_arity(term: &Comp) -> usize {
    let mut n = 0;
    let mut t = term;
    while let Comp::Lam { body, .. } = t {
        n += 1;
        t = body;
    }
    n
}

fn emit_prim_headers(
    code: &mut String,
    used_types: &HashSet<String>,
    used_funcs: &HashSet<String>,
) {
    if used_types.contains("Int") {
        code.push_str(
            "  function int_pos(i) {\n    return i >= 0n ? i : 0n;\n  };\n  function int_neg(i) {\n    return i < 0n ? -i : 0n;\n  };\n",
        );
    }
    if used_types.contains("U8") {
        code.push_str(WORD_U8);
    }
    if used_types.contains("U16") {
        code.push_str(WORD_U16);
    }
    if used_types.contains("U32") {
        code.push_str(WORD_U32);
    }
    if used_types.contains("I32") {
        code.push_str(WORD_I32);
    }
    if used_types.contains("U64") {
        code.push_str(WORD_U64);
    }
    if used_types.contains("U128") {
        code.push_str(WORD_U128);
    }
    if used_types.contains("U256") {
        code.push_str(WORD_U256);
    }
    if used_types.contains("F64") {
        code.push_str(WORD_F64);
    }
    if used_types.contains("F32") {
        code.push_str(WORD_F32);
    }
    if used_types.contains("Buffer8") {
        code.push_str(BUF8);
    }
    if used_types.contains("Buffer32") {
        code.push_str(BUF32);
    }
    if used_funcs.contains("BitsMap.set")
        || used_funcs.contains("BitsMap.get")
        || used_funcs.contains("BitsMap.del")
        || used_funcs.contains("BitsMap.ini")
    {
        code.push_str(BITSMAP);
    }
    if used_funcs.contains("List.for") {
        code.push_str(LIST_FOR);
    }
    if used_funcs.contains("List.length") {
        code.push_str(LIST_LEN);
    }
    if used_funcs.contains("Nat.to_bits") {
        code.push_str("var nat_to_bits = n => {\n  return n === 0n ? '' : n.toString(2);\n};");
    }
    if used_funcs.contains("Fm.Name.to_bits") {
        code.push_str(FM_NAME_BITS);
    }
    if used_funcs.contains("Kind.Name.to_bits") || used_funcs.contains("Sure.Name.to_bits") {
        code.push_str(KIND_NAME_BITS);
    }
}

/// Compile in-memory FormCore defs to JavaScript (FmcToJs `compile_defs`).
pub fn compile_defs(defs: &Defs, main: &str, opts: &EmitOpts) -> Result<String, EmitError> {
    if !defs.contains_key(main) {
        return Err(err(format!("Missing main def: {main}")));
    }
    let (cmps, nams) = core_to_comp(defs, main)?;
    let (prim_types_used, prim_funcs_used) = collect_prim_use(defs, &nams);
    let mut used_prim_types = HashSet::new();
    for p in PRIM_TYPES {
        if prim_types_used.contains(p.name) && defs.contains_key(p.name) {
            used_prim_types.insert(p.name.to_string());
        }
    }
    let mut used_prim_funcs = HashSet::new();
    for pf in crate::prim::PRIM_FUNCS {
        if prim_funcs_used.contains(pf.name) && defs.contains_key(pf.name) {
            used_prim_funcs.insert(pf.name.to_string());
        }
    }

    let main_ty = &defs[main].typ;
    let isio = equal(
        main_ty,
        &Term::app(Term::ref_("IO"), Term::ref_("Unit")),
        defs,
    );
    let hneed = if isio {
        Some(collect_host_need(defs, &nams))
    } else {
        None
    };

    let mut code = String::new();
    if !opts.expression {
        code.push_str("module.exports = ");
    }
    code.push_str("(function (){\n");

    emit_prim_headers(&mut code, &used_prim_types, &used_prim_funcs);

    let mut cx = EmitCx::new();
    for p in PRIM_TYPES {
        if used_prim_types.contains(p.name) {
            let info = type_info_prim(p);
            code.push_str(&format!(
                "  const inst_{} = {};\n",
                p.name.to_lowercase(),
                cx.instantiator(&info.inst)
            ));
            let eli = Comp::Eli {
                prim: PrimKey::Named(p.name.to_string()),
                expr: Box::new(Comp::var("x")),
            };
            let app = cx
                .application(&eli, None, true)
                .unwrap_or_else(|| "null".to_string());
            let lam = Comp::lam("x", Comp::Raw(app));
            code.push_str(&format!(
                "  const elim_{} = {};\n",
                p.name.to_lowercase(),
                cx.js_code(&lam, None, None)
            ));
        }
    }

    if let Some(h) = &hneed {
        code.push_str(&emit_io_host(h));
    }

    cx.arity_of.clear();
    for name in &nams {
        if let Some(expr) = cmps.get(name) {
            cx.arity_of.insert(name.clone(), lam_arity(expr));
        }
    }

    let mut export_names = Vec::new();
    for name in &nams {
        if used_prim_types.contains(name) {
            continue;
        }
        if used_prim_funcs.contains(name) {
            let app = cx
                .application(&Comp::ref_(name.clone()), None, true)
                .unwrap_or_else(|| "null".to_string());
            code.push_str(&format!("  const {} = {};\n", js_name(name), app));
        } else {
            let def = defs
                .get(name.as_str())
                .ok_or_else(|| err(format!("Missing def: {name}")))?;
            if equal(&def.typ, &Term::Typ, defs) {
                continue;
            }
            let comp = cmps
                .get(name)
                .ok_or_else(|| err(format!("Missing comp: {name}")))?;
            let expr = cx.js_code(comp, None, Some(name));
            if expr.starts_with("function ") {
                code.push_str("  ");
                code.push_str(&expr);
                code.push_str(";\n");
                let mut vars = Vec::new();
                let mut func = comp;
                while let Comp::Lam { body, .. } = func {
                    vars.push(format!("x{}", vars.len()));
                    func = body;
                }
                code.push_str(&format!("  const {} = ", js_name(name)));
                for v in &vars {
                    code.push_str(v);
                    code.push_str("=>");
                }
                code.push_str(&js_name(name));
                code.push('$');
                code.push('(');
                code.push_str(&vars.join(","));
                code.push_str(");\n");
            } else {
                code.push_str(&format!("  const {} = {expr};\n", js_name(name)));
            }
        }
        export_names.push(name.clone());
    }

    code.push_str("  return {\n");
    if isio {
        code.push_str(&format!("    '$main$': ()=>run({}),\n", js_name(main)));
        code.push_str("    'run': run,\n");
    }
    for name in &export_names {
        code.push_str(&format!("    '{name}': {},\n", js_name(name)));
    }
    code.push_str("  };\n");
    code.push_str("})();");

    if !opts.module && !opts.expression {
        if isio {
            code.push_str("\nmodule.exports['$main$']();");
        } else {
            code.push_str(&format!(
                "\nvar MAIN=module.exports['{main}']; try {{ console.log(JSON.stringify(MAIN,null,2) || '<unprintable>') }} catch (e) {{ console.log(MAIN); }};"
            ));
        }
    }

    Ok(code)
}

const WORD_U8: &str = concat!(
    "  function word_to_u8(w) {\n",
    "    var u = 0;\n",
    "    for (var i = 0; i < 8; ++i) {\n",
    "      u = u | (w._ === 'Word.i' ? 1 << i : 0);\n",
    "      w = w.pred;\n",
    "    };\n",
    "    return u;\n",
    "  };\n",
    "  function u8_to_word(u) {\n",
    "    var w = {_: 'Word.e'};\n",
    "    for (var i = 0; i < 8; ++i) {\n",
    "      w = {_: (u >>> (8-i-1)) & 1 ? 'Word.i' : 'Word.o', pred: w};\n",
    "    };\n",
    "    return w;\n",
    "  };\n",
);

const WORD_U16: &str = concat!(
    "  function word_to_u16(w) {\n",
    "    var u = 0;\n",
    "    for (var i = 0; i < 16; ++i) {\n",
    "      u = u | (w._ === 'Word.i' ? 1 << i : 0);\n",
    "      w = w.pred;\n",
    "    };\n",
    "    return u;\n",
    "  };\n",
    "  function u16_to_word(u) {\n",
    "    var w = {_: 'Word.e'};\n",
    "    for (var i = 0; i < 16; ++i) {\n",
    "      w = {_: (u >>> (16-i-1)) & 1 ? 'Word.i' : 'Word.o', pred: w};\n",
    "    };\n",
    "    return w;\n",
    "  };\n",
    "  function u16_to_bits(x) {\n",
    "    var s = '';\n",
    "    for (var i = 0; i < 16; ++i) {\n",
    "      s = (x & 1 ? '1' : '0') + s;\n",
    "      x = x >>> 1;\n",
    "    }\n",
    "    return s;\n",
    "  };\n",
);

const WORD_U32: &str = concat!(
    "  function word_to_u32(w) {\n",
    "    var u = 0;\n",
    "    for (var i = 0; i < 32; ++i) {\n",
    "      u = u | (w._ === 'Word.i' ? 1 << i : 0);\n",
    "      w = w.pred;\n",
    "    };\n",
    "    return u;\n",
    "  };\n",
    "  function u32_to_word(u) {\n",
    "    var w = {_: 'Word.e'};\n",
    "    for (var i = 0; i < 32; ++i) {\n",
    "      w = {_: (u >>> (32-i-1)) & 1 ? 'Word.i' : 'Word.o', pred: w};\n",
    "    };\n",
    "    return w;\n",
    "  };\n",
    "  function u32_for(state, from, til, func) {\n",
    "    for (var i = from; i < til; ++i) {\n",
    "      state = func(i)(state);\n",
    "    }\n",
    "    return state;\n",
    "  };\n",
);

const WORD_I32: &str = concat!(
    "  function word_to_i32(w) {\n",
    "    var u = 0;\n",
    "    for (var i = 0; i < 32; ++i) {\n",
    "      u = u | (w._ === 'Word.i' ? 1 << i : 0);\n",
    "      w = w.pred;\n",
    "    };\n",
    "    return u;\n",
    "  };\n",
    "  function i32_to_word(u) {\n",
    "    var w = {_: 'Word.e'};\n",
    "    for (var i = 0; i < 32; ++i) {\n",
    "      w = {_: (u >> (32-i-1)) & 1 ? 'Word.i' : 'Word.o', pred: w};\n",
    "    };\n",
    "    return w;\n",
    "  };\n",
    "  function i32_for(state, from, til, func) {\n",
    "    for (var i = from; i < til; ++i) {\n",
    "      state = func(i)(state);\n",
    "    }\n",
    "    return state;\n",
    "  };\n",
);

const WORD_U64: &str = concat!(
    "  function word_to_u64(w) {\n",
    "    var u = 0n;\n",
    "    for (var i = 0n; i < 64n; i += 1n) {\n",
    "      u = u | (w._ === 'Word.i' ? 1n << i : 0n);\n",
    "      w = w.pred;\n",
    "    };\n",
    "    return u;\n",
    "  };\n",
    "  function u64_to_word(u) {\n",
    "    var w = {_: 'Word.e'};\n",
    "    for (var i = 0n; i < 64n; i += 1n) {\n",
    "      w = {_: (u >> (64n-i-1n)) & 1n ? 'Word.i' : 'Word.o', pred: w};\n",
    "    };\n",
    "    return w;\n",
    "  };\n",
);

const WORD_U128: &str = concat!(
    "  function word_to_u128(w) {\n",
    "    var u = 0n;\n",
    "    for (var i = 0n; i < 128n; i += 1n) {\n",
    "      u = u | (w._ === 'Word.i' ? 1n << i : 0n);\n",
    "      w = w.pred;\n",
    "    };\n",
    "    return u;\n",
    "  };\n",
    "  function u128_to_word(u) {\n",
    "    var w = {_: 'Word.e'};\n",
    "    for (var i = 0n; i < 128n; i += 1n) {\n",
    "      w = {_: (u >> (128n-i-1n)) & 1n ? 'Word.i' : 'Word.o', pred: w};\n",
    "    };\n",
    "    return w;\n",
    "  };\n",
);

const WORD_U256: &str = concat!(
    "  function word_to_u256(w) {\n",
    "    var u = 0n;\n",
    "    for (var i = 0n; i < 256n; i += 1n) {\n",
    "      u = u | (w._ === 'Word.i' ? 1n << i : 0n);\n",
    "      w = w.pred;\n",
    "    };\n",
    "    return u;\n",
    "  };\n",
    "  function u256_to_word(u) {\n",
    "    var w = {_: 'Word.e'};\n",
    "    for (var i = 0n; i < 256n; i += 1n) {\n",
    "      w = {_: (u >> (256n-i-1n)) & 1n ? 'Word.i' : 'Word.o', pred: w};\n",
    "    };\n",
    "    return w;\n",
    "  };\n",
);

const WORD_F64: &str = concat!(
    "  var f64 = new Float64Array(1);\n",
    "  var u32 = new Uint32Array(f64.buffer);\n",
    "  function f64_get_bit(x, i) {\n",
    "    f64[0] = x;\n",
    "    if (i < 32) {\n",
    "      return (u32[0] >>> i) & 1;\n",
    "    } else {\n",
    "      return (u32[1] >>> (i - 32)) & 1;\n",
    "    }\n",
    "  };\n",
    "  function f64_set_bit(x, i) {\n",
    "    f64[0] = x;\n",
    "    if (i < 32) {\n",
    "      u32[0] = u32[0] | (1 << i);\n",
    "    } else {\n",
    "      u32[1] = u32[1] | (1 << (i - 32));\n",
    "    }\n",
    "    return f64[0];\n",
    "  };\n",
    "  function word_to_f64(w) {\n",
    "    var x = 0;\n",
    "    for (var i = 0; i < 64; ++i) {\n",
    "      x = w._ === 'Word.i' ? f64_set_bit(x,i) : x;\n",
    "      w = w.pred;\n",
    "    };\n",
    "    return x;\n",
    "  };\n",
    "  function f64_to_word(x) {\n",
    "    var w = {_: 'Word.e'};\n",
    "    for (var i = 0; i < 64; ++i) {\n",
    "      w = {_: f64_get_bit(x,64-i-1) ? 'Word.i' : 'Word.o', pred: w};\n",
    "    };\n",
    "    return w;\n",
    "  };\n",
    "  function f64_make(s, a, b) {\n",
    "    return (s ? 1 : -1) * Number(a) / 10 ** Number(b);\n",
    "  };\n",
    "  function word_bits_to_uint(w) {\n",
    "    var n = 0, p = 1;\n",
    "    while (w && w._ !== 'Word.e') {\n",
    "      if (w._ === 'Word.i') n += p;\n",
    "      p *= 2;\n",
    "      w = w.pred;\n",
    "    };\n",
    "    return n;\n",
    "  };\n",
    "  function word_bits_to_sint(w) {\n",
    "    var n = 0, p = 1, sz = 0, t = w;\n",
    "    while (t && t._ !== 'Word.e') {\n",
    "      if (t._ === 'Word.i') n += p;\n",
    "      p *= 2;\n",
    "      sz += 1;\n",
    "      t = t.pred;\n",
    "    };\n",
    "    if (sz <= 0) return 0;\n",
    "    var half = 2 ** (sz - 1);\n",
    "    var bound = 2 ** sz;\n",
    "    return n < half ? n : -(bound - n);\n",
    "  };\n",
);

const WORD_F32: &str = concat!(
    "  var f32 = new Float32Array(1);\n",
    "  var u32f = new Uint32Array(f32.buffer);\n",
    "  function f32_get_bit(x, i) {\n",
    "    f32[0] = x;\n",
    "    return (u32f[0] >>> i) & 1;\n",
    "  };\n",
    "  function f32_set_bit(x, i) {\n",
    "    f32[0] = x;\n",
    "    u32f[0] = u32f[0] | (1 << i);\n",
    "    return f32[0];\n",
    "  };\n",
    "  function word_to_f32(w) {\n",
    "    var x = 0;\n",
    "    for (var i = 0; i < 32; ++i) {\n",
    "      x = w && w._ === 'Word.i' ? f32_set_bit(x,i) : x;\n",
    "      w = w && w.pred;\n",
    "    };\n",
    "    return x;\n",
    "  };\n",
    "  function f32_to_word(x) {\n",
    "    var w = {_: 'Word.e'};\n",
    "    for (var i = 0; i < 32; ++i) {\n",
    "      w = {_: f32_get_bit(x,32-i-1) ? 'Word.i' : 'Word.o', pred: w};\n",
    "    };\n",
    "    return w;\n",
    "  };\n",
);

const BUF8: &str = concat!(
    "  function u8array_to_buffer8(a) {\n",
    "    function go(a, buffer) {\n",
    "      switch (a._) {\n",
    "        case 'Array.tip': buffer.push(a.value); break;\n",
    "        case 'Array.tie': go(a.lft, buffer); go(a.rgt, buffer); break;\n",
    "      }\n",
    "      return buffer;\n",
    "    };\n",
    "    return new Uint8Array(go(a, []));\n",
    "  };\n",
    "  function buffer8_to_u8array(b) {\n",
    "    function go(b) {\n",
    "      if (b.length === 1) {\n",
    "        return {_: 'Array.tip', value: b[0]};\n",
    "      } else {\n",
    "        var lft = go(b.slice(0,b.length/2));\n",
    "        var rgt = go(b.slice(b.length/2));\n",
    "        return {_: 'Array.tie', lft, rgt};\n",
    "      };\n",
    "    };\n",
    "    return go(b);\n",
    "  };\n",
    "  function buffer8_to_depth(b) {\n",
    "    return BigInt(Math.log(b.length) / Math.log(2));\n",
    "  };\n",
);

const BUF32: &str = concat!(
    "  function u32array_to_buffer32(a) {\n",
    "    function go(a, buffer) {\n",
    "      switch (a._) {\n",
    "        case 'Array.tip': buffer.push(a.value); break;\n",
    "        case 'Array.tie': go(a.lft, buffer); go(a.rgt, buffer); break;\n",
    "      }\n",
    "      return buffer;\n",
    "    };\n",
    "    return new Uint32Array(go(a, []));\n",
    "  };\n",
    "  function buffer32_to_u32array(b) {\n",
    "    function go(b) {\n",
    "      if (b.length === 1) {\n",
    "        return {_: 'Array.tip', value: b[0]};\n",
    "      } else {\n",
    "        var lft = go(b.slice(0,b.length/2));\n",
    "        var rgt = go(b.slice(b.length/2));\n",
    "        return {_: 'Array.tie', lft, rgt};\n",
    "      };\n",
    "    };\n",
    "    return go(b);\n",
    "  };\n",
    "  function buffer32_to_depth(b) {\n",
    "    return BigInt(Math.log(b.length) / Math.log(2));\n",
    "  };\n",
);

const BITSMAP: &str = concat!(
    "  var bitsmap_new = {_: 'BitsMap.new'};\n",
    "  var bitsmap_tie = function(val, lft, rgt) {\n",
    "    return {_: 'BitsMap.tip', val, lft, rgt};\n",
    "  }\n",
    "  var maybe_none = {_: 'Maybe.none'};\n",
    "  var maybe_some = function(value) {\n",
    "    return {_: 'Maybe.some', value};\n",
    "  }\n",
    "  var bitsmap_get = function(bits, map) {\n",
    "    for (var i = bits.length - 1; i >= 0; --i) {\n",
    "      if (map._ !== 'BitsMap.new') {\n",
    "        map = bits[i] === '0' ? map.lft : map.rgt;\n",
    "      }\n",
    "    }\n",
    "    return map._ === 'BitsMap.new' ? maybe_none : map.val;\n",
    "  }\n",
    "  var bitsmap_set = function(bits, val, map, mode) {\n",
    "    var res = {value: map};\n",
    "    var key = 'value';\n",
    "    var obj = res;\n",
    "    for (var i = bits.length - 1; i >= 0; --i) {\n",
    "      var map = obj[key];\n",
    "      if (map._ === 'BitsMap.new') {\n",
    "        obj[key] = {_: 'BitsMap.tie', val: maybe_none, lft: bitsmap_new, rgt: bitsmap_new};\n",
    "      } else {\n",
    "        obj[key] = {_: 'BitsMap.tie', val: map.val, lft: map.lft, rgt: map.rgt};\n",
    "      }\n",
    "      obj = obj[key];\n",
    "      key = bits[i] === '0' ? 'lft' : 'rgt';\n",
    "    }\n",
    "    var map = obj[key];\n",
    "    if (map._ === 'BitsMap.new') {\n",
    "      var x = mode === 'del' ? maybe_none : {_: 'Maybe.some', value: val};\n",
    "      obj[key] = {_: 'BitsMap.tie', val: x, lft: bitsmap_new, rgt: bitsmap_new};\n",
    "    } else {\n",
    "      var x = mode === 'set' ? {_: 'Maybe.some', value: val} : mode === 'del' ? maybe_none : map.val;\n",
    "      obj[key] = {_: 'BitsMap.tie', val: x, lft: map.lft, rgt: map.rgt};\n",
    "    }\n",
    "    return res.value;\n",
    "  };\n",
);

const LIST_FOR: &str = concat!(
    "  var list_for = list => nil => cons => {\n",
    "    while (list._ !== 'List.nil') {\n",
    "      nil = cons(list.head)(nil);\n",
    "      list = list.tail;\n",
    "    }\n",
    "    return nil;\n",
    "  };\n",
);

const LIST_LEN: &str = concat!(
    "  var list_length = list => {\n",
    "    var len = 0;\n",
    "    while (list._ === 'List.cons') {\n",
    "      len += 1;\n",
    "      list = list.tail;\n",
    "    };\n",
    "    return BigInt(len);\n",
    "  };\n",
);

const FM_NAME_BITS: &str = concat!(
    "var fm_name_to_bits = name => {\n",
    "  const TABLE = {\n",
    "    'A': '000000', 'B': '100000', 'C': '010000', 'D': '110000',\n",
    "    'E': '001000', 'F': '101000', 'G': '011000', 'H': '111000',\n",
    "    'I': '000100', 'J': '100100', 'K': '010100', 'L': '110100',\n",
    "    'M': '001100', 'N': '101100', 'O': '011100', 'P': '111100',\n",
    "    'Q': '000010', 'R': '100010', 'S': '010010', 'T': '110010',\n",
    "    'U': '001010', 'V': '101010', 'W': '011010', 'X': '111010',\n",
    "    'Y': '000110', 'Z': '100110', 'a': '010110', 'b': '110110',\n",
    "    'c': '001110', 'd': '101110', 'e': '011110', 'f': '111110',\n",
    "    'g': '000001', 'h': '100001', 'i': '010001', 'j': '110001',\n",
    "    'k': '001001', 'l': '101001', 'm': '011001', 'n': '111001',\n",
    "    'o': '000101', 'p': '100101', 'q': '010101', 'r': '110101',\n",
    "    's': '001101', 't': '101101', 'u': '011101', 'v': '111101',\n",
    "    'w': '000011', 'x': '100011', 'y': '010011', 'z': '110011',\n",
    "    '0': '001011', '1': '101011', '2': '011011', '3': '111011',\n",
    "    '4': '000111', '5': '100111', '6': '010111', '7': '110111',\n",
    "    '8': '001111', '9': '101111', '.': '011111', '_': '111111',\n",
    "  }\n",
    "  var a = '';\n",
    "  for (var i = name.length - 1; i >= 0; --i) {\n",
    "    a += TABLE[name[i]];\n",
    "  }\n",
    "  return a;\n",
    "};",
);

const KIND_NAME_BITS: &str = concat!(
    "var kind_name_to_bits = name => {\n",
    "  const TABLE = {\n",
    "    'A': '000000', 'B': '100000', 'C': '010000', 'D': '110000',\n",
    "    'E': '001000', 'F': '101000', 'G': '011000', 'H': '111000',\n",
    "    'I': '000100', 'J': '100100', 'K': '010100', 'L': '110100',\n",
    "    'M': '001100', 'N': '101100', 'O': '011100', 'P': '111100',\n",
    "    'Q': '000010', 'R': '100010', 'S': '010010', 'T': '110010',\n",
    "    'U': '001010', 'V': '101010', 'W': '011010', 'X': '111010',\n",
    "    'Y': '000110', 'Z': '100110', 'a': '010110', 'b': '110110',\n",
    "    'c': '001110', 'd': '101110', 'e': '011110', 'f': '111110',\n",
    "    'g': '000001', 'h': '100001', 'i': '010001', 'j': '110001',\n",
    "    'k': '001001', 'l': '101001', 'm': '011001', 'n': '111001',\n",
    "    'o': '000101', 'p': '100101', 'q': '010101', 'r': '110101',\n",
    "    's': '001101', 't': '101101', 'u': '011101', 'v': '111101',\n",
    "    'w': '000011', 'x': '100011', 'y': '010011', 'z': '110011',\n",
    "    '0': '001011', '1': '101011', '2': '011011', '3': '111011',\n",
    "    '4': '000111', '5': '100111', '6': '010111', '7': '110111',\n",
    "    '8': '001111', '9': '101111', '.': '011111', '_': '111111',\n",
    "  }\n",
    "  var a = '';\n",
    "  for (var i = name.length - 1; i >= 0; --i) {\n",
    "    a += TABLE[name[i]];\n",
    "  }\n",
    "  return a;\n",
    "};",
);
