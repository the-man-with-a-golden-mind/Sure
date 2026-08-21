## Sure 0.1.0

Removed the Kind-era `blog/` posts and `web/` Kindelia website (webpack, pm2, events.moonad.org). HTML/UI in Sure is `docs/web.md` and the `Html` / `Http` stdlib, not a site in this tree.

`examples/todo` is an Elm-like (`Sure.Ui`) todo list on :8775. Empty add is `empty`. Unknown clicks leave the model. Views may be HTML: `<input type={kind} />` is `DOM`; `onClick` is `on-click`; `List<Nat>` is still a type.

Truth pass (audit):

- Residual `_` / `admit` / `?hole` fail `sure check`, `sure prove`, and `sure build`. `_` can no longer prove `Nat.add(2,2) == 5`.
- `sure run` writes `dist/<Term>.js` and stamps it, then spawns a fresh Bun/Node on that file (the checker process is not the runtime). A second `sure run` with unchanged sources skips compile. HTTP `recv` waits for a request instead of polling every 3s.
- `sure prove` only treats completed equality/`Equal` terms as proved. Aggregate JSON `proved` is true only when every result is proved. `Nat.add` checks; it is not a theorem.
- Incremental build cache hashes `compiler.js`, `host-schema.js`, `gen-host.js`, the checker blob, FormCore, stdlib, lockfile, every `source-directories` entry, and transitive dependency sources.
- Checker def cache is one record per name (source hash + blob key). `Synth.one` writes it. Empty/junk records are none. `sure test` runs `Main` in-process.
- `sure install` materializes `sure.lock` git revisions (direct and lock-listed transitive names) instead of cloning latest HEAD.
- HTTP request headers are sent. `Crypto.random` does not fall back to `Math.random`. WebSocket client frames are masked. Generated HTML inlines layout CSS (no Tailwind/daisyUI CDN). Web examples load those themselves. `File.bracket` is acquire / use / release. `Stream.take` is a pull stream (`IO<List<A>>`), not `List.take`.
- `Host.decode` is generated from `host-schema.js` with encode. It accepts only tagged `0\\n` / `1\\n`. Empty and untagged payloads are `Host.Err.empty` / `Host.Err.bad_tag`. String `IO.*` ops take `IO.tagged.payload` (success body, else `""`).
- RFC 6455 client frames and handshake are `vendor/formcore-js/ws-frames.js` and are bounded-tested. `./bin/sure` skips a Node binary that cannot start (broken ICU) and honors `SURE_NODE`.
- `Proc.exec(file, args)` / `Proc.run(file, args)` spawn argv with `shell: false`. `Proc.unsafe.shell(cmd)` is the shell-string hatch.
- Bootstrap writes `sure.js` atomically from `Sure.api.export`, injects the prepare hook as a fixed point, and uses `process.execPath` (no shell). Stage-two loads `Defs.read` on a `module Hello` snippet and requires `Hello.greet`. Full compile-twice regeneration is unbounded and is not CI.
- Live checker elaborates `module` / `import` in `Sure.Parser.file`. The host does not rewrite identifiers. `import M exposing (..)` loads `M` then resolves short names from defs. `when` / HTML / `admit` still expand in the host. `Sure.Mod.from_imp` keeps `import Boxes exposing (Boxes)` as `Boxes`, not `Boxes.Boxes`.
- `sure.lock` stores `sha256` of the installed tree. `sure install` fails on mismatch. Missing hash is recorded, not a protocol error.
- `IO.bracket` always runs `release` on a **fresh** AbortController, so a cancelled `use` still runs user `release`. `File.bracket` uses it.
- `sure test` is a bounded suite (listed theorems, checks, `Main --run`, `Test.main`, prove-edges). It does not type-check `Prove.all` or run `Test.full`. `Test.main` is `Test.ci.suite` then `Test.host` (packed argv including newlines, and an `IO.race` of `IO.bracket` that must print `RELEASED`).
- Checker cache keys include the canonical stdlib and project realpaths. Records whose file is outside the current root, or that contain `..`, miss. Cache load is a worklist plus `IO.yield` (no recursive dep explosion). Bootstrap and `SURE_CACHE=0` skip `.cache` at the host.
- `Proc.join_args` / host argv parse are length-prefixed. An argument may contain newlines. Env is packed key/value pairs, not `;` / `=`.
- Module qualification matches `Sure.Mod.resolve` / `Sure.Parser.file.rewrite` (locals, then `Module.name`, then import exposing).
- LSP rename, references, highlight, completion, and symbols use `compiler.parse_document` / `compiler.idents` / `compiler.symbols`. Strings and comments are not identifiers.
- `Outcome.map_err`, `Outcome.guard`, `IO.from_outcome`, and `IO.bind_ok` flatten `IO<Outcome>` chains. Nested `case` is still required when success of a get *is* the error (`taken`). There is no `?`.
- Blocking host ops (`get_line`, HTTP, TCP recv, `proc_wait`, sleep) resolve on abort so `IO.race` cannot deadlock waiting for a cancelled loser.
- `./bin/sure` requires Node 18+ and `AbortController`. `SURE_NODE` / `process.execPath` is the `Proc.exec` binary in `Test.host`.
- `format_source` keeps relative indent inside a definition. LSP rename/highlight follow `get`/`let`/`{}` bindings, not every same token.
- `Proc.env.pack` / `Proc.run.with` pack environment pairs. Junk packs are `bad_pack`.
- `IO.bracket`: if `use` succeeds, a `release` throw is the result; if `use` fails, that error wins.
- `Test.full` is the unbounded `Test.suite` runner (group phases, 15s `Test.io` timeouts, `SURE_TEST_GROUP`). CI runs `Test.main` (`Test.ci.suite` + `Test.host`), not `Test.full`.
- LSP protocol lives in `bin/js/src/lsp.js`. Symbols use `parse_document` block ranges; rename/highlight bind `get`/`let`, `{ }`, def params, and `(x)` lambdas. Global rename also edits other files via `rename_global`.
- QC sample generation is `bin/js/src/qc.js`. HTML emit is `bin/js/src/emit.js`. CI behavioral tests are `Test.ci`.
- `Html.el` / `Html.on` take `String` tag and event names (`DOM.node` / `Map.set "on-"|ev`). Clients (`Html.Echo`, Tweeter, Sheet, examples) do not compile `Html.Tag.show` / `Html.Event.show`. `Html.Event.Data.parse` still does not look up the event enum. Cold `--js` of `Html.Echo.client` is seconds, not minutes.
- LSP hover, rename, symbols, and definition walk `Sure.Defs.read` terms (`Sure.Term.ori` / `ref`) and show types with `Sure.Term.show`. `ident_bindings` remains for binders the term tree does not name.
- Agent JSON-RPC is `bin/js/src/agent.js`. Package/project commands (`new`/`add`/`install`/`expose`, manifests, lock) are `bin/js/src/project.js`. Prove/QC/gen, the bounded self-test, and the repl are `commands.js` / `selftest.js` / `repl.js`.
- There is no Chez / Scheme host. `bin/scm/` and `kind-scm` are gone. `sure Term --scm` is an error. The JavaScript host is the runtime.
- Installable package `sure-lang` at the repo root: `./bin/install-global` / `bun add -g sure-lang@file:"$PWD"` / `bun add -g github:the-man-with-a-golden-mind/Sure`. The tarball is CLI + `base/` + `vendor/formcore-js`. Unset `SURE_BASE` uses the packaged stdlib.
- LSP rename follows `ident_bindings` per top-level definition. A parameter of `f` does not rename the global `x` used by `g`. The checker blob is regenerated from `Sure.api.export` (includes `host_abortable`).

