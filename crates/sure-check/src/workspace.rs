//! Search roots: `SURE_BASE`/`KIND_BASE`, `SURE_PATH`/`KIND_PATH`, `sure.json` source-directories.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use crate::cache::Cache;

/// Filesystem search path for `Synth.load`. Lock-pinned deps are not prepended.
#[derive(Clone, Debug)]
pub struct Workspace {
    pub base: PathBuf,
    pub project_root: PathBuf,
    pub(crate) source_dirs: Vec<PathBuf>,
    pub(crate) path_dirs: Vec<PathBuf>,
    pub(crate) cache: Cache,
}

impl Workspace {
    /// Project `source-directories` plus stdlib `base`. Cache stays off so tests
    /// do not write `examples/hello/.cache`.
    pub fn open(base: impl AsRef<Path>, project: impl AsRef<Path>) -> Self {
        let base = abs(base.as_ref());
        let project_root = abs(project.as_ref());
        let source_dirs = source_dirs_of(&project_root);
        Self {
            base: base.clone(),
            project_root: project_root.clone(),
            source_dirs,
            path_dirs: Vec::new(),
            cache: Cache::disabled(),
        }
    }

    pub fn with_paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.path_dirs = paths.into_iter().map(|p| abs(&p)).collect();
        self
    }

    pub fn with_cache(mut self, cache: Cache) -> Self {
        self.cache = cache;
        self
    }

    /// `SURE_BASE`/`KIND_BASE`, then `SURE_PATH`/`KIND_PATH`, then manifest dirs.
    pub fn from_env() -> Option<Self> {
        let cwd = env::current_dir().ok()?;
        let exe_dir = env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf));
        let base = find_base(&cwd, exe_dir.as_deref())?;
        let project_root = find_manifest(&cwd)
            .and_then(|m| m.parent().map(Path::to_path_buf))
            .unwrap_or_else(|| cwd.clone());
        let source_dirs = source_dirs_of(&project_root);
        let path_dirs = split_path_env(&path_env());
        let here: Vec<String> = source_dirs
            .iter()
            .chain(path_dirs.iter())
            .chain(std::iter::once(&base))
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        let cache = Cache::from_env(project_root.join(".cache"), here);
        Some(Self {
            base,
            project_root,
            source_dirs,
            path_dirs,
            cache,
        })
    }

    /// Project source dirs first so a local `Main` wins over stdlib, then
    /// `SURE_PATH`, then `SURE_BASE`.
    pub fn search_roots(&self) -> Vec<PathBuf> {
        let mut roots = self.path_roots();
        roots.push(self.base.clone());
        roots
    }

    /// `SURE_PATH` plus manifest `source-directories` (not `SURE_BASE`).
    pub fn path_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        for d in self.source_dirs.iter().chain(self.path_dirs.iter()) {
            if !d.as_os_str().is_empty() {
                roots.push(d.clone());
            }
        }
        roots
    }
}

/// `Nat.sure` plus a `Sure/` directory, matching `bin/js/src/main.js` `is_base_dir`.
pub fn is_base_dir(dir: &Path) -> bool {
    dir.join("Nat.sure").is_file() && dir.join("Sure").is_dir()
}

/// Unset `SURE_BASE` walks cwd, then `base/` next to the binary / repo root.
pub fn find_base(cwd: &Path, exe_dir: Option<&Path>) -> Option<PathBuf> {
    if let Some(kb) = env_base() {
        if is_base_dir(&kb) {
            return Some(kb);
        }
        let nested = kb.join("base");
        if is_base_dir(&nested) {
            return Some(nested);
        }
        return None;
    }
    if let Some(found) = walk_base(cwd) {
        return Some(found);
    }
    if let Some(exe) = exe_dir {
        if let Some(found) = walk_base(exe) {
            return Some(found);
        }
    }
    None
}

fn env_base() -> Option<PathBuf> {
    env::var("SURE_BASE")
        .ok()
        .or_else(|| env::var("KIND_BASE").ok())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
}

fn walk_base(start: &Path) -> Option<PathBuf> {
    let mut dir = abs(start);
    loop {
        if is_base_dir(&dir) {
            return Some(dir);
        }
        let nested = dir.join("base");
        if is_base_dir(&nested) {
            return Some(nested);
        }
        if !dir.pop() {
            return None;
        }
    }
}

pub fn find_manifest(start: &Path) -> Option<PathBuf> {
    let mut dir = abs(start);
    loop {
        let sure = dir.join("sure.json");
        if sure.is_file() {
            return Some(sure);
        }
        let kind = dir.join("kind.json");
        if kind.is_file() {
            return Some(kind);
        }
        if !dir.pop() {
            return None;
        }
    }
}

