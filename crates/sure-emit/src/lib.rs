//! JavaScript emit from FormCore (`FmcToJs` port).
//!
//! Host slice is generated in Rust (`emit_io_host`). Snippets from
//! `vendor/formcore-js/{host-abort,host-pack,ws-frames}.js` via `include_str!`.

#![forbid(unsafe_code)]

mod compile;
mod host;
mod prim;
mod schema;

pub use compile::{collect_host_need, compile_defs, emit_safe, js_name, EmitError, EmitOpts};
pub use host::emit_io_host;
pub use schema::{host_need_from_queries, query_group, HostNeed, HostOp, OPS};

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;
    use sure_fmc::parse_defs;

    const TINY_IO: &str = r#"
Unit : * =
  %Unit.Self(P: @(self: Unit) *)
  @(new: (P Unit.new))
  (P Unit.Self);

Unit.new : Unit = #P #new new;

String : * =
  %String.Self(P: @(self: String) *)
  @(nil: (P String.nil))
  (P String.Self);

String.nil : String = #P #nil nil;

IO : @(A: *) * = #A
  %IO.Self(P: @(self: (IO A)) *)
  @(end: @(value: A) (P ((IO.end A) value)))
  @(ask: @(query: String) @(param: String) @(then: @(response: String) (IO A)) (P ((((IO.ask A) query) param) then)))
  (P IO.Self);

IO.end : %(A: *) @(value: A) (IO A) =
  #A #value #P #end #ask (end value);

IO.ask : %(A: *) @(query: String) @(param: String) @(then: @(response: String) (IO A)) (IO A) =
  #A #query #param #then #P #end #ask (((ask query) param) then);

