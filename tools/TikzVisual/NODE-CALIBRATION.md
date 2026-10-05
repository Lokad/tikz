# Native rectangle-node CSS calibration

The `chromium-153-node-css-v1` policy applies only to the `rectangles` fixture
and its 22 actual TikZ nodes. It leaves the geometry and bp label policies
unchanged. The [evidence snapshot](../../tests/Reference/Nodes/calibration.json)
records the oracle inputs/tools, original and derived hashes, numeric checks,
native crop checks, renderer identity, and raw primary metrics. The policy pins
the snapshot hash. It makes no secondary PDF or node-interaction claim.

## Independent representation

The pinned node wrapper and DVItype provide text boxes, rectangle corners,
stroke widths, anchors, and native integer glyph positions. Calibration takes
the original dvisvgm outlines and paint, places those outlines at native
positions, converts sp/bp to CSS pixels, and serializes at six decimal places.
The native frame is the union of measured stroked rectangle borders and text
layout boxes. A separate browser bounding-box check proves the original glyph
outlines fit this frame. The experiment never calls the candidate parser,
layout, SVG writer, or bundled glyph resources.

The driver uses rounded SVG crops and fractional glyph advances. Equivalent
native-position/CSS representations can therefore produce small raster changes
at antialiasing and mask boundaries. The independently computed native frame
measures 47/255 maximum channel error at 4x. The physical dimension difference is below
0.000010 CSS pixel. Neither frame was chosen by image fitting. The production
candidate's PNGs match the native-frame oracle representation exactly at both
scales; candidate output supplied no calibration data.

```text
dotnet run --project tools/TikzReference -c Release -- calibrate-node-svg
```

This command forces an exact primary policy and writes only ignored artifacts.
Its expected precision differences yield exit code 1; incompatible inputs or
tool errors yield 2. It writes 449 passed serialization/containment checks,
the original native trace, raw differences/crops, and `calibration-evidence.json`.
Review an explicit snapshot/profile update when the representation changes.

## Recorded limits

Errors use 8-bit premultiplied RGBA channel samples. Mean error is measured over
the visible foreground union, including low-opacity content. All component
counts must agree. Maximum edge displacement is measured in CSS pixels.

| Scale | Maximum channel | Worst foreground mean | Maximum edge displacement |
| --- | ---: | ---: | ---: |
| 1x | 3 | 0.021788 | 0 |
| 4x | 47 | 0.010246 | 0.25 |

The reviewed limits are 47/255 maximum channel error, 0.022/255 mean foreground
error, 0.25 CSS pixel edge displacement, and zero component-count difference.
The mean limit rounds the independent maximum upward to 0.001 channel units.
Raw errors remain in every passing report. Native layout/glyph gates remain
exact, and physical coordinates have a separate 1e-9 bp gate.

Fifteen comparator checks require unchanged repetitions to pass and intended
missing-glyph/period/ligature, quarter-pixel baseline/advance, thickened outline,
border width, physical unit, canvas height, faint text/stroke, and paint-order
defects to fail. Image mutations bypass numeric checks; a separate numeric-gate
mutation verifies the combined verdict. Font/resource atlases and standalone
label calibration do not authorize extending this node policy to other cases.
