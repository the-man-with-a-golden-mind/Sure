//! Sure surface syntax: terms, names, lexer, parser, formatter.

mod desugar;
mod file;
mod fmt;
mod lex;
mod name;
mod parse;
mod span;
mod subst;
mod term;

pub use file::{file_imps, parse_file};
pub use fmt::format_source;
pub use lex::{tokenize, Keyword, LexError, Token, TokenKind};
pub use name::{is_ident_start, is_letter, Name};
pub use parse::{parse_term, ParseError};
pub use span::Span;
pub use subst::{open_all, open_lam, subst_levels};
pub use term::{Bits, Def, Defs, Error, Status, Term, WithBinder};

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
