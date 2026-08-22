//! `Sure.Status` helpers used by `Synth.one` / `Synth.fix`.

use sure_syntax::{Def, Defs, Status};

use crate::error::Error;

pub fn fail(errors: &[Error]) -> Status {
    Status::Fail {
        errors: errors
            .iter()
            .map(|e| sure_syntax::Error { message: e.show() })
            .collect(),
    }
}

pub fn done(cached: bool) -> Status {
    Status::Done { cached }
}

pub fn put_def(defs: &mut Defs, mut def: Def, stat: Status) {
    def.stat = stat;
    defs.insert(def.name.clone(), def);
}
