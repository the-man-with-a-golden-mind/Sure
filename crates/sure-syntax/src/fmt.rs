//! Source formatter: keep `module`/`import` lines; body indent two spaces.
//!
//! Port of `compiler.js` `parse_document` / `format_source`. Does **not**
//! pretty-print via `Term.show`.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BlockKind {
    Blank,
    Comment,
    Module,
    Import,
    Type,
    Def,
    Text,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Block {
    kind: BlockKind,
    text: String,
}

struct Document {
    blocks: Vec<Block>,
}

/// Split `src` into top-level blocks (`compiler.js` `parse_document`).
fn parse_document(src: &str) -> Document {
    let lines: Vec<&str> = src.split('\n').collect();
    let mut blocks = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        if line.trim().is_empty() {
            blocks.push(Block {
                kind: BlockKind::Blank,
                text: String::new(),
            });
            i += 1;
            continue;
        }
        if is_comment_line(line) {
            let start = i;
            i += 1;
            while i < lines.len() && is_comment_line(lines[i]) {
                i += 1;
            }
            blocks.push(Block {
                kind: BlockKind::Comment,
                text: lines[start..i].join("\n"),
            });
            continue;
        }
        if is_module_line(line) {
            blocks.push(Block {
                kind: BlockKind::Module,
                text: line.trim_end().to_string(),
            });
            i += 1;
            continue;
        }
        if is_import_line(line) {
            blocks.push(Block {
                kind: BlockKind::Import,
                text: line.trim_end().to_string(),
            });
            i += 1;
            continue;
        }
        if let Some(kind) = def_or_type_kind(line) {
            let mut body = vec![line.trim_end().to_string()];
            i += 1;
            while i < lines.len() {
                let nx = lines[i];
                if nx.trim().is_empty() {
                    break;
                }
                if !starts_with_ws(nx) && is_block_boundary(nx) {
                    break;
                }
                body.push(nx.trim_end().to_string());
                i += 1;
            }
            blocks.push(Block {
                kind,
                text: body.join("\n"),
            });
            continue;
        }
        blocks.push(Block {
            kind: BlockKind::Text,
            text: line.trim_end().to_string(),
        });
        i += 1;
    }
    Document { blocks }
}

/// Keep module/import/comments; normalize def/type bodies to two-space indent.
pub fn format_source(src: &str) -> String {
    let doc = parse_document(src);
    let mut out = Vec::with_capacity(doc.blocks.len());
    for b in &doc.blocks {
        match b.kind {
            BlockKind::Blank => out.push(String::new()),
            BlockKind::Comment | BlockKind::Module | BlockKind::Import | BlockKind::Text => {
                out.push(b.text.clone());
            }
            BlockKind::Type | BlockKind::Def => format_code_block(&b.text, &mut out),
        }
    }
    let mut s = out.join("\n");
    if !s.is_empty() && !s.ends_with('\n') {
        s.push('\n');
    }
    s
}

fn format_code_block(text: &str, out: &mut Vec<String>) {
    let mut parts = text.split('\n');
    let Some(header) = parts.next() else {
        return;
    };
    out.push(header.to_string());
    let body: Vec<&str> = parts.collect();
    let min = body
        .iter()
        .filter(|line| !line.trim().is_empty())
        .map(|line| leading_ws_len(line))
        .min()
        .unwrap_or(0);
    for line in body {
        if line.trim().is_empty() {
            continue;
        }
        let stripped = line.get(min..).unwrap_or("");
        out.push(format!("  {stripped}"));
    }
}

fn def_or_type_kind(line: &str) -> Option<BlockKind> {
    if is_type_line(line) {
        Some(BlockKind::Type)
    } else if is_header(line) {
        Some(BlockKind::Def)
    } else {
        None
    }
}

fn is_block_boundary(line: &str) -> bool {
    is_header(line)
        || is_type_line(line)
        || is_module_line(line)
        || is_import_line(line)
        || is_comment_line(line)
}

fn is_comment_line(line: &str) -> bool {
    line.trim().starts_with("//")
}

fn starts_with_ws(s: &str) -> bool {
    s.starts_with(char::is_whitespace)
}

fn leading_ws_len(s: &str) -> usize {
    s.len() - s.trim_start().len()
}

