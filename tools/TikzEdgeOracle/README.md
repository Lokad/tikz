# Independent straight-edge references

This development tool reads the fixed straight `to`/`edge` native corpus. It
has no converter project reference and invokes no TeX, browser or PDF process.
The shared development DVI/TFM reader links directly into this framework-only
executable. It recovers all sixteen glyphs from the original native positions,
font metrics and SVG font identities. It validates the frozen snapshot, all
116 native assets and nineteen reference sources before reading them, and
checks input/source stability afterward.

```text
dotnet run --project tools/TikzEdgeOracle -c Release
```

Its fresh GUID directory under `artifacts/edge-oracle/` contains the five
`native-glyphs.json` files, captured inputs/sources and a hashed artifact report.
`--out artifacts/...` selects a fresh empty output directory. Failures preserve
partial evidence. The report records the tool assembly hash and its framework
references. It always reports `converterInvoked`, `approvedImagePolicy` and
`imageConformanceClaim` as false.

The separate browser harness builds native-semantic SVGs from retained PGF
paths, shipped paint/clip order and these glyph positions. It preserves the
original outlined glyph definitions and uses independent native arithmetic.
It consumes no candidate SVG, scene, runtime resource or production SVG writer.

With the pinned development Playwright/Chromium installation available:

```text
node tools/TikzVisual/edge-oracle-self-test.mjs
node tools/TikzVisual/inspect-edge-oracle.mjs
```

The first command exercises 69 hand-derived arithmetic, renderer, reference
and input controls. It covers pen caps, acute outside miters and miter limits,
scaled-point coordinates, DVI direction, local clips, invalid references, and
visible dot loss at 1x/4x over transparent, white and black backgrounds. The
earlier shape/reference helpers and their admitted profiles stay unchanged.

The inspection command owns a fresh glyph-reader run and produces:

| Evidence | Coverage |
| --- | --- |
| Native inputs | Five fixtures; 90 paints, two rectangular clips and sixteen glyphs |
| SVG representations | Original driver normalized to CSS units; native pt short/12-place paths with 6/12-place glyph matrices; 6-place CSS paths |
| Root choices | Original driver root, native picture bounds, and picture/ink union |
| Primary observations | 75 derivations; 900 natural/expanded, scale/background pairs |
| Local observations | 323 independent path, endpoint and glyph regions; 58,140 measurements |
| Serialization | 4,264 independent instruction quantities and 300 root checks |
| Secondary observations | 20 original-driver/native-semantic pairs against ordinary PDF; 1,292 local measurements |

Both unchanged SVG captures repeat exactly. PDF and registered SVG page repeats
also require zero decoded sample difference. All views retain reference/actual
PNGs, raw/amplified differences, alpha differences where applicable, overlays,
and two selected paired local crops. Crop selection changes presentation only;
every declared local region is measured. The complete source/input/artifact
hashes, cameras and browser identity belong to the immutable run.

Resolve the completed run through `artifacts/edge-oracle-inspection/latest.json`.
Open its `index.html` or read its `report.json` directly. The `agent` record
links the contact sheet, native glyphs, the disputed dot's paired images and
matching 4x evidence. An explicit saved-run checker independently recovers the
glyphs, rebuilds all 75 SVGs and frames, and remeasures all saved primary/PDF
PNGs. From PowerShell, after a successful inspection:

```powershell
$edgeOracleRun = Get-Content artifacts/edge-oracle-inspection/latest.json -Raw | ConvertFrom-Json
if (-not $edgeOracleRun.completed) { throw 'Independent edge inspection is incomplete.' }
node tools/TikzVisual/check-edge-oracle.mjs ('artifacts/edge-oracle-inspection/' + $edgeOracleRun.report)
```

The checker requires an explicit completed GUID report, checks captured sources
against the current tree, validates every artifact hash, reconstructs native
registration, and rejects coverage/role/framing/link corruption. It writes its
own fresh report under `artifacts/edge-oracle-checks/`. A completed checker is
an integrity/reconstruction result; it grants no image allowance.

Frames use native sp, explicit TeX-pt/bp/CSS conversions and the independently
saved PDF page origin. They are never fitted to a candidate. Line pens use
offset corners, actual outside miter tips and explicit caps. Cubic pen and round
join envelopes are conservative; dash gaps do not shrink these envelopes. The
two fixed clips are rectangles. Diagnostic padding is intersected with paper
only for PDF captures; actual native ink must fit the paper. Wider clip/pen
forms require separate evidence rather than inheriting this contract.

The native SVG drops a zero-length round-capped blue stroke. Original paths,
native PDF and the reconstruction retain its dot. Both original-driver and
reconstructed-reference comparisons remain visible. The ordinary-PDF dot pair
still has cross-renderer edge differences; they are observations, not limits.
Node serialization and natural-root clipping also retain raw differences.
The separate [operation diagnostics](../TikzVisual/EDGE-OPERATIONS.md) isolate
all ninety paints and sixteen glyphs, preserving full cameras and inherited
state. Their native driver-frame experiment distinguishes thin-stroke matrix
arithmetic from glyph-edge differences and the missing original-driver dot.
No converter image conformance is admitted. Next qualify independent precision
and raster allowances, prove local image-only sensitivity, and run a fresh
public-converter combined trial under a separately reviewed profile.

The [native primary calibration](../TikzVisual/EDGE-PRIMARY.md) preselects short
TeX-point paths and six-decimal glyph matrices. A labeled derived-driver copy
restores only the verified omitted line, retaining all original comparisons.
The complete natural/expanded matrix, independent local limits and image-only
defects ground primary sensitivity. Renderer-only faint-paint probes have their
own explicit calibration and visibility scope. Image/PDF admission stays pending.

These tools and their browser dependencies are excluded from the runtime
package. Cached operation needs neither TeX nor a PDF executable. Hosted CI
steps are prepared; hosted execution and broader TikZ compatibility remain
unverified.
