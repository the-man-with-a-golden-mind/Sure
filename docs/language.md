# Language

Every Sure program is a set of top-level terms. A term has a name, a type, and a body.

```
Nat.add(n: Nat, m: Nat): Nat
  case n {
    zero: m
    succ: Nat.succ(Nat.add(n.pred, m))
  }
```

The exhaustive desugaring list lives in [SYNTAX.md](../SYNTAX.md). This chapter is what you write day to day.

## Modules

A `.sure` file is a **module**. Put `module Tweeter exposing (..)` at the top. `Sure.Parser.file` elaborates the header: names **inside** the file are unqualified; outside they are `Tweeter.ok_user`.

```
module Tweeter exposing (..)

type Sess {
  none
  some(sid: String, user: String)
}

ok_user(s: String): Bool
  if String.is_empty(s) then false else true

init: Model
  Model.new("", Sess.none, [])
```

From another file you still write `Tweeter.ok_user` and `Tweeter.Sess.none`. `sure Tweeter.ok_user` checks that name.

Other files must **import** the module. Only names in `exposing` are public.

```
import Boxes                       # Boxes.empty, Boxes.push
import Boxes exposing (empty, len) # empty, len
import Boxes exposing (..)         # every name currently defined in Boxes
```

`module Boxes exposing (Boxes, empty, push, len)` hides the rest (`len_empty` stays private). Exposing a type also exposes its constructors (`Boxes.new`, `Sess.none`). Stdlib (`Nat.add`) needs no import. Compilation drops unused names: a `Main` that only calls `demo` does not emit private proofs or unused host slices.

When the checker looks up `Tweeter.ok_user` it tries files in this order:

| Order | File | Role |
|---|---|---|
| 1 | `Tweeter.sure` | the module |
| 2 | `Tweeter/ok_user.sure` | a split file, if the module grew too large |

The first file that parses **and actually contains the name** wins. Nested files are a layout choice, not a rule. Stdlib still uses splits (`Nat/add.sure`); new code should keep related functions in one module file.

```
module Add exposing (..)

Add(n: Nat): Nat
  Nat.add(n, 2)

two: Add(2) == 4
  refl
```

`sure Add.two` finds `two` inside `Add.sure`.

A **library** is a package (`sure.json` `"type": "package"`) with one or more modules under `src/`:

```
src/Boxes.sure      # Boxes.empty, Boxes.push, Boxes.len
src/Audit.sure      # Audit.report
```

```json
"exposed-modules": ["Boxes", "Audit"]
```

Dependents may use only exposed modules. Stdlib names (`Nat.add`, `List.map`) are always in scope. Project terms live under `src/` (`SURE_PATH`). Empty names are not modules.

## Types you live in

```
type Bool {
  true
  false
}

type Nat {
  zero
  succ(pred: Nat)
}

type List <A: Type> {
  nil
  cons(head: A, tail: List<A>)
}

type Maybe <A: Type> {
  none
  some(value: A)
}

type Pair <A: Type, B: Type> {
  new(fst: A, snd: B)
}

type Outcome <E: Type, A: Type> {
  err(error: E)
  ok(value: A)
}
```

`String` is its own datatype (`nil` / `cons` of `Char`), not `List<Char>`. `"hi"` is a `String`. `'a'` is a `Char` (`Word(16)`).

A term may be HTML. `<div class="card" onClick="inc">"Add"</div>` is `DOM`. `{e}` in an attribute is the Sure term `e`. `{kid}` as a child is one `DOM`. `for x in xs: item(x)` fills children from a list. `<input ... />` closes the tag. `List<Nat>` is still a type — the `<` comes after a name. See [Web](web.md).

A type with one constructor is a record. `open` unpacks it:

```
type Path {
  new(text: String)
}

Path.text(p: Path): String
  open p
  p.text
```

Indexed types exist (`Vector`, `Equal`, `Fin`). The `~` after the name is an index — it can change per constructor. See `Equal` in [Prove](prove.md).

## Functions

```
name(arg0: T0, arg1: T1): R
  body
```

Lambdas are `(x) body` — no `=>`. Multi-arg `(x, y) body` is `(x) (y) body`. Application is `f(x)` with **no space**. Type arguments often use `<>`: `List.map<Nat, String>(f, xs)`. `f!` is `f(_)`.

```
(n: Nat) -> Vector<Bool, n>
```

is a self-dependent function: the return type uses `n`. If you do not need the name, `Nat -> Nat` is enough.

## Local values

```
let x = heavy(n)
x + x
```

`let` binds a variable. The checker does **not** treat `x` as definitionally equal to `heavy(n)`.

