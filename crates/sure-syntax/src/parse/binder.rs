use super::{ParseError, Parser};
use crate::desugar::all;
use crate::lex::TokenKind;
use crate::name::Name;
use crate::term::Term;

/// `Sure.Binder`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Binder {
    pub eras: bool,
    pub name: Name,
    pub term: Term,
}

/// `Sure.Parser.forall.make`.
pub(crate) fn forall_make(binds: &[Binder], body: Term) -> Term {
    binds.iter().rev().fold(body, |body, b| {
        all(b.eras, "", b.name.clone(), b.term.clone(), body)
    })
}

fn with_self(term: Term, self_name: Name) -> Term {
    match term {
        Term::All {
            eras,
            name,
            xtyp,
            body,
            bind_level,
            ..
        } => Term::All {
            eras,
            self_name,
            name,
            xtyp,
            body,
            bind_level,
        },
        other => other,
    }
}

impl Parser<'_> {
    /// `Sure.Parser.name_term`.
    pub(crate) fn name_term(&mut self, sep: &TokenKind) -> Result<(Name, Term), ParseError> {
        let name = self.name_at_sep(sep)?;
        if !self.at_kind(sep) {
            return Err(self.error("Expected binder separator."));
        }
        self.bump();
        let term = self.term()?;
        Ok((name, term))
    }

    fn binder_homo(&mut self, sep: &TokenKind, eras: bool) -> Result<Vec<Binder>, ParseError> {
        let pairs = if eras {
            self.items(
                |k| matches!(k, TokenKind::Lt),
                |k| matches!(k, TokenKind::Gt),
                false,
                |p| p.name_term(sep),
            )?
        } else {
            self.items(
                |k| matches!(k, TokenKind::LParen),
                |k| matches!(k, TokenKind::RParen),
                false,
                |p| p.name_term(sep),
            )?
        };
        if pairs.is_empty() {
            return Err(self.error("Expected a binder."));
        }
        Ok(pairs
            .into_iter()
            .map(|(name, term)| Binder { eras, name, term })
            .collect())
    }

    /// `Sure.Parser.binder`: one or more homogeneous `(x: T)` / `<x: T>` groups.
    pub(crate) fn binder(&mut self, sep: &TokenKind) -> Result<Vec<Binder>, ParseError> {
        let mut out = Vec::new();
        loop {
            if let Some(bs) = self.try_parse(|p| p.binder_homo(sep, true)) {
                out.extend(bs);
                continue;
            }
            if let Some(bs) = self.try_parse(|p| p.binder_homo(sep, false)) {
                out.extend(bs);
                continue;
            }
            break;
        }
        if out.is_empty() {
            Err(self.error("Expected a binder."))
        } else {
            Ok(out)
        }
    }

    pub(crate) fn binders_many(&mut self, sep: &TokenKind) -> Vec<Binder> {
        let mut out = Vec::new();
        while let Some(bs) = self.try_parse(|p| p.binder(sep)) {
            out.extend(bs);
        }
        out
    }

    /// `Sure.Parser.forall`: `[self] (x: T) -> body` / `<x: T> -> body`.
    pub(crate) fn forall(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            let self_name = match p.peek_kind() {
                Some(TokenKind::Ident(n)) => {
                    let n = n.clone();
                    p.bump();
                    n
                }
                _ => Name::from(""),
            };
            let binds = p.binder(&TokenKind::Colon)?;
            if !matches!(p.peek_kind(), Some(TokenKind::Arrow)) {
                return Err(p.error("Expected '->'."));
            }
            p.bump();
            let body = p.term()?;
            Ok(with_self(forall_make(&binds, body), self_name))
        })
    }
}