`when { pred: val ... } default rest` is the table form of nested `if` (first true wins). `case` stays constructor matching. `switch f { key: v }` stays one `A -> Bool`. `String.ok(s, banned)` is nonempty and none of those substrings. `String.has_none` is the same without the empty check.

Checker modules are `Sure.*` (`Sure.Term`, `Sure.Parser`, `Sure.api`). `Kind.*` was the old name. The running blob still accepts `Kind.api.*` as an alias. Agent methods are `sure.prove` (`kind.prove` still works). A package is `Sure.Mod.Sort.application` or `package`.

Compilation tree-shakes the JavaScript emit:

- Only definitions reachable from the entry term are compiled (`Main` does not emit `Hello.Spec` or unused stdlib).
- Primitive helpers (`word_to_u16`, `inst_nat`, …) are kept only if the term uses them.
- The IO host is sliced: `IO.print` does not emit `http_listen`, `db_connect`, or UDP. A computed `IO.ask` query keeps the full host.

Modules:

- `module Tweeter exposing (..)` at the top of a file. Names inside are unqualified (`ok_user`, `type Sess`). Outside they stay `Tweeter.ok_user`.
- `module Boxes exposing (Boxes, empty, push, len)` publishes only those names. Proofs stay private.
- `import Boxes` uses `Boxes.empty`. `import Boxes exposing (empty, len)` uses `empty` / `len`. `import Boxes exposing (..)` uses every published name.
- Exposing a type also exposes its constructors (`Sess.none`). Stdlib needs no import. Other modules do.



Examples (tested, not stubs):

- `suremem:` survives `Db.with` / `Db.close`. Close marks the connection closed; the named store stays. Reconnect sees the same keys. File DBs still persist to disk.
- `examples/codec` `POST /` with body `42` is `42` (digit string), not `"json"`
- `examples/tweeter` register then login works. `POST /upload?s=` stores a file; `GET /file?id=` reads it
- ui / excel / tweeter serve a "build the client" page when `dist/*.client.html` is missing, not a dead snapshot that looks like the app
- Listen failure prints `Http.Err.show` (`EADDRINUSE`, …)
- `sure run` restores the project directory before executing. File IO and `dist/*.html` no longer look inside `base/`



Modules, files, libraries:

- A `.sure` file is a module: any number of types and functions
- Lookup is module-file first (`Foo.bar` → `Foo.sure`, then `Foo/bar.sure`)
- Nested files remain a split for large modules (stdlib still uses them)
- A library is a package that exposes one or more modules
- `sure new --package` writes a module with several functions and a proof
- Example library: `examples/boxes` (`Boxes` + `Audit`)

Elm-like frontend (`Sure.Ui`):

- `Sure.Ui.sandbox` is init / view / update (no effects)
- `Sure.Ui.element` adds `Cmd` and `Sub`
- `Cmd`: none | http url msg | tick ms msg | push msg | batch. Empty URL is not a request. tick(0) is none
- `Sub`: none | every ms msg | sse path msg | batch. every(0) is none. Empty SSE path is none
- Unknown messages leave the model. Empty cmd/sub text is none
- `sure build --html Sure.Ui.Counter.client` and `Sure.Ui.Tick.client`
- The page runtime runs Cmd (fetch / timeout / push, depth 32) and Sub (interval / EventSource)
- `sure help ui`

SSR framework (`Sure.Ssr`) with SSE, a KV DSL, and migrations:

