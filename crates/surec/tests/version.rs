use std::process::Command;

#[test]
fn sure_version_prints_lineage() {
    let output = Command::new(env!("CARGO_BIN_EXE_sure"))
        .arg("--version")
        .output()
        .expect("run sure --version");
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout),
        "Sure 0.2.0 (Legacy Kind 1.0.121)\n"
    );
}
