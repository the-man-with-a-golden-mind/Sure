# Foundations

User guide: [docs/](docs/README.md).

**This language is Sure**, a fork of Legacy Kind. The type theory lives in
`Sure.Term` / `Sure.Parser` / `Sure.api`. `.kind` was the old source suffix.

**Position:** Sure is a dependently typed *programming language* that
can prove things. It is not a consistency foundation.

## Type : Type

`Sure.Term.check` treats `Type` as having type `Type`:

```
typ: Sure.Check { return Sure.Term.typ }
```

There are no universe levels. Combined with general recursion this admits
logical paradoxes. That is intentional.

Sure inverts Agda's default: **expressivity is on**, consistency is a planned
opt-in (`CONTRIBUTE.md`, consistency checker / `✓ ⊤`). We will not silently
change this in Phases 0–3.

## What this means for proofs

A Sure theorem is a well-typed **completed** term at an equality (or `Equal`)
type. The type checker is the prover. `_` and `admit` are not proofs.
`Prove.all` is a `Unit` bundle that forces many lemmas to check; `sure prove`
does not treat `Unit` as a proved proposition.

A proof that type-checks is a proof *in Sure's type theory*, not a guarantee of
logical consistency in MLTT. Type:Type plus general recursion still admits
paradoxes. Residual holes used to inhabit any type, including false equalities;
the CLI now rejects them in check, prove, and build.

## Compile-time proving (people and AI)

Sure is a general-purpose language. Proofs are ordinary terms checked while
the program compiles — not a separate tool.

1. Write a term whose type is the claim, usually `got == want`.
2. `refl` works when both sides reduce to the same value. Otherwise write a
   real proof (`Equal.rewrite`, induction, `Prove.sym` / `trans` / `cong`).
3. Compilation (`sure prove`, `sure check`, `sure build`) type-checks those
   terms. A mismatch is a failed proof (`proof_obligation` in JSON).
4. People list theorems in `sure.json` and keep them in `src/Spec.sure`.
5. AI uses `sure.prove` (`sure agent --client prove <Term|code>`). The checker
   is the source of truth: propose → prove → repair.

`Example.Spec` and `Sure.Prove.all` are the language demos of this loop.

## Later (Phase 5, opt-in only)

- A termination / consistency sidecar
- An optional stricter proof fragment

Do not replace Self-Π, do not add universe levels by default, do not make
`Equal` primitive.
