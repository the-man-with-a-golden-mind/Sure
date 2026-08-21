# CLI

`sure` and `kind` are the same program. Version **Sure 0.1.0** (Legacy Kind 1.0.121).

```
sure --version
sure help
sure help prove | json | html | emit | ffi | gen | pkg | bun | worker
sure help db | debug | lsp | pipe | time | cli | log | repl | test | cover
sure help env | cfg | ssr | ui | web
```

## Commands

| Command | What it does |
|---|---|
| `sure new <name>` | Scaffold an application |
| `sure new --package ada/boxes` | Scaffold a package |
| `sure prove [Term…]` | Prove completed equality theorems only |
| `sure prove --json Term` | `proved` is true only if every result is a completed proof |
| `sure build [Term]` | Prove theorems, then write `dist/<Term>.js` (tree-shaken) |
| `sure build --html [Term]` | HTML page with inlined layout CSS |
| `sure emit [Term]` | Same as `build` |
| `sure run [Term]` | Emit `dist/<Term>.js` if needed, then spawn it |
| `sure --bun run [Term]` | Run emitted JS with Bun |
| `sure check <Term>` | Type-check one term (and project theorems) |
| `sure Term` | Type-check one term |
| `sure Term --run` | Compile that term and run it |
| `sure Term --js` | Print JavaScript |
| `sure Term --fmc` | Print FormCore |
| `sure doc <Term>` | Comment + type |
| `sure goal <Term>` | Remaining holes |
| `sure debug <Term>` | Type + holes + traces |
| `sure fill code\|\|\|term` | Replace `?implement` and recheck |
| `sure qc <Law>` | Sample a lemma |
| `sure gen <Term>` | Tests and proofs from the type |
| `sure impact <Name>` | Callers + proofs |
| `sure theorems [Name]` | Specs about a name |
| `sure deps <Name>` | Names this definition uses |
| `sure graph <Name>` | Dependency graph |
| `sure bench <Term>` | Time type-check |
| `sure Sure.Web.bench --run` | Time Html / Ui / Ssr / Sheet at runtime |
| `sure fmt <Term>` | Pretty-print |
| `sure test` / `sure --test` | Bounded theorems, checks, `Main --run`, `Test.main` (`Test.ci.suite` + `Test.host`), prove-edges. Not `Prove.all` or `Test.full`. |
| `sure cover` / `sure cover --fail` | Textual public-API mention coverage (need 90%; not branch coverage) |
| `sure repl` | `:help :quit :check :prove :type :goal :fill :debug :norm :run :docs` |
| `sure lsp` | Language server. Symbols, hover, definition, and rename walk `Sure.Defs.read` / `Sure.Term`. Binders still use `compiler.ident_bindings`. |
| `sure agent` | JSON-RPC compiler-as-tool |
| `sure add` / `remove` | Dependencies |
| `sure install` | Materialize `sure.lock` pins (git rev, not latest HEAD) |
| `sure expose <Module>` | Package public modules |
| `sure --lib` | Bounded checks (not `Prove.all`) |

A failing test or a false equality exits **1**. There is no silent success.

## Environment

| Variable | Meaning |
|---|---|
| `SURE_BASE` / `KIND_BASE` | Stdlib directory (`…/base`) |
| `SURE_PATH` / `KIND_PATH` | Extra `:`-separated `.sure` dirs |
| `SURE_CACHE=0` | Skip the definition cache (bootstrap sets this) |
| `SURE_NODE` | Node 18+ binary for `./bin/sure` and `Proc.exec` in tests |
| `SURE_TEST_GROUP` | Substring of a `Test.group` name; `Test.full` / `Test.run` skip groups that do not match |
| `SURE_RUNTIME=bun` | Same as `--bun` |
| `SURE_DEBUG` | `off` \| `error` \| `info` \| `trace` |
| `SURE_DEBUG_OPT` | `host` \| `term` \| `holes` \| `qc` \| `all` |
| `SURE_FETCH_BASE=1` | Allow fetching missing stdlib files (off by default) |

## Repl

```
sure repl
:check Nat.add
:prove Spec.add2
:quit
```

Empty line is ignored. `:xyz` is not a command. `:check` with no name fails.

## Checks that do not load App/User trees

```bash
./bin/sure --lib
./bin/sure --test
./bin/sure cover --fail
```

`sure test` is the bounded CI suite. CI also runs `Test.main` (`Test.ci.suite` then `Test.host`). `Prove.all` and `Test.full` remain for local unbounded runs (`sure Prove.all`, `sure Test.full --run`, optional `SURE_TEST_GROUP`).

Run these from a tree that contains `base/` (or set `SURE_BASE`).

Next: [Style](style.md).