- `Sure.Ssr.ok` / `not_found` / `bad` render HTML documents (empty title is allowed)
- `Sure.Ssr.Reply`: html | text | json | redirect | sse. Empty id is `empty_id`; empty redirect is a 400 page
- `Sure.Sse.frame`: empty event is `message`; newline in the event is none; no clients is 0
- `Db.Dsl`: GET/SET/DEL/HAS/KEYS/CLEAR plus COUNT, PREFIX, ROW GET/SET/DEL. Empty and junk are none
- Table/id reject empty, `/`, and unsafe keys. Empty prefix is not a prefix
- `Db.Mig.up` / `down`: empty name is not a step; missing log is no applied steps; re-run applies 0; empty down is a no-op
- Host `sse_open` / `sse_send` / `sse_close` / `sse_count` and `http_reply_hdr` never throw
- `sure help ssr`

JSON config (`Sure.Cfg`):

- Empty or whitespace is `{}`. Junk, leftover after JSON, and a non-object are none
- Empty keys, newlines, and NUL are not keys
- `get` / `str` / `nat` / `bool` / `flag` / `has` / `set` / `del` / `get_or` / `need` / `overlay` / `pick`
- `nat` accepts digit strings; `bool` accepts `true`/`false`/`0`/`1` (not `yes`)
- `from_cli`: `--name` is true, `--name=value` is a string, `--name=` is `""`; last flag wins
- `from_env`: missing names skipped; empty names are not names; empty values are values
- Overlay is deep on objects; a non-object on the right replaces
- `load`: empty path is `empty_path`; `..` is `bad_file`; missing is `missing`; junk is `junk`
- `load_or_empty` turns only a missing file into `{}` (empty path and junk stay errors)
- CLI wins over env over file
- `sure help cfg`

Process environment (`Sure.Env`):

- Empty names are not names (`""`, `A=B`, a newline in the name)
- An unset name is `missing`; an empty value is `some("")`, not missing
- `Sure.Env.get` / `set` / `del` / `has` / `keys` / `get_or`
- `Sure.Env.nat` / `bool`: empty and junk are `junk`, never 0 / false
- `Sure.Env.flag`: missing, empty, `0`, `false`, `off`, `no` are false
- Host `get_env` is tagged (`0\n` / `1\n`); `set_env` / `del_env` / `env_keys` never throw
- `sure help env`

CLI, log, REPL, and `sure test`:

- `Sure.Cli.parse` / `parse_line` / `flag` / `get` / `nth`: `--name` and `--name=value`; empty names are not flags; `--` ends flags
- Host `get_args` keeps dash tokens and joins them with newlines (empty is no tokens)
- `sure run Main --foo=1 rest` forwards extra args after `--run`
- `Sure.Log.format` / `put`: `off` emits nothing; empty tag is allowed
- `sure repl`: empty line ignored; `:` and `:xyz` fail; `:help` / `:quit` / `:check` with no name fails
- `sure test` is the same as `sure --test`
- `sure help cli` / `log` / `repl` / `test`

Time (core lib):

- `Time.Stamp` is milliseconds since 1970-01-01 UTC; `Time.Duration` is milliseconds
- `Time.now` / `from_parts` / `to_parts` / `iso` / `read`
- `Time.Duration.read` accepts `ms|s|m|h|d` or a bare millisecond count; empty and junk are none
- Impossible dates (month 0, 32 Jan, 30 Feb, year 1969, hour 24) are none
- `Time.div(n, 0)` is 0 and `Time.mod(n, 0)` is n (`Nat.div_mod` of 0 does not terminate)
- `sure help time`

Data-processing pipelines (core libs):

- `Sure.Pipe`: map/filter/bind/take/drop/zip/scan plus range, once, from_maybe, replicate, take_while, drop_while, flatten, zip_with, enumerate, reverse, unique, chunks, windows, intersperse, partition, group, decode, nats, fold, count, sum, any, every, find, first, last, nth, lines, words
- Empty input is empty output. `chunks(0, …)` and `windows(0, …)` are `[]` (they do not loop)
- `Sure.Pipe.decode` / `nats` skip junk (`none`); they never become 0
- `Sure.Pipe.lines("")` is `[]` (an empty file is no records)
- `Sure.Csv.read` / `show` / `get` / `col` / `header` / `body` / `nats`: empty is no rows; unclosed quotes still yield a field
- `sure help pipe`

Language Server and VS Code:

- `sure lsp` is a stdio JSON-RPC Language Server (`Content-Length` framing)
- Hover, definition, completion, format, rename, references, symbols, highlight, workspace symbols, code actions
- `didOpen` / `didChange` / `didClose` / `didSave` publish diagnostics (source `sure`)
- Empty methods, empty URIs, empty names, and junk methods fail or are none
- Parse errors are `-32700`; unknown methods with an id are `-32601`; work before `initialize` is `-32002`
- VS Code extension: `editors/vscode` (language `sure`, files `*.sure`, commands Prove / Debug / Goal / Fill / Restart)
- `sure help lsp`; `Sure.Lsp.all` is proved

Advanced debugging:

- Levels `off | error | info | trace` (`Sure.Debug.Level.read`; empty and junk are none)
- Channels `host | term | holes | qc | all` (`Sure.Debug.Flags`; junk tokens ignored)
- Empty `--debug-opt` opens every channel; a set opt keeps only those channels (`Sure.Debug.open` / `emit` / `host_ask`)
- `sure debug <Term>` prints type, remaining holes, traces (`--json`, `--debug=info`, `--norm`, `--debug-opt=`)
- `sure prove --debug=trace` (bare `--debug` is trace); `--debug=junk` fails
- `sure qc --debug --debug-opt=qc` prints each sample; `--debug-opt=host` does not
- `sure run --debug` / `SURE_DEBUG=trace` logs host asks (redacted, never throws)
- `SURE_DEBUG=trace SURE_DEBUG_OPT=qc` does not log host; explicit `host` logs even at `off`
- yield is logged only at `trace`; params redact at 80 chars and at a newline
- Agent `sure.debug` / `kind.debug`; empty name and missing term fail
- `sure help debug`

