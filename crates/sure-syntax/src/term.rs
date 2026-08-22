use std::collections::BTreeMap;

use crate::name::Name;
use crate::span::Span;

/// Sure `Bits` (`e` / `o` / `i`) used for hole paths and `Gol.dref`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Bits {
    E,
    O(Box<Bits>),
    I(Box<Bits>),
}

/// `case … with` binder. Matches `Sure.Ann` `{ name, term, type: Maybe<Term> }`,
/// not `Term::Ann { done, term, typ }`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WithBinder {
    pub name: Name,
    pub term: Term,
    pub typ: Option<Term>,
}

/// Explicit-binder encoding of `Sure.Term`. Binders store `bind_level` (Bruijn
/// **level** of the binder at `Term.bind`); HOAS apply is `subst_levels`.
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
        /// `vlen` at `Term.bind`; self occupies this level, name `bind_level+1`.
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
    /// `Sure.Term.ann` only (checked annotation). Not `WithBinder`.
    Ann {
        done: bool,
        term: Box<Term>,
        typ: Box<Term>,
    },
    Gol {
        name: Name,
        dref: Vec<Bits>,
        verb: bool,
    },
    Hol {
        path: Bits,
    },
    Nat(u64),
    Chr(char),
    Str(String),
    Num {
        sign: Option<bool>,
        numb: u64,
        frac: Option<u64>,
    },
    Cse {
        path: Bits,
        expr: Box<Term>,
        name: Name,
        with: Vec<WithBinder>,
        cses: BTreeMap<Name, Term>,
        moti: Option<Box<Term>>,
    },
    New {
        args: Vec<Term>,
    },
    Get {
        expr: Box<Term>,
        fkey: String,
    },
    Set {
        expr: Box<Term>,
        fkey: String,
        fval: Box<Term>,
    },
    Mut {
        expr: Box<Term>,
        fkey: String,
        ffun: Box<Term>,
    },
    Ope {
        name: String,
        arg0: Box<Term>,
        arg1: Box<Term>,
    },
    Imp {
        expr: Box<Term>,
    },
    Ori {
        orig: Span,
        expr: Box<Term>,
    },
}

/// Check status on a top-level def (`Sure.Status`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status {
    Init,
    Wait,
    Done {
        cached: bool,
    },
    /// `errors` is filled by `sure-check`; empty at parse time.
    Fail {
        errors: Vec<Error>,
    },
}

/// Placeholder until `sure-check` ports `Sure.Error`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Error {
    pub message: String,
}

/// Top-level definition (`Sure.Def`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Def {
    pub file: String,
    pub code: String,
    pub orig: Span,
    pub name: Name,
    pub term: Term,
    pub typ: Term,
    pub isct: bool,
    pub arit: u32,
    pub stat: Status,
}

/// Sorted by qualified UTF-8 name so later FMC/JS gold does not flake.
pub type Defs = BTreeMap<Name, Def>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defs_iterate_sorted_by_utf8_name() {
        let mk = |n: &str| Def {
            file: String::new(),
            code: String::new(),
            orig: Span::new(0, 0),
            name: Name::from(n),
            term: Term::Typ,
            typ: Term::Typ,
            isct: false,
            arit: 0,
            stat: Status::Init,
        };
        let mut defs = Defs::new();
        defs.insert(Name::from("Hello.demo"), mk("Hello.demo"));
        defs.insert(Name::from("Hello.Spec"), mk("Hello.Spec"));
        defs.insert(Name::from("Hello.greet"), mk("Hello.greet"));
        let names: Vec<&str> = defs.keys().map(|n| n.as_ref()).collect();
        assert_eq!(names, ["Hello.Spec", "Hello.demo", "Hello.greet"]);
    }
}
