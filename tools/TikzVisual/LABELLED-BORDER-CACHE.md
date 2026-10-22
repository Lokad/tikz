# Portable labeled-border evidence and scoped admission

The three trusted `LabelledBorders` fixtures now have a checked-in independent
[calibration cache](../../tests/Reference/LabelledBorders/conformance/calibration.json.gz).
It freezes the existing primary and ordinary-PDF allowances and native-page
visibility expectations. It supplies no new tolerance and admits no broader
TikZ scope. The separate [immutable profile](labelled-border-profile.json) admits
only these three fixtures under `chromium-153-native-pgf-labelled-borders-v1`.

```text
node tools/TikzVisual/labelled-border-cache-self-test.mjs
node tools/TikzVisual/compare-labelled-border-conformance.mjs
node tools/TikzVisual/labelled-border-admission-self-test.mjs
```

Finish the comparison before starting its admission checker. These commands use
only tracked reference files, .NET 10, Node and the pinned development browser.
They require no ignored research bundles, TeX installation or PDF executable.
The reference records, fonts and rasterizer pages come from the original
independent investigations. The public trial invokes the framework-only
`TikzLabelledBorderComparison` exporter after verifying the independent images.
The admitted command owns both the trial and its saved-image checker. It consumes
their exact completion records, report paths and SHA-256 values; the checker
receives an explicit GUID trial report rather than a latest pointer. Both child
reports and all their artifacts are copied byte-for-byte into the admitted bundle.

The subsequent admission controls capture their own current source under
`control-sources/` and record its identity separately from the producer's guarded
dependencies. Editing only that control program allows reuse of an unchanged
producer bundle after running the current controls against its exact report.
The controls reject stale/missing control provenance and changed report bindings.
Producer/checker code, native inputs, renderer, image policies and candidate
sources retain their existing guards and fresh-evidence requirements.

## Frozen evidence

The 8,046,719-byte gzip cache has SHA-256
`f696141b6a17ee0d17d9c6fa1e176cd456a165f775febeec6d8c7dcae921ca8f`.
Its decoded 75,212,448-byte JSON has SHA-256
`3d4253d6c9fe09b1d099bf33b1b2f72ab815cd4a9f59df708e2d177d304a9b28`.
Both identities are fixed in `labelled-border-cache.mjs`, with explicit size
bounds before decoding. The loader rejects changed bytes or consistently
rehashed replacement data rather than accepting a new latest pointer.

The cache preserves five original reports byte-for-byte: independent primary
calibration, independent PDF calibration, the failed PDF-only sensitivity trial,
the successful native-page guard and its independent checker. Their original
external digest pins remain required. Separate rasterizer qualification retains
its digest lineage, renderer identity, frame/region measurements, selected Cairo
observations and wrapper/cache controls. Its absolute local command paths and
upstream diagnostic source copies are omitted from this portable projection.
The preparation command verifies the complete original investigation first.

There are 227 named asset links, 145 unique content-addressed payloads and 81
tracked input identities. Assets retain the independent SVGs, primary PNG pairs,
ordinary Cairo PDF pages, registered native SVG pages and defect SVGs. The loader
requires the exact selected asset set, canonical base64, content hashes, original
input hashes and current independent tool sources. Existing 69 native reference
artifacts remain covered by their unchanged snapshot. Native fonts and outlines
remain independent of the production converter's resources.

Defect PNGs are reconstructed from the independently frozen defect SVGs. Each
reconstructed full/whole PNG must reproduce its original digest, not merely pass
the image policy. All 126 full-page control PNGs must match. This avoids retaining
most duplicate pages without weakening their expected pixel pattern. Original
and native PDF limits remain distinct and are re-derived from unchanged raw
observations. Camera registration and local windows are fixed independently.

The cache checker independently re-decodes PNGs and reproduces 17,424 whole/local
metrics and 138 full-page RGBA comparisons, including every independent defect.
Its 44 controls reject changed roles, report pins, assets, blobs, encodings,
rasterizers, qualification coverage and rendering settings. OS patch release is
retained as provenance; browser distribution, Node, OS family, architecture,
viewport, launch settings and all other renderer fields remain pinned.

## Portable public trial

The trial first runs the independent pixel reproduction above, before generating
a fresh public candidate. It then requires all eight gates:

