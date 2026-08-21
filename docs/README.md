# Sure documentation

**Sure** is a revived dependent-language research prototype with a JavaScript runtime. You write `.sure`. Completed equality proofs are checked by the type checker. Then you emit JavaScript and run it on Node or Bun. It is not production-ready and not a consistency kernel.

```
Spec.add2: Nat.add(2, 2) == 4
  refl
```

If that term type-checks **with a completed body** (`refl`, not `_` or `admit`), `Nat.add(2, 2)` *is* `4`. Residual holes fail prove/build. `sure prove Nat.add` checks the function and reports it unproved.

| | |
|---|---|
| Version | Sure 0.1.0 |
| Lineage | Legacy Kind 1.0.121 |
| Sources | `*.sure` modules — many terms per file; `Foo.bar` → `Foo.sure` then `Foo/bar.sure` |
| Host | JavaScript (Node 18+ or Bun) |
| Checker | `Sure.Term`, `Sure.Parser`, `Sure.api` |

The language is Sure. Lineage is Legacy Kind 1.0.121.

## Book

1. [Start](start.md) — install, hello world, first project
2. [Examples](examples.md) — one Sure package per folder (`examples/`)
3. [Language](language.md) — modules, types, functions, `case`, `IO`, holes
4. [Prove](prove.md) — `Equal`, `refl`, induction, `sure prove`
5. [Standard library](stdlib.md) — `Outcome`, files, env, JSON, HTTP, Db, time, tasks
6. [Web](web.md) — HTML pages, Elm-like UI, SSR, Todo, Sheet, Tweeter
7. [Projects](projects.md) — `sure.json`, packages, emit, FFI, LSP
8. [CLI](cli.md) — every command
9. [Style](style.md) — how Sure is written

## Roadmap

- [ReScript and performance plan](rescript-performance-plan.md) — staged compiler/framework optimization and incremental tooling migration

## Also in the tree

| File | What it is |
|---|---|
| [SYNTAX.md](../SYNTAX.md) | Every desugaring, including the rare ones |
| [THEOREMS.md](../THEOREMS.md) | Long proving tutorial (`mirror`, `apply`, `rewrite`) |
| [FOUNDATIONS.md](../FOUNDATIONS.md) | Type:Type, what a proof means |
| [INSTALL.md](../INSTALL.md) | Node install, `SURE_BASE`, checks |
| `sure help <topic>` | Short help for `prove`, `json`, `html`, `ssr`, `ui`, … |
| `sure doc <Term>` | Comment + type of one name |

## One screen

```bash
cd Kind-Legacy
npm install --omit=dev --prefix bin/js
./bin/sure --version
./bin/sure new /tmp/hello
cd /tmp/hello
SURE_BASE=/path/to/Kind-Legacy/base /path/to/Kind-Legacy/bin/sure prove
SURE_BASE=/path/to/Kind-Legacy/base /path/to/Kind-Legacy/bin/sure build
SURE_BASE=/path/to/Kind-Legacy/base /path/to/Kind-Legacy/bin/sure run
```

Inside this repository you can skip `SURE_BASE`. The checker finds `base/` from the working directory.
