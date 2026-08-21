# Sure ReScript and performance plan

Status: implemented in tree (Milestones 0–6 host work). ReScript go/stop: keep expanding **pure** modules (`FingerprintPure`, `PathSafe`). Stop JSON/decoder ports that pull `rescript/lib` (`ManifestModel`, `WorkspaceProtocol`) until they compile without a runtime dependency. `main.js` is the CLI composition root over extracted modules.  
Baseline: `da134d51` (`Batch the checker, cache only asked names, and speed Excel.`)

## Outcome

Improve Sure's compiler, CLI and built-in frameworks while incrementally moving maintainable JavaScript tooling to ReScript. ReScript is a tool for safer boundaries and refactoring; it is not itself a performance optimization.

The work has two coordinated tracks:

1. **Performance:** measure and fix compiler, build, cache and browser-runtime bottlenecks.
2. **ReScript:** migrate one bounded module at a time behind stable JavaScript-compatible interfaces.

Every migration must preserve behavior, startup time, generated output and package compatibility. Performance work starts before the first conversion and continues throughout it.

## Non-goals

- Do not rewrite the Sure language, type theory or syntax.
- Do not rewrite generated `bin/js/src/sure.js` by hand.
- Do not change FormCore or bootstrap output as part of the ReScript migration.
- Do not combine CommonJS-to-ESM conversion with the initial migration.
- Do not replace the browser renderer with React or another external UI framework.
- Do not claim a speedup without a reproducible benchmark.
- Do not perform a repository-wide AI translation.

## Current baseline

The `da134d51` pass already addresses several findings from the audit:

- Node is now the default compiler runtime; Bun is opt-in.
- Project theorem checks use a shared `Synth.many` workspace.
- Only requested completed definitions are written to the cache.
- Standard-library source hashing reuses a digest when file metadata is unchanged.
- `sure watch` reuses one process.
- Browser scroll and mouse-move updates are coalesced with `requestAnimationFrame`.
- Emitted pages bind a smaller core event set.
- Excel stores edited cells in `Map<String>` instead of a linear `List<Cell>`.
- Excel remains row-virtualized and uses inline pixel styles.
- Tailwind and daisyUI are limited to examples that request them.

These changes are the new baseline, not yet the end state. Known remaining risks include:

- The complete post-change test and benchmark matrix needs to be recorded.
- `bin/js/test-ui-pages.js` still expects 122 listeners, while newly emitted pages bind the smaller event set.
- The generated browser scheduler assumes `requestAnimationFrame` exists and lacks a tested fallback.
- UI updates still replace `root.innerHTML` and scan the rendered subtree in `applyPx`.
- `sure watch` resets the entire workspace after any source change.
- A new CLI process still discovers/stats the source tree before it can reuse the digest.
- Build/check/prove paths can ask overlapping questions of the checker instead of submitting one build request.
- Cache format versioning, atomic writes, garbage collection and no-op-write guarantees are incomplete.
- `main.js` remains a 3,500-line coordination module.

Historical measurements from the audit, before `da134d51`, are guardrails rather than the new baseline:

| Scenario | Historical result |
|---|---:|
| Warm CLI startup | 0.18-0.33 s |
| Hello cold `sure run` | 3.21 s |
| Hello warm `sure run` | 1.17 s |
| `Excel.client` check | 45.95 s |
| Full Node test suite | 129.79 s |
| `File.bracket` on Node | 1.81 s |
| `File.bracket` on Bun | 124.15 s |
| Existing `base/.cache` | 43 MB / 10,863 files |

## Rules for the work

1. Establish a benchmark before changing a hot path.
2. Keep a JS facade when replacing a module so callers do not change simultaneously.
3. Compare observable behavior: stdout, stderr, exit status, JSON, files and generated JS.
4. Inspect generated `.res.js`; typed source alone is not evidence of equivalent runtime behavior.
5. Keep the old implementation available for one milestone and dual-run it in tests.
6. One subsystem per pull request; do not mix migration, behavior changes and optimization unless the benchmark requires it.
7. Treat unsafe externals as boundary code. Domain modules receive typed records and variants.
8. AI may draft a conversion, but characterization tests and measured output decide whether it is accepted.

## Milestone 0: verify and instrument the current baseline

Do this before adding ReScript.

### Correctness repairs

- Update the live-page harness to assert the actual emitted event set rather than 122 listeners.
- Add a scheduler helper that uses `requestAnimationFrame` when available and a tested fallback otherwise.
- Test that many scroll/mouse-move events produce at most one update per frame and that the last event wins.
- Test focus, selection, checkbox state and scroll restoration across redraws.
- Run the full Node suite after the batch-check/cache changes.
- Run Bun only for emitted-program compatibility and a small smoke matrix; do not run the compiler suite on Bun by default.
- Regenerate the compiler blob once and require byte-for-byte equality with the committed blob.

