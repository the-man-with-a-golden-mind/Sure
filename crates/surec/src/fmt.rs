//! `sure fmt`: `format_source`. Keeps `module`/`import` lines.

use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;

use sure_check::{files_of, Workspace};
use sure_syntax::format_source;

pub fn cmd_fmt(ws: Option<&Workspace>, target: Option<&str>) -> i32 {
    let Some(target) = target else {
        eprintln!("sure fmt <Term|file.sure>");
        return 1;
    };
    let path = if target.ends_with(".sure") {
        let p = PathBuf::from(target);
        if p.is_absolute() {
            p
        } else {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(p)
        }
    } else {
        match ws.and_then(|ws| file_of_name(ws, target)) {
            Some(p) => p,
            None => {
                eprintln!("sure fmt: no source file for {target}");
                return 1;
            }
        }
    };
    match fs::read_to_string(&path) {
        Ok(body) => {
            let formatted = format_source(&body);
            let _ = io::stdout().write_all(formatted.as_bytes());
            0
        }
        Err(_) => {
            eprintln!("no such file: {}", path.display());
            1
        }
    }
}

fn file_of_name(ws: &Workspace, name: &str) -> Option<PathBuf> {
    for file in files_of(name) {
        for root in ws.search_roots() {
            let p = root.join(&file);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use sure_syntax::format_source;

    #[test]
    fn hello_keeps_module() {
        let src = include_str!("../../../examples/hello/src/Hello.sure");
        let formatted = format_source(src);
        assert!(formatted.contains("module Hello"));
    }
}