Database (memory and file, no partial backend):

- `suremem:name` is process memory; `surefile:path.json` is a JSON map on disk
- `Db.get` / `set` / `has` / `del` / `keys` / `clear` / `query` / `with`
- Empty URL, `postgres://`, `surefile:../x`, empty keys, missing keys, closed connections, and junk queries are `Db.Err`
- Query text is `GET` / `SET` / `DEL` / `HAS` / `KEYS` / `CLEAR` (`Db.Cmd.read`; empty is none)
- `Db.with` closes the connection after the body
- `sure help db`
- Keys reject `\\n` / empty; file maps use null-prototype objects; persist is tmp+rename
- A corrupt or non-object JSON file is `bad_file` (it is not silently `{}`)

Workers (off-thread JSON jobs):

- `Worker.run` / `run_nat` / `map` send JSON to a Node `worker_threads` thread or a Bun `Worker`
- Empty name, `a/b`, missing function, `{` JSON, and throws are `Worker.Err` — not a Sure value
- Empty `Worker.map([])` is `ok([])` and does not spawn
- The worker sees `Math.*`, `Sure.ffi.add`, and `Sure.worker.double`, not main-thread objects
- `sure help worker`; empty and junk topics are still not topics

Parallel computations:

- `IO.par` runs both trees (`Promise.all`); `IO.race` takes the first (`Promise.race` → `Either`)
- `Task.par` / `Task.all` / `Task.race`; empty `Task.all([])` is `IO.end([])`
- `Sure.Par.map` / `pair` delay work with `IO.yield` so the host can overlap
- Empty `job_all` is `0\\n`; empty/missing `job_race` is `1`

Bun compatibility:

- `sure --bun run Main` / `SURE_RUNTIME=bun sure run Main` / `bun bin/js/src/main.js run Main`
- Empty and junk runtime names are node; missing bun on PATH fails
- Generated `http_listen` uses `Bun.serve` when Bun is defined, else Node `http`
- `Sure.Runtime.pick(flag, env, native)` is the proved rule
- `bin/sure` does not pass Node `--stack-size` to Bun

HTML + events (generate a page that clicks):

- Html.Tag is the living-standard element set; Html.Event is 122 browser events
- `Html.button` / `input` / `form` / `div` / `p` / `h1` / `a` / `ul` / `li` / `img` / `select`
- `Html.on` writes `data-sure-on-*`; empty tag/event names are not tags/events
- `sure build --html Html.Counter.client` (click) and `Html.Echo.client` (input + clear)
- Checkbox `checked` is on the event wire; submit is preventDefault

Core utils (strings, regex, parse, JSON, bytes, float, hash):

- `String.replace` / `replace_all` (empty needle does not loop), `index_of`, `count`, `lines`, `words`, `trim_left` / `trim_right`
- `Regex.read` / `Regex.match` / `Regex.ok`: `* + ? | () . [] [^] \d \s`; unclosed `[` is none
- `Parse.nat` / `bool` / `hex` / `f64`: empty and junk are none, never 0
- `JSON.enc.f64` / `JSON.dec.f64` / `JSON.path`; null is not a float
- `Bytes.length` / `eql` / `concat` / `get` / `slice` / `xor` / `hash` (FNV-1a); empty get is none
- `F64.is_dec` / `read_dec` / `is_nan` / `is_inf` / `is_finite` / `is_zero`; `F32.abs`
- `Crypto.hash` is SHA-256

Modules and packages (Elm-simple):

- `// module Foo exposing (bar)` / `// import Nat exposing (add)` — comments, checked by `sure prove`
- Packages list `exposed-modules`; dependents cannot use the rest. stdlib stays in scope
- `sure new --package ada/boxes`, `sure add ada/boxes` (GitHub), `sure add ../lib`, `sure expose`, `sure install`
- `sure.json` `type` application|package, `source-directories`, `dependencies.direct` / `indirect`; `sure.lock` pins versions
- Empty names, lowercase modules, `Ada/boxes`, and a missing path dep fail

Generated tests/proofs and no JS exceptions:

- `case` is exhaustive; `Empty` has no value (`Sure.Total.never`)
- Incomplete `case` and `Empty` values fail at check time (no runtime match error)
- Host `run_io` never throws: unknown op and FS errors are tagged `1\\n…`
- `sure gen <Term>`: junk apps type-check; `== none` / Bool truth-table when `refl` holds; QC lemmas
- Empty name and missing term fail gen

JS/TS FFI (`Ffi.call`):

- Values cross as JSON only; a JS object never becomes a Sure value
- Empty name, `a/b`, missing function, `{` JSON, and throws are `Ffi.Err`
- `globalThis.SURE_FFI[name] = fn` or a dotted walk of `globalThis` (`Math.abs`) — no eval
- Async JS/TS (`Promise`) is awaited; `Ffi.call_nat` for decimal nats

How to use it:

- `sure` / `sure help` is the path: new → prove → build → run
- `sure help prove|json|html|emit`; unknown topic fails
- `sure new` prints those next commands; empty name shows the example
- `Sure.How.next` / `is_topic` proved (empty and junk are not topics)

Hardening (JSON / emit / HTML):