### Benchmark harness

Add a Node-based harness under `bin/js/perf/` that emits JSON. It must record:

- command, commit, OS, architecture, Node/Bun version and CPU;
- cold, warm-in-process and no-op-as-new-process cases separately;
- median, p95, minimum, maximum and sample count;
- wall time, peak RSS, cache bytes/files and files written;
- exit code and a digest of relevant output.

Do not use the fastest sample as the headline number. Keep raw samples in CI artifacts and commit a small reference baseline.

### Required scenarios

- CLI: `--version`, `help`, `doc Nat.add`.
- Checker: one small term, a missing term, a term with a hole, `Excel.client`.
- Project: hello prove/build/run, Excel prove/build, warm no-op build.
- Suite: bounded `sure test`, `Test.main`, coverage and bootstrap regeneration.
- Cache: clean, populated, no-op and one-file-change cases.
- Browser: Counter input, Todo update, Excel scroll, edit and column resize.
- Server frameworks: one HTTP route, one SSR page and one in-memory DB operation.

### Initial regression ceilings

Until a post-`da134d51` baseline is committed, CI must at least stay below the historical guardrails:

- warm CLI p95: 350 ms;
- warm Hello run: 1.2 s;
- `Excel.client` check: 46 s;
- full Node suite: 130 s;
- no-op cache operation: zero rewritten definition files.

After ten stable CI samples, replace these with the median baseline plus a 15% regression allowance. Keep performance CI separate from correctness CI so noisy timing does not hide correctness failures.

### Exit gate

- All correctness commands pass from a clean clone.
- Browser tests match the smaller event set and exercise scheduling.
- A machine-readable baseline exists.
- CI exposes timing and cache-size regressions.

## Milestone 1: finish compiler and build performance work

This milestone should produce larger user-visible gains than the language migration.

### One build request

Replace the sequence “check entry term, check modules, prove each theorem, compile entry term” with one workspace request containing:

- entry term;
- project modules;
- manifest theorems;
- requested output format;
- whether completed proofs and residual-hole checks are required.

Load definitions once, return one structured report, then emit from the same checked definition set. Keep the old single-name calls only as compatibility wrappers.

Target: a project build performs one definition-loading pass and never calls the per-term fallback on a successful build.

### Incremental workspace

Turn `workspace.js` into a real dependency-aware workspace:

- index modules and term ownership once;
- track source digest and dependencies per module/definition;
- invalidate the changed definition and transitive dependants only;
- retain unaffected parsed and checked definitions during `sure watch` and LSP sessions;
- debounce changes, but never drop the final filesystem event;
- cancel or supersede stale checks when another edit arrives.

Target: a leaf edit in watch mode is at least 5x faster than a cold check and does not reload unrelated standard-library definitions.

### Cache correctness and cost

- Add a cache schema/compiler version to every entry.
- Use content identity for correctness; size and mtime may only be an accelerator.
- Write through a temporary file and atomically rename complete entries.
- Do not rewrite an identical cache entry.
- Keep a small index so startup does not scan thousands of cache files.
- Add bounded cleanup by version and last access.
- Add `sure cache stats` and `sure cache clean` commands.

Targets:

- no-op check writes zero cache entries;
- cache growth is proportional to requested/changed definitions;
- interrupted writes cannot create a valid-looking partial entry;
- cache cleanup never touches files outside the resolved Sure cache directory.

### Source/build fingerprints

The current metadata digest avoids rereading content but still discovers and stats the tree. Introduce a versioned source index:

- installed releases carry a precomputed digest for the immutable bundled standard library;
- development mode updates the index for changed paths;
- manifest, compiler blob, host generator version, runtime choice and emission options remain fingerprint inputs;
- a periodic or explicit verification mode recomputes content hashes to detect stale metadata.

Target: a warm no-op build spends less than 100 ms in discovery and fingerprinting on the reference machine.

### Profile before lower-level optimization

Collect CPU profiles for cold Excel check, full tests and bootstrap. Optimize only demonstrated hot paths. Candidate areas are parsing, substitution/reduction, term display, map lookup and generated-code allocation. Do not parallelize type checking until the dependency and shared-state model proves it safe; parsing and hashing are safer first candidates.

### Exit gate

- Full suite is at least 30% faster than the recorded Milestone 0 baseline, or profiles demonstrate that remaining time is irreducible work with an agreed revised target.
- Warm no-op project build is at most 750 ms.
- Cache no-op writes are zero.
- Watch mode demonstrates dependency-scoped invalidation.

## Milestone 2: fix the emitted browser runtime

### Scheduler and event delegation

