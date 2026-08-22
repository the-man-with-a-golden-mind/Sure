//! Bounded prove-edges: `_` / `admit` / `refl` on `Nat.add(2,2)==5` must fail.

use std::process::Command;

fn sure() -> Command {
    Command::new(env!("CARGO_BIN_EXE_sure"))
}

fn prove(spec: &str) -> (i32, String) {
    let output = sure().arg("prove").arg(spec).output().expect("sure prove");
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    (output.status.code().unwrap_or(1), stdout)
}

#[test]
fn refl_on_two_plus_two_eq_four_proves() {
    let (code, out) = prove("Edge.add2: Nat.add(2, 2) == 4\n  refl");
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("proved  Edge.add2"), "{out}");
}

#[test]
fn refl_on_two_plus_two_eq_five_fails() {
    let (code, out) = prove("Edge.lie2: Nat.add(2, 2) == 5\n  refl");
    assert_ne!(code, 0, "false equality must not prove:\n{out}");
    assert!(out.contains("unproved"), "{out}");
}

#[test]
fn hole_does_not_prove_false() {
    let (code, out) = prove("Edge.hole: Nat.add(2, 2) == 5\n  _");
    assert_ne!(code, 0, "{out}");
}

#[test]
fn admit_is_not_a_proof() {
    let (code, out) = prove("Edge.admit: Nat.add(2, 2) == 5\n  admit");
    assert_ne!(code, 0, "{out}");
}

#[test]
fn nat_add_checks_not_proved() {
    let (code, out) = prove("Nat.add");
    assert_ne!(code, 0, "Nat.add is not a theorem:\n{out}");
    assert!(out.contains("checked"), "{out}");
}