- `JSON.dec.nat` accepts only a full decimal digit string (`""`, `"abc"`, `"12x"`, bool are none)
- `Sure.Emit.safe` rejects empty, `/`, `\\`, `..`; those names emit no file
- HTML wrap refuses unsafe titles; mount walks to the nearest `data-sure-on-*` and swallows step errors
- Event wire junk coordinates are 0, not a prefix parse; empty counter wire does not increment

Typed JSON + in-page Html.App (no server POST):

- `JSON.enc` / `JSON.dec` for Unit, Bool, Nat, String, List, Pair, Maybe, Either; `JSON.get`
- Empty nat string, null-as-bool, non-array list, missing field are `none`
- `Html.Client` draws HTML and `step`s on an event wire; `Html.Client.of` from `Html.App`
- `sure build --html <Term>` writes a self-contained `dist/<Term>.html` that mounts `Html.Client` in the browser
- Empty wrap / empty term do not emit a page

JS emit (`sure build` is tsc, not check-only):

- `Sure.Emit.file` / `js_name` / `ready` (empty term is not a file; unproved is not ready)
- `sure build` / `sure emit` writes `dist/<Term>.js` after check+prove
- Skip only if stamp is fresh **and** the JS file exists; empty JS / empty name fail
- `sure run` uses `dist/` when it is fresh; `sure new` sets `package.json` `"main": "dist/Main.js"`

Full language slice (JS/Bun; no stubs):

- `Html.Tag` (114 HTML elements) / `Html.Event` (113 DOM events) with show/read/void
- `DOM` restores parser-compatible `text`/`node`/`fragment`; `DOM.render` / `DOM.page` (DOCTYPE + all-event script)
- `Html.App` init/view/update; `Html.App.run` serves HTML and `/sure/event`
- `IO.par` is a real constructor; host `Promise.all`; `Task.par` / `Sure.Par.map`
- `Sure.Pipe` filter/drop/concat/zip/scan (plus map/bind/take)
- QC binders: Unit, Bool, Nat, String, List, Pair, Maybe, Either (nested); shrink those values
- Bun: `--bun` / `SURE_RUNTIME=bun`; `Bun.serve` for `http_listen`; `http_reply_ex` content-type

Goal traces and hole fill (AIDX):

- `Sure.Agent.trace` / `hole_count` / `fill.first` with empty/none/one/two proofs
- `sure goal [--json] <Term>` dumps remaining holes, expected types, context, relevant defs
- `sure fill [--first] code|||term` replaces `?implement` and rechecks
- Agent `sure.trace` / `sure.fill` (`kind.*` still parse); `--debug` prove prints traces
- Empty name, missing term, no-hole fill, empty fill term, first-vs-all are errors or remain

Pipelines + Bool QC:

- `Sure.Pipe.map` / `bind` / `take` with nil/sing/zero proofs; `Sure.Pipe.all`
- `Sure.Gen.bool`; `Sure.Qc.Bool.not_inv` (from `Bool.double_negation`)
- `sure qc` instantiates `Bool` binders as `true`/`false`

QC laws for List/String + shrinking:

- `Sure.Qc.List.concat_nil` / `concat_length` / `length_one` (from `List.concat.*`)
- `Sure.Qc.String.take_zero` / `take_nil` / `drop_zero`
- Failed Nat samples shrink (0, 1, n/2, n-1) and print `shrunk`

Compile-time QuickCheck (`sure qc`) and proof debug:

- `Sure.Gen` / `Sure.Debug` / `Sure.Qc` instantiate lemmas (`Nat.add.comm`) at generated Nats
- `sure qc <Law> --n N --debug` reports counterexamples (`got` / `want`)
- `sure prove --debug`; agent `sure.qc`
- Empty `--n`, missing law, and non-lemma applications fail

JS is the host for now (Chez later):

- `sure --test` is prover + JS `Test.main` + prove edges (no Chez smoke)
- Help/`--run` are JavaScript; `--scm` still exists, not advertised

Source files are `*.sure` (Name=path, e.g. `Nat/add.sure`). The checker looks up `.sure`.

Stdlib is core only (apps/games/graphics/demos are packages, not `base/`):

- Removed `App/` games, `Mons`, `VoxBox`, `PixelFont`, `Ether`, `Hexagonal`, `Physics`, `User`/`Server` demos
- Tooling is `Sure.Agent` / `Sure.Doc` / `Sure.Build` / `Sure.Bench` (`kind.*` method names still parse)
- `List.concat.assoc` no longer depends on `User.rigille`

Chez IO parity (prompt should-have):

- Scheme host now implements `sha256` / `sha256_ex` / `hmac_sha256` / `file_hash` (openssl)
- `gzip` / `gunzip` (gzip -c / -dc, hex payloads)
- `fs_read_hex` / `fs_write_hex`; `proc_exec`
- `get_state` / `set_state`; `get_args`; `get_random`; `sleep`
- Empty HMAC key uses `openssl -hmac ''` (hexkey: is rejected by OpenSSL)
- TCP: `tcp_connect` / `send` / `recv` / `close` (no TLS); empty host / TLS / closed id fail
- Chez `(kind)` load: extra parens on `tcp-connect-raw` closed the library before `run_io`
- `host_smoke` imports `(kind-host)`, not the 1.5MB compiler; loopback echo + port/host edges
- `--test` Chez smoke cwd is `bin/scm/src` (was `scm/src`, missing)
- `Net.decode_conn.empty` / `untagged` / `tls`; `Net.decode_unit.empty` (compile-time)
- Chez host has no Python (UDP/DNS/HTTP stay stubs; TCP is `nc -G 1` only)
- JS compiler blob is `bin/js/src/sure.js` (was `kind.js`); package `sure-lang`
- Agent accepts `sure.prove` (and `sure.*`) as aliases of `kind.*`
- Dropped `--run-scm` (old `scheme` runner)
- HTTP listen / WS / db / proc_spawn still `"not implemented"` on Chez
- `--test` locks openssl/gzip recipes Chez uses

