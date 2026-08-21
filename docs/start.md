# Start

Sure is one language for programs and proofs. A function is a term. A theorem is a term whose type is the claim. The same checker accepts both.

## Install

Requires **Bun** (or Node 18+). The CLI uses Bun when `bun` is on `PATH`. Node: `SURE_RUNTIME=node` or `--node`.

```bash
bun add -g github:the-man-with-a-golden-mind/Sure
sure --version
sure Main --run
```

From a clone of this repository: `bun add -g .`

From the repository without a global install:

```bash
cd Kind-Legacy
bun install --omit=dev --cwd bin/js
chmod +x bin/sure bin/kind
./bin/sure --version
```

`./bin/kind` is the same binary. Old scripts keep working.

If you are not inside the repo:

```bash
export SURE_BASE=/path/to/Kind-Legacy/base
```

`KIND_BASE` still works. The checker does **not** fetch missing files from GitHub unless you set `SURE_FETCH_BASE=1`.

`formcore-js` is vendored at `vendor/formcore-js`. That is the core calculus Sure compiles to before JavaScript.

## Hello

`base/Main.sure`:

```
Main: IO<Unit>
  IO {
    IO.print("Sure")
  }
```

Check it, then run it:

```bash
./bin/sure Main
./bin/sure Main --run
```

A name is not a path. `sure Main.sure` is an error. Choose the term (`Main`), not the file. One file may define many terms; `sure Add.two` still names the term.

## First project

```bash
./bin/sure new myapp
cd myapp
./bin/sure prove
./bin/sure build
./bin/sure run
```

`sure new` writes:

```
myapp/
  sure.json          # application, theorems, source-directories
  sure.lock
  package.json
  README.md
  src/
    Main.sure        # IO entry
    Spec.sure        # Spec.add2: Nat.add(2, 2) == 4
  dist/              # after sure build
```

`sure build` type-checks the program, proves the names in `sure.json` `"theorems"`, then writes `dist/Main.js`. An unproved equality is not emitted.

## What “proved” means

```
Spec.add2: Nat.add(2, 2) == 4
  refl
```

`==` is **propositional equality**, not a boolean. `refl` is the constructor of `Equal`. It checks when both sides reduce to the same value.

```bash
./bin/sure prove Spec.add2
./bin/sure prove Example.Spec
./bin/sure prove --json Spec.add2
```

A mismatch is a failed proof (`proof_obligation` in JSON). Compilation fails. There is no “warn and emit anyway.”

This is **not** a consistency foundation. Sure has `Type : Type` and general recursion. A well-typed theorem is a theorem *in Sure's type theory*. See [FOUNDATIONS.md](../FOUNDATIONS.md).

## Empty, junk, missing

Public APIs treat borders as data, not crashes:

| Input | Result |
|---|---|
| `Path.from_string("")` | `err empty` |
| `Path.from_string("../x")` | `err dotdot` |
| `File.read` of a missing file | `err missing` |
| `JSON.dec.nat` of `"12x"` | `none` |
| `Sure.Env.get("")` | `err` (empty names are not names) |
| `Sure.Env.get("UNSET")` | `err missing` |
| `Sure.Env.get` of a name set to `""` | `ok ""` (empty values are values) |

There is no `null` and no throw in Sure. Use `Maybe`, `Outcome<E, A>`, and typed errors.

## Examples

Each example is its own package under `examples/`:

```bash
cd examples/hello
sure prove
sure run
cd ../walk
sure run
```

Catalog: [Examples](examples.md).

## Next

- Write terms: [Language](language.md)
- Prove them: [Prove](prove.md)
- Use files, HTTP, JSON: [Standard library](stdlib.md)
- Full command list: [CLI](cli.md)
