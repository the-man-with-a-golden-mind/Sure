# Prove

The type checker is the prover **for completed terms**. A theorem is a well-typed equality/`Equal` (or `Not(Equal(...))`) whose body contains no residual `_` / `admit` / `?hole`. People and AI use the same loop: write a term → `sure prove` → repair.

`sure check` type-checks any definition. `sure prove` fails unless every requested name is a completed proposition. Aggregate JSON `proved` is true only when every result is proved. `Nat.add` can check and still have `"proved": false`. `_` does not prove `Nat.add(2,2) == 5`.

```
Example.Spec.add2: Nat.add(2, 2) == 4
  refl
```

```bash
sure prove Example.Spec.add2
sure prove                    # sure.json theorems + src scan
sure prove --json Spec.add2   # proof_obligation when it fails
sure build                    # check, prove, then emit
```

List names in `sure.json` `"theorems"`. `sure new` writes `src/Spec.sure`.

## Equal

```
type Equal <A: Type> <a: A> ~ (b: A) {
  refl ~ (b = a)
}
```

`a == b` is `Equal(_, a, b)`. It is **not** `Bool`. `a != b` is `Not(Equal(_, a, b))`.

`refl` proves `x == x`, and anything that **reduces** to that:

```
two: (1 + 1) == 2
  refl
```

`Nat.add(1, 1)` computes to `2`, so both sides are the same.

## When `refl` is not enough

```
Bool.not(b: Bool): Bool
  case b {
    true: false
    false: true
  }
```

`Bool.not(Bool.not(b)) == b` does **not** reduce: the inner `case` is stuck on the variable `b`. Pattern-match, then ask the motive to specialise (`!`):

```
double_negation(b: Bool): Bool.not(Bool.not(b)) == b
  case b {
    true: refl
    false: refl
  }!
```

On the `true` branch the goal becomes `not(not(true)) == true`, which reduces to `true == true`. Same for `false`.

Rule of thumb:

1. Try `refl`.
2. If a function is stuck on a variable, `case` that variable.
3. Put `!` (or an explicit motive) so each branch sees the specialised equation.
4. Recur on a *smaller* argument to get an inductive hypothesis.
5. Reuse earlier lemmas (`Equal.rewrite`, `apply`, `mirror` / `Prove.sym`).

Inspect a stuck goal with `?hole-` and reduce labelled redexes (`?hole-18`). The long walkthrough is [THEOREMS.md](../THEOREMS.md).

## Induction is recursion

```
Nat.add.zero(n: Nat): n == Nat.add(n, 0)
  case n {
    zero: refl
    succ: apply(Nat.succ, Nat.add.zero(n.pred))
  }!
```

The `succ` case calls the same lemma on `n.pred`. That term has type `n.pred == add(n.pred, 0)`. `apply(Nat.succ, …)` adds `succ` to both sides. That is induction. There is no extra keyword.

## Rewrite

When you have `e: a == b` and a goal that mentions `a`, rewrite the goal:

```
p0 :: rewrite X in Nat.succ(X) == _ with p1
```

`Equal.rewrite` substitutes equals for equals. `Prove.sym`, `Prove.trans`, `Prove.cong` are the usual combinators.

## What belongs in a spec

Good theorems:

```
Spec.add2: Nat.add(2, 2) == 4
  refl

Spec.len: List.length<Nat>([1, 2, 3]) == 3
  refl

Spec.path: Http.Path.bound("/user/:id", "/user/1", "id") == "1"
  refl

Spec.empty_path: Outcome.is_ok<Path.Err, Path>(Path.from_string("")) == false
  refl
```

They are empty, junk, and border cases — the same shape as `Test.suite`. A lemma that only aliases a name without reducing is not a proof.

Functions that do **not** reduce under `refl` (deep `open` / `if` / `case` that the checker will not unfold) belong in `Test.suite` as runtime units:

```
Test.unit("match junk method",
  Test.bool(Maybe.is_none<List<Pair<String, String>>>(
    Http.App.match(Http.Method.get, "/", Http.Server.Req.new("", "NOPE", "/", "", ""))), true))
```

`sure test` runs the bounded prover list, bounded checks, `Main`, `Test.host`, `Test.ci`, then prove-edge cases. It does not run `Prove.all` or `Test.main`. A failing unit or a false equality exits 1.

## AI loop

```bash
sure agent --client prove Example.Spec.add2
sure agent --client check Nat.add
sure fill 'code|||Term'     # replace ?implement and recheck
sure goal Term
sure qc Nat.add.comm        # sample a lemma
sure gen JSON.dec.bool      # tests and proofs from a type
```

`sure agent` is JSON-RPC. The checker is the source of truth: propose → prove → repair. Failed equalities are `proof_obligation`.

## Limits

- `Type : Type` plus recursion admits paradoxes. That is intentional. Proofs are compile-time facts about *this* program, not a consistency kernel.
- Do not `refl` a computation that will not terminate in the checker (huge Peano `Nat.random`, parsers that unfold `many` forever). Parameterise the lemma, or test it at runtime.
- Do not bind hundreds of `Equal` proofs into one `Unit`. Check them individually. `Cover.all` is the trusted bundle; extra cover files stay unbundled on purpose.

Next: [Standard library](stdlib.md).
