use std::sync::Arc;

/// Qualified or local Sure name. Compared as UTF-8 (`Arc<str>`), not `Bits`.
pub type Name = Arc<str>;

/// `Sure.Name.is_letter`: ASCII ident characters, including `.` `_` `^`.
pub fn is_letter(c: char) -> bool {
    matches!(c, 'A'..='Z' | 'a'..='z' | '0'..='9' | '.' | '_' | '^')
}

/// Names cannot start with a digit (`Sure.Parser.name1`).
pub fn is_ident_start(c: char) -> bool {
    is_letter(c) && !c.is_ascii_digit()
}
