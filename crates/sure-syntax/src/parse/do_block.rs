use super::{ParseError, Parser};
use crate::desugar::{app, monad_bind, monad_pure, r#ref};
use crate::lex::{Keyword, TokenKind};
use crate::name::Name;
use crate::term::Term;

impl Parser<'_> {
    /// `Sure.Parser.do` subset: `IO { stmt… }` (optional `do ` prefix, type params).
    pub(crate) fn do_block(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            if p.at_ident("do") && p.next_has_gap() {
                p.bump();
            }
            let name = p.name1()?;
            let upper = name
                .chars()
                .next()
                .map(|c| c.is_ascii_uppercase())
                .unwrap_or(false);
            if !upper {
                return Err(p.error("Not a do-block."));
            }
            let mut params = Vec::new();
            while !p.at_do_open_brace() {
                if let Some(args) = p.try_parse(|q| {
                    q.items(
                        |k| matches!(k, TokenKind::LParen),
                        |k| matches!(k, TokenKind::RParen),
                        true,
                        |r| r.term(),
                    )
                }) {
                    if args.is_empty() {
                        return Err(p.error("Not a do-block."));
                    }
                    params.extend(args);
                } else if let Some(args) = p.try_parse(|q| {
                    q.items(
                        |k| matches!(k, TokenKind::Lt),
                        |k| matches!(k, TokenKind::Gt),
                        true,
                        |r| r.term(),
                    )
                }) {
                    if args.is_empty() {
                        return Err(p.error("Not a do-block."));
                    }
                    params.extend(args);
                } else if p.peek_is_adjacent() && matches!(p.peek_kind(), Some(TokenKind::Bang)) {
                    p.bump();
                    params.push(crate::desugar::hol());
                } else {
                    return Err(p.error("Not a do-block."));
                }
            }
            p.bump();
            let mut ty = r#ref(name.clone());
            let mut monad = r#ref(format!("{name}.monad"));
            for param in params {
                ty = app(ty, param.clone());
                monad = app(monad, param);
            }
            let term = p.do_statements(&ty, &monad)?;
            if !matches!(p.peek_kind(), Some(TokenKind::RBrace)) {
                return Err(p.error("Expected '}'."));
            }
            p.bump();
            Ok(term)
        })
    }

    fn do_statements(&mut self, ty: &Term, monad: &Term) -> Result<Term, ParseError> {
        if let Some(t) = self.try_parse(|p| p.do_bind(ty, monad)) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.do_return(ty, monad)) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.do_statement(ty, monad)) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.do_end()) {
            return Ok(t);
        }
        Err(self.error("Expected a do-statement."))
    }

    fn do_bind(&mut self, ty: &Term, monad: &Term) -> Result<Term, ParseError> {
        if self.at_keyword(Keyword::Get) || self.at_ident("var") {
            self.bump();
        } else {
            return Err(self.error("Expected get/var."));
        }
        let name = self.name1()?;
        if !matches!(self.peek_kind(), Some(TokenKind::Eq)) {
            return Err(self.error("Expected '='."));
        }
        self.bump();
        let expr = self.term()?;
        self.eat_semi();
        let body = self.do_statements(ty, monad)?;
        Ok(monad_bind(ty.clone(), monad.clone(), expr, name, body))
    }

    fn do_return(&mut self, ty: &Term, monad: &Term) -> Result<Term, ParseError> {
        if !self.at_ident("return") {
            return Err(self.error("Expected 'return'."));
        }
        self.bump();
        let expr = self.term()?;
        self.eat_semi();
        Ok(monad_pure(ty.clone(), monad.clone(), expr))
    }

    fn do_statement(&mut self, ty: &Term, monad: &Term) -> Result<Term, ParseError> {
        let expr = self.term()?;
        self.eat_semi();
        let body = self.do_statements(ty, monad)?;
        Ok(monad_bind(
            ty.clone(),
            monad.clone(),
            expr,
            Name::from(""),
            body,
        ))
    }

    fn do_end(&mut self) -> Result<Term, ParseError> {
        let expr = self.term()?;
        self.eat_semi();
        Ok(expr)
    }
}
