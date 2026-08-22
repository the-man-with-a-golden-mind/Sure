use crate::desugar::{admit, app, apps, equal, goal, hol, monad_bind, monad_pure, r#ref, refl};
use crate::lex::{Keyword, LexError, Token, TokenKind};
use crate::name::Name;
use crate::span::Span;
use crate::term::Term;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParseError {
    pub span: Span,
    pub message: String,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} at {}..{}",
            self.message, self.span.from, self.span.upto
        )
    }
}

impl std::error::Error for ParseError {}

impl From<LexError> for ParseError {
    fn from(e: LexError) -> Self {
        Self {
            span: e.span,
            message: e.message,
        }
    }
}

/// Token cursor. Whitespace is already skipped by the lexer; `text_now`
/// adjacency is recovered from token spans.
pub(crate) struct Parser<'a> {
    pub(crate) src: &'a str,
    pub(crate) tokens: Vec<Token>,
    pub(crate) pos: usize,
}

impl<'a> Parser<'a> {
    pub(crate) fn from_src(src: &'a str) -> Result<Self, ParseError> {
        let tokens = crate::lex::tokenize(src)?;
        Ok(Self {
            src,
            tokens,
            pos: 0,
        })
    }

    pub(crate) fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    pub(crate) fn peek_kind(&self) -> Option<&TokenKind> {
        self.peek().map(|t| &t.kind)
    }

    pub(crate) fn at_eof(&self) -> bool {
        self.pos >= self.tokens.len()
    }

    pub(crate) fn bump(&mut self) -> Option<Token> {
        let tok = self.tokens.get(self.pos).cloned()?;
        self.pos += 1;
        Some(tok)
    }

    pub(crate) fn prev_upto(&self) -> u32 {
        if self.pos == 0 {
            0
        } else {
            self.tokens[self.pos - 1].span.upto
        }
    }

    /// `Sure.Parser.text_now`: next token starts where the last one ended.
    pub(crate) fn peek_is_adjacent(&self) -> bool {
        self.peek()
            .map(|t| t.span.from == self.prev_upto())
            .unwrap_or(false)
    }

    pub(crate) fn error(&self, message: impl Into<String>) -> ParseError {
        ParseError {
            span: self.peek().map(|t| t.span).unwrap_or_else(|| {
                let n = self.src.len() as u32;
                Span::new(n, n)
            }),
            message: message.into(),
        }
    }

    pub(crate) fn at_keyword(&self, kw: Keyword) -> bool {
        matches!(self.peek_kind(), Some(TokenKind::Keyword(k)) if *k == kw)
    }

    pub(crate) fn at_ident(&self, s: &str) -> bool {
        matches!(self.peek_kind(), Some(TokenKind::Ident(n)) if n.as_ref() == s)
    }

    pub(crate) fn try_parse<T, F>(&mut self, f: F) -> Option<T>
    where
        F: FnOnce(&mut Self) -> Result<T, ParseError>,
    {
        let start = self.pos;
        match f(self) {
            Ok(v) => Some(v),
            Err(_) => {
                self.pos = start;
                None
            }
        }
    }

    /// `Sure.Parser.block`: wrap the consumed span in `Term::Ori`.
    fn with_ori<F>(&mut self, f: F) -> Result<Term, ParseError>
    where
        F: FnOnce(&mut Self) -> Result<Term, ParseError>,
    {
        let from = match self.peek() {
            Some(t) => t.span.from,
            None => return Err(self.error("Expected a term.")),
        };
        let term = f(self)?;
        let upto = self.prev_upto();
        Ok(Term::Ori {
            orig: Span::new(from, upto),
            expr: Box::new(term),
        })
    }

    /// `Sure.Parser.name1`. Reserved set matches `name1.sure` (not lexer keywords).
    pub(crate) fn name1(&mut self) -> Result<Name, ParseError> {
        match self.peek_kind() {
            Some(TokenKind::Ident(n)) => {
                if matches!(
                    n.as_ref(),
                    "case" | "do" | "if" | "with" | "for" | "else" | "switch" | "." | ".." | "..."
                ) {
                    return Err(self.error("Reserved keyword."));
                }
                let n = n.clone();
                self.bump();
                Ok(n)
            }
            _ => Err(self.error("Expected name.")),
        }
    }

