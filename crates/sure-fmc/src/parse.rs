//! FormCore parser. Accepts FormCore.js text and `Sure.Core.show` text.

use crate::term::{Def, Defs, Name, Term};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParseError {
    pub message: String,
    pub index: usize,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ParseError {}

struct Parser<'a> {
    code: &'a str,
    indx: usize,
}

impl<'a> Parser<'a> {
    fn err(&self, message: impl Into<String>) -> ParseError {
        ParseError {
            message: message.into(),
            index: self.indx,
        }
    }

    fn peek(&self) -> Option<char> {
        self.code[self.indx..].chars().next()
    }

    fn bump(&mut self) -> Option<char> {
        let c = self.peek()?;
        self.indx += c.len_utf8();
        Some(c)
    }

    fn slice_ahead(&self) -> String {
        self.code[self.indx..].chars().take(32).collect()
    }

    fn parse_spaces(&mut self) {
        while matches!(
            self.peek(),
            Some(' ' | '\n' | '\r' | '\t' | '\u{000b}' | '\u{000c}')
        ) {
            self.bump();
        }
    }

    fn parse_name(&mut self) -> String {
        let start = self.indx;
        while let Some(c) = self.peek() {
            if is_name(c) {
                self.bump();
            } else {
                break;
            }
        }
        self.code[start..self.indx].to_string()
    }

    fn parse_char(&mut self, chr: char) -> Result<(), ParseError> {
        self.parse_spaces();
        match self.peek() {
            None => Err(self.err("Unexpected eof.")),
            Some(got) if got == chr => {
                self.bump();
                Ok(())
            }
            Some(got) => Err(self.err(format!(
                "Expected \"{}\", found {} at {}: {}.",
                chr,
                js_stringify(&got.to_string()),
                self.indx,
                js_stringify(&self.slice_ahead())
            ))),
        }
    }

    fn parse_tokn(&mut self) -> Result<String, ParseError> {
        let Some(c) = self.peek() else {
            return Err(self.err("Unexpected eof"));
        };
        if c != '\\' {
            self.bump();
            return Ok(c.to_string());
        }
        self.bump();
        let Some(esc) = self.peek() else {
            return Err(self.err("Unexpected eof"));
        };
        match esc {
            'u' => {
                self.bump();
                self.parse_char('{')?;
                let mut point = String::new();
                loop {
                    match self.peek() {
                        Some('}') => break,
                        Some(d) if d.is_ascii_hexdigit() => {
                            point.push(d);
                            self.bump();
                        }
                        Some(d) => {
                            return Err(self.err(format!(
                                "Expected hexadecimal Unicode codepoint\", found {} at {}: {}.",
                                js_stringify(&d.to_string()),
                                self.indx,
                                js_stringify(&self.slice_ahead())
                            )));
                        }
                        None => return Err(self.err("Unexpected eof.")),
                    }
                }
                self.bump();
                let value = u32::from_str_radix(&point, 16)
                    .map_err(|_| self.err(format!("Invalid Unicode codepoint {point}")))?;
                let ch = char::from_u32(value)
                    .ok_or_else(|| self.err(format!("Invalid Unicode codepoint {point}")))?;
                Ok(ch.to_string())
            }
            '\\' | '"' | '\'' => {
                self.bump();
                Ok(esc.to_string())
            }
            _ => Err(self.err(format!("Unexpected escape char: '\\{esc}'."))),
        }
    }

