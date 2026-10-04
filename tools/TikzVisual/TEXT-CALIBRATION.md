# Native text-position calibration

The `chromium-153-text-bp-v1` policy is confined to the sixteen label fixtures
and their fixed bp comparison camera. It uses the browser/environment pinned
by `browser-profile.json` but has a separate `text-profile.json` tolerance file.
The [evidence snapshot](../../tests/Reference/Text/calibration.json) records
source/reference/derived hashes, raw measurements at both scales and all three
backgrounds, tool source hashes, and renderer identity. All text box dimensions
and glyph fonts/slots/positions have a separate exact integer-sp gate.

## Independent experiment

The trusted TeX wrapper produces native hbox/alignment layout. MiKTeX-DVITYPE
2.9.6300 (MiKTeX 25.4) reports integer character positions after TeX's advances
and movements. dvisvgm 3.4.3 instead places outlines using its fractional font
advances. The measured position differences reach 0.000391 CSS px in this
corpus. Their raster effect can be larger than the coordinate difference at
an antialiasing or foreground-mask boundary.

Calibration takes the original oracle SVG and replaces only its glyph positions
with the independently measured DVItype positions, in the declared bp frame.
It never calls the candidate parser/layout or loads candidate font outlines.
It compares these two oracle representations under an exact primary policy,
retaining all mismatches. No coordinate is chosen by fitting an image. The
original SVG, natural crop, and native-position trace remain in the baseline.

```text
dotnet run --project tools/TikzFontData -c Release -- calibrate-text-reference
```

Expected exact-policy differences yield exit code 1; missing/incompatible
inputs or tool errors yield 2. The command writes only ignored artifacts.
Review the raw evidence before an explicit profile change; candidate failures
are not calibration evidence.

## Recorded limits

Values below are maximum 8-bit premultiplied channel error, mean foreground
channel error, and symmetric foreground-edge distance in CSS pixels. Mean
limits round the independent measurements upward to 0.001 channel units.
Every case requires identical component counts. The exact numeric layout
gate never inherits these raster allowances.

| Case | Channel | Mean | Edge |
| --- | ---: | ---: | ---: |
| words-regular-10 | 4 | 0.016 | 0.25 |
| words-bold-10 | 8 | 0.022 | 0.25 |
| words-italic-10 | 10 | 0.098 | 1 |
| words-regular-12 | 11 | 0.038 | 0.25 |
| words-bold-12 | 9 | 0.028 | 1 |
| words-italic-12 | 9 | 0.028 | 0.25 |
| group-boundaries | 5 | 0.015 | 0.25 |
| sentence-spacing | 10 | 0.019 | 0.25 |
| accented-text | 8 | 0.012 | 0 |
| escaped-symbols | 3 | 0.005 | 0 |
| font-declarations | 8 | 0.035 | 0.25 |
| text-font-commands | 9 | 0.039 | 0.25 |
| lines-left | 4 | 0.008 | 0 |
| lines-center | 5 | 0.004 | 0 |
| lines-right | 2 | 0.001 | 0 |
| large-line-skip | 5 | 0.010 | 0.25 |

The 1px edge readings occur at 1x for two fixtures when very small advance
differences cross the 16/255 foreground-mask threshold; they do not represent
1px geometric displacement. The native positions are still required to match
exactly. Quarter-pixel baseline mutations, missing glyphs, thickened outlines,
and faint-stroke removal are rejected under every case's image policy, with
numeric checks deliberately bypassed. Focused mutations also remove a period,
an ffi ligature, and the AV kern. Unchanged repetitions must pass.

These limits establish the original SVG-driver versus native-position
relationship in bp. Moving outlines into the production CSS scene, measuring
node ink bounds, or claiming fidelity to ordinary TikZ PDF rendering needs
additional independent experiments. This profile makes none of those claims.
