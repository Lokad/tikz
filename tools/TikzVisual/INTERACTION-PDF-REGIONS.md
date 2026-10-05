# Regional node PDF experiment

This experiment compares the three trusted RGB/ink interaction fixtures with
their ordinary TikZ PDF pages. It records independent cross-renderer limits and
tests their sensitivity. The separately reviewed [combined PDF policy](INTERACTION-PDF.md)
now admits these fixtures. A grounded page-coordinate camera passes all unchanged native and
candidate controls and rejects all thirteen image defects. The initial camera's
three local candidate failures remain recorded below. The separately admitted
[primary SVG policy](INTERACTION-PRIMARY.md) continues to pass.

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

## Initial controls and retained failures

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
initial experiment could not establish the cause of the additional mean error.
That uncertainty prompted the independent viewport controls below. Further
calibration must preserve this failure history and use oracle-only variants;
candidate errors cannot set a threshold.

Each candidate image trial explicitly bypasses numeric gates to test the image
policy. Its provenance links the fresh passing primary conversion, assembly,
commit, working-tree fingerprint, and numeric count. A future required PDF route
must recompute limits from pinned reviewed evidence and combine them with native
numeric, dimension, primary, completeness, and mutation gates.

## Grounded page-coordinate camera

The [viewport probe](../../tests/Reference/NodeInteractionsRgb/pdf-viewport-probe.json)
adds eight CSS pixels of padding to native oracle SVGs, then changes each
viewport boundary independently by plus/minus four scaled points. All content,
paint, clips, and measured page origins remain fixed. Padding keeps every
boundary away from the ink, so these changes must preserve raster content.
Three rendering methods produce the following independent results:

| Method | Controls | Exact captures | Viewport-dependent captures |
| --- | ---: | ---: | ---: |
| Picture image drawn at its fractional page position | 27 | 7 | 20 |
| Nested picture SVG inside a page SVG | 27 | 24 | 3 |
| Content mapped directly to page coordinates; viewport retained as a clip | 27 | 27 | 0 |

The third method applies only the declared bp/CSS conversion and independently
measured page origin to original content. It avoids factoring the viewport
minimum into a transform and cancelling it afterward. The original natural
viewport remains an explicit page-space clip; original clips, paint, outlines,
and ordering are retained. It accepts only physical dimensions agreeing with
declared viewBox units within 1e-9 CSS pixel and the supported aspect-ratio forms.
Natural dimensions still have their separate primary gate. No content is fitted
to either the PDF or candidate.

The [new oracle-only snapshot](../../tests/Reference/NodeInteractionsRgb/pdf-calibration-page.json)
records another 1,416 measurements using the same four variants, regions, PDF
pages, and origin. Limits are recomputed only from these independent values.
The [new native/candidate trial](../../tests/Reference/NodeInteractionsRgb/pdf-mutation-trial-page.json)
passes all six repeated controls on each side and rejects every image defect.
For each previously failing region, candidate and native SVG PNG crops are now
byte-identical at both scales. Their 4x foreground means against PDF agree:

| Region | Native and candidate mean | Independent limit |
| --- | ---: | ---: |
| `glyph-13` | 33.31410256410256 | 33.416667 |
| `glyph-17` | 51.513101983002834 | 51.513102 |
| `path-4` | 35.74176923076923 | 35.741770 |

This establishes a viewport-dependent camera effect and a measured repair; it
does not establish the browser's internal cause or exact SVG/PDF pixels. The
compiler and original references are unchanged. The thirty-six synthetic
checks additionally verify bp/CSS units, wrapper origin, inherited paint,
natural viewport clipping, fractional registration, repeatability, defects,
and invalid unit/aspect/mode inputs. The separately pinned combined policy now
validates this evidence and requires every existing candidate gate alongside PDF.

## Reproduction and agent inspection

Prepare the independent CSS/ink variants with the existing cached-reference
experiment, then run the regional measurements and trials:

```text
dotnet run --project tools/TikzReference -c Release -- calibrate-node-interaction-svg --profile rgb --framing ink
node tools/TikzVisual/pdf-viewport-probe.mjs
node tools/TikzVisual/calibrate-interaction-pdf-regions.mjs --page-coordinates
node tools/TikzVisual/trial-interaction-pdf-regions.mjs --page-coordinates
dotnet run --project tools/TikzReference -c Release -- compare-node-interaction-primary
node tools/TikzVisual/trial-interaction-pdf-regions.mjs --candidate --page-coordinates
npm run test:pdf-regions --prefix tools/TikzVisual
```

The first experiment intentionally returns 1 for raw precision mismatches after
writing complete artifacts. Regional measurement and native trial return 0.
The page-coordinate candidate trial now returns 0. Omitting `--page-coordinates`
selects the initial picture-image method; regenerate its measurement artifacts
first to reproduce the retained control failures with current tool hashes.
Missing inputs, incompatible renderer identity, or changed hashes fail. These
cached commands need the pinned browser, Node, and .NET; they run no TeX or PDF
rasterizer and update no baseline or approved policy.

Open `artifacts/interaction-pdf-region-calibration-page/<case>/<variant>/index.html`
or `artifacts/interaction-pdf-region-trial-candidate-page/<case>-<trial>/index.html`.
Each viewer supplies whole-picture PDF/SVG opacity, blink, zoom, and amplified
difference controls, plus ranked paired local crops and raw metrics. Native PNG
crops are retained without smoothing; named glyph regions link to the source
node's identifier declaration. Path regions retain their native index/basis
without an invented source attribution. Reports hash source, SVG, measurements,
camera, viewer, and captures. Native page images and their provenance remain in
the reference/calibration bundles.

The unchanged transform trial additionally retains `native.svg` and six paired
`<region>-<scale>x-native-svg.png` captures. Their hashes match the corresponding
candidate SVG crops exactly. The viewport probe records raw invariance checks,
whole-picture crops, baseline pages, SVGs, and artifact hashes under
`artifacts/pdf-viewport-probe/`. Its three native CSS SVG inputs are checked in
alongside each fixture and pinned to the initial independent reconstruction;
they are derived evidence, while the original oracle SVGs remain unchanged.

Thirty-six required synthetic checks cover fractional registration, repeat
captures, faint-content dilution, missing/extra ink, translation, opacity,
clipping, unobservable white ink, invalid inputs, incomplete measurements, and
native-log agreement/rejection. CI also requires all 27 page-coordinate viewport
controls to match exactly and uploads both tools' artifacts. This cached probe
requires no TeX, .NET, or ignored setup artifacts. Hosted execution remains
unverified. The separate combined conformance runner and forty-one policy failure
checks now join the required passing CI gate. These measurement commands retain
their research scope and update no approved policy.
