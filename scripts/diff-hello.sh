#!/bin/sh
# Live rust vs JS on the hello slice (prove / run / --fmc).
# JS is node bin/js/src/main.js, never a hidden fallback.
set -eu
SELF="$0"
while [ -L "$SELF" ]; do
  DIR="$(CDPATH= cd -- "$(dirname "$SELF")" && pwd)"
  LINK="$(readlink "$SELF")"
  case "$LINK" in
    /*) SELF="$LINK" ;;
    *) SELF="$DIR/$LINK" ;;
  esac
done
ROOT="$(CDPATH= cd -- "$(dirname "$SELF")/.." && pwd)"
HELLO="$ROOT/examples/hello"
MAIN="$ROOT/bin/js/src/main.js"

if [ -n "${SURE_RUST:-}" ]; then
  RUST="$SURE_RUST"
elif [ -x "$ROOT/target/debug/sure" ]; then
  RUST="$ROOT/target/debug/sure"
elif [ -x "$ROOT/target/release/sure" ]; then
  RUST="$ROOT/target/release/sure"
else
  echo "diff-hello: build rust first (cargo build -p surec) or set SURE_RUST" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "diff-hello: need node for the JS oracle" >&2
  exit 1
fi

js() {
  node --stack-size=10000 "$MAIN" "$@"
}

rust() {
  "$RUST" "$@"
}

normalize_prove() {
  grep -v '^sure time ' | sed -e 's/[[:space:]]*$//'
}

sort_fmc() {
  python3 -c '
import sys
text = sys.stdin.read()
defs = {}
for block in text.strip().split(";\n"):
    block = block.strip().rstrip(";")
    if not block:
        continue
    name, rest = block.split(":", 1)
    defs[name.strip()] = rest.strip()
for name in sorted(defs):
    sys.stdout.write("%s: %s;\n" % (name, defs[name]))
'
}

TMP="${TMPDIR:-/tmp}/sure-diff-hello.$$"
mkdir "$TMP"
trap 'rm -rf "$TMP"' EXIT

cd "$HELLO"
failed=0

echo "== prove Hello.Spec =="
rust prove Hello.Spec | normalize_prove >"$TMP/rust-prove.txt"
js prove Hello.Spec | normalize_prove >"$TMP/js-prove.txt"
if ! diff -u "$TMP/js-prove.txt" "$TMP/rust-prove.txt"; then
  failed=$((failed + 1))
fi

echo "== run Main (program stdout) =="
# Compile noise is not gold; the program must print Sure.
rust_run=$(rust run --force | grep -x "Sure" || true)
js_run=$(js run --force | grep -x "Sure" || true)
if [ "$rust_run" != "Sure" ] || [ "$js_run" != "Sure" ]; then
  echo "run mismatch rust=${rust_run:-<none>} js=${js_run:-<none>}"
  failed=$((failed + 1))
else
  echo "ok   Sure"
fi

echo "== Main --fmc (gold b, sorted) =="
rust Main --fmc | sort_fmc >"$TMP/rust-fmc.txt"
js Main --fmc | sort_fmc >"$TMP/js-fmc.txt"
if ! diff -u "$TMP/js-fmc.txt" "$TMP/rust-fmc.txt"; then
  failed=$((failed + 1))
fi

echo "== host slice =="
if [ ! -f "$HELLO/dist/Main.js" ]; then
  rust build --force >/dev/null
fi
if ! grep -q put_string "$HELLO/dist/Main.js"; then
  echo "missing put_string in dist/Main.js"
  failed=$((failed + 1))
fi
if grep -q http_listen "$HELLO/dist/Main.js"; then
  echo "unexpected http_listen in dist/Main.js"
  failed=$((failed + 1))
fi

if [ "$failed" -ne 0 ]; then
  echo "diff-hello: $failed mismatch(es)"
  exit 1
fi
echo "diff-hello: ok"
