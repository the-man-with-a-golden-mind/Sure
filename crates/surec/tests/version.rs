use std::process::Command;

fn sure() -> Command {
    Command::new(env!("CARGO_BIN_EXE_sure"))
}

#[test]
fn sure_version_prints_lineage() {
    let output = sure()
        .arg("--version")
        .output()
        .expect("run sure --version");
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout),
        "Sure 0.2.0 (Legacy Kind 1.0.121)\n"
    );
}

#[test]
fn help_start_mentions_prove() {
    let output = sure().arg("help").output().expect("sure help");
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("# Sure 0.2.0"));
    assert!(stdout.contains("sure prove"));
}

#[test]
fn unknown_help_topic_exits_2() {
    let status = sure()
        .arg("help")
        .arg("not-a-topic")
        .status()
        .expect("sure help topic");
    assert_eq!(status.code(), Some(2));
}

#[test]
fn unsupported_command_exits_2() {
    let status = sure().arg("lsp").status().expect("sure lsp");
    assert_eq!(status.code(), Some(2));
}

#[test]
fn term_run_exits_2() {
    let status = sure()
        .args(["Main", "--run"])
        .status()
        .expect("sure Main --run");
    assert_eq!(status.code(), Some(2));
}

#[test]
fn html_exits_2() {
    let status = sure()
        .args(["build", "--html"])
        .status()
        .expect("sure build --html");
    assert_eq!(status.code(), Some(2));
}

#[test]
fn fmt_hello_keeps_module() {
    let hello = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../examples/hello/src/Hello.sure"
    );
    let output = sure().args(["fmt", hello]).output().expect("sure fmt");
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("module Hello"));
}
