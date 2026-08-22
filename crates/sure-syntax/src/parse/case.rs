use super::{ParseError, Parser};
use crate::desugar::hol;
use crate::lex::{Keyword, TokenKind};
use crate::name::Name;
use crate::term::{Bits, Term, WithBinder};
use std::collections::BTreeMap;

impl Parser<'_> {
    /// `Sure.Parser.case`.
    pub(crate) fn case(&mut self) -> Result<Term, ParseError> {
        self.with_ori(|p| {
            if !p.at_keyword(Keyword::Case) {
                return Err(p.error("Expected 'case'."));
            }
            p.bump();
            let vals = p.case_vals()?;
            let wyth = p.case_with()?;
            let cses = p.case_cases()?;
            let smrt = if matches!(p.peek_kind(), Some(TokenKind::Bang)) {
                p.bump();
                true
            } else {
                false
            };
            let dflt = if p.at_keyword(Keyword::Default) {
                p.bump();
                Some(p.term()?)
            } else {
                None
            };
            let moti = if matches!(p.peek_kind(), Some(TokenKind::Colon)) {
                p.bump();
                Some(p.term()?)
            } else if smrt {
                None
            } else {
                Some(hol())
            };
            Ok(case_build(&vals, wyth, &cses, dflt.as_ref(), moti))
        })
    }

    fn case_vals(&mut self) -> Result<Vec<(Name, Term)>, ParseError> {
        let mut vals = Vec::new();
        loop {
            if matches!(self.peek_kind(), Some(TokenKind::LBrace)) || self.at_keyword(Keyword::With)
            {
                break;
            }
            let Some((name, expr)) = self.try_parse(|p| p.case_val()) else {
                break;
            };
            vals.push((name, expr));
        }
        if vals.is_empty() {
            Err(self.error("Expected a case scrutinee."))
        } else {
            Ok(vals)
        }
    }

    fn case_val(&mut self) -> Result<(Name, Term), ParseError> {
        if matches!(self.peek_kind(), Some(TokenKind::LBrace)) {
            return Err(self.error("Avoided."));
        }
        let expr = self.term()?;
        let name = if self.at_keyword(Keyword::As) {
            self.bump();
            let n = self.name1()?;
            self.eat_semi();
            n
        } else {
            extract_name(&expr)
        };
        Ok((name, expr))
    }

    fn case_with(&mut self) -> Result<Vec<WithBinder>, ParseError> {
        if !self.at_keyword(Keyword::With) {
            return Ok(Vec::new());
        }
        self.bump();
        let mut out = Vec::new();
        while let Some(w) = self.try_parse(|p| p.case_with_one()) {
            out.push(w);
        }
        Ok(out)
    }

    fn case_with_one(&mut self) -> Result<WithBinder, ParseError> {
        let name = self.name1()?;
        let typ = if matches!(self.peek_kind(), Some(TokenKind::Colon)) {
            self.bump();
            let t = self.term()?;
            self.eat_semi();
            Some(t)
        } else {
            None
        };
        Ok(WithBinder {
            name: name.clone(),
            term: crate::desugar::r#ref(name),
            typ,
        })
    }

    fn case_cases(&mut self) -> Result<Vec<(Vec<Name>, Term)>, ParseError> {
        self.items(
            |k| matches!(k, TokenKind::LBrace),
            |k| matches!(k, TokenKind::RBrace),
            false,
            |p| p.case_case(),
        )
    }

    fn case_case(&mut self) -> Result<(Vec<Name>, Term), ParseError> {
        if matches!(self.peek_kind(), Some(TokenKind::Colon)) {
            return Err(self.error("Expected constructor names."));
        }
        let mut names = Vec::new();
        while !matches!(self.peek_kind(), Some(TokenKind::Colon)) {
            if self.at_eof() {
                return Err(self.error("Expected ':'."));
            }
            names.push(self.name1()?);
        }
        self.bump();
        let term = self.term()?;
        Ok((names, term))
    }
}

fn extract_name(term: &Term) -> Name {
    match term {
        Term::Ori { expr, .. } => extract_name(expr),
        Term::Ref(n) | Term::Var { name: n, .. } => n.clone(),
        _ => Name::from("self"),
    }
}

/// `Sure.Parser.case.build` / `case.group`.
fn case_build(
    vals: &[(Name, Term)],
    wyth: Vec<WithBinder>,
    cses: &[(Vec<Name>, Term)],
    dflt: Option<&Term>,
    moti: Option<Term>,
) -> Term {
    match vals.split_first() {
        None => cses
            .first()
            .map(|(_, t)| t.clone())
            .unwrap_or_else(|| crate::desugar::r#ref("missing_case")),
        Some(((name, expr), rest)) => {
            let grouped = case_group(dflt, cses);
            let cses = grouped
                .into_iter()
                .map(|(k, nested)| {
                    (
                        k,
                        case_build(rest, wyth.clone(), &nested, dflt, moti.clone()),
                    )
                })
                .collect();
            Term::Cse {
                path: Bits::E,
                expr: Box::new(expr.clone()),
                name: name.clone(),
                with: wyth,
                cses,
                moti: moti.map(Box::new),
            }
        }
    }
}

fn case_group(
    dflt: Option<&Term>,
    cses: &[(Vec<Name>, Term)],
) -> BTreeMap<Name, Vec<(Vec<Name>, Term)>> {
    let mut map: BTreeMap<Name, Vec<(Vec<Name>, Term)>> = BTreeMap::new();
    if let Some(d) = dflt {
        map.insert(Name::from("_"), vec![(Vec::new(), d.clone())]);
    }
    for (names, value) in cses.iter().rev() {
        let Some((head, tail)) = names.split_first() else {
            continue;
        };
        map.entry(head.clone())
            .or_default()
            .insert(0, (tail.to_vec(), value.clone()));
    }
    map
}
