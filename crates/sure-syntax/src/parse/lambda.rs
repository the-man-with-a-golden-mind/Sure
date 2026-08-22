use super::{ParseError, Parser};
use crate::desugar::{all, hol, lams, lams_start};
use crate::lex::TokenKind;
use crate::name::Name;
use crate::term::Term;

impl Parser<'_> {
    fn lambda_names_plain(&mut self) -> Result<Vec<Name>, ParseError> {
        self.items(
            |k| matches!(k, TokenKind::LParen),
            |k| matches!(k, TokenKind::RParen),
            false,
            |p| p.name1(),
        )
    }

    fn lambda_name_term(&mut self) -> Result<(Name, Option<Term>), ParseError> {
        let name = self.name1()?;
        let typ = if matches!(self.peek_kind(), Some(TokenKind::Colon)) {
            self.bump();
            Some(self.term()?)
        } else {
            None
        };
        Ok((name, typ))
    }

    fn lambda_avoid_app(&self) -> Result<(), ParseError> {
        if self.peek_is_adjacent() && matches!(self.peek_kind(), Some(TokenKind::LParen)) {
            Err(self.error("Avoided."))
        } else {
            Ok(())
        }
    }

    /// `Sure.Parser.lambda.1` then `lambda.2`.
    pub(crate) fn lambda(&mut self) -> Result<Term, ParseError> {
        if let Some(t) = self.try_parse(|p| p.lambda_plain()) {
            return Ok(t);
        }
        self.lambda_ann()
    }

    fn lambda_plain(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            let names = p.lambda_names_plain()?;
            p.lambda_avoid_app()?;
            let body = p.term()?;
            Ok(lams_start(names, body))
        })
    }

    fn lambda_ann(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            let pairs = p.items(
                |k| matches!(k, TokenKind::LParen),
                |k| matches!(k, TokenKind::RParen),
                false,
                |q| q.lambda_name_term(),
            )?;
            if pairs.is_empty() {
                return Err(p.error("Expected a name."));
            }
            p.lambda_avoid_app()?;
            let body = p.term()?;
            let names: Vec<Name> = pairs.iter().map(|(n, _)| n.clone()).collect();
            let types: Vec<Option<Term>> = pairs.into_iter().map(|(_, t)| t).collect();
            let lamb = lams_start(names, body);
            let typ = lambda_type(&types);
            Ok(Term::Ann {
                done: false,
                term: Box::new(lamb),
                typ: Box::new(typ),
            })
        })
    }

    /// `Sure.Parser.lambda.erased`: `<x, y> body`.
    pub(crate) fn lambda_erased(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            let names = p.items(
                |k| matches!(k, TokenKind::Lt),
                |k| matches!(k, TokenKind::Gt),
                false,
                |q| q.name1(),
            )?;
            let body = p.term()?;
            Ok(lams_start(names, body))
        })
    }
}

fn lambda_type(types: &[Option<Term>]) -> Term {
    match types.split_first() {
        None => hol(),
        Some((head, tail)) => {
            let xtyp = head.clone().unwrap_or_else(hol);
            all(false, "", "", xtyp, lambda_type(tail))
        }
    }
}

pub(crate) fn lambda_make(names: impl IntoIterator<Item = Name>, body: Term) -> Term {
    lams(names, body)
}