    /// `Sure.Parser.term` subset for Hello: string, do, hole, goal, admit, reference;
    /// suffixes application / erased app / equality.
    pub(crate) fn term(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            let atom = p.atom()?;
            p.suffix(atom)
        })
    }

    fn atom(&mut self) -> Result<Term, ParseError> {
        if let Some(t) = self.try_parse(|p| p.string_lit()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.do_block()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.hole()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.goal_term()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.admit_term()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.reference()) {
            return Ok(t);
        }
        Err(self.error("Expected a term."))
    }

    fn suffix(&mut self, mut term: Term) -> Result<Term, ParseError> {
        loop {
            if let Some(t) = self.try_parse(|p| p.application_or_hole(term.clone())) {
                term = t;
                continue;
            }
            if let Some(t) = self.try_parse(|p| p.application_erased(term.clone())) {
                term = t;
                continue;
            }
            if let Some(t) = self.try_parse(|p| p.equality(term.clone())) {
                term = t;
                continue;
            }
            break;
        }
        Ok(term)
    }

    fn string_lit(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| match p.peek_kind() {
            Some(TokenKind::String(s)) => {
                let s = s.clone();
                p.bump();
                Ok(Term::Str(s))
            }
            _ => Err(p.error("Expected a string.")),
        })
    }

    fn hole(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            if p.at_ident("_") {
                p.bump();
                Ok(hol())
            } else {
                Err(p.error("Expected '_'."))
            }
        })
    }

    fn goal_term(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            if !matches!(p.peek_kind(), Some(TokenKind::Question)) {
                return Err(p.error("Expected '?'."));
            }
            p.bump();
            // `Sure.Parser.name` is `many` letters (empty name is allowed).
            let name = match p.peek_kind() {
                Some(TokenKind::Ident(n)) => {
                    let n = n.clone();
                    p.bump();
                    n
                }
                _ => Name::from(""),
            };
            Ok(goal(name))
        })
    }

    fn admit_term(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            if p.at_keyword(Keyword::Admit) {
                p.bump();
                Ok(admit())
            } else {
                Err(p.error("Expected 'admit'."))
            }
        })
    }

    fn reference(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            let name = p.name1()?;
            Ok(match name.as_ref() {
                "Type" => Term::Typ,
                "true" => r#ref("Bool.true"),
                "false" => r#ref("Bool.false"),
                "unit" => r#ref("Unit.new"),
                "none" => app(r#ref("Maybe.none"), hol()),
                "refl" => refl(),
                _ => Term::Ref(name),
            })
        })
    }

    fn items_now(
        &mut self,
        open: fn(&TokenKind) -> bool,
        close: fn(&TokenKind) -> bool,
    ) -> Result<Vec<Term>, ParseError> {
        if !self.peek_is_adjacent() || !self.peek_kind().map(open).unwrap_or(false) {
            return Err(self.error("Expected application."));
        }
        self.bump();
        let mut args = Vec::new();
        loop {
            if self.peek_kind().map(close).unwrap_or(false) {
                if args.is_empty() {
                    return Err(self.error("Expected a term."));
                }
                self.bump();
                return Ok(args);
            }
            let start = self.pos;
            args.push(self.term()?);
            if self.pos == start {
                return Err(self.error("Expected a term."));
            }
            if matches!(self.peek_kind(), Some(TokenKind::Comma)) {
                self.bump();
            }
        }
    }

    /// `application.hole` (`()`) then `application` (`(args)`). `(` must be adjacent.
    fn application_or_hole(&mut self, func: Term) -> Result<Term, ParseError> {
        if !self.peek_is_adjacent() || !matches!(self.peek_kind(), Some(TokenKind::LParen)) {
            return Err(self.error("Expected application."));
        }
        let open = match self.bump() {
            Some(t) => t,
            None => return Err(self.error("Expected '('.")),
        };
        let rparen_adjacent = self
            .peek()
            .map(|t| matches!(t.kind, TokenKind::RParen) && t.span.from == open.span.upto)
            .unwrap_or(false);
        if rparen_adjacent {
            self.bump();
            return Ok(app(func, hol()));
        }
        let mut args = Vec::new();
        loop {
            if matches!(self.peek_kind(), Some(TokenKind::RParen)) {
                if args.is_empty() {
                    return Err(self.error("Expected a term."));
                }
                self.bump();
                break;
            }
            let start = self.pos;
            args.push(self.term()?);
            if self.pos == start {
                return Err(self.error("Expected a term."));
            }
            if matches!(self.peek_kind(), Some(TokenKind::Comma)) {
                self.bump();
            }
        }
        Ok(apps(func, args))
    }

    fn application_erased(&mut self, func: Term) -> Result<Term, ParseError> {
        let args = self.items_now(
            |k| matches!(k, TokenKind::Lt),
            |k| matches!(k, TokenKind::Gt),
        )?;
        Ok(apps(func, args))
    }

    fn equality(&mut self, left: Term) -> Result<Term, ParseError> {
        if !matches!(self.peek_kind(), Some(TokenKind::EqEq)) {
            return Err(self.error("Expected '=='."));
        }
        self.bump();
        let right = self.term()?;
        Ok(equal(left, right))
    }

    /// `text_now(" {")`: `{` with a gap after the previous token.
    fn at_do_open_brace(&self) -> bool {
        matches!(self.peek_kind(), Some(TokenKind::LBrace)) && !self.peek_is_adjacent()
    }

    fn next_has_gap(&self) -> bool {
        match (self.tokens.get(self.pos), self.tokens.get(self.pos + 1)) {
            (Some(a), Some(b)) => b.span.from > a.span.upto,
            _ => false,
        }
    }

    /// `Sure.Parser.do` subset: `IO { stmt… }` (optional `do ` prefix, type params).
    fn do_block(&mut self) -> Result<Term, ParseError> {
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
                    q.items_now(
                        |k| matches!(k, TokenKind::LParen),
                        |k| matches!(k, TokenKind::RParen),
                    )
                }) {
                    params.extend(args);
                } else if let Some(args) = p.try_parse(|q| {
                    q.items_now(
                        |k| matches!(k, TokenKind::Lt),
                        |k| matches!(k, TokenKind::Gt),
                    )
                }) {
                    params.extend(args);
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
        let body = self.do_statements(ty, monad)?;
        Ok(monad_bind(ty.clone(), monad.clone(), expr, name, body))
    }

    fn do_return(&mut self, ty: &Term, monad: &Term) -> Result<Term, ParseError> {
        if !self.at_ident("return") {
            return Err(self.error("Expected 'return'."));
        }
        self.bump();
        let expr = self.term()?;
        Ok(monad_pure(ty.clone(), monad.clone(), expr))
    }

    fn do_statement(&mut self, ty: &Term, monad: &Term) -> Result<Term, ParseError> {
        let expr = self.term()?;
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
        self.term()
    }
}

