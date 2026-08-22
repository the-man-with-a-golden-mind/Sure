//! Disk cache schema 2. Keys are `sha256(utf8 name)`. Empty/junk records miss.

use std::fs;
use std::path::{Path, PathBuf};

use sure_syntax::Def;

/// Distinct from JS `cache_store.js` `SCHEMA = 1`.
pub const SCHEMA: u32 = 2;
pub const COMPILER: &str = "surec-0.2.0";

/// One name record. Term blobs wait for Core.show; incomplete records miss.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Record {
    pub file: String,
    pub hash: String,
    pub blob: String,
    pub isct: bool,
    pub arit: u32,
}

#[derive(Clone, Debug)]
pub struct Cache {
    pub dir: PathBuf,
    pub enabled: bool,
    pub blob_key: String,
    /// `file_ok` roots: stdlib `base` and project `source-directories`.
    pub here: Vec<String>,
}

impl Cache {
    pub fn disabled() -> Self {
        Self {
            dir: PathBuf::from(".cache"),
            enabled: false,
            blob_key: COMPILER.to_string(),
            here: Vec::new(),
        }
    }

    pub fn new(dir: impl Into<PathBuf>, here: Vec<String>) -> Self {
        Self {
            dir: dir.into(),
            enabled: true,
            blob_key: blob_key(),
            here,
        }
    }

    /// `SURE_CACHE=0` skips get and put.
    pub fn from_env(dir: impl Into<PathBuf>, here: Vec<String>) -> Self {
        let enabled = env_cache_enabled();
        Self {
            dir: dir.into(),
            enabled,
            blob_key: blob_key(),
            here,
        }
    }

    pub fn get(&self, name: &str) -> Option<Record> {
        if !self.enabled || name.is_empty() {
            return None;
        }
        let dest = self.dir.join(cache_key(name));
        if !cache_inside(&self.dir, &dest) {
            return None;
        }
        let text = fs::read_to_string(&dest).ok()?;
        let rec = decode(&text)?;
        if rec.blob != self.blob_key {
            return None;
        }
        if !file_ok_in(&rec.file, self.here.iter().map(String::as_str)) {
            return None;
        }
        let path = self.resolve(&rec.file)?;
        let hash = file_hash(&path)?;
        if hash != rec.hash {
            return None;
        }
        Some(rec)
    }

    pub fn put(&self, name: &str, def: &Def) -> bool {
        if !self.enabled || name.is_empty() {
            return false;
        }
        if def.file.is_empty() || def.file == "<cached>" {
            return false;
        }
        if !file_ok_in(&def.file, self.here.iter().map(String::as_str)) {
            return false;
        }
        let Some(path) = self.resolve(&def.file) else {
            return false;
        };
        let hash = match file_hash(&path) {
            Some(h) if !h.is_empty() => h,
            _ => return false,
        };
        let rec = encode(&def.file, &hash, &self.blob_key, def.isct, def.arit, "", "");
        // Empty term/type payloads are incomplete: next `decode` misses.
        atomic_write(&self.dir, &cache_key(name), &rec)
    }

    /// Relative `files_of` names are joined with each root (project src first).
    fn resolve(&self, file: &str) -> Option<PathBuf> {
        if file.starts_with('/') {
            let p = PathBuf::from(file);
            return p.is_file().then_some(p);
        }
        for root in &self.here {
            if root.is_empty() {
                continue;
            }
            let p = Path::new(root).join(file);
            if p.is_file() {
                return Some(p);
            }
        }
        None
    }
}

pub fn env_cache_enabled() -> bool {
    match std::env::var("SURE_CACHE") {
        Ok(v) => v != "0",
        Err(_) => true,
    }
}

fn blob_key() -> String {
    std::env::var("SURE_CACHE_KEY").unwrap_or_else(|_| COMPILER.to_string())
}

/// `sha256(utf8 name)` hex, 64 chars.
pub fn cache_key(name: &str) -> String {
    hex(&sha256(name.as_bytes()))
}

pub fn file_hash(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(hex(&sha256(&bytes)))
}

/// Relative `files_of` names stay in the tree. Absolute paths must sit under `here`.
pub fn file_ok(file: &str, here: &str) -> bool {
    file_ok_in(file, std::iter::once(here))
}

