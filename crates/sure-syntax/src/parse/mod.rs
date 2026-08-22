//! Surface parser. Submodules follow `base/Sure/Parser/*.sure`.

pub(crate) mod adt;
pub(crate) mod binder;
mod case;
mod do_block;
mod get;
mod if_term;
pub(crate) mod lambda;
mod reference;
mod string_concat;

use crate::desugar::{admit, app, apps, arrow, equal, goal, hol};
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

    pub(crate) fn peek_nth_kind(&self, n: usize) -> Option<&TokenKind> {
        self.tokens.get(self.pos + n).map(|t| &t.kind)
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

    pub(crate) fn at_kind(&self, kind: &TokenKind) -> bool {
        self.peek_kind() == Some(kind)
    }

    pub(crate) fn eat_semi(&mut self) {
        if self.at_kind(&TokenKind::Semi) {
            self.bump();
        }
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
    pub(crate) fn with_ori<F>(&mut self, f: F) -> Result<Term, ParseError>
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
    /// Keywords such as `as` are valid binder/term names (`String.concat`).
    pub(crate) fn name1(&mut self) -> Result<Name, ParseError> {
        let text = match self.peek_kind() {
            Some(TokenKind::Ident(n)) => n.as_ref(),
            Some(TokenKind::Keyword(kw)) => kw.as_str(),
            _ => return Err(self.error("Expected name.")),
        };
        if matches!(
            text,
            "case" | "do" | "if" | "with" | "for" | "else" | "switch" | "." | ".." | "..."
        ) {
            return Err(self.error("Reserved keyword."));
        }
        let name = Name::from(text);
        self.bump();
        Ok(name)
    }

    /// `Sure.Parser.name`: letters, including keywords (`as` in `String.concat`).
    pub(crate) fn name(&mut self) -> Name {
        match self.peek_kind() {
            Some(TokenKind::Ident(n)) => {
                let n = n.clone();
                self.bump();
                n
            }
            Some(TokenKind::Keyword(kw)) => {
                let n = Name::from(kw.as_str());
                self.bump();
                n
            }
            _ => Name::from(""),
        }
    }

    /// Binder / lambda field name: ident or keyword, empty if `sep` is next.
    pub(crate) fn name_at_sep(&mut self, sep: &TokenKind) -> Result<Name, ParseError> {
        if self.at_kind(sep) {
            return Ok(Name::from(""));
        }
        match self.peek_kind() {
            Some(TokenKind::Ident(_)) | Some(TokenKind::Keyword(_)) => Ok(self.name()),
            _ => Err(self.error("Expected name.")),
        }
    }

    /// `Sure.Parser.term`.
    pub(crate) fn term(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            let atom = p.atom()?;
            p.suffix(atom)
        })
    }

    fn atom(&mut self) -> Result<Term, ParseError> {
        if let Some(t) = self.try_parse(|p| p.forall()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.lambda()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.lambda_erased()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.parenthesis()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.if_term()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.get_destructure()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.string_lit()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.do_block()) {
            return Ok(t);
        }
        if let Some(t) = self.try_parse(|p| p.case()) {
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
        if let Some(t) = self.try_parse(|p| p.nat_lit()) {
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
            if let Some(t) = self.try_parse(|p| p.arrow_suffix(term.clone())) {
                term = t;
                continue;
            }
            if let Some(t) = self.try_parse(|p| p.equality(term.clone())) {
                term = t;
                continue;
            }
            if let Some(t) = self.try_parse(|p| p.string_concat_suffix(term.clone())) {
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

    fn nat_lit(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| match p.peek_kind() {
            Some(TokenKind::Nat(n)) => {
                let n = *n;
                p.bump();
                Ok(Term::Nat(n))
            }
            _ => Err(p.error("Expected a nat.")),
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
            // `Sure.Parser.name` is `many` letters (empty name is allowed),
            // including words the lexer classifies as keywords (`?admit`).
            let name = match p.peek_kind() {
                Some(TokenKind::Ident(n)) => {
                    let n = n.clone();
                    p.bump();
                    n
                }
                Some(TokenKind::Keyword(kw)) => {
                    let n = Name::from(kw.as_str());
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

    fn parenthesis(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            if !matches!(p.peek_kind(), Some(TokenKind::LParen)) {
                return Err(p.error("Expected '('."));
            }
            p.bump();
            let term = p.term()?;
            if !matches!(p.peek_kind(), Some(TokenKind::RParen)) {
                return Err(p.error("Expected ')'."));
            }
            p.bump();
            Ok(term)
        })
    }

    pub(crate) fn items<T, F>(
        &mut self,
        open: fn(&TokenKind) -> bool,
        close: fn(&TokenKind) -> bool,
        adjacent: bool,
        mut parse_item: F,
    ) -> Result<Vec<T>, ParseError>
    where
        F: FnMut(&mut Self) -> Result<T, ParseError>,
    {
        if adjacent && !self.peek_is_adjacent() {
            return Err(self.error("Expected application."));
        }
        if !self.peek_kind().map(open).unwrap_or(false) {
            return Err(self.error("Expected opener."));
        }
        self.bump();
        let mut args = Vec::new();
        loop {
            if self.peek_kind().map(close).unwrap_or(false) {
                self.bump();
                return Ok(args);
            }
            if self.at_eof() {
                return Err(self.error("Expected closer."));
            }
            let start = self.pos;
            args.push(parse_item(self)?);
            if self.pos == start {
                return Err(self.error("Expected a term."));
            }
            if matches!(self.peek_kind(), Some(TokenKind::Comma)) {
                self.bump();
            }
        }
    }

    fn items_now(
        &mut self,
        open: fn(&TokenKind) -> bool,
        close: fn(&TokenKind) -> bool,
    ) -> Result<Vec<Term>, ParseError> {
        let args = self.items(open, close, true, |p| p.term())?;
        if args.is_empty() {
            return Err(self.error("Expected a term."));
        }
        Ok(args)
    }

    /// `application.hole` (`()` / `!`) then `application` (`(args)`). `(` must be adjacent.
    fn application_or_hole(&mut self, func: Term) -> Result<Term, ParseError> {
        if self.peek_is_adjacent() && matches!(self.peek_kind(), Some(TokenKind::Bang)) {
            self.bump();
            return Ok(app(func, hol()));
        }
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

    fn arrow_suffix(&mut self, left: Term) -> Result<Term, ParseError> {
        if !matches!(self.peek_kind(), Some(TokenKind::Arrow)) {
            return Err(self.error("Expected '->'."));
        }
        self.bump();
        let right = self.term()?;
        Ok(arrow(left, right))
    }

    /// `text_now(" {")`: `{` with a gap after the previous token.
    pub(crate) fn at_do_open_brace(&self) -> bool {
        matches!(self.peek_kind(), Some(TokenKind::LBrace)) && !self.peek_is_adjacent()
    }

    pub(crate) fn next_has_gap(&self) -> bool {
        match (self.tokens.get(self.pos), self.tokens.get(self.pos + 1)) {
            (Some(a), Some(b)) => b.span.from > a.span.upto,
            _ => false,
        }
    }
}

/// Parse a single term, then EOF.
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
    use crate::desugar::{
        admit, app, arrow, equal, goal, hol, if_then_else, lam, monad_bind, r#ref, string_concat,
        strip_ori,
    };
    use crate::name::Name;

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
        assert_eq!(t("refl"), crate::desugar::refl());
    }

    #[test]
    fn hole_admit_goal() {
        assert_eq!(t("_"), hol());
        assert_eq!(t("admit"), admit());
        assert_eq!(t("?hole"), goal("hole"));
        assert_eq!(t("?admit"), admit());
        assert_eq!(parse_term("?admit").map(|tm| strip_ori(&tm)), Ok(admit()));
    }

    #[test]
    fn apps_and_type_app() {
        assert_eq!(t("IO.print(greet)"), app(r#ref("IO.print"), r#ref("greet")));
        assert_eq!(t("IO<Unit>"), app(r#ref("IO"), r#ref("Unit")));
        assert_eq!(t("f(a, b)"), app(app(r#ref("f"), r#ref("a")), r#ref("b")));
        assert_eq!(t("f()"), app(r#ref("f"), hol()));
        assert_eq!(t("Word(16)"), app(r#ref("Word"), Term::Nat(16)));
    }

    #[test]
    fn field_get_is_a_dotted_name() {
        assert_eq!(t("n.pred"), r#ref("n.pred"));
        assert_eq!(t("a.value"), r#ref("a.value"));
    }

    #[test]
    fn lambda_and_arrow() {
        assert_eq!(t("(x) x"), lam("x", r#ref("x")));
        assert_eq!(t("(x, y) x"), lam("x", lam("y", r#ref("x"))));
        assert_eq!(
            t("A -> IO<B>"),
            arrow(r#ref("A"), app(r#ref("IO"), r#ref("B")))
        );
        assert_eq!(
            t("(response: String) -> IO<A>"),
            crate::desugar::all(
                false,
                "",
                "response",
                r#ref("String"),
                app(r#ref("IO"), r#ref("A"))
            )
        );
    }

    #[test]
    fn string_concat_pipe() {
        assert_eq!(
            t(r#"text | "\n""#),
            string_concat(r#ref("text"), Term::Str("\n".into()))
        );
    }

    #[test]
    fn if_then_else_desugar() {
        assert_eq!(
            t("if c then a else b"),
            if_then_else(r#ref("c"), r#ref("a"), r#ref("b"))
        );
    }

    #[test]
    fn case_with_motive_and_field_name() {
        let got = t("case n { zero: m succ: n.pred } : Nat");
        match got {
            Term::Cse {
                name, cses, moti, ..
            } => {
                assert_eq!(name.as_ref(), "n");
                assert!(cses.contains_key("zero"));
                assert_eq!(cses.get("succ").map(strip_ori), Some(r#ref("n.pred")));
                assert_eq!(moti.as_deref().map(strip_ori), Some(r#ref("Nat")));
            }
            other => panic!("expected case, got {other:?}"),
        }
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
