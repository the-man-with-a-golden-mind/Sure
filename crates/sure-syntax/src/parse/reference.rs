use super::{ParseError, Parser};
use crate::desugar::{app, hol, r#ref, refl};
use crate::term::Term;

impl Parser<'_> {
    /// `Sure.Parser.reference`.
    pub(crate) fn reference(&mut self) -> Result<Term, ParseError> {
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
}
