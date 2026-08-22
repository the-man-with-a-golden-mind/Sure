use crate::name::{is_ident_start, is_letter, Name};
use crate::span::Span;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Keyword {
    Module,
    Exposing,
    Type,
    Case,
    If,
    Then,
    Else,
    Let,
    Get,
    Def,
    As,
    Open,
    With,
    For,
    Switch,
    When,
    Default,
    Import,
    Admit,
}

impl Keyword {
    pub fn as_str(self) -> &'static str {
        match self {
            Keyword::Module => "module",
            Keyword::Exposing => "exposing",
            Keyword::Type => "type",
            Keyword::Case => "case",
            Keyword::If => "if",
            Keyword::Then => "then",
            Keyword::Else => "else",
            Keyword::Let => "let",
            Keyword::Get => "get",
            Keyword::Def => "def",
            Keyword::As => "as",
            Keyword::Open => "open",
            Keyword::With => "with",
            Keyword::For => "for",
            Keyword::Switch => "switch",
            Keyword::When => "when",
            Keyword::Default => "default",
            Keyword::Import => "import",
            Keyword::Admit => "admit",
        }
    }

    fn from_ident(s: &str) -> Option<Self> {
        match s {
            "module" => Some(Keyword::Module),
            "exposing" => Some(Keyword::Exposing),
            "type" => Some(Keyword::Type),
            "case" => Some(Keyword::Case),
            "if" => Some(Keyword::If),
            "then" => Some(Keyword::Then),
            "else" => Some(Keyword::Else),
            "let" => Some(Keyword::Let),
            "get" => Some(Keyword::Get),
            "def" => Some(Keyword::Def),
            "as" => Some(Keyword::As),
            "open" => Some(Keyword::Open),
            "with" => Some(Keyword::With),
            "for" => Some(Keyword::For),
            "switch" => Some(Keyword::Switch),
            "when" => Some(Keyword::When),
            "default" => Some(Keyword::Default),
            "import" => Some(Keyword::Import),
            "admit" => Some(Keyword::Admit),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TokenKind {
    Ident(Name),
    Keyword(Keyword),
    String(String),
    Nat(u64),
    Colon,
    Comma,
    LParen,
    RParen,
    LBrace,
    RBrace,
    Lt,
    Gt,
    Eq,
    EqEq,
    /// `?name` goals (`Sure.Parser.goal`).
    Question,
    /// `->` (`Sure.Parser.arrow` / `forall`).
    Arrow,
    /// `~` indexed ADT (`Sure.Parser.ADT`).
    Tilde,
    /// `|` (`Sure.Parser.string_concat`).
    Pipe,
    /// `!` (`Sure.Parser.application.hole`, smart case).
    Bang,
    Semi,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LexError {
    pub span: Span,
    pub message: String,
}

impl std::fmt::Display for LexError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} at {}..{}",
            self.message, self.span.from, self.span.upto
        )
    }
}

impl std::error::Error for LexError {}

struct Lexer<'a> {
    src: &'a str,
    pos: usize,
}

impl<'a> Lexer<'a> {
    fn new(src: &'a str) -> Self {
        Self { src, pos: 0 }
    }

    fn peek(&self) -> Option<char> {
        self.src[self.pos..].chars().next()
    }

    fn starts_with(&self, s: &str) -> bool {
        self.src[self.pos..].starts_with(s)
    }

    fn bump(&mut self) -> Option<char> {
        let c = self.peek()?;
        self.pos += c.len_utf8();
        Some(c)
    }

    fn span_from(&self, from: usize) -> Span {
        Span::new(from as u32, self.pos as u32)
    }

    fn err(&self, from: usize, message: impl Into<String>) -> LexError {
        LexError {
            span: self.span_from(from),
            message: message.into(),
        }
    }