```
def x = f(42)
x + x
```

`def` substitutes at compile time. Both sides see `f(42)`. Use `def` when you need the checker to unfold.

You may omit `let`:

```
a = 1
b = 2
a + b
```

## Case

```
sum(xs: List<Nat>): Nat
  case xs {
    nil: 0
    cons: xs.head + sum(xs.tail)
  }
```

Fields of the matched constructor are `name.field`. `as` names a non-variable:

```
case [1, 2, 3] as xs {
  nil: 0
  cons: xs.head
}
```

`default` covers the rest. Several values can be matched together. A motive (`: T` or `!`) specialises the return type per constructor — that is how proofs reduce. Details in [Prove](prove.md).

`open` is `case` for a single-constructor type.

`if b then t else f` is a boolean branch.

```
switch String.eql(s) {
  "A": "a"
  "B": "b"
} default "?"
```

is a chain of `if` on one `A -> Bool` function (here `String.eql(s)`).

`case` matches constructors. It is the wrong tool for “reject empty, spaces, newlines”. For a table of independent tests, first true wins:

```
ok_user(s: String): Bool
  when {
    String.is_empty(s): false
    String.includes(s, " "): false
    String.includes(s, "\n"): false
    String.includes(s, "&"): false
    String.includes(s, "="): false
  } default true
```

That is the nested `if` you would have written. `default` is required.

When the rule is “nonempty and none of these substrings”:

```
ok_user(s: String): Bool
  String.ok(s, [" ", "\n", "&", "="])
```

`String.has_none(s, xs)` is the same without the empty check. Empty `xs` is `true`. Empty `s` fails `String.ok`.

## Lists, maps, strings

```
[1, 2, 3]                 // List
1 & 2 & []                // cons
xs ++ ys                  // List.concat
{"a": 1, "b": 2}          // Map
map{"a"} <> 0             // get with default
map{"a"} <- 9             // set
"Hello" | " " | "Sure"    // String.concat
some(7)                   // Maybe.some
none                      // Maybe.none
{1, "x"}                  // Pair.new
```

`42` is `Nat`. `+42` / `-42` are `Int`. `42#32` is `U32`. `42.0` is `F64`. Hex `0xff` is allowed where a number is.

## IO

```
type IO <A: Type> {
  end(value: A)
  ask(query: String, param: String, then: (response: String) -> IO<A>)
  par<X: Type, Y: Type>(left: IO<X>, right: IO<Y>, join: (xy: Pair<X, Y>) -> IO<A>)
  race<X: Type, Y: Type>(left: IO<X>, right: IO<Y>, join: (e: Either<X, Y>) -> IO<A>)
}
```

Do-notation:

```
Main: IO<Unit>
  IO {
    IO.print("hello")
    get line = IO.get_line("name?")
    IO.print("hi " | line)
    return unit
  }
```

`get x = m` binds. A bare monadic action is run and dropped. `return` is `Monad.pure`. The block is `IO` (the monad name). `List { get x = …; return … }` is the list monad.

Application IO goes through **Host**: a typed `Host.Op`, encoded as `(query, param)`, asked, then decoded to `Host.Event`. `File.read`, `Sure.Env.get`, `Http.request` are Host. `Host.unsafe.ask` is the string hatch. Prefer the typed wrappers.

## Holes and goals

`_` is a unification hole. `f!` is `f(_)`. After checking, a leftover `_` is **not** a proof: `sure check`, `sure prove`, and `sure build` reject residual holes. `admit` is an explicit goal (`?admit`) and also fails prove/build.

`?name` is a goal. The checker prints the expected type and the context. Leave goals while you work; they must be gone before `sure build`.

```
Nat.add(n: Nat, m: Nat): Nat
  case n {
    zero: ?base
    succ: ?step
  }
```

`sure goal Term` lists remaining holes. `?implement` is the hole `sure fill` replaces.

## Comments and package headers

```
module Foo exposing (bar, Baz)
import Nat exposing (add)
```

`Sure.Parser.file` reads those headers. A `// module` / `// import` line is a comment and is ignored. A package's dependents may only use `exposed-modules`. See [Projects](projects.md).

A `//` line above a definition is what `sure doc Term` prints.

## What is not here

- No `null`, no exceptions. `Maybe`, `Outcome`, `Empty`.
- No universe levels. `Type : Type`.
- No implicit termination checker. Recursion is allowed. Proofs that recurse on a predecessor are the induction you write yourself.
- The host is JavaScript. There is no Chez / Scheme runtime.

Next: [Prove](prove.md).
