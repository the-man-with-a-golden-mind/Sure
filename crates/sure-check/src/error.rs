//! `Sure.Check` and `Sure.Error`. Errors accumulate; do not drop patches.

use sure_syntax::{Bits, Name, Span, Term};

use crate::context::Context;
use crate::reduce::normalize;
use crate::show::show;

/// Checker honesty: errors accumulate; `value` is `None` only on a stuck bind.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Check<T> {
    pub value: Option<T>,
    pub errors: Vec<Error>,
}

impl<T> Check<T> {
    pub fn result(value: Option<T>, errors: Vec<Error>) -> Self {
        Self { value, errors }
    }

    pub fn pure(value: T) -> Self {
        Self {
            value: Some(value),
            errors: Vec::new(),
        }
    }

    pub fn and_then<U, F>(self, f: F) -> Check<U>
    where
        F: FnOnce(T) -> Check<U>,
    {
        match self.value {
            None => Check {
                value: None,
                errors: self.errors,
            },
            Some(v) => {
                let mut next = f(v);
                let mut errors = self.errors;
                errors.append(&mut next.errors);
                Check {
                    value: next.value,
                    errors,
                }
            }
        }
    }

    pub fn then<U, F>(self, f: F) -> Check<U>
    where
        F: FnOnce() -> Check<U>,
    {
        self.and_then(|_| f())
    }

    pub fn map<U, F>(self, f: F) -> Check<U>
    where
        F: FnOnce(T) -> U,
    {
        Check {
            value: self.value.map(f),
            errors: self.errors,
        }
    }
}

/// `Either<String, Term>` in `Sure.Error.type_mismatch`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TypeSide {
    Text(String),
    Term(Term),
}

/// `Sure.Error`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Error {
    TypeMismatch {
        origin: Option<Span>,
        expected: TypeSide,
        detected: TypeSide,
        context: Context,
    },
    ShowGoal {
        name: Name,
        dref: Vec<Bits>,
        verb: bool,
        goal: Option<Term>,
        context: Context,
    },
    Waiting {
        name: Name,
    },
    Indirect {
        name: Name,
    },
    Patch {
        path: Bits,
        term: Term,
    },
    UndefinedReference {
        origin: Option<Span>,
        name: Name,
    },
    CantInfer {
        origin: Option<Span>,
        term: Term,
        context: Context,
    },
}

impl Error {
    pub fn is_patch(&self) -> bool {
        matches!(self, Error::Patch { .. })
    }

    /// `Sure.Error.show` (empty defs for normalize).
    pub fn show(&self) -> String {
        match self {
            Error::TypeMismatch {
                expected,
                detected,
                context,
                ..
            } => {
                let mut s = String::from("Type mismatch.\n");
                s.push_str("- Expected: ");
                s.push_str(&type_side_show(expected));
                s.push('\n');
                s.push_str("- Detected: ");
                s.push_str(&type_side_show(detected));
                s.push('\n');
                if !context.is_empty() {
                    s.push_str("With context:\n");
                    s.push_str(&crate::context::show(context));
                }
                s
            }
            Error::Waiting { name } => format!("Waiting for '{name}'."),
            Error::Indirect { name } => format!("Error on dependency '{name}'."),
            Error::ShowGoal {
                name,
                goal,
                verb: _,
                context,
                ..
            } => {
                let mut s = format!("Goal ?{name}:\n");
                if let Some(goal) = goal {
                    s.push_str("With type: ");
                    s.push_str(&show(goal));
                    s.push('\n');
                }
                if !context.is_empty() {
                    s.push_str("With context:\n");
                    s.push_str(&crate::context::show(context));
                }
                s
            }
            Error::Patch { term, .. } => format!("Patching: {}", show(term)),
            Error::UndefinedReference { name, .. } => format!("Undefined reference: {name}\n"),
            Error::CantInfer { term, context, .. } => {
                let mut s = format!("Can't infer type of: {}\n", show(term));
                s.push_str("With context:\n");
                s.push_str(&crate::context::show(context));
                s
            }
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.show())
    }
}

fn type_side_show(side: &TypeSide) -> String {
    match side {
        TypeSide::Text(s) => s.clone(),
        TypeSide::Term(t) => show(&normalize(t, &sure_syntax::Defs::new())),
    }
}