/// Empty/junk JSON is data: fall back to `src` when that directory exists.
pub fn source_dirs_of(project_root: &Path) -> Vec<PathBuf> {
    let rels = match find_manifest(project_root).and_then(|p| fs::read_to_string(p).ok()) {
        Some(text) => decode_source_dirs(&text),
        None => vec!["src".into()],
    };
    rels.into_iter()
        .map(|d| project_root.join(d))
        .filter(|p| p.is_dir())
        .collect()
}

fn decode_source_dirs(text: &str) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() || !trimmed.starts_with('{') {
        return vec!["src".into()];
    }
    if let Some(dirs) = json_string_array_field(trimmed, "source-directories") {
        if !dirs.is_empty() {
            return dirs;
        }
    }
    let src = json_string_field(trimmed, "src").unwrap_or_else(|| "src".into());
    vec![src]
}

fn json_string_array_field(text: &str, key: &str) -> Option<Vec<String>> {
    let rest = json_field_after(text, key)?;
    parse_json_string_array(rest)
}

fn json_string_field(text: &str, key: &str) -> Option<String> {
    let rest = json_field_after(text, key)?;
    parse_json_string(rest).map(|(s, _)| s)
}

fn json_field_after<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\"{key}\"");
    let mut from = 0;
    while let Some(pos) = text[from..].find(&needle) {
        let abs = from + pos + needle.len();
        let rest = text[abs..].trim_start();
        if let Some(rest) = rest.strip_prefix(':') {
            return Some(rest.trim_start());
        }
        from = abs;
    }
    None
}

fn parse_json_string_array(text: &str) -> Option<Vec<String>> {
    let rest = text.strip_prefix('[')?.trim_start();
    let mut rest = rest;
    let mut out = Vec::new();
    loop {
        rest = rest.trim_start();
        if rest.starts_with(']') {
            return Some(out);
        }
        if rest.starts_with(',') {
            rest = rest[1..].trim_start();
            continue;
        }
        let (s, next) = parse_json_string(rest)?;
        out.push(s);
        rest = next.trim_start();
        if rest.starts_with(',') {
            rest = rest[1..].trim_start();
        } else if rest.starts_with(']') {
            return Some(out);
        } else {
            return None;
        }
    }
}

fn parse_json_string(text: &str) -> Option<(String, &str)> {
    let rest = text.strip_prefix('"')?;
    let mut out = String::new();
    let mut chars = rest.char_indices();
    while let Some((i, c)) = chars.next() {
        match c {
            '"' => return Some((out, &rest[i + 1..])),
            '\\' => match chars.next() {
                Some((_, 'n')) => out.push('\n'),
                Some((_, 't')) => out.push('\t'),
                Some((_, 'r')) => out.push('\r'),
                Some((_, '"')) => out.push('"'),
                Some((_, '\\')) => out.push('\\'),
                Some((_, c)) => out.push(c),
                None => return None,
            },
            c => out.push(c),
        }
    }
    None
}

/// Extra roots: `SURE_PATH` first, then `KIND_PATH`.
pub fn path_env() -> String {
    let a = env::var("SURE_PATH").unwrap_or_default();
    let b = env::var("KIND_PATH").unwrap_or_default();
    join_path_env(&a, &b)
}

pub fn join_path_env(a: &str, b: &str) -> String {
    if a.is_empty() {
        b.to_string()
    } else if b.is_empty() {
        a.to_string()
    } else {
        format!("{a}:{b}")
    }
}

pub fn split_path_env(paths: &str) -> Vec<PathBuf> {
    paths
        .split(':')
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .collect()
}

fn abs(p: &Path) -> PathBuf {
    fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_env_join_matches_sure() {
        assert_eq!(join_path_env("/tmp/src", ""), "/tmp/src");
        assert_eq!(join_path_env("", "/old"), "/old");
        assert_eq!(join_path_env("/tmp/src", "/old"), "/tmp/src:/old");
    }

    #[test]
    fn junk_manifest_is_data() {
        assert_eq!(decode_source_dirs(""), vec!["src"]);
        assert_eq!(decode_source_dirs("[]"), vec!["src"]);
        assert_eq!(decode_source_dirs("{"), vec!["src"]);
        let hello = r#"{"source-directories": ["src"], "theorems": ["Hello.Spec"]}"#;
        assert_eq!(decode_source_dirs(hello), vec!["src"]);
    }

    #[test]
    fn hello_workspace_uses_src_and_base() {
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let base = repo.join("base");
        let project = repo.join("examples/hello");
        let ws = Workspace::open(&base, &project);
        assert!(is_base_dir(&ws.base));
        assert!(ws
            .source_dirs
            .iter()
            .any(|d| d.ends_with("examples/hello/src") || d.ends_with("hello/src")));
        let roots = ws.search_roots();
        assert_eq!(roots.last().map(|p| abs(p)), Some(abs(&base)));
    }
}