- Emit or derive only the event types required by the application/runtime contract.
- Centralize frame scheduling rather than duplicating it for `Html.Client` and `Sure.Ui.Client`.
- Coalesce continuous events such as scroll and pointer movement.
- Preserve every discrete event such as click, submit and keyboard activation.
- Define behavior when a step schedules another update during drawing.

### Stop replacing the complete DOM

Use two steps rather than jumping directly to a complex virtual DOM:

1. Skip DOM work when the rendered output is unchanged; update text/value/checked attributes in place for simple nodes.
2. Add a small keyed patcher for lists and stable subtrees.

Required behavior:

- keys are stable and unique among siblings;
- input focus and selection survive unrelated updates;
- scroll containers retain position without an O(n²) search;
- removed nodes release subscriptions/resources;
- unsafe HTML remains impossible through ordinary framework APIs.

Keep the string renderer for SSR and snapshots. The client renderer may use a structured DOM representation internally.

### Remove full-tree style repair

`applyPx` currently scans the rendered subtree. Move unit handling into style serialization so the emitted HTML already contains valid CSS units. Retain `applyPx` only as a compatibility fallback, measure its use, then remove it.

### Browser budgets

On the reference machine and a production build:

- Excel scroll/update frame p95 <= 16.7 ms;
- no task over 50 ms during a five-second continuous scroll;
- Counter and Todo input-to-render p95 <= 50 ms locally;
- no listener growth after remount/navigation;
- heap returns close to steady state after repeated list replacement;
- generated JS and CSS size may not grow more than 10% without an explicit reason.

### Exit gate

- Real-browser tests cover Counter, Todo and Excel.
- The normal update path no longer assigns complete `root.innerHTML`.
- Focus, selection, scrolling and subscription cleanup have regression tests.

## Milestone 3: optimize built-in frameworks by evidence

Create a small benchmark application for each framework. Do not share one giant benchmark because it hides ownership of regressions.

### `Html.Client` and `Sure.Ui`

- Share one scheduler, event protocol and patcher.
- Pre-encode static DOM fragments where possible.
- Avoid recreating unchanged property/style maps.
- Track render, patch and command/subscription time separately.

### Excel/Sheet

The `Map<String>` conversion removes linear edited-cell lookup. Continue with:

- maintain row virtualization for all data sizes;
- benchmark 0, 100, 1,000 and 10,000 edited cells;
- update only visible dirty cells;
- separate scroll position from persistent workbook state;
- avoid serializing unchanged widths/cells;
- test paste-sized batches rather than only single-cell edits.

### SSR and HTTP

- Measure route matching, request decoding, rendering and response writing independently.
- Precompile route tables if matching is a measured bottleneck.
- Cache immutable static responses with explicit invalidation.
- Stream large responses only if profiling shows buffering is material.
- Add concurrency and cancellation tests before introducing pooling or workers.

### Db and JSON

- Benchmark codec and database boundaries separately from application work.
- Reuse prepared statements/connections where the host backend supports it.
- Avoid stringify/parse round trips inside a single trusted host boundary.
- Preserve typed decoding at external boundaries; performance is not permission to accept malformed data.

### CSS/assets

- Keep Tailwind/daisyUI opt-in.
- Produce static, cacheable CSS for examples that use them.
- Do not load a CDN compiler in generated production pages.
- Report emitted JS, CSS and HTML byte sizes in the benchmark artifact.

## Milestone 4: introduce ReScript with a pilot

Begin only after Milestone 0. It may run alongside Milestones 1-3, but it cannot replace their benchmarks.

### Toolchain decision

Use a pinned ReScript release and committed lockfile. ReScript v12's build tooling requires Node 20.11+, while Sure currently advertises Node 18+ at runtime. Keep those contracts separate initially:

- development/CI ReScript build: Node 20.11+;
- published Sure CLI runtime: continue testing Node 18, 20 and 22 until support is deliberately changed;
- publish generated CommonJS `.res.js`, so users do not need the ReScript compiler;
- verify whether generated modules import `@rescript/runtime`; if so, package it as a runtime dependency and measure install/package size.

Initial `rescript.json` policy:

- source files live beside tooling in `bin/js/src`;
- CommonJS output with suffix `.res.js`;
- generated output is committed and checked for drift in CI;
- namespace is enabled;
- warnings used by the project are errors;
- `.resi` interfaces define every migrated boundary.

Do not wrap ReScript with Sure's own incremental builder. Let ReScript own `.res` dependency tracking and call it once from development scripts.

### Pilot modules

Do not start with `main.js`, `lsp.js`, the browser runtime or generated compiler code. Implement:

1. typed manifest/build-stamp models and JSON decoders;
2. workspace request/report/diagnostic types;
3. one pure project dependency or fingerprint helper.

Expose each through an unchanged CommonJS facade. In tests, run JS and ReScript implementations on the same fixture corpus and compare normalized results.

### Pilot acceptance criteria

