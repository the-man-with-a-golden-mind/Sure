//! FormCore.js `typeinfer` / `typecheck`. Used only in crate tests, not `sure prove`.

use crate::equal::equal_at;
use crate::reduce::{normalize, reduce};
use crate::show::show;
use crate::subst::{open_all, open_lam};
use crate::term::{Defs, Name, Term};

/// Binder context (FormCore.js `List` of `{name, type}`). Outermost first.
#[derive(Clone, Debug, Default)]
pub struct Ctx {
    pub binders: Vec<CtxEntry>,
}

#[derive(Clone, Debug)]
pub struct CtxEntry {
    pub name: Name,
    pub typ: Term,
}

impl Ctx {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn size(&self) -> u32 {
        self.binders.len() as u32
    }

    pub fn extend(&self, name: Name, typ: Term) -> Self {
        let mut binders = self.binders.clone();
        binders.push(CtxEntry { name, typ });
        Self { binders }
    }
}

#[derive(Clone, Debug)]
pub struct CheckError {
    pub term: Term,
    pub ctx: Ctx,
    pub msg: String,
}

impl std::fmt::Display for CheckError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.msg)
    }
}

impl std::error::Error for CheckError {}

fn error(term: &Term, ctx: &Ctx, msg: impl Into<String>) -> CheckError {
    CheckError {
        term: term.clone(),
        ctx: ctx.clone(),
        msg: msg.into(),
    }
}

/// Infer a type (FormCore.js `typeinfer`).
pub fn typeinfer(term: &Term, defs: &Defs, ctx: &Ctx) -> Result<Term, CheckError> {
    match term {
        Term::Var { name, level } => Ok(Term::Var {
            name: name.clone(),
            level: *level,
        }),
        Term::Ref(name) => match defs.get(name) {
            Some(got) => Ok(got.typ.clone()),
            None => Err(error(term, ctx, format!("Unbound reference: '{name}'."))),
        },
        Term::Typ => Ok(Term::Typ),
        Term::App { func, argm } => {
            let func_typ = reduce(&typeinfer(func, defs, ctx)?, defs);
            match &func_typ {
                Term::All { xtyp, .. } => {
                    let self_var = Term::ann(true, *func.clone(), func_typ.clone());
                    let name_var = Term::ann(true, *argm.clone(), *xtyp.clone());
                    typecheck(argm, xtyp, defs, ctx)?;
                    Ok(open_all(&func_typ, &self_var, &name_var))
                }
                _ => Err(error(term, ctx, "Non-function application.")),
            }
        }
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr_typ = typeinfer(expr, defs, ctx)?;
            let expr_var = Term::ann(
                true,
                Term::var(name.clone(), ctx.size() + 1),
                expr_typ.clone(),
            );
            let body_ctx = ctx.extend(name.clone(), expr_typ);
            typeinfer(&open_lam(body, *bind_level, &expr_var), defs, &body_ctx)
        }
        Term::Def {
            expr,
            body,
            bind_level,
            ..
        } => typeinfer(&open_lam(body, *bind_level, expr), defs, ctx),
        Term::All {
            self_name,
            name,
            xtyp,
            ..
        } => {
            let self_var = Term::ann(true, Term::var(self_name.clone(), ctx.size()), term.clone());
            let name_var = Term::ann(true, Term::var(name.clone(), ctx.size() + 1), *xtyp.clone());
            let body_ctx = ctx
                .extend(self_name.clone(), term.clone())
                .extend(name.clone(), *xtyp.clone());
            typecheck(xtyp, &Term::Typ, defs, ctx)?;
            typecheck(
                &open_all(term, &self_var, &name_var),
                &Term::Typ,
                defs,
                &body_ctx,
            )?;
            Ok(Term::Typ)
        }
        Term::Ann {
            done,
            term: expr,
            typ,
        } => {
            if !done {
                typecheck(expr, typ, defs, ctx)?;
            }
            Ok(*typ.clone())
        }
        Term::Nat(_) => Ok(Term::ref_("Nat")),
        Term::Chr(_) => Ok(Term::ref_("Char")),
        Term::Str(_) => Ok(Term::ref_("String")),
        _ => Err(error(term, ctx, "Can't infer.")),
    }
}

/// Check `term` against `typ` (FormCore.js `typecheck`).
pub fn typecheck(term: &Term, typ: &Term, defs: &Defs, ctx: &Ctx) -> Result<(), CheckError> {
    let typv = reduce(typ, defs);
    match term {
        Term::Lam {
            name,
            body,
            bind_level,
        } => {
            if let Term::All { xtyp, .. } = &typv {
                let self_var = Term::ann(true, term.clone(), typ.clone());
                let name_var =
                    Term::ann(true, Term::var(name.clone(), ctx.size() + 1), *xtyp.clone());
                let body_typ = open_all(&typv, &self_var, &name_var);
                let body_ctx = ctx.extend(name.clone(), *xtyp.clone());
                typecheck(
                    &open_lam(body, *bind_level, &name_var),
                    &body_typ,
                    defs,
                    &body_ctx,
                )?;
            } else {
                return Err(error(term, ctx, "Lambda has a non-function type."));
            }
        }
        Term::Let {
            name,
            expr,
            body,
            bind_level,
        } => {
            let expr_typ = typeinfer(expr, defs, ctx)?;
            let expr_var = Term::ann(
                true,
                Term::var(name.clone(), ctx.size() + 1),
                expr_typ.clone(),
            );
            let body_ctx = ctx.extend(name.clone(), expr_typ);
            typecheck(
                &open_lam(body, *bind_level, &expr_var),
                typ,
                defs,
                &body_ctx,
            )?;
        }
        _ => {
            let infr = typeinfer(term, defs, ctx)?;
            if !equal_at(typ, &infr, defs, ctx.size()) {
                let type0_str = show(&normalize(typ, &Defs::new()));
                let infr0_str = show(&normalize(&infr, &Defs::new()));
                return Err(error(
                    term,
                    ctx,
                    format!(
                        "Found type: \x1b[2m{infr0_str}\x1b[0m\nInstead of: \x1b[2m{type0_str}\x1b[0m"
                    ),
                ));
            }
        }
    }
    Ok(())
}