    fn skip_ws_and_comments(&mut self) {
        loop {
            match self.peek() {
                Some(' ' | '\t' | '\r' | '\n') => {
                    self.bump();
                }
                Some('/') if self.starts_with("//") => {
                    self.pos += 2;
                    while let Some(c) = self.peek() {
                        self.bump();
                        if c == '\n' {
                            break;
                        }
                    }
                }
                _ => break,
            }
        }
    }

    fn ident(&mut self) -> Token {
        let from = self.pos;
        while matches!(self.peek(), Some(c) if is_letter(c)) {
            self.bump();
        }
        let text = &self.src[from..self.pos];
        let kind = match Keyword::from_ident(text) {
            Some(kw) => TokenKind::Keyword(kw),
            None => TokenKind::Ident(Name::from(text)),
        };
        Token {
            kind,
            span: self.span_from(from),
        }
    }

    fn nat(&mut self) -> Result<Token, LexError> {
        let from = self.pos;
        let mut value: u64 = 0;
        while let Some(c) = self.peek() {
            if !c.is_ascii_digit() {
                break;
            }
            self.bump();
            let d = u64::from(c as u8 - b'0');
            value = value
                .checked_mul(10)
                .and_then(|v| v.checked_add(d))
                .ok_or_else(|| self.err(from, "nat literal does not fit in u64"))?;
        }
        Ok(Token {
            kind: TokenKind::Nat(value),
            span: self.span_from(from),
        })
    }

    fn string(&mut self) -> Result<Token, LexError> {
        let from = self.pos;
        self.bump();
        let mut out = String::new();
        loop {
            match self.peek() {
                None => return Err(self.err(from, "unterminated string")),
                Some('"') => {
                    self.bump();
                    return Ok(Token {
                        kind: TokenKind::String(out),
                        span: self.span_from(from),
                    });
                }
                Some('\\') => {
                    let esc_at = self.pos;
                    self.bump();
                    match self.peek() {
                        Some(c) => {
                            if let Some(ch) = unescape(c) {
                                self.bump();
                                out.push(ch);
                            } else {
                                // Unknown escape: `\` is a literal (Sure.Parser.char.single fallback).
                                out.push('\\');
                            }
                        }
                        None => return Err(self.err(esc_at, "unterminated string")),
                    }
                }
                Some(c) => {
                    out.push(c);
                    self.bump();
                }
            }
        }
    }

    fn punct(&mut self) -> Result<Token, LexError> {
        let from = self.pos;
        let Some(c) = self.bump() else {
            unreachable!("punct after peek");
        };
        let kind = match c {
            ':' => TokenKind::Colon,
            ',' => TokenKind::Comma,
            '(' => TokenKind::LParen,
            ')' => TokenKind::RParen,
            '{' => TokenKind::LBrace,
            '}' => TokenKind::RBrace,
            '<' => TokenKind::Lt,
            '>' => TokenKind::Gt,
            '?' => TokenKind::Question,
            '=' if self.peek() == Some('=') => {
                self.bump();
                TokenKind::EqEq
            }
            '=' => TokenKind::Eq,
            '-' if self.peek() == Some('>') => {
                self.bump();
                TokenKind::Arrow
            }
            '~' => TokenKind::Tilde,
            '|' => TokenKind::Pipe,
            '!' => TokenKind::Bang,
            ';' => TokenKind::Semi,
            other => {
                return Err(self.err(from, format!("unexpected character {other:?}")));
            }
        };
        Ok(Token {
            kind,
            span: self.span_from(from),
        })
    }

    fn next_token(&mut self) -> Result<Option<Token>, LexError> {
        self.skip_ws_and_comments();
        match self.peek() {
            None => Ok(None),
            Some('"') => self.string().map(Some),
            Some(c) if c.is_ascii_digit() => self.nat().map(Some),
            Some(c) if is_ident_start(c) => Ok(Some(self.ident())),
            Some(_) => self.punct().map(Some),
        }
    }
}