- All malformed/missing/empty JSON and path cases have tests.
- JS and ReScript outputs are equivalent for the fixture corpus.
- CLI startup regression is below 5% or below measurement noise.
- No measured checker/build path regresses more than 5%.
- ReScript no-op compilation stays below 150 ms on the reference machine.
- Packed CLI installs and runs without the ReScript compiler present.
- Generated JS is readable enough to profile and debug.
- The team can modify the pilot without relying on AI to explain its types.

If these conditions are not met, keep the typed protocol definitions but stop the broader migration. TypeScript/JSDoc remains a valid lower-cost fallback.

## Milestone 5: incremental ReScript migration

Migrate in dependency order, not file-size order.

### Wave 1: pure and bounded tooling

- manifest/config models;
- build stamps and fingerprints;
- diagnostics and JSON protocols;
- coverage and pure quick-check helpers;
- safe output-name/path helpers.

### Wave 2: stateful services

- `workspace.js` after incremental invalidation is specified;
- project management;
- agent command protocol;
- command implementations.

Represent workspace state with an opaque type. Use variants for checker state and diagnostics instead of strings/regexes. Keep filesystem, process and generated-kernel values behind narrow external bindings.

### Wave 3: LSP

Port only after semantic fixtures exist for:

- definition and references;
- same-spelling local binders;
- imports, aliases and exposing rules;
- rename across files;
- stale documents and cancellation;
- malformed/incomplete source during editing.

The migration must not preserve spelling-based cross-file rename as “typed” behavior. Symbol identity must come from resolved definitions.

### Wave 4: split and shrink `main.js`

First extract stable modules for arguments, paths, check/build, run and presentation. Then port the extracted modules. Keep `main.js` as a thin composition root until the final wave.

### Wave 5: host-side emission utilities

Port safe filenames, HTML wrapping and serialization helpers. Keep the embedded browser runtime as independently tested JavaScript until Milestone 2 is complete; translating a JavaScript string generator to ReScript provides little safety by itself.

### Code that remains JavaScript/generated

- `sure.js` generated compiler blob;
- bootstrap output;
- FormCore-generated code;
- tiny performance-critical FFI after profiling justifies it;
- the old self-test oracle until migration completion.

## Milestone 6: packaging and retirement

- Make `npm pack` part of CI and install the tarball into a clean directory.
- Test published artifacts on the supported Node runtime matrix.
- Ensure source maps resolve to `.res` sources without requiring local paths.
- Run `rescript build` in CI and fail on generated `.res.js` drift.
- Remove a JS implementation only after its ReScript replacement passes dual-run tests for one full milestone.
- Remove feature flags/fallbacks after all supported platforms use the replacement.
- Update contributor docs with build, watch, formatting, FFI and debugging instructions.

Migration is complete when `main.js` is only composition/entry-point code, ordinary tooling logic is typed, generated compiler code is still reproducible, and all performance budgets remain green.

## Pull-request sequence

The intended order is:

1. Fix browser harness assumptions and scheduler fallback.
2. Add benchmark runner, baseline artifact and CI reporting.
3. Collapse build/prove into one workspace request.
4. Add cache versioning, atomic/no-op writes and stats.
5. Add dependency-scoped watch/LSP invalidation.
6. Introduce browser patching and real-browser benchmarks.
7. Add ReScript toolchain and the three-module pilot.
8. Decide go/stop on broader ReScript conversion using pilot evidence.
9. Convert Waves 1-5 in small PRs while continuing framework work.
10. Harden packaging, remove fallbacks and ratchet budgets.

## Definition of done

- A clean clone passes host generation, bootstrap integrity/regeneration, full tests, coverage, project fixtures and real-browser tests.
- Node is the supported compiler runtime; Bun compatibility is tested for emitted applications.
- One project build loads and checks one workspace graph.
- Warm watch checks invalidate only affected definitions.
- No-op checks rewrite no cache files.
- Browser updates patch affected nodes without complete DOM replacement.
- Excel remains responsive with 10,000 edited cells as well as 10,000 virtual rows.
- ReScript-generated modules preserve the CLI's external CommonJS behavior and supported Node runtime range.
- Performance results are versioned, reproducible and enforced in CI.
- Generated compiler/bootstrap output remains byte-for-byte reproducible.

## ReScript references

- [Converting JavaScript incrementally](https://rescript-lang.org/docs/manual/converting-from-js)
- [Build configuration and CommonJS `.res.js` output](https://www.rescript-lang.org/docs/manual/build-configuration/)
- [Interop with JavaScript build systems](https://rescript-lang.org/docs/manual/interop-with-js-build-systems/)
- [Build and incremental performance](https://rescript-lang.org/docs/manual/build-performance)
- [ReScript v12 migration and Node build requirement](https://rescript-lang.org/docs/manual/migrate-to-v12/)
