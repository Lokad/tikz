# Native curved-connection primary calibration

```text
node tools/TikzVisual/curved-edge-primary-self-test.mjs
node tools/TikzVisual/calibrate-curved-edge-primary.mjs
node tools/TikzVisual/check-curved-edge-primary.mjs artifacts/curved-edge-primary-calibration/run-<GUID>/report.json
```

The thirty-five hand-derived path/policy controls need only Node. Calibration and the
saved-image checker require .NET 10 and the pinned Playwright/Chromium renderer.
They invoke no converter, TeX or PDF process and cannot approve conformance.

The preselected representation retains shortest zero-to-five-decimal native
TeX-point coordinates that recover the original integer scaled points, an
explicit physical scale/y inversion, six-decimal glyph matrices and paint, and
a six-decimal conservative native picture/ink root. The independent reader uses
frozen native DVI/TFM evidence and original glyph outlines. Original PGF SVG
bytes, including two empty backend strokes, remain unchanged. No driver drawing
is corrected or replaced.

Each of the five fixtures measures natural/expanded framing, 1x/4x and
transparent/white/black surfaces. All 389 native path, endpoint, cubic-sample,
glyph and clip regions remain measured. Cameras and regions come from native
geometry and page origins; no alignment is fitted. Limits are the selected
independent observation in each view/region. Only the foreground mean rounds
upward to 1e-9 channel units. Other encodings and candidate images cannot widen
limits. A separate complete replay must reproduce measurements and PNG hashes.

Eighteen image-only defects exercise missing/straightened bends, a displaced
control point, exchanged asymmetric controls, oblique shifts, node borders and
connections, dash/width/color/opacity, rectangle/curved clipping, a round cap,
compound fill, a period/ligature, label baseline and root cropping. Numeric gates
are bypassed. A visible fault must fail its named native region, including
quarter/midpoint cubic regions. Declared black-on-black views must preserve
actual PNG hashes and are not counted as detected defects.

Removing the rectangle clip also leaves all three natural 1x PNGs unchanged:
the root hides the newly exposed curve and the residual boundary difference
quantizes away. All expanded and natural 4x views must reject that fault in its
target region. Those three blind spots remain explicit; no image limit widens
and no view is omitted.

Three separate paint probes test a faint curved stroke, a faint period and a
stroke below raster quantization. Both independent SVGs receive the same paint
change; their own limits are measured before removing the target. These are
controlled renderer experiments, not additional native TikZ fixtures or proof
of frontend opacity compatibility. Visible losses must fail their local regions.
Declared invisible losses must leave actual PNGs unchanged.

The faint curve at opacity 1/128 is invisible in the three natural 1x views and
expanded 1x transparent/black views. Expanded 1x white and every 4x view must
detect its removal. The faint period is invisible only on black; the subquantum
curve is invisible everywhere. These exact observations stay profile-specific.

The complete matrix has 402 views: sixty calibration observations, sixty replay
observations, 210 ordinary defect views and 72 opacity visibility views. The
checker reconstructs 42 stored SVGs, obtains glyphs afresh, verifies complete
coverage and decodes the saved pairs to recompute 31,686 whole/local measurements.
It rejects changed roles, limits, cameras, targets, visibility, sources and links.

Every observation retains original/native PNGs, raw/alpha/amplified differences,
overlays and selected local crops. `index.html` links the passing and failing
images; `report.json` retains every measured region and artifact/source hash.
Failed runs stay in their own GUID directories. A failed or incomplete current
run is never replaced by an earlier successful verdict.

Successful calibration/checking remains unapproved. Independent PDF limits and
visibility, a fresh public-converter combined trial, immutable admission and
hosted environment qualification remain required. Existing admitted profiles,
native snapshots and production dependencies stay fixed.