/// Like `file_ok`, but absolute paths may sit under **any** root (stdlib
/// `base` or project `source-directories`).
pub fn file_ok_in<'a, I>(file: &str, heres: I) -> bool
where
    I: IntoIterator<Item = &'a str>,
{
    if file.is_empty() || file.contains("/../") || file.starts_with("../") {
        false
    } else if file.starts_with('/') {
        heres
            .into_iter()
            .any(|here| !here.is_empty() && (file == here || file.starts_with(&format!("{here}/"))))
    } else {
        true
    }
}

/// Port of `sureCacheInside`: dest must resolve under `root`.
pub fn cache_inside(root: &Path, target: &Path) -> bool {
    let root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let target = if target.exists() {
        fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf())
    } else {
        match (
            target.parent().and_then(|p| fs::canonicalize(p).ok()),
            target.file_name(),
        ) {
            (Some(dir), Some(name)) => dir.join(name),
            _ => target.to_path_buf(),
        }
    };
    target == root || target.starts_with(&root)
}

/// Junk, empty, schema 1, and incomplete S2 records are none.
pub fn decode(text: &str) -> Option<Record> {
    if text.is_empty() {
        return None;
    }
    let parts: Vec<&str> = text.split("\n.\n").collect();
    let hdr: Vec<&str> = field(&parts, 0).split('\n').collect();
    if field(&hdr, 0) != "S2" {
        return None;
    }
    let isct = match field(&hdr, 4) {
        "true" => true,
        "false" => false,
        _ => return None,
    };
    let arit = field(&hdr, 5).parse().unwrap_or(0);
    let term_s = field(&parts, 1);
    let type_s = field(&parts, 2);
    if term_s.is_empty() || type_s.is_empty() {
        return None;
    }
    Some(Record {
        file: field(&hdr, 1).to_string(),
        hash: field(&hdr, 2).to_string(),
        blob: field(&hdr, 3).to_string(),
        isct,
        arit,
    })
}

pub fn encode(
    file: &str,
    hash: &str,
    blob: &str,
    isct: bool,
    arit: u32,
    term: &str,
    typ: &str,
) -> String {
    let hdr = format!(
        "S2\n{file}\n{hash}\n{blob}\n{}\n{arit}",
        if isct { "true" } else { "false" }
    );
    [hdr.as_str(), term, typ].join("\n.\n")
}

fn field<'a>(xs: &[&'a str], i: usize) -> &'a str {
    xs.get(i).copied().unwrap_or("")
}

fn atomic_write(dir: &Path, dest_name: &str, body: &str) -> bool {
    let dest = dir.join(dest_name);
    if dest_name.is_empty()
        || dest_name.contains("..")
        || dest_name.contains('/')
        || dest_name.contains('\\')
    {
        return false;
    }
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    if !cache_inside(dir, &dest) {
        return false;
    }
    let tmp = dir.join(format!("{dest_name}.tmp-{}", std::process::id()));
    if fs::write(&tmp, body).is_err() {
        let _ = fs::remove_file(&tmp);
        return false;
    }
    match fs::rename(&tmp, &dest) {
        Ok(()) => true,
        Err(_) => {
            let _ = fs::remove_file(&tmp);
            false
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    const D: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(D[(b >> 4) as usize] as char);
        s.push(D[(b & 0xf) as usize] as char);
    }
    s
}

fn sha256(data: &[u8]) -> [u8; 32] {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let bit_len = (data.len() as u64).saturating_mul(8);
    let mut padded = Vec::with_capacity(data.len() + 72);
    padded.extend_from_slice(data);
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in padded.chunks_exact(64) {
        sha256_block(&mut h, chunk);
    }
    let mut out = [0u8; 32];
    for (i, v) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&v.to_be_bytes());
    }
    out
}

