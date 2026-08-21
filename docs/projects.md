# Projects

A Sure project is a directory with `sure.json` and `src/*.sure`.

## Manifest

```json
{
  "type": "application",
  "name": "myapp",
  "version": "1.0.0",
  "language": "Sure",
  "source-directories": ["src"],
  "exposed-modules": [],
  "theorems": ["Spec.add2"],
  "dependencies": { "direct": {}, "indirect": {} }
}
```

`type` is `application` or `package`. `sure.lock` pins git revisions and a `sha256` of the installed tree; `sure install` checks out those pins and fails on a hash mismatch. Empty lock entries are `{}`. `kind.json` is still read. The incremental emit cache hashes the compiler blob, `compiler.js`, host schema, FormCore, stdlib, lockfile, every `source-directories` entry, and transitive dependency sources. Checked definitions are stored as one `.cache/<name>` record keyed by source hash and `SURE_CACHE_KEY` (blob fingerprint plus canonical stdlib and project realpaths). Records whose file is outside the current root, or that contain `..`, miss. Empty and junk records are a miss. Bootstrap sets `SURE_CACHE=0`. `module` / `import` are elaborated by `Sure.Parser.file`. The host only expands `when`, HTML, and `admit`.

## Scaffold

```bash
sure new myapp
sure new --package ada/boxes
```

Applications get `src/Main.sure` and `src/Spec.sure`. Packages get `src/<Mod>.sure` and an empty theorem list.

```
module Main exposing (Main)
Main: IO<Unit>
  IO {
    IO.print("hello from myapp")
  }
```

```
module Spec exposing (add2)
Spec.add2: Nat.add(2, 2) == 4
  refl
```

## Modules and packages

A `.sure` file is a module of many terms. A **library** is a package that exposes one or more of those modules.

`Foo.bar` is looked up as `Foo.sure` first (the module file), then `Foo/bar.sure` (a split). The first file that defines the name wins. Sibling modules are sibling files: `src/Boxes.sure` and `src/Audit.sure`.

Headers:

```
module Foo exposing (bar, Baz)
import Nat exposing (add)
```

Inside `Foo.sure` you write `bar`, not `Foo.bar`. Other files `import Foo` and then use `Foo.bar`, or `import Foo exposing (bar)` and write `bar`. Only names in `exposing` are public.

A package lists `exposed-modules`. Dependents cannot use the rest. Stdlib names are always in scope. Empty names are not modules.

```bash
sure add ../lib              # local path
sure add ada/boxes           # git https://github.com/ada/boxes.git
sure expose Boxes            # packages only
sure install                 # from sure.lock
sure remove <name>
```

`SURE_PATH` (alias `KIND_PATH`) is a `:`-separated list of extra `.sure` directories.

## Emit and run

```bash
sure build              # dist/Main.js after check + prove
sure build --html T     # dist/T.html, self-contained page
sure emit               # same as build
sure run                # uses dist/ when it is fresh
sure --bun run
SURE_RUNTIME=bun sure run
```

Compilation keeps definitions reachable from the entry term. Unused functions in the same module, unused stdlib, unused primitive helpers, and unused IO host slices (http, db, udp, …) are not emitted. If `IO.ask` is called with a computed query name, the full host is kept.

Term names look like `Main` or `Html.Counter.client`. Paths like `../x` are not files. Unproved equalities are not emitted.

`sure run Main --foo=1 rest` forwards extra args after `--run`.

## FFI

```
Ffi.call("Math.abs", JSON.array([JSON.enc.nat(2)]))
Ffi.call_nat("Sure.ffi.add", [2, 3])
```

Arguments and results are JSON, never a raw JS object.

```js
globalThis.SURE_FFI["my.fn"] = (a, b) => a + b
```

Dotted names walk `globalThis` (`Math.max`) without `eval`. Empty name, missing function, bad JSON, and a throw are `Ffi.Err`.

## Worker

`Worker.run(name, json)` uses Node `worker_threads` or a Bun `Worker`. Values are JSON. Empty and missing names are errors.

## Language server

```bash
sure lsp
```

stdio JSON-RPC, `Content-Length` framing. Hover, definition, completion, format, rename, references, symbols, highlight, workspace symbols, code actions.

VS Code extension: `editors/vscode`. Set `sure.path` if `sure` is not on `PATH`.

## Agent

```bash
sure agent                 # stdio JSON-RPC
sure agent --client prove Example.Spec.add2
sure agent --client check Nat.add
```

Methods include prove, check, fill, docs, impact, theorems, deps, graph. This is the compiler as a tool.

## Debug

```bash
sure prove --debug=trace          # off | error | info | trace
sure run --debug-opt=host         # host | term | holes | qc | all
sure debug Term
Sure.Log.put(have, Sure.Debug.Level.info, "db", "ok")
```

`off` emits nothing. Empty tag is allowed.

Next: [CLI](cli.md).