Benchmark tooling (`sure bench` / `kind.bench`):

- `Sure.Bench.delta` / `mean` / `best` (empty, backwards clock, min of `[5,2,9]`)
- `sure bench <Term>` times type-check (`--n`, `--json`); unproved exits 1
- Empty samples / negative ms / missing name fail

Incremental `sure build` (content-hash stamp):

- `Sure.Build.fresh` / `dirty` (same hash, empty, dep dirty)
- `.sure/build.json` records last successful src hash; unchanged src skips check
- Failed builds are not treated as fresh; `--force` ignores the stamp

Dependency graph (`sure graph` / `kind.graph`):

- `Sure.Agent.Edge` eql/self (same, different, self-loop)
- Walks `sure deps` up to `--depth` (default 2), budget 48, skips cycles
- Empty / missing name fail; depth 0 is the root with no edges

Forward dependencies (`kind.dependencies` / `sure deps`):

- `Sure.Agent.deps` / `uniq` / `deps_without` (empty, `1 + 2`, dup, drop self)
- `sure deps <Name>` lists capitalized names the definition uses
- Empty / missing name fail; self is not listed

Typed cryptography (`Crypto.sha256` / `hmac_sha256`, prompt §8):

- Tagged `sha256_ex` / `hmac_sha256`; `IO.sha256` unchanged
- `Crypto.hex64` / `is_hex` / `decode` (empty, `gg`, short digest, bad tag)
- NIST SHA-256 `""` / `"abc"`; HMAC empty and RFC 2104 `"Jefe"`
- Chez stubs

Typed UDP (`Net.udp`, prompt §8):

- Host `udp_bind` / `udp_send` / `udp_recv` / `udp_close` tagged `0\\n` / `1\\n`
- Old `init_udp` / `send_udp` kept for `Example.udp`
- Parse/decode theorems: empty, short, bad tag, empty mailbox
- Runtime: empty recv, loopback `"hi"`, port `70000` rejected, empty dest rejected
- Chez stubs

Documentation generation (`sure doc` / `kind.docs`):

- `Sure.Doc.is_comment` / `body` / `leading` (empty, `/` only, comment after def, blank ends block)
- `sure doc <Term>` prints attached `//` comments, type, `(theorem)`
- `sure doc --json`; `kind.docs`; prefix match (`Sure.Doc.is_comment`)
- Blank line between comment and def does not attach; missing name fails

Project understanding (what breaks / which proofs mention a name):

- `Sure.Agent.uses` / `is_theorem_line` / `has_implement` with empty/miss lemmas
- `kind.impact` / `sure impact <Name>` — callers vs proofs vs holes
- `kind.theorems` / `sure theorems [Name]` — compile-time specs about a name
- `kind.holes` with no name lists remaining `?implement`
- `Sure.Agent.Method.impact` / `theorems` show/read
- `--test` edges: empty impact, missing name, Email.from_string proofs,
  Nat.add theorems, proved spec has no hole

Non-optimistic / border tests (compile-time + runtime + CLI):

- `Example.Spec.edge`: zeros, empty/reject paths, email `@`/`a@`/`@b`/no `@`,
  bound miss/short/slash/wrong name, method empty/space, agent read junk,
  Semver parse 0/1/2 parts, empty row/dir/stream
- Runtime suite covers the same rejects plus JSON parse empty/junk, exec fail,
  gzip empty, missing env, empty file
- `sure --test` prove edges: false `==` is unproved (`proof_obligation`),
  missing term, empty name, `Unit` is checked not proved

Compile-time proving (general language, people and AI):

- A well-typed `a == b` term is a proof; the type checker is the prover
- `sure prove [Term...]` / `sure prove --json`; exit 1 if unproved
- `sure.json` `"theorems"` plus scan of `src/` `Name: expr == expected`
- `sure check` / `sure build` prove project theorems after the program checks
- `sure new` scaffolds `src/Spec.kind` and `"theorems": ["Spec.add2"]`
- Agent `kind.prove` returns `proved` / `proof_obligations` (failed `==`)
- `Example.Spec` / `Sure.Prove.all`; `Sure.Agent.Method.prove` roundtrip
- Repl `:prove`

Prompt remainder (semver, streams, compress, TLS/WS, Chez files, rename):

- `Semver.parse` / `lt` (`1.2.3`, `1.0.0 < 1.0.1`) proven
- `Stream.take` (pull stream) proven
- `Compress.gzip` / `gunzip` (Node zlib, hex)
- Real `tcp_connect` / `send` / `recv` / `close` (net + tls); WS handshake without `ws`
- Chez: tagged `fs_write_ex` / `fs_del_ex` / `set_file2` / `get_dir_ex`
- LSP `textDocument/rename`; lockfile records `version` + `source`
- `sure.lock` on `sure add` stores resolved version when the dep has `sure.json`

Production IO + docs (prompt §8–§10):

- `Email.from_string` (empty / no `@` rejected) with theorems
- `Dir.read` / `Dir.names` (`get_dir_ex`); missing is a typed error
- `File.read_bytes` / `write_bytes` (hex host); empty hex roundtrip proven
- `Proc.spawn` / `kill` / `wait` + `Proc.Signal` (`SIGTERM`…); Chez stubs
- `sure doc <Term>` and `sure check <Term>`

