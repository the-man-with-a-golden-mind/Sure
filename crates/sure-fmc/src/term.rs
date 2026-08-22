//! FormCore kernel constructors (port of `vendor/formcore-js/FormCore.js`).

use std::collections::BTreeMap;
use std::sync::Arc;

/// Qualified / binder name. UTF-8, compared as-is.
pub type Name = Arc<str>;

/// FormCore definition (`{type, term}` in FormCore.js).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Def {
    pub typ: Term,
    pub term: Term,
}

/// Sorted by qualified UTF-8 name (stable `show_defs` / gold).
pub type Defs = BTreeMap<Name, Def>;

/// FormCore term. Binders store an explicit body plus `bind_level`
/// (parse-time context size). HOAS apply is `subst_levels`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Term {
    Var {
        name: Name,
        level: u32,
    },
    Ref(Name),
    Typ,
    All {
        eras: bool,
        self_name: Name,
        name: Name,
        xtyp: Box<Term>,
        body: Box<Term>,
        bind_level: u32,
    },
    Lam {
        name: Name,
        body: Box<Term>,
        bind_level: u32,
    },
    App {
        func: Box<Term>,
        argm: Box<Term>,
    },
    Let {
        name: Name,
        expr: Box<Term>,
        body: Box<Term>,
        bind_level: u32,
    },
    Def {
        name: Name,
        expr: Box<Term>,
        body: Box<Term>,
        bind_level: u32,
    },
    Ann {
        done: bool,
        term: Box<Term>,
        typ: Box<Term>,
    },
    /// FormCore.js `Nat` (JS `BigInt`). Hello nats fit `u64`; overflow is a parse error.
    Nat(u64),
    Chr(char),
    Str(String),
}

impl Term {
    pub fn var(name: impl Into<Name>, level: u32) -> Self {
        Term::Var {
            name: name.into(),
            level,
        }
    }

    pub fn ref_(name: impl Into<Name>) -> Self {
        Term::Ref(name.into())
    }

    pub fn app(func: Term, argm: Term) -> Self {
        Term::App {
            func: Box::new(func),
            argm: Box::new(argm),
        }
    }

    pub fn ann(done: bool, term: Term, typ: Term) -> Self {
        Term::Ann {
            done,
            term: Box::new(term),
            typ: Box::new(typ),
        }
    }
}