/// Parse a single term (Hello-slice grammar), then EOF.
pub fn parse_term(code: &str) -> Result<Term, ParseError> {
    let mut p = Parser::from_src(code)?;
    let term = p.term()?;
    if !p.at_eof() {
        return Err(p.error("Expected end of input."));
    }
    Ok(term)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desugar::strip_ori;

    fn t(src: &str) -> Term {
        strip_ori(&parse_term(src).unwrap())
    }

    #[test]
    fn string_and_ref() {
        assert_eq!(t(r#""Sure""#), Term::Str("Sure".into()));
        assert_eq!(t("String"), r#ref("String"));
        assert_eq!(t("Type"), Term::Typ);
    }

    #[test]
    fn equality_and_refl() {
        assert_eq!(
            t(r#"greet == "Sure""#),
            equal(r#ref("greet"), Term::Str("Sure".into()))
        );
        assert_eq!(t("refl"), refl());
    }

    #[test]
    fn hole_admit_goal() {
        assert_eq!(t("_"), hol());
        assert_eq!(t("admit"), admit());
        assert_eq!(t("?hole"), goal("hole"));
    }

    #[test]
    fn apps_and_type_app() {
        assert_eq!(t("IO.print(greet)"), app(r#ref("IO.print"), r#ref("greet")));
        assert_eq!(t("IO<Unit>"), app(r#ref("IO"), r#ref("Unit")));
        assert_eq!(t("f(a, b)"), app(app(r#ref("f"), r#ref("a")), r#ref("b")));
        assert_eq!(t("f()"), app(r#ref("f"), hol()));
    }

    #[test]
    fn do_block_single_statement() {
        assert_eq!(
            t("IO { IO.print(greet) }"),
            app(r#ref("IO.print"), r#ref("greet"))
        );
    }

    #[test]
    fn do_block_two_statements_bind() {
        let got = t("IO { IO.print(a) IO.print(b) }");
        match got {
            Term::App { .. } => {
                assert_eq!(
                    got,
                    monad_bind(
                        r#ref("IO"),
                        r#ref("IO.monad"),
                        app(r#ref("IO.print"), r#ref("a")),
                        Name::from(""),
                        app(r#ref("IO.print"), r#ref("b")),
                    )
                );
            }
            other => panic!("expected bind app, got {other:?}"),
        }
    }

    #[test]
    fn junk_fails() {
        assert!(parse_term("").is_err());
        assert!(parse_term("greet leftover").is_err());
    }
}
