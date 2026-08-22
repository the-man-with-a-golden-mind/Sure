use super::{ParseError, Parser};
use crate::desugar::if_then_else;
use crate::lex::Keyword;
use crate::term::Term;

impl Parser<'_> {
    /// `Sure.Parser.if`.
    pub(crate) fn if_term(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            if !p.at_keyword(Keyword::If) {
                return Err(p.error("Expected 'if'."));
            }
            p.bump();
            let cond = p.term()?;
            if !p.at_keyword(Keyword::Then) {
                return Err(p.error("Expected 'then'."));
            }
            p.bump();
            let tcse = p.term()?;
            if !p.at_keyword(Keyword::Else) {
                return Err(p.error("Expected 'else'."));
            }
            p.bump();
            let fcse = p.term()?;
            Ok(if_then_else(cond, tcse, fcse))
        })
    }
}
