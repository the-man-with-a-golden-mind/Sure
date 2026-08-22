/// Byte offsets into a `.sure` source (`Sure.Def.orig` / `Term.ori`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct Span {
    pub from: u32,
    pub upto: u32,
}

impl Span {
    pub fn new(from: u32, upto: u32) -> Self {
        Self { from, upto }
    }
}
