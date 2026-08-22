use super::binder::{forall_make, Binder};
use super::{ParseError, Parser};
use crate::desugar::{all, app, apps, lam, lams, r#ref};
use crate::lex::{Keyword, TokenKind};
use crate::name::Name;
use crate::span::Span;
use crate::term::{Def, Status, Term};

/// `Sure.Parser.ADT.Constructor`.
#[derive(Clone, Debug)]
pub(crate) struct Constructor {
    pub name: Name,
    pub args: Vec<Binder>,
    pub inds: Vec<Binder>,
}

/// `Sure.Parser.ADT.Datatype`.
#[derive(Clone, Debug)]
pub(crate) struct Datatype {
    pub name: Name,
    pub pars: Vec<Binder>,
    pub inds: Vec<Binder>,
    pub ctrs: Vec<Constructor>,
}

impl Parser<'_> {
    /// `Sure.Parser.ADT.adt` (no `deriving` expansion).
    pub(crate) fn adt(&mut self) -> Result<Datatype, ParseError> {
        if !self.at_keyword(Keyword::Type) {
            return Err(self.error("Expected 'type'."));
        }
        self.bump();
        let name = self.name1()?;
        let pars = self
            .try_parse(|p| p.binder(&TokenKind::Colon))
            .unwrap_or_default();
        let inds = if matches!(self.peek_kind(), Some(TokenKind::Tilde)) {
            self.bump();
            self.binder(&TokenKind::Colon)?
        } else {
            Vec::new()
        };
        let ctrs = self.items(
            |k| matches!(k, TokenKind::LBrace),
            |k| matches!(k, TokenKind::RBrace),
            false,
            |p| p.adt_ctor(),
        )?;
        if self.at_ident("deriving") {
            self.bump();
            let _ = self.items(
                |k| matches!(k, TokenKind::LParen),
                |k| matches!(k, TokenKind::RParen),
                false,
                |p| p.name1(),
            )?;
        }
        Ok(Datatype {
            name,
            pars,
            inds,
            ctrs,
        })
    }

    fn adt_ctor(&mut self) -> Result<Constructor, ParseError> {
        let name = self.name1()?;
        let args = self
            .try_parse(|p| p.binder(&TokenKind::Colon))
            .unwrap_or_default();
        let inds = if matches!(self.peek_kind(), Some(TokenKind::Tilde)) {
            self.bump();
            self.binder(&TokenKind::Eq)?
        } else {
            Vec::new()
        };
        Ok(Constructor { name, args, inds })
    }

    /// `Sure.Parser.file.adt` without `Term.bind`.
    pub(crate) fn parse_adt(
        &mut self,
        file: &str,
        code: &str,
        module: &str,
    ) -> Result<Vec<Def>, ParseError> {
        let from = match self.peek() {
            Some(t) => t.span.from,
            None => return Err(self.error("Expected a type declaration.")),
        };
        let adt0 = self.adt()?;
        let upto = self.prev_upto();
        let orig = Span::new(from, upto);
        Ok(adt_defs(file, code, orig, module, adt0))
    }
}

fn adt_defs(file: &str, code: &str, orig: Span, module: &str, adt0: Datatype) -> Vec<Def> {
    let qname = crate::desugar::mod_qual(module, &adt0.name);
    let adt = Datatype {
        name: qname.clone(),
        pars: adt0.pars,
        inds: adt0.inds,
        ctrs: adt0.ctrs,
    };
    let arit = (adt.pars.len() + adt.inds.len()) as u32;
    let file = file.to_string();
    let code = code.to_string();
    let mk = |name: Name, term: Term, typ: Term, isct: bool, arit: u32| Def {
        file: file.clone(),
        code: code.clone(),
        orig,
        name,
        term,
        typ,
        isct,
        arit,
        stat: Status::Init,
    };
    let mut out = vec![mk(
        qname.clone(),
        datatype_term(&adt),
        datatype_type(&adt),
        false,
        arit,
    )];
    for ctr in &adt.ctrs {
        let ctr_name = Name::from(format!("{qname}.{}", ctr.name));
        out.push(mk(
            ctr_name,
            constructor_term(&adt, ctr),
            constructor_type(&adt, ctr),
            true,
            arit + ctr.args.len() as u32,
        ));
    }
    out
}

