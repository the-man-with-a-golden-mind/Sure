# Standard library

Application code talks to the world through **typed** wrappers. Errors are `Outcome<E, A>` or `Maybe`, never an empty string that means “oops.”

Host is the kernel: `Host.Op` → `Host.encode` → `IO.ask` → `Host.decode` → `Host.Event`. `File`, `Dir`, `Sure.Env`, `Http`, `Net`, `Proc`, `Db`, `Crypto`, `Task` go through `Host.perform`.

```
File.read(path: Path): IO<Outcome<File.Err, String>>
  IO {
    get e = Host.perform(Host.Op.fs_read(Path.text(path)))
    return Host.to_file(e)
  }
```

`Host.unsafe.ask(query, param)` remains if you need a raw query. Prefer the wrappers.

## Outcome

```
type Outcome <E: Type, A: Type> {
  err(error: E)
  ok(value: A)
}

Outcome.map / Outcome.map_err / Outcome.bind / Outcome.guard / Outcome.is_ok
IO.from_outcome / IO.bind_ok
```

`Outcome.map` is Rust `map`. `Outcome.map_err` is Rust `map_err`. `Outcome.bind` is `and_then`. `Outcome.guard(ok, err)` is `ok(unit)` or `err`. `IO.bind_ok` sequences `IO<Outcome<E, A>>` and stops on `err`. Empty/junk stay `err`; there is no `?`.

`Proc.run.with(file, args, cwd, env)` takes `List<Pair<String, String>>` via `Proc.env.pack`. `Proc.run.at` still takes that packed string. Malformed packs are `bad_pack`, not extra arguments.

`Result` still exists (stringly errors). New code uses `Outcome`.

`IO.bracket` always runs `release` on a fresh abort scope. If `use` succeeds and `release` throws, that error is the result. If `use` fails, the use error wins and a release error is dropped.

## Path, File, Dir

```
Path.from_string("foo.txt")     // ok
Path.from_string("")            // err empty
Path.from_string("../secret")   // err dotdot
Path.from_string("a/../b")      // err dotdot
```

`Path.unsafe` skips the check. `File.read` / `write` / `delete` / `bytes` take a `Path`. `File.read_string` / `write_string` take a `String` and reject empty and `..` as `bad_path`.

| Error | When |
|---|---|
| `File.Err.bad_path empty` | `""` |
| `File.Err.bad_path nul` | NUL in the path |
| `File.Err.bad_path dotdot` | `..` segment |
| `File.Err.missing` | no such file |
| `File.Err.io` | host IO error |

`File.with_temp` / `File.bracket` open, run, close. `Dir.read` lists a directory. Empty directory names follow the same path rules.

## Env, Cfg, Cli

**Environment.** Empty names are not names (`""`, `A=B`, a newline). An unset name is `missing`. An empty *value* is `ok ""`.

```
Sure.Env.get("PATH")
Sure.Env.get_or("PORT", "80")
Sure.Env.nat("N")      // junk is junk, never 0
Sure.Env.bool("OK")    // only true/false
Sure.Env.flag("X")     // missing/empty/0/false/off/no → false
Sure.Env.set / del / has / keys
```

**Config.** Empty or whitespace JSON is `{}`. Junk, leftover after JSON, and a non-object are `none`. Empty keys, newlines, and NUL are not keys.

```
Sure.Cfg.read("{\"n\":\"8\"}")
Sure.Cfg.load("app.json")           // empty path is empty_path; .. is bad_file
Sure.Cfg.load_or_empty("missing.json")  // only missing becomes {}
Sure.Cfg.pick(file, env, cli)       // cli wins; objects merge deep
Sure.Cfg.from_cli / from_env
```

`nat` accepts digit strings. `bool` accepts `true` / `false` / `0` / `1`, not `yes`.

**CLI.** `--name` and `--name=value`. Empty names are not flags. `--` ends flags. Extra args after `sure run Main` are `IO.get_args`.

```
Sure.Cli.parse(["--n=8", "file"])
Sure.Cli.flag(c, "n")
Sure.Cli.get(c, "n")
```

## JSON

```
JSON.enc.bool(true)
JSON.enc.nat(0)          // digit string
JSON.enc.string("hi")
JSON.enc.list(enc, xs)
JSON.dec.bool(j)         // none on junk
JSON.get(j, "name")      // none if missing
JSON.parse / JSON.stringify
```

