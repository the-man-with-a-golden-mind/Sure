//! `n.pred` / `a.value` are dotted `Name`s (`.` is a letter), not `Term::Get`.
//! This ports `Sure.Parser.get` (`let {a, b} = tuple body`).

use super::{ParseError, Parser};
use crate::desugar::get_open;
use crate::lex::{Keyword, TokenKind};
use crate::name::Name;
use crate::term::Term;

impl Parser<'_> {
    /// `Sure.Parser.get`.
    pub(crate) fn get_destructure(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            if !p.at_keyword(Keyword::Let) {
                return Err(p.error("Expected 'let'."));
            }
            if !matches!(p.peek_nth_kind(1), Some(TokenKind::LBrace)) {
                return Err(p.error("Expected '{'."));
            }
            p.bump();
            let names = p.get_names()?;
            if !matches!(p.peek_kind(), Some(TokenKind::Eq)) {
                return Err(p.error("Expected '='."));
            }
            p.bump();
            let expr = p.term()?;
            p.eat_semi();
            let body = p.term()?;
            Ok(get_open(names, expr, body))
        })
    }

    fn get_names(&mut self) -> Result<Vec<Name>, ParseError> {
        self.items(
            |k| matches!(k, TokenKind::LBrace),
            |k| matches!(k, TokenKind::RBrace),
            false,
            |p| p.name1(),
        )
    }
}
