# Sure

A revived dependent-language research prototype with a JavaScript application runtime. You write `.sure`. Completed equality proofs are checked by the type checker. Then you emit JavaScript (Node or Bun).

Sure is not production-ready and not a consistency kernel. `_` is not a proof. `sure prove` only treats completed equality/`Equal` terms as proved.

```
Main: IO<Unit>
  IO {
    IO.print("Sure")
  }
```

```
Spec.add2: Nat.add(2, 2) == 4
  refl
```

If `Spec.add2` type-checks **and the body is a completed term** (`refl`, not `_` or `admit`), `Nat.add(2, 2)` is `4`. Residual holes fail `sure prove` / `sure build`. Ordinary functions such as `Nat.add` check; they do not count as proved.

| | |
|---|---|
| Version | **0.1.0** |
| Lineage | Legacy Kind 1.0.121 |
| Sources | `*.sure` — the name is the path (`Nat.add` → `Nat/add.sure`) |
| Checker | `Sure.Term`, `Sure.Parser`, `Sure.api` |
| Host | JavaScript / Bun |
| CLI | `sure` (`kind` still works as the same binary) |

The language is Sure. Lineage is Legacy Kind 1.0.121.

## Documentation

**Start here: [docs/](docs/README.md)**

| Chapter | |
|---|---|
| [Start](docs/start.md) | Install, hello world, first project |
| [Language](docs/language.md) | Types, functions, `case`, `IO`, holes |
| [Prove](docs/prove.md) | `Equal`, `refl`, induction, `sure prove` |
| [Standard library](docs/stdlib.md) | Files, env, JSON, HTTP, Db, time |
| [Web](docs/web.md) | HTML, Elm-like UI, SSR, Todo, Sheet, Tweeter |
| [Projects](docs/projects.md) | `sure.json`, packages, emit, FFI, LSP |
| [CLI](docs/cli.md) | Every command |
| [Style](docs/style.md) | How Sure is written |

Reference still in the tree: [SYNTAX.md](SYNTAX.md), [THEOREMS.md](THEOREMS.md), [FOUNDATIONS.md](FOUNDATIONS.md), [INSTALL.md](INSTALL.md). `sure help <topic>` and `sure doc <Term>` from the CLI.

## Quick start

```bash
bun add -g github:the-man-with-a-golden-mind/Sure
sure --version
sure Main --run
sure new /tmp/hello
cd /tmp/hello && sure prove && sure run
```

From a clone: `./bin/install-global` (or `bun add -g sure-lang@file:"$PWD"` / `npm install -g .`). Do not use `bun add -g .` — Bun's `-g` changes directory, so `.` becomes an unnamed `@` package and loops. The package is `sure-lang`: CLI, `base/` stdlib, and FormCore.

Inside this repository the checker finds `base/` itself. Elsewhere:

```bash
export SURE_BASE=/path/to/Kind-Legacy/base
```

Requires Node 18+. Bun is optional (`sure --bun`).

## What you can do

```bash
sure prove                  # theorems in sure.json + src
sure build                  # prove, then dist/Main.js
sure build --html Html.Counter.client
sure test                   # prover + runtime + prove-edge (exit 1 on fail)
sure cover --fail           # textual public-API mention coverage, not branch coverage
sure doc Nat.add
sure help ui
```

Empty, junk, and missing are data: `Path.from_string("")` is `err`, `JSON.dec.nat("12x")` is `none`, an unset env name is `missing`, an empty env *value* is `ok ""`.

There is no `null` and no throw. Use `Maybe` and `Outcome<E, A>`.

## Layout

```
base/           standard library (modules; splits allowed)
bin/sure        CLI
bin/js/src      Node host and checker runtime
vendor/formcore-js
docs/           this book
editors/vscode  language server client
```

The host is JavaScript (Node or Bun). There is no Chez / Scheme runtime.