/// `Sure.Parser.ADT.Datatype.build_term`.
fn datatype_term(ty: &Datatype) -> Term {
    let names: Vec<Name> = ty
        .pars
        .iter()
        .chain(ty.inds.iter())
        .map(|b| b.name.clone())
        .collect();
    lams(names, datatype_self_all(ty))
}

fn datatype_self_all(ty: &Datatype) -> Term {
    let moti = datatype_motive(ty);
    let body = datatype_constructors(ty);
    all(true, format!("{}.Self", ty.name), "P", moti, body)
}

fn datatype_motive(ty: &Datatype) -> Term {
    let slf = apps(
        r#ref(ty.name.clone()),
        ty.pars
            .iter()
            .chain(ty.inds.iter())
            .map(|b| r#ref(b.name.clone())),
    );
    let inner = all(false, "", "", slf, Term::Typ);
    ty.inds.iter().rev().fold(inner, |body, ind| {
        all(ind.eras, "", ind.name.clone(), ind.term.clone(), body)
    })
}

fn datatype_constructors(ty: &Datatype) -> Term {
    let ret = apps(r#ref("P"), ty.inds.iter().map(|b| r#ref(b.name.clone())));
    let end = app(ret, r#ref(format!("{}.Self", ty.name)));
    ty.ctrs.iter().rev().fold(end, |body, ctr| {
        all(
            false,
            "",
            ctr.name.clone(),
            datatype_constructor(ty, ctr),
            body,
        )
    })
}

fn datatype_constructor(ty: &Datatype, ctr: &Constructor) -> Term {
    let ret = apps(r#ref("P"), ctr.inds.iter().map(|b| b.term.clone()));
    let slf = apps(
        r#ref(format!("{}.{}", ty.name, ctr.name)),
        ty.pars
            .iter()
            .chain(ctr.args.iter())
            .map(|b| r#ref(b.name.clone())),
    );
    let inner = app(ret, slf);
    ctr.args.iter().rev().fold(inner, |body, arg| {
        all(arg.eras, "", arg.name.clone(), arg.term.clone(), body)
    })
}

/// `Sure.Parser.ADT.Datatype.build_type`.
fn datatype_type(ty: &Datatype) -> Term {
    // Pars/inds on the type itself are not erased (`build_type.go` uses `Bool.false`).
    let inner = Term::Typ;
    ty.pars
        .iter()
        .chain(ty.inds.iter())
        .rev()
        .fold(inner, |body, b| {
            all(false, "", b.name.clone(), b.term.clone(), body)
        })
}

/// `Sure.Parser.ADT.Constructor.build_term`.
fn constructor_term(ty: &Datatype, ctr: &Constructor) -> Term {
    let names: Vec<Name> = ty
        .pars
        .iter()
        .chain(ctr.args.iter())
        .map(|b| b.name.clone())
        .collect();
    let ret = apps(
        r#ref(ctr.name.clone()),
        ctr.args.iter().map(|b| r#ref(b.name.clone())),
    );
    let opt = ty
        .ctrs
        .iter()
        .rev()
        .fold(ret, |body, c| lam(c.name.clone(), body));
    lams(names, lam("P", opt))
}

/// `Sure.Parser.ADT.Constructor.build_type`.
fn constructor_type(ty: &Datatype, ctr: &Constructor) -> Term {
    let ret = {
        let mut t = r#ref(ty.name.clone());
        for v in &ty.pars {
            t = app(t, r#ref(v.name.clone()));
        }
        for v in &ctr.inds {
            t = app(t, v.term.clone());
        }
        t
    };
    let args: Vec<Binder> = ty.pars.iter().chain(ctr.args.iter()).cloned().collect();
    forall_make(&args, ret)
}
