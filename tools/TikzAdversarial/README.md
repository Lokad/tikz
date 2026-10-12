# Bounded adversarial inputs

Run from the repository root with .NET 10 and Node.js; no npm packages, browser
or TeX installation are needed:

```text
node tools/TikzVisual/verify-adversarial.mjs
```

At completion, add `--controls` to verify that changed saved code units and a
changed result hash each fail the replay worker for the declared reason. These
two semantic controls run once in Windows CI; positive checks run on both systems.
Shared generic artifact/process controls retain their existing suite identities.

The launcher builds this framework-only development project with locked restore,
then runs generation and saved-input replay as separate bounded worker processes.
It reuses the shared process runner, artifact/path hashing and completed-report
reader. Each worker has a two-minute deadline and a 200,000-byte console limit;
builds have a five-minute deadline. Failed workers retain logs and case details
under ignored `artifacts/adversarial/run-<id>/`.

The fixed seed `0x54494b5a` generates 5,746 inputs: eight valid geometry/node/arrow
seeds, all their truncations, 5,000 deterministic mutations, 256 token streams,
and five stress probes for depth, source length, segments, scopes and arc work.
Tokens include nonfinite arithmetic, unknown keys, forbidden file commands,
NUL, non-ASCII characters and isolated UTF-16 surrogates. These inputs enter
only the managed converter; they never enter a native reference engine.

Every conversion checks normal success/failure behavior, bounded diagnostic
spans, finite successful bounds, XML output and output/work quotas. The valid
seeds must succeed and the five stress probes must return `TIKZ005`. A selected
512-case set adds 2,048 culture comparisons, 512 concurrent comparisons and
64 checks that pre-cancellation preserves the caller's token. Ordinary tests
separately cover ongoing cancellation and the focused expansion, glyph, loop
and geometry limits of advertised features.

`cases.json` retains exact UTF-16 code-unit arrays; its readable `Source` field
may replace malformed surrogates. Replay reconstructs every array, checks it
against the deterministic corpus, invokes the current converter again, and
compares result hashes and success states with `results.json`. It does not treat
the readable JSON field as authoritative input. `selection.json`, `worker.json`,
`replay.json` and the parent `report.json` retain outcomes and source/artifact
hashes. Unexpected exceptions and invariant failures report case identity and
source; completion requires both workers and all current-input bindings to pass.

This is a bounded regression corpus, not exhaustive malformed-input coverage or
a native/image conformance claim. Add a targeted case for a demonstrated gap;
keep focused mechanisms separate from a small justified interaction set. Preserve
existing seed identities when extending the corpus. See the
[verification mapping](../../docs/VERIFICATION.md) for the required checks.