Compile-time server lemmas (`Prove.all`):

- `Http.Method.read` / `eql` / `read_show`; routes store `Http.Method` not `String`
- `Http.App.get.is_get`, `post.is_post`
- Path: two params, `?query`, trailing `/`
- Wire parse: id, method, body, bad tag; method string is `GET`
- `User.from_json` / `JSON.field_string` on a constructed object
- `Outcome.http` body is the shown value; `Http.json` body

`Server.main` live HTTP:

- Recv waiters are removed on timeout (stale waiters ate requests)
- `Http.App.run.go` keeps stepping after an empty recv
- wrk localhost `/user/1`: ~6.4k–9.1k req/s (see session notes)

Vision demo (`Server.main`):

- `User` / `User.to_json` / `UserRepo.find` / `UserRepo.put`
- `Db.Row.get`, `JSON.field_string`, `Outcome.http` (404 vs `Http.json`)
- `Server.handle` / `routes` / `seed` / `main` (`DATABASE_URL` or `suremem:app`)
- `sure remove <name>`

Vision slice (handlers, Db, agent repair):

- `Http.App.get` / `post` / `step` / `run` — first matching route owns the reply
- `Db.connect` / `get` / `set` / `query` / `close`; `suremem:` in process; `postgres://` if `pg` is installed
- `Postgres.connect` and `UserRepo.find` over `Db`
- `Sure.Agent.fill` / `names_of`; `kind.repair` replaces `?implement` and rechecks
- `kind.goal` now includes `relevant` defs from the goal type

HTTP server + process spawn (JS host):

- `Http.Path.match` / `Http.Path.bound` (`/user/:id`)
- `Http.json`, `Http.server`, `Http.Server.get` / `post` / `parse` / `serve_one`
- `Proc.run` / `Proc.exec` (`proc_exec` host op); Chez stub
- Node `http_listen` / `recv` / `reply` / `stop` on 127.0.0.1

Fork identity. The language is **Sure**. Lineage is Legacy Kind 1.0.121.

- CLI: `sure` (`kind` still works)
- `Sure.name` / `Sure.version` proven (`"Sure"`, `"0.1.0"`)
- `sure.json` / `sure.lock`; `kind.json` still accepted
- `SURE_BASE` / `SURE_PATH` / `SURE_FETCH_BASE` (KIND_* aliases)
- Compiler modules stay `Kind.*`; sources stay `.kind`

## Kind 1.0.121

Phase 4 (IDE + AI-native):

- `kind lsp` — stdio Language Server: diagnostics, hover, goto-definition, completion
- `kind agent --stdio` / `kind agent --client` — JSON-RPC compiler-as-tool (`kind.check`, `kind.holes`, `kind.goal`, …)
- `?implement` is an ordinary named goal (`Sure.Agent.implement`), not a new primitive
- `kind fmt <Term>` pretty-prints via `Kind.Term.show`; `kind repl` for `:check` / `:type` / `:norm` / `:run`
- Reverse-reference scan (`kind.references`) over `.kind` files
- `Kind.Term.bind.holes` assigns hole paths inside `case` without resolving refs (SmartMotive)
- Cache no longer shadows a project `Main` on `KIND_PATH`
- `Word.from_bits` checks from source (was hidden by cache)

Phase 3 (async / net / packages):

- `JSON.parse` / `JSON.stringify` / `JSON.set` (parse uses `Parser.JSON`)
- `Task`: `pure` / `bind` / `both` (sequential, proven) plus `sleep` / `par_sleep` / `race_sleep` / `timeout_sleep` / `cancel` on host jobs
- `Net.dns` / `connect` (TCP/TLS) / `send` / `recv` / `close` / `ws_connect`
- `Http.Server.listen` / `recv` / `reply` / `stop` (mailbox, JS)
- `KIND_PATH` extra search roots; `kind new` / `add` / `build` / `run` + `kind.json` / `kind.lock`
- 40 runtime tests including parallel sleep and DNS

Phase 2 (runtime + FFI):

- `Outcome<E,A>` typed success/error (keep old stringly `Result<A>`)
- `Path` with `from_string` rejecting empty / NUL / `..`
- `File.read` / `write` / `delete` / `bracket` / `with_temp` returning `Outcome<File.Err,_>`
- `Proc.cwd` / `env` / `argv`
- `Http.request` / `get` / `post` with method, URL, body, status (tagged host `http`)
- Tagged host replies `0\n` / `1\n` (`IO.tagged`, `fs_read_ex`, `fs_write_ex`, `fs_del_ex`)
- Theorems on Path, Outcome, tagged IO, File.from_tagged, Http encode/show
- 34 runtime tests

Phase 1 (stabilize):

- Compiler blob re-bootstrapped from Kind source (`bin/bootstrap.js`). `kind TERM --json` now emits `Kind.Error` JSON.
- Cache writes a SHA-256 of the source file (`IO.file_hash`) instead of mtime; old `.time` entries still accepted.
- `IO.set_file` uses `set_file2` (path newline body) so paths may contain `=`.
- `IO.sha256` / `IO.file_hash` host ops; tested (`sha256("abc")`).
- `FOUNDATIONS.md`: Type : Type stays; Kind is a programming language that can prove things.
- README / INSTALL / CONTRIBUTE stale-pass.

Phase 0 / first 10:

Finish Kind, do not rewrite it.