| Gate | Coverage |
| --- | ---: |
| Native numeric and identity | 1,624 assertions |
| Independent ink/root | 276 assertions |
| Whole/local primary | 36 views, 1,980 checks |
| Original SVG versus ordinary PDF | Twelve views, 696 checks |
| Public SVG versus ordinary PDF | Twelve views, 696 checks |
| Exact native page with public PDF verdict | Twelve views, 672 checks |
| Fresh public primary image-only sensitivity | 26 controls, 102 views |
| Fresh public PDF/native image-only sensitivity | 32 controls, 126 views |

The fresh mutations bypass numeric gates. The public PDF/native controls must
reproduce the independent full-page PNG hashes and measurements. Their fixed
expectations require 114 targeted visible rejections and twelve exact visibility
controls. The latter comprise unpainted-state changes and the two specifically
demonstrated bevel controls at 1x; those bevel changes must reject at 4x.

Four faint 1x views still pass the calibrated ordinary PDF checks and fail the
native-page gate. Both verdicts remain inspectable. Exact native-page identity
is distinct from calibrated ordinary-PDF agreement; neither claim extends beyond
the fixed fixtures and views. No reference engine is a converter fallback.

The separate saved-image checker verifies all 1,624 scalar/string/boolean numeric
assertions and re-derives actual source spans from the public scenes. It decodes
22,908 baseline/control image metrics and 138 full pages. Its 50 integrity controls
exercise each required gate, source targets, roots, cameras, zero limits,
coverage, independent reference paths, artifact links and corrupted outcomes. A changed scaled-point numeric
assertion must fail with unchanged passing images.

## Agent inspection and preparation

Read the hashed `latest.json` under `artifacts/labelled-border-conformance/`,
verify its report digest and completion, then inspect `combined.gates` and
`agent.firstFailedGate`. Open the GUID bundle's `index.html`, actual source and
scene files, primary contact sheets, ordinary-PDF/public sheets, raw differences,
local target crops and native-page crops. Amplification and integer enlargement
affect presentation only. Extra-ink controls have no invented source span; other
targets identify the original fixture operation changed in SVG. Every local
window is measured independently of crop selection. The outer viewer links each
source and scene, all white-background 4x primary pairs/raw differences, and independently
registered 4x native full pages. Its embedded trial viewer exposes defect crops.

The cache and public checkers keep their own GUID reports and source captures.
Latest pointers are incomplete on startup and failure; earlier attempts remain.
The raw trial and checker retain false approval/conformance flags and a pending
overall verdict, even when they pass. Only the outer admitted comparison carries
`approvedImagePolicy: true`, `imageConformanceClaim: true` and `overallVerdict: pass`,
after all eight gates and the owned 50-control saved-image checker succeed.
Hosted CI execution remains unverified.

The profile pins the existing compressed/decoded cache, independent frame and
camera/region/policy identities, qualification report digests, exact counts and
views, zero native-page allowance, and current guard-tool sources. It supplies no
candidate-derived tolerance. The admission checker verifies every copied byte
and the child completion logs, then tests profile corruption, missing/changed
guard sources, detached checker inputs, contradictory roles and every failed
gate. It consumes the owned independent pixel proof; it does not claim to repeat
that pixel calculation itself.

The raw research commands remain available:

```text
node tools/TikzVisual/trial-labelled-border-cached.mjs
node tools/TikzVisual/labelled-border-cached-self-test.mjs --report artifacts/labelled-border-cached-trial/run-<GUID>/report.json
```

Use the exact report printed by the trial. The optional admission checker
`--report artifacts/labelled-border-conformance/run-<GUID>/report.json` likewise
selects one retained admitted bundle.

`node tools/TikzVisual/prepare-labelled-border-cache.mjs` is a separate explicit
preparation command. It requires the declared original ignored qualification
bundles, invokes no converter or reference engine, and writes a new ignored
bundle. It never overwrites the checked-in cache. Regeneration or promotion is
an explicit reference review with its own tests and commit.
`node tools/TikzVisual/promote-labelled-borders.mjs` is the separate explicit
profile writer. It requires the three fixed local qualification reports,
verifies their artifacts/current sources and the exact trial/checker binding,
and records promotion provenance in a new ignored bundle. Ordinary comparison
and checker commands never rewrite a profile, cache, reference or prior report.