Main : (IO Unit) =
  ((((IO.ask Unit) "put_string") "Sure") #response ((IO.end Unit) Unit.new));
"#;

    #[test]
    fn version_is_workspace() {
        assert_eq!(version(), "0.2.0");
    }

    #[test]
    fn js_name_dots_and_bools() {
        assert_eq!(js_name("IO.ask"), "IO$ask");
        assert_eq!(js_name("true"), "$true");
        assert_eq!(js_name("false"), "$false");
        assert_eq!(js_name("Unit"), "Unit");
    }

    #[test]
    fn emit_safe_rejects_path_junk() {
        assert!(emit_safe("Main"));
        assert!(emit_safe("Hello.Spec"));
        assert!(!emit_safe(""));
        assert!(!emit_safe(".."));
        assert!(!emit_safe("foo/bar"));
        assert!(!emit_safe("foo\\bar"));
        assert!(!emit_safe("1Main"));
        assert!(!emit_safe("a..b"));
    }

    #[test]
    fn prim_tables_are_full() {
        assert_eq!(crate::prim::IS_PRIM.len(), 17);
        assert!(crate::prim::is_prim_name("String"));
        assert!(!crate::prim::is_prim_name("IO"));
        assert!(crate::prim::PRIM_FUNCS.len() >= 300);
        assert!(crate::prim::prim_func("String.concat").is_some());
        assert!(crate::prim::prim_func("Nat.add").is_some());
        assert_eq!(
            crate::prim::prim_func("String.concat").unwrap().template,
            "{0}+{1}"
        );
        assert_eq!(crate::prim::PRIM_TYPES.len(), 17);
        assert!(crate::prim::prim_type("Unit").is_some());
        assert!(crate::prim::prim_type("String").is_some());
        // FmcToJs `a+"-"+b` concatenates source, emitting subtraction.
        assert_eq!(
            crate::prim::prim_func("Int.new").unwrap().template,
            "{0}-{1}"
        );
        assert_eq!(
            crate::prim::fill_template("{0}-{1}", 2, &["pos".into(), "neg".into()]),
            "(pos-neg)"
        );
        // Template literals `/^\\d+$/` emit a digit class, not `\\d`.
        let nat_read = crate::prim::prim_func("Nat.read").unwrap().template;
        let int_read = crate::prim::prim_func("Int.read").unwrap().template;
        assert!(nat_read.contains(r"/^\d+$/"), "{nat_read}");
        assert!(int_read.contains(r"/^-?\d+$/"), "{int_read}");
        assert!(!nat_read.contains(r"\\d"), "{nat_read}");
        assert!(!int_read.contains(r"\\d"), "{int_read}");
        // JS source had `${c}` (unbound); 1-ary prim must substitute the arg.
        assert_eq!(
            crate::prim::prim_func("U32.sqrt").unwrap().template,
            "Math.sqrt({0})>>>0"
        );
        assert_eq!(
            crate::prim::fill_template("Math.sqrt({0})>>>0", 1, &["x".into()]),
            "(Math.sqrt(x)>>>0)"
        );
    }

    #[test]
    fn empty_query_expands_full_host() {
        let all = host_need_from_queries(&[""], false);
        assert!(all.server && all.http && all.file);
        let src = r#"
Main : * = ((IO.ask *) "");
IO.ask : * = *;
"#;
        let defs = parse_defs(src).expect("parse");
        let h = collect_host_need(&defs, &["Main".to_string()]);
        assert!(h.server && h.http && h.file);

        let defs = parse_defs(&TINY_IO.replace("\"put_string\"", "\"\"")).expect("parse empty q");
        let js = compile_defs(&defs, "Main", &EmitOpts::default()).expect("compile empty q");
        assert!(
            js.contains("http_listen"),
            "empty IO.ask query must expand the full host"
        );
    }

    #[test]
    fn f64_make_mag_zero_matches_js_slice() {
        // JS `slice(0, -0)+"."+slice(-0)` is `"" + "." + "123"` → `.123`.
        assert_eq!(crate::compile::f64_make_literal(false, 123, 0), ".123");
        assert_eq!(crate::compile::f64_make_literal(true, 123, 0), "-.123");
        assert_eq!(crate::compile::f64_make_literal(false, 123, 2), "1.23");
        assert_eq!(crate::compile::f64_make_literal(false, 5, 3), "0.005");
        assert_eq!(crate::compile::f64_make_literal(true, 5, 1), "-0.5");
    }

    #[test]
    fn schema_ops_cover_put_string_and_http_listen() {
        assert!(OPS
            .iter()
            .any(|o| o.query == "put_string" && o.group == "core"));
        assert!(OPS
            .iter()
            .any(|o| o.query == "http_listen" && o.group == "server"));
        assert_eq!(query_group("put_string"), Some("core"));
        assert_eq!(query_group("http_listen"), Some("server"));
        assert_eq!(query_group("print"), Some("core"));
    }

    #[test]
    fn emit_io_host_core_has_put_string_not_http_listen() {
        let js = emit_io_host(&HostNeed::core_only());
        assert!(
            js.contains("put_string"),
            "core host must include put_string"
        );
        assert!(
            !js.contains("http_listen"),
            "core-only host must not include http_listen"
        );
        assert!(js.contains("host_ok"), "tagged 0\\n helper");
        assert!(js.contains("host_err"), "tagged 1\\n helper");
        assert!(js.contains("'0\\n'"));
        assert!(js.contains("'1\\n'"));
        assert!(!js.contains("shell: true") || js.contains("proc_unsafe_shell"));
    }

    #[test]
    fn emit_io_host_proc_uses_shell_false() {
        let mut n = HostNeed::core_only();
        n.proc = true;
        let js = emit_io_host(&n);
        assert!(
            js.contains("shell: false"),
            "Proc.exec/run stay argv shell:false"
        );
        assert!(
            js.contains("proc_unsafe_shell"),
            "unsafe shell remains the hatch"
        );
    }

    #[test]
    fn collect_host_need_str_put_string_not_http() {
        let defs = parse_defs(TINY_IO).expect("parse tiny io");
        let nams = vec!["Main".to_string(), "IO.ask".to_string()];
        let h = collect_host_need(&defs, &nams);
        assert!(h.core);
        assert!(
            !h.server,
            "static put_string must not pull server/http_listen"
        );
        assert!(!h.http);
        assert!(!h.file);
    }

    #[test]
    fn collect_host_need_dynamic_query_is_all() {
        let src = r#"
Main : * = ((IO.ask *) Foo);
IO.ask : * = *;
Foo : * = *;
"#;
        let defs = parse_defs(src).expect("parse");
        let h = collect_host_need(&defs, &["Main".to_string()]);
        assert!(h.server && h.http && h.file);
    }

    #[test]
    fn compile_tiny_io_put_string_not_http_listen() {
        let defs = parse_defs(TINY_IO).expect("parse tiny io");
        let js = compile_defs(&defs, "Main", &EmitOpts::default()).expect("compile_defs");
        assert!(
            js.contains("put_string"),
            "emitted JS must contain put_string:\n{js}"
        );
        assert!(
            !js.contains("http_listen"),
            "emitted JS must not contain http_listen"
        );
        assert!(js.contains("host_ok"));
        assert!(js.contains("'$main$': ()=>run("));
        assert!(js.contains("module.exports['$main$']();"));

        if std::process::Command::new("node")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            let dir = std::env::temp_dir();
            let path = dir.join("sure-emit-tiny-io.js");
            std::fs::write(&path, &js).expect("write js");
            let out = std::process::Command::new("node")
                .arg(&path)
                .output()
                .expect("run node");
            let stdout = String::from_utf8_lossy(&out.stdout);
            assert!(
                out.status.success(),
                "node failed: {}\n{}",
                String::from_utf8_lossy(&out.stderr),
                stdout
            );
            assert_eq!(stdout, "Sure");
        }
    }

    #[test]
    fn compile_non_io_does_not_emit_host() {
        let src = r#"
id : @(A: *) @(x: A) A = #A #x x;
Main : @(x: *) * = (id *);
"#;
        let defs = parse_defs(src).expect("parse");
        let js = compile_defs(&defs, "Main", &EmitOpts::default()).expect("compile");
        assert!(!js.contains("put_string"));
        assert!(!js.contains("run_io"));
        assert!(js.contains("var MAIN=module.exports['Main']"));
    }
}