- Reproducible JS install: vendored `formcore-js` 0.1.95, `bin/kind`, `KIND_BASE`, `--version`
- Type checker no longer fetches Kind1 from GitHub unless `KIND_FETCH_BASE=1`
- `kind --lib` checks the prelude only (not `App/` or `User/`)
- `kind --test` runs the prover (`Prove.all`) then `Test.main` (exits 1 on failure)
- New `Prove` and `Test` libraries: theorems are checked types; tests abort on fail
- `kind TERM --json` emits structured `Kind.Error` JSON (live in the bootstrapped blob)
- Fixed infinite stubs: `Nat.read_base`, `Word.slice`, `Word.s_slice`
- Host protocol library: `Host.Op` / `Host.Event` / `Host.perform` / `Host.unsafe.ask`
- IO wrappers: `get_dir`, `del_file`, `get_env`, `get_state`, `set_state`; `get_args` returns args after `--run`
- Host ops `get_random`, `get_state`, `set_state`, `get_env` implemented on JS (and stubbed on Chez)
- `Kind.Term.bind` binds holes inside `case` branches (live after bootstrap)
- `Kind.api.io.check_code` loads local deps (does not use `IO.purify`)

## Kind 1.0.112

- Replace syntax is like rewrite, but equality is reversed

    replace x with e in goal

    This replaces the right side of the equality by the left side in the goal
    This should be more robust since it doesn't need to use mirror and, thus,
    avoids some holes

## Kind 1.0.108

- Allow "for" to be on the left side of a list comprehension

    [for x in [0 to 10] where Nat.is_even(x): x * 2]

## Kind 1.0.104

- Implicit arguments are here!

    ```
    id<A: $Type>(x: A): A
      x

    explicit: Nat
      id<$Nat>(7)

    implicit: Nat
      id(7)
    ```

- Nullary function call can be used instead of `!`

    ```
    let a = Map.new!
    let b = Map.new()
    ```

    This is helpful, because implicit arguments only trigger on calls.

## Kind 1.0.101

- Mutter syntax and improvements on the getter/setter syntax.

  Now you can get/set deeply nested fields.  For example, `list[0][0]` works and
  returns a `Maybe`, and `list[0][0] <- 7` works as expected. Moreover, the `<=`
  syntax can now be used to apply a function to the focused field. Example:

  ```
  type Bar {
    new(map: Map<List<List<Nat>>>)
  }

  type Foo {
    new(bar: Bar)
  }

  Test: Maybe<Nat>
    // Creates a value
    let a = Foo.new(Bar.new({"list": [[1,2,3],[4,5,6],[7,8,9]]}))

    // Applies a function to a nested element
    let a = a@bar@map{"list"}[0][0] <= Nat.mul(10)

    // Gets a nested element
    a@bar@map{"list"}[0][0]
  ```

### Kind 1.0.91

- Forall now demands `->`

- Now you can assign types in lambda parameters as in

    ```
    Test: _
      (x: Nat, y) x + y
    ```

### Kind 1.0.85

- Optimize BBT.for

### Kind 1.0.81

- Add Scheme compilation options to CLI

### Kind 1.0.79

- Socket UDP primitives

    Check Example.udp.sender and Example.udp.receiver

### Kind 1.0.75

- New syntaxes
    
    - Use

        use x = obj
        rest

        // Equivalent to:

        let x = obj
        open x
        rest

    - Let abort
        
        let x = maybe abort k
        rest

        // Equivalent to:

        case maybe as x {
          none: k
          some: 
            let x = x.value
            rest
        }

        // Also works with 'use'

    - List comprehension

        [x * 10 for x in [1, 2, 3]]

        // Returns:

        [10, 20, 30]

    - Map for-in:

        for key:val in map with state:
          loop
        rest

        let state = for key:val in map:
          loop
        rest

    - Function composition:

        f . g

        // Equivalent to:

        Function.comp!!!(f, g)

### Kind 1.0.64

- Monadic block improvements

  - Now it accepts most outside notations (let, open, log, for, etc.)

  - When you use a "for" without a "with", it becomes a monadic loop:
    
      IO {
        for i from 0 to 10:
          IO.print(Nat.show(i))
        for i from 100 to 110:
          IO.print(Nat.show(i))
      }
      
### Kind 1.0.63

- Generic derivers: stringifier, parser, serializer, deserializer. Example:

    ```
    type MyType {
      foo(n: List<Nat>, s: String, m: MyType)
      bar
    } deriving (stringifier, parser, serializer, deserializer)

    Test: _
      IO {
        let val = MyType.foo([1,2,3], "Hello", MyType.bar)

        // Converts to string
        let str = Stringifier.run!(MyType.stringifier, val)
        IO.print("str: " | str)

        // Parses string to a value
        let val = Parser.run!(MyType.parser, str) <> MyType.bar

        // Serializes to bits
        let bts = Serializer.run!(MyType.serializer, val)
        IO.print("bts: " | Bits.show(bts))

        // Deserializes to a value
        let val = Deserializer.run!(MyType.deserializer, bts) <> MyType.bar

        // Converts to string again
        let str = Stringifier.run!(MyType.stringifier, val)
        IO.print("str: " | str)
      }
    ```
    
      
### Kind 1.0.51

- Inference on numeric literals and binary operators. Check `SYNTAX.md`.

- Many bugfixes
     
      
### Kind 1.0.46

- New syntax to create, get and set attributes of records

```
type Foo {
  new(x: Nat, y: Nat)
}

Test: _
  let foo = {1,2}       // same as `Foo.new(1,2)`
  let x   = foo@x       // same as `case foo { new: foo.x }`
  let bar = foo@y <- 80 // same as `case foo { new: Foo.new(80,foo.y) }`
  bar
```
