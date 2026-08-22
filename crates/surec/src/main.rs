fn main() {
    println!("{VERSION}");
}

const VERSION: &str = concat!("Sure ", env!("CARGO_PKG_VERSION"), " (Legacy Kind 1.0.121)");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_line() {
        assert_eq!(VERSION, "Sure 0.2.0 (Legacy Kind 1.0.121)");
    }
}
