# Native straight-edge PDF qualification

This development harness compares the five fixed straight `to`/`edge` fixtures
with their frozen ordinary TikZ PDF pages. It needs .NET 10, Node and the pinned
Playwright/Chromium browser. Cached operation launches neither TeX nor a PDF
executable and invokes no public converter.

```text
node tools/TikzVisual/edge-pdf-self-test.mjs
node tools/TikzVisual/calibrate-edge-pdf.mjs
```

Each native page is 600 × 800 TeX points, rasterized at 96 and 384 DPI. Saved
native page positions fix the physical origin. SVGs are placed directly on that
pixel grid; no translation, scaling or crop alignment is fitted to images.
Complete pages are captured first. Whole-picture, path, endpoint and glyph
measurements use outward-rounded integer crops derived from native geometry.
Only diagnostic padding may intersect the paper boundary; native ink must fit.

Three separate routes preserve the original driver, the labeled derived-driver
reference, and the independently reconstructed short-point/six-decimal glyph
representation. The derived driver restores only the verified omitted
zero-length round-cap line, as documented in [EDGE-PRIMARY.md](EDGE-PRIMARY.md).
The original PDF and SVG bytes stay unchanged, and the original missing-dot
disagreement remains diagnostic. Natural root clipping and expanded framing are
measured separately at both resolutions on white backgrounds.

Prospective policies are separate for the native and derived-driver routes.
Each region/view receives precisely its independently observed error ceilings;
only foreground means round upward to 1e-9 channel units. Exact integer RGB sums
of `255 - channel` supplement those ceilings. They require the selected native
representation's ink, even when removing a faint mark improves aggregate PDF
error. This strict representation check may reject other otherwise reasonable
encodings. It grants no general PDF/browser pixel identity or candidate margin.

The edge-specific page renderer uses an absolute-coordinate viewport rectangle.
It neither snaps clip coordinates nor fits images. A retained earlier relative
rectangle failed signed left-boundary controls at 1x, changing interior stroke
antialiasing despite unchanged drawing coordinates. The absolute version has
its own fresh calibration; earlier admitted renderers and policies stay intact.

Complete unchanged replays must reproduce native-page PNG hashes and metrics.
Root-only controls retain all drawing instructions while padding the viewport
and perturbing each boundary by ±4 scaled points. Both resolutions must retain
identical full-page and regional pixels. Thirteen image-only defects exercise
branches, translation, width/color/dash/cap state, clips, the round-cap dot,
period/ligature/baseline, opacity and natural-root cropping. Numeric checks are
bypassed; a visible mutation must fail its own native target region.

The 46 focused controls include synthetic subthreshold ink whose removal improves
the generic PDF error score but fails the exact local ink check. Synthetic bitmap
and renderer controls are separate from native TikZ opacity compatibility.
New native faint-opacity interactions remain necessary.

Fresh GUID bundles contain captured sources/native inputs, original and derived
SVGs, full registered SVG pages, paired whole/local images, overlays, raw and
amplified differences, policy measurements and a static `index.html` gallery.
Full-page measurements are authoritative; enlarged paired crops are for viewing.
Every original-driver panel is labeled separately from the corrected reference.
Failed experiments retain their sources, partial measurements and error.

Select the exact completed calibration for independent checking:

```powershell
$edgePdfRun = Get-Content artifacts/edge-pdf-calibration/latest.json -Raw | ConvertFrom-Json
if (-not $edgePdfRun.completed) { throw 'Native PDF calibration is incomplete.' }
node tools/TikzVisual/check-edge-pdf.mjs ('artifacts/edge-pdf-calibration/' + $edgePdfRun.report)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

The checker reads native glyphs afresh, rebuilds reference/defect/viewport SVGs,
replays viewport controls, re-decodes every saved page, remeasures every native
crop and RGB sum, and rederives limits. It checks complete view coverage,
replays, roles, target sensitivity, source/native/artifact hashes and gallery
links. Corruption controls reject missing views, shifted cameras/crops, weakened
limits/ink, numeric masking, hidden corrections and substituted unchanged pages.

Completion means reference/comparator qualification. Image policy approval,
a fresh public combined trial, immutable admission and hosted CI execution
remain separate gates. Existing admitted families and runtime dependencies are
unchanged. This harness makes no broader TikZ compatibility claim.
