use super::{ParseError, Parser};
use crate::desugar::string_concat;
use crate::lex::TokenKind;
use crate::term::Term;

impl Parser<'_> {
    /// `Sure.Parser.string_concat`: `a | b`.
    pub(crate) fn string_concat_suffix(&mut self, left: Term) -> Result<Term, ParseError> {
        if !matches!(self.peek_kind(), Some(TokenKind::Pipe)) {
            return Err(self.error("Expected '|'."));
        }
        self.bump();
        let right = self.term()?;
        Ok(string_concat(left, right))
    }
}
