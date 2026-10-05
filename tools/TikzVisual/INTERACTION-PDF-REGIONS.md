# Regional node PDF experiment

This experiment compares the three trusted RGB/ink interaction fixtures with
their ordinary TikZ PDF pages. It records independent cross-renderer limits and
tests their sensitivity. **No node interaction PDF policy is approved.** The
native controls pass, but two unchanged candidate transform controls fail three
local foreground means. The separately admitted [primary SVG policy](INTERACTION-PRIMARY.md)
continues to pass.

## Independent inputs and physical camera

The [reviewed measurement snapshot](../../tests/Reference/NodeInteractionsRgb/pdf-calibration.json)
uses cached ordinary PDF pages, original oracle outlines/paint/clips, native
glyph positions, and independently reconstructed CSS SVGs. It invokes no
candidate converter, glyph resource, or production geometry helper. Original
source, reference, native-position, tool, font, and page-image hashes remain
pinned through the earlier ink and regional evidence.

Four variants contribute measurements: native CSS, plus/minus four scaled
points, and the original ink-framed SVG driver representation. The 174 existing
glyph/path regions are fixed by independent native evidence. Each fixture also
has a whole-picture region derived from its independent ink frame with eight
CSS pixels of padding. Regions are shared by every variant and candidate;
content is never fitted, shifted to minimize error, or resized independently.

| Fixture | Local regions | Total regions | Raw measurements | Native path records |
| --- | ---: | ---: | ---: | ---: |
| `state-paint` | 38 | 39 | 312 | 23 |
| `transforms` | 35 | 36 | 288 | 17 |
| `colors` | 101 | 102 | 816 | 53 |

The 1,416 measurements cover four variants at 1x and 4x, on white paper only.
Normalized native PGF path records, picture bounds, box dimensions, and explicit
start/end anchors must agree between the SVG and ordinary PDF logs. Missing,
duplicate, or changed numeric records fail. This check supplements the earlier
native node/glyph measurements; it does not establish candidate conformance.

SVG rendering uses the full native PDF page at its independently measured
physical origin. Both sides are then copied into the same integer pixel crop.
The PDF is never fractionally resampled. An initial synthetic test exposed a
one-channel difference when SVG was drawn directly into small negative-offset
crops; rendering the full page once removes that crop-context effect and gives
exact repeat captures. Canvas size is bounded at 20 million pixels.

## Prospective limits and observability

Each region/scale retains maximum channel error, mean foreground error, symmetric
edge distance, and component counts. Foreground means include every visible
sample, including faint ink; edge/component masks separately use 16/255 contrast.
Channel values and means are in 8-bit RGBA units. The edge measure is symmetric
eight-neighbor chamfer distance divided by scale, in CSS pixels.

Prospective limits are the maxima of the four independent variants, with means
rounded upward to 0.000001 channel units. Every whole-picture and local check
must pass. Cross-renderer pixel/channel/component differences can be substantial,
especially at 1x; no global allowance is borrowed from primary SVG. Missing
measurement coverage and unresolved edge bounds fail. These maxima are research
data, not a reviewed compatibility policy.

White ink on white paper is unobservable by this route. A synthetic control
records that limitation rather than inventing a rejection. The actual palette's
white label has a gray fill, so its label and period omissions are observable
and rejected. Transparent/light/dark primary comparisons and numeric checks
remain necessary alongside a future PDF gate.

## Controls, retained failures, and next work

The [retained trial](../../tests/Reference/NodeInteractionsRgb/pdf-mutation-trial.json)
records six repeated native controls and thirteen image defects: ordinary/faint
glyph and period removal, clip removal, wrong text opacity, paint order, glyph
translation, thicker sheared border, cropped miter tip, low-contrast content
removal, and CMYK magenta substitution. All native controls pass and all thirteen
defects are rejected. The candidate trial also rejects every defect; unchanged
state/paint and palette controls pass, while both unchanged transform controls
fail the same three 4x checks:

| Region | Candidate foreground mean | Independent limit |
| --- | ---: | ---: |
| `glyph-13`, local rotation | 33.44296375266524 | 33.433369 |
| `glyph-17`, reflected ligature | 51.34525495750708 | 51.343131 |
| `path-4`, reflected border | 35.61669230769231 | 35.616231 |

Their channel, edge, and component checks pass; global checks also pass. The two
affected glyphs have byte-identical outlines and matrices in candidate and
native CSS SVGs. Their root viewports and presentation grouping differ. The
cause of the additional mean error is unproven. Investigate viewport precision,
intrinsic SVG image rasterization, and presentation independently before
changing a renderer or considering policy admission. Any additional calibration
must use oracle-only variants and preserve this failure history; candidate
errors cannot set a threshold.

Each candidate image trial explicitly bypasses numeric gates to test the image
policy. Its provenance links the fresh passing primary conversion, assembly,
commit, working-tree fingerprint, and numeric count. A future required PDF route
must recompute limits from pinned reviewed evidence and combine them with native
numeric, dimension, primary, completeness, and mutation gates.

## Reproduction and agent inspection

Prepare the independent CSS/ink variants with the existing cached-reference
experiment, then run the regional measurements and trials:

```text
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-svg --profile rgb --framing ink
node tools/TikzVisual/calibrate-interaction-pdf-regions.mjs
node tools/TikzVisual/trial-interaction-pdf-regions.mjs
dotnet run --project tools/TikzReference -c Release -- compare-node-interaction-primary
node tools/TikzVisual/trial-interaction-pdf-regions.mjs --candidate
npm run test:pdf-regions --prefix tools/TikzVisual
```

The first experiment intentionally returns 1 for raw precision mismatches after
writing complete artifacts. Regional measurement and native trial return 0.
The current candidate trial returns 1 for the retained unchanged controls.
Missing inputs, incompatible renderer identity, or changed hashes fail. These
cached commands need the pinned browser, Node, and .NET; they run no TeX or PDF
rasterizer and update no baseline or approved policy.

Open `artifacts/interaction-pdf-region-calibration/<case>/<variant>/index.html`
or `artifacts/interaction-pdf-region-trial-candidate/<case>-<trial>/index.html`.
Each viewer supplies whole-picture PDF/SVG opacity, blink, zoom, and amplified
difference controls, plus ranked paired local crops and raw metrics. Native PNG
crops are retained without smoothing; named glyph regions link to the source
node's identifier declaration. Path regions retain their native index/basis
without an invented source attribution. Reports hash source, SVG, measurements,
camera, viewer, and captures. Native page images and their provenance remain in
the reference/calibration bundles.

Twenty-two required synthetic checks cover fractional registration, repeat
captures, faint-content dilution, missing/extra ink, translation, opacity,
clipping, unobservable white ink, invalid inputs, incomplete measurements, and
native-log agreement/rejection. CI runs these checks and uploads their artifacts.
The prospective candidate PDF trial remains outside the passing conformance
gate until the unchanged controls and independently reviewed admission pass.
