# Style

Sure is written like a small functional language that happens to prove things. Keep the core small. Prefer a library over a new primitive.

## Files

- A `.sure` file is a module. Put related functions, types, and lemmas in the same file.
- Names stay dotted: `Foo.bar` lives in `Foo.sure` unless you split it out.
- Split to `Foo/bar.sure` when the module is too large, not by default. The loader still finds the split.
- Indent with **2 spaces**.
- `snake_case` for functions. Constructors are short: `new`, `nil`, `cons`, `ok`, `err`.
- A `//` line above the term is the doc string (`sure doc`).
- No journal comments. Git is the history.

## Types

```
Nat.add(n: Nat, m: Nat): Nat
  case n {
    zero: m
    succ: Nat.succ(Nat.add(n.pred, m))
  }
```

No spaces inside `n: Nat`. Commas at the end of the line. Align constructors when it helps:

```
case dir {
  right: …
  up   : …
  left : …
  down : …
}
```

Single-constructor records use `new`. `open` them; do not `case` a one-ctor type unless you need the motive.

## Errors

- `Outcome<E, A>` for host and IO.
- `Maybe` for parse / lookup.
- Empty, junk, and missing are **values**. Do not turn junk into `0` or `false`.
- Empty names are not names. Empty values are values.
- Show errors with `Err.show`. Read them with `Err.read`. Unknown strings are `junk`, not a crash.

## Proofs

- A lemma is `Name: got == want` plus a real body (`refl`, `case … !`, rewrite).
- Cover empty, junk, and the border next to the happy path.
- Do not bundle dozens of `Equal` proofs into one `Unit` (the checker OOMs).
- If a function will not reduce, test it in `Test.suite`. Do not fake `refl`.
- Do not intercept `Nat.succ` / `Nat.pred` in the JS kernel.

## IO

- Go through `Host.perform` and the typed wrapper (`File`, `Env`, `Http`, …).
- `IO { get x = …; return … }`. Annotate `IO.end<T>(…)` when inference needs it.
- Sleep `0`, missing files, empty DNS, closed sockets — write the case.

## Web

- Tailwind + daisyUI only in shipped UI.
- Unknown messages leave the model.
- Empty URL is not a request. `every(0)` is `none`.

## What we will not do

- Do not add universe levels by default. Do not make `Equal` primitive.
- Do not add a Chez / Scheme host. JavaScript is the runtime.
- Do not edit `PROMPT.md`.
- Do not ship a partial API. If it is public, empty/junk/missing are defined.

## Where to look

| Need | Place |
|---|---|
| A function that already exists | `base/<Name>/…sure`, `sure doc Name` |
| How the checker works | `base/Sure/Term`, `Parser`, `Synth`, `api` |
| How JS is emitted | `vendor/formcore-js`, `bin/js/src/sure.js` |
| How Host talks to Node | `bin/js/src/sure.js` (`get_env`, `fs_*`, `http_*`) |
| Runtime tests | `base/Test/suite.sure` |
| Trusted proofs | `base/Prove/all.sure`, `base/Cover/all.sure` |
| Syntax you forgot | [SYNTAX.md](../SYNTAX.md) |
| A long equality proof | [THEOREMS.md](../THEOREMS.md) |
