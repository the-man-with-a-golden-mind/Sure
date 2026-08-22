#!/bin/sh
# Recapture JS-oracle gold. Maintainers run this; CI does not.
# Invokes node bin/js/src/main.js explicitly (never a rust fallback).
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
GOLD="$(CDPATH= cd -- "$(dirname "$SELF")" && pwd)"
ROOT="$(CDPATH= cd -- "$GOLD/../.." && pwd)"
MAIN="$ROOT/bin/js/src/main.js"
HELLO="$ROOT/examples/hello"
NOSHAKE="$GOLD/noshake.js"

if ! command -v node >/dev/null 2>&1; then
  echo "refresh: need node" >&2
  exit 1
fi

js() {
  node --stack-size=10000 "$@"
}

cd "$HELLO"

# Gold (b): shaken FormCore.js show_defs (nats without +, Ann = expr).
js "$MAIN" Main --fmc >"$GOLD/fmc_b_main.fmc"

# Gold (a): pre-shake Defs.core / term_to_core (nats +N, " : ").
js -r "$NOSHAKE" "$MAIN" Hello.demo --fmc >"$GOLD/fmc_a_hello.fmc"

js "$MAIN" prove Hello.Spec | grep -v '^sure time ' >"$GOLD/prove_hello.txt"
printf 'Sure\n' >"$GOLD/run_main.txt"

echo "refreshed $GOLD"