fn sha256_block(h: &mut [u32; 8], chunk: &[u8]) {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut w = [0u32; 64];
    for i in 0..16 {
        let mut b = [0u8; 4];
        b.copy_from_slice(&chunk[i * 4..i * 4 + 4]);
        w[i] = u32::from_be_bytes(b);
    }
    for i in 16..64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16]
            .wrapping_add(s0)
            .wrapping_add(w[i - 7])
            .wrapping_add(s1);
    }
    let mut a = h[0];
    let mut b = h[1];
    let mut c = h[2];
    let mut d = h[3];
    let mut e = h[4];
    let mut f = h[5];
    let mut g = h[6];
    let mut hh = h[7];
    for i in 0..64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ ((!e) & g);
        let t1 = hh
            .wrapping_add(s1)
            .wrapping_add(ch)
            .wrapping_add(K[i])
            .wrapping_add(w[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let t2 = s0.wrapping_add(maj);
        hh = g;
        g = f;
        f = e;
        e = d.wrapping_add(t1);
        d = c;
        c = b;
        b = a;
        a = t1.wrapping_add(t2);
    }
    h[0] = h[0].wrapping_add(a);
    h[1] = h[1].wrapping_add(b);
    h[2] = h[2].wrapping_add(c);
    h[3] = h[3].wrapping_add(d);
    h[4] = h[4].wrapping_add(e);
    h[5] = h[5].wrapping_add(f);
    h[6] = h[6].wrapping_add(g);
    h[7] = h[7].wrapping_add(hh);
}

#[cfg(test)]
mod tests {
    use super::*;
    use sure_syntax::{Name, Span, Status, Term};

    #[test]
    fn sha256_empty_and_name_key() {
        assert_eq!(
            hex(&sha256(b"")),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        let key = cache_key("Hello.Spec");
        assert_eq!(key.len(), 64);
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(key, cache_key("Hello.greet"));
    }

    #[test]
    fn decode_empty_junk_and_schema1_miss() {
        assert_eq!(decode(""), None);
        assert_eq!(decode("nope"), None);
        assert_eq!(decode("S1\nNat.sure\nh\nb\nfalse\n0\n.\nTyp\n.\nTyp"), None);
    }

    #[test]
    fn decode_incomplete_s2_misses() {
        let rec = encode("Nat.sure", "h", "blob", false, 0, "", "");
        assert_eq!(decode(&rec), None);
    }

    #[test]
    fn decode_s2_with_payloads() {
        let rec = encode("Nat.sure", "h", "blob", false, 2, "Typ", "Typ");
        let got = decode(&rec).unwrap();
        assert_eq!(got.file, "Nat.sure");
        assert_eq!(got.hash, "h");
        assert_eq!(got.blob, "blob");
        assert!(!got.isct);
        assert_eq!(got.arit, 2);
    }

    #[test]
    fn file_ok_matches_sure_theorems() {
        assert!(!file_ok("", "/repo"));
        assert!(!file_ok("../Nat.sure", "/repo"));
        assert!(!file_ok("/other/Nat.sure", "/repo"));
        assert!(file_ok("Nat.sure", "/repo"));
        assert!(file_ok("/repo/Nat.sure", "/repo"));
        assert!(!file_ok("foo/../Nat.sure", "/repo"));
    }

    #[test]
    fn file_ok_accepts_project_src_and_stdlib_base() {
        let heres = ["/repo/base", "/proj/src"];
        assert!(file_ok_in("Hello.sure", heres));
        assert!(file_ok_in("/proj/src/Hello.sure", heres));
        assert!(file_ok_in("/repo/base/Nat/add.sure", heres));
        assert!(!file_ok_in("/other/Hello.sure", heres));
        assert!(!file_ok_in("../Hello.sure", heres));
    }

    #[test]
    fn cache_zero_skips_get_and_put() {
        let dir = std::env::temp_dir().join(format!("sure-cache-skip-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let cache = Cache {
            dir: dir.clone(),
            enabled: false,
            blob_key: COMPILER.into(),
            here: vec!["/repo".into()],
        };
        let def = Def {
            file: dir.join("X.sure").to_string_lossy().into(),
            code: String::new(),
            orig: Span::new(0, 0),
            name: Name::from("X"),
            term: Term::Typ,
            typ: Term::Typ,
            isct: false,
            arit: 0,
            stat: Status::Done { cached: false },
        };
        assert!(!cache.put("X", &def));
        assert_eq!(cache.get("X"), None);
        let _ = fs::remove_dir_all(&dir);
    }
}