fn unescape(c: char) -> Option<char> {
    match c {
        'b' => Some('\u{0008}'),
        'f' => Some('\u{000c}'),
        'n' => Some('\n'),
        'r' => Some('\r'),
        't' => Some('\t'),
        'v' => Some('\u{000b}'),
        '\\' => Some('\\'),
        '"' => Some('"'),
        '0' => Some('\0'),
        '\'' => Some('\''),
        _ => None,
    }
}

pub fn tokenize(src: &str) -> Result<Vec<Token>, LexError> {
    let mut lexer = Lexer::new(src);
    let mut out = Vec::new();
    while let Some(tok) = lexer.next_token()? {
        out.push(tok);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HELLO: &str = include_str!("../../../examples/hello/src/Hello.sure");

    fn kinds(src: &str) -> Vec<TokenKind> {
        tokenize(src).unwrap().into_iter().map(|t| t.kind).collect()
    }

    fn ident(s: &str) -> TokenKind {
        TokenKind::Ident(Name::from(s))
    }

    fn kw(k: Keyword) -> TokenKind {
        TokenKind::Keyword(k)
    }

    #[test]
    fn hello_sure_tokens() {
        use Keyword::*;
        use TokenKind::{Colon, Comma, EqEq, Gt, LBrace, LParen, Lt, RBrace, RParen, String};
        assert_eq!(
            kinds(HELLO),
            vec![
                kw(Module),
                ident("Hello"),
                kw(Exposing),
                LParen,
                ident("greet"),
                Comma,
                ident("Spec"),
                Comma,
                ident("demo"),
                RParen,
                ident("greet"),
                Colon,
                ident("String"),
                String("Sure".into()),
                ident("Spec"),
                Colon,
                ident("greet"),
                EqEq,
                String("Sure".into()),
                ident("refl"),
                ident("demo"),
                Colon,
                ident("IO"),
                Lt,
                ident("Unit"),
                Gt,
                ident("IO"),
                LBrace,
                ident("IO.print"),
                LParen,
                ident("greet"),
                RParen,
                RBrace,
            ]
        );
    }

    #[test]
    fn hello_sure_spans_are_byte_offsets() {
        let tokens = tokenize(HELLO).unwrap();
        assert_eq!(tokens[0].span, Span::new(0, 6));
        assert_eq!(&HELLO[0..6], "module");
        for tok in &tokens {
            let slice = &HELLO[tok.span.from as usize..tok.span.upto as usize];
            match &tok.kind {
                TokenKind::Keyword(kw) => assert_eq!(slice, kw.as_str()),
                TokenKind::Ident(name) => assert_eq!(slice, name.as_ref()),
                TokenKind::String(s) => {
                    assert!(slice.starts_with('"') && slice.ends_with('"'));
                    assert_eq!(&slice[1..slice.len() - 1], s);
                }
                TokenKind::EqEq => assert_eq!(slice, "=="),
                _ => {}
            }
        }
    }

    #[test]
    fn comments_nats_keywords() {
        use Keyword::{Admit, Let, Type};
        use TokenKind::{Eq, Nat};
        let src = "// header\nlet x = 42 // tail\nadmit\n";
        assert_eq!(
            kinds(src),
            vec![kw(Let), ident("x"), Eq, Nat(42), kw(Admit)]
        );
        // `refl` is an ident (parser desugars it); `type` is a keyword.
        assert_eq!(
            kinds("type Foo refl"),
            vec![kw(Type), ident("Foo"), ident("refl")]
        );
    }

    #[test]
    fn string_escapes_and_unterminated() {
        assert_eq!(kinds(r#""a\nb""#), vec![TokenKind::String("a\nb".into())]);
        assert!(tokenize(r#""abc"#).is_err());
    }

    #[test]
    fn question_goal_and_admit() {
        use Keyword::Admit;
        use TokenKind::Question;
        assert_eq!(
            kinds("?hole admit"),
            vec![Question, ident("hole"), kw(Admit)]
        );
    }
}