`""`, `"abc"`, and `"12x"` are not nats. A bool is not a nat.

## HTTP

```
Http.get(url)
Http.post(url, body)
Http.request(Http.Request.new(method, url, headers, body))
```

Status + body. Empty URL is a typed error, not a throw.

**Server** (JS host):

```
Http.Server.listen(port)
Http.Server.parse(raw)            // none on a bad tag
Http.Server.get("/", req)         // none if the method is not GET
Http.Server.post("/", req)
Http.App.match(method, pattern, req)
Http.App.fire(routes, req)        // 404 when the list is empty
Http.Path.match("/user/:id", "/user/7")
```

A route is method + pattern + handler. `Http.Path.segs("/")` is `[]`. Empty and junk methods are `none`.

## Network, process, crypto, compress

```
Net.tcp / Net.udp / Net.ws_connect
Proc.run / Proc.cwd / Proc.argv / Proc.env
Crypto.sha256 / Crypto.hmac_sha256 / Crypto.hash
Compress.gzip / Compress.gunzip
```

Empty DNS names are `empty_name`. WebSocket is typed; the JS host does the RFC 6455 handshake and masked frames over TCP/TLS without a `ws` package. `Proc.exec(file, args)` and `Proc.run(file, args)` spawn argv (`shell: false`). `Proc.unsafe.shell(cmd)` is the shell-string hatch. `Stream.take` is a pull stream: `Stream.take(n, s): IO<List<A>>`. HTTP request headers are sent by the JS host. `Crypto.random` uses `crypto.randomBytes` and does not fall back to `Math.random`. Host replies are tagged `0\\n` / `1\\n`; empty and junk decode as protocol errors.

## Db

```
Db.connect("suremem:app")         // in-process map
Db.connect("surefile:app.json")   // JSON file
Db.get / set / del / has / keys / clear / query
```

Empty keys are `empty_key`. Closed connections are `closed`. There is no Postgres stub.

**DSL** — `GET` `SET` `DEL` `HAS` `KEYS` `CLEAR` `COUNT` `PREFIX` `ROW GET/SET/DEL`. Empty and junk source is `none`. Table/id reject empty, `/`, and unsafe keys. Empty prefix is not a prefix.

**Migrations** — `Db.Mig.up` / `down`. Empty name is not a step. A missing log is no applied steps. Re-run applies 0. Empty down is a no-op.

## Time, Task, Worker, Ffi

```
Time.now / Time.iso / Time.read / Time.Duration.read
Time.div(n, 0) == 0
Time.mod(n, 0) == n          // Nat.div_mod of 0 does not terminate
```

Impossible dates (month 0, 32 Jan, 30 Feb, hour 24) are `none`. `Time.Stamp` is milliseconds since 1970-01-01 UTC.

```
Task.sleep(0)
Task.par / Task.race / Task.timeout_sleep
Worker.run(name, json)       // worker_threads / Bun Worker; JSON values
Ffi.call("Math.abs", JSON.array([JSON.enc.nat(2)]))
```

`Ffi`: JSON in, JSON out. Empty name, missing function, bad JSON, and throws are `Ffi.Err`. Register `globalThis.SURE_FFI["my.fn"] = (a, b) => a + b`. Dotted names walk `globalThis` without `eval`.

## Data processing

```
Sure.Pipe.map / filter / take / fold / lines / words / chunks / windows
Sure.Csv.read / show / get / header / body
Regex.read / Regex.ok
Parse.nat / bool / hex / f64
Email.from_string
Semver.parse
Bytes.length / eql / slice / hex
```

Empty input is empty output. `chunks(0, …)` and `windows(0, …)` are `[]`. `Sure.Pipe.lines("")` is `[]`. `Regex.read("[")` is `none`.

## Coverage

```bash
sure cover
sure cover --fail    # exit 1 below 90%
```

A public name is covered when a lemma or `Test.suite` **mentions** it. This is textual mention coverage, not code or branch coverage. Empty, junk, and missing cases count. Kind internals and parked numeric clones (`U1024`, Keccak, …) do not.

The application surface is high on this mention metric; `sure cover` prints the current figure. Keep it up with real lemmas, not by parking names.

Next: [Web](web.md).