    fn parse_term(&mut self, binders: &[(Name, u32)], depth: u32) -> Result<Term, ParseError> {
        self.parse_spaces();
        let Some(chr) = self.bump() else {
            return Err(self.err("Unexpected eof."));
        };
        match chr {
            '*' => Ok(Term::Typ),
            '@' | '%' => {
                let eras = chr == '%';
                let self_name: Name = self.parse_name().into();
                self.parse_char('(')?;
                let name: Name = self.parse_name().into();
                self.parse_char(':')?;
                let xtyp = self.parse_term(binders, depth)?;
                self.parse_char(')')?;
                let mut body_binders = binders.to_vec();
                body_binders.push((self_name.clone(), depth));
                body_binders.push((name.clone(), depth + 1));
                let body = self.parse_term(&body_binders, depth.saturating_add(2))?;
                Ok(Term::All {
                    eras,
                    self_name,
                    name,
                    xtyp: Box::new(xtyp),
                    body: Box::new(body),
                    bind_level: depth,
                })
            }
            '#' => {
                let name: Name = self.parse_name().into();
                let mut body_binders = binders.to_vec();
                body_binders.push((name.clone(), depth));
                let body = self.parse_term(&body_binders, depth.saturating_add(1))?;
                Ok(Term::Lam {
                    name,
                    body: Box::new(body),
                    bind_level: depth,
                })
            }
            '(' => {
                let func = self.parse_term(binders, depth)?;
                let argm = self.parse_term(binders, depth)?;
                self.parse_char(')')?;
                Ok(Term::app(func, argm))
            }
            '!' => {
                let name: Name = self.parse_name().into();
                self.parse_char('=')?;
                let expr = self.parse_term(binders, depth)?;
                self.parse_char(';')?;
                let mut body_binders = binders.to_vec();
                body_binders.push((name.clone(), depth));
                let body = self.parse_term(&body_binders, depth.saturating_add(1))?;
                Ok(Term::Let {
                    name,
                    expr: Box::new(expr),
                    body: Box::new(body),
                    bind_level: depth,
                })
            }
            '$' => {
                let name: Name = self.parse_name().into();
                self.parse_char('=')?;
                let expr = self.parse_term(binders, depth)?;
                self.parse_char(';')?;
                let mut body_binders = binders.to_vec();
                body_binders.push((name.clone(), depth));
                let body = self.parse_term(&body_binders, depth.saturating_add(1))?;
                Ok(Term::Def {
                    name,
                    expr: Box::new(expr),
                    body: Box::new(body),
                    bind_level: depth,
                })
            }
            '{' => {
                let expr = self.parse_term(binders, depth)?;
                self.parse_char(':')?;
                let typ = self.parse_term(binders, depth)?;
                self.parse_char('}')?;
                Ok(Term::ann(false, expr, typ))
            }
            '\'' => {
                let chrx = self.parse_tokn()?;
                self.parse_char('\'')?;
                let c = chrx.chars().next().ok_or_else(|| self.err("Empty char."))?;
                Ok(Term::Chr(c))
            }
            '"' => {
                let mut strx = String::new();
                while self.peek() != Some('"') {
                    if self.peek().is_none() {
                        return Err(self.err("Unexpected eof"));
                    }
                    strx.push_str(&self.parse_tokn()?);
                }
                self.parse_char('"')?;
                Ok(Term::Str(strx))
            }
            '+' => {
                let rest = self.parse_name();
                parse_nat(&rest, self.indx).map(Term::Nat)
            }
            _ if is_name(chr) => {
                let name = format!("{}{}", chr, self.parse_name());
                let skip = if self.peek() == Some('^') {
                    self.bump();
                    parse_skip(&self.parse_name())
                } else {
                    0
                };
                if let Some(level) = lookup(binders, &name, skip) {
                    Ok(Term::var(name, level))
                } else {
                    Ok(Term::ref_(name))
                }
            }
            _ => Err(self.err(format!("Unexpected symbol: '{chr}'."))),
        }
    }

    fn parse_defs(&mut self, defs: &mut Defs) -> Result<(), ParseError> {
        loop {
            self.parse_spaces();
            let name = self.parse_name();
            if name.is_empty() {
                return Ok(());
            }
            self.parse_char(':')?;
            let typ = self.parse_term(&[], 0)?;
            self.parse_char('=')?;
            let term = self.parse_term(&[], 0)?;
            self.parse_char(';')?;
            defs.insert(name.into(), Def { typ, term });
        }
    }
}

/// FormCore.js `is_name`: `.` `/` `0-9` `A-Z` `_` `a-z`.
fn is_name(c: char) -> bool {
    let val = c as u32;
    (46..=47).contains(&val)
        || (48..58).contains(&val)
        || (65..91).contains(&val)
        || (95..96).contains(&val)
        || (97..123).contains(&val)
}

fn lookup(binders: &[(Name, u32)], name: &str, skip: u32) -> Option<u32> {
    let mut skipped = 0u32;
    for (n, level) in binders.iter().rev() {
        if n.as_ref() == name {
            if skipped == skip {
                return Some(*level);
            }
            skipped += 1;
        }
    }
    None
}

fn parse_skip(raw: &str) -> u32 {
    if raw.is_empty() {
        0
    } else {
        raw.parse().unwrap_or(0)
    }
}

fn parse_nat(digits: &str, index: usize) -> Result<u64, ParseError> {
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ParseError {
            message: format!("Invalid nat: +{digits}"),
            index,
        });
    }
    digits.parse::<u64>().map_err(|_| ParseError {
        message: format!("Nat overflow: +{digits}"),
        index,
    })
}

/// Match FormCore.js `JSON.stringify` for error slices (quoted ASCII).
fn js_stringify(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn strip_line_comments(code: &str) -> String {
    code.split('\n')
        .filter(|line| !line.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Parse a single term (`parse` in FormCore.js).
pub fn parse(code: &str) -> Result<Term, ParseError> {
    let stripped = strip_line_comments(code);
    let mut p = Parser {
        code: &stripped,
        indx: 0,
    };
    p.parse_term(&[], 0)
}

/// Parse a definition map (`parse_defs` in FormCore.js).
pub fn parse_defs(code: &str) -> Result<Defs, ParseError> {
    let stripped = strip_line_comments(code);
    let mut p = Parser {
        code: &stripped,
        indx: 0,
    };
    let mut defs = Defs::new();
    p.parse_defs(&mut defs)?;
    Ok(defs)
}
