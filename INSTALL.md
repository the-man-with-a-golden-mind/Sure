# Install Sure

**Sure** is a fork of Legacy Kind. The checker is `Sure.Term` / `Sure.api`.

The user guide is [docs/](docs/README.md). This page is the install recipe.

`./bin/sure` is the CLI. `./bin/kind` is the same program.

JavaScript/Node is the application runtime. There is no Chez / Scheme host.

## JavaScript (primary)

Requires **Bun** (or Node 18+). `bin/sure` runs with Bun when `bun` is on `PATH`.

The installable package is **`sure-lang`**: CLI, checker, `base/` stdlib, and FormCore in one tree.

```bash
# from this clone (Bun's `bun add -g .` is not this package: -g changes
# directory, so `.` becomes an unnamed `@` package and loops)
./bin/install-global
# same as: bun add -g sure-lang@file:"$PWD"

# or from GitHub (no clone). If bun reports a dependency loop, remove first:
# bun remove -g sure-lang
bun add -g github:the-man-with-a-golden-mind/Sure

sure --version
sure Main --run
```

npm is the same layout: `npm install -g .` (Node 18+). Force Node: `SURE_RUNTIME=node` or `sure --node`.

From the repository without a global install:

```bash
bun install --omit=dev --cwd bin/js
chmod +x bin/sure bin/kind
./bin/sure --version
./bin/sure Nat.add
./bin/sure Main --run
```

Or, equivalently:

```bash
node --stack-size=10000 bin/js/src/main.js Nat.add
```

`formcore-js` 0.1.95 is **vendored** at `vendor/formcore-js`. The type checker
does **not** fetch missing files from GitHub unless you set `SURE_FETCH_BASE=1`
(or the alias `KIND_FETCH_BASE=1`).

If you are not inside the repo, point at the standard library:

```bash
export SURE_BASE=/path/to/Kind-Legacy/base
# KIND_BASE still works
```

## Checks that do not load App/ or User/

```bash
./bin/sure --lib    # bounded prelude checks (not Prove.all)
./bin/sure --test   # bounded theorems, checks, Main, Test.main, prove-edges
```

`Prove.all` and `Test.full` are unbounded and are not CI. CI runs `sure test` and `sure Test.main --run` (`Test.ci.suite` then `Test.host`). Locally: `sure Prove.all` and `sure Test.full --run` (optional `SURE_TEST_GROUP`).

`sure App/` and `sure User/` still work when you ask for them.

## Phase 2 platform libraries

Typed host APIs (errors are `Outcome<E,A>`, not empty strings):

```
Path.from_string("foo.txt")          // rejects "", NUL, ".."
File.read / File.write / File.delete
File.bracket / File.with_temp
Proc.cwd / Proc.env / Proc.argv
Sure.Env.get / set / del / has / keys   // empty names are not names; empty values are values
Sure.Cfg.read / load / pick             // whitespace is {}; leftover is junk; cli wins; objects merge deep
Sure.Ssr.ok / get / run                 // HTML pages; Reply.sse for EventSource
Sure.Ui.sandbox / element               // Elm-like; Cmd/Sub; empty URL and every(0) are none
Db.Dsl.read / run                       // COUNT PREFIX ROW; empty is none
Db.Mig.up / down                        // empty name is not a step; re-run is 0
Http.get(url) / Http.post(url, body) // status + body
Host.unsafe.ask(query, param)        // escape hatch
```

`Proc.exec` and `Http.Server.listen` run on the JavaScript host.

## Phase 3

```bash
./bin/sure new hello
cd hello && ../bin/sure run          # needs SURE_BASE if not inside the repo
./bin/sure add ../some-lib
```

`SURE_PATH` (alias `KIND_PATH`) is a `:`-separated list of extra directories of `.sure` files (project `src/`, `sure add` deps). New projects write `sure.json` / `sure.lock`; `kind.json` is still read.

Compile-time proofs:

```bash
./bin/sure prove                  # sure.json theorems / language surface
./bin/sure prove Example.Spec
./bin/sure prove --json Spec.add2
./bin/sure agent --client prove Example.Spec.add2
```

A well-typed **completed** `a == b` term is a proof the program computes that way. `_` and `admit` are not proofs. `sure prove` reports `"proved": true` only when every requested theorem is a completed proposition. `sure install` checks out `sure.lock` revisions; it does not clone latest HEAD.

`Task.par_sleep` / `Task.race_sleep` overlap on Node. WebSocket is a typed API; the JS host does the RFC 6455 handshake and masked frames over TCP/TLS without a `ws` package. `Worker.run` uses Node `worker_threads` or a Bun `Worker`; values are JSON. `Db.connect("suremem:app")` is an in-process map; `surefile:app.json` persists JSON. There is no Postgres stub. Generated HTML inlines CSS (no Tailwind/DaisyUI CDN).

## Versions

The language version is **Sure 0.1.0** (`base/Sure.sure`, `bin/js/package.json`).
The lineage string remains **Legacy Kind 1.0.121** (`Sure.lineage`).
