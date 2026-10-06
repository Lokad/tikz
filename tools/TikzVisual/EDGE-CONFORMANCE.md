# Fixed straight-edge conformance

Run from the repository root with .NET 10, Node and the pinned development browser:

```text
node tools/TikzVisual/edge-admission-self-test.mjs
node tools/TikzVisual/compare-edge-conformance.mjs
```

The first command checks policy integrity and rejected weakening without TeX,
a PDF executable or a browser. The second owns one fresh
[cached trial](EDGE-CACHED.md), including its exact independent saved-image
checker. It accepts the five fixed straight `to`/`edge` fixtures only when all
eight gates pass: native numeric assertions, conservative declared frames,
primary SVG, derived-driver PDF, candidate PDF, exact native SVG pages,
fresh primary defects and fresh PDF/native defects. Missing views, regions,
checks or sensitivity controls cannot be masked by an aggregate pass.

The [profile](edge-profile.json) fixes the original independent archive and
report hashes, native snapshot, rendering identity, views, gate counts,
defects, cameras, regions, policy hashes and tool source identities. Its limits
come entirely from the independent qualifications. Earlier candidate trial
receipt hashes record the admission's lineage; candidate images and errors
never define expected pixels or limits. No comparison command writes a profile,
reference or acceptance threshold.

The three image claims have different meanings:

- Primary agreement uses independently calibrated local limits against the
  derived driver SVG, with the one verified missing-dot correction recorded.
- Ordinary TikZ PDF agreement uses separate fixed local error limits and exact
  integer RGB ink sums for each selected representation and view.
- Zero-error native-page comparison requires complete RGBA equality against an
  independent SVG reconstruction from retained native instructions. It does
  not claim that browser pixels equal ordinary PDF pixels.

Original SVG-driver diagnostics and all twelve views of its omitted round-cap
dot remain in the raw trial. All 13 image-only defects run with numeric checks
bypassed. The 134 visible primary views must fail their target regions; the
16 black-on-black invisible views must remain unchanged. All 50 visible PDF
defect views must fail both their PDF and independent native targets.

The final stdout record names an exact report path and SHA-256 under
`artifacts/edge-conformance/run-<id>/`. Use that explicit path for saved-proof
integrity controls:

```text
node tools/TikzVisual/edge-admission-self-test.mjs --report artifacts/edge-conformance/run-<id>/report.json
```

Open the sibling `index.html`. Its self-contained bundle retains the fixed
profile, captured sources, owned process log, cached/trial/checker reports,
every trial and checker artifact, paired images, overlays, raw/amplified
differences, defect crops, TikZ sources, scenes and source spans. The detailed
trial gallery remains available under `trial/index.html`. A coding agent can
read the JSON gate results, open the affected images directly and connect a
failing region to its SVG element and source span.

Only the completed admission report claims the scoped profile passed. Raw
qualification, trial and checker reports keep their original unapproved roles.
Failures retain pending reports and logs with no conformance claim. During an
owned child run, converter invocation is unknown until its report is available.

The exact recorded renderer, including OS release, is required. Same-host
checkout reproduction does not qualify a hosted runner. Hosted visual execution,
additional connection interactions, bends, arrows, path labels and broader
TikZ support remain separate work. The production library uses none of this
development tooling and still depends only on .NET 10.

`prepare-edge-admission.mjs` explicitly prepares an ignored candidate profile
from the four hard-pinned qualification receipts. It verifies their saved
artifacts and captures current guard sources. It cannot overwrite the tracked
profile; accepting a prepared profile is a deliberate repository edit.