/// `compiler.js` `is_header`: `name` / `name<…>` / `name(…)` then `:`.
fn is_header(line: &str) -> bool {
    let bytes = line.as_bytes();
    if bytes.first().is_some_and(u8::is_ascii_whitespace) {
        return false;
    }
    let mut i = 0;
    if i >= bytes.len() || !bytes[i].is_ascii_alphabetic() {
        return false;
    }
    i += 1;
    while i < bytes.len()
        && matches!(
            bytes[i],
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'.' | b'_'
        )
    {
        i += 1;
    }
    if i < bytes.len() && bytes[i] == b'<' {
        match bytes[i + 1..].iter().position(|&c| c == b'>') {
            Some(rel) => i += 1 + rel + 1,
            None => return false,
        }
    }
    if i < bytes.len() && bytes[i] == b'(' {
        match bytes[i + 1..].iter().position(|&c| c == b')') {
            Some(rel) => i += 1 + rel + 1,
            None => return false,
        }
    }
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    bytes.get(i) == Some(&b':')
}

/// `compiler.js` `is_type`: `^type\s+[A-Za-z]`.
fn is_type_line(line: &str) -> bool {
    let Some(rest) = line.strip_prefix("type") else {
        return false;
    };
    let mut chars = rest.chars();
    match chars.next() {
        Some(c) if c.is_whitespace() => {}
        _ => return false,
    }
    for c in chars {
        if c.is_whitespace() {
            continue;
        }
        return c.is_ascii_alphabetic();
    }
    false
}

fn mod_line(s: &str) -> &str {
    let t = s.trim();
    if let Some(rest) = t.strip_prefix("//") {
        rest.strip_prefix(' ').unwrap_or(rest).trim()
    } else {
        t
    }
}

fn mod_name_ok(s: &str) -> bool {
    if s.is_empty() || s.starts_with('.') || s.ends_with('.') || s.contains("..") || s.contains('/')
    {
        return false;
    }
    s.split('.').all(|p| {
        let b = p.as_bytes();
        !b.is_empty()
            && b[0].is_ascii_uppercase()
            && b.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
    })
}

fn is_module_line(line: &str) -> bool {
    let s = mod_line(line);
    let Some(rest) = s.strip_prefix("module ") else {
        return false;
    };
    let nam = rest.split(" exposing ").next().unwrap_or(rest).trim();
    mod_name_ok(nam)
}

fn is_import_line(line: &str) -> bool {
    let s = mod_line(line);
    let Some(rest) = s.strip_prefix("import ") else {
        return false;
    };
    let left = rest.split(" exposing ").next().unwrap_or(rest).trim();
    let nam = left.split(" as ").next().unwrap_or(left).trim();
    mod_name_ok(nam)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HELLO: &str = include_str!("../../../examples/hello/src/Hello.sure");
    const MAIN: &str = include_str!("../../../examples/hello/src/Main.sure");

    #[test]
    fn hello_sure_keeps_module_and_two_space_bodies() {
        let formatted = format_source(HELLO);
        assert!(
            formatted.contains("module Hello"),
            "formatted source lost module line: {formatted:?}"
        );
        // Surface syntax is kept (not Term.show): `==`, `refl`, `IO {`.
        assert!(formatted.contains("module Hello exposing (greet, Spec, demo)"));
        assert!(formatted.contains("greet: String\n  \"Sure\""));
        assert!(formatted.contains("Spec: greet == \"Sure\"\n  refl"));
        assert!(formatted.contains("demo: IO<Unit>\n  IO {\n    IO.print(greet)\n  }"));
        assert_eq!(formatted, HELLO);
    }

    #[test]
    fn nested_body_keeps_relative_indent() {
        let src = "demo: IO<Unit>\n  IO {\n    IO.print(greet)\n  }\n";
        let formatted = format_source(src);
        assert!(formatted.contains("    IO.print(greet)"));
        assert!(!formatted.contains("IO {\n  IO.print"));
        assert_eq!(formatted, src);
    }

    #[test]
    fn overindented_body_normalizes_to_two_spaces() {
        let formatted = format_source("greet: String\n    \"Sure\"\n");
        assert_eq!(formatted, "greet: String\n  \"Sure\"\n");
    }

    #[test]
    fn keeps_import_lines() {
        let formatted = format_source(MAIN);
        assert!(formatted.contains("module Main"));
        assert!(formatted.contains("import Hello exposing (demo)"));
        assert!(formatted.contains("Main: IO<Unit>\n  demo"));
        assert_eq!(formatted, MAIN);
    }
}
