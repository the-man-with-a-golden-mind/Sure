# Web

Three layers, one language:

| Layer | What it is | Emit |
|---|---|---|
| `Html.App` / `Html.Client` | init / view / update in the browser | `sure build --html Html.Counter.client` |
| `Sure.Ui` | Elm-like: `sandbox` or `element` with `Cmd` / `Sub` | `sure build --html Sure.Ui.Tick.client` |
| `Sure.Ssr` | Server HTML, SSE, routes | `sure run` a `*.serve` term |

Open the HTML file in a browser. Clicks and input call `step` in the page. Generated HTML inlines a small stylesheet; it does not load Tailwind or DaisyUI from a CDN.

## Bench

Timed runtime of the stack (not `sure bench`, which times type-check):

```bash
sure Sure.Web.bench --run
sure help web
```

Each line runs real `draw` / `step` / `match` / `SSR` / `Sheet.window` work and prints `work=` (a checksum) and `ms=`. `n=0` is no work. Junk clicks and `NOPE` methods keep the model. Empty routes are 404. Sheet's 10 000-row path is a virtual window, not 10 000 DOM nodes.

## Html.App

```
Html.Counter.view(n: Nat): DOM
  Html.el(
    "button",
    Html.on("click", "inc", Map.new<String>),
    Map.new<String>,
    [DOM.text(Nat.show(n))]
  )

Html.Counter.update(msg: String, ev: Html.Event.Data, n: Nat): Nat
  if String.eql(msg, "inc") then Nat.succ(n) else n

Html.Counter: Html.App<Nat>
  Html.App.new<Nat>(0, Html.Counter.view, Html.Counter.update)

Html.Counter.client: Html.Client<Nat>
  Html.Client.of<Nat>(Html.Counter)
```

Unknown messages leave the model. Empty wire keeps the model. `Html.Echo.client` is input + click.

```bash
sure build --html Html.Counter.client
open dist/Html.Counter.client.html
```

Helpers: `Html.button`, `Html.input`, `Html.p`, `Html.text`, `Html.div`. Styling in the shipped apps is Tailwind + daisyUI only.

## HTML DSL

A view can be HTML, not nested `Html.el` / `Html.attr`. `<div` at the start of a term is `DOM`. `List<Nat>` is still a type: the `<` sits after a name.

```
input(kind: String, val: String, ph: String, msg: String): DOM
  <input type={kind} value={val} placeholder={ph} class="input input-bordered w-full" onChange={msg} />
```

| Write | Meaning |
|---|---|
| `<div class="card"> ... </div>` | `DOM.node` |
| `<input ... />` | same as `</input>` (void tags) |
| `class="x"` / `type={kind}` | attribute; `{e}` is the Sure term `e` |
| `onClick="add"` / `onChange={msg}` | `on-click` / `on-change` (camelCase → kebab) |
| `"Add"` as a child | `Html.text("Add")` |
| `{item_view(it)}` | one child `DOM` |
| `for it in xs: item_view(it)` | children from a list |
| `{xs}` when `xs: List<DOM>` | not a child list — use `for` |

`n < m` and `List<Nat>` are not tags. Empty `{ }` is not an attribute. Unknown tags do not parse as HTML.


## Sure.Ui

`sandbox` is init / view / update with no effects.

`element` adds:

```
Sure.Ui.Cmd.none | http url msg | post url body msg | tick ms msg | push msg | batch
Sure.Ui.Sub.none | every ms msg | sse path msg | batch
```

| Border | Meaning |
|---|---|
| Empty Cmd text | `none` |
| Empty HTTP URL | not a request |
| `tick(0)` / `every(0)` | `none` |
| Empty SSE path | `none` |
| Unknown message | model unchanged |

```bash
sure build --html Sure.Ui.Counter.client
sure build --html Sure.Ui.Tick.client    # Sub.every
sure build --html Sure.Ui.Probe.client   # Cmd + Sub edges
sure build --html Sure.Ui.Boot.client    # boot Cmd

cd examples/todo && sure prove && sure build --html App.client && sure run
# open http://127.0.0.1:8775/   add / toggle / filter / drop
```

The page runtime runs Cmd (fetch / timeout / push, depth 32) and Sub (interval / EventSource).

## Sure.Ssr

Server-rendered documents. Empty title is allowed. Empty reply id is `empty_id`. Empty redirect is a 400 page.

```
Sure.Ssr.ok("T", Html.p([Html.text("hi")]))
Sure.Ssr.not_found
Sure.Ssr.bad
Sure.Ssr.get("/", (req, b) IO { return Sure.Ssr.from_page(Sure.Ssr.ok("T", Html.p([]))) })
Sure.Ssr.Reply.sse("ticks")     # empty bus is empty_bus
Sure.Sse.frame("", "hi")        # empty event is message
Sure.Ssr.run(port, routes)
```

`Reply`: `html` | `text` | `json` | `redirect` | `sse`. No clients on a bus is 0. Leftover JSON is not config.

## Sheet and Tweeter

Shipped apps, not toys:

**Sheet** — Excel-like grid, virtual scroll of 10 000 SSE rows, column resize persisted to `surefile:sheet-cols.json`.

```bash
sure build --html Sure.Sheet.client
sure run Sure.Sheet.serve          # :8765 HTML + SSE
```

**Tweeter** — login, session cookie, tweets, file upload.

```bash
sure build --html Sure.Tweeter.client
sure run Sure.Tweeter.serve        # :8766
```

Empty user, empty password, missing session, junk file bytes, and a missing cookie are explicit cases in `Test.suite`. Copy those borders when you write your own app.

## Http.App on the server

```
Http.App.Route.new(Http.Method.get, "/user/:id", handler)
Http.App.fire(routes, req)     # [] → 404 "not found"
Http.App.run(port, routes)
```

`Http.App.match` does not always reduce under `refl`. Assert it in `Test.suite` (junk method, empty method, GET vs POST, empty URL).

Next: [Projects](projects.md).
