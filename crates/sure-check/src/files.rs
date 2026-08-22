//! `Sure.Synth.files_of`. Empty names are not modules.

/// Candidate files for a qualified name, module file first then split files.
/// `Http.Server.get` → `Http.sure`, `Http/Server.sure`, `Http/Server/get.sure`.
pub fn files_of(name: &str) -> Vec<String> {
    if name.is_empty() {
        return Vec::new();
    }
    files_of_make(&split_name(name), "")
}

fn split_name(name: &str) -> Vec<&str> {
    if name.is_empty() {
        Vec::new()
    } else {
        name.split('.').collect()
    }
}

fn files_of_make(names: &[&str], last: &str) -> Vec<String> {
    match names.split_first() {
        None => Vec::new(),
        Some((head, tail)) => {
            let mut out = vec![format!("{last}{head}.sure")];
            out.extend(files_of_make(tail, &format!("{last}{head}/")));
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_of_matches_sure_theorems() {
        assert_eq!(files_of("Add"), ["Add.sure"]);
        assert_eq!(files_of("Add.two"), ["Add.sure", "Add/two.sure"]);
        assert_eq!(
            files_of("Http.Server.get"),
            ["Http.sure", "Http/Server.sure", "Http/Server/get.sure"]
        );
    }

    #[test]
    fn empty_name_is_not_a_module() {
        assert!(files_of("").is_empty());
    }
}
