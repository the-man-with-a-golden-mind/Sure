//! Sure surface syntax: terms, names, lexer. Parser lands in a later PR.

mod lex;
mod name;
mod span;
mod subst;
mod term;

pub use lex::{tokenize, Keyword, LexError, Token, TokenKind};
pub use name::{is_ident_start, is_letter, Name};
pub use span::Span;
pub use subst::{open_all, open_lam, subst_levels};
pub use term::{Bits, Def, Defs, Error, Status, Term, WithBinder};

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
